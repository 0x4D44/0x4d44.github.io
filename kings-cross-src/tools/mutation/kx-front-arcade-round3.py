"""Catch arcade round 3/3b's regressions (the figures a contrast floor about 12 levels under the lit lower hall in two tones, the feathered pooled day
band and the night band, the blue signs, the glass's sky-to-forecourt day reflection, no new triangle) through web/tests/kx-front-arcade-round3.test.ts only.
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
    ('a glaring night band', 'web/src/shed.ts', 'colour: [0.0285, 0.0249, 0.0205] as const', 'colour: [0.1, 0.09, 0.07] as const', 'back-wall band feathered'),
    ('the night band by day too', 'web/src/shed.ts', 'totalEmissiveRadiance += uWinNight * KX_BAND_COLOUR', 'totalEmissiveRadiance += KX_BAND_COLOUR', 'back-wall band feathered'),
    ('a hard-edged band', 'web/src/shed.ts', 'feather: 0.09, base: 0.25,', 'feather: 0.01, base: 0.25,', 'back-wall band feathered'),
    ('a flat band', 'web/src/shed.ts', 'feather: 0.09, base: 0.25,', 'feather: 0.09, base: 1,', 'back-wall band feathered'),
    ('one pool', 'web/src/shed.ts', 'pools: [0.18, 0.5, 0.82] as const', 'pools: [0.5, 0.5, 0.5] as const', 'back-wall band feathered'),
    ('a dim day band', 'web/src/shed.ts', 'colour: [0.0319, 0.0278, 0.0229] as const', 'colour: [0.022, 0.019, 0.016] as const', 'back-wall band feathered'),
    ('a blown day band', 'web/src/shed.ts', 'colour: [0.0319, 0.0278, 0.0229] as const', 'colour: [0.1, 0.09, 0.07] as const', 'back-wall band feathered'),
    ('the day band at night too', 'web/src/shed.ts', 'totalEmissiveRadiance += ( 1.0 - uWinNight ) * KX_DAYBAND_COLOUR', 'totalEmissiveRadiance += KX_DAYBAND_COLOUR', 'back-wall band feathered'),
    ('the feather inverted', 'web/src/shed.ts', '* smoothstep( KX_DAYBAND.x, KX_DAYBAND.x + KX_DAYBAND.z, vMapUv.y )', '* smoothstep( KX_DAYBAND.x + KX_DAYBAND.z, KX_DAYBAND.x, vMapUv.y )', 'back-wall band feathered'),
    ('the lift at night too', 'web/src/shed.ts', 'totalEmissiveRadiance += ( 1.0 - uWinNight ) * KX_LIFT_COLOUR', 'totalEmissiveRadiance += KX_LIFT_COLOUR', 'back-wall band feathered'),
    ('the signs at night too', 'web/src/shed.ts', 'totalEmissiveRadiance += ( 1.0 - uWinNight ) * KX_SIGN_COLOUR', 'totalEmissiveRadiance += KX_SIGN_COLOUR', 'back-wall band feathered'),
    ('a weak lift', 'web/src/shed.ts', 'lift: { v: [0.45, 0.55] as const, colour: [0.004, 0.003, 0.0018] as const }', 'lift: { v: [0.45, 0.55] as const, colour: [0.0015, 0.0011, 0.0007] as const }', 'upper body sits'),
    ('the lift on the figures', 'web/src/shed.ts', 'KX_FIG_LEGS: k.legs.toFixed(3),', 'KX_FIG_LEGS: k.legs.toFixed(3), ...porchDay(),', 'upper body sits'),
    ('the lift into the band', 'web/src/shed.ts', 'lift: { v: [0.45, 0.55] as const', 'lift: { v: [0.6, 0.8] as const', 'upper body sits'),
    ('a sign off the band', 'web/src/shed.ts', '[0.58, 0.7, 0.58, 0.64]]', '[0.58, 0.7, 0.68, 0.74]]', 'blue signs'),
    ('a grey sign', 'web/src/shed.ts', 'colour: [0.0159, 0.037, 0.1057] as const', 'colour: [0.04, 0.04, 0.04] as const', 'blue signs'),
    ('a glaring sign', 'web/src/shed.ts', 'colour: [0.0159, 0.037, 0.1057] as const', 'colour: [0.04, 0.09, 0.26] as const', 'blue signs'),
    ('one sign in the shader', 'web/src/shed.ts', '+ step( KX_SIGN1.x, vMapUv.x )', '+ 0.0 * step( KX_SIGN1.x, vMapUv.x )', 'blue signs'),
    ('the reflection at night too', 'web/src/shed.ts', 'totalEmissiveRadiance += ( 1.0 - uWinNight ) * mix( KX_REFLECT, KX_REFLECT_SKY', 'totalEmissiveRadiance += mix( KX_REFLECT, KX_REFLECT_SKY', 'glass reflects'),
    ('the round-3 reflection', 'web/src/shed.ts', 'forecourt: [0.0135, 0.0128, 0.0119] as const', 'forecourt: [0.00195, 0.00213, 0.00245] as const', 'glass reflects'),
    ('the 3b sky, greying the transom', 'web/src/shed.ts', 'sky: [0.0132, 0.0148, 0.0173] as const', 'sky: [0.096, 0.108, 0.126] as const', 'glass reflects'),
    ('a warm sky', 'web/src/shed.ts', 'sky: [0.0132, 0.0148, 0.0173] as const', 'sky: [0.0173, 0.0148, 0.0132] as const', 'glass reflects'),
    ('one gpu factor for all (3b)', 'web/src/shed.ts', 'gpu: { band: 1.2, lift: 1, reflect: 0.5 }', 'gpu: { band: 0.1, lift: 0.1, reflect: 0.1 }', 'back-wall band feathered'),
    ('the doors as the panes', 'web/src/shed.ts', 'door: 0.5, doors: [0.3, 0.7]', 'door: 1, doors: [0.3, 0.7]', 'glass reflects'),
    ('the doors in the shader dropped', 'web/src/shed.ts', '* mix( 1.0, KX_REFLECT_DOOR, step(', '* mix( 1.0, 1.0, step(', 'glass reflects'),
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
    raise SystemExit(1 if failures or len(passing) != 5 else 0)
