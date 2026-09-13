import React from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'

export function LoadingState({ label, compact }: { label?: string; compact?: boolean }) {
  const { theme } = useTheme()
  return (
    <View
      style={[styles.wrap, compact ? styles.compact : null]}
      accessibilityLabel={label ?? '加载中'}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator color={theme.colors.forest2} />
      {label ? (
        <AppText variant="caption" muted>
          {label}
        </AppText>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  compact: {
    paddingVertical: 16,
  },
})
