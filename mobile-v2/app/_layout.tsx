import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '../src/ui/components/error-boundary';
import { LoadingState } from '../src/ui/components';
import { queryClient } from '../src/core/query/query-client';
import { SessionProvider, useSession } from '../src/core/providers/session-provider';
import { ThemeProvider, useTheme } from '../src/core/providers/theme-provider';
import { ToastProvider } from '../src/core/providers/toast-provider';

function RootNavigator() {
  const { theme } = useTheme();
  const { status } = useSession();

  // A token in Secure Store is only a candidate session; validating it against
  // the API takes a moment. Keep the splash up until that resolves so protected
  // screens never flash their contents before auth is decided.
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <StatusBar style="dark" />
        <LoadingState label="Opening PLANET" />
      </View>
    );
  }

  const authenticated = status === 'authenticated';
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.background }, animation: 'fade' }}>
        <Stack.Protected guard={authenticated}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="account" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="privacy" />
        </Stack.Protected>
        <Stack.Protected guard={!authenticated}>
          <Stack.Screen name="welcome" />
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Screen name="invite/[code]" />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <SessionProvider>
              <ToastProvider>
                <AppErrorBoundary>
                  <RootNavigator />
                </AppErrorBoundary>
              </ToastProvider>
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
