/**
 * Timeline presentation helpers + small shared pieces (spec §27–§34):
 * filter chips, day grouping (§28), density rules (§29), and the user-facing
 * type language (§30 — never the raw enum).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import { Card, Chip, Skeleton, type StatusBadgeVariant } from '../ui';
import { colors, spacing, typography } from '../../theme';
import { API_BASE } from '../../lib/api';
import type { TimelineEvent } from '../../lib/queries';
import { TIMELINE_FILTERS, type TimelineFilterKey } from './feed';

/* ------------------------------ Formatting -------------------------------- */

const API_ORIGIN = API_BASE.replace(/\/api\/v1$/, '');

/** Attachment urls may arrive absolute or API-relative — normalize for Image + Linking. */
export function attachmentUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** "Manual" for manual/app entries; otherwise a capitalized source. */
export function sourceLabel(source?: string): string {
  if (!source) return 'Manual';
  if (/^manual$/i.test(source) || /^app$/i.test(source)) return 'Manual';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/** "20:31" */
export function formatTime(iso: string): string {
  return dayjs(iso).format('HH:mm');
}

/** Detail date line: "Aug 17 · 20:31" (spec §34). */
export function formatDetailDate(iso: string): string {
  return dayjs(iso).format('MMM D · HH:mm');
}

/* ------------------------------ Type language ------------------------------ */

/** User-facing type names (spec §30: Medication Change belongs to Health). */
const TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  symptom: 'Health',
  medication: 'Medication',
  weight: 'Weight',
  visit: 'Visit',
  photo: 'Photo',
};

const TYPE_BADGE_VARIANT: Record<string, StatusBadgeVariant> = {
  symptom: 'symptom', // Health — red dot
  medication: 'medication', // blue dot
  visit: 'neutral',
  photo: 'brand',
};

export function eventBadge(event: TimelineEvent): {
  label: string;
  variant: StatusBadgeVariant;
} {
  const type = event.type as string;
  return {
    label: TYPE_LABELS[type] ?? 'Record',
    variant: TYPE_BADGE_VARIANT[type] ?? 'neutral',
  };
}

/** Large card vs compact row (spec §29): symptom/visit/medication/attached → card. */
export function isLargeEvent(event: TimelineEvent): boolean {
  if (event.type === 'symptom' || event.type === 'visit' || event.type === 'medication') {
    return true;
  }
  return (event.attachments ?? []).length > 0;
}

/** Compact one-liner title; weight reads "Weight · 5.9 kg" (spec §28). */
export function compactTitle(event: TimelineEvent): string {
  if (event.type === 'weight') return `Weight · ${event.title}`;
  return event.title;
}

/** Large-card footer meta: "Devin · 20:31 · Manual". */
export function eventMeta(event: TimelineEvent): string {
  return [event.by_name, formatTime(event.occurred_at), sourceLabel(event.source)]
    .filter(Boolean)
    .join(' · ');
}

/* -------------------------------- Grouping --------------------------------- */

export type TimelineRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'event'; key: string; event: TimelineEvent };

function dayLabel(iso: string): string {
  const d = dayjs(iso);
  const now = dayjs();
  if (d.isSame(now, 'day')) return 'TODAY';
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'YESTERDAY';
  return d.format('MM-DD');
}

/** Group a DESC event list into day-header + event rows (spec §28). */
export function buildTimelineRows(events: TimelineEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let currentDay = '';
  for (const event of events) {
    const dayKey = dayjs(event.occurred_at).format('YYYY-MM-DD');
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      rows.push({ kind: 'day', key: `day-${dayKey}`, label: dayLabel(event.occurred_at) });
    }
    rows.push({ kind: 'event', key: event.id, event });
  }
  return rows;
}

/* ------------------------------- Components -------------------------------- */

export function DayHeader({ label }: { label: string }) {
  return <Text style={styles.dayLabel}>{label}</Text>;
}

export function FilterChips({
  value,
  onChange,
}: {
  value: TimelineFilterKey;
  onChange: (key: TimelineFilterKey) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {TIMELINE_FILTERS.map((filter) => (
        <Chip
          key={filter.key}
          label={filter.label}
          selected={value === filter.key}
          onPress={() => onChange(filter.key)}
        />
      ))}
    </ScrollView>
  );
}

/** First-load skeleton (spec §62 — never a full-screen spinner). */
export function TimelineListSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Card style={styles.skeletonCard}>
        <Skeleton width={80} height={14} round />
        <Skeleton width="72%" height={16} />
        <Skeleton width="45%" height={14} />
      </Card>
      <Skeleton width="60%" height={12} round style={styles.skeletonGap} />
      <Skeleton width="100%" height={18} round style={styles.skeletonGap} />
      <Skeleton width="100%" height={18} round style={styles.skeletonGap} />
    </View>
  );
}

/** Loading-more footer for the infinite scroll (spec §72). */
export function FeedFooterSkeleton() {
  return (
    <Card style={styles.skeletonCard}>
      <Skeleton width="55%" height={14} round />
      <Skeleton width="85%" height={16} />
    </Card>
  );
}

/* --------------------------------- Styles ---------------------------------- */

const styles = StyleSheet.create({
  dayLabel: {
    ...typography.micro,
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: spacing.s16,
    marginBottom: spacing.s8,
  },
  chips: { gap: spacing.s8, paddingVertical: spacing.s4 },
  skeletonWrap: { gap: spacing.s12, marginTop: spacing.s8 },
  skeletonCard: { gap: spacing.s8 },
  skeletonGap: { marginBottom: spacing.s8 },
});
