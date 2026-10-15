export type MatchVerdict = 'match' | 'not_match' | 'ambiguous' | 'unavailable'

export type MismatchReason =
  | 'dark_or_blurry'
  | 'in_packaging'
  | 'in_delivery_bag'
  | 'angle'
  | 'different_item'
  | 'unclear'

export interface AttemptResult {
  verdict: MatchVerdict
  reason: MismatchReason | null
  /** 1 for the first photo set the rider sends for this pickup. */
  attempt: number
}

export type ReturnDecision =
  | { action: 'accept' }
  | { action: 'retry'; nudge: string; attemptsLeft: number }
  | { action: 'escalate'; why: 'retries_exhausted' | 'checker_unavailable' }

const NUDGES: Record<MismatchReason, string> = {
  dark_or_blurry: 'Photo is too dark or blurry. Move to better light and hold the phone still.',
  in_packaging: 'The item is still in its packaging. Take it out and shoot again.',
  in_delivery_bag: 'The item is inside the delivery bag. Take it out and shoot again.',
  angle: "Line the item up with the customer's photo on screen and shoot from that side.",
  different_item: "This doesn't look like the item the customer reported. Check you have the right one.",
  unclear: 'Could not confirm the item. Fill the frame with it and try again.',
}

export function nudgeFor(reason: MismatchReason): string {
  return NUDGES[reason]
}

/**
 * The model only says what it saw. Whether the rider takes the item, tries
 * again or hands off to a person is decided here, in code that can be tested.
 * A rider is never left waiting at the door: if the checker is down, the
 * pickup goes straight to manual review.
 */
export function decideReturn(r: AttemptResult, o: { maxRetries: number } = { maxRetries: 2 }): ReturnDecision {
  if (r.verdict === 'match') return { action: 'accept' }
  if (r.verdict === 'unavailable') return { action: 'escalate', why: 'checker_unavailable' }
  const attemptsLeft = o.maxRetries + 1 - r.attempt
  if (attemptsLeft <= 0) return { action: 'escalate', why: 'retries_exhausted' }
  return { action: 'retry', nudge: nudgeFor(r.reason ?? 'unclear'), attemptsLeft }
}
