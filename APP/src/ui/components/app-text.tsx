import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';
import type { AppTheme } from '../theme/tokens';

type Variant = keyof AppTheme['typography'];

type Props = TextProps & {
  variant?: Variant;
  muted?: boolean;
  soft?: boolean;
  color?: string;
};

export function AppText({ variant = 'body', muted, soft, color, style, ...rest }: Props) {
  const { theme } = useTheme();
  const tone =
    color ??
    (muted ? theme.colors.muted : soft ? theme.colors.soft : theme.colors.ink);
  return <Text {...rest} style={[theme.typography[variant], { color: tone }, style as TextStyle]} />;
}
