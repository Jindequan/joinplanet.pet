"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

// UTF-8 safe base64 — btoa() crashes on non-Latin1 chars (emoji, accents, CJK).
function b64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64Decode(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

/**
 * Pet Card generator — the shareable one.
 *
 * Six hand-designed visual languages (not just color swaps):
 *   Polaroid, Magazine, Minimal, Botanical, Bold, Gradient.
 * Each renders the same data with a completely different layout, typography
 * feel, photo treatment, tag style, and decorative SVG.
 *
 * Why this matters for the product:
 *   - Pet owners ALREADY make these cards by hand (Instagram, Canva, photo
 *     apps). We remove the friction from something they want to do.
 *   - A card is inherently shareable — built to be shown.
 *   - The card lives as a URL (data in hash), so a receiver opens it with
 *     zero registration — validating the core differentiator.
 *
 * Tracked funnel (data-event):
 *   card_photo_upload, card_preview, card_download, card_share_copy,
 *   card_to_pricing.
 */

type CardData = {
  petName: string;
  species: string;
  breed: string;
  tagline: string;
  personality: string[];
  favoriteThing: string;
  ownerName: string;
  photo: string; // data URL
  template: TemplateId;
  photoScale: number; // 1 = fit; >1 zooms in for cropping control
  photoOffset: { x: number; y: number }; // drag offset in % of container
};

type TemplateId =
  | "polaroid"
  | "magazine"
  | "minimal"
  | "botanical"
  | "bold"
  | "gradient";

const EMPTY: CardData = {
  petName: "",
  species: "Dog",
  breed: "",
  tagline: "",
  personality: [],
  favoriteThing: "",
  ownerName: "",
  photo: "",
  template: "polaroid",
  photoScale: 1,
  photoOffset: { x: 0, y: 0 },
};

const PERSONALITY_OPTIONS = [
  "Gentle", "Goofy", "Shy", "Brave", "Lazy", "Energetic",
  "Independent", "Clingy", "Smart", "Food-motivated", "Vocal", "Quiet",
];

type TemplateMeta = {
  id: TemplateId;
  label: string;
  blurb: string;
};

const TEMPLATES: TemplateMeta[] = [
  { id: "polaroid", label: "Polaroid", blurb: "Retro film frame, handwritten name" },
  { id: "magazine", label: "Magazine", blurb: "Cover-story bold type" },
  { id: "minimal", label: "Minimal", blurb: "Quiet Japanese whitespace" },
  { id: "botanical", label: "Botanical", blurb: "Soft watercolor florals" },
  { id: "bold", label: "Bold", blurb: "Pop-art color blocks" },
  { id: "gradient", label: "Gradient", blurb: "Glassmorphic flow" },
];

const SAMPLE: CardData = {
  petName: "Milo",
  species: "Dog",
  breed: "Golden Retriever",
  tagline: "Professional nap taker, amateur squirrel detective.",
  personality: ["Gentle", "Goofy", "Food-motivated"],
  favoriteThing: "Swimming in anything that has water.",
  ownerName: "Sarah",
  photo: "",
  template: "polaroid",
  photoScale: 1,
  photoOffset: { x: 0, y: 0 },
};

/**
 * elementToImage — converts a DOM element to a PNG Blob using SVG
 * foreignObject. No external dependencies. The element is serialized, wrapped
 * in an SVG with explicit width/height, drawn onto a canvas, and exported as
 * a PNG. Inline images (data URLs) are preserved; external images would need
 * CORS handling but our card only uses data-URL photos + CSS, so it's fine.
 */
async function elementToImage(el: HTMLElement): Promise<Blob> {
  const rect = el.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(rect.height);
  // Clone with inline styles so the serialized SVG doesn't depend on stylesheets.
  const clone = el.cloneNode(true) as HTMLElement;
  // Inline computed styles onto every element in the clone.
  const allOrig = [el, ...Array.from(el.querySelectorAll("*"))];
  const allClone = [clone, ...Array.from(clone.querySelectorAll("*"))];
  for (let i = 0; i < allOrig.length; i++) {
    const cs = window.getComputedStyle(allOrig[i]);
    let styleStr = "";
    for (let j = 0; j < cs.length; j++) {
      const prop = cs.item(j);
      styleStr += `${prop}:${cs.getPropertyValue(prop)};`;
    }
    allClone[i].setAttribute("style", styleStr);
  }
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <foreignObject width="100%" height="100%">${xml}</foreignObject>
  </svg>`;
  const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
    img.src = svgUrl;
  });
  const canvas = document.createElement("canvas");
  // 2x for retina sharpness.
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("toBlob returned null"));
    }, "image/png");
  });
}

export default function PetCardPage() {
  const [data, setData] = useState<CardData>(EMPTY);
  const [started, setStarted] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; width: number } | null>(null);

  // Load shared state from URL hash so a receiver sees the card with no signup.
  const shared = useMemo(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("c=")) return null;
    try {
      const parsed = JSON.parse(b64Decode(hash.slice(2))) as Partial<CardData>;
      // Back-compat: older links used `theme` instead of `template`.
      const tpl = parsed.template ?? (parsed as { theme?: string }).theme ?? "polaroid";
      return { ...EMPTY, ...parsed, template: tpl as TemplateId } as CardData;
    } catch {
      return null;
    }
  }, []);

  const isSharedView = Boolean(shared && shared.petName);
  const view = shared ?? data;

  function update<K extends keyof CardData>(key: K, value: CardData[K]) {
    if (!started) setStarted(true);
    setData((p) => ({ ...p, [key]: value }));
  }

  function togglePersonality(opt: string) {
    if (!started) setStarted(true);
    setData((p) => {
      const has = p.personality.includes(opt);
      const next = has ? p.personality.filter((x) => x !== opt) : [...p.personality, opt].slice(0, 4);
      return { ...p, personality: next };
    });
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("photo", reader.result as string);
    reader.readAsDataURL(file);
  }

  // ---- Photo drag-to-reposition ----
  function onPhotoPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (data.photoScale <= 1) return; // only drag when zoomed in
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: data.photoOffset.x,
      baseY: data.photoOffset.y,
      width: rect.width,
    };
    setDragging(true);
  }

  function onPhotoPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const w = dragRef.current.width;
    // Convert pixel delta to percentage of container width, clamp to ±50%.
    const offX = Math.max(-50, Math.min(50, dragRef.current.baseX + (dx / w) * 100));
    const offY = Math.max(-50, Math.min(50, dragRef.current.baseY + (dy / w) * 100));
    setData((p) => ({ ...p, photoOffset: { x: offX, y: offY } }));
  }

  function onPhotoPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragging(false);
  }

  function buildShareLink(): string {
    // Strip photo (too large for URL) and keep template + scale so the
    // receiver sees the exact framing the sender chose.
    const encoded = b64Encode(JSON.stringify({ ...data, photo: "" }));
    const base = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
    return `${base}#c=${encoded}`;
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(buildShareLink());
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2500);
    } catch {
      window.prompt("Copy this link:", buildShareLink());
    }
  }

  async function downloadCard() {
    // Generate a real PNG image of the card element using SVG foreignObject.
    // No external libraries; works entirely in the browser. The user gets a
    // downloadable image file they can save, message, or post anywhere.
    const el = document.getElementById("card-print");
    if (!el) return;
    try {
      const blob = await elementToImage(el);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(data.petName || "pet").toLowerCase().replace(/\s+/g, "-")}-planet-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // Fallback: print dialog (user can "Save as PDF" there).
      console.error("image generation failed", err);
      window.print();
    }
  }

  function printCard() {
    window.print();
  }

  if (isSharedView) {
    return (
      <main>
        <SharedCardView data={view} />
      </main>
    );
  }

  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="PLANET home">
          <span className="brand-mark" aria-hidden="true" />
          PLANET
        </Link>
        <div className="nav-links">
          <Link href="/tools">All tools</Link>
          <Link href="/#pricing">Pricing</Link>
        </div>
      </nav>

      <section className="shell cardtool-hero">
        <p className="kicker"><span className="pulse" /> Pet Card · free</p>
        <h1>Make a card for<br /><em>the one you love.</em></h1>
        <p className="hero-lead">
          A small, beautiful card for your pet. Six hand-drawn styles, photo, name,
          the one line the world should know. Save it as an image. Share the link.
          No account, no watermark.
        </p>
      </section>

      <section className="shell cardtool-layout" id="cardtool">
        {/* ---- Form ---- */}
        <div className="cardtool-form">
          <div className="cardtool-form-head">
            <h2>Their details</h2>
            <button className="text-link" type="button" onClick={() => { setData(SAMPLE); setStarted(true); }}>
              Load a sample
            </button>
          </div>

          <label className="cardtool-photo-upload">
            <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto}
              data-event={started ? undefined : "card_photo_upload"} data-event-category="card" hidden />
            {data.photo ? (
              <div className="cardtool-photo-preview">
                <div
                  className={`cardtool-photo-stage ${dragging ? "cardtool-photo-dragging" : ""}`}
                  style={{
                    backgroundImage: `url(${data.photo})`,
                    backgroundSize: `${data.photoScale * 100}%`,
                    backgroundPosition: `${50 + data.photoOffset.x}% ${50 + data.photoOffset.y}%`,
                    cursor: data.photoScale > 1 ? (dragging ? "grabbing" : "grab") : "default",
                  }}
                  onPointerDown={onPhotoPointerDown}
                  onPointerMove={onPhotoPointerMove}
                  onPointerUp={onPhotoPointerUp}
                  onPointerCancel={onPhotoPointerUp}
                >
                  {data.photoScale > 1 ? <span className="cardtool-photo-hint">Drag to reposition</span> : null}
                </div>
                <div className="cardtool-photo-controls">
                  <button type="button" className="cardtool-photo-change" onClick={() => fileRef.current?.click()}>
                    Change photo
                  </button>
                  <label className="cardtool-photo-zoom">
                    <span>Zoom</span>
                    <input type="range" min={1} max={2.5} step={0.05}
                      value={data.photoScale}
                      onChange={(e) => update("photoScale", parseFloat(e.target.value))} />
                  </label>
                  <button type="button" className="cardtool-photo-reset" onClick={() => update("photoOffset", { x: 0, y: 0 })}>
                    Reset
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="cardtool-photo-empty" onClick={() => fileRef.current?.click()}>
                <span className="icon icon-image" aria-hidden="true" />
                <span>Add a photo</span>
                <small>JPG or PNG · drag-friendly crop</small>
              </button>
            )}
          </label>

          <div className="cardtool-fields">
            <label className="cardtool-field">
              <span>Name</span>
              <input type="text" value={data.petName} placeholder="Milo"
                onChange={(e) => update("petName", e.target.value)}
                data-event={started ? undefined : "card_start"} data-event-category="card" />
            </label>
            <label className="cardtool-field">
              <span>Species</span>
              <select value={data.species} onChange={(e) => update("species", e.target.value)}>
                <option>Dog</option><option>Cat</option><option>Rabbit</option><option>Bird</option><option>Other</option>
              </select>
            </label>
            <label className="cardtool-field">
              <span>Breed</span>
              <input type="text" value={data.breed} placeholder="Golden Retriever" onChange={(e) => update("breed", e.target.value)} />
            </label>
            <label className="cardtool-field">
              <span>Your name</span>
              <input type="text" value={data.ownerName} placeholder="Sarah" onChange={(e) => update("ownerName", e.target.value)} />
            </label>
            <label className="cardtool-field cardtool-field-wide">
              <span>One line the world should know <em>(this goes on the card)</em></span>
              <input type="text" value={data.tagline} placeholder="Professional nap taker, amateur squirrel detective."
                onChange={(e) => update("tagline", e.target.value)} />
            </label>
            <label className="cardtool-field cardtool-field-wide">
              <span>Personality <em>(pick up to 4)</em></span>
              <div className="cardtool-chips">
                {PERSONALITY_OPTIONS.map((opt) => (
                  <button key={opt} type="button"
                    className={`chip ${data.personality.includes(opt) ? "chip-on" : ""}`}
                    onClick={() => togglePersonality(opt)}>{opt}</button>
                ))}
              </div>
            </label>
            <label className="cardtool-field cardtool-field-wide">
              <span>Favorite thing</span>
              <input type="text" value={data.favoriteThing} placeholder="Swimming in anything that has water."
                onChange={(e) => update("favoriteThing", e.target.value)} />
            </label>
          </div>
        </div>

        {/* ---- Live preview + template picker ---- */}
        <div className="cardtool-preview-side">
          <div className="cardtool-preview-head">
            <h2>Live preview</h2>
            <span className="cardtool-preview-note">Updates as you type</span>
          </div>

          {/* Template picker — horizontal thumbnail rail */}
          <div className="tpl-rail" role="tablist" aria-label="Card style">
            {TEMPLATES.map((tpl) => (
              <button key={tpl.id} type="button" role="tab"
                aria-selected={data.template === tpl.id}
                className={`tpl-thumb ${data.template === tpl.id ? "tpl-thumb-on" : ""}`}
                onClick={() => update("template", tpl.id)}>
                <TemplateThumb id={tpl.id} />
                <span className="tpl-thumb-label">{tpl.label}</span>
              </button>
            ))}
          </div>
          <p className="tpl-blurb">{TEMPLATES.find((t) => t.id === data.template)?.blurb}</p>

          <CardPreview data={data} />

          <div className="cardtool-actions">
            <button className="button button-primary" type="button" onClick={downloadCard}
              data-event="card_download" data-event-category="card" data-event-label="download_image">
              <span className="icon icon-download" aria-hidden="true" /> Save as image
            </button>
            <button className="button button-outline" type="button" onClick={printCard}
              data-event="card_print" data-event-category="card" data-event-label="print">
              Print
            </button>
            <button className="button button-outline" type="button" onClick={copyShare}
              data-event="card_share_copy" data-event-category="card" data-event-label="share_link">
              <span className="icon icon-share" aria-hidden="true" /> {shareCopied ? "Link copied" : "Share link"}
            </button>
          </div>
          <p className="cardtool-share-note">
            <strong>Save as image</strong> downloads a PNG you can post or message anywhere — it includes the photo.
            <br />
            <strong>Share link</strong> opens a text-only version (no photo) without sign-up — for quick sharing when the photo isn&apos;t needed.
          </p>
        </div>
      </section>

      <section className="shell cardtool-foot">
        <p>This is one piece of PLANET — a calm home for a pet&apos;s whole life. The full product keeps a timeline, daily care, and every handoff in one place.</p>
        <Link className="button button-primary" href="/#pricing"
          data-event="card_to_pricing" data-event-category="card" data-event-label="card_to_pricing">
          See the founding membership <span className="icon icon-arrow-right" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Card preview — routes to one of six template renderers             */
