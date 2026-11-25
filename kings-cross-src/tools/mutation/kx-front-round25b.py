"""Catch round 25b's porch-transom regression (each porch opening's head transom meeting the reveal at both ends, A3) through web/tests/kx-front-round25b.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round25b.py SOURCE WORKTREE_SCRATCH
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
    ('the 746872f2 box, short at its foot', 'web/src/shed.ts', "const yb = entryFoot + (t0 + t1) / 2 - (t1 - t0) / 6, yt = yb + (t1 - t0) / 3, hb = halfAt(yb), ht = halfAt(yt),", "const yb = entryFoot + (t0 + t1) / 2 - (t1 - t0) / 6, yt = yb + (t1 - t0) / 3, hb = halfAt(entryFoot + t1) - 0.02, ht = halfAt(entryFoot + t1) - 0.02,", "A3: each porch opening"),
    ('the ends square at the foot\'s width, into the wall', 'web/src/shed.ts', "hb = halfAt(yb), ht = halfAt(yt),", "hb = halfAt(yb), ht = halfAt(yb),", "A3: each porch opening"),
    ('the ends 5 cm short', 'web/src/shed.ts', "hb = halfAt(yb), ht = halfAt(yt),", "hb = halfAt(yb) - 0.05, ht = halfAt(yt) - 0.05,", "A3: each porch opening"),
    ('the ends 5 cm into the wall', 'web/src/shed.ts', "hb = halfAt(yb), ht = halfAt(yt),", "hb = halfAt(yb) + 0.05, ht = halfAt(yt) + 0.05,", "A3: each porch opening"),
    ('no front face', 'web/src/shed.ts', "{ facing: [0, 0, 1] }); // its front", "{ facing: [0, 0, -1] }); // its front", "A3: each porch opening"),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round25b.test.ts'], cwd=work, timeout=60)

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
    raise SystemExit(1 if failures or len(passing) != 1 else 0)
