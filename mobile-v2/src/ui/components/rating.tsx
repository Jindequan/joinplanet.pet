import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { StarIcon } from '../icons';
import { useTheme } from '../../core/providers/theme-provider';

export function Rating({ value, onChange, max = 5, size = 28, label = 'Rating' }: { value: number; onChange?: (value: number) => void; max?: number; size?: number; label?: string }) {
  const { theme } = useTheme();
  return <View accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max, now: value }} style={styles.row}>{Array.from({ length: max }, (_, index) => { const score = index + 1; return <Pressable key={score} accessibilityRole="button" accessibilityLabel={`${score} of ${max}`} disabled={!onChange} onPress={() => onChange?.(score)} hitSlop={6}><StarIcon size={size} color={score <= value ? theme.colors.warning : theme.colors.border} weight={score <= value ? 'fill' : 'regular'} /></Pressable>; })}</View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 6, alignItems: 'center' } });
