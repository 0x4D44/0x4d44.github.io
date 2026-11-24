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
    ('returns back at 0.45', 'web/src/shed.ts', "PORCH_DEPTH = { glass: 0.8,", "PORCH_DEPTH = { glass: 0.45,", 'A3: each opening'),
    ('returns stop short of the glass', 'web/src/shed.ts', "[rx, entryFoot, -PORCH_DEPTH.glass], [rx, yj, -PORCH_DEPTH.glass]", "[rx, entryFoot, -0.4], [rx, yj, -0.4]", 'A3: each opening'),
    ('no soffits', 'web/src/shed.ts', "    soffits.poly([[x - sw / 2,", "    if (x > 1e9) soffits.poly([[x - sw / 2,", 'A3: a pale soffit'),
    ('a dark soffit', 'web/src/shed.ts', "soffit: 0xe6d6b4 }", "soffit: 0x2a2c2e }", 'A3: a pale soffit'),
    ('a soffit without its glow', 'web/src/shed.ts', "FRONT_NIGHT.downlight, 'kx-front-infill-soffit'),", "FRONT_NIGHT.downlight, 'kx-front-infill-sof'),", 'A3: a pale soffit'),
    ('the gradient foot back at 0.5', 'web/src/shed.ts', "gradient: [0.75, 1.0] as const", "gradient: [0.5, 1.0] as const", "A3: the interior's foot"),
    ('a one-step cap', 'web/src/shed.ts', "[[0, 0.25, 0.15], [0.25, 0.6, 0.5], [0.6, cap, 0.1]]", "[[0, cap, 0.15]]", "A1: each pier's cap"),
    ('a shallow corona', 'web/src/shed.ts', "[0.25, 0.6, 0.5]", "[0.25, 0.6, 0.15]", "A1: each pier's cap"),
    ('the cornice across the masses', 'web/src/shed.ts', "proud(spine, frontTop - 0.45, FW + toMass, 0.9,", "proud(spine, frontTop - 0.45, FW + toMass + across, 0.9,", "A1: the screen's cornice"),
    ('no string on the masses', 'web/src/shed.ts', "    stone.box([(mid + outer) / 2 + sd * 0.1, sp - 0.3 - 0.325,", "    if (sd > 9) stone.box([(mid + outer) / 2 + sd * 0.1, sp - 0.3 - 0.325,", "A1: the screen's cornice"),
    ('no shadow line under the band', 'web/src/shed.ts', "      tympanumShade.push([[[ia, yBand - sh, e]", "      if (sh > 9) tympanumShade.push([[[ia, yBand - sh, e]", "A2: the spandrel frame's shadow"),
    ('no shade inside the strips', 'web/src/shed.ts', "if (yArc < yBand - sh - 0.3) tympanumShade.push(", "if (yArc < -1e9) tympanumShade.push(", "A2: the spandrel frame's shadow"),
    ('shade never added', 'web/src/shed.ts', "  for (const [pts, facing] of tympanumShade) frames.poly(pts, undefined, { facing });", "", "A2: the spandrel frame's shadow"),
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
