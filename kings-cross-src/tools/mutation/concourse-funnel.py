"""Funnel mutations: round tubes, smooth curved legs, leg counts, the splay and widening, the head on the roof's third ring.
Usage: concourse-funnel.py SOURCE SCRATCH. Mutates a private copy of SOURCE under SCRATCH (which must lie beneath a .scratch
directory); each kill needs an assertion failure from web/tests/concourse-funnel.test.ts, not a load failure.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

src, out = (Path(p).resolve() for p in sys.argv[1:])
if src == out or src.is_relative_to(out) or out.is_relative_to(src) or '.scratch' not in out.parts:
    raise SystemExit('SOURCE and output must be separate; output must be beneath a .scratch directory')
out.mkdir(parents=True, exist_ok=True)
work = out / 'work'
if work.exists():
    raise SystemExit('Choose a new SCRATCH directory; the retained mutation copy exists.')
shutil.copytree(src, work, ignore=shutil.ignore_patterns('node_modules', '.git', '.scratch', 'dist'))
(work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
target = work / 'web/src/concourse.ts'
original = target.read_text()
RADIUS = 'export const columnRadius = (t: number, mouth: number): number => 1.85 + (mouth - 1.85) * (0.3 * t + 0.7 * t ** 3) + (t ? 0 : 0.25);'
THICK = 'return 0.36 - 0.14 * Math.max(0, Math.min(1, y / top));'
mutations = [
    ('tubes are six-sided', 'const TUBE_SIDES = 8;', 'const TUBE_SIDES = 6;'),
    ('legs drawn as one straight tube', 'export const COLUMN_SEGMENTS = 3;', 'export const COLUMN_SEGMENTS = 1;'),
    ('one parent below each node', '.slice(0, 2)) edges.push', '.slice(0, 1)) edges.push'),
    ('six legs at the floor', '[[0, 12], [0.06, 12],', '[[0, 6], [0.06, 12],'),
    ('feet too wide', RADIUS, RADIUS.replace('1.85 + (mouth - 1.85)', '3.5 + (mouth - 3.5)')),
    ('feet too narrow', RADIUS, RADIUS.replace('1.85 + (mouth - 1.85)', '0.6 + (mouth - 0.6)')),
    ('feet not splayed', RADIUS, RADIUS.replace(' + (t ? 0 : 0.25)', '')),
    ('a straight stalk, no widening', '(0.3 * t + 0.7 * t ** 3)', '0'),
    ('widens only at the very top', '(0.3 * t + 0.7 * t ** 3)', 't ** 40'),
    ('head legs stand off the roof ring', 'const p: V3 = last ? [...head[i]!] :', 'const p: V3 = last ? [head[i]![0], head[i]![1] - 0.5, head[i]![2]] :'),
    ('head ring one ring in', 'export const FUNNEL_HEAD_RING = 2;', 'export const FUNNEL_HEAD_RING = 1;'),
    ('Range-side legs reach into the cornice', 'export const FUNNEL_REACH = FUNNEL_RADIUS - 0.6;', 'export const FUNNEL_REACH = FUNNEL_RADIUS + 0.4;'),
    ('Range-side legs stand far from the Range', 'export const FUNNEL_REACH = FUNNEL_RADIUS - 0.6;', 'export const FUNNEL_REACH = FUNNEL_RADIUS - 3;'),
    ('all tubes one thickness', THICK, 'return 0.36;'),
    ('thin tubes', THICK, 'return 0.2 - 0.05 * Math.max(0, Math.min(1, y / top));'),
    ('rings not turned half a step', '((rings.length - 1 - k) % 2) * 0.5', '0'),
    ('legs kink at every crossing', 'ends[i]![1] = ends[o]![0] = unit(sum(dirs[i]!, dirs[o]!));', 'ends[i]![1] = dirs[i]!; ends[o]![0] = dirs[o]!;'),
    ('feet not upright', 'ends[o]![0] = unit(sum(dirs[o]!, [0, 2, 0]));', 'ends[o]![0] = dirs[o]!;'),
    ('legs reach the roof without sweeping out', 'ends[i]![1] = unit(sum(dirs[i]!, p[0] < FUNNEL_REACH ? unit([p[0], 0, p[2]]) : [0, 0, 0]));', 'ends[i]![1] = [0, 1, 0];'),
]

def run(name: str) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=60000', 'web/tests/concourse-funnel.test.ts'],
                            cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
    (out / f'{name}.log').write_text(result.stdout + result.stderr)
    return result

baseline = run('baseline')
if baseline.returncode:
    raise SystemExit('baseline funnel tests failed; inspect baseline.log')
caught, invalid, survivors = [], [], []
for i, (label, old, new) in enumerate(mutations):
    if original.count(old) != 1:
        raise SystemExit(f'mutation anchor missing or ambiguous: {label}')
    target.write_text(original.replace(old, new, 1))
    try:
        result = run(f'm{i:02d}')
    finally:
        target.write_text(original)
    output = result.stdout + result.stderr
    if result.returncode and 'AssertionError' in output and not re.search(r'SyntaxError|TypeError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION', output):
        caught.append(label)
        failed = sorted(set(re.findall(r'^not ok \d+ - (.{0,60})', output, re.M)))
        print(f'[CAUGHT] {label}: {"; ".join(failed)}', flush=True)
    elif result.returncode:
        invalid.append(label)
        print(f'[INVALID] {label}: non-assertion failure', flush=True)
    else:
        survivors.append(label)
        print(f'[SURVIVED] {label}', flush=True)
print(f'{len(caught)}/{len(mutations)} caught; {len(invalid)} invalid; survivors: {survivors}')
raise SystemExit(bool(invalid or survivors))
