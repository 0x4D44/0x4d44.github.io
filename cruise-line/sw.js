const CACHE_PREFIX = "wake-and-fortune-";
const CACHE = `${CACHE_PREFIX}v2`;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.mjs",
  "./engine.mjs",
  "./content.mjs",
  "./storage.mjs",
  "./guidance.mjs",
  "./icon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  const inScope = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  if (!inScope) return;
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(event.request)
      .then((cached) => cached || fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => (event.request.mode === "navigate" ? cache.match("./index.html") : Response.error())))),
  );
});
