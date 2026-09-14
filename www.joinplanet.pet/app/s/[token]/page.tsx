import type { Metadata } from "next";
import Link from "next/link";
import { PrintSummaryButton } from "./print-summary-button";

// 社交预览卡片：宠物名 + 一句定位。token 本身不可猜测，noindex 保持私密性，
// 元数据只用于聊天工具内的链接预览（默认值即失败兜底）。
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const fallback: Metadata = { title: "PLANET · Shared care view", robots: { index: false, follow: false } };
  const { token } = await params;
  try {
    const { value } = await readShare(token);
    const pet = (value?.data as CareData | SummaryData | undefined)?.pet;
    if (value && pet) {
      const title = `${pet.name} · PLANET shared care view`;
      const description =
        value.kind === "care_card"
          ? `Today's care plan for ${pet.name}, shared privately through PLANET.`
          : `A family-prepared health summary for ${pet.name}. Private link.`;
      return {
        title,
        description,
        robots: { index: false, follow: false },
        openGraph: { title, description, type: "website" },
        twitter: { card: "summary", title, description },
      };
    }
  } catch {
    // 预览拿不到数据时退回默认 meta，页面自身会给出状态卡。
  }
  return fallback;
}

type Pet = { name: string; species?: string; breed?: string; sex?: string; weight_g?: number };
type CareTask = { title: string; time_of_day?: string; log_status?: string; done_by_name?: string };
type CareData = {
  pet: Pet;
  date: string;
  tasks?: CareTask[];
  emergency_contacts?: unknown;
  med_decision_maker?: unknown;
};
type SummaryData = {
  pet: Pet;
  reason?: string;
  allergies?: unknown;
  conditions?: unknown;
  notes?: string;
  medications?: { name: string; dose?: string; schedule?: string }[];
  events?: { type: string; occurred_at: string; payload?: Record<string, unknown> }[];
  event_days?: number;
};
type ShareResponse = { kind: "care_card" | "summary"; expires_at: string; data: CareData | SummaryData };

const API_BASE = process.env.PLANET_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "https://api.joinplanet.pet";

