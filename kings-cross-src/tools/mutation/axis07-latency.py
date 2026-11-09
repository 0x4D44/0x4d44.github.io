#!/usr/bin/env python3
"""Plant stage/report regressions in isolated scratch copies; never edit source.

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass the
same command first, and a load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = ROOT.parent / '.scratch' / 'axis07-latency' / 'mutation'
MODULE = 'tools/axis07-latency.mjs'
TEST = 'tools/tests/axis07-latency.test.mjs'
MUTATIONS = [
    ('quantile rank reversed', MODULE, 'Math.ceil(sorted.length * p) - 1', '0', 'latency quantiles'),
    ('receive/send subtraction reversed', MODULE, "r[b] - r[a]", "r[a] - r[b]", 'latency summaries'),
    ('missing/order validity ignored', MODULE, "status: valid ? 'PASS' : 'FAIL'", "status: 'PASS'", 'latency summaries'),
    ('SSE event duplicated', MODULE, 'onEvent(type, JSON.parse(data));', 'onEvent(type, JSON.parse(data)); onEvent(type, JSON.parse(data));', 'latency SSE parser'),
    ('permission denial called pass', MODULE, "? 'UNAVAILABLE' : 'FAIL'", "? 'PASS' : 'FAIL'", 'latency probe reports bind'),
    ('input validation disabled', MODULE, "throw new Error('invalid probe limits');", "return {};", 'latency probe refuses invalid'),
    ('injected handler never receives events', 'relay/relay.mjs', 'const server = createServer(async (req, res) => {', 'const server = createServer(async (req, res) => { return;', 'real relay handler sends'),
]

tally = kxmut.Tally()
with kxmut.workspace(ROOT, SCRATCH, 'axis07-latency') as work:
    suite = kxmut.Suite(work, test_timeout_ms=10000, timeout=30)
    for pattern in sorted({m[4] for m in MUTATIONS}):
        suite.baseline([TEST], [pattern])
    for label, file, before, after, pattern in MUTATIONS:
        try:
            with kxmut.mutated(work / file, [(before, after)]):
                verdict, _run = suite.judge([TEST], [pattern])
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        if verdict.kind == kxmut.KILLED and not any(pattern in name for name in verdict.failed):
            verdict = kxmut.Verdict(kxmut.ERROR, f'failed {verdict.failed[:1]}, none of them the {pattern!r} test')
        tally.record(label, verdict)
sys.exit(tally.finish())
