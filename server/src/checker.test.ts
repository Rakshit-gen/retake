import sharp from 'sharp'
import { groqChecker, parseVerdict } from './checker'

test('reads a well-formed verdict', () => {
  expect(parseVerdict('{"verdict":"not_match","reason":"in_packaging"}')).toEqual({ verdict: 'not_match', reason: 'in_packaging' })
  expect(parseVerdict('{"verdict":"match","reason":"angle"}')).toEqual({ verdict: 'match', reason: null })
})

test('drops a thinking block before the JSON', () => {
  expect(parseVerdict('<think>hmm</think>\n{"verdict":"ambiguous","reason":"angle"}').verdict).toBe('ambiguous')
})

test('an unknown reason becomes unclear, an unknown verdict is no answer', () => {
  expect(parseVerdict('{"verdict":"not_match","reason":"cat"}').reason).toBe('unclear')
  expect(() => parseVerdict('{"verdict":"yes"}')).toThrow()
  expect(() => parseVerdict('sure, it matches')).toThrow()
})

test('sends both photos to the configured model and parses the reply', async () => {
  const jpg = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).jpeg().toBuffer()
  const calls: { url: string; body: any }[] = []
  const fake = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) })
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"match","reason":null}' } }] }))
  }) as unknown as typeof fetch
  const check = groqChecker('k', 'some/model', fake)
  const out = await check({ claimPhotos: [jpg], claimHashes: [], attemptPhotos: [jpg], attemptHashes: [] }, new AbortController().signal)
  expect(out).toEqual({ verdict: 'match', reason: null })
  expect(calls[0]!.body.model).toBe('some/model')
  expect(calls[0]!.body.messages[0].content.filter((c: any) => c.type === 'image_url')).toHaveLength(2)
})

test('an HTTP error throws so the caller escalates', async () => {
  const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg().toBuffer()
  const fake = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch
  const check = groqChecker('k', 'm', fake)
  await expect(check({ claimPhotos: [jpg], claimHashes: [], attemptPhotos: [jpg], attemptHashes: [] }, new AbortController().signal)).rejects.toThrow(/503/)
})
