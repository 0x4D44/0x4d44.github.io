"""Catch B7 round 8's regressions (the crown band back on the sky alone, or off the sun, or not at the new crown camera; the camera
platform-eye-crown-west gone or moved off the crown line) and rounds 6-7's, through web/tests/kx-interior-light-b7-round4..8.test.ts.
Usage: python3 -I -u tools/mutation/kx-interior-light-b7-round8.py SOURCE WORKTREE_SCRATCH
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
    ('the trains not flagged', 'web/src/train-geom.ts', "    plainMaterial.defines = { NO_SHED_LIGHT: '' };", '    plainMaterial.defines = {};', 'round 6 trains'),
    ('the shells not flagged', 'web/src/livery.ts', "    m.defines = { NO_SHED_LIGHT: '' };", '    m.defines = {};', 'round 6 trains'),
    ('the flag not read', 'web/src/lighting.ts', '#ifndef ${NO_SHED_LIGHT}\n', '#ifndef NO_SUCH_FLAG\n', 'round 6 trains'),
    ('the sky outside the flag', 'web/src/lighting.ts', '  ${SHED_SKY_GLSL}\n#endif\n', '#endif\n  ${SHED_SKY_GLSL}\n', 'round 6 trains'),
    ('no bounce', 'web/src/lighting.ts', 'SHED_SKY = { bounce: 1.6,', 'SHED_SKY = { bounce: 0,', 'round 6 near-wall'),
    ('twice the bounce (overshoot)', 'web/src/lighting.ts', 'SHED_SKY = { bounce: 1.6,', 'SHED_SKY = { bounce: 3.2,', 'round 6 near-wall'),
    ('a reach to 10 m', 'web/src/lighting.ts', 'reach: [2, 6]', 'reach: [2, 10]', 'round 6 near-wall'),
    ('the bounce to the springing', 'web/src/lighting.ts', 'height: [3, 6]', 'height: [8, 9]', 'round 6 near-wall'),
    ('the spine not a wall', 'web/src/lighting.ts', 'float shedOff = abs( abs( shedQ.x - 0.5 * ( uShedSize.x + uShedSize.y ) ) - shedR );', 'float shedOff = abs( shedQ.x - 0.5 * ( uShedSize.x + uShedSize.y ) );', 'round 6 near-wall'),
    ('no crown band', 'web/src/lighting.ts', 'crown: 0.22,', 'crown: 0,', 'round 6 near-wall'),
    ('a strong crown band', 'web/src/lighting.ts', 'crown: 0.22,', 'crown: 0.6,', 'round 6 near-wall'),
    ('a crown band wall to wall', 'web/src/lighting.ts', 'band: [0, 0.38]', 'band: [0.9, 1.0]', 'round 6 near-wall'),
    ('the crown band on standing faces', 'web/src/lighting.ts', 'shedOff / shedR ) ) * shedUp;', 'shedOff / shedR ) );', 'round 6 near-wall'),
    ('the sky on the sun', 'web/src/lighting.ts', '    reflectedLight.indirectDiffuse *= 1.0 + shedK * mix(', '    reflectedLight.directDiffuse *= 1.0 + shedK * mix(', 'round 6 near-wall'),
    ('the sky on the front', 'web/src/lighting.ts', 'float shedK = shedUnder( shedP );', 'float shedK = shedInside( shedP );', 'round 6 near-wall'),
    ('the sky at night', 'web/src/lighting.ts', 'export const SHED_SKY_GLSL = `if ( uShedDiffuse > 0.0 ) {', 'export const SHED_SKY_GLSL = `if ( true ) {', 'round 6 near-wall'),
    ('round 6 bounce', 'web/src/lighting.ts', 'SHED_SKY = { bounce: 1.6,', 'SHED_SKY = { bounce: 0.8,', 'round 7 near-wall'),
    ('a faint floor bounce', 'web/src/lighting.ts', 'SHED_SKY = { bounce: 1.6,', 'SHED_SKY = { bounce: 1.2,', 'round 7 near-wall'),
    ('the walls take the floor bounce', 'web/src/lighting.ts', 'wall: 0.8, reach', 'wall: 1.6, reach', 'round 7 near-wall'),
    ('no walls share', 'web/src/lighting.ts', 'wall: 0.8, reach', 'wall: 0, reach', 'round 7 near-wall'),
    ('the mix the wrong way', 'web/src/lighting.ts', 'mix( ${SHED_SKY.wall.toFixed(4)}, ${SHED_SKY.bounce.toFixed(4)}, shedUp )', 'mix( ${SHED_SKY.bounce.toFixed(4)}, ${SHED_SKY.wall.toFixed(4)}, shedUp )', 'round 7 near-wall'),
    ('round 6 band', 'web/src/lighting.ts', 'band: [0, 0.38]', 'band: [0.15, 0.6]', 'round 7 crown'),
    ('a faint crown', 'web/src/lighting.ts', 'crown: 0.22,', 'crown: 0.1,', 'round 7 crown'),
    ('a band too narrow', 'web/src/lighting.ts', 'band: [0, 0.38]', 'band: [0, 0.2]', 'round 7 crown'),
    ('a strong crown', 'web/src/lighting.ts', 'crown: 0.22,', 'crown: 0.45,', 'round 7 crown'),
    ('the band on the sky alone (round 7)', 'web/src/lighting.ts', '    reflectedLight.directDiffuse *= 1.0 + shedC;\n', '', 'round 8'),
    ('the band off the sky', 'web/src/lighting.ts', 'shedUp ) * shedNear + shedC;', 'shedUp ) * shedNear;', 'round 8'),
    ('the band outside the roof', 'web/src/lighting.ts', '    float shedC = shedK * ', '    float shedC = 1.0 * ', 'round 8'),
    ('round 7 crown on both terms', 'web/src/lighting.ts', 'crown: 0.22,', 'crown: 1.2,', 'round 8'),
    ('no crown camera', 'tools/evidence.mjs', "  'platform-eye-crown-west': {", "  'platform-eye-crown-west-x': {", 'round 8 a camera'),
    ('the crown camera on platform 4', 'tools/evidence.mjs', '    pos: [26.4331, 2.5, -210.6194],', '    pos: [44.387, 2.5, -210.069],', 'round 8 a camera'),
    ('the crown camera off the line', 'tools/evidence.mjs', '    pos: [26.4331, 2.5, -210.6194],', '    pos: [28.4331, 2.5, -210.6194],', 'round 8 a camera'),
    ('the crown camera not a shed view', 'tools/evidence.mjs', ", 'platform-eye-crown-west'],\n  'western-concourse'", "],\n  'western-concourse'", 'round 8 a camera'),
]


def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-interior-light-b7-round4.test.ts', 'web/tests/kx-interior-light-b7-round5.test.ts', 'web/tests/kx-interior-light-b7-round6.test.ts', 'web/tests/kx-interior-light-b7-round7.test.ts', 'web/tests/kx-interior-light-b7-round8.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-interior-light-b7-round8-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 10 else 0)
