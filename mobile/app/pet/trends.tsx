/**
 * Weight trends (ROADMAP V1.5 wing 1) — deterministic chart + change summary
 * + full record list. Data: GET /pets/{petID}/timeline?types=weight&limit=100
 * (direct api() call; the shared timeline cache stays untouched). The summary
 * reports numbers only — never diagnosis.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Scale } from 'lucide-react-native';
import { Card, EmptyState, SectionHeader, Skeleton } from '../../src/components/ui';
import { PageShell, formatShortDate, formatWeight } from '../../src/components/pet/parts';
import { WeightChart, type WeightPoint } from '../../src/components/trends/weight-chart';
import { get } from '../../src/lib/api';
import { qk, useActivePet, type TimelinePage } from '../../src/lib/queries';
import { colors, radius, spacing, typography } from '../../src/theme';

/** A drop larger than this is highlighted (warning color, still no diagnosis). */
const NOTABLE_DROP_PCT = 5;

export default function WeightTrendsScreen() {
  const { pet, isLoading: meLoading } = useActivePet();
  const petId = pet?.id;

  const weightQuery = useQuery({
    queryKey: [...qk.timeline(petId ?? ''), 'weight'],
    queryFn: () => get<TimelinePage>(`/pets/${petId}/timeline?types=weight&limit=100`),
    enabled: !!petId,
    staleTime: 60_000,
  });

  // API returns newest-first; the chart and summary want chronological order.
  const points: WeightPoint[] = React.useMemo(() => {
    return (weightQuery.data?.events ?? [])
      .map((event) => {
        const kg = event.data?.weight_kg;
        return typeof kg === 'number' && Number.isFinite(kg) && kg > 0
          ? { date: event.occurred_at, kg }
          : null;
      })
      .filter((p): p is WeightPoint => p !== null)
      .reverse();
  }, [weightQuery.data]);

  const loading = meLoading || (!!petId && weightQuery.isLoading);

  // "↓ 6.1 → 5.8 kg · −4.9% in 9 days" — last two records only.
  let summary: {
    text: string;
    notableDrop: boolean;
  } | null = null;
  if (points.length >= 2) {
    const prev = points[points.length - 2];
    const last = points[points.length - 1];
    const diff = last.kg - prev.kg;
    const pct = prev.kg !== 0 ? (diff / prev.kg) * 100 : 0;
    const days = Math.abs(dayjs(last.date).diff(dayjs(prev.date), 'day'));
    const arrow = diff < 0 ? '↓' : diff > 0 ? '↑' : '→';
    const sign = diff > 0 ? '+' : '−'; // U+2212 minus, matches the spec example
    const daysText = days === 0 ? 'the same day' : days === 1 ? '1 day' : `${days} days`;
    summary = {
      text: `${arrow} ${formatWeight(prev.kg)} → ${formatWeight(last.kg)} · ${sign}${Math.abs(
        pct,
      ).toFixed(1)}% in ${daysText}`,
      notableDrop: diff < 0 && Math.abs(pct) > NOTABLE_DROP_PCT,
    };
  }

  return (
    <PageShell title="Weight">
      {loading ? (
        <>
          <Skeleton height={208} style={styles.chartSkeleton} />
          <Skeleton height={84} style={styles.chartSkeleton} />
        </>
      ) : points.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No weight records yet"
          subtitle="Record a weight from Quick record to see trends here."
        />
      ) : (
        <>
          <WeightChart points={points} />

          {summary ? (
            <Card>
              <Text style={styles.summaryLabel}>Recent change</Text>
              <Text style={[styles.summaryText, summary.notableDrop && styles.summaryNotable]}>
                {summary.text}
              </Text>
            </Card>
          ) : null}

          <View>
            <SectionHeader title="All records" />
            <Card padding={0} style={styles.recordsCard}>
              {[...points].reverse().map((point, index, all) => (
                <View
                  key={`${point.date}-${index}`}
                  style={[styles.recordRow, index < all.length - 1 && styles.recordDivider]}
                >
                  <Text style={styles.recordDate}>{formatShortDate(point.date) ?? ''}</Text>
                  <Text style={styles.recordValue}>{formatWeight(point.kg)}</Text>
                </View>
              ))}
            </Card>
          </View>
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  chartSkeleton: { borderRadius: radius.card },
  summaryLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.s4,
  },
  summaryText: { ...typography.card, color: colors.text },
  // >5% drop gets the warning color — numbers only, no diagnostic wording.
  summaryNotable: { color: colors.warning },
  recordsCard: { borderRadius: radius.card, overflow: 'hidden' },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
    minHeight: 44,
  },
  recordDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  recordDate: { ...typography.bodySm, color: colors.textSecondary },
  recordValue: { ...typography.bodySm, color: colors.text, fontWeight: '600' },
});
