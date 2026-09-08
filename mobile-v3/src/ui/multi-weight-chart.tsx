/* 多宠体重对比图:所有宠物画进同一张 SVG(共享时间轴 + 数值域),零依赖。
 * 与单宠 WeightChart 互不引用:序列色由调用方按宠物序传入(品牌四色循环),
 * 单点宠物画点不画线,min/max 轴标固定两位小数。 */
import { useT } from "../core/i18n";

export type MultiWeightPoint = { at: number; kg: number };
export type MultiWeightSeries = {
  petId: string;
  name: string;
  color: string;
  points: MultiWeightPoint[];
};

export function MultiWeightChart({ series }: { series: MultiWeightSeries[] }) {
  const t = useT();
  const W = 320;
  const H = 150;
  const PAD_X = 14;
  const PAD_Y = 20;
  const plotted = series.filter((item) => item.points.length > 0);
  const all = plotted.flatMap((item) => item.points);
  if (all.length === 0) return null;
  const minKg = Math.min(...all.map((point) => point.kg));
  const maxKg = Math.max(...all.map((point) => point.kg));
  const span = Math.max(maxKg - minKg, 0.4);
  const minAt = Math.min(...all.map((point) => point.at));
  const maxAt = Math.max(...all.map((point) => point.at));
  const x = (at: number) =>
    maxAt === minAt
      ? W / 2
      : PAD_X + ((at - minAt) / (maxAt - minAt)) * (W - PAD_X * 2);
  const y = (kg: number) => H - PAD_Y - ((kg - minKg) / span) * (H - PAD_Y * 2);
  const plotH = H - PAD_Y * 2;
  const gridYs = [H - PAD_Y - plotH / 3, H - PAD_Y - (plotH * 2) / 3];
  return (
    <div className="multi-weight">
      <svg
        className="multi-weight-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t(
          `多宠体重对比曲线，共 ${plotted.length} 只宠物`,
          `Weight comparison across ${plotted.length} pets`,
        )}
      >
        {gridYs.map((gy) => (
          <line
            key={gy}
            className="multi-weight-grid"
            x1={PAD_X}
            x2={W - PAD_X}
            y1={gy}
            y2={gy}
            strokeWidth="1"
          />
        ))}
        {plotted.map((item) => {
          const lastIndex = item.points.length - 1;
          const single = item.points.length === 1;
          // 单点宠物:画点不画线。用零长度 path + 圆头描边当「点」,
          // 双层描边(奶油底+序列色)与折线端点同款视觉;也让曲线图元统一为 polyline/path。
          const dot =
            single && (() => {
              const px = x(item.points[0].at);
              const py = y(item.points[0].kg);
              return `M ${px.toFixed(2)} ${py.toFixed(2)} l .01 0`;
            })();
          return (
            <g key={item.petId}>
              {!single && (
                <polyline
                  points={item.points
                    .map((point) => `${x(point.at)},${y(point.kg)}`)
                    .join(" ")}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {dot ? (
                <>
                  <path d={dot} fill="none" stroke="#fffdf8" strokeWidth="11" strokeLinecap="round" />
                  <path d={dot} fill="none" stroke={item.color} strokeWidth="8.2" strokeLinecap="round" />
                </>
              ) : (
                item.points.map((point, index) => (
                  <circle
                    key={`${point.at}-${index}`}
                    cx={x(point.at)}
                    cy={y(point.kg)}
                    r={index === lastIndex ? 3.4 : 2.2}
                    fill={index === lastIndex ? item.color : "#fffdf8"}
                    stroke={item.color}
                    strokeWidth="1.5"
                  />
                ))
              )}
            </g>
          );
        })}
        <text x={PAD_X} y={11} className="multi-weight-axis">
          {minKg.toFixed(2)} kg
        </text>
        <text x={W - PAD_X} y={11} textAnchor="end" className="multi-weight-axis">
          {maxKg.toFixed(2)} kg
        </text>
      </svg>
      <div className="multi-weight-legend">
        {plotted.map((item) => (
          <span key={item.petId} className="multi-weight-legend-item">
            <i style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
