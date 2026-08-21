import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CaretRightIcon } from '../icons';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';

export function SectionRow({ icon: Icon, title, description, onPress, accent = 'brand', last = false }: { icon: React.ComponentType<any>; title: string; description: string; onPress?: () => void; accent?: 'brand' | 'accent' | 'neutral'; last?: boolean }) {
  const { theme } = useTheme();
  const iconColor = accent === 'accent' ? theme.colors.accent : accent === 'neutral' ? theme.colors.textMuted : theme.colors.brandStrong;
  const content = <><View style={[styles.iconBox, { backgroundColor: accent === 'accent' ? theme.colors.accentSurface : theme.colors.iconSurface }]}><Icon size={21} color={iconColor} weight="regular" /></View><View style={styles.copy}><AppText variant="heading">{title}</AppText><AppText variant="caption" muted>{description}</AppText></View>{onPress ? <CaretRightIcon size={20} color={theme.colors.textSubtle} weight="regular" /> : null}</>;
  const rowStyle = [styles.row, !last && { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }];
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [rowStyle, pressed && styles.pressed]}>{content}</Pressable>;
}

const styles = StyleSheet.create({ row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12 }, iconBox: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 2 }, pressed: { opacity: 0.64 } });
