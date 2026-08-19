/**
 * Recorder (flomo-inspired, spec §27–§28, §32, §39, §63, §80) — the
 * always-present input card IS the record surface: a growing multi-line
 * input, inline type chips, contextual extras, and an inline Save. No sheet,
 * no modal dance — type → save → keep typing.
 *
 * Enter saves (note fast path); the Save button covers every type. Save is
 * optimistic (head insert into every matching feed, spec §63), keeps the
 * draft on failure (spec §65), clears on success while the type stays
 * selected for batch entry.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { colors, radius, spacing, touchTarget, typography, withAlpha } from '../../theme';
import { Card, Chip } from '../ui';
import { useToast } from '../toast';
import { haptics } from '../../lib/haptics';
import { ApiError } from '../../lib/api';
import { type TimelineEvent } from '../../lib/queries';
import {
  insertEventIntoMatchingFeeds,
  removeEventFromFeeds,
  useCreateTimelineEvent,
  type CreateTimelineEventInput,
} from './feed';

type RecordType = 'note' | 'symptom' | 'weight' | 'visit' | 'vaccine';

/** User-facing type language (spec §30) + per-type input shape. */
const TYPES: {
  key: RecordType;
  label: string;
  placeholder: string;
  keyboard: 'default' | 'decimal-pad';
}[] = [
  { key: 'note', label: 'Note', placeholder: 'Record something…', keyboard: 'default' },
  { key: 'symptom', label: 'Health', placeholder: 'What happened? e.g. Vomited twice', keyboard: 'default' },
  { key: 'weight', label: 'Weight', placeholder: 'Weight in kg, e.g. 5.2', keyboard: 'decimal-pad' },
  { key: 'visit', label: 'Visit', placeholder: 'Visit reason or outcome', keyboard: 'default' },
  { key: 'vaccine', label: 'Vaccine', placeholder: 'e.g. Rabies vaccine', keyboard: 'default' },
];

const SEVERITIES = ['Mild', 'Moderate', 'Severe'] as const;
type Severity = (typeof SEVERITIES)[number];
const SEVERITY_TO_API: Record<Severity, 'mild' | 'moderate' | 'severe'> = {
  Mild: 'mild',
  Moderate: 'moderate',
  Severe: 'severe',
};

/** "20260901" → "2026-09-01" while typing; backspace-friendly. */
function autoformatDue(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function isValidDue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayjs(value).isValid();
}

