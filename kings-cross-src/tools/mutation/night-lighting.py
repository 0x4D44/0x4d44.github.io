"""Mutation checks for the night lighting (round seven: "the nighttime view is missing lighting in the buildings and streets around the stations"): the street lamps
(core/streetlights.ts, web/src/streetlights.ts, the lamps' place in core/city.ts and their wiring in web/src/city.ts and web/src/night.ts, the Scottish scene's lamps in
web/src/waverley-lamps.ts and the lean road file's tool, tools/build-waverley-lamp-roads.ts), the windows that light after dark (the GLSL, the defines and the hooks of
web/src/materials.ts, the Midland's panes in web/src/landmarks.ts), the floodlight (web/src/lighting.ts `FLOOD`) and the Scottish night (web/src/station-weather.ts: the Balmoral's
windows, flood and dials, the lamps' life, the haze; web/src/atmosphere.ts: the shared night uniform and the haze's far plane, and the wiring of the King's Cross tower's dials' glow,
web/src/night.ts `createDialLights`);
usage: night-lighting.py <kings-cross-src> <.scratch/output> [--check] [label text ...].

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass each command first, a mutant is killed only by a named test that fails by
assertion (a load error or a crash is an ERROR, not a kill), and every test round seven wrote must be turned red by at least one mutation (tools/mutation/lib/kxmut.py). A mutation given
as a list of (old, new) pairs applies them together: two guards that cover for each other need both removed before either shows.

Round seven's tests are whole files (the lamps' four, the windows') and, in the files that were there before it, the tests it added, picked out by name: a mutation names the lanes
(commands) that judge it, and is killed when any of them kills it. The tests run one file at a time (the machine is shared). The tests of the other rounds that these files hold are
not judged here: the lighting and weather drivers have them.

The mutations are of behaviour, not of tuning: a sign or an axis wrong, a guard or a term left out, a branch the wrong way round, a call not made, a thing not put back. Nothing here
anchors on a tuned colour, a spacing, a gain or a share (they are ASSUMED numbers, re-tuned by eye against the night photographs). The two exceptions are the Balmoral's window grid
(station-weather.ts BALMORAL_WINDOWS): its digits are not tuned, a test holds them to the facade texture's own window calls (waverley-frontage-balmoral.ts), so a digit moved off the
texture is a behaviour wrong and is mutated; the facade textures' glass rectangles are mutated by the way they are derived, not by their digits. And the lift of a dial's glow off its
face (night.ts DIAL_LIFT): it is not tuned, a test holds it above zero (a glow at its face's own depth would fight it) and below the hands' own lifts (clocks.ts HANDS, so the hands stay
dark on the glow), so a lift of 0 and one over the hands are mutated.

`--check` only looks for every mutation's search text in the package (exactly once) and runs nothing. Label text on the command line runs only the mutations whose label contains it
(any of them); the 'never failed' accounting needs the whole list, so a partial run skips it."""
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


class Lane:
    """A test command: whole files, or (with `names`) only the tests of those files whose names contain one of the texts."""

    def __init__(self, files, names=()):
        self.files, self.names = list(files), list(names)


LANES = {
    # round seven's own files: the lamps (core/tests, web/tests, tools/tests) and the windows
    'lamps': Lane(['core/tests/streetlights.test.ts', 'web/tests/streetlights.test.ts', 'web/tests/waverley-lamps.test.ts', 'tools/tests/waverley-lamp-roads.test.ts']),
    'windows': Lane(['web/tests/windows-night.test.ts']),
    # the tests round seven added to files that were there before it
    'city': Lane(['core/tests/city.test.ts'], ['street lamps stand a kerb outside a street', 'no lamp stands within 0.3 m of any other road', 'the real city: about a thousand lamps']),
    'flood': Lane(['web/tests/lighting.test.ts'], ['addRoofShade: a material with the FLOOD define']),
    'landmarks': Lane(['web/tests/landmarks.test.ts'], ['windowId: a number of 0 to', 'addGlass: the flat shape of a window', "Midland Grand: the lit pane's windows", "the Midland's kinds of window each put lit glass",
                                                         "Midland Grand: the clock tower's lantern is open to the night", "Midland Grand: the front's brick and its stone are floodlit"]),
    'night': Lane(['web/tests/night.test.ts'], ['attach: a layer is handed the level']),
    # the clock dials' glow (web/src/night.ts `createDialLights`, its wiring in web/src/atmosphere.ts): the whole file
    'dials': Lane(['web/tests/dial-lights.test.ts']),
    'atmosphere': Lane(['web/tests/atmosphere.test.ts'], ["a scene's own haze", 'fogFar: the range', 'the windows of the city light with the lamps']),
    'weather': Lane(['web/tests/station-weather.test.ts'], [
        'lightWaverleyNight: the city blocks get lit windows', 'the meshes the Scottish night lights are the ones the real scene builds', "the Balmoral's windows are the facade texture's",
        'the Scottish climate lights the Scottish night', 'the Scottish scene has its street lamps a moment after it', 'a lamp layer that arrives after dusk comes in lit',
        'a climate that ends before its lamps have loaded', 'a Scottish climate that ended before it ever ran can still be updated', 'a scene with no ground to stand lamps on has none',
        "the Scottish clear air is hazier than London's"]),
    # the squeeze of the build: a hook must find three's own text and nothing the page wrote (tools/tests/three-squeeze*.test.ts); only the two tests that scan the page's hooks are judged here
    # (the rest of the squeeze tests belong to lighting.py, which must see each of them fail)
    'hooks': Lane(['tools/tests/three-squeeze.test.ts', 'tools/tests/three-squeeze-hooks.test.ts'],
                  ['every match the page makes on three', 'every hook of the real scene does to the squeezed program']),
}


class Where:
    """A file to mutate and the lanes (test commands) that judge a mutation of it."""

    def __init__(self, path, *lanes):
        self.path, self.lanes = path, lanes


STREET, STREETWEB, LAMPS, BUILD = 'core/streetlights.ts', 'web/src/streetlights.ts', 'web/src/waverley-lamps.ts', 'tools/build-waverley-lamp-roads.ts'
MATERIALS, LIGHTING, LANDMARKS, NIGHT = 'web/src/materials.ts', 'web/src/lighting.ts', 'web/src/landmarks.ts', 'web/src/night.ts'
CORECITY, WEBCITY, WEATHER, ATMOSPHERE = 'core/city.ts', 'web/src/city.ts', 'web/src/station-weather.ts', 'web/src/atmosphere.ts'

C = Where(STREET, 'lamps', 'city')  # the lamps' places: the lamp tests and the city's
W = Where(STREETWEB, 'lamps')  # the lamps' drawing
SC = Where(LAMPS, 'lamps')  # the Scottish lamps' places
SL = Where(LAMPS, 'lamps', 'weather')  # the Scottish lamps' loading, which the scene's tests run end to end
B = Where(BUILD, 'lamps')
HK = Where(MATERIALS, 'hooks')  # a hook of the windows, judged on the squeezed text of three's programs

MUTATIONS = []

