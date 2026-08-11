"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Symptom Check — a calm, professional reference for common pet symptoms.
 *
 * Design tone: clinical but kind. Like the best medical apps (Buoy, WebMD)
 * — structured, scannable, reassuring. The opposite of a panic-inducing
 * Google search. Users arrive anxious; the page should help them think
 * clearly, not spiral.
 *
 * This is NOT diagnosis. Every entry links to clear "when to call the vet"
 * guidance. The emergency banner is always visible.
 */

type Severity = "Monitor" | "Call vet today" | "Emergency";
type Category = "Digestive" | "Behavior" | "Skin" | "Respiratory" | "Urinary" | "Mobility" | "Eyes & Ears";

type Entry = {
  id: string;
  symptom: string;
  species: ("Dog" | "Cat")[];
  category: Category;
  severity: Severity;
  whatItMightMean: string;
  watchFor: string;
  whenToCallVet: string;
};

const ENTRIES: Entry[] = [
  { id: "vomiting", symptom: "Vomiting", species: ["Dog","Cat"], category: "Digestive", severity: "Monitor",
    whatItMightMean: "One-off vomiting is often harmless — eating too fast, grass, a minor upset. Repeated vomiting over 24h, or vomit with blood, is more serious.",
    watchFor: "Frequency, timing (after food?), color (yellow/foamy = bile, green = grass, red/brown = possible blood), appetite, energy.",
    whenToCallVet: "More than 2–3 times in a day, vomiting + lethargy, vomiting + diarrhea, blood in vomit, or lasting >24h." },
  { id: "diarrhea", symptom: "Diarrhea", species: ["Dog","Cat"], category: "Digestive", severity: "Monitor",
    whatItMightMean: "Often dietary (new food, scavenging). Can be stress, parasites, or infection. Chronic diarrhea (>3 days) needs investigation.",
    watchFor: "Consistency, color, blood or mucus, frequency, appetite, energy, dehydration (gum color, skin tent).",
    whenToCallVet: "Blood in stool, diarrhea >48h, vomiting at the same time, lethargy, or if a puppy/kitten (dehydrates fast)." },
  { id: "not-eating", symptom: "Not eating / reduced appetite", species: ["Dog","Cat"], category: "Behavior", severity: "Call vet today",
    whatItMightMean: "Dogs skipping one meal is usually fine. Cats not eating for >24h is dangerous (risk of fatty liver). Could be stress, pain, dental, or illness.",
    watchFor: "Water intake, energy, hiding, litter box output, dental signs (drooling, pawing at mouth).",
    whenToCallVet: "Cat not eating >24h — call same day. Dog not eating >48h or with other symptoms. Any pet not eating + lethargy." },
  { id: "lethargy", symptom: "Lethargy / low energy", species: ["Dog","Cat"], category: "Behavior", severity: "Call vet today",
    whatItMightMean: "Non-specific. Could be nothing (hot day) or serious (pain, infection, anemia, organ issue). Context matters: how sudden, how severe.",
    watchFor: "Duration, other symptoms, gum color (pale/white = emergency), breathing rate, response to favorite treats.",
    whenToCallVet: "Sudden lethargy, lethargy + not eating, pale gums, or lasting >24h without obvious cause." },
  { id: "limping", symptom: "Limping / favoring a leg", species: ["Dog","Cat"], category: "Mobility", severity: "Monitor",
    whatItMightMean: "Sprain, strain, thorn in paw, nail injury, joint issue (especially in older or large breeds).",
    watchFor: "Which leg, weight-bearing or not, swelling, heat, response to touch, duration.",
    whenToCallVet: "Not weight-bearing, swelling, obvious pain, or lasting >24–48h. Sudden severe limp in a large-breed dog = possible emergency." },
  { id: "scratching", symptom: "Excessive scratching / licking", species: ["Dog","Cat"], category: "Skin", severity: "Monitor",
    whatItMightMean: "Fleas, allergies (food or environmental), dry skin, anxiety, or infection. Over-grooming in cats can be stress.",
    watchFor: "Location (ears, belly, paws), hair loss, redness, scabs, fleas or flea dirt, seasonality.",
    whenToCallVet: "Open sores, hair loss, not responding to flea treatment, or sudden intense scratching." },
  { id: "coughing", symptom: "Coughing", species: ["Dog","Cat"], category: "Respiratory", severity: "Call vet today",
    whatItMightMean: "Dogs: kennel cough, heart disease, collapsing trachea (small breeds). Cats: asthma, respiratory infection. Persistent cough needs workup.",
    watchFor: "Sound (honking, dry, wet), frequency, exercise tolerance, gagging, breathing rate at rest.",
    whenToCallVet: "Persistent cough >3–5 days, cough + breathing difficulty, or blue-tinged gums. Emergency if struggling to breathe." },
  { id: "sneezing", symptom: "Sneezing / nasal discharge", species: ["Dog","Cat"], category: "Respiratory", severity: "Monitor",
    whatItMightMean: "Dust, pollen, foreign object (dogs snorting grass), or upper respiratory infection (especially cats). Clear = mild; green/yellow = infection.",
    watchFor: "Color of discharge, one or both nostrils, frequency, appetite, eye discharge.",
    whenToCallVet: "Thick colored discharge, sneezing + lethargy or not eating, or blood." },
  { id: "eye-discharge", symptom: "Eye discharge / redness", species: ["Dog","Cat"], category: "Eyes & Ears", severity: "Call vet today",
    whatItMightMean: "Mild clear discharge can be normal. Yellow/green, squinting, or redness suggests infection, a scratch, or glaucoma.",
    watchFor: "Color, one or both eyes, squinting, pawing at eye, cloudiness, vision changes.",
    whenToCallVet: "Squinting, colored discharge, cloudiness, or any sudden eye change — eyes deteriorate fast." },
  { id: "ear-shaking", symptom: "Head shaking / ear scratching", species: ["Dog","Cat"], category: "Eyes & Ears", severity: "Monitor",
    whatItMightMean: "Ear infection, mites, foreign body (grass seed), or allergies. Floppy-eared dogs are more prone.",
    watchFor: "Odor, discharge color, redness, swelling, pain when touched.",
    whenToCallVet: "Bad odor, dark discharge, persistent shaking >2 days, or pain." },
  { id: "urination-changes", symptom: "Changes in urination", species: ["Dog","Cat"], category: "Urinary", severity: "Call vet today",
    whatItMightMean: "Frequent small amounts, straining, blood, or accidents — could be UTI, stones, or (in male cats) a life-threatening blockage.",
    watchFor: "Frequency, straining, blood, accidents in the house, vocalizing in the litter box.",
    whenToCallVet: "Male cat straining to urinate = EMERGENCY (can block within hours). Any blood, straining, or sudden changes." },
  { id: "weight-loss", symptom: "Unexplained weight loss", species: ["Dog","Cat"], category: "Behavior", severity: "Call vet today",
    whatItMightMean: "Significant in older pets. Could be hyperthyroidism (cats), diabetes, kidney disease, dental pain, or cancer. Needs workup.",
    watchFor: "Speed of loss, appetite (eating more but losing weight?), thirst, energy.",
    whenToCallVet: "Any unexplained weight loss — schedule a checkup and bloodwork." },
  { id: "bad-breath", symptom: "Bad breath", species: ["Dog","Cat"], category: "Digestive", severity: "Monitor",
    whatItMightMean: "Most often dental disease (tartar, gingivitis). In older pets, can signal kidney disease or diabetes. Sudden sweet/fruity breath = diabetes.",
    watchFor: "Duration, dental tartar, gum redness, appetite changes, drinking/urination changes.",
    whenToCallVet: "Persistent bad breath, gum redness/bleeding, or sudden change in smell." },
  { id: "drooling", symptom: "Excessive drooling", species: ["Dog","Cat"], category: "Digestive", severity: "Monitor",
    whatItMightMean: "Normal in some breeds (Saint Bernard, Mastiff). Sudden drooling = nausea, dental pain, toxin, or something stuck in the mouth.",
    watchFor: "Sudden onset, one-sided, pawing at mouth, appetite, vomiting.",
    whenToCallVet: "Sudden onset with lethargy, not eating, or if you suspect a toxin." },
  { id: "panting", symptom: "Excessive panting", species: ["Dog"], category: "Respiratory", severity: "Call vet today",
    whatItMightMean: "Normal after exercise or in heat. Excessive or sudden panting at rest can mean pain, heart disease, or heatstroke.",
    watchFor: "Context (rest vs exercise), temperature, gum color, duration.",
    whenToCallVet: "Sudden panting at rest, panting + pale gums, or suspected heatstroke (emergency)." },
  { id: "constipation", symptom: "Constipation / straining", species: ["Dog","Cat"], category: "Digestive", severity: "Monitor",
    whatItMightMean: "Dehydration, low fiber, megacolon (cats), or obstruction. Occasional is common; chronic needs investigation.",
    watchFor: "Frequency, stool consistency, straining, vocalizing, appetite.",
    whenToCallVet: "No stool >2 days, straining without producing anything, vomiting, or blood." },
  { id: "hair-loss", symptom: "Hair loss / thinning coat", species: ["Dog","Cat"], category: "Skin", severity: "Monitor",
    whatItMightMean: "Allergies, fleas, mites, hormonal imbalance (hypothyroid, Cushing&apos;s), stress, or seasonal shedding.",
    watchFor: "Pattern (symmetrical? patches?), itching, skin redness, seasonality.",
    whenToCallVet: "Symmetrical hair loss, red/inflamed skin, spreading, or with other symptoms." },
  { id: "gum-color", symptom: "Red or pale gums", species: ["Dog","Cat"], category: "Behavior", severity: "Emergency",
    whatItMightMean: "Pale/white gums = anemia, blood loss, or shock. Brick-red gums = heatstroke or toxemia. Blue gums = oxygen deprivation. All emergencies.",
    watchFor: "Gum color (lift the lip), capillary refill time (press gum, should pink up in <2s), energy, breathing.",
    whenToCallVet: "Any abnormal gum color — this is an emergency. Go to the nearest vet or ER clinic immediately." },
  { id: "lumps", symptom: "Lumps or bumps", species: ["Dog","Cat"], category: "Skin", severity: "Call vet today",
    whatItMightMean: "Lipomas (benign fatty lumps, common in older dogs), cysts, abscesses, or tumors. Needs a needle aspirate to diagnose.",
    watchFor: "Size, growth rate, firmness, whether it moves under the skin, pain, skin color over it.",
    whenToCallVet: "Any new lump — especially if growing, firm, or fixed. Schedule an exam." },
  { id: "seizure", symptom: "Seizure / convulsion", species: ["Dog","Cat"], category: "Behavior", severity: "Emergency",
    whatItMightMean: "Epilepsy, toxins, brain disease, metabolic crisis (low blood sugar, liver). A first-time seizure is always an emergency.",
    watchFor: "Duration, movement pattern, consciousness, what happened before/after, frequency.",
    whenToCallVet: "Any seizure >2 minutes, cluster seizures, or first-time seizure = go to ER. Record a video if safe." },
];

