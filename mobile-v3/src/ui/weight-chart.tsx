/* 体重曲线：无第三方库的 SVG 面积折线图，供档案页与趋势页复用。 */
export type WeightPoint = { at: number; kg: number; label: string };

export function WeightChart({ points }: { points: WeightPoint[] }) {
  const W = 320;
  const H = 110;
  const PAD_X = 10;
  const PAD_Y = 14;
  const values = points.map((point) => point.kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.4);
  const x = (index: number) =>
    points.length === 1
      ? W / 2
      : PAD_X + (index * (W - PAD_X * 2)) / (points.length - 1);
  const y = (kg: number) => H - PAD_Y - ((kg - min) / span) * (H - PAD_Y * 2);
  const line = points.map((point, index) => `${x(index)},${y(point.kg)}`).join(" ");
  const area = `${PAD_X},${H - 2} ${line} ${W - PAD_X},${H - 2}`;
  const last = points.length - 1;
  return (
    <svg
      className="weight-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`体重变化曲线，从 ${points[0].kg} 公斤到 ${points[last].kg} 公斤`}
    >
      <defs>
        <linearGradient id="weight-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6FA88C" stopOpacity=".32" />
          <stop offset="100%" stopColor="#6FA88C" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#weight-area)" />
      <polyline
        points={line}
        fill="none"
        stroke="#3E7460"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <circle
          key={point.at}
          cx={x(index)}
          cy={y(point.kg)}
          r={index === last ? 4.4 : 2.8}
          fill={index === last ? "#2E5747" : "#fff"}
          stroke="#3E7460"
          strokeWidth="1.8"
        />
      ))}
      <text x={PAD_X} y={PAD_Y - 3} className="weight-chart-min">{min} kg</text>
      <text x={W - PAD_X} y={PAD_Y - 3} textAnchor="end" className="weight-chart-min">{max} kg</text>
    </svg>
  );
}
