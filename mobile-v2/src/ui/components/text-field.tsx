import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

export const TextField = forwardRef<TextInput, TextInputProps & { label?: string; error?: string; hint?: string }>(function TextField({ label, error, hint, style, onFocus, onBlur, ...props }, ref) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={[styles.wrap, { gap: theme.spacing.xs }]}>{label ? <Text style={[theme.typography.label, { color: theme.colors.text }]}>{label}</Text> : null}<TextInput ref={ref} placeholderTextColor={theme.colors.textSubtle} selectionColor={theme.colors.brandStrong} accessibilityLabel={props.accessibilityLabel ?? label} accessibilityHint={props.accessibilityHint ?? (hint || undefined)} {...props} onFocus={(event) => { setFocused(true); onFocus?.(event); }} onBlur={(event) => { setFocused(false); onBlur?.(event); }} style={[theme.typography.body, styles.input, props.multiline && styles.multiline, { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: error ? theme.colors.danger : focused ? theme.colors.brandStrong : theme.colors.border, borderWidth: focused || error ? 1.5 : 1, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.sm }, style]} />{error ? <Text accessibilityLiveRegion="polite" style={[theme.typography.caption, { color: theme.colors.danger }]}>{error}</Text> : hint ? <Text accessibilityLiveRegion="polite" style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{hint}</Text> : null}</View>;
});
const styles = StyleSheet.create({ wrap: {}, input: { minHeight: 48, borderWidth: 1 }, multiline: { minHeight: 96, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' } });
