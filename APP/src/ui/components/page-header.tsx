import React from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../../core/providers/theme-provider'
import { AppText } from './app-text'

type Props = {
  eyebrow?: string
  title?: string
  description?: string
  action?: React.ReactNode
  style?: StyleProp<ViewStyle>
}

export function PageHeader({ eyebrow, title, description, action, style }: Props) {
  const { theme } = useTheme()
  return (
    <View style={[styles.wrap, { gap: theme.spacing.xs }, style]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          {eyebrow ? (
            <AppText variant="eyebrow" muted>
              {eyebrow}
            </AppText>
          ) : null}
          {title ? (
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
          ) : null}
          {description ? (
            <AppText variant="body" muted style={styles.description}>
              {description}
            </AppText>
          ) : null}
        </View>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  description: {
    marginTop: 2,
  },
  action: {
    paddingTop: 4,
  },
})
