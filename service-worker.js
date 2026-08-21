const CACHE_NAME = "enter-now-v7";
const APP_FILES = ["./", "./index.html", "./push-client.js", "./enhancements.js", "./manifest.json", "./beep-boop.wav", "./icon-192.svg", "./icon-512.svg"];

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
      let patched = html;
      const pushMarker = "<script src=\"./push-client.js?v=7\"></script>";
      const enhancementMarker = "<script src=\"./enhancements.js?v=2\"></script>";
      if (!patched.includes(pushMarker)) patched = patched.replace(/<\/body>/i, `${pushMarker}</body>`);
      if (!patched.includes(enhancementMarker)) patched = patched.replace(/<\/body>/i, `${enhancementMarker}</body>`);
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
