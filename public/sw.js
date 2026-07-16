// Parvagas service worker — conservative, low-bandwidth friendly.
// Strategy: network-first for navigations (always fresh when online, offline
// fallback when not); cache-first for hashed static assets. Never caches API.
const CACHE = "parvagas-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;          // never touch cross-origin (APIs, ads, fonts)
  if (url.pathname.startsWith("/api")) return;

  // Hashed static assets → cache-first (immutable).
  if (url.pathname.startsWith("/_next/static") || /\.(?:css|js|woff2?|png|svg|ico|jpg|jpeg|webp)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // Navigations → network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
