"""Catch round F17 regressions (front A6/B3: every third north-screen mullion heavy; fine glazing bars in the gables' glass, from either side, box-filtered and
faded far off; the outside reflection field's soft zones) through web/tests/kx-front-round40.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round40.py SOURCE WORKTREE_SCRATCH
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
    ('no heavy mullions', 'web/src/shed.ts', 'GABLE_MULLION = { every: 3, heavy: 1.75,', 'GABLE_MULLION = { every: 3, heavy: 0.6,', 'every third mullion'),
    ('every other heavy', 'web/src/shed.ts', 'GABLE_MULLION = { every: 3, heavy: 1.75,', 'GABLE_MULLION = { every: 2, heavy: 1.75,', 'every third mullion'),
    ('too heavy', 'web/src/shed.ts', 'GABLE_MULLION = { every: 3, heavy: 1.75,', 'GABLE_MULLION = { every: 3, heavy: 3.5,', 'every third mullion'),
    ('one fine bar a bay', 'web/src/materials.ts', 'GABLE_FINE = { spacing: GLAZING.spacing / 3,', 'GABLE_FINE = { spacing: GLAZING.spacing / 2,', 'fine glazing bars'),
    ('thick fine bars', 'web/src/materials.ts', 'width: 0.02, shade: 0.55 }', 'width: 0.06, shade: 0.55 }', 'fine glazing bars'),
    ('no fade far off', 'web/src/materials.ts', 'smoothstep( ${glslFloat(GABLE_FINE.spacing / 8)}', '0.0 * smoothstep( ${glslFloat(GABLE_FINE.spacing / 8)}', 'fine glazing bars'),
    ('point sampled', 'web/src/materials.ts', 'min( gfd + 0.5 * gfw,', 'min( gfd + 0.0 * gfw,', 'fine glazing bars'),
    ('bars on every glass', 'web/src/materials.ts', '${glslFloat(GABLE_FINE.shade)} * uGableBars;', '${glslFloat(GABLE_FINE.shade)} * 1.0;', 'fine glazing bars'),
    ('never raised', 'web/src/shed.ts', 'drawn = gableDraw.value; gableDraw.value = 1;', 'drawn = gableDraw.value; gableDraw.value = 0;', 'fine glazing bars'),
    ('never put back', 'web/src/shed.ts', 'glintEven.value = even; gableDraw.value = drawn; };', 'glintEven.value = even; };', 'fine glazing bars'),
    ('a loud reflection', 'web/src/materials.ts', 'GABLE_REFLECT = { amp: 0.28,', 'GABLE_REFLECT = { amp: 0.5,', 'reflection field'),
    ('a faint reflection', 'web/src/materials.ts', 'GABLE_REFLECT = { amp: 0.28,', 'GABLE_REFLECT = { amp: 0.05,', 'reflection field'),
    ('a busy reflection', 'web/src/materials.ts', 'waves: [0.22, 0.05, 0.06, 0.11], blotch', 'waves: [1.2, 0.05, 0.06, 0.11], blotch', 'reflection field'),
    ('the reflection inside', 'web/src/materials.ts', '* gz * uGlintEven;', '* gz;', 'reflection field'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round40.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round40-', dir=out) as tmp:
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
