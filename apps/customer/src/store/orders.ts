import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Order } from '../api'

export interface OrdersState {
  list: Order[]
  status: 'idle' | 'loading' | 'loaded' | 'failed'
  error: string | null
}

const initialState: OrdersState = { list: [], status: 'idle', error: null }

export const orders = createSlice({
  name: 'orders',
  initialState,
  reducers: {
    requested: (s) => {
      s.status = 'loading'
      s.error = null
    },
    loaded: (s, a: PayloadAction<Order[]>) => {
      s.list = a.payload
      s.status = 'loaded'
    },
    failed: (s, a: PayloadAction<string>) => {
      s.status = 'failed'
      s.error = a.payload
    },
  },
})
