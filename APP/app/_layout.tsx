import React from 'react';
import 'react-native-reanimated';
import { Platform, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '../src/ui/components/error-boundary';
import { queryClient } from '../src/core/query/query-client';
import { ScopeProvider } from '../src/core/providers/scope-provider';
import { SessionProvider, useSession } from '../src/core/providers/session-provider';
import { ThemeProvider, useTheme } from '../src/core/providers/theme-provider';
import { ToastProvider } from '../src/core/providers/toast-provider';
import { WebWorkspaceRail } from '../src/ui/navigation/web-workspace-rail';
import { IncomingRequestToast } from '../src/features/care-requests/incoming-request-toast';
import { LoadingState } from '../src/ui/components/loading-state';

function RootNavigator() {
  const { theme } = useTheme();
  const { status } = useSession();
  const { width } = useWindowDimensions();

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <StatusBar style="dark" />
        <LoadingState label="正在恢复登录状态" />
      </View>
    );
  }

  const authenticated = status === 'authenticated';
  const desktopWeb = Platform.OS === 'web' && width >= 960 && authenticated;

    return (
    <View
      style={{
        flex: 1,
        backgroundColor: Platform.OS === 'web' ? theme.colors.canvas : theme.colors.background,
      }}
    >
      <StatusBar style="dark" />
      <View style={{ flex: 1, flexDirection: desktopWeb ? 'row' : 'column' }}>
        {desktopWeb ? <WebWorkspaceRail /> : null}
        <View
          style={{
            flex: 1,
            width: '100%',
            // Desktop pages already control their own readable columns. The
            // shell must occupy the entire space beside the rail so a wide
            // browser never renders the app as a narrow left-side island.
            maxWidth: undefined,
            // The parent is a horizontal desktop shell. `center` aligns on
            // its cross-axis (vertical) and collapses this column to 0px,
            // leaving painted content outside the hit-test area.
            alignSelf: 'stretch',
            backgroundColor: theme.colors.background,
          }}
        >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { flex: 1, height: '100%', backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="share/[token]" />
          <Stack.Screen name="account/deleted" />
          <Stack.Protected guard={authenticated}>
            <Stack.Screen name="activation/index" />
            <Stack.Screen name="activation/welcome" />
            <Stack.Screen name="activation/setup-care" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="requests/[requestId]" />
            <Stack.Screen name="handoffs/[batchId]" />
            <Stack.Screen name="trends" />
            <Stack.Screen name="settings/index" />
            <Stack.Screen name="settings/notifications" />
            <Stack.Screen name="settings/deleted-families" />
            <Stack.Screen name="account/index" />
            <Stack.Screen name="pets/new" />
            <Stack.Screen name="pets/[petId]/index" />
            <Stack.Screen name="pets/[petId]/edit" />
            <Stack.Screen name="pets/[petId]/care" />
            <Stack.Screen name="pets/[petId]/medications" />
            <Stack.Screen name="pets/[petId]/sharing" />
            <Stack.Screen name="pets/[petId]/transfer" />
            <Stack.Screen name="pets/[petId]/timeline" />
            <Stack.Screen name="pets/[petId]/care/[planId]/assignments" />
            <Stack.Screen name="families/index" />
            <Stack.Screen name="families/new" />
            <Stack.Screen name="families/join" />
            <Stack.Screen name="families/[familyId]/index" />
            <Stack.Screen name="families/[familyId]/transfers" />
          </Stack.Protected>
          <Stack.Protected guard={!authenticated}>
            <Stack.Screen name="auth" />
          </Stack.Protected>
        </Stack>
        {authenticated ? <IncomingRequestToast /> : null}
        </View>
      </View>
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
              <ScopeProvider>
                <ToastProvider>
                  <AppErrorBoundary>
                    <RootNavigator />
                  </AppErrorBoundary>
                </ToastProvider>
              </ScopeProvider>
            </SessionProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
