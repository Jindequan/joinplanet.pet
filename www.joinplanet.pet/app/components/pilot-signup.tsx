"use client";

import { useState } from "react";
import { apiUrl } from "../lib/api-base";
import { FoundingProgress } from "./founding-progress";

type Status = "idle" | "submitting" | "done" | "error";

// The support card's dual path: the free pilot signup is primary, the
// refundable founding seat stays visible as the secondary option — and gets
// re-offered with the live progress meter right after a pilot signup.
export function PilotSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const foundingPrice = process.env.NEXT_PUBLIC_LIFETIME_PRICE_DISPLAY || "S$29.99";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || status === "submitting") return;
    setStatus("submitting");
    try {
      const response = await fetch(apiUrl("/email-capture"), {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "home_pilot" }),
      });
      if (!response.ok) throw new Error("pilot signup failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="pilot-signup">
      {status === "done" ? (
        <div className="pilot-success" role="status">
          <span className="pilot-success-mark" aria-hidden="true"><span className="icon icon-check" /></span>
          <div>
            <p className="pilot-success-title">You&apos;re on the pilot list.</p>
            <p>We&apos;ll email you when the first working version is ready to test. No payment is needed to take part.</p>
          </div>
        </div>
      ) : (
        <form className="pilot-form" onSubmit={handleSubmit} aria-label="Join the PLANET pilot">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@home.com"
            aria-label="Email address"
            required
          />
          <button
            className="narrative-button narrative-button-dark"
            type="submit"
            disabled={status === "submitting"}
            data-event="pilot_join_click"
            data-event-category="pilot"
            data-event-label="support_form"
          >
            {status === "submitting" ? "Saving your seat…" : "Join the pilot"}
            <span className="icon icon-arrow-up-right" aria-hidden="true" />
          </button>
          <div className="pilot-payment-note">
            <span className="icon icon-circle-dot" aria-hidden="true" />
            <strong>No payment during pilot signup.</strong>
            <small>We&apos;ll publish the first version, scope and optional founding terms before asking anyone to pay.</small>
          </div>
          {status === "error" ? (
            <p className="pilot-error">We couldn&apos;t save this just now. Please try again or email support@joinplanet.pet.</p>
          ) : null}
        </form>
      )}

      <div className="support-or" aria-hidden="true"><span>{status === "done" ? "want to do more?" : "or"}</span></div>

      <div className="support-deposit">
        <div className="support-deposit-top"><span>FOUNDING SEAT · FROM {foundingPrice}</span><span className="support-live"><i /> LIVE</span></div>
        <h4>Back the first build</h4>
        <p>Already believe this should exist? A one-time founding seat funds the next stretch of building—<strong><a href="/refund">fully refundable</a> any time before the first version ships</strong>.</p>
        <a
          className="narrative-button narrative-button-ghost"
          href="/checkout?variant=current"
          data-event="founding_deposit_click"
          data-event-category="founding"
          data-event-label={status === "done" ? "pilot_success" : "support_card"}
        >
          Become a founding member <span className="icon icon-arrow-up-right" aria-hidden="true" />
        </a>
        <FoundingProgress compact mode="founding" />
      </div>
    </div>
  );
}
