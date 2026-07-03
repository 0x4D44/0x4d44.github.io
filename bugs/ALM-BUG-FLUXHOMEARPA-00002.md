# ALM-BUG-FLUXHOMEARPA-00002 — Nihon Quest service worker deletes unrelated origin caches

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
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
The service worker activation handler in `japanese-travel-rpg/sw.js:19` deletes every CacheStorage key whose name is not the current `nihon-quest-v3` cache. CacheStorage is origin-wide, and this site hosts many independent GitHub Pages apps under the same origin.

Expected: activating the Nihon Quest service worker should remove only old Nihon Quest caches.

Actual: visiting or updating Nihon Quest can evict offline caches belonging to unrelated `0x4d44.github.io` apps.

## Notes
Concrete fix: delete only cache names with a `nihon-quest-` prefix and leave all other origin caches alone. At the same time, restrict runtime caching in `japanese-travel-rpg/sw.js:30` to successful app-scope/static responses.