/* ------------------------------------------------------------------ */

function CardPreview({ data }: { data: CardData }) {
  return (
    <div className="card-canvas" id="card-print">
      {data.template === "polaroid" && <PolaroidCard data={data} />}
      {data.template === "magazine" && <MagazineCard data={data} />}
      {data.template === "minimal" && <MinimalCard data={data} />}
      {data.template === "botanical" && <BotanicalCard data={data} />}
      {data.template === "bold" && <BoldCard data={data} />}
      {data.template === "gradient" && <GradientCard data={data} />}
    </div>
  );
}

/** Shared empty-photo placeholder used inside photo wells. */
function PhotoEmpty({ tint = "ink" }: { tint?: "ink" | "light" }) {
  return (
    <div className={`photo-empty photo-empty-${tint}`}>
      <span className="icon icon-paw-print" aria-hidden="true" />
    </div>
  );
}

/** Photo well that honors the user's zoom slider + drag offset. */
function Photo({ data, className }: { data: CardData; className?: string }) {
  if (!data.photo) return <PhotoEmpty />;
  const offX = (data.photoOffset.x / 100) * 100;
  const offY = (data.photoOffset.y / 100) * 100;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={data.photo} alt={data.petName || "Pet"}
      style={{ transform: `scale(${data.photoScale}) translate(${offX / data.photoScale}%, ${offY / data.photoScale}%)` }} />
  );
}

