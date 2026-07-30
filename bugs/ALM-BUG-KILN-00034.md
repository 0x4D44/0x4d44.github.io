# ALM-BUG-KILN-00034 — Hand-off gate's key trap softlocks a keyboard player when a modal is open

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** game-of-dracula
- **Raised:** 2026-07-30
- **Owner:** deltic:manual
- **Owner role:** fix
- **Owner run:** fix-20260730T114832Z-p37592-n853399000-c1
- **Owner host:** flux
- **Owner branch:** task/bug-ALM-BUG-KILN-00034-run-fix-20260730T114832Z-p37592-n853399000-c1
- **Owner base:** 9a7753bf75661ffed4a6ec5e458458b5cd244bdc
- **Owner fingerprint:** -
- **Owner since:** 2026-07-30T11:48:32Z
- **Owner until:** 2026-07-30T13:48:32Z
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=0, doubt=0, indeterminate=0
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review)

## Observation

Two-human pass-and-play game. Player A presses Spin (`game-of-dracula/app.js:759`) and,
during the ~930 ms spinner animation plus the Dracula walk, presses Rules — `dom.rulesOpen`
has no busy guard (`app.js:757`), so `#rules-modal` opens via `showModal()`. The turn then
resolves and `maybeContinue()` calls `showHandoff()` (`app.js:661`).

`setHandoffOpen(true)` (`app.js:681`) tries to focus `#handoff-ready`, but that element is
outside the open top-layer dialog and therefore inert, so the `focus()` silently fails and
focus stays inside the rules dialog. From then on the document keydown handler sees
`dom.handoff.hidden === false` and:

- `event.preventDefault()`s every Tab (`app.js:795`), so focus cannot move inside the dialog;
- `event.preventDefault()`s Escape (`app.js:796`), which cancels the dialog's close request
  so Escape no longer dismisses it.

The only remaining exit is a pointer click on the ✕ button. A keyboard-only or
switch-access user must reload the page, losing the game.

Expected: the hand-off gate's key trap should not swallow keys belonging to an open
top-layer dialog, and a keyboard user should always retain a way to dismiss whatever is
focused.

## Notes

Found by a review agent during the pre-publication multi-lens review of the Game of
Dracula document, then **confirmed by a separate adversarial verifier** which reports
reproducing the trap end-to-end in real headless Chrome over CDP against the unmodified
served files, asserting each target was neither `disabled` nor inside an `inert` subtree
before clicking. Severity was assessed by that verifier as Medium (originally reported
High).

Not personally re-reproduced by the raising agent — reproduce before fixing.

Likely correct fix: refuse to open the hand-off gate while a modal `<dialog>` is open (or
close the dialog first), and scope the Tab/Escape trap to the case where the gate actually
holds focus rather than trapping document-wide. Related: ALM-BUG-KILN-00035 covers the
`r` shortcut that can drive a turn while a dialog is open, which is one route into this
state.
