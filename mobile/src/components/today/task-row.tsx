/**
 * TaskRow (spec §18–§22): ≥64pt row — time, status mark (○ / ✓), title (+MED),
 * sub-line (note / "by_name · HH:mm"). Tap pending → complete immediately
 * (no confirm modal); tap done → expand Undo/Skip; swipe a pending row left →
 * skip. The check pops with a small spring on completion (spec §20).
 *
 * Swipe is built on RN Animated + PanResponder: Reanimated 4 needs its
 * react-native-worklets peer dependency, which isn't installed in this project —
 * same UX, zero new packages.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { Check, Minus, RotateCcw, SkipForward } from 'lucide-react-native';
import type { TodayTask } from '../../lib/queries';
import { haptics } from '../../lib/haptics';
import { colors, motion, radius, spacing, touchTarget, typography, withAlpha } from '../../theme';
import { clockOf } from './time';

export interface TaskRowActions {
  /** Pending row tapped — complete optimistically (parent does haptics + toast). */
  onComplete: (task: TodayTask) => void;
  /** Swipe (or expanded action) — skip for today. */
  onSkip: (task: TodayTask) => void;
  /** Expanded action / restore — back to not done. */
  onUndo: (task: TodayTask) => void;
}

const SKIP_REVEAL = 88; // width of the revealed background
const SKIP_TRIGGER = -64; // leftward travel that fires the skip
const SKIP_DRAG_MAX = -140; // drag rubber-band limit
const TIME_COL_WIDTH = 46;
const MARK_SIZE = 22;
const ROW_MIN_HEIGHT = 64;

const isSkipSwipe = (g: PanResponderGestureState): boolean =>
  g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) + 4;