# ------------------------------------------------------------------------------------------------ core/streetlights.ts: which light, and where
MUTATIONS += [
    # ---- lampKind
    ('a lamp in the new quarter is not white', C, "if (ctx.modern(at)) return run.cls === 'pedestrian' || run.cls === 'service' ? LAMP_KIND.cool : LAMP_KIND.warm;", 'if (ctx.modern(at)) return LAMP_KIND.sodium;'),
    ('the new quarter\'s walkways are warm and its streets cool', C, '? LAMP_KIND.cool : LAMP_KIND.warm;', '? LAMP_KIND.warm : LAMP_KIND.cool;'),
    ('a service way in the new quarter has a street\'s warm lamp', C, "run.cls === 'pedestrian' || run.cls === 'service' ? LAMP_KIND.cool", "run.cls === 'pedestrian' ? LAMP_KIND.cool"),
    ('a pedestrian way in the old streets is as sodium as the rest', C, "  if (run.cls === 'pedestrian') return LAMP_KIND.warm;\n", ''),
    ('main roads are less sodium than side streets', C, '? 0.8 : 0.55;', '? 0.55 : 0.8;'),
    ('a secondary road is a side street for its lamps', C, " || run.cls === 'secondary' ? 0.8", ' ? 0.8'),
    ('a road\'s lamps are sodium where its luck is over the share', C, 'ctx.rand(run.id, 1) < sodium', 'ctx.rand(run.id, 1) > sodium'),
    ('every old street is sodium', C, 'ctx.rand(run.id, 1) < sodium ? LAMP_KIND.sodium : LAMP_KIND.warm', 'LAMP_KIND.sodium'),
    ('no old street is sodium', C, 'ctx.rand(run.id, 1) < sodium ? LAMP_KIND.sodium : LAMP_KIND.warm', 'LAMP_KIND.warm'),
    # ---- the rules
    ('a footpath has lamps', C, "  pedestrian: { spacing: 28, height: 5, sides: 'alternate' },\n};", "  pedestrian: { spacing: 28, height: 5, sides: 'alternate' },\n  path: { spacing: 28, height: 5, sides: 'alternate' },\n};"),
    ('a pedestrian way has no lamps', C, "  pedestrian: { spacing: 28, height: 5, sides: 'alternate' },\n", ''),
    ('a service way\'s lamps alternate', C, "height: 5, sides: 'one' }", "height: 5, sides: 'alternate' }"),
    # ---- lampSpots
    ('a post stands on the kerb', C, 'const off = run.half + LAMP_KERB;', 'const off = run.half;'),
    ('a run that is too short has lamps', C, 'if (total < LAMP_MIN_RUN) continue;\n', ''),
    ('every road\'s lamps alternate', C, "rule.sides === 'one' ? (ctx.rand(run.id, 2) < 0.5 ? 1 : -1) : 0", "rule.sides === 'never' ? (ctx.rand(run.id, 2) < 0.5 ? 1 : -1) : 0"),
    ('a one-sided road is always on the right', C, '(ctx.rand(run.id, 2) < 0.5 ? 1 : -1)', '1'),
    ('every road\'s first lamp is at the same distance from its end', C, 'LAMP_END_MARGIN + rule.spacing * 0.5 * ctx.rand(run.id, 3)', 'LAMP_END_MARGIN'),
    ('a lamp may stand at the very end of a run', C, 'd <= total - LAMP_END_MARGIN', 'd <= total'),
    ('the lamps are spaced evenly', C, 'd += rule.spacing * (0.9 + 0.2 * ctx.rand(run.id, 10 + n))', 'd += rule.spacing'),
    ('a bend is not followed: every lamp is placed on the first segment', C, '      while (seg < line.length - 1 && (along[seg] as number) < d) seg++;\n', ''),
    ('a lamp\'s place along its segment is read from the wrong end', C, 'const t = (d - (along[seg - 1] as number)) / length;', 'const t = (d - (along[seg] as number)) / length;'),
    ('the sides are the other way round', C, 'const normal: Pt = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];', 'const normal: Pt = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];'),
    ('the lamps stand on one side of every road', C, 'const side = lonely || (n % 2 === 0 ? 1 : -1);', 'const side = lonely || 1;'),
    ('a one-sided road\'s lamps alternate', C, 'const side = lonely || (n % 2 === 0 ? 1 : -1);', 'const side = n % 2 === 0 ? 1 : -1;'),
    ('nothing blocks a lamp', C, '      if (ctx.blocked(at, run.id)) continue;\n', ''),
    ('a lamp\'s own road blocks it', C, 'ctx.blocked(at, run.id)', 'ctx.blocked(at, -1)'),
    ('a lamp on a rising surface is given the height at the road, not at the kerb', C, 'height(at[0], at[1], d, side * off) : height;', 'height(at[0], at[1], d, 0) : height;'),
    ('the surface\'s rise along the road is read at one place', C, 'd + SLOPE_STEP, side * off)', 'd, side * off)'),
    ('the surface\'s rise across the road is read at one place', C, 'd, side * off + SLOPE_STEP)', 'd, side * off)'),
    ('the rise along the road is a step, not a metre', C, '/ (2 * SLOPE_STEP),', '/ SLOPE_STEP,'),
    ('the rise across the road is a step, not a metre', C, '/ (2 * SLOPE_STEP)]', '/ SLOPE_STEP]'),
    ('the slope is the road\'s alone', C, 'const slope: [number, number] = [alongRise * tangent[0] + acrossRise * normal[0], alongRise * tangent[1] + acrossRise * normal[1]];',
     'const slope: [number, number] = [alongRise * tangent[0], alongRise * tangent[1]];'),
    ('the slope across the road is turned into the wrong axes', C, 'alongRise * tangent[1] + acrossRise * normal[1]]', 'alongRise * tangent[1] + acrossRise * normal[0]]'),
    ('the arm points along the road', C, 'yaw: Math.atan2(normal[1] * side, -normal[0] * side)', 'yaw: Math.atan2(tangent[1] * side, -tangent[0] * side)'),
    ('the arm points the same way from both sides', C, 'yaw: Math.atan2(normal[1] * side, -normal[0] * side)', 'yaw: Math.atan2(normal[1], -normal[0])'),
    ('the arm is turned half a turn', C, 'yaw: Math.atan2(normal[1] * side, -normal[0] * side)', 'yaw: Math.atan2(-normal[1] * side, normal[0] * side)'),
    ('every post is the same height', C, 'height: rule.height,', 'height: 8,'),
    ('every lamp is sodium', C, 'kind: lampKind(run, ctx, at),', 'kind: LAMP_KIND.sodium,'),
    # ---- a pool's reach, the lean road file and the forecourt's masts
    ('a pool reaches a post\'s height', C, 'export const poolRadius = (height: number): number => height * POOL_REACH;', 'export const poolRadius = (height: number): number => height;'),
    ('a point is rounded down to its step', C, 'Math.round(x / unit), Math.round(z / unit)', 'Math.floor(x / unit), Math.floor(z / unit)'),
    ('a point is its whole steps from the origin, not from the last point', C, 'steps.push(qx - px, qz - pz);', 'steps.push(qx, qz);'),
    ('a bridge\'s deck is on the ground', C, 'const group = road.bridge ? out.bridges : out.ways;', 'const group = road.bridge ? out.ways : out.bridges;'),
    ('a point is the sum of its steps no longer', C, 'x += steps[i] as number;', 'x = steps[i] as number;'),
    ('a point\'s z is the sum of its steps no longer', C, 'z += steps[i + 1] as number;', 'z = steps[i + 1] as number;'),
    ('a step is a metre', C, 'line.push([x * file.unit, z * file.unit]);', 'line.push([x, z]);'),
    ('the bridges are decoded before the ground\'s roads', C, '[[false, file.ways], [true, file.bridges]] as const', '[[true, file.bridges], [false, file.ways]] as const'),
    ('a deck is decoded as the ground', C, 'out.push({ cls, bridge, line });', 'out.push({ cls, bridge: false, line });'),
    ('a mast stands on the ground', C, 'y: heightAt(x, z) + MAST_LIFT,', 'y: heightAt(x, z),'),
    ('a mast is a street lamp\'s white', C, 'kind: LAMP_KIND.cool, slope: [gx, gz], mast: true }', 'kind: LAMP_KIND.warm, slope: [gx, gz], mast: true }'),
    ('a mast is not a mast', C, 'slope: [gx, gz], mast: true }', 'slope: [gx, gz] }'),
    ('a mast is a street lamp\'s height', C, 'height: MAST_HEIGHT, kind', 'height: 9, kind'),
    ('the masts\' u and v are swapped', C, 'const [x, z] = shedToWorld(layout, u, v);', 'const [x, z] = shedToWorld(layout, v, u);'),
    ('a mast\'s slope along x is read across a step', C, 'heightAt(x - SLOPE_STEP, z)) / (2 * SLOPE_STEP);', 'heightAt(x - SLOPE_STEP, z)) / SLOPE_STEP;'),
    ('a mast\'s slope along z is read along x', C, 'const gz = (heightAt(x, z + SLOPE_STEP) - heightAt(x, z - SLOPE_STEP)) / (2 * SLOPE_STEP);', 'const gz = (heightAt(x + SLOPE_STEP, z) - heightAt(x - SLOPE_STEP, z)) / (2 * SLOPE_STEP);'),
    # ---- the forecourt's masts keep clear of the buildings (the rule that is camera-independent: core/streetlights.ts `mastIsClear`)
    ('a mast may stand against a wall', C, '!pointInPolygon(p, b.pts) && ringDistance(p, b.pts) >= MAST_CLEAR', '!pointInPolygon(p, b.pts)'),
    ('a mast may stand under a roof', C, '!pointInPolygon(p, b.pts) && ringDistance(p, b.pts) >= MAST_CLEAR', 'ringDistance(p, b.pts) >= MAST_CLEAR'),
    ('a wall exactly the clearance away is too near', C, 'ringDistance(p, b.pts) >= MAST_CLEAR', 'ringDistance(p, b.pts) > MAST_CLEAR'),
    ('a mast is clear when any one building is far enough', C, 'buildings.every((b) =>', 'buildings.some((b) =>'),
    ('only the first building keeps a mast off', C, 'buildings.every((b) =>', 'buildings.slice(0, 1).every((b) =>'),
    ('only the last building keeps a mast off', C, 'buildings.every((b) =>', 'buildings.slice(-1).every((b) =>'),
    ('a place that is not clear still has its mast', C, '    if (!mastIsClear([x, z], data.buildings)) return [];\n', ''),
    ('the forecourt\'s masts are placed with no buildings to keep clear of', C, 'mastIsClear([x, z], data.buildings)', 'mastIsClear([x, z], [])'),
    # ---- the distance from a ring that rule uses (core/streetlights.ts `ringDistance`, written out because core/kxcentral.ts is a lazy chunk)
    ('a mast is measured from the nearest corner, not the nearest face', C, 'Math.hypot(p[0] - (ax + dx * t), p[1] - (az + dz * t))', 'Math.hypot(p[0] - ax, p[1] - az)'),
    ('a face is measured as an endless line', C, 'Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2))', '((p[0] - ax) * dx + (p[1] - az) * dz) / l2'),
    ('a face goes on for ever past its second corner', C, 'Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2))', 'Math.max(0, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2)'),
    ('a face goes on for ever past its first corner', C, 'Math.min(1, Math.max(0, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2))', 'Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2)'),
    ('the foot of the perpendicular is found along the wrong axis', C, '(p[1] - az) * dz) / l2', '(p[1] - az) * dx) / l2'),
    ('the last face of a ring is left out', C, 'for (let i = 0; i < ring.length; i++) {\n    const [ax, az] = ring[i] as Pt;', 'for (let i = 0; i < ring.length - 1; i++) {\n    const [ax, az] = ring[i] as Pt;'),
    ('the first face of a ring is left out', C, 'for (let i = 0; i < ring.length; i++) {\n    const [ax, az] = ring[i] as Pt;', 'for (let i = 1; i < ring.length; i++) {\n    const [ax, az] = ring[i] as Pt;'),
    ('a ring closes on its second corner, not its first', C, 'ring[(i + 1) % ring.length] as Pt;', 'ring[(i + 1) % (ring.length - 1)] as Pt;'),
    ('a face of no length is a division by nothing', C, 'l2 === 0 ? 0 : ', ''),
    ('only the last face of a ring counts', C, 'best = Math.min(best, Math.hypot(p[0] - (ax + dx * t), p[1] - (az + dz * t)));', 'best = Math.hypot(p[0] - (ax + dx * t), p[1] - (az + dz * t));'),
    ('the farthest face is taken for the nearest', C, 'best = Math.min(best, Math.hypot(', 'best = Math.max(best, Math.hypot('),
    ('a ring starts at no distance', C, 'let best = Infinity;', 'let best = 0;'),
]


