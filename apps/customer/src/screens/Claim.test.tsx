import { act, render, screen, userEvent } from '@testing-library/react-native'
import { Provider } from 'react-redux'
import type { UploadQueue } from '@retake/native'
import { claim, makeStore, orders } from '../store'
import { ClaimScreen } from './Claim'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const metrics = {
  width: 640, height: 360, meanLuma: 120, darkFraction: 0.01, brightFraction: 0.02,
  sharpness: 900, contrast: 500, glare: 0.05, dhash: '0f0f0f0f0f0f0f0f',
}

function setup() {
  const queue = {
    enqueue: jest.fn(() => 'job-1'),
    status: jest.fn(async () => ({ id: 'job-1', state: 'queued', attempts: 0, httpStatus: 0, body: '' })),
    list: jest.fn(async () => []),
    cancel: jest.fn(),
  } as unknown as UploadQueue
  const store = makeStore({ api: { baseUrl: 'http://x', getOrders: async () => [] }, queue, pollMs: 5 })
  store.dispatch(orders.actions.loaded([{ id: 'o1', placedAt: '2026-10-14T08:12:00+05:30', address: 'HSR', items: [{ id: 'i1', name: 'Gaurav Atta 5 kg', qty: 1, pricePaise: 24500 }] }]))
  store.dispatch(claim.actions.started({ orderId: 'o1', itemId: 'i1' }))
  return { store, queue }
}

test('submitting without a category or photo explains what is missing', async () => {
  const { store, queue } = setup()
  await render(
    <Provider store={store}>
      <ClaimScreen onAddPhoto={() => {}} onDone={() => {}} />
    </Provider>,
  )
  expect(screen.getByText('Gaurav Atta 5 kg')).toBeOnTheScreen()
  await userEvent.setup().press(screen.getByTestId('submit'))
  expect(screen.getByText('Pick what went wrong.')).toBeOnTheScreen()
  expect(screen.getByText('Add at least one photo.')).toBeOnTheScreen()
  expect(queue.enqueue).not.toHaveBeenCalled()
})

test('a complete claim goes to the queue and the screen says it is waiting for a connection', async () => {
  const { store, queue } = setup()
  store.dispatch(claim.actions.photoAdded({ uri: 'file:///p/1.jpg', metrics }))
  await render(
    <Provider store={store}>
      <ClaimScreen onAddPhoto={() => {}} onDone={() => {}} />
    </Provider>,
  )
  const user = userEvent.setup()
  await user.press(screen.getByRole('radio', { name: 'Damaged' }))
  await user.press(screen.getByTestId('submit'))
  expect(queue.enqueue).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('Waiting for a connection to upload.')).toBeOnTheScreen()
  expect(screen.queryByTestId('add-photo')).toBeOnTheScreen()
  await act(() => store.dispatch(claim.actions.closed()))
})
