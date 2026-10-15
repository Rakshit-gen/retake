import type { FrameMetrics } from './types'

export const TARGET_WIDTH = 320
const DARK = 16
const BRIGHT = 245
const GLARE_GRID = 8

/**
 * Measures one luma (greyscale) plane. On Android this is the Y plane of a
 * YUV camera frame; in tests and the eval it comes from a decoded photo.
 *
 * Every step uses integer maths or doubles summed in a fixed order, so the
 * Kotlin port in packages/native produces identical numbers. The shared
 * fixtures in fixtures/golden.json check that. If you change anything here,
 * change FrameMath.kt the same way and run `npm run golden`.
 */
export function analyzeLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  rowStride: number = width,
  targetWidth: number = TARGET_WIDTH,
): FrameMetrics {
  const f = Math.max(1, Math.floor(width / targetWidth))
  const w = Math.floor(width / f)
  const h = Math.floor(height / f)
  const px = downscale(luma, rowStride, f, w, h)
  const n = w * h

  let sum = 0
  let dark = 0
  let bright = 0
  for (let i = 0; i < n; i++) {
    const v = px[i]!
    sum += v
    if (v <= DARK) dark++
    if (v >= BRIGHT) bright++
  }

  // Centre region: the item is usually in the middle, and a blurred
  // background (shallow depth of field) should not count against the shot.
  const x0 = Math.floor(w / 5)
  const y0 = Math.floor(h / 5)
  const x1 = w - x0
  const y1 = h - y0

  return {
    width: w,
    height: h,
    meanLuma: sum / n,
    darkFraction: dark / n,
    brightFraction: bright / n,
    sharpness: laplacianVariance(px, w, h, x0, y0, x1, y1),
    glare: worstGlareCell(px, w, h),
    dhash: dhash(px, w, x0, y0, x1, y1),
  }
}

function downscale(src: Uint8Array, stride: number, f: number, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  const area = f * f
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let dy = 0; dy < f; dy++) {
        const row = (y * f + dy) * stride + x * f
        for (let dx = 0; dx < f; dx++) s += src[row + dx]!
      }
      out[y * w + x] = Math.floor(s / area)
    }
  }
  return out
}

function laplacianVariance(
  px: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let s = 0
  let s2 = 0
  let n = 0
  for (let y = Math.max(y0, 1); y < Math.min(y1, h - 1); y++) {
    for (let x = Math.max(x0, 1); x < Math.min(x1, w - 1); x++) {
      const i = y * w + x
      const l = 4 * px[i]! - px[i - 1]! - px[i + 1]! - px[i - w]! - px[i + w]!
      s += l
      s2 += l * l
      n++
    }
  }
  if (n === 0) return 0
  const mean = s / n
  return s2 / n - mean * mean
}

function worstGlareCell(px: Uint8Array, w: number, h: number): number {
  let worst = 0
  for (let cy = 0; cy < GLARE_GRID; cy++) {
    const ya = Math.floor((cy * h) / GLARE_GRID)
    const yb = Math.floor(((cy + 1) * h) / GLARE_GRID)
    for (let cx = 0; cx < GLARE_GRID; cx++) {
      const xa = Math.floor((cx * w) / GLARE_GRID)
      const xb = Math.floor(((cx + 1) * w) / GLARE_GRID)
      const area = (xb - xa) * (yb - ya)
      if (area === 0) continue
      let b = 0
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) if (px[y * w + x]! >= BRIGHT) b++
      worst = Math.max(worst, b / area)
    }
  }
  return worst
}

/** 64-bit difference hash: a 9x8 grid of block means, one bit per left/right pair. */
function dhash(px: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number): string {
  const rw = x1 - x0
  const rh = y1 - y0
  let hex = ''
  for (let gy = 0; gy < 8; gy++) {
    const ya = y0 + Math.floor((gy * rh) / 8)
    const yb = y0 + Math.floor(((gy + 1) * rh) / 8)
    let prev = -1
    let byte = 0
    for (let gx = 0; gx < 9; gx++) {
      const xa = x0 + Math.floor((gx * rw) / 9)
      const xb = x0 + Math.floor(((gx + 1) * rw) / 9)
      let s = 0
      let c = 0
      for (let y = ya; y < yb; y++) {
        for (let x = xa; x < xb; x++) {
          s += px[y * w + x]!
          c++
        }
      }
      const mean = c === 0 ? 0 : Math.floor(s / c)
      if (gx > 0 && prev > mean) byte |= 1 << (8 - gx)
      prev = mean
    }
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}
