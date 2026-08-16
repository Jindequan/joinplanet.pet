/**
 * Share care — Care Card creation (spec §57–§58). Duration chips + fixed
 * read-only includes; "Health history stays private." stays high-visibility.
 * The Care Card only exposes today's routine and contacts — never history.
 */
import React, { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Check, HeartHandshake } from 'lucide-react-native';
import { colors, radius, spacing, typography, withAlpha } from '../src/theme';
import {
  Card,
  Chip,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from '../src/components/ui';
import { ScreenHeader } from '../src/components/vet/screen-header';
import { ShareLinkCard } from '../src/components/vet/share-link-card';
import { createShare, type CreatedShare } from '../src/components/vet/share-api';
import { useToast } from '../src/components/toast';
import { ApiError } from '../src/lib/api';
import { haptics } from '../src/lib/haptics';
import { qk, useActivePet } from '../src/lib/queries';

const DURATIONS: { label: string; hours: 24 | 72 | 168 }[] = [
  { label: '24 hours', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '7 days', hours: 168 },
];

const INCLUDES = [
  "Today's care",
  'Emergency contact',
  'Vet',
  'Medical decision contact',
] as const;

export default function ShareCareScreen() {
  const { pet } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';

  const [ttlHours, setTtlHours] = useState<24 | 72 | 168>(72);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedShare | null>(null);

  const { toast } = useToast();
  const client = useQueryClient();

  const handleCreate = async () => {
    if (!petId || busy) return;
    setBusy(true);
    try {
      const share = await createShare(petId, { kind: 'care', ttl_hours: ttlHours });
      setCreated(share);
      haptics.success();
      toast({ message: 'Private link created' });
      void client.invalidateQueries({ queryKey: qk.shares(petId) });
      Share.share({ url: share.url }).catch(() => undefined);
    } catch (err) {
      toast({
        message: err instanceof ApiError ? err.message : 'Could not create the link',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!petId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Share care" />
        <View style={styles.center}>
          <EmptyState
            icon={HeartHandshake}
            title="No pet yet"
            subtitle="Add a pet first to share care."
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Share care" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.title}>Share {petName}&apos;s care</Text>
          <Text style={styles.subtitle}>
            Keep {petName}&apos;s routine with someone you trust.
          </Text>
        </View>

        {created ? (
          <>
            <ShareLinkCard url={created.url} expiresAt={created.expires_at} />
            <SecondaryButton label="Create another link" onPress={() => setCreated(null)} />
          </>
        ) : (
          <>
            <View>
              <Text style={styles.groupLabel}>Duration</Text>
              <View style={styles.chipRow}>
                {DURATIONS.map((d) => (
                  <Chip
                    key={d.label}
                    label={d.label}
                    selected={ttlHours === d.hours}
                    onPress={() => {
                      haptics.select();
                      setTtlHours(d.hours);
                    }}
                  />
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.groupLabel}>Includes</Text>
              <Card padding={0} style={styles.includesCard}>
                {INCLUDES.map((label, i) => (
                  <View
                    key={label}
                    style={[styles.includeRow, i < INCLUDES.length - 1 && styles.includeRowBorder]}
                  >
                    <View style={styles.includeCheck}>
                      <Check size={16} color={colors.success} strokeWidth={2.6} />
                    </View>
                    <Text style={styles.includeLabel}>{label}</Text>
                  </View>
                ))}
              </Card>
            </View>

            <Text style={styles.privateNote}>Health history stays private.</Text>

            <PrimaryButton
              label="Create private link"
              loading={busy}
              onPress={() => void handleCreate()}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s16, gap: spacing.s20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.s16 },
  hero: { gap: spacing.s8 },
  title: { ...typography.page, color: colors.text },
  subtitle: { ...typography.bodySm, color: colors.textSecondary },
  groupLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.s8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s8 },
  includesCard: { overflow: 'hidden' },
  includeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
    minHeight: 48,
  },
  includeRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  includeCheck: {
    width: 24,
    height: 24,
    borderRadius: radius.chip,
    backgroundColor: withAlpha(colors.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  includeLabel: { ...typography.bodySm, color: colors.text, flex: 1 },
  privateNote: {
    ...typography.body,
    color: colors.warning,
    fontWeight: '600',
    textAlign: 'center',
  },
});
