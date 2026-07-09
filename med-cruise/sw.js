// Mediterranean Cruise Planner — offline service worker.
//
// Strategy:
//  - Network-first for the app shell (navigations + our own JS) so a fresh
//    deploy is picked up on the next online load and can never get permanently
//    stuck behind the cache (unhashed filenames).
//  - Cache-first for immutable vendored assets (React, fonts, icons, manifest).
//  - Precache is two-tier: CORE is atomic (install fails loudly if the boot
//    shell is missing) and OPTIONAL is tolerant (a bad font/icon degrades one
//    asset, not the whole app).
//  - Cache cleanup is scoped to this app's prefix, so sibling PWAs on the same
//    origin (salient, focus, …) keep their offline caches.
// Bump VERSION whenever a CORE/immutable asset changes.
const VERSION = 'medcruise-v3';
const PREFIX = 'medcruise-';

const CORE = [
  './',
  'index.html',
  'games.dc.html',
  'support.js',
  'cruise-games-engines.js',
  'vendor/react.production.min.js',
  'vendor/react-dom.production.min.js',
];

const OPTIONAL = [
  'fonts.css',
  'fonts/fredoka.woff2',
  'fonts/nunito.woff2',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) =>
      c.addAll(CORE).then(() => Promise.allSettled(OPTIONAL.map((u) => c.add(u))))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(PREFIX) && k !== VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
});

function putIfOk(req, res) {
  // Only cache same-origin, successful responses — never poison the cache with a
  // transient 404/500 or an opaque cross-origin response.
  if (res && res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

// vendored/immutable assets → cache-first; everything else same-origin → network-first
const IMMUTABLE = /\/(vendor|fonts|icon|manifest\.json)/;

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin → straight to network

  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => putIfOk(req, res))));
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => putIfOk(req, res))
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(
          (hit) => hit || (req.mode === 'navigate' ? caches.match('./', { ignoreSearch: true }) : undefined)
        )
      )
  );
});
