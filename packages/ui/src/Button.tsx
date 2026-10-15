import { ActivityIndicator, Pressable, StyleSheet } from 'react-native'
import { Text } from './Text'
import { color, space, TOUCH } from './tokens'

export interface ButtonProps {
  label: string
  onPress: () => void
  kind?: 'primary' | 'plain'
  disabled?: boolean
  busy?: boolean
  testID?: string
}

export function Button({ label, onPress, kind = 'primary', disabled, busy, testID }: ButtonProps) {
  const off = disabled || busy
  const primary = kind === 'primary'
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      android_ripple={{ color: primary ? '#ffffff33' : '#00000014' }}
      style={[s.base, primary ? s.primary : s.plain, off && s.off]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? color.accentInk : color.accent} />
      ) : (
        <Text variant="label" style={{ color: primary ? color.accentInk : color.accent }}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const s = StyleSheet.create({
  base: {
    minHeight: TOUCH,
    paddingHorizontal: space(5),
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: { backgroundColor: color.accent },
  plain: { backgroundColor: 'transparent' },
  off: { opacity: 0.45 },
})
