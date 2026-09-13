import React from 'react'
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { useTheme } from '../../core/providers/theme-provider'

/** 与 FloatingTabBar 一致的毛玻璃底。 */
export const GLASS_BAR = {
  intensity: 48,
  tint: 'light' as const,
  backgroundColor: 'rgba(255,254,251,0.82)',
  borderRadius: 22,
} as const

const shellStyle = Platform.select({
  ios: { borderCurve: 'continuous' as const },
  default: {},
})

type Props = React.PropsWithChildren<{
  radius?: number
  style?: StyleProp<ViewStyle>
  shadow?: boolean
}>

export function GlassBar({ radius = GLASS_BAR.borderRadius, style, shadow = true, children }: Props) {
  const { theme } = useTheme()
  const android = Platform.OS === 'android'
  return (
    <BlurView
      intensity={android ? 32 : GLASS_BAR.intensity}
      tint={GLASS_BAR.tint}
      experimentalBlurMethod={android ? 'dimezisBlurView' : undefined}
      style={[
        styles.bar,
        shellStyle,
        shadow ? theme.shadow.floating : null,
        {
          borderRadius: radius,
          borderColor: theme.colors.line,
          backgroundColor: android ? 'rgba(255,254,251,0.94)' : GLASS_BAR.backgroundColor,
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  )
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
})
