import { useCallback, useEffect, useRef, useState } from 'react'
import type { FrameMetrics } from '@retake/quality'
import { assessFrame, compareToClaim, gateStep, initialGate, type FrameIssue } from '@retake/rules'

export interface QualityGateOptions {
  /** dHashes of the customer's photos. Turns on the "wrong item?" warning. */
  claimHashes?: string[]
  /** How long the shutter stays locked before "shoot anyway" shows up. */
  shootAnywayAfterMs?: number
}

export interface QualityGateView {
  ready: boolean
  hint: FrameIssue | null
  /** The live frame looks unlike every claim photo, a few frames running. */
  mismatch: boolean
  canShootAnyway: boolean
  /** True once at least one frame has been scored. */
  scoring: boolean
}

const MISMATCH_FRAMES = 3

/**
 * Turns a stream of frame metrics (about 10 a second) into what the camera
 * screen shows. The gate state changes on every frame, but React only
 * re-renders when something visible changes.
 */
export function useQualityGate({ claimHashes, shootAnywayAfterMs = 4000 }: QualityGateOptions = {}): QualityGateView & {
  onMetrics: (m: FrameMetrics) => void
  latestMetrics: () => FrameMetrics | null
} {
  const gate = useRef(initialGate)
  const latest = useRef<FrameMetrics | null>(null)
  const claim = useRef(claimHashes)
  const streak = useRef(0)
  const [view, setView] = useState({ ready: false, hint: null as FrameIssue | null, mismatch: false, scoring: false })
  const [canShootAnyway, setCanShootAnyway] = useState(false)

  useEffect(() => {
    claim.current = claimHashes
  }, [claimHashes])

  const onMetrics = useCallback((m: FrameMetrics) => {
    latest.current = m
    const g = (gate.current = gateStep(gate.current, assessFrame(m)))
    const hashes = claim.current
    const warn = hashes ? compareToClaim(m.dhash, hashes).warn : false
    // Count up while it warns, down while it doesn't, so one odd frame changes nothing.
    streak.current = warn ? Math.min(MISMATCH_FRAMES, streak.current + 1) : Math.max(0, streak.current - 1)
    setView((v) => {
      const mismatch = streak.current >= MISMATCH_FRAMES ? true : streak.current === 0 ? false : v.mismatch
      if (v.ready === g.ready && v.hint === g.hint && v.mismatch === mismatch && v.scoring) return v
      return { ready: g.ready, hint: g.hint, mismatch, scoring: true }
    })
  }, [])

  // The gate can be wrong, and the scorer can be missing on some phones. The
  // user is never stuck: after a while they can shoot anyway, and the photo
  // is flagged as an override.
  useEffect(() => {
    if (view.ready || canShootAnyway) return
    const t = setTimeout(() => setCanShootAnyway(true), shootAnywayAfterMs)
    return () => clearTimeout(t)
  }, [view.ready, canShootAnyway, shootAnywayAfterMs])

  const latestMetrics = useCallback(() => latest.current, [])

  return { ...view, canShootAnyway, onMetrics, latestMetrics }
}
