/**
 * Today Hero (spec §17 §25): ~160 high, Brand100 base with the faintest brand
 * wash (flat tokens + soft circles stand in for a gradient — no gradient lib),
 * TODAY micro label + weekday date in the circle's clock, daypart greeting
 * ("All cared for today." when everything is resolved — success is a light
 * tint only, never confetti), dot progress, pet-initial avatar, share ↗.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight } from 'lucide-react-native';
import { colors, radius, spacing, typography, withAlpha } from '../../theme';
import { IconButton, Progress } from '../ui';
import { greetingFor, nowInZone } from './time';

const HERO_HEIGHT = 160;
const AVATAR_SIZE = 44;
/** Dots are per-task; past this count the text row already tells the story. */
const MAX_DOTS = 12;

export function Hero({
  petName,
  timezone,
  done,
  total,
  onShare,
}: {
  petName: string;
  timezone?: string | null;
  done: number;
  total: number;
  onShare: () => void;
}) {
  const now = nowInZone(timezone);
  const allDone = total > 0 && done >= total;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <View
      style={styles.card}
      accessibilityLabel={`Today. ${
        allDone ? 'All cared for today.' : greetingFor(now.hour(), petName)
      } ${done} of ${total} complete.`}
    >
      {/* decorative brand wash */}
      <View style={styles.washBig} pointerEvents="none" />
      <View style={styles.washSmall} pointerEvents="none" />

      <View>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.todayLabel}>TODAY</Text>
            <Text style={styles.dateLabel}>{now.format('dddd · MMM D')}</Text>
          </View>
          <IconButton
            icon={ArrowUpRight}
            label="Share today's care"
            onPress={onShare}
            color={colors.brand700}
            style={styles.shareButton}
          />
        </View>
        <Text style={[styles.greeting, allDone && styles.greetingDone]} numberOfLines={1}>
          {allDone ? 'All cared for today.' : greetingFor(now.hour(), petName)}
        </Text>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressRow}>
          <Text style={[styles.progressText, allDone && styles.progressDone]}>
            {done} of {total} complete
          </Text>
          <Text style={[styles.percent, allDone && styles.progressDone]}>{percent}%</Text>
        </View>
        <Progress
          count={Math.min(total, MAX_DOTS)}
          filled={Math.min(done, MAX_DOTS)}
          dotSize={8}
          gap={spacing.s8}
        />
      </View>

      {/* pet-initial avatar placeholder (spec §84: real photo once avatar_key ships) */}
      <View style={styles.avatar} pointerEvents="none">
        <Text style={styles.avatarLabel}>{petName.charAt(0).toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: HERO_HEIGHT,
    borderRadius: radius.hero,
    backgroundColor: colors.brand100,
    padding: spacing.s20,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  washBig: {
    position: 'absolute',
    top: -spacing.s40,
    right: -spacing.s24,
    width: 150,
    height: 150,
    borderRadius: radius.chip,
    backgroundColor: withAlpha(colors.brand300, 0.28),
  },
  washSmall: {
    position: 'absolute',
    bottom: -spacing.s48,
    right: spacing.s48,
    width: 110,
    height: 110,
    borderRadius: radius.chip,
    backgroundColor: withAlpha(colors.brand500, 0.1),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: -spacing.s4,
  },
  todayLabel: {
    ...typography.micro,
    color: colors.brand700,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  dateLabel: { ...typography.bodySm, color: colors.text, marginTop: spacing.s4 },
  shareButton: { marginTop: -spacing.s12, marginRight: -spacing.s12 },
  greeting: { ...typography.section, color: colors.text, marginTop: spacing.s8 },
  /** spec §25 — success is a light tint only */
  greetingDone: { color: colors.success },
  progressWrap: { gap: spacing.s8, marginRight: AVATAR_SIZE + spacing.s12 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: { ...typography.caption, color: colors.textSecondary },
  progressDone: { color: colors.success },
  percent: { ...typography.caption, color: colors.brand700, fontWeight: '600' },
  avatar: {
    position: 'absolute',
    right: spacing.s16,
    bottom: spacing.s16,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: radius.chip,
    backgroundColor: colors.brand300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: { ...typography.card, color: colors.text },
});
