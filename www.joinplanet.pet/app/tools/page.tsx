import Link from "next/link";

/**
 * Free tools hub — the curated entry point to PLANET's three free tools.
 *
 * Design intent: this page should feel like a thoughtfully curated set of
 * useful, beautiful things — not a feature list. Each tool card has its own
 * visual personality that hints at what's inside, so the user can feel the
 * variety before clicking in.
 *
 * The three tools are deliberately different in tone:
 *   Pet Card     → playful, creative, warm (you're making something pretty)
 *   Symptom Check → calm, clinical but kind (you're looking something up)
 *   Care Schedule → organized, familial, reassuring (you're coordinating)
 */
export default function ToolsHub() {
  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="PLANET home">
          <span className="brand-mark" aria-hidden="true" />
          PLANET
        </Link>
        <div className="nav-links">
          <Link href="/#story">The story</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link className="nav-cta" href="/#pricing">Join the founding 100</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="shell hub-hero" id="top">
        <div className="hub-hero-copy">
          <p className="kicker"><span className="pulse" /> Free tools · for pet families</p>
          <h1>Three small things,<br /><em>made with care.</em></h1>
          <p className="hero-lead">
            Free, fast, and actually useful. No account, no paywall, no catch.
            Pick one, use it today, share it with anyone.
          </p>
          <div className="hub-hero-meta">
            <span><span className="hub-hero-dot hub-hero-dot-green" /> No sign-up</span>
            <span><span className="hub-hero-dot hub-hero-dot-coral" /> Shareable</span>
            <span><span className="hub-hero-dot hub-hero-dot-yellow" /> Free forever</span>
          </div>
        </div>
        <div className="hub-hero-visual" aria-hidden="true">
          <div className="hub-orb hub-orb-1" />
          <div className="hub-orb hub-orb-2" />
          <div className="hub-orb hub-orb-3" />
          <div className="hub-orb-core"><span className="icon icon-paw-print" aria-hidden="true" /></div>
        </div>
      </section>

      {/* Tool cards — each with distinct visual personality */}
      <section className="shell hub-tools">
        {/* Card 1: Pet Card — playful, creative */}
        <Link className="hub-card hub-card-petcard" href="/tools/pet-card"
          data-event="tools_pick" data-event-category="tools" data-event-label="pick_pet_card">
          <div className="hub-card-stamp">Most loved</div>
          <div className="hub-card-preview hub-preview-petcard">
            <div className="hub-mock-card hub-mock-polaroid">
              <div className="hub-mock-photo hub-mock-photo-polaroid" />
              <span className="hub-mock-name hub-mock-name-polaroid">Milo</span>
              <span className="hub-mock-breed">Golden Retriever</span>
              <div className="hub-mock-chips"><span>Gentle</span><span>Goofy</span></div>
            </div>
          </div>
          <div className="hub-card-body">
            <div className="hub-card-icon hub-icon-coral"><span className="icon icon-paw-print" aria-hidden="true" /></div>
            <h2>Pet Card</h2>
            <p>A beautiful card for your pet. Photo, name, personality, the one line the world should know. Save it, share it, print it.</p>
            <span className="hub-card-cta">Make a card <span className="icon icon-arrow-right" aria-hidden="true" /></span>
          </div>
        </Link>

        {/* Card 2: Symptom Check — calm, clinical */}
        <Link className="hub-card hub-card-symptom" href="/tools/symptoms"
          data-event="tools_pick" data-event-category="tools" data-event-label="pick_symptom_check">
          <div className="hub-card-stamp hub-card-stamp-info">Quick reference</div>
          <div className="hub-card-preview hub-preview-symptom">
            <div className="hub-mock-symptom">
              <span className="hub-mock-sev hub-mock-sev-monitor">Monitor</span>
              <span className="hub-mock-symptom-name">Vomiting</span>
              <div className="hub-mock-symptom-lines"><span /><span /><span /></div>
            </div>
            <div className="hub-mock-symptom">
              <span className="hub-mock-sev hub-mock-sev-call">Call vet</span>
              <span className="hub-mock-symptom-name">Not eating</span>
              <div className="hub-mock-symptom-lines"><span /><span /></div>
            </div>
          </div>
          <div className="hub-card-body">
            <div className="hub-card-icon hub-icon-sage"><span className="icon icon-stethoscope" aria-hidden="true" /></div>
            <h2>Symptom Check</h2>
            <p>Something seems off? Look up common symptoms, normal vitals, and what each one might mean — without the panic-spiral of a web search.</p>
            <span className="hub-card-cta">Check a symptom <span className="icon icon-arrow-right" aria-hidden="true" /></span>
          </div>
        </Link>

        {/* Card 3: Care Schedule — organized, familial */}
        <Link className="hub-card hub-card-schedule" href="/tools/schedule"
          data-event="tools_pick" data-event-category="tools" data-event-label="pick_care_schedule">
          <div className="hub-card-stamp hub-card-stamp-warm">For the whole home</div>
          <div className="hub-card-preview hub-preview-schedule">
            <div className="hub-mock-calendar">
              <div className="hub-mock-cal-head">Next up</div>
              <div className="hub-mock-cal-item hub-mock-cal-urgent">
                <span className="hub-mock-cal-date"><small>AUG</small><strong>18</strong></span>
                <span className="hub-mock-cal-label">Rabies booster</span>
              </div>
              <div className="hub-mock-cal-item">
                <span className="hub-mock-cal-date"><small>SEP</small><strong>02</strong></span>
                <span className="hub-mock-cal-label">Deworming</span>
              </div>
              <div className="hub-mock-cal-item hub-mock-cal-done">
                <span className="hub-mock-cal-date hub-mock-cal-date-done"><small>JUL</small><strong>15</strong></span>
                <span className="hub-mock-cal-label">Annual checkup ✓</span>
              </div>
            </div>
          </div>
          <div className="hub-card-body">
            <div className="hub-card-icon hub-icon-amber"><span className="icon icon-clock" aria-hidden="true" /></div>
            <h2>Care Schedule</h2>
            <p>Vaccines, deworming, flea — when is the next one due? Build a shared calendar, send one link to your family, stay in sync.</p>
            <span className="hub-card-cta">Set up reminders <span className="icon icon-arrow-right" aria-hidden="true" /></span>
          </div>
        </Link>
      </section>

      {/* Trust strip */}
      <section className="hub-trust shell">
        <div className="hub-trust-item">
          <span className="icon icon-check" aria-hidden="true" />
          <div><strong>No account needed</strong><span>Use every tool without signing up</span></div>
        </div>
        <div className="hub-trust-item">
          <span className="icon icon-share" aria-hidden="true" />
          <div><strong>Share with anyone</strong><span>Links open without registration</span></div>
        </div>
        <div className="hub-trust-item">
          <span className="icon icon-heart-pulse" aria-hidden="true" />
          <div><strong>Made by a pet parent</strong><span>Built from real need, not a feature list</span></div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="shell hub-closing">
        <p className="section-label">These tools are free forever</p>
        <h2>If they help you, there&apos;s more where that came from.</h2>
        <p className="hub-closing-sub">PLANET is building the full picture — daily care, health timeline, and every handoff, all in one calm place. These tools are the first pieces.</p>
        <div className="hub-closing-actions">
          <Link className="button button-primary" href="/#pricing"
            data-event="tools_to_pricing" data-event-category="tools" data-event-label="tools_to_pricing">
            See the founding membership <span className="icon icon-arrow-right" aria-hidden="true" />
          </Link>
          <Link className="text-link" href="/#story">Read the story</Link>
        </div>
      </section>

      <footer className="footer shell">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true" />PLANET</Link>
        <span>Their whole world. One place.</span>
        <span>© 2026 PLANET</span>
      </footer>
    </main>
  );
}
