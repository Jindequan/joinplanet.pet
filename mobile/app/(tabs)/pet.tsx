/**
 * Pet Overview (spec §41–§42) — "This is Milo."
 * Hero (photo placeholder, name, breed · age, latest weight from the timeline
 * cache) → Prepare for vet → Share care link → five secondary entries
 * (spec §43 IA). Never a settings dump.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { HeartPulse, Phone, Pill, ShieldCheck, Users, type LucideIcon } from 'lucide-react-native';
import { Card, EmptyState, ListRow, PrimaryButton, Skeleton } from '../../src/components/ui';
import {
  AvatarBubble,
  Chevron,
  ageLabel,
  formatWeight,
  latestWeight,
  useCircleMembers,
} from '../../src/components/pet/parts';
import { qk, useActivePet, useMedications, type TimelinePage } from '../../src/lib/queries';
import { colors, radius, spacing, typography } from '../../src/theme';

interface Entry {
  key: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  href: string;
}

export default function PetOverviewScreen() {
  const { pet, circle, isLoading } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';
  const insets = useSafeAreaInsets();
  const client = useQueryClient();

  const medications = useMedications(petId);
  const { data: circleData } = useCircleMembers(circle?.id);

  // Latest weight lives on the timeline — read the shared cache, never fetch (§44).
  const weight = latestWeight(
    client.getQueryData<{ pages: TimelinePage[] }>(qk.timeline(petId ?? '')),
  );

  const metaLine = [pet?.breed || pet?.species, ageLabel(pet?.birthday)].filter(Boolean).join(' · ');
  const memberNames = (circleData?.members ?? []).map((m) => m.display_name).join(' · ');

  const entries: Entry[] = [
    { key: 'profile', title: 'Health profile', icon: HeartPulse, href: '/pet/profile' },
    {
      key: 'medications',
      title: 'Medications',
      subtitle: medications.data
        ? medications.data.active.length > 0
          ? `${medications.data.active.length} active`
          : 'None active'
        : undefined,
      icon: Pill,
      href: '/pet/medications',
    },
    {
      key: 'circle',
      title: 'Care circle',
      subtitle: memberNames || undefined,
      icon: Users,
      href: '/pet/circle',
    },
    { key: 'emergency', title: 'Emergency & Vet', icon: Phone, href: '/pet/emergency' },
    { key: 'data', title: 'Data & Privacy', icon: ShieldCheck, href: '/pet/data' },
  ];

  if (!isLoading && !pet) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <EmptyState icon={HeartPulse} title="No pet yet" subtitle="Create a circle to start." />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }]}
      >
        {/* Hero (spec §41) — the photo is the visual center of the page */}
        <View style={styles.hero}>
          {isLoading ? (
            <Skeleton width={128} height={128} round />
          ) : (
            <AvatarBubble label={petName} size={128} />
          )}
          {isLoading ? (
            <Skeleton width={120} height={28} />
          ) : (
            <Text style={styles.heroName}>{petName}</Text>
          )}
          {isLoading || !metaLine ? null : (
            <Text style={styles.heroMeta}>{metaLine}</Text>
          )}
          {weight ? <Text style={styles.heroMeta}>{formatWeight(weight.kg)}</Text> : null}
        </View>

        <PrimaryButton
          label="Prepare for vet"
          onPress={() => router.push('/prepare-vet')}
        />
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push('/share-care')}
          style={({ pressed }) => [styles.shareLink, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.shareLinkText}>Share {petName}&rsquo;s care →</Text>
        </Pressable>

        {/* Secondary IA (spec §42–§43) — five entries, nothing more */}
        <Card padding={0} style={styles.entriesCard}>
          {entries.map((entry, index) => (
            <View key={entry.key} style={index < entries.length - 1 ? styles.rowDivider : null}>
              <ListRow
                title={entry.title}
                subtitle={entry.subtitle}
                icon={entry.icon}
                trailing={<Chevron />}
                onPress={() => router.push(entry.href)}
              />
            </View>
          ))}
        </Card>
      </ScrollView>
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
  },
  content: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s24,
    gap: spacing.s16,
  },
  hero: { alignItems: 'center', gap: spacing.s8, paddingVertical: spacing.s8 },
  heroName: { ...typography.hero, color: colors.text },
  heroMeta: { ...typography.bodySm, color: colors.textSecondary },
  shareLink: { alignItems: 'center', paddingVertical: spacing.s4 },
  shareLinkText: {
    ...typography.bodySm,
    color: colors.brand700,
    fontWeight: '600',
  },
  entriesCard: { borderRadius: radius.card, overflow: 'hidden', marginTop: spacing.s8 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
});
