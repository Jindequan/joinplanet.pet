"use client";

import { useState } from "react";
import { apiUrl } from "../lib/api-base";

const USE_CASES = [
  { id: "vet", label: "Vet visit", detail: "Get the recent changes in order." },
  { id: "meds", label: "Medication", detail: "Keep the daily routine clear." },
  { id: "sitter", label: "Sitter handoff", detail: "Share only what they need today." },
  { id: "daily", label: "Daily care", detail: "Make the small things visible." },
] as const;

type UseCase = (typeof USE_CASES)[number]["id"];

export function QuickDemo() {
  const [petName, setPetName] = useState("");
  const [useCase, setUseCase] = useState<UseCase>("vet");
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [voteStatus, setVoteStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submitVote(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || voteStatus === "sending") return;
    setVoteStatus("sending");
    try {
      const response = await fetch(apiUrl("/intake"), {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, want: `quick-demo:${useCase}`, source: "home_quick_demo" }),
      });
      if (!response.ok) throw new Error("vote failed");
      setVoteStatus("done");
    } catch {
      setVoteStatus("error");
    }
  }

  const displayName = petName.trim() || "your pet";

  return (
    <section className="quick-demo-section" id="quick-demo">
      <div className="narrative-shell quick-demo-layout">
        <div className="quick-demo-copy">
          <p className="narrative-eyebrow">Try the useful part first</p>
          <h2>See a care view<br /><em>in 30 seconds.</em></h2>
          <p>Give us a name and a moment that matters. We&apos;ll show you the kind of calm, shareable view PLANET is being built to make.</p>
          <p className="quick-demo-note"><span className="icon icon-circle-dot" aria-hidden="true" /> No account. No credit card. This is a preview, not medical advice.</p>
        </div>

        <div className="quick-demo-card">
          {!submitted ? (
            <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
              <label className="quick-demo-label" htmlFor="quick-demo-pet">Your pet&apos;s name</label>
              <input id="quick-demo-pet" value={petName} onChange={(event) => setPetName(event.target.value)} placeholder="Milo" maxLength={40} />
              <fieldset>
                <legend>What would you use first?</legend>
                <div className="quick-demo-options">
                  {USE_CASES.map((item) => (
                    <button className={item.id === useCase ? "selected" : ""} key={item.id} type="button" onClick={() => setUseCase(item.id)}>
                      <span className="quick-demo-option-mark"><span className="icon icon-check" aria-hidden="true" /></span>
                      <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <button className="narrative-button narrative-button-dark quick-demo-submit" type="submit" data-event="quick_demo_start" data-event-category="quick_demo" data-event-label={useCase}>
                Show my care view <span className="icon icon-arrow-right" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <div className="quick-demo-result" role="status">
              <div className="quick-demo-result-head"><span className="quick-demo-result-icon"><span className="icon icon-check" aria-hidden="true" /></span><div><span>PLANET CARE VIEW · PREVIEW</span><strong>{displayName}</strong></div></div>
              <div className="quick-demo-result-alert"><span className="icon icon-activity" aria-hidden="true" /><div><small>RECENT CHANGE</small><strong>Eating less since Tuesday</strong><p>Worth noting before the next visit.</p></div></div>
              <div className="quick-demo-result-grid"><div><small>CURRENT MEDICATION</small><strong>Apoquel · 16 mg</strong></div><div><small>TODAY&apos;S HANDOFF</small><strong>Breakfast + walk</strong></div></div>
              <p className="quick-demo-result-foot">Organized for review. You stay in control before anything is shared.</p>
              <form className="quick-demo-vote" onSubmit={submitVote}>
                <label htmlFor="quick-demo-email">Want the first real version for {displayName}?</label>
                <div><input id="quick-demo-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@home.com" required /><button className="narrative-button narrative-button-light" type="submit" disabled={voteStatus === "sending" || voteStatus === "done"}>{voteStatus === "done" ? "You're on the list" : voteStatus === "sending" ? "Saving…" : "Join the pilot"}</button></div>
                <small>{voteStatus === "error" ? "We couldn&apos;t save that. Please try again or email support@joinplanet.pet." : "No sales sequence. We&apos;ll only write when there is something real to try."}</small>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
