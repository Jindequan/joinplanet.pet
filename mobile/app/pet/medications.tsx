/**
 * Medications (spec §45–§47) — ACTIVE cards (Success dot, dose · schedule,
 * Since MMM D, inline detail with End) / PAST muted rows / Add sheet whose
 * follow-up offers to add the med to Today's care (contract F3/F4).
 */
import React, { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  Chevron,
  PageShell,
  formatShortDate,
} from '../../src/components/pet/parts';
import {
  Card,
  EmptyState,
  Field,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  Skeleton,
} from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import { patch, post } from '../../src/lib/api';
import { haptics } from '../../src/lib/haptics';
import { qk, useActivePet, useMedications, type Medication } from '../../src/lib/queries';
import { colors, radius, spacing, typography, withAlpha } from '../../src/theme';

interface Followup {
  name: string;
  dose: string;
  schedule: string;
  detail: string;
}

export default function MedicationsScreen() {
  const { pet } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';
  const { data, isLoading } = useMedications(petId);
  const client = useQueryClient();
  const { toast } = useToast();

  const sheetRef = useRef<BottomSheetModal>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add-medication sheet state
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [schedule, setSchedule] = useState('');
  const [saving, setSaving] = useState(false);
  const [followup, setFollowup] = useState<Followup | null>(null);
  const [followupBusy, setFollowupBusy] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  const active = data?.active ?? [];
  const past = data?.past ?? [];

  const invalidate = () => {
    if (!petId) return;
    void client.invalidateQueries({ queryKey: qk.medications(petId) });
    void client.invalidateQueries({ queryKey: qk.timeline(petId) });
  };

  const resetForm = () => {
    setName('');
    setDose('');
    setSchedule('');
    setFollowup(null);
    setSaving(false);
    setFollowupBusy(false);
  };

  const openSheet = () => {
    resetForm();
    sheetRef.current?.present();
  };

  const saveMedication = async () => {
    const trimmed = name.trim();
    if (!trimmed || !petId || saving) return;
    setSaving(true);
    try {
      await post(`/pets/${petId}/medications`, {
        name: trimmed,
        dose: dose.trim() || undefined,
        schedule: schedule.trim() || undefined,
      });
      invalidate();
      haptics.light();
      const detail = [dose.trim(), schedule.trim()].filter(Boolean).join(' · ');
      setFollowup({ name: trimmed, dose: dose.trim(), schedule: schedule.trim(), detail });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not save' });
    } finally {
      setSaving(false);
    }
  };

  /** Follow-up (spec §46): offer to add "{name} {dose}" to Today at 08:00. */
  const addToToday = async () => {
    if (!followup || !petId || followupBusy) return;
    setFollowupBusy(true);
    try {
      await post(`/pets/${petId}/tasks`, {
        title: [followup.name, followup.dose].filter(Boolean).join(' '),
        time_of_day: '08:00',
      });
      void client.invalidateQueries({
        queryKey: qk.today(petId, dayjs().format('YYYY-MM-DD')),
      });
      haptics.light();
      toast({ message: 'Added to Today' });
      sheetRef.current?.close();
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not add' });
    } finally {
      setFollowupBusy(false);
    }
  };

  const confirmEnd = (med: Medication) => {
    Alert.alert(
      'End medication',
      `End ${med.name}? It will move to Past.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: () => void endMedication(med) },
      ],
    );
  };

  const endMedication = async (med: Medication) => {
    if (!petId || endingId) return;
    setEndingId(med.id);
    try {
      await patch(`/medications/${med.id}`, { active: false }); // server writes ended_on + "Stopped" event
      invalidate();
      setExpandedId((prev) => (prev === med.id ? null : prev));
      toast({ message: `Ended ${med.name}` });
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Could not end' });
    } finally {
      setEndingId(null);
    }
  };

  const subtitleFor = (med: Medication) =>
    [med.dose, med.schedule].filter(Boolean).join(' · ');

  return (
    <PageShell title="Medications">
      {/* ACTIVE (spec §45) */}
      <View>
        <SectionHeader title="Active" />
        {isLoading ? (
          <Card style={styles.skeletonCard}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} />
          </Card>
        ) : active.length === 0 ? (
          <EmptyState
            icon={undefined}
            title="No active medications"
            subtitle={`Anything ${petName} takes regularly lives here.`}
            action={{ label: 'Add medication', onPress: openSheet }}
          />
        ) : (
          <View style={styles.stack}>
            {active.map((med) => {
              const expanded = expandedId === med.id;
              const since = formatShortDate(med.started_on);
              return (
                <Card key={med.id} padding={0} style={styles.medCard}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${med.name} details`}
                    onPress={() => setExpandedId(expanded ? null : med.id)}
                    style={({ pressed }) => [
                      styles.medRow,
                      pressed && { backgroundColor: colors.surfaceSoft },
                    ]}
                  >
                    <View style={styles.dot} />
                    <View style={styles.medText}>
                      <Text style={styles.medName}>{med.name}</Text>
                      {subtitleFor(med) ? (
                        <Text style={styles.medSub}>{subtitleFor(med)}</Text>
                      ) : null}
                      {since ? <Text style={styles.medSub}>Since {since}</Text> : null}
                    </View>
                    <Chevron />
                  </Pressable>
                  {expanded ? (
                    <View style={styles.detail}>
                      {med.note ? <Text style={styles.detailNote}>{med.note}</Text> : null}
                      <Text style={styles.detailHint}>
                        Ending moves {med.name} to Past and adds a &ldquo;Stopped&rdquo; entry to
                        the timeline.
                      </Text>
                      <SecondaryButton
                        label={endingId === med.id ? 'Ending…' : 'End medication'}
                        disabled={endingId !== null}
                        onPress={() => confirmEnd(med)}
                        style={styles.endButton}
                      />
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </View>

      {/* PAST */}
      {past.length > 0 ? (
        <View>
          <SectionHeader title="Past" />
          <Card padding={0} style={styles.pastCard}>
            {past.map((med, index) => (
              <View
                key={med.id}
                style={index < past.length - 1 ? styles.pastDivider : null}
              >
                <View style={styles.pastRow}>
                  <Text style={styles.pastName}>{med.name}</Text>
                  {med.ended_on ? (
                    <Text style={styles.pastEnded}>Ended {formatShortDate(med.ended_on)}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <PrimaryButton label="Add medication" onPress={openSheet} />

      {/* Add medication sheet (spec §46) + follow-up */}
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        onDismiss={resetForm}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          bounces={false}
          contentContainerStyle={styles.sheet}
        >
          {followup ? (
            <>
              <Text style={styles.sheetTitle}>Daily care</Text>
              <Text style={styles.followupQuestion}>
                Add {followup.name} to {petName}&rsquo;s daily care?
              </Text>
              {followup.detail ? (
                <Text style={styles.followupDetail}>{followup.detail}</Text>
              ) : null}
              <PrimaryButton
                label="Add to Today"
                loading={followupBusy}
                onPress={() => void addToToday()}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => sheetRef.current?.close()}
                style={({ pressed }) => [styles.notNow, pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.notNowText}>Not now</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.sheetTitle}>Add medication</Text>
              <Field
                label="Name"
                placeholder="e.g. Apoquel"
                value={name}
                onChangeText={setName}
                autoFocus
              />
              <Field
                label="Dose"
                placeholder="e.g. 16 mg"
                value={dose}
                onChangeText={setDose}
              />
              <Field
                label="Schedule"
                placeholder="e.g. Once daily"
                value={schedule}
                onChangeText={setSchedule}
              />
              <PrimaryButton
                label="Save"
                loading={saving}
                disabled={!name.trim()}
                onPress={() => void saveMedication()}
              />
            </>
          )}
        </ScrollView>
      </BottomSheetModal>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.s12 },
  skeletonCard: { gap: spacing.s8 },
  medCard: { overflow: 'hidden' },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    padding: spacing.s16,
    minHeight: 72,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  medText: { flex: 1, gap: 2 },
  medName: { ...typography.card, color: colors.text },
  medSub: { ...typography.caption, color: colors.textSecondary },
  detail: {
    paddingHorizontal: spacing.s16,
    paddingBottom: spacing.s16,
    gap: spacing.s12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: withAlpha(colors.surfaceSoft, 0.5),
    paddingTop: spacing.s12,
  },
  detailNote: { ...typography.bodySm, color: colors.text },
  detailHint: { ...typography.caption, color: colors.textTertiary },
  endButton: { borderColor: colors.border },
  pastCard: { overflow: 'hidden' },
  pastDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pastRow: {
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
    gap: 2,
    opacity: 0.6,
  },
  pastName: { ...typography.card, color: colors.textSecondary },
  pastEnded: { ...typography.caption, color: colors.textTertiary },
  sheetBackground: { backgroundColor: colors.surface, borderRadius: radius.cardLg },
  sheetHandle: { backgroundColor: colors.border },
  sheet: {
    paddingHorizontal: spacing.s16,
    paddingBottom: spacing.s24,
    paddingTop: spacing.s8,
    gap: spacing.s16,
  },
  sheetTitle: { ...typography.section, color: colors.text },
  followupQuestion: { ...typography.body, color: colors.text },
  followupDetail: { ...typography.bodySm, color: colors.textSecondary, marginTop: -spacing.s8 },
  notNow: { alignItems: 'center', paddingVertical: spacing.s8 },
  notNowText: { ...typography.bodySm, color: colors.brand700, fontWeight: '600' },
});
