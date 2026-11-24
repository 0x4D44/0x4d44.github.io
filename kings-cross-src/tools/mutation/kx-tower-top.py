"""Catch the clock tower's top, projection and the front's lamp/door regressions (round 5, tower pass) through web/tests/kx-tower-top.test.ts only.
Usage: python3 -I -u tools/mutation/kx-tower-top.py SOURCE WORKTREE_SCRATCH
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
    ('clock stage back to 0.92 of the shaft', 'web/src/shed.ts', 'setback: 0.9,', 'setback: 0.25,', 'clock stage is 0.6 to 0.8'),
    ('ten small brackets to a face', 'web/src/shed.ts', 'perFace: 7,', 'perFace: 10,', 'deep bracketed cornice'),
    ('shallow corona', 'web/src/shed.ts', 'overhang: 1.2,', 'overhang: 0.6,', 'deep bracketed cornice'),
    ('pitched hip cap', 'web/src/shed.ts', 'rise: 0.3,', 'rise: 1.3,', 'the cap is near-flat'),
    ('tower 1.5 m proud', 'web/src/shed.ts', 'export const TOWER_PROJECTION = TOWER_SIZE + 0.15;', 'export const TOWER_PROJECTION = 1.5;', 'about its own width proud'),
    ('one-step transition', 'web/src/shed.ts', 'upper: { height: 0.35, out: 0.35 }', 'upper: { height: 0.35, out: 0.15 }', 'heavy stepped stone cornice'),
    ('no weathered slope', 'web/src/shed.ts', 'weather: 0.45 }', 'weather: 0.0001 }', 'heavy stepped stone cornice'),
    ('black vane', 'web/src/shed.ts', 'gilt.color.set(0xc8a24a);', 'gilt.color.set(0x3d4650);', 'heavy stepped stone cornice'),
    ('lamps white by day', 'web/src/shed.ts', 'downlight: 0xb0aca4', 'downlight: 0xf2eee4', 'cheap ones'),
    ('no door stiles', 'web/src/shed.ts', 'for (const dx of [-dw / 2 + 0.06, 0, dw / 2 - 0.06]) frames.box(', 'for (const dx of [] as number[]) frames.box(', 'cheap ones'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-tower-top.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-tower-top-', dir=out) as tmp:
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
