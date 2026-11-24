"""Catch round 14's platform regressions (the edge strip's layout and speckle, B4; the platform clock's night glow, arm, spandrel and camera, B5) through
web/tests/kx-platform-round14.test.ts only.
Usage: python3 -I -u tools/mutation/kx-platform-round14.py SOURCE WORKTREE_SCRATCH
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
    ('the tactile straight behind the coping, as round 13 had it', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a');", "band(0.2, 0.6, '#92886a');", 'B4'),
    ('the tactile buff again', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a');", "band(0.5, 0.9, '#bba77a');", 'B4'),
    ('the tactile the surface grey', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a');", "band(0.5, 0.9, '#787670');", 'B4'),
    ('a yellow line back', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a'); // the tactile strip, a muted yellow-khaki", "band(0.5, 0.9, '#92886a'); band(0.9, 1.0, '#d9b21a'); // the tactile strip, a muted yellow-khaki", 'B4'),
    ('the coping dark', 'web/src/materials.ts', "band(0, 0.2, '#c4c4bd');", "band(0, 0.2, '#8e8e8a');", 'B4'),
    ('no speckle (the seam back)', 'web/src/materials.ts', "for (let i = 0, n = Math.round(1300 * area); i < n; i++) {", "for (let i = 0, n = Math.round(0 * area); i < n; i++) {", 'B4'),
    ('specks a texel, not the tops\' size', 'web/src/materials.ts', "const speck = pxm / 128,", "const speck = 1,", 'B4'),
    ('the faces merged again (no glow)', 'web/src/shed.ts', "  const clockMat = clockMaterial(), faceGeo = new THREE.CircleGeometry(radius, 40);", "  const clockMat = clockMaterial(), faceGeo = new THREE.CircleGeometry(radius, 40).toNonIndexed();", 'B5'),
    ('the arm thin again', 'web/src/shed.ts', "bd = 0.18, top", "bd = 0.12, top", 'B5'),
    ('no spandrel', 'web/src/shed.ts', '  for (let k = 0; k < 8; k++) {\n    const [ax, ay] = at(Math.PI - (Math.PI / 2) * (k / 8)), [bx, by] = at(Math.PI - (Math.PI / 2) * ((k + 1) / 8));\n    iron.box([(ax + bx) / 2, (ay + by) / 2, z], [Math.hypot(bx - ax, by - ay) + 0.02, 0.07, 0.08], { rotZ: Math.atan2(by - ay, bx - ax) });\n  }\n  for (let k = 0; k < 6; k++) {', '  for (let k = 0; k < 0; k++) {\n    const [ax, ay] = at(Math.PI - (Math.PI / 2) * (k / 8)), [bx, by] = at(Math.PI - (Math.PI / 2) * ((k + 1) / 8));\n    iron.box([(ax + bx) / 2, (ay + by) / 2, z], [Math.hypot(bx - ax, by - ay) + 0.02, 0.07, 0.08], { rotZ: Math.atan2(by - ay, bx - ax) });\n  }\n  for (let k = 0; k < 0; k++) {', 'B5'),
    ('the camera at the far face', 'tools/tests/frozen-station-cameras.json', '"pos": [\n      14.6943,\n      2.5,\n      -155.9474\n    ]', '"pos": [\n      15.37,\n      2.5,\n      -180.05\n    ]', 'B5'),
    ('the camera 30 m off', 'tools/tests/frozen-station-cameras.json', '"pos": [\n      14.6943,\n      2.5,\n      -155.9474\n    ]', '"pos": [\n      14.6943,\n      2.5,\n      -138.9474\n    ]', 'B5'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-platform-round14.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-platform-round14-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 2 else 0)
