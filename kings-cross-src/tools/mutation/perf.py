"""Mutate the pure perf helpers in private copies; no Chrome or real data required.

python3 -I -u kings-cross-src/tools/mutation/perf.py kings-cross-src .scratch/perf-mutations

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first,
and a load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py).
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)
TEST = 'tools/tests/perf.test.mjs'
mutations = [
    ('missing timing becomes fabricated zero', "gap('sample-time-unavailable',", "sampledUs += 1000; gap('sample-time-unavailable',"),
    ('timing gaps silently disappear', "entry.count++; gaps.set(code, entry);", "entry.count++;"),
    ('timed totals lose valid samples', 'sampledUs += us;', 'sampledUs += 0;'),
    ('all samples count as timed', 'timedSampleCount++;', 'timedSampleCount += samples.length;'),
    ('source mapping loses measured cost', 'if (location) mappedUs += us;', 'if (location) mappedUs += 0;'),
    ('missing frame loses its gap', "gap('call-frame-unavailable',", "gap('wrong-code',"),
    ('unknown node loses its gap', "gap('sample-node-unavailable',", "gap('wrong-code',"),
    ('missing source location loses its gap', "gap('source-position-unavailable',", "gap('wrong-code',"),
    ('unmatched deltas silently disappear', "gap('unmatched-time-deltas',", "gap('wrong-code',"),
    ('no samples loses its gap', "gap('samples-unavailable',", "gap('wrong-code',"),
    ('partial profile looks complete', "gaps.size ? 'partial' : 'complete'", "gaps.size ? 'complete' : 'complete'"),
    ('missing timing looks like measured zero', 'sampledMs: timedSampleCount ? sampledUs / 1000 : null', 'sampledMs: timedSampleCount ? sampledUs / 1000 : 0'),
    ('Markdown omits profile gaps', 'cpu.gaps.map(gap =>', '[].map(gap =>'),
    ('Markdown omits source table', '(cpu?.byOriginalSourceFile ?? []).slice(0, 15)', '[].slice(0, 15)'),
]

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'perf') as work:
    suite = kxmut.Suite(work, test_timeout_ms=20000, timeout=30)
    baseline = suite.baseline([TEST])
    for label, old, new in mutations:
        try:
            with kxmut.mutated(work / 'tools/perf.mjs', [(old, new)]):
                verdict, _run = suite.judge([TEST], strict='any')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unproven = baseline.passed - tally.red
summary = (f'{len(tally.caught)}/{len(mutations)} caught; survivors: {tally.survived + [e[0] for e in tally.errors]}; '
           f'tests seen failing: {len(baseline.passed) - len(unproven)}/{len(baseline.passed)}; unproven: {sorted(unproven)}')
print(summary)
(scratch / 'report.txt').write_text(summary + '\n')
sys.exit(1 if status or unproven else 0)
