"use client";

import { useState } from "react";
import { apiUrl } from "../lib/api-base";

export function CoCreateForm() {
  const [petName, setPetName] = useState("");
  const [wish, setWish] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!petName.trim() || !wish.trim() || !email.trim() || status === "submitting") return;
    setStatus("submitting");
    try {
      const [capture, intake] = await Promise.all([
        fetch(apiUrl("/email-capture"), {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, source: "home_cocreate" }),
        }),
        fetch(apiUrl("/intake"), {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            want: `${petName.trim()}: ${wish.trim()}`,
            source: "home_cocreate",
          }),
        }),
      ]);
      if (!capture.ok || !intake.ok) throw new Error("submission failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="cocreate-success" role="status">
        <span className="cocreate-success-mark" aria-hidden="true">✓</span>
        <div>
          <p className="section-label">You helped shape PLANET</p>
          <h3>Thank you for telling us about {petName}.</h3>
          <p>We&apos;ll carry this into the first shared care space—and invite you when there is something real to try.</p>
        </div>
      </div>
    );
  }

  return (
    <form className="cocreate-form" onSubmit={handleSubmit} aria-label="Help shape PLANET">
      <label>
        <span>What is your pet&apos;s name?</span>
        <input value={petName} onChange={(event) => setPetName(event.target.value)} placeholder="Milo" required />
      </label>
      <label className="cocreate-wide">
        <span>What do you wish everyone caring for them always knew?</span>
        <textarea value={wish} onChange={(event) => setWish(event.target.value)} placeholder="The routine, small change, medicine, or piece of their story that matters most…" required />
      </label>
      <label>
        <span>Where should we send your invitation?</span>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@home.com" required />
      </label>
      <div className="cocreate-submit cocreate-wide">
        <button className="narrative-button narrative-button-light" type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending your story…" : "I want to help shape PLANET"}
          <span aria-hidden="true">↗</span>
        </button>
        <p>One thoughtful note from us when there is something real to see. No sales sequence.</p>
        {status === "error" ? <p className="cocreate-error">We couldn&apos;t save this just now. Please try again or email hello@joinplanet.pet.</p> : null}
      </div>
    </form>
  );
}
