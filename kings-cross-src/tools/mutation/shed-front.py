"""Catch lower-front geometry regressions through the F4 assertion suite only.
Usage: python3 -I -u tools/mutation/shed-front.py SOURCE WORKTREE_SCRATCH
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
    ('porch openings narrowed', 'openingWidth: 6.8', 'openingWidth: 5.2', 'the ground-floor porch has six broad arches'),
    ('one arch removed from each side', 'perSide: 3', 'perSide: 2', 'the ground-floor porch has six broad arches'),
    ('holes replaced by closed brick',
     'for (const x of entryCentres) outline.holes.push(segmentalArchOpening(x, entryFoot, entryR, SOUTH_FRONT_ARCADES.jambHeight, SOUTH_FRONT_ARCADES.archRise));',
     'for (const x of entryCentres) void segmentalArchOpening(x, entryFoot, entryR, SOUTH_FRONT_ARCADES.jambHeight, SOUTH_FRONT_ARCADES.archRise);',
     'the ground-floor porch has six broad arches'),
    ('plinth closes the doorways',
     '''let plinthStart = -0.4;
  for (const x of entryCentres) {
    const left = x - entryR, right = x + entryR;
    if (left > plinthStart) proud((plinthStart + left) / 2, GROUND_Y + 0.7, left - plinthStart, 1.4, 0.35);
    plinthStart = right;
  }
  if (plinthStart < W + 0.4) proud((plinthStart + W + 0.4) / 2, GROUND_Y + 0.7, W + 0.4 - plinthStart, 1.4, 0.35); // plinth interrupted at each entrance''',
     'proud(W / 2, GROUND_Y + 0.7, W + 0.8, 1.4, 0.35); // plinth mutation',
     'the openings pass through the plinth while their piers and low sill remain solid'),
    ('five arch rings omitted', 'const entryRings = entryCentres.map(', 'const entryRings = entryCentres.slice(0, 1).map(',
     'each entrance has a visible stone arch ring on the south face'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/shed-front.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='shed-front-', dir=out) as tmp:
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
    for i, (label, old, new, expected) in enumerate(MUTATIONS, 1):
        file = work / 'web/src/shed.ts'
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
