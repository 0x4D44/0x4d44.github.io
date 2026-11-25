"""Catch round 17's platform regressions (the strips' joint phase and the night coping, B4; the blades' size, clearance and night face, the furniture camera
and the clock's neutral night dial, B5) through web/tests/kx-platform-round17.test.ts only.
Usage: python3 -I -u tools/mutation/kx-platform-round17.py SOURCE WORKTREE_SCRATCH
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
    ('the strips on their own run again', 'web/src/furniture.ts', "return [dot2(rel, e.inward), worldV ? -p[1] : s0 + dot2(rel, e.dir)];", "return [dot2(rel, e.inward), s0 + dot2(rel, e.dir)];", 'B4: every top'),
    ('the world v off by half a joint', 'web/src/furniture.ts', "worldV ? -p[1] : s0", "worldV ? -p[1] + 0.375 : s0", 'B4: every top'),
    ('only exactly-z edges take it', 'web/src/furniture.ts', "export const STRIP_WORLD_V = (10 * Math.PI) / 180;", "export const STRIP_WORLD_V = 0;", 'B4: every top'),
    ('the coping lit by day too', 'web/src/materials.ts', "* vKxCover * uWinNight );\\n#endif", "* vKxCover );\\n#endif", 'B4: after dark'),
    ('the whole strip lit', 'web/src/materials.ts', "if ( vMapUv.x < ${glslFloat(u)} ) totalEmissiveRadiance", "totalEmissiveRadiance", 'B4: after dark'),
    ('a glow strip', 'web/src/materials.ts', "export const COPING_NIGHT = { floor: 0x5a5a55,", "export const COPING_NIGHT = { floor: 0xb0b0a8,", 'B4: after dark'),
    ('the old dim floor', 'web/src/materials.ts', "export const COPING_NIGHT = { floor: 0x5a5a55,", "export const COPING_NIGHT = { floor: 0x2c2c29,", 'B4: after dark'),
    ('the -z face mirrored again', 'web/src/furniture.ts', "b.aabb(Math.min(side * a0, side * a1), b0,", "b.aabb(Math.min(a0, a1), b0,", 'B5: each blade face'),
    ('both faces mirrored', 'web/src/furniture.ts', "b.aabb(Math.min(side * a0, side * a1), b0, side > 0 ? 0.03 : -0.036, Math.max(side * a0, side * a1),", "b.aabb(Math.min(-side * a0, -side * a1), b0, side > 0 ? 0.03 : -0.036, Math.max(-side * a0, -side * a1),", 'B5: each blade face'),
    ('the old 1.2 m bins', 'web/src/furniture.ts', "for (const sx of [-0.27, 0.27]) {", "for (const sx of [-0.33, 0.33]) {", 'B5: the bins'),
    ('bins too tall', 'web/src/furniture.ts', "b.aabb(sx - 0.25, 0.95, -0.28, sx + 0.25, 1.0, 0.28, IRON, true);", "b.aabb(sx - 0.25, 0.95, -0.28, sx + 0.25, 1.12, 0.28, IRON, true);", 'B5: the bins'),
    ('the coping not hooked', 'web/src/materials.ts', "  platformEdgeStripShed: () => copingNight(nearer(tiled('platformEdge'))),", "  platformEdgeStripShed: () => nearer(tiled('platformEdge')),", 'B4: after dark'),
    ('the blade back at round 16\'s size', 'web/src/furniture.ts', "export const BLADE = { top: 4.3, size: 1.0, digit: 0.66,", "export const BLADE = { top: 4.3, size: 0.7, digit: 0.4,", 'B5: the blades'),
    ('the blade down among the heads', 'web/src/furniture.ts', "export const BLADE = { top: 4.3,", "export const BLADE = { top: 3.4,", 'B5: the blades'),
    ('the faces unlit at night', 'web/src/furniture.ts', "totalEmissiveRadiance = max( totalEmissiveRadiance, vColor.rgb * ${BLADE.night.toFixed(2)} * uWinNight );", "", 'B5: the blades'),
    ('the faces in the body mesh', 'web/src/furniture.ts', "    if (faces.length) {", "    if (faces.length < 0) {", 'B5: the blades'),
    ('no platform-furniture camera', 'tools/tests/frozen-station-cameras.json', '"platform-furniture"', '"platform-furniture-x"', 'B5: a platform-furniture'),
    ('the camera 25 m off', 'tools/tests/frozen-station-cameras.json', '"pos": [\n      25.0523,\n      2.5,\n      -96.8263\n    ]', '"pos": [\n      25.0523,\n      2.5,\n      -81.8263\n    ]', 'B5: a platform-furniture'),
    ('the night dial blue again', 'web/src/shed.ts', "  clockMat.userData.glowNeutral = true;", "  clockMat.userData.glowNeutral = false;", 'B5: the platform clock'),
    ('neutral ignored', 'web/src/night.ts', "material.color.setRGB(...(material.userData.glowNeutral ? DIAL_GLOW_NEUTRAL : DIAL_GLOW))", "material.color.setRGB(...DIAL_GLOW)", 'B5: the platform clock'),
    ('neutral leaks to the tower', 'web/src/night.ts', "material.userData.glowScale as number | undefined) ?? 1, material.userData.glowNeutral === true));", "material.userData.glowScale as number | undefined) ?? 1, true));", 'B5: the platform clock'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-platform-round17.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-platform-round17-', dir=out) as tmp:
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
