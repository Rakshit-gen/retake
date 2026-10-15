import { act, renderHook } from '@testing-library/react-native'
import { DARK, GOOD } from './fixtures'
import { useQualityGate } from './useQualityGate'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('unlocks after four good frames and shows a hint after two bad ones', async () => {
  const { result } = await renderHook(() => useQualityGate())
  await act(() => {
    for (let i = 0; i < 3; i++) result.current.onMetrics(GOOD)
  })
  expect(result.current.ready).toBe(false)
  await act(() => result.current.onMetrics(GOOD))
  expect(result.current.ready).toBe(true)
  await act(() => result.current.onMetrics(DARK))
  expect(result.current).toMatchObject({ ready: true, hint: null })
  await act(() => result.current.onMetrics(DARK))
  expect(result.current).toMatchObject({ ready: false, hint: 'too_dark' })
  expect(result.current.latestMetrics()).toBe(DARK)
})

test('does not re-render when nothing visible changes', async () => {
  let renders = 0
  const { result } = await renderHook(() => {
    renders++
    return useQualityGate()
  })
  for (let i = 0; i < 4; i++) await act(() => result.current.onMetrics(GOOD))
  const before = renders
  for (let i = 0; i < 20; i++) await act(() => result.current.onMetrics(GOOD))
  // React may render once more before it notices the state is unchanged and
  // bails out. What matters is that 20 frames don't cause 20 renders.
  expect(renders - before).toBeLessThanOrEqual(1)
})

test('offers shoot anyway after the shutter stays locked', async () => {
  const { result } = await renderHook(() => useQualityGate({ shootAnywayAfterMs: 4000 }))
  await act(() => jest.advanceTimersByTime(3999))
  expect(result.current.canShootAnyway).toBe(false)
  await act(() => jest.advanceTimersByTime(1))
  expect(result.current.canShootAnyway).toBe(true)
})

test('warns about a likely wrong item only after a few frames in a row', async () => {
  const far = 'f0f0f0f0f0f0f0f0' // every bit differs from GOOD.dhash
  const { result } = await renderHook(() => useQualityGate({ claimHashes: [far] }))
  await act(() => result.current.onMetrics(GOOD))
  await act(() => result.current.onMetrics(GOOD))
  expect(result.current.mismatch).toBe(false)
  await act(() => result.current.onMetrics(GOOD))
  expect(result.current.mismatch).toBe(true)
})

test('no warning when the frame matches one of the claim hashes', async () => {
  const { result } = await renderHook(() => useQualityGate({ claimHashes: ['ffffffffffffffff', GOOD.dhash] }))
  for (let i = 0; i < 5; i++) await act(() => result.current.onMetrics(GOOD))
  expect(result.current.mismatch).toBe(false)
})
