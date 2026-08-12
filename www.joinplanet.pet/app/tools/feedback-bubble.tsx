"use client";

import { useState } from "react";
import { apiUrl } from "../lib/api-base";

/**
 * Feedback bubble — a tiny fixed-position widget that sits in the bottom-right
 * corner of every /tools/* page. It asks one open question: "What's not
 * working?" GA4 tells us what happened; this tells us why.
 *
 * Submissions go to the existing /intake endpoint (same one the post-payment
 * form uses), tagged with source = "tool_feedback" so they can be filtered.
 */
export function FeedbackBubble() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || status === "submitting") return;
    setStatus("submitting");
    try {
      const res = await fetch(apiUrl("/intake"), {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "anonymous@feedback",
          want: text.trim(),
          source: "tool_feedback",
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("done"); // don't error in user's face — silently accept
    }
  }

  if (!open) {
    return (
      <button
        className="feedback-fab"
        aria-label="Give feedback"
        onClick={() => setOpen(true)}
        data-event="feedback_open"
        data-event-category="feedback"
      >
        <span className="icon icon-message" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="feedback-panel">
      <div className="feedback-panel-head">
        <span>What could be better?</span>
        <button type="button" className="feedback-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>
      {status === "done" ? (
        <p className="feedback-done">
          <span className="icon icon-check" aria-hidden="true" /> Thanks. We read every one.
        </p>
      ) : (
        <form onSubmit={submit}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Anything that felt clunky, missing, or broken…"
            rows={3}
            data-event="feedback_start"
            data-event-category="feedback"
          />
          <button type="submit" className="button button-primary" disabled={status === "submitting" || !text.trim()}>
            {status === "submitting" ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