const SEVERITY_META: Record<Severity, { color: string; bg: string; border: string }> = {
  Monitor: { color: "#5a7a5e", bg: "#e8f0e5", border: "#c5d9c2" },
  "Call vet today": { color: "#b85838", bg: "#f4ddc9", border: "#e0bc94" },
  Emergency: { color: "#8a3030", bg: "#f0d4d4", border: "#d49898" },
};

const CATEGORY_ICON: Record<Category, string> = {
  Digestive: "icon-utensils",
  Behavior: "icon-heart-pulse",
  Skin: "icon-leaf",
  Respiratory: "icon-wind",
  Urinary: "icon-droplet",
  Mobility: "icon-activity",
  "Eyes & Ears": "icon-eye",
};

const CATEGORIES: Category[] = ["Digestive", "Behavior", "Skin", "Respiratory", "Urinary", "Mobility", "Eyes & Ears"];

export default function SymptomPage() {
  const [query, setQuery] = useState("");
  const [species, setSpecies] = useState<"all" | "Dog" | "Cat">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [active, setActive] = useState<Entry | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return ENTRIES.filter((e) => {
      if (species !== "all" && !e.species.includes(species as "Dog" | "Cat")) return false;
      if (category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return e.symptom.toLowerCase().includes(q) || e.category.toLowerCase().includes(q) || e.whatItMightMean.toLowerCase().includes(q);
    });
  }, [query, species, category]);

  const related = useMemo(() => {
    if (!active) return [];
    return ENTRIES.filter((e) => e.category === active.category && e.id !== active.id).slice(0, 3);
  }, [active]);

  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="PLANET home"><span className="brand-mark" aria-hidden="true" />PLANET</Link>
        <div className="nav-links">
          <Link href="/tools">All tools</Link>
          <Link href="/#pricing">Pricing</Link>
        </div>
      </nav>

      {/* Emergency banner — always visible */}
      <div className={`sym-emergency-banner ${active ? "sym-emergency-banner-hidden" : ""}`}>
        <span className="icon icon-alert" aria-hidden="true" />
        <span><strong>If your pet is in distress right now,</strong> call your vet or the nearest emergency clinic.</span>
        <a href="https://www.google.com/maps/search/emergency+vet+near+me" target="_blank" rel="noopener noreferrer"
          data-event="symptom_find_emergency" data-event-category="symptom">Find an emergency vet →</a>
      </div>

      <section className="shell sym-hero">
        <p className="kicker"><span className="pulse" /> Symptom Check · free reference</p>
        <h1>Something seems off?<br /><em>Look it up, calmly.</em></h1>
        <p className="hero-lead">
          A clear, plain-language reference for common pet symptoms — what each might mean, what to watch for,
          and when to pick up the phone. Not a diagnosis. Just a calmer first step.
        </p>

        <div className="sym-searchbar">
          <span className="icon icon-search" aria-hidden="true" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a symptom — vomiting, limping, not eating..."
            data-event="symptom_search" data-event-category="symptom" />
        </div>

        <div className="sym-tabs">
          {(["all", "Dog", "Cat"] as const).map((s) => (
            <button key={s} className={`sym-tab ${species === s ? "on" : ""}`} onClick={() => setSpecies(s)}>
              {s === "all" ? "All pets" : s === "Dog" ? "Dogs" : "Cats"}
            </button>
          ))}
        </div>
      </section>

      <section className="shell sym-content">
        {active ? (
          <div className="sym-detail">
            <button className="text-link sym-back" type="button" onClick={() => setActive(null)}>
              <span className="icon icon-arrow-right" aria-hidden="true" style={{ transform: "rotate(180deg)" }} /> Back to list
            </button>

            <div className="sym-detail-head">
              <div className="sym-detail-icon" style={{ background: SEVERITY_META[active.severity].bg, color: SEVERITY_META[active.severity].color }}>
                <span className={`icon ${CATEGORY_ICON[active.category]}`} aria-hidden="true" />
              </div>
              <div>
                <span className="sym-badge sym-badge-lg" style={{ color: SEVERITY_META[active.severity].color, background: SEVERITY_META[active.severity].bg }}>{active.severity}</span>
                <h2>{active.symptom}</h2>
                <p className="sym-detail-meta">{active.species.join(" / ")} · {active.category}</p>
              </div>
            </div>

            <div className="sym-detail-blocks">
              <div className="sym-detail-block">
                <h3>What it might mean</h3>
                <p>{active.whatItMightMean}</p>
              </div>
              <div className="sym-detail-block">
                <h3>What to watch for</h3>
                <p>{active.watchFor}</p>
              </div>
              <div className="sym-detail-block sym-detail-vet">
                <h3>When to call the vet</h3>
                <p>{active.whenToCallVet}</p>
              </div>
            </div>

            <p className="sym-comfort">Most of the time, this turns out to be manageable. Your vet can help you figure it out.</p>
            <p className="sym-disclaimer">This is general reference, not a diagnosis. When in doubt, call your vet — they&apos;d rather you ask than wait.</p>

            {related.length > 0 ? (
              <div className="sym-related">
                <h4>Related symptoms</h4>
                <div className="sym-related-grid">
                  {related.map((r) => (
                    <button key={r.id} className="sym-related-card" type="button" onClick={() => { setActive(r); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      data-event="symptom_related" data-event-category="symptom" data-event-label={r.id}>
                      <span className="sym-badge-sm" style={{ color: SEVERITY_META[r.severity].color, background: SEVERITY_META[r.severity].bg }}>{r.severity}</span>
                      <span className="sym-related-name">{r.symptom}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="sym-categories">
              <button className={`sym-cat-chip ${category === "all" ? "on" : ""}`} onClick={() => setCategory("all")}>All</button>
              {CATEGORIES.map((c) => (
                <button key={c} className={`sym-cat-chip ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>
                  <span className={`icon ${CATEGORY_ICON[c]}`} aria-hidden="true" /> {c}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="sym-empty">
                <span className="icon icon-search" aria-hidden="true" />
                <p>No symptoms match &ldquo;{query}&rdquo;.</p>
                <small>Try another word, or describe it differently.</small>
              </div>
            ) : (
              <div className="sym-grid">
                {filtered.map((e) => (
                  <button key={e.id} className="sym-card" type="button" onClick={() => { setActive(e); window.scrollTo({ top: 200, behavior: "smooth" }); }}
                    data-event="symptom_open" data-event-category="symptom" data-event-label={e.id}>
                    <div className="sym-card-sev-bar" style={{ background: SEVERITY_META[e.severity].color }} />
                    <div className="sym-card-body">
                      <div className="sym-card-top">
                        <span className="sym-card-icon" style={{ background: SEVERITY_META[e.severity].bg, color: SEVERITY_META[e.severity].color }}>
                          <span className={`icon ${CATEGORY_ICON[e.category]}`} aria-hidden="true" />
                        </span>
                        <span className="sym-badge-sm" style={{ color: SEVERITY_META[e.severity].color, background: SEVERITY_META[e.severity].bg }}>{e.severity}</span>
                      </div>
                      <h3>{e.symptom}</h3>
                      <p>{e.whatItMightMean.slice(0, 90)}{e.whatItMightMean.length > 90 ? "…" : ""}</p>
                      <div className="sym-card-foot">
                        <span className="sym-card-species">{e.species.join(" · ")}</span>
                        <span className="sym-card-arrow">Read more <span className="icon icon-arrow-right" aria-hidden="true" /></span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="shell sym-foot">
        <div className="sym-foot-cta">
          <p>This is one piece of PLANET. The full product keeps a health timeline, so when something happens, you already have the history ready.</p>
          <Link className="button button-primary" href="/#pricing"
            data-event="symptom_to_pricing" data-event-category="symptom" data-event-label="symptom_to_pricing">
            See the founding membership <span className="icon icon-arrow-right" aria-hidden="true" />
          </Link>
        </div>
        <Link className="text-link" href="/tools/pet-card">← Make a free pet card instead</Link>
      </section>
    </main>
  );
}
