import { act, render, screen, userEvent } from '@testing-library/react-native'
import { DARK, GOOD } from './fixtures'
import { GuidedCamera } from './GuidedCamera'

const mockScore = jest.fn()
const mockCapture = jest.fn()
const mockPermission = { hasPermission: true, canRequestPermission: true, requestPermission: jest.fn() }
let mockOnFrame: ((f: unknown) => void) | undefined

jest.mock('@retake/native', () => ({ createFrameScorer: () => ({ score: (...a: unknown[]) => mockScore(...a), lastScoreMs: 1.5 }) }))
jest.mock('react-native-vision-camera', () => {
  const { View } = require('react-native')
  return {
    Camera: (p: object) => <View testID="camera" {...p} />,
    useCameraPermission: () => mockPermission,
    useFrameOutput: (o: { onFrame: (f: unknown) => void }) => {
      mockOnFrame = o.onFrame
      return { kind: 'frame' }
    },
    usePhotoOutput: () => ({ capturePhotoToFile: (...a: unknown[]) => mockCapture(...a) }),
  }
})
jest.mock('react-native-worklets', () => ({
  createSynchronizable: (v: number) => {
    let x = v
    return { getDirty: () => x, setBlocking: (n: number) => (x = n) }
  },
  scheduleOnRN: (fn: (...a: unknown[]) => void, ...a: unknown[]) => fn(...a),
}))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
jest.mock('./savePhoto', () => ({ savePhoto: async () => 'file:///docs/photos/1.jpg' }))

let ts = 0
function frame() {
  ts += 100_000_000
  return { timestamp: ts, dispose: jest.fn() }
}

async function feed(m: object, n: number) {
  await act(() => {
    for (let i = 0; i < n; i++) {
      mockScore.mockReturnValueOnce(m)
      mockOnFrame!(frame())
    }
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockScore.mockReset()
  mockPermission.hasPermission = true
  mockCapture.mockResolvedValue({ filePath: '/data/cache/x.jpg' })
})

test('the shutter unlocks once frames are good and the photo carries its metrics', async () => {
  const onCapture = jest.fn()
  await render(<GuidedCamera title="Photo" onCapture={onCapture} onCancel={() => {}} />)
  expect(screen.getByTestId('shutter')).toBeDisabled()
  await feed(GOOD, 4)
  expect(screen.getByTestId('shutter')).toBeEnabled()
  expect(screen.getByText('Looks good. Take the photo.')).toBeOnTheScreen()
  await userEvent.setup().press(screen.getByTestId('shutter'))
  expect(onCapture).toHaveBeenCalledWith({ uri: 'file:///docs/photos/1.jpg', metrics: GOOD, override: false })
})

test('says what is wrong with the frame', async () => {
  await render(<GuidedCamera title="Photo" onCapture={() => {}} onCancel={() => {}} />)
  await feed(DARK, 2)
  expect(screen.getByText('Too dark. Move to better light.')).toBeOnTheScreen()
})

test('every frame is disposed, and frames closer than 100 ms are skipped', async () => {
  await render(<GuidedCamera title="Photo" onCapture={() => {}} onCancel={() => {}} />)
  const a = frame()
  const b = { timestamp: a.timestamp + 30_000_000, dispose: jest.fn() }
  mockScore.mockReturnValue(GOOD)
  await act(() => {
    mockOnFrame!(a)
    mockOnFrame!(b)
  })
  expect(mockScore).toHaveBeenCalledTimes(1)
  expect(a.dispose).toHaveBeenCalled()
  expect(b.dispose).toHaveBeenCalled()
})

test('a frame the scorer rejects still gets disposed when score throws', async () => {
  await render(<GuidedCamera title="Photo" onCapture={() => {}} onCancel={() => {}} />)
  const f = frame()
  mockScore.mockImplementationOnce(() => {
    throw new Error('not yuv')
  })
  expect(() => mockOnFrame!(f)).toThrow('not yuv')
  expect(f.dispose).toHaveBeenCalled()
})

test('shoot anyway marks the photo as an override', async () => {
  jest.useFakeTimers()
  const onCapture = jest.fn()
  await render(<GuidedCamera title="Photo" onCapture={onCapture} onCancel={() => {}} shootAnywayAfterMs={1000} />)
  expect(screen.queryByTestId('shoot-anyway')).toBeNull()
  await act(() => jest.advanceTimersByTime(1000))
  jest.useRealTimers()
  await userEvent.setup().press(screen.getByTestId('shoot-anyway'))
  expect(onCapture).toHaveBeenCalledWith(expect.objectContaining({ override: true, metrics: null }))
})

test('shows the customer photo as a ghost and warns on a likely wrong item', async () => {
  await render(
    <GuidedCamera title="Pickup" onCapture={() => {}} onCancel={() => {}} ghostUri="http://x/files/a.jpg" claimHashes={['f0f0f0f0f0f0f0f0']} />,
  )
  expect(screen.getByTestId('ghost')).toBeOnTheScreen()
  await feed(GOOD, 3)
  expect(screen.getByTestId('mismatch')).toBeOnTheScreen()
})

test('asks for the camera permission when it is missing', async () => {
  mockPermission.hasPermission = false
  await render(<GuidedCamera title="Photo" onCapture={() => {}} onCancel={() => {}} />)
  await userEvent.setup().press(screen.getByRole('button', { name: 'Allow camera' }))
  expect(mockPermission.requestPermission).toHaveBeenCalled()
  expect(screen.queryByTestId('camera')).toBeNull()
})

test('a failed capture shows an error and lets the user try again', async () => {
  mockCapture.mockRejectedValueOnce(new Error('Camera is closed'))
  const onCapture = jest.fn()
  await render(<GuidedCamera title="Photo" onCapture={onCapture} onCancel={() => {}} />)
  await feed(GOOD, 4)
  await userEvent.setup().press(screen.getByTestId('shutter'))
  expect(screen.getByText('Camera is closed')).toBeOnTheScreen()
  expect(onCapture).not.toHaveBeenCalled()
  expect(screen.getByTestId('shutter')).toBeEnabled()
})
