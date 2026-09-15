import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Join a PLANET care circle", robots: { index: false, follow: false } };
const API_BASE = process.env.PLANET_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "https://api.joinplanet.pet";

type InviteData = { pet_name?: string; inviter_name?: string };
type PreviewResult =
  | { state: "valid"; data: InviteData }
  | { state: "invalid" }
  | { state: "error" };

async function preview(code: string): Promise<PreviewResult> {
  const response = await fetch(`${API_BASE.replace(/\/$/, "")}/api/v1/invite/${encodeURIComponent(code)}`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (response.status === 404 || response.status === 410) return { state: "invalid" };
  if (!response.ok) return { state: "error" };
  return { state: "valid", data: (await response.json()) as InviteData };
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let result: PreviewResult = { state: "error" };
  try { result = await preview(code); } catch { result = { state: "error" }; }
  const data = result.state === "valid" ? result.data : null;
  const petName = data?.pet_name ?? "your pet";
  // Web 端直接进 App 的加入流（登录后自动携带邀请码）；planet:// 保留给装了原生壳的设备。
  const webJoin = `https://app.joinplanet.pet/invite/${encodeURIComponent(code)}`;
  return <main className="invite-page"><Link className="share-brand" href="/" aria-label="PLANET home"><span className="share-brand-mark" /> PLANET</Link><section className="invite-card"><span className="share-label">You’re invited to a care circle</span>{result.state === "valid" ? <><div className="invite-orb">{petName.slice(0, 1).toUpperCase()}</div><h1>Help care for {petName}.</h1><p>{data?.inviter_name ? `${data.inviter_name} invited you to share the everyday care.` : "Someone invited you to share the everyday care."}</p><a className="share-button" href={webJoin} data-event="open_app_cta" data-event-category="app_link" data-event-label="invite_join">Join in the web app <span>↗</span></a><a className="invite-native" href={`planet://invite/${encodeURIComponent(code)}`}>Open in the PLANET app instead</a><p className="invite-code">Invite code · <strong>{code.toUpperCase()}</strong></p></> : result.state === "invalid" ? <><h1>This invitation is no longer available.</h1><p>It may have expired or already been refreshed. Ask your family member for a new invite.</p><Link className="share-button" href="/">Back to PLANET <span>↗</span></Link></> : <><h1>We couldn’t check this invitation.</h1><p>The invitation service is temporarily unavailable. Try again, or ask your family member to resend the invite if the problem continues.</p><Link className="share-button" href={`/invite/${encodeURIComponent(code)}`}>Try again <span>↻</span></Link></>}</section><p className="invite-foot">PLANET keeps daily care, health notes and handoffs in one shared place.</p></main>;
}
