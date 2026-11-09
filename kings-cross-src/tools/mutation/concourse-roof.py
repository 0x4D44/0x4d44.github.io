"""Bounded roof-family mutations. Usage: concourse-roof.py SOURCE SCRATCH.
Mutates a private copy; each kill needs the roof test's named assertion failure.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src, out = (Path(p).resolve() for p in sys.argv[1:])
if src == out or src.is_relative_to(out) or out.is_relative_to(src) or '.scratch' not in out.parts:
    raise SystemExit('SOURCE and output must be separate; output must be beneath worktree .scratch')
out.mkdir(parents=True, exist_ok=True)
work = out / 'work'
if work.exists():
    raise SystemExit('Choose a new SCRATCH directory; the retained mutation copy exists.')
shutil.copytree(src, work, ignore=shutil.ignore_patterns('node_modules', '.git', '.scratch', 'dist'))
(work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
target = work / 'web/src/concourse.ts'
original = target.read_text()
mutations = [
    ('farthest link called a rib', 'delta < (nearest.get(inner)?.delta ?? Infinity)', 'delta > (nearest.get(inner)?.delta ?? -Infinity)'),
    ('ribs take the nearest link on either hand', 'delta=(angle(outer)-angle(inner)+1e-6+4*Math.PI)%(2*Math.PI)', 'raw=Math.abs(angle(inner)-angle(outer)), delta=Math.min(raw,2*Math.PI-raw)'),
    ('ribs take the nearest link on the other hand','delta=(angle(outer)-angle(inner)+1e-6+4*Math.PI)%(2*Math.PI)', 'delta=(angle(inner)-angle(outer)+1e-6+4*Math.PI)%(2*Math.PI)'),
    ('rib width doubled', 'const RIB_WIDTH = 0.15', 'const RIB_WIDTH = 0.3'),
    ('rib depth range narrowed', '0.45 - 0.2 * t', '0.45 - 0.1 * t'),
    ('round tube polygon coarsened', 'const TUBE_SIDES = 8', 'const TUBE_SIDES = 4'),
    ('tube diameter interpolation flattened', '0.219 - 0.08 * t', '0.219 - 0.04 * t'),
    ('roof members split over two meshes', "add(members, mat.member, 'concourse-lattice');", "add(members, mat.member, 'concourse-lattice');\n  add(members, mat.member, 'concourse-lattice');"),
]

def run(name: str) -> subprocess.CompletedProcess[str]:
    try:
        result = kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/concourse-roof.test.ts'], cwd=work, timeout=60)
    except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap; the log keeps what it wrote
        (out / f'{name}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
        raise
    (out / f'{name}.log').write_text(result.stdout + result.stderr)
    return result

baseline = run('baseline')
if baseline.returncode:
    raise SystemExit('baseline roof assertion test failed; inspect baseline.log')
caught, invalid, survivors = [], [], []
for i, (label, old, new) in enumerate(mutations):
    if original.count(old) != 1:
        raise SystemExit(f'mutation anchor missing or ambiguous: {label}')
    target.write_text(original.replace(old, new, 1))
    try:
        result = run(f'm{i:02d}')
    except subprocess.TimeoutExpired as error:
        invalid.append(label)
        print(f'[INVALID] {label}: {kxmut.why(error)} (that is not a kill)', flush=True)
        continue
    finally:
        target.write_text(original)
    output = result.stdout + result.stderr
    if result.returncode and 'AssertionError' in output and 'not ok 1 - roof member classification and drawn sections' in output and not re.search(r'SyntaxError|TypeError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION', output):
        caught.append(label)
        print(f'[CAUGHT] {label}: roof assertion', flush=True)
    elif result.returncode:
        invalid.append(label)
        print(f'[INVALID] {label}: non-assertion failure', flush=True)
    else:
        survivors.append(label)
        print(f'[SURVIVED] {label}', flush=True)
print(f'{len(caught)}/{len(mutations)} caught; {len(invalid)} invalid; survivors: {survivors}')
raise SystemExit(bool(invalid or survivors))
