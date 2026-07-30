# ALM-BUG-KILN-00037 — Abandoning a game mid-animation crashes on a null `game` in playEvents

- **State:** Closed
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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T165343Z-p57295-n449158000-c1 branch=task/bug-ALM-BUG-KILN-00037-run-fix-20260730T165343Z-p57295-n449158000-c1 code=0941558f66bf828ad4d1c82a5e2cc8b495821b8d gate=manual)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit 0941558 verified; five abandon-mid-animation scenarios reproduced pre-fix, all clean now)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `0941558f66bf828ad4d1c82a5e2cc8b495821b8d` exists, is an ancestor of HEAD, and touches `app.js` (+20/-6), `browser.test.mjs` (+68), `sw.js` — matching the notes.

**Original observation re-checked — resolved, and the fix is stronger than the one proposed.** Rather than a `!game` null check, it uses an identity sentinel: `const activeGame = game` captured at `app.js:538` (`handleSpin`), `:564` (`handleMove`) and `:580` (`handleVictim`), with `if (game !== activeGame) return;` after every await (`app.js:551`, `:555`, `:557`, `:571`, `:573`, `:584`), at the top of each `playEvents` iteration (`app.js:623`), and around the deferred `showVictory()` (`app.js:629`). That also catches abandon-then-restart, which a null check would not.

The null-`game` path was constructed directly against the real `playEvents` source, flipping `game` mid-await. Five scenarios, all **NO THROW**: `[vampire-flight, dracula-bite pid=3]`→null; `[first-bite, curse-pass]`→null; `[vampire-flight, escape]`→null (and `showVictory` calls = 0); `[vampire-flight, dracula-bite pid=3]`→a new **2-player** game (the out-of-range-index route from the observation); `[first-bite, dracula-bite pid=3]`→null. The identical harness on the pre-fix source threw:

```
PRE 00037: abandon mid-animation -> THREW TypeError: Cannot read properties of null (reading 'state')  (BUG REPRODUCED)
NOW 00037: abandon mid-animation -> NO THROW  (fixed)
```

**Refutation attempt that held.** Each `playEvents` branch tests a distinct `event.type`, so only one runs per iteration and every `game.` read happens synchronously after the `:623` guard; `showCurse` reads `game` at `:640/643` before its first await; `renderAll` (`:348`), `saveGame` (`:150`) and `maybeContinue` (`:663`) carry their own `!game` guards. No gap found.

**Regression coverage:** `game-of-dracula/browser.test.mjs:504-570` abandons mid-animation, starts a 2-player game, and asserts the replacement survives with no `pageErrors`. Run green by the lead.
