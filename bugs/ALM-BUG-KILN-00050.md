# ALM-BUG-KILN-00050 — Game of Dracula modal shell ignores safe-area left/right insets in landscape

- **State:** Closed
- **Priority:** Could
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T233919Z-p31498-n321410000-c1 branch=task/bug-ALM-BUG-KILN-00050-run-fix-20260730T233919Z-p31498-n321410000-c1 code=710e0c000238e8bd1b83b0cdc83cd4dea292708d gate=manual) -> Closed (2026-08-01, independently verified and closed by Claude (verifier, not the fixer), on origin/main 26b5ff5 — fix commit 710e0c0 verified; the previously-unconfirmed defect was CONFIRMED in an emulated inset run on the pre-fix CSS (dialog left=19px inside a 59px notch) and is fixed)

## Observation

Split from the independent two-eyes verification of **ALM-BUG-KILN-00038** (2026-07-30). That fix added `--safe-top`/`--safe-right`/`--safe-left` and applied them to every element the bug named — the topbar, setup screen, game layout, command panel, overlays, toast region and skip link, at both breakpoints. The modal shell was missed.

`game-of-dracula/styles.css:249` sizes the dialog as:

```css
.modal { width: min(920px, calc(100vw - 24px)); }
```

That is inset-blind, and a native `<dialog>` centres in the viewport. With `viewport-fit=cover`, `display: standalone` and `orientation: any` in the manifest, a landscape orientation on a notched device puts the Rules / Settings / Victory dialog's leading edge roughly 12px from the display edge — inside a 44-59px `safe-area-inset-left`. The dialog header text and the `.rules-tabs` buttons would sit under the notch.

This contradicts ALM-BUG-KILN-00038's literal Expected ("no control sits beneath the status bar or notch in either orientation") while falling outside its recorded Observation, which named the topbar, the brand button and the board's left edge.

**Expected:** no dialog control sits beneath the notch in either orientation.

## Fix

<unfixed — raised only>

## Notes

**This has not been observed on hardware or in an emulated inset run** — it is derived from reading `styles.css:249` against the safe-area variables the KILN-00038 fix introduced. Confirm before fixing: `game-of-dracula/browser.test.mjs:303-344` already injects `Emulation.setSafeAreaInsetsOverride`, so extending that check to an open dialog is the cheapest way to establish it, and would double as the regression guard. That is why this is filed Could/Low rather than higher.

Likely fix: `width: min(920px, calc(100vw - 24px - var(--safe-left) - var(--safe-right)))`, or margin-based insets on `.modal`.

## Independent verification (2026-08-01) — CLOSED

Verified on `origin/main` 26b5ff5 by a verifier who did not author the fix (fixer was the
2026-07-31 `deltic:auto` run, commit `710e0c0`). **Closed — and, notably, the defect itself is now
confirmed rather than inferred.**

**This bug was filed unconfirmed.** Its own Notes said: *"This has not been observed on hardware
or in an emulated inset run — it is derived from reading `styles.css:249`... Confirm before
fixing."* The fix does exactly that confirmation, and the verifier reproduced it.

**Confirmed on the pre-fix CSS.** Reverting `.modal` to the inset-blind
`width: min(920px, calc(100vw - 24px))` on the worktree and running the document's browser test
under a 59px emulated left inset at 844x390 landscape:

```
AssertionError: left notch: the rules dialog must stay inside the safe viewport, got
  {"dialog":{"left":19,"right":810},"firstTab":{"left":38,...},"close":{...},"innerWidth":844}
```

`dialog.left = 19` against a 59px inset — the dialog's leading edge and its first rules tab
(`left: 38`) both sit **inside the notch**, matching the ~12px prediction the bug derived from
reading the CSS. So the inference was sound and the symptom is real.

**Fixed and green.** `game-of-dracula/styles.css:249` now subtracts both side insets from the
width and re-centres with `transform: translateX(calc((var(--safe-left) - var(--safe-right)) / 2))`.
With it restored, `game-of-dracula/browser.test.mjs` passes: *"Game of Dracula browser checks
passed (game, phone layouts, hit-testing, catalog wiring)."*

**Regression coverage is a real measurement, in both directions.** The fix extends the existing
`Emulation.setSafeAreaInsetsOverride` harness with a landscape dialog check run for a **left**
notch and a **right** notch, asserting the dialog box *and* its first tab and close button all
clear the inset. That guards the asymmetry the `translateX` re-centring introduces.

**Gates:** root `npm test` exit 0 (every suite `# fail 0`) and `npm run build` exit 0.
