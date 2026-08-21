import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

export function SegmentedControl<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; label?: string }) {
  const { theme } = useTheme();
  const scrollable = options.length > 3;
  const items = options.map((option) => { const active = option.value === value; return <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => onChange(option.value)} style={[styles.item, { borderRadius: theme.radius.sm }, scrollable && styles.scrollItem, active && { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}><Text numberOfLines={1} style={[theme.typography.label, { color: active ? theme.colors.text : theme.colors.textMuted }]}>{option.label}</Text></Pressable>; });
  return <View accessibilityLabel={label} style={[styles.container, { backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.md, padding: 4, gap: 4 }]}>{scrollable ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>{items}</ScrollView> : items}</View>;
}
const styles = StyleSheet.create({ container: { minHeight: 44, flexDirection: 'row' }, item: { flex: 1, minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, scrollContent: { flexDirection: 'row', gap: 4 }, scrollItem: { flex: 0, minWidth: 86 } });