/* ----------------------------- POLAROID ---------------------------- */
function PolaroidCard({ data }: { data: CardData }) {
  return (
    <div className="cc cc-polaroid">
      <div className="cc-polaroid-grain" aria-hidden="true" />
      <div className="cc-polaroid-frame">
        <div className="cc-polaroid-photo">
          <Photo data={data} className="cc-polaroid-img" />
          <div className="cc-polaroid-tape" aria-hidden="true" />
        </div>
        <div className="cc-polaroid-caption">
          <h3 className="cc-polaroid-name">{data.petName || "Your pet"}</h3>
          <p className="cc-polaroid-sub">{[data.species, data.breed].filter(Boolean).join(" · ") || "Add details"}</p>
          {data.tagline && <p className="cc-polaroid-tagline">{data.tagline}</p>}
          {data.personality.length > 0 && (
            <div className="cc-polaroid-tags">
              {data.personality.map((p) => <span key={p} className="cc-tag-hand">{p}</span>)}
            </div>
          )}
          {data.favoriteThing && <p className="cc-polaroid-fav">♥ {data.favoriteThing}</p>}
        </div>
      </div>
      <Crest variant="dark" owner={data.ownerName} />
    </div>
  );
}

/* ---------------------------- MAGAZINE ----------------------------- */
function MagazineCard({ data }: { data: CardData }) {
  return (
    <div className="cc cc-magazine">
      <div className="cc-magazine-photo">
        <Photo data={data} className="cc-magazine-img" />
        <div className="cc-magazine-scrim" aria-hidden="true" />
        <div className="cc-magazine-topbar">
          <span>NO. 01</span>
          <span>PET · PORTRAIT</span>
        </div>
        <p className="cc-magazine-kicker">FEATURE</p>
        <h3 className="cc-magazine-name">{(data.petName || "Your pet").toUpperCase()}</h3>
      </div>
      <div className="cc-magazine-body">
        <p className="cc-magazine-deck">{data.tagline || "Add a one-liner the world should know."}</p>
        <div className="cc-magazine-meta">
          <span>{[data.species, data.breed].filter(Boolean).join(" / ") || "Species / Breed"}</span>
          {data.ownerName && <span>By {data.ownerName}</span>}
        </div>
        {data.personality.length > 0 && (
          <div className="cc-magazine-tags">
            {data.personality.map((p) => <span key={p} className="cc-tag-stamp">{p}</span>)}
          </div>
        )}
        {data.favoriteThing && (
          <p className="cc-magazine-fav"><strong>Loves</strong> {data.favoriteThing}</p>
        )}
      </div>
      <Crest variant="light" owner={data.ownerName} />
    </div>
  );
}

