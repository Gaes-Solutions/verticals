// Service worker offline-first del POS PWA.
// App shell cache-first; las llamadas a la API NO se cachean (van por la cola
// de @gaespos/sync-client). Estrategia mínima sin dependencias.

const CACHE = "gaespos-pos-pwa-v1";
const APP_SHELL = ["/", "/scan", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear la API: el cliente de sync maneja offline con su cola local.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/t/")) {
    return;
  }

  // App shell: cache-first con fallback a red.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          if (resp.ok && event.request.method === "GET") {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match("/"));
    }),
  );
});
