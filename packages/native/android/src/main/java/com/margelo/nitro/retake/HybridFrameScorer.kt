package com.margelo.nitro.retake

import android.graphics.ImageFormat
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame

/**
 * Called from the VisionCamera frame output worklet for every frame. Copies
 * the Y plane into a reused array and runs FrameMath on it. Buffers are kept
 * between calls so a 30 fps stream does not allocate a megabyte per frame.
 */
class HybridFrameScorer : HybridFrameScorerSpec() {
  private var luma = ByteArray(0)
  private var scratch = IntArray(0)
  private var lastMs = 0.0

  override val lastScoreMs: Double
    get() = lastMs

  override fun score(frame: HybridFrameSpec, targetWidth: Double): NativeFrameMetrics? {
    val image = (frame as? NativeFrame)?.image ?: return null
    if (image.format != ImageFormat.YUV_420_888) return null
    val start = System.nanoTime()

    val plane = image.planes[0]
    // The Y plane of YUV_420_888 always has pixelStride 1, but check rather than trust it.
    if (plane.pixelStride != 1) return null
    val buf = plane.buffer.duplicate()
    buf.rewind()
    val size = buf.remaining()
    if (luma.size < size) luma = ByteArray(size)
    buf.get(luma, 0, size)

    val tw = targetWidth.toInt().coerceAtLeast(1)
    val f = maxOf(1, image.width / tw)
    val cells = (image.width / f) * (image.height / f)
    if (scratch.size < cells) scratch = IntArray(cells)

    val m = FrameMath.analyze(luma, image.width, image.height, plane.rowStride, tw, scratch)
    lastMs = (System.nanoTime() - start) / 1e6
    return NativeFrameMetrics(
      width = m.width.toDouble(),
      height = m.height.toDouble(),
      meanLuma = m.meanLuma,
      darkFraction = m.darkFraction,
      brightFraction = m.brightFraction,
      sharpness = m.sharpness,
      contrast = m.contrast,
      glare = m.glare,
      dhash = m.dhash,
    )
  }
}
