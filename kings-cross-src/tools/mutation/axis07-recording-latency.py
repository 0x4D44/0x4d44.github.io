"""Bounded synthetic timestamp/ordering checks, no private inputs or source edits.

python3 -I -u kings-cross-src/tools/mutation/axis07-recording-latency.py
"""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

src = Path(__file__).resolve().parents[2]
scratch = src.parent / '.scratch' / 'recording-latency-mutations'
scratch.mkdir(parents=True, exist_ok=True)
module = 'tools/axis07-recording-latency.mjs'
suite = 'tools/tests/axis07-recording-latency.test.mjs'
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

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=10000', suite], cwd=work,
                          stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=20)

with tempfile.TemporaryDirectory(prefix='case-', dir=scratch) as temp:
    work = Path(temp)
    (work / 'tools/tests').mkdir(parents=True)
    shutil.copy2(src / module, work / module)
    shutil.copy2(src / suite, work / suite)
    baseline = run(work)
    if baseline.returncode: raise SystemExit(baseline.stdout + baseline.stderr)
    names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    seen = set()
    for label, old, new in mutations:
        original = (src / module).read_text()
        if old not in original: raise SystemExit('missing mutation target: ' + label)
        (work / module).write_text(original.replace(old, new))
        result = run(work)
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        if not result.returncode or not failed or 'ERR_ASSERTION' not in result.stdout:
            raise SystemExit(f'SURVIVED/INVALID {label}\n{result.stdout}\n{result.stderr}')
        seen.update(failed)
        print('CAUGHT ' + label, flush=True)
    if names - seen: raise SystemExit('never red: ' + ', '.join(sorted(names - seen)))
    print(f'{len(mutations)}/{len(mutations)} caught; {len(seen)}/{len(names)} tests seen failing; zero survivors')
    # The real browser feed must apply late observations immediately, in delivery order.
    # Exercise that new assertion without needing any HTTP or Chrome listener.
    shutil.copytree(src / 'core', work / 'core')
    (work / 'web/src').mkdir(parents=True)
    (work / 'web/tests').mkdir()
    for name in ['feed.ts', 'board.ts']:
        shutil.copy2(src / 'web/src' / name, work / 'web/src' / name)
    shutil.copy2(src / 'web/tests/feed.test.ts', work / 'web/tests/feed.test.ts')
    for name in ['package.json', 'vite.config.ts']:
        shutil.copy2(src / name, work / name)
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=10000',
               '--test-name-pattern=late and out-of-order source timestamps', 'web/tests/feed.test.ts']
    def feed_run():
        return subprocess.run(command, cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=20)
    baseline = feed_run()
    if baseline.returncode: raise SystemExit(baseline.stdout + baseline.stderr)
    target = work / 'web/src/feed.ts'
    original = target.read_text()
    before = 'timeline.deliver(e); lastDataAt'
    if before not in original: raise SystemExit('missing feed mutation anchor')
    target.write_text(original.replace(before, 'timeline.deliver(e, e.time ?? 0); lastDataAt', 1))
    result = feed_run()
    if not result.returncode or 'ERR_ASSERTION' not in result.stdout:
        raise SystemExit('SURVIVED/INVALID source-time scheduling\n' + result.stdout + result.stderr)
    print('CAUGHT live feed schedules by source time instead of receive order')
    print(f'{len(mutations) + 1}/{len(mutations) + 1} caught; {len(names) + 1}/{len(names) + 1} tests seen failing; zero survivors')
