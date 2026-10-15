import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { color, hairline, space, TOUCH } from './tokens'

export interface Choice<T extends string> {
  value: T
  label: string
}

/** Single choice from a short list, laid out as wrapping pills. */
export function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Choice<T>[]
  value: T | null
  onChange: (v: T) => void
}) {
  return (
    <View accessibilityRole="radiogroup" style={s.wrap}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={[s.pill, on && s.on]}
          >
            <Text variant="label" style={{ color: on ? color.accentInk : color.ink }}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  pill: {
    minHeight: TOUCH,
    justifyContent: 'center',
    paddingHorizontal: space(4),
    borderRadius: TOUCH / 2,
    borderWidth: hairline,
    borderColor: color.ink,
    backgroundColor: color.card,
  },
  on: { backgroundColor: color.ink },
})
