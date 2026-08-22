import React, { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { LoadingState } from '../src/ui/components';
import { useSession } from '../src/core/providers/session-provider';
import { useTheme } from '../src/core/providers/theme-provider';

export default function IndexRoute() {
  const { status } = useSession();
  const { theme } = useTheme();
  useEffect(() => {
    if (status === 'authenticated') router.replace('/(tabs)');
    if (status === 'unauthenticated') router.replace('/welcome');
  }, [status]);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background, padding: theme.spacing.page }}><LoadingState label="Opening PLANET" /></View>;
}
