/* PLANET service worker — deliberately minimal and conservative.
 *
 * Policy:
 *  - /assets/* (content-hashed build output): cache-first.
 *  - Navigations (HTML): network-first, offline fallback to /offline.html.
 *  - /api/v1/*: always straight to the network, never cached, never
 *    synthesized — the app's own offline queue owns that logic.
 *  - Non-GET requests: passed through untouched (no respondWith).
 *
 * Bump CACHE to invalidate old entries; activate purges stale versions.
 */
const CACHE = "planet-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch mutations or the API surface.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;
  if (!url.protocol.startsWith("http")) return;

  // App shell documents: network-first with an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Hashed static assets only — conservative cache-first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
  // Everything else: no respondWith, straight to the network.
});
