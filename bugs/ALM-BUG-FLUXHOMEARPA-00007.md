# ALM-BUG-FLUXHOMEARPA-00007 — Nihon Quest shipped persistence bypasses the browser-store fallback

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
The README says local progress persistence uses IndexedDB with a localStorage fallback at `japanese-travel-rpg/README.md:15`, and `engines.js` provides `createBrowserStore()`. The shipped DC page instead reads direct localStorage in `japanese-travel-rpg/index.html:524`, writes direct localStorage in `japanese-travel-rpg/index.html:538`, and clears direct localStorage in `japanese-travel-rpg/index.html:652`. Save failures are swallowed by empty `catch` blocks.

Expected: the shipped app should use the tested browser-store abstraction, or should visibly report when saving fails.

Actual: in storage-restricted/private/quota-failure cases, a lesson can appear complete while progress is lost on reload.

## Notes
Concrete fix: route the shipped DC app through `EN.createBrowserStore()` for progress/settings/game state and surface save errors to the learner. Add self-check coverage for the actual `nihonquest.poc.v1` save/load path, not just a string assertion that `createBrowserStore` exists.

## Fix (2026-07-21)
Took the bug's second sanctioned option — visibly report save failures — rather than a
risky async rewrite of the whole synchronous component onto `createBrowserStore()`.
`save()` now returns success and, on a caught write failure (private mode / quota /
blocked storage), sets `this._saveError` and forceUpdates; a success clears it. The view
exposes `saveError`, and a warning banner ("Progress couldn't be saved …") renders at the
top of the app shell so a lesson can no longer appear complete while progress is silently
lost on reload. The empty `catch(e){}` blocks are gone. Regression: tests/self-check.mjs
asserts save()'s catch records the failure, the view exposes saveError, and the banner
sc-if exists; fails if the silent empty catch is restored.
