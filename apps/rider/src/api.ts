import type { MatchVerdict, MismatchReason, ReturnDecision } from '@retake/rules'

// Shapes returned by the server, kept here so the app never bundles server code.
export interface Pickup {
  id: string
  claimId: string
  orderId: string
  itemName: string
  state: 'open' | 'accepted' | 'escalated'
  claimHashes: string[]
  claimPhotos: string[]
  attempts: { n: number }[]
}

export interface AttemptResult {
  pickupId: string
  state: Pickup['state']
  attempt: number
  verdict: MatchVerdict
  reason: MismatchReason | null
  decision: ReturnDecision
}

export interface Api {
  baseUrl: string
  getPickups(): Promise<Pickup[]>
}

export function createApi(baseUrl: string, fetchImpl: typeof fetch = fetch): Api {
  return {
    baseUrl,
    async getPickups() {
      const res = await fetchImpl(`${baseUrl}/pickups`)
      if (!res.ok) throw new Error(`Could not load pickups (${res.status})`)
      return (await res.json()) as Pickup[]
    },
  }
}
