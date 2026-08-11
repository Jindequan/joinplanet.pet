"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

// UTF-8 safe base64 — btoa() crashes on any non-Latin1 character (Chinese,
// emoji, accented letters). encodeURIComponent + unescape(encodeURIComponent)
// is the standard cross-browser workaround.
function b64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64Decode(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

/**
 * Care Schedule — shared vaccine & deworming reminder calendar.
 *
 * Why this validates real demand:
 *   - "When is the next vaccine due?" is a question every pet owner forgets
 *     the answer to. Currently solved by sticky notes, calendar alerts, vet
 *     reminder texts.
 *   - The share mechanic is NATURAL here: you want your partner/roommate/
 *     pet-sitter to see the same schedule. This is the one tool where the
 *     multi-person hypothesis arises on its own — no forcing.
 *   - Strong return trigger: the reminder comes due, you must open it.
 *
 * No account. State encoded in URL hash, shareable to family.
 */

type Reminder = {
  id: string;
  label: string;
  date: string;       // ISO date
  done: boolean;
  doneBy: string;
};

type Schedule = {
  petName: string;
  species: string;
  ownerName: string;
  reminders: Reminder[];
};

const EMPTY: Schedule = { petName: "", species: "Dog", ownerName: "", reminders: [] };

const VACCINE_PRESETS_DOG: Array<{ label: string; offsetDays: number }> = [
  { label: "Rabies (annual/3yr)", offsetDays: 365 },
  { label: "DHPP booster", offsetDays: 365 },
  { label: "Bordetella (kennel cough)", offsetDays: 365 },
  { label: "Leptospirosis", offsetDays: 365 },
  { label: "Monthly flea & tick", offsetDays: 30 },
  { label: "Quarterly deworming", offsetDays: 90 },
  { label: "Annual checkup", offsetDays: 365 },
];

const VACCINE_PRESETS_CAT: Array<{ label: string; offsetDays: number }> = [
  { label: "Rabies", offsetDays: 365 },
  { label: "FVRCP (distemper)", offsetDays: 365 },
  { label: "FeLV (leukemia, if outdoor)", offsetDays: 365 },
  { label: "Monthly flea prevention", offsetDays: 30 },
  { label: "Quarterly deworming", offsetDays: 90 },
  { label: "Annual checkup", offsetDays: 365 },
];

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMonthShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short" });
}

function formatDayNum(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return String(d.getDate());
}

