#!/usr/bin/env python3
"""Prove the Axis 07 relay probe tests fail under planted guard regressions.

Each mutation runs the relay probe tests in a copy of the package with the real node_modules linked in. The
unmodified copy must pass the same command first, and a load or crash error is an ERROR, not a kill
(tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = ROOT.parent / '.scratch' / 'axis07-relay-mutation'
SOURCE = 'tools/axis07-relay.mjs'
TEST = 'tools/tests/axis07-relay.test.mjs'

MUTATIONS = [
    (
        'expected HTTP refusal codes are inverted',
        "else addCheck(checks, name, response.status === expected);",
        "else addCheck(checks, name, response.status !== expected);",
        'full request matrix',
    ),
    (
        'bound address check always passes',
        "addCheck(checks, 'listener_bound_loopback', loopbackAddress(relay.host));",
        "addCheck(checks, 'listener_bound_loopback', true);",
        'rejects wildcard binding',
    ),
    (
        'marker scan is disabled',
        "const leaked = Object.values(markers).some((marker) => marker && scanText.includes(marker));",
        'const leaked = false;',
        'rejects wildcard binding',
    ),
    (
        'listener permission error is reported as a failure',
        "addUnavailable(checks, 'listener_started', {",
        "addCheck(checks, 'listener_started', false, {",
        'permission denial as unavailable',
    ),
    (
        'late listener cleanup is disabled',
        "if (safeCode(error) === 'ETIMEDOUT' && pendingRelayStart) {",
        'if (false && pendingRelayStart) {',
        'closes a listener that starts after',
    ),
]


tally = kxmut.Tally()
with kxmut.workspace(ROOT, SCRATCH, 'axis07-relay') as work:
    suite = kxmut.Suite(work, test_timeout_ms=10000, timeout=30)
    for pattern in sorted({m[3] for m in MUTATIONS}):
        suite.baseline([TEST], [pattern])
    for label, old, new, pattern in MUTATIONS:
        try:
            with kxmut.mutated(work / SOURCE, [(old, new)]):
                verdict, _run = suite.judge([TEST], [pattern])
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        if verdict.kind == kxmut.KILLED and not any(pattern in name for name in verdict.failed):
            verdict = kxmut.Verdict(kxmut.ERROR, f'failed {verdict.failed[:1]}, none of them the {pattern!r} test')
        tally.record(label, verdict)
sys.exit(tally.finish())
