import type { UploadQueue, UploadRequest, UploadStatus } from '@retake/native'
import type { Pickup } from './api'
import { createRiderStore } from './store'

const PICKUP: Pickup = {
  id: 'pck_1', claimId: 'clm_1', orderId: 'ord_1001', itemName: 'Atta 5 kg', state: 'open',
  claimHashes: ['0f0f0f0f0f0f0f0f'], claimPhotos: ['a.jpg'], attempts: [],
}

function fakeQueue(script: Partial<UploadStatus>[]) {
  const enqueued: UploadRequest[] = []
  let i = 0
  const queue = {
    enqueue: jest.fn((r: UploadRequest) => {
      enqueued.push(r)
      return `job-${enqueued.length}`
    }),
    status: jest.fn(async (id: string) => ({ id, state: 'queued' as const, attempts: 0, httpStatus: 0, body: '', ...script[Math.min(i++, script.length - 1)] })),
    list: jest.fn(async () => []),
    cancel: jest.fn(),
  }
  return { queue: queue as unknown as UploadQueue & typeof queue, enqueued }
}

const api = { baseUrl: 'http://10.0.2.2:4000', getPickups: async () => [PICKUP] }
const photo = { uri: 'file:///docs/photos/1.jpg', metrics: null, override: false }

async function until(check: () => boolean) {
  const end = Date.now() + 1000
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 2))
  }
}

test('a photo goes to the attempts endpoint and the decision comes back', async () => {
  const decision = { action: 'retry', nudge: 'Take it out of the bag.', attemptsLeft: 2 }
  const { queue, enqueued } = fakeQueue([{ state: 'running' }, { state: 'succeeded', httpStatus: 200, body: JSON.stringify({ attempt: 1, decision }) }])
  const store = createRiderStore({ api, queue, pollMs: 1 })
  store.getState().open(PICKUP)
  store.getState().send(photo)
  expect(enqueued[0]).toMatchObject({ url: 'http://10.0.2.2:4000/pickups/pck_1/attempts', tag: 'pickup:pck_1', files: [{ path: '/docs/photos/1.jpg' }] })
  await until(() => store.getState().active?.phase.kind === 'result')
  expect(store.getState().active?.phase).toMatchObject({ result: { decision } })
})

test('a second tap while sending does not send twice', () => {
  const { queue } = fakeQueue([{ state: 'running' }])
  const store = createRiderStore({ api, queue, pollMs: 1 })
  store.getState().open(PICKUP)
  store.getState().send(photo)
  store.getState().send(photo)
  expect(queue.enqueue).toHaveBeenCalledTimes(1)
  store.getState().close()
})

test('a pickup the server already closed says so', async () => {
  const { queue } = fakeQueue([{ state: 'failed', httpStatus: 409, body: JSON.stringify({ error: 'closed', pickup: { ...PICKUP, state: 'escalated' } }) }])
  const store = createRiderStore({ api, queue, pollMs: 1 })
  store.getState().open(PICKUP)
  store.getState().send(photo)
  await until(() => store.getState().active?.phase.kind === 'closed')
  expect(store.getState().active?.phase).toEqual({ kind: 'closed', state: 'escalated' })
})

test('leaving the pickup stops polling', async () => {
  const { queue } = fakeQueue([{ state: 'retrying' }])
  const store = createRiderStore({ api, queue, pollMs: 1 })
  store.getState().open(PICKUP)
  store.getState().send(photo)
  await until(() => queue.status.mock.calls.length >= 2)
  store.getState().close()
  const n = queue.status.mock.calls.length
  await new Promise((r) => setTimeout(r, 20))
  expect(queue.status.mock.calls.length).toBeLessThanOrEqual(n + 1)
  expect(store.getState().active).toBeNull()
})

test('moving on while still waiting leaves the upload to finish on its own', async () => {
  const { queue } = fakeQueue([{ state: 'queued' }])
  const store = createRiderStore({ api, queue, pollMs: 1 })
  store.getState().open(PICKUP)
  store.getState().send(photo)
  store.getState().moveOn()
  expect(store.getState().active?.phase.kind).toBe('moved_on')
  expect(queue.cancel).not.toHaveBeenCalled()
})

test('a failed pickups load keeps the reason', async () => {
  const { queue } = fakeQueue([])
  const store = createRiderStore({ api: { ...api, getPickups: async () => Promise.reject(new Error('offline')) }, queue })
  await store.getState().load()
  expect(store.getState()).toMatchObject({ loading: false, error: 'offline' })
})