export function QuickInputCard({
  petId,
  petName,
  /** Archived pets are read-only (V1.5): the input is replaced by a notice. */
  archived = false,
}: {
  petId: string | undefined;
  petName: string;
  archived?: boolean;
}) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [type, setType] = useState<RecordType>('note');
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [nextDue, setNextDue] = useState('');
  const [dueError, setDueError] = useState<string | null>(null);
  const createEvent = useCreateTimelineEvent(petId);

  const busy = createEvent.isPending;
  const typeMeta = TYPES.find((t) => t.key === type) ?? TYPES[0];

  const selectType = (key: RecordType) => {
    if (key === type) return;
    haptics.select();
    setType(key);
    setSeverity(null);
    setNextDue('');
    setDueError(null);
  };

  /** Validate the current draft → request input, or a toast on bad input. */
  const buildInput = (): CreateTimelineEventInput | null => {
    const value = text.trim();
    const data: Record<string, unknown> | undefined =
      type === 'visit' || type === 'vaccine'
        ? nextDue.trim()
          ? { next_due: nextDue.trim() }
          : undefined
        : undefined;
    if (nextDue.trim() && !isValidDue(nextDue.trim())) {
      setDueError('Use a date like 2026-09-01');
      return null;
    }
    setDueError(null);
    switch (type) {
      case 'note':
        if (!value) return null;
        return { type: 'note', title: value };
      case 'symptom':
        if (!value) return null;
        return {
          type: 'symptom',
          title: value,
          severity: severity ? SEVERITY_TO_API[severity] : undefined,
        };
      case 'weight': {
        const kg = Number.parseFloat(text.replace(',', '.'));
        if (!Number.isFinite(kg) || kg <= 0 || kg > 200) {
          toast({ message: 'Enter a weight in kg, e.g. 5.2' });
          return null;
        }
        return { type: 'weight', title: `${kg} kg`, body: String(kg) };
      }
      case 'visit':
        if (!value) return null;
        return { type: 'visit', title: value, data };
      case 'vaccine':
        if (!value) return null;
        return { type: 'vaccine', title: value, data };
    }
  };

  /** Optimistic head insert (spec §63) — temp row removed once the server copy lands. */
  const save = () => {
    if (!petId || busy) return;
    const input = buildInput();
    if (!input) return;
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const optimistic: TimelineEvent = {
      id: tempId,
      type: input.type === 'visit' ? 'vet_visit' : input.type,
      occurred_at: new Date().toISOString(),
      title: input.title,
      severity: input.severity,
      by_name: 'You',
      source: 'manual',
      attachments: [],
    };
    const draft = { text, severity, nextDue };
    insertEventIntoMatchingFeeds(client, petId, optimistic);
    setText('');
    void (async () => {
      try {
        await createEvent.mutateAsync(input);
        haptics.light();
        toast({ message: 'Saved' });
        setSeverity(null);
        setNextDue('');
        setDueError(null);
      } catch (err) {
        // Restore the draft exactly as typed (spec §65).
        setText(draft.text);
        setSeverity(draft.severity);
        setNextDue(draft.nextDue);
        toast({
          message:
            err instanceof ApiError && err.message && !err.message.startsWith('Request failed')
              ? err.message
              : 'Could not save',
        });
      } finally {
        removeEventFromFeeds(client, petId, tempId);
      }
    })();
  };

  if (archived) {
    return (
      <Card style={styles.card}>
        <Text style={styles.archivedHint}>
          {petName} is archived and read-only — unarchive them in Data &amp; Privacy to add to the
          timeline.
        </Text>
      </Card>
    );
  }

  const canSave =
    !busy &&
    (type === 'weight'
      ? Number.isFinite(Number.parseFloat(text.replace(',', '.'))) &&
        Number.parseFloat(text.replace(',', '.')) > 0
      : !!text.trim());

  return (
    <Card style={styles.card} padding={spacing.s12}>
      <TextInput
        style={styles.input}
        placeholder={`${typeMeta.placeholder}${
          type === 'note' ? ` about ${petName}` : ''
        }`}
        placeholderTextColor={colors.textTertiary}
        value={text}
        onChangeText={setText}
        multiline
        returnKeyType={type === 'note' || type === 'weight' ? 'done' : 'default'}
        onSubmitEditing={save}
        keyboardType={typeMeta.keyboard}
        editable={!busy}
        accessibilityLabel={`Record ${typeMeta.label.toLowerCase()} for ${petName}`}
      />

      {/* Contextual extras — only the row the selected type needs. */}
      {type === 'symptom' ? (
        <View style={styles.extraRow}>
          <Text style={styles.extraLabel}>Severity</Text>
          <View style={styles.severityRow}>
            {SEVERITIES.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={severity === s}
                onPress={() => setSeverity(severity === s ? null : s)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {(type === 'visit' || type === 'vaccine') && (text.trim() || nextDue) ? (
        <View style={styles.extraRow}>
          <Text style={styles.extraLabel}>Next due (optional)</Text>
          <TextInput
            style={[styles.dueInput, dueError ? styles.dueInputError : null]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textTertiary}
            value={nextDue}
            onChangeText={(v) => {
              setNextDue(autoformatDue(v));
              if (dueError) setDueError(null);
            }}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
            editable={!busy}
            accessibilityLabel="Next due date"
          />
          {dueError ? <Text style={styles.dueError}>{dueError}</Text> : null}
        </View>
      ) : null}

      {type === 'weight' && text.trim() ? (
        <Text style={styles.weightPreview}>
          {(() => {
            const kg = Number.parseFloat(text.replace(',', '.'));
            return Number.isFinite(kg) && kg > 0 ? `Will record ${kg} kg` : 'Enter a number, e.g. 5.2';
          })()}
        </Text>
      ) : null}

      {/* Toolbar: type chips + Save (flomo's tag row + Record button). */}
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {TYPES.map((t) => (
            <Chip
              key={t.key}
              label={t.label}
              selected={type === t.key}
              onPress={() => selectType(t.key)}
            />
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save record"
          accessibilityState={{ disabled: !canSave, busy }}
          disabled={!canSave}
          onPress={save}
          style={({ pressed }) => [
            styles.saveButton,
            pressed && { opacity: 0.85 },
            !canSave && { opacity: 0.4 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.onDark} size="small" />
          ) : (
            <Text style={styles.saveLabel}>Save</Text>
          )}
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.s8 },
  input: {
    ...typography.body,
    color: colors.text,
    minHeight: touchTarget + 8,
    maxHeight: 120, // ~4 lines, then it scrolls inside
    paddingVertical: spacing.s8,
    paddingHorizontal: spacing.s4,
    textAlignVertical: 'top',
  },
  extraRow: { gap: spacing.s4, paddingHorizontal: spacing.s4 },
  extraLabel: { ...typography.micro, color: colors.textSecondary, fontWeight: '600' },
  severityRow: { flexDirection: 'row', gap: spacing.s8 },
  dueInput: {
    ...typography.bodySm,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    minHeight: touchTarget - 8,
    paddingHorizontal: spacing.s12,
    width: 180,
  },
  dueInputError: { borderColor: colors.symptom },
  dueError: { ...typography.micro, color: colors.symptom },
  weightPreview: {
    ...typography.micro,
    color: colors.textTertiary,
    paddingHorizontal: spacing.s4,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
    borderTopWidth: 1,
    borderTopColor: withAlpha(colors.border, 0.6),
    paddingTop: spacing.s8,
  },
  chips: { gap: spacing.s8, paddingVertical: spacing.s4 },
  saveButton: {
    minHeight: touchTarget - 8,
    borderRadius: radius.button,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s20,
  },
  saveLabel: { ...typography.card, color: colors.onDark, fontWeight: '600' },
  archivedHint: { ...typography.bodySm, color: colors.textSecondary },
});
