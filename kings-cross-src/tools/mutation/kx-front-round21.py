"""Catch round 21's south-front regressions (the spandrels' framed panels, A2; the end piers' rise and the parapet step, A1; the porch openings' figures and dark returns, A3) through web/tests/kx-front-round21.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round21.py SOURCE WORKTREE_SCRATCH
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
    ('no spandrel band', 'web/src/shed.ts', "      brick.box([(xa + xb) / 2, yTop - band / 2, out / 2], [xb - xa, band, out], { skip: ['-z'] });", "", 'A2: each great arch'),
    ('no side strips', 'web/src/shed.ts', "        if (yArc < yBand - 0.3) brick.box(", "        if (yArc < -1e9) brick.box(", 'A2: each great arch'),
    ('a frame too proud', 'web/src/shed.ts', "FRONT_TYMPANUM = { out: 0.3,", "FRONT_TYMPANUM = { out: 0.6,", 'A2: each great arch'),
    ('piers stop at the coping', 'web/src/shed.ts', "proud((inner + mid) / 2, (GROUND_Y + 0.5 + top) / 2, 1.0 + feet, top - GROUND_Y - 0.5, face);", "proud((inner + mid) / 2, (GROUND_Y + 0.5 + frontTop - 0.5) / 2, 1.0 + feet, frontTop - 0.5 - GROUND_Y - 0.5, face);", 'A1: the end piers'),
    ('no parapet step', 'web/src/shed.ts', "    brick.box([xc, coped + step / 2, -FRONT_THICK / 2], [stepRun, step, FRONT_THICK], { skip: ['-y', '-z'] });", "", 'A1: the end piers'),
    ('the step all along', 'web/src/shed.ts', "FRONT_PIERS = { rise: 2.8, cap: 0.45, step: 0.6, stepRun: 3.0,", "FRONT_PIERS = { rise: 2.8, cap: 0.45, step: 0.6, stepRun: 30.0,", 'A1: the end piers'),
    ('no figures', 'web/src/shed.ts', "for (let k = 0; k < PORCH_DEPTH.figures; k++) {", "for (let k = 0; k < 0; k++) {", 'A3: each porch opening'),
    ('no dark returns', 'web/src/shed.ts', "      frames.poly([[rx, entryFoot, 0], [rx, entryFoot, -PORCH_DEPTH.glass]", "      if (x > 1e9) frames.poly([[rx, entryFoot, 0], [rx, entryFoot, -PORCH_DEPTH.glass]", 'A3: each porch opening'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round21.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round21-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 5 else 0)
