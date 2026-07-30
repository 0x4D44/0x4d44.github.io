# ALM-BUG-FLUXHOMEARPA-00001 — Nihon Quest offline boot depends on CDN runtime assets

- **State:** Fixed
- **Priority:** Must
- **Severity:** High
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-03
- **Owner:** -
- **Owner role:** -
- **Owner run:** -
- **Owner host:** -
- **Owner branch:** -
- **Owner base:** -
- **Owner fingerprint:** -
- **Owner since:** -
- **Owner until:** -
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
The `japanese-travel-rpg` README says the app has PWA caching for offline use, but the shipped page still needs runtime assets from third-party origins before it can boot. `japanese-travel-rpg/support.js:1048` loads Babel from unpkg, `japanese-travel-rpg/support.js:1568` and `japanese-travel-rpg/support.js:1570` load React and ReactDOM from unpkg, and `japanese-travel-rpg/index.html:21` loads Google Fonts. The service worker precache list in `japanese-travel-rpg/sw.js:2` contains only same-origin assets, and the fetch handler returns early for cross-origin requests at `japanese-travel-rpg/sw.js:28`.

Expected: an installed/offline PWA launch should boot from same-origin cached assets, or the offline claim should be withdrawn.

Actual: a cold offline launch, or a launch after the browser HTTP cache evicts those CDN scripts, cannot reliably render the app.

## Notes
Concrete fix: vendor the exact runtime assets under `japanese-travel-rpg/` and add them to `ASSETS`, or precompile `ios-frame.jsx` so Babel is not needed at runtime and self-host React/ReactDOM. Add a self-check that fails on unallowlisted runtime external URLs. Bump the service-worker cache name with the fix.

## Fix (2026-07-21)
Took the bug's preferred path — precompile the JSX and self-host React — so the PWA boots
from same-origin assets with no CDN runtime dependency:
- **Precompiled `ios-frame.jsx` -> `ios-frame.js`** using the identical `@babel/standalone`
  presets (`react`, `typescript`) the runtime used, and pointed the `<x-import>` at the
  `.js`. The DC runtime picks its loader kind by extension (`kindOf`), so a `.js` import
  never triggers `ensureBabel()` — **Babel (~3 MB) is no longer fetched at all**.
- **Vendored React + ReactDOM** under `vendor/` (byte-identical to the pinned build — the
  existing SRI hashes still validate) and repointed `REACT_URL`/`REACT_DOM_URL` in support.js
  to `./vendor/...`.
- **Service worker**: added `ios-frame.js` + the two vendored scripts to `ASSETS`, dropped the
  now-unused `ios-frame.jsx` from the precache, and bumped the cache `nihon-quest-v3 -> v4`.

Verified end-to-end in headless Chromium: the app renders fully (Journey/Phrases/Review/XP)
with **zero unpkg requests** in the rendered DOM; the precompiled bundle registers `IOSDevice`
through the runtime's exact `new Function(...)` wrapper. Google Fonts remain a cosmetic
progressive enhancement that degrades to system sans-serif offline (fully vendoring the
subsetted Japanese webfonts is impractical and not required to boot). Regression: a new block
in tests/self-check.mjs asserts the runtime scripts are same-origin, no `.jsx`/`.tsx` import
remains, the vendored files match the pinned SRI, and all three are in the SW precache.