# ------------------------------------------------------------------------------------------------ web/src/streetlights.ts: the lamps as drawn
MUTATIONS += [
    # ---- the geometry
    ('the column has five faces', W, 'for (let k = 0; k < 6; k++) {', 'for (let k = 0; k < 5; k++) {'),
    ('the column does not taper', W, 'ring(r1, height, k + 1), ring(r1, height, k)]', 'ring(r0, height, k + 1), ring(r0, height, k)]'),
    ('the post is half as tall as it is said to be', W, 'column(batch, 0.11, 0.07, POST_HEIGHT, rgb(0x2b2f33));', 'column(batch, 0.11, 0.07, POST_HEIGHT / 2, rgb(0x2b2f33));'),
    ('the lamp has no arm', W, "  batch.box([ARM / 2, POST_HEIGHT + 0.1, 0], [ARM, 0.07, 0.07], { rotZ: 0.06, color: rgb(0x2b2f33) });\n", ''),
    ('the lamp has no head', W, "  batch.box([ARM, POST_HEIGHT + 0.2, 0], [0.8, 0.1, 0.3], { color: rgb(0x555b62) });\n", ''),
    ('the mast has no strip of LEDs', W, '  batch.box([0, (MAST_STRIP[0] + MAST_STRIP[1]) / 2, 0], [0.2, MAST_STRIP[1] - MAST_STRIP[0], 0.2], { color: rgb(0xd9e2ea) });\n', ''),
    ('the mast\'s strip is at the foot of the column', W, 'batch.box([0, (MAST_STRIP[0] + MAST_STRIP[1]) / 2, 0]', 'batch.box([0, (MAST_STRIP[1] - MAST_STRIP[0]) / 2, 0]'),
    # ---- where the glow is
    ('a lamp\'s glow ignores the post\'s height', W, 'const s = spot.height / POST_HEIGHT;\n  const arm', 'const s = 1;\n  const arm'),
    ('a mast\'s glow is at the end of an arm', W, 'const arm = spot.mast ? 0 : ARM * s;', 'const arm = ARM * s;'),
    ('a lamp\'s glow is at the end of the arm\'s mirror image', W, 'spot.x + Math.cos(spot.yaw) * arm', 'spot.x - Math.cos(spot.yaw) * arm'),
    ('a lamp\'s glow is turned the wrong way round', W, 'spot.z - Math.sin(spot.yaw) * arm', 'spot.z + Math.sin(spot.yaw) * arm'),
    ('a mast\'s glow is at the top of a post', W, 'spot.y + (spot.mast ? 0 : (POST_HEIGHT + 0.12) * s)', 'spot.y + (POST_HEIGHT + 0.12) * s'),
    ('a lamp\'s glow is at its foot', W, 'spot.y + (spot.mast ? 0 : (POST_HEIGHT + 0.12) * s)', 'spot.y + (spot.mast ? 0 : 0)'),
    ('a mast\'s strip stops short of its top', W, 'h <= MAST_STRIP[1] + 1e-6;', 'h < MAST_STRIP[1] - 0.3;'),
    ('a mast\'s glow points are twice as far apart', W, 'h += 0.6)', 'h += 1.2)'),
    ('a mast\'s glow points are at the foot', W, 'out.push([spot.x, spot.y + h, spot.z]);', 'out.push([spot.x, h, spot.z]);'),
    # ---- the pool's gradient
    ('the pool texture is made again at every call', W, '  if (pool !== undefined) return pool;\n', ''),
    ('the pool\'s gradient is read from the wrong distance', W, 'const d = r * POOL_REACH;', 'const d = r;'),
    ('the pool\'s light falls as the square of the cosine', W, 'Math.pow(1 / Math.sqrt(1 + d * d), 3)', 'Math.pow(1 / Math.sqrt(1 + d * d), 2)'),
    ('the pool\'s edge is not clear', W, '(r === 1 ? 0 : Math.pow(1 / Math.sqrt(1 + d * d), 3)).toFixed(3)', 'Math.pow(1 / Math.sqrt(1 + d * d), 3).toFixed(3)'),
    ('the pool\'s gradient is one pixel wide', W, 'g.createRadialGradient(64, 64, 0, 64, 64, 64)', 'g.createRadialGradient(64, 64, 0, 64, 64, 1)'),
    # ---- createStreetLights
    ('the posts have no vertex colours', W, 'new THREE.MeshLambertMaterial({ vertexColors: true });\n  const matrix', 'new THREE.MeshLambertMaterial({ vertexColors: false });\n  const matrix'),
    ('the masts are drawn in the lamps\' mesh', W, 'const some = spots.filter((spot) => !!spot.mast === mast);', 'const some = spots;'),
    ('a data set with no masts has an empty mast mesh', W, '    if (!some.length) continue;\n', ''),
    ('a lamp is not scaled to its height', W, 'const s = mast ? 1 : spot.height / POST_HEIGHT;', 'const s = 1;'),
    ('a lamp is scaled the wrong way', W, 'const s = mast ? 1 : spot.height / POST_HEIGHT;', 'const s = mast ? 1 : POST_HEIGHT / spot.height;'),
    ('a lamp is not turned to its yaw', W, 'turn.setFromAxisAngle(up, spot.yaw)', 'turn.setFromAxisAngle(up, 0)'),
    ('the posts are culled by the geometry\'s own bounds', W, '    posts.frustumCulled = false;\n', ''),
    ('the glow is the pool\'s colour', W, 'tint.setHex(LAMP_LIGHT[spot.kind].halo);', 'tint.setHex(LAMP_LIGHT[spot.kind].pool);'),
    ('a mast glows at one point', W, 'for (const point of spot.mast ? stripPoints(spot) : [headOf(spot)])', 'for (const point of [headOf(spot)])'),
    ('a lamp glows along a strip', W, 'for (const point of spot.mast ? stripPoints(spot) : [headOf(spot)])', 'for (const point of stripPoints(spot))'),
    ('the glow is drawn normally, not added', W, 'blending: THREE.AdditiveBlending, depthWrite: false, fog: false });\n  const halos', 'blending: THREE.NormalBlending, depthWrite: false, fog: false });\n  const halos'),
    ('the glow writes to the depth buffer', W, 'blending: THREE.AdditiveBlending, depthWrite: false, fog: false });\n  const halos', 'blending: THREE.AdditiveBlending, depthWrite: true, fog: false });\n  const halos'),
    ('the glow is fogged', W, 'blending: THREE.AdditiveBlending, depthWrite: false, fog: false });\n  const halos', 'blending: THREE.AdditiveBlending, depthWrite: false, fog: true });\n  const halos'),
    ('the glow is there by day', W, '  halos.visible = false;\n', ''),
    ('the glow is culled by its first point', W, '  halos.frustumCulled = false;\n', ''),
    ('the pool is a side of one reach, not two', W, 'const r = poolRadius(spot.height) * 2;', 'const r = poolRadius(spot.height);'),
    ('the pool is under the foot of the post, not the glow', W, 'const [x, , z] = headOf(spot);', 'const [x, z] = [spot.x, spot.z];'),
    ('the pool lies flat', W, 'matrix.set(r, 0, 0, x, gx * r, 1, gz * r,', 'matrix.set(r, 0, 0, x, 0, 1, 0,'),
    ('the pool sinks into the ground', W, 'gz * (z - spot.z) + POOL_LIFT, 0, 0, r, z, 0, 0, 0, 1);', 'gz * (z - spot.z), 0, 0, r, z, 0, 0, 0, 1);'),
    ('the pool is not lifted where the glow is', W, 'spot.y + gx * (x - spot.x) + gz * (z - spot.z) + POOL_LIFT', 'spot.y + POOL_LIFT'),
    ('the pool is the glow\'s colour', W, 'tint.setHex(light.pool).multiplyScalar(light.strength)', 'tint.setHex(light.halo).multiplyScalar(light.strength)'),
    ('the pool is at full strength', W, 'tint.setHex(light.pool).multiplyScalar(light.strength)', 'tint.setHex(light.pool)'),
    ('the pool is there by day', W, '  pools.visible = false;\n', ''),
    ('the pools are culled by the plane\'s own bounds', W, '  pools.frustumCulled = false;\n', ''),
    ('the pools are drawn under the glow\'s order', W, '  pools.renderOrder = 4;\n', '  pools.renderOrder = 6;\n'),
    ('the level is not held to 0..1', W, 'const l = Math.min(1, Math.max(0, level));', 'const l = level;'),
    ('the glow is brighter than the level', W, 'haloMaterial.opacity = l * 0.9;', 'haloMaterial.opacity = l * 3;'),
    ('the pool\'s opacity ignores the level', W, 'poolMaterial.opacity = l;', 'poolMaterial.opacity = 1;'),
    ('the glow is drawn from the first trace of the level', W, 'halos.visible = pools.visible = l > 0.01;', 'halos.visible = pools.visible = l >= 0;'),
    ('the glow comes on at half the level', W, 'halos.visible = pools.visible = l > 0.01;', 'halos.visible = pools.visible = l > 0.5;'),
    ('the count leaves the pools\' triangles out', W, ', 0) + 2 * n, draws: meshes.length + 2 }', ', 0), draws: meshes.length + 2 }'),
    ('the count leaves a draw out', W, 'draws: meshes.length + 2 }', 'draws: meshes.length + 1 }'),
    ('the posts\' geometries are not freed', W, '      for (const g of geometries) g.dispose();\n', ''),
    ('the posts\' meshes are not freed', W, '      for (const m of meshes) m.dispose();\n', ''),
    ('the glow\'s geometry is not freed', W, '      haloGeometry.dispose();\n', ''),
    ('the pool\'s geometry is not freed', W, '      poolGeometry.dispose();\n', ''),
    ('the posts\' material is not freed', W, '      material.dispose();\n', ''),
    ('the glow\'s material is not freed', W, '      haloMaterial.dispose();\n', ''),
    ('the pool\'s material is not freed', W, '      poolMaterial.dispose();\n', ''),
    ('the pools\' mesh is not freed', W, '      pools.dispose();\n', ''),
]

# ------------------------------------------------------------------------------------------------ the Scottish lamps (web/src/waverley-lamps.ts) and the lean road file's tool
MUTATIONS += [
    ('the box of a building is empty, so no building blocks a lamp', SC, 'box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]', 'box: [Math.max(...xs), Math.min(...xs), Math.min(...zs), Math.max(...zs)]'),
    ('a building\'s courtyards are inside it', SC, ' && !f.holes.some((h) => pointInPolygon(p, h as Pt[]))', ''),
    ('a deck\'s length is the length of its x', SC, 'Math.hypot(p[0] - (line[i] as Pt)[0], p[1] - (line[i] as Pt)[1])', 'Math.abs(p[0] - (line[i] as Pt)[0])'),
    ('two decks meet within a metre', SC, '`${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`', '`${Math.round(p[0])},${Math.round(p[1])}`'),
    ('a deck is its own other', SC, '.filter((j) => j !== i);', '.filter((j) => j === i);'),
    ('a node where three decks meet does not end a chain', SC, 'if (next.length !== 1 || following === undefined || used.has(following)) break;', 'if (next.length < 1 || following === undefined || used.has(following)) break;'),
    ('a chain\'s ends are read the wrong way round', SC, 'const [h0, h1] = [context(start[0], start[1]), context(end[0], end[1])];', 'const [h0, h1] = [context(end[0], end[1]), context(start[0], start[1])];'),
    ('a deck that runs against its chain is read from the wrong end', SC, '(m.from + (m.reversed ? length - s : s))', '(m.from + s)'),
    ('a deck is read from the start of the chain, not from its own', SC, '(m.from + (m.reversed ? length - s : s))', '((m.reversed ? length - s : s))'),
    ('a deck rises past its ends', SC, 'Math.min(1, Math.max(0, (m.from + (m.reversed ? length - s : s)) / (total || 1)))', '((m.from + (m.reversed ? length - s : s)) / (total || 1))'),
    ('a chain ends only where it dead-ends', SC, 'const free = (k: string): boolean => others(i, k).length !== 1;', 'const free = (k: string): boolean => others(i, k).length === 0;'),
    ('a chain is walked from the wrong end', SC, 'if (free(a)) chain(i, false);', 'if (free(a)) chain(i, true);'),
    ('the bridges are the ground\'s roads and the ground\'s the bridges', SC, 'const decks = roads.flatMap((road, i) => (road.bridge ? [i] : []));', 'const decks = roads.flatMap((road, i) => (road.bridge ? [] : [i]));'),
    ('a lamp on a deck stands on the ground', SC, 'y: deckOf.get(id) ?? ((x, z) => ground(x, z))', 'y: (x, z) => ground(x, z)'),
    ('a road is as wide as its half', SC, 'half: (WAVERLEY_ROAD_WIDTH[road.cls] as number) / 2, line: road.line', 'half: (WAVERLEY_ROAD_WIDTH[road.cls] as number), line: road.line'),
    ('a carriageway is as wide as its half', SC, 'reach: (WAVERLEY_ROAD_WIDTH[road.cls] as number) / 2 });', 'reach: (WAVERLEY_ROAD_WIDTH[road.cls] as number) });'),
    ('the decks\' carriageways are the ground\'s', SC, 'const grid = road.bridge ? carriageways.deck : carriageways.ground;', 'const grid = road.bridge ? carriageways.ground : carriageways.deck;'),
    ('a lamp may stand east of the terrain', SC, 'p[0] < x0 || p[0] > x1 || p[1] < z0 || p[1] > z1', 'p[0] < x0 || p[1] < z0 || p[1] > z1'),
    ('a lamp may stand south of the terrain', SC, 'p[0] < x0 || p[0] > x1 || p[1] < z0 || p[1] > z1', 'p[0] < x0 || p[0] > x1 || p[1] < z0'),
    ('every lamp is in the new quarter', SC, 'modern: () => false,', 'modern: () => true,'),
    ('a lamp on a deck is blocked as one on the ground', SC, '(roads[id] as LampRoad).bridge ? carriageways.deck.nearest(p, 6) < 0.3 : inBuilding(p) || carriageways.ground.nearest(p, 6) < 0.3',
     '(roads[id] as LampRoad).bridge ? inBuilding(p) || carriageways.ground.nearest(p, 6) < 0.3 : carriageways.deck.nearest(p, 6) < 0.3'),
    ('a lamp may stand in the road it crosses', SC, 'inBuilding(p) || carriageways.ground.nearest(p, 6) < 0.3', 'inBuilding(p)'),
    ('a lamp may stand on another deck', SC, 'carriageways.deck.nearest(p, 6) < 0.3 :', 'false :'),
    ('no building blocks a lamp on the ground', SC, ': inBuilding(p) || carriageways.ground', ': carriageways.ground'),
    ('the lamps\' luck is the same for every road', SC, 'rand: hash01,', 'rand: () => 0.5,'),
    ('the buildings\' roofs let a lamp stand under them', SL, '...data.buildings, ...data.roofs, ', '...data.buildings, '),
    ('the platforms let a lamp stand on them', SL, ', ...data.platforms.map((p) => ({ outer: p.path, holes: [] }))]', ']'),
    ('the lamps stand on the context ground and the decks on the drawn one', SL, 'waverleyLampSpots(roads.default as unknown as LampRoadsFile, drawn, (x, z) => context.heightAt(x, z), sceneFootprints(data))', 'waverleyLampSpots(roads.default as unknown as LampRoadsFile, (x, z) => context.heightAt(x, z), drawn, sceneFootprints(data))'),
    # ---- tools/build-waverley-lamp-roads.ts
    ('the lean file lights a service road', B, "'minor', 'pedestrian'];", "'minor', 'pedestrian', 'service'];"),
    ('the lean file leaves the pedestrian ways out', B, "'minor', 'pedestrian'];", "'minor'];"),
    ('the lean file keeps every class', B, '!LAMP_CLASSES.includes(cls) || ', ''),
    ('the lean file keeps a one-point line', B, ' || way.path.length < 2) continue;', ') continue;'),
    ('the lean file puts the decks on the ground', B, 'bridge: way.bridge === true,', 'bridge: false,'),
    ('the lean file is in whole metres', B, 'export const STEP = 0.5;', 'export const STEP = 1;'),
    ('the lean file loses its source\'s attribution', B, 'attribution: source.attribution,', "attribution: '',"),
    ('the lean file loses its source\'s licence', B, 'licence: source.licence,', "licence: '',"),
    ('the lean file has no extent', B, 'extent: source.extent,', 'extent: { x0: 0, z0: 0, x1: 0, z1: 0 },'),
]


