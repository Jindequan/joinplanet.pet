/**
 * Add care task sheet (spec §23): "Add to {pet}'s routine" — template list
 * (Breakfast / Dinner / Medication / Walk / Custom) → prefilled title + a plain
 * HH:mm time field (contract F4 time_of_day). Choosing Medication offers the
 * pet's active medications (spec §37: daily dosing lives in Today, not Quick
 * Record); picking one prefills "{name} {dose}" and links medication_id.
 * The Today empty state reuses TASK_TEMPLATES for one-tap creation (spec §24).
 */
import React, { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronLeft, Croissant, Footprints, Pill, Plus, Utensils, type LucideIcon } from 'lucide-react-native';
import { colors, radius, spacing, touchTarget, typography } from '../../theme';
import { Field, PrimaryButton } from '../ui';
import { useToast } from '../toast';
import { haptics } from '../../lib/haptics';
import { useActivePet, useCreateTask, useMedications, type Medication } from '../../lib/queries';

export interface TaskTemplate {
  key: 'breakfast' | 'dinner' | 'medication' | 'walk' | 'custom';
  label: string;
  icon: LucideIcon;
  /** Prefilled title ('' = user names it). */
  title: string;
  /** Prefilled HH:mm. */
  time: string;
}

export const TASK_TEMPLATES: readonly TaskTemplate[] = [
  { key: 'breakfast', label: 'Breakfast', icon: Croissant, title: 'Breakfast', time: '08:00' },
  { key: 'dinner', label: 'Dinner', icon: Utensils, title: 'Dinner', time: '18:00' },
  { key: 'medication', label: 'Medication', icon: Pill, title: '', time: '09:00' },
  { key: 'walk', label: 'Walk', icon: Footprints, title: 'Walk', time: '12:00' },
  { key: 'custom', label: 'Custom', icon: Plus, title: '', time: '09:00' },
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function medLabel(med: Medication): string {
  return [med.name, med.dose].filter(Boolean).join(' ');
}

export function AddTaskSheetContent({
  initialTemplate = null,
  onClose,
}: {
  /** Template preselected by the caller (empty-state Custom chip). */
  initialTemplate?: TaskTemplate | null;
  onClose?: () => void;
}) {
  const { pet } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';
  const medications = useMedications(petId);
  const createTask = useCreateTask(petId);
  const { toast } = useToast();

  const [template, setTemplate] = useState<TaskTemplate | null>(initialTemplate);
  const [medication, setMedication] = useState<Medication | null>(null);
  const [title, setTitle] = useState(initialTemplate?.title ?? '');
  const [time, setTime] = useState(initialTemplate?.time ?? '09:00');
  const [timeError, setTimeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeMeds = medications.data?.active ?? [];
  const showMedPicker = template?.key === 'medication' && activeMeds.length > 0;

  const pickTemplate = (next: TaskTemplate) => {
    haptics.select();
    setTemplate(next);
    setMedication(null);
    setTitle(next.title);
    setTime(next.time);
    setTimeError(null);
  };

  const backToTemplates = () => {
    haptics.light();
    setTemplate(null);
    setMedication(null);
    setTitle('');
    setTimeError(null);
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!petId) return;
    if (!trimmed) {
      toast({ message: 'Add a name for this task' });
      return;
    }
    if (!TIME_RE.test(time)) {
      setTimeError('Use HH:MM, e.g. 08:00');
      return;
    }
    setBusy(true);
    createTask.mutate(
      { title: trimmed, time_of_day: time, medication_id: medication?.id },
      {
        onSuccess: () => {
          haptics.light();
          toast({ message: 'Added to routine' });
          Keyboard.dismiss();
          onClose?.();
        },
        onError: (err) => {
          // spec §64 — short, specific; never "Something went wrong"
          toast({
            message: err instanceof Error && err.name === 'ApiError' ? err.message : 'Could not add task',
          });
        },
        onSettled: () => setBusy(false),
      },
    );
  };

  return (
    <View style={styles.sheet}>
      {template ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to templates"
          onPress={backToTemplates}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
        >
          <ChevronLeft size={16} color={colors.brand700} />
          <Text style={styles.backLabel}>Templates</Text>
        </Pressable>
      ) : null}

      <View>
        <Text style={styles.title}>Add to {petName}&apos;s routine</Text>
        {template ? null : (
          <Text style={styles.hint}>Pick what {petName} does every day.</Text>
        )}
      </View>

      {template ? null : (
        <View style={styles.templateList}>
          {TASK_TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                onPress={() => pickTemplate(t)}
                style={({ pressed }) => [styles.templateRow, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.templateIcon}>
                  <Icon size={20} color={colors.brand700} />
                </View>
                <Text style={styles.templateLabel}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {template ? (
        <View style={styles.form}>
          {showMedPicker ? (
            <View style={styles.medSection}>
              <Text style={styles.medSectionLabel}>Medication</Text>
              {activeMeds.map((med) => {
                const label = medLabel(med);
                const selected = medication?.id === med.id;
                return (
                  <Pressable
                    key={med.id}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      haptics.select();
                      setMedication(selected ? null : med);
                      if (!selected) setTitle(label);
                    }}
                    style={({ pressed }) => [
                      styles.medRow,
                      selected && styles.medRowSelected,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Pill size={18} color={selected ? colors.brand700 : colors.textSecondary} />
                    <Text style={[styles.medRowLabel, selected && { color: colors.brand700 }]} numberOfLines={1}>
                      {label}
                    </Text>
                    {selected ? <Check size={16} color={colors.brand700} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Field
            label="Task"
            placeholder={template.key === 'custom' ? 'e.g. Brush teeth' : 'Name'}
            value={title}
            onChangeText={setTitle}
            autoFocus={template.key === 'custom'}
            returnKeyType="next"
            editable={!busy}
          />
          <Field
            label="Time"
            hint="Circle time, 24-hour"
            placeholder="08:00"
            value={time}
            onChangeText={(t) => {
              setTime(t);
              setTimeError(null);
            }}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            error={timeError}
            editable={!busy}
          />
          <PrimaryButton
            label="Add to routine"
            loading={busy}
            disabled={!title.trim()}
            onPress={submit}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s24,
    gap: spacing.s16,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    alignSelf: 'flex-start',
    minHeight: touchTarget,
    paddingHorizontal: spacing.s8,
    marginTop: -spacing.s4,
    marginLeft: -spacing.s8,
  },
  backLabel: { ...typography.caption, color: colors.brand700, fontWeight: '600' },
  title: { ...typography.section, color: colors.text },
  hint: { ...typography.bodySm, color: colors.textSecondary, marginTop: -spacing.s8 },
  templateList: { gap: spacing.s8 },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    minHeight: touchTarget + 8,
    paddingHorizontal: spacing.s8,
    paddingVertical: spacing.s4,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  templateIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.chip,
    backgroundColor: colors.brand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateLabel: { ...typography.card, color: colors.text },
  form: { gap: spacing.s16 },
  medSection: { gap: spacing.s8 },
  medSectionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    minHeight: touchTarget,
    paddingHorizontal: spacing.s12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  medRowSelected: { backgroundColor: colors.brand100, borderColor: colors.brand300 },
  medRowLabel: { ...typography.bodySm, color: colors.text, flex: 1 },
});

/** Sheet host: scrollable + keyboard-aware via BottomSheetModal options. */
export function AddTaskSheetScrollable(props: { initialTemplate?: TaskTemplate | null; onClose?: () => void }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
      <AddTaskSheetContent {...props} />
    </ScrollView>
  );
}
