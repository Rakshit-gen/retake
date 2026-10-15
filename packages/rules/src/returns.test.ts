import { decideReturn, nudgeFor } from './returns'

describe('decideReturn', () => {
  it('accepts a match on any attempt', () => {
    expect(decideReturn({ verdict: 'match', reason: null, attempt: 1 })).toEqual({ action: 'accept' })
    expect(decideReturn({ verdict: 'match', reason: null, attempt: 3 })).toEqual({ action: 'accept' })
  })

  it('asks for a retry with a specific nudge on a failed attempt', () => {
    expect(decideReturn({ verdict: 'not_match', reason: 'in_delivery_bag', attempt: 1 })).toEqual({
      action: 'retry',
      nudge: nudgeFor('in_delivery_bag'),
      attemptsLeft: 2,
    })
  })

  it('treats ambiguous like a failed attempt', () => {
    expect(decideReturn({ verdict: 'ambiguous', reason: 'dark_or_blurry', attempt: 2 })).toMatchObject({
      action: 'retry',
      attemptsLeft: 1,
    })
  })

  it('escalates to a person after the retries run out', () => {
    expect(decideReturn({ verdict: 'not_match', reason: 'different_item', attempt: 3 })).toEqual({
      action: 'escalate',
      why: 'retries_exhausted',
    })
  })

  it('escalates at once when the checker is unavailable, so the rider is never stuck at the door', () => {
    expect(decideReturn({ verdict: 'unavailable', reason: null, attempt: 1 })).toEqual({
      action: 'escalate',
      why: 'checker_unavailable',
    })
  })

  it('honours a custom retry limit', () => {
    expect(decideReturn({ verdict: 'not_match', reason: 'angle', attempt: 1 }, { maxRetries: 0 })).toEqual({
      action: 'escalate',
      why: 'retries_exhausted',
    })
  })

  it('falls back to a generic nudge when the checker gives no reason', () => {
    expect(decideReturn({ verdict: 'ambiguous', reason: null, attempt: 1 })).toMatchObject({
      nudge: nudgeFor('unclear'),
    })
  })
})

describe('nudgeFor', () => {
  it('has distinct copy for every reason', () => {
    const reasons = ['dark_or_blurry', 'in_packaging', 'in_delivery_bag', 'angle', 'different_item', 'unclear'] as const
    const texts = new Set(reasons.map(nudgeFor))
    expect(texts.size).toBe(reasons.length)
  })
})
