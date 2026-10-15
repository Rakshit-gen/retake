import { hammingHex } from '@retake/quality'

export interface Similarity {
  /** Smallest dHash distance to any claim photo, 0 to 64. */
  distance: number | null
  warn: boolean
}

/**
 * A cheap on-device hint that the rider may be shooting the wrong item. It is
 * only a warning: lighting and angle move the hash too, so the server check
 * has the final say.
 */
export function compareToClaim(live: string, claim: string[], o: { warnAbove: number } = { warnAbove: 22 }): Similarity {
  if (claim.length === 0) return { distance: null, warn: false }
  const distance = Math.min(...claim.map((c) => hammingHex(live, c)))
  return { distance, warn: distance > o.warnAbove }
}
