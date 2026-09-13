import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { router } from 'expo-router'
import { ArrowLeft } from 'phosphor-react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { hapticLight, PressableScale } from '../motion'
import { AppText } from './app-text'
import { AppMenuButton } from '../navigation/app-menu-button'

type Props = {
  title: string
  subtitle?: string
  eyebrow?: string
  action?: React.ReactNode
  menu?: boolean
  /** Used when a page was opened directly and there is no navigation history. */
  fallbackHref?: string
  onBack?: () => void
  style?: StyleProp<ViewStyle>
}

export function BackHeader({
  title,
  subtitle,
  eyebrow,
  action,
  menu = true,
  fallbackHref = '/',
  onBack,
  style,
}: Props) {
  const { theme } = useTheme()

  function handleBack() {
    if (onBack) {
      onBack()
      return
    }
    if (router.canGoBack()) router.back()
    else router.replace(fallbackHref as never)
  }

  return (
    <View style={[styles.wrap, style]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="返回"
        hitSlop={8}
        pressedScale={0.92}
        onPress={() => {
          void hapticLight()
          handleBack()
        }}
        style={[
          styles.back,
          {
            width: theme.layout.touchTarget,
            height: theme.layout.touchTarget,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.sageSoft,
          },
        ]}
      >
        <ArrowLeft size={20} color={theme.colors.forest2} weight="bold" />
      </PressableScale>
      <View style={styles.copy}>
        {eyebrow ? (
          <AppText variant="eyebrow" soft numberOfLines={1}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="heading" numberOfLines={1} accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" muted numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.action}>
        {action}
        {menu ? <AppMenuButton /> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    marginBottom: 8,
  },
  back: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  action: {
    minWidth: 44,
    alignItems: 'flex-end',
  },
})
