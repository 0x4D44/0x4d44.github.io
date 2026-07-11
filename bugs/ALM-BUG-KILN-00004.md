# ALM-BUG-KILN-00004 — Tidecall game board overflows the viewport and scrolls (all responsive tiers)

- **State:** Fixed
- **Priority:** Should
- **Severity:** Medium
- **Area:** tidecall
- **Raised:** 2026-07-11
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
- **State history:** Open (2026-07-11, raised by Claude — found during the mobile-cards/flicker work)
- **State history:** Fixed (2026-07-11, fixed by Claude in e593362; awaiting independent verification)

## Observation
Repro over `http://localhost:8000/tidecall/`: start a voyage and view the game board.
Expected: a fixed, non-scrolling board that fits the viewport. Actual: the page scrolls a
few pixels — the board is taller than the screen.

Verified in headless Chrome, `pageScrollsBy` measured **+9px at 390×844, +11px at 768×1024,
+12px at 1440×900**. Each game-screen tier sets `min-height: calc(100dvh - <chrome>)` to
fill the screen exactly, but `<chrome>` (the hand-computed fixed chrome above/below the
board) is understated at every tier, so the board exceeds the viewport by that shortfall.

## Notes
One root cause (a stale magic constant), three manifestations — an adversarial completeness
check caught that the originally-logged ≤560 case was not the only one. Fixed in `e593362`:
- ≤560 `.table-column`: 64 → 73 (app-shell 8+8 + topbar 48 + game-screen padding-top 9)
- ≤820 `.table-column`: 90 → 101 (14+22 + 56 + 9), and it also omitted the safe-inset
  subtraction the app-shell padding adds — added `- safe-top - safe-bottom`
- desktop `.game-layout`: 94 → 106 (14+22 + 56 + 14)

Regression (no DOM harness): behavioral before/after in headless Chrome at all three
viewports — `pageScrollsBy` 9/11/12 → 0/0/0 with the dock above the fold and nothing
clipped — plus a source-pattern guard in `tidecall/validate-static.test.js` asserting each
corrected constant and rejecting the stale ones. The home-screen `min-height` is a separate
surface and was left as-is. Independent closure still required.
