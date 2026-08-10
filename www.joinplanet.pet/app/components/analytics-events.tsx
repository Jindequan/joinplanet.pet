"use client";

import { useEffect } from "react";

// Delegates clicks on any element carrying `data-event` to gtag. This keeps
// the marketing landing page a Server Component while still emitting GA4
// events from the interactive CTAs. When no GA id is configured, gtag is a
// no-op and this component simply does nothing.
export function AnalyticsEvents() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Element | null;
      const el = target?.closest?.("[data-event]") as HTMLElement | null;
      if (!el) return;
      const eventName = el.getAttribute("data-event");
      if (!eventName) return;
      const category = el.getAttribute("data-event-category") ?? "engagement";
      const label = el.getAttribute("data-event-label") ?? undefined;
      const valueRaw = el.getAttribute("data-event-value");
      const value = valueRaw ? Number(valueRaw) : undefined;
      const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
      gtag?.("event", eventName, {
        event_category: category,
        ...(label ? { event_label: label } : {}),
        ...(Number.isFinite(value) ? { value } : {}),
      });
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
