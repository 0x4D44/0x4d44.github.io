"""Synthetic renderer/controller mutations; only named TAP assertion failures count.
Usage: python3 -I -u tools/mutation/signals.py <kings-cross-src> <worktree/.scratch>
Copies only the signal module, synthetic tests and shared core; links node_modules.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
scratch.mkdir(parents=True, exist_ok=True)
F = 'web/src/signals.ts'
B = 'tools/build-signals.ts'
M = [
    ('snapshot picture ignored', [('if (valid) bytes = restored;', 'if (valid) bytes = {};')]),
    ('snapshot stale bytes retained', [('bytes = {};\n        const picture', 'bytes = { ...bytes };\n        const picture')]),
    ('snapshot malformed accepted partially', [('if (valid) bytes = restored;', 'bytes = restored;')]),
    ('snapshot foreign area accepted', [('if (row.e.area !== area) return;', 'if (false) return;')]),
    ('post offset halved', [('side * 2 *', 'side * 1 *')]),
    ('head facing reversed', [('Math.atan2(signal.facing[0], signal.facing[1])', 'Math.atan2(-signal.facing[0], -signal.facing[1])')]),
    ('unknown lights red', [(' : 0x666666);', ' : 0xff2929);')]),
    ('unknown question hidden', [("questions.get(record)!.visible = record.state === 'unknown';", 'questions.get(record)!.visible = false;')]),
    ('green aspect red', [("? 0x35ff69 :", '? 0xff2929 :')]),
    ('reset retains bytes', [('reset(): void { bytes = {}; refresh(); }', 'reset(): void { refresh(); }')]),
    ('byte updates omitted', [('bytes = updateBytes(bytes, row as TimedTdEvent, area).state;', 'bytes = {};')]),
    ('SG SH ignored', [('bytes = updateBytes(bytes, row as TimedTdEvent, area).state;', "if (row.e.msgType === 'SF') bytes = updateBytes(bytes, row as TimedTdEvent, area).state;")]),
    ('wrong area accepted', [('updateBytes(bytes, row as TimedTdEvent, area)', 'updateBytes(bytes, row as TimedTdEvent, row.e.area)')]),
    ('table area ignored', [('value.area !== area', 'false')]),
    ('invented precision accepted', [('Math.abs(v.precision - v.support / v.trials) < 1e-12', 'true')]),
    ('held out evidence ignored', [('!evidence(h.heldOut)', 'false'), ('structuredClone(h) as unknown as SignalHypothesis', '({...structuredClone(h), heldOut: h.training}) as unknown as SignalHypothesis')]),
    ('competing candidates picked', [('return result.map((h) => result.some', "return result.filter((h) => h.id !== 'other').map((h) => result.some"), ('other !== h && (other.berth', "other.id !== 'other' && other !== h && (other.berth")]),
    ('foreign refs accepted', [("/^YA\\s*\\d+$/i.test(signal.ref ?? '')", "true"), ("(signal.ref ?? '').replace(/^YA\\s*/i, '') === signal.berth", "true")]),
    ('boards decoded', [("if (signal.kinds.includes('main')", 'if (true'), ("record.state = record.signal.kinds.includes('main')", 'record.state = true')]),
    ('topology mapping omitted', [('if (table.length && object(value)', 'if (false && object(value)')]),
    ('far topology mappings accepted', [('m.distanceM <= 40', 'm.distanceM <= 400')]),
    ('ambiguous private mappings accepted', [('mappings.filter((x) => x.signalId === mapping.signalId || x.berth === mapping.berth).length !== 1', 'false')]),
    ('OSM mapping overridden', [('record.signal.ref || record.signal.berth || ', '')]),
    ('404 body accepted', [('response.ok ? await response.json() : null', 'await response.json()')]),
    ('fetch retains stale table', [('const request = ++generation; table = []; refresh();', 'const request = ++generation;')]),
    ('stale request accepted', [('request === generation', 'true')]),
    ('disposed fetch revives state', [('!disposed && request === generation', 'request === generation'), ('if (disposed) return;', 'if (false) return;')]),
    ('groups not detached', [('record.group.removeFromParent()', 'void record.group')]),
    ('resources not disposed', [('resource.dispose()', 'void resource')]),
    ('builder topology signal anchors omitted', [("if (a.kind !== 'inferred' && !(a.kind === 'signal' && a.evidence.startsWith('Topology'))) return false;", "if (a.kind !== 'inferred') return false;")], B),
    ('builder backward side not flipped', [("(forward ? rawPosition : rawPosition === 'left' ? 'right' : 'left')", 'rawPosition')], B),
    ('builder backward ignored', [("const forward = signal.direction !== 'backward';", 'const forward = true;')], B),
    ('builder side ignored', [("const positionKnown = rawPosition === 'left' || rawPosition === 'right';", 'const positionKnown = false;')], B),
    ('builder foreign refs mapped', [(r'/^YA\s*(\d{4})$/', r'/^[A-Z]+\s*(\d{4})$/')], B),
    ('builder leaks private berth', [('const overlay: SignalOverlay =', "if (options.anchors?.anchors[0]) signals[0]!.berth = options.anchors.anchors[0].berth; const overlay: SignalOverlay =")], B),
    ('builder distance widened', [('dist(a.point, s.edge.point) <= 40', 'dist(a.point, s.edge.point) <= 400')], B),
    ('builder one-to-one ignored', [("privateTrials.filter((other) =>\n      other.candidates.some((a) => a.berth === trial.candidates[0]!.berth)).length === 1", 'true')], B),
]

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=20000', 'web/tests/signals.test.ts'], cwd=work,
                          text=True, capture_output=True, stdin=subprocess.DEVNULL, timeout=40)

def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - ([^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION(?:['\"]|$)", block, re.M):
            failures.add(name[1])
    return failures


def complete_tests(output, expected):
    names = re.findall(r'^(?:ok|not ok) \d+ - ([^\n]+)$', output, re.M)
    total = re.search(r'^# tests (\d+)$', output, re.M)
    return total is not None and int(total[1]) == len(expected) and len(names) == len(expected) and set(names) == expected


root = Path(tempfile.mkdtemp(prefix='signals-mutation-', dir=scratch))
failed_tests = set()
survivors = []
try:
    shutil.copytree(src / 'core', root / 'core')
    (root / 'web/src').mkdir(parents=True)
    (root / 'web/tests').mkdir(parents=True)
    shutil.copy2(src / 'web/src/feed.ts', root / 'web/src/feed.ts')
    shutil.copy2(src / 'web/tests/signals.test.ts', root / 'web/tests/signals.test.ts')
    (root / 'tools').mkdir()
    shutil.copy2(src / B, root / B)
    shutil.copy2(src / 'package.json', root / 'package.json')
    (root / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
    original = (src / F).read_text()
    (root / F).write_text(original)
    baseline = run(root)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('Baseline failed')
    expected = set(re.findall(r'^ok \d+ - ([^\n]+)$', baseline.stdout, re.M))
    if not expected or not complete_tests(baseline.stdout, expected):
        raise SystemExit('Baseline TAP output is incomplete; cannot prove every test red')
    for mutation in M:
        label, replacements = mutation[:2]
        target = mutation[2] if len(mutation) > 2 else F
        (root / F).write_text(original)
        (root / B).write_text((src / B).read_text())
        changed = (src / target).read_text()
        for old, new in replacements:
            if old not in changed:
                raise SystemExit(f'Mutation pattern missing: {label}: {old}')
            changed = changed.replace(old, new)
        (root / target).write_text(changed)
        try:
            result = run(root)
            # Every failure must be a named assertion and the entire baseline suite
            # must finish. Mixed runtime/syntax errors and stderr never count as kills.
            assertion_names = assertion_failures(result.stdout)
            named_failures = set(re.findall(r'^not ok \d+ - ([^\n]+)$', result.stdout, re.M))
            if result.returncode and assertion_names and assertion_names == named_failures and complete_tests(result.stdout, expected) and not result.stderr:
                failed_tests.update(assertion_names)
                print(f'[CAUGHT] {label}: {", ".join(sorted(assertion_names))}', flush=True)
            else:
                survivors.append(label)
                print(f'[SURVIVED] {label} (survived or invalid TAP/runtime result)', flush=True)
                if result.returncode: print(result.stdout[-1500:], result.stderr[-1000:])
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[SURVIVED] {label} (timeout is not a kill)', flush=True)
    print(f'{len(M) - len(survivors)}/{len(M)} mutations caught; {len(failed_tests & expected)}/{len(expected)} tests observed red')
    for label in survivors: print('NOT CAUGHT:', label)
    for name in sorted(expected - failed_tests): print('NEVER RED:', name)
    if survivors or expected - failed_tests: raise SystemExit(1)
finally:
    shutil.rmtree(root)
