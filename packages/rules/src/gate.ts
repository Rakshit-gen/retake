import type { FrameAssessment, FrameIssue } from './frame'

export interface GateState {
  /** Shutter unlocked. */
  ready: boolean
  okStreak: number
  failStreak: number
  /** Problem to show the user, or null. */
  hint: FrameIssue | null
}

export interface GateOptions {
  /** Good frames in a row before the shutter unlocks. */
  needed: number
  /** Bad frames in a row before an unlocked shutter locks again, and before a hint shows. */
  releaseAfter: number
}

export const initialGate: GateState = { ready: false, okStreak: 0, failStreak: 0, hint: null }

/**
 * Hysteresis on top of the per-frame verdict. Without it the shutter and the
 * hint text flicker every time one frame lands on the wrong side of a threshold.
 */
export function gateStep(
  s: GateState,
  a: FrameAssessment,
  o: GateOptions = { needed: 4, releaseAfter: 2 },
): GateState {
  if (a.ok) {
    const okStreak = s.okStreak + 1
    const ready = s.ready || okStreak >= o.needed
    return { ready, okStreak, failStreak: 0, hint: ready ? null : s.hint }
  }
  const failStreak = s.failStreak + 1
  const locked = !s.ready || failStreak >= o.releaseAfter
  return {
    ready: !locked,
    okStreak: 0,
    failStreak,
    hint: locked && failStreak >= o.releaseAfter ? a.issues[0]! : null,
  }
}
