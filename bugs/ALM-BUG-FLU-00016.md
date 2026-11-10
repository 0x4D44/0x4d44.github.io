# ALM-BUG-FLU-00016 — kings-cross mutation-harness test 'leader finishes by itself' flakes under load: helper pid alive

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-tools
- **Raised:** 2026-11-10T17:30:33Z
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
- **State history:** Open (2026-11-10T17:30:33Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

kings-cross-src/tools/tests/mutation-harness.test.mjs:336, "a tree whose leader finishes by itself does not leave its helpers behind", fails intermittently under the full suite on a loaded machine, and passes when its file runs alone.

Observed, 2026-11-10:
- The 170/158 worker ran the full suite twice through the lead's niced runner (nice 19, --test-concurrency=2), on a branch that touches only train-scotrail-dmu.ts and its test. Both runs gave 2,935 tests, 2,934 pass, with the same single failure: one helper pid was still alive when the assertion checked.
- The same file run alone passed 13 of 13.
- Earlier today the lead saw the same test flake on other lanes. Several lead lanes in the same window ran the full suite green, so it is intermittent.
- FLUX is a shared host, with load averages of 25–45 on 18 CPUs during the day.

Inference, not yet shown: the test checks that the helpers are gone at a fixed point after the leader exits. Under load, or at nice 19, the reaping happens later than the check allows, so the test fails without any defect in the harness.

Fix: make the check wait on the helpers' exit, bounded by a timeout that fails clearly. Don't widen it until it passes. Or show that the harness really leaves helpers alive under load, and fix the reaping. Either way, prove it by running the file under synthetic CPU load until it fails on the old code and passes on the new.

Evidence fingerprint: `manual:v1:kings-cross-mutation-harness-test-leader-finish-9147df79b883df15`


## Fix

<unfixed — raised only>

## Notes
