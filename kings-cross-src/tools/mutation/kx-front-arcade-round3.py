"""Catch arcade round 3's regressions (the figures a contrast floor about 12 levels under the hall in two tones, the hall's lit back-wall band, the
lower panes' day reflection, no new triangle) through web/tests/kx-front-arcade-round3.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-arcade-round3.py SOURCE WORKTREE_SCRATCH
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
    ('dark-zone figures crushed', 'web/src/shed.ts', 'k: [0.8, 0.45, 0.56, 0.665] as const', 'k: [0.3, 0.45, 0.56, 0.665] as const', 'upper body sits'),
    ('round 2c\'s ratio in the bright zone', 'web/src/shed.ts', 'k: [0.8, 0.45, 0.56, 0.665] as const', 'k: [0.8, 0.45, 0.75, 0.75] as const', 'upper body sits'),
    ('mid-hall figures pale', 'web/src/shed.ts', 'k: [0.8, 0.45, 0.56, 0.665] as const', 'k: [0.8, 0.7, 0.56, 0.665] as const', 'upper body sits'),
    ('one tone', 'web/src/shed.ts', 'hips: 0.85, legs: 0.75 }', 'hips: 0.85, legs: 1 }', 'upper body sits'),
    ('the legs on top', 'web/src/shed.ts', 'kxK *= vFrontY < KX_FIG_HIPS ? KX_FIG_LEGS : 1.0;', 'kxK *= vFrontY > KX_FIG_HIPS ? KX_FIG_LEGS : 1.0;', 'upper body sits'),
    ('the middle knot skipped', 'web/src/shed.ts', ': kxT <= KX_FIG_T.z ? mix( KX_FIG_KS.y, KX_FIG_KS.z, ( kxT - KX_FIG_T.y ) / ( KX_FIG_T.z - KX_FIG_T.y ) )', ': kxT <= KX_FIG_T.z ? KX_FIG_KS.y', 'upper body sits'),
    ('a faint band', 'web/src/shed.ts', 'colour: [0.0285, 0.0249, 0.0205] as const', 'colour: [0.0085, 0.0075, 0.006] as const', 'back-wall band'),
    ('a glaring band', 'web/src/shed.ts', 'colour: [0.0285, 0.0249, 0.0205] as const', 'colour: [0.1, 0.09, 0.07] as const', 'back-wall band'),
    ('a sliver of a band', 'web/src/shed.ts', 'band: { v: [0.45, 0.72] as const', 'band: { v: [0.45, 0.5] as const', 'back-wall band'),
    ('no band in the shader', 'web/src/shed.ts', 'totalEmissiveRadiance += KX_BAND_COLOUR * texture2D( map, vMapUv ).g', 'totalEmissiveRadiance += 0.0 * KX_BAND_COLOUR * texture2D( map, vMapUv ).g', 'back-wall band'),
    ('the reflection at night too', 'web/src/shed.ts', 'totalEmissiveRadiance += KX_REFLECT * ( 1.0 - uWinNight ) *', 'totalEmissiveRadiance += KX_REFLECT *', 'day reflection'),
    ('a strong reflection', 'web/src/shed.ts', 'reflect: { colour: [0.00195, 0.00213, 0.00245] as const', 'reflect: { colour: [0.006, 0.0065, 0.0075] as const', 'day reflection'),
    ('a warm reflection', 'web/src/shed.ts', 'reflect: { colour: [0.00195, 0.00213, 0.00245] as const', 'reflect: { colour: [0.00245, 0.00213, 0.00195] as const', 'day reflection'),
    ('even to the transom', 'web/src/shed.ts', 'top: 0.4, door: 0.45,', 'top: 1, door: 0.45,', 'day reflection'),
    ('the doors as the panes', 'web/src/shed.ts', 'top: 0.4, door: 0.45,', 'top: 0.4, door: 1,', 'day reflection'),
    ('the reflection off the figures', 'web/src/shed.ts', "KX_FIG_LEGS: k.legs.toFixed(3), ...porchReflect(),", "KX_FIG_LEGS: k.legs.toFixed(3),", 'day reflection'),
    ('a third figure', 'web/src/shed.ts', 'barrier: [0.22, 1.0] as const, figures: 2,', 'barrier: [0.22, 1.0] as const, figures: 3,', 'no new draw or triangle'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-arcade-round3.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-arcade-round3-', dir=out) as tmp:
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
