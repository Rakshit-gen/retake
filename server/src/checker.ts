import sharp from 'sharp'
import { hammingHex } from '@retake/quality'
import type { MatchVerdict, MismatchReason } from '@retake/rules'

export interface CheckInput {
  claimPhotos: Buffer[]
  /** Four rotations per claim photo. */
  claimHashes: string[]
  attemptPhotos: Buffer[]
  attemptHashes: string[]
}

export interface CheckOutput {
  verdict: Exclude<MatchVerdict, 'unavailable'>
  reason: MismatchReason | null
}

/** Throws (or gets aborted) when it can't answer. The caller turns that into "unavailable". */
export type Checker = (input: CheckInput, signal: AbortSignal) => Promise<CheckOutput>

/**
 * Offline stand-in: compares perceptual hashes. It catches "obviously a
 * different picture" and nothing subtler, so it is for running the whole flow
 * without an API key, not a real item matcher.
 */
export function hashChecker(o = { matchAtMost: 12, differentAtLeast: 26 }): Checker {
  return async ({ claimHashes, attemptHashes }) => {
    let d = 64
    for (const a of attemptHashes) for (const c of claimHashes) d = Math.min(d, hammingHex(a, c))
    if (d <= o.matchAtMost) return { verdict: 'match', reason: null }
    if (d >= o.differentAtLeast) return { verdict: 'not_match', reason: 'different_item' }
    return { verdict: 'ambiguous', reason: 'angle' }
  }
}

const REASONS: MismatchReason[] = ['dark_or_blurry', 'in_packaging', 'in_delivery_bag', 'angle', 'different_item', 'unclear']

const PROMPT = `You compare grocery return photos. Image 1 is the customer's photo of the item they reported. Image 2 is the delivery partner's photo at pickup.
Decide only whether image 2 shows the same product as image 1. Ignore differences in lighting, angle, background, hands, and rotation.
Judge by brand name, product name, pack shape and colours, in that order. A different variant (size, flavour) of the same brand is a different product.
If you can't see enough of the item in image 2 to judge, say why.
Reply with JSON only: {"verdict": "match" | "not_match" | "ambiguous", "reason": null | ${REASONS.map((r) => `"${r}"`).join(' | ')}}
reason must be null when verdict is "match".`

async function dataUrl(photo: Buffer): Promise<string> {
  const jpg = await sharp(photo).autoOrient().resize({ width: 768, height: 768, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
  return `data:image/jpeg;base64,${jpg.toString('base64')}`
}

/** Strict reading of the model's reply. Anything off-script is treated as no answer. */
export function parseVerdict(text: string): CheckOutput {
  const json = JSON.parse(text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()) as { verdict?: unknown; reason?: unknown }
  const verdict = json.verdict
  if (verdict !== 'match' && verdict !== 'not_match' && verdict !== 'ambiguous') throw new Error(`bad verdict: ${String(verdict)}`)
  if (verdict === 'match') return { verdict, reason: null }
  const reason = REASONS.includes(json.reason as MismatchReason) ? (json.reason as MismatchReason) : 'unclear'
  return { verdict, reason }
}

/**
 * A vision model on Groq. The model only describes what it sees; what happens
 * to the pickup is decided by decideReturn in @retake/rules.
 */
export function groqChecker(apiKey: string, model: string, fetchImpl: typeof fetch = fetch): Checker {
  return async ({ claimPhotos, attemptPhotos }, signal) => {
    const claim = claimPhotos[0]
    const attempt = attemptPhotos[0]
    if (!claim || !attempt) throw new Error('need one claim photo and one attempt photo')
    const res = await fetchImpl('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_completion_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: await dataUrl(claim) } },
              { type: 'image_url', image_url: { url: await dataUrl(attempt) } },
            ],
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return parseVerdict(body.choices?.[0]?.message?.content ?? '')
  }
}
