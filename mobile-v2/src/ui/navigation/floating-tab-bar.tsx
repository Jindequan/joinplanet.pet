import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from '../components/app-text';
import { CalendarBlankIcon, PawPrintIcon, UserCircleIcon, UsersThreeIcon } from '../icons';

const iconMap = { index: CalendarBlankIcon, pets: PawPrintIcon, family: UsersThreeIcon, more: UserCircleIcon } as const;

export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = theme.colors.background === theme.colors.inverseSurface;
  return (
    <View style={[styles.host, { bottom: Math.max(insets.bottom, 12), pointerEvents: 'box-none' }]}>
      <View style={[styles.glass, theme.shadow.floating, { borderColor: theme.colors.border, borderRadius: theme.radius.sheet }]}>
        <BlurView intensity={78} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        <View style={[styles.tint, { backgroundColor: dark ? 'rgba(15,23,42,0.76)' : 'rgba(255,255,255,0.78)' }]} />
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const options = descriptors[route.key]?.options;
            const Icon = iconMap[route.name as keyof typeof iconMap] ?? UserCircleIcon;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            };
            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
            return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={options?.tabBarAccessibilityLabel ?? options?.title} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.item, pressed && { opacity: theme.motion.pressOpacity }]}>{focused ? <View style={styles.selected}><Icon color={theme.colors.brandStrong} size={22} weight="duotone" /><AppText variant="caption" style={{ color: theme.colors.brandStrong }}>{options?.title}</AppText></View> : <Icon color={theme.colors.textSubtle} size={22} weight="regular" />}</Pressable>;
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
    height: 76,
    overflow: 'hidden',
    borderWidth: 1,
  },
  tint: { ...StyleSheet.absoluteFillObject },
  row: { flex: 1, flexDirection: 'row' },
  item: { flex: 1, height: 76, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  pressed: {},
  selected: { height: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  indicator: { width: 18, height: 3, borderRadius: 2 },
});
