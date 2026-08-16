"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "../lib/api-base";

type ProgressData = {
  paidMembers: number;
  nextMemberNumber: number;
  capacity: number;
  remaining: number;
  percent: number;
  currentVariant: string | null;
};

// Three founding tiers. Width is the share of the 100-capacity bar.
const TIERS = [
  { key: "founding_20", min: 0, max: 10, width: 10, price: "S$29.99", range: "#1—10", label: "Founding" },
  { key: "early_60", min: 10, max: 50, width: 40, price: "S$69.99", range: "#11—50", label: "Early" },
  { key: "final_100", min: 50, max: 100, width: 50, price: "S$129.99", range: "#51—100", label: "Final" },
] as const;

const POLL_INTERVAL = 45000;

// mode "auto" keeps the pilot-recruiting fallback for the free pilot card;
// mode "founding" always shows the paid-seat meter, even before the first
// payment lands — used where the founding deposit itself is the offer.
export function FoundingProgress({ compact = false, mode = "auto" }: { compact?: boolean; mode?: "auto" | "founding" }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch(apiUrl("/progress"), {
          cache: "no-store",
          mode: "cors",
          credentials: "omit",
        });
        if (!response.ok) return;
        const next = (await response.json()) as ProgressData;
        if (!active) return;
        setData(next);
        setSyncedAt(new Date());
      } catch {
        // Keep last known data; the bar still shows the previous count.
      }
    }

    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL);

    function onVisible() {
      if (document.visibilityState === "visible") refresh();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const paid = data?.paidMembers ?? 0;
  const capacity = data?.capacity ?? 100;
  const percent = data?.percent ?? 0;
  const currentTier = TIERS.find((t) => paid < t.max) ?? TIERS[TIERS.length - 1];
  const isSoldOut = data != null && paid >= capacity;

  if (mode !== "founding" && compact && data == null) {
    return (
      <div className="pilot-meter" aria-label="PLANET is recruiting pilot families">
        <div><strong>Recruiting the first 10 pilot families</strong><span>Help test the first real care view.</span></div>
        <span className="pilot-meter-status">Open</span>
      </div>
    );
  }

  if (mode !== "founding" && compact && data != null && paid === 0) {
    return (
      <div className="pilot-meter" aria-label="PLANET is recruiting pilot families">
        <div><strong>Recruiting the first 10 pilot families</strong><span>Be among the first to test a working version.</span></div>
        <span className="pilot-meter-status">Open</span>
      </div>
    );
  }

  return (
    <div className={`founding-meter${compact ? " founding-meter-compact" : ""}`} aria-live="polite">
      {/* Header: big count + status */}
      <div className="meter-header">
        <div className="meter-count">
          <strong>{paid}</strong>
          <span>/ {capacity} founding members</span>
        </div>
        <div className="meter-status">
          {data == null ? (
            <span className="meter-pill meter-pill-syncing">Confirming live count…</span>
          ) : isSoldOut ? (
            <span className="meter-pill meter-pill-soldout">Sold out</span>
          ) : (
            <span className="meter-pill meter-pill-open">
              <span className="pulse" /> {capacity - paid} places left
            </span>
          )}
        </div>
      </div>

      {/* The 3-tier segmented progress bar */}
      <div className="meter-track" role="img" aria-label={`${paid} of ${capacity} founding members paid. Current tier: ${currentTier.label}, ${currentTier.price}.`}>
        <div className="meter-fill" style={{ width: `${percent}%` }} />
        {TIERS.map((tier) => {
          const tierSoldOut = paid >= tier.max;
          const tierActive = paid >= tier.min && paid < tier.max;
          return (
            <div
              key={tier.key}
              className={[
                "meter-segment",
                tierActive ? "meter-segment-active" : "",
                tierSoldOut ? "meter-segment-done" : "",
              ].join(" ").trim()}
              style={{ width: `${tier.width}%` }}
            >
              {tierActive ? <span className="meter-marker" /> : null}
            </div>
          );
        })}
        {/* divider ticks at tier boundaries (10 and 50) */}
        <span className="meter-tick" style={{ left: "10%" }} />
        <span className="meter-tick" style={{ left: "50%" }} />
      </div>

      {/* Tier labels under the bar */}
      <div className="meter-tiers">
        {TIERS.map((tier) => {
          const tierSoldOut = paid >= tier.max;
          const tierActive = paid >= tier.min && paid < tier.max;
          return (
            <div
              key={tier.key}
              className={[
                "meter-tier",
                tierActive ? "meter-tier-active" : "",
                tierSoldOut ? "meter-tier-done" : "",
              ].join(" ").trim()}
            >
              <span className="meter-tier-label">{tier.label}</span>
              <strong className="meter-tier-price">{tier.price}</strong>
              <small className="meter-tier-range">{tier.range}{tierSoldOut ? " · filled" : tierActive ? " · you are here" : ""}</small>
            </div>
          );
        })}
      </div>

      {/* Footer line */}
      <p className="meter-footnote">
        {data == null
          ? "Your place is confirmed after Lemon payment and webhook settlement."
          : isSoldOut
            ? "The first 100 lifetime places are sold out. New members will subscribe."
            : <>You would be founding member <strong>#{paid + 1}</strong> at <strong>{currentTier.price}</strong>. Price rises as each tier fills. <span className="meter-live">● live</span></>}
        {syncedAt ? <span className="meter-synced"> · checked {syncedAt.toLocaleTimeString()}</span> : null}
      </p>
    </div>
  );
}
