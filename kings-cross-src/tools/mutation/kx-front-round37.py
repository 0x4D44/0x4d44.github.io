"""Catch round F15c regressions (front A6: from outside the gables by day the roof's bars draw before the gable glass, so it dims them; at night, in x-ray,
inside and from over the roof they draw after every glazing as before) through web/tests/kx-front-round37.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round37.py SOURCE WORKTREE_SCRATCH
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
    ('the bars last again', 'web/src/shed.ts', "ROOF_BARS_ORDER.beforeGable : ROOF_BARS_ORDER.after;", "ROOF_BARS_ORDER.after : ROOF_BARS_ORDER.after;", 'everything in the shed behind'),
    ('the order never set', 'web/src/shed.ts', '    roofBars.renderOrder = roofBarsOrder(', '    void roofBarsOrder(', 'everything in the shed behind'),
    ('before the roof glass', 'web/src/shed.ts', 'beforeGable: (GLASS_SLOTS[1] + GLASS_SLOTS[2]) / 2 }', 'beforeGable: GLASS_SLOTS[0] }', 'still draw after'),
    ('also in x-ray', 'web/src/shed.ts', "return mode !== 'xray' && gableOutside(", "return gableOutside(", 'still draw after'),
    ('also at night', 'web/src/shed.ts', "gableOutside(cam, layout, night) > 0 ? ROOF_BARS_ORDER", "gableOutside(cam, layout, 0) > 0 ? ROOF_BARS_ORDER", 'still draw after'),
    ('everywhere', 'web/src/shed.ts', "return mode !== 'xray' && gableOutside(cam, layout, night) > 0 ?", "return mode !== 'xray' ?", 'still draw after'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round37.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round37-', dir=out) as tmp:
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
