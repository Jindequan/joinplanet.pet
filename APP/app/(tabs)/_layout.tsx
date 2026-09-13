import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { FloatingTabBar } from '../../src/ui/navigation/floating-tab-bar';

export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          // The web tab navigator otherwise leaves the scene viewport at 0px
          // high while painting its children outside the hit-test area.
          sceneStyle: { flex: 1, height: '100%', minHeight: '100%' },
        }}
      >
        <Tabs.Screen name="index" options={{ title: '今天' }} />
        <Tabs.Screen name="requests" options={{ title: '请求' }} />
        <Tabs.Screen name="pets" options={{ title: '宠物' }} />
        <Tabs.Screen name="timeline" options={{ title: '记录' }} />
        <Tabs.Screen name="more" options={{ title: '更多' }} />
        <Tabs.Screen name="family" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
