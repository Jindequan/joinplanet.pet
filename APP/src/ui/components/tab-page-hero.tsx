import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';
import { AppMenuButton } from '../navigation/app-menu-button';

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  menu?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Unified header for the five main tabs.
 * Answers "where am I" (eyebrow) + primary question (title) + live status (subtitle).
 */
export function TabPageHero({ eyebrow, title, subtitle, trailing, menu = false, style }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { gap: theme.spacing.xs }, style]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          {eyebrow ? (
            <AppText variant="eyebrow" soft>
              {eyebrow}
            </AppText>
          ) : null}
          <AppText variant="display" accessibilityRole="header">
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" muted numberOfLines={2}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {trailing || menu ? (
          <View style={styles.trailing}>
            {trailing}
            {menu ? <AppMenuButton /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  trailing: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 0,
    alignItems: 'flex-end',
  },
});
