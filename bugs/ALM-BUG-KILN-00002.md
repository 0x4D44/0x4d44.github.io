# ALM-BUG-KILN-00002 — Tidecall round/match recap reopens itself and re-fires the win fanfare on dismiss

- **State:** Fixed
- **Priority:** Should
- **Severity:** High
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
- **State history:** Fixed (2026-07-11, fixed by Claude in b2c47f0; awaiting independent verification)

## Observation
Repro over `http://localhost:8000/tidecall/`: start a voyage, play out a round to its
recap modal (or finish the match to reach the match-end modal), then tap the ✕ or click
the scrim outside the modal. Expected: nothing, or a controlled dismissal. Actual: the
modal blinks out and immediately slams back in, replaying its `modal-in` entry animation;
on the match-end modal it also re-fires `sound.play('exact')` and a fresh `celebrate()`
confetti burst on **every** dismissal attempt.

Verified in headless Chrome at 390×844: tagging the `#modal-content` subtree and clicking
`.modal-scrim` showed the tagged node was destroyed and a modal was shown again
(`markedNodeSurvivedScrimClick=false`).

## Notes
Root cause is in the dismissal wiring, not `drive()`. The ✕/scrim (`[data-close-modal]`)
routed to `closeModal(true)` unconditionally; `closeModal`'s resume path runs
`render()` then `drive()`, and `drive()` re-opens the round/match modal because the phase
is still at its boundary (`roundEnd`/`matchEnd`). The "these two recaps are
non-dismissable" rule already existed but only in the Escape handler; the click channels
never got it. A redundant second direct close listener in `bindEvents` also bypassed any
guard on the delegated handler.

Fixed in `b2c47f0`: guard the delegated close so ✕/scrim skip `round`/`match` (matching
Escape), delete the redundant direct listener (the static ✕/scrim already bubble to the
delegated handler), and hide the ✕ for those two modal types. They still advance via
their own buttons.

Regression (no DOM harness — static-site idiom): behavioral before/after in headless
Chrome (the modal-content node now survives a scrim click; before it was destroyed +
reopened), a regression-checked that rules/scores still close via ✕ and scrim, plus a
source-pattern guard in `tidecall/validate-static.test.js` asserting both the round/match
skip and the removed redundant listener. Independent closure still required.
