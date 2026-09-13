import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CaretRight } from 'phosphor-react-native';
import { useTheme } from '../../core/providers/theme-provider';
import { hapticLight, PressableScale } from '../motion';
import { AppText } from './app-text';

export function MoreGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="eyebrow" soft style={styles.groupLabel}>
        {label}
      </AppText>
      <View
        style={[
          styles.card,
          theme.shadow.card,
          {
            backgroundColor: theme.colors.paperStrong,
            borderColor: theme.colors.line,
            borderRadius: theme.radius.xl,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

type RowProps = {
  icon: React.ReactNode;
  title: string;
  sub: string;
  href?: string;
  onPress?: () => void;
  right?: React.ReactNode;
};

export function MoreRow({ icon, title, sub, href, onPress, right }: RowProps) {
  const { theme } = useTheme();
  const interactive = Boolean(href || onPress);

  const body = (
    <>
      <View style={[styles.icon, { backgroundColor: theme.colors.sageSoft }]}>{icon}</View>
      <View style={styles.copy}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" muted numberOfLines={2}>
          {sub}
        </AppText>
      </View>
      {right ??
        (interactive ? (
          <CaretRight size={17} color={theme.colors.soft} weight="bold" />
        ) : null)}
    </>
  );

  if (!interactive) {
    return <View style={styles.row}>{body}</View>;
  }

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}：${sub}`}
      pressedScale={0.98}
      onPress={() => {
        void hapticLight();
        if (onPress) onPress();
        else if (href) router.push(href as never);
      }}
      style={[
        styles.row,
        {
          backgroundColor: 'transparent',
        },
      ]}
    >
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  groupLabel: { marginLeft: 2 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 15,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 2 },
});
