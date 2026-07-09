// Span of Control — offline cache. Cache-first: bump CACHE_NAME on any shipped
// change or installed clients will keep the old build (and keep the test in
// tests/validate-static.mjs in step with the name).
const CACHE_PREFIX = "span-of-control-";
const CACHE_NAME = CACHE_PREFIX + "v1";

const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "engine.js",
  "content.js",
  "storage.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "fonts/public-sans.woff2",
  "fonts/courier-prime-400.woff2",
  "fonts/courier-prime-700.woff2",
  "fonts/playfair-italic.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(
      (hit) => hit || fetch(event.request)
    )
  );
});
