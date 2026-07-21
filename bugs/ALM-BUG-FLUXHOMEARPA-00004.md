# ALM-BUG-FLUXHOMEARPA-00004 — Nihon Quest review empty state is gated by the active-card condition

- **State:** Fixed
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
