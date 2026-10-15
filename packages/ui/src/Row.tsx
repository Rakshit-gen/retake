import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { color, hairline, space, TOUCH } from './tokens'

export interface RowProps {
  title: string
  detail?: string
  right?: string
  onPress?: () => void
  selected?: boolean
  testID?: string
}

/** A list row. Tappable when it has onPress. */
export function Row({ title, detail, right, onPress, selected, testID }: RowProps) {
  return (
    <Pressable
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!selected } : undefined}
      android_ripple={{ color: '#00000010' }}
      style={[s.row, selected && s.selected]}
    >
      <View style={s.main}>
        <Text>{title}</Text>
        {detail ? (
          <Text variant="small" style={{ color: color.inkSoft }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right ? <Text variant="label">{right}</Text> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    minHeight: TOUCH + space(4),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  selected: { backgroundColor: color.goodBg },
  main: { flex: 1, gap: space(1) },
})
