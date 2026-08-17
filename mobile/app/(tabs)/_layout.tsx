/**
 * Tabs shell (spec §11 App Shell) with the persistent AppHeader at the top of
 * the content area, a custom Floating Tab Bar (spec §12: height 64 / radius 26 /
 * safe-area+8 / white + floating shadow) and the central 52×52 Brand500 ＋
 * raised 5px, opening the Quick Record sheet (spec §35). On web the whole
 * shell is capped at maxWidth 720 and centered (tab bar included).
 */
import React, { useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { CalendarDays, Dog, Plus, Sunrise, type LucideIcon } from 'lucide-react-native';
import {
  SafeAreaProvider,
  useSafeAreaFrame,
  useSafeAreaInsets,
  type Metrics,
} from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, touchTarget, typography } from '../../src/theme';
import { AppHeader } from '../../src/components/app-header';
import { QuickRecordScrollable } from '../../src/components/quick-record';
import { haptics } from '../../src/lib/haptics';

const BAR_HEIGHT = 64;
const FAB_SIZE = 52;
const FAB_PROTRUSION = 5; // ＋ sits 4–6px above the bar (spec §12)

const TAB_META: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Today', icon: Sunrise },
  timeline: { label: 'Timeline', icon: CalendarDays },
  pet: { label: 'Pet', icon: Dog },
};

function FloatingTabBar({ state, navigation, onPlus }: BottomTabBarProps & { onPlus: () => void }) {
  const insets = useSafeAreaInsets();

  const tabPill = (routeKey: string, name: string, edge: 'left' | 'right') => {
    const meta = TAB_META[name] ?? { label: name, icon: Plus as LucideIcon };
    const isFocused = state.routes[state.index]?.name === name;
    const Icon = meta.icon;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(name);
      }
    };

    return (
      <Pressable
        key={routeKey}
        accessibilityRole="tab"
        accessibilityLabel={meta.label}
        accessibilityState={{ selected: isFocused }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tabPill,
          edge === 'left' ? styles.tabPillLeft : styles.tabPillRight,
          isFocused && styles.tabPillActive,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Icon size={20} color={isFocused ? colors.text : colors.inactive} />
        {isFocused ? <Text style={styles.tabLabel}>{meta.label}</Text> : null}
      </Pressable>
    );
  };

  const today = state.routes[0];
  const timeline = state.routes[1];
  const pet = state.routes[2];

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.barOverlay]}>
      <View
        pointerEvents="box-none"
        style={{
          paddingBottom: insets.bottom + spacing.s8,
          paddingHorizontal: spacing.s16,
        }}
      >
        <View style={styles.bar}>
          {today ? tabPill(today.key, today.name, 'left') : null}
          {timeline ? tabPill(timeline.key, timeline.name, 'left') : null}
          <View style={styles.fabSlot} />
          {pet ? tabPill(pet.key, pet.name, 'right') : null}

          {/* Central floating ＋ — Brand500, raised above the bar */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quick record"
            onPress={() => {
              haptics.light();
              onPlus();
            }}
            style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
          >
            <Plus size={26} color={colors.onDark} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const sheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const frame = useSafeAreaFrame();

  // AppHeader above the navigator already consumes the top inset, so the
  // screens below must read 0 there — otherwise their own SafeAreaView
  // (edges: top) pads it twice. The nested provider re-publishes the insets
  // for everything inside the tabs (tab bar still gets the real bottom).
  const screenMetrics = useMemo<Metrics>(
    () => ({ frame, insets: { ...insets, top: 0 } }),
    [frame, insets],
  );

  return (
    <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}>
      <AppHeader />
      <SafeAreaProvider initialMetrics={screenMetrics}>
        <Tabs
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.bg },
          }}
          tabBar={(props) => (
            <FloatingTabBar {...props} onPlus={() => sheetRef.current?.present()} />
          )}
        >
          <Tabs.Screen name="index" options={{ title: 'Today' }} />
          <Tabs.Screen name="timeline" options={{ title: 'Timeline' }} />
          <Tabs.Screen name="pet" options={{ title: 'Pet' }} />
        </Tabs>
      </SafeAreaProvider>

      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <QuickRecordScrollable onClose={() => sheetRef.current?.close()} />
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  /** Web only (react-native-web): cap the whole shell at 720, centered. */
  containerWeb: { alignSelf: 'center', width: '100%', maxWidth: 720 },
  barOverlay: { justifyContent: 'flex-end' },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.floating,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.s8,
    ...shadows.floating,
  },
  tabPill: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s12,
    borderRadius: radius.chip,
    flex: 1,
  },
  tabPillLeft: { marginRight: spacing.s4 },
  tabPillRight: { marginLeft: spacing.s4 },
  tabPillActive: { backgroundColor: colors.brand100 },
  tabLabel: { ...typography.micro, color: colors.text },
  fabSlot: { width: FAB_SIZE + spacing.s16 },
  fab: {
    position: 'absolute',
    top: -FAB_PROTRUSION,
    alignSelf: 'center',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.chip,
    backgroundColor: colors.brand500,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  sheetBackground: { backgroundColor: colors.surface, borderRadius: radius.cardLg },
  sheetHandle: { backgroundColor: colors.border },
});
