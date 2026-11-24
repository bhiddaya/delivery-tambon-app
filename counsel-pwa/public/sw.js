// หน้าเปลือกแอป: ดึงจากเซิร์ฟเวอร์ก่อนทุกครั้ง ใช้แคชเฉพาะตอนออฟไลน์
// (แบบเดิมใช้แคชก่อน ทำให้มือถือ/เบราว์เซอร์ที่เคยเปิดค้างอยู่กับหน้าเก่าหลังอัปเดต)
// ไม่แคช WebSocket และไม่แคชคำตอบจากโมเดล
const CACHE = "counsel-shell-v19";
const SHELL = ["/", "/index.html", "/app.js", "/texts.js", "/manifest.json", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname === "/ws" || url.pathname === "/config.json") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
