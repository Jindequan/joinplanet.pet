import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from '../components/app-text';
import { BookOpenIcon, CalendarBlankIcon, PawPrintIcon, UserCircleIcon, UsersThreeIcon } from '../icons';

const iconMap = { index: CalendarBlankIcon, pets: PawPrintIcon, timeline: BookOpenIcon, family: UsersThreeIcon, more: UserCircleIcon } as const;

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = theme.colors.background === theme.colors.inverseSurface;
  // Family and Pet are workspace routes, not top-level destinations. Expo
  // still includes them in the tab navigator state, so filter by the product
  // navigation contract instead of relying on href metadata from descriptors.
  const topLevelRoutes = new Set(['index', 'pets', 'timeline', 'more']);
  const focusedRoute = state.routes[state.index];
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined;
  const focusedTabStyle = focusedOptions?.tabBarStyle
    ? (StyleSheet.flatten(focusedOptions.tabBarStyle) as { display?: string })
    : undefined;
  if (focusedTabStyle?.display === 'none') return null;
  const activeRouteName = focusedRoute?.name === 'pet'
    ? 'pets'
    : focusedRoute?.name === 'family'
      ? 'more'
      : focusedRoute?.name;
  return (
    <View style={[styles.host, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.glass, theme.shadow.floating, { borderColor: theme.colors.border, borderRadius: theme.radius.sheet }]}>
        <BlurView intensity={78} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[styles.tint, { backgroundColor: dark ? theme.colors.glassDark : theme.colors.glassLight }]} />
        <View style={styles.row}>
          {state.routes.filter((route) => topLevelRoutes.has(route.name)).map((route) => {
            const focused = activeRouteName === route.name;
            const options = descriptors[route.key]?.options;
            const Icon = iconMap[route.name as keyof typeof iconMap] ?? UserCircleIcon;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
            return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={options?.tabBarAccessibilityLabel ?? options?.title} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.item, pressed && { opacity: theme.motion.pressOpacity }]}>
              <View style={[styles.itemInner, { backgroundColor: focused ? theme.colors.brandSoft : 'transparent' }]}>
                <Icon color={focused ? theme.colors.brandStrong : theme.colors.textSubtle} size={20} weight={focused ? 'duotone' : 'regular'} />
                <AppText variant="caption" style={{ color: focused ? theme.colors.brandStrong : theme.colors.textSubtle }}>{options?.title}</AppText>
              </View>
            </Pressable>;
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  glass: {
    width: '100%',
    maxWidth: 430,
    height: 68,
    overflow: 'hidden',
    borderWidth: 1,
  },
  tint: { ...StyleSheet.absoluteFillObject },
  row: { flex: 1, flexDirection: 'row' },
  item: { flex: 1, height: 68, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pressed: {},
  itemInner: { minWidth: 64, minHeight: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 9 },
});
