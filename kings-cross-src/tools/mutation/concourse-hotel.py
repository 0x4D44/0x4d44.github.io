"""Mutate roof/hotel separation in a retained private copy. SOURCE SCRATCH."""
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
    raise SystemExit('Choose a separate output under worktree .scratch')
out.mkdir(parents=True, exist_ok=True)
work = out / 'work'
if work.exists():
    raise SystemExit('Choose fresh output; retained copy already exists')
shutil.copytree(src, work, ignore=shutil.ignore_patterns('node_modules', '.git', '.scratch', 'dist'))
(work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
target = work / 'web/src/concourse.ts'
original = target.read_text()
mutations = [
    ('exclusions omitted by builder', 'concourseGrid(canopy, footprint, shed, exclusions)', 'concourseGrid(canopy, footprint, shed)'),
    ('only vertex containment checked', '  for(let i=0;i<triangle.length;i++)', '  return false;\n  for(let i=0;i<triangle.length;i++)'),
    ('member section reach omitted', '0.45 / 2 + RIB_WIDTH / 2 + 0.05', '0'),
    ('floor inherits coarse roof cells',
     'for(const tri of THREE.ShapeUtils.triangulateShape(groundOutline.map(p=>new THREE.Vector2(...p)),[])) {\n    let [a,b,c]=tri.map(i=>groundOutline[i]!)',
     'for(const tri of kept) {\n    let [a,b,c]=tri.map(i=>[d.nodes[i]!.x,d.nodes[i]!.z] as Pt)'),
]

def run(name):
    try:
        result = kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/concourse-hotel.test.ts'], cwd=work, timeout=60)
    except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap; the log keeps what it wrote
        (out / f'{name}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
        raise
    (out / f'{name}.log').write_text(result.stdout + result.stderr)
    return result

if run('baseline').returncode:
    raise SystemExit('Baseline test failed')
caught = 0
for i, (label, old, new) in enumerate(mutations):
    if original.count(old) != 1:
        raise SystemExit(f'Missing/ambiguous anchor: {label}')
    target.write_text(original.replace(old, new, 1))
    try:
        result = run(f'm{i:02d}')
    except subprocess.TimeoutExpired as error:
        print(f'SURVIVED/INVALID: {label} ({kxmut.why(error)}; that is not a kill)', flush=True)
        continue
    finally:
        target.write_text(original)
    text = result.stdout + result.stderr
    valid = bool(result.returncode and 'AssertionError' in text and
                 ('not ok 2 - drawn roof and members clear' in text or 'not ok 3 - concourse ground reaches' in text) and
                 not re.search(r'SyntaxError|TypeError|ERR_MODULE_NOT_FOUND', text))
    print(f'{"CAUGHT" if valid else "SURVIVED/INVALID"}: {label}', flush=True)
    caught += valid
print(f'{caught}/{len(mutations)} caught')
raise SystemExit(caught != len(mutations))
