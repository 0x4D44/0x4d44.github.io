# ALM-BUG-KILN-00049 — Darmok progress import: a null value inside srs bricks the next render

- **State:** Closed
- **Priority:** Should
- **Severity:** Medium
- **Area:** darmok
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T232543Z-p11889-n874144000-c1 branch=task/bug-ALM-BUG-KILN-00049-run-fix-20260730T232543Z-p11889-n874144000-c1 code=fd76b2a gate=manual) -> Closed (2026-08-01, independently verified and closed by Claude (verifier, not the fixer), on origin/main 26b5ff5 — fix commit fd76b2a verified; the recorded payload no longer throws, and the new entry filter was checked for false positives against records the app itself writes)

## Observation

Split from the independent two-eyes verification of **ALM-BUG-KILN-00013** (2026-07-30). That fix sanitises the progress *containers* and closes the recorded XSS surface; it does not validate the containers' **entries**, so the same brick-the-app class is still reachable through IMPORT.

`DK.load`'s coercion block (`darmok/engine.js:239-252`) accepts any plain object as `srs`. A null value stored under a key then throws on the next render:

```
{"xp":5,"srs":{"わたし|I, me":null}}  ->  srsDue THREW: Cannot read properties of null (reading 'due')
```

This passes the IMPORT guard, which only checks `"xp" in p` (`darmok/app.js:1222`), so a user importing such a payload bricks the app to a blank screen — exactly the symptom ALM-BUG-KILN-00013 recorded, from a different input.

For contrast, the container cases that fix *does* handle:

```
{"xp":5,"srs":null} -> srs = {} typeof object;  srsDue(p) ok -> 0  (no throw)
```

**Expected:** no imported progress payload can throw on the next render; malformed entries are dropped the way malformed containers are.

## Fix

<unfixed — raised only>

## Notes

The natural fix is to validate entries where the containers are validated in `darmok/engine.js:239-252` — drop any `srs` entry whose value is not a plain object with a numeric `due` (and apply the same shape check to `done`).

A broader and probably better option: have `srsDue` (`engine.js:314`) tolerate a malformed entry rather than trusting the store, since it already filters orphaned keys through `DK.vocabByKey` after the ALM-BUG-KILN-00011 fix. Belt-and-braces at both layers would be reasonable here given IMPORT is a user-facing trust boundary.

Regression coverage should extend `darmok/engine-state.test.mjs`'s existing behavioural `DK.load` test with the nested-null payload above.

Separately noted during the same verification, not part of this bug: `{"done":{"1.1":{"best":"<img src=x onerror=alert(1)>"}}}` survives `DK.load` intact, but the defence-in-depth `DK.esc` at `darmok/app.js:283` neutralises it and `app.js:970` only does arithmetic on `.best`, so there is no live XSS.

## Independent verification (2026-08-01) — CLOSED

Verified on `origin/main` 26b5ff5 by a verifier who did not author the fix (fixer was the
2026-07-31 `deltic:auto` run, commit `fd76b2a`). **The recorded symptom no longer reproduces.**

**The exact recorded payload is now harmless:**

```
{"xp":5,"srs":{"わたし|I, me":null}}   ->  srs={} srsDue=[] (no throw)     [previously: srsDue THREW]
```

Adjacent malformed shapes were swept too, all clean (no throw): a string entry, an entry with a
non-numeric `due`, a null `done` record, and the container cases the KILN-00013 fix already
handled.

**Belt-and-braces at both layers, which is what this bug recommended.** `DK.load` now filters
`srs` and `done` entries by shape (`darmok/engine.js:248,253`), *and* `DK.srsDue` independently
re-checks each entry (`engine.js:328`) rather than trusting the store.

**Checked for false positives — the important risk, since this drops user data on load.** A
filter that is too strict would silently wipe real progress. Round-tripped records written the
way the app itself writes them (`DK.srsAdd` at `engine.js:316` writes `{s,due,seen,lapses}`;
`app.js:685` writes `{best,times,last}`) through save + reload:

```
srs entry survived reload  = {"私|I, me":{"s":0,"due":...,"seen":0,"lapses":0}}
done entry survived reload = {"1.1":{"best":90,"times":2,"last":...}}
srsDue after reload        = ["私|I, me"]          <- still correctly reported as due
xp survived                = 120
```

The required field sets match the write sites exactly, so no legitimate record is dropped.

**Proven to bite (fails-before / passes-after).** Reverting the `srs` entry filter and the
`srsDue` shape check on a scratch copy fails the new regression test:

```
not ok 4 - ALM-BUG-KILN-00049: DK.load discards malformed nested progress records
```

**Gates:** root `npm test` and `npm run build` both exit 0 on this tree.
