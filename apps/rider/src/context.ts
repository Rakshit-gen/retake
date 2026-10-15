import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import type { RiderState, RiderStore } from './store'

export const RiderContext = createContext<RiderStore | null>(null)

export function useRider<T>(pick: (s: RiderState) => T): T {
  const store = useContext(RiderContext)
  if (!store) throw new Error('RiderContext is missing')
  return useStore(store, pick)
}
