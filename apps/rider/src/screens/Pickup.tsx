import { useEffect, useState } from 'react'
import { Image, StyleSheet } from 'react-native'
import { Banner, Button, color, Screen, space, Text } from '@retake/ui'
import type { ReturnDecision } from '@retake/rules'
import { useRider } from '../context'

/** After this long without an answer the rider may leave; the pickup goes to manual review. */
export const MOVE_ON_AFTER_MS = 15_000

function Outcome({ decision, onRetake, onDone }: { decision: ReturnDecision; onRetake: () => void; onDone: () => void }) {
  if (decision.action === 'accept') {
    return (
      <>
        <Banner tone="good">Item matches the claim. Collect it.</Banner>
        <Button label="Done" onPress={onDone} />
      </>
    )
  }
  if (decision.action === 'retry') {
    return (
      <>
        <Banner tone="warn">{decision.nudge}</Banner>
        <Text variant="small">
          {decision.attemptsLeft === 1 ? '1 try left before this goes to manual review.' : `${decision.attemptsLeft} tries left before this goes to manual review.`}
        </Text>
        <Button label="Take the photo again" onPress={onRetake} />
      </>
    )
  }
  return (
    <>
      <Banner tone="info">
        {decision.why === 'checker_unavailable'
          ? 'The photo check is not answering. Collect the item; a person will review this pickup.'
          : 'Could not confirm the item. Collect it; a person will review this pickup.'}
      </Banner>
      <Button label="Done" onPress={onDone} />
    </>
  )
}

export function PickupScreen({ baseUrl, onShoot }: { baseUrl: string; onShoot: () => void }) {
  const active = useRider((s) => s.active)
  const retake = useRider((s) => s.retake)
  const moveOn = useRider((s) => s.moveOn)
  const close = useRider((s) => s.close)
  const [now, setNow] = useState(Date.now())
  const sending = active?.phase.kind === 'sending'

  useEffect(() => {
    if (!sending) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sending])

  if (!active) return null
  const { pickup, phase } = active
  const claimPhoto = pickup.claimPhotos[0]

  return (
    <Screen title={pickup.itemName} onBack={close}>
      <Text variant="label">Customer's photo</Text>
      {claimPhoto ? <Image source={{ uri: `${baseUrl}/files/${claimPhoto}` }} style={s.photo} resizeMode="contain" accessibilityLabel="Customer's photo of the item" /> : null}

      {phase.kind === 'shoot' ? (
        <>
          <Text>Take the item out of any bag or packaging and photograph it from the same side as the customer's photo.</Text>
          <Button label="Photograph the item" onPress={onShoot} testID="shoot" />
        </>
      ) : null}

      {phase.kind === 'sending' ? (
        <>
          <Banner tone="info" testID="sending">
            Checking the photo…
          </Banner>
          {now - phase.since >= MOVE_ON_AFTER_MS ? (
            <>
              <Text variant="small">No answer yet. You can move on; this pickup will go to manual review.</Text>
              <Button kind="plain" label="Collect the item and move on" onPress={moveOn} testID="move-on" />
            </>
          ) : null}
        </>
      ) : null}

      {phase.kind === 'result' ? <Outcome decision={phase.result.decision} onRetake={() => { retake(); onShoot() }} onDone={close} /> : null}

      {phase.kind === 'closed' ? (
        <>
          <Banner tone="info">{phase.state === 'accepted' ? 'This pickup was already confirmed.' : 'This pickup is already with manual review.'}</Banner>
          <Button label="Done" onPress={close} />
        </>
      ) : null}

      {phase.kind === 'moved_on' ? (
        <>
          <Banner tone="info">Collect the item. The photo will still upload and a person will review this pickup.</Banner>
          <Button label="Done" onPress={close} />
        </>
      ) : null}

      {phase.kind === 'error' ? (
        <>
          <Banner tone="bad">{phase.message}</Banner>
          <Button label="Try again" onPress={() => { retake(); onShoot() }} />
        </>
      ) : null}
    </Screen>
  )
}

const s = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 6, backgroundColor: color.line, marginBottom: space(2) },
})
