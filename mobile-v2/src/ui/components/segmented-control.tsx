import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';

export function SegmentedControl<T extends string>({ value, options, onChange, label, compact = false, wrap = false }: { value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; label?: string; compact?: boolean; wrap?: boolean }) {
  const { theme } = useTheme();
  const scrollable = options.length > 3 && !wrap;
  const items = options.map((option) => { const active = option.value === value; return <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={label ? `${label}: ${option.label}` : option.label} accessibilityState={{ selected: active }} onPress={() => onChange(option.value)} style={[styles.item, { borderRadius: theme.radius.sm }, wrap && styles.wrapItem, scrollable && (compact ? styles.compactItem : styles.scrollItem), active && { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}><Text numberOfLines={1} style={[theme.typography.label, compact && styles.compactLabel, { color: active ? theme.colors.text : theme.colors.textMuted }]}>{option.label}</Text></Pressable>; });
  return <View accessibilityLabel={label} style={[styles.container, { backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.md, padding: 4, gap: 4 }, wrap && styles.wrapContainer]}>{scrollable ? <ScrollView style={styles.scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>{items}</ScrollView> : items}</View>;
}
const styles = StyleSheet.create({ container: { minHeight: 44, flexDirection: 'row' }, wrapContainer: { flexWrap: 'wrap', alignContent: 'stretch' }, item: { flex: 1, minHeight: 36, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }, scroll: { flex: 1 }, scrollContent: { flexDirection: 'row', gap: 4 }, scrollItem: { flex: 0, minWidth: 96 }, compactItem: { flex: 0, minWidth: 76, paddingHorizontal: 6 }, compactLabel: { fontSize: 13 }, wrapItem: { flexBasis: '31%', flexGrow: 1, flexShrink: 1, minWidth: 0 } });
