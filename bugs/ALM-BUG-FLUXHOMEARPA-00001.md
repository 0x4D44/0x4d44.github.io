# ALM-BUG-FLUXHOMEARPA-00001 — Nihon Quest offline boot depends on CDN runtime assets

- **State:** Closed
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
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit b816049; runtime JS is now same-origin and the SW precaches it; residual gate breakage split to ALM-BUG-KILN-00043)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `b816049`.

**Original observation re-checked — resolved.** A sweep of the shipped files for `unpkg|cdn\.|jsdelivr|googleapis|gstatic` leaves only `support.js:1048` (`BABEL_URL`) and the Google Fonts links in `index.html:21-22`. `BABEL_URL` is now dead code: `support.js:605` classifies an x-import by extension and `support.js:1078` calls `ensureBabel()` only for `kind === "jsx"`, and the sole x-import is now `./ios-frame.js` (`index.html:34`). React and ReactDOM are vendored same-origin with pinned SRI (`support.js:1568-1571`), and all 11 entries of the service-worker `ASSETS` list exist on disk (`sw.js:5-18`, cache `nihon-quest-v4`). The regression guard `tests/self-check.mjs:94-115` was mutation-tested: reverting `REACT_URL` to unpkg fires *"React must be vendored same-origin, not unpkg"*, and restoring the `.jsx` x-import fires *"no .jsx/.tsx x-import may remain"*.

**Residuals — split out, not folded into this closure.** The fix left this document's own two gates red on Windows; both are tracked as **ALM-BUG-KILN-00043**:
- `tools/build.mjs:16,24` still require `index.html` to reference `ios-frame.jsx`, which the fix repointed to `./ios-frame.js`. Real output at HEAD: `Error: index.html does not reference ios-frame.jsx`, exit 1. It passes at the fix's parent `de7409b`.
- `japanese-travel-rpg/vendor/*.js` were never given the `-text` attribute that `.gitattributes` already grants `broadband-speed-checker/vendor/*.js`, so with `core.autocrlf=true` the checkout bytes are CRLF while the pinned SRI hashes are of the LF blobs. `tests/self-check.mjs` fails with an SRI mismatch, and a local Windows HTTP preview serves bytes the browser rejects, so the app does not mount locally. GitHub Pages serves the LF blobs, so production is unaffected.

Smaller residuals noted but not separately tracked: `/almanac-back.js` is not in the SW precache list, so the shared "← Almanac" button is absent offline; nothing pins `ios-frame.js` to `ios-frame.jsx`, so the two can drift silently; Google Fonts remain cross-origin (acknowledged in the fix note, degrades to a system sans-serif).
