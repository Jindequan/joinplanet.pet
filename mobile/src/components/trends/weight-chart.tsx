/**
 * WeightChart (ROADMAP V1.5 wing 1) — deterministic line chart for weight
 * events. No AI, no smoothing, no extrapolation: one point per record,
 * brand-blue polyline, surface-filled data points, min/max annotations.
 * Empty and single-point series degrade to a hint / big-number card.
 * All styling from theme tokens (spec §98).
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import dayjs from 'dayjs';
import { Card } from '../ui';
import { colors, spacing, typography } from '../../theme';
import { formatShortDate, formatWeight } from '../pet/parts';

export interface WeightPoint {
  /** ISO timestamp of the weight event. */
  date: string;
  kg: number;
}

const PAD_LEFT = 12;
const PAD_RIGHT = 12;
const PAD_TOP = 30;
const PAD_BOTTOM = 30;
const DOMAIN_PAD_RATIO = 0.15;
const FLAT_PAD_KG = 1;

export function WeightChart({ points, height = 208 }: { points: WeightPoint[]; height?: number }) {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No weight records yet</Text>
      </View>
    );
  }

  // One record only — a big number card is the honest chart (spec §44 derived weight).
  if (points.length === 1) {
    const only = points[0];
    return (
      <Card style={styles.singleCard}>
        <Text style={styles.singleValue}>{formatWeight(only.kg)}</Text>
        <Text style={styles.singleDate}>{formatShortDate(only.date) ?? ''}</Text>
      </Card>
    );
  }

  return (
    <View style={[styles.canvas, { height }]} onLayout={onLayout}>
      {width > 0 ? <WeightLine points={points} width={width} height={height} /> : null}
    </View>
  );
}

/** The chart itself — rendered only once the container width is measured. */
function WeightLine({
  points,
  width,
  height,
}: {
  points: WeightPoint[];
  width: number;
  height: number;
}) {
  const innerW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
  const innerH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);

  const values = points.map((p) => p.kg);
  let rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  let min = rawMin;
  let max = rawMax;
  if (rawMax === rawMin) {
    min -= FLAT_PAD_KG / 2;
    max += FLAT_PAD_KG / 2;
  } else {
    const pad = (rawMax - rawMin) * DOMAIN_PAD_RATIO;
    min -= pad;
    max += pad;
  }

  // X is time-proportional when dates span real time; equal spacing otherwise
  // (all-same-day records or unparseable timestamps must never collapse).
  const times = points.map((p) => dayjs(p.date).valueOf());
  const span =
    times.every((t) => Number.isFinite(t)) && times.length > 1
      ? times[times.length - 1] - times[0]
      : 0;
  const xAt = (i: number) =>
    PAD_LEFT +
    (span > 0 ? (times[i] - times[0]) / span : i / (points.length - 1)) * innerW;
  const yAt = (kg: number) => PAD_TOP + (1 - (kg - min) / (max - min)) * innerH;

  let minIdx = 0;
  let maxIdx = 0;
  points.forEach((p, i) => {
    if (p.kg < points[minIdx].kg) minIdx = i;
    if (p.kg > points[maxIdx].kg) maxIdx = i;
  });
  const flat = rawMin === rawMax;

  const baselineY = height - PAD_BOTTOM;
  const polyline = points.map((p, i) => `${xAt(i)},${yAt(p.kg)}`).join(' ');

  const anchorFor = (x: number): 'start' | 'middle' | 'end' =>
    x < PAD_LEFT + 34 ? 'start' : x > width - PAD_RIGHT - 34 ? 'end' : 'middle';
  const maxLabel = `${formatWeight(points[maxIdx].kg)} · ${formatShortDate(points[maxIdx].date) ?? ''}`;
  const minLabel = `${formatWeight(points[minIdx].kg)} · ${formatShortDate(points[minIdx].date) ?? ''}`;
  const maxX = xAt(maxIdx);
  const maxY = Math.max(typography.micro.fontSize, yAt(points[maxIdx].kg) - 16);
  const minX = xAt(minIdx);
  const minY = Math.min(height - 6, yAt(points[minIdx].kg) + 20);

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      accessible
      accessibilityLabel={`Weight trend, ${formatWeight(points[0].kg)} to ${formatWeight(
        points[points.length - 1].kg,
      )}`}
    >
      <Line
        x1={PAD_LEFT}
        y1={baselineY}
        x2={width - PAD_RIGHT}
        y2={baselineY}
        stroke={colors.border}
        strokeWidth={1}
      />
      <Polyline
        points={polyline}
        fill="none"
        stroke={colors.brand500}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <Circle
          key={`${p.date}-${i}`}
          cx={xAt(i)}
          cy={yAt(p.kg)}
          r={3.5}
          fill={colors.surface}
          stroke={colors.brand500}
          strokeWidth={2}
        />
      ))}
      <SvgText
        x={maxX}
        y={maxY}
        textAnchor={anchorFor(maxX)}
        fill={colors.textSecondary}
        fontSize={typography.micro.fontSize}
        fontWeight="600"
      >
        {maxLabel}
      </SvgText>
      {flat ? null : (
        <SvgText
          x={minX}
          y={minY}
          textAnchor={anchorFor(minX)}
          fill={colors.textSecondary}
          fontSize={typography.micro.fontSize}
          fontWeight="600"
        >
          {minLabel}
        </SvgText>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  canvas: { width: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s32 },
  emptyText: { ...typography.bodySm, color: colors.textTertiary },
  singleCard: { alignItems: 'center', paddingVertical: spacing.s24, gap: spacing.s4 },
  singleValue: { ...typography.hero, color: colors.text },
  singleDate: { ...typography.bodySm, color: colors.textSecondary },
});
