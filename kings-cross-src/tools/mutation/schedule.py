"""Synthetic schedule mutation checks; usage: schedule.py <kings-cross-src> <.scratch/output>.

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first,
and a load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
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
TEST = 'core/tests/schedule.test.ts'
mutations = [
    ('top-level operator', 'text(s.atoc_code) || text(seg.atoc_code)', 'text(seg.atoc_code)'),
    ('calendar', "new Date(date).toISOString().slice(0, 10) === date", 'true'),
    ('half minutes', "m[4] ? '30' : m[3]", "m[4] ? '00' : m[3]"),
    ('Monday first', '(new Date(serviceDate).getUTCDay() + 6) % 7', 'new Date(serviceDate).getUTCDay()'),
    ('STP rank', 'P: 1, N: 2, O: 3, C: 4', 'P: 4, N: 2, O: 3, C: 1'),
    ('skip empty markers', 'apply(r: ScheduleRecord): void {', 'apply(r: ScheduleRecord): void { if (!r.locations.some(l => l.tiploc === "KNGX")) return;'),
    ('previous service day', '[shift(date, -1), date]', '[date]'),
    ('midnight rollover', 'if (clock < previousClock) day++;', 'if (false) day++;'),
    ('London timezone', "timeZone: 'Europe/London'", "timeZone: 'UTC'"),
    ('nearest call', 'distance < best', 'distance > best'),
    ('window bound', 'distance > windowMs', 'false'),
    ('platform range', '/^(?:[0-9]|10)$/.test(l.platform)', 'true'),
]

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'schedule') as work:
    suite = kxmut.Suite(work, test_timeout_ms=5000, timeout=12)
    baseline = suite.baseline([TEST])
    names = {n for n in baseline.passed if n.startswith('schedule: ')}
    for label, old, new in mutations:
        try:
            with kxmut.mutated(work / 'core/schedule.ts', [(old, new)]):
                verdict, _run = suite.judge([TEST])
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unseen = names - tally.red
print(f'{len(names - unseen)}/{len(names)} tests seen failing')
if unseen:
    print('Tests never seen failing:', ', '.join(sorted(unseen)))
sys.exit(1 if status or unseen else 0)
