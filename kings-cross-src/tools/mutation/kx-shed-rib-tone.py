"""Catch round S5 shed regressions (B1: the ribs and haunch rings a mid blue-grey by day, RIB_DAY_LIFT and RIB_DAY_GLOW; ribPaint itself at night) through
web/tests/kx-shed-rib-tone.test.ts and the relaxed lining bound in web/tests/kx-shed-round2.test.ts.
Usage: python3 -I -u tools/mutation/kx-shed-rib-tone.py SOURCE WORKTREE_SCRATCH
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
    ('no glow by day', 'web/src/shed.ts', '  m.emissive.copy(original.color).multiplyScalar(RIB_DAY_LIFT * RIB_DAY_GLOW);', '', 'B1 S5: by day'),
    ('too little glow', 'web/src/shed.ts', 'export const RIB_DAY_GLOW = 0.58;', 'export const RIB_DAY_GLOW = 0.4;', 'B1 S5: by day'),
    ('too much glow', 'web/src/shed.ts', 'export const RIB_DAY_GLOW = 0.58;', 'export const RIB_DAY_GLOW = 1.2;', 'B1 S5: by day'),
    ('the ribs washed out', 'web/src/shed.ts', 'export const RIB_DAY_LIFT = 2.5;', 'export const RIB_DAY_LIFT = 8;', 'three times darker'),
    ('a grey glow, not blue-grey', 'web/src/shed.ts', '  m.emissive.copy(original.color).multiplyScalar(RIB_DAY_LIFT * RIB_DAY_GLOW);', '  m.emissive.setScalar(0.06);', 'B1 S5: by day'),
    ('the glow on the shared paint, so at night too', 'web/src/shed.ts', '  m.emissive.copy(original.color).multiplyScalar(RIB_DAY_LIFT * RIB_DAY_GLOW);', '  original.emissive.copy(original.color).multiplyScalar(RIB_DAY_LIFT * RIB_DAY_GLOW); m.emissive.copy(original.emissive);', 'B1 S5: at night'),
    ('the ribs keep the day paint at night', 'web/src/shed.ts', "  withBuildingNightMaterial(ribs, material('ribPaint'));", '', 'B1 S5: at night'),
    ('the rings in the dark paint by day', 'web/src/shed.ts', 'new THREE.TorusGeometry(HAUNCH_RING.radius, HAUNCH_RING.tube, 4, 16), ribDay()', "new THREE.TorusGeometry(HAUNCH_RING.radius, HAUNCH_RING.tube, 4, 16), material('ribPaint')", 'B1 S5: by day'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-shed-rib-tone.test.ts', 'web/tests/kx-shed-round2.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-shed-rib-tone-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web', 'tools/tests'):
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
    raise SystemExit(1 if failures or len(passing) != 6 else 0)
