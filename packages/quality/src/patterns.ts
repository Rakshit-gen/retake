/**
 * Test images described by formulas instead of stored pixels, so the Kotlin
 * golden check can build the exact same bytes. Mirrored in GoldenCheck.kt.
 */
export interface Pattern {
  name: string
  width: number
  height: number
  stride: number
  pixel: (x: number, y: number) => number
}

export const PATTERNS: Pattern[] = [
  {
    name: 'texture',
    width: 1280,
    height: 720,
    stride: 1280,
    pixel: (x, y) => (x * 31 + y * 17 + ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) * 100) % 256,
  },
  {
    name: 'dark_padded',
    width: 640,
    height: 480,
    stride: 704,
    pixel: (x, y) => 8 + ((x + y) % 8),
  },
  {
    name: 'glare_spot',
    width: 1280,
    height: 720,
    stride: 1280,
    pixel: (x, y) => {
      const dx = x - 900
      const dy = y - 200
      if (dx * dx + dy * dy < 3600) return 255
      return 120 + ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 30
    },
  },
  {
    name: 'odd_size',
    width: 641,
    height: 479,
    stride: 648,
    pixel: (x, y) => (Math.floor((x * x) / 7) + y * 3) % 256,
  },
  {
    name: 'flat',
    width: 320,
    height: 240,
    stride: 320,
    pixel: () => 128,
  },
]

/** Bytes past the row width are filled with 255, so a stride bug shows up as glare. */
export function render(p: Pattern): Uint8Array {
  const out = new Uint8Array(p.stride * p.height).fill(255)
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) out[y * p.stride + x] = p.pixel(x, y)
  return out
}