# ------------------------------------------------------------------------------------------------ web/src/materials.ts: the windows' GLSL (WIN_NIGHT_GLSL)
WIN = Where(MATERIALS, 'windows')
MUTATIONS += [
    ('a window\'s number ignores its building', WIN, '+ seed * 2.713 + salt * 19.19 )', '+ salt * 19.19 )'),
    ('a window\'s numbers are the same whatever they are for', WIN, '+ seed * 2.713 + salt * 19.19 )', '+ seed * 2.713 )'),
    ('the sines\' numbers are not made even', WIN, 'return 0.63662 * asin( sqrt( clamp( a, 0.0, 1.0 ) ) );', 'return clamp( a, 0.0, 1.0 );'),
    ('a pane has no top or right', WIN, 'return lo.x * lo.y * hi.x * hi.y;', 'return lo.x * lo.y;'),
    ('a pane\'s edge is as sharp as the pixel', WIN, 'vec2 e = max( w, vec2( 0.002 ) );', 'vec2 e = w;'),
    ('the lit share is the dark share', WIN, 'float on = step( h.x, share ) * step( off, h.y )', 'float on = step( share, h.x ) * step( off, h.y )'),
    ('the dark floors are the lit floors', WIN, 'step( off, h.y ) * smoothstep(', 'step( h.y, off ) * smoothstep('),
    ('every window comes on at the same hour', WIN, 'smoothstep( 0.04 + 0.6 * h.z, 0.26 + 0.6 * h.z, night )', 'smoothstep( 0.04, 0.26, night )'),
    ('every window is on as soon as there is any night', WIN, 'smoothstep( 0.04 + 0.6 * h.z, 0.26 + 0.6 * h.z, night )', 'step( 0.04, night )'),
    ('a window\'s warm light is always the same warm', WIN, 'vec3 warm = mix( vec3( 1.0, 0.58, 0.26 ), vec3( 1.0, 0.82, 0.54 ), fract( h.w * 5.3 ) );', 'vec3 warm = vec3( 1.0, 0.58, 0.26 );'),
    ('no window is cool white', WIN, 'vec3 col = mix( warm, vec3( 0.66, 0.82, 1.0 ), step( 1.0 - cool, fract( h.w * 9.7 + 0.37 ) ) );', 'vec3 col = warm;'),
    ('the cool share is the warm share', WIN, 'step( 1.0 - cool, fract( h.w * 9.7 + 0.37 ) )', 'step( cool, fract( h.w * 9.7 + 0.37 ) )'),
    ('every lit window is as bright as the next', WIN, 'return col * on * ( 0.5 + 0.5 * fract( h.w * 3.1 + 0.2 ) );', 'return col * on;'),
    ('the far glow ignores the dark floors', WIN, ' * ( 1.0 - off ) * clamp( ( night - 0.15 ) / 0.6, 0.0, 1.0 )', ' * clamp( ( night - 0.15 ) / 0.6, 0.0, 1.0 )'),
    ('the far glow is full as soon as it is dark', WIN, 'clamp( ( night - 0.15 ) / 0.6, 0.0, 1.0 )', '1.0'),
    ('the far glow has no cool windows', WIN, 'return mix( vec3( 1.0, 0.70, 0.40 ), vec3( 0.66, 0.82, 1.0 ), cool ) * (', 'return vec3( 1.0, 0.70, 0.40 ) * ('),
    ('a window\'s glass is as bright at the sill as at the head', WIN, 'return mix( 0.72, 1.0, smoothstep( r.z, r.w, y ) );', 'return 1.0;'),
    ('every building has the same share of its windows lit', WIN, 'float share = mode.x + mode.y * fract( seed * 3.71 + 0.29 );', 'float share = mode.x;'),
    ('a floor is dark a window at a time', WIN, 'winHash( vec2( 0.0, cell.y ), seed, 2.0 )', 'winHash( cell, seed, 2.0 )'),
    ('a facade is never taken for its mean', WIN, '  float far = smoothstep( 0.25, 0.6, span );\n  float near = 1.0 - smoothstep( 0.03, 0.1, span );\n  vec3 own = winLight( h, night, share, mode.z, mode.w )',
     '  float far = 0.0;\n  float near = 1.0 - smoothstep( 0.03, 0.1, span );\n  vec3 own = winLight( h, night, share, mode.z, mode.w )'),
    ('a facade is always taken for its mean', WIN, '  float far = smoothstep( 0.25, 0.6, span );\n  float near = 1.0 - smoothstep( 0.03, 0.1, span );\n  vec3 own = winLight( h, night, share, mode.z, mode.w )',
     '  float far = 1.0;\n  float near = 1.0 - smoothstep( 0.03, 0.1, span );\n  vec3 own = winLight( h, night, share, mode.z, mode.w )'),
    ('a facade\'s near windows are as bright as its far', WIN, '  float far = smoothstep( 0.25, 0.6, span );\n  float near = 1.0 - smoothstep( 0.03, 0.1, span );\n  vec3 own = winLight( h, night, share, mode.z, mode.w )',
     '  float far = smoothstep( 0.25, 0.6, span );\n  float near = 0.0;\n  vec3 own = winLight( h, night, share, mode.z, mode.w )'),
    ('a facade\'s span is its narrower side', WIN, '  float span = max( w.x, w.y );\n  float far = smoothstep( 0.25, 0.6, span );\n  float near = 1.0 - smoothstep( 0.03, 0.1, span );\n  vec3 own = winLight( h, night, share, mode.z, mode.w )',
     '  float span = min( w.x, w.y );\n  float far = smoothstep( 0.25, 0.6, span );\n  float near = 1.0 - smoothstep( 0.03, 0.1, span );\n  vec3 own = winLight( h, night, share, mode.z, mode.w )'),
    ('a facade\'s glass is as bright as a curtain wall\'s up close', WIN, 'winRoom( f.y, rect ) * mix( 1.0, 0.3 + 0.7 * glass, near ) );', 'winRoom( f.y, rect ) );'),
    ('a facade\'s far glow is the whole cell\'s', WIN, 'winMean( night, share, mode.z, mode.w ) * ( ( rect.y - rect.x ) * ( rect.w - rect.z ) * 0.86 )', 'winMean( night, share, mode.z, mode.w ) * 0.86'),
    ('a decal\'s windows are all as lit as each other', WIN, 'float share = 0.3 + 0.4 * g.w;', 'float share = 0.3;'),
    ('a decal\'s numbers are not made even', WIN, 'vec4 h = vec4( winUni( g.x ), 1.0, winUni( g.y ), winUni( g.z ) );', 'vec4 h = vec4( g.x, 1.0, g.y, g.z );'),
    ('a decal\'s blind does not dim its light', WIN, ' * mix( 0.55, 1.0, blind ) );', ' );'),
    ('a decal\'s far glow is the whole quad\'s', WIN, '( rect.y - rect.x ) * ( rect.w - rect.z ) * 0.7 )', '( rect.y - rect.x ) * ( rect.w - rect.z ) )'),
    ('a lit pane\'s windows are one window', WIN, 'float id = floor( v.x );', 'float id = v.x;'),
    ('a lit pane is brighter at the sill', WIN, 'winRoom( -1.0 - v.y, vec4( 0.0, 1.0, 0.0, 1.0 ) )', 'winRoom( v.y, vec4( 0.0, 1.0, 0.0, 1.0 ) )'),
    ('a lit pane\'s far glow is the pane\'s own light', WIN, 'winMean( night, share, 0.0, 0.1 ) * 0.7, far );', 'winMean( night, share, 0.0, 0.1 ), far );'),
    ('a lit pane is never taken for its mean', WIN, 'float far = smoothstep( 0.25, 0.6, max( w.x, w.y ) );', 'float far = 0.0;'),
]

