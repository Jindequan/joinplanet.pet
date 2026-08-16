/**
 * Bootstrap: token present + GET /me succeeds → tabs; otherwise → welcome.
 * Loading state is a centered logo + skeleton (spec §62: no full-screen spinner).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { clearToken, get, getToken } from '../src/lib/api';
import { queryClient } from '../src/lib/query-client';
import { qk, type Me } from '../src/lib/queries';
import { Skeleton } from '../src/components/ui';
import { colors, spacing } from '../src/theme';

export default function BootstrapScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) {
        router.replace('/welcome');
      } else {
        try {
          // Warm the shared cache so (tabs) renders with /me already resolved.
          await queryClient.fetchQuery({
            queryKey: qk.me,
            queryFn: () => get<Me>('/me'),
          });
          if (!cancelled) router.replace('/(tabs)');
        } catch {
          await clearToken();
          if (!cancelled) router.replace('/welcome');
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={[styles.container, ready && styles.routed]}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} contentFit="contain" />
      <View style={styles.skeletonWrap}>
        <Skeleton width={140} height={12} round />
        <Skeleton width={90} height={12} round />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: spacing.s24,
  },
  routed: { opacity: 0 },
  logo: { width: 88, height: 88, borderRadius: 22 },
  skeletonWrap: { alignItems: 'center', gap: spacing.s8 },
});
