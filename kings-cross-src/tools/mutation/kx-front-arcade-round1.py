"""Catch arcade round 1 regressions (front A3, the lower arcade: two stepped brick orders down to the paving, no stone pier base; a dark-framed
fanlight in each head, a transom at the springing and one centre mullion; the canopy soffit lifted and its lamps linear strips; the figures and
barriers a lit mid tone) through web/tests/kx-front-arcade-round1.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-arcade-round1.py SOURCE WORKTREE_SCRATCH
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
    ('one order', 'web/src/shed.ts', 'orders: 2, depth: 0.23, step: 0.11', 'orders: 1, depth: 0.23, step: 0.11', 'two brick orders'),
    ('wide orders', 'web/src/shed.ts', 'orders: 2, depth: 0.23, step: 0.11', 'orders: 2, depth: 0.4, step: 0.11', 'two brick orders'),
    ('a deep step', 'web/src/shed.ts', 'orders: 2, depth: 0.23, step: 0.11', 'orders: 2, depth: 0.23, step: 0.25', 'two brick orders'),
    ('the orders stop at the springing', 'web/src/shed.ts', 'toGround: true, segments: 12', 'toGround: false, segments: 12', 'two brick orders'),
    ('a fine ring that costs the shadow pass', 'web/src/shed.ts', 'toGround: true, segments: 12', 'toGround: true, segments: 24', 'two brick orders'),
    ('stone voussoirs again', 'web/src/shed.ts', "[material('brickFoot'), canopySteel]", "[material('stoneFoot'), canopySteel]", 'two brick orders'),
    ('the stone plinth back', 'web/src/shed.ts', 'void => brick.box([cx, cy, (out - FRONT_THICK) / 2]', 'void => stone.box([cx, cy, (out - FRONT_THICK) / 2]', 'brick down to the paving'),
    ('no centre mullion', 'web/src/shed.ts', 'frames.box([x, (spring + fb / 2 + crown) / 2, zf]', 'frames.box([x + 99, (spring + fb / 2 + crown) / 2, zf]', 'dark-framed fanlight'),
    ('the transom over the springing', 'web/src/shed.ts', 'frames.box([x, spring, zf], [2 * entryR, fb, fr]', 'frames.box([x, spring + 0.5, zf], [2 * entryR, fb, fr]', 'dark-framed fanlight'),
    ('heavy bars', 'web/src/shed.ts', 'PORCH_FANLIGHT = { bar: 0.08,', 'PORCH_FANLIGHT = { bar: 0.15,', 'dark-framed fanlight'),
    ('the mullions up into the head', 'web/src/shed.ts', 'frames.box([x + dx, (entryFoot + under) / 2, zf], [m, under - entryFoot, fr]', 'frames.box([x + dx, (entryFoot + under + 1.2) / 2, zf], [m, under + 1.2 - entryFoot, fr]', 'dark-framed fanlight'),
    ('no head frame', 'web/src/shed.ts', 'frames.poly([pt(k, 0), pt(k + 1, 0), pt(k + 1, fb), pt(k, fb)]', 'frames.poly([pt(k, 0), pt(k, 0), pt(k, 0), pt(k, 0)]', 'dark-framed fanlight'),
    ('the leaves over the transom', 'web/src/shed.ts', 'const leafTop = under - 0.01;', 'const leafTop = under + 0.2;', 'dark-framed fanlight'),
    ('a black soffit', 'web/src/shed.ts', 'soffit: 0x3a3f45,', 'soffit: 0x2a2c2e,', "canopy's soffit"),
    ('no soffit define', 'web/src/shed.ts', '...canopySteel.defines, KX_SOFFIT: `vec3', '...canopySteel.defines, KX_SOFFIT_OFF: `vec3', "canopy's soffit"),
    ('the soffit on the top', 'web/src/shed.ts', 'float kxDown = step( 0.5, -vFrontNy );', 'float kxDown = step( 0.5, vFrontNy );', "canopy's soffit"),
    ('a weak day bounce', 'web/src/shed.ts', 'soffitFill: 0.85,', 'soffitFill: 0.3,', "canopy's soffit"),
    ('a glaring day bounce', 'web/src/shed.ts', 'soffitFill: 0.85,', 'soffitFill: 1.6,', "canopy's soffit"),
    ('the bounce at night too', 'web/src/shed.ts', 'KX_SOFFIT_FILL * ( 1.0 - uWinNight ) * kxDown', 'KX_SOFFIT_FILL * kxDown', "canopy's soffit"),
    ('no lamp pool', 'web/src/shed.ts', 'pool: { colour: 0xffe2b8, gain: 0.05,', 'pool: { colour: 0xffe2b8, gain: 0,', "canopy's soffit"),
    ('a pool over the whole soffit', 'web/src/shed.ts', 'gain: 0.05, radius: 0.7 }', 'gain: 0.05, radius: 4 }', "canopy's soffit"),
    ('the pools off the lamps', 'web/src/shed.ts', 'KX_POOL: `vec4(${(fx0 + 0.9).toFixed(4)}', 'KX_POOL: `vec4(${(fx0 + 2.1).toFixed(4)}', "canopy's soffit"),
    ('black figures by day', 'web/src/shed.ts', 'figureLift: 0.55,', 'figureLift: 0,', 'lit mid tone'),
    ('drums again', 'web/src/shed.ts', 'lamp: [1.2, 0.15, 0.12] as const', 'lamp: [0.6, 0.18, 0.6] as const', "canopy's soffit"),
    ('square strips', 'web/src/shed.ts', 'downlights.box([x, ly, d * row], [lw, lh, lz]', 'downlights.box([x, ly, d * row], [lw, lh, lw]', "canopy's soffit"),
    ('black figures', 'web/src/shed.ts', 'figure: 0x4a4540,', 'figure: 0x2a2c2e,', 'lit mid tone'),
    ('no night glow', 'web/src/shed.ts', 'figureNight: [0xffc98a, 0.22]', 'figureNight: [0xffc98a, 0]', 'lit mid tone'),
    ('figures in the frames', 'web/src/shed.ts', 'figures.poly([[px - fw0 / 2', 'frames.poly([[px - fw0 / 2', 'lit mid tone'),
    ('barriers in the frames', 'web/src/shed.ts', 'figures.poly([[bx - bw / 2', 'frames.poly([[bx - bw / 2', 'lit mid tone'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-arcade-round1.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-arcade-round1-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 5 else 0)
