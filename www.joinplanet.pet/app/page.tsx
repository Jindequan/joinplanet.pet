import { CoCreateForm } from "./components/co-create-form";
import { FoundingProgress } from "./components/founding-progress";
import { PrototypeTabs } from "./components/prototype-tabs";

const careMoments = [
  { time: "07:42", title: "Breakfast", detail: "Remembered before the first call of the day", tone: "sage" },
  { time: "08:12", title: "Morning medicine", detail: "Done by someone who loves him too", tone: "clay" },
  { time: "12:06", title: "A small change", detail: "He left half his lunch. Worth remembering.", tone: "gold" },
  { time: "19:34", title: "The long way home", detail: "A slow walk, a good mood, one new photo", tone: "sage" },
];

const foundingPrice = process.env.NEXT_PUBLIC_LIFETIME_PRICE_DISPLAY || "S$29.99";

export default function Home() {
  return (
    <main className="narrative-home">
      <nav className="narrative-nav narrative-shell" aria-label="Main navigation">
        <a className="narrative-brand" href="#top" aria-label="PLANET home"><span className="narrative-orbit" aria-hidden="true"><i /></span>PLANET</a>
        <div className="narrative-nav-links">
          <a href="#story">The idea</a>
          <a href="#inside">Inside PLANET</a>
          <a href="#making">In the making</a>
          <a className="narrative-nav-invite" href="#support">Back the build <span aria-hidden="true">↗</span></a>
        </div>
      </nav>

      <section className="narrative-hero narrative-shell" id="top">
        <div className="narrative-hero-copy">
          <p className="narrative-eyebrow">For the life you are already building together</p>
          <h1>A thousand small acts<br /><em>become a life together.</em></h1>
          <p className="narrative-lead">The meal someone remembered. The walk someone else took. The change you almost missed. The story only your family knows.</p>
          <a className="narrative-scroll" href="#story">See what PLANET could become <span aria-hidden="true">↓</span></a>
        </div>
        <div className="narrative-hero-stage" aria-label="A real dog and the small moments of care that make up a life together">
          <div className="narrative-photo-frame">
            <img src="/mydog2.jpg" alt="The dog who inspired PLANET resting at home" />
            <div className="hero-photo-wash" />
          </div>
          <div className="care-trace care-trace-one"><span className="trace-icon">✓</span><div><strong>Breakfast</strong><small>done by Devin · 8:12</small></div></div>
          <div className="care-trace care-trace-two"><span className="trace-icon trace-icon-warm">○</span><div><strong>Quiet morning</strong><small>one photo kept</small></div></div>
          <div className="care-trace care-trace-three"><span className="trace-icon trace-icon-gold">↗</span><div><strong>5.2 kg</strong><small>a small change over time</small></div></div>
          <p className="hero-photo-note">Today is already becoming their story.</p>
        </div>
      </section>

      <section className="ordinary-section" id="story">
        <div className="narrative-shell ordinary-heading">
          <p className="narrative-eyebrow">Ordinary love</p>
          <h2>You already care<br /><em>in a hundred invisible ways.</em></h2>
          <p>Most of it never looks important enough to save. Together, it is the life you share.</p>
        </div>
        <div className="care-ribbon narrative-shell">
          {careMoments.map((moment, index) => (
            <article className={`care-moment care-moment-${moment.tone}`} key={moment.title}>
              <div className="care-moment-top"><span>{moment.time}</span><i>{String(index + 1).padStart(2, "0")}</i></div>
              <span className="care-moment-dot" />
              <h3>{moment.title}</h3>
              <p>{moment.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="fragments-section narrative-shell">
        <div className="fragments-copy">
          <p className="narrative-eyebrow">And somehow</p>
          <h2>Their story ends up<br /><em>everywhere.</em></h2>
          <p>The information exists. It just doesn&apos;t stay together.</p>
        </div>
        <div className="fragments-stage" aria-label="Pet care information scattered between messages, photos, paper records, and memory">
          <article className="fragment fragment-chat"><span>Family chat · 8:14</span><p>gave him the tablet<br />with breakfast ✓</p></article>
          <article className="fragment fragment-photo"><img src="/mydog.JPG" alt="The dog after a visit" /><span>IMG_4821 · after the appointment</span></article>
          <article className="fragment fragment-record"><span>SPRINGFIELD VET · MAY 04</span><h3>Bloodwork</h3><p>Report attached to an old email</p><i>PDF</i></article>
          <article className="fragment fragment-note"><p>“Eating less<br />since maybe<br />last Tuesday?”</p><span>something you meant to remember</span></article>
          <div className="fragment-memory">somewhere<br />in memory</div>
        </div>
      </section>

      <section className="question-section">
        <div className="narrative-shell question-layout">
          <div className="question-mark" aria-hidden="true">“</div>
          <div className="question-copy"><p className="narrative-eyebrow">The moment it matters</p><h2>When did it start?</h2><p>You know the answer is somewhere—in a photo, a message, a receipt, a memory. But the appointment has already begun.</p></div>
          <div className="question-answer"><span>What you wish you had</span><strong>One clear story.<br />Already in order.</strong></div>
        </div>
      </section>

      <section className="reveal-section" id="inside">
        <div className="narrative-shell reveal-heading"><p className="narrative-eyebrow narrative-eyebrow-light">Imagine one continuous place</p><h2>What if their whole story<br /><em>could stay connected?</em></h2><p>PLANET is a shared place for the life you are already caring for—daily routines, health changes, records, people, and every important handoff.</p></div>
        <PrototypeTabs />
      </section>

      <section className="living-scenes narrative-shell">
        <div className="living-scenes-heading"><p className="narrative-eyebrow">One life, four moments</p><h2>Useful on an ordinary day.<br /><em>Ready when the day is not ordinary.</em></h2></div>

        <article className="living-scene scene-change">
          <div className="scene-copy"><span className="scene-number">01</span><p className="narrative-eyebrow">A small change</p><h3>Small moments have somewhere<br />to become a pattern.</h3><p>Appetite, weight, photos, medication and notes stay connected over time—so changes are easier to see and explain.</p></div>
          <div className="timeline-visual"><div className="timeline-line" /><article><time>JUL 24</time><span /><div><strong>Weight · 5.4 kg</strong><p>Normal appetite</p></div></article><article><time>AUG 02</time><span /><div><strong>New medication</strong><p>16 mg with breakfast</p></div></article><article><time>AUG 13</time><span /><div><strong>Ate half of lunch</strong><p>Photo and note from Devin</p></div></article></div>
        </article>

        <article className="living-scene scene-vet">
          <div className="vet-paper"><div className="vet-paper-head"><div><span>PLANET · VET SUMMARY</span><h4>Milo</h4><p>Prepared by his family · Aug 13</p></div><div className="sample-pill">SAMPLE</div></div><div className="vet-alert"><span>ALLERGIES</span><strong>No known drug allergies</strong></div><section><span>WHY WE&apos;RE HERE</span><p>Lower appetite since Aug 11 and noticeably slower on the morning walk.</p></section><div className="vet-columns"><section><span>CURRENT MEDICATION</span><p><strong>Apoquel · 16 mg</strong><br />Once daily with breakfast</p></section><section><span>RECENT CHANGE</span><p><strong>Weight 5.4 → 5.2 kg</strong><br />over three weeks</p></section></div><footer>Organized from family records. Review and correct before sharing.</footer></div>
          <div className="scene-copy"><span className="scene-number">02</span><p className="narrative-eyebrow">At the vet</p><h3>Walk in with the story<br />already clear.</h3><p>A calm, reviewable summary of why you&apos;re here, current medication, allergies, recent changes and relevant history.</p><small>PLANET organizes what your family records. It does not diagnose or replace a veterinarian.</small></div>
        </article>

        <article className="living-scene scene-handoff">
          <div className="scene-copy"><span className="scene-number">03</span><p className="narrative-eyebrow">Someone else cares</p><h3>Share exactly what they need.<br />Nothing more.</h3><p>Your partner, sitter or family member opens one calm view of today&apos;s routine, medicines, warning signs and emergency contacts—without learning a new system first.</p></div>
          <div className="handoff-phone"><div className="handoff-status">SHARED BY DEVIN · EXPIRES SUNDAY</div><div className="handoff-pet"><img src="/mydog2.jpg" alt="Milo" /><div><strong>Caring for Milo</strong><span>Everything you need for today</span></div></div><div className="handoff-row"><span>08:00</span><div><strong>Breakfast + medicine</strong><small>½ cup · tablet with food</small></div><i>✓</i></div><div className="handoff-row"><span>18:30</span><div><strong>Evening walk</strong><small>Keep it gentle today</small></div><i>○</i></div><div className="handoff-emergency"><span>If something feels wrong</span><strong>Call Devin first · then Greenwoods Vet</strong></div></div>
        </article>
      </section>

      <section className="whole-life-section">
        <div className="narrative-shell whole-life-layout">
          <div className="whole-life-copy"><p className="narrative-eyebrow narrative-eyebrow-light">Their whole life</p><h2>Not just a record<br />of what went wrong.<br /><em>A memory of who they are.</em></h2><p>Health and life were never separate to them. The first day home, the familiar park, the medicine that helped, the way they changed, and every person who cared—all part of one story.</p></div>
          <div className="memory-film"><figure className="memory memory-one"><img src="/mydog2.jpg" alt="A quiet day at home" /><figcaption>2021 · the look that always worked</figcaption></figure><figure className="memory memory-two"><img src="/mydog.JPG" alt="After a grooming visit" /><figcaption>2026 · brave at the appointment</figcaption></figure><div className="memory-note"><span>A LIFE IN PROGRESS</span><p>Still changing.<br />Still deeply known.</p></div></div>
        </div>
      </section>

      <section className="making-section narrative-shell" id="making">
        <div className="making-heading"><p className="narrative-eyebrow">Built in the open</p><h2>This is not a finished promise.<br /><em>It is something we are making with families.</em></h2></div>
        <div className="making-columns">
          <article><span className="making-status available">Available now</span><h3>Small useful tools</h3><p>Pet Card, Symptom Guide and Care Schedule—real pieces you can try without an account.</p><a href="/tools">Open the tools <span aria-hidden="true">↗</span></a></article>
          <article><span className="making-status testing">In active testing</span><h3>One connected care space</h3><p>Today, the living timeline, clear summaries and low-friction handoffs shown on this page.</p></article>
          <article><span className="making-status direction">The larger idea</span><h3>A place that grows with them</h3><p>Practical enough for daily care. Personal enough to hold the life you build together.</p></article>
        </div>
      </section>

      <section className="founder-section narrative-shell">
        <div className="founder-photo"><img src="/mydog.JPG" alt="The real dog behind PLANET" /><span>THE REAL DOG BEHIND PLANET</span></div>
        <div className="founder-copy"><p className="narrative-eyebrow">One dog and a question</p><h2>I didn&apos;t want another pet app.</h2><p>His life was already everywhere—photos, receipts, messages, appointments, and the things only I remembered. I wanted one place that could hold the practical work of caring for him and the life we were building together. So I started making PLANET.</p><a href="mailto:hello@joinplanet.pet">Talk to me directly <span aria-hidden="true">↗</span></a></div>
      </section>

      <section className="support-section" id="support">
        <div className="narrative-shell support-layout">
          <div className="support-copy"><p className="narrative-eyebrow">Help make the first version real</p><h2>You don&apos;t have to buy a promise.<br /><em>You can back the build.</em></h2><p>PLANET is being built in public, with the first families who believe this should exist. Your founding support gives us the time to turn the prototype into a real shared care space—and gives you a seat in the decisions that shape it.</p><div className="support-unlocks"><span><b>01</b>Build the connected timeline</span><span><b>02</b>Test it with real pet families</span><span><b>03</b>Share every meaningful release</span></div></div>
          <div className="support-card"><div className="support-card-top"><span>FOUNDING CIRCLE · 100 FAMILIES</span><span className="support-live"><i /> OPEN</span></div><h3>Founding support</h3><p>One early contribution. A permanent place in the making of PLANET, early access to working versions, and a direct line to the builder.</p><FoundingProgress compact /><div className="support-price"><strong>{foundingPrice}</strong><span>one-time founding contribution</span></div><a className="narrative-button narrative-button-dark" href="/checkout?variant=current" data-event="checkout_click" data-event-category="founding_support" data-event-label="narrative_founding_support">Back the first build <span aria-hidden="true">↗</span></a><small>Not a finished app. Your support funds the next build, and the scope is shared openly as it takes shape. The exact access terms are shown at checkout.</small></div>
        </div>
      </section>

      <section className="invitation-section" id="invitation">
        <div className="narrative-shell invitation-layout">
          <div className="invitation-copy"><p className="narrative-eyebrow narrative-eyebrow-light">A question for your family</p><h2>What would PLANET<br /><em>need to remember for you?</em></h2><p>Tell us about the pet at the centre of your home and the one thing you wish never had to live in one person&apos;s memory again.</p></div>
          <CoCreateForm />
        </div>
      </section>

      <footer className="narrative-footer narrative-shell"><a className="narrative-brand" href="#top"><span className="narrative-orbit" aria-hidden="true"><i /></span>PLANET</a><p>Their whole world. One place.</p><div><a href="/tools">Tools</a><a href="mailto:hello@joinplanet.pet">Contact</a><span>© 2026</span></div></footer>
    </main>
  );
}
