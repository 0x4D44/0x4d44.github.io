"""Catch round F15b regressions (front A6: from outside by day the room behind the gables shows at 0.3-0.5 of F15's contrast; the cloud's patches are shapes,
a full core near the middle of each gable in north-gable and an edge of 1-3 panes) through web/tests/kx-front-round36.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round36.py SOURCE WORKTREE_SCRATCH
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
    ('the F15 opacity', 'web/src/shed.ts', 'opacity: 0.982,', 'opacity: 0.955,', 'a dark rib'),
    ('an opaque sheet', 'web/src/shed.ts', 'opacity: 0.982,', 'opacity: 0.999,', 'a dark rib'),
    ('the old core', 'web/src/materials.ts', 'core: [0.06, 0.8]', 'core: [0.05, 0.95]', 'cloud is shapes'),
    ('a hard edge', 'web/src/materials.ts', 'core: [0.06, 0.8]', 'core: [0.4, 0.45]', 'cloud is shapes'),
    ('a glow', 'web/src/materials.ts', 'core: [0.06, 0.8]', 'core: [0.0, 1.0]', 'cloud is shapes'),
    ('the old phase', 'web/src/materials.ts', 'phase: [0.8, 4.95]', 'phase: [0.8, 1.7]', 'cloud is shapes'),
    ('cores off the middle', 'web/src/materials.ts', 'phase: [0.8, 4.95]', 'phase: [2.4, 4.95]', 'cloud is shapes'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round36.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round36-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 2 else 0)
