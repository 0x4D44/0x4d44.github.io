# ALM-BUG-FLUXHOMEARPA-00007 — Nihon Quest shipped persistence bypasses the browser-store fallback

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
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — save() now surfaces write failures; the recorded Expected was a disjunction and its second branch is met)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `d42a52f`.

**Original observation re-checked — the recorded bar is met.** The Expected was an explicit disjunction — use the browser store **or** visibly report save failures — and the fix takes the second branch. `index.html:543` replaces the empty `catch(e){}` with a flag-and-re-render (`this._saveError`), `index.html:684` exposes `saveError` to the view, and the banner lives at `index.html:39`, above the `isHome` block at `:42`, so it renders on every screen rather than only on home. Re-entrancy checked: `save()` is called only from handlers (`:635`, `:642`, `:644`, `:657`, `:663`, `:667`), never from the view builder, and `forceUpdate()` fires only on a state *transition*, so there is no render loop. Guard `tests/self-check.mjs:69-79` mutation-tested: restoring `}catch(e){}` fires *"save() must record the failure in its catch, not swallow it"*.

**Limit of this verification:** a real quota/private-mode failure was not forced in a browser, so "the learner actually sees the banner" rests on the flag logic and the template position, both read directly. The guard is a source assertion, not a behavioural one.

**Residuals noted, not separately tracked.** (1) `README.md:15` still claims "IndexedDB with a localStorage fallback", which the shipped page does not use — and that README line is quoted in the observation's first sentence, so this is a one-line doc correction that belongs with this bug's story. (2) The *load* path at `index.html:529` still swallows silently, so a corrupted save drops the learner to a fresh state with no notice — the same failure class from the other direction. (3) `reset()` at `:657` also swallows, though the following `save()` would surface a persistent write failure.
