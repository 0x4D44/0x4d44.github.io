"""Funnel mutations: round tubes, cast nodes, collars, leg counts, the splay and widening, the head on the roof's first ring.
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
LEVELS = 'const COLUMN_LEVELS = [0, 1.0, 2.6, 4.2, 5.8, 7.4, 9.0, 10.6, 12.2, 13.7, 15.1, 16.4, 17.5, 18.5, 19.3, 19.9] as const;'
COUNT = 'const columnCount = (radius: number): number => (radius < 2.6 ? 12 : radius < 3.8 ? 18 : 24);'
mutations = [
    ('tubes are six-sided', 'const TUBE_SIDES = 8;', 'const TUBE_SIDES = 6;'),
    ('no cast nodes at the crossings', 'if (n[1] <= 0 || n[1] >= top) continue;', 'if (n[1] <= 0 || n[1] >= top || true) continue;'),
    ('no collars at the feet', 'if (n[1] !== 0) continue;', 'if (n[1] !== 0 || true) continue;'),
    ('six legs at the floor', COUNT, COUNT.replace('radius < 2.6 ? 12', 'radius < 2.6 ? 6')),
    ('twelve legs all the way up', COUNT, 'const columnCount = (radius: number): number => 12;'),
    ('feet too wide', 'const COLUMN_STEM = 1.8;', 'const COLUMN_STEM = 3.5;'),
    ('feet too narrow', 'const COLUMN_STEM = 1.8;', 'const COLUMN_STEM = 0.6;'),
    ('rings too far apart: members over 2 m', LEVELS, 'const COLUMN_LEVELS = [0, 2.6, 5.8, 9.0, 12.2, 15.1, 17.5, 19.3, 19.9] as const;'),
    ('a ring too close: a stub member', LEVELS, LEVELS.replace('[0, 1.0,', '[0, 0.4, 1.0,')),
    ('all tubes one thickness', 'return 0.36 - 0.14 * Math.max(0, Math.min(1, y / top));', 'return 0.36;'),
    ('thin tubes', 'return 0.36 - 0.14 * Math.max(0, Math.min(1, y / top));', 'return 0.2 - 0.05 * Math.max(0, Math.min(1, y / top));'),
    ('a straight stalk, no widening', 'const widening = COLUMN_CONE * t + (1 - COLUMN_CONE) * t ** 5;', 'const widening = 0;'),
    ('widens only at the very top', 'const widening = COLUMN_CONE * t + (1 - COLUMN_CONE) * t ** 5;', 'const widening = t ** 40;'),
    ('head legs stand off the roof ring', 'let r = radius - (0.85 * columnTubeDiameter(y, top) + 0.03);', 'let r = radius - 1.5;'),
    ('head ring below the roof', 'if (i === last) return [FUNNEL_RADIUS, top];', 'if (i === last) return [FUNNEL_RADIUS, top - 0.5];'),
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
