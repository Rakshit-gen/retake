import { act, render, screen, userEvent } from '@testing-library/react-native'
import type { UploadQueue } from '@retake/native'
import type { Pickup } from '../api'
import { RiderContext } from '../context'
import { createRiderStore } from '../store'
import { MOVE_ON_AFTER_MS, PickupScreen } from './Pickup'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const PICKUP: Pickup = {
  id: 'pck_1', claimId: 'clm_1', orderId: 'ord_1001', itemName: 'Atta 5 kg', state: 'open',
  claimHashes: [], claimPhotos: ['a.jpg'], attempts: [],
}

const queue = {
  enqueue: () => 'job-1',
  status: async () => ({ id: 'job-1', state: 'queued', attempts: 0, httpStatus: 0, body: '' }),
  list: async () => [],
  cancel: () => {},
} as unknown as UploadQueue

function setup() {
  const store = createRiderStore({ api: { baseUrl: 'http://x', getPickups: async () => [] }, queue, pollMs: 50 })
  store.getState().open(PICKUP)
  const onShoot = jest.fn()
  return { store, onShoot, ui: <RiderContext.Provider value={store}><PickupScreen baseUrl="http://x" onShoot={onShoot} /></RiderContext.Provider> }
}

test('a retry shows the nudge and how many tries are left, and retaking opens the camera', async () => {
  const { store, onShoot, ui } = setup()
  store.setState({ active: { pickup: PICKUP, phase: { kind: 'result', result: { pickupId: 'pck_1', state: 'open', attempt: 2, verdict: 'not_match', reason: 'in_delivery_bag', decision: { action: 'retry', nudge: 'The item is inside the delivery bag. Take it out and shoot again.', attemptsLeft: 1 } } } } })
  await render(ui)
  expect(screen.getByText('The item is inside the delivery bag. Take it out and shoot again.')).toBeOnTheScreen()
  expect(screen.getByText('1 try left before this goes to manual review.')).toBeOnTheScreen()
  await userEvent.setup().press(screen.getByRole('button', { name: 'Take the photo again' }))
  expect(onShoot).toHaveBeenCalled()
  expect(store.getState().active?.phase.kind).toBe('shoot')
})

test('a down checker never strands the rider', async () => {
  const { store, ui } = setup()
  store.setState({ active: { pickup: PICKUP, phase: { kind: 'result', result: { pickupId: 'pck_1', state: 'escalated', attempt: 1, verdict: 'unavailable', reason: null, decision: { action: 'escalate', why: 'checker_unavailable' } } } } })
  await render(ui)
  expect(screen.getByText(/not answering. Collect the item/)).toBeOnTheScreen()
})

test('after waiting a while with no answer the rider can move on', async () => {
  jest.useFakeTimers()
  const { store, ui } = setup()
  store.setState({ active: { pickup: PICKUP, phase: { kind: 'sending', uploadId: 'job-1', since: Date.now() } } })
  await render(ui)
  expect(screen.queryByTestId('move-on')).toBeNull()
  await act(() => jest.advanceTimersByTime(MOVE_ON_AFTER_MS))
  expect(screen.getByTestId('move-on')).toBeOnTheScreen()
  await act(() => store.getState().moveOn())
  expect(screen.getByText(/still upload and a person will review/)).toBeOnTheScreen()
  jest.useRealTimers()
})
