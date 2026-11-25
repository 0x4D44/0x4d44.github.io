"""Catch round F15 regressions (front A6: the cloud's cores 35-50% over the pane, lightening only; a third less of the room through the gables from outside by
day, about 0.98 aslant; the sky tint 0.18 aslant, none head-on) through web/tests/kx-front-round35.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round35.py SOURCE WORKTREE_SCRATCH
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
    ('the old cloud', 'web/src/materials.ts', 'lift: 0.2,', 'lift: 0.095,', 'cores sit'),
    ('a loud cloud', 'web/src/materials.ts', 'lift: 0.2,', 'lift: 0.35,', 'cores sit'),
    ('no cores', 'web/src/materials.ts', 'smoothstep( 0.05, 0.95, sin(', 'smoothstep( 0.05, 3.0, sin(', 'cores sit'),
    ('the old opacity', 'web/src/shed.ts', 'opacity: 0.955,', 'opacity: 0.93,', 'a third less'),
    ('opaque glass', 'web/src/shed.ts', 'opacity: 0.955,', 'opacity: 0.99,', 'a third less'),
    ('thin aslant', 'web/src/materials.ts', 'GABLE_THICKEN = { thicken: 0.57,', 'GABLE_THICKEN = { thicken: 0.3,', 'a third less'),
    ('the outside opacity inside', 'web/src/shed.ts', 'm.opacity = (was * (1 - k) + GABLE_OUTSIDE.opacity * k)', 'm.opacity = (GABLE_OUTSIDE.opacity)', 'a third less'),
    ('outside at night', 'web/src/shed.ts', "? 1 - Math.min(1, Math.max(0, night)) : 0;", '? 1 : 0;', 'a third less'),
    ('the old tint', 'web/src/materials.ts', 'tint: 0.18,', 'tint: 0.12,', 'aslant the colour'),
    ('a loud tint', 'web/src/materials.ts', 'tint: 0.18,', 'tint: 0.4,', 'aslant the colour'),
    ('the tint head-on', 'web/src/materials.ts', '${glslFloat(GABLE_SHEET.tint)} * ( 1.0 - smoothstep(', '${glslFloat(GABLE_SHEET.tint)} * ( 1.0 - 0.0 * smoothstep(', 'aslant the colour'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round35.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round35-', dir=out) as tmp:
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
