const CACHE = "open-bishopric-v2";

// Assets to pre-cache on install
const PRECACHE = ["/", "/home", "/login", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Delete old caches
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and non-same-origin requests
  if (request.method !== "GET") return;
  if (!request.url.startsWith(self.location.origin)) return;

  // Skip API routes — always go to network
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  // Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
