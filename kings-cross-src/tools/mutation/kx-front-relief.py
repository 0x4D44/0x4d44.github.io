"""Catch south-front relief, porch infill and canopy regressions (round 5, A2/A3) through web/tests/kx-front-relief.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-relief.py SOURCE WORKTREE_SCRATCH
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

MUTATIONS = [
    ('impost string course omitted', 'web/src/shed.ts',
     "  proud(spine, GROUND_Y + FRONT_RELIEF.impostAboveGround, FW + toMass, FRONT_RELIEF.impostHeight, FRONT_RELIEF.impostOut); // string course over the arcade's crowns\n",
     '', 'proud stone string courses'),
    ('arch orders flattened to one depth', 'web/src/shed.ts',
     'depth: FRONT_THICK + (i + 1) * FRONT_RELIEF.orderStep', 'depth: FRONT_THICK + FRONT_RELIEF.orderStep',
     'reveal steps back in three orders'),
    ('porch glass omitted (pushed 5 m back, out of the opening)', 'web/src/shed.ts',
     'g.translate(0, 0, -PORCH_DEPTH.glass); // round 20', 'g.translate(0, 0, -PORCH_DEPTH.glass - 5); // round 20',
     'each of the six lower openings carries glazing'),
    ('porch mullions omitted', 'web/src/shed.ts',
     'for (let k = 1; k < PORCH_INFILL.bays; k++)', 'for (let k = 1; k < 1; k++)',
     'each of the six lower openings carries glazing'),
    ('canopy raised to the sill', 'web/src/shed.ts', 'top: 3.85,', 'top: 5.0,', 'the low canopy of the current front'),
    ('orders back to the 0.15 m step', 'web/src/shed.ts', 'orderStep: 0.28,', 'orderStep: 0.15,', 'reveal steps back in three orders'),
    ('no fourth order', 'web/src/shed.ts', 'innerOrder: true,', 'innerOrder: false,', 'reveal steps back in three orders'),
    ('no bed mould under the cornice', 'web/src/shed.ts',
     "  proud(spine, frontTop - 0.9 - bh / 2, FW + toMass, bh, bo); // its bed mould: a step under the overhang, so its soffit reads\n", '',
     'parapet cornice overhangs'),
    ('canopy dropped from the porch mesh', 'web/src/shed.ts',
     "mergeGeometries([entryRingGeo, canopyGeo], true), [material('stone'), frontSteel]",
     "mergeGeometries([entryRingGeo], true), [material('stone')]", 'the low canopy of the current front'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-relief.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-relief-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web'):
        shutil.copytree(src / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    baseline = run(work)
    (out / 'baseline.log').write_text(baseline.stdout + baseline.stderr)
    if baseline.returncode:
        raise SystemExit(baseline.stdout + baseline.stderr)
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
    raise SystemExit(1 if failures or len(passing) != 5 else 0)
