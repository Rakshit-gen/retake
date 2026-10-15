import type { HybridObject } from 'react-native-nitro-modules'
import type { Frame } from 'react-native-vision-camera'

/** Same shape as FrameMetrics in @retake/quality. */
export interface NativeFrameMetrics {
  width: number
  height: number
  meanLuma: number
  darkFraction: number
  brightFraction: number
  sharpness: number
  contrast: number
  glare: number
  dhash: string
}

export interface FrameScorer extends HybridObject<{ android: 'kotlin' }> {
  /**
   * Scores the luma (Y) plane of a YUV camera frame. Runs synchronously on the
   * frame output's worklet thread, so it must stay well inside one frame
   * interval. Returns undefined for frames that are not 8-bit YUV.
   */
  score(frame: Frame, targetWidth: number): NativeFrameMetrics | undefined
  /** Milliseconds the last score() call spent, for the on-screen debug readout. */
  readonly lastScoreMs: number
}
