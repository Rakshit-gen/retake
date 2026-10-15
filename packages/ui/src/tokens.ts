import { PixelRatio, StyleSheet } from 'react-native'

// Warm paper and ink rather than white and grey: the apps are used outdoors
// and at doorsteps, so contrast matters more than looking airy.
export const color = {
  paper: '#F4F1EA',
  card: '#FFFDF8',
  ink: '#1B1A17',
  inkSoft: '#57534B',
  line: '#D9D3C6',
  accent: '#1F5C45',
  accentInk: '#FFFFFF',
  warn: '#8A5300',
  warnBg: '#FBEBD0',
  bad: '#A3261B',
  badBg: '#F7DEDA',
  good: '#1F5C45',
  goodBg: '#DCEDE3',
} as const

/** dp on a 4 step. */
export const space = (n: number) => n * 4

// System font (Roboto on Android). Sizes in dp; Text caps font scaling so a
// large accessibility setting grows text without breaking the layout.
export const type = {
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
}

export const MAX_FONT_SCALE = 1.4

/** Android's minimum touch target. */
export const TOUCH = 48

/** One physical pixel, whatever the screen density. */
export const hairline = StyleSheet.hairlineWidth

/** Snap a dp value to the nearest physical pixel, for borders and thin bars. */
export const px = (dp: number) => PixelRatio.roundToNearestPixel(dp)
