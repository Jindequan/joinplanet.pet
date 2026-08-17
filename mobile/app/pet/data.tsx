/**
 * Data & Privacy (spec §51) — export preview + share, active private links
 * entry, and a Danger Zone where red first appears (two-step delete,
 * contract F8). After deleting the pet the cache is cleared and the user
 * returns to /welcome.
 */
import React, { useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Download, Link2, Share2, Trash2 } from 'lucide-react-native';
import { Card, ListRow, PrimaryButton, SectionHeader, Skeleton } from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import { Chevron, PageShell } from '../../src/components/pet/parts';
import { del, get } from '../../src/lib/api';
import { useActivePet } from '../../src/lib/queries';
import { colors, radius, spacing, typography, withAlpha } from '../../src/theme';

const MONOSPACE = Platform.select({ ios: 'Menlo', default: 'monospace' });

export default function DataPrivacyScreen() {
  const { pet, circle } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';
  const isOwner = circle?.role === 'owner';
  const client = useQueryClient();
  const { toast } = useToast();

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
