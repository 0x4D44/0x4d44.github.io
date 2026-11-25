"""Catch round A2's regressions (four brick orders round each great lunette arch stepping about 0.4 m, each step a soffit casting an arc shadow, the
screen recessed behind the innermost order, no new triangle) through web/tests/kx-front-a2-orders.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-a2-orders.py SOURCE WORKTREE_SCRATCH
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
    ('round 27\'s shallow steps', 'web/src/shed.ts', 'orderStep: 0.4, set: 0.22,', 'orderStep: 0.28, set: 0.22,', 'four stepped orders'),
    ('two orders', 'web/src/shed.ts', 'FRONT_RELIEF = { orders: 3,', 'FRONT_RELIEF = { orders: 2,', 'four stepped orders'),
    ('the stack not set back: past the impost', 'web/src/shed.ts', 'orderStep: 0.4, set: 0.22,', 'orderStep: 0.4, set: 0,', 'four stepped orders'),
    ('the impost back at 1.0 m', 'web/src/shed.ts', 'impost: { height: 0.35, out: 1.1,', 'impost: { height: 0.35, out: 1.0,', 'four stepped orders'),
    ('the fourth order flush with the face', 'web/src/shed.ts', 'zi = FRONT_THICK + frontOrderZ(-1);', 'zi = FRONT_THICK;', 'four stepped orders'),
    ('set back too far: the frame band over the crown', 'web/src/shed.ts', 'orderStep: 0.4, set: 0.22,', 'orderStep: 0.4, set: 0.38,', "face is foremost"),
    ('round 26\'s wide splay', 'web/src/shed.ts', 'set: 0.22, splay: 0.15,', 'set: 0.22, splay: 0.22,', 'arc shadow'),
    ('a flat chamfer for the shallow order', 'web/src/shed.ts', 'sw = (splay * (zFace - zBack)) / FRONT_RELIEF.orderStep;', 'sw = splay;', 'each step is a soffit'),
    ('a sliver at the soffit\'s foot', 'web/src/shed.ts', 'const ro = R / Math.cos(Math.PI / (2 * n));', 'const ro = R;', 'arc shadow'),
    ('the glass forward in the opening', 'web/src/shed.ts', 'g.translate(0, 0, -FRONT_THICK / 2 - 0.1);', 'g.translate(0, 0, -0.1);', 'glazing screen'),
    ('the bars forward', 'web/src/shed.ts', 'addBars(bars, lunetteBars(uc, sp), -FRONT_THICK / 2);', 'addBars(bars, lunetteBars(uc, sp), -0.2);', 'glazing screen'),
    ('the fourth order wider, into the opening', 'web/src/shed.ts', 'const u = uc - fx0, w = FRONT_RELIEF.orderWidth, n = 14,', 'const u = uc - fx0, w = FRONT_RELIEF.orderWidth + 0.3, n = 14,', 'glazing screen'),
    ('a finer fourth order', 'web/src/shed.ts', 'const u = uc - fx0, w = FRONT_RELIEF.orderWidth, n = 14,', 'const u = uc - fx0, w = FRONT_RELIEF.orderWidth, n = 16,', 'no new triangle'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-a2-orders.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-a2-orders-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 6 else 0)
