import React, { useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Polygon, Polyline, Stop, Text } from 'react-native-svg';
import { useTheme } from '../../core/providers/theme-provider';
import { AppText } from './app-text';

export type WeightPoint = {
  /** Prefer event id when available — guarantees unique React keys. */
  id?: string;
  occurred_at: string;
  weight_g: number;
};

type Props = {
  points: WeightPoint[];
};

function normalizePoints(points: WeightPoint[]): WeightPoint[] {
  const byKey = new Map<string, WeightPoint>();
  for (const point of points) {
    const key = point.id ?? point.occurred_at;
    byKey.set(key, point);
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
}

/** Simple SVG area + polyline chart for weight history. */
export function WeightChart({ points }: Props) {
  const { theme } = useTheme();
  const gradientId = useId().replace(/:/g, '');
  const series = useMemo(() => normalizePoints(points), [points]);

  const chart = useMemo(() => {
    if (series.length === 0) return null;
    const W = 320;
    const H = 110;
    const PAD_X = 10;
    const PAD_Y = 14;
    const values = series.map((point) => point.weight_g / 1000);
    const first = values[0] ?? 0;
    const lastIndex = values.length - 1;
    const last = values[lastIndex] ?? first;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(max - min, 0.4);
    const x = (index: number) =>
      series.length === 1 ? W / 2 : PAD_X + (index * (W - PAD_X * 2)) / (series.length - 1);
    const y = (kg: number) => H - PAD_Y - ((kg - min) / span) * (H - PAD_Y * 2);
    const line = values.map((kg, index) => `${x(index)},${y(kg)}`).join(' ');
    const area = `${PAD_X},${H - 2} ${line} ${W - PAD_X},${H - 2}`;
    const round = (kg: number) => Math.round(kg * 100) / 100;
    return {
      W,
      H,
      PAD_X,
      PAD_Y,
      min: round(min),
      max: round(max),
      line,
      area,
      lastIndex,
      values,
      x,
      y,
      firstKg: round(first),
      lastKg: round(last),
    };
  }, [series]);

  if (!chart) {
    return (
      <AppText variant="caption" muted>
        暂无体重数据
      </AppText>
    );
  }

  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel={`体重变化曲线，从 ${chart.firstKg} 公斤到 ${chart.lastKg} 公斤`}
    >
      <Svg width="100%" height={chart.H} viewBox={`0 0 ${chart.W} ${chart.H}`}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#6FA88C" stopOpacity={0.32} />
            <Stop offset="100%" stopColor="#6FA88C" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Polygon points={chart.area} fill={`url(#${gradientId})`} />
        <Polyline
          points={chart.line}
          fill="none"
          stroke="#3E7460"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {series.map((point, index) => {
          const kg = chart.values[index] ?? chart.firstKg;
          const key = point.id ?? `weight-${index}-${point.occurred_at}`;
          return (
            <Circle
              key={key}
              cx={chart.x(index)}
              cy={chart.y(kg)}
              r={index === chart.lastIndex ? 4.4 : 2.8}
              fill={index === chart.lastIndex ? '#2E5747' : '#fff'}
              stroke="#3E7460"
              strokeWidth={1.8}
            />
          );
        })}
        <Text
          x={chart.PAD_X}
          y={chart.PAD_Y - 3}
          fill={theme.colors.soft}
          fontSize={10}
          fontWeight="600"
        >
          {`${chart.min} kg`}
        </Text>
        <Text
          x={chart.W - chart.PAD_X}
          y={chart.PAD_Y - 3}
          textAnchor="end"
          fill={theme.colors.soft}
          fontSize={10}
          fontWeight="600"
        >
          {`${chart.max} kg`}
        </Text>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 4,
  },
});
