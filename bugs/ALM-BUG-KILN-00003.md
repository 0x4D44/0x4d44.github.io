# ALM-BUG-KILN-00003 — Tidecall overlapping confetti bursts erase each other

- **State:** Fixed
- **Priority:** Could
- **Severity:** Low
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
- **State history:** Fixed (2026-07-11, fixed by Claude in 5edc9ec; awaiting independent verification)

## Observation
When two confetti celebrations overlap — an exact final trick fires `celebrate(90)` and,
moments later (clicking quickly through the round recap into the match win),
`celebrate(150)` fires while the first is still animating — the earlier burst is silently
erased and the shared canvas flashes. `celebrate()` draws one shared `#celebration-canvas`
and keeps no handle to its `requestAnimationFrame` loop, so each call starts an independent
loop whose first act each frame is a full `clearRect`. rAF callbacks composite once per
frame in fixed order, so the later loop's clear wipes the earlier burst before it paints;
a zombie loop also keeps running, and the `canvas.width=` reset on the second call flashes
the bitmap.

(Not the "strobe / half-density" it first looked like — an adversarial check corrected
that: the surface composites once per frame, so the earlier burst is suppressed entirely
rather than flickering.)

## Notes
Root cause: no single owner of the shared canvas. Fixed in `5edc9ec` by hoisting one
module-scoped rAF handle, cancelling any live loop at the top of `celebrate()`, tracking
the id through the loop, and clearing it on natural completion. A new burst now cleanly
supersedes the old one — one full-density celebration.

Regression: a behavioral repro of the canvas timing is impractical (as recorded in the
journal), so coverage is a source-pattern guard in `tidecall/validate-static.test.js`
asserting `celebrate` cancels the live loop, plus a smoke-exercise via the round-play
driver. Independent closure still required.
