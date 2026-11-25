"""Catch B7 round 5 item 0's regression (the walls' sun, SHED_WALL_SUN, back on the south front, its porch, the tower or the north end's outer face,
or gone from the walls under the roof) through web/tests/kx-interior-light-b7-round5.test.ts and -round4.test.ts.
Usage: python3 -I -u tools/mutation/kx-interior-light-b7-round5.py SOURCE WORKTREE_SCRATCH
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
    ('the round-4b gate (shedInside alone)', 'web/src/lighting.ts', '* shedUnder( cameraPosition', '* shedInside( cameraPosition', 'round 5 item 0'),
    ('the front cut to 5 cm', 'web/src/lighting.ts', 'SHED_UNDER = { ends: [1.3, 1.5] }', 'SHED_UNDER = { ends: [0.0, 0.05] }', 'round 5 item 0'),
    ('the front cut short of the porch infill', 'web/src/lighting.ts', 'SHED_UNDER = { ends: [1.3, 1.5] }', 'SHED_UNDER = { ends: [0.5, 0.7] }', 'round 5 item 0'),
    ('the cut eats the walls under the roof', 'web/src/lighting.ts', 'SHED_UNDER = { ends: [1.3, 1.5] }', 'SHED_UNDER = { ends: [3.5, 5.0] }', 'round 5 item 0'),
    ('the south end only', 'web/src/lighting.ts', 'toFixed(2)}, min( -q.z, uShedSize.w + q.z ) );', 'toFixed(2)}, -q.z );', 'round 5 item 0'),
    ('the north end only', 'web/src/lighting.ts', 'toFixed(2)}, min( -q.z, uShedSize.w + q.z ) );', 'toFixed(2)}, uShedSize.w + q.z );', 'round 5 item 0'),
    ('no vault gate', 'web/src/lighting.ts', '  return shedInside( p ) * smoothstep(', '  return smoothstep(', 'round 4b'),
]


def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-interior-light-b7-round4.test.ts', 'web/tests/kx-interior-light-b7-round5.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-interior-light-b7-round5-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 4 else 0)
