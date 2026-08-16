/**
 * Header for pushed stack screens (root stack runs with headerShown:false):
 * back chevron + inline title. Multi-step screens pass onBack to step back
 * inside their flow before leaving the screen.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing, typography } from '../../theme';
import { IconButton } from '../ui';

export function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={styles.row}>
      <IconButton icon={ChevronLeft} label="Back" onPress={onBack ?? router.back} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s8,
    paddingVertical: spacing.s8,
  },
  title: { ...typography.section, color: colors.text, flex: 1 },
});