export function TaskRow({
  task,
  timezone,
  actions,
}: {
  task: TodayTask;
  timezone?: string | null;
  actions: TaskRowActions;
}) {
  const done = task.log?.status === 'done';
  const [expanded, setExpanded] = useState(false);

  const translateX = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(1)).current;
  const wasDone = useRef(done);

  // Latest-callback refs so the once-created PanResponder never goes stale.
  const canSwipeRef = useRef(!done);
  const onSkipRef = useRef(actions.onSkip);
  useEffect(() => {
    canSwipeRef.current = !done;
    onSkipRef.current = actions.onSkip;
  });

  // Check pop when this row flips to done (spec §20) — spring, tiny, fast.
  useEffect(() => {
    if (done && !wasDone.current) {
      checkScale.setValue(0.4);
      Animated.spring(checkScale, {
        toValue: 1,
        speed: 22,
        bounciness: 7,
        useNativeDriver: true,
      }).start();
    }
    wasDone.current = done;
  }, [done, checkScale]);

  const snapClosed = () => {
    Animated.spring(translateX, {
      toValue: 0,
      speed: 20,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      // Horizontal-dominant left swipe only; vertical falls through to the ScrollView.
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
        canSwipeRef.current && isSkipSwipe(g),
      onMoveShouldSetPanResponderCapture: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
        canSwipeRef.current && isSkipSwipe(g),
      onPanResponderMove: (_e, g) => {
        translateX.setValue(Math.max(SKIP_DRAG_MAX, Math.min(0, g.dx)));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx < SKIP_TRIGGER) {
          Animated.timing(translateX, {
            toValue: 0,
            duration: motion.tap,
            useNativeDriver: true,
          }).start();
          onSkipRef.current(task);
        } else {
          snapClosed();
        }
      },
      onPanResponderTerminate: snapClosed,
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  const log = task.log;
  const subline =
    done && log
      ? `${log.by_name ?? 'Someone'} · ${clockOf(log.at, timezone)}`
      : (task.note ?? null);

  const onPress = () => {
    if (done) {
      haptics.light();
      setExpanded((e) => !e);
    } else {
      actions.onComplete(task);
    }
  };

  const a11yLabel = done
    ? `${task.title}, done by ${log?.by_name ?? 'someone'} at ${clockOf(log?.at ?? '', timezone)}`
    : `${task.title} at ${task.time_of_day}, not done`;
  const a11yHint = done
    ? 'Double-tap to show undo and skip.'
    : 'Double-tap to mark complete. Swipe left to skip for today.';

  return (
    <View style={styles.swipeWrap} {...panResponder.panHandlers}>
      {/* skip reveal background (spec §22) */}
      <View style={styles.skipBackground} pointerEvents="none">
        <SkipForward size={16} color={colors.warning} />
        <Text style={styles.skipLabel}>Skip</Text>
      </View>

      <Animated.View style={[styles.foreground, { transform: [{ translateX }] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          accessibilityHint={a11yHint}
          accessibilityState={{ expanded: done && expanded }}
          onPress={onPress}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSoft }]}
        >
          <View style={styles.timeCol} pointerEvents="none">
            <Text style={styles.time}>{task.time_of_day}</Text>
          </View>

          <View style={styles.markSlot} pointerEvents="none">
            {done ? (
              <Animated.View
                style={[styles.markDone, { transform: [{ scale: checkScale }] }]}
              >
                <Check size={14} color={colors.onDark} strokeWidth={3} />
              </Animated.View>
            ) : (
              <View style={styles.markPending} />
            )}
          </View>

          <View style={styles.textCol} pointerEvents="none">
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={1}>
                {task.title}
              </Text>
              {task.medication_id ? <Text style={styles.medBadge}>MED</Text> : null}
            </View>
            {subline ? (
              <Text style={styles.subline} numberOfLines={1}>
                {subline}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {done && expanded ? (
          <View style={styles.expanded}>
            <RowAction
              label="Undo"
              icon={RotateCcw}
              onPress={() => {
                setExpanded(false);
                actions.onUndo(task);
              }}
            />
            <RowAction
              label="Skip"
              icon={SkipForward}
              onPress={() => {
                setExpanded(false);
                actions.onSkip(task);
              }}
            />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function RowAction({
  label,
  icon: Icon,
  onPress,
}: {
  label: string;
  icon: typeof RotateCcw;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.rowAction, pressed && { opacity: 0.6 }]}
    >
      <Icon size={14} color={colors.textSecondary} />
      <Text style={styles.rowActionLabel}>{label}</Text>
    </Pressable>
  );
}

/** Row inside the "Skipped (n)" fold — Restore returns it to not done (spec §22). */
export function SkippedRow({
  task,
  onRestore,
}: {
  task: TodayTask;
  onRestore: (task: TodayTask) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.timeCol} pointerEvents="none">
        <Text style={styles.time}>{task.time_of_day}</Text>
      </View>
      <View style={styles.markSlot} pointerEvents="none">
        <View style={styles.markSkipped}>
          <Minus size={12} color={colors.textTertiary} strokeWidth={2.5} />
        </View>
      </View>
      <View style={styles.textCol} pointerEvents="none">
        <Text style={styles.titleStruck} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={styles.subline} numberOfLines={1}>
          Skipped{task.log?.by_name ? ` · ${task.log.by_name}` : ''}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restore ${task.title}`}
        onPress={() => onRestore(task)}
        style={({ pressed }) => [styles.restore, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.restoreLabel}>Restore</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  swipeWrap: { overflow: 'hidden' },
  skipBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: SKIP_REVEAL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    backgroundColor: withAlpha(colors.warning, 0.1),
  },
  skipLabel: { ...typography.caption, color: colors.warning, fontWeight: '600' },
  foreground: { backgroundColor: colors.surface },
  row: {
    minHeight: ROW_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s12,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
    backgroundColor: colors.surface,
  },
  timeCol: { width: TIME_COL_WIDTH },
  time: { ...typography.caption, color: colors.textTertiary },
  markSlot: { width: MARK_SIZE, alignItems: 'center', justifyContent: 'center' },
  markPending: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: colors.brand300,
  },
  markDone: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: radius.chip,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markSkipped: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s8 },
  title: { ...typography.card, color: colors.text, flexShrink: 1 },
  titleStruck: {
    ...typography.card,
    color: colors.textSecondary,
    textDecorationLine: 'line-through',
  },
  medBadge: {
    ...typography.micro,
    color: colors.medication,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subline: { ...typography.caption, color: colors.textSecondary },
  expanded: {
    flexDirection: 'row',
    gap: spacing.s8,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSoft,
  },
  rowAction: {
    minHeight: touchTarget - 12,
    paddingHorizontal: spacing.s16,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s8,
  },
  rowActionLabel: { ...typography.caption, color: colors.text, fontWeight: '600' },
  restore: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.s12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreLabel: { ...typography.caption, color: colors.brand700, fontWeight: '600' },
});
