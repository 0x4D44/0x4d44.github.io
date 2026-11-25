"""Catch round 9's roof regressions (the north gables' dark end ribs, the crown seams' paler paint) through
web/tests/kx-roof-round9.test.ts only.
Usage: python3 -I -u tools/mutation/kx-roof-round9.py SOURCE WORKTREE_SCRATCH
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
    ('gable ring back in stone', 'web/src/shed.ts', "material('ribPaint'), 'shed-arch-rings')", "material('stone'), 'shed-arch-rings')", 'north gable is framed'),
    ('end rib back to 0.7 m', 'web/src/shed.ts', 'gableRib: [0.9, 0.6],', 'gableRib: [0.7, 0.6],', 'north gable is framed'),
    ('end rib flush with the glass', 'web/src/shed.ts', 'gableRib: [0.9, 0.6],', 'gableRib: [0.9, 0.2],', 'north gable is framed'),
    ('seams in the ribs\' paint', 'web/src/shed.ts', "skip: ['+x', '-x', '-y', '+z', '-z'], color: seamPaint });", "skip: ['+x', '-x', '-y', '+z', '-z'] });", "crown's seams are a paler paint"),
    ('seams white', 'web/src/shed.ts', 'seamColour: 0x7d8a94,', 'seamColour: 0xffffff,', "crown's seams are a paler paint"),
    ('rib caps paler too', 'web/src/shed.ts', "{ rotZ: Math.atan2(q[1] - p[1], q[0] - p[0]), skip: ['+x', '-x', '-y'] });\n      }\n    }\n    // the heavier end rib", "{ rotZ: Math.atan2(q[1] - p[1], q[0] - p[0]), skip: ['+x', '-x', '-y'], color: seamPaint });\n      }\n    }\n    // the heavier end rib", "crown's seams are a paler paint"),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-roof-round9.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-roof-round9-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 2 else 0)
