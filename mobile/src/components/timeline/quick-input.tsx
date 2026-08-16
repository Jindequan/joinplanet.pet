/**
 * Timeline focus input (spec §27–§28, §32, §39, §80) — the always-present
 * recording card. Enter saves a note instantly (optimistic head insert per
 * spec §63, keyboard away, toast "Saved"); the 📷 button turns a picked
 * photo into a photo record: compress → POST event → multipart attachment
 * bound via event_id (contract F5). Never auto-focus on mount (§80).
 */
import React, { useState } from 'react';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Camera } from 'lucide-react-native';
import { colors, spacing, touchTarget, typography } from '../../theme';
import { Card, IconButton } from '../ui';
import { useToast } from '../toast';
import { haptics } from '../../lib/haptics';
import { ApiError, upload } from '../../lib/api';
import { qk, type TimelineEvent } from '../../lib/queries';
import {
  insertEventIntoFeed,
  removeEventFromFeeds,
  useCreateTimelineEvent,
} from './feed';

interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Compress before upload (spec §39): max side 1600, JPEG quality 0.8. */
async function compressForUpload(uri: string, width: number, height: number): Promise<string> {
  const actions =
    Math.max(width, height) > 1600
      ? [{ resize: width >= height ? { width: 1600 } : { height: 1600 } }]
      : [];
  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

export function QuickInputCard({
  petId,
  petName,
  /** Active feed key — passed only when notes are visible under the current filter. */
  optimisticKey,
}: {
  petId: string | undefined;
  petName: string;
  optimisticKey?: QueryKey;
}) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const createEvent = useCreateTimelineEvent(petId);

  const busy = uploading || createEvent.isPending;

  const saveFailure = (err: unknown) => {
    // spec §64: short and specific — never "Something went wrong"
    toast({
      message:
        err instanceof ApiError && err.message && !err.message.startsWith('Request failed')
          ? err.message
          : 'Could not save',
    });
  };

  /** Enter → instant note (spec §32/§63): optimistic head insert, toast, keyboard away. */
  const submitNote = () => {
    const value = text.trim();
    if (!value || !petId || busy) return;
    const tempId = `temp-${Math.random().toString(36).slice(2)}`;
    const optimistic: TimelineEvent = {
      id: tempId,
      type: 'note',
      occurred_at: new Date().toISOString(),
      title: value,
      by_name: 'You',
      source: 'manual',
      attachments: [],
    };
    if (optimisticKey) insertEventIntoFeed(client, optimisticKey, optimistic);
    setText('');
    Keyboard.dismiss();
    void (async () => {
      try {
        await createEvent.mutateAsync({ type: 'note', title: value });
        haptics.light();
        toast({ message: 'Saved' });
      } catch (err) {
        if (optimisticKey) setText(value); // keep the draft (spec §65)
        saveFailure(err);
      } finally {
        removeEventFromFeeds(client, petId, tempId);
      }
    })();
  };

  /** 📷 → photo quick record: compress → POST event → multipart attachment (F5). */
  const runPhotoFlow = async (
    photo: PickedPhoto,
    caption: string,
    existingEventId?: string,
  ): Promise<void> => {
    if (!petId) return;
    setUploading(true);
    let eventId = existingEventId;
    try {
      const uri = await compressForUpload(photo.uri, photo.width, photo.height);
      if (!eventId) {
        const event = await createEvent.mutateAsync({
          type: 'photo',
          title: caption || 'Photo',
        });
        eventId = event.id;
      }
      const form = new FormData();
      form.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
      form.append('event_id', eventId);
      await upload(`/pets/${petId}/attachments`, form);
      // pull the attachment url into the cached event
      void client.invalidateQueries({ queryKey: qk.timeline(petId) });
      haptics.light();
      toast({ message: 'Saved' });
      setText('');
      Keyboard.dismiss();
    } catch (err) {
      // spec §39/§64: keep the caption and retry against the same event
      toast({
        message: "Photo couldn't be uploaded.",
        action: { label: 'Retry', onPress: () => void runPhotoFlow(photo, caption, eventId) },
        duration: 5000,
      });
      void err;
    } finally {
      setUploading(false);
    }
  };

  const pickPhoto = async () => {
    if (busy || !petId) return;
    haptics.light();
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
    void runPhotoFlow(
      { uri: asset.uri, width: asset.width, height: asset.height },
      text.trim(),
    );
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder={`Record something about ${petName}…`}
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          returnKeyType="done"
          onSubmitEditing={submitNote}
          editable={!uploading}
          accessibilityLabel={`Quick note about ${petName}`}
        />
        <IconButton
          icon={Camera}
          label="Add photo"
          onPress={() => void pickPhoto()}
          disabled={uploading}
          color={colors.textSecondary}
        />
      </View>
      <Text style={styles.hint}>
        {uploading ? 'Uploading…' : 'Save now, add details later'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.s4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.s4 },
  input: {
    flex: 1,
    ...typography.bodySm,
    color: colors.text,
    minHeight: touchTarget,
    paddingVertical: spacing.s8,
  },
  hint: { ...typography.micro, color: colors.textTertiary, paddingLeft: spacing.s4 },
});
