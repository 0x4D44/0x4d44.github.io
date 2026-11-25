"""Catch round F16 regressions (front A6: each north-gable pane holds its own tone from outside by day, about +-8 levels head-on and more aslant, on panes a
third of the tier tall; the gables' transoms every third of a tier, seven rows over the crown) through web/tests/kx-front-round38.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round38.py SOURCE WORKTREE_SCRATCH
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
    ('per pixel, not per pane', 'web/src/materials.ts', 'vec2 gn = ( floor( vec2(', 'vec2 gn = ( ( vec2(', 'holds its own tone'),
    ('the old tall panes', 'web/src/materials.ts', 'row: GLAZING.tier / 3,', 'row: GLAZING.tier,', 'holds its own tone'),
    ('loud panes', 'web/src/materials.ts', 'pane: 0.12, graze:', 'pane: 0.2, graze:', 'holds its own tone'),
    ('faint panes', 'web/src/materials.ts', 'pane: 0.12, graze:', 'pane: 0.07, graze:', 'holds its own tone'),
    ('no more aslant', 'web/src/materials.ts', 'graze: 0.25,', 'graze: 0,', 'holds its own tone'),
    ('the rows inside too', 'web/src/materials.ts', '${GLAZING.tier} ) ) + 0.5 ) * vec2( ${GLAZING.spacing}, ${GLAZING.tier} ) + vec2( uPaneX', '${glslFloat(GABLE_SHEET.row)} ) ) + 0.5 ) * vec2( ${GLAZING.spacing}, ${glslFloat(GABLE_SHEET.row)} ) + vec2( uPaneX', 'holds its own tone'),
    ('no new transoms', 'web/src/shed.ts', 'if (k % GABLE_TRANSOM.split === 0) continue;', 'continue;', 'transoms every third'),
    ('heavy transoms', 'web/src/shed.ts', 'split: 3, width: 0.07 }', 'split: 3, width: 0.15 }', 'transoms every third'),
    ('transoms off the grid', 'web/src/shed.ts', '(r * k) / (3 * GABLE_TRANSOM.split), half', '(r * k) / (3 * GABLE_TRANSOM.split) + 0.3, half', 'transoms every third'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round38.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round38-', dir=out) as tmp:
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
