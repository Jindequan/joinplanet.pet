/* 体重曲线：无第三方库的 SVG 面积折线图，供档案页与趋势页复用。 */
import { useState } from "react";
import { useT } from "../core/i18n";

export type WeightPoint = { at: number; kg: number; label: string };

/* 气泡宽度按字符估宽（CJK 记双宽），配左右内边距；零依赖、不依赖 DOM 测量。 */
function tipWidth(text: string): number {
  let units = 0;
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e7f ? 1.8 : 1;
  return Math.ceil(units * 6.4) + 20;
}

export function WeightChart({ points }: { points: WeightPoint[] }) {
  const t = useT();
  // 触点查值：activeIndex 指向当前选中点；null 即收起气泡。
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const W = 320;
  const H = 110;
  const PAD_X = 10;
  const PAD_Y = 14;
  const HIT_R = 14; // 透明命中圆半径：拇指友好，又不撑破视觉
  const TIP_GAP = 12; // 气泡悬在数据点上方 12px
  const TIP_H = 22; // 气泡高度（内含 11px 文本）
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
  const live =
    activeIndex !== null && activeIndex < points.length ? activeIndex : null;
  // 气泡几何：默认悬在点上方 TIP_GAP；左右贴边时水平收进来，上方放不下翻到下方。
  const tip =
    live === null
      ? null
      : (() => {
          const point = points[live];
          const px = x(live);
          const py = y(point.kg);
          const text = `${point.kg} kg · ${point.label}`;
          const w = tipWidth(text);
          const bx = Math.min(Math.max(px - w / 2, 2), W - w - 2);
          const above = py - TIP_GAP - TIP_H;
          const by = above >= 2 ? above : Math.min(py + TIP_GAP, H - TIP_H - 2);
          return { bx, by, w, text, tx: bx + w / 2, ty: by + 15 };
        })();
  // 再点同点取消；点其他点切换。
  function toggle(index: number) {
    setActiveIndex((current) => (current === index ? null : index));
  }
  return (
    <svg
      className="weight-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={t(`体重变化曲线，从 ${points[0].kg} 公斤到 ${points[last].kg} 公斤`, `Weight trend from ${points[0].kg} kg to ${points[last].kg} kg`)}
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
          className={`weight-chart-dot${live === index ? " is-active" : ""}`}
          cx={x(index)}
          cy={y(point.kg)}
          r={index === last ? 4.4 : 2.8}
          fill={index === last ? "#2E5747" : "#fff"}
          stroke="#3E7460"
          strokeWidth="1.8"
        />
      ))}
      {points.map((point, index) => (
        <circle
          key={`hit-${point.at}`}
          className="weight-chart-hit"
          cx={x(index)}
          cy={y(point.kg)}
          r={HIT_R}
          role="button"
          aria-label={`${point.kg} 公斤 ${point.label}`}
          onPointerDown={(event) => {
            event.preventDefault();
            // 鼠标走 hover（pointerenter 已选中），点按不再切换以免互相抵消；
            // 触摸/笔/合成事件靠点按选中和再点取消。
            if (event.pointerType !== "mouse") toggle(index);
          }}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            setActiveIndex(index);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== "mouse") return;
            setActiveIndex((current) => (current === index ? null : current));
          }}
        />
      ))}
      <text x={PAD_X} y={PAD_Y - 3} className="weight-chart-min">{min} kg</text>
      <text x={W - PAD_X} y={PAD_Y - 3} textAnchor="end" className="weight-chart-min">{max} kg</text>
      {tip && (
        <g className="weight-chart-tip">
          <rect
            className="weight-chart-tip-box"
            x={tip.bx}
            y={tip.by}
            width={tip.w}
            height={TIP_H}
            rx={10}
          />
          <text
            className="weight-chart-tip-text"
            x={tip.tx}
            y={tip.ty}
            textAnchor="middle"
          >
            {tip.text}
          </text>
        </g>
      )}
    </svg>
  );
}
