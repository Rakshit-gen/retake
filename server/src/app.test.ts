import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { packSvg, rng } from '../../eval/make-set'
import { buildApp, type AppOptions } from './app'
import { hashChecker, type Checker } from './checker'

let dir: string
let packA: Buffer
let packB: Buffer
let dark: Buffer

beforeAll(async () => {
  // Seeds picked so pack A passes the gate upright and sideways (most synthetic
  // packs trip the glare check when turned to portrait, see README) and pack B
  // is far enough from A for the hash checker to call it a different item
  // (27 bits; the cut-off is 20).
  dir = mkdtempSync(join(tmpdir(), 'retake-'))
  packA = await sharp(Buffer.from(packSvg(rng(9)).svg)).jpeg({ quality: 85 }).toBuffer()
  packB = await sharp(Buffer.from(packSvg(rng(13)).svg)).jpeg({ quality: 85 }).toBuffer()
  dark = await sharp(packA).linear(0.12, 0).jpeg().toBuffer()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

function app(over: Partial<AppOptions> = {}) {
  return buildApp({ dataDir: dir, checker: hashChecker(), ...over })
}

async function form(fields: Record<string, string>, photos: Buffer[]) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  for (const p of photos) fd.append('photo', new Blob([new Uint8Array(p)], { type: 'image/jpeg' }), 'p.jpg')
  const r = new Request('http://x', { method: 'POST', body: fd })
  return { payload: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type')! } }
}

const CLAIM = { orderId: 'ord_1001', itemId: 'itm_2', category: 'wrong_item', note: 'got a different atta' }

async function fileClaim(a: ReturnType<typeof app>, photos = [packA], key?: string) {
  const f = await form(CLAIM, photos)
  return a.inject({ method: 'POST', url: '/claims', payload: f.payload, headers: { ...f.headers, ...(key ? { 'idempotency-key': key } : {}) } })
}

async function attempt(a: ReturnType<typeof app>, pickupId: string, photo: Buffer, key?: string) {
  const f = await form({}, [photo])
  return a.inject({
    method: 'POST',
    url: `/pickups/${pickupId}/attempts`,
    payload: f.payload,
    headers: { ...f.headers, ...(key ? { 'idempotency-key': key } : {}) },
  })
}

test('lists the seeded orders', async () => {
  const res = await app().inject('/orders')
  expect(res.statusCode).toBe(200)
  expect(res.json()[0].items.length).toBeGreaterThan(0)
})

test('a claim creates a pickup carrying four rotated hashes per photo', async () => {
  const a = app()
  const res = await fileClaim(a)
  expect(res.statusCode).toBe(201)
  const { claim, pickupId } = res.json()
  expect(claim.photos).toHaveLength(1)
  expect(claim.needsReview).toBe(false)
  const pickup = (await a.inject(`/pickups/${pickupId}`)).json()
  expect(pickup.claimHashes).toHaveLength(4)
  expect(pickup.state).toBe('open')
  const file = await a.inject(`/files/${pickup.claimPhotos[0]}`)
  expect(file.headers['content-type']).toBe('image/jpeg')
})

test('the same Idempotency-Key files one claim, not two', async () => {
  const a = app()
  const first = await fileClaim(a, [packA], 'claim-key-1')
  const again = await fileClaim(a, [packA], 'claim-key-1')
  expect(again.json().claim.id).toBe(first.json().claim.id)
  expect(again.headers['idempotent-replay']).toBe('true')
  expect((await a.inject('/pickups')).json()).toHaveLength(1)
})

test('rejects a claim with no category or no photos', async () => {
  const a = app()
  const noCat = await form({ ...CLAIM, category: '' }, [packA])
  expect((await a.inject({ method: 'POST', url: '/claims', ...noCat })).json().problems).toEqual(['pick_category'])
  const noPhoto = await form(CLAIM, [])
  expect((await a.inject({ method: 'POST', url: '/claims', ...noPhoto })).json().problems).toEqual(['add_photo'])
})

test('flags an overridden dark photo for review instead of refusing it', async () => {
  const f = await form({ ...CLAIM, overrides: '[true]' }, [dark])
  const res = await app().inject({ method: 'POST', url: '/claims', ...f })
  expect(res.statusCode).toBe(201)
  expect(res.json().claim.photos[0]).toMatchObject({ override: true, issues: expect.arrayContaining(['too_dark']) })
  expect(res.json().claim.needsReview).toBe(true)
})

test('the same item shot sideways is accepted', async () => {
  const a = app()
  const { pickupId } = (await fileClaim(a)).json()
  const sideways = await sharp(packA).rotate(90).jpeg({ quality: 70 }).toBuffer()
  const res = await attempt(a, pickupId, sideways)
  expect(res.json()).toMatchObject({ verdict: 'match', state: 'accepted', decision: { action: 'accept' } })
})

test('a different item gets two retries with a nudge, then goes to a person', async () => {
  const a = app()
  const { pickupId } = (await fileClaim(a)).json()
  const r1 = (await attempt(a, pickupId, packB)).json()
  expect(r1).toMatchObject({ attempt: 1, reason: 'different_item', decision: { action: 'retry', attemptsLeft: 2 } })
  const r2 = (await attempt(a, pickupId, packB)).json()
  expect(r2.decision).toMatchObject({ action: 'retry', attemptsLeft: 1 })
  const r3 = (await attempt(a, pickupId, packB)).json()
  expect(r3).toMatchObject({ state: 'escalated', decision: { action: 'escalate', why: 'retries_exhausted' } })
  expect((await attempt(a, pickupId, packA)).statusCode).toBe(409)
})

test('a retried upload does not use up a retry', async () => {
  const a = app()
  const { pickupId } = (await fileClaim(a)).json()
  await attempt(a, pickupId, packB, 'work-1')
  const replay = await attempt(a, pickupId, packB, 'work-1')
  expect(replay.json().attempt).toBe(1)
  expect((await attempt(a, pickupId, packB, 'work-2')).json().attempt).toBe(2)
})

test('a dark pickup photo is bounced without calling the checker', async () => {
  const checker = jest.fn<ReturnType<Checker>, Parameters<Checker>>()
  const a = app({ checker })
  const { pickupId } = (await fileClaim(a)).json()
  const res = (await attempt(a, pickupId, dark)).json()
  expect(res).toMatchObject({ verdict: 'not_match', reason: 'dark_or_blurry', decision: { action: 'retry' } })
  expect(res.decision.nudge).toMatch(/dark or blurry/)
  expect(checker).not.toHaveBeenCalled()
})

test('a checker that hangs sends the pickup to a person instead of blocking the rider', async () => {
  const hang: Checker = (_, signal) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  const a = app({ checker: hang, checkerTimeoutMs: 50 })
  const { pickupId } = (await fileClaim(a)).json()
  const res = (await attempt(a, pickupId, packA)).json()
  expect(res).toMatchObject({ verdict: 'unavailable', state: 'escalated', decision: { why: 'checker_unavailable' } })
})

test('a checker error also escalates', async () => {
  const a = app({ checker: async () => Promise.reject(new Error('503')) })
  const { pickupId } = (await fileClaim(a)).json()
  expect((await attempt(a, pickupId, packA)).json().decision).toEqual({ action: 'escalate', why: 'checker_unavailable' })
})

test('only serves files it wrote', async () => {
  const a = app()
  expect((await a.inject('/files/..%2F..%2Fetc%2Fpasswd')).statusCode).toBe(404)
  expect((await a.inject('/files/00000000-0000-0000-0000-000000000000.jpg')).statusCode).toBe(404)
})
