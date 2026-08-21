import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WarningCircleIcon } from '../icons';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';
import { Button } from './button';

export function StaleDataNotice({
  onRetry,
  retrying = false,
  message = 'Connection is unavailable. Showing the last saved view.',
}: {
  onRetry: () => void;
  retrying?: boolean;
  message?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, { backgroundColor: theme.colors.accentSurface, borderColor: theme.colors.border }]}
    >
      <WarningCircleIcon size={19} color={theme.colors.accentStrong} weight="duotone" />
      <AppText variant="caption" muted style={styles.message}>{message}</AppText>
      <Button label="Retry" variant="ghost" loading={retrying} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  message: { flex: 1 },
});
