# ALM-BUG-KILN-00042 — No static or service-worker regression assertions for game-of-dracula, so two recorded lessons are unguarded

- **State:** Open
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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review)

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
