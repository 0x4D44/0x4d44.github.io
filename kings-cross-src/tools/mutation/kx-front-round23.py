"""Catch round 23's south-front regressions (deeper dark returns, lit head soffits and a lighter interior foot, A3; stepped pier caps and the cornice stopping at the piers, A1; the spandrel frame's painted shadow line and the string across the piers, A2) through web/tests/kx-front-round23.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round23.py SOURCE WORKTREE_SCRATCH
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
    ('returns back at 0.45', 'web/src/shed.ts', "PORCH_DEPTH = { glass: 1.05,", "PORCH_DEPTH = { glass: 0.45,", 'A3: each opening'),
    ('returns stop short of the glass', 'web/src/shed.ts', "[rx, entryFoot, -PORCH_DEPTH.glass], [rx, yj, -PORCH_DEPTH.glass]", "[rx, entryFoot, -0.4], [rx, yj, -0.4]", 'A3: each opening'),
    ('no soffits', 'web/src/shed.ts', "    soffits.poly([[x - sw / 2,", "    if (x > 1e9) soffits.poly([[x - sw / 2,", 'A3: a pale soffit'),
    ('a dark soffit', 'web/src/shed.ts', "soffit: 0xa99a7c, vignette", "soffit: 0x2a2c2e, vignette", 'A3: a pale soffit'),
    ('a soffit without its glow', 'web/src/shed.ts', "FRONT_NIGHT.downlight, 'kx-front-infill-soffit'),", "FRONT_NIGHT.downlight, 'kx-front-infill-sof'),", 'A3: a pale soffit'),
    ('the gradient foot back at 0.5', 'web/src/shed.ts', "gradient: [0.75, 1.0] as const", "gradient: [0.5, 1.0] as const", "A3: the interior's foot"),
    ('a cap overhanging 0.5 m', 'web/src/shed.ts', "[width + 0.5, cap, FRONT_THICK + 0.5 + po]", "[width + 1.0, cap, FRONT_THICK + 1.0 + po]", "A1: each pier's cap"),
    ('a cap flush with the mass', 'web/src/shed.ts', "[width + 0.5, cap, FRONT_THICK + 0.5 + po]", "[width, cap, FRONT_THICK + po]", "A1: each pier's cap"),
    ('the mass back at 0.75', 'web/src/shed.ts', "width: 5.2, out: 1.15,", "width: 5.2, out: 0.75,", "A1: the screen's cornice"),
    ('the string flush with the mass', 'web/src/shed.ts', "(po + 0.25 - FRONT_THICK) / 2], [width - 1.0 - feet + 0.2, 0.65, FRONT_THICK + po + 0.25]", "(po - FRONT_THICK) / 2], [width - 1.0 - feet + 0.2, 0.65, FRONT_THICK + po]", "A1: the screen's cornice"),
    ('no string on the masses', 'web/src/shed.ts', "    stone.box([(mid + outer) / 2 + sd * 0.1, sp - 0.325,", "    if (sd > 9) stone.box([(mid + outer) / 2 + sd * 0.1, sp - 0.325,", "A1: the screen's cornice"),
    ('the frame back at 0.3', 'web/src/shed.ts', "FRONT_TYMPANUM = { out: 0.5,", "FRONT_TYMPANUM = { out: 0.3,", "A2: the spandrel frame's shadow"),
    ('no band', 'web/src/shed.ts', "      brick.box([(xa + xb) / 2, yTop - band / 2, out / 2], [xb - xa, band, out], { skip: ['-z'] });", "", "A2: the spandrel frame's shadow"),
    ('a painted line under the band', 'web/src/shed.ts', "  const soffits = new Batch();", "  const soffits = new Batch(); frames.poly([[fx0, frontTop - 2.25, 0.004], [fx1, frontTop - 2.25, 0.004], [fx1, frontTop - 1.95, 0.004], [fx0, frontTop - 1.95, 0.004]], undefined, { facing: [0, 0, 1] });", "A2: the spandrel frame's shadow"),
    ('porch-close aimed away', 'tools/tests/frozen-station-cameras.json', "      19.2831,", "      40.2831,", 'A3: a porch-close'),
    ('porch-close out past the canopy', 'tools/tests/frozen-station-cameras.json', "      -7.4143\n", "      2.5857\n", 'A3: a porch-close'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round23.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round23-', dir=out) as tmp:
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
