# ALM-BUG-KILN-00034 — Hand-off gate's key trap softlocks a keyboard player when a modal is open

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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T164155Z-p55639-n181229000-c1 branch=task/bug-ALM-BUG-KILN-00034-run-fix-20260730T164155Z-p55639-n181229000-c1 code=674dbc60ce55aa649c0fe472e458aba129dd63fb gate=manual)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit 674dbc6 verified present; driven-code control shows the key trap no longer cancels keys a dialog owns)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `674dbc60ce55aa649c0fe472e458aba129dd63fb` exists, is an ancestor of HEAD, and touches `game-of-dracula/app.js` (+2), `browser.test.mjs` (+79) and `sw.js` — matching the notes.

**Original observation re-checked — resolved.** Two guards: `app.js:700` retires any open dialog (`$$("dialog[open]").forEach(closeDialog);`) *before* `setHandoffOpen(true)` in `showHandoff()`, and `app.js:809` short-circuits the hand-off key trap with `if ($("dialog[open]")) return;`. The real `keydown` handler source was extracted from `app.js` and from its pre-fix ancestor (`674dbc6^`) and run in a Node `vm` with stubs:

```
PRE  00034: gate up + dialog open -> Escape prevented=true,  Tab prevented=true,  focus steals=1  (BUG)
NOW  00034: gate up + dialog open -> Escape prevented=false, Tab prevented=false, focus steals=0  (fixed)
```

With no dialog open the trap still works (Escape/Tab prevented, one focus call), so the fix is scoped rather than a blanket removal.

**Refutation attempt that held.** Without `inert` support the topbar Rules button remains covered by `.handoff-overlay` at `z-index:200` (`styles.css:280`), so pointers cannot reach it and Tab is trapped; the only remaining route into the state is programmatic, which the second guard covers.

**Regression coverage:** `game-of-dracula/browser.test.mjs:678-755` — two stages, the real spin/Rules race and a programmatically-opened dialog over the gate. Run green by the lead as part of the repo gate; the driven-code control above is the independent evidence.
