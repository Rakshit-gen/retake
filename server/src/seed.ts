// Made-up orders so both apps have something to work with. Brands are invented.
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

export const ORDERS: Order[] = [
  {
    id: 'ord_1001',
    placedAt: '2026-10-14T08:12:00+05:30',
    address: '3rd Cross, HSR Layout',
    items: [
      { id: 'itm_1', name: 'Kesari Toned Milk 500 ml', qty: 2, pricePaise: 2900 },
      { id: 'itm_2', name: 'Gaurav Whole Wheat Atta 5 kg', qty: 1, pricePaise: 24500 },
      { id: 'itm_3', name: 'Nimbu Bhujia 200 g', qty: 1, pricePaise: 5500 },
    ],
  },
  {
    id: 'ord_1002',
    placedAt: '2026-10-15T19:40:00+05:30',
    address: '14th Main, Indiranagar',
    items: [
      { id: 'itm_4', name: 'Sonali Paneer 200 g', qty: 1, pricePaise: 9000 },
      { id: 'itm_5', name: 'Tara Curd 400 g', qty: 1, pricePaise: 4500 },
    ],
  },
]
