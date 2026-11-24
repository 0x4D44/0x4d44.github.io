"""Catch round 22's south-front regressions (the end piers as masses and the step's coping, A1; the orders' feet on the springing course and the deeper spandrel frame, A2; the interior plane's vertical gradient, A3) through web/tests/kx-front-round22.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round22.py SOURCE WORKTREE_SCRATCH
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
    ('no pier mass', 'web/src/shed.ts', "    brick.box([(mid + outer) / 2, (GROUND_Y + top) / 2, (po - FRONT_THICK - 0.02) / 2], [width - 1.0 - feet, top - GROUND_Y, FRONT_THICK + 0.02 + po]);", "", 'A1: each end pier is a mass'),
    ('the mass flush with the screen', 'web/src/shed.ts', "(po - FRONT_THICK - 0.02) / 2], [width - 1.0 - feet, top - GROUND_Y, FRONT_THICK + 0.02 + po]);", "(0 - FRONT_THICK - 0.02) / 2], [width - 1.0 - feet, top - GROUND_Y, FRONT_THICK + 0.02 + 0]);", 'A1: each end pier is a mass'),
    ('the mass stops at the coping', 'web/src/shed.ts', "[(mid + outer) / 2, (GROUND_Y + top) / 2, (po - FRONT_THICK - 0.02) / 2], [width - 1.0 - feet, top - GROUND_Y,", "[(mid + outer) / 2, (GROUND_Y + coped) / 2, (po - FRONT_THICK - 0.02) / 2], [width - 1.0 - feet, coped - GROUND_Y,", 'A1: each end pier is a mass'),
    ('no cap', 'web/src/shed.ts', "    stone.box([(inner + outer) / 2, top + cap / 2,", "    if (top < 0) stone.box([(inner + outer) / 2, top + cap / 2,", 'A1: each end pier is a mass'),
    ('a cap flush with the mass', 'web/src/shed.ts', "[width + 0.5, cap, FRONT_THICK + 0.5 + po]", "[width + 0.5, cap, FRONT_THICK + po]", 'A1: each end pier is a mass'),
    ('the step coped as before', 'web/src/shed.ts', "stone.box([xc + sd * 0.075, coped + step + 0.15, (0.4 - FRONT_THICK) / 2], [stepRun + 0.15, 0.3, FRONT_THICK + 0.4], { skip: ['-z'] });", "stone.box([xc, coped + step + 0.1, 0.1 - FRONT_THICK / 2], [stepRun, 0.2, FRONT_THICK + 0.2], { skip: ['-y', '-z'] });", "A1: the parapet's step"),
    ('orders spring above the course', 'web/src/shed.ts', "archRing(uc - fx0, sp, r0, rOut)", "archRing(uc - fx0, sp + 1.0, r0, rOut)", 'A2: at the front'),
    ('no impost under the feet', 'web/src/shed.ts', "[[fx0 - feet - 0.05, fx0 + span], [fx1 - span, fx1 + feet + 0.05]]", "[[fx0 - 0.05, fx0 + span], [fx1 - span, fx1 + 0.05]]", 'A2: at the front'),
    ('the springing course stops at the front', 'web/src/shed.ts', "[FW + 0.8 + across, sc.height,", "[FW + 0.8, sc.height,", 'A2: at the front'),
    ('the frame flush', 'web/src/shed.ts', "FRONT_TYMPANUM = { out: 0.5, band: 0.45, strip: 0.5, recess: 0.6 }", "FRONT_TYMPANUM = { out: 0.0, band: 0.45, strip: 0.5, recess: 0.0 }", "A2: the spandrel's frame"),  # round 25 (0.4 m then; 0.6 m since round 26): the panel's recess alone clears the 0.25 m, so a flush frame now means both at zero (kx-front-round23 pins 0.45)
    ('no interior gradient', 'web/src/shed.ts', "emissive: 0x140e08, map: interiorGradientTexture() })", "emissive: 0x140e08 })", 'A3: the concourse behind'),
    ('a flat interior', 'web/src/shed.ts', "gradient: [0.75, 1.0] as const", "gradient: [1.0, 1.0] as const", 'A3: the concourse behind'),
    ('the gradient upside down', 'web/src/shed.ts', "entryFoot + t0, gz]], [[0, 0], [1, 0], [1, 1], [0, 1]]", "entryFoot + t0, gz]], [[0, 1], [1, 1], [1, 0], [0, 0]]", 'A3: the concourse behind'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round22.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round22-', dir=out) as tmp:
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
