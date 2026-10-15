// Shapes returned by the server. Kept here rather than imported from server/
// so the app never bundles server code.
export interface OrderItem {
  id: string
  name: string
  qty: number
  pricePaise: number
}

export interface Order {
  id: string
  placedAt: string
  address: string
  items: OrderItem[]
}

export interface ClaimFiled {
  claim: { id: string; needsReview: boolean }
  pickupId: string
}

export interface Api {
  baseUrl: string
  getOrders(): Promise<Order[]>
}

export function createApi(baseUrl: string, fetchImpl: typeof fetch = fetch): Api {
  return {
    baseUrl,
    async getOrders() {
      const res = await fetchImpl(`${baseUrl}/orders`)
      if (!res.ok) throw new Error(`Could not load orders (${res.status})`)
      return (await res.json()) as Order[]
    },
  }
}

export const rupees = (paise: number) => `Rs ${(paise / 100).toFixed(paise % 100 === 0 ? 0 : 2)}`
