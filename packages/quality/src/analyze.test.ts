import golden from '../fixtures/golden.json'
import { analyzeLuma } from './analyze'
import { hammingHex } from './hash'
import { PATTERNS, render, type Pattern } from './patterns'

function pattern(name: string): Pattern {
  const p = PATTERNS.find((q) => q.name === name)
  if (!p) throw new Error(name)
  return p
}

function analyze(p: Pattern, map: (v: number) => number = (v) => v) {
  const px = render(p).map(map)
  return analyzeLuma(px, p.width, p.height, p.stride)
}

/** Box blur of a pattern, written out at the same stride. */
function blurred(p: Pattern, r: number): Uint8Array {
  const src = render(p)
  const out = new Uint8Array(src.length).fill(255)
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      let s = 0
      let c = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy < 0 || xx < 0 || yy >= p.height || xx >= p.width) continue
          s += src[yy * p.stride + xx]!
          c++
        }
      }
      out[y * p.stride + x] = Math.round(s / c)
    }
  }
  return out
}

describe('analyzeLuma', () => {
  it.each(golden.map((g) => [g.name, g.metrics] as const))('matches the golden fixture for %s', (name, metrics) => {
    expect(analyze(pattern(name))).toEqual(metrics)
  })

  it('reads rows by stride, not width', () => {
    // The padding bytes are 255. If they leaked in, this frame would show blown pixels.
    expect(analyze(pattern('dark_padded')).brightFraction).toBe(0)
  })

  it('scores a blurred copy far below the sharp original', () => {
    const p = pattern('glare_spot')
    const sharp = analyzeLuma(render(p), p.width, p.height, p.stride).sharpness
    const soft = analyzeLuma(blurred(p, 4), p.width, p.height, p.stride).sharpness
    expect(soft).toBeLessThan(sharp / 4)
  })

  it('loses sensitivity to mild blur after downscaling, which is why the analysis width is a parameter', () => {
    const p = pattern('glare_spot')
    const ratio = (tw: number) =>
      analyzeLuma(render(p), p.width, p.height, p.stride, tw).sharpness /
      analyzeLuma(blurred(p, 2), p.width, p.height, p.stride, tw).sharpness
    expect(ratio(640)).toBeGreaterThan(ratio(320))
  })

  it('tracks brightness changes', () => {
    const p = pattern('texture')
    expect(analyze(p, (v) => v >> 2).meanLuma).toBeLessThan(analyze(p).meanLuma / 3)
  })

  it('finds a local glare spot without calling the whole frame blown out', () => {
    const m = analyze(pattern('glare_spot'))
    expect(m.glare).toBeGreaterThan(0.4)
    expect(m.brightFraction).toBeLessThan(0.05)
  })

  // Exposure changes create ties between neighbouring blocks in flat areas,
  // so a few bits flip. It must stay well under the 22 bit warning level.
  it('keeps the hash close when only the exposure changes', () => {
    const p = pattern('odd_size')
    const a = analyze(p).dhash
    const b = analyze(p, (v) => Math.min(255, Math.round(v * 0.8) + 10)).dhash
    expect(hammingHex(a, b)).toBeLessThanOrEqual(11)
  })

  it('gives clearly different hashes for different scenes', () => {
    expect(hammingHex(analyze(pattern('texture')).dhash, analyze(pattern('odd_size')).dhash)).toBeGreaterThan(20)
  })

  it('handles frames smaller than the target width', () => {
    const m = analyzeLuma(new Uint8Array(100 * 80).fill(90), 100, 80)
    expect(m).toMatchObject({ width: 100, height: 80, meanLuma: 90, sharpness: 0 })
  })
})

describe('hammingHex', () => {
  it('counts differing bits', () => {
    expect(hammingHex('0000000000000000', '0000000000000000')).toBe(0)
    expect(hammingHex('0000000000000000', 'ffffffffffffffff')).toBe(64)
    expect(hammingHex('f0', '0f')).toBe(8)
  })

  it('refuses hashes of different lengths', () => {
    expect(() => hammingHex('00', '000')).toThrow()
  })
})