# ------------------------------------------------------------------------------------------------ web/src/materials.ts: how a material is given its windows
MUTATIONS += [
    ('a facade\'s windows are the decal\'s glass', WIN, 'WIN_RECT: glslVec4(glass), WIN_GAIN: glslFloat(gain), ...(by', 'WIN_RECT: glslVec4(DECAL_GLASS), WIN_GAIN: glslFloat(gain), ...(by'),
    ('a facade\'s windows are as bright as a bulb', WIN, 'WIN_GAIN: glslFloat(gain), ...(by', 'WIN_GAIN: glslFloat(1), ...(by'),
    ('a facade has no way of lighting its windows', WIN, "...(by === 'quad' ? {} : { WIN_MODE: glslVec4(mode) }) };", '...({}) };'),
    ('a facade\'s material does not read the night', WIN, '  m.onBeforeCompile = (shader) => {\n    shader.uniforms.uWinNight = windowNight;\n    if (by === \'quad\') {', "  m.onBeforeCompile = (shader) => {\n    if (by === 'quad') {"),
    ('a facade\'s shader does not carry the window GLSL', WIN, ": ''}uniform float uWinNight;${WIN_NIGHT_GLSL}`)", ": ''}uniform float uWinNight;`)"),
    ('a tile facade\'s windows are lit by the glass of the quad', WIN, 'if ( uWinNight > 0.003 ) totalEmissiveRadiance += WIN_GAIN * winTile( vMapUv, fwidth( vMapUv ), gSeed, uWinNight, WIN_RECT, WIN_MODE, gShare );',
     'if ( uWinNight > 0.003 ) totalEmissiveRadiance += WIN_GAIN * winTile( vMapUv, fwidth( vMapUv ), gSeed, uWinNight, WIN_RECT, WIN_MODE, 1.0 );'),
    ('a tile facade\'s windows are never taken for their mean', WIN, 'winTile( vMapUv, fwidth( vMapUv ), gSeed,', 'winTile( vMapUv, vec2( 0.0 ), gSeed,'),
    ('every tile facade has the same windows', WIN, 'winTile( vMapUv, fwidth( vMapUv ), gSeed,', 'winTile( vMapUv, fwidth( vMapUv ), 0.0,'),
    ('a decal\'s blind is not read by its light', WIN, ', gBlind * smoothstep( 0.97 - gDrop, 1.03 - gDrop, vMapUv.y ) );', ', 1.0 );'),
    ('every decal window comes on at the same hour', WIN, 'gHour = 0.5 + 0.5 * sin( dot( gO, vec3( 5.3, 4.1, 2.9 ) ) );', 'gHour = 0.5;'),
    ('every decal window is as lit as the next', WIN, 'gLit = 0.5 + 0.5 * sin( dot( gO, vec3( 3.7, 2.3, 4.9 ) ) + 2.1 * sin( dot( gO, vec3( 1.7, 3.1, 2.3 ) ) ) );', 'gLit = 0.5;'),
    # ---- the Midland's lit panes
    ('a lit pane\'s number is not its u', WIN, "[id + PANE_UV.margin + (1 - 2 * PANE_UV.margin) * across, -1 - up]", "[PANE_UV.margin + (1 - 2 * PANE_UV.margin) * across, -1 - up]"),
    ('a lit pane\'s u has no margin', WIN, "[id + PANE_UV.margin + (1 - 2 * PANE_UV.margin) * across, -1 - up]", "[id + (1 - 2 * PANE_UV.margin) * across, -1 - up]"),
    ('a lit pane\'s v runs the other way', WIN, "(1 - 2 * PANE_UV.margin) * across, -1 - up]", "(1 - 2 * PANE_UV.margin) * across, -1 + up]"),
    ('a lit pane loses the defines it had', WIN, 'm.defines = { ...m.defines, WIN_GAIN: glslFloat(NIGHT_GAIN.decal) };', 'm.defines = { WIN_GAIN: glslFloat(NIGHT_GAIN.decal) };'),
    ('a lit pane\'s vertex shader reads the wrong UV', WIN, r"""'#include <begin_vertex>\nvWinUv = uv;'""", r"""'#include <begin_vertex>\nvWinUv = uv.yx;'"""),
    ('a lit pane lights what is not a window', WIN, 'if ( vWinUv.y < -0.5 && uWinNight > 0.003 )', 'if ( vWinUv.y > -0.5 && uWinNight > 0.003 )'),
    ('a lit pane does not read the night', WIN, "  m.onBeforeCompile = (shader) => {\n    shader.uniforms.uWinNight = windowNight;\n    shader.vertexShader = shader.vertexShader", '  m.onBeforeCompile = (shader) => {\n    shader.vertexShader = shader.vertexShader'),
    ('a lit pane\'s shader does not carry the window GLSL', WIN, r'varying vec2 vWinUv;\nuniform float uWinNight;${WIN_NIGHT_GLSL}`)', r'varying vec2 vWinUv;\nuniform float uWinNight;`)'),
    # ---- litWalls and its GLSL
    ('a wall with no map has lit windows', WIN, '#if defined( WALL_WIN ) && defined( USE_MAP )', '#if defined( WALL_WIN )'),
    ('a wall\'s windows are one to a tile', WIN, 'vec2 wv = vMapUv * WALL_TILE;', 'vec2 wv = vMapUv;'),
    ('a wall\'s grid is shifted the other way', WIN, 'wv += WALL_SHIFT;', 'wv -= WALL_SHIFT;'),
    ('a wall\'s windows span a pixel of the map, not of the grid', WIN, 'vec2 ww = fwidth( wv );', 'vec2 ww = fwidth( vMapUv );'),
    ('a wall\'s windows start a row early', WIN, 'step( WALL_ROWS.x, floor( wv.y ) ) * step( floor( wv.y ), WALL_ROWS.y - 1.0 )', 'step( WALL_ROWS.x - 1.0, floor( wv.y ) ) * step( floor( wv.y ), WALL_ROWS.y - 1.0 )'),
    ('a wall\'s windows end a row late', WIN, 'step( floor( wv.y ), WALL_ROWS.y - 1.0 )', 'step( floor( wv.y ), WALL_ROWS.y )'),
    ('a wall\'s windows have no first row', WIN, 'wrow = step( WALL_ROWS.x, floor( wv.y ) ) * step(', 'wrow = step('),
    ('the rows do not limit a wall\'s windows', WIN, '( WIN_GAIN * wrow * (', '( WIN_GAIN * ('),
    ('every building has the same windows', WIN, 'float wseed = fract( floor( vColor.r * 100.0 + 0.5 ) * 0.6180339 );', 'float wseed = 0.5;'),
    ('a roof has lit windows', WIN, '( 1.0 - smoothstep( 0.2, 0.4, abs( dot( normal, viewMatrix[ 1 ].xyz ) ) ) )', '1.0'),
    ('a wall\'s windows are a house\'s default whatever it is given', WIN, 'const { cell = WALL_CELL, shift, rows, rect = WALL_RECT, mode = NIGHT_MODE.house } = grid;', 'const { cell = WALL_CELL, shift, rows, rect = WALL_RECT, mode = NIGHT_MODE.house } = {} as WallGrid;'),
    ('a wall\'s glass is a decal\'s', WIN, 'rect = WALL_RECT, mode = NIGHT_MODE.house } = grid;', 'rect = DECAL_GLASS, mode = NIGHT_MODE.house } = grid;'),
    ('a wall\'s windows are lit as a curtain wall\'s', WIN, 'rect = WALL_RECT, mode = NIGHT_MODE.house } = grid;', 'rect = WALL_RECT, mode = NIGHT_MODE.curtain } = grid;'),
    ('a wall\'s tile is the cell over the tile', WIN, 'WALL_TILE: vec2([tile[0] / cell[0], tile[1] / cell[1]])', 'WALL_TILE: vec2([cell[0] / tile[0], cell[1] / tile[1]])'),
    ('a wall\'s tile is the tile\'s width twice', WIN, 'WALL_TILE: vec2([tile[0] / cell[0], tile[1] / cell[1]])', 'WALL_TILE: vec2([tile[0] / cell[0], tile[0] / cell[1]])'),
    ('a wall\'s grid is not shifted', WIN, '...(shift ? { WALL_SHIFT: vec2(shift) } : {})', '...({})'),
    ('a wall\'s windows are in every row', WIN, '...(rows ? { WALL_ROWS: vec2(rows) } : {})', '...({})'),
    ('a wall\'s windows are as bright as a curtain wall\'s', WIN, 'WIN_GAIN: glslFloat(NIGHT_GAIN.house), WIN_MODE: glslVec4(mode) };', 'WIN_GAIN: glslFloat(NIGHT_GAIN.curtain), WIN_MODE: glslVec4(mode) };'),
    ('a wall patched twice forgets its first patch', WIN, '    onBeforeCompile.call(m, shader, renderer);\n', ''),
    ('a wall\'s night is declared a second time', WIN, "${declared ? '' : '\\nuniform float uWinNight;'}${WIN_NIGHT_GLSL}", "${'\\nuniform float uWinNight;'}${WIN_NIGHT_GLSL}"),
    ('a wall\'s night is not declared', WIN, "${declared ? '' : '\\nuniform float uWinNight;'}${WIN_NIGHT_GLSL}", '${WIN_NIGHT_GLSL}'),
    ('a wall\'s night is declared by what an earlier patch said', WIN, 'const declared = shader.uniforms.uWinNight !== undefined;', 'const declared = false;'),
    ('a wall\'s night is never in its uniforms', WIN, 'const declared = shader.uniforms.uWinNight !== undefined;\n    shader.uniforms.uWinNight = windowNight;', 'const declared = shader.uniforms.uWinNight !== undefined;'),
    ('a wall\'s program is the same as the plain wall\'s', WIN, 'm.customProgramCacheKey = () => `${key}+litWalls`;', 'm.customProgramCacheKey = () => key;'),
    ('a wall is not recompiled for its windows', WIN, '  m.needsUpdate = true;\n  return () => {', '  return () => {'),
    ('a wall keeps its windows when they are taken away', WIN, '    m.defines = defines;\n', ''),
    ('a wall keeps its patch when the windows are taken away', WIN, '    m.onBeforeCompile = onBeforeCompile;\n', ''),
    ('a wall keeps its program key when the windows are taken away', WIN, '    m.customProgramCacheKey = () => key;\n    m.needsUpdate = true;\n  };', '    m.needsUpdate = true;\n  };'),
    ('a wall is not recompiled when the windows are taken away', WIN, '    m.customProgramCacheKey = () => key;\n    m.needsUpdate = true;\n  };', '    m.customProgramCacheKey = () => key;\n  };'),
    # ---- the uniform's declaration is found by the uniforms' sign, not by a search of the text (the build squeezes three's text: tools/tests/three-squeeze*.test.ts)
    ('a wall\'s night is declared where a search of the text finds it', Where(MATERIALS, 'hooks'), 'const declared = shader.uniforms.uWinNight !== undefined;', "const declared = shader.fragmentShader.includes('uniform float uWinNight');"),
    ('a flooded wall\'s night is declared where a search of the text finds it', Where(LIGHTING, 'hooks'), 'const declared = shader.uniforms.uWinNight !== undefined;', "const declared = shader.fragmentShader.includes('uniform float uWinNight');"),
    # three hooks anchored on three's own indentation (a tab in front of an include, which the build's squeeze takes away): each lands on the program as three wrote it and not on the squeezed one the page ships
    ('a lit pane\'s glow is anchored on three\'s indentation', HK, r"""'#include <map_fragment>', `#include <map_fragment>\nvec2 wSpan""", r"""'\t#include <map_fragment>', `\t#include <map_fragment>\nvec2 wSpan"""),
    ('a lit pane\'s vertex shader is anchored on three\'s indentation', HK, r"""'#include <begin_vertex>', '#include <begin_vertex>\nvWinUv = uv;'""", r"""'\t#include <begin_vertex>', '\t#include <begin_vertex>\nvWinUv = uv;'"""),
    ('a facade\'s lit windows are anchored on three\'s indentation', HK, r"""'#include <map_fragment>', `#include <map_fragment>\n${by === 'quad' ? GLASS_BY_QUAD_GLSL""", r"""'\t#include <map_fragment>', `\t#include <map_fragment>\n${by === 'quad' ? GLASS_BY_QUAD_GLSL"""),
    # ---- the floodlight's define and the facades' glass
    ('a floodlit wall loses its other defines', WIN, 'm.defines = { ...m.defines, FLOOD:', 'm.defines = { FLOOD:'),
    ('a floodlight\'s reach is its strength', WIN, 'FLOOD: `vec4( ${glslFloat(strength)}, ${glslFloat(reach)}, ${glslFloat(floor)}, ${glslFloat(base)} )`', 'FLOOD: `vec4( ${glslFloat(reach)}, ${glslFloat(strength)}, ${glslFloat(floor)}, ${glslFloat(base)} )`'),
    ('a floodlight is lit from the ground, not the wall\'s foot', WIN, '${glslFloat(floor)}, ${glslFloat(base)} )`', '${glslFloat(floor)}, 0.0 )`'),
    ('a floodlight leaves nothing high up', WIN, '${glslFloat(reach)}, ${glslFloat(floor)}, ${glslFloat(base)} )`', '${glslFloat(reach)}, 0.0, ${glslFloat(base)} )`'),
    ('the front\'s brick is not floodlit', Where(MATERIALS, 'windows', 'flood'), "brickFoot: () => floodLit(footShaded(tiled('brick'), FRONT_FOOT), ...FRONT_FLOOD.brick),", "brickFoot: () => footShaded(tiled('brick'), FRONT_FOOT),"),
    ('the front\'s stone is not floodlit', Where(MATERIALS, 'windows', 'flood'), "stoneFoot: () => floodLit(footShaded(tiled('stone'), FRONT_FOOT), ...FRONT_FLOOD.stone),", "stoneFoot: () => footShaded(tiled('stone'), FRONT_FOOT),"),
    ('a curtain wall\'s windows are lit as a house\'s', WIN, "'curtain', FACADE_GLASS.glass, NIGHT_MODE.curtain, NIGHT_GAIN.curtain);", "'curtain');"),
    ('a facade\'s windows are lit as a house\'s whatever it is', WIN, "'tile', FACADE_GLASS[key], key === 'shop' ? NIGHT_MODE.shop : NIGHT_MODE.house, key === 'shop' ? NIGHT_GAIN.shop : NIGHT_GAIN.house);", "'tile');"),
    ('a shopfront\'s windows are lit as a house\'s', WIN, "key === 'shop' ? NIGHT_MODE.shop : NIGHT_MODE.house, key === 'shop' ? NIGHT_GAIN.shop : NIGHT_GAIN.house);", 'NIGHT_MODE.house, NIGHT_GAIN.house);'),
    ('a facade\'s glass is another facade\'s', WIN, "'tile', FACADE_GLASS[key],", "'tile', FACADE_GLASS.stock,"),
]

