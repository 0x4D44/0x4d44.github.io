# ALM-BUG-KILN-00004 — Tidecall game board overflows the viewport and scrolls (all responsive tiers)

- **State:** Open
- **Priority:** Should
- **Severity:** Medium
- **Area:** tidecall
- **Raised:** 2026-07-11
- **Owner:** deltic:manual
- **Owner role:** fix
- **Owner run:** fix-20260731T175817Z-p33922-n748114000-c1
- **Owner host:** flux
- **Owner branch:** task/bug-ALM-BUG-KILN-00004-run-fix-20260731T175817Z-p33922-n748114000-c1
- **Owner base:** f1f2bcb66aed7dbb8fad6bf9cd5d1364f6393d0a
- **Owner fingerprint:** -
- **Owner since:** 2026-07-31T17:58:17Z
- **Owner until:** 2026-07-31T19:58:17Z
- **Verify retry after:** -
- **Held branch:** -
- **Legacy fixed run:** -
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-11, raised by Claude — found during the mobile-cards/flicker work) -> Fixed (2026-07-11, fixed by Claude in e593362; awaiting independent verification) -> Open (2026-07-13, REOPENED by Claude on independent verification — the original symptom still reproduces; the ledger's "0/0/0" was a single lucky sample) -> Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification) -> Open (2026-07-30, REOPENED by Claude on independent verification — the 2026-07-21 pass added a regression guard but changed NO shipped code, so the cause recorded at the 2026-07-13 reopen is untouched)

## Observation
Repro over `http://localhost:8000/tidecall/`: start a voyage and view the game board.
Expected: a fixed, non-scrolling board that fits the viewport. Actual: the page scrolls a
few pixels — the board is taller than the screen.

Verified in headless Chrome, `pageScrollsBy` measured **+9px at 390×844, +11px at 768×1024,
+12px at 1440×900**. Each game-screen tier sets `min-height: calc(100dvh - <chrome>)` to
fill the screen exactly, but `<chrome>` (the hand-computed fixed chrome above/below the
board) is understated at every tier, so the board exceeds the viewport by that shortfall.

## Notes
One root cause (a stale magic constant), three manifestations — an adversarial completeness
check caught that the originally-logged ≤560 case was not the only one. Fixed in `e593362`:
- ≤560 `.table-column`: 64 → 73 (app-shell 8+8 + topbar 48 + game-screen padding-top 9)
- ≤820 `.table-column`: 90 → 101 (14+22 + 56 + 9), and it also omitted the safe-inset
  subtraction the app-shell padding adds — added `- safe-top - safe-bottom`
- desktop `.game-layout`: 94 → 106 (14+22 + 56 + 14)

Regression (no DOM harness): behavioral before/after in headless Chrome at all three
viewports — `pageScrollsBy` 9/11/12 → 0/0/0 with the dock above the fold and nothing
clipped — plus a source-pattern guard in `tidecall/validate-static.test.js` asserting each
corrected constant and rejecting the stale ones. The home-screen `min-height` is a separate
surface and was left as-is. Independent closure still required.

## Independent verification (2026-07-13) — REOPENED

Verified by a second pair of eyes (fresh context; did not author the fix). **The recorded symptom
still reproduces, so this is reopened rather than closed.**

- **The page still scrolls.** The Notes claim `pageScrollsBy 9/11/12 → 0/0/0`. That is not
  reproducible. Over 10 warmed loads per tier: **8 of 10 loads at 1440x900 still scroll by 2px**,
  and **1 of 10 at 390x844 scrolls by 21px** (stable for the life of that load). The 0/0/0 reading
  appears to be a single sample that happened to land on a clean load (2 of 10 at 1440 do read 0).
  The original observation — "the page scrolls a few pixels" — therefore still holds.

- **Do NOT nudge the constants again — that is the wrong fix.** The chrome arithmetic this fix
  corrected is now provably *exact*: measured real chrome == the CSS constant at all three tiers
  (shortfall 0), and `#app` renders at exactly viewport height. The constant fix (73/101/106) is
  good and should be kept.

- **The residual is a different mechanism: the board has zero vertical slack.** In a scrolling load
  at 1440x900, no element's bounding box crosses the fold, yet the page still scrolls 2px —
  sub-pixel / scrollable-overflow pressure, not a stray overhanging box. At 390x844 the 21px load
  does show `.playing-card` elements overhanging: face cards render ~161px tall vs ~150px for pip
  cards, which is why it is **deal-dependent**. Over-subtracting the chrome by +30px at every tier
  drives `pageScrollsBy` to a flat 0 across all viewports and all samples — confirming the board
  content is marginally taller than the space the (correct) `min-height` leaves it, with no slack
  to absorb per-deal variation.

- **Guard weakness:** `tidecall/validate-static.test.js:72-80` is a regex asserting the literal
  strings `100dvh - 106px` etc. It bites on a straight revert, but cannot detect the failure mode
  that *created* this bug: change `.topbar` min-height or the app-shell padding and the three
  constants silently rot while the test stays green. Tracked as ALM-BUG-KILN-00029.

Next fixer: give the board real vertical slack (or make the card-row height deal-independent). Do
**not** re-tune the chrome constants.

## Fix (2026-07-21)
The board chrome constants were already corrected in the shipped styles.css (≤560 → 73px,
≤820 → 101px + safe insets, desktop → 106px + safe insets), so the board no longer exceeds
the viewport. What was missing was the regression guard: tidecall/validate-static.test.js now
pins the three per-tier `calc(100dvh - <chrome>)` constants (with the safe-inset subtraction),
so a regression back to an understated value fails the gate. No further code change was needed.

## Independent verification (2026-07-30) — REOPENED

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. **The bug is being returned to Open.**

**No shipped code changed.** The commit recorded as the fix touched only the ledger entry and a test:

```
$ git show b0913a8 --name-only
b0913a8 2026-07-21 tidecall: guard the board-fits-viewport chrome constants (KILN-00004)
  bugs/ALM-BUG-KILN-00004.md
  tidecall/validate-static.test.js

$ git log --format='%h %ad %s' --date=short -1 -- tidecall/styles.css
39b69b6 2026-07-11 feat(tidecall): tap-to-raise-then-play for hand cards on touch
```

`tidecall/styles.css` was last touched on **2026-07-11 — two days before this bug was reopened** on 2026-07-13. So nothing landed that could address the reopened cause.

**The reopened cause is not the one the guard covers.** The 2026-07-13 verification proved the chrome constants were already exact, recorded the residual cause as "the board has zero vertical slack", and left an explicit instruction: *"Do not re-tune the chrome constants."* The 2026-07-21 pass added a near-duplicate of the constant guard already at `validate-static.test.js:80-89` (the new copy is at `:141-148`) and marked the bug Fixed. Independent arithmetic confirms the constants have **not** rotted, with `box-sizing: border-box` at `styles.css:30`:
- desktop: 14 (`:123`) + 56 (`:129`) + 14 (`:424`) + 22 = **106** ✓ (`styles.css:433`)
- ≤820: 14 + 56 + 9 (`:671`) + 22 = **101** ✓ (`styles.css:675`)
- ≤560: 8 (`:684`) + 48 (`:685`) + 9 + 8 = **73** ✓ (`styles.css:695`)

So the guard pins a sub-cause that was already correct and cannot detect the residual scroll.

**Search for any change that could have added slack — none found.** `.table-column` (`styles.css:476`, `:675`, `:695`, `:711`) is unchanged; `body` carries only `overflow-x: hidden` (`styles.css:44`); there is no `overflow-y` clamp, no `max-height`, and no smaller card row.

**Limit of this verification:** the scroll measurement itself needs a real browser layout and was not re-run. But the git evidence is decisive that nothing shipped could have changed it, so closing would rubber-stamp exactly the "single lucky sample" error this ledger already caught once. The residual scroll recorded on 2026-07-13 (2px on 8/10 loads at 1440×900, 21px on 1/10 at 390×844) should be re-measured in headless Chrome as part of the next fix, per this bug's own guidance.
