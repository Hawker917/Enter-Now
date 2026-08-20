const CACHE_NAME = "enter-now-v5";
const APP_FILES = ["./", "./index.html", "./push-client.js", "./manifest.json", "./beep-boop.wav", "./icon-192.svg", "./icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.destination === "document") {
    event.respondWith(fetch(event.request, { cache: "no-store" }).then(async (response) => {
      const type = response.headers.get("content-type") || "";
      if (!type.includes("text/html")) return response;
      const html = await response.text();
      const marker = "<script src=\"./push-client.js?v=5\"></script>";
      const patched = html.includes(marker) ? html : html.replace(/<\/body>/i, `${marker}</body>`);
      return new Response(patched, { status: response.status, statusText: response.statusText, headers: response.headers });
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  })));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || "Enter Now";
  const body = data.body || "Enter now.";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "./icon-192.svg",
    badge: "./icon-192.svg",
    tag: data.tag || "enter-now-cue",
    renotify: true,
    silent: false,
    requireInteraction: false,
    data: { url: "./", cue: true, cueNumber: data.cueNumber || null }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const existing = list.find((client) => "focus" in client);
    if (existing) return existing.focus();
    return clients.openWindow("./");
  }));
});
