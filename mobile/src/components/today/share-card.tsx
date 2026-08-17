/**
 * Share Today Card (spec §26) — the image card families drop into the group
 * chat: "{pet} · Today" header with the pet's real photo (§84), ✓/○ task rows
 * and the PLANET wordmark bottom-right. Rendered off-screen inside a ViewShot
 * (see app/(tabs)/index.tsx) and captured to a PNG on demand; every visual
 * value is a theme token so the card stays on-system as it evolves.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { colors, radius, shadows, spacing, typography } from '../../theme';
import { PetPhoto } from '../pet-photo';

/** Card export width (spec §26) — ~2× a phone column so text stays crisp after capture. */
export const SHARE_CARD_WIDTH = 640;
/** Park the live view far above the viewport: laid out and capturable, never visible. */
const OFFSCREEN_TOP = -10000;
/** PLANET wordmark tracking — wide, quiet, uppercase (spec §26). */
const WORDMARK_LETTER_SPACING = 4;

const AVATAR_SIZE = 48;

export interface ShareCardTask {
  title: string;
  done: boolean;
  by_name?: string;
}

export function ShareCard({
  petName,
  avatarKey,
  date,
  tasks,
}: {
  petName: string;
  avatarKey?: string | null;
  date: string;
  tasks: ShareCardTask[];
}) {
  const parsed = dayjs(date);
  const dateLabel = parsed.isValid() ? parsed.format('dddd · MMM D') : date;

  return (
    <View collapsable={false} pointerEvents="none" style={styles.offscreen}>
      <View style={styles.card}>
        <View style={styles.header}>
          <PetPhoto avatarKey={avatarKey} name={petName} size={AVATAR_SIZE} />
          <View>
            <Text style={styles.title}>{petName || 'Your pet'} · Today</Text>
            <Text style={styles.dateLabel}>{dateLabel}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.list}>
          {tasks.map((task, i) => (
            <Text
              key={`${i}-${task.title}`}
              style={task.done ? styles.rowDone : styles.rowPending}
            >
              {task.done ? (
                <Text style={styles.markDone}>✓ </Text>
              ) : (
                <Text style={styles.markPending}>○ </Text>
              )}
              {task.title}
              {task.done && task.by_name ? ` · ${task.by_name}` : null}
            </Text>
          ))}
        </View>

        <Text style={styles.wordmark}>PLANET</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    top: OFFSCREEN_TOP,
    left: 0,
    width: SHARE_CARD_WIDTH,
  },
  card: {
    width: SHARE_CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radius.hero,
    padding: spacing.s40,
    gap: spacing.s24,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s16,
  },
  title: { ...typography.card, color: colors.text },
  dateLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.s4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  list: { gap: spacing.s12 },
  rowDone: { ...typography.body, color: colors.success },
  rowPending: { ...typography.body, color: colors.textTertiary },
  markDone: { fontWeight: '700' },
  markPending: { fontWeight: '700' },
  wordmark: {
    ...typography.micro,
    color: colors.textTertiary,
    letterSpacing: WORDMARK_LETTER_SPACING,
    textAlign: 'right',
  },
});
