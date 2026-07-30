# ALM-BUG-KILN-00040 — A long single-word player name overflows the turn card and hand-off gate

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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T172238Z-p63110-n880926000-c1 branch=task/bug-ALM-BUG-KILN-00040-run-fix-20260730T172238Z-p63110-n880926000-c1 code=7b469c9f0310ac5621c56f6e9d78cd0170214ff9 gate=manual)

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
