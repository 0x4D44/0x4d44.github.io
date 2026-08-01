# ALM-BUG-KILN-00035 — The "r" spin shortcut fires while a modal dialog is open, consuming a turn invisibly

- **State:** Closed
- **Priority:** Should
- **Severity:** Medium
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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T164235Z-p58443-n367224000-c1 branch=task/bug-ALM-BUG-KILN-00035-run-fix-20260730T164235Z-p58443-n367224000-c1 code=0e989be43f89619ead16df3928ea160ddfd3a214 gate=manual) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit 0e989be verified; driven-code control: 1 spin pre-fix, 0 with a dialog open now)

## Observation

Two-human pass-and-play game, player A's turn, phase `await-spin`. A opens the in-game
Rules modal (`#rules-open`), then presses `r`.

The keydown bubbles to `document`, all guards pass (`game`, `await-spin`, `!busy`,
`displayedActor().human`), and `handleSpin()` runs invisibly behind the modal, consuming A's
turn. If the outcome ends the turn, `maybeContinue` opens the hand-off gate for player B —
but the gate is painted under the dialog's `::backdrop` and, being outside the dialog
subtree, is inert: `#handoff-ready` cannot be clicked and `dom.handoffReady.focus()`
(`app.js:681`) is refused because focus is confined to the dialog. The table appears frozen
until the player works out that the Rules modal must be dismissed first.

Expected: a game-advancing shortcut should not fire while a modal dialog owns the top layer.

## Notes

The document-level `r` handler at `game-of-dracula/app.js:799` guards only against the
hand-off overlay (`app.js:794`) and not against an open `<dialog>`. `#rules-open` /
`#settings-open` are never disabled, keydown still bubbles to `document` from inside a modal
dialog, and a modal `<dialog>` renders in the top layer while making the rest of the
document inert — including `#handoff-overlay`, which is a body-level `div` at `z-index:200`
(`styles.css:275`), not a dialog.

Found by a review agent during the pre-publication multi-lens review, then **confirmed by a
separate adversarial verifier** which reports reproducing it in real headless Chrome over
CDP against the served files, noting that `openDialog` (`app.js:111-115`) calls
`dialog.showModal()` and that `#rules-modal` / `#settings-modal` are real `<dialog>`
elements (`index.html:215`, `:280`).

Not personally re-reproduced by the raising agent — reproduce before fixing.

Likely correct fix: add an open-dialog check (e.g. `document.querySelector("dialog[open]")`)
to the shortcut guard, alongside a focus check so it does not fire from a text field.
Related: ALM-BUG-KILN-00034 (the resulting softlock) and ALM-BUG-KILN-00036 (the shortcut
has no opt-out at all).

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `0e989be43f89619ead16df3928ea160ddfd3a214` exists, is an ancestor of HEAD, and touches `app.js` (+1), `browser.test.mjs` (+62), `sw.js` — matching the notes.

**Original observation re-checked — resolved.** `app.js:814` adds `if ($("dialog[open]")) return;` after the hand-off branch and before the `r` shortcut, so no document-level shortcut fires while a `<dialog>` holds the top layer. Running the real handler against a pre-fix control:

```
PRE  00035: dialog open + 'r' -> handleSpin calls = 1   (BUG)
NOW  00035: dialog open + 'r' -> handleSpin calls = 0   (fixed, prevented=false so the key stays with the dialog)
NOW  dialog closed + 'r'      -> handleSpin calls = 1, prevented=true
```

**Refutation attempt that held.** `openDialog()` (`app.js:111-115`) makes `dialog[open]` match under both `showModal()` and the `setAttribute("open","")` fallback, so the selector cannot miss. The curse cinematic and spin animation are divs rather than dialogs, and remain covered by the pre-existing `!busy` guard.

**Regression coverage:** `game-of-dracula/browser.test.mjs:572-632` dispatches a real CDP `r` with the Rules dialog open and asserts the event is un-prevented, the dialog stays open, the gate does not appear, spinner state is unchanged, and **the log did not grow** — so a silently-consumed turn would be caught. Run green by the lead.