async function readShare(token: string): Promise<{ value?: ShareResponse; status: number }> {
  const response = await fetch(`${API_BASE.replace(/\/$/, "")}/api/v1/shares/${encodeURIComponent(token)}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { status: response.status };
  return { value: (await response.json()) as ShareResponse, status: response.status };
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ShareHeader({ pet, expiresAt, eyebrow }: { pet: Pet; expiresAt: string; eyebrow: string }) {
  return (
    <header className="share-header">
      <Link className="share-brand" href="/" aria-label="PLANET home"><span className="share-brand-mark" /> PLANET</Link>
      <span className="share-private"><span /> Private link · expires {dateLabel(expiresAt)}</span>
      <p className="share-eyebrow">{eyebrow}</p>
      <div className="share-pet-heading">
        <div className="share-pet-orb" aria-hidden="true">{pet.name.slice(0, 1).toUpperCase()}</div>
        <div><h1>{pet.name}</h1><p>{[pet.species, pet.breed].filter(Boolean).join(" · ") || "Pet care record"}</p></div>
      </div>
    </header>
  );
}

function CareCard({ value }: { value: ShareResponse }) {
  const data = value.data as CareData;
  const tasks = data.tasks ?? [];
  return (
    <>
      <ShareHeader pet={data.pet} expiresAt={value.expires_at} eyebrow="Today’s handoff" />
      <main className="share-main">
        <section className="share-intro"><span className="share-label">Care plan · {dateLabel(data.date)}</span><h2>Everything needed for a calm day together.</h2><p>A small, current view for the person caring for {data.pet.name} today.</p></section>
        <section className="share-panel">
          <div className="share-panel-head"><div><span className="share-label">Today’s routine</span><h2>{tasks.length ? `${tasks.filter((task) => task.log_status === "done").length} of ${tasks.length} done` : "No tasks yet"}</h2></div><span className="share-date">{dateLabel(data.date)}</span></div>
          <div className="share-task-list">{tasks.map((task) => <div className={`share-task ${task.log_status === "done" ? "is-done" : ""}`} key={`${task.title}-${task.time_of_day ?? ""}`}><span className="share-check">{task.log_status === "done" ? "✓" : ""}</span><div><strong>{task.title}</strong><small>{task.time_of_day ?? "Whenever works"}{task.done_by_name ? ` · ${task.done_by_name}` : ""}</small></div></div>)}</div>
        </section>
        <section className="share-grid">
          <InfoCard label="Emergency contacts" value={data.emergency_contacts} />
          <InfoCard label="Medication decision maker" value={data.med_decision_maker} />
        </section>
        <ShareFooter note="This view is read-only. Ask the family for the latest link if anything has changed." />
      </main>
    </>
  );
}

function InfoCard({ label, value }: { label: string; value: unknown }) {
  const text = Array.isArray(value) ? value.map((item) => typeof item === "object" && item ? Object.values(item as Record<string, unknown>).filter(Boolean).join(" · ") : String(item)).join("\n") : typeof value === "object" && value ? Object.values(value as Record<string, unknown>).filter(Boolean).join(" · ") : value ? String(value) : "Not provided";
  return <div className="share-info-card"><span className="share-label">{label}</span><p>{text}</p></div>;
}

function SummaryCard({ value }: { value: ShareResponse }) {
  const data = value.data as SummaryData;
  const events = data.events ?? [];
  const weightEvents = events.filter((event) => event.type === "weight" && typeof event.payload?.weight_g === "number").slice(0, 6);
  const vaccineEvents = events.filter((event) => event.type === "vaccine" || event.type === "deworm").slice(0, 6);
  const visitEvents = events.filter((event) => event.type === "vet_visit").slice(0, 6);
  return (
    <>
      <ShareHeader pet={data.pet} expiresAt={value.expires_at} eyebrow="Vet-ready summary" />
      <main className="share-main">
        <section className="share-intro"><span className="share-label">Prepared health context</span><h2>A clear starting point for the next conversation.</h2><p>Organized from the family’s records. Review with a veterinarian before making care decisions.</p>{data.reason ? <div className="share-info-card share-reason-card"><span className="share-label">Why now</span><p>{data.reason}</p></div> : null}<PrintSummaryButton /></section>
        <section className="share-allergy-card"><span className="share-label">Allergies · tell your vet first</span><p>{Array.isArray(data.allergies) && data.allergies.length ? data.allergies.map((item) => typeof item === "object" && item ? Object.values(item as Record<string, unknown>).filter(Boolean).join(" · ") : String(item)).join(" · ") : "None recorded"}</p></section>
        <section className="share-grid share-summary-grid">
          <InfoCard label="Conditions" value={data.conditions} />
          <InfoCard label="Current notes" value={data.notes} />
          <div className="share-info-card"><span className="share-label">Current medication</span>{data.medications?.length ? data.medications.map((med) => <p className="share-med" key={`${med.name}-${med.dose ?? ""}`}><strong>{med.name}</strong><br />{[med.dose, med.schedule].filter(Boolean).join(" · ")}</p>) : <p>None recorded</p>}</div>
          <div className="share-info-card"><span className="share-label">Weight trend</span>{weightEvents.length ? weightEvents.map((event, index) => <p className="share-med" key={`${event.occurred_at}-${index}`}><strong>{((event.payload?.weight_g as number) / 1000).toFixed(2)} kg</strong><br />{dateLabel(event.occurred_at)}</p>) : <p>None recorded</p>}</div>
        </section>
        <section className="share-grid share-summary-grid"><InfoCard label="Vaccines / deworming" value={vaccineEvents.length ? vaccineEvents.map((event) => `${typeof event.payload?.name === "string" ? event.payload.name : "Vaccine / deworming"} · ${dateLabel(event.occurred_at)}`) : undefined} /><InfoCard label="Vet visits" value={visitEvents.length ? visitEvents.map((event) => `${typeof event.payload?.title === "string" ? event.payload.title : "Vet visit"} · ${dateLabel(event.occurred_at)}`) : undefined} /></section>
        <section className="share-panel"><div className="share-panel-head"><div><span className="share-label">Recent timeline</span><h2>{events.length} recorded changes</h2></div><span className="share-date">Last {data.event_days ?? 90} days</span></div><div className="share-event-list">{events.length ? events.map((event, index) => <div className="share-event" key={`${event.occurred_at}-${index}`}><span>{dateLabel(event.occurred_at)}</span><div><strong>{titleCase(event.type)}</strong><p>{event.payload ? Object.values(event.payload).filter((item) => typeof item === "string" || typeof item === "number").join(" · ") : "Recorded in PLANET"}</p></div></div>) : <p className="share-empty">No timeline events in this period.</p>}</div></section>
        <ShareFooter note="This summary is a snapshot of family-entered records, not a diagnosis or replacement for veterinary advice." />
      </main>
    </>
  );
}

function ShareFooter({ note }: { note: string }) {
  return <footer className="share-footer"><p>{note}</p><Link href="/">Learn about PLANET <span>↗</span></Link></footer>;
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let result: { value?: ShareResponse; status: number };
  try { result = await readShare(token); } catch { result = { status: 503 }; }
  if (result.status === 410) return <ShareState title="This private link has expired" detail="Ask the person who shared it for a new PLANET link." />;
  if (!result.value) return <ShareState title="This view is temporarily unavailable" detail="Please try again in a moment, or ask for a fresh link." />;
  return result.value.kind === "care_card" ? <CareCard value={result.value} /> : <SummaryCard value={result.value} />;
}

function ShareState({ title, detail }: { title: string; detail: string }) {
  return <main className="share-state"><Link className="share-brand" href="/" aria-label="PLANET home"><span className="share-brand-mark" /> PLANET</Link><div className="share-state-card"><span className="share-state-mark">·</span><span className="share-label">Private link</span><h1>{title}</h1><p>{detail}</p><Link className="share-button" href="/">Go to PLANET <span>↗</span></Link></div></main>;
}