function formatWeekday(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function daysUntil(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** Stable countdown text — does not call Date.now() during render. */
function urgencyLabel(iso: string, done: boolean): { label: string; cls: string } {
  if (done) return { label: "Done", cls: "done" };
  const d = daysUntil(iso);
  if (d < 0) return { label: `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`, cls: "overdue" };
  if (d === 0) return { label: "Today", cls: "soon" };
  if (d === 1) return { label: "Tomorrow", cls: "soon" };
  if (d <= 14) return { label: `In ${d} days`, cls: "soon" };
  return { label: `In ${d} days`, cls: "" };
}

/** Determine which time bucket a reminder falls into. */
function bucketOf(r: Reminder): "overdue" | "thisMonth" | "later" | "done" {
  if (r.done) return "done";
  const d = daysUntil(r.date);
  if (d < 0) return "overdue";
  if (d <= 31) return "thisMonth";
  return "later";
}

/** Initials for the done-by avatar circle. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Avatar color picked deterministically from the name so the same person always gets the same color. */
function avatarColor(name: string): string {
  const palette = ["#245348", "#b85838", "#7a6a4f", "#5a7a8a", "#8a5a7a", "#4a7a5a"];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  return palette[hash % palette.length];
}

export default function SchedulePage() {
  const [data, setData] = useState<Schedule>(EMPTY);
  const [started, setStarted] = useState(false);
  const [doneBy, setDoneBy] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [showDone, setShowDone] = useState(true);
  // Custom reminder form state
  const [customLabel, setCustomLabel] = useState("");
  const [customDate, setCustomDate] = useState("");
  // Stable id counter for new reminders — generated inside event handlers,
  // not during render, to satisfy react-hooks/purity.
  const idCounter = useRef(0);

  const shared = useMemo(() => {
    if (typeof window === "undefined") return null;
    const h = window.location.hash.replace(/^#/, "");
    if (!h.startsWith("s=")) return null;
    try { return JSON.parse(b64Decode(h.slice(2))) as Schedule; } catch { return null; }
  }, []);

  const isShared = Boolean(shared && shared.petName);
  const view = shared ?? data;

  function update<K extends keyof Schedule>(key: K, value: Schedule[K]) {
    if (!started) setStarted(true);
    setData((p) => ({ ...p, [key]: value }));
  }

  function addReminder(label: string, offsetDays: number) {
    if (!started) setStarted(true);
    idCounter.current += 1;
    const r: Reminder = { id: `r${idCounter.current}`, label, date: isoOffset(offsetDays), done: false, doneBy: "" };
    setData((p) => ({ ...p, reminders: [...p.reminders, r] }));
  }

  function addCustomReminder() {
    const label = customLabel.trim();
    if (!label || !customDate) return;
    if (!started) setStarted(true);
    idCounter.current += 1;
    const r: Reminder = { id: `r${idCounter.current}`, label, date: customDate, done: false, doneBy: "" };
    setData((p) => ({ ...p, reminders: [...p.reminders, r] }));
    setCustomLabel("");
    setCustomDate("");
  }

  function toggleReminder(id: string) {
    setData((p) => ({
      ...p,
      reminders: p.reminders.map((r) => r.id === id ? { ...r, done: !r.done, doneBy: !r.done ? (doneBy || data.ownerName || "Someone") : "" } : r),
    }));
  }

  function removeReminder(id: string) {
    setData((p) => ({ ...p, reminders: p.reminders.filter((r) => r.id !== id) }));
  }

  function buildShareLink(): string {
    const encoded = b64Encode(JSON.stringify(data));
    const base = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
    return `${base}#s=${encoded}`;
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

  const presets = data.species === "Cat" ? VACCINE_PRESETS_CAT : VACCINE_PRESETS_DOG;

  // Group reminders into time buckets. Each bucket sorted by date ascending.
  const buckets = useMemo(() => {
    const groups: Record<"overdue" | "thisMonth" | "later" | "done", Reminder[]> = {
      overdue: [], thisMonth: [], later: [], done: [],
    };
    for (const r of view.reminders) groups[bucketOf(r)].push(r);
    (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) => {
      groups[k].sort((a, b) => a.date.localeCompare(b.date));
    });
    return groups;
  }, [view.reminders]);

  // Next up = first non-done by date ascending.
  const nextUp = useMemo(() => {
    const pending = view.reminders.filter((r) => !r.done);
    if (pending.length === 0) return null;
    pending.sort((a, b) => a.date.localeCompare(b.date));
    return pending[0];
  }, [view.reminders]);

  // Progress stats: count done this year + total non-archived.
  const stats = useMemo(() => {
    const yearStr = String(new Date().getFullYear());
    const doneThisYear = view.reminders.filter((r) => r.done && r.date.startsWith(yearStr)).length;
    const doneAll = view.reminders.filter((r) => r.done).length;
    const totalAll = view.reminders.length;
    return { doneThisYear, doneAll, totalAll };
  }, [view.reminders]);

  if (isShared) {
    return (
      <main>
        <SharedScheduleView data={view} />
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

      <section className="shell sched-hero">
        <p className="kicker"><span className="pulse" /> Care Schedule · shared with family</p>
        <h1>Never miss<br /><em>the next one.</em></h1>
        <p className="hero-lead">
          Vaccines, deworming, flea, checkups — build a shared calendar in 30 seconds.
          Send one link to your family. Everyone sees what&apos;s next and who did what.
        </p>
      </section>

      {/* NEXT-UP HERO CARD — the centerpiece of the care board */}
      {nextUp ? (
        <section className="shell sched-nextup-wrap" aria-label="Next reminder">
          <NextUpCard reminder={nextUp} petName={data.petName} />
        </section>
      ) : null}

      {/* PROGRESS STRIP */}
      {view.reminders.length > 0 ? (
        <section className="shell sched-progress-strip" aria-label="Progress">
          <div className="sched-progress-num">
            <strong>{stats.doneThisYear}</strong>
            <span>done this year</span>
          </div>
          <div className="sched-progress-bar" aria-hidden="true">
            <div
              className="sched-progress-fill"
              style={{ width: `${stats.totalAll === 0 ? 0 : Math.round((stats.doneAll / stats.totalAll) * 100)}%` }}
            />
          </div>
          <div className="sched-progress-meta">
            <span>{stats.doneAll} of {stats.totalAll} done</span>
            <em>{view.petName ? `${view.petName}&apos;s family` : "Your family"} stays on top of it.</em>
          </div>
        </section>
      ) : null}

      <section className="shell sched-layout">
        <div className="sched-setup">
          <div className="sched-setup-head">
            <h2>Set it up</h2>
          </div>
          <div className="cardtool-fields">
            <label className="cardtool-field">
              <span>Pet&apos;s name</span>
              <input type="text" value={data.petName} placeholder="Milo"
                onChange={(e) => update("petName", e.target.value)}
                data-event={started ? undefined : "sched_start"} data-event-category="schedule" />
            </label>
            <label className="cardtool-field">
              <span>Species</span>
              <select value={data.species} onChange={(e) => update("species", e.target.value)}>
                <option>Dog</option><option>Cat</option>
              </select>
            </label>
            <label className="cardtool-field cardtool-field-wide">
              <span>Your name <em>(for &ldquo;done by&rdquo;)</em></span>
              <input type="text" value={data.ownerName} placeholder="Sarah" onChange={(e) => { update("ownerName", e.target.value); setDoneBy(e.target.value); }} />
            </label>
          </div>

          <div className="sched-presets">
            <p className="sched-presets-label">
              Quick add common {data.species.toLowerCase()} reminders:
            </p>
            <div className="sched-preset-chips">
              {presets.map((p) => (
                <button key={p.label} className="chip" type="button"
                  onClick={() => addReminder(p.label, p.offsetDays)}
                  data-event="sched_add_preset" data-event-category="schedule" data-event-label={p.label}>
                  + {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ADD CUSTOM REMINDER */}
          <div className="sched-custom">
            <p className="sched-presets-label">Add a custom reminder:</p>
            <div className="sched-custom-form">
              <input
                type="text"
                className="sched-custom-label"
                placeholder="e.g. Nail trim, grooming, meds refill"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCustomReminder(); }}
              />
              <input
                type="date"
                className="sched-custom-date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
              <button
                type="button"
                className="button button-primary sched-custom-add"
                onClick={addCustomReminder}
                disabled={!customLabel.trim() || !customDate}
                data-event="sched_add_custom" data-event-category="schedule"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="sched-list-side" id="sched-print">
          <div className="sched-list-head">
            <h2>{data.petName ? `${data.petName}&apos;s schedule` : "Schedule"}</h2>
            <span className="sched-count">{data.reminders.length} reminder{data.reminders.length === 1 ? "" : "s"}</span>
          </div>

          {data.reminders.length === 0 ? (
            <div className="sched-empty">
              <span className="icon icon-clock" aria-hidden="true" />
              <p>No reminders yet. Add a few from the left — it takes 20 seconds.</p>
            </div>
          ) : (
            <div className="sched-groups">
              <ReminderGroup
                title="Overdue"
                tone="overdue"
                hint="Take care of these first"
                reminders={buckets.overdue}
                onToggle={toggleReminder}
                onRemove={removeReminder}
              />
              <ReminderGroup
                title="This month"
                tone="thisMonth"
                hint="Coming up soon"
                reminders={buckets.thisMonth}
                onToggle={toggleReminder}
                onRemove={removeReminder}
              />
              <ReminderGroup
                title="Later"
                tone="later"
                hint="On the horizon"
                reminders={buckets.later}
                onToggle={toggleReminder}
                onRemove={removeReminder}
              />

              {/* DONE GROUP — collapsible */}
              {buckets.done.length > 0 ? (
                <div className={`sched-group sched-group-done ${showDone ? "sched-group-open" : ""}`}>
                  <button
                    type="button"
                    className="sched-group-head sched-group-head-done"
                    onClick={() => setShowDone((v) => !v)}
                    aria-expanded={showDone}
                  >
                    <span className="sched-group-title">
                      Done <em>{buckets.done.length}</em>
                    </span>
                    <span className="sched-group-toggle"><span className="icon icon-chevron-down" aria-hidden="true" /></span>
                  </button>
                  {showDone ? (
                    <div className="sched-list">
                      {buckets.done.map((r) => (
                        <ReminderRow key={r.id} reminder={r} onToggle={toggleReminder} onRemove={removeReminder} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}

          {data.reminders.length > 0 ? (
            <div className="sched-share">
              <div className="sched-share-head">
                <span className="sched-share-icon" aria-hidden="true"><span className="icon icon-users" /></span>
                <div>
                  <h3>Share with family</h3>
                  <p>Send one link — your partner, roommate, or sitter opens it and sees the exact same calendar. No sign-up, no app, no account.</p>
                </div>
              </div>
              <div className="sched-share-row">
                <button className="button button-primary" type="button" onClick={copyShare}
                  data-event="sched_share_copy" data-event-category="schedule" data-event-label="share_link">
                  <span className="icon icon-share" aria-hidden="true" /> {shareCopied ? "Link copied" : "Copy family link"}
                </button>
                <button className="button button-ghost" type="button" onClick={() => window.print()}
                  data-event="sched_print" data-event-category="schedule" data-event-label="print">
                  <span className="icon icon-file-text" aria-hidden="true" /> Print for the fridge
                </button>
              </div>
              <input type="text" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Your name (shown when you check things off)" className="sched-doneby" />
            </div>
          ) : null}
        </div>
      </section>

      <section className="shell cardtool-foot">
        <p>This is one piece of PLANET. The full product keeps daily care, health timeline, and every handoff in one place.</p>
        <Link className="button button-primary" href="/#pricing"
          data-event="sched_to_pricing" data-event-category="schedule" data-event-label="sched_to_pricing">
          See the founding membership <span className="icon icon-arrow-right" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}

/* ---------- Next-up hero card ---------- */

function NextUpCard({ reminder, petName }: { reminder: Reminder; petName: string }) {
  const d = daysUntil(reminder.date);
  const tone = d < 0 ? "overdue" : d <= 14 ? "soon" : "later";
  const big = d < 0
    ? `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`
    : d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days`;
  const sub = d < 0 ? "overdue" : "until next";
  return (
    <div className={`sched-nextup sched-nextup-${tone}`} role="status">
      <div className="sched-nextup-left">
        <span className="sched-nextup-eyebrow">
          <span className="pulse" /> Next up {petName ? `for ${petName}` : ""}
        </span>
        <h3 className="sched-nextup-label">{reminder.label}</h3>
        <span className="sched-nextup-date">{formatWeekday(reminder.date)}, {formatDate(reminder.date)}</span>
      </div>
      <div className="sched-nextup-right">
        <span className="sched-nextup-big">{big}</span>
        <span className="sched-nextup-sub">{sub}</span>
      </div>
    </div>
  );
}

/* ---------- Reminder group (time bucket) ---------- */

function ReminderGroup({
  title, tone, hint, reminders, onToggle, onRemove,
}: {
  title: string;
  tone: "overdue" | "thisMonth" | "later";
  hint: string;
  reminders: Reminder[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (reminders.length === 0) return null;
  return (
    <div className={`sched-group sched-group-${tone}`}>
      <div className={`sched-group-head sched-group-head-${tone}`}>
        <span className="sched-group-title">{title} <em>{reminders.length}</em></span>
        <span className="sched-group-hint">{hint}</span>
      </div>
      <div className="sched-list">
        {reminders.map((r) => (
          <ReminderRow key={r.id} reminder={r} onToggle={onToggle} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Single reminder row ---------- */

function ReminderRow({
  reminder, onToggle, onRemove,
}: {
  reminder: Reminder;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const u = urgencyLabel(reminder.date, reminder.done);
  return (
    <div className={`sched-row ${reminder.done ? "sched-row-done" : ""}`}>
      {/* Calendar tear-off date block */}
      <div className={`sched-date-block ${reminder.done ? "sched-date-block-done" : ""}`} aria-hidden="true">
        <span className="sched-date-month">{formatMonthShort(reminder.date)}</span>
        <span className="sched-date-day">{formatDayNum(reminder.date)}</span>
      </div>

      <div className="sched-row-main">
        <span className="sched-row-label">{reminder.label}</span>
        <span className="sched-row-date">
          {formatWeekday(reminder.date)}, {formatDate(reminder.date)}
          <em className={`sched-urgency ${u.cls}`}> · {u.label}</em>
        </span>
        {reminder.done && reminder.doneBy ? (
          <span className="sched-row-by">
            <span className="sched-avatar" style={{ background: avatarColor(reminder.doneBy) }} aria-hidden="true">
              {initials(reminder.doneBy)}
            </span>
            Done by {reminder.doneBy}
          </span>
        ) : null}
      </div>

      <div className="sched-row-actions">
        <button
          className="sched-check"
          type="button"
          onClick={() => onToggle(reminder.id)}
          aria-label={reminder.done ? "Mark as not done" : "Mark done"}
          data-event="sched_toggle" data-event-category="schedule"
        >
          {reminder.done ? <span className="icon icon-check" aria-hidden="true" /> : null}
        </button>
        <button
          className="sched-remove"
          type="button"
          onClick={() => onRemove(reminder.id)}
          aria-label="Remove"
        >×</button>
      </div>
    </div>
  );
}

/* ---------- Shared view ---------- */

function SharedScheduleView({ data }: { data: Schedule }) {
  const [doneBy, setDoneBy] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showDone, setShowDone] = useState(true);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Build a synthetic reminder list with local check state so we can reuse buckets.
  const effective: Reminder[] = data.reminders.map((r) =>
    checked.has(r.id) ? { ...r, done: true, doneBy: doneBy || r.doneBy || "You" } : r,
  );

  const buckets = useMemo(() => {
    const groups: Record<"overdue" | "thisMonth" | "later" | "done", Reminder[]> = {
      overdue: [], thisMonth: [], later: [], done: [],
    };
    for (const r of effective) groups[bucketOf(r)].push(r);
    (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) => {
      groups[k].sort((a, b) => a.date.localeCompare(b.date));
    });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.reminders, checked, doneBy]);

  const nextUp = useMemo(() => {
    const pending = effective.filter((r) => !r.done);
    if (pending.length === 0) return null;
    pending.sort((a, b) => a.date.localeCompare(b.date));
    return pending[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.reminders, checked]);

  return (
    <main>
      <nav className="nav shell">
        <Link className="brand" href="/" aria-label="PLANET home">
          <span className="brand-mark" aria-hidden="true" />
          PLANET
        </Link>
        <div className="nav-links">
          <Link href="/tools/schedule">Make your own</Link>
          <Link href="/">Learn more</Link>
        </div>
      </nav>
      <section className="shell cardtool-shared">
        <div className="cardtool-shared-banner">
          <span className="icon icon-share" aria-hidden="true" />
          <span>Someone shared {data.petName}&apos;s care schedule with you. Check things off as you do them.</span>
        </div>
        <div className="sched-shared-name">
          <h2>{data.petName}&apos;s schedule</h2>
          <span>{data.species}</span>
        </div>

        {nextUp ? <NextUpCard reminder={nextUp} petName={data.petName} /> : null}

        <div className="sched-doneby-row">
          <input type="text" value={doneBy} onChange={(e) => setDoneBy(e.target.value)} placeholder="Your name (for check-offs)" className="sched-doneby" />
        </div>

        <div className="sched-groups">
          <SharedGroup title="Overdue" tone="overdue" hint="Take care of these first" reminders={buckets.overdue} onToggle={toggle} doneBy={doneBy} />
          <SharedGroup title="This month" tone="thisMonth" hint="Coming up soon" reminders={buckets.thisMonth} onToggle={toggle} doneBy={doneBy} />
          <SharedGroup title="Later" tone="later" hint="On the horizon" reminders={buckets.later} onToggle={toggle} doneBy={doneBy} />
          {buckets.done.length > 0 ? (
            <div className={`sched-group sched-group-done ${showDone ? "sched-group-open" : ""}`}>
              <button type="button" className="sched-group-head sched-group-head-done" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                <span className="sched-group-title">Done <em>{buckets.done.length}</em></span>
                <span className="sched-group-toggle"><span className="icon icon-chevron-down" aria-hidden="true" /></span>
              </button>
              {showDone ? (
                <div className="sched-list">
                  {buckets.done.map((r) => (
                    <SharedRow key={r.id} reminder={r} onToggle={toggle} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="cardtool-shared-actions">
          <Link className="button button-primary" href="/tools/schedule">Make one for your pet <span className="icon icon-arrow-right" aria-hidden="true" /></Link>
          <Link className="text-link" href="/">Learn about PLANET</Link>
        </div>
      </section>
    </main>
  );
}

function SharedGroup({
  title, tone, hint, reminders, onToggle,
}: {
  title: string;
  tone: "overdue" | "thisMonth" | "later";
  hint: string;
  reminders: Reminder[];
  onToggle: (id: string) => void;
  doneBy: string;
}) {
  if (reminders.length === 0) return null;
  return (
    <div className={`sched-group sched-group-${tone}`}>
      <div className={`sched-group-head sched-group-head-${tone}`}>
        <span className="sched-group-title">{title} <em>{reminders.length}</em></span>
        <span className="sched-group-hint">{hint}</span>
      </div>
      <div className="sched-list">
        {reminders.map((r) => (
          <SharedRow key={r.id} reminder={r} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

function SharedRow({ reminder, onToggle }: { reminder: Reminder; onToggle: (id: string) => void }) {
  const u = urgencyLabel(reminder.date, reminder.done);
  return (
    <div className={`sched-row ${reminder.done ? "sched-row-done" : ""}`}>
      <div className={`sched-date-block ${reminder.done ? "sched-date-block-done" : ""}`} aria-hidden="true">
        <span className="sched-date-month">{formatMonthShort(reminder.date)}</span>
        <span className="sched-date-day">{formatDayNum(reminder.date)}</span>
      </div>
      <div className="sched-row-main">
        <span className="sched-row-label">{reminder.label}</span>
        <span className="sched-row-date">
          {formatWeekday(reminder.date)}, {formatDate(reminder.date)}
          <em className={`sched-urgency ${u.cls}`}> · {u.label}</em>
        </span>
        {reminder.done && reminder.doneBy ? (
          <span className="sched-row-by">
            <span className="sched-avatar" style={{ background: avatarColor(reminder.doneBy) }} aria-hidden="true">
              {initials(reminder.doneBy)}
            </span>
            Done by {reminder.doneBy}
          </span>
        ) : null}
      </div>
      <div className="sched-row-actions">
        <button className="sched-check" type="button" onClick={() => onToggle(reminder.id)} aria-label="Toggle done">
          {reminder.done ? <span className="icon icon-check" aria-hidden="true" /> : null}
        </button>
      </div>
    </div>
  );
}
