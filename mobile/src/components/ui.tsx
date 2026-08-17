/**
 * PLANET design-system primitives (spec §97 component library).
 * Every value comes from src/theme.ts — no raw colors/spacing/radii (spec §98).
 */
import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radius, shadows, spacing, touchTarget, typography, withAlpha } from '../theme';

/* ------------------------------- Buttons --------------------------------- */

interface ButtonBaseProps {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
}

/** Primary CTA — deep ink, white label (spec §4.2: big CTAs are NOT blue). */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon: Icon,
  style,
}: ButtonBaseProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonBase,
        styles.primaryButton,
        pressed && { opacity: 0.85 },
        inactive && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onDark} size="small" />
      ) : (
        <View style={styles.buttonContent}>
          {Icon ? <Icon size={typography.body.fontSize} color={colors.onDark} /> : null}
          <Text style={styles.primaryLabel}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Secondary CTA — surface + border. */
export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon: Icon,
  style,
}: ButtonBaseProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.buttonBase,
        styles.secondaryButton,
        pressed && { backgroundColor: colors.surfaceSoft },
        inactive && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} size="small" />
      ) : (
        <View style={styles.buttonContent}>
          {Icon ? <Icon size={typography.body.fontSize} color={colors.text} /> : null}
          <Text style={styles.secondaryLabel}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

interface IconButtonProps {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  size?: number;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** ≥44pt touch target (spec §8). */
export function IconButton({
  icon: Icon,
  onPress,
  label,
  size = 22,
  color = colors.text,
  disabled,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={spacing.s4}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { opacity: 0.6 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Icon size={size} color={color} />
    </Pressable>
  );
}

/* -------------------------------- Layout ---------------------------------- */

export function Card({
  children,
  padding = spacing.s16,
  shadow = 'none',
  style,
}: {
  children: React.ReactNode;
  padding?: number;
  /**
   * 'soft' drops the border and lifts the card on the spec §10 whisper shadow
   * (shadows.card + white surface) — for emphasis contexts like cards inside
   * the Hero. Default keeps the flat border look.
   */
  shadow?: 'none' | 'soft';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, { padding }, shadow === 'soft' && styles.cardSoft, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={typography.section}>{title}</Text>
      {action ? (
        <Pressable hitSlop={spacing.s8} onPress={action.onPress} accessibilityRole="button">
          {({ pressed }) => (
            <Text style={[styles.sectionAction, pressed && { opacity: 0.6 }]}>
              {action.label}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  trailing?: React.ReactNode;
  onPress?: () => void;
}

export function ListRow({ title, subtitle, icon: Icon, trailing, onPress }: ListRowProps) {
  const body = (
    <View style={styles.listRowContent}>
      {Icon ? (
        <View style={styles.listRowIcon}>
          <Icon size={20} color={colors.brand700} />
        </View>
      ) : null}
      <View style={styles.listRowText}>
        <Text style={styles.listRowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.listRowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.surfaceSoft }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={styles.listRow}>{body}</View>;
}

/* --------------------------------- Chip ----------------------------------- */

export function Chip({
  label,
  selected = false,
  onPress,
  disabled,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipUnselected,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={selected ? styles.chipLabelSelected : styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

/* --------------------------------- Field ---------------------------------- */

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string | null;
}

/** Label + input (spec §9 input radius 16). Pass multiline for a TextArea. */
export function Field({ label, error, hint, style, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textTertiary}
        {...inputProps}
        style={[styles.fieldInput, inputProps.multiline && styles.fieldInputMultiline, style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

/* ------------------------------- Progress --------------------------------- */

/** Dot-matrix progress (spec §4.2: progress uses blue). */
export function Progress({
  count = 7,
  filled = 0,
  dotSize = 8,
  gap = spacing.s8,
}: {
  count?: number;
  filled?: number;
  dotSize?: number;
  gap?: number;
}) {
  return (
    <View style={[styles.progressRow, { gap }]} accessibilityLabel={`${filled} of ${count} done`}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.progressDot,
            { width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
            i < filled ? styles.progressDotFilled : styles.progressDotEmpty,
          ]}
        />
      ))}
    </View>
  );
}

/* ------------------------------- Skeleton --------------------------------- */

export function Skeleton({
  width = '100%',
  height = 16,
  round,
  style,
}: {
  width?: number | `${number}%` | 'auto';
  height?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width: width === 'auto' ? undefined : width,
          height,
          borderRadius: round ? height / 2 : radius.input,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/* ------------------------------ Empty state ------------------------------- */

export function EmptyState({
  title,
  subtitle,
  action,
  icon: Icon,
  emoji,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  icon?: LucideIcon;
  /** Optional emoji in the icon bubble — warmer than a line icon when one fits. */
  emoji?: string;
}) {
  return (
    <View style={styles.emptyState}>
      {emoji ? (
        <View style={styles.emptyStateIcon}>
          <Text style={styles.emptyStateEmoji}>{emoji}</Text>
        </View>
      ) : Icon ? (
        <View style={styles.emptyStateIcon}>
          <Icon size={28} color={colors.brand700} />
        </View>
      ) : null}
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptyStateSubtitle}>{subtitle}</Text> : null}
      {action ? (
        <PrimaryButton label={action.label} onPress={action.onPress} style={{ marginTop: spacing.s16 }} />
      ) : null}
    </View>
  );
}

/* ----------------------------- Status badge -------------------------------- */

export type StatusBadgeVariant = 'success' | 'warning' | 'symptom' | 'medication' | 'neutral' | 'brand';

const badgeVariantColor: Record<StatusBadgeVariant, string> = {
  success: colors.success,
  warning: colors.warning,
  symptom: colors.symptom,
  medication: colors.medication,
  neutral: colors.neutral,
  brand: colors.brand700,
};

/** Dot + label — color is never the only signal (spec §5). */
export function StatusBadge({ label, variant = 'neutral' }: { label: string; variant?: StatusBadgeVariant }) {
  const color = badgeVariantColor[variant];
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.12) }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeLabel, { color }]}>{label}</Text>
    </View>
  );
}

/* -------------------------------- Styles ---------------------------------- */

const styles = StyleSheet.create({
  buttonBase: {
    minHeight: touchTarget + 4,
    borderRadius: radius.button,
    paddingHorizontal: spacing.s20,
    paddingVertical: spacing.s12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.s8 },
  primaryButton: { backgroundColor: colors.text },
  primaryLabel: { ...typography.card, color: colors.onDark, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryLabel: { ...typography.card, color: colors.text, fontWeight: '600' },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSoft: { ...shadows.card, borderWidth: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s12,
  },
  sectionAction: { ...typography.caption, color: colors.brand700, fontWeight: '600' },
  listRow: {
    minHeight: 56,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
    borderRadius: radius.card,
  },
  listRowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.s12 },
  listRowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.chip,
    backgroundColor: colors.brand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowText: { flex: 1, gap: 2 },
  listRowTitle: { ...typography.card, color: colors.text },
  listRowSubtitle: { ...typography.caption, color: colors.textSecondary },
  chip: {
    minHeight: touchTarget - 12,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s8,
    borderRadius: radius.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.brand100, borderColor: colors.brand300 },
  chipUnselected: { backgroundColor: colors.surface, borderColor: colors.border },
  chipLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  chipLabelSelected: { ...typography.caption, color: colors.brand700, fontWeight: '600' },
  field: { gap: spacing.s8 },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  fieldInput: {
    ...typography.bodySm,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    minHeight: touchTarget + 4,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
  },
  fieldInputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  fieldError: { ...typography.caption, color: colors.symptom },
  fieldHint: { ...typography.caption, color: colors.textTertiary },
  progressRow: { flexDirection: 'row', alignItems: 'center' },
  progressDot: {},
  progressDotFilled: { backgroundColor: colors.brand500 },
  progressDotEmpty: { backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border },
  skeleton: { backgroundColor: colors.surfaceSoft },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s32,
    gap: spacing.s8,
  },
  emptyStateIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.chip,
    backgroundColor: colors.brand100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s4,
  },
  emptyStateEmoji: { ...typography.page, fontWeight: '400' },
  emptyStateTitle: { ...typography.section, color: colors.text, textAlign: 'center' },
  emptyStateSubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.s8,
    paddingVertical: spacing.s4,
    borderRadius: radius.chip,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeLabel: { ...typography.micro, fontWeight: '600' },
});
