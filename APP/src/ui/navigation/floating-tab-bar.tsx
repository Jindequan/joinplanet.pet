import React from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Bell, ClockCounterClockwise, DotsThree, PawPrint, Sun } from 'phosphor-react-native';
import { planetApi } from '../../core/api/planet-api';
import { queryKeys } from '../../core/query/keys';
import { useSession } from '../../core/providers/session-provider';
import { useScope } from '../../core/providers/scope-provider';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from '../components/app-text';
import { GlassBar } from '../components/glass-bar';
import { hapticSelection } from '../motion';

const ICONS = {
  index: Sun,
  requests: Bell,
  timeline: ClockCounterClockwise,
  pets: PawPrint,
  more: DotsThree,
} as const;

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const { status, userId } = useSession();
  const { setScope } = useScope();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const requestInbox = useQuery({
    queryKey: queryKeys.careRequestInbox,
    queryFn: () => planetApi.careRequests.inbox(),
    enabled: status === 'authenticated' && Boolean(userId),
  });
  const batchInbox = useQuery({
    queryKey: queryKeys.careHandoffInbox,
    queryFn: () => planetApi.careHandoffBatches.inbox(),
    enabled: status === 'authenticated' && Boolean(userId),
  });
  const pendingRequestIds = new Set<string>();
  for (const request of requestInbox.data?.care_requests ?? []) {
    if (request.state === 'sent' || request.state === 'seen') pendingRequestIds.add(request.id);
  }
  for (const batch of batchInbox.data?.batches ?? []) {
    for (const request of batch.requests) {
      if (request.state === 'sent' || request.state === 'seen') pendingRequestIds.add(request.id);
    }
  }
  const pendingRequestCount = pendingRequestIds.size;

  // Keep all hooks above the responsive return. The web shell can cross the
  // 960px breakpoint after a resize or browser-panel change; conditionally
  // mounting these queries used to change the Hook order and crash the whole
  // page with "Rendered more hooks than during the previous render".
  if (Platform.OS === 'web' && width >= 960) return null;

  return (
    <View
      style={[styles.host, { paddingBottom: Math.max(insets.bottom, 10) }, styles.pointerEventsNone]}
    >
      <GlassBar style={styles.bar}>
        {state.routes.map((route, index) => {
          const options = descriptors[route.key]?.options ?? {};
          if (route.name === 'family') return null;
          const focused = state.index === index;
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name;
          const Icon = ICONS[route.name as keyof typeof ICONS] ?? DotsThree;
          const hasRequestBadge = route.name === 'requests' && pendingRequestCount > 0;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={`${label}${hasRequestBadge ? `，${pendingRequestCount} 条待回应` : ''}`}
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  void hapticSelection();
                  if (route.name === 'requests') setScope({ type: 'all' });
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={[
                styles.item,
                focused && {
                  backgroundColor: theme.colors.forest2,
                  borderRadius: theme.radius.pill,
                },
              ]}
            >
              <Icon
                size={21}
                weight={focused ? 'fill' : 'regular'}
                color={focused ? theme.colors.onBrand : theme.colors.forest2}
              />
              <AppText
                variant="caption"
                color={focused ? theme.colors.onBrand : theme.colors.forest2}
                style={styles.label}
              >
                {label}
              </AppText>
              {hasRequestBadge ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={[styles.badge, { backgroundColor: theme.colors.coralDark }]}
                >
                  <AppText variant="caption" color={theme.colors.onBrand} style={styles.badgeLabel}>
                    {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </GlassBar>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
  },
  pointerEventsNone: {
    pointerEvents: 'box-none',
  },
  bar: {
    flexDirection: 'row',
    gap: 6,
    padding: 7,
    borderRadius: 24,
  },
  item: {
    flex: 1,
    position: 'relative',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 6,
  },
  label: { fontWeight: '800' },
  badge: {
    position: 'absolute',
    top: 4,
    right: '22%',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: { fontSize: 10, lineHeight: 12, fontWeight: '900' },
});
