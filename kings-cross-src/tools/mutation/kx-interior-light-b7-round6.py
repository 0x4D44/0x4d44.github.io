"""Catch B7 round 6's regressions (the trains back under the shed's daylight additions; the near-wall bounce and the crown's sky band too faint,
too strong, too wide, on the sun, on the front, at night or gone) through web/tests/kx-interior-light-b7-round4/5/6.test.ts.
Usage: python3 -I -u tools/mutation/kx-interior-light-b7-round6.py SOURCE WORKTREE_SCRATCH
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
    ('no crown band', 'web/src/lighting.ts', 'crown: 1.2,', 'crown: 0,', 'round 6 near-wall'),
    ('a strong crown band', 'web/src/lighting.ts', 'crown: 1.2,', 'crown: 2.4,', 'round 6 near-wall'),
    ('a crown band wall to wall', 'web/src/lighting.ts', 'band: [0, 0.38]', 'band: [0.9, 1.0]', 'round 6 near-wall'),
    ('the crown band on standing faces', 'web/src/lighting.ts', 'shedOff / shedR ) ) * shedUp;', 'shedOff / shedR ) );', 'round 6 near-wall'),
    ('the sky on the sun', 'web/src/lighting.ts', '    reflectedLight.indirectDiffuse *= 1.0 + shedUnder( shedP )', '    reflectedLight.directDiffuse *= 1.0 + shedUnder( shedP )', 'round 6 near-wall'),
    ('the sky on the front', 'web/src/lighting.ts', '1.0 + shedUnder( shedP ) * (', '1.0 + shedInside( shedP ) * (', 'round 6 near-wall'),
    ('the sky at night', 'web/src/lighting.ts', 'export const SHED_SKY_GLSL = `if ( uShedDiffuse > 0.0 ) {', 'export const SHED_SKY_GLSL = `if ( true ) {', 'round 6 near-wall'),
]


def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-interior-light-b7-round4.test.ts', 'web/tests/kx-interior-light-b7-round5.test.ts', 'web/tests/kx-interior-light-b7-round6.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-interior-light-b7-round6-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 6 else 0)
