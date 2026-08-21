import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
export function AppText({ variant = 'body', muted = false, children, style, ...props }: TextProps & { variant?: Variant; muted?: boolean }) {
  const { theme } = useTheme();
  return <Text {...props} style={[theme.typography[variant], { color: muted ? theme.colors.textMuted : theme.colors.text }, style]}>{children}</Text>;
}
