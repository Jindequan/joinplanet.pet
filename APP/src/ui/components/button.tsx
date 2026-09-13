import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';
import { PressableScale } from '../motion';
import { AppText } from './app-text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  busy?: boolean;
  variant?: Variant;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  busy = false,
  variant = 'primary',
  full,
  disabled,
  style,
  ...rest
}: Props) {
  const { theme } = useTheme();
  const isDisabled = disabled || busy;

  const bg =
    variant === 'primary'
      ? theme.colors.forest2
      : variant === 'danger'
        ? theme.colors.danger
        : variant === 'secondary'
          ? theme.colors.sageSoft
          : 'transparent';
  const fg =
    variant === 'primary' || variant === 'danger'
      ? theme.colors.onBrand
      : theme.colors.forest2;

  return (
    <PressableScale
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={rest.accessibilityLabel ?? label}
      accessibilityState={{
        ...rest.accessibilityState,
        disabled: isDisabled,
        ...(busy ? { busy: true } : {}),
      }}
      disabled={isDisabled}
      pressedScale={0.96}
      style={[
        styles.base,
        {
          backgroundColor: bg,
          borderRadius: theme.radius.md,
          minHeight: theme.layout.touchTarget + 4,
          alignSelf: full ? 'stretch' : 'auto',
          borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
          borderColor: theme.colors.line,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <AppText variant="label" color={fg}>
          {label}
        </AppText>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
