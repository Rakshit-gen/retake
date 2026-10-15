import type { UploadQueue, UploadRequest, UploadStatus } from '@retake/native'
import type { FrameMetrics } from '@retake/quality'
import type { Api } from '../api'
import { claim, makeStore, orders } from './index'
import { claimUpload, toPath } from './sagas'

const GOOD: FrameMetrics = {
  width: 640, height: 360, meanLuma: 120, darkFraction: 0.01, brightFraction: 0.02,
  sharpness: 900, contrast: 500, glare: 0.05, dhash: '0f0f0f0f0f0f0f0f',
}

function fakeQueue(script: Partial<UploadStatus>[], existing: UploadStatus[] = []) {
  const enqueued: UploadRequest[] = []
  let i = 0
  const queue = {
    enqueue: jest.fn((r: UploadRequest) => {
      enqueued.push(r)
      return 'job-1'
    }),
    status: jest.fn(async (id: string): Promise<UploadStatus | undefined> => {
      const step = script[Math.min(i++, script.length - 1)]
      return step && { id, state: 'queued', attempts: 0, httpStatus: 0, body: '', ...step }
    }),
    list: jest.fn(async () => existing),
    cancel: jest.fn(),
  }
  return { queue: queue as unknown as UploadQueue & typeof queue, enqueued }
}

const api: Api = { baseUrl: 'http://10.0.2.2:4000', getOrders: async () => [] }

async function until(check: () => boolean, ms = 1000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 2))
  }
}

function draftReady(store: ReturnType<typeof makeStore>, override = false) {
  store.dispatch(claim.actions.started({ orderId: 'ord_1001', itemId: 'itm_2' }))
  store.dispatch(claim.actions.categoryPicked('wrong_item'))
  store.dispatch(claim.actions.photoAdded({ uri: 'file:///data/user/0/app/files/photos/a%20b.jpg', metrics: GOOD, override }))
}

test('an incomplete claim never reaches the upload queue', async () => {
  const { queue } = fakeQueue([])
  const store = makeStore({ api, queue, pollMs: 1 })
  store.dispatch(claim.actions.started({ orderId: 'ord_1001', itemId: 'itm_2' }))
  store.dispatch(claim.actions.submitRequested())
  expect(store.getState().claim.problems).toEqual(['pick_category', 'add_photo'])
  expect(queue.enqueue).not.toHaveBeenCalled()
})

test('a valid claim is queued, followed through retries, and filed', async () => {
  const { queue, enqueued } = fakeQueue([
    { state: 'running' },
    { state: 'retrying', attempts: 1 },
    { state: 'succeeded', httpStatus: 201, body: JSON.stringify({ claim: { id: 'clm_1', needsReview: true }, pickupId: 'pck_1' }) },
  ])
  const store = makeStore({ api, queue, pollMs: 1 })
  const seen: string[] = []
  store.subscribe(() => {
    const st = store.getState().claim.submit.state
    if (seen[seen.length - 1] !== st) seen.push(st)
  })
  draftReady(store, true)
  store.dispatch(claim.actions.submitRequested())
  await until(() => store.getState().claim.submit.state === 'filed')
  expect(seen).toEqual(['idle', 'queued', 'running', 'retrying', 'filed'])
  expect(store.getState().claim.submit).toMatchObject({ claimId: 'clm_1', message: expect.stringMatching(/look at your photos/) })
  expect(enqueued[0]).toEqual(claimUpload(api.baseUrl, { orderId: 'ord_1001', itemId: 'itm_2', category: 'wrong_item', note: '', photos: [{ uri: 'file:///data/user/0/app/files/photos/a%20b.jpg', metrics: GOOD, override: true }] }))
  expect(enqueued[0]!.files[0]!.path).toBe('/data/user/0/app/files/photos/a b.jpg')
  expect(enqueued[0]!.fields).toContainEqual({ name: 'overrides', value: '[true]' })
})

test('problems the server finds come back to the form', async () => {
  const { queue } = fakeQueue([{ state: 'failed', httpStatus: 400, body: '{"problems":["pick_item"]}' }])
  const store = makeStore({ api, queue, pollMs: 1 })
  draftReady(store)
  store.dispatch(claim.actions.submitRequested())
  await until(() => store.getState().claim.problems.length > 0)
  expect(store.getState().claim.problems).toEqual(['pick_item'])
  expect(store.getState().claim.submit.state).toBe('idle')
})

test('a failure without a readable body says what happened', async () => {
  const { queue } = fakeQueue([{ state: 'failed', httpStatus: 413, body: 'too big' }])
  const store = makeStore({ api, queue, pollMs: 1 })
  draftReady(store)
  store.dispatch(claim.actions.submitRequested())
  await until(() => store.getState().claim.submit.state === 'failed')
  expect(store.getState().claim.submit.message).toBe('Upload failed (HTTP 413).')
})

test('double tapping submit queues one upload', async () => {
  const { queue } = fakeQueue([{ state: 'running' }])
  const store = makeStore({ api, queue, pollMs: 1 })
  draftReady(store)
  store.dispatch(claim.actions.submitRequested())
  store.dispatch(claim.actions.submitRequested())
  expect(queue.enqueue).toHaveBeenCalledTimes(1)
  store.dispatch(claim.actions.closed())
})

test('closing the screen stops polling but leaves the upload alone', async () => {
  const { queue } = fakeQueue([{ state: 'running' }])
  const store = makeStore({ api, queue, pollMs: 1 })
  draftReady(store)
  store.dispatch(claim.actions.submitRequested())
  await until(() => queue.status.mock.calls.length >= 2)
  store.dispatch(claim.actions.closed())
  const calls = queue.status.mock.calls.length
  await new Promise((r) => setTimeout(r, 20))
  expect(queue.status.mock.calls.length).toBeLessThanOrEqual(calls + 1)
  expect(queue.cancel).not.toHaveBeenCalled()
})

test('on launch, a claim upload left running is picked up again', async () => {
  const running: UploadStatus = { id: 'job-old', state: 'retrying', attempts: 2, httpStatus: 503, body: '' }
  const { queue } = fakeQueue([{ state: 'succeeded', body: '{"claim":{"id":"clm_9","needsReview":false},"pickupId":"p"}' }], [running])
  const store = makeStore({ api, queue, pollMs: 1 })
  await until(() => store.getState().claim.submit.state === 'filed')
  expect(queue.status).toHaveBeenCalledWith('job-old')
  expect(store.getState().claim.submit.claimId).toBe('clm_9')
})

test('orders load, and a failed load keeps the reason', async () => {
  const { queue } = fakeQueue([])
  const ok = makeStore({ api: { ...api, getOrders: async () => [{ id: 'o', placedAt: '', address: '', items: [] }] }, queue })
  ok.dispatch(orders.actions.requested())
  await until(() => ok.getState().orders.status === 'loaded')
  const bad = makeStore({ api: { ...api, getOrders: async () => Promise.reject(new Error('offline')) }, queue })
  bad.dispatch(orders.actions.requested())
  await until(() => bad.getState().orders.status === 'failed')
  expect(bad.getState().orders.error).toBe('offline')
})

test('toPath strips the scheme and decodes', () => {
  expect(toPath('file:///a/b%20c.jpg')).toBe('/a/b c.jpg')
  expect(toPath('/already/a/path.jpg')).toBe('/already/a/path.jpg')
})