/* ----------------------------- MINIMAL ----------------------------- */
function MinimalCard({ data }: { data: CardData }) {
  return (
    <div className="cc cc-minimal">
      <div className="cc-minimal-photo">
        <Photo data={data} className="cc-minimal-img" />
      </div>
      <div className="cc-minimal-body">
        <p className="cc-minimal-eyebrow">— {data.species || "Pet"} —</p>
        <h3 className="cc-minimal-name">{data.petName || "Your pet"}</h3>
        <p className="cc-minimal-breed">{data.breed || "Breed"}</p>
        {data.tagline && <p className="cc-minimal-tagline">{data.tagline}</p>}
        {data.personality.length > 0 && (
          <div className="cc-minimal-tags">
            {data.personality.map((p) => <span key={p} className="cc-tag-line">{p}</span>)}
          </div>
        )}
        {data.favoriteThing && <p className="cc-minimal-fav">fav · {data.favoriteThing}</p>}
        {data.ownerName && <p className="cc-minimal-owner">loved by {data.ownerName}</p>}
      </div>
      <Crest variant="minimal" owner={data.ownerName} />
    </div>
  );
}

/* ---------------------------- BOTANICAL ---------------------------- */
function BotanicalCard({ data }: { data: CardData }) {
  return (
    <div className="cc cc-botanical">
      {/* Decorative watercolor-ish SVG flourishes */}
      <svg className="cc-botanical-deco cc-botanical-tl" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M10 110 C 30 60, 60 40, 110 10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".5" />
        <ellipse cx="40" cy="70" rx="14" ry="7" transform="rotate(-35 40 70)" fill="currentColor" opacity=".22" />
        <ellipse cx="62" cy="55" rx="12" ry="6" transform="rotate(-45 62 55)" fill="currentColor" opacity=".18" />
        <ellipse cx="82" cy="38" rx="13" ry="6.5" transform="rotate(-55 82 38)" fill="currentColor" opacity=".2" />
        <circle cx="98" cy="22" r="5" fill="currentColor" opacity=".3" />
        <circle cx="26" cy="92" r="3" fill="currentColor" opacity=".25" />
      </svg>
      <svg className="cc-botanical-deco cc-botanical-br" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M110 10 C 90 60, 60 80, 10 110" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
        <ellipse cx="80" cy="50" rx="14" ry="7" transform="rotate(35 80 50)" fill="currentColor" opacity=".2" />
        <ellipse cx="58" cy="65" rx="12" ry="6" transform="rotate(45 58 65)" fill="currentColor" opacity=".16" />
        <ellipse cx="36" cy="82" rx="13" ry="6.5" transform="rotate(55 36 82)" fill="currentColor" opacity=".18" />
        <circle cx="20" cy="98" r="4" fill="currentColor" opacity=".25" />
      </svg>
      <div className="cc-botanical-photo">
        <Photo data={data} className="cc-botanical-img" />
      </div>
      <div className="cc-botanical-body">
        <p className="cc-botanical-eyebrow">a little one named</p>
        <h3 className="cc-botanical-name">{data.petName || "Your pet"}</h3>
        <p className="cc-botanical-breed">{[data.species, data.breed].filter(Boolean).join(" · ") || "Add details"}</p>
        {data.tagline && <p className="cc-botanical-tagline">&ldquo;{data.tagline}&rdquo;</p>}
        {data.personality.length > 0 && (
          <div className="cc-botanical-tags">
            {data.personality.map((p) => <span key={p} className="cc-tag-petal">{p}</span>)}
          </div>
        )}
        {data.favoriteThing && <p className="cc-botanical-fav">♡ {data.favoriteThing}</p>}
        {data.ownerName && <p className="cc-botanical-owner">tended by {data.ownerName}</p>}
      </div>
      <Crest variant="soft" owner={data.ownerName} />
    </div>
  );
}

