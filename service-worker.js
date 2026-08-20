const CACHE_NAME = "enter-now-v2";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./beep-boop.wav",
  "./icon-192.svg",
  "./icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }))
  );
});

// iOS Home Screen Web Push arrives here even when Enter Now is not visible.
// Safari requires a visible notification; silent/background-only pushes are not supported.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || "Enter Now";
  const body = data.body || "Enter now.";
  const options = {
    body,
    icon: "./icon-192.svg",
    badge: "./icon-192.svg",
    tag: data.tag || "enter-now-cue",
    renotify: true,
    requireInteraction: false,
    data: { url: "./", cue: true }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const existing = list.find((client) => "focus" in client);
    if (existing) return existing.focus();
    return clients.openWindow("./");
  }));
});
