"""Catch round F18 regressions (front A6/B3: the reflection field near front-d's strength, broad and blotchy; the ordinary north-screen mullions fine, the
main ones as F17's; two fine bars a bay, lights about 5:1, the mid-pane bar retired) through web/tests/kx-front-round41.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round41.py SOURCE WORKTREE_SCRATCH
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
    ('the F17 reflection', 'web/src/materials.ts', 'GABLE_REFLECT = { amp: 0.28,', 'GABLE_REFLECT = { amp: 0.15,', 'reflection alone'),
    ('a loud reflection', 'web/src/materials.ts', 'GABLE_REFLECT = { amp: 0.28,', 'GABLE_REFLECT = { amp: 0.45,', 'reflection alone'),
    ('no blotch', 'web/src/materials.ts', 'weight: 0.2 } }', 'weight: 0 } }', 'reflection alone'),
    ('a loud blotch', 'web/src/materials.ts', 'weight: 0.2 } }', 'weight: 0.6 } }', 'reflection alone'),
    ('the blotch smooth', 'web/src/materials.ts', 'blotch: { waves: [0.61, 0.23, -0.37, 0.47]', 'blotch: { waves: [0.0, 0.0, 0.0, 0.0]', 'reflection alone'),
    ('heavy everywhere', 'web/src/shed.ts', 'heavy: 1.75, light: 0.6 }', 'heavy: 1.75, light: 1 }', 'ordinary north-screen mullions'),
    ('hairline mullions', 'web/src/shed.ts', 'heavy: 1.75, light: 0.6 }', 'heavy: 1.75, light: 0.3 }', 'ordinary north-screen mullions'),
    ('three fine bars again', 'web/src/materials.ts', 'GABLE_FINE = { spacing: GLAZING.spacing / 3,', 'GABLE_FINE = { spacing: GLAZING.spacing / 4,', 'two fine bars a bay'),
    ('the mid-pane bar back', 'web/src/materials.ts', 'soft: 0.06, shade: 0 }', 'soft: 0.06, shade: 0.3 }', 'two fine bars a bay'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round41.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round41-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web', 'tools'):  # the whole tools package: the test imports tools/evidence.mjs and its siblings
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
