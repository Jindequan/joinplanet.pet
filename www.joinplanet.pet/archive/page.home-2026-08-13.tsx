import { EmailCapture } from "../app/components/email-capture";
import { FoundingProgress } from "../app/components/founding-progress";

const launchPrice = process.env.NEXT_PUBLIC_LIFETIME_PRICE_DISPLAY || "S$29.99";
const checkoutUrl = "/checkout?variant=current";

export default function Home() {
  return (
    <main>
      {/* NAV — 首屏不要钱,中性引导 */}
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="PLANET home">
          <span className="brand-mark" aria-hidden="true" />
          PLANET
        </a>
        <div className="nav-links">
          <a href="/tools" data-event="nav_tools" data-event-category="nav" data-event-label="nav_tools">Free tools</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a className="nav-cta" href="#pricing" data-event="cta_click" data-event-category="nav" data-event-label="nav_see_plans">See plans <span className="icon icon-arrow-up-right" aria-hidden="true" /></a>
        </div>
      </nav>

      {/* ① HERO — 痛点钩子,留人,不要钱 */}
      <section className="hero shell" id="top">
        <div className="hero-copy">
          <p className="kicker"><span className="pulse" /> For families raising a pet together</p>
          <h1>Your pet&apos;s life lives<br /><em>in a dozen places.</em></h1>
          <p className="hero-lead">
            Walks in a group chat. Vaccines in a photo. The last blood test in a drawer. PLANET keeps it all in one calm place — shared with everyone who helps, ready for the vet.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#how-it-works" data-event="cta_click" data-event-category="hero" data-event-label="hero_see_how">See how PLANET works <span className="icon icon-arrow-right" aria-hidden="true" /></a>
            <a className="text-link" href="/tools">or try a free tool <span className="icon icon-arrow-right" aria-hidden="true" /></a>
          </div>
          <p className="microcopy">Now building with the founding 100.</p>
        </div>

        <div className="story-hero-visual" aria-label="PLANET keeps your pet's whole story in one place">
          <img src="/cover1.png" alt="PLANET health timeline — daily care, weight, medication, and vet visits in one place" />
        </div>
      </section>

      {/* ② 痛点 — 金句 + 视觉,砍掉长段落 */}
      <section className="story-section shell story-split story-fragments">
        <figure className="story-image story-image-wide"><img src="/cover3.png" alt="Pet records scattered across chats, photos, and drawers" /><figcaption>Where does the whole story live right now?</figcaption></figure>
        <div className="story-copy">
          <p className="section-label">Sound familiar?</p>
          <h2>Every vet visit,<br /><em>you rebuild it from memory.</em></h2>
          <div className="story-points">
            <span><span className="icon icon-file-text" aria-hidden="true" /> Records scattered everywhere</span>
            <span><span className="icon icon-clock" aria-hidden="true" /> Changes are hard to see over time</span>
            <span><span className="icon icon-stethoscope" aria-hidden="true" /> Every vet visit starts from zero</span>
          </div>
        </div>
      </section>

      {/* ③ 价值 1 — 就医准备,截图 + 一句话 */}
      <section className="story-section shell story-split story-intelligence">
        <div className="story-copy">
          <p className="section-label">Walk in ready</p>
          <h2>A vet-ready summary,<br /><em>in one tap.</em></h2>
          <p>Upload what you have. Add what you remember. Hand the vet one clear page — not a pile of photos.</p>
          <p className="story-disclaimer">PLANET organizes and prepares. It does not diagnose or replace a licensed veterinarian.</p>
        </div>
        <figure className="story-image story-image-wide"><img src="/cover4.png" alt="A vet-ready summary shared from PLANET in one tap" /><figcaption>One page. The right context for the vet.</figcaption></figure>
      </section>

      {/* ④ 价值 2 — 家庭协作,截图 + 一句话 */}
      <section className="story-section shell story-split story-family">
        <figure className="story-image story-image-wide"><img src="/1.png" alt="A pet profile shared with family, sitters, and the vet" /><figcaption>One record. The right view for each person.</figcaption></figure>
        <div className="story-copy">
          <p className="section-label">Care is shared</p>
          <h2>Everyone knows<br /><em>who did what today.</em></h2>
          <p>Partner, kids, sitter, walker — each sees the right piece. No more &ldquo;did anyone feed him?&rdquo;</p>
        </div>
      </section>

      {/* ⑤ HOW IT WORKS — 3 卡,精简描述 */}
      <section className="section shell" id="how-it-works">
        <div className="section-heading split-heading">
          <div><p className="section-label">One place, every part of care</p><h2>From the first walk<br /><em>to the hardest day.</em></h2></div>
          <p className="section-intro">One calm home for your pet&apos;s whole life — daily care, health, and every handoff.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-card-dark"><span className="feature-number">01</span><div className="feature-icon"><span className="icon icon-paw-print" aria-hidden="true" /></div><h3>Know them deeply</h3><p>One living profile: identity, habits, food, weight, documents, memories.</p><a href="#pricing">See the membership <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></article>
          <article className="feature-card"><span className="feature-number">02</span><div className="feature-icon soft"><span className="icon icon-sun" aria-hidden="true" /></div><h3>Care for today</h3><p>Meals, walks, meds, routines — and who&apos;s responsible right now.</p><a href="#pricing">Keep care in sync <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></article>
          <article className="feature-card feature-card-accent"><span className="feature-number">03</span><div className="feature-icon"><span className="icon icon-heart-pulse" aria-hidden="true" /></div><h3>Protect their health</h3><p>Symptoms, records, vaccines — and a vet-ready summary, one tap away.</p><a href="#pricing">Prepare for care <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></article>
        </div>
      </section>

      {/* ⑥ 信任段 — 能力证据(免费工具已上线) + 诚实 roadmap */}
      <section className="roadmap-section" id="trust">
        <div className="shell">
          <div className="roadmap-heading"><p className="section-label">Built openly</p><h2>What&apos;s ready now<br /><em>and what&apos;s coming.</em></h2></div>
          <div className="roadmap-grid">
            <article><span>01 · NOW</span><h3>3 free tools live</h3><p>Pet Card, Symptom Check, Care Schedule — usable today, no sign-up.</p></article>
            <article><span>02 · NEXT</span><h3>The full timeline</h3><p>Daily care, health records, photos, documents — one living profile.</p></article>
            <article><span>03 · TOGETHER</span><h3>Shared care</h3><p>Family, sitters, vets — the right view for each person, one tap.</p></article>
            <article><span>04 · ALWAYS</span><h3>A companion</h3><p>A pet model that grows with them and keeps them close.</p></article>
          </div>
        </div>
      </section>

      {/* ⑦ 创始人故事 — 从首屏后移到信任段,简短,人格化背书 */}
      <section className="story-section shell story-origin" id="story">
        <div className="story-copy">
          <p className="section-label">The person behind PLANET</p>
          <h2>I built this<br /><em>to remember him.</em></h2>
          <p>I kept losing track — every meal, every check-up, every walk. Then he turned five, and the hard part was coming. So I started building.</p>
          <a className="text-link" href="mailto:hello@joinplanet.pet">Talk to me directly <span className="icon icon-arrow-right" aria-hidden="true" /></a>
        </div>
        <figure className="story-image story-image-portrait"><img src="/mydog.JPG" alt="The dog who inspired PLANET" /><figcaption>Every product decision starts here.</figcaption></figure>
      </section>

      {/* ⑧ PRICING — 奖励早期框架,退款前置 */}
      <section className="section shell pricing-section" id="pricing">
        <div className="section-heading pricing-heading"><p className="section-label">Founding 100 · lifetime</p><h2>Pay once.<br /><em>Keep it for life.</em></h2><p className="section-intro">A thank-you for being early. The first 100 families shape PLANET and keep it for life — after that, it becomes a subscription.</p></div>
        <FoundingProgress />
        <div className="pricing-grid pricing-grid-single">
          <article className="price-card price-card-featured">
            <p className="price-eyebrow">One membership for every PLANET household</p><h3>Lifetime Membership</h3>
            <div className="price"><strong>{launchPrice}</strong><span>one payment · lifetime</span></div>
            <ul>
              <li><span><span className="icon icon-check" aria-hidden="true" /></span>Whole-life pet profile</li>
              <li><span><span className="icon icon-check" aria-hidden="true" /></span>Daily care + health records</li>
              <li><span><span className="icon icon-check" aria-hidden="true" /></span>Shared care circle</li>
              <li><span><span className="icon icon-check" aria-hidden="true" /></span>Vet, travel + emergency handoffs</li>
            </ul>
            <a className="button button-primary" href={checkoutUrl} data-event="checkout_click" data-event-category="pricing" data-event-label="price_card_main">Join the founding 100 <span className="icon icon-arrow-right" aria-hidden="true" /></a>
            <p className="pricing-note" style={{ marginTop: "14px", fontWeight: 600, color: "var(--green)" }}>14-day no-questions refund. If we don&apos;t deliver what we promised, you get your money back.</p>
            <p className="pricing-note">Lifetime access covers PLANET&apos;s core pet care, health timeline, and handoff features for at least 24 months; any future high-cost professional service would be priced separately and clearly.</p>
          </article>
        </div>
      </section>

      <EmailCapture />

      <section className="final-cta shell"><div><p className="section-label">Founding 100 · lifetime access</p><h2>Give their whole life<br /><em>a place to belong.</em></h2></div><a className="button button-primary" href="#pricing" data-event="cta_click" data-event-category="final_cta" data-event-label="final_join">Join the founding 100 <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></section>

      <footer className="footer shell"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true" />PLANET</a><span>Their whole world. One place.</span><span>© 2026 PLANET</span></footer>

    </main>
  );
}
