import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Join a PLANET care circle", robots: { index: false, follow: false } };
const API_BASE = process.env.PLANET_API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "https://api.joinplanet.pet";

async function preview(code: string) {
  const response = await fetch(`${API_BASE.replace(/\/$/, "")}/api/v1/invite/${encodeURIComponent(code)}`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return (await response.json()) as { pet_name?: string; inviter_name?: string };
}

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let data: { pet_name?: string; inviter_name?: string } | null = null;
  try { data = await preview(code); } catch { data = null; }
  const petName = data?.pet_name ?? "your pet";
  // Web 端直接进 App 的加入流（登录后自动携带邀请码）；planet:// 保留给装了原生壳的设备。
  const webJoin = `https://app.joinplanet.pet/invite/${encodeURIComponent(code)}`;
  return <main className="invite-page"><Link className="share-brand" href="/" aria-label="PLANET home"><span className="share-brand-mark" /> PLANET</Link><section className="invite-card"><span className="share-label">You’re invited to a care circle</span><div className="invite-orb">{petName.slice(0, 1).toUpperCase()}</div>{data ? <><h1>Help care for {petName}.</h1><p>{data.inviter_name ? `${data.inviter_name} invited you to share the everyday care.` : "Someone invited you to share the everyday care."}</p><a className="share-button" href={webJoin} data-event="open_app_cta" data-event-category="app_link" data-event-label="invite_join">Join in the web app <span>↗</span></a><a className="invite-native" href={`planet://invite/${encodeURIComponent(code)}`}>Open in the PLANET app instead</a><p className="invite-code">Invite code · <strong>{code.toUpperCase()}</strong></p></> : <><h1>This invitation is no longer available.</h1><p>It may have expired or already been refreshed. Ask your family member for a new invite.</p><Link className="share-button" href="/">Back to PLANET <span>↗</span></Link></>}</section><p className="invite-foot">PLANET keeps daily care, health notes and handoffs in one shared place.</p></main>;
}
