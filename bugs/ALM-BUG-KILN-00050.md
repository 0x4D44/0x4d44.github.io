# ALM-BUG-KILN-00050 — Game of Dracula modal shell ignores safe-area left/right insets in landscape

- **State:** Fixed
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
- **State history:** Open (2026-07-30, raised via `deltic bugs new` model=claude-opus-5) -> Fixed (2026-07-31, deltic:auto role=fix run=fix-20260730T233919Z-p31498-n321410000-c1 branch=task/bug-ALM-BUG-KILN-00050-run-fix-20260730T233919Z-p31498-n321410000-c1 code=710e0c000238e8bd1b83b0cdc83cd4dea292708d gate=manual)

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
