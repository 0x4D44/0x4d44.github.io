"""Mutation checks for motion, including proof that every motion test failed once.

usage: python3 -I -u kings-cross-src/tools/mutation/motion.py kings-cross-src .scratch/motion-mutations
Only temporary copies inside the supplied scratch directory are changed.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

# Each mutation is valid TypeScript and changes an observable motion rule.
M = [
    ('acceleration doubled', 'opts.acceleration ?? 0.7', 'opts.acceleration ?? 1.4'),
    ('braking doubled', 'opts.braking ?? 0.6', 'opts.braking ?? 1.2'),
    ('OSM limits ignored', 'maxspeedMps(opts.wayMaxspeed?.get(edge.wayId), defaultSpeed)', 'defaultSpeed'),
    ('held train creeps', 'if (!t.route.length) { t.speed = 0; return; }', 'if (!t.route.length) { t.speed = 0; t.pos = point(t.pos.edge, t.pos.t + 0.00001); return; }'),
    ('cab change moves the wrong end', 't.pos = point(nose.edge, nose.toT);', 't.pos = oldPos;'),
    ('early departure authority dropped', 'if (t.route.length) t.pendingTarget = a;', 'if (t.route.length) delete t.pendingTarget;'),
    ('partner berth reverses early', 'if (t.target.platform !== undefined && !sameStop)', 'if (t.target.platform !== undefined)'),
    ('steps teleport to their target', 'if (a) requestTarget(t, a);', 'if (a) { t.pos = locate(a)!; requestTarget(t, a); }'),
    ('unmapped flag dropped', "t.unmapped = event.to ?? '';", "t.unmapped = '';"),
    ('collision authority ignored', 'if (clear < available)', 'if (false && clear < available)'),
    ('opposing meeting boundary ignored', 'clear = Math.min(clear, Math.max(0, meeting.stop - t.distanceM));', 'clear = clear;'),
    ('overlapping births allowed', 'if (overlapM(t.body, other.body) > EPS) return false;', 'if (false) return false;'),
    ('stars become trains', 'event.descr === NOT_A_TRAIN', "event.descr === 'IMPOSSIBLE'"),
    ('cancel pops immediately', 'else if (t && t.fadeAt === undefined) t.fadeAt = now;', 'else if (t) active.delete(description);'),
    ('quiet timeout disabled', 'now - t.lastSeen >= quietMs', 'false'),
    ('reverse routes accepted on the current edge', '(target.t - start.t) * t.dir >= -EPS', 'true'),
    ('close target bypasses service braking check', 'route.reduce((sum, s) => sum + size(s), 0) + EPS < t.speed * t.speed / (2 * braking)', 'false'),
    ('longer paths preferred', 'len < bestLength', 'len > bestLength'),
    ('station zone cap removed', 'Math.min(cap, stationSpeed) : cap', 'cap : cap'),
    ('platform approach cap removed', 't.target.platform === undefined ? Infinity :', 'true ? Infinity :'),
    ('mph treated as kmh', '? 0.44704 : 1 / 3.6', '? 1 / 3.6 : 1 / 3.6'),
    ('wall clock noise breaks determinism', 'return Math.atan2((b[0] - a[0]) * t.dir, -(b[1] - a[1]) * t.dir);', 'return Math.random();'),
    ('dt validation removed', '!Number.isFinite(dtSeconds) || dtSeconds < 0', 'false'),
    ('reported occupied length wrong', 'occupiedLengthM: t.body.reduce((sum, s) => sum + size(s), 0)', 'occupiedLengthM: 1'),
]

def run(work):
    return subprocess.run(
        ['node', '--test', '--test-reporter=tap', '--test-timeout=15000', 'core/tests/motion.test.ts'],
        cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30,
    )

baseline = run(src)
if baseline.returncode:
    print(baseline.stdout, baseline.stderr)
    raise SystemExit('baseline must pass before mutation')
test_names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
seen_failing = set()
survivors = []
original = (src / 'core/motion.ts').read_text()
for label, old, new in M:
    if old not in original:
        raise SystemExit(f'mutation pattern missing: {label}')
    with tempfile.TemporaryDirectory(prefix='motion-', dir=scratch) as tmp:
        work = Path(tmp)
        shutil.copytree(src / 'core', work / 'core')
        shutil.copy2(src / 'package.json', work / 'package.json')
        (work / 'core/motion.ts').write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            print(f'[KILLED ] {label} (timeout)', flush=True)
            continue
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        seen_failing.update(failed)
        if result.returncode and failed:
            print(f'[KILLED ] {label} <- {sorted(failed)[0]}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED] {label}' + (' (no assertion failure)' if result.returncode else ''), flush=True)

unproven = test_names - seen_failing
print(f'\n{len(M) - len(survivors)}/{len(M)} mutations caught')
print(f'{len(test_names) - len(unproven)}/{len(test_names)} tests observed failing at least once')
for label in survivors:
    print('  NOT CAUGHT:', label)
for name in sorted(unproven):
    print('  NEVER FAILED:', name)
raise SystemExit(1 if survivors or unproven else 0)
