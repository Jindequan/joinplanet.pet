/**
 * Share helpers (API contract F6/F7): create private links + date formatting.
 * Copy works without a clipboard dependency: Web uses the async clipboard
 * API; on native the URL text is long-press selectable and callers fall back
 * to the system share sheet (which offers Copy on both platforms).
 */
import dayjs from 'dayjs';
import { post } from '../../lib/api';

/** POST /pets/{id}/shares —— token 明文仅此一次；url = Web 查看页。 */
export interface CreatedShare {
  id: string;
  kind: string;
  token: string;
  url: string;
  expires_at: string;
  view_count?: number;
}

/** Summary 段落勾选 → 契约 options.sections。 */
export interface ShareIncludes {
  profile: boolean;
  allergies: boolean;
  medications: boolean;
  events: boolean;
  weight: boolean;
  visits: boolean;
}

export interface CreateShareInput {
  kind: 'summary' | 'care' | 'care_card';
  ttl_hours: 24 | 72 | 168;
  reason?: string;
  includes?: ShareIncludes;
}

/** POST /pets/{id}/shares（契约 v2）—— 返回一次性 token 与查看地址。 */
export function createShare(petId: string, input: CreateShareInput): Promise<CreatedShare> {
  const kind = input.kind === 'care' ? 'care_card' : input.kind;
  const sections: string[] = [];
  if (input.includes?.profile || input.includes?.allergies) sections.push('profile');
  if (input.includes?.medications) sections.push('medications');
  if (input.includes?.events || input.includes?.weight || input.includes?.visits) sections.push('events');
  return post<{ share: { id: string; kind: string; expires_at: string }; token: string }>(
    `/pets/${petId}/shares`,
    {
      kind,
      ttl_hours: input.ttl_hours,
      ...(kind === 'summary' ? { options: { sections: sections.length ? sections : ['profile', 'medications', 'events'], days: 90 } } : {}),
    },
  ).then(async (r) => {
    const { shareURL } = await import('../../lib/api');
    return {
      id: r.share.id,
      kind: r.share.kind,
      token: r.token,
      url: shareURL(r.token),
      expires_at: r.share.expires_at,
    };
  });
}

/** "Aug 19" */
export function formatShortDate(iso: string): string {
  return dayjs(iso).format('MMM D');
}

/** "Aug 19 · 3:24 PM" */
export function formatExpiry(expiresAt: string): string {
  return dayjs(expiresAt).format('MMM D · h:mm A');
}

type WebClipboard = { writeText?: (text: string) => Promise<void> };

/** Best-effort copy; false means the caller should fall back to Share.share. */
export async function copyLink(url: string): Promise<boolean> {
  const clipboard = (globalThis as { navigator?: { clipboard?: WebClipboard } }).navigator?.clipboard;
  if (!clipboard?.writeText) return false;
  try {
    await clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
