/**
 * Numbers measured from one camera frame (or one photo) by analyzeLuma.
 * The Kotlin frame plugin returns exactly this shape, so the gate logic in
 * @retake/rules runs the same way on live frames and on saved photos.
 */
export interface FrameMetrics {
  /** Size of the downscaled image the metrics were computed on. */
  width: number
  height: number
  /** Average brightness, 0 to 255. */
  meanLuma: number
  /** Share of pixels at or below 16 (crushed shadows). */
  darkFraction: number
  /** Share of pixels at or above 245 (blown highlights). */
  brightFraction: number
  /** Variance of the Laplacian over the centre of the frame. Higher is sharper. */
  sharpness: number
  /** Highest share of blown pixels inside any cell of an 8x8 grid. Catches glare spots on glossy packs. */
  glare: number
  /** 64-bit difference hash of the centre of the frame, as 16 hex characters. */
  dhash: string
}
