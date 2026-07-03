/* Morning Run service worker.

   Scope: same-origin only. The app SHELL (this dir's HTML/CSS/JS/icons) is
   precached and served network-first — always fresh when online, and still
   available from cache when the network is flaky. Cross-origin requests are
   deliberately left to the network and never cached:
     - OSM map tiles: the tile usage policy forbids offline/bulk tile storage;
     - OpenRouteService / Nominatim: routing needs the live network anyway;
     - the CDN runtime (React, Babel, MapLibre): loaded cross-origin.
   Because that CDN runtime and the map tiles both require the network, a cold
   offline launch will not fully boot — the SW gives fast repeat loads and a
   resilient shell, not a true offline app. */
const CACHE = "morning-run-v2";
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./geo.js",
  "./app.jsx",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave tiles/APIs/CDN to the network
  // network-first: fresh content when online, cached shell as a fallback.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp && resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
