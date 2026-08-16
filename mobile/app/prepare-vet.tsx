/**
 * Prepare for vet (spec §52–§56) — PLANET's highest-value low-frequency moment.
 * In-file 3-step state machine: reason → include selection → preview.
 * The preview mimics the public vet page (spec §60: white + very light blue +
 * neutral type) with sections in vet priority order (§56); data comes from
 * the shared query cache and sections without data are omitted silently.
 */
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Printer, Stethoscope } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../src/theme';
import {
  Card,
  EmptyState,
  Field,
  PrimaryButton,
  Progress,
  SecondaryButton,
} from '../src/components/ui';
import { ScreenHeader } from '../src/components/vet/screen-header';
import { ShareLinkCard } from '../src/components/vet/share-link-card';
import {
  createShare,
  formatShortDate,
  type CreatedShare,
  type ShareIncludes,
} from '../src/components/vet/share-api';
import { useToast } from '../src/components/toast';
import { ApiError } from '../src/lib/api';
import { haptics } from '../src/lib/haptics';
import { qk, useActivePet, useMedications, usePet, useTimeline } from '../src/lib/queries';

/** Vet summary links always last 72h (contract F6). */
const SUMMARY_TTL_HOURS = 72;

const INCLUDE_ROWS: { key: keyof ShareIncludes; label: string; subtitle?: string }[] = [
  { key: 'profile', label: 'Pet profile' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'medications', label: 'Active medication' },
  { key: 'events', label: 'Health events', subtitle: 'Last 30 days' },
  { key: 'weight', label: 'Weight' },
  { key: 'visits', label: 'Recent visits' },
];

interface PreviewLine {
  date?: string;
  main: string;
  sub?: string;
}

interface PreviewSection {
  label: string;
  paragraph?: string;
  lines: PreviewLine[];
}

function IncludeRow({
  label,
  subtitle,
  value,
  onToggle,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={onToggle}
      style={({ pressed }) => [styles.includeRow, pressed && { backgroundColor: colors.surfaceSoft }]}
    >
      <View style={styles.includeText}>
        <Text style={styles.includeLabel}>{label}</Text>
        {subtitle ? <Text style={styles.includeSub}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.checkCircle, value && styles.checkCircleOn]}>
        {value ? <Check size={15} color={colors.onDark} strokeWidth={2.6} /> : null}
      </View>
    </Pressable>
  );
}

