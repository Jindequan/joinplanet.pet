/**
 * Timeline renderers (spec §28–§29): a large Card for symptom / visit /
 * medication / attached events, and a compact one-line row for weight and
 * note records — 500 records must not become 500 huge cards.
 */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, motion, radius, spacing, touchTarget, typography } from '../../theme';
import { Card, StatusBadge } from '../ui';
import type { TimelineEvent } from '../../lib/queries';
import { attachmentUrl, compactTitle, eventBadge, eventMeta, formatTime } from './parts';

const THUMB_SIZE = 64; // spec §28 attachment thumbnail row

export function EventLargeCard({
  event,
  onPress,
  tz,
}: {
  event: TimelineEvent;
  onPress: () => void;
  tz?: string;
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
        <Text style={styles.meta}>{eventMeta(event, tz)}</Text>
      </Card>
    </Pressable>
  );
}

export function EventCompactRow({
  event,
  onPress,
  tz,
}: {
  event: TimelineEvent;
  onPress: () => void;
  tz?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={compactTitle(event)}
      onPress={onPress}
      style={({ pressed }) => [styles.compactCard, pressed && styles.compactPressed]}
    >
      <Text style={styles.compactTime}>{formatTime(event.occurred_at, tz)}</Text>
      <View style={styles.compactText}>
        <Text style={styles.compactTitle} numberOfLines={2}>
          {compactTitle(event)}
        </Text>
        {event.body ? (
          <Text style={styles.compactBody} numberOfLines={1}>
            {event.body}
          </Text>
        ) : null}
      </View>
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
  /** 紧凑记录也是卡（2026-08-19 founder 决策：纯文本行像没做完）——与大卡同语言：surface + border。 */
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s12,
    minHeight: touchTarget,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.s8,
  },
  compactPressed: { backgroundColor: colors.surfaceSoft },
  compactTime: {
    ...typography.micro,
    color: colors.textTertiary,
    width: spacing.s32 + spacing.s8,
  },
  compactText: { flex: 1, gap: 1 },
  compactTitle: { ...typography.bodySm, color: colors.text },
  compactBody: { ...typography.micro, color: colors.textTertiary },
  compactBy: { ...typography.caption, color: colors.textTertiary },
});
