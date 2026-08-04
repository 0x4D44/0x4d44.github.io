const BUILD_ID = "darwin-2026.08.02.1";
const CACHE = `darwin-machine-${BUILD_ID}`;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./worker.js",
  "./build-info.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./pkg/darwin_wasm.js",
  "./pkg/darwin_wasm_bg.wasm",
  "/almanac-back.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("darwin-machine-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && url.pathname.startsWith(new URL("./", self.location).pathname)) {
        const cache = await caches.open(CACHE);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      if (event.request.mode === "navigate") return caches.match("./index.html");
      throw error;
    }
  })());
});
