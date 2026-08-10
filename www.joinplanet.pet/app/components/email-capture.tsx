"use client";

import { useState } from "react";
import { apiUrl } from "../lib/api-base";

export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

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
        body: JSON.stringify({ email, source: "waitlist" }),
      });
      if (!response.ok) throw new Error("capture failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="email-capture-done">
        <span className="icon icon-check" aria-hidden="true" />
        <span>You&apos;re on the list. We&apos;ll reach out before the next founding places open.</span>
      </div>
    );
  }

  return (
    <form className="email-capture" onSubmit={handleSubmit} aria-label="Join the waitlist">
      <div className="email-capture-copy">
        <p className="section-label">Not ready to pay yet?</p>
        <h2>Keep your spot in line.</h2>
        <p>Leave your email and we&apos;ll let you know before the price rises — and personally talk through what you need.</p>
      </div>
      <div className="email-capture-field">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@home.com"
          aria-label="Your email"
          required
        />
        <button className="button button-primary" type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Saving…" : "Notify me"}
        </button>
        {status === "error" ? <p className="email-capture-error">Something went wrong. Please try again.</p> : null}
      </div>
    </form>
  );
}
