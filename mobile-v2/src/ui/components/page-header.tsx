import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRightIcon } from '../icons';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';

export function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  const { theme } = useTheme();
  return <View style={[styles.wrap, { gap: theme.spacing.sm }]}><Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} hitSlop={10} style={[styles.back, { width: theme.layout.touchTarget, height: theme.layout.touchTarget, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><ArrowRightIcon size={18} color={theme.colors.text} mirrored /></Pressable><View style={styles.copy}><AppText variant="caption" muted>{eyebrow}</AppText><AppText variant="title">{title}</AppText></View></View>;
}
const styles = StyleSheet.create({ wrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 }, back: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, copy: { gap: 2 } });
