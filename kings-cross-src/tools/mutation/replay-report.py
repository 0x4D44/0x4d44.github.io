"""Replay-report CLI mutations; only the named replay assertion may kill each change.

Usage: python3 -I -u kings-cross-src/tools/mutation/replay-report.py kings-cross-src .scratch/replay-report-mutation

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass
every command used on a mutant first, and a load or crash error is an ERROR, not a kill
(tools/mutation/lib/kxmut.py).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be under worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

FILE = 'tools/replay-report.ts'
MUTATIONS = [
    ('second recording is ignored', FILE,
     "if (k === '--recording') recordingPaths.push(v);",
     "if (k === '--recording' && recordingPaths.length === 0) recordingPaths.push(v);",
     'core/tests/replay-report.test.ts', 'CLI combines multiple recordings'),
    ('incomplete growing tail is retained', FILE,
     'if (!hasIncompleteJsonPrefix(tail)) return { bytes, trailingBytesOmitted: 0 };',
     'if (true) return { bytes, trailingBytesOmitted: 0 };',
     'core/tests/replay-report.test.ts', 'growing recording capture omits only an incomplete final JSON line'),
    ('replay metrics use the supplied map instead of preserved map', FILE,
     'metrics: replayReport(data, rows, effectiveAnchors, {schedule:',
     'metrics: replayReport(data, rows, anchors, {schedule:',
     'core/tests/replay-report.test.ts', 'optional SMART reconciliation classifies candidates before replay metrics'),
    ('Axis 04 omits replay reproduction', 'tools/axis04-summary.ts',
     "replayReproduction = reproduction(object(input.replay.reproducibility).command, 'Recompute replay berth and motion report', 'report');",
     'replayReproduction = null;', 'tools/tests/axis04-summary.test.ts',
     'Axis 04 links a multi-recording berth report'),
]

NEW_TESTS = [
    'CLI combines multiple recordings with union reasons, per-recording measures and bounded input hashes',
    'growing recording capture omits only an incomplete final JSON line',
    'optional SMART reconciliation classifies candidates before replay metrics and keeps positions pending',
    'Axis 04 links a multi-recording berth report and carries its compact evidence summary',
]


ALL = ['core/tests/replay-report.test.ts', 'tools/tests/axis04-summary.test.ts']

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'replay-report') as work:
    suite = kxmut.Suite(work, test_timeout_ms=10000, timeout=45)
    full = suite.baseline(ALL)
    if not set(NEW_TESTS).issubset(full.passed):
        raise SystemExit(f'new replay-report baseline assertions missing: {sorted(set(NEW_TESTS) - full.passed)}')
    for _label, _relative, _old, _new, target_test, test_name in MUTATIONS:
        suite.baseline([target_test], [test_name])

    observed = set()
    for label, relative, old, new, target_test, test_name in MUTATIONS:
        expected = {name for name in NEW_TESTS if name.startswith(test_name)}
        try:
            with kxmut.mutated(work / relative, [(old, new)]):
                verdict, run = suite.judge([target_test], [test_name], strict=True)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        if verdict.kind == kxmut.KILLED:
            top = [r for r in run.results if r.depth == 0]
            if set(verdict.failed) != expected or len(expected) != 1 or len(top) != 1 or run.stderr:
                verdict = kxmut.Verdict(kxmut.ERROR, f'expected only {sorted(expected)} to fail, saw {verdict.failed} '
                                        f'({len(top)} top-level results, stderr {bool(run.stderr)})')
            else:
                observed.update(verdict.failed)
        tally.record(label, verdict)
    status = tally.finish()
    not_caught = set(NEW_TESTS) - observed
    print(f'{len(NEW_TESTS) - len(not_caught)}/{len(NEW_TESTS)} new replay-report/Axis 04 tests observed failing; never failed: {sorted(not_caught)}')
    sys.exit(1 if status or not_caught else 0)