# ------------------------------------------------------------------------------------------------ the facades' glass, from the numbers the painters draw it with (FACADE_GLASS, DECAL_GLASS)
MUTATIONS += [
    ('the decal\'s glass is a side too wide', WIN, 'const side = (WINDOW_SURROUND + WINDOW_INSET) / tw;', 'const side = (WINDOW_SURROUND + WINDOW_INSET) / th;'),
    ('the decal\'s glass has no reveal at its foot', WIN, '(0.6 * WINDOW_SURROUND + WINDOW_INSET) / th', '(WINDOW_INSET) / th'),
    ('the decal\'s glass reaches the top of its surround', WIN, '1 - (WINDOW_SURROUND + WINDOW_INSET) / th]', '1 - (WINDOW_INSET) / th]'),
    ('a window is not centred in its tile', WIN, '(w - p.ww) / 2 / w, (w + p.ww) / 2 / w', '(w - p.ww) / w, (w + p.ww) / 2 / w'),
    ('a window\'s right side is the tile\'s', WIN, '(w + p.ww) / 2 / w, p.sill / h', '(w + p.ww) / w, p.sill / h'),
    ('a window\'s sill is counted in the tile\'s width', WIN, 'p.sill / h, (p.sill + p.wh - rise / 2) / h', 'p.sill / w, (p.sill + p.wh - rise / 2) / h'),
    ('a window\'s head is the top of its arch', WIN, '(p.sill + p.wh - rise / 2) / h', '(p.sill + p.wh) / h'),
    ('a window\'s arch is not a share of its width', WIN, "const rise = key === 'red' ? p.ww * RED_RISE : 0;", 'const rise = 0;'),
    ('the curtain wall\'s glass starts at its mullion', WIN, "[CURTAIN_PANE.side / w, 1 - CURTAIN_PANE.side / w, CURTAIN_PANE.spandrel / h, 1 - CURTAIN_PANE.top / h]", "[0, 1, CURTAIN_PANE.spandrel / h, 1 - CURTAIN_PANE.top / h]"),
    ('the curtain wall\'s glass is over the spandrel of its width', WIN, 'CURTAIN_PANE.spandrel / h, 1 - CURTAIN_PANE.top / h]', 'CURTAIN_PANE.spandrel / w, 1 - CURTAIN_PANE.top / h]'),
    ('the curtain wall\'s glass reaches the transom', WIN, '1 - CURTAIN_PANE.top / h]', '1]'),
    ('the shopfront\'s glass is the riser\'s', WIN, 'SHOP_PANE.riser / h, 1 - SHOP_PANE.fascia / h]', 'SHOP_PANE.fascia / h, 1 - SHOP_PANE.riser / h]'),
    ('the shopfront\'s glass reaches the pilasters', WIN, '[SHOP_PANE.side / w, 1 - SHOP_PANE.side / w,', '[0, 1,'),
    ('the red painter\'s window is the stock\'s', WIN, 'const ww = PANE.red.ww;', 'const ww = PANE.stock.ww;'),
    ('the red painter\'s sill is its height', WIN, 'const yb = h - PANE.red.sill;', 'const yb = h - PANE.red.wh;'),
    ('the stone painter\'s sash is the stock\'s', WIN, 'citySash(g, w / 2, h, { ww: PANE.stone.ww, wh: PANE.stone.wh, sill: PANE.stone.sill,', 'citySash(g, w / 2, h, { ww: PANE.stone.ww, wh: PANE.stone.wh, sill: PANE.stock.sill,'),
    ('the panel painter\'s window is the stock\'s', WIN, 'const wh = PANE.panel.wh;', 'const wh = PANE.stock.wh;'),
    ('the curtain painter\'s glass starts at its mullion twice', WIN, 'g.fillRect(CURTAIN_PANE.side, CURTAIN_PANE.top, w - 2 * CURTAIN_PANE.side, h - CURTAIN_PANE.top - CURTAIN_PANE.spandrel);', 'g.fillRect(CURTAIN_PANE.side, CURTAIN_PANE.top, w - 4 * CURTAIN_PANE.side, h - CURTAIN_PANE.top - CURTAIN_PANE.spandrel);'),
    ('the shop painter\'s glass is the riser\'s', WIN, 'g.fillRect(side, fascia, w - 2 * side, h - fascia - riser);\n  g.fillStyle = \'#25292d\'; // frames and the door', 'g.fillRect(side, fascia, w - 2 * side, h - fascia);\n  g.fillStyle = \'#25292d\'; // frames and the door'),
    ('the window painter\'s surround is not the decal glass\'s', WIN, 'const sx = WINDOW_SURROUND * pxm; // surround thickness', 'const sx = 0.2 * pxm; // surround thickness'),
    ('the window painter\'s inset is not the decal glass\'s', WIN, 'const inset = WINDOW_INSET * pxm;', 'const inset = 0.1 * pxm;'),
]

# ------------------------------------------------------------------------------------------------ web/src/lighting.ts: the floodlight (FLOOD) and its share of the night
FL = Where(LIGHTING, 'flood', 'windows')
FLH = Where(LIGHTING, 'flood', 'windows', 'hooks')  # the floodlight's night, which the hooks test sees in the squeezed programs of the scene's floodlit walls
FLG = "totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.82, 0.5 ) * uWinNight * ${FLOOD}.x * mix( ${FLOOD}.z, 1.0, exp( -max( ( cameraPosition - vViewPosition * mat3( viewMatrix ) ).y - ${FLOOD}.w, 0.0 ) / ${FLOOD}.y ) );"
MUTATIONS += [
    ('a material with no floodlight reads the night', FL, 'const flooded = material.defines?.[FLOOD] !== undefined;', 'const flooded = true;'),
    ('a floodlit material does not read the night', FL, 'const flooded = material.defines?.[FLOOD] !== undefined;', 'const flooded = false;'),
    ('a floodlit wall is not given the night', FLH, '    if (flooded) shader.uniforms.uWinNight = windowNight;\n', ''),
    ('a floodlit wall\'s night is declared a second time', FLH, 'if (flooded && !declared) fragment', 'if (flooded) fragment'),
    ('a floodlit wall\'s night is not declared', FLH, "    if (flooded && !declared) fragment = fragment.replace('#include <common>', '#include <common>\\nuniform float uWinNight;');\n", ''),
    ('a floodlit wall\'s night is declared when an earlier patch has not', FL, 'const declared = shader.uniforms.uWinNight !== undefined;', 'const declared = true;'),
    ('a floodlit wall\'s night is declared when an earlier patch has', FL, 'const declared = shader.uniforms.uWinNight !== undefined;', 'const declared = false;'),
    ('the floodlight glows by day', FL, FLG, FLG.replace(' * uWinNight', '')),
    ('the floodlight is a flat warm', FL, FLG, FLG.replace('diffuseColor.rgb * ', '')),
    ('the floodlight is white', FL, FLG, FLG.replace('vec3( 1.0, 0.82, 0.5 )', 'vec3( 1.0 )')),
    ('the floodlight has no strength', FL, FLG, FLG.replace(' * ${FLOOD}.x', '')),
    ('the floodlight is brightest far above the lamps', FL, FLG, FLG.replace('mix( ${FLOOD}.z, 1.0, exp(', 'mix( 1.0, ${FLOOD}.z, exp(')),
    ('the floodlight ignores the wall\'s foot', FL, FLG, FLG.replace(' - ${FLOOD}.w, 0.0 )', ', 0.0 )')),
    ('the floodlight\'s reach is its strength', FL, FLG, FLG.replace('/ ${FLOOD}.y )', '/ ${FLOOD}.x )')),
    ('the floodlight falls with the camera\'s height, not the wall\'s', FL, FLG, FLG.replace('( cameraPosition - vViewPosition * mat3( viewMatrix ) ).y', 'cameraPosition.y')),
    ('the floodlight does not fall off', FL, FLG, FLG.replace('exp( -max(', 'exp( 0.0 * max(')),
    ('the floodlight is in the shader of every material', FL, '#ifdef ${FLOOD}\n  totalEmissiveRadiance +=', '#if 1\n  totalEmissiveRadiance +='),
]

# ------------------------------------------------------------------------------------------------ web/src/landmarks.ts: the Midland's windows
LM = Where(LANDMARKS, 'landmarks')
MUTATIONS += [
    ('a window\'s number ignores its height', LM, ' ^ Math.imul(h, 19349663)', ''),
    ('a window\'s number ignores how far along the wall it is in z', LM, ' ^ Math.imul(z, 83492791)', ''),
    ('a window\'s number is from the metre, not the tenth', LM, 'const [x, h, z] = [Math.round(p.at[0] * 10), Math.round(y * 10), Math.round(p.at[1] * 10)];', 'const [x, h, z] = [Math.round(p.at[0]), Math.round(y), Math.round(p.at[1])];'),
    ('a window\'s numbers are fewer than the pane\'s', LM, '>>> 0) % PANE_UV.numbers;', '>>> 0) % 16;'),
    ('a window\'s glass has no number', LM, '  const id = windowId(p, y);\n', '  const id = 0;\n'),
    ('a window\'s glass is across from its middle', LM, 'paneUv(id, 0.5 + along(q) / w,', 'paneUv(id, along(q) / w,'),
    ('a window\'s glass is up from the ground', LM, '(q[1] - y) / h));', 'q[1] / h));'),
    ('a framed window has no lit glass', LM, "addGlass(part(parts, 'pane'), p, y, w, h, head, 0.1);\n}", "addWindow(part(parts, 'pane'), p, y, w, h, head, 0.1);\n}"),
    ('a lancet has no lit glass', LM, "addGlass(pane, shift(p, (k - (n - 1) / 2) * (lw + sw)), y, lw, h - 0.9, 'pointed', 0.1);", "addWindow(pane, shift(p, (k - (n - 1) / 2) * (lw + sw)), y, lw, h - 0.9, 'pointed', 0.1);"),
    ('an arch has no lit glass', LM, "addGlass(part(parts, 'pane'), p, y, w, h, 'round', 0.1);", "addWindow(part(parts, 'pane'), p, y, w, h, 'round', 0.1);"),
    ('the clock tower\'s lantern has no lit glass', LM, "addGlass(part(parts, 'pane'), shift(f, dx), rT + 0.6, 0.9, lT - rT - 1.2, 'pointed', 0.05);", "addWindow(part(parts, 'pane'), shift(f, dx), rT + 0.6, 0.9, lT - rT - 1.2, 'pointed', 0.05);"),
    ('the Midland\'s panes are not lit', Where(LANDMARKS, 'landmarks', 'hooks'), "const pane = litPane(tint('pane', [0.05, 0.08, 0.125]));", "const pane = tint('pane', [0.05, 0.08, 0.125]);"),
    ('the Midland\'s brick is not floodlit', LM, 'const brickRed = floodLit(footShaded(tint(\'brickRed\', midlandBrick)), ...MIDLAND_FLOOD.brick);', "const brickRed = footShaded(tint('brickRed', midlandBrick));"),
    ('the Midland\'s stone is not floodlit', LM, "const stone = floodLit(footShaded(tint('stone', [1.25 * stoneGain, 1.3 * stoneGain, 1.43 * stoneGain])), ...MIDLAND_FLOOD.stone);", "const stone = footShaded(tint('stone', [1.25 * stoneGain, 1.3 * stoneGain, 1.43 * stoneGain]));"),
]

