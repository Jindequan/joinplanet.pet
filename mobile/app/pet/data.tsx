/**
 * Data & Privacy (spec §51) — export preview + share, active private links
 * entry, and a Danger Zone where red first appears (two-step delete,
 * contract F8). After deleting the pet the cache is cleared and the user
 * returns to /welcome.
 */
import React, { useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Download, Link2, Share2, Trash2 } from 'lucide-react-native';
import { Card, ListRow, PrimaryButton, SectionHeader, Skeleton } from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import { Chevron, PageShell } from '../../src/components/pet/parts';
import { del, get } from '../../src/lib/api';
import { useActivePet } from '../../src/lib/queries';
import { colors, radius, spacing, typography, withAlpha } from '../../src/theme';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** GET /circles/{circleID}/usage response (M1 contract, defined locally —
 *  pet/member counters are unused here for now but part of the payload). */
interface CircleUsage {
  storage_bytes: number;
  storage_limit_bytes: number;
  pet_count: number;
  pet_limit: number;
  member_count: number;
  member_limit: number;
}

/** "23.4 MB" / "50 MB" — one decimal, trailing ".0" trimmed. */
function formatBytes(bytes: number): string {
  const round = (div: number) => (bytes / div).toFixed(1).replace(/\.0$/, '');
  if (bytes >= 1_000_000_000) return `${round(1_000_000_000)} GB`;
  if (bytes >= 1_000_000) return `${round(1_000_000)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

export default function DataPrivacyScreen() {
  const { pet, circle } = useActivePet();
  const petId = pet?.id;
  const circleId = circle?.id;
  const petName = pet?.name ?? 'your pet';
  const isOwner = circle?.role === 'owner';
  const client = useQueryClient();
  const { toast } = useToast();

  /** Circle storage quota (M1) — informational card below the links row. */
  const usageQuery = useQuery({
    queryKey: ['circle-usage', circleId ?? ''],
    queryFn: () => get<CircleUsage>(`/circles/${circleId}/usage`),
    enabled: !!circleId,
    staleTime: 60_000,
  });
  const usage = usageQuery.data;
  const storageRatio =
    usage && usage.storage_limit_bytes > 0
      ? Math.min(1, Math.max(0, usage.storage_bytes / usage.storage_limit_bytes))
      : 0;
  const storagePercent = Math.round(storageRatio * 100);
  const storageLine = usage
    ? `${formatBytes(usage.storage_bytes)} of ${formatBytes(usage.storage_limit_bytes)} used`
    : null;

  const [exportJson, setExportJson] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * GET /pets/{petID}/export (contract F8) returns the full JSON document.
   * TODO(file export): expo-file-system is not installed in Phase 1, so we
   * preview the JSON in-app and Share the first 2000 characters as text.
   * Revisit once a filesystem/share-file package is available.
   */
  const runExport = async () => {
    if (!petId || exporting) return;
    setExporting(true);
    try {
      const data = await get<unknown>(`/pets/${petId}/export`);
      setExportJson(JSON.stringify(data, null, 2));
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  const shareExport = async () => {
    if (!exportJson) return;
    try {
      await Share.share({ message: exportJson.slice(0, 2000) });
    } catch {
      // share sheet dismissed — nothing to do
    }
  };

  /** Two-step confirmation (task spec): intent, then irreversible confirmation. */
  const confirmDelete = () => {
    Alert.alert(
      `Delete ${petName}?`,
      'This removes their profile, timeline, medications and photos.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: confirmDeleteFinal },
      ],
    );
  };

  const confirmDeleteFinal = () => {
    Alert.alert(
      'Permanently delete',
      `All of ${petName}'s records will be deleted. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deletePet() },
      ],
    );
  };

  const deletePet = async () => {
    if (!petId || deleting) return;
    setDeleting(true);
    try {
      await del(`/pets/${petId}`);
      client.clear(); // the pet (and its circle) no longer exist — drop all caches
      router.replace('/welcome');
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not delete' });
      setDeleting(false);
    }
  };

  return (
    <PageShell title="Data & Privacy">
      <View>
        <SectionHeader title="Your data" />
        <Card padding={0} style={styles.rowsCard}>
          <ListRow
            title={`Export ${petName}'s data`}
            subtitle="Preview and share as JSON"
            icon={Download}
            trailing={exporting ? <Skeleton width={20} height={12} round /> : <Chevron />}
            onPress={() => void runExport()}
          />
          <View style={styles.rowDivider} />
          <ListRow
            title="Active private links"
            subtitle="Summary and care shares you've created"
            icon={Link2}
            trailing={<Chevron />}
            onPress={() => router.push('/shares')}
          />
        </Card>
      </View>

      {/* Storage — circle quota from GET /circles/{id}/usage (M1). Hidden if
          the endpoint is unavailable; >80% turns the bar warning amber. */}
      {usageQuery.isLoading ? (
        <View>
          <SectionHeader title="Storage" />
          <Card style={styles.storageCard}>
            <Skeleton height={14} width="55%" round />
            <Skeleton height={10} width="100%" round />
          </Card>
        </View>
      ) : storageLine ? (
        <View>
          <SectionHeader title="Storage" />
          <Card style={styles.storageCard}>
            <Text style={styles.storageLine}>{storageLine}</Text>
            <View
              style={styles.storageTrack}
              accessibilityRole="progressbar"
              accessibilityLabel={`${storagePercent}% of storage used`}
            >
              <View
                style={[
                  styles.storageFill,
                  {
                    width: `${storagePercent}%`,
                    backgroundColor: storageRatio >= 0.8 ? colors.warning : colors.brand500,
                  },
                ]}
              />
            </View>
          </Card>
        </View>
      ) : null}

      {/* Export preview (fallback for file download — see TODO above) */}
      {exportJson ? (
        <Card style={styles.previewCard}>
          <SectionHeader title="Export preview" />
          <View style={styles.previewBox}>
            <Text style={styles.previewText} selectable>
              {exportJson.length > 4000 ? `${exportJson.slice(0, 4000)}\n…` : exportJson}
            </Text>
          </View>
          <PrimaryButton
            label="Share JSON"
            icon={Share2}
            onPress={() => void shareExport()}
          />
          <Text style={styles.previewHint}>
            Sharing sends the first 2000 characters as text.
          </Text>
        </Card>
      ) : null}

      {/* Danger Zone — red only appears here (spec §51) */}
      <View>
        <SectionHeader title="Danger zone" />
        <Card style={styles.dangerCard}>
          <Text style={styles.dangerText}>
            Deleting {petName} permanently removes every record, photo and share.
            This cannot be undone.
          </Text>
          {isOwner ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${petName}`}
              accessibilityState={{ disabled: deleting || !petId, busy: deleting }}
              disabled={deleting || !petId}
              onPress={confirmDelete}
              style={({ pressed }) => [
                styles.dangerButton,
                pressed && { opacity: 0.7 },
                (deleting || !petId) && { opacity: 0.4 },
              ]}
            >
              <Trash2 size={typography.body.fontSize} color={colors.symptom} />
              <Text style={styles.dangerButtonLabel}>
                {deleting ? 'Deleting…' : `Delete ${petName}`}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.ownerOnlyNote}>Only the owner can delete {petName}</Text>
          )}
        </Card>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  rowsCard: { overflow: 'hidden' },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  storageCard: { gap: spacing.s12 },
  storageLine: { ...typography.bodySm, color: colors.text },
  storageTrack: {
    height: 10,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  storageFill: { height: '100%', borderRadius: radius.chip },
  previewCard: { gap: spacing.s12 },
  previewBox: {
    maxHeight: 300,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    padding: spacing.s12,
  },
  previewText: {
    fontFamily: MONOSPACE,
    ...typography.caption,
    color: colors.textSecondary,
  },
  previewHint: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  dangerCard: {
    gap: spacing.s12,
    borderColor: withAlpha(colors.symptom, 0.5),
  },
  dangerText: { ...typography.bodySm, color: colors.textSecondary },
  ownerOnlyNote: { ...typography.caption, color: colors.textSecondary },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s8,
    minHeight: 48,
    paddingHorizontal: spacing.s20,
    paddingVertical: spacing.s12,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.symptom,
    backgroundColor: withAlpha(colors.symptom, 0.06),
  },
  dangerButtonLabel: {
    ...typography.card,
    color: colors.symptom,
    fontWeight: '600',
  },
});
