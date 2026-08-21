import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

export function Card({ children, style, ...props }: ViewProps) {
  const { theme } = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md }, theme.shadow.card, style]}>{children}</View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1 } });
