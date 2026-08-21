import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ label, variant = 'primary', loading = false, disabled, icon, style, ...props }: PressableProps & { label: string; variant?: ButtonVariant; loading?: boolean; icon?: React.ReactNode }) {
  const { theme } = useTheme();
  const palette = { primary: { bg: theme.colors.brandStrong, fg: theme.colors.onBrand, border: theme.colors.brandStrong }, secondary: { bg: theme.colors.surface, fg: theme.colors.brandStrong, border: theme.colors.border }, ghost: { bg: 'transparent', fg: theme.colors.brandStrong, border: 'transparent' }, danger: { bg: theme.colors.danger, fg: theme.colors.onDanger, border: theme.colors.danger } }[variant];
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} {...props} style={({ pressed }) => [styles.button, { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? theme.motion.disabledOpacity : pressed ? theme.motion.pressOpacity : 1 }, typeof style === 'function' ? style({ pressed }) : style]}>{loading ? <ActivityIndicator color={palette.fg} /> : <>{icon}<Text style={[theme.typography.label, styles.label, { color: palette.fg }]}>{label}</Text></>}</Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, label: { textAlign: 'center' } });
