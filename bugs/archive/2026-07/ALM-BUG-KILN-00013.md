# ALM-BUG-KILN-00013 — DK.load lets a null container (srs/done/medals) through and interpolates unescaped progress fields -- brick + stored-XSS surface

- **State:** Closed
- **Priority:** Could
- **Severity:** Low
- **Area:** darmok
- **Raised:** 2026-07-13
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass)) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — both recorded repros fixed and the XSS surface closed; a same-class nested-null residual split to ALM-BUG-KILN-00049)

## Observation
Importing (or seeding) a progress payload whose srs/done/medals is null bricks the app to a blank screen on the next render; and HTML placed in a numeric/string progress field executes as script on the shared 0x4d44.github.io origin.

Repro (brick): in the app's IMPORT (app.js:1171) paste `{"xp":5,"srs":null}` -> passes the `"xp" in p` check -> on next render srsDue()/Object.keys(done)/medals.includes() throw; #app stays empty.
Repro (XSS): set localStorage['darmok.progress.v1'] to `{"xp":"<img src=x onerror=alert(document.domain)>"}` (any same-origin almanac page can) -> the bridge renders it live.

## Notes
Confirmed by running the engine: DK.load uses `Object.assign(defaultProgress(), p, ...)` (engine.js:195) with no type coercion, so an explicit null overwrites the default {}/[]. And app.js interpolates progress fields into innerHTML WITHOUT DK.esc: P.xp (app.js:228, 938), P.reviews (:733, 941), P.done[id].best (:283), P.settings[key] into aria-checked (:972). rankFor tolerates a string xp without throwing, so render proceeds and the payload fires with no interaction. Every almanac document shares one origin, so a sibling page (or IMPORT) is a real injector -- hence the security lens filed it high; the adversarial skeptic corrected severity to Low given it is a personal static site with no auth/secret, but it is still a genuine same-origin script-execution + brick surface.

Fix: sanitize at the trust boundary in DK.load -- coerce each field to its expected type (xp/reviews via `Number(x)||0`; force srs/done to objects, medals to an array, settings values to booleans/numbers) before returning; as defense-in-depth wrap the progress-derived interpolations at app.js:228/283/733/938/941/972 in DK.esc.

## Fix (2026-07-21)
`DK.load` now sanitizes at the trust boundary: it coerces `xp`/`reviews` via `Number(x)||0`,
forces `srs`/`done` to plain objects, `medals`/`days` to arrays, `name` to a string, and each
`settings` value to its declared boolean/number type — so a null container can no longer
brick the next render and an HTML string in a numeric field is coerced to 0 before it can be
interpolated. As defense-in-depth the one remaining progress-derived unescaped interpolation,
the per-lesson best score, is now wrapped in `DK.esc` (xp/reviews/settings/name interpolations
are already numeric-coerced or `DK.esc`-wrapped). Regression: darmok/engine-state.test.mjs
(null-container coercion, non-numeric field coercion, settings coercion, and a static check
that best is escaped).

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `7cc9226`.

**Original observation re-checked — both recorded repros resolved.** The coercion block at `darmok/engine.js:239-252` normalises `xp`/`reviews` through `Number(x)||0`, guards `srs`/`done` with `isPlainObj`, guards `medals`/`days` as arrays, and types the settings loop; `app.js:283` adds `DK.esc(rec.best)`. Running the exact recorded payloads through the real `DK.load`:

```
repro1 {"xp":5,"srs":null} -> srs = {} typeof object
   srsDue(p) ok -> 0 | Object.keys(done) -> 0 | medals.includes -> false   (no throw)
repro2 XSS xp -> 0 number | rankFor: Cadet
repro3 done/medals/days/name/reviews -> {"done":{},"medals":[],"days":null,"name":"","reviews":0}
```

The other interpolation sites named in the bug were re-checked: `P.xp` (`:228`, `:982`) and `P.reviews` (`:777`, `:985`) are unescaped but now `Number`-coerced; `P.name` is escaped (`:978`); `P.settings[key]` in `aria-checked` (`:1016`) is type-coerced. Those are closed. Regression coverage `darmok/engine-state.test.mjs` passes two KILN-00013 tests (one behavioural over `DK.load`, one static for the `best` escape).

**Residual split to ALM-BUG-KILN-00049.** The sanitizer validates containers but not their entries, so a null *value inside* `srs` still bricks the next render and is reachable through IMPORT (which only checks `"xp" in p`, `app.js:1222`):

```
{"xp":5,"srs":{"わたし|I, me":null}}  ->  srsDue THREW: Cannot read properties of null (reading 'due')
```

Same class, different input; the recorded observation named only the null container, so the original is closed and the residual is tracked separately.
