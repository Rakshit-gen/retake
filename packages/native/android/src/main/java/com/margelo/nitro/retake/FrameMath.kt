package com.margelo.nitro.retake

/**
 * Kotlin port of packages/quality/src/analyze.ts. It must produce the same
 * numbers: golden/GoldenCheck.kt runs both against fixtures/golden.json.
 *
 * No Android imports here, so the golden check can compile this file with
 * plain kotlinc and run it on a laptop JVM.
 */
class FrameMetricsResult(
  val width: Int,
  val height: Int,
  val meanLuma: Double,
  val darkFraction: Double,
  val brightFraction: Double,
  val sharpness: Double,
  val contrast: Double,
  val glare: Double,
  val dhash: String,
)

object FrameMath {
  const val TARGET_WIDTH = 640
  private const val DARK = 16
  private const val BRIGHT = 245
  private const val GLARE_GRID = 8

  /**
   * [luma] holds [height] rows of [rowStride] bytes, unsigned. The last row
   * may be shorter than [rowStride], as camera buffers often are.
   * [scratch] is reused between frames to avoid allocating per frame.
   */
  fun analyze(
    luma: ByteArray,
    width: Int,
    height: Int,
    rowStride: Int,
    targetWidth: Int = TARGET_WIDTH,
    scratch: IntArray? = null,
  ): FrameMetricsResult {
    val f = maxOf(1, width / targetWidth)
    val w = width / f
    val h = height / f
    val px = if (scratch != null && scratch.size >= w * h) scratch else IntArray(w * h)
    downscale(luma, rowStride, f, w, h, px)
    val n = w * h

    var sum = 0L
    var dark = 0
    var bright = 0
    for (i in 0 until n) {
      val v = px[i]
      sum += v
      if (v <= DARK) dark++
      if (v >= BRIGHT) bright++
    }

    val x0 = w / 5
    val y0 = h / 5
    val x1 = w - x0
    val y1 = h - y0

    return FrameMetricsResult(
      width = w,
      height = h,
      meanLuma = sum.toDouble() / n,
      darkFraction = dark.toDouble() / n,
      brightFraction = bright.toDouble() / n,
      sharpness = laplacianVariance(px, w, h, x0, y0, x1, y1),
      contrast = variance(px, w, x0, y0, x1, y1),
      glare = worstGlareCell(px, w, h),
      dhash = dhash(px, w, x0, y0, x1, y1),
    )
  }

  private fun downscale(src: ByteArray, stride: Int, f: Int, w: Int, h: Int, out: IntArray) {
    val area = f * f
    for (y in 0 until h) {
      for (x in 0 until w) {
        var s = 0
        for (dy in 0 until f) {
          val row = (y * f + dy) * stride + x * f
          for (dx in 0 until f) s += src[row + dx].toInt() and 0xFF
        }
        out[y * w + x] = s / area
      }
    }
  }

  private fun laplacianVariance(px: IntArray, w: Int, h: Int, x0: Int, y0: Int, x1: Int, y1: Int): Double {
    var s = 0.0
    var s2 = 0.0
    var n = 0
    for (y in maxOf(y0, 1) until minOf(y1, h - 1)) {
      for (x in maxOf(x0, 1) until minOf(x1, w - 1)) {
        val i = y * w + x
        val l = 4 * px[i] - px[i - 1] - px[i + 1] - px[i - w] - px[i + w]
        s += l
        s2 += (l * l).toDouble()
        n++
      }
    }
    if (n == 0) return 0.0
    val mean = s / n
    return s2 / n - mean * mean
  }

  private fun variance(px: IntArray, w: Int, x0: Int, y0: Int, x1: Int, y1: Int): Double {
    var s = 0.0
    var s2 = 0.0
    var n = 0
    for (y in y0 until y1) {
      for (x in x0 until x1) {
        val v = px[y * w + x]
        s += v
        s2 += (v * v).toDouble()
        n++
      }
    }
    if (n == 0) return 0.0
    val mean = s / n
    return s2 / n - mean * mean
  }

  private fun worstGlareCell(px: IntArray, w: Int, h: Int): Double {
    var worst = 0.0
    for (cy in 0 until GLARE_GRID) {
      val ya = cy * h / GLARE_GRID
      val yb = (cy + 1) * h / GLARE_GRID
      for (cx in 0 until GLARE_GRID) {
        val xa = cx * w / GLARE_GRID
        val xb = (cx + 1) * w / GLARE_GRID
        val area = (xb - xa) * (yb - ya)
        if (area == 0) continue
        var b = 0
        for (y in ya until yb) for (x in xa until xb) if (px[y * w + x] >= BRIGHT) b++
        worst = maxOf(worst, b.toDouble() / area)
      }
    }
    return worst
  }

  private fun dhash(px: IntArray, w: Int, x0: Int, y0: Int, x1: Int, y1: Int): String {
    val rw = x1 - x0
    val rh = y1 - y0
    val hex = StringBuilder(16)
    for (gy in 0 until 8) {
      val ya = y0 + gy * rh / 8
      val yb = y0 + (gy + 1) * rh / 8
      var prev = -1
      var byte = 0
      for (gx in 0 until 9) {
        val xa = x0 + gx * rw / 9
        val xb = x0 + (gx + 1) * rw / 9
        var s = 0
        var c = 0
        for (y in ya until yb) {
          for (x in xa until xb) {
            s += px[y * w + x]
            c++
          }
        }
        val mean = if (c == 0) 0 else s / c
        if (gx > 0 && prev > mean) byte = byte or (1 shl (8 - gx))
        prev = mean
      }
      hex.append(String.format("%02x", byte))
    }
    return hex.toString()
  }
}
