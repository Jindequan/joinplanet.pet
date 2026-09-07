/* 「更多/详情」页通用的分区秩序组件：
   标签 + 一张卡 + 行（图标/文案/右侧），全应用唯一的信息组织方式。 */
import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export function MoreGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="more-group">
      <span className="more-group-label">{label}</span>
      <div className="more-card">{children}</div>
    </section>
  );
}

export function MoreRow({
  icon,
  title,
  sub,
  to,
  onClick,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  to?: string;
  onClick?: () => void;
  /** 覆盖默认箭头的右侧内容（徽标/计数/操作）。 */
  right?: React.ReactNode;
}) {
  const body = (
    <>
      <span className="more-row-icon" aria-hidden>{icon}</span>
      <span className="more-row-copy">
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      {right ?? <ChevronRight size={17} className="more-row-go" aria-hidden />}
    </>
  );
  if (to) {
    return (
      <Link className="more-row" to={to}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="more-row" onClick={onClick}>
        {body}
      </button>
    );
  }
  return (
    <div className="more-row more-row-static" role="group">
      {body}
    </div>
  );
}
