/* Offline cache contains only static public content, never server-rendered account HTML. */
const CACHE = "tienda-public-offline-v2";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.add(new Request(OFFLINE, { credentials: "omit", cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key !== CACHE &&
              (key.startsWith("tienda-shell-") || key.startsWith("tienda-public-")),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function offlinePage() {
  const cache = await caches.open(CACHE);
  const response = await cache.match(OFFLINE);
  return new Response(
    response
      ? await response.text()
      : '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title><h1>Sin conexión</h1><p>Reconéctate para volver a la tienda.</p><button type="button" onclick="location.reload()">Reintentar</button></html>',
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

// APIs and writes always use the network. Never queue or replay a purchase offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(offlinePage));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    const payload = event.data ? event.data.json() : {};
    if (payload && typeof payload === "object") data = payload;
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Tu tienda";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icono.svg",
      badge: "/icono.svg",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url: notificationUrl(data.url) },
    }),
  );
});

function notificationUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    if (
      url.origin === self.location.origin &&
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
      return url.href;
  } catch {}
  return `${self.location.origin}/`;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = notificationUrl(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url === url);
      return existing ? existing.focus() : self.clients.openWindow(url);
    }),
  );
});
