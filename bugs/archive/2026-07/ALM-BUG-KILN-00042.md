# ALM-BUG-KILN-00042 — No static or service-worker regression assertions for game-of-dracula, so two recorded lessons are unguarded

- **State:** Closed
- **Priority:** Should
- **Severity:** Low
- **Area:** tooling
- **Raised:** 2026-07-30
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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T171126Z-p6174-n120393000-c1 branch=task/bug-ALM-BUG-KILN-00042-run-fix-20260730T171126Z-p6174-n120393000-c1 code=0d12aba66ef809818d08cfbf31d18b894ff50cab gate=manual) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit 0d12aba verified; all four assertions proven to bite by mutation testing on scratch copies)

## Observation

The 2026-07-10 `lessons_learnt.md` entry closes with "Add per-document regression assertions
whenever a new service worker ships". The Game of Dracula document ships a new service worker
and has no behavioural assertion on it, and the root `build` script carries no
`game-of-dracula` segment — unlike lost-valley-dinosaurs, iron-vertex, brilliancy, tidecall,
onu, chief-engineer, span-of-control, shipshape and humanity-retention, which each contribute a
validate-static / static test there.

Concretely, a future edit could:

- reorder `game-of-dracula/sw.js:36` so the scope check runs after `respondWith`;
- drop the `key.startsWith(PREFIX)` filter at `sw.js:25` — the exact repo-wide cache-wipe
  failure the 2026-07-10 lesson records;
- delete the `[hidden] { display: none !important; }` guard at `styles.css:36` — the exact
  `brilliancy` softlock the 2026-07-11 lesson records.

`npm run build` stays green in every case. The shipped code is **correct today**: the PREFIX
filter, the scope check and the `[hidden]` guard are all present and right. This is an unguarded
latent regression against explicitly written repo convention, not a live defect.

Expected: the two recorded failure modes are asserted for this document and wired into the
repo's gate, as every comparable recent document does.

## Notes

Found by a review agent during the pre-publication multi-lens review, then **confirmed by a
separate adversarial verifier** which independently checked that the tracked
`game-of-dracula/tests/` files import only `../engine.js` and never read `sw.js`, `index.html`
or `styles.css`.

**Partially addressed already.** `game-of-dracula/browser.test.mjs` (added at commit `c6ed3e6`,
now on `origin/main`) asserts in a real browser that every `[hidden]` element computes
`display: none`, which closes the `brilliancy`-softlock half, and it is wired into both
`test` and `test:game-of-dracula`. What remains:

1. no assertion on `sw.js` behaviour — the cache PREFIX filter and the scope guard are still
   unguarded (`node --check sw.js` in `test:game-of-dracula` is syntax only and would pass with
   the filter deleted);
2. no `game-of-dracula` segment in the root `build` script, so the fast static gate skips this
   document entirely.

Reference implementations already in the repo: `humanity-retention/tests/validate-static.mjs:52`
asserts the cache-prefix filter with `assert.match(sw, /startsWith\(CACHE_PREFIX\)/)`, and
`iron-vertex/tests/validate-static.mjs:105` guards the `[hidden]` rule with a regex. A
`game-of-dracula/tests/validate-static.mjs` modelled on those, added to both `test` and `build`,
closes this.

Worth noting for whoever fixes it: per `BUGFIX-GUIDE.md` the root `test` / `build` scripts are a
single `&&` chain of hard-coded paths, so adding a segment is a `package.json` edit in both
scripts.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `0d12aba66ef809818d08cfbf31d18b894ff50cab` exists, is an ancestor of HEAD, and touches `game-of-dracula/tests/validate-static.mjs` (+123, new file) and `package.json` (+6/-3) — matching the notes exactly.

**Original observation re-checked — resolved.** The new validator runs `sw.js` in a `node:vm` against mock `caches`/`fetch` and drives the real `activate` and `fetch` listeners. It is wired into `package.json`'s `test:game-of-dracula`, `test` and `build` scripts, and the validator **self-asserts that wiring** at `validate-static.mjs:117-121`, so it cannot silently rot.

**The two lessons it guards:** (a) the 2026-07-10 lesson (`lessons_learnt.md:109`) — `CacheStorage` is origin-wide, so activation must delete only keys carrying the document's own prefix and the fetch handler must reject out-of-scope URLs; (b) the 2026-07-11 `brilliancy` lesson (`lessons_learnt.md:53`) — an author `display:` beats the UA `[hidden]` rule, which once shipped a transparent full-screen layer that softlocked every real tap.

**Proven to bite — four independent mutations applied to scratch copies (the worktree was never modified), each caught with EXIT=1:**

```
drop `key.startsWith(PREFIX) &&` from sw.js activation
  -> AssertionError: activation must retire only stale Game of Dracula caches, never sibling caches
     + actual - expected  [ 'game-of-dracula-old', + 'sibling-app-v9' ]
move the scope check after respondWith in sw.js
  -> AssertionError: out-of-scope requests must not be intercepted   true !== false
weaken `[hidden] { display: none !important; }` to `display: none;`
  -> AssertionError: the global hidden guard must keep author display rules from exposing overlays
remove the game-of-dracula segment from the root `build` script
  -> AssertionError: build must invoke the Game of Dracula static validator
```

**Refutation attempt that held.** The cache assertion is a `deepEqual` on the exact deleted-key list including a deliberate `sibling-app-v9` decoy, so it fails both if the filter is dropped and if it over-deletes. The fetch probe distinguishes out-of-scope, in-scope GET and non-GET by whether `respondWith` was called, which is the real observable. The `[hidden]` half additionally has a real-browser computed-style check at `browser.test.mjs:261`. No guard-theatre found.

**Gate segments re-run by the verifier, all exit 0:** `engine.test.js` (0 failures), `invariants.test.js` (0 failures), `validate-static.mjs` ("99 ids, 7 offline entries"), `simulate.js 500`.
