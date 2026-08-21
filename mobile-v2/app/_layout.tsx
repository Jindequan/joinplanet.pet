import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '../src/ui/components/error-boundary';
import { queryClient } from '../src/core/query/query-client';
import { SessionProvider } from '../src/core/providers/session-provider';
import { ThemeProvider, useTheme } from '../src/core/providers/theme-provider';
import { ToastProvider } from '../src/core/providers/toast-provider';
import { useSession } from '../src/core/providers/session-provider';

function RootNavigator() {
  const { theme } = useTheme();
  const { status } = useSession();
  const segments = useSegments();
  useEffect(() => {
    if (status === 'loading') return;
    const rootSegment = segments[0];
    const inAuth = rootSegment === '(auth)';
    const inProtectedApp = rootSegment === '(tabs)' || rootSegment === 'account' || rootSegment === 'settings' || rootSegment === 'privacy' || rootSegment === 'family' || rootSegment === 'pets';
    if (status === 'authenticated' && inAuth) router.replace('/(tabs)');
    if (status === 'unauthenticated' && inProtectedApp) router.replace('/(auth)/welcome');
  }, [segments, status]);
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background }, animation: 'fade' }} /></View>;
}

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><QueryClientProvider client={queryClient}><ThemeProvider><SessionProvider><ToastProvider><BottomSheetModalProvider><AppErrorBoundary><RootNavigator /></AppErrorBoundary></BottomSheetModalProvider></ToastProvider></SessionProvider></ThemeProvider></QueryClientProvider></SafeAreaProvider></GestureHandlerRootView>;
}
