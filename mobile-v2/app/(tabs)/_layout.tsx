import React from 'react';
import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../src/ui/navigation/floating-tab-bar';

export default function TabsLayout() {
  return <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
    <Tabs.Screen name="index" options={{ title: 'Today' }} />
    <Tabs.Screen name="pets" options={{ title: 'Pets' }} />
    <Tabs.Screen name="timeline" options={{ title: 'Journal' }} />
    <Tabs.Screen name="family" options={{ title: 'Family' }} />
    <Tabs.Screen name="more" options={{ href: null, title: 'You' }} />
    <Tabs.Screen name="pet" options={{ href: null }} />
  </Tabs>;
}
