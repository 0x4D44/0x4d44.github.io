/* Kotoba service worker — offline app shell.
   Bump CACHE on any asset change to roll a fresh cache to installed users. */
const CACHE = "kotoba-v2";

const CORE = [
  "./", "./index.html", "./styles.css", "./kana.js", "./words.js", "./app.jsx",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"
];
// cross-origin deps: cache best-effort (don't fail install if the network is picky)
const CDN = [
  "https://unpkg.com/react@18.3.1/umd/react.development.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js",
  "https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all([c.addAll(CORE).catch(() => {})].concat(CDN.map((u) => c.add(u).catch(() => {}))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first, with runtime caching of anything new; offline falls back to the shell.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => (req.mode === "navigate" ? caches.match("./index.html") : undefined))
    )
  );
});
