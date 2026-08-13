import { EmailCapture } from "../app/components/email-capture";
import { FoundingProgress } from "../app/components/founding-progress";

const launchPrice = process.env.NEXT_PUBLIC_LIFETIME_PRICE_DISPLAY || "S$29.99";
const checkoutUrl = "/checkout?variant=current";

const plans = [
  {
    name: "Lifetime Membership",
    eyebrow: "One membership for every PLANET household",
    price: launchPrice,
    unit: "one payment · lifetime",
    description: "One calm home for their profile, routines, health, people, places, and every important handoff — supported by a professional pet model built for life and health.",
    features: ["Professional pet intelligence", "Whole-life pet profile", "Daily care + health records", "Shared care circle", "Vet, travel + emergency handoffs"],
    featured: true,
    slug: "lifetime",
  },
];

export default function Home() {
  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top" aria-label="PLANET home">
          <span className="brand-mark" aria-hidden="true" />
          PLANET
        </a>
        <div className="nav-links">
          <a href="/tools" data-event="nav_tools" data-event-category="nav" data-event-label="nav_tools">Free tools</a>
          <a href="#story">The story</a>
          <a href="#roadmap">The path</a>
          <a href="#pricing">Pricing</a>
          <a className="nav-cta" href="#pricing" data-event="cta_click" data-event-category="nav" data-event-label="nav_lock_in">Lock in {launchPrice} <span className="icon icon-arrow-up-right" aria-hidden="true" /></a>
        </div>
      </nav>

      {/* ① HERO — 第一人称开场,真实照片建立信任 */}
      <section className="hero shell" id="top">
        <div className="hero-copy">
          <p className="kicker"><span className="pulse" /> A founder&apos;s story · Founding 100</p>
          <h1>I didn&apos;t plan to build an app.<br /><em>I just wanted to remember him.</em></h1>
          <p className="hero-lead">
            Every bag of food, every check-up, every grooming day, every walk and photo — I kept losing track. Then he turned five, and I realized the hard part was coming. So I started building PLANET.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/tools" data-event="cta_click" data-event-category="hero" data-event-label="hero_tools">Try the free tools <span className="icon icon-arrow-right" aria-hidden="true" /></a>
            <a className="text-link" href="#story">Or read the story <span className="icon icon-chevron-down" aria-hidden="true" /></a>
          </div>
          <p className="microcopy">For the life you are already building together — now held in one place.</p>
        </div>

        <div className="story-hero-visual" aria-label="The dog behind PLANET">
          <img src="/mydog.JPG" alt="The dog who inspired PLANET, after a grooming visit" />
          <div className="story-hero-note"><span className="note-icon"><span className="icon icon-heart-pulse" aria-hidden="true" /></span><div><strong>This is why</strong><small>Every product decision starts here</small></div></div>
        </div>
      </section>

      <section className="proof-strip">
        <div className="shell proof-inner">
          <span>Built by a pet parent, for pet families</span>
          <div><span>TIMELINE</span><span>VET SUMMARY</span><span>FAMILY</span><span>HANDOFFS</span></div>
        </div>
      </section>

      {/* ② ORIGIN — 第一人称,共鸣 */}
      <section className="story-section shell story-origin" id="story">
        <div className="story-copy">
          <p className="section-label">It starts with ordinary love</p>
          <h2>I don&apos;t just buy dog food.<br /><em>I build a life with him.</em></h2>
          <p>Some days it is a bag of food. Some days it is a body check, a haircut, a new toy, a long walk outside, or fifty photos that nobody else needs to see.</p>
          <p>That is the beautiful part of living with a pet: a thousand small acts that quietly become a shared life.</p>
          <div className="story-quote"><span className="icon icon-heart-pulse" aria-hidden="true" /><span>Then they turn five, or seven, and the questions change.</span></div>
        </div>
        <figure className="story-image story-image-portrait"><img src="/mydog2.jpg" alt="A dog enjoying a quiet moment outdoors" /><figcaption>The ordinary days are the ones worth keeping.</figcaption></figure>
      </section>

      {/* ③ FRAGMENTS — 转向 you,痛点 */}
      <section className="story-section shell story-split story-fragments">
        <figure className="story-image story-image-wide"><img src="/cover3.png" alt="Pet records scattered across chats, photos, drawers, and memory" /><figcaption>Where does the whole story live right now?</figcaption></figure>
        <div className="story-copy">
          <p className="section-label">Then the fragments begin to pile up</p>
          <h2>Your pet&apos;s life<br /><em>lives in a dozen places.</em></h2>
          <p>Food records live in a chat. Vaccines are in a photo. The last blood test is in a drawer. A symptom started &ldquo;around last week.&rdquo; When the same question comes back at the clinic, you rebuild everything from memory.</p>
          <div className="story-points"><span><span className="icon icon-file-text" aria-hidden="true" /> Records scattered everywhere</span><span><span className="icon icon-clock" aria-hidden="true" /> Changes are hard to see over time</span><span><span className="icon icon-stethoscope" aria-hidden="true" /> Every vet visit starts from zero</span></div>
        </div>
      </section>

      {/* ④ TIMELINE + HEALTH AI — 实用价值 */}
      <section className="story-section shell story-split story-intelligence">
        <div className="story-copy">
          <p className="section-label">A professional memory for their whole life</p>
          <h2>Timeline first.<br /><em>Vet-ready summaries that actually help.</em></h2>
          <p>PLANET keeps the story in order: daily care, photos, weight, medication, appointments, symptoms, and the moments that make them who they are.</p>
          <p>Then it turns that history into something useful — patterns to notice, questions to ask, and a clear one-page summary to bring to the vet. <a href="/tools" style={{ borderBottom: "1px solid currentColor" }}>Browse the free tools</a> — no account needed.</p>
          <p className="story-disclaimer">PLANET organizes and prepares. It does not diagnose and does not replace a licensed veterinarian.</p>
        </div>
        <figure className="story-image story-image-wide"><img src="/cover1.png" alt="PLANET health timeline showing daily care, weight, medication, and vet visits in one place" /><figcaption>One living record for everyday care and health.</figcaption></figure>
      </section>

      {/* ⑤ AI COMPANION — 情感价值,差异化 */}
      <section className="story-section shell story-split story-companion">
        <figure className="story-image story-image-wide"><img src="/1.png" alt="PLANET pet intelligence concept — a living profile that grows with them" /><figcaption>From a health tool into a companion.</figcaption></figure>
        <div className="story-copy">
          <p className="section-label">More than a tool — a presence</p>
          <h2>It remembers who they are.<br /><em>Not just what happened.</em></h2>
          <p>A professional pet model learns their temperament, their habits, the way they changed from a puppy to a calm middle-aged friend. It can hold their character, surface a memory on a quiet day, and grow alongside them.</p>
          <p>This is the part that made me build PLANET: a system that does not just store a life, but understands it — and one day, keeps them close even when we miss them.</p>
        </div>
      </section>

      {/* ⑥ FAMILY — 协作价值,第二人称 */}
      <section className="story-section shell story-split story-family">
        <figure className="story-image story-image-wide"><img src="/cover4.png" alt="A pet profile shared with family, sitters, and vets — the right view for each person" /><figcaption>One record. The right view for each person.</figcaption></figure>
        <div className="story-copy">
          <p className="section-label">Because care is never one person&apos;s job</p>
          <h2>Care is a shared verb.<br /><em>Not another group chat.</em></h2>
          <p>Your partner, your kids, the sitter, the walker, the foster carer, the vet — they do not need the entire archive. They need the right context at the right moment.</p>
          <p>PLANET gives everyone a clear role: what to do today, what to watch, what changed, and what matters in an emergency. Reminders, handoffs, and a vet-ready summary, shared in one tap.</p>
          <a className="button button-outline" href="#pricing">See the membership <span className="icon icon-arrow-right" aria-hidden="true" /></a>
        </div>
      </section>

      {/* ⑦ HOW IT WORKS — 3 功能卡,精简 */}
      <section className="section shell" id="how-it-works">
        <div className="section-heading split-heading">
          <div><p className="section-label">One place, every part of care</p><h2>From the first morning walk<br /><em>to the hardest day.</em></h2></div>
          <p className="section-intro">PLANET is the shared memory and operating system for a pet&apos;s life — calm enough for every day, ready when something changes.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-card-dark"><span className="feature-number">01</span><div className="feature-icon"><span className="icon icon-paw-print" aria-hidden="true" /></div><h3>Know them deeply</h3><p>One living profile for identity, habits, temperament, food, weight, documents, memories, and every important detail.</p><a href="#pricing">See the membership <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></article>
          <article className="feature-card"><span className="feature-number">02</span><div className="feature-icon soft"><span className="icon icon-sun" aria-hidden="true" /></div><h3>Care for today</h3><p>Coordinate meals, walks, grooming, medication, routines, supplies, reminders, and who is responsible right now.</p><a href="#pricing">Keep care in sync <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></article>
          <article className="feature-card feature-card-accent"><span className="feature-number">03</span><div className="feature-icon"><span className="icon icon-heart-pulse" aria-hidden="true" /></div><h3>Protect their health</h3><p>Symptoms, records, vaccines, allergies, appointments, questions — and a professional AI summary ready for the vet.</p><a href="#pricing">Prepare for care <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></article>
        </div>
      </section>

      {/* ⑧ ROADMAP — 清晰发展路径 */}
      <section className="roadmap-section" id="roadmap">
        <div className="shell">
          <div className="roadmap-heading"><p className="section-label">A clear path forward</p><h2>It starts with memory.<br /><em>It grows into a better way to care.</em></h2><p>PLANET is built to earn trust one useful moment at a time, then become the system that carries a pet and their people through every stage of life — from daily care to lifelong companionship.</p></div>
          <div className="roadmap-grid">
            <article><span>01 · NOW</span><h3>Remember everything</h3><p>Build the living profile, daily timeline, care routines, photos, documents, and memories that are usually scattered.</p></article>
            <article><span>02 · NEXT</span><h3>Understand their health</h3><p>A professional pet AI turns medical history into clearer patterns, vet-ready summaries, and healthier decisions.</p></article>
            <article><span>03 · TOGETHER</span><h3>Care as a circle</h3><p>Give family, sitters, and vets the right view, the right reminder, and the right handoff without losing the whole story.</p></article>
            <article><span>04 · ALWAYS</span><h3>Keep them close</h3><p>An AI companion that holds their character, grows their memory, and stays with you — for the pet, the family, and the planet.</p></article>
          </div>
        </div>
      </section>

      {/* ⑨ WORLD — 愿景收束,合并 handoff */}
      <section className="world-section" aria-labelledby="world-title">
        <div className="shell world-layout">
          <div className="world-copy"><p className="section-label">When care matters most</p><h2 id="world-title">From &ldquo;I think it started last week&rdquo;<br /><em>to the full story.</em></h2><p>Upload what you have, add what you remember, and turn scattered details into something another person can act on — a vet-ready summary, shared with one tap.</p><p>Pets bring us back to the real world: a body that needs care, a home that needs balance, a community that needs trust, and a planet we all share. Every small act of care stays connected.</p><a className="button button-light" href="#pricing">Join the founding circle <span className="icon icon-arrow-right" aria-hidden="true" /></a></div>
          <div className="world-visual" aria-label="A relationship between people, pets, nature, and Earth">
            <div className="world-orbit world-orbit-outer" />
            <div className="world-orbit world-orbit-inner" />
            <div className="world-core"><span><span className="icon icon-globe" aria-hidden="true" /></span><strong>CARE</strong><small>is a shared home</small></div>
            <div className="world-node world-node-people"><span><span className="icon icon-users" aria-hidden="true" /></span><small>people</small></div>
            <div className="world-node world-node-pets"><span><span className="icon icon-paw-print" aria-hidden="true" /></span><small>pets</small></div>
            <div className="world-node world-node-nature"><span><span className="icon icon-leaf" aria-hidden="true" /></span><small>nature</small></div>
          </div>
        </div>
      </section>

      {/* ⑩ PRICING */}
      <section className="section shell pricing-section" id="pricing">
        <div className="section-heading pricing-heading"><p className="section-label">One product · lifetime for the founding 100</p><h2>Join at {launchPrice}.<br /><em>Watch the price rise.</em></h2><p className="section-intro">There is one complete PLANET membership. The first 100 people pay once and keep lifetime access; after the founding circle closes, new members join by subscription.</p></div>
        <FoundingProgress />
        <div className="pricing-grid pricing-grid-single">
          {plans.map((plan) => (
            <article className={`price-card ${plan.featured ? "price-card-featured" : ""}`} key={plan.name}>
              <p className="price-eyebrow">{plan.eyebrow}</p><h3>{plan.name}</h3><p className="price-description">{plan.description}</p><div className="price"><strong>{plan.price}</strong><span>{plan.unit}</span></div>
              <ul>{plan.features.map((feature) => <li key={feature}><span><span className="icon icon-check" aria-hidden="true" /></span>{feature}</li>)}</ul>
              <a className="button button-primary" href={checkoutUrl} data-event="checkout_click" data-event-category="pricing" data-event-label="price_card_main">Pay {launchPrice} · join for life <span className="icon icon-arrow-right" aria-hidden="true" /></a>
            </article>
          ))}
        </div>
        <p className="pricing-note">Pay once now. Keep PLANET membership for life — one payment, no recurring charge for the founding 100. After 100 purchases, new members subscribe. Checkout is powered by Lemon Squeezy.</p>
        <p className="pricing-note pricing-note-refund">Founding members get a 14-day no-questions refund. If we don&apos;t deliver what we promised, you get your money back. Lifetime access covers PLANET&apos;s core pet care, health timeline, and handoff features for at least 24 months; any future high-cost professional service would be priced separately and clearly. Questions before joining? <a href="/tools" style={{ borderBottom: "1px solid currentColor" }}>Try the free tools first</a> or <a href="mailto:hello@joinplanet.pet" style={{ borderBottom: "1px solid currentColor" }}>email us</a>.</p>
      </section>

      <EmailCapture />

      {/* EARLY BUILDERS — 招募早期合伙/贡献者 */}
      <section className="section builders-section" id="builders">
        <div className="shell builders-inner">
          <div className="builders-copy">
            <p className="section-label">More than a customer</p>
            <h2>Help shape PLANET<br /><em>from the inside.</em></h2>
            <p className="builders-lead">I&apos;m one person building something for every pet family. If you care about pets, design, veterinary care, or growth — and you want to help shape what this becomes — I want to talk to you.</p>
            <div className="builders-roles">
              <div className="builder-role"><span className="icon icon-paw-print" aria-hidden="true" /><div><strong>Pet parents</strong><span>Test early features, tell me what&apos;s broken, share what matters.</span></div></div>
              <div className="builder-role"><span className="icon icon-heart-pulse" aria-hidden="true" /><div><strong>Vets &amp; vet techs</strong><span>Review symptom content, shape the health timeline, lend credibility.</span></div></div>
              <div className="builder-role"><span className="icon icon-share" aria-hidden="true" /><div><strong>Builders &amp; designers</strong><span>Open to collaborators on product, growth, and brand — equity possible for the right person.</span></div></div>
            </div>
            <a className="button button-primary" href="mailto:hello@joinplanet.pet?subject=I%20want%20to%20help%20build%20PLANET"
              data-event="builders_email" data-event-category="builders" data-event-label="builders_email">
              Email me — let&apos;s talk <span className="icon icon-arrow-right" aria-hidden="true" />
            </a>
            <p className="builders-note">No formal application. Just tell me who you are and why this resonates.</p>
          </div>
          <div className="builders-visual" aria-hidden="true">
            <div className="builders-orb builders-orb-1" />
            <div className="builders-orb builders-orb-2" />
            <div className="builders-orb builders-orb-3" />
            <div className="builders-core"><span className="icon icon-paw-print" aria-hidden="true" /></div>
          </div>
        </div>
      </section>

      <section className="final-cta shell"><div><p className="section-label">Founding 100 · lifetime access</p><h2>Give their whole life<br /><em>a place to belong.</em></h2></div><a className="button button-primary" href="#pricing" data-event="cta_click" data-event-category="final_cta" data-event-label="final_lock_in">Lock in {launchPrice} <span className="icon icon-arrow-up-right" aria-hidden="true" /></a></section>

      <footer className="footer shell"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true" />PLANET</a><span>Their whole world. One place.</span><span>© 2026 PLANET</span></footer>

    </main>
  );
}
