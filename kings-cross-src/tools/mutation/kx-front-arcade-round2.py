"""Catch arcade round 2's regressions (the porch rings' and openings' returns in the great arches' day contact shade, night unchanged; the figures and
barriers the interior's own tone at their spot times figureDay by day) through web/tests/kx-front-arcade-round2.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-arcade-round2.py SOURCE WORKTREE_SCRATCH
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
    ('round 2\'s ink line', 'web/src/shed.ts', 'export const PORCH_RETURN_SHADE = { back: 0.8, face: 1 } as const;', 'export const PORCH_RETURN_SHADE = { back: 0.275, face: 0.275 } as const;', "porch rings' returns"),
    ('no ring shade', 'web/src/shed.ts', 'export const PORCH_RETURN_SHADE = { back: 0.8, face: 1 } as const;', 'export const PORCH_RETURN_SHADE = { back: 1, face: 1 } as const;', "porch rings' returns"),
    ('the grade reversed', 'web/src/shed.ts', '1 : back + ((face - back) * pos.getZ(k)) / depth,', '1 : face - ((face - back) * pos.getZ(k)) / depth,', "porch rings' returns"),
    ('a constant mid shade, no grade', 'web/src/shed.ts', '1 : back + ((face - back) * pos.getZ(k)) / depth,', '1 : (back + face) / 2,', "porch rings' returns"),
    ('the soffit graded again', 'web/src/shed.ts', 'col.fill(soffit(k) ? 1 : back', 'col.fill(soffit(k) ? back : back', "porch rings' returns"),
    ('every inward side unshaded, the step returns too', 'web/src/shed.ts', 'return i === 0 && nrm.getX(k)', 'return nrm.getX(k)', "porch rings' returns"),
    ('the outward side taken for the soffit', 'web/src/shed.ts', 'Math.min(0, spring - py) > 1e-6;', 'Math.min(0, spring - py) < -1e-6;', "porch rings' returns"),
    ("the rings' faces shaded, not their returns", 'web/src/shed.ts', 'if (grp.materialIndex === 1) for (let k = grp.start;', 'if (grp.materialIndex === 0) for (let k = grp.start;', "porch rings' returns"),
    ('the day rings ignore the shade', 'web/src/shed.ts', '  ringDay.vertexColors = true;', '  ringDay.vertexColors = false;', "porch rings' returns"),
    ('the shade at night too', 'web/src/shed.ts', "[ringDay, canopySteel]), [material('brickFoot'), canopySteel]);", '[ringDay, canopySteel]), [ringDay, canopySteel]);', "porch rings' returns"),
    ("the openings' reveals unshaded", 'web/src/shed.ts', 'if (porchReveal || centres.some(', 'if (centres.some(', 'brick reveals in the front'),
    ("the reveals' shade stops at the springing", 'web/src/shed.ts', 'y + sp < entryFoot + SOUTH_FRONT_ARCADES.jambHeight + SOUTH_FRONT_ARCADES.archRise + 0.01', 'y + sp < entryFoot + SOUTH_FRONT_ARCADES.jambHeight', 'brick reveals in the front'),
    ('the factor on the diffuse only', 'web/src/shed.ts', 'mix( kxK * KX_FIG_DAY_EMIT,', 'mix( KX_FIG_DAY_EMIT,', 'each figure and barrier'),
    ('figures ignore the day darkening', 'web/src/shed.ts', 'multiplyScalar(PORCH_DEPTH.dayDark)),', 'multiplyScalar(1)),', 'each figure and barrier'),
    ('figures sample one row of the map', 'web/src/shed.ts', '(py - entryFoot - 0.3) / (t0 - 0.3)] as V2)', '0.5] as V2)', 'each figure and barrier'),
    ('figures without the map', 'web/src/shed.ts', 'multiplyScalar(PORCH_TONES.figureLift), map: interiorMap })', 'multiplyScalar(PORCH_TONES.figureLift) })', 'each figure and barrier'),
    ('figures keep their constant lift by day', 'web/src/shed.ts', 'totalEmissiveRadiance = mix( kxK * KX_FIG_DAY_EMIT, totalEmissiveRadiance, uWinNight );', 'totalEmissiveRadiance = totalEmissiveRadiance;', 'each figure and barrier'),
    ('figures mapped at night too', 'web/src/shed.ts', 'kxHall, KX_FIG_NIGHT, uWinNight )', 'kxHall, KX_FIG_NIGHT * kxHall, uWinNight )', 'each figure and barrier'),
    # arcade round 3: the factor's mutants (its shape, the hall's value, both terms) moved to kx-front-arcade-round3.py with the factor's tests
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-arcade-round2.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-arcade-round2-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 3 else 0)
