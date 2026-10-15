import { gateStep, initialGate, type GateState } from './gate'
import type { FrameAssessment } from './frame'

const ok: FrameAssessment = { ok: true, issues: [] }
const dark: FrameAssessment = { ok: false, issues: ['too_dark'] }
const blurry: FrameAssessment = { ok: false, issues: ['blurry'] }

function run(frames: FrameAssessment[], opts = { needed: 3, releaseAfter: 2 }): GateState {
  return frames.reduce((s, f) => gateStep(s, f, opts), initialGate)
}

describe('gateStep', () => {
  it('starts locked with no hint', () => {
    expect(initialGate).toEqual({ ready: false, okStreak: 0, failStreak: 0, hint: null })
  })

  it('unlocks only after enough good frames in a row', () => {
    expect(run([ok, ok]).ready).toBe(false)
    expect(run([ok, ok, ok]).ready).toBe(true)
  })

  it('a bad frame resets the good streak before unlock', () => {
    expect(run([ok, ok, dark, ok, ok]).ready).toBe(false)
  })

  it('stays unlocked through a single bad frame so the shutter does not flicker', () => {
    const s = run([ok, ok, ok, blurry])
    expect(s.ready).toBe(true)
    expect(s.hint).toBeNull()
  })

  it('locks again after releaseAfter bad frames and shows the latest issue', () => {
    const s = run([ok, ok, ok, blurry, dark])
    expect(s.ready).toBe(false)
    expect(s.hint).toBe('too_dark')
  })

  it('shows a hint while locked once the same problem persists', () => {
    expect(run([dark]).hint).toBeNull()
    expect(run([dark, dark]).hint).toBe('too_dark')
  })

  it('clears the hint as soon as it unlocks', () => {
    expect(run([dark, dark, ok, ok, ok]).hint).toBeNull()
  })
})
