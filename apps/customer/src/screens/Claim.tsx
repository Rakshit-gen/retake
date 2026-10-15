import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { MAX_CLAIM_PHOTOS, type ClaimCategory } from '@retake/rules'
import { Banner, Button, Choices, color, hairline, MAX_FONT_SCALE, Screen, space, Text, type } from '@retake/ui'
import { useAppDispatch, useAppSelector } from '../hooks'
import { claim } from '../store'

const CATEGORIES: { value: ClaimCategory; label: string }[] = [
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'bad_quality', label: 'Bad quality' },
  { value: 'packaging', label: 'Packaging' },
]

const PROBLEMS: Record<string, string> = {
  pick_item: 'Pick the item.',
  pick_category: 'Pick what went wrong.',
  add_photo: 'Add at least one photo.',
  too_many_photos: `Up to ${MAX_CLAIM_PHOTOS} photos.`,
  retake_photo: 'One of the photos is too dark or blurry. Retake it.',
  unreadable_photo: 'A photo could not be read. Retake it.',
}

export function ClaimScreen({ onAddPhoto, onDone }: { onAddPhoto: () => void; onDone: () => void }) {
  const dispatch = useAppDispatch()
  const { draft, problems, submit } = useAppSelector((s) => s.claim)
  const item = useAppSelector((s) => {
    const o = s.orders.list.find((x) => x.id === draft?.orderId)
    return o?.items.find((x) => x.id === draft?.itemId)
  })
  const close = () => {
    dispatch(claim.actions.closed())
    onDone()
  }

  if (submit.state === 'filed') {
    return (
      <Screen title="Claim filed" footer={<Button label="Done" onPress={close} />}>
        <Banner tone="good">We got your claim. A delivery partner will pick the item up.</Banner>
        {submit.message ? <Text>{submit.message}</Text> : null}
        <Text variant="small" style={{ color: color.inkSoft }}>
          Reference {submit.claimId}
        </Text>
      </Screen>
    )
  }

  if (!draft) return null
  const sending = submit.state === 'queued' || submit.state === 'running' || submit.state === 'retrying'
  const status =
    submit.state === 'queued'
      ? 'Waiting for a connection to upload.'
      : submit.state === 'running'
        ? 'Uploading…'
        : submit.state === 'retrying'
          ? 'Connection dropped. Retrying on its own.'
          : null

  return (
    <Screen
      title="Report a problem"
      onBack={close}
      footer={
        <>
          {status ? <Banner tone="info" testID="status">{status}</Banner> : null}
          {submit.state === 'failed' && submit.message ? <Banner tone="bad">{submit.message}</Banner> : null}
          <Button label="Submit claim" busy={sending} onPress={() => dispatch(claim.actions.submitRequested())} testID="submit" />
        </>
      }
    >
      <Text variant="title">{item?.name ?? draft.itemId}</Text>
      <Text variant="label">What went wrong?</Text>
      <Choices options={CATEGORIES} value={draft.category} onChange={(c) => dispatch(claim.actions.categoryPicked(c))} />
      <Text variant="label">
        Photos ({draft.photos.length}/{MAX_CLAIM_PHOTOS})
      </Text>
      <View style={s.photos}>
        {draft.photos.map((p, i) => (
          <View key={p.uri} style={s.thumbWrap}>
            <Image source={{ uri: p.uri }} style={s.thumb} accessibilityLabel={`Photo ${i + 1}`} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} onPress={() => dispatch(claim.actions.photoRemoved(i))} hitSlop={8}>
              <Text variant="small" style={{ color: color.bad }}>
                Remove
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
      {draft.photos.length < MAX_CLAIM_PHOTOS ? <Button kind="plain" label="Add a photo" onPress={onAddPhoto} testID="add-photo" /> : null}
      <Text variant="label">Anything else? (optional)</Text>
      <TextInput
        value={draft.note}
        onChangeText={(t) => dispatch(claim.actions.noteChanged(t))}
        multiline
        maxLength={500}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        placeholder="e.g. got Bhujia instead of Atta"
        placeholderTextColor={color.inkSoft}
        style={s.note}
        accessibilityLabel="Note"
      />
      {problems.map((p) => (
        <Banner key={p} tone="bad">
          {PROBLEMS[p] ?? 'Something went wrong. Try again.'}
        </Banner>
      ))}
    </Screen>
  )
}

const THUMB = 96

const s = StyleSheet.create({
  photos: { flexDirection: 'row', gap: space(3), flexWrap: 'wrap' },
  thumbWrap: { alignItems: 'center', gap: space(1) },
  thumb: { width: THUMB, height: THUMB, borderRadius: 6, backgroundColor: color.line },
  note: {
    ...type.body,
    minHeight: 88,
    textAlignVertical: 'top',
    padding: space(3),
    borderWidth: hairline,
    borderColor: color.ink,
    borderRadius: 6,
    backgroundColor: color.card,
    color: color.ink,
  },
})
