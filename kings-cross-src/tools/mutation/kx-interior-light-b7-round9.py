"""Catch B7 round 9's regressions (the across-the-shed camera shed-across-west gone, unlisted, moved off platform 5, aimed along the shed,
dropped to platform-eye height or into the sample lner5's length; `--trains demo` gone, on by default, accepted without --views, or not
reaching the station views' page query) through web/tests/kx-interior-light-b7-round9.test.ts.
Usage: python3 -I -u tools/mutation/kx-interior-light-b7-round9.py SOURCE WORKTREE_SCRATCH
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
    ('no across camera', 'tools/evidence.mjs', "  'shed-across-west': {", "  'shed-across-west-x': {", 'round 9 shed-across-west'),
    ('not a shed view', 'tools/evidence.mjs', ", 'platform-eye-crown-west', 'shed-across-west'],", ", 'platform-eye-crown-west'],", 'round 9 shed-across-west'),
    ('on platform 4 (east of the spine)', 'tools/evidence.mjs', '    pos: [39.9098, 6.5, -191.8342],', '    pos: [45.9098, 6.5, -191.6342],', 'round 9 shed-across-west'),
    ('at platform-eye height', 'tools/evidence.mjs', '    pos: [39.9098, 6.5, -191.8342],', '    pos: [39.9098, 2.5, -191.8342],', 'round 9 shed-across-west'),
    ('inside the lner5 (v 120)', 'tools/evidence.mjs', '    pos: [39.9098, 6.5, -191.8342],\n    target: [21.9168, 0.9, -192.3388],', '    pos: [38.2278, 6.5, -131.8578],\n    target: [20.2348, 0.9, -132.3624],', 'round 9 --trains'),
    ('aimed along the shed', 'tools/evidence.mjs', '    target: [21.9168, 0.9, -192.3388],', '    target: [41.0311, 0.9, -231.8185],', 'round 9 shed-across-west'),
    ('aimed level (roof fills)', 'tools/evidence.mjs', '    target: [21.9168, 0.9, -192.3388],', '    target: [21.9168, 9.5, -192.3388],', 'round 9 shed-across-west'),
    ('a narrow lens', 'tools/evidence.mjs', "looking west across the west vault: island 6/7 under the west crown and the near-wall floor of platform 8 by the west wall',\n    fov: 60,", "looking west across the west vault: island 6/7 under the west crown and the near-wall floor of platform 8 by the west wall',\n    fov: 25,", 'round 9 shed-across-west'),
    ('demo by default', 'tools/evidence.mjs', "  const trains = values.get('--trains') ?? 'none';", "  const trains = values.get('--trains') ?? 'demo';", 'round 9 --trains'),
    ('any --trains accepted', 'tools/evidence.mjs', "  if (!['none', 'demo'].includes(trains)) throw", '  if (false) throw', 'round 9 --trains'),
    ('demo without --views', 'tools/evidence.mjs', "  if (trains !== 'none' && views === 'all') throw", '  if (false) throw', 'round 9 --trains'),
    ('the query ignores it', 'tools/evidence.mjs', "return `?trains=${options.trains === 'demo' ? 'demo' : 'none'}&board=0`;", "return '?trains=none&board=0';", 'round 9 --trains'),
    ('not returned', 'tools/evidence.mjs', 'out, views, pin, hud, scene, commit, trains,', 'out, views, pin, hud, scene, commit,', 'round 9 --trains'),
]


def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-interior-light-b7-round9.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-interior-light-b7-round9-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web', 'tools'):
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
