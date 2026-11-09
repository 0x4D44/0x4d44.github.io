"""Bounded synthetic timestamp/ordering checks, no private inputs or source edits.

python3 -I -u kings-cross-src/tools/mutation/axis07-recording-latency.py

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass
each command first, and every kill must be an assertion (tools/mutation/lib/kxmut.py): a load or crash error,
a timeout or a mutation whose search text is no longer in the source is an ERROR, not a kill.
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(__file__).resolve().parents[2]
scratch = src.parent / '.scratch' / 'recording-latency-mutations'
module = 'tools/axis07-recording-latency.mjs'
suite_file = 'tools/tests/axis07-recording-latency.test.mjs'
mutations = [
    ('wrong quantile rank', 'Math.ceil(n * fraction)', '1'),
    ('source time ignored', 'const lag = row.t - e.time;', 'const lag = row.t;'),
    ('sentinel counted as a train', "e.descr === '****' || ", ''),
    ('snapshot leaves prior chain', 'snapshots++; last.clear();', 'snapshots++;'),
    ('interpose does not explain a gap', 'if (prior) prior.reset = e.kind;', 'if (false) prior.reset = e.kind;'),
    ('capture includes newly appended data', '{ start: 0, end: capturedBytes - 1 }', '{ start: 0 }'),
    ('source regressions missed', 'sourceRegressions++;', 'sourceRegressions += 0;'),
    ('row size is unbounded', '2 * 1024 * 1024', '20 * 1024 * 1024'),
]
# The real browser feed must apply late observations immediately, in delivery order. Exercise that assertion
# without needing any HTTP or Chrome listener: the live feed hands the timeline the clock's own time, never
# the event's source time.
FEED_FILE = 'web/src/feed.ts'
FEED_TEST = 'web/tests/feed.test.ts'
FEED_PATTERN = 'late and out-of-order source timestamps'
FEED_MUTATION = ('live feed schedules by source time instead of receive order',
                 'timeline.deliver(e, timeline.timeMs(), recordedAtMs === undefined',
                 'timeline.deliver(e, e.time ?? 0, recordedAtMs === undefined')

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'recording-latency') as work:
    suite = kxmut.Suite(work, test_timeout_ms=10000, timeout=60)
    recording = suite.baseline([suite_file])
    feed = suite.baseline([FEED_TEST], [FEED_PATTERN])
    for label, old, new in mutations:
        try:
            with kxmut.mutated(work / module, [(old, new)], every=True):
                verdict, _run = suite.judge([suite_file], strict=True)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
    label, old, new = FEED_MUTATION
    try:
        with kxmut.mutated(work / FEED_FILE, [(old, new)]):
            verdict, _run = suite.judge([FEED_TEST], [FEED_PATTERN], strict=True)
    except kxmut.StalePattern as error:
        tally.stale(label, error)
    else:
        tally.record(label, verdict)
status = tally.finish()
known = recording.passed | feed.passed
unseen = known - tally.red
print(f'{len(tally.red & known)}/{len(known)} tests seen failing')
for name in sorted(unseen):
    print('  NEVER RED:', name)
sys.exit(1 if status or unseen else 0)
