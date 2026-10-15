import type { FrameMetrics } from '@retake/quality'
import { assessFrame, type Thresholds } from './frame'

const t: Thresholds = {
  minMeanLuma: 50,
  maxMeanLuma: 210,
  maxDarkFraction: 0.5,
  maxBrightFraction: 0.4,
  maxGlare: 0.35,
  minSharpnessRatio: 0.5,
  minContrast: 60,
}

const good: FrameMetrics = {
  width: 320,
  height: 180,
  meanLuma: 120,
  darkFraction: 0.05,
  brightFraction: 0.02,
  sharpness: 400,
  contrast: 400,
  glare: 0.1,
  dhash: '0123456789abcdef',
}

describe('assessFrame', () => {
  it('passes a well lit, sharp frame', () => {
    expect(assessFrame(good, t)).toEqual({ ok: true, issues: [] })
  })

  it('flags a dark frame by mean brightness', () => {
    expect(assessFrame({ ...good, meanLuma: 30 }, t).issues).toEqual(['too_dark'])
  })

  it('flags a dark frame when most pixels are crushed even if a lamp lifts the mean', () => {
    expect(assessFrame({ ...good, meanLuma: 70, darkFraction: 0.7 }, t).issues).toEqual(['too_dark'])
  })

  it('flags an overexposed frame', () => {
    expect(assessFrame({ ...good, meanLuma: 230 }, t).issues).toEqual(['too_bright'])
    expect(assessFrame({ ...good, brightFraction: 0.5 }, t).issues).toEqual(['too_bright'])
  })

  it('flags a local glare spot on an otherwise fine frame', () => {
    expect(assessFrame({ ...good, glare: 0.6 }, t).issues).toEqual(['glare'])
  })

  it('does not double report glare when the whole frame is blown out', () => {
    expect(assessFrame({ ...good, brightFraction: 0.6, glare: 0.9 }, t).issues).toEqual(['too_bright'])
  })

  it('flags blur relative to how much detail the scene has', () => {
    expect(assessFrame({ ...good, sharpness: 150 }, t).issues).toEqual(['blurry'])
    // Same edge energy, but in a low detail scene it is plenty sharp.
    expect(assessFrame({ ...good, sharpness: 150, contrast: 200 }, t).ok).toBe(true)
  })

  it('flags a featureless centre, where blur cannot be judged', () => {
    expect(assessFrame({ ...good, sharpness: 50, contrast: 20 }, t).issues).toEqual(['blurry'])
  })

  it('reports every issue, most important first', () => {
    const r = assessFrame({ ...good, meanLuma: 20, sharpness: 5 }, t)
    expect(r.ok).toBe(false)
    expect(r.issues).toEqual(['too_dark', 'blurry'])
  })

  it('ships default thresholds', () => {
    expect(assessFrame(good).ok).toBe(true)
  })
})
