"""Catch round 11's crown-glass regressions (the glass's look from above, outside only, the inside program as it was) through
web/tests/kx-crown-above-round11.test.ts only.
Usage: python3 -I -u tools/mutation/kx-crown-above-round11.py SOURCE WORKTREE_SCRATCH
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
    ('level ignores the inside', 'web/src/shed.ts', "  return smoothstep(0, ROOF_EXTERIOR.fade, Math.hypot(dx, dy, dz));\n}", "  return smoothstep(-ROOF_EXTERIOR.fade, ROOF_EXTERIOR.fade, Math.hypot(dx, dy, dz));\n}", 'crownOutside is 0'),
    ('crownOutside takes the roof mode', 'web/src/shed.ts', "export function crownOutside(cam: V3, layout: Pick<ShedLayout, 'width' | 'length' | 'crown'>): number {", "export function crownOutside(cam: V3, layout: Pick<ShedLayout, 'width' | 'length' | 'crown'>, _mode?: RoofMode): number {", 'crownOutside is 0'),
    ('bars left dark', 'web/src/lighting.ts', 'pane: 0.75, share: 0.9,', 'pane: 0.75, share: 0.5,', 'crownAbove: nothing at level 0'),
    ('panes lifted too far', 'web/src/lighting.ts', 'pane: 0.75, share: 0.9,', 'pane: 1.3, share: 0.9,', 'crownAbove: nothing at level 0'),
    ('lift applied at level 0', 'web/src/lighting.ts', 'return min( mix( c, lifted, w ),', 'return min( mix( c, lifted, w + 0.3 ),', 'crownAbove: nothing at level 0'),
    ('no cap', 'web/src/lighting.ts', 'return min( mix( c, lifted, w ), max( c, vec3(', 'return max( mix( c, lifted, w ), min( c, vec3(', 'crownAbove: nothing at level 0'),
    ('pane tone not the painted one', 'web/src/lighting.ts', 'paneLuma: 0.602,', 'paneLuma: 0.7,', 'crownAbove: nothing at level 0'),
    ('mask not read off the texel', 'web/src/lighting.ts', ', 0.0, 1.0 ) ), crownTexel, dot( normal, normalize( vViewPosition ) ) );\\n', ', 0.0, 1.0 ) ), 1.0 - crownPaneK, dot( normal, normalize( vViewPosition ) ) );\\n', "the shed's glass carries it"),
    # re-anchored round A5-1: addCrownAbove takes CROWN_OUTSIDE's level too
    ('glass not given it', 'web/src/shed.ts', '  addCrownAbove(glassMat, crownAbove, glassAlpha, glassTint);\n', '', "the shed's glass carries it"),
    ('not by day only', 'web/src/lighting.ts', 'if ( uCrownAbove * uCrownBelow > 0.0 ) outgoingLight = crownAbove( outgoingLight, uCrownAbove * uCrownBelow *', 'if ( uCrownAbove > 0.0 ) outgoingLight = crownAbove( outgoingLight, uCrownAbove *', "the shed's glass carries it"),
    ('on a face that looks down', 'web/src/lighting.ts', 'clamp( dot( normal, viewMatrix[ 1 ].xyz ), 0.0, 1.0 ) ), crownTexel,', 'clamp( dot( normal, -viewMatrix[ 1 ].xyz ), 0.0, 1.0 ) ), crownTexel,', "the shed's glass carries it"),
    # re-anchored round A5-1: the header carries CROWN_OUTSIDE's uniform and functions
    ('an extra change in the program', 'web/src/lighting.ts', 'uniform float uCrownTint;\\n${CROWN_ABOVE_GLSL}${CROWN_OUTSIDE_GLSL}`', 'uniform float uCrownTint;\\n${CROWN_ABOVE_GLSL}${CROWN_OUTSIDE_GLSL}\\nfloat crownExtra;`', "the shed's glass carries it"),
    ('level never set', 'web/src/shed.ts', '    crownAbove.value = crownOutside([local.x, local.y, local.z], layout);\n', '', "the shed's glass carries it"),
    ('alpha lowered, not raised', 'web/src/lighting.ts', 'diffuseColor.a = mix( max( diffuseColor.a, uCrownAlpha ),', 'diffuseColor.a = mix( uCrownAlpha,', "the shed's glass carries it"),
    ('alpha raised at night too', 'web/src/lighting.ts', 'if ( uCrownAlpha * uCrownBelow > 0.0 )', 'if ( uCrownAlpha > 0.0 )', "the shed's glass carries it"),
    # re-anchored round A5-1: crownAlpha takes CROWN_OUTSIDE.alpha outside x-ray
    ('alpha raised inside', 'web/src/shed.ts', "  return crownOutside(cam, layout) * (mode === 'xray' ? CROWN_ALPHA * XRAY_OPACITY : CROWN_OUTSIDE.alpha);", "  return (mode === 'xray' ? CROWN_ALPHA * XRAY_OPACITY : CROWN_OUTSIDE.alpha);", "the shed's glass carries it"),
    # re-anchored round A5-1: as above
    ('x-ray mode ignored', 'web/src/shed.ts', "(mode === 'xray' ? CROWN_ALPHA * XRAY_OPACITY : CROWN_OUTSIDE.alpha)", "(mode === 'xray' ? CROWN_OUTSIDE.alpha : CROWN_OUTSIDE.alpha)", "the shed's glass carries it"),
    ('alpha too low', 'web/src/lighting.ts', 'export const CROWN_ALPHA = 0.85;', 'export const CROWN_ALPHA = 0.5;', "the shed's glass carries it"),
    ('alpha never set', 'web/src/shed.ts', '    glassAlpha.value = crownAlpha([local.x, local.y, local.z], layout, roofMode());\n', '', "the shed's glass carries it"),
    ('alpha through the material opacity', 'web/src/shed.ts', '    glassAlpha.value = crownAlpha([local.x, local.y, local.z], layout, roofMode());\n', '    glassAlpha.value = 0; glassMat.opacity = Math.max(glassMat.opacity, crownAlpha([local.x, local.y, local.z], layout, roofMode()));\n', "the shed's glass carries it"),
    ('no sky reflection', 'web/src/lighting.ts', 'f0: 0.04, reflect: 0.35', 'f0: 0.04, reflect: 0.0', 'round 12'),
    # re-anchored round A5-1: CROWN_OUTSIDE_GLSL has a Fresnel of its own; this one is CROWN_ABOVE's
    ('reflection inverted', 'web/src/lighting.ts', 'pow( 1.0 - clamp( ndv, 0.0, 1.0 ), 5.0 );\n  vec3 lifted', 'pow( clamp( ndv, 0.0, 1.0 ), 5.0 );\n  vec3 lifted', 'round 12'),
    ('reflection to the sky', 'web/src/lighting.ts', 'f0: 0.04, reflect: 0.35', 'f0: 0.04, reflect: 1.0', 'round 12'),
    ('pane tone back to 1.05', 'web/src/lighting.ts', 'pane: 0.75, share: 0.9,', 'pane: 1.05, share: 0.9,', 'round 12'),
    ('down faces not faded from outside', 'web/src/lighting.ts', 'diffuseColor.a * ( 1.0 - uCrownAbove )', 'diffuseColor.a', "the shed's glass carries it"),
    ('level the cladding opacity', 'web/src/shed.ts', '    crownAbove.value = crownOutside([local.x, local.y, local.z], layout);\n', '    crownAbove.value = roofOpacity([local.x, local.y, local.z], layout, roofMode());\n', "the shed's glass carries it"),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-crown-above-round11.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-crown-above-round11-', dir=out) as tmp:
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
