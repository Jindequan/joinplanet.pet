import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'

/** Background refresh feedback; the existing data stays visible and usable. */
export function QueryRefreshState({
  visible,
  label = '正在更新最新信息',
}: {
  visible: boolean
  label?: string
}) {
  const { theme } = useTheme()
  if (!visible) return null
  return (
    <View
      style={[styles.bar, { backgroundColor: theme.colors.sageSoft }]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size="small" color={theme.colors.forest2} />
      <AppText variant="caption" color={theme.colors.forest2}>{label}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})