# ------------------------------------------------------------------------------------------------ web/src/night.ts: a layer that comes on with the platform lamps
NL = Where(NIGHT, 'night', 'atmosphere')
MUTATIONS += [
    ('the night lights\' level is not held to 0..1', NL, 'level = Math.min(1, Math.max(0, next));', 'level = next;'),
    ('an attached layer is never handed the level', NL, '      for (const layer of attached) layer.setLevel(level);\n', ''),
    ('an attached layer is not kept', NL, '      attached.push(layer);\n', ''),
    ('an attached layer is not handed the level at once', NL, '      layer.setLevel(level);\n      return () => {', '      return () => {'),
    ('an attached layer that lets go is still handed the level', NL, '        if (i >= 0) attached.splice(i, 1);\n', ''),
    ('the first layer cannot let go', NL, 'if (i >= 0) attached.splice(i, 1);', 'if (i > 0) attached.splice(i, 1);'),
    ('a layer that lets go takes the others with it', NL, 'if (i >= 0) attached.splice(i, 1);', 'if (i >= 0) attached.splice(i);'),
    ('the layers are kept when the lights are freed', NL, '      attached.length = 0;\n', ''),
]

# ------------------------------------------------------------------------------------------------ web/src/night.ts: the clock dials' glow (createDialLights)
DL = Where(NIGHT, 'dials')
MUTATIONS += [
    # ---- which discs get a glow
    ('a dial\'s face is looked for in the owner\'s own frame, not the world\'s', DL, 'owner.localToWorld(centre.set(...dial.centre));', 'centre.set(...dial.centre);'),
    ('a disc anywhere is a dial\'s face', DL, ' && face.getWorldPosition(at).distanceTo(centre) <= DIAL_REACH) faces.push(face);', ') faces.push(face);'),
    ('a dial\'s stone ring is lit', DL, " || face.geometry.type !== 'CircleGeometry') return;", ') return;'),
    ('an unlit disc at a dial is lit again', DL, '!(face.material as THREE.MeshLambertMaterial).isMeshLambertMaterial || ', ''),
    ('a face that has a glow is given another', DL, '!glows.has(face) && !faces.includes(face)', '!faces.includes(face)'),
    ('a scan counts every glow, not those it added', DL, '      return faces.length;\n', '      return glows.size;\n'),
    ('a new glow is left as it is made, not put to the level', DL, '      show();\n      return faces.length;\n', '      return faces.length;\n'),
    # ---- where a glow stands and what it is made of
    ('a glow is not in its face\'s place', DL, '        glow.position.copy(face.position);\n', ''),
    ('a glow is not turned like its face', DL, '        glow.quaternion.copy(face.quaternion);\n', ''),
    ('a glow is not the size of its face', DL, '        glow.scale.copy(face.scale);\n', ''),
    ('a glow is in its face\'s plane', DL, '        glow.translateZ(DIAL_LIFT);\n', ''),
    ('a glow is in the scene\'s root, not its face\'s frame', DL, 'face.parent?.add(glow);', 'root.add(glow);'),
    ('a glow is a flat disc, not the face\'s texture', DL, 'glowMaterial((face.material as THREE.MeshLambertMaterial).map)', 'glowMaterial(null)'),
    ('each glow has a material of its own', DL, 'let material = materials.get(map);', 'let material: THREE.MeshBasicMaterial | undefined;'),
    ('a glow is not added to the picture', DL, '{ map, transparent: true, blending: THREE.AdditiveBlending,', '{ map, transparent: true, blending: THREE.NormalBlending,'),
    ('a glow is not drawn with the transparent things', DL, '{ map, transparent: true,', '{ map, transparent: false,'),
    ('a glow writes depth', DL, 'depthWrite: false, fog: false, toneMapped: false,', 'depthWrite: true, fog: false, toneMapped: false,'),
    ('a glow is fogged', DL, 'depthWrite: false, fog: false, toneMapped: false,', 'depthWrite: false, fog: true, toneMapped: false,'),
    ('a glow is toned by the grade', DL, 'fog: false, toneMapped: false,', 'fog: false, toneMapped: true,'),
    # ---- how it follows the lamps
    ('a glow is shown by day', DL, 'for (const glow of glows.values()) glow.visible = level > 0.01;', 'for (const glow of glows.values()) glow.visible = true;'),
    ('a glow is as bright at every level', DL, 'material.color.setRGB(...DIAL_GLOW).multiplyScalar(level);', 'material.color.setRGB(...DIAL_GLOW);'),
    ('the dial lights\' level is not held to 0..1', DL, 'level = Math.max(0, Math.min(1, next));', 'level = next;'),
    # ---- giving it back
    ('the glows stay in the scene when the layer is freed', DL, '      for (const glow of glows.values()) glow.removeFromParent();\n', ''),
    ('the glows\' materials are kept when the layer is freed', DL, '      for (const material of materials.values()) material.dispose();\n', ''),
    ('the glows are still counted when the layer is freed', DL, '      glows.clear();\n', ''),
    # ---- the face itself is left alone (an emissive on it would be a stand-in the atmosphere keeps lit by day, a map or a new program would change what is drawn at noon), and the glow keeps its place among the
    # hands (the lift is held to the hands' own lifts by a test, not to a number: so these two move it off the relation, not off a value)
    ('a dial\'s face is made emissive at night', DL, 'for (const glow of glows.values()) glow.visible = level > 0.01;',
     'for (const [face, glow] of glows) { glow.visible = level > 0.01; (face.material as THREE.MeshLambertMaterial).emissive.setRGB(level, level, level); }'),
    ('a dial\'s face is given its own texture as an emissive map', DL, 'glows.set(face, glow);',
     'glows.set(face, glow);\n        (face.material as THREE.MeshLambertMaterial).emissiveMap = (face.material as THREE.MeshLambertMaterial).map;'),
    ('a dial\'s face is told to build its program again', DL, 'glows.set(face, glow);', 'glows.set(face, glow);\n        (face.material as THREE.Material).needsUpdate = true;'),
    ('a glow stands on its face, not off it', DL, 'export const DIAL_LIFT = 0.02;', 'export const DIAL_LIFT = 0;'),
    ('a glow stands over the clock\'s hands', DL, 'export const DIAL_LIFT = 0.02;', 'export const DIAL_LIFT = 0.05;'),
]

# ------------------------------------------------------------------------------------------------ core/city.ts and web/src/city.ts: where the lamps stand and how they are kept
CC = Where(CORECITY, 'city')
WC = Where(WEBCITY, 'lamps')
MUTATIONS += [
    ('a lamp stands on the carriageway\'s layer', CC, 'y: at(LAYER_LIFT.pavement) });', 'y: at(0) });'),
    ('a lamp stands on the centre line', CC, 'lampRuns.push({ id: r.id, cls: r.cls, half, line, y:', 'lampRuns.push({ id: r.id, cls: r.cls, half: 0, line, y:'),
    ('a road\'s lamps are another road\'s', CC, 'lampRuns.push({ id: r.id, cls: r.cls,', 'lampRuns.push({ id: 0, cls: r.cls,'),
    ('a lamp may stand in an excluded place', CC, 'blocked: (p) => inAny(p, exclude) || inBuilding(p) || carriage.nearest(p, 6) < 0.3', 'blocked: (p) => inBuilding(p) || carriage.nearest(p, 6) < 0.3'),
    ('a lamp may stand in a building', CC, 'blocked: (p) => inAny(p, exclude) || inBuilding(p) || carriage.nearest(p, 6) < 0.3', 'blocked: (p) => inAny(p, exclude) || carriage.nearest(p, 6) < 0.3'),
    ('a lamp may stand in the next road', CC, 'blocked: (p) => inAny(p, exclude) || inBuilding(p) || carriage.nearest(p, 6) < 0.3', 'blocked: (p) => inAny(p, exclude) || inBuilding(p)'),
    ('a lamp may stand at the edge of the next road', CC, 'carriage.nearest(p, 6) < 0.3', 'carriage.nearest(p, 6) < 0'),
    ('a pedestrian way is not a carriageway the lamps keep clear of', CC, "if (ROAD_STYLE[r.cls].surface !== 'asphalt' && r.cls !== 'pedestrian') continue;", "if (ROAD_STYLE[r.cls].surface !== 'asphalt') continue;"),
    ('a carriageway the lamps keep clear of is a line', CC, 'reach: roadWidth(r).width / 2 });\n  }\n  const lamps', 'reach: 0 });\n  }\n  const lamps'),
    ('no street is in the new quarter', CC, 'modern: inKxCentral,', 'modern: () => false,'),
    ('the city gives back no lamps', CC, 'return { meshes: acc, trees, lamps, stats };', 'return { meshes: acc, trees, lamps: [], stats };'),
    # the two guards cover for each other (a run is collected only when lamps are asked for, and the lamps are made only then): either one gone alone changes nothing, so both go together
    ('the city\'s lamps are built when it is told none', CC, [('const lamps = opts.lamps === false ? [] : lampSpots(', 'const lamps = lampSpots('), ('if (opts.lamps !== false) lampRuns.push(', 'lampRuns.push(')]),
    ('the page asks for no lamps', WC, 'lamps: opts.lamps !== false, rails:', 'lamps: false, rails:'),
    ('the page stands no masts', WC, ': [...built.lamps, ...forecourtMasts(data, (x, z) => opts.terrain?.heightAt(x, z) ?? GROUND_Y)];', ': [...built.lamps];'),
    ('the masts stand on the flat plane on the real ground', WC, '(x, z) => opts.terrain?.heightAt(x, z) ?? GROUND_Y', '() => GROUND_Y'),
    ('the masts stand at zero without a terrain', WC, 'opts.terrain?.heightAt(x, z) ?? GROUND_Y)', 'opts.terrain?.heightAt(x, z) ?? 0)'),
    ('the page lights the lamps it is told not to place', WC, 'const lamps = opts.lamps === false ? [] : [...built.lamps,', 'const lamps = [...built.lamps,'),
    ('a city with no lamps has a lamp layer', WC, 'const lights = lamps.length > 0 ? createStreetLights(lamps) : null;', 'const lights = createStreetLights(lamps);'),
    ('the city counts the lamps it was given, not the lamps it stands', WC, 'stats.lamps = lamps.length;', 'stats.lamps = built.lamps.length;'),
    ('the city\'s lamps are not added to the scene', WC, '    scene.add(lights.group);\n    detach', '    detach'),
    ('the lamps are not given the night', WC, '    detach = opts.night?.attach(lights);\n', ''),
    ('the lamps are still given the night when the city goes', WC, '        detach?.();\n', ''),
    ('the lamps are still in the scene when the city goes', WC, '        scene.remove(lights.group);\n', ''),
    ('the lamps are not freed when the city goes', WC, '        lights.dispose();\n', ''),
    ('the city does not give the lamps back', WC, '    group,\n    lights,\n    stats,', '    group,\n    stats,'),
]


