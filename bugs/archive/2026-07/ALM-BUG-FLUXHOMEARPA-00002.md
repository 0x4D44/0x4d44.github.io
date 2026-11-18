# ALM-BUG-FLUXHOMEARPA-00002 — Nihon Quest service worker deletes unrelated origin caches

- **State:** Closed
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
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — SW cleanup is prefix-scoped and mutation-proven)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix.

**Original observation re-checked — resolved.** `sw.js:4` defines `PREFIX = "nihon-quest-"` and `sw.js:26` filters activation cleanup to `key.startsWith(PREFIX) && key !== CACHE`, so the delete set is intersected with this app's own namespace and a sibling Pages app's cache key can never be selected. Regression guard `tests/self-check.mjs:65-68` was mutation-tested: deleting the `key.startsWith(PREFIX) &&` clause fires *"SW activation cleanup must be scoped to PREFIX so it never evicts sibling apps' caches"*.

**Provenance note.** The shipped behaviour was actually corrected earlier, by `4edad5f` (2026-07-11, "fix(pwa): scope service-worker cache cleanup to each app's prefix"); the bug's own commit `62311ba` added the guard. The fix note states this honestly and the verification confirms it.

**Residual noted, not separately tracked.** The second half of the bug's Notes — restrict runtime caching to successful in-scope responses — was not implemented: `sw.js:35-38` still `cache.put`s any same-origin GET response, including a 404 served during a deploy. That is own-cache only, so it carries no sibling-app impact and is outside the recorded observation.
