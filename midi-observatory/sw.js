// Asterion MIDI Observatory — offline service worker.
// Precaches the full self-contained app shell (HTML, vendored React, self-hosted
// fonts) so the observatory works with no network after the first visit.
// Bump CACHE whenever the shipped assets change so old caches are purged on activate.
const CACHE = 'asterion-midi-observatory-v2';
const ASSETS = [
  "./",
  "./index.html",
  "./support.js",
  "./react.production.min.js",
  "./react-dom.production.min.js",
  "./fonts.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./fonts/IBMPlexMono-400-latin-ext.woff2",
  "./fonts/IBMPlexMono-400-latin.woff2",
  "./fonts/IBMPlexMono-500-latin-ext.woff2",
  "./fonts/IBMPlexMono-500-latin.woff2",
  "./fonts/IBMPlexMono-600-latin-ext.woff2",
  "./fonts/IBMPlexMono-600-latin.woff2",
  "./fonts/SpaceGrotesk-400-latin-ext.woff2",
  "./fonts/SpaceGrotesk-400-latin.woff2",
  "./fonts/SpaceGrotesk-500-latin-ext.woff2",
  "./fonts/SpaceGrotesk-500-latin.woff2",
  "./fonts/SpaceGrotesk-600-latin-ext.woff2",
  "./fonts/SpaceGrotesk-600-latin.woff2",
  "./fonts/SpaceGrotesk-700-latin-ext.woff2",
  "./fonts/SpaceGrotesk-700-latin.woff2"
];
self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(c => c || fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(cache => cache.put(e.request, copy));
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
