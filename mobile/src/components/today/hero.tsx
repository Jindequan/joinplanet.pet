/**
 * Today Hero (spec §17 §25): 160 high, Brand100 → surface gradient at 135°
 * (expo-linear-gradient) with soft start/end alpha, TODAY micro label +
 * weekday date, daypart greeting ("All cared for today." when everything is
 * resolved — success is a light tint only, never confetti), dot progress that
 * pops with a quick spring when a completion lands (spec §20), the pet's real
 * photo bottom-right (spec §84), share ↗.
 */
import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ArrowUpRight } from 'lucide-react-native';
import { colors, radius, shadows, spacing, typography, withAlpha } from '../../theme';
import { IconButton, Progress } from '../ui';
import { PetPhoto } from '../pet-photo';
import { greetingFor, nowInZone } from './time';

const HERO_HEIGHT = 160;
const AVATAR_SIZE = 44;
/** Dots are per-task; past this count the text row already tells the story. */
const MAX_DOTS = 12;
/** 135° — Brand100 wash at the top-left easing toward white (spec §17). */
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 1 };
/** Progress pop: quick, barely-bouncy spring (spec §20 / §77 spring budget). */
const POP_DURATION = 130;
const POP_FROM = 0.92;

export function Hero({
  petName,
  avatarKey,
  timezone,
  done,
  total,
  onShare,
}: {
  petName: string;
  avatarKey?: string | null;
  timezone?: string | null;
  done: number;
  total: number;
  onShare: () => void;
}) {
  const now = nowInZone(timezone);
  const allDone = total > 0 && done >= total;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const greetingText = allDone ? 'All cared for today.' : greetingFor(now.hour(), petName);

  // Number + dot matrix spring when the count moves (spec §20 "Hero progress 动画").
  const progressPop = useSharedValue(1);
  const prevDone = useRef(done);
  useEffect(() => {
    if (done !== prevDone.current) {
      progressPop.value = POP_FROM;
      progressPop.value = withSpring(1, { duration: POP_DURATION, dampingRatio: 0.6 });
      prevDone.current = done;
    }
  }, [done, progressPop]);
  const progressPopStyle = useAnimatedStyle(() => ({
    transform: [{ scale: progressPop.value }],
  }));

  return (
    <LinearGradient
      colors={[withAlpha(colors.brand100, 0.95), withAlpha(colors.surface, 0.9)]}
      start={GRADIENT_START}
      end={GRADIENT_END}
      style={styles.card}
      accessibilityLabel={`Today. ${greetingText} ${done} of ${total} complete.`}
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
        {/* Greeting swap (daypart / all-done) fades in on the row-update budget (§77). */}
        <Animated.Text
          key={greetingText}
          entering={FadeIn.duration(180)}
          style={[styles.greeting, allDone && styles.greetingDone]}
          numberOfLines={1}
        >
          {greetingText}
        </Animated.Text>
      </View>

      <Animated.View style={progressPopStyle} pointerEvents="none">
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
      </Animated.View>

      {/* pet photo, real when avatar_key exists (spec §84) */}
      <View style={styles.avatar} pointerEvents="none">
        <PetPhoto
          avatarKey={avatarKey}
          name={petName}
          size={AVATAR_SIZE}
          style={styles.avatarPhoto}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    height: HERO_HEIGHT,
    borderRadius: radius.hero,
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
    ...shadows.card,
  },
  avatarPhoto: {
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
