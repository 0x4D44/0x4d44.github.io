"""Catch tower round 3's regressions (eight stepped cream modillions, the cyma, lead edge and gutter lip, the slim vane on its spike, the graded night wash) through web/tests/kx-tower-round3.test.ts only.
Usage: python3 -I -u tools/mutation/kx-tower-round3.py SOURCE WORKTREE_SCRATCH
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
    ('seven brackets', 'web/src/shed.ts', 'perFace: 8,', 'perFace: 7,', 'eight separate stepped modillions'),
    ('one block, not stepped', 'web/src/shed.ts', 'tiers: [[0, 0.35, 0.45], [0.35, 0.8, 0.8]]', 'tiers: [[0, 0.8, 0.8]]', 'eight separate stepped modillions'),
    ('shallow steps', 'web/src/shed.ts', 'tiers: [[0, 0.35, 0.45], [0.35, 0.8, 0.8]]', 'tiers: [[0, 0.35, 0.3], [0.35, 0.8, 0.5]]', 'eight separate stepped modillions'),
    ('round 2b\'s deep brackets', 'web/src/shed.ts', 'tiers: [[0, 0.35, 0.45], [0.35, 0.8, 0.8]]', 'tiers: [[0, 0.36, 0.6], [0.36, 0.8, 1.1]]', 'eight separate stepped modillions'),
    ('gaps filled', 'web/src/shed.ts', 'bracket: { width: 0.44, height: 0.8 }', 'bracket: { width: 0.62, height: 0.8 }', 'eight separate stepped modillions'),
    ('no cream', 'web/src/shed.ts', 'cream: [1.6, 1.53, 1.33]', 'cream: [1, 1, 1]', 'eight separate stepped modillions'),
    ('no vertex colour at night', 'web/src/shed.ts', 'stoneNight.vertexColors = true;', 'stoneNight.vertexColors = false;', 'eight separate stepped modillions'),
    ('no cyma', 'web/src/shed.ts', 'cyma: { height: 0.11, out: 0.05 }', 'cyma: { height: 0.11, out: -0.05 }', 'moulded cyma'),
    ('no gutter lip', 'web/src/shed.ts', 'lip: { height: 0.07, thick: 0.04 }', 'lip: { height: 0.001, thick: 0.04 }', 'moulded cyma'),
    ('a solid band, not a lip', 'web/src/shed.ts', 'lip: { height: 0.07, thick: 0.04 }', 'lip: { height: 0.07, thick: 0.5 }', 'moulded cyma'),
    ('thick lead edge', 'web/src/shed.ts', "tslate.box([0, capBase + cyma.height + lead / 2, 0], [2 * hb, lead, 2 * hb]", "tslate.box([0, capBase + lead / 2, 0], [2 * hb, lead + 2 * cyma.height, 2 * hb]", 'moulded cyma'),
    ('no spike', 'web/src/shed.ts', 'const s = 0.035, base: V3[]', 'const s = 0.035 * 0, base: V3[]', 'slim gilded arrow'),
    ('blunt mast to the top', 'web/src/shed.ts', 'vane.box([0, (capTop - 0.15 + spikeFoot) / 2, 0], [0.045, spikeFoot - capTop + 0.15, 0.045]);', 'vane.box([0, (capTop - 0.15 + CLOCK_TOWER_HEIGHT) / 2, 0], [0.045, CLOCK_TOWER_HEIGHT - capTop + 0.15, 0.045]);', 'slim gilded arrow'),
    ('tall flag again', 'web/src/shed.ts', 'tail: { from: 0.4, half: 0.12 }', 'tail: { from: 0.4, half: 0.26 }', 'slim gilded arrow'),
    ('no arrowhead', 'web/src/shed.ts', 'for (const shape of [arrow, banner])', 'for (const shape of [banner])', 'slim gilded arrow'),
    ('flat yellow', 'web/src/shed.ts', 'gilt.color.set(0xb8923f);', 'gilt.color.set(0xf0d040);', 'slim gilded arrow'),
    ('gaps unshaded', 'web/src/shed.ts', 'shade: 0.4, uvLift: 10,', 'shade: 1, uvLift: 10,', 'painted in shade'),
    ('gaps black', 'web/src/shed.ts', 'shade: 0.4, uvLift: 10,', 'shade: 0.15, uvLift: 10,', 'painted in shade'),
    ('foot shade back on the cornice', 'web/src/shed.ts', 'shade: 0.4, uvLift: 10,', 'shade: 0.4, uvLift: 0,', 'painted in shade'),
    ('foot shade back on the modillions', 'web/src/shed.ts', 'for (let i = 0; i < fine.count; i++) fine.uvs[2 * i + 1] += TOWER_ROUND3.uvLift;', '', 'painted in shade'),
    ('soffit flat', 'web/src/shed.ts', "colors: [shaded, shaded, cream, cream]", "colors: [cream, cream, cream, cream]", 'painted in shade'),
    ('modillions cast again', 'web/src/shed.ts', 'castsOnly(stone, shadowTriangles);', 'castsOnly(stone, ts.triangles);', 'shadow pass draws at most'),
    ('modillions at the head of the index', 'web/src/shed.ts', 'fine.box(at, nx === 0', 'ts.box(at, nx === 0', 'shadow pass draws at most'),
    ('the eye pass keeps the short range', 'web/src/shed.ts', 'geometry.setDrawRange(0, Infinity);', 'geometry.setDrawRange(0, triangles * 3);', 'shadow pass draws at most'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-tower-round3.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-tower-round3-', dir=out) as tmp:
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
