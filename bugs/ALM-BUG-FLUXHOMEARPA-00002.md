# ALM-BUG-FLUXHOMEARPA-00002 — Nihon Quest service worker deletes unrelated origin caches

- **State:** Fixed
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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

## Observation
The service worker activation handler in `japanese-travel-rpg/sw.js:19` deletes every CacheStorage key whose name is not the current `nihon-quest-v3` cache. CacheStorage is origin-wide, and this site hosts many independent GitHub Pages apps under the same origin.

Expected: activating the Nihon Quest service worker should remove only old Nihon Quest caches.

Actual: visiting or updating Nihon Quest can evict offline caches belonging to unrelated `0x4d44.github.io` apps.

## Notes
Concrete fix: delete only cache names with a `nihon-quest-` prefix and leave all other origin caches alone. At the same time, restrict runtime caching in `japanese-travel-rpg/sw.js:30` to successful app-scope/static responses.

## Fix (2026-07-21)
The shipped sw.js activation already scopes cache cleanup to this app's own keys —
`PREFIX = "nihon-quest-"` and `keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)`
— so it no longer evicts sibling `0x4d44.github.io` PWAs' caches, and the fetch handler
returns early for cross-origin requests (`url.origin !== location.origin`). The recorded
observation therefore no longer reproduces. What was missing was the regression guard,
now added to tests/self-check.mjs: it asserts the PREFIX namespace, the PREFIX-scoped
cleanup, and the cross-origin fetch guard; it fails if cleanup is unscoped back to
"every key that isn't the current cache". No product-code change was required.
