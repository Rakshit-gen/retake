import { StyleSheet, View } from 'react-native'
import { Text } from './Text'
import { color, space } from './tokens'

export type Tone = 'good' | 'warn' | 'bad' | 'info'

const TONES: Record<Tone, { bg: string; fg: string }> = {
  good: { bg: color.goodBg, fg: color.good },
  warn: { bg: color.warnBg, fg: color.warn },
  bad: { bg: color.badBg, fg: color.bad },
  info: { bg: color.card, fg: color.ink },
}

/** One line of guidance. Announced by TalkBack when it changes. */
export function Banner({ tone, children, testID }: { tone: Tone; children: string; testID?: string }) {
  const t = TONES[tone]
  return (
    <View testID={testID} accessibilityLiveRegion="polite" style={[s.box, { backgroundColor: t.bg, borderLeftColor: t.fg }]}>
      <Text variant="label" style={{ color: t.fg }}>
        {children}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  box: { paddingVertical: space(3), paddingHorizontal: space(4), borderLeftWidth: 4, borderRadius: 4 },
})