/* ------------------------------- BOLD ------------------------------ */
function BoldCard({ data }: { data: CardData }) {
  return (
    <div className="cc cc-bold">
      <div className="cc-bold-photo">
        <Photo data={data} className="cc-bold-img" />
      </div>
      <div className="cc-bold-block cc-bold-block-a" aria-hidden="true" />
      <div className="cc-bold-block cc-bold-block-b" aria-hidden="true" />
      <div className="cc-bold-content">
        <h3 className="cc-bold-name">{data.petName || "PET"}</h3>
        <p className="cc-bold-sub">{[data.species, data.breed].filter(Boolean).join(" · ") || "Add details"}</p>
        {data.tagline && <p className="cc-bold-tagline">{data.tagline}</p>}
        {data.personality.length > 0 && (
          <div className="cc-bold-tags">
            {data.personality.map((p) => <span key={p} className="cc-tag-block">{p}</span>)}
          </div>
        )}
        {data.favoriteThing && <p className="cc-bold-fav">♥ {data.favoriteThing}</p>}
        {data.ownerName && <p className="cc-bold-owner">by {data.ownerName}</p>}
      </div>
      <Crest variant="block" owner={data.ownerName} />
    </div>
  );
}

/* ---------------------------- GRADIENT ----------------------------- */
function GradientCard({ data }: { data: CardData }) {
  return (
    <div className="cc cc-gradient">
      <div className="cc-gradient-blobs" aria-hidden="true">
        <span className="cc-gradient-blob cc-gradient-blob-1" />
        <span className="cc-gradient-blob cc-gradient-blob-2" />
        <span className="cc-gradient-blob cc-gradient-blob-3" />
      </div>
      <div className="cc-gradient-glass">
        <div className="cc-gradient-photo">
          <Photo data={data} className="cc-gradient-img" />
        </div>
        <div className="cc-gradient-body">
          <h3 className="cc-gradient-name">{data.petName || "Your pet"}</h3>
          <p className="cc-gradient-sub">{[data.species, data.breed].filter(Boolean).join(" · ") || "Add details"}</p>
          {data.tagline && <p className="cc-gradient-tagline">{data.tagline}</p>}
          {data.personality.length > 0 && (
            <div className="cc-gradient-tags">
              {data.personality.map((p) => <span key={p} className="cc-tag-glass">{p}</span>)}
            </div>
          )}
          {data.favoriteThing && <p className="cc-gradient-fav">♥ {data.favoriteThing}</p>}
          {data.ownerName && <p className="cc-gradient-owner">loved by {data.ownerName}</p>}
        </div>
      </div>
      <Crest variant="glass" owner={data.ownerName} />
    </div>
  );
}

