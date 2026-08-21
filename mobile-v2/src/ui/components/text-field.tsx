import React, { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

export const TextField = forwardRef<TextInput, TextInputProps & { label?: string; error?: string; hint?: string }>(function TextField({ label, error, hint, style, ...props }, ref) {
  const { theme } = useTheme();
  return <View style={[styles.wrap, { gap: theme.spacing.xs }]}>{label ? <Text style={[theme.typography.label, { color: theme.colors.text }]}>{label}</Text> : null}<TextInput ref={ref} placeholderTextColor={theme.colors.textSubtle} accessibilityLabel={props.accessibilityLabel ?? label} {...props} style={[theme.typography.body, styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: error ? theme.colors.danger : theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.sm }, style]} />{error ? <Text style={[theme.typography.caption, { color: theme.colors.danger }]}>{error}</Text> : hint ? <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{hint}</Text> : null}</View>;
});
const styles = StyleSheet.create({ wrap: {}, input: { minHeight: 48, borderWidth: 1 } });
