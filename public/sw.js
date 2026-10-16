// Cache public assets only. Account pages, RSC payloads and APIs always use the network.
const CACHE_PREFIX = "buavornthai-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const OFFLINE_URL = "/offline.html";
const SHELL_URLS = [OFFLINE_URL, "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    }));
    return;
  }

  const publicAsset = SHELL_URLS.includes(url.pathname) || url.pathname.startsWith("/_next/static/");
  if (!publicAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});

// Web Push (แจ้งเตือนของมือถือ): เสียงเป็นของเครื่อง · ข้อความ การสั่น และการค้างจนกดอ่านกำหนดจากเซิร์ฟเวอร์ (push-notify)
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "บวรไทย", {
    body: data.body || "",
    tag: data.tag,
    renotify: Boolean(data.tag),
    requireInteraction: true,
    vibrate: data.vibrate,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = open.find((client) => client.url === target);
    if (same) return same.focus();
    if (open[0] && "navigate" in open[0]) { await open[0].focus(); return open[0].navigate(target); }
    return self.clients.openWindow(target);
  })());
});
