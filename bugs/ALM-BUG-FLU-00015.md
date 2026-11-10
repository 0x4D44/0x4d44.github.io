# ALM-BUG-FLU-00015 — kings-cross Hull 802 model: the lead car's band and its 4+2 window layout sit on different cars

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-trains
- **Raised:** 2026-11-10T15:52:53Z
- **Discovery source:** Agent
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
- **State history:** Open (2026-11-10T15:52:53Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

The Hull Trains (hull5, Class 802 304) model puts the lead car's band on a different car from the lead car's window layout. Both come from the same photograph (hull-802-paragon-2025), so the two disagree with it.

In that photograph the near car carries a "First Class 1" sign, 4 windows + 2 blank bays, and the cyan -> green -> violet band.

- Commit db4aeeaf (on main) gives that car's 4 + 2 window layout to car 4.
- Commit a97b9a44 (on main as c9681e51) labels the same photographed car "car 0 (DPTS)" and gives its band to car 0, which has 6 windows.

So the car wearing the cyan-green-violet band has the wrong windows, and the car with the right windows wears a different band.

No test ties a car's band to its role, so the suite does not catch it.

Evidence: the round-6 scorer's report, kept in the lead's scratch as train-rubric/scores/train-round-6-score.md. The worker's crop paragon-lead.png shows the conflict.

Fix: decide from the photograph which end car the near car is (the first-class driving car). Put its band and window layout on the same car index, and add a test that ties each car's band reading to that car's role and plan.

Evidence fingerprint: `manual:v1:kings-cross-hull-802-model-the-lead-car-s-band--85f25d207c5b345f`


## Fix

<unfixed — raised only>

## Notes
