"""Mutation checks for how the light lands on the model (web/src/lighting.ts: the grade, the sun's shadow, the shade under a roof, the contact shade at a
wall's foot, the slab tone, the concourse's fill and its weights; the three small cross-file links its tests hold: the contact shade's define in
web/src/materials.ts and the paving's, the concourse's soffit name in web/src/concourse.ts) and for the build's squeeze of GLSL (vite.config.ts: the
`/* glsl */` template squeeze, the squeeze of three.js's own shader strings, and the plugin list);
usage: lighting.py <kings-cross-src> <.scratch/output> [--check] [label text ...].

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass each command first, a mutant is killed only by a
named test that fails by assertion (a load error or a crash is an ERROR, not a kill), and every test of these files must be turned red by at least one
mutation (tools/mutation/lib/kxmut.py). A mutation given as a list of (old, new) pairs applies them together.

Four test commands, because a test file that dies on its own import hides the others in the same run (kxmut calls that an ERROR, never a kill): the page's
tests of lighting.ts (web/tests/lighting.test.ts); the GLSL squeeze's (tools/tests/glsl-squeeze.test.ts); the squeeze of three's strings
(tools/tests/three-squeeze.test.ts: the function and the plugin on small modules, the squeeze of the real three.module.js, the patterns of three that read
the squeezed text, and a scan of every shader match in web/src); and the page's own hooks run on the squeezed text
(tools/tests/three-squeeze-hooks.test.ts). A mutation names the lanes that judge it (the `Where` it carries) and is killed when any lane kills it; a mutation
no lane kills and one a lane errs on is reported as it was, never as caught. A mutation of lighting.ts that stops the module loading (the patches of two of
three's chunks throw when a phrase has gone) is judged by the hooks test alone, which loads it inside a `try`.

The mutations are of behaviour, not of tuning: a clamp or a guard removed, a sign or an axis wrong, a term or a call left out, two things in the wrong
order, a branch the wrong way round. Round seven (night lighting) is working in lighting-adjacent files, so nothing here anchors on a night or emissive line:
the glow below a glazed roof (`GLOW_BELOW`, its gain and the `totalEmissiveRadiance` line), the lamps and the stand-ins are not mutated, and no mutation
anchors on a tuned colour or tint. The numbers in `ROOF_SHADE` and `INTERIOR` are mutated by a factor put in front of the first digit, never by their
own digits, so a retune of the amounts leaves every anchor in place.

Equivalent mutants were reasoned out and left out; none of them can change a value the page holds or a call it makes (a guard that only saves work is not among
them: its test counts the calls, and the mutation is in the list):
- `let dirty = true` in createAdditionsWatch: the first look proceeds anyway, because `last` starts null.
- `Math.max(SHADOW_STEPS[0], ...)` in shadowFit: `find` already gives the first step for any smaller want.
- `Math.min(1, Math.max(-1, dir[1]))` in shadowFit: `unit3` divides by `Math.hypot`, which is never smaller than its largest part, so `dir[1]` is within [-1, 1].
- `${casters.length}` in the redraw key: `seen` holds one character per caster, so its length already says it.
- the order of `#include <common>` and COVER_GLSL in addRoofShade: cover.ts's functions call nothing that common defines.
- the initial values of the two roof-shade uniforms: `grade` writes both before every frame is drawn (web/src/main.ts holds the only `render` call).
- `if ( roofK.b < 1.0 )` in the concourse's fill and the order of the shade's declarations and the include they follow: a branch around a product that is
  0 where the branch is not taken, and declarations that GLSL accepts in either order.

`--check` only looks for every mutation's search text in the package (exactly once) and runs nothing. Label text on the command line runs only the
mutations whose label contains it (any of them); the 'never failed' accounting needs the whole list, so a partial run skips it."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

args = sys.argv[1:]
check_only = '--check' in args
args = [a for a in args if a != '--check']
if len(args) < 2:
    raise SystemExit(__doc__)

src = Path(args[0]).resolve()
scratch = Path(args[1]).resolve()
only = [a.lower() for a in args[2:]]
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')

LIGHTING_TEST = 'web/tests/lighting.test.ts'
GLSL_TEST, THREE_TEST, HOOKS_TEST = 'tools/tests/glsl-squeeze.test.ts', 'tools/tests/three-squeeze.test.ts', 'tools/tests/three-squeeze-hooks.test.ts'
LANES = {'lighting': [LIGHTING_TEST], 'glsl': [GLSL_TEST], 'three': [THREE_TEST], 'hooks': [HOOKS_TEST]}
# Tests of this set that no change to the page or the config can turn red: one checks the test file's own scan of shader matches on small made-up modules.
SELF_CHECKS = ('the scan finds a match that spans lines',)


class Where:
    """A file to mutate and the lanes (test commands) that judge a mutation of it."""

    def __init__(self, path, *lanes):
        self.path, self.lanes = path, lanes


LIGHTING, VITE = 'web/src/lighting.ts', 'vite.config.ts'
L = Where(LIGHTING, 'lighting')  # lighting.ts, judged by the page's own tests of it
LOAD = Where(LIGHTING, 'hooks')  # a mutation that stops lighting.ts loading: lighting.test.ts dies on its import, the hooks test loads it inside a try
HOOK = Where(LIGHTING, 'lighting', 'hooks', 'three')  # a change to what the page does to three's shader text: the squeezed text must still take it
V = Where(VITE, 'glsl', 'three', 'hooks')
MATERIALS, CONCOURSE, LANDMARKS = Where('web/src/materials.ts', 'lighting'), Where('web/src/concourse.ts', 'lighting'), Where('web/src/landmarks.ts', 'lighting')

# the hook's block, as the file holds it (a template literal: `\n` is two characters, the other line ends are real)
FILL_LINE = (
    'if ( roofK.b < 1.0 ) reflectedLight.indirectDiffuse += uInteriorFill * ( ( 1.0 - roofK.b ) * coverRoomAt( cameraPosition - vViewPosition * mat3( viewMatrix ) + 0.6 * '
    'inverseTransformDirection( normal, viewMatrix ) ) * ( 1.0 - ${INTERIOR.down.toFixed(2)} * looksDown ) * ( 1.0 - ${INTERIOR.pale.toFixed(2)} * '
    'material.diffuseColor.g * material.diffuseColor.g ) ) * material.diffuseColor * RECIPROCAL_PI;'
)
FOOT_BLOCK = (
    '#ifdef ${FOOT_SHADE}\n  float h = max( vMapUv.y, 0.0 );\n  float foot = 1.0 - ${FOOT_SHADE} * exp( -0.3 * h ) - 0.40 * exp( -2.5 * h );\n'
    '  reflectedLight.directDiffuse *= foot;\n  reflectedLight.indirectDiffuse *= foot;\n#endif\n'
)
GRADE_MAP = 'const mapping = graded ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;'
ROOF_SET = 'set(...(graded ? ROOF_SHADE_LOSS : NO_ROOF_SHADE))'
FILL_CALL = 'interiorFillFor(graded ? hemisphere : 0, cloud, roofShadeUniforms.uInteriorFill.value);'
MARK = r'/\/\* glsl \*\/\s*`/g'
COMMENTS = r'/\/\*[\s\S]*?\*\/|\/\/(?:[^\n\\]|\\[^n])*/g'
HOLD = r'/\\[ \t\r\n]/'
READS = (
    r'/^[ \t]*#[ \t]*(?:if|ifdef|ifndef|else|elif|endif|define|undef|include|extension|version|pragma)\b'
    r'|\bvoid[ \t]+\w+[ \t]*\('
    r'|\b(?:uniform|varying|attribute|precision)[ \t]+\w'
    r'|\b(?:float|int|bool|vec[234]|mat[234])[ \t]+\w+[ \t]*[=;(\[,]/m'
)

MUTATIONS = [
    # ------------------------------------------------------------------------------------------------ the grade (grade)
    ('a scene with a climate is drawn with no tone map', L, GRADE_MAP, 'const mapping = THREE.NoToneMapping;'),
    ('a scene without a climate is drawn through the filmic tone map', L, GRADE_MAP, 'const mapping = THREE.ACESFilmicToneMapping;'),
    ('the grade is the wrong way round', L, GRADE_MAP, 'const mapping = graded ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;'),
    ('the grade is another curve than the filmic one', L, 'graded ? THREE.ACESFilmicToneMapping :', 'graded ? THREE.ReinhardToneMapping :'),
    ('a scene without a climate keeps the last tone map', L, GRADE_MAP, 'const mapping = graded ? THREE.ACESFilmicToneMapping : renderer.toneMapping;'),
    ('the tone map is never set', L, 'if (renderer.toneMapping !== mapping) renderer.toneMapping = mapping;', ''),
    ('the tone map is set only when it already is', L, 'if (renderer.toneMapping !== mapping) renderer.toneMapping = mapping;', 'if (renderer.toneMapping === mapping) renderer.toneMapping = mapping;'),
    ('a scene with a climate is exposed at 1', L, 'renderer.toneMappingExposure = graded ? exposure : 1;', 'renderer.toneMappingExposure = 1;'),
    ('a scene without a climate takes the sky exposure', L, 'renderer.toneMappingExposure = graded ? exposure : 1;', 'renderer.toneMappingExposure = exposure;'),
    ('the exposure is never set', L, 'renderer.toneMappingExposure = graded ? exposure : 1;', ''),
    ('the roof shade is on for every scene', L, ROOF_SET, 'set(...ROOF_SHADE_LOSS)'),
    ('the roof shade is off for every scene', L, ROOF_SET, 'set(...NO_ROOF_SHADE)'),
    ('the roof shade is on where there is no climate and off in London', L, ROOF_SET, 'set(...(graded ? NO_ROOF_SHADE : ROOF_SHADE_LOSS))'),
    ('the grade never writes the roof shade', L, 'roofShadeUniforms.uRoofShade.value.set(...(graded ? ROOF_SHADE_LOSS : NO_ROOF_SHADE));', ''),
    ('a scene without a climate keeps the concourse fill', L, 'interiorFillFor(graded ? hemisphere : 0, cloud,', 'interiorFillFor(hemisphere, cloud,'),
    ('the concourse fill ignores the sky', L, 'interiorFillFor(graded ? hemisphere : 0, cloud,', 'interiorFillFor(graded ? 1 : 0, cloud,'),
    ('the concourse fill ignores the cloud', L, 'interiorFillFor(graded ? hemisphere : 0, cloud,', 'interiorFillFor(graded ? hemisphere : 0, 0,'),
    ('the concourse fill takes the cloud for the sky', L, 'interiorFillFor(graded ? hemisphere : 0, cloud,', 'interiorFillFor(graded ? cloud : 0, hemisphere,'),
    ('the concourse fill is worked out but not kept', L, FILL_CALL, 'interiorFillFor(graded ? hemisphere : 0, cloud);'),
    ('the grade never writes the concourse fill', L, '  ' + FILL_CALL + '\n', ''),
    ('a grade with no sky gives the concourse a fill', L, 'exposure: number, hemisphere = 0, cloud = 0)', 'exposure: number, hemisphere = 1, cloud = 0)'),
    ('a grade with no cloud given has an overcast sky', L, 'hemisphere = 0, cloud = 0)', 'hemisphere = 0, cloud = 1)'),
    # ----------------------------------------------------------------- what stays out of the grade (leaveOutOfGrade, the scan, the watch)
    ('lines stay in the grade', L, '(unlit.isLineBasicMaterial || unlit.isPointsMaterial || unlit.isSpriteMaterial) && material.toneMapped',
     '(unlit.isPointsMaterial || unlit.isSpriteMaterial) && material.toneMapped'),
    ('points stay in the grade', L, '(unlit.isLineBasicMaterial || unlit.isPointsMaterial || unlit.isSpriteMaterial) && material.toneMapped',
     '(unlit.isLineBasicMaterial || unlit.isSpriteMaterial) && material.toneMapped'),
    ('sprites stay in the grade', L, '(unlit.isLineBasicMaterial || unlit.isPointsMaterial || unlit.isSpriteMaterial) && material.toneMapped',
     '(unlit.isLineBasicMaterial || unlit.isPointsMaterial) && material.toneMapped'),
    ('every material leaves the grade', L, '(unlit.isLineBasicMaterial || unlit.isPointsMaterial || unlit.isSpriteMaterial) && material.toneMapped', 'material.toneMapped'),
    ('a material already out of the grade is changed again', L, 'unlit.isSpriteMaterial) && material.toneMapped', 'unlit.isSpriteMaterial)'),
    ('a material leaving the grade keeps its tone map', L, '    material.toneMapped = false;\n', ''),
    ('a material leaving the grade is not recompiled', L, '    material.needsUpdate = true;\n    return true;', '    return true;'),
    ('leaving the grade is reported as no change', L, '    material.needsUpdate = true;\n    return true;', '    material.needsUpdate = true;\n    return false;'),
    ('a material that stays in the grade is reported as changed', L, '    return true;\n  }\n  return false;\n}', '    return true;\n  }\n  return true;\n}'),
    ('the scan looks at an object again', L, '      if (known.has(o)) return;\n      known.add(o);\n      for (const m of materialsOf(o))', '      for (const m of materialsOf(o))'),
    ('the scan counts nothing', L, 'if (leaveOutOfGrade(m)) changed++;', 'leaveOutOfGrade(m);'),
    ('the scan reaches the root\'s children only', L, '    root.traverse((o) => {\n      if (known.has(o)) return;', '    root.children.forEach((o) => {\n      if (known.has(o)) return;'),
    ('the watch always says something was added', L, 'if (root === last && !dirty) return false;', 'if (false) return false;'),
    ('the watch does not notice another scene', L, 'if (root === last && !dirty) return false;', 'if (!dirty) return false;'),
    ('the watch does not notice an addition', L, 'if (root === last && !dirty) return false;', 'if (root === last) return false;'),
    ('the watch forgets which scene it saw last', L, '    last = root;\n', ''),
    ('the watch is never clean', L, '    dirty = false;\n    root.traverse', '    root.traverse'),
    ('the watch does not listen for additions', L, "      o.addEventListener('childadded', hear);\n", ''),
    ('the watch listens for removals, not additions', L, "o.addEventListener('childadded', hear);", "o.addEventListener('childremoved', hear);"),
    ('an object already heard is heard again', L, '      if (heard.has(o)) return;\n', ''),
    ('an object is not remembered as heard', L, '      heard.add(o);\n', ''),
    ('hearing an addition marks nothing', L, 'const hear = (): void => { dirty = true; };', 'const hear = (): void => {};'),
    ('the watch says no to a scene it has not seen', L, '    });\n    return true;\n  };\n}', '    });\n    return false;\n  };\n}'),
    # ----------------------------------------------------------------------------------------------- the shadow box (shadowFit, lightAxes)
    ('the shadow box is as wide as the camera\'s distance', L, 'distance * 1.6)', 'distance)'),
    ('the largest step does not cap the box', L, 'const want = Math.min(SHADOW_STEPS[SHADOW_STEPS.length - 1] as number, Math.max(SHADOW_STEPS[0] as number, distance * 1.6));',
     'const want = Math.max(SHADOW_STEPS[0] as number, distance * 1.6);'),
    ('the box steps up only past a step, not at it', L, 'SHADOW_STEPS.find((s) => s >= want)', 'SHADOW_STEPS.find((s) => s > want)'),
    ('the box takes the step below the one it wants', L, 'SHADOW_STEPS.find((s) => s >= want) as number', '(SHADOW_STEPS.filter((s) => s <= want).pop() ?? SHADOW_STEPS[0]) as number'),
    ('a texel is half a box across', L, 'const texel = (2 * half) / mapSize;', 'const texel = half / mapSize;'),
    ('the focus is snapped along the same axis twice', L, 'const fx = dot3(focus, x), fy = dot3(focus, y);', 'const fx = dot3(focus, x), fy = dot3(focus, x);'),
    ('the focus is not snapped to a texel', L, 'const dx = Math.round(fx / texel) * texel - fx, dy = Math.round(fy / texel) * texel - fy;', 'const dx = 0, dy = 0;'),
    ('the focus is not snapped along the light\'s upright axis', L, 'dy = Math.round(fy / texel) * texel - fy;', 'dy = 0;'),
    ('the focus is not snapped along the light\'s flat axis', L, 'const dx = Math.round(fx / texel) * texel - fx, dy', 'const dx = 0, dy'),
    ('the focus snaps down to a texel, not to the nearest', L, 'Math.round(fx / texel) * texel - fx, dy = Math.round(fy / texel)', 'Math.floor(fx / texel) * texel - fx, dy = Math.floor(fy / texel)'),
    ('the snap leaves out the light\'s upright axis', L, 'focus[0] + x[0] * dx + y[0] * dy, focus[1] + x[1] * dx + y[1] * dy, focus[2] + x[2] * dx + y[2] * dy',
     'focus[0] + x[0] * dx, focus[1] + x[1] * dx, focus[2] + x[2] * dx'),
    ('the snap leaves out the light\'s flat axis', L, 'focus[0] + x[0] * dx + y[0] * dy, focus[1] + x[1] * dx + y[1] * dy, focus[2] + x[2] * dx + y[2] * dy',
     'focus[0] + y[0] * dy, focus[1] + y[1] * dy, focus[2] + y[2] * dy'),
    ('the snap moves the focus the wrong way', L, 'focus[0] + x[0] * dx + y[0] * dy, focus[1] + x[1] * dx + y[1] * dy, focus[2] + x[2] * dx + y[2] * dy',
     'focus[0] - x[0] * dx - y[0] * dy, focus[1] - x[1] * dx - y[1] * dy, focus[2] - x[2] * dx - y[2] * dy'),
    ('a low sun is not held to the ten degree depth', L, 'const lift = Math.max(Math.asin(Math.min(1, Math.max(-1, dir[1]))), (10 * Math.PI) / 180);',
     'const lift = Math.asin(Math.min(1, Math.max(-1, dir[1])));'),
    ('the light stands back by the box and not its margin', L, 'const back = half * 1.2 + 150;', 'const back = half * 1.2;'),
    ('the light stands back by the margin and not the box', L, 'const back = half * 1.2 + 150;', 'const back = 150;'),
    ('the far plane misses the ground the box slopes across', L, 'const far = back + half / Math.tan(lift) + 200;', 'const far = back + 200;'),
    ('the far plane has no margin', L, 'const far = back + half / Math.tan(lift) + 200;', 'const far = back + half / Math.tan(lift);'),
    ('the far plane is cut by the sine of the lift', L, 'half / Math.tan(lift)', 'half / Math.sin(lift)'),
    ('the light stands on the far side of its target', L, 'position: [target[0] + dir[0] * back, target[1] + dir[1] * back, target[2] + dir[2] * back],',
     'position: [target[0] - dir[0] * back, target[1] - dir[1] * back, target[2] - dir[2] * back],'),
    ('the light stands below its target', L, 'target[1] + dir[1] * back,', 'target[1] - dir[1] * back,'),
    ('the depth bias has the wrong sign', L, 'bias: -(0.02 + texel * 0.25) / far,', 'bias: (0.02 + texel * 0.25) / far,'),
    ('the depth bias is not scaled to the depth range', L, 'bias: -(0.02 + texel * 0.25) / far,', 'bias: -(0.02 + texel * 0.25),'),
    ('the depth bias ignores the texel', L, 'bias: -(0.02 + texel * 0.25) / far,', 'bias: -0.02 / far,'),
    ('the normal offset is not capped', L, 'normalBias: Math.min(0.3, Math.max(0.03, texel * 0.8))', 'normalBias: Math.max(0.03, texel * 0.8)'),
    ('the normal offset has no floor', L, 'Math.min(0.3, Math.max(0.03, texel * 0.8))', 'Math.min(0.3, texel * 0.8)'),
    ('the normal offset ignores the texel', L, 'Math.min(0.3, Math.max(0.03, texel * 0.8))', 'Math.min(0.3, Math.max(0.03, 0.1))'),
    ('the fit assumes a map of another size', L, 'toSun: V3, mapSize = SHADOW_MAP_SIZE)', 'toSun: V3, mapSize = 1024)'),
    ('the light\'s frame is built from up even when the sun is overhead', L, 'Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]', '[0, 1, 0]'),
    ('the light\'s frame is built from east whatever the sun', L, 'Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]', '[1, 0, 0]'),
    ('the light\'s frame is left-handed', L, 'return { dir, x, y: cross3(dir, x) };', 'return { dir, x, y: cross3(x, dir) };'),
    ('the light\'s frame is not normalised', L, 'const x = unit3(cross3(Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], dir));', 'const x = cross3(Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], dir);'),
    ('a dot product leaves out the height', L, 'a[0] * b[0] + a[1] * b[1] + a[2] * b[2];', 'a[0] * b[0] + a[2] * b[2];'),
    ('a cross product has its first component backwards', L, 'cross3 = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1],', 'cross3 = (a: V3, b: V3): [number, number, number] => [a[2] * b[1] - a[1] * b[2],'),
    # ------------------------------------------------------------------------------------- the map (shadowMapTarget) and three's two chunks
    ('the shadow map has an RGBA colour attachment', L, 'format: THREE.RedFormat', 'format: THREE.RGBAFormat'),
    ('the shadow map colour attachment is a float', L, 'type: THREE.UnsignedByteType }', 'type: THREE.FloatType }'),
    ('the shadow depth is a float', L, 'new THREE.DepthTexture(size, size, THREE.UnsignedIntType)', 'new THREE.DepthTexture(size, size, THREE.FloatType)'),
    ('the shadow depth has no name', L, "  depth.name = 'sun.shadowMap';\n", ''),
    ('the shadow depth carries a stencil', L, 'depth.format = THREE.DepthFormat;', 'depth.format = THREE.DepthStencilFormat;'),
    ('the shadow depth is not compared', L, 'depth.compareFunction = THREE.LessEqualCompare;', 'depth.compareFunction = null;'),
    ('the shadow depth is compared the wrong way', L, 'depth.compareFunction = THREE.LessEqualCompare;', 'depth.compareFunction = THREE.GreaterEqualCompare;'),
    ('the shadow depth is read nearest, not linear, when shrunk', L, 'depth.minFilter = THREE.LinearFilter;', 'depth.minFilter = THREE.NearestFilter;'),
    ('the shadow depth is read nearest, not linear, when magnified', L, 'depth.magFilter = THREE.LinearFilter;', 'depth.magFilter = THREE.NearestFilter;'),
    ('the shadow map has no depth texture', L, '  map.depthTexture = depth;\n', ''),
    ('a chunk of three that has changed is patched again', L, '  if (text.includes(to)) return; // made already (this module loaded twice)\n', ''),
    ('a chunk of three that has changed is let be', L, "  if (next === text) throw new Error(`lighting.ts: three's ${name} chunk has changed`);\n", ''),
    ('the directional light still asks about a face turned from the sun', L, "'directLight.color *= ( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow( directionalShadowMap[ i ]');",
     "'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]');"),
    ('the directional light asks only a face turned from the sun', L, 'directLight.direction ) > 0.0 ) ? getShadow(', 'directLight.direction ) < 0.0 ) ? getShadow('),
    ('the directional light asks about the surface normal and not the geometry\'s', L, 'receiveShadow && dot( geometryNormal, directLight.direction )', 'receiveShadow && dot( normal, directLight.direction )'),
    ('the directional light patch finds no line', LOAD, "getShadow( directionalShadowMap[ i ]', // the directional light's", "getShadow( directionalShadowMap[ j ]', // the directional light's"),
    ('the soft edge patch finds no statement', LOAD, r'vogelDiskSample\( 0, 5, phi \)', r'vogelDiskSample\( 0, 6, phi \)'),
    ('the soft edge keeps three\'s five asks', L, 'if (SHADOW_TAPS < 5) {', 'if (SHADOW_TAPS > 5) {'),
    ('the soft edge asks one time too few', L, 'Array.from({ length: SHADOW_TAPS }, (_, i)', 'Array.from({ length: SHADOW_TAPS - 1 }, (_, i)'),
    ('the soft edge turns every ask by the same disk of five', L, 'vogelDiskSample( ${i}, ${SHADOW_TAPS}, phi )', 'vogelDiskSample( ${i}, 5, phi )'),
    ('the soft edge asks at one point', L, ' * radius, shadowCoord.z ) )`', ', shadowCoord.z ) )`'),
    ('the soft edge asks about the wrong depth', L, 'phi ) * radius, shadowCoord.z ) )`', 'phi ) * radius, shadowCoord.w ) )`'),
    ('the soft edge sums its asks the wrong way', L, "`shadow = ( ${asks.join(' + ')} ) *", "`shadow = ( ${asks.join(' - ')} ) *"),
    ('the soft edge is not averaged', L, '`shadow = ( ${asks.join(\' + \')} ) * ${(1 / SHADOW_TAPS).toFixed(8)};`', "`shadow = ( ${asks.join(' + ')} );`"),
    ('the soft edge is averaged over the wrong count', L, '(1 / SHADOW_TAPS).toFixed(8)', '(1 / 5).toFixed(8)'),
    # ---------------------------------------------------------------------------------------------------------------- createSunShadow
    ('the sun does not cast', L, '  sun.castShadow = true;\n  sun.shadow.mapSize', '  sun.shadow.mapSize'),
    ('the shadow map is the default size', L, '  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);\n', ''),
    ('the shadow map is not square', L, 'sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);', 'sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE / 2);'),
    ('the shadow edge has no softness', L, 'sun.shadow.radius = 1.6;', 'sun.shadow.radius = 0;'),
    ('the shadow map is redrawn every frame', L, '  sun.shadow.autoUpdate = false;\n', ''),
    ('the shadow map is not flagged for its first draw', L, '  sun.shadow.autoUpdate = false;\n  sun.shadow.needsUpdate = true;\n', '  sun.shadow.autoUpdate = false;\n'),
    ('the shadow map is left to three to make', L, '  sun.shadow.map = shadowMapTarget(SHADOW_MAP_SIZE);\n', ''),
    ('the light\'s target is not in the scene', L, '  scene.add(sun.target);\n  const cam', '  const cam'),
    ('there is one room', L, 'const rooms = [0, 1].map(', 'const rooms = [0].map('),
    ('tag looks at an object again', L, '      if (known.has(o)) return;\n      known.add(o);\n      const mesh = o as THREE.Mesh;', '      const mesh = o as THREE.Mesh;'),
    ('tag takes any object for a mesh', L, '      if (!mesh.isMesh) return;\n', ''),
    ('no lit surface takes the shadow', L, "      if (mats.some((m) => (m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial) && !mats.some((m) => m.transparent)) mesh.receiveShadow = true;\n", ''),
    ('Lambert surfaces do not take the shadow', L, '(m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial)', '(m as THREE.MeshPhongMaterial).isMeshPhongMaterial)'),
    ('Phong surfaces do not take the shadow', L, '(m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial)', '(m as THREE.MeshLambertMaterial).isMeshLambertMaterial)'),
    ('glass takes the shadow', L, '&& !mats.some((m) => m.transparent)) mesh.receiveShadow', ') mesh.receiveShadow'),
    ('every mesh takes the shadow', L, 'if (mats.some((m) => (m as THREE.MeshLambertMaterial).isMeshLambertMaterial', 'if (true || mats.some((m) => (m as THREE.MeshLambertMaterial).isMeshLambertMaterial'),
    ('a caster does not cast', L, '        mesh.castShadow = true;\n', ''),
    ('a caster casts from one face', L, '        for (const m of mats) m.shadowSide = THREE.DoubleSide;\n', ''),
    ('a caster is not listed', L, '        casters.push(mesh);\n', ''),
    ('every mesh without a room joins the first', L, 'const room = rooms[ROOM_OF.get(mesh.name) ?? -1];', 'const room = rooms[ROOM_OF.get(mesh.name) ?? 0];'),
    ('a room\'s box is taken before its meshes have a world matrix', L, 'mesh.updateWorldMatrix(true, false); room.box.expandByObject(mesh);', 'room.box.expandByObject(mesh);'),
    ('a room\'s box holds none of its meshes', L, 'room.box.expandByObject(mesh); room.meshes.push(mesh);', 'room.meshes.push(mesh);'),
    ('a room does not know its meshes', L, 'room.box.expandByObject(mesh); room.meshes.push(mesh); }', 'room.box.expandByObject(mesh); }'),
    ('the trees are not known', L, "else if (mesh.name === 'city-trees') trees.push(mesh);", ''),
    ('the stock is taken for the trees', L, "else if (mesh.name === 'city-trees') trees.push(mesh);", "else if (mesh.name === 'city-stock') trees.push(mesh);"),
    ('tag says nothing changed', L, '        changed = true;\n', ''),
    ('tag says something changed every time', L, '    return changed;\n  };\n\n  return {', '    return true;\n  };\n\n  return {'),
    # ---------------------------------------------------------------------------------------------------------------- createSunShadow.update
    ('the shadow box is sized from the camera\'s distance to the origin', L, 'camera.position.distanceTo(focus)', 'camera.position.length()'),
    ('the shadow box is centred on the camera', L, 'shadowFit([focus.x, focus.y, focus.z],', 'shadowFit([camera.position.x, camera.position.y, camera.position.z],'),
    ('a room casts only while the camera is far from it', L, 'box.distanceToPoint(camera.position) < ROOM_REACH', 'box.distanceToPoint(camera.position) > ROOM_REACH'),
    ('a room casts while its box is near the focus, not the camera', L, 'box.distanceToPoint(camera.position) < ROOM_REACH', 'box.distanceToPoint(focus) < ROOM_REACH'),
    ('a room reaches nowhere', L, 'export const ROOM_REACH = 10;', 'export const ROOM_REACH = 0;'),
    ('a room casts when the camera is out of it', L, 'for (const m of meshes) m.castShadow = near;', 'for (const m of meshes) m.castShadow = !near;'),
    ('a room casts everywhere', L, 'for (const m of meshes) m.castShadow = near;', 'for (const m of meshes) m.castShadow = true;'),
    ('the trees do not notice a room', L, '        inside ||= near;\n', ''),
    ('only the last room counts for the trees', L, '        inside ||= near;', '        inside = near;'),
    ('the trees cast inside a room', L, 'for (const m of trees) m.castShadow = !inside;', 'for (const m of trees) m.castShadow = true;'),
    ('the trees cast only inside a room', L, 'for (const m of trees) m.castShadow = !inside;', 'for (const m of trees) m.castShadow = inside;'),
    ('a hidden caster does not redraw the map', L, "seen += m.visible && m.castShadow ? '1' : '0';", "seen += m.castShadow ? '1' : '0';"),
    ('a caster a room switches off does not redraw the map', L, "seen += m.visible && m.castShadow ? '1' : '0';", "seen += m.visible ? '1' : '0';"),
    ('the redraw key has no cell', L, "const cell = `${Math.round(dot3(fit.target, x) / fit.texel)},${Math.round(dot3(fit.target, y) / fit.texel)}`;", "const cell = '';"),
    ('the redraw key moves with the light\'s depth', L, "const cell = `${Math.round(dot3(fit.target, x) / fit.texel)},${Math.round(dot3(fit.target, y) / fit.texel)}`;",
     "const cell = `${fit.target[0]},${fit.target[1]},${fit.target[2]}`;"),
    ('the redraw key ignores a move along the light\'s upright axis', L, "Math.round(dot3(fit.target, x) / fit.texel)},${Math.round(dot3(fit.target, y) / fit.texel)}`", "Math.round(dot3(fit.target, x) / fit.texel)}`"),
    ('the redraw key ignores a move along the light\'s flat axis', L, "const cell = `${Math.round(dot3(fit.target, x) / fit.texel)},${Math.round(dot3(fit.target, y) / fit.texel)}`;",
     "const cell = `${Math.round(dot3(fit.target, y) / fit.texel)}`;"),
    ('the redraw key ignores the size of the box', L, 'const next = `${fit.half}|${cell}|', 'const next = `${cell}|'),
    ('the redraw key ignores the sun', L, "|${toSun.map((n) => n.toFixed(4)).join(',')}|${seen}", '|${seen}'),
    ('the redraw key rounds the sun to whole numbers', L, "toSun.map((n) => n.toFixed(4))", "toSun.map((n) => n.toFixed(0))"),
    ('the redraw key ignores which casters show', L, '|${seen}|${casters.length}`', '|${casters.length}`'),
    ('the light\'s target is not moved', L, '      sun.target.position.set(...fit.target);\n', ''),
    ('the light is not moved', L, '      sun.position.set(...fit.position);\n', ''),
    ('the light\'s target matrix is left behind', L, '      sun.target.updateMatrixWorld();\n', ''),
    ('the shadow camera is rebuilt only when the box and the depth both change', L, 'if (fit.half !== half || fit.far !== far) {', 'if (fit.half !== half && fit.far !== far) {'),
    ('the shadow camera is never rebuilt', L, 'if (fit.half !== half || fit.far !== far) {', 'if (fit.half === half && fit.far === far) {'),
    ('the shadow camera\'s left edge is not the box\'s', L, 'cam.left = -half; cam.right = half;', 'cam.left = -half / 2; cam.right = half;'),
    ('the shadow camera\'s right edge is not the box\'s', L, 'cam.left = -half; cam.right = half;', 'cam.left = -half; cam.right = half / 2;'),
    ('the shadow camera\'s top edge is not the box\'s', L, 'cam.top = half; cam.bottom = -half;', 'cam.top = half / 2; cam.bottom = -half;'),
    ('the shadow camera\'s bottom edge is not the box\'s', L, 'cam.top = half; cam.bottom = -half;', 'cam.top = half; cam.bottom = 0;'),
    ('the shadow camera keeps its near plane', L, 'cam.near = fit.near; cam.far = fit.far;', 'cam.far = fit.far;'),
    ('the shadow camera keeps its far plane', L, 'cam.near = fit.near; cam.far = fit.far;', 'cam.near = fit.near;'),
    ('the shadow camera\'s projection is not rebuilt', L, '        cam.updateProjectionMatrix();\n', ''),
    ('the shadow camera is rebuilt on every update, neither size nor depth kept', L, '        half = fit.half;\n        far = fit.far;\n', ''),
    ('the shadow camera is rebuilt on every update, the size not kept', L, '        half = fit.half;\n', ''),
    ('the shadow camera is rebuilt on every update, the depth not kept', L, '        far = fit.far;\n', ''),
    ('the depth bias is not set', L, '      sun.shadow.bias = fit.bias;\n', ''),
    ('the normal offset is not set', L, '      sun.shadow.normalBias = fit.normalBias;\n', ''),
    ('the map is always redrawn', L, '      if (next === key) return false;\n', ''),
    ('the map is never redrawn after the first', L, '      key = next;\n', ''),
    ('the map is not flagged when the box has moved', L, '      key = next;\n      sun.shadow.needsUpdate = true;\n', '      key = next;\n'),
    ('update says nothing was redrawn', L, '      sun.shadow.needsUpdate = true;\n      return true;', '      sun.shadow.needsUpdate = true;\n      return false;'),
    ('dispose leaves the light\'s target in the scene', L, '      scene.remove(sun.target);\n', ''),
    ('dispose leaves the sun casting', L, '      sun.castShadow = false;\n', ''),
    ('dispose keeps the shadow map', L, '      sun.shadow.map?.dispose();\n', ''),
    # ---------------------------------------------------------------------------------------------------------------- who casts (the set, the rooms)
    ('the trees cast no shadow', L, "'city-roof', 'city-trees',", "'city-roof',"),
    ('the shed\'s roof glass casts', L, "  'canopy-steel',\n]);", "  'canopy-steel', 'shed-roof-glass',\n]);"),
    ('the shed ribs belong to the concourse', L, "['shed-ribs', 1]", "['shed-ribs', 0]"),
    ('the concourse columns belong to the shed', L, "['concourse-column', 0]", "['concourse-column', 1]"),
    ('the concourse lattice belongs to the shed', L, "['concourse-lattice', 0]", "['concourse-lattice', 1]"),
    ('the shed ribs are not a room caster', L, ", ['shed-ribs', 1]])", "])"),
    ('the shed ribs are not a caster', L, "'shed-aisle-roofs', 'shed-ribs', 'shed-front',", "'shed-aisle-roofs', 'shed-front',"),
    # ------------------------------------------------------------------------------------------------------------------ the roof shade
    ('the roof takes the sky\'s red first', L, 'export const ROOF_SHADE = { ambient: [', 'export const ROOF_SHADE = { ambient: [0.9 + '),
    ('the roof shade takes more of the direct light than of the hemisphere\'s red', L, 'direct: 0.', 'direct: 1 + 0.'),
    ('the roof shade is given its channels backwards', L, '[...ROOF_SHADE.ambient, ROOF_SHADE.direct];', '[...ROOF_SHADE.ambient].reverse().concat(ROOF_SHADE.direct) as unknown as readonly [number, number, number, number];'),
    ('the roof shade has its direct loss first', L, '[...ROOF_SHADE.ambient, ROOF_SHADE.direct];', '[ROOF_SHADE.direct, ...ROOF_SHADE.ambient];'),
    ('no roof shade is a little shade', L, 'NO_ROOF_SHADE: readonly [number, number, number, number] = [0, 0, 0, 0];', 'NO_ROOF_SHADE: readonly [number, number, number, number] = [0.1, 0, 0, 0];'),
    ('a roof hides nothing', L, '  float under = coverGroundAt( p );', '  float under = 0.0;'),
    ('a roof hides everything', L, '  float under = coverGroundAt( p );', '  float under = 1.0;'),
    ('the shade reads the room cover and not the ground\'s', L, '  float under = coverGroundAt( p );', '  float under = coverRoomAt( p );'),
    ('the shade reads the sky\'s cover instead of the ground\'s', L, '  float under = coverGroundAt( p );', '  float under = coverAt( p );'),
    ('the shade is the loss itself', L, '  return vec4( 1.0 ) - loss * under;', '  return loss * under;'),
    ('the shade is whole whatever the cover', L, '  return vec4( 1.0 ) - loss * under;', '  return vec4( 1.0 ) - loss;'),
    ('the shade grows from the open air', L, '  return vec4( 1.0 ) - loss * under;', '  return vec4( 1.0 ) - loss * ( 1.0 - under );'),
    ('the shade adds to the open air', L, '  return vec4( 1.0 ) - loss * under;', '  return vec4( 1.0 ) + loss * under;'),
    ('the shade follows the cover squared', L, '  return vec4( 1.0 ) - loss * under;', '  return vec4( 1.0 ) - loss * under * under;'),
    ('a material is shaded again each time it is met', L, '  if (shaded.has(material)) return;\n  shaded.add(material);\n', ''),
    ('a material is shaded again though it is known', L, '  shaded.add(material);\n', ''),
    ('the material\'s own patch is dropped', HOOK, '    prior.call(material, shader, renderer);\n', ''),
    ('the material\'s own patch runs last', HOOK, [
        ('    prior.call(material, shader, renderer);\n    Object.assign', '    Object.assign'),
        ('    shader.fragmentShader = fragment;\n  };', '    shader.fragmentShader = fragment;\n    prior.call(material, shader, renderer);\n  };')]),
    ('the material\'s own program key is dropped', HOOK, 'const priorKey = material.customProgramCacheKey();', "const priorKey = '';"),
    ('the program key is the material\'s own', HOOK, 'material.customProgramCacheKey = () => `${priorKey}+roofShade`;', 'material.customProgramCacheKey = () => priorKey;'),
    ('the program key forgets the material\'s own', HOOK, 'material.customProgramCacheKey = () => `${priorKey}+roofShade`;', 'material.customProgramCacheKey = () => `+roofShade`;'),
    ('a shaded material is not recompiled', HOOK, '  material.customProgramCacheKey = () => `${priorKey}+roofShade`;\n  material.needsUpdate = true;', '  material.customProgramCacheKey = () => `${priorKey}+roofShade`;'),
    ('the shader keeps no cover uniforms', HOOK, 'Object.assign(shader.uniforms, coverUniforms, roofShadeUniforms);', 'Object.assign(shader.uniforms, roofShadeUniforms);'),
    ('the shader keeps no roof shade uniforms', HOOK, 'Object.assign(shader.uniforms, coverUniforms, roofShadeUniforms);', 'Object.assign(shader.uniforms, coverUniforms);'),
    ('the cover read is added again after another patch added it', HOOK, "if (!fragment.includes('float coverGroundAt')) fragment = fragment.replace(", 'fragment = fragment.replace('),
    ('the cover read is never added', HOOK, "    if (!fragment.includes('float coverGroundAt')) fragment = fragment.replace('#include <common>', `#include <common>\\n${COVER_GLSL}`);\n", ''),
    ('the cover read is added where the program has no common chunk', HOOK, "fragment.replace('#include <common>', `#include <common>\\n${COVER_GLSL}`)", "fragment.replace('#include <commons>', `#include <commons>\\n${COVER_GLSL}`)"),
    ('the cover read is declared after the shade that uses it', HOOK, "fragment.replace('#include <common>', `#include <common>\\n${COVER_GLSL}`)", "fragment.replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\\n${COVER_GLSL}`)"),
    ('the roof shade function is left out of the program', HOOK, r'\nuniform vec3 uInteriorFill;\n${ROOF_SHADE_GLSL}`)', r'\nuniform vec3 uInteriorFill;\n`)'),
    ('the roof shade uniform is not declared', HOOK, r'\nuniform vec4 uRoofShade;\nuniform vec3 uInteriorFill;', r'\nuniform vec3 uInteriorFill;'),
    ('the concourse fill uniform is not declared', HOOK, r'uniform vec4 uRoofShade;\nuniform vec3 uInteriorFill;\n', r'uniform vec4 uRoofShade;\n'),
    ('the shade is added where the program has no lights chunk', HOOK, "fragment.replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>", "fragment.replace('#include <lights_lambert_pars_fragments>', `#include <lights_lambert_pars_fragments>"),
    ('the shade is applied where the program has no end of the lights', HOOK, ".replace('#include <lights_fragment_end>', `#include <lights_fragment_end>", ".replace('#include <lights_fragment_ends>', `#include <lights_fragment_ends>"),
    ('the shade is applied before the lights are summed', HOOK, ".replace('#include <lights_fragment_end>', `#include <lights_fragment_end>", ".replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>"),
    ('the shade is read at the camera', HOOK, 'vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );', 'vec4 roofK = roofShade( cameraPosition, uRoofShade );'),
    ('the shade is read in view space', HOOK, 'vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );', 'vec4 roofK = roofShade( vViewPosition, uRoofShade );'),
    ('the shade reads the camera\'s side of the fragment', HOOK, 'vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );', 'vec4 roofK = roofShade( cameraPosition + vViewPosition * mat3( viewMatrix ), uRoofShade );'),
    ('the shade reads no loss', HOOK, 'vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );', 'vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), vec4( 0.0 ) );'),
    ('the hemisphere light is not shaded', HOOK, '  reflectedLight.indirectDiffuse *= roofK.rgb;\n', ''),
    ('the sun\'s light is not shaded', HOOK, '  reflectedLight.directDiffuse *= roofK.a;\n', ''),
    ('the hemisphere light takes the direct light\'s shade', HOOK, '  reflectedLight.indirectDiffuse *= roofK.rgb;\n', '  reflectedLight.indirectDiffuse *= roofK.a;\n'),
    ('the sun\'s light takes the hemisphere\'s red shade', HOOK, '  reflectedLight.directDiffuse *= roofK.a;\n', '  reflectedLight.directDiffuse *= roofK.r;\n'),
    ('the fill is scaled by the roof shade again', HOOK, '* material.diffuseColor * RECIPROCAL_PI;', '* material.diffuseColor * RECIPROCAL_PI;\n  reflectedLight.indirectDiffuse *= roofK.rgb;'),
    ('the contact shade darkens the concourse fill too', HOOK, '* material.diffuseColor * RECIPROCAL_PI;', '* material.diffuseColor * RECIPROCAL_PI;\n#ifdef ${FOOT_SHADE}\n  reflectedLight.indirectDiffuse *= foot;\n#endif'),
    ('the shaded block is not applied', HOOK, "    shader.fragmentShader = fragment;\n  };", "  };"),
    # ---------------------------------------------------------------------------------------------------------------------- the contact shade
    ('the contact shade is not named like the walls\' define', HOOK, "export const FOOT_SHADE = 'FOOT_SHADE';", "export const FOOT_SHADE = 'FOOT_SHADOW';"),
    ('the contact shade is on without its define', HOOK, '#ifdef ${FOOT_SHADE}\n  float h', '#ifndef ${FOOT_SHADE}\n  float h'),
    ('a part below the foot is darker than the foot', HOOK, 'float h = max( vMapUv.y, 0.0 );', 'float h = vMapUv.y;'),
    ('a part below the foot is as dark as one above it', HOOK, 'float h = max( vMapUv.y, 0.0 );', 'float h = abs( vMapUv.y );'),
    ('the contact shade reads the wall\'s u and not its v', HOOK, 'float h = max( vMapUv.y, 0.0 );', 'float h = max( vMapUv.x, 0.0 );'),
    ('the contact shade ignores the height', HOOK, 'float h = max( vMapUv.y, 0.0 );', 'float h = 0.0;'),
    ('the contact shade\'s long term is not the define\'s', HOOK, 'float foot = 1.0 - ${FOOT_SHADE} * exp( -0.3 * h )', 'float foot = 1.0 - 0.08 * exp( -0.3 * h )'),
    ('the contact shade has no long term', HOOK, 'float foot = 1.0 - ${FOOT_SHADE} * exp( -0.3 * h ) - 0.40', 'float foot = 1.0 - 0.40'),
    ('the contact shade has no thin line', HOOK, ' - 0.40 * exp( -2.5 * h );', ';'),
    ('the contact shade lightens the foot', HOOK, ' - 0.40 * exp( -2.5 * h );', ' + 0.40 * exp( -2.5 * h );'),
    ('the contact shade lightens the foot with its long term', HOOK, 'float foot = 1.0 - ${FOOT_SHADE} * exp( -0.3 * h )', 'float foot = 1.0 + ${FOOT_SHADE} * exp( -0.3 * h )'),
    ('the contact shade grows with the height', HOOK, 'exp( -0.3 * h ) - 0.40', 'exp( 0.3 * h ) - 0.40'),
    ('the thin line grows with the height', HOOK, 'exp( -2.5 * h );', 'exp( 2.5 * h );'),
    ('the contact shade does not darken the sun\'s light', HOOK, '  reflectedLight.directDiffuse *= foot;\n', ''),
    ('the contact shade does not darken the sky\'s light', HOOK, '  reflectedLight.indirectDiffuse *= foot;\n', ''),
    ('the contact shade darkens the sun\'s light twice and the sky\'s not', HOOK, '  reflectedLight.indirectDiffuse *= foot;\n', '  reflectedLight.directDiffuse *= foot;\n'),
    ('the contact shade comes after the concourse fill', HOOK, [
        (FOOT_BLOCK, ''),
        ('* material.diffuseColor * RECIPROCAL_PI;', '* material.diffuseColor * RECIPROCAL_PI;\n' + FOOT_BLOCK.rstrip('\n'))]),
    # --------------------------------------------------------------------------------------------------------------------------- the slab tone
    ('the paving\'s define is not named like the slab tone\'s', HOOK, "export const MOTTLE = 'MOTTLE';", "export const MOTTLE = 'MOTTLED';"),
    ('the slab tone is on without its define', HOOK, '#ifdef ${MOTTLE}\n  vec2 slab', '#ifndef ${MOTTLE}\n  vec2 slab'),
    ('the slab tone is added where the program has no colour chunk', HOOK, ".replace('#include <color_fragment>', `#include <color_fragment>", ".replace('#include <color_fragments>', `#include <color_fragments>"),
    ('the slab tone is added after the lights', HOOK, ".replace('#include <color_fragment>', `#include <color_fragment>", ".replace('#include <lights_lambert_fragment>', `#include <lights_lambert_fragment>"),
    ('a slab is a whole tile', HOOK, 'vec2 slab = vMapUv * 2.0;', 'vec2 slab = vMapUv * 1.0;'),
    ('a slab is cut by the screen and not the paving', HOOK, 'vec2 slab = vMapUv * 2.0;', 'vec2 slab = gl_FragCoord.xy * 2.0;'),
    ('the slab tone does not hold across a slab', HOOK, 'dot( floor( slab ), vec2(', 'dot( slab, vec2('),
    ('the slab tone only brightens', HOOK, 'mix( 0.8 + 0.4 * fract(', 'mix( 1.0 + 0.4 * fract('),
    ('the slab tone fades the wrong way', HOOK, '* 43758.5453 ), 1.0, smoothstep(', '* 43758.5453 ), 1.0, 1.0 - smoothstep('),
    ('the slab tone is faded from the wrong end', HOOK, 'mix( 0.8 + 0.4 * fract( sin( dot( floor( slab ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ), 1.0, smoothstep(',
     'mix( 1.0, 0.8 + 0.4 * fract( sin( dot( floor( slab ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ), smoothstep('),
    ('the slab tone is not faded as the slab shrinks', HOOK, ', 1.0, smoothstep( 0.125, 0.5, length( fwidth( slab ) ) ) );', ', 1.0, 0.0 );'),
    ('the slab tone fades on one direction only', HOOK, 'length( fwidth( slab ) )', 'fwidth( slab ).x'),
    ('the slab tone scales the light and not the colour', HOOK, 'diffuseColor.rgb *= mix( 0.8', 'reflectedLight.directDiffuse *= mix( 0.8'),
    ('the slab tone scales the opacity', HOOK, 'diffuseColor.rgb *= mix( 0.8', 'diffuseColor.a *= mix( 0.8'),
    # ---------------------------------------------------------------------------------------------------------------------- the concourse's fill
    ('the fill is not divided by the shade\'s blue loss', L, ' / ROOF_SHADE.ambient[2];', ';'),
    ('the fill is divided by the shade\'s red loss', L, ' / ROOF_SHADE.ambient[2];', ' / ROOF_SHADE.ambient[0];'),
    ('the fill ignores its level', L, 'const k = (INTERIOR.level * hemisphereIntensity *', 'const k = (hemisphereIntensity *'),
    ('the fill ignores the sky\'s intensity', L, 'const k = (INTERIOR.level * hemisphereIntensity *', 'const k = (INTERIOR.level *'),
    ('the fill grows under cloud', L, '(1 - INTERIOR.cloud * cloud)', '(1 + INTERIOR.cloud * cloud)'),
    ('the fill ignores the cloud', L, '(1 - INTERIOR.cloud * cloud)', '(1 - INTERIOR.cloud * 0)'),
    ('the fill is taken away wholly by cloud', L, '(1 - INTERIOR.cloud * cloud)', '(1 - cloud)'),
    ('the fill is cool', L, 'out.set(INTERIOR.tint[0] * k, INTERIOR.tint[1] * k, INTERIOR.tint[2] * k)', 'out.set(INTERIOR.tint[2] * k, INTERIOR.tint[1] * k, INTERIOR.tint[0] * k)'),
    ('the fill\'s blue is its green', L, 'INTERIOR.tint[1] * k, INTERIOR.tint[2] * k)', 'INTERIOR.tint[1] * k, INTERIOR.tint[1] * k)'),
    ('the fill is written into a new vector', L, 'return out.set(', 'return new THREE.Vector3().set('),
    ('the fill does not follow how far under the roof the surface is', HOOK, 'uInteriorFill * ( ( 1.0 - roofK.b ) * coverRoomAt(', 'uInteriorFill * ( coverRoomAt('),
    ('the fill grows as the shade goes', HOOK, 'uInteriorFill * ( ( 1.0 - roofK.b ) * coverRoomAt(', 'uInteriorFill * ( roofK.b * coverRoomAt('),
    ('the fill is not kept to the concourse\'s room', HOOK, 'coverRoomAt( cameraPosition - vViewPosition * mat3( viewMatrix ) + 0.6 * inverseTransformDirection( normal, viewMatrix ) ) * ', ''),
    ('the fill is read at the fragment and not a little off its face', HOOK, ' + 0.6 * inverseTransformDirection( normal, viewMatrix ) )', ' )'),
    ('the fill is read in view space', HOOK, 'coverRoomAt( cameraPosition - vViewPosition * mat3( viewMatrix ) + 0.6', 'coverRoomAt( vViewPosition + 0.6'),
    ('the fill is not weighted by the way the face looks', HOOK, ' * ( 1.0 - ${INTERIOR.down.toFixed(2)} * looksDown )', ''),
    ('the fill is not weighted by how pale the surface is', HOOK, ' * ( 1.0 - ${INTERIOR.pale.toFixed(2)} * material.diffuseColor.g * material.diffuseColor.g )', ''),
    ('the way a face looks is weighted by how pale it is', HOOK, '( 1.0 - ${INTERIOR.down.toFixed(2)} * looksDown )', '( 1.0 - ${INTERIOR.pale.toFixed(2)} * looksDown )'),
    ('how pale a surface is is weighted by the way it looks', HOOK, '( 1.0 - ${INTERIOR.pale.toFixed(2)} * material.diffuseColor.g', '( 1.0 - ${INTERIOR.down.toFixed(2)} * material.diffuseColor.g'),
    ('a face looking up keeps less of the fill', HOOK, '1.0 - ${INTERIOR.down.toFixed(2)} * looksDown )', '1.0 - ${INTERIOR.down.toFixed(2)} * ( 1.0 - looksDown ) )'),
    ('the way a face looks is cut to whole numbers', HOOK, 'INTERIOR.down.toFixed(2)', 'INTERIOR.down.toFixed(0)'),
    ('how pale a surface is is cut to whole numbers', HOOK, 'INTERIOR.pale.toFixed(2)', 'INTERIOR.pale.toFixed(0)'),
    ('the paleness is the surface\'s red', HOOK, '* material.diffuseColor.g * material.diffuseColor.g )', '* material.diffuseColor.r * material.diffuseColor.r )'),
    ('the paleness is not squared', HOOK, '* material.diffuseColor.g * material.diffuseColor.g )', '* material.diffuseColor.g )'),
    ('the paleness is the green times the blue', HOOK, '* material.diffuseColor.g * material.diffuseColor.g )', '* material.diffuseColor.g * material.diffuseColor.b )'),
    ('the fill is not scaled by the surface\'s colour', HOOK, ' ) ) * material.diffuseColor * RECIPROCAL_PI;', ' ) ) * RECIPROCAL_PI;'),
    ('the fill is not divided by pi', HOOK, ' * material.diffuseColor * RECIPROCAL_PI;', ' * material.diffuseColor;'),
    ('the fill goes to the sun\'s light', HOOK, 'if ( roofK.b < 1.0 ) reflectedLight.indirectDiffuse += uInteriorFill', 'if ( roofK.b < 1.0 ) reflectedLight.directDiffuse += uInteriorFill'),
    ('the fill is taken from the light and not added', HOOK, 'reflectedLight.indirectDiffuse += uInteriorFill', 'reflectedLight.indirectDiffuse -= uInteriorFill'),
    ('the way a face looks is not worked out', HOOK, '  float looksDown = max( -dot( normal, viewMatrix[ 1 ].xyz ), 0.0 );\n', '  float looksDown = 0.0;\n'),
    ('a face looking up is taken for one looking down', HOOK, 'max( -dot( normal, viewMatrix[ 1 ].xyz ), 0.0 )', 'max( dot( normal, viewMatrix[ 1 ].xyz ), 0.0 )'),
    ('the way a face looks is read from the camera\'s depth', HOOK, 'max( -dot( normal, viewMatrix[ 1 ].xyz ), 0.0 )', 'max( -dot( normal, viewMatrix[ 2 ].xyz ), 0.0 )'),
    ('the way a face looks goes below zero', HOOK, 'max( -dot( normal, viewMatrix[ 1 ].xyz ), 0.0 )', '-dot( normal, viewMatrix[ 1 ].xyz )'),
    # ------------------------------------------------------------- the links its tests hold in other files (the walls\' define, the paving\'s, the soffit)
    ('a foot-shaded wall has no contact shade', MATERIALS, 'm.defines = { ...m.defines, FOOT_SHADE: depth };', 'm.defines = { ...m.defines };'),
    ('every foot-shaded wall takes the landmarks\' depth', MATERIALS, 'FOOT_SHADE: depth }', "FOOT_SHADE: '0.08' }"),
    ('the front\'s brick has no contact shade', MATERIALS, "brickFoot: () => footShaded(tiled('brick'), FRONT_FOOT),", "brickFoot: () => tiled('brick'),"),
    ('the front\'s stone has no contact shade', MATERIALS, "stoneFoot: () => footShaded(tiled('stone'), FRONT_FOOT),", "stoneFoot: () => tiled('stone'),"),
    ('the plaza paving has no slab tone', MATERIALS, "if (from === 'concourseFloor') m.defines = { MOTTLE: '' };", "if (from === 'concourseFloor') m.defines = {};"),
    ('the hotel\'s red brick has no contact shade', LANDMARKS, "const brickRed = footShaded(tint('brickRed', midlandBrick));", "const brickRed = tint('brickRed', midlandBrick);"),
    ('the concourse soffit has another name', CONCOURSE, "side: THREE.DoubleSide, name: 'concourse-soffit' }),", "side: THREE.DoubleSide, name: 'concourse-ceiling' }),"),
    ('the concourse soffit is lit', CONCOURSE, 'soffit: new THREE.MeshBasicMaterial({', 'soffit: new THREE.MeshLambertMaterial({'),
    # ============================================================================================================== vite.config.ts: the squeeze
    # ---- the shared core (squeezeGlslParts)
    ('the squeeze reads a hole\'s own character as text', V, 'p.includes(HOLE) || ' + HOLD + '.test(p)', HOLD + '.test(p)'),
    ('the squeeze squeezes a continued line', V, HOLD, r'/\\[ \t\r]/'),
    ('the squeeze squeezes an escaped space', V, HOLD, r'/\\[\t\r\n]/'),
    ('the squeeze squeezes an escaped tab', V, HOLD, r'/\\[ \r\n]/'),
    ('the squeeze squeezes a continuation ended by a carriage return', V, HOLD, r'/\\[ \t\n]/'),
    ('a block comment swallows the code between two', V, COMMENTS, r'/\/\*[\s\S]*\*\/|\/\/(?:[^\n\\]|\\[^n])*/g'),
    ('a line comment runs past a \\n escape', V, COMMENTS, r'/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g'),
    ('a line comment stops at a backslash', V, COMMENTS, r'/\/\*[\s\S]*?\*\/|\/\/[^\n\\]*/g'),
    ('a line comment is not one', V, COMMENTS, r'/\/\*[\s\S]*?\*\//g'),
    ('a line comment leaves a space', V, "if (c[1] !== '*') return '';", "if (c[1] !== '*') return ' ';"),
    ('a block comment is taken for a line comment', V, "if (c[1] !== '*') return '';", "if (c[1] === '*') return '';"),
    ('a block comment counts one newline too many', V, "const newlines = c.split('\\n').length - 1;", "const newlines = c.split('\\n').length;"),
    ('a block comment in a line of its own leaves no space', V, "return newlines ? '\\n'.repeat(newlines) : ' ';", "return newlines ? '\\n'.repeat(newlines) : '';"),
    ('a block comment of several lines leaves a space', V, "return newlines ? '\\n'.repeat(newlines) : ' ';", "return ' ';"),
    ('a block comment of one line leaves a newline', V, "return newlines ? '\\n'.repeat(newlines) : ' ';", "return '\\n'.repeat(newlines || 1);"),
    ('a block comment in a # line is never unsure', V, 'unsure = true;', 'unsure = false;'),
    ('a block comment of one line in a # line is unsure', V, 'if (newlines && /^[ \\t]*#/.test(', 'if (/^[ \\t]*#/.test('),
    ('a block comment in an indented # line is not unsure', V, r'/^[ \t]*#/.test(text.slice(', r'/^#/.test(text.slice('),
    ('an unsure squeeze goes ahead', V, '  if (unsure) return null;\n', ''),
    ('the squeeze keeps the white space before a newline', V, r'.replace(/[ \t\r]*\n[ \t]*/g, ' + "'\\n')", r'.replace(/\n[ \t]*/g, ' + "'\\n')"),
    ('the squeeze keeps the indentation', V, r'.replace(/[ \t\r]*\n[ \t]*/g, ' + "'\\n')", r'.replace(/[ \t\r]*\n/g, ' + "'\\n')"),
    ('the squeeze keeps a carriage return before a newline', V, r'.replace(/[ \t\r]*\n[ \t]*/g, ' + "'\\n')", r'.replace(/[ \t]*\n[ \t]*/g, ' + "'\\n')"),
    ('the squeeze drops the newlines', V, r'.replace(/[ \t\r]*\n[ \t]*/g, ' + "'\\n')", r'.replace(/[ \t\r]*\n[ \t]*/g, ' + "'')"),
    ('the squeeze joins a run of spaces to nothing', V, r".replace(/[ \t]{2,}/g, ' ')", r".replace(/[ \t]{2,}/g, '')"),
    ('the squeeze changes a single tab to a space', V, r".replace(/[ \t]{2,}/g, ' ')", r".replace(/[ \t]+/g, ' ')"),
    ('the squeeze leaves a run of two spaces', V, r".replace(/[ \t]{2,}/g, ' ')", r".replace(/[ \t]{3,}/g, ' ')"),
    ('the squeeze leaves a run of spaces', V, r".replace(/[ \t]{2,}/g, ' ')", ''),
    ('the squeeze gives back fewer parts than it was given', V, "  return out.length === parts.length ? out : null; // (fewer: a hole went with its comment)", '  return out;'),
    ('the squeeze cuts a hole\'s text short', V, 'from = m.index + m[0].length;', 'from = m.index + 1;'),
    # ---- the templates (templateEdits, squeezeGlsl, glslSqueeze)
    ('the ranges of a template\'s parts end at the wrong characters', V, 'q.end - (i === quasis.length - 1 ? 1 : 2)', 'q.end - (i === quasis.length - 1 ? 2 : 1)'),
    ('a template read by the TypeScript parser is left alone', V, '[[q.start, q.end], [q.start + 1, q.end - (i === quasis.length - 1 ? 1 : 2)]]', '[[q.start, q.end]]'),
    ('a template read by the JavaScript parser is left alone', V, '[[q.start, q.end], [q.start + 1, q.end -', '[[q.start + 1, q.end -'),
    ('a template with a part the parser did not read as written is squeezed in part', V, 'if (!out || spans.some((s) => !s)) return [];', 'if (!out) return [];'),
    ('a marker must touch its template', V, MARK, r'/\/\* glsl \*\/`/g'),
    ('a marker\'s template starts one character late', V, 'opens.add(m.index + m[0].length - 1);', 'opens.add(m.index + m[0].length);'),
    ('a module with no marker is parsed', V, '  if (!opens.size) return code;\n', ''),
    ('the squeeze looks only between the last marker and the first', V, '[Math.min(...opens), Math.max(...opens)]', '[Math.max(...opens), Math.min(...opens)]'),
    ('the last marked template is out of range', V, 'node.start > last)) return;', 'node.start >= last)) return;'),
    ('every template between two markers is squeezed', V, "node.type === 'TemplateLiteral' && opens.has(node.start)", "node.type === 'TemplateLiteral'"),
    ('the squeeze edits a module from its start', V, 'edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, from) + text + out.slice(to);\n  return out;\n}\n\nexport const glslSqueeze',
     'edits.sort((a, b) => a[0] - b[0])) out = out.slice(0, from) + text + out.slice(to);\n  return out;\n}\n\nexport const glslSqueeze'),
    ('the squeeze plugin has another name', V, "name: 'glsl-squeeze',", "name: 'glsl-squeezer',"),
    ('the squeeze plugin runs in the dev server', V, "name: 'glsl-squeeze',\n  apply: 'build',", "name: 'glsl-squeeze',\n  apply: 'serve',"),
    ('the squeeze plugin runs after the TypeScript transform', V, "apply: 'build',\n  enforce: 'pre', // (the marker is a comment", "apply: 'build',\n  enforce: 'post', // (the marker is a comment"),
    ('the squeeze plugin reads the query as part of the id', V, "const file = id.split('?', 1)[0] ?? id;\n    if (!/\\.[cm]?[jt]s$/", "const file = id;\n    if (!/\\.[cm]?[jt]s$/"),
    ('the squeeze plugin reads no .mjs or .cjs module', V, r'if (!/\.[cm]?[jt]s$/.test(file) || !code.includes', r'if (!/\.[jt]s$/.test(file) || !code.includes'),
    ('the squeeze plugin reads no .ts module', V, r'if (!/\.[cm]?[jt]s$/.test(file) || !code.includes', r'if (!/\.[cm]?js$/.test(file) || !code.includes'),
    ('the squeeze plugin reads every file with a marker', V, "if (!/\\.[cm]?[jt]s$/.test(file) || !code.includes('/* glsl */')) return null;", "if (!/\\.[cm]?[jt]s$/.test(file) && !code.includes('/* glsl */')) return null;"),
    ('the squeeze plugin reads a TypeScript module as JavaScript', V, "squeezeGlsl(code, /ts$/.test(file) ? 'ts' : 'js')", "squeezeGlsl(code, 'js')"),
    ('the squeeze plugin reads a JavaScript module as TypeScript', V, "squeezeGlsl(code, /ts$/.test(file) ? 'ts' : 'js')", "squeezeGlsl(code, 'ts')"),
    ('the squeeze plugin reports a change when there is none', V, "      return out === code ? null : { code: out, map: null }; // (every line keeps its number, so the map stays true)", '      return { code: out, map: null };'),
    ('the squeeze plugin has a map', V, "return out === code ? null : { code: out, map: null }; // (every line keeps its number", "return out === code ? null : { code: out, map: undefined }; // (every line keeps its number"),
    ('the squeeze plugin does not say what it left alone', V, "      this.warn(`glsl-squeeze left ${file} as it was: ${e instanceof Error ? e.message : e}`);\n", ''),
    # ---- three's own strings (readsAsGlsl, squeezeGlslText, squeezeThreeGlsl, threeGlslSqueeze)
    ('a string is read as GLSL only by its first line', V, r'[=;(\[,]/m.test(text)', r'[=;(\[,]/.test(text)'),
    ('a directive does not make a string GLSL', V, READS, r'/\bvoid[ \t]+\w+[ \t]*\('
     r'|\b(?:uniform|varying|attribute|precision)[ \t]+\w'
     r'|\b(?:float|int|bool|vec[234]|mat[234])[ \t]+\w+[ \t]*[=;(\[,]/m'),
    ('a function does not make a string GLSL', V, r'|\bvoid[ \t]+\w+[ \t]*\(', ''),
    ('a uniform does not make a string GLSL', V, r'|\b(?:uniform|varying|attribute|precision)[ \t]+\w', ''),
    ('a declaration does not make a string GLSL', V, r'|\b(?:float|int|bool|vec[234]|mat[234])[ \t]+\w+[ \t]*[=;(\[,]', ''),
    ('a directive anywhere in a line makes a string GLSL', V, r'/^[ \t]*#[ \t]*(?:if|ifdef', r'/#[ \t]*(?:if|ifdef'),
    ('a string with no newline is squeezed', V, "if (!text.includes('\\n') || !readsAsGlsl(text)) return null;", 'if (!readsAsGlsl(text)) return null;'),
    ('a string that is not GLSL is squeezed', V, "if (!text.includes('\\n') || !readsAsGlsl(text)) return null;", "if (!text.includes('\\n')) return null;"),
    ('a string with a newline or GLSL is squeezed', V, "if (!text.includes('\\n') || !readsAsGlsl(text)) return null;", "if (!text.includes('\\n') && !readsAsGlsl(text)) return null;"),
    ('a string already squeezed is a change', V, 'return squeezed === undefined || squeezed === text ? null : squeezed;', 'return squeezed === undefined ? null : squeezed;'),
    ('a string the squeeze cannot make certain of is a change', V, 'return squeezed === undefined || squeezed === text ? null : squeezed;', 'return squeezed === text ? null : squeezed;'),
    ('three.js\'s strings are looked for among template literals', V, "init?.type === 'Literal' && typeof init.value === 'string'", "init?.type === 'TemplateLiteral' && typeof init.value === 'string'"),
    ('a string no GLSL squeeze changed is replaced by null', V, 'if (init && squeezed !== null) edits.push(', 'if (init && squeezed === null) edits.push('),
    ('the three.js plugin has another name', V, "name: 'three-glsl-squeeze',", "name: 'three-glsl-squeezer',"),
    ('the three.js plugin runs in the dev server', V, "name: 'three-glsl-squeeze',\n  apply: 'build',", "name: 'three-glsl-squeeze',\n  apply: 'serve',"),
    ('the three.js plugin runs after the other transforms', V, "name: 'three-glsl-squeeze',\n  apply: 'build',\n  enforce: 'pre',", "name: 'three-glsl-squeeze',\n  apply: 'build',\n  enforce: 'post',"),
    ('the three.js plugin reads the query as part of the id', V, "const file = (id.split('?', 1)[0] ?? id).replace(/\\\\/g, '/');", "const file = id.replace(/\\\\/g, '/');"),
    ('the three.js plugin reads no Windows path', V, "const file = (id.split('?', 1)[0] ?? id).replace(/\\\\/g, '/');", "const file = id.split('?', 1)[0] ?? id;"),
    ('the three.js plugin reads any module called three.module.js', V, "file.endsWith('/three/build/three.module.js')", "file.endsWith('three.module.js')"),
    ('the three.js plugin reads any module with its name in the path', V, "file.endsWith('/three/build/three.module.js')", "file.includes('/three/build/three.module.js')"),
    ('the three.js plugin reads no module', V, "if (!file.endsWith('/three/build/three.module.js')) return null;", "if (file.endsWith('/three/build/three.module.js')) return null;"),
    ('the three.js plugin reports a change when there is none', V, "return out === code ? null : { code: out, map: null }; // (a string stays", 'return { code: out, map: null }; // (a string stays'),
    ('the three.js plugin has a map', V, "return out === code ? null : { code: out, map: null }; // (a string stays", "return out === code ? null : { code: out, map: undefined }; // (a string stays"),
    ('the three.js plugin does not say what it left alone', V, "      this.warn(`three-glsl-squeeze left ${file} as it was: ${e instanceof Error ? e.message : e}`);\n", ''),
    # ---- the plugin list
    ('the build does not squeeze the page\'s templates', V, 'plugins: [almanacBack(), glslSqueeze(), threeGlslSqueeze(), devJsonImports()],', 'plugins: [almanacBack(), threeGlslSqueeze(), devJsonImports()],'),
    ('the build does not squeeze three\'s strings', V, 'plugins: [almanacBack(), glslSqueeze(), threeGlslSqueeze(), devJsonImports()],', 'plugins: [almanacBack(), glslSqueeze(), devJsonImports()],'),
    ('the build squeezes three\'s strings before the page\'s templates', V, 'plugins: [almanacBack(), glslSqueeze(), threeGlslSqueeze(), devJsonImports()],', 'plugins: [almanacBack(), threeGlslSqueeze(), glslSqueeze(), devJsonImports()],'),
]


def pairs_of(change):
    return change[0] if len(change) == 1 and isinstance(change[0], list) else [tuple(change)]


def check_anchors():
    """Every search text exactly once in the package it will be applied to; nothing is run."""
    bad = 0
    seen = set()
    for label, where, *change in MUTATIONS:
        if label in seen:
            print(f'DUPLICATE LABEL: {label}')
            bad += 1
        seen.add(label)
        path = src / where.path
        if not path.is_file():
            print(f'MISSING FILE: {where.path} ({label})')
            bad += 1
            continue
        text = path.read_text()
        for old, new in pairs_of(change):
            count = text.count(old)
            if count != 1:
                print(f'{"ABSENT" if count == 0 else f"{count} TIMES"}: {label}: {where.path}: {old[:100]!r}')
                bad += 1
            if old == new:
                print(f'NO CHANGE: {label}')
                bad += 1
    print(f'{len(MUTATIONS)} mutations; {bad} problem(s)')
    return 1 if bad else 0


if check_only:
    sys.exit(check_anchors())

selected = [m for m in MUTATIONS if not only or any(word in m[0].lower() for word in only)]
if not selected:
    raise SystemExit('no mutation label contains ' + ' / '.join(only))
scratch.mkdir(parents=True, exist_ok=True)
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'lighting') as work:
    suite = kxmut.Suite(work, test_timeout_ms=30000, timeout=120)
    names = set()
    for lane in LANES.values():
        names |= {name for name in suite.baseline(lane).passed if not name.startswith(SELF_CHECKS)}

    def judged(where):
        """Every lane of `where` on the mutated workspace: killed when any lane kills it (and then every test that failed counts as seen failing)."""
        verdicts = [suite.judge(LANES[lane], strict='any')[0] for lane in where.lanes]
        kills = [v for v in verdicts if v.kind == kxmut.KILLED]
        if kills:
            return kxmut.Verdict(kxmut.KILLED, kills[0].detail, [name for v in kills for name in v.failed])
        trouble = [v for v in verdicts if v.kind != kxmut.SURVIVED]
        return trouble[0] if trouble else verdicts[0]

    for label, where, *change in selected:
        try:
            with kxmut.mutated(work / where.path, pairs_of(change), unique=True):
                verdict = judged(where)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
if only:
    print('partial run: the tests-never-failed accounting needs the whole list')
    sys.exit(1 if status else 0)
unseen = names - tally.red
print(f'{len(names) - len(unseen)}/{len(names)} tests observed failing')
for name in sorted(unseen):
    print('  NEVER FAILED:', name)
sys.exit(1 if status or unseen else 0)
