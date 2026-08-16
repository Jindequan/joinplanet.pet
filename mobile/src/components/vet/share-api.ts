/**
 * Share helpers (API contract F6/F7): create private links + date formatting.
 * Copy works without a clipboard dependency: Web uses the async clipboard
 * API; on native the URL text is long-press selectable and callers fall back
 * to the system share sheet (which offers Copy on both platforms).
 */
import dayjs from 'dayjs';
import { post } from '../../lib/api';

/** POST /pets/{petID}/shares response share (contract F6). */
export interface CreatedShare {
  id: string;
  kind: string;
  token?: string;
  url: string;
  expires_at: string;
  view_count?: number;
}

/** Toggles sent as `includes` for summary shares (contract F6). */
export interface ShareIncludes {
  profile: boolean;
  allergies: boolean;
  medications: boolean;
  events: boolean;
  weight: boolean;
  visits: boolean;
}

export interface CreateShareInput {
  kind: 'summary' | 'care';
  ttl_hours: 24 | 72 | 168;
  reason?: string;
  includes?: ShareIncludes;
}

/** POST /pets/{petID}/shares — returns the created share (id/url/expires_at). */
export function createShare(petId: string, input: CreateShareInput): Promise<CreatedShare> {
  return post<{ share: CreatedShare }>(`/pets/${petId}/shares`, input).then((r) => r.share);
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
