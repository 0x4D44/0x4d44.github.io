# ALM-BUG-KILN-00039 — The shared almanac pill covers the topbar brand button and the skip link

- **State:** Closed
- **Priority:** Should
- **Severity:** Low
- **Area:** game-of-dracula
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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T170609Z-p94489-n715077000-c1 branch=task/bug-ALM-BUG-KILN-00039-run-fix-20260730T170609Z-p94489-n715077000-c1 code=61c91b7623d281e6696df856d27ccd6fd682eb73 gate=manual) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit 61c91b7 verified; clearance applied at every breakpoint and covered by a real hit-test)

## Observation

`/almanac-back.js` appends `#almanac-back-host` with
`position:fixed; top:0; left:0; z-index:2147483647` and `padding: max(10px,…) 0 0 max(10px,…)`,
so the shared "← Almanac" pill occupies roughly x 10–110, y 10–39. This document puts its own
UI in exactly that region, producing two symptoms from one cause:

1. **The brand button.** `.topbar` places `#brand-button` ("Return to game setup") at the very
   top-left (padding `8px 10px` below 720px, `styles.css:293`). On a 360px phone the pill covers
   the whole `.brand-kicker` line and the left third of `GAME OF DRACULA`, and a tap anywhere in
   that ~100×29px region navigates to the almanac catalog rather than opening the setup screen.
   The brand button remains hittable only on its right-hand remainder.

2. **The skip link.** `.skip-link:focus` (`styles.css:39`) reveals the skip link at x 16–~215,
   y 12–~55, at `z-index: 1000` (`styles.css:38`) — far below the pill. The first Tab press
   therefore shows a link whose leading ~95px, including the start of "Skip to game controls",
   is hidden behind the pill, and a pointer click in that region navigates to the almanac
   instead of jumping to `#command-panel`.

Expected: the shared pill and this document's own top-left controls do not overlap, and every
tap lands on the control the user aimed at.

## Notes

Two findings from the pre-publication multi-lens review, filed as one bug because they share a
single root cause (this document places interactive UI under the shared fixed pill) and one fix
region. **Both were confirmed by separate adversarial verifiers**; the brand-button overlap was
reported as measured in real headless Chrome over CDP with `document.elementFromPoint`, after
starting a game so `#game-screen` was visible.

Not personally re-reproduced by the raising agent — reproduce before fixing.

Note the repo already has a precedent for the skip-link half: `african-star/styles.css:59-73`
avoids it by centring its skip link (`left:50%; transform: translate(-50%,0)`).

Likely correct fix: shift the topbar's leading content right by ~110px (or move the
return-to-setup affordance into `.top-actions`), and centre the skip link as `african-star`
does. A repo-wide alternative worth considering: since every document carries the pill, the
overlap is a recurring hazard — a documented "keep the top-left ~110×40px clear" rule in
`CLAUDE.md`, or a shared CSS custom property the pill exports, would prevent the next
occurrence.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `61c91b7623d281e6696df856d27ccd6fd682eb73` exists, is an ancestor of HEAD, and touches `styles.css` (+4/-3), `browser.test.mjs` (+39), `sw.js` — matching the notes.

**Original observation re-checked — resolved.** `styles.css:25` declares `--almanac-pill-clearance: calc(122px + var(--safe-left));`, applied as `.topbar` `padding-left` at `styles.css:101` (base) **and** `styles.css:299` (≤720px), and as `.skip-link { left: var(--almanac-pill-clearance) }` at `styles.css:42`. No later rule re-declares either, and the custom property is on `:root` so it resolves everywhere.

**Limit of this verification:** the rendered geometry was not measured by the verifier; the mechanism was verified by reading.

**Regression coverage — a genuine hit-test, which is what this class of bug needs.** `game-of-dracula/browser.test.mjs:346-383` at 360×640 reaches into `#almanac-back-host`'s shadow root for the pill's real rect, asserts no geometric overlap with `#brand-button`, and asserts `document.elementFromPoint` at the brand's and the focused skip link's leading edge returns those controls. Run green by the lead. (This is exactly the probe the 2026-07-11 lesson in `lessons_learnt.md` demands, rather than a synthetic click.)

**Residuals noted, not separately tracked — follow-up hardening, not open defects.** (1) 122px is a magic constant keyed to the pill's *rendered* width; from `almanac-back.js:32-52` the pill's right edge is estimated near 117px, leaving roughly 5px of margin, so a wider monospace fallback or a raised minimum font size could re-overlap, and only the CI font stack is asserted. The bug itself suggested a shared exported custom property as the durable answer. (2) The skip link now starts at 122px and its label "Skip to game controls" is roughly 200px wide, so on a 320px-class viewport its tail would run past the right edge and be clipped by `body { overflow-x: hidden }` (`styles.css:36`); the test covers only 360 and 390px.
