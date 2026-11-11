# ALM-BUG-FLU-00017 — kings-cross: Class 180 rake side-window test went blind after round 6 moved the window

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-src/web/tests
- **Raised:** 2026-11-11T06:58:35Z
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
- **State history:** Open (2026-11-11T06:58:35Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

The test `kings-cross-src/web/tests/train-rake.test.ts` "Class 180 rake: whatever the rake's reach, the cab side windows are set back with the nose they lie on" no longer checks what its name says. It passes even when `sideWindow`'s set-back is removed (`kings-cross-src/web/src/train.ts:1612`, `tip + s + setBack(s, y)` changed to `tip + s`).

Observed, 2026-11-11, round-6 trainweb mutation run, slice 20: the mutant "rake: the cab side windows are not set back" survived. A probe ran on a scratch copy at a97b9a44:
- Shipped output is unaffected: all 11 kinds digest identically with the mutant. Only the 180 has a rake; its reach is 1.6 m, and its side window lies past it.
- The test lengthens the 180's rake reach to 3 m (line 195, `longer.reach = 3;`), then asks every side-window vertex to be within 20 mm of the unraked place plus the set-back.
- The maximum set-back of the side window, by lengthened reach: 3 m 1.70 mm; 3.5 m 26 mm; 4 m 63 mm; 4.5 m 104 mm; 5 m 143 mm.
- With the real test file in the scratch copy: at reach 3 m the mutant is green (the survivor). At 3.5, 4, 4.5 and 5 m the unmodified code is green and the mutant red.

Cause (from the history): the test was written in round 5 (10cce328), when the 180's side window lay 1.7–2.85 m back, so a 3 m reach set it back by up to about 11 cm. Commit 7abcdea8 (round 6) moved the window to 2.86–3.19 m back (train.ts:902) and did not update the test. The set-back fell to 1.7 mm, under the 20 mm tolerance. The comment at test lines 188–189 ("...has gone before its side windows begin (1.7 m back)") is stale.

Fix: raise the test's lengthened reach from 3 to about 4.5 m (104 mm, five times the tolerance), and refresh the comment. Prove it by reverting the set-back once: the test must fail. Better still, derive the reach from the window's position, so a future window move can't blind it again.

Evidence fingerprint: `manual:v1:kings-cross-class-180-rake-side-window-test-wen-2d5113d266dbff1e`


## Fix

<unfixed — raised only>

## Notes
