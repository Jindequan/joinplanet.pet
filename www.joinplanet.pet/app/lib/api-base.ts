// Base URL of the Go backend that owns all API routes (webhook, progress,
// intake, email-capture, checkout, membership/claim). Set NEXT_PUBLIC_API_BASE
// to the backend origin, e.g. https://api.joinplanet.pet. When unset, calls
// fall back to the same origin (useful for local dev behind a proxy).
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function apiUrl(path: string): string {
  // Normalize so callers can pass either "/progress" or "progress".
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${trimmed}`;
}
