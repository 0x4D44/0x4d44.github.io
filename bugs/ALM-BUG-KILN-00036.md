# ALM-BUG-KILN-00036 — Single-character "r" shortcut cannot be turned off or remapped (WCAG 2.1.4)

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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T171747Z-p35058-n907823000-c1 branch=task/bug-ALM-BUG-KILN-00036-run-fix-20260730T171747Z-p35058-n907823000-c1 code=20d145218d5a23bf939e4423cc2492d2a8b5f6a2 gate=manual)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit 20d1452 verified; shortcut is now switchable off and focus-scoped, satisfying WCAG 2.1.4)

## Observation

`game-of-dracula/app.js:799` binds `event.key.toLowerCase() === "r"` on `document` with only
meta/ctrl excluded — no check for an open dialog, no check that focus is not in a text field,
and no setting to disable it (`#settings-modal` offers sound / hints / fast-AI / contrast
only).

A speech-input user dictating any word containing "r", or a switch/voice user, triggers a
spin they did not ask for. With `#rules-modal` open the spin, its animations and its toasts
all run underneath the backdrop, and a resulting `escape` event calls `showVictory()` which
stacks a second modal on top.

This fails WCAG 2.1.4 Character Key Shortcuts, which requires that a single-character
shortcut can be turned off, remapped, or is active only on focus.

Expected: the shortcut can be disabled or remapped, or is scoped to when the relevant control
has focus.

## Notes

Found by a review agent during the pre-publication multi-lens review, then **confirmed by a
separate adversarial verifier** which reports running a real headless-Chrome CDP probe against
the served files and observing that the handler has no open-dialog check. That verifier
assessed severity as Low.

Not personally re-reproduced by the raising agent — reproduce before fixing.

Distinct from ALM-BUG-KILN-00035: that bug is the missing open-dialog guard (a functional
defect); this one is the absence of any way to disable or remap the key at all (a conformance
defect). A fix that only adds the dialog guard does not resolve this. The cheapest complete
fix is probably a "keyboard shortcuts" toggle in `#settings-modal` plus an
`event.target` / `:focus-within` check.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `20d145218d5a23bf939e4423cc2492d2a8b5f6a2` exists, is an ancestor of HEAD, and touches `app.js` (+10/-5), `browser.test.mjs` (+44), `index.html` (+1), `sw.js` — matching the notes.

**Original observation re-checked — resolved.** `index.html:287` adds the `#setting-keyboard-shortcuts` checkbox; `app.js:48` defaults `keyboardShortcuts: true`, `app.js:141` reflects it, `app.js:781` persists it, and `app.js:815-816` gates the shortcut on `settings.keyboardShortcuts && !editable`, where `editable` excludes `INPUT|TEXTAREA|SELECT` and `isContentEditable`. Driven against a pre-fix control:

```
PRE  00036: shortcuts off + 'r'    -> handleSpin calls = 1   (BUG)
PRE  00036: focus in <input> + 'r' -> handleSpin calls = 1   (BUG)
NOW  00036: shortcuts off + 'r'    -> handleSpin calls = 0   (fixed, key left un-prevented)
NOW  00036: focus in <input> + 'r' -> handleSpin calls = 0   (fixed)
```

**Conformance check.** WCAG 2.1.4 requires *one* of turn-off / remap / focus-scope; turn-off is provided (and focus-scope as well), so remap is not required and a default-on shortcut is conformant. The settings migration was checked: `Object.assign({… keyboardShortcuts: true …}, loadJSON(SETTINGS_KEY, {}))` at `app.js:48` gives an older saved blob the default rather than `undefined`, so no crash and no silently-disabled shortcut.

**Regression coverage:** `game-of-dracula/browser.test.mjs:634-676` flips the toggle, dispatches a real `r`, asserts no spin and no log growth, asserts `localStorage` persistence, then reloads and asserts the checkbox is still unchecked. Run green by the lead.
