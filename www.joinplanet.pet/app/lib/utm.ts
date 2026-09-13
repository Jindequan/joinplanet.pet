const STORAGE_KEY = "planet_utm_v1";

export type StoredUtm = {
  // Last touch — the campaign that most recently brought this visitor in.
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  // First touch source — preserved so later last-touch clicks don't erase it.
  firstSource?: string;
  at?: string;
};

// Reads utm_* params from a URL. Only call in the browser.
function readUtmFromSearch(search: string): Partial<StoredUtm> {
  const params = new URLSearchParams(search);
  const pick = (key: string) => params.get(key)?.trim() || undefined;
  return {
    source: pick("utm_source"),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
    content: pick("utm_content"),
    term: pick("utm_term"),
  };
}

// Capture on first render: store last-touch utm (overwrites), remember the
// very first source ever seen. Everything lives in localStorage so the pilot
// signup — submitted minutes or weeks later — can carry attribution with it.
export function captureUtm(): StoredUtm | null {
  if (typeof window === "undefined") return null;
  try {
    const incoming = readUtmFromSearch(window.location.search);
    const hasIncoming = Boolean(incoming.source || incoming.medium || incoming.campaign);
    const stored = readStored();
    if (!hasIncoming) return stored;

    const next: StoredUtm = {
      ...incoming,
      firstSource: stored?.firstSource ?? incoming.source,
      at: new Date().toISOString().slice(0, 10),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

function readStored(): StoredUtm | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUtm;
  } catch {
    return null;
  }
}

// Compact attribution string for the server's `utm` text column, e.g.
// "fb_post / social / pilot_launch (first: fb_post)". Undefined when the
// visitor arrived organically, so the column can stay null.
export function utmPayload(): string | undefined {
  const stored = captureUtm();
  if (!stored) return undefined;
  const parts = [stored.source, stored.medium, stored.campaign].filter(Boolean);
  if (parts.length === 0) return undefined;
  let text = parts.join(" / ");
  if (stored.firstSource && stored.firstSource !== stored.source) {
    text += ` (first: ${stored.firstSource})`;
  }
  return text;
}
