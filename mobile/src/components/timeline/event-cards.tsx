/**
 * Timeline renderers (spec §28–§29): a large Card for symptom / visit /
 * medication / attached events, and a compact one-line row for weight and
 * note records — 500 records must not become 500 huge cards.
 */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { colors, motion, radius, spacing, touchTarget, typography } from '../../theme';
import { Card, StatusBadge } from '../ui';
import type { TimelineEvent } from '../../lib/queries';
import { attachmentUrl, compactTitle, eventBadge, eventMeta, formatTime } from './parts';

const THUMB_SIZE = 64; // spec §28 attachment thumbnail row

export function EventLargeCard({
  event,
  onPress,
}: {
  event: TimelineEvent;
  onPress: () => void;
}) {
  const badge = eventBadge(event);
  const attachments = event.attachments ?? [];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={onPress}
      style={({ pressed }) => [styles.press, pressed && styles.pressed]}
    >
      <Card style={styles.card}>
        <StatusBadge label={badge.label} variant={badge.variant} />
        <Text style={styles.title}>{event.title}</Text>
        {event.body ? (
          <Text style={styles.body} numberOfLines={4}>
            {event.body}
          </Text>
        ) : null}
        {attachments.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbs}
          >
            {attachments.map((attachment) => (
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
                  style={styles.thumb}
                  contentFit="cover"
                  transition={motion.card}
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Text style={styles.meta}>{eventMeta(event)}</Text>
      </Card>
    </Pressable>
  );
}

export function EventCompactRow({
  event,
  onPress,
}: {
  event: TimelineEvent;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={compactTitle(event)}
      onPress={onPress}
      style={({ pressed }) => [styles.compact, pressed && styles.compactPressed]}
    >
      <Text style={styles.compactTime}>{formatTime(event.occurred_at)}</Text>
      <Text style={styles.compactTitle} numberOfLines={1}>
        {compactTitle(event)}
      </Text>
      {event.by_name ? (
        <Text style={styles.compactBy} numberOfLines={1}>
          {event.by_name}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { marginBottom: spacing.s8 },
  pressed: { opacity: 0.85 },
  card: { gap: spacing.s8 },
  title: { ...typography.body, color: colors.text },
  body: { ...typography.caption, color: colors.textSecondary },
  thumbs: { flexDirection: 'row', gap: spacing.s8, paddingVertical: spacing.s4 },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceSoft,
  },
  meta: { ...typography.micro, color: colors.textTertiary },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s12,
    minHeight: touchTarget,
    borderRadius: radius.input,
    marginBottom: spacing.s4,
  },
  compactPressed: { backgroundColor: colors.surfaceSoft },
  compactTime: {
    ...typography.micro,
    color: colors.textTertiary,
    width: spacing.s32 + spacing.s8,
  },
  compactTitle: { flex: 1, ...typography.bodySm, color: colors.text },
  compactBy: { ...typography.caption, color: colors.textTertiary },
});
