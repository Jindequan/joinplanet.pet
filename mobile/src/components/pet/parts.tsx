/**
 * Shared Pet-page building blocks (spec §40–§51): sub-page shell with back
 * header, avatar bubble, display rows, date/age formatting, and the
 * derived "current weight" reader (spec §44: weight lives on the timeline,
 * never duplicated on the pet row).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { router } from 'expo-router';
import { colors, spacing, touchTarget, typography } from '../../theme';
import { IconButton } from '../ui';
import { get } from '../../lib/api';
import { qk, type CircleMember, type TimelinePage } from '../../lib/queries';

/* ------------------------------ Emergency -------------------------------- */

/** Contract F3: emergency_contacts entries are objects or null (never strings). */
export interface EmergencyContact {
  name?: string;
  phone?: string;
  note?: string;
}

export interface EmergencyContacts {
  primary?: EmergencyContact | null;
  vet?: EmergencyContact | null;
  authorized_decision_maker?: EmergencyContact | null;
}

/** The shared `Pet` type predates the object shape — read through this cast. */
export function readEmergencyContacts(raw: unknown): EmergencyContacts {
  return (raw ?? {}) as EmergencyContacts;
}

/* ------------------------------ Circle members ---------------------------- */

/** GET /circles/{id} — shared via qk.circle so Overview and Circle reuse cache. */
export function useCircleMembers(circleId: string | undefined) {
  return useQuery({
    queryKey: qk.circle(circleId ?? ''),
    queryFn: () => get<{ members: CircleMember[] }>(`/circles/${circleId}`),
    enabled: !!circleId,
    staleTime: 60_000,
  });
}

/* -------------------------------- Formatting ------------------------------- */

/** "Jul 12" — appends the year when it is not the current one. */
export function formatShortDate(date?: string | null): string | null {
  if (!date) return null;
  const d = dayjs(date);
  if (!d.isValid()) return null;
  return d.year() === dayjs().year() ? d.format('MMM D') : d.format('MMM D, YYYY');
}

/** "May 12, 2019" (spec §44 Birthday row). */
export function formatLongDate(date?: string | null): string | null {
  if (!date) return null;
  const d = dayjs(date);
  return d.isValid() ? d.format('MMM D, YYYY') : null;
}

/** Compact age from a birthday — "7y 2m", "3m", "0m". */
export function ageLabel(birthday?: string | null): string | null {
  if (!birthday) return null;
  const b = dayjs(birthday);
  if (!b.isValid()) return null;
  const months = Math.max(0, dayjs().diff(b, 'month'));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y > 0 && m > 0) return `${y}y ${m}m`;
  if (y > 0) return `${y}y`;
  return `${m}m`;
}

/** Basic YYYY-MM-DD sanity check for the inline birthday editor. */
export function isValidBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dayjs(value).isValid();
}

/* ---------------------------- Derived weight ------------------------------ */

export interface DerivedWeight {
  kg: number;
  at: string;
}

/**
 * Latest weight event from the (already warm) timeline cache. Reads only —
 * the Pet pages never fetch the timeline themselves (spec §44).
 */
export function latestWeight(
  data: { pages?: TimelinePage[] } | undefined,
): DerivedWeight | null {
  for (const page of data?.pages ?? []) {
    for (const event of page.events) {
      const kg = event.data?.weight_kg;
      if (event.type === 'weight' && typeof kg === 'number' && Number.isFinite(kg)) {
        return { kg, at: event.occurred_at };
      }
    }
  }
  return null;
}

export function formatWeight(kg: number): string {
  return `${Math.round(kg * 10) / 10} kg`;
}

/* --------------------------------- Shell ---------------------------------- */

/** Sub-page shell: safe area + back header + scroll body (spec §43 IA). */
export function PageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <IconButton icon={ChevronLeft} label="Back" onPress={() => router.back()} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Circular avatar placeholder — Brand100 with the initial (spec §41). */
export function AvatarBubble({ label, size = 48 }: { label: string; size?: number }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarInitial, { fontSize: Math.round(size * 0.38) }]}>
        {initial}
      </Text>
    </View>
  );
}

/** Trailing "›" affordance for entry rows (spec §42). */
export function Chevron() {
  return <ChevronRight size={20} color={colors.textTertiary} />;
}

/** Label + value display row used across the identity pages (spec §44). */
export function DisplayRow({
  label,
  value,
  placeholder = '—',
  divider = false,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  divider?: boolean;
}) {
  return (
    <View style={[styles.displayRow, divider && styles.displayRowDivider]}>
      <Text style={styles.displayLabel}>{label}</Text>
      <Text style={[styles.displayValue, !value && styles.displayPlaceholder]}>
        {value || placeholder}
      </Text>
    </View>
  );
}

/** Small group label ("Owner", "Caregivers", "Allergies" — spec §44/§48). */
export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.groupLabel}>{children}</Text>;
}

/* --------------------------------- Styles --------------------------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s8,
    paddingVertical: spacing.s4,
    gap: spacing.s4,
  },
  headerTitle: { flex: 1, ...typography.page, color: colors.text },
  headerSpacer: { width: touchTarget },
  content: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s8,
    paddingBottom: spacing.s32,
    gap: spacing.s16,
  },
  avatar: {
    backgroundColor: colors.brand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.brand700,
    fontWeight: '600',
  },
  displayRow: { paddingVertical: spacing.s12, gap: 2 },
  displayRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  displayLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  displayValue: { ...typography.body, color: colors.text },
  displayPlaceholder: { color: colors.textTertiary },
  groupLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