export default function PrepareVetScreen() {
  const { pet } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';

  const [step, setStep] = useState(0);
  const [reason, setReason] = useState('');
  const [includes, setIncludes] = useState<ShareIncludes>({
    profile: true,
    allergies: true,
    medications: true,
    events: true,
    weight: true,
    visits: true,
  });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreatedShare | null>(null);

  const { toast } = useToast();
  const client = useQueryClient();

  const petQuery = usePet(petId);
  const medsQuery = useMedications(petId);
  const timelineQuery = useTimeline(petId);

  const events = useMemo(
    () => timelineQuery.data?.pages.flatMap((page) => page.events) ?? [],
    [timelineQuery.data],
  );

  // RECENT CHANGES: symptom/medication events from the last 30 days (§55).
  const recentChanges = useMemo(() => {
    const cutoff = dayjs().subtract(30, 'day');
    return events.filter(
      (e) =>
        (e.type === 'symptom' || e.type === 'medication') && dayjs(e.occurred_at).isAfter(cutoff),
    );
  }, [events]);

  // Timeline pages are occurred_at DESC — the first match is the latest.
  const latestWeight = useMemo(() => events.find((e) => e.type === 'weight'), [events]);
  const recentVisits = useMemo(
    () => events.filter((e) => e.type === 'visit').slice(0, 3),
    [events],
  );

  const toggleInclude = (key: keyof ShareIncludes) => {
    haptics.select();
    setIncludes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreate = async () => {
    if (!petId || busy) return;
    setBusy(true);
    try {
      const share = await createShare(petId, {
        kind: 'summary',
        ttl_hours: SUMMARY_TTL_HOURS,
        reason: reason.trim(),
        includes,
      });
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

  const handlePrint = () => {
    if (!created) return;
    toast({ message: 'Open the link in a browser to print' });
    Linking.openURL(created.url).catch(() => toast({ message: 'Could not open the link' }));
  };

  if (!petId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Prepare for vet" />
        <View style={styles.center}>
          <EmptyState
            icon={Stethoscope}
            title="No pet yet"
            subtitle="Add a pet first to prepare a vet summary."
          />
        </View>
      </SafeAreaView>
    );
  }

  const allergies = (petQuery.data?.allergies ?? [])
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
  const activeMeds = medsQuery.data?.active ?? [];
  const weightKg = latestWeight?.data?.weight_kg;
  const weightText =
    typeof weightKg === 'number' ? `${weightKg} kg` : (latestWeight?.title ?? null);

  // §56 priority order — 1. why 2. allergies 3. medication 4. changes 5. weight 6. visits.
  const sections: (PreviewSection | null)[] = [
    { label: "WHY WE'RE HERE", paragraph: reason.trim(), lines: [] },
    includes.allergies && allergies.length > 0
      ? { label: 'IMPORTANT', lines: allergies.map((a) => ({ main: a })) }
      : null,
    includes.medications && activeMeds.length > 0
      ? {
          label: 'ACTIVE MEDICATION',
          lines: activeMeds.map((m) => ({
            main: m.name,
            sub: [m.dose, m.schedule].filter(Boolean).join(' · ') || undefined,
          })),
        }
      : null,
    includes.events && recentChanges.length > 0
      ? {
          label: 'RECENT CHANGES',
          lines: recentChanges.map((e) => ({
            date: formatShortDate(e.occurred_at),
            main: e.title,
          })),
        }
      : null,
    includes.weight && latestWeight
      ? {
          label: 'WEIGHT',
          lines: [
            {
              main: weightText ?? latestWeight.title,
              sub: formatShortDate(latestWeight.occurred_at),
            },
          ],
        }
      : null,
    includes.visits && recentVisits.length > 0
      ? {
          label: 'RECENT VISITS',
          lines: recentVisits.map((v) => ({
            date: formatShortDate(v.occurred_at),
            main: v.title,
          })),
        }
      : null,
  ];
  const visibleSections = sections.filter((s): s is PreviewSection => s !== null);
  const profileLine = [pet?.species, pet?.breed].filter((s): s is string => !!s).join(' · ');

  const previewCard = (
    <Card style={styles.previewCard}>
      <Text style={styles.previewName}>{petName}</Text>
      <Text style={styles.previewTag}>VET SUMMARY</Text>
      <Text style={styles.previewMeta}>
        Prepared by family · {dayjs().format('MMM D')}
      </Text>
      {includes.profile && profileLine ? (
        <Text style={styles.previewProfile}>{profileLine}</Text>
      ) : null}
      <View style={styles.previewDivider} />
      {visibleSections.map((section) => (
        <View key={section.label} style={styles.previewSection}>
          <Text style={styles.previewSectionLabel}>{section.label}</Text>
          {section.paragraph ? (
            <Text style={styles.previewParagraph}>{section.paragraph}</Text>
          ) : null}
          {section.lines.map((line, i) => (
            <View key={i} style={styles.previewLine}>
              {line.date ? <Text style={styles.previewLineDate}>{line.date}</Text> : null}
              <View style={styles.previewLineBody}>
                <Text style={styles.previewLineMain}>{line.main}</Text>
                {line.sub ? <Text style={styles.previewLineSub}>{line.sub}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      ))}
    </Card>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Prepare for vet"
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.progressWrap}>
          <Progress count={3} filled={step + 1} />
        </View>

        {step === 0 ? (
          <>
            <Text style={styles.stepIntro}>
              Help your vet understand what&apos;s been happening with {petName}.
            </Text>
            <Field
              label="Why are you visiting?"
              placeholder={`${petName} has been vomiting since last night…`}
              value={reason}
              onChangeText={setReason}
              multiline
              autoFocus
            />
            <PrimaryButton
              label="Continue"
              disabled={!reason.trim()}
              onPress={() => setStep(1)}
            />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={styles.stepTitle}>Include in summary</Text>
            <Card padding={0} style={styles.includeCard}>
              {INCLUDE_ROWS.map((row, i) => (
                <IncludeRow
                  key={row.key}
                  label={row.label}
                  subtitle={row.subtitle}
                  value={includes[row.key]}
                  onToggle={() => toggleInclude(row.key)}
                />
              ))}
            </Card>
            <PrimaryButton label="Preview summary" onPress={() => setStep(2)} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.stepTitle}>Preview</Text>
            {previewCard}
            {created ? (
              <ShareLinkCard url={created.url} expiresAt={created.expires_at} />
            ) : (
              <PrimaryButton
                label="Share private link"
                loading={busy}
                onPress={() => void handleCreate()}
              />
            )}
            <SecondaryButton
              label="Print"
              icon={Printer}
              disabled={!created}
              onPress={handlePrint}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep(1)}
              style={({ pressed }) => [styles.editSelection, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.editSelectionLabel}>Edit selection</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.s16, gap: spacing.s16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.s16 },
  progressWrap: { paddingHorizontal: spacing.s4 },
  stepIntro: { ...typography.body, color: colors.textSecondary },
  stepTitle: { ...typography.section, color: colors.text },
  includeCard: { overflow: 'hidden' },
  includeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
    minHeight: 56,
  },
  includeText: { flex: 1, gap: 2 },
  includeLabel: { ...typography.bodySm, color: colors.text },
  includeSub: { ...typography.caption, color: colors.textSecondary },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleOn: { backgroundColor: colors.brand500, borderColor: colors.brand500 },
  previewCard: { gap: spacing.s4, padding: spacing.s20 },
  previewName: { ...typography.page, color: colors.text, textTransform: 'uppercase' },
  previewTag: {
    ...typography.micro,
    color: colors.brand700,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  previewMeta: { ...typography.caption, color: colors.textTertiary },
  previewProfile: { ...typography.caption, color: colors.textSecondary },
  previewDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.s12,
    marginBottom: spacing.s8,
  },
  previewSection: { gap: spacing.s8, marginTop: spacing.s16 },
  previewSectionLabel: {
    ...typography.micro,
    color: colors.textTertiary,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  previewParagraph: { ...typography.bodySm, color: colors.text },
  previewLine: { flexDirection: 'row', gap: spacing.s12 },
  previewLineDate: { ...typography.caption, color: colors.textTertiary, width: spacing.s48 },
  previewLineBody: { flex: 1, gap: 2 },
  previewLineMain: { ...typography.bodySm, color: colors.text },
  previewLineSub: { ...typography.caption, color: colors.textSecondary },
  editSelection: { alignItems: 'center', paddingVertical: spacing.s12 },
  editSelectionLabel: { ...typography.card, color: colors.brand700, fontWeight: '600' },
});
