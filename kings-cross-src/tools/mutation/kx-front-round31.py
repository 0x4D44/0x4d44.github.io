"""Catch round F11 regressions (front A6: the north gable glass dark and glossy from outside by day, the library glass from inside, on the plane, at night; dimmed in x-ray; F11b: one even glint on it, not a mosaic) through web/tests/kx-front-round31.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round31.py SOURCE WORKTREE_SCRATCH
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
    ('the gable glass as before', 'web/src/shed.ts', 'gableGlassView(gableGlass, group, layout);', 'dimInXray(gableGlass, group);', 'A6 (F11): by day'),
    ('outside on the plane too', 'web/src/shed.ts', 'return cam[2] < -layout.length ?', 'return cam[2] <= -layout.length ?', 'gableOutside is'),
    ('outside from inside too', 'web/src/shed.ts', 'return cam[2] < -layout.length ?', 'return cam[2] < 0 ?', 'from inside'),
    ('the night ignored', 'web/src/shed.ts', '1 - Math.min(1, Math.max(0, night)) : 0;', '1 : 0;', 'at night'),
    ('the night unclamped', 'web/src/shed.ts', '1 - Math.min(1, Math.max(0, night)) : 0;', '1 - night : 0;', 'gableOutside is'),
    ('lighter outside glass', 'web/src/shed.ts', 'color: 0x35424e,', 'color: 0x86a9c4,', 'A6 (F11): by day'),
    ('clear outside glass', 'web/src/shed.ts', 'opacity: 0.982,', 'opacity: 0.6,', 'A6 (F11): by day'),
    ('no x-ray dim', 'web/src/shed.ts', '* endGlassFactor(group.userData.roofMode as RoofMode);\n    if (k > 0)', ';\n    if (k > 0)', 'in x-ray'),
    ('colour not put back', 'web/src/shed.ts', 'm.opacity = was; m.color.copy(colour); m.specular.copy(specular); glintEven', 'm.opacity = was; m.specular.copy(specular); glintEven', 'A6 (F11): by day'),
    ('specular not put back', 'web/src/shed.ts', 'm.opacity = was; m.color.copy(colour); m.specular.copy(specular); glintEven', 'm.opacity = was; m.color.copy(colour); glintEven', 'A6 (F11): by day'),
    ('no specular', 'web/src/shed.ts', 'm.specular.lerp(tint.setHex(GABLE_OUTSIDE.specular), k);', '', 'A6 (F11): by day'),
    ('the camera in world, not the shed', 'web/src/shed.ts', 'cam.copy(camera.position).applyMatrix4(inverse.copy(group.matrixWorld).invert());', 'cam.copy(camera.position);', 'A6'),
    ('dusk all or nothing', 'web/src/shed.ts', 'm.opacity = (was * (1 - k) + GABLE_OUTSIDE.opacity * k)', 'm.opacity = (k > 0 ? GABLE_OUTSIDE.opacity : was)', 'from inside'),
    ('the front glass dark too', 'web/src/shed.ts', '  dimInXray(lunMesh, group);', '  gableGlassView(lunMesh, group, { length: -1e6 });', 'from inside'),
    ('the gables keep the streaks', 'web/src/shed.ts', 'even = glintEven.value; glintEven.value = k;', 'even = glintEven.value;', 'A6 (F11b): the gable glass flattens'),
    ('the flattening left on', 'web/src/shed.ts', 'glintEven.value = even; gableDraw.value = drawn; };', 'gableDraw.value = drawn; };',  # anchor moved round F17
     'A6 (F11b): the gable glass flattens'),
    ('flattened always', 'web/src/shed.ts', 'even = glintEven.value; glintEven.value = k;', 'even = glintEven.value; glintEven.value = 1;', 'A6 (F11b): the gable glass flattens'),
    ('the shader ignores it', 'web/src/materials.ts', 'mix( smoothstep( -0.6, 0.9, gb ), ${GLINT_EVEN}, uGlintEven )', 'smoothstep( -0.6, 0.9, gb )', 'A6 (F11b): with glintEven'),
    ('half flattened', 'web/src/materials.ts', 'mix( smoothstep( -0.6, 0.9, gb ), ${GLINT_EVEN}, uGlintEven )', 'mix( smoothstep( -0.6, 0.9, gb ), ${GLINT_EVEN}, 0.5 * uGlintEven )', 'A6 (F11b): with glintEven'),
    ('a bright even sheen', 'web/src/materials.ts', 'export const GLINT_EVEN = 0.3;', 'export const GLINT_EVEN = 2.5;', 'A6 (F11b): with glintEven'),
    ('its own uniform object', 'web/src/materials.ts', '    shader.uniforms.uGlintEven = glintEven;\n', '    shader.uniforms.uGlintEven = { value: 0 };\n', 'A6 (F11b): with glintEven'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round31.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round31-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 6 else 0)
