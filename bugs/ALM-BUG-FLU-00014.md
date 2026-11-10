# ALM-BUG-FLU-00014 — kings-cross live.py: two palette-copy mutants never run, their anchor is gone from trains-live.ts

- **State:** Open
- **Priority:** Should
- **Severity:** Low
- **Area:** kings-cross-src/tools/mutation
- **Raised:** 2026-11-10T11:05:47Z
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
- **State history:** Open (2026-11-10T11:05:47Z, raised via `deltic bugs new --land` model=claude-opus-5-5@medium)

## Observation

Two mutants in kings-cross-src/tools/mutation/live.py never run, because their anchor no longer exists.

- live.py:87 'live layer mutates cached template materials'
- live.py:88 'palette copies clone their shared textures'

Both anchor on `const shared = original.clone();`. At origin/main d6a48b0a, `grep -c` finds 0 matches in kings-cross-src/web/src/trains-live.ts. kxmut raises StalePattern, so neither mutant is run, and the palette-copy code they guard has no mutation coverage.

Inference: trains-live.ts now builds palette copies with `cloneWithShaderHooks(original)` (around line 232), so the anchor moved.

Fix: re-point both anchors to the current palette-copy line, then run the two mutants and show that each is caught by a test.

Related, not yet a defect: about 31 anchors across axis01-capture.py, live.py, signal-report.py and train-capture.py match 2 or 3 times. Those drivers mutate the first match (kxmut unique=False, replace(..., 1)), which may not be the line the label means. Each needs a check that its first match is the intended line, or a tighter anchor. The list is in the Perth worker's report of 2026-11-10 11:05 UTC.

Found by the Perth station worker's anchor scan, 2026-11-10. The lead confirmed the zero-match grep.

Evidence fingerprint: `manual:v1:kings-cross-live-py-two-palette-copy-mutants-ne-bb33ca0ed32cc74c`


## Fix

<unfixed — raised only>

## Notes