# ------------------------------------------------------------------------------------------------ web/src/station-weather.ts: the Scottish night (the windows, the Balmoral's flood and dials, the lamps' life, the haze)
SW = Where(WEATHER, 'weather')
BW = "const material = (name: string): THREE.MeshLambertMaterial | null => {"
MUTATIONS += [
    # ---- lightWaverleyNight
    ('a mesh that is not a Lambert surface is patched', SW, '(mesh.material as THREE.MeshLambertMaterial).isMeshLambertMaterial ? mesh.material', 'true ? mesh.material'),
    ('the city\'s walls are not lit', SW, "  if (walls) undo.push(litWalls(walls, [1.2, 0.6])); // the sandstone's tile (materials.ts TEXTURES.stone)\n", ''),
    ('the city\'s walls are lit on the turned tile', SW, 'litWalls(walls, [1.2, 0.6])', 'litWalls(walls, [0.6, 1.2])'),
    ('the city\'s walls are another mesh\'s', SW, "material('waverley-building-walls')", "material('waverley-building-wall')"),
    ('the hotel\'s windows are the city\'s grid', SW, 'litWalls(hotel, BALMORAL_WINDOWS.tile, BALMORAL_WINDOWS.grid)', 'litWalls(hotel, BALMORAL_WINDOWS.tile)'),
    ('the hotel\'s windows are on the sandstone\'s tile', SW, 'litWalls(hotel, BALMORAL_WINDOWS.tile, BALMORAL_WINDOWS.grid)', 'litWalls(hotel, [1.2, 0.6], BALMORAL_WINDOWS.grid)'),
    ('the hotel\'s windows are not lit', SW, "  if (hotel) undo.push(litWalls(hotel, BALMORAL_WINDOWS.tile, BALMORAL_WINDOWS.grid));\n", ''),
    ('the hotel\'s facade is another mesh\'s', SW, "material('waverley-balmoral-facade')", "material('waverley-balmoral-facades')"),
    ('the hotel\'s tower is another mesh\'s', SW, "['waverley-balmoral-tower', 0.02]", "['waverley-balmoral-towers', 0.02]"),
    ('the hotel\'s body is lit from the ground', SW, 'flood(name, strength, 30, 0.5, new THREE.Box3().setFromObject(mesh).min.y);', 'flood(name, strength, 30, 0.5, 0);'),
    ('the hotel\'s body is lit from its top', SW, 'new THREE.Box3().setFromObject(mesh).min.y', 'new THREE.Box3().setFromObject(mesh).max.y'),
    ('the hotel\'s body is not floodlit', SW, '    if (mesh) flood(name, strength, 30, 0.5, new THREE.Box3().setFromObject(mesh).min.y);\n', ''),
    ('the hotel\'s body is lit from the dials\' level', SW, '    if (mesh) flood(name, strength,', '    if (!mesh) flood(name, strength,'),
    ('the dials do not glow', SW, "  flood('waverley-balmoral-clock-dials', 1.5, 1, 1); // a dial is lit all over: no fall-off\n", ''),
    ('a dial is brighter at its foot', SW, "flood('waverley-balmoral-clock-dials', 1.5, 1, 1);", "flood('waverley-balmoral-clock-dials', 1.5, 1, 0);"),
    ('the dials are another mesh\'s', SW, "flood('waverley-balmoral-clock-dials',", "flood('waverley-balmoral-clock-dial',"),
    ('the patches are put back first to last', SW, 'return () => [...undo].reverse().forEach((u) => u());', 'return () => undo.forEach((u) => u());'),
    ('the patches are not put back', SW, 'return () => [...undo].reverse().forEach((u) => u());', 'return () => undefined;'),
    ('a flooded material is put back with no defines', SW, 'const before = m.defines;', 'const before = {};'),
    ('a flooded material is not recompiled', SW, '    floodLit(m, ...numbers);\n    m.needsUpdate = true;\n', '    floodLit(m, ...numbers);\n'),
    ('a flooded material is not put back', SW, 'undo.push(() => { m.defines = before; m.needsUpdate = true; });', 'undo.push(() => { m.needsUpdate = true; });'),
    ('a flooded material is not recompiled when it is put back', SW, 'undo.push(() => { m.defines = before; m.needsUpdate = true; });', 'undo.push(() => { m.defines = before; });'),
    # ---- the Balmoral's windows are the facade texture's (tests/station-weather.test.ts holds them to waverley-frontage-balmoral.ts's own)
    ('the Balmoral\'s map is not a bay wide', SW, 'tile: [4.2, 43.5],', 'tile: [4.1, 43.5],'),
    ('the Balmoral\'s map is not the texture\'s tall', SW, 'tile: [4.2, 43.5],', 'tile: [4.2, 40.5],'),
    ('the Balmoral\'s storeys are not a bay and a storey', SW, 'cell: [4.2, 3.65],', 'cell: [4.2, 3.9],'),
    ('the Balmoral\'s windows are not on the texture\'s storeys', SW, 'shift: [0, -26.7 / 3.65],', 'shift: [0, -25.7 / 3.65],'),
    ('the Balmoral\'s lit windows are not the four storeys', SW, 'rows: [0, 4],', 'rows: [0, 5],'),
    ('the Balmoral\'s glass is not the texture\'s', SW, 'rect: [0.32, 0.68, 0.17, 0.77],', 'rect: [0.32, 0.68, 0.17, 0.97],'),
    # ---- the lamps' life
    ('a scene with no ground has lamps, and one with ground has none', SW, "if (typeof terrain?.heightAt === 'function') {", "if (typeof terrain?.heightAt !== 'function') {"),
    ('the lamps stand on a flat plane', SW, 'm.loadWaverleyLamps(heightAt)', 'm.loadWaverleyLamps(() => 0)'),
    ('a climate that has ended still takes its lamps', SW, '      if (gone) { made.dispose(); return; }\n', ''),
    ('a climate that has ended leaves its lamps allocated', SW, 'if (gone) { made.dispose(); return; }', 'if (gone) { return; }'),
    ('the Scottish lamps are not added to the scene', SW, '      view.scene.add(made.group);\n', ''),
    ('the lamps arrive dark whatever the sky is', SW, '      made.setLevel(level);\n', ''),
    ('the lamps are not kept', SW, '      layer = made;\n', ''),
    ('a lamp layer that cannot be made is not a warning', SW, ".catch((error: unknown) => console.warn('Waverley street lamps unavailable:', error));", '.catch(() => undefined);'),
    ('the lamps arrive at the level the sky had', SW, 'setLevel(next) { level = next; layer?.setLevel(next); },', 'setLevel(next) { layer?.setLevel(next); },'),
    ('the lamps are never handed the level', SW, 'setLevel(next) { level = next; layer?.setLevel(next); },', 'setLevel(next) { level = next; },'),
    ('a climate that has ended is not told so', SW, '      gone = true;\n', ''),
    ('the lamps stay in the scene when the climate ends', SW, '      layer?.group.removeFromParent();\n', ''),
    ('the lamps are not freed when the climate ends', SW, '      layer?.dispose();\n', ''),
    ('the climate does not light the night', SW, '  const night = lightWaverleyNight(scene);\n', '  const night = () => undefined;\n'),
    ('the climate does not make the lamps', SW, '  const lamps = waverleyLamps(view);\n', '  const lamps = { setLevel: (_: number) => undefined, dispose: () => undefined };\n'),
    ('the lamps are not given the sky\'s level', SW, '      if (sky) lamps.setLevel(sky.rig.lampLevel);\n', ''),
    ('the lamps follow the daylight', SW, 'if (sky) lamps.setLevel(sky.rig.lampLevel);', 'if (sky) lamps.setLevel(sky.rig.daylight);'),
    ('the lamps are given a level when there is no sky', SW, 'if (sky) lamps.setLevel(sky.rig.lampLevel);', 'lamps.setLevel(sky!.rig.lampLevel);'),
    ('the night is left patched when the climate ends', SW, '      night();\n', ''),
    ('the lamps are left when the climate ends', SW, '      lamps.dispose();\n', ''),
    # ---- the haze
    ('the Scottish climate has no haze', SW, 'location: view.geometry.origin, haze: WAVERLEY_HAZE, weather:', 'location: view.geometry.origin, weather:'),
]

# ------------------------------------------------------------------------------------------------ web/src/atmosphere.ts: the night the windows share, and the haze's far plane
AT = Where(ATMOSPHERE, 'atmosphere', 'weather')
MUTATIONS += [
    ('the windows are not lit by the lamps\' level', AT, '    windowNight.value = rig.lampLevel;\n', ''),
    ('the windows come on with the dark and not the lamps', AT, 'windowNight.value = rig.lampLevel;', 'windowNight.value = 1 - rig.daylight;'),
    ('the windows are lit all day', AT, 'windowNight.value = rig.lampLevel;', 'windowNight.value = Math.max(rig.lampLevel, 0.5);'),
    ('a scene with a haze has none', AT, 'if (!haze) return rangeFar;', 'if (!haze || true) return rangeFar;'),
    ('the haze is the far plane for all heights', AT, 'return Math.min(rangeFar, haze.far + (rangeFar - haze.far) * smoothstep(haze.fade[0], haze.fade[1], cameraY));', 'return Math.min(rangeFar, haze.far);'),
    ('the haze pushes out a thicker weather', AT, 'return Math.min(rangeFar, haze.far + (rangeFar - haze.far) * smoothstep(haze.fade[0], haze.fade[1], cameraY));', 'return haze.far + (rangeFar - haze.far) * smoothstep(haze.fade[0], haze.fade[1], cameraY);'),
    ('the haze gives back the wrong amount of the page\'s fog', AT, '(rangeFar - haze.far) * smoothstep(', '(haze.far - rangeFar) * smoothstep('),
    ('the haze fades the wrong way', AT, 'smoothstep(haze.fade[0], haze.fade[1], cameraY)', 'smoothstep(haze.fade[1], haze.fade[0], cameraY)'),
    ('the haze is the same at every height', AT, 'smoothstep(haze.fade[0], haze.fade[1], cameraY));', 'smoothstep(haze.fade[0], haze.fade[1], 0));'),
    ('the haze gives way in a step', AT, 'smoothstep(haze.fade[0], haze.fade[1], cameraY)', '(cameraY < haze.fade[1] ? 0 : 1)'),
    ('the haze ends at the first height', AT, 'smoothstep(haze.fade[0], haze.fade[1], cameraY)', 'smoothstep(haze.fade[0], haze.fade[0] + 1, cameraY)'),
    ('the atmosphere does not hand its haze to the fog', AT, 'scene.fog.far = fogFar(range.far, f.camera.position.y, haze);', 'scene.fog.far = fogFar(range.far, f.camera.position.y);'),
    ('the atmosphere reads the haze at the ground', AT, 'scene.fog.far = fogFar(range.far, f.camera.position.y, haze);', 'scene.fog.far = fogFar(range.far, 0, haze);'),
    ('the atmosphere\'s fog ignores the range', AT, 'scene.fog.far = fogFar(range.far, f.camera.position.y, haze);', 'scene.fog.far = fogFar(2600, f.camera.position.y, haze);'),
]

# the clock dials' glow, as the atmosphere wires it: made with the night lights, handed the lamps' level, looking for dials at every rescan, taken out with the atmosphere
AD = Where(ATMOSPHERE, 'dials')
MUTATIONS += [
    ('the dials\' glow is never handed the lamps\' level', AD, '  if (dialLights) nightLights?.attach(dialLights);\n', ''),
    ('the atmosphere never looks for dials', AD, '    dialLights?.scan(scene);\n', ''),
    ('a scene with no night lights has dial glows too', AD, 'const dialLights = nightLights ? createDialLights() : null;', 'const dialLights = createDialLights();'),
    ('the dials\' glow stays in the scene when the atmosphere ends', AD, '      dialLights?.dispose();\n', ''),
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
        for lane in where.lanes:
            if lane not in LANES:
                print(f'NO LANE {lane}: {label}')
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
with kxmut.workspace(src, scratch, 'night') as work:
    # one test file at a time: the machine is shared (the node test runner would otherwise start a process to a file)
    suite = kxmut.Suite(work, test_timeout_ms=30000, timeout=180, extra=('--test-concurrency=1',))
    names = set()
    lanes_used = {lane for _label, where, *_change in selected for lane in where.lanes}
    for lane in LANES.values():
        # the 'never failed' accounting is over every lane (a partial run takes only the lanes it needs, and skips the accounting)
        if not only or lane in [LANES[n] for n in lanes_used]:
            names |= suite.baseline(lane.files, lane.names).passed

    def judged(where):
        """Every lane of `where` on the mutated workspace: killed when any lane kills it (and then every test that failed counts as seen failing)."""
        verdicts = [suite.judge(LANES[lane].files, LANES[lane].names, strict='any')[0] for lane in where.lanes]
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
