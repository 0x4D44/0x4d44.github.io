# ALM-BUG-KILN-00013 — DK.load lets a null container (srs/done/medals) through and interpolates unescaped progress fields -- brick + stored-XSS surface

- **State:** Fixed
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
- **State history:** Open (2026-07-13, raised by Claude (overnight CR pass))
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)

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
