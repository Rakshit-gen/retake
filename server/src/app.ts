import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import multipart from '@fastify/multipart'
import {
  assessFrame,
  decideReturn,
  validateClaimDraft,
  type ClaimCategory,
  type FrameIssue,
  type MatchVerdict,
  type MismatchReason,
  type ReturnDecision,
} from '@retake/rules'
import type { Checker } from './checker'
import { measure, rotatedHashes } from './image'
import { ORDERS } from './seed'

export interface StoredPhoto {
  name: string
  /** The customer shot past the camera gate. */
  override: boolean
  /** What the gate thinks of the uploaded file, re-measured here. */
  issues: FrameIssue[]
}

export interface Claim {
  id: string
  orderId: string
  itemId: string
  category: ClaimCategory
  note: string
  photos: StoredPhoto[]
  /** Any photo failed the gate on the server, overridden or not. */
  needsReview: boolean
  createdAt: string
}

export interface Attempt {
  n: number
  photos: string[]
  verdict: MatchVerdict | null
  reason: MismatchReason | null
  decision: ReturnDecision | null
  ms: number | null
}

export interface Pickup {
  id: string
  claimId: string
  orderId: string
  itemId: string
  itemName: string
  state: 'open' | 'accepted' | 'escalated'
  /** dHash of each claim photo in four rotations, for the rider's on-device hint. */
  claimHashes: string[]
  claimPhotos: string[]
  attempts: Attempt[]
}

export interface AppOptions {
  dataDir: string
  checker: Checker
  checkerTimeoutMs?: number
  maxRetries?: number
  logger?: boolean
}

interface Upload {
  fields: Record<string, string>
  files: Buffer[]
}

type Cached = { status: number; body: unknown }

const CATEGORIES: ClaimCategory[] = ['wrong_item', 'expired', 'bad_quality', 'damaged', 'packaging']
const FILE_NAME = /^[0-9a-f-]{36}\.jpg$/

