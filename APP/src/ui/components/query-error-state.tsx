import React from 'react'
import { StyleSheet, View } from 'react-native'
import { errorMessage } from '../../core/api/errors'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'
import { Button } from './button'
import { Card } from './card'

export function QueryErrorState({
  error,
  message,
  onRetry,
  embedded,
}: {
  error?: unknown
  message?: string
  onRetry?: () => void
  /** 嵌在已有 Card 内时不再套一层卡片。 */
  embedded?: boolean
}) {
  const { theme } = useTheme()
  const body = (
    <View style={styles.body}>
      <AppText accessibilityRole="alert" color={theme.colors.danger}>{message ?? errorMessage(error)}</AppText>
      {onRetry ? <Button label="重试" onPress={onRetry} /> : null}
    </View>
  )
  if (embedded) return body
  return <Card style={styles.card}>{body}</Card>
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  body: { gap: 12 },
})
