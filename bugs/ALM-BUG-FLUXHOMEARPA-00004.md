# ALM-BUG-FLUXHOMEARPA-00004 — Nihon Quest review empty state is gated by the active-card condition

- **State:** Closed
- **Priority:** Should
- **Severity:** Medium
- **Area:** japanese-travel-rpg
- **Raised:** 2026-07-03
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
- **Attempts:** fix=1, doubt=0, indeterminate=0
- **State history:** Open (2026-07-03, raised by Codex overnight code-review pass)
- **State history:** Fixed (2026-07-21, fixed by Claude on branch claude/bugs-queue-2q-drain-0sv3oa; awaiting independent verification)
- **State history:** Closed (2026-07-30, independently verified and closed by Claude (verifier, not the fixer), on origin/main 46c1859 — empty state now gates on revEmpty, the exact complement of revHasCard)

## Observation
The review card panel is guarded by `revHasCard` in `japanese-travel-rpg/index.html:112`. The "All caught up!" empty state is also guarded by `revHasCard` in `japanese-travel-rpg/index.html:136`. `revHasCard` is set to `!!card` at `japanese-travel-rpg/index.html:805`.

Expected: the empty state should render only when no due review card exists.

Actual: the empty state renders when a due card exists and is hidden when no due card exists.

## Notes
Concrete fix: add an inverse render value such as `revEmpty: !card`, or change the empty-state guard to the DC-template equivalent of `!revHasCard`. Add self-check coverage for the template binding so the state cannot invert again.

## Fix (2026-07-21)
The review "All caught up!" (済) empty state gated on `revHasCard`, the same flag as the
active-card panel, so it rendered when a card was due and hid when the queue was empty.
The view now computes `v.revEmpty=!card` (false while not ready), and the empty-state
`<sc-if>` binds `{{ revEmpty }}`. Regression: a static guard in tests/self-check.mjs asserts
the view sets `revEmpty=!card` and the 済 empty-state sc-if binds `revEmpty` (not
revHasCard); fails if reverted.

## Independent verification (2026-07-30)

Verified on `origin/main` 46c1859 by a verifier who did not author the fix. Fix commit: `eb990bd`.

**Original observation re-checked — resolved.** `index.html:810` now sets `v.revHasCard=!!card; v.revEmpty=!card;` and `index.html:824` sets both false before load; the empty-state template at `index.html:140` binds `{{ revEmpty }}` and is a sibling of — not nested inside — the active-card panel at `index.html:116`. The two flags are exact complements while `ready`, so no reachable state renders both panels or neither, and there is no flash of "All caught up!" during load. The diff of `eb990bd` shows the genuine inversion being corrected. Guard `tests/self-check.mjs:27-37` mutation-tested: re-binding the empty state to `revHasCard` fires *"the empty-state must gate on revEmpty, not revHasCard"*.

**Limit of this verification:** the Design-Canvas `<sc-if>` template was not rendered in a browser, so "the banner visibly appears and disappears" rests on the flag logic and the template nesting, both read directly.
