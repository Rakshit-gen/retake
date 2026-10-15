import { Text as RNText, type TextProps } from 'react-native'
import { color, MAX_FONT_SCALE, type } from './tokens'

export function Text({ variant = 'body', style, ...rest }: TextProps & { variant?: keyof typeof type }) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} style={[{ color: color.ink }, type[variant], style]} {...rest} />
}
