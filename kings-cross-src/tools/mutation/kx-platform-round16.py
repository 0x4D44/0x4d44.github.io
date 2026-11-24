"""Catch round 16's platform regressions (bins, number blades and trolley points, B5; the tops' slab joints and the coping, B4) through
web/tests/kx-platform-round16.test.ts only.
Usage: python3 -I -u tools/mutation/kx-platform-round16.py SOURCE WORKTREE_SCRATCH
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
    ('no trolley points', 'web/src/furniture.ts', "  trolley: { offsets: [15.25, -15.25, -27.45, 27.45, -33.55, 33.55, -39.65, 39.65], r: 1.2, across: 0.55 },", "  trolley: { offsets: [], r: 1.2, across: 0.55 },", 'B5: bins'),
    # dropping the clock-bay guard (EXTRA_CLOCK_CLEAR) is an equivalent mutant on today's track data: no extra's offset lands within 6 m of the clock's rib
    ('extras not checked against their neighbours', 'web/src/furniture.ts', "          const c: ExtraPlacement = { ref: at.home.ref, x: at.x, z: at.z, rotY: by.rotY, r: spec.r, across: spec.across, kind, label: refs.join(' ') };\n          const clear = near.every(", "          const c: ExtraPlacement = { ref: at.home.ref, x: at.x, z: at.z, rotY: by.rotY, r: spec.r, across: spec.across, kind, label: refs.join(' ') };\n          const clear = true || near.every(", 'B5: bins'),
    ('two of each per island', 'web/src/furniture.ts', "            plan.extras.push(c);\n            near.push(c);\n            break extra;", "            plan.extras.push(c);\n            near.push(c);", 'B5: bins'),
    ('the extras cast', 'web/src/lighting.ts', "'shed-arch-rings',", "'shed-arch-rings', 'platform-extras',", 'B5: one merged'),
    ('the extras unbuilt', 'web/src/furniture.ts', "  if (plan.extras.length > 0) {", "  if (plan.extras.length < 0) {", 'B5: one merged'),
    ('a floating blade', 'web/src/furniture.ts', "    b.aabb(-0.05, 0, -0.05, 0.05, BLADE.top - BLADE.size, 0.05, IRON);", "    b.aabb(-0.05, 1.2, -0.05, 0.05, BLADE.top - BLADE.size, 0.05, IRON);", 'B5: one merged'),
    ('a blank blade', 'web/src/furniture.ts', "      for (const s of SEGMENTS[ch] ?? '') for (const side of [-1, 1]) {", "      for (const s of '') for (const side of [-1, 1]) {", 'B5: one merged'),
    ('one digit only', 'web/src/furniture.ts', ".replace(/[^0-9]/g, '').slice(0, 2);", ".replace(/[^0-9]/g, '').slice(0, 1);", 'B5: one merged'),
    ('no joints on the tops', 'web/src/materials.ts', "  for (let v = 0; v < TEXTURES.platformTop.tile[1] - 1e-6; v += PLATFORM_JOINT) joint(g, w, v * pxm);", "", 'B4'),
    ('joints too close', 'web/src/materials.ts', "export const PLATFORM_JOINT = 0.75;", "export const PLATFORM_JOINT = 0.45;", 'B4'),
    ('the edge strip\'s tile off the pitch', 'web/src/materials.ts', "platformEdge: { tile: [1.6, 0.75], px: [320, 150],", "platformEdge: { tile: [1.6, 0.5], px: [320, 100],", 'B4'),
    ('no joint in the strip', 'web/src/materials.ts', "  joint(g, w, 0); // round 16: the slab joint", "  // round 16: the slab joint", 'B4'),
    ('the joints in the shared asphalt', 'web/src/materials.ts', "  for (let i = 0, n = Math.round((5200 * w * h) / (256 * 256)); i < n; i++) {", "  joint(g, w, 0);\n  for (let i = 0, n = Math.round((5200 * w * h) / (256 * 256)); i < n; i++) {", 'B4'),
    ('the tops back on the asphalt', 'web/src/furniture.ts', "    ['platform-tops', tops, material('platformTop')],", "    ['platform-tops', tops, material('asphalt')],", 'B4'),
    ('the tops dry in the wet', 'web/src/atmosphere.ts', "  ['platformTop', { dark: 0.42, sheen: 1, snow: 1 }],", "  ['platformTop', { dark: 0.1, sheen: 1, snow: 1 }],", 'B4'),
    ('the platform face cream again', 'web/src/shed.ts', "export const PLATFORM_DIAL_LOOK: DialLook = { face: '#fbfbf8',", "export const PLATFORM_DIAL_LOOK: DialLook = { face: '#efe8d4',", 'B5: the platform clock'),
    ('no gold ring', 'web/src/shed.ts', "  g.strokeStyle = look.chapter ?? ink; // the inner chapter ring", "  g.strokeStyle = ink; // the inner chapter ring", 'B5: the platform clock'),
    ('the gold ring on the tower too', 'web/src/shed.ts', "export const TOWER_DIAL_LOOK: DialLook = { face: '#efe8d4' };", "export const TOWER_DIAL_LOOK: DialLook = { face: '#efe8d4', chapter: '#c9a03a' };", 'B5: the platform clock'),
    ('the clock wears the tower look', 'web/src/shed.ts', "clockMaterial(PLATFORM_DIAL_LOOK), faceGeo", "clockMaterial(), faceGeo", 'B5: the platform clock'),
    ('the web unpierced', 'web/src/shed.ts', "    const cuts = roundels.filter(([rx, , rr]) => edge(rx) < rr)", "    const cuts = roundels.filter(([rx, , rr]) => edge(rx) < -rr)", 'B5: the clock\'s spandrel'),
    ('the roundels unringed', 'web/src/shed.ts', "  for (const [rx, ry, rr] of roundels) ring(rx, ry, rr, 0.04);", "", 'B5: the clock\'s spandrel'),
    ('no scroll edge', 'web/src/shed.ts', "    for (let k = 0; k < 6; k++) {\n      const [ax, ay] = pt(", "    for (let k = 0; k < 0; k++) {\n      const [ax, ay] = pt(", 'B5: the clock\'s spandrel'),
    ('the scroll one side only', 'web/src/shed.ts', "  for (const s of [-1, 1]) {\n    const xc = cx + s * radius * 0.55,", "  for (const s of [1]) {\n    const xc = cx + s * radius * 0.55,", 'B5: the clock\'s spandrel'),
    ('the coping back to round 15', 'web/src/materials.ts', "band(0, 0.2, '#d4d4ce');", "band(0, 0.2, '#c4c4bd');", 'B4'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-platform-round16.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-platform-round16-', dir=out) as tmp:
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
