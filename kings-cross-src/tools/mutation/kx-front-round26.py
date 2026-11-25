"""Catch round 26 south-front regressions (the orders splayed steps and the spandrel panels 0.6 m back, A2; the porch glass 1.05 m back and the interior vignette, A3) through web/tests/kx-front-round26.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round26.py SOURCE WORKTREE_SCRATCH
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
    ('no splay', 'web/src/shed.ts', 'splay: 0.15, innerOrder', 'splay: 0, innerOrder', 'A2: square-on'),
    ('the orders from the back of the wall again', 'web/src/shed.ts', 'zBack = FRONT_THICK + Math.max(0, frontOrderZ(i - 1)),', 'zBack = 0,', 'A2: square-on'),
    ('the splay inward', 'web/src/shed.ts', 'pos.setXY(k, uc - fx0 + (dx * (r0 + sw)) / r, sp + (dy * (r0 + sw)) / r)', 'pos.setXY(k, uc - fx0 + (dx * (r0 - sw)) / r, sp + (dy * (r0 - sw)) / r)', 'A2: square-on'),
    ('the splay on the back edge', 'web/src/shed.ts', 'Math.abs(pos.getZ(k) - zFace) < 1e-6 && Math.abs(r - r0) < 1e-4', 'Math.abs(pos.getZ(k) - zBack) < 1e-6 && Math.abs(r - r0) < 1e-4', 'A2: square-on'),
    ('the panels back at 0.4', 'web/src/shed.ts', 'strip: 0.5, recess: 0.6 }', 'strip: 0.5, recess: 0.4 }', 'A2: each spandrel panel'),
    ('the glass back at 0.8', 'web/src/shed.ts', 'export const PORCH_DEPTH = { glass: 1.05,', 'export const PORCH_DEPTH = { glass: 0.8,', 'A3: the porch glass'),
    ('no side vignette', 'web/src/shed.ts', 'vignette: { edge: 0.45,', 'vignette: { edge: 1.0,', 'A3: the porch glass'),
    ('no ceiling darkening', 'web/src/shed.ts', 'edgeWidth: 0.2, top: 0.5,', 'edgeWidth: 0.2, top: 1.0,', 'A3: the porch glass'),
    ('the vignette over the figures', 'web/src/shed.ts', 'edgeWidth: 0.2, top: 0.5,', 'edgeWidth: 0.45, top: 0.5,', 'A3: the porch glass'),
    ('the ceiling darkening from mid-height', 'web/src/shed.ts', 'top: 0.5, from: 0.85 }', 'top: 0.5, from: 0.5 }', 'A3: the porch glass'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round26.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round25-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 3 else 0)
