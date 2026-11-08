"""Synthetic schedule mutation checks; usage: schedule.py <kings-cross-src> <.scratch/output>."""
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)
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

def run(work):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=5000', 'core/tests/schedule.test.ts']
    proc = subprocess.Popen(command, cwd=work, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, start_new_session=True)
    expired = False
    try:
        out, err = proc.communicate(timeout=12)
    except subprocess.TimeoutExpired:
        expired = True
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        out, err = proc.communicate(timeout=3)
    return proc.returncode, out, err, expired or 'testTimeoutFailure' in out

code, out, err, expired = run(src)
if code or expired:
    raise SystemExit('baseline failed: ' + out + err)
names = set(re.findall(r'^ok \d+ - (schedule: .+)$', out, re.M))
seen, survivors, timeouts = set(), [], []
original = (src / 'core/schedule.ts').read_text()
for label, old, new in mutations:
    if old not in original:
        raise SystemExit('missing mutation pattern: ' + label)
    with tempfile.TemporaryDirectory(prefix='schedule-', dir=scratch) as tmp:
        work = Path(tmp)
        (work / 'core/tests').mkdir(parents=True)
        shutil.copy2(src / 'core/tests/schedule.test.ts', work / 'core/tests/schedule.test.ts')
        (work / 'core/schedule.ts').write_text(original.replace(old, new, 1))
        code, out, err, expired = run(work)
        failed = set(re.findall(r'^not ok \d+ - (schedule: .+)$', out, re.M))
        if expired:
            timeouts.append(label)
            print('TIMEOUT:', label)
        elif failed:
            seen.update(failed)
            print('KILLED:', label)
        else:
            survivors.append(label)
            print('SURVIVED:', label, err if code else '')
unseen = names - seen
print(f'{len(mutations) - len(survivors) - len(timeouts)} killed; {len(survivors)} survived; {len(timeouts)} timeouts; {len(seen)}/{len(names)} tests seen failing')
if unseen:
    print('Tests never seen failing:', ', '.join(sorted(unseen)))
if survivors or timeouts or unseen:
    raise SystemExit(1)
