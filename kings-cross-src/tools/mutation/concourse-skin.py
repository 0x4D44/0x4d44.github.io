"""Roof-skin mutations: soffit, cladding, glazing zones, rooflights, oculus and edge apron. Usage: concourse-skin.py SOURCE SCRATCH.
Mutates a private copy of SOURCE under SCRATCH (which must lie beneath a .scratch directory); each kill needs an assertion failure
from web/tests/concourse-skin.test.ts, not a load failure.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src, out = (Path(p).resolve() for p in sys.argv[1:])
if src == out or src.is_relative_to(out) or out.is_relative_to(src) or '.scratch' not in out.parts:
    raise SystemExit('SOURCE and output must be separate; output must be beneath a .scratch directory')
out.mkdir(parents=True, exist_ok=True)
work = out / 'work'
if work.exists():
    raise SystemExit('Choose a new SCRATCH directory; the retained mutation copy exists.')
shutil.copytree(src, work, ignore=shutil.ignore_patterns('node_modules', '.git', '.scratch', 'dist'))
(work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
target = work / 'web/src/concourse.ts'
original = target.read_text()
mutations = [
    ('no glazing round the funnel', 'export const FUNNEL_GLAZING_RADIUS = 21;', 'export const FUNNEL_GLAZING_RADIUS = 0;'),
    ('the glazing round the funnel as narrow as round 4\'s', 'export const FUNNEL_GLAZING_RADIUS = 21;', 'export const FUNNEL_GLAZING_RADIUS = 11;'),
    ('the glazing round the funnel nearly all the roof', 'export const FUNNEL_GLAZING_RADIUS = 21;', 'export const FUNNEL_GLAZING_RADIUS = 40;'),
    ('no glazed band at the outline', 'export const RIM_GLAZING_WIDTH = 2.4;', 'export const RIM_GLAZING_WIDTH = 0;'),
    ('the glazed band as wide as round 4\'s', 'export const RIM_GLAZING_WIDTH = 2.4;', 'export const RIM_GLAZING_WIDTH = 4.6;'),
    ('a wide glazed band', 'export const RIM_GLAZING_WIDTH = 2.4;', 'export const RIM_GLAZING_WIDTH = 14;'),
    ('every cell solid', ' || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);', ' || rim(x, z) < RIM_GLAZING_WIDTH) void i;'),
    ('every cell glazed', ' || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);', ' || rim(x, z) < RIM_GLAZING_WIDTH || true) glazed.add(i);'),
    ('a glazed cell in the field, outside both zones', ' || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);', ' || rim(x, z) < RIM_GLAZING_WIDTH || i % 97 === 0) glazed.add(i);'),
    ('the glazed field\'s edge a smooth ellipse (round 5)', 'FUNNEL_GLAZING_RADIUS + (i ** 3 % 17) * 0.4 - 3', 'FUNNEL_GLAZING_RADIUS'),
    ('the glazed field\'s edge ragged by half as much', 'FUNNEL_GLAZING_RADIUS + (i ** 3 % 17) * 0.4 - 3', 'FUNNEL_GLAZING_RADIUS + (i ** 3 % 17) * 0.2 - 1.5'),
    ('the glazed field\'s edge ragged well inside the funnel zone', 'FUNNEL_GLAZING_RADIUS + (i ** 3 % 17) * 0.4 - 3', 'FUNNEL_GLAZING_RADIUS + (i ** 3 % 17) * 0.4 - 6'),
    ('the glazed field\'s edge ragged well outside the funnel zone', 'FUNNEL_GLAZING_RADIUS + (i ** 3 % 17) * 0.4 - 3', 'FUNNEL_GLAZING_RADIUS + (i ** 3 % 17) * 0.4 + 1'),
    ('rooflights omitted', 'return ROOFLIGHT_AZIMUTHS.map(azimuth => {', 'return ([] as number[]).map(azimuth => {'),
    ('rooflight is a rhombus narrower across the slope than up it', 'export const ROOFLIGHT_HALF = { along: 4, across: 4.7 } as const;', 'export const ROOFLIGHT_HALF = { along: 4.7, across: 4 } as const;'),
    ('rooflights shrunk to slivers', 'export const ROOFLIGHT_HALF = { along: 4, across: 4.7 } as const;', 'export const ROOFLIGHT_HALF = { along: 1, across: 1.2 } as const;'),
    ('rooflights swollen to a quarter of the dome', 'export const ROOFLIGHT_HALF = { along: 4, across: 4.7 } as const;', 'export const ROOFLIGHT_HALF = { along: 12, across: 14 } as const;'),
    ('rooflights round the south of the dome, out of sight from the west', 'export const ROOFLIGHT_AZIMUTHS = [-26, -14, -2, 10] as const;', 'export const ROOFLIGHT_AZIMUTHS = [-26, -14, -2, 100] as const;'),
    ('rooflights half way out', 'export const ROOFLIGHT_RADIUS = 58;', 'export const ROOFLIGHT_RADIUS = 40;'),
    ('rooflight frame omitted', '    for (let j = 0; j < 4; j++) cladding.poly([outer[j]!,', '    for (let j = 0; j < 0; j++) cladding.poly([outer[j]!,'),
    ('rooflight glass omitted', 'cladding.poly(inner, undefined, { facing: UP, color: rgb(0x5b6978) });', 'void inner;'),
    ('rooflight glass pale as the cladding', '{ facing: UP, color: rgb(0x5b6978) }', '{ facing: UP, color: rgb(0xc2c7cc) }'),
    ('rooflight glass the pale slate of round 6', '{ facing: UP, color: rgb(0x5b6978) }', '{ facing: UP, color: rgb(0x6a7f99) }'),
    ('rooflight glass a dark slot again (round 5)', '{ facing: UP, color: rgb(0x5b6978) }', '{ facing: UP, color: rgb(0x405468) }'),
    ('rooflight frame dark as the glass', '{ normal: UP, color: scaled(CLADDING_TONE, 1.2) }', '{ normal: UP, color: rgb(0x405468) }'),
    ('rooflight frame a white band again', '{ normal: UP, color: scaled(CLADDING_TONE, 1.2) }', '{ normal: UP, color: rgb(0xeef1f4) }'),
    ('rooflight frame darker than the dome, as round 6\'s', '{ normal: UP, color: scaled(CLADDING_TONE, 1.2) }', '{ normal: UP, color: scaled(CLADDING_TONE, 0.6) }'),
    ('rooflight frame lit by the slope it rises on, a bar catching the sun', '{ normal: UP, color: scaled(CLADDING_TONE, 1.2) }', '{ facing: UP, color: scaled(CLADDING_TONE, 1.2) }'),
    ('rooflight frame a hairline', 'export const ROOFLIGHT_FRAME = 0.12;', 'export const ROOFLIGHT_FRAME = 0.01;'),
    ('rooflight frame as thin as round 5\'s', 'export const ROOFLIGHT_FRAME = 0.12;', 'export const ROOFLIGHT_FRAME = 0.08;'),
    ('rooflight frame most of the rhombus', 'export const ROOFLIGHT_FRAME = 0.12;', 'export const ROOFLIGHT_FRAME = 0.5;'),
    ('rooflight kerb buried in the pillows', 'export const ROOFLIGHT_KERB = [0.7, 0.95] as const;', 'export const ROOFLIGHT_KERB = [0.3, 0.7] as const;'),
    ('rooflight kerb stands a chimney high', 'export const ROOFLIGHT_KERB = [0.7, 0.95] as const;', 'export const ROOFLIGHT_KERB = [0.7, 3.5] as const;'),
    ('rooflight floats off the roof', 'export const ROOFLIGHT_KERB = [0.7, 0.95] as const;', 'export const ROOFLIGHT_KERB = [2.5, 2.9] as const;'),
    ('rooflight on a roof without the outline drawn in', '(canopy.radius * r) / (r + rim(x, z))); }; // the nodes', 'r); }; // the nodes'),
    ('rooflight corner stands a metre proud', 'return [px, surface(px, pz) + lift, pz];', 'return [px, surface(px, pz) + lift + (s === 1 ? 1 : 0), pz];'),
    ('rooflight frame faces down', 'for (let j = 0; j < 4; j++) cladding.poly([outer[j]!, outer[(j + 1) % 4]!, inner[(j + 1) % 4]!, inner[j]!], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], { normal: UP,', 'for (let j = 0; j < 4; j++) cladding.poly([outer[j]!, outer[(j + 1) % 4]!, inner[(j + 1) % 4]!, inner[j]!], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], { normal: [0, -1, 0],'),
    ('the coffers pale as the members again', 'SOFFIT_TONE = rgb(0x888d94)', 'SOFFIT_TONE = rgb(0xdadee2)'),
    ('the coffers as light as round 5\'s', 'SOFFIT_TONE = rgb(0x888d94)', 'SOFFIT_TONE = rgb(0xaeb3b9)'),
    ('the coffers black', 'SOFFIT_TONE = rgb(0x888d94)', 'SOFFIT_TONE = rgb(0x303236)'),
    ('the coffers no darker at the rim than at the funnel', '(1 - 0.2 * outer)', '(1 - 0 * outer)'),
    ('the coffers dimmed toward the rim as round 5 dimmed them', '(1 - 0.2 * outer)', '(1 - 0.1 * outer)'),
    ('the soffit as shallow in the lattice as round 5\'s', 'export const SOFFIT_LIFT = 0.2;', 'export const SOFFIT_LIFT = 0.12;'),
    ('the glazing dull', 'PANE: Rgb = [0.78, 0.89, 1];', 'PANE: Rgb = [0.45, 0.55, 0.65];'),
    ('the members tinted dark', "member: new THREE.MeshLambertMaterial({ color: 0xf4f6f8,", "member: new THREE.MeshLambertMaterial({ color: 0x707478,"),
    ('the brim a white band again', 'const FASCIA_TONE = rgb(0xa5aeb1);', 'const FASCIA_TONE = rgb(0xdfe3e7);'),
    ('the brim black', 'const FASCIA_TONE = rgb(0xa5aeb1);', 'const FASCIA_TONE = rgb(0x202428);'),
    ('panes seen from inside are grey, not sky blue', 'PANE: Rgb = [0.78, 0.89, 1];', 'PANE: Rgb = [1, 1, 1];'),
    ('soffit at the cladding level', 'soffit.poly([nodeAt(t[0], SOFFIT_LIFT), nodeAt(t[1], SOFFIT_LIFT), nodeAt(t[2], SOFFIT_LIFT)]', 'soffit.poly([nodeAt(t[0], SKIN_LIFT), nodeAt(t[1], SKIN_LIFT), nodeAt(t[2], SKIN_LIFT)]'),
    ('cladding diamonds omitted', 'cladding.poly([p, q, M], [up, uq, [0.5, 0.5]], { facing: UP, color });', 'void color;'),
    ('soffit only front-facing', "side: THREE.DoubleSide, name: 'concourse-soffit'", "side: THREE.FrontSide, name: 'concourse-soffit'"),
    ('soffit lit, so black from below', "soffit: new THREE.MeshBasicMaterial({ color: 0xffffff", "soffit: new THREE.MeshLambertMaterial({ color: 0xffffff"),
    ('members glow again, as round 6\'s did (the grade drew them one flat near-white)', "color: 0xf4f6f8, vertexColors: true, name: 'concourse-member'", "color: 0xf4f6f8, emissive: 0xa9aeb4, vertexColors: true, name: 'concourse-member'"),
    ('glass bright from above too', 'emissive: 0x16202b', 'emissive: 0xbdd2e6'),
    ('glass seen from above only', "side: THREE.BackSide, depthWrite: false, toneMapped: false, name: 'concourse-skylight'", "side: THREE.FrontSide, depthWrite: false, toneMapped: false, name: 'concourse-skylight'"),
    # round 7 (C2): the glass from below is out of the tone map and takes the sky's colour each frame
    ('the glass inside the tone map again, lifted to a pale haze', "depthWrite: false, toneMapped: false, name: 'concourse-skylight'", "depthWrite: false, name: 'concourse-skylight'"),
    ('the glass keeps its day colour at dusk and night', 'scene.fog && mat.skylight.color.copy(scene.fog.color)', 'scene.fog && mat.skylight.color.setScalar(1)'),
    ('the glass takes its colour from a fixed blue, not the sky', 'scene.fog && mat.skylight.color.copy(scene.fog.color)', 'scene.fog && mat.skylight.color.set(0x9fc4ef)'),
    ('the glass no longer follows the sky: the hook omitted', "addMesh(group, panes, mat.skylight, 'concourse-glass', 3).onBeforeRender = (_, scene) => scene.fog && mat.skylight.color.copy(scene.fog.color);", "addMesh(group, panes, mat.skylight, 'concourse-glass', 3);"),
    # the cladding's tone (the grade drew round 6's near-white, flat)
    ('the cladding near white again, as round 6\'s', 'CLADDING_TONE = rgb(0x92979f)', 'CLADDING_TONE = rgb(0xc2c7cc)'),
    ('the cladding a dark grey', 'CLADDING_TONE = rgb(0x92979f)', 'CLADDING_TONE = rgb(0x5a5d62)'),
    ('oculus omitted', 'for (let i = 0; i < crown.length; i++) {', 'for (let i = 0; i < 0; i++) {'),
    ('edge fascia omitted', '    standing.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]],', '    if (!rimEdges) standing.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]],'),
    ('edge fascia only as deep as the roof skin, a line (round 4)', 'export const FASCIA_BOTTOM = -0.4;', 'export const FASCIA_BOTTOM = 0;'),
    ('edge fascia hangs well below the wall top, into the glass', 'export const FASCIA_BOTTOM = -0.4;', 'export const FASCIA_BOTTOM = -0.8;'),
    ('edge fascia leans off the outline', '[t[0], t[1] + SKIN_LIFT, t[2]], [s[0], s[1] + SKIN_LIFT, s[2]]],', '[t[0] + 0.5, t[1] + SKIN_LIFT, t[2]], [s[0] + 0.5, s[1] + SKIN_LIFT, s[2]]],'),
    ('mullion posts as thick as a picket fence', 'export const MULLION = { post: 0.12, bar: 0.07, transom: 0.55 } as const;', 'export const MULLION = { post: 0.18, bar: 0.07, transom: 0.55 } as const;'),
    ('no intermediate posts along an edge', 'for (const k of [1 / 3, 2 / 3]) {', 'for (const k of [] as number[]) {'),
    ('no transom rail', '    mullions.box(foot, [slant, MULLION.bar, MULLION.bar]', '    if (!rimEdges) mullions.box(foot, [slant, MULLION.bar, MULLION.bar]'),
    ('wall glass nearly clear', "opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, name: 'concourse-wall'", "opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, name: 'concourse-wall'"),
    ('white mullions', 'color: 0x59606a, emissive: 0x23282e', 'color: 0xf7f9fb, emissive: 0xbcc1c7'),
    ('edge fascia faces inward', 'facing: [nx * (out ? 1 : -1), 0, nz * (out ? 1 : -1)]', 'facing: [-nx * (out ? 1 : -1), 0, -nz * (out ? 1 : -1)]'),
    ('wall on the outline, no brim over it', 'export const WALL_INSET = 3;', 'export const WALL_INSET = 0;'),
    ('wall six metres inside the outline', 'export const WALL_INSET = 3;', 'export const WALL_INSET = 6;'),
    ('wall tops stand clear under the brim', 'return [x, wa * height(a) + wb * height(b) + (1 - wa - wb) * height(c) + SKIN_LIFT, z];', 'return [x, wa * height(a) + wb * height(b) + (1 - wa - wb) * height(c) + SKIN_LIFT + 0.8, z];'),
    ('no closure glass at the Range cut', "add(closure, mat.skylight, 'concourse-closure', 3);", 'void closure;'),
    ('closure floats over the cornice', 'low = fin ? SILL : CORNICE_TOP;', 'low = fin ? SILL : CORNICE_TOP + 3;'),
    ('no gable closing the cut from the Range side', '      cladding.poly(quad, [[0, 0], [1, 0], [1, 1], [0, 1]], { facing: EAST,', '      if (!rimEdges) cladding.poly(quad, [[0, 0], [1, 0], [1, 1], [0, 1]], { facing: EAST,'),
    ('gable faces the concourse, not the Range side', '{ facing: EAST, color: scaled(CLADDING_TONE, 0.9 + 0.2 * tone()) }', '{ facing: [-EAST[0], 0, -EAST[2]], color: scaled(CLADDING_TONE, 0.9 + 0.2 * tone()) }'),
    ('gable stops half way up the cut', '      cladding.poly(quad, [[0, 0]', '      cladding.poly([quad[0]!, quad[1]!, [quad[1]![0], (quad[1]![1] + quad[2]![1]) / 2, quad[1]![2]], [quad[0]![0], (quad[0]![1] + quad[3]![1]) / 2, quad[0]![2]]], [[0, 0]'),
    ('the curtain wall omitted: the glass stops on the cornice all along', 'low = fin ? SILL : CORNICE_TOP;', 'low = CORNICE_TOP;'),
    ('the panes drawn down to the sill again, milky glass between the fins (round 5)', 'low = fin ? SILL : CORNICE_TOP;', 'low = SILL;'),
    ('the curtain wall over the brick centre too', 'fin = (mid < brickFrom || mid > brickTo) &&', 'fin = true &&'),
    ('the curtain wall hangs below the sill', 'low = fin ? SILL : CORNICE_TOP;', 'low = fin ? SILL - 1 : CORNICE_TOP;'),
    ('the wall is not cut at the brick centre\'s ends', 'const marks = [lo, hi, brickFrom, brickTo];', 'const marks = [lo, hi];'),
    ('no fins in the curtain wall', '{ facing: EAST, color: fin ? white : PANE }', '{ facing: EAST, color: PANE }'),
    ('fins off the half-bays', 'export const CURTAIN_PANE = WESTERN_RANGE.bay / 2;', 'export const CURTAIN_PANE = WESTERN_RANGE.bay / 2 + 0.2;'),
    ('fins a hand wide', 'export const CURTAIN_FIN = 0.1;', 'export const CURTAIN_FIN = 0.3;'),
    ('no upstands between solid and glazed cells', '    if (cells.length !== 2 || glazed.has(cells[0]!) === glazed.has(cells[1]!)) continue;', '    continue;'),
    ('upstands face the solid cell', '{ facing: [(A[0] + B[0]) / 2 - apex[0], 0, (A[2] + B[2]) / 2 - apex[2]], color: scaled(SOFFIT_TONE, 0.9) }', '{ facing: [apex[0] - (A[0] + B[0]) / 2, 0, apex[2] - (A[2] + B[2]) / 2], color: scaled(SOFFIT_TONE, 0.9) }'),
    ('upstands stop short of the skin', 'standing.poly([nodeAt(a, SOFFIT_LIFT), nodeAt(b, SOFFIT_LIFT), nodeAt(b, SKIN_LIFT), nodeAt(a, SKIN_LIFT)]', 'standing.poly([nodeAt(a, SOFFIT_LIFT), nodeAt(b, SOFFIT_LIFT), nodeAt(b, SOFFIT_LIFT + 0.05), nodeAt(a, SOFFIT_LIFT + 0.05)]'),
]

def run(name: str) -> subprocess.CompletedProcess[str]:
    try:
        result = kxmut.run_process(['node', '--test', '--test-reporter=tap', '--test-timeout=60000', 'web/tests/concourse-skin.test.ts'], cwd=work, timeout=120)
    except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap; the log keeps what it wrote
        (out / f'{name}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
        raise
    (out / f'{name}.log').write_text(result.stdout + result.stderr)
    return result

baseline = run('baseline')
if baseline.returncode:
    raise SystemExit('baseline skin tests failed; inspect baseline.log')
caught, invalid, survivors = [], [], []
for i, (label, old, new) in enumerate(mutations):
    if original.count(old) != 1:
        raise SystemExit(f'mutation anchor missing or ambiguous: {label}')
    target.write_text(original.replace(old, new, 1))
    try:
        result = run(f'm{i:02d}')
    except subprocess.TimeoutExpired as error:
        invalid.append(label)
        print(f'[INVALID] {label}: {kxmut.why(error)} (that is not a kill)', flush=True)
        continue
    finally:
        target.write_text(original)
    output = result.stdout + result.stderr
    if result.returncode and 'AssertionError' in output and not re.search(r'SyntaxError|TypeError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION', output):
        caught.append(label)
        failed = sorted(set(re.findall(r'^not ok \d+ - (.{0,60})', output, re.M)))
        print(f'[CAUGHT] {label}: {"; ".join(failed)}', flush=True)
    elif result.returncode:
        invalid.append(label)
        print(f'[INVALID] {label}: non-assertion failure', flush=True)
    else:
        survivors.append(label)
        print(f'[SURVIVED] {label}', flush=True)
print(f'{len(caught)}/{len(mutations)} caught; {len(invalid)} invalid; survivors: {survivors}')
raise SystemExit(bool(invalid or survivors))
