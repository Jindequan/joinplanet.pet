/**
 * Quick Record (spec §35–§39) — "Record what happened", not a universal create.
 * Five record types; default occurred_at = now; optimistic timeline insert + toast.
 */
import React, { useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'expo-image';
import {
  Camera,
  Check,
  HeartPulse,
  Scale,
  StickyNote,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, radius, spacing, typography, withAlpha } from '../theme';
import { Card, Chip, Field, PrimaryButton } from './ui';
import { useToast } from './toast';
import { haptics } from '../lib/haptics';
import { useActivePet, useCreateEvent } from '../lib/queries';
import { upload } from '../lib/api';

type RecordType = 'note' | 'symptom' | 'weight' | 'visit' | 'photo';

interface TypeOption {
  key: RecordType;
  label: string;
  icon: LucideIcon;
  color: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  { key: 'note', label: 'Note', icon: StickyNote, color: colors.textSecondary },
  { key: 'symptom', label: 'Symptom', icon: HeartPulse, color: colors.symptom },
  { key: 'weight', label: 'Weight', icon: Scale, color: colors.medication },
  { key: 'visit', label: 'Vet visit', icon: Stethoscope, color: colors.success },
  { key: 'photo', label: 'Photo', icon: Camera, color: colors.brand700 },
];

const SEVERITIES = ['Mild', 'Moderate', 'Severe'] as const;
const SEVERITY_TO_API: Record<(typeof SEVERITIES)[number], 'mild' | 'moderate' | 'severe'> = {
  Mild: 'mild',
  Moderate: 'moderate',
  Severe: 'severe',
};

/** Compress before upload (spec §39): max side 1600, JPEG quality 0.8. */
async function compressForUpload(uri: string, width: number, height: number): Promise<string> {
  const actions =
    Math.max(width, height) > 1600
      ? [{ resize: width >= height ? { width: 1600 } : { height: 1600 } }]
      : [];
  const result = await ImageManipulator.manipulateAsync(
    uri,
    actions,
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

export function QuickRecord({ onClose }: { onClose?: () => void }) {
  const { pet } = useActivePet();
  const petId = pet?.id;
  const petName = pet?.name ?? 'your pet';
  const { toast } = useToast();

  const [type, setType] = useState<RecordType | null>(null);
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);

  const createEvent = useCreateEvent(petId);

  const reset = () => {
    setType(null);
    setText('');
    setSeverity(null);
    setPhoto(null);
  };

  const finish = () => {
    reset();
    Keyboard.dismiss();
    onClose?.();
  };

  const fail = (err: unknown) => {
    // spec §64: short, specific messages — never "Something went wrong"
    const message =
      err instanceof Error && err.message && err.name === 'ApiError' ? err.message : 'Could not save';
    toast({ message });
  };

  /** Create a timeline event; useCreateEvent inserts optimistically + invalidates. */
  const saveEvent = async (input: {
    type: RecordType;
    title: string;
    severity?: 'mild' | 'moderate' | 'severe';
    data?: Record<string, unknown>;
  }) => {
    if (!petId) return;
    setBusy(true);
    try {
      await createEvent.mutateAsync({
        type: input.type,
        title: input.title,
        severity: input.severity,
        data: input.data,
        occurred_at: new Date().toISOString(),
      });
      haptics.light();
      toast({ message: 'Saved' });
      finish();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const saveTextRecord = (t: 'note' | 'symptom' | 'visit') => {
    const value = text.trim();
    if (!value || busy) return;
    void saveEvent({
      type: t,
      title: value,
      severity: t === 'symptom' && severity ? SEVERITY_TO_API[severity] : undefined,
    });
  };

  const saveWeight = () => {
    const kg = Number.parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0 || busy) {
      toast({ message: 'Enter a valid weight' });
      return;
    }
    void saveEvent({
      type: 'weight',
      title: `${kg} kg`,
      data: { weight_kg: kg }, // contract F5: weight requires numeric data.weight_kg
    });
  };

  /** Pick only — the preview and caption stay local until Save (spec §39). */
  const pickPhoto = async () => {
    if (busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast({ message: 'Photo access is needed to add photos' });
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  /** Save photo: create event, then upload attachment bound via event_id (contract F5). */
  const savePhoto = async () => {
    if (!petId || !photo) return;
    setBusy(true);
    try {
      const uri = await compressForUpload(photo.uri, photo.width, photo.height);
      const event = await createEvent.mutateAsync({
        type: 'photo',
        title: text.trim() || 'Photo',
        occurred_at: new Date().toISOString(),
      });
      const form = new FormData();
      form.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
      form.append('event_id', event.id);
      await upload(`/pets/${petId}/attachments`, form);
      haptics.light();
      toast({ message: 'Saved' });
      finish();
    } catch (err) {
      // spec §39: on failure keep the local preview + caption, offer Retry
      toast({
        message: 'Upload failed',
        action: { label: 'Retry', onPress: () => void savePhoto() },
        duration: 5000,
      });
      void err;
    } finally {
      setBusy(false);
    }
  };

  const typeRow = useMemo(
    () => (
      <View style={styles.typeRow}>
        {TYPE_OPTIONS.map((option) => {
          const active = type === option.key;
          const Icon = option.icon;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              onPress={() => {
                haptics.select();
                setText('');
                setSeverity(null);
                setType(active ? null : option.key);
              }}
              style={({ pressed }) => [
                styles.typeButton,
                active && { backgroundColor: withAlpha(option.color, 0.1) },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Icon size={22} color={active ? option.color : colors.textSecondary} />
              <Text style={[styles.typeLabel, active && { color: option.color }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ),
    [type],
  );

  if (!petId) {
    return (
      <View style={styles.sheet}>
        <Text style={styles.title}>Quick record</Text>
        <Text style={styles.hint}>Add a pet first to start recording.</Text>
      </View>
    );
  }

  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Quick record</Text>
      <Text style={styles.hint}>Record what happened to {petName}.</Text>

      {typeRow}

      {type === 'note' ? (
        <Field
          label="Note"
          placeholder="Anything worth remembering?"
          value={text}
          onChangeText={setText}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => saveTextRecord('note')}
          editable={!busy}
        />
      ) : null}

      {type === 'symptom' ? (
        <View style={styles.formGap}>
          <Field
            label="What happened?"
            placeholder="e.g. Vomited twice"
            value={text}
            onChangeText={setText}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => saveTextRecord('symptom')}
            editable={!busy}
          />
          <View>
            <Text style={styles.severityLabel}>Severity (optional)</Text>
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
          <PrimaryButton
            label="Save"
            loading={busy}
            disabled={!text.trim()}
            onPress={() => saveTextRecord('symptom')}
          />
        </View>
      ) : null}

      {type === 'weight' ? (
        <View style={styles.formGap}>
          <Field
            label="Weight (kg)"
            placeholder="e.g. 5.2"
            value={text}
            onChangeText={setText}
            autoFocus
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={saveWeight}
            editable={!busy}
          />
          <PrimaryButton label="Save" loading={busy} onPress={saveWeight} />
        </View>
      ) : null}

      {type === 'visit' ? (
        <Field
          label="Vet visit"
          placeholder="Reason or outcome"
          value={text}
          onChangeText={setText}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => saveTextRecord('visit')}
          editable={!busy}
        />
      ) : null}

      {type === 'photo' ? (
        <View style={styles.formGap}>
          {photo ? (
            <Card padding={spacing.s8}>
              <Image source={{ uri: photo.uri }} style={styles.photoPreview} contentFit="cover" />
              <View style={styles.photoMeta}>
                <Text style={styles.photoStatus}>{busy ? 'Uploading…' : 'Ready to save'}</Text>
                {busy ? null : <Check size={16} color={colors.success} />}
              </View>
            </Card>
          ) : null}
          <Field
            label="Caption (optional)"
            placeholder="Add a caption"
            value={text}
            onChangeText={setText}
            editable={!busy}
          />
          <PrimaryButton
            label={photo ? 'Save' : 'Choose photo'}
            loading={busy}
            icon={Camera}
            onPress={() => (photo ? void savePhoto() : void pickPhoto())}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: spacing.s16,
    paddingBottom: spacing.s24,
    paddingTop: spacing.s8,
    gap: spacing.s16,
  },
  title: { ...typography.section, color: colors.text },
  hint: { ...typography.bodySm, color: colors.textSecondary, marginTop: -spacing.s8 },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s4,
  },
  typeButton: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s8,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s12,
    minHeight: 76,
  },
  typeLabel: { ...typography.micro, color: colors.textSecondary, textAlign: 'center' },
  formGap: { gap: spacing.s16 },
  severityLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.s8,
  },
  severityRow: { flexDirection: 'row', gap: spacing.s8 },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceSoft,
  },
  photoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s8,
    paddingVertical: spacing.s8,
  },
  photoStatus: { ...typography.caption, color: colors.textSecondary },
});

/** Sheet host wrapper: scrollable, keyboard-aware via BottomSheetModal. */
export function QuickRecordScrollable(props: { onClose?: () => void }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
      <QuickRecord {...props} />
    </ScrollView>
  );
}
