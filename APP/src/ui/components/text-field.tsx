import React, { useState } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';

type Props = TextInputProps & {
  label: string;
  error?: string;
  trailing?: React.ReactNode;
  wrapperStyle?: StyleProp<ViewStyle>;
};

export function TextField({
  label,
  error,
  trailing,
  wrapperStyle,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  ...rest
}: Props) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.forest2
      : theme.colors.lineStrong;

  return (
    <View style={[styles.wrap, wrapperStyle]}>
      <AppText variant="caption" muted style={styles.label}>
        {label}
      </AppText>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={accessibilityHint ?? error}
          placeholderTextColor={theme.colors.soft}
          style={[
            styles.input,
            {
              borderColor,
              backgroundColor: theme.colors.paperStrong,
              borderRadius: theme.radius.md,
              color: theme.colors.ink,
            },
            focused && !error ? { borderWidth: 2 } : null,
            trailing ? styles.inputGrow : null,
            style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {trailing}
      </View>
      {error ? (
        <AppText variant="caption" color={theme.colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
  },
  inputGrow: {
    flex: 1,
    minWidth: 0,
  },
});
