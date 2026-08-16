/**
 * Event detail (spec §34, contract F5): large title, "MMM D · HH:mm", body,
 * full-width attachments, "Recorded by {name} · {source}", and Edit (inline
 * PATCH title/body/severity) / Delete (confirm + DELETE). Edit and Delete
 * never live on the list itself. Data is read from the timeline cache; a
 * miss (deleted elsewhere / cold link) renders an EmptyState.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { CalendarDays, ChevronLeft, Pencil } from 'lucide-react-native';
import {
  Card,
  Chip,
  EmptyState,
  Field,
  IconButton,
  PrimaryButton,
  SecondaryButton,
} from '../../src/components/ui';
import { useToast } from '../../src/components/toast';
import { haptics } from '../../src/lib/haptics';
import { ApiError } from '../../src/lib/api';
import { useActivePet, useUpdateEvent, type TimelineEvent } from '../../src/lib/queries';
import { findEventInCache, useDeleteTimelineEvent } from '../../src/components/timeline/feed';
import {
  attachmentUrl,
  formatDetailDate,
  sourceLabel,
} from '../../src/components/timeline/parts';
import { colors, motion, radius, spacing, touchTarget, typography } from '../../src/theme';

type Severity = 'mild' | 'moderate' | 'severe';

const SEVERITY_OPTIONS: { label: string; value: Severity }[] = [
  { label: 'Mild', value: 'mild' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' },
];

function asSeverity(raw: unknown): Severity | null {
  return raw === 'mild' || raw === 'moderate' || raw === 'severe' ? raw : null;
}

function normalizeId(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? decodeURIComponent(value) : '';
}

function errText(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.message && !err.message.startsWith('Request failed')) {
    return err.message;
  }
  return fallback;
}

/** Destructive CTA — the one place red appears on this screen (spec §87). */
function DangerButton({
  label,
  onPress,
  loading,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dangerButton,
        pressed && { opacity: 0.85 },
        loading && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onDark} size="small" />
      ) : (
        <Text style={styles.dangerLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ eventID?: string | string[] }>();
  const eventId = normalizeId(params.eventID);
  const client = useQueryClient();
  const { pet } = useActivePet();
  const petId = pet?.id;
  const { toast } = useToast();

  const [event, setEvent] = useState<TimelineEvent | null>(() =>
    findEventInCache(client, eventId),
  );
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const updateEvent = useUpdateEvent(petId);
  const deleteEvent = useDeleteTimelineEvent(petId);

  // Cold links can land before the timeline cache is read — retry per param change.
  useEffect(() => {
    setEvent((prev) => prev ?? findEventInCache(client, eventId));
  }, [client, eventId]);

  if (!event) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}>
          <EmptyState
            icon={CalendarDays}
            title="This record isn't available."
            subtitle="It may have been deleted."
            action={{ label: 'Back', onPress: () => router.back() }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const startEdit = () => {
    setTitle(event.title);
    setBodyText(event.body ?? '');
    setSeverity(asSeverity(event.severity));
    setEditing(true);
  };

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast({ message: 'Add a title first' });
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const updated = await updateEvent.mutateAsync({
        eventId: event.id,
        patch: {
          title: trimmed,
          body: bodyText.trim(),
          ...(severity ? { severity } : {}),
        },
      });
      setEvent(updated);
      setEditing(false);
      haptics.light();
      toast({ message: 'Saved' });
    } catch (err) {
      toast({ message: errText(err, "Couldn't save changes.") });
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    haptics.delete();
    try {
      await deleteEvent.mutateAsync({ eventId: event.id });
      toast({ message: 'Deleted' });
      router.back();
    } catch (err) {
      toast({ message: errText(err, "Couldn't delete this record.") });
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete this record?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void performDelete() },
    ]);
  };

  const recorder = [
    event.by_name ? `Recorded by ${event.by_name}` : null,
    sourceLabel(event.source),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <IconButton icon={ChevronLeft} label="Back" onPress={() => router.back()} />
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleBlock}>
          <Text style={styles.titleText}>{event.title}</Text>
          <Text style={styles.dateText}>{formatDetailDate(event.occurred_at)}</Text>
        </View>

        {event.body ? <Text style={styles.bodyText}>{event.body}</Text> : null}

        {(event.attachments ?? []).map((attachment) => (
          <Pressable
            key={attachment.id}
            accessibilityRole="imagebutton"
            accessibilityLabel="Open photo"
            onPress={() =>
              Linking.openURL(attachmentUrl(attachment.url)).catch(() => undefined)
            }
          >
            <Image
              source={{ uri: attachmentUrl(attachment.url) }}
              style={styles.heroImage}
              contentFit="cover"
              transition={motion.card}
            />
          </Pressable>
        ))}

        {recorder ? <Text style={styles.recordedBy}>{recorder}</Text> : null}

        {editing ? (
          <Card style={styles.editCard}>
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              returnKeyType="done"
            />
            <Field
              label="Details"
              placeholder="Add details (optional)"
              value={bodyText}
              onChangeText={setBodyText}
              multiline
            />
            <View>
              <Text style={styles.severityLabel}>Severity (optional)</Text>
              <View style={styles.severityRow}>
                {SEVERITY_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={severity === option.value}
                    onPress={() =>
                      setSeverity(severity === option.value ? null : option.value)
                    }
                  />
                ))}
              </View>
            </View>
            <View style={styles.buttonRow}>
              <SecondaryButton
                label="Cancel"
                onPress={() => setEditing(false)}
                style={styles.flex}
              />
              <PrimaryButton
                label="Save"
                loading={saving}
                disabled={!title.trim()}
                onPress={() => void save()}
                style={styles.flex}
              />
            </View>
          </Card>
        ) : (
          <View style={styles.actions}>
            <SecondaryButton label="Edit record" icon={Pencil} onPress={startEdit} />
            <DangerButton
              label="Delete record"
              loading={deleting}
              onPress={confirmDelete}
            />
          </View>
        )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s8,
    paddingVertical: spacing.s4,
  },
  headerSpacer: { width: touchTarget },
  content: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s32,
    gap: spacing.s16,
  },
  titleBlock: { gap: spacing.s4 },
  titleText: { ...typography.page, color: colors.text },
  dateText: { ...typography.bodySm, color: colors.textSecondary },
  bodyText: { ...typography.body, color: colors.text },
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceSoft,
  },
  recordedBy: { ...typography.caption, color: colors.textSecondary },
  editCard: { gap: spacing.s12 },
  severityLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.s8,
  },
  severityRow: { flexDirection: 'row', gap: spacing.s8 },
  buttonRow: { flexDirection: 'row', gap: spacing.s12, marginTop: spacing.s4 },
  flex: { flex: 1 },
  actions: { gap: spacing.s12, marginTop: spacing.s8 },
  dangerButton: {
    minHeight: touchTarget + spacing.s4,
    borderRadius: radius.button,
    backgroundColor: colors.symptom,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s20,
    paddingVertical: spacing.s12,
  },
  dangerLabel: { ...typography.card, color: colors.onDark, fontWeight: '600' },
});