export function buildApp(o: AppOptions) {
  const app = Fastify({ logger: o.logger ?? false })
  const claims = new Map<string, Claim>()
  const pickups = new Map<string, Pickup>()
  // Promises, not results, so a retry that lands while the first try is still
  // running waits for it instead of doing the work twice.
  const seen = new Map<string, Promise<Cached>>()
  const timeoutMs = o.checkerTimeoutMs ?? 8000
  const maxRetries = o.maxRetries ?? 2
  mkdirSync(o.dataDir, { recursive: true })

  app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 3, fields: 10 } })

  async function readUpload(req: FastifyRequest): Promise<Upload> {
    const out: Upload = { fields: {}, files: [] }
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'photo') out.files.push(await part.toBuffer())
        else await part.toBuffer()
      } else if (typeof part.value === 'string') {
        out.fields[part.fieldname] = part.value
      }
    }
    return out
  }

  async function save(photo: Buffer): Promise<string> {
    const name = `${randomUUID()}.jpg`
    await writeFile(join(o.dataDir, name), photo)
    return name
  }

  /**
   * The phone's upload queue retries until it gets an answer and sends the
   * same Idempotency-Key every time. A retried attempt must not use up one of
   * the rider's retries, so the first answer is replayed.
   */
  async function once(scope: string, req: FastifyRequest, reply: FastifyReply, run: () => Promise<Cached>) {
    const key = req.headers['idempotency-key']
    let p: Promise<Cached>
    if (typeof key !== 'string' || key === '') {
      p = run()
    } else {
      const k = `${scope}:${key}`
      const hit = seen.get(k)
      if (hit) {
        reply.header('idempotent-replay', 'true')
        p = hit
      } else {
        p = run()
        seen.set(k, p)
        // A crash isn't an answer; let the retry try again.
        p.catch(() => seen.delete(k))
      }
    }
    const r = await p
    return reply.code(r.status).send(r.body)
  }

  app.get('/health', async () => ({ ok: true }))

  app.get('/orders', async () => ORDERS)

  app.post('/claims', (req, reply) =>
    once('claims', req, reply, async () => {
      const { fields, files } = await readUpload(req)
      const category = CATEGORIES.includes(fields.category as ClaimCategory) ? (fields.category as ClaimCategory) : null
      const order = ORDERS.find((x) => x.id === fields.orderId)
      const item = order?.items.find((x) => x.id === fields.itemId)
      if (!order || !item) return { status: 400, body: { problems: ['pick_item'] } }

      let overrides: boolean[] = []
      try {
        const parsed: unknown = JSON.parse(fields.overrides ?? '[]')
        if (Array.isArray(parsed)) overrides = parsed.map((x) => x === true)
      } catch {
        return { status: 400, body: { problems: ['bad_overrides'] } }
      }

      let metrics
      try {
        metrics = await Promise.all(files.map((f) => measure(f)))
      } catch {
        return { status: 400, body: { problems: ['unreadable_photo'] } }
      }

      // Same rules the phone ran. The phone's own numbers aren't trusted, so the
      // photos are measured again here. A photo the gate dislikes doesn't fail
      // the claim, it only flags it: the phone already let the customer through.
      const problems = validateClaimDraft({
        orderId: order.id,
        itemId: item.id,
        category,
        note: fields.note ?? '',
        photos: metrics.map((m) => ({ uri: '', metrics: m, override: true })),
      })
      if (problems.length > 0) return { status: 400, body: { problems } }

      const names = await Promise.all(files.map(save))
      const photos = names.map((name, i) => ({
        name,
        override: overrides[i] ?? false,
        issues: assessFrame(metrics[i]!).issues,
      }))
      const claim: Claim = {
        id: `clm_${randomUUID().slice(0, 8)}`,
        orderId: order.id,
        itemId: item.id,
        category: category!,
        note: (fields.note ?? '').slice(0, 500),
        photos,
        needsReview: photos.some((p) => p.issues.length > 0),
        createdAt: new Date().toISOString(),
      }
      const claimHashes = (await Promise.all(files.map(rotatedHashes))).flat()
      claims.set(claim.id, claim)
      const pickup: Pickup = {
        id: `pck_${randomUUID().slice(0, 8)}`,
        claimId: claim.id,
        orderId: order.id,
        itemId: item.id,
        itemName: item.name,
        state: 'open',
        claimHashes,
        claimPhotos: names,
        attempts: [],
      }
      pickups.set(pickup.id, pickup)
      return { status: 201, body: { claim, pickupId: pickup.id } }
    }),
  )

  app.get<{ Params: { id: string } }>('/claims/:id', async (req, reply) => {
    const c = claims.get(req.params.id)
    return c ?? reply.code(404).send({ error: 'not_found' })
  })

  app.get('/pickups', async () => [...pickups.values()].filter((p) => p.state === 'open'))

  app.get<{ Params: { id: string } }>('/pickups/:id', async (req, reply) => {
    const p = pickups.get(req.params.id)
    return p ?? reply.code(404).send({ error: 'not_found' })
  })

  app.post<{ Params: { id: string } }>('/pickups/:id/attempts', (req, reply) =>
    once(`attempts:${req.params.id}`, req, reply, async () => {
      const pickup = pickups.get(req.params.id)
      if (!pickup) return { status: 404, body: { error: 'not_found' } }
      if (pickup.state !== 'open') return { status: 409, body: { error: 'closed', pickup } }

      const { files } = await readUpload(req)
      if (files.length === 0 || files.length > 2) return { status: 400, body: { error: 'one_or_two_photos' } }
      let metrics
      try {
        metrics = await Promise.all(files.map((f) => measure(f)))
      } catch {
        return { status: 400, body: { error: 'unreadable_photo' } }
      }

      // Take the attempt number before any await, so two uploads at once can't
      // both be attempt 1.
      const attempt: Attempt = { n: pickup.attempts.length + 1, photos: [], verdict: null, reason: null, decision: null, ms: null }
      pickup.attempts.push(attempt)
      attempt.photos = await Promise.all(files.map(save))

      const started = Date.now()
      let verdict: MatchVerdict
      let reason: MismatchReason | null
      if (metrics.some((m) => !assessFrame(m).ok)) {
        // Unreadable photo: no point asking the checker.
        verdict = 'not_match'
        reason = 'dark_or_blurry'
      } else {
        try {
          const claimPhotos = await Promise.all(pickup.claimPhotos.map((n) => readFile(join(o.dataDir, n))))
          const r = await o.checker(
            { claimPhotos, claimHashes: pickup.claimHashes, attemptPhotos: files, attemptHashes: metrics.map((m) => m.dhash) },
            AbortSignal.timeout(timeoutMs),
          )
          verdict = r.verdict
          reason = r.reason
        } catch (err) {
          req.log.warn({ err, pickup: pickup.id }, 'checker failed, escalating')
          verdict = 'unavailable'
          reason = null
        }
      }
      const decision = decideReturn({ verdict, reason, attempt: attempt.n }, { maxRetries })
      Object.assign(attempt, { verdict, reason, decision, ms: Date.now() - started })
      if (decision.action === 'accept') pickup.state = 'accepted'
      if (decision.action === 'escalate') pickup.state = 'escalated'
      return { status: 200, body: { pickupId: pickup.id, state: pickup.state, attempt: attempt.n, verdict, reason, decision } }
    }),
  )

  app.get<{ Params: { name: string } }>('/files/:name', async (req, reply) => {
    if (!FILE_NAME.test(req.params.name)) return reply.code(404).send({ error: 'not_found' })
    try {
      const buf = await readFile(join(o.dataDir, req.params.name))
      return reply.type('image/jpeg').header('cache-control', 'public, max-age=31536000, immutable').send(buf)
    } catch {
      return reply.code(404).send({ error: 'not_found' })
    }
  })

  return app
}
