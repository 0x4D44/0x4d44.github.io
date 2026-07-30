# ALM-BUG-KILN-00041 — The action panel is a live region rebuilt several times per turn, so screen readers re-read it

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
- **State history:** Open (2026-07-30, raised by Claude from the pre-publication adversarial review) -> Fixed (2026-07-30, deltic:auto role=fix run=fix-20260730T172737Z-p84569-n992774000-c1 branch=task/bug-ALM-BUG-KILN-00041-run-fix-20260730T172737Z-p84569-n992774000-c1 code=d411a35b24ba0e70c688b2babbe81a762e4bf33e gate=manual)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — fix commit d411a35 verified; live region no longer wraps the controls and the dedupe collapses 3-5 renders into one announcement)

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

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit `d411a35b24ba0e70c688b2babbe81a762e4bf33e` exists, is an ancestor of HEAD, and touches `app.js` (+4/-1), `browser.test.mjs` (+51), `index.html` (+3/-1), `sw.js` — matching the notes.

**Original observation re-checked — resolved at the markup and logic level.** `index.html:197-198` removes `aria-live` from `<section class="action-shell">` and adds a dedicated `<p class="sr-only" id="action-status" role="status" aria-live="polite" aria-atomic="true">` as its first child. `app.js:506-507` writes a concise string only on change:

```js
const announcement = `${player.name}. ${dom.actionKicker.textContent}. ${dom.actionTitle.textContent}.`;
if (dom.actionStatus.textContent !== announcement) dom.actionStatus.textContent = announcement;
```

The live region no longer contains `#primary-action`, `#destination-list` or `#resolve-for-me`, and the dedupe collapses the 3-5 renders of one state into a single mutation.

**Specificity trap checked.** `#action-status` is a direct `<p>` child of `.action-shell`, so `.action-shell > p:not(.eyebrow)` at `styles.css:233` does apply colour and font-size to it — but every `.sr-only` declaration at `styles.css:31` carries `!important`, so the element stays visually hidden. The added rule is not defeated.

**Limit of this verification:** the lived screen-reader experience was not tested — the bug itself asks for an assistive-technology pass, and none has been done.

**Regression coverage:** `game-of-dracula/browser.test.mjs:390-438` asserts `.action-shell` has no `aria-live`, that `#action-status` carries `aria-live="polite"`/`aria-atomic="true"`, that no control's `closest("[aria-live]")` is non-null, then observes `#action-status` across a full privacy hand-off and asserts exactly **one** announcement. It would catch both the wrapper regressing and the dedupe being dropped. Run green by the lead.

**Residuals noted, not separately tracked.** (1) `displayedActor()` (`app.js:443-447`) returns the current player, so at `app.js:558` the announcement flips to the incoming player's prompt *before* `showHandoff()` opens the gate; on gate close `maybeContinue`'s `renderAll()` (`app.js:677`) recomputes the identical string and the dedupe suppresses it, so the arriving player may get no announcement and must read the focused `#command-panel`. The browser test codifies that as intended. (2) The render churn the Notes flagged as separate debt is untouched: `renderAll()` still runs 4× per spin (`app.js:552`, `:558`, `:664`, `:677`). `#outcome-card` (`index.html:191`) keeps its `aria-live`, but `updateOutcome()` runs once per spin, so it is not a churn source.
