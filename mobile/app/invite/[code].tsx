/**
 * Invite deep-link landing (spec §14, contract F6/F7 GET /invite/{code}, public).
 * Logged in → join immediately; logged out → park the code in secure-store and
 * hand off to /welcome, which joins right after verification succeeds.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PawPrint } from 'lucide-react-native';
import { EmptyState, PrimaryButton, Skeleton } from '../../src/components/ui';
import { attachmentUrl } from '../../src/components/timeline/parts';
import { ApiError, get, getToken, post } from '../../src/lib/api';
import { qk } from '../../src/lib/queries';
import { colors, radius, spacing, typography } from '../../src/theme';

/** Shared with app/welcome.tsx — deep-link invite parked until auth completes. */
const PENDING_INVITE_KEY = 'planet_pending_invite';

const PHOTO_SIZE = 160;

interface InvitePreview {
  pet_name: string;
  photo_url?: string;
  inviter_name?: string;
}

async function setPendingInvite(code: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_INVITE_KEY, code);
  } catch {
    // welcome re-checks storage; worst case the user joins via /join manually
  }
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Network unavailable — check your connection.';
    if (err.message && !err.message.startsWith('Request failed')) return err.message;
  }
  return fallback;
}

function normalizeCode(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? decodeURIComponent(value).trim() : '';
}

export default function InviteScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = normalizeCode(params.code);
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const preview = useQuery<InvitePreview, ApiError>({
    queryKey: ['invite', code],
    queryFn: () => get<InvitePreview>(`/invite/${encodeURIComponent(code)}`, { auth: false }),
    enabled: !!code,
    retry: false,
    staleTime: Infinity,
  });

  const join = useCallback(async () => {
    if (joining || !code) return;
    setJoining(true);
    setJoinError(null);
    const token = await getToken();
    if (!token) {
      await setPendingInvite(code);
      router.replace('/welcome');
      return;
    }
    try {
      await post('/circles/join', { invite_code: code });
      await queryClient.invalidateQueries({ queryKey: qk.me });
      router.replace('/(tabs)');
    } catch (err) {
      setJoinError(errText(err, "Couldn't join with that invite."));
      setJoining(false);
    }
  }, [code, joining, queryClient]);

  if (!code || preview.isError) {
    // Neutral message, no internal details (spec §61)
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <EmptyState
            icon={PawPrint}
            title="This invite is no longer valid."
            subtitle="Ask the family for a new link."
            action={{
              label: 'Try again',
              onPress: () => void queryClient.invalidateQueries({ queryKey: ['invite', code] }),
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (preview.isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Skeleton width={PHOTO_SIZE} height={PHOTO_SIZE} round style={styles.skeletonPhoto} />
          <Skeleton width={220} height={typography.bodySm.lineHeight} round />
          <Skeleton width={140} height={typography.caption.lineHeight} round />
          <Skeleton width="100%" height={48} style={styles.skeletonCta} />
        </View>
      </SafeAreaView>
    );
  }

  const data = preview.data;
  const petName = data?.pet_name ?? 'this pet';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        {data?.photo_url ? (
          <Image
            source={{ uri: attachmentUrl(data.photo_url) }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel={`Photo of ${petName}`}
          />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <PawPrint size={typography.page.fontSize * 2} color={colors.brand700} />
          </View>
        )}

        <Text style={styles.title}>You're invited to care for {petName}</Text>
        {data?.inviter_name ? (
          <Text style={styles.sharedBy}>Shared by {data.inviter_name}</Text>
        ) : null}

        <PrimaryButton
          label={`Join ${petName}'s care circle`}
          onPress={join}
          loading={joining}
          style={styles.cta}
        />
        {joinError ? <Text style={styles.errorText}>{joinError}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s32,
    gap: spacing.s12,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand100,
  },
  title: {
    ...typography.page,
    color: colors.text,
    textAlign: 'center',
  },
  sharedBy: { ...typography.bodySm, color: colors.textSecondary },
  cta: { alignSelf: 'stretch', marginTop: spacing.s12 },
  errorText: {
    ...typography.caption,
    color: colors.symptom,
    textAlign: 'center',
  },
  skeletonPhoto: { marginBottom: spacing.s12 },
  skeletonCta: { marginTop: spacing.s12 },
});
