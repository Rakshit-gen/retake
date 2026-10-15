import type { FrameMetrics } from '@retake/quality'

export const GOOD: FrameMetrics = {
  width: 640,
  height: 360,
  meanLuma: 120,
  darkFraction: 0.01,
  brightFraction: 0.02,
  sharpness: 900,
  contrast: 500,
  glare: 0.05,
  dhash: '0f0f0f0f0f0f0f0f',
}

export const DARK: FrameMetrics = { ...GOOD, meanLuma: 20, darkFraction: 0.8 }
