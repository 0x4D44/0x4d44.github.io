# ALM-BUG-KILN-00041 — The action panel is a live region rebuilt several times per turn, so screen readers re-read it

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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T172737Z-p84569-n992774000-c1 branch=task/bug-ALM-BUG-KILN-00041-run-fix-20260730T172737Z-p84569-n992774000-c1 code=d411a35b24ba0e70c688b2babbe81a762e4bf33e gate=manual)

## Observation

`game-of-dracula/index.html:197` puts `aria-live="polite"` on the `.action-shell` section,
which contains `#action-kicker`, `#action-title`, `#action-copy`, `#primary-action`,
`#destination-list` and `#resolve-for-me` — that is, a live region wrapping the interactive
move controls.

`renderControls()` rewrites the kicker / title / copy strings and replaces `#destination-list`'s
children (`app.js:462-483`) on every call, and a single spin calls `renderAll()` at
`app.js:547`, `:551`, `:564` and again from `maybeContinue()` at `:651` and `:664`.

A screen-reader user hears the entire block — heading, prose, and every numbered destination —
re-read three to five times per turn, including during automaton turns, and the announcements
interleave with the destination buttons being destroyed and recreated underneath them.

Expected: one concise announcement per meaningful state change, and the live region should not
wrap the interactive controls themselves.

## Notes

Found by a review agent during the pre-publication multi-lens review, then **confirmed by a
separate adversarial verifier** which reports every mechanical fact as checking out in the
actual code.

Not personally verified with a screen reader by the raising agent — verify with a real
assistive-technology pass before and after fixing.

Likely correct fix: move `aria-live="polite"` off `.action-shell` onto a small dedicated status
element that holds only the turn prompt (kicker / title / copy), leaving the buttons outside the
live region. That also helps the related render-churn problem: `renderAll()` being called three
to five times for one state change is worth reducing regardless (see the 2026-07-11
`lessons_learnt.md` entry on reconciling rather than rebuilding — a reviewer separately noted the
same churn kills the CSS transitions declared for `.player-piece` / `.menace-piece`, which was
assessed as cosmetic and is not filed separately).
