"""Catch round A5-1's roof regressions (the crown glass from outside opaque, tinted, barred and writing depth in the physical modes; the subdued
intermediate rib caps; the smooth seamed slate flank; x-ray, inside and night as before) through web/tests/kx-roof-round13.test.ts only.
Usage: python3 -I -u tools/mutation/kx-roof-round13.py SOURCE WORKTREE_SCRATCH
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
    ('the old alpha', 'web/src/lighting.ts', 'CROWN_OUTSIDE = { alpha: 0.9,', 'CROWN_OUTSIDE = { alpha: 0.85,', 'writes depth'),
    ('x-ray alpha raised too', 'web/src/shed.ts', "(mode === 'xray' ? CROWN_ALPHA * XRAY_OPACITY : CROWN_OUTSIDE.alpha)", "(mode === 'xray' ? CROWN_OUTSIDE.alpha * XRAY_OPACITY : CROWN_OUTSIDE.alpha)", 'writes depth'),
    ('depth at night', 'web/src/shed.ts', "return mode !== 'xray' && night < 0.5 && crownOutside(cam, layout) > 0;", "return mode !== 'xray' && crownOutside(cam, layout) > 0;", 'writes depth'),
    ('depth in x-ray', 'web/src/shed.ts', "return mode !== 'xray' && night < 0.5 && crownOutside(cam, layout) > 0;", "return night < 0.5 && crownOutside(cam, layout) > 0;", 'writes depth'),
    ('depth inside', 'web/src/shed.ts', "return mode !== 'xray' && night < 0.5 && crownOutside(cam, layout) > 0;", "return mode !== 'xray' && night < 0.5;", 'writes depth'),
    ('depth never set', 'web/src/shed.ts', "    glassMat.depthWrite = crownDepth(", "    void crownDepth(", 'writes depth'),
    ('tint in x-ray', 'web/src/shed.ts', "return mode === 'xray' ? 0 : crownOutside(cam, layout);", "return crownOutside(cam, layout);", 'writes depth'),
    ('the tint line left off', 'web/src/lighting.ts', "${CROWN_ABOVE_LINE}\\n${CROWN_OUTSIDE_LINE}\\n#include <opaque_fragment>", "${CROWN_ABOVE_LINE}\\n#include <opaque_fragment>", 'writes depth'),
    ('a dark tint', 'web/src/lighting.ts', 'tint: 0xa9b6c2, weight: 0.7,', 'tint: 0x5a6672, weight: 0.7,', 'pale grey-blue'),
    ('a faint tint', 'web/src/lighting.ts', 'tint: 0xa9b6c2, weight: 0.7,', 'tint: 0xa9b6c2, weight: 0.3,', 'pale grey-blue'),
    ('bars at 1.8 m', 'web/src/lighting.ts', 'bars: { pitch: 1.2, width: 0.06, shade: 0.45 }', 'bars: { pitch: 1.8, width: 0.06, shade: 0.45 }', 'pale grey-blue'),
    ('black bars', 'web/src/lighting.ts', 'bars: { pitch: 1.2, width: 0.06, shade: 0.45 }', 'bars: { pitch: 1.2, width: 0.06, shade: 0.95 }', 'pale grey-blue'),
    ('no bar fade', 'web/src/lighting.ts', "return mix( cover, ${(width / pitch).toFixed(5)},", "return mix( cover, cover,", 'pale grey-blue'),
    ('point-sampled bars', 'web/src/lighting.ts', "float h = 0.5 * max( fw, 0.00001 );", "float h = 0.00001;", 'pale grey-blue'),
    ('no seam fade', 'web/src/lighting.ts', "return mix( cover, ${(width / pitch).toFixed(5)},", "return mix( cover, cover,", 'slate flank'),
    ('the old wide caps', 'web/src/shed.ts', 'ribCap: [0.15, 0.12], capColour: 0x4a5058,', 'ribCap: [0.3, 0.12], capColour: 0x4a5058,', 'intermediate rib caps'),
    ('dark caps', 'web/src/shed.ts', 'ribCap: [0.15, 0.12], capColour: 0x4a5058,', 'ribCap: [0.15, 0.12], capColour: 0x343b42,', 'intermediate rib caps'),
    ('caps not painted', 'web/src/shed.ts', "skip: ['+x', '-x', '-y'], color: capPaint });", "skip: ['+x', '-x', '-y'] });", 'intermediate rib caps'),
    ('a light end rib', 'web/src/shed.ts', 'endRib: [0.5, 0.6],', 'endRib: [0.15, 0.12],', 'intermediate rib caps'),
    ('the speckle kept', 'web/src/lighting.ts', "return mix( c, ${gl3(new THREE.Color(SLATE_FLANK.color))}", "return mix( c, c", 'slate flank'),
    ('seams 1 m apart', 'web/src/lighting.ts', 'SLATE_FLANK = { color: 0x3c4148, pitch: 0.5,', 'SLATE_FLANK = { color: 0x3c4148, pitch: 1.0,', 'slate flank'),
    ('no seams', 'web/src/lighting.ts', 'width: 0.03, shade: 0.35 }', 'width: 0.03, shade: 0 }', 'slate flank'),
    ('flank in x-ray', 'web/src/shed.ts', "slateFlank.value = crownTint([local.x, local.y, local.z], layout, roofMode());", "slateFlank.value = crownOutside([local.x, local.y, local.z], layout);", 'slate flank'),
    ('flank inside', 'web/src/shed.ts', "slateFlank.value = crownTint([local.x, local.y, local.z], layout, roofMode());", "slateFlank.value = roofMode() === 'xray' ? 0 : 1;", 'slate flank'),
    ('flank not patched', 'web/src/shed.ts', "  addSlateFlank(cladMat, slateFlank);\n", "", 'slate flank'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-roof-round13.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-roof-round13-', dir=out) as tmp:
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
