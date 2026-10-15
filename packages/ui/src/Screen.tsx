import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text } from './Text'
import { color, hairline, space, TOUCH } from './tokens'

export interface ScreenProps {
  title: string
  onBack?: () => void
  children: ReactNode
  /** Pinned under the content, above the gesture bar. */
  footer?: ReactNode
  scroll?: boolean
}

export function Screen({ title, onBack, children, footer, scroll = true }: ScreenProps) {
  const Body = scroll ? ScrollView : View
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.bar}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8} style={s.back}>
            <Text variant="title">‹</Text>
          </Pressable>
        ) : null}
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={s.title}>
          {title}
        </Text>
      </View>
      <Body style={s.body} {...(scroll ? { contentContainerStyle: s.content } : {})}>
        {children}
      </Body>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  bar: {
    minHeight: TOUCH + space(2),
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(2),
    borderBottomWidth: hairline,
    borderBottomColor: color.line,
  },
  back: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, paddingHorizontal: space(2) },
  body: { flex: 1 },
  content: { padding: space(4), gap: space(4) },
  footer: { padding: space(4), gap: space(2), borderTopWidth: hairline, borderTopColor: color.line, backgroundColor: color.paper },
})
