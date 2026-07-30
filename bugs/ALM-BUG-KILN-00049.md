# ALM-BUG-KILN-00049 — Darmok progress import: a null value inside srs bricks the next render

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** darmok
- **Raised:** 2026-07-30
- **Owner:** deltic:manual
- **Owner role:** fix
- **Owner run:** fix-20260730T232543Z-p11889-n874144000-c1
- **Owner host:** flux
- **Owner branch:** task/bug-ALM-BUG-KILN-00049-run-fix-20260730T232543Z-p11889-n874144000-c1
- **Owner base:** f1666ad4da4c2dcee0a60dba8c7590123cf49cc5
- **Owner fingerprint:** -
- **Owner since:** 2026-07-30T23:25:43Z
- **Owner until:** 2026-07-31T01:25:43Z
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5)

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