/* ------------------------- Shared watermark ------------------------ */
function Crest({ variant, owner }: { variant: "dark" | "light" | "minimal" | "soft" | "block" | "glass"; owner?: string }) {
  return (
    <div className={`cc-crest cc-crest-${variant}`}>
      {owner && <span className="cc-crest-owner">Loved by {owner}</span>}
      <span className="cc-crest-mark">Made with PLANET</span>
    </div>
  );
}

/* ---------------- Template thumbnail (mini preview) ---------------- */
function TemplateThumb({ id }: { id: TemplateId }) {
  // Tiny CSS-only dioramas representing each style.
  return (
    <div className={`tthumb tthumb-${id}`} aria-hidden="true">
      <span className="tthumb-photo" />
      <span className="tthumb-line tthumb-line-1" />
      <span className="tthumb-line tthumb-line-2" />
      {id === "bold" && <span className="tthumb-dot" />}
      {id === "gradient" && <span className="tthumb-blob" />}
      {id === "botanical" && <span className="tthumb-leaf" />}
    </div>
  );
}

/* --------------------- Read-only shared view ----------------------- */
function SharedCardView({ data }: { data: CardData }) {
  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="PLANET home">
          <span className="brand-mark" aria-hidden="true" />
          PLANET
        </Link>
        <div className="nav-links">
          <Link href="/tools/pet-card">Make your own</Link>
          <Link href="/">Learn more</Link>
        </div>
      </nav>
      <section className="shell cardtool-shared">
        <div className="cardtool-shared-banner">
          <span className="icon icon-share" aria-hidden="true" />
          <span>Someone shared this pet card with you. Make one for your own pet — it&apos;s free.</span>
        </div>
        <CardPreview data={data} />
        <div className="cardtool-shared-actions">
          <Link className="button button-primary" href="/tools/pet-card"
            data-event="shared_make_own" data-event-category="card" data-event-label="shared_make_own">
            Make your own card <span className="icon icon-arrow-right" aria-hidden="true" />
          </Link>
          <Link className="text-link" href="/">Learn about PLANET</Link>
        </div>
      </section>
    </main>
  );
}
