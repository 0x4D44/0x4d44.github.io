# ALM-BUG-FLUXHOMEARPA-00001 — Nihon Quest offline boot depends on CDN runtime assets

- **State:** Open
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
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)

## Observation
The `japanese-travel-rpg` README says the app has PWA caching for offline use, but the shipped page still needs runtime assets from third-party origins before it can boot. `japanese-travel-rpg/support.js:1048` loads Babel from unpkg, `japanese-travel-rpg/support.js:1568` and `japanese-travel-rpg/support.js:1570` load React and ReactDOM from unpkg, and `japanese-travel-rpg/index.html:21` loads Google Fonts. The service worker precache list in `japanese-travel-rpg/sw.js:2` contains only same-origin assets, and the fetch handler returns early for cross-origin requests at `japanese-travel-rpg/sw.js:28`.

Expected: an installed/offline PWA launch should boot from same-origin cached assets, or the offline claim should be withdrawn.

Actual: a cold offline launch, or a launch after the browser HTTP cache evicts those CDN scripts, cannot reliably render the app.

## Notes
Concrete fix: vendor the exact runtime assets under `japanese-travel-rpg/` and add them to `ASSETS`, or precompile `ios-frame.jsx` so Babel is not needed at runtime and self-host React/ReactDOM. Add a self-check that fails on unallowlisted runtime external URLs. Bump the service-worker cache name with the fix.
