"use client";

import { useState } from "react";
import { apiUrl } from "../lib/api-base";

type Props = {
  orderId?: string;
};

export function IntakeForm({ orderId }: Props) {
  const [email, setEmail] = useState("");
  const [want, setWant] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !want.trim() || status === "submitting") return;
    setStatus("submitting");
    try {
      const response = await fetch(apiUrl("/intake"), {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, want, order_id: orderId, source: "post_payment" }),
      });
      if (!response.ok) throw new Error("intake failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="success-state">
        <div className="success-icon"><span className="icon icon-check" aria-hidden="true" /></div>
        <p className="section-label">Received</p>
        <h2>Thank you. Your seat is locked in.</h2>
        <p>We&apos;ll use exactly what you told us to shape the first version of PLANET around your real needs.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="modal" aria-label="Tell us what matters most">
      <label htmlFor="intake-email">Email</label>
      <input
        id="intake-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@home.com"
        required
      />
      <label htmlFor="intake-want">What would you most want PLANET to solve first?</label>
      <textarea
        id="intake-want"
        value={want}
        onChange={(event) => setWant(event.target.value)}
        placeholder="One sentence is enough — e.g. &quot;remember who fed the dog today&quot; or &quot;get my pet&apos;s history ready for the vet in one click.&quot;"
        required
      />
      <button className="button button-primary" type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send it"}
      </button>
      {status === "error" ? <p className="modal-footnote">Something went wrong. Try again, or email us directly.</p> : <p className="modal-footnote">No account needed. We only use this to build what you actually asked for.</p>}
    </form>
  );
}
