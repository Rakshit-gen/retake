import type { FrameMetrics } from '@retake/quality'

export type FrameIssue = 'too_dark' | 'too_bright' | 'glare' | 'blurry'

export interface FrameAssessment {
  ok: boolean
  issues: FrameIssue[]
}

export interface Thresholds {
  minMeanLuma: number
  maxMeanLuma: number
  maxDarkFraction: number
  maxBrightFraction: number
  maxGlare: number
  minSharpness: number
}

// Tuned with `npm run eval` against the synthetic set in eval/. See the README
// for the numbers these settings give, and re-run the eval after changing them.
export const DEFAULT_THRESHOLDS: Thresholds = {
  minMeanLuma: 50,
  maxMeanLuma: 210,
  maxDarkFraction: 0.5,
  maxBrightFraction: 0.4,
  maxGlare: 0.35,
  minSharpness: 100,
}

/**
 * Lighting problems are listed first: a dark frame also reads as blurry (there
 * is little edge contrast), and "go somewhere brighter" often fixes both.
 */
export function assessFrame(m: FrameMetrics, t: Thresholds = DEFAULT_THRESHOLDS): FrameAssessment {
  const issues: FrameIssue[] = []
  const dark = m.meanLuma < t.minMeanLuma || m.darkFraction > t.maxDarkFraction
  const bright = m.meanLuma > t.maxMeanLuma || m.brightFraction > t.maxBrightFraction
  if (dark) issues.push('too_dark')
  else if (bright) issues.push('too_bright')
  else if (m.glare > t.maxGlare) issues.push('glare')
  if (m.sharpness < t.minSharpness) issues.push('blurry')
  return { ok: issues.length === 0, issues }
}
