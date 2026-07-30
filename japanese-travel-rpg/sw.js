const CACHE = "nihon-quest-v4";
// Cache Storage is per-origin — scope cleanup to this app's own keys so activating
// this SW never wipes sibling almanac PWAs' offline caches.
const PREFIX = "nihon-quest-";
const ASSETS = [
  "./",
  "./index.html",
  "./support.js",
  "./GuideFace.dc.html",
  "./ios-frame.js",
  "./vendor/react.production.min.js",
  "./vendor/react-dom.production.min.js",
  "./content.js",
  "./content-extra.js",
  "./engines.js",
  "./manifest.webmanifest",
  "./icons/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
