# ALM-BUG-KILN-00037 — Abandoning a game mid-animation crashes on a null `game` in playEvents

- **State:** Open
- **Priority:** Should
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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review)

## Observation

Two-human game. A human spins a red sector that lands Dracula in an occupied room (a
`dracula-bite` event). While the ~930 ms spinner sleep plus the Dracula walk animation is
still running (`busy === true`), the player clicks the top-left brand button, then OK on the
confirm.

`returnToSetup(false)` nulls `game`, resets `busy`, and swaps back to the setup screen. The
suspended `handleSpin` then resumes into `playEvents`, hits the `dracula-bite` branch and
evaluates `game.state.players[event.playerId].name` on `null` — uncaught TypeError. The rest
of the resolution (remaining events, the curse cinematic / victory dialog) is silently skipped
and an unhandled rejection is logged.

The same crash occurs via Settings → "Abandon this night" mid-animation, and via
abandon-then-start-a-smaller-game, where `event.playerId` (e.g. 3) indexes past the new
2-player array.

Expected: abandoning a game mid-resolution unwinds cleanly with no console error.

## Notes

`playEvents()` and its helpers dereference the module-level `game` after awaiting animations,
but `returnToSetup()` (`game-of-dracula/app.js:726`) sets `game = null` and is reachable from
two controls that are never disabled while `busy` is true — `#brand-button` (`app.js:758`) and
Settings → `#abandon-game` (`app.js:768`). The same unguarded dereference exists at
`app.js:614` (blue-bite toast), `app.js:627` / `:630` (`showCurse`) and `app.js:638`
(`showVictory`). Only `renderAll` (`app.js:347`) and `maybeContinue` (`app.js:650`) carry
`if (!game)` guards.

Found by a review agent during the pre-publication multi-lens review, then **confirmed by a
separate adversarial verifier** which reports reproducing it in a real browser, while
downgrading severity to Low because the user-visible impact is smaller than first claimed
(the player has already chosen to abandon, so the skipped resolution is largely moot — the
console error and unhandled rejection are the real residue).

Not personally re-reproduced by the raising agent — reproduce before fixing.

Likely correct fix: either disable the abandon routes while `busy`, or add the same
`if (!game) return` guard the two other resume points already use, applied at every post-await
dereference rather than only the crashing one.
