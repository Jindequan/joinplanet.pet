/**
 * Private links manager (spec §61): list of vet summary / Care Card links
 * with status, expiry and view counts. Tap a row to re-share; owners can
 * revoke active links (DELETE /shares/{shareID}) after an Alert confirm.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, Link2, Stethoscope, type LucideIcon } from 'lucide-react-native';
import { colors, spacing, typography } from '../src/theme';
import {
  Card,
  EmptyState,
  ListRow,
  Skeleton,
  StatusBadge,
  type StatusBadgeVariant,
} from '../src/components/ui';
import { ScreenHeader } from '../src/components/vet/screen-header';
import { formatShortDate } from '../src/components/vet/share-api';
import { useToast } from '../src/components/toast';
import { ApiError, del } from '../src/lib/api';
import { haptics } from '../src/lib/haptics';
import { qk, useActivePet, useShares, type Share as ShareRecord } from '../src/lib/queries';

const KIND_META: Record<string, { title: string; icon: LucideIcon }> = {
  summary: { title: 'Vet summary', icon: Stethoscope },
  care: { title: 'Care card', icon: HeartHandshake },
};

function kindMeta(kind: string): { title: string; icon: LucideIcon } {
  return KIND_META[kind] ?? { title: 'Share', icon: Link2 };
}

function statusMeta(status: string): { label: string; variant: StatusBadgeVariant } {
  switch (status) {
    case 'active':
      return { label: 'Active', variant: 'success' };
    case 'revoked':
      return { label: 'Revoked', variant: 'warning' };
    default:
      return { label: 'Expired', variant: 'neutral' };
  }
}

function viewsLabel(count: number): string {
  return `${count} ${count === 1 ? 'view' : 'views'}`;
}

export default function SharesScreen() {
  const { pet, circle } = useActivePet();
  const petId = pet?.id;
  const isOwner = circle?.role === 'owner';

  const sharesQuery = useShares(petId);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { toast } = useToast();
  const client = useQueryClient();

  const revoke = async (share: ShareRecord) => {
    if (!petId) return;
    setRevokingId(share.id);
    try {
      await del(`/shares/${share.id}`);
      haptics.delete();
      toast({ message: 'Link revoked' });
      await client.invalidateQueries({ queryKey: qk.shares(petId) });
    } catch (err) {
      toast({
        message: err instanceof ApiError ? err.message : 'Could not revoke the link',
      });
    } finally {
      setRevokingId(null);
    }
  };

  const confirmRevoke = (share: ShareRecord) => {
    Alert.alert('Revoke this link?', 'Anyone with the link will lose access right away.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Revoke', style: 'destructive', onPress: () => void revoke(share) },
    ]);
  };

  const shareUrl = (share: ShareRecord) => {
    Share.share({ url: share.url }).catch(() => undefined);
  };

  if (!petId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Private links" />
        <View style={styles.center}>
          <EmptyState
            icon={Link2}
            title="No pet yet"
            subtitle="Add a pet first to share a vet summary or care card."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Private links" />

      {sharesQuery.isLoading ? (
        // spec §62: skeletons, never a full-screen spinner
        <View style={styles.content} pointerEvents="none">
          {[0, 1, 2].map((i) => (
            <Card key={i} style={styles.skeletonCard}>
              <Skeleton width="45%" height={16} />
              <Skeleton width="65%" height={12} />
            </Card>
          ))}
        </View>
      ) : sharesQuery.isError ? (
        <EmptyState
          icon={Link2}
          title="Couldn't load links"
          subtitle="Check your connection and try again."
          action={{ label: 'Retry', onPress: () => void sharesQuery.refetch() }}
        />
      ) : (sharesQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Link2}
          title="No private links yet."
          subtitle="Share a vet summary or care card."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {(sharesQuery.data ?? []).map((share) => {
            const kind = kindMeta(share.kind);
            const status = statusMeta(share.status);
            const subtitle =
              share.status === 'active'
                ? `Expires ${formatShortDate(share.expires_at)} · ${viewsLabel(share.view_count)}`
                : `${status.label} · ${viewsLabel(share.view_count)}`;
            const canRevoke = isOwner && share.status === 'active';
            return (
              <Card key={share.id} padding={0} style={styles.rowCard}>
                <ListRow
                  title={kind.title}
                  subtitle={subtitle}
                  icon={kind.icon}
                  onPress={share.status === 'active' ? () => shareUrl(share) : undefined}
                  trailing={
                    <View style={styles.trailing}>
                      <StatusBadge label={status.label} variant={status.variant} />
                      {canRevoke ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Revoke ${kind.title} link`}
                          disabled={revokingId === share.id}
                          hitSlop={spacing.s8}
                          onPress={() => confirmRevoke(share)}
                          style={({ pressed }) => [
                            styles.revoke,
                            pressed && { opacity: 0.6 },
                            revokingId === share.id && { opacity: 0.4 },
                          ]}
                        >
                          <Text style={styles.revokeLabel}>
                            {revokingId === share.id ? 'Revoking…' : 'Revoke'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  }
                />
              </Card>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s16, gap: spacing.s12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.s16 },
  skeletonCard: { gap: spacing.s8 },
  rowCard: { overflow: 'hidden' },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.s8 },
  revoke: {
    minHeight: spacing.s48,
    justifyContent: 'center',
    paddingHorizontal: spacing.s4,
  },
  revokeLabel: { ...typography.caption, color: colors.symptom, fontWeight: '600' },
});
