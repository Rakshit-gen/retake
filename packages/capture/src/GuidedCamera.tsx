import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppState, Image, Pressable, StyleSheet, View } from 'react-native'
import { Camera, useCameraPermission, useFrameOutput, usePhotoOutput, type Frame } from 'react-native-vision-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createSynchronizable, scheduleOnRN } from 'react-native-worklets'
import { createFrameScorer } from '@retake/native'
import { TARGET_WIDTH, type FrameMetrics } from '@retake/quality'
import { Banner, Button, color, Screen, space, Text } from '@retake/ui'
import { AIMING, HINTS, MISMATCH, READY } from './hints'
import { savePhoto } from './savePhoto'
import { useQualityGate } from './useQualityGate'

export interface CapturedPhoto {
  /** file:// URI in the app's documents folder. */
  uri: string
  /** The last scored frame before the shutter fired. */
  metrics: FrameMetrics | null
  /** Taken while the gate was still locked. */
  override: boolean
}

export interface GuidedCameraProps {
  title: string
  onCapture: (p: CapturedPhoto) => void
  onCancel: () => void
  /** Shown faded over the preview so the rider can line the item up. */
  ghostUri?: string
  claimHashes?: string[]
  shootAnywayAfterMs?: number
  showTiming?: boolean
}

// About 10 scores a second is plenty for a hint a person reads, and leaves the
// camera thread idle most of the time. Android frame timestamps are in ns.
const MIN_GAP_NS = 100_000_000

const scorer = createFrameScorer()

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'))
    return () => sub.remove()
  }, [])
  return active
}

export function GuidedCamera({ title, onCapture, onCancel, ghostUri, claimHashes, shootAnywayAfterMs, showTiming }: GuidedCameraProps) {
  const permission = useCameraPermission()
  const gate = useQualityGate({ claimHashes, shootAnywayAfterMs })
  const appActive = useAppActive()
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastTs = useMemo(() => createSynchronizable(0), [])
  const { onMetrics } = gate

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet'
      try {
        const ts = frame.timestamp
        if (ts - lastTs.getDirty() < MIN_GAP_NS) return
        lastTs.setBlocking(ts)
        const m = scorer.score(frame, TARGET_WIDTH)
        if (m) scheduleOnRN(onMetrics, m)
      } finally {
        frame.dispose()
      }
    },
    [lastTs, onMetrics],
  )

  const frameOutput = useFrameOutput({ pixelFormat: 'yuv', onFrame })
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg', quality: 0.92 })

  const shoot = useCallback(
    async (override: boolean) => {
      setBusy(true)
      setError(null)
      try {
        const file = await photoOutput.capturePhotoToFile({}, {})
        const uri = await savePhoto(file.filePath)
        onCapture({ uri, metrics: gate.latestMetrics(), override })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not take the photo.')
      } finally {
        setBusy(false)
      }
    },
    [photoOutput, onCapture, gate],
  )

  if (!permission.hasPermission) {
    return (
      <Screen title={title} onBack={onCancel}>
        <Text>The camera is needed to photograph the item.</Text>
        {permission.canRequestPermission ? (
          <Button label="Allow camera" onPress={() => void permission.requestPermission()} />
        ) : (
          <Text variant="small">Camera access is turned off for this app. Turn it on in Android settings.</Text>
        )}
      </Screen>
    )
  }

  const tone = gate.ready ? 'good' : gate.hint ? 'bad' : 'info'
  const message = gate.ready ? READY : gate.hint ? HINTS[gate.hint] : AIMING

  return (
    <View style={s.root}>
      <Camera style={StyleSheet.absoluteFill} device="back" isActive={appActive} outputs={[frameOutput, photoOutput]} />
      {ghostUri ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Image testID="ghost" source={{ uri: ghostUri }} resizeMode="contain" style={[StyleSheet.absoluteFill, s.ghost]} />
        </View>
      ) : null}
      <View style={[s.top, { top: insets.top + space(2) }]}>
        <Button kind="plain" label="Cancel" onPress={onCancel} />
        {showTiming ? <Text style={s.timing}>{scorer.lastScoreMs.toFixed(1)} ms</Text> : null}
      </View>
      <View style={[s.bottom, { bottom: insets.bottom + space(4) }]}>
        <Banner tone={tone} testID="hint">
          {message}
        </Banner>
        {gate.mismatch ? (
          <Banner tone="warn" testID="mismatch">
            {MISMATCH}
          </Banner>
        ) : null}
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <View style={s.controls}>
          <Pressable
            testID="shutter"
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled: !gate.ready || busy }}
            disabled={!gate.ready || busy}
            onPress={() => void shoot(false)}
            style={[s.shutter, (!gate.ready || busy) && s.shutterOff]}
          />
          {!gate.ready && gate.canShootAnyway ? (
            <Button kind="plain" label="Shoot anyway" onPress={() => void shoot(true)} disabled={busy} testID="shoot-anyway" />
          ) : null}
        </View>
      </View>
    </View>
  )
}

const SHUTTER = 72

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  ghost: { opacity: 0.35 },
  top: { position: 'absolute', left: space(2), right: space(4), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timing: { color: '#fff' },
  bottom: { position: 'absolute', left: space(4), right: space(4), gap: space(3) },
  controls: { alignItems: 'center', gap: space(2), backgroundColor: color.paper, borderRadius: 8, paddingVertical: space(3) },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, backgroundColor: color.accent, borderWidth: 4, borderColor: color.card },
  shutterOff: { backgroundColor: color.line },
})
