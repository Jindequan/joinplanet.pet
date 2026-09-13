import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { PawPrint } from 'phosphor-react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'
import { FadeInView } from '../motion'

type Props = {
  title: string
  description: string
  action?: React.ReactNode
  style?: StyleProp<ViewStyle>
}

export function EmptyState({ title, description, action, style }: Props) {
  const { theme } = useTheme()
  return (
    <FadeInView>
    <View style={[styles.wrap, { gap: theme.spacing.md }, style]}>
      <View
        style={[
        styles.symbol,
        {
          backgroundColor: theme.colors.sageSoft,
          borderRadius: theme.radius.lg,
          borderColor: theme.colors.line,
        },
      ]}
    >
        <PawPrint size={28} color={theme.colors.forest2} weight="duotone" />
      </View>
      <AppText variant="heading" style={styles.title} accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="body" muted style={styles.description}>
        {description}
      </AppText>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
    </FadeInView>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  symbol: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    marginTop: 8,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
})
