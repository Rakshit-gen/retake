import { createStore } from 'zustand/vanilla'
import type { UploadQueue, UploadStatus } from '@retake/native'
import type { CapturedPhoto } from '@retake/capture'
import type { Api, AttemptResult, Pickup } from './api'

export type Phase =
  | { kind: 'shoot' }
  | { kind: 'sending'; uploadId: string; since: number }
  | { kind: 'result'; result: AttemptResult }
  /** The server already closed this pickup (another device, or a replayed attempt). */
  | { kind: 'closed'; state: Pickup['state'] }
  | { kind: 'error'; message: string }
  /** No answer in time; the rider moved on and the pickup is left to manual review. */
  | { kind: 'moved_on' }

export interface RiderState {
  pickups: Pickup[]
  loading: boolean
  error: string | null
  active: { pickup: Pickup; phase: Phase } | null
  load(): Promise<void>
  open(p: Pickup): void
  send(photo: CapturedPhoto): void
  retake(): void
  moveOn(): void
  close(): void
}

export interface RiderDeps {
  api: Api
  queue: UploadQueue
  pollMs?: number
}

const toPath = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ''))

function parse<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

/**
 * Plain Zustand store. The customer app uses Redux Saga for its longer flow;
 * the rider flow is one screen deep, so a store with async actions is enough.
 */
export function createRiderStore({ api, queue, pollMs = 1000 }: RiderDeps) {
  return createStore<RiderState>()((set, get) => {
    // Polls one upload. Stops as soon as the rider leaves the pickup or a newer
    // upload replaces it.
    async function follow(pickupId: string, uploadId: string) {
      const stillActive = () => {
        const a = get().active
        return a?.pickup.id === pickupId && a.phase.kind === 'sending' && a.phase.uploadId === uploadId
      }
      while (stillActive()) {
        let st: UploadStatus | undefined
        try {
          st = await queue.status(uploadId)
        } catch {
          st = undefined
        }
        if (!stillActive()) return
        const pickup = get().active!.pickup
        if (!st) return set({ active: { pickup, phase: { kind: 'error', message: 'The upload went missing. Take the photo again.' } } })
        if (st.state === 'succeeded') {
          const result = parse<AttemptResult>(st.body)
          if (!result?.decision) return set({ active: { pickup, phase: { kind: 'error', message: 'The server answer could not be read.' } } })
          return set({ active: { pickup, phase: { kind: 'result', result } } })
        }
        if (st.state === 'failed' || st.state === 'cancelled') {
          const body = parse<{ error?: string; pickup?: Pickup }>(st.body)
          if (st.httpStatus === 409 && body?.pickup) return set({ active: { pickup, phase: { kind: 'closed', state: body.pickup.state } } })
          return set({ active: { pickup, phase: { kind: 'error', message: `Upload failed${st.httpStatus ? ` (HTTP ${st.httpStatus})` : ''}.` } } })
        }
        await new Promise((r) => setTimeout(r, pollMs))
      }
    }

    return {
      pickups: [],
      loading: false,
      error: null,
      active: null,

      async load() {
        set({ loading: true, error: null })
        try {
          set({ pickups: await api.getPickups(), loading: false })
        } catch (e) {
          set({ loading: false, error: e instanceof Error ? e.message : 'Could not load pickups' })
        }
      },

      open(pickup) {
        set({ active: { pickup, phase: { kind: 'shoot' } } })
      },

      send(photo) {
        const a = get().active
        if (!a || a.phase.kind !== 'shoot') return
        const uploadId = queue.enqueue({
          url: `${api.baseUrl}/pickups/${a.pickup.id}/attempts`,
          tag: `pickup:${a.pickup.id}`,
          fields: [],
          files: [{ name: 'photo', path: toPath(photo.uri), contentType: 'image/jpeg' }],
        })
        set({ active: { pickup: a.pickup, phase: { kind: 'sending', uploadId, since: Date.now() } } })
        void follow(a.pickup.id, uploadId)
      },

      retake() {
        const a = get().active
        if (a) set({ active: { pickup: a.pickup, phase: { kind: 'shoot' } } })
      },

      moveOn() {
        const a = get().active
        if (a) set({ active: { pickup: a.pickup, phase: { kind: 'moved_on' } } })
      },

      close() {
        set({ active: null })
        void get().load()
      },
    }
  })
}

export type RiderStore = ReturnType<typeof createRiderStore>
