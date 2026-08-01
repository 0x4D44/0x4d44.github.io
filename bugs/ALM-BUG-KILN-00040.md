# ALM-BUG-KILN-00040 — A long single-word player name overflows the turn card and hand-off gate

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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T172238Z-p63110-n880926000-c1 branch=task/bug-ALM-BUG-KILN-00040-run-fix-20260730T172238Z-p63110-n880926000-c1 code=7b469c9f0310ac5621c56f6e9d78cd0170214ff9 gate=manual) -> Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit 7b469c9 verified; grid track and overflow-wrap fixed at the right layer, no later rule overrides)

## Observation

The seat name input allows 28 characters (`maxlength="28"`, `game-of-dracula/app.js:193`).
Enter a 28-character name with no spaces, then start a game on a 360px-wide viewport.

`.turn-card { grid-template-columns: 60px 1fr }` gives the second track a min-content floor
equal to that unbreakable word, with no `min-width: 0` and no `overflow-wrap`. `#turn-name` at
17px bold measures roughly 300px against roughly 270px of available panel width, so the grid
pushes past the card's rounded border and the text is silently clipped by
`body { overflow-x: hidden }` (`styles.css:32`) — the player cannot read whose turn it is.

The same name overflows `#handoff-title` (30px Georgia inside
`.handoff-card { width: min(480px,100%); padding: 30px }`) and `#victory-title` (36px) the same
way. Only `.chip-copy b` has ellipsis protection.

Expected: a long name wraps, breaks, or ellipsises inside its card rather than escaping it.

## Notes

Found by a review agent during the pre-publication multi-lens review, then **confirmed by a
separate adversarial verifier** which reports driving real headless Chrome over CDP against the
served files. That verifier confirmed the substance but flagged that **the reported anchor line
(`styles.css:196`) and the stated magnitude are both wrong** — so re-derive the exact selector
and measurements when fixing rather than trusting the numbers above.

Not personally re-reproduced by the raising agent — reproduce before fixing.

Likely correct fix: `min-width: 0` on the flexible grid track plus `overflow-wrap: anywhere`
(or `text-overflow: ellipsis`) on `#turn-name`, `#handoff-title` and `#victory-title`. Reducing
`maxlength` would mask rather than fix it, since 28 characters is a reasonable name length.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `7b469c9f0310ac5621c56f6e9d78cd0170214ff9` exists, is an ancestor of HEAD, and touches `styles.css` (+4/-2), `browser.test.mjs` (+63), `sw.js` — matching the notes.

**Original observation re-checked — resolved, and fixed at the right layer** (the grid track and the text, not `maxlength`). `styles.css:200` changes the `.turn-card` track from `60px 1fr` to `60px minmax(0,1fr)`; `styles.css:201` adds `min-width: 0` to `.turn-card > div:last-child`; `styles.css:281` adds `min-width: 0` to `.handoff-card`; `styles.css:282` adds `overflow-wrap: anywhere` to `#turn-name, #handoff-title, #victory-title`.

**Specificity checked — the fix is not defeated.** `.turn-card > div:last-child` matches the wrapper at `index.html:167-171` (the second and last child of `#turn-card`). The ID-selector rule at `styles.css:282` (specificity 1-0-0) is never overridden: the only later rules touching these elements are `.turn-card h2 { font-size: 17px }` (`styles.css:301`) and `.victory-shell h2` (`:277`), neither of which sets `overflow-wrap` or `white-space`.

**Refutation attempt that held.** Searched for a fourth overflow site: `.chip-copy b/small` already ellipsise (`styles.css:193`); `.night-log li` is 9px, so 28 characters is ~140px inside a ~330px panel; `.toast` wraps at the space after the name; `#victory-copy` carries `endReason` (`engine.js:696`) inside `.victory-shell { overflow: hidden }` (`styles.css:277`), so the worst case clips rather than escapes. Nothing material.

**Regression coverage:** `game-of-dracula/browser.test.mjs:440-502` types `"W".repeat(28)` into every seat at 360×640 and, for `#handoff-title`, `#turn-name` and `#victory-title`, asserts the element's rect is inside its card, the card is inside the viewport, and `scrollWidth <= clientWidth + 1` — that last assertion proving the text genuinely wraps rather than being invisibly clipped. Run green by the lead; the geometric proof rests on that run.
