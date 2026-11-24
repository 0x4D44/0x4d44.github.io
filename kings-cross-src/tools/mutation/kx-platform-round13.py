"""Catch round 13's platform regressions (the edge strip's bands, B4; the platform clock on its bracket, B5) through
web/tests/kx-platform-round13.test.ts only.
Usage: python3 -I -u tools/mutation/kx-platform-round13.py SOURCE WORKTREE_SCRATCH
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

MUTATIONS = [  # re-anchored rounds 14 and 15: the edge layout and the clock's faces and arm changed (kx-platform-round14.py holds round 14's own)
    ('the dark tarmac band back', 'web/src/materials.ts', "band(0.2, 1.6, '#767571');", "band(0.2, 1.6, '#4a4d52');", 'B4'),
    ('the white line back', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a'); // the tactile strip, a muted yellow-khaki", "band(0.5, 0.9, '#92886a'); band(1.05, 1.15, '#e6e6de'); // the tactile strip, a muted yellow-khaki", 'B4'),
    ('the tactile strip yellow again', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a');", "band(0.5, 0.9, '#d9b21a');", 'B4'),
    ('a yellow line back', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a'); // the tactile strip, a muted yellow-khaki", "band(0.5, 0.9, '#92886a'); band(0.6, 0.7, '#d9b21a'); // the tactile strip, a muted yellow-khaki", 'B4'),
    ('the tactile straight behind the coping, as round 13 had it', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a');", "band(0.2, 0.6, '#92886a');", 'B4'),
    ('no clock', 'web/src/shed.ts', '  group.add(buildPlatformClock(L));\n', '', 'B5'),
    ('the clock floats off the wall', 'web/src/shed.ts', "iron.box([x0 + beam / 2, beamY, z], [beam, bd, 0.12]);", "iron.box([x0 + beam / 2 + 0.5, beamY, z], [beam - 1, bd, 0.12]);", 'B5'),
    ('one face', 'web/src/shed.ts', "  const faces = [1, -1].map((s) => {", "  const faces = [1].map((s) => {", 'B5'),
    ('no hands', 'web/src/shed.ts', "  g.userData.clockDials = [1, -1].map(", "  g.userData.clockDials = [].map(", 'B5'),
    ('the clock casts', 'web/src/lighting.ts', "'shed-arch-rings',", "'shed-arch-rings', 'shed-platform-clock-iron',", 'B5'),
    ('the clock at the roof', 'web/src/shed.ts', 'export const PLATFORM_CLOCK = { v: 0.638, y: 5.2,', 'export const PLATFORM_CLOCK = { v: 0.638, y: 9.2,', 'B5'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-platform-round13.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-platform-round13-', dir=out) as tmp:
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
