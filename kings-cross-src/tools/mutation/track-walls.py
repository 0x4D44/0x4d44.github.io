"""Break the platform 0 opening and the track/wall sweep, and check tools/tests/track-walls.test.mjs catches each.
Usage: python3 -I -u tools/mutation/track-walls.py SOURCE WORKTREE_SCRATCH
Source stays untouched; all baseline and mutation logs go to WORKTREE_SCRATCH.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
if out == src or out.is_relative_to(src) or src.is_relative_to(out):
    raise SystemExit('output must be separate from the source directory')
out.mkdir(parents=True, exist_ok=True)

SHED = 'web/src/shed.ts'
SWEEP = 'tools/track-walls.mjs'
REAL = 'the real station'
MUTATIONS = [
    ('the east aisle north wall closed again', SHED, 'EAST_AISLE_OPENING = { fromEast: 3.07, width: 3.5, head: 4.8 }', 'EAST_AISLE_OPENING = { fromEast: 3.07, width: 0, head: 4.8 }', REAL),
    ('the opening\'s head lower than a train', SHED, 'EAST_AISLE_OPENING = { fromEast: 3.07, width: 3.5, head: 4.8 }', 'EAST_AISLE_OPENING = { fromEast: 3.07, width: 3.5, head: 3.0 }', REAL),
    ('the opening too narrow for the line', SHED, 'EAST_AISLE_OPENING = { fromEast: 3.07, width: 3.5, head: 4.8 }', 'EAST_AISLE_OPENING = { fromEast: 3.07, width: 1.5, head: 4.8 }', REAL),
    ('the opening off platform 0\'s crossing', SHED, 'EAST_AISLE_OPENING = { fromEast: 3.07, width: 3.5, head: 4.8 }', 'EAST_AISLE_OPENING = { fromEast: 4.5, width: 3.5, head: 4.8 }', 'platform 0\'s line lies in the east aisle'),
    ('the spine wall left out', SHED, 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1, 1]);', '', 'the swept walls include the spine wall'),
    ('the spine wall on the old valley line, over platform 4\'s track', SHED, 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1, 1]);', 'buildSpineWall(spineBrick, spineStone, spine + 6.147, L, sp, valleyY, [-1, 1]);', REAL),
    ('the east arcade left out', SHED, 'buildSpineWall(eastArcade, spineStone, eastArcadeU(layout), L, sp, sp, [-1]);', '', 'the swept walls include the east arcade'),
    ('the east arcade on platform 0\'s line', SHED, 'buildSpineWall(eastArcade, spineStone, eastArcadeU(layout), L, sp, sp, [-1]);', 'buildSpineWall(eastArcade, spineStone, eastArcadeU(layout) + 7.2, L, sp, sp, [-1]);', REAL),
    ('the north pier wide enough to crowd platform 4\'s trains', SHED, 'NORTH_PIER = { half: 1.4,', 'NORTH_PIER = { half: 2.0,', 'the north pier\'s faces'),
    ('tall triangles dropped from the sweep', SWEEP, 'if (Math.min(a.y, b.y, c.y) > top) continue;', 'if (Math.max(a.y, b.y, c.y) > top) continue;', 'as it stood closed'),
    ('the sweep stops short of the north end', SWEEP, 'v < layout.length + SWEEP.north', 'v < layout.length - 5', 'the sweep covers every'),
    ('the envelope is not turned along the track', SWEEP, 'frame.set(dz, 0, dx, x0, 0, 1, 0, 0, -dx, 0, dz, z0, 0, 0, 0, 1);', 'frame.set(1, 0, 0, x0, 0, 1, 0, 0, 0, 0, 1, z0, 0, 0, 0, 1);', 'a wall a few centimetres'),
    ('only the bounding boxes are compared', SWEEP, 'if (!local.intersectsTriangle(lt)) continue;', '', 'a wall a few centimetres'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'tools/tests/track-walls.test.mjs'], cwd=work, timeout=120)

with tempfile.TemporaryDirectory(prefix='track-walls-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web', 'tools'):
        shutil.copytree(src / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    baseline = run(work)
    (out / 'baseline.log').write_text(baseline.stdout + baseline.stderr)
    if baseline.returncode:
        raise SystemExit('BASELINE NOT GREEN\n' + baseline.stdout + baseline.stderr)
    passing = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    caught = 0
    failures = []
    for i, (label, rel, old, new, expected) in enumerate(MUTATIONS, 1):
        file = work / rel
        original = file.read_text()
        if old not in original:
            raise SystemExit(f'missing mutation anchor: {label}')
        file.write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap: not a kill
            file.write_text(original)
            (out / f'mutation-{i}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
            failures.append(label)
            print(f'[SURVIVED] {label} ({kxmut.why(error)}; that is not a kill)', flush=True)
            continue
        file.write_text(original)
        (out / f'mutation-{i}.log').write_text(result.stdout + result.stderr)
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        if result.returncode and any(expected in name for name in failed) and 'AssertionError' in result.stdout and 'ERR_MODULE_NOT_FOUND' not in result.stderr:
            caught += 1
            print(f'[CAUGHT] {label} -> {expected}', flush=True)
        else:
            failures.append(label)
            print(f'[SURVIVED] {label}', flush=True)
    print(f'{caught}/{len(MUTATIONS)} mutations caught; baseline {len(passing)} tests passed; survivors: {failures}')
    raise SystemExit(1 if failures or len(passing) != 6 else 0)
