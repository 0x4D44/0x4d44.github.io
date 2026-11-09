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
    ('no glazing round the funnel', 'export const FUNNEL_GLAZING_RADIUS = 11;', 'export const FUNNEL_GLAZING_RADIUS = 0;'),
    ('no glazed band at the outline', 'export const RIM_GLAZING_WIDTH = 4.6;', 'export const RIM_GLAZING_WIDTH = 0;'),
    ('a wide glazed band', 'export const RIM_GLAZING_WIDTH = 4.6;', 'export const RIM_GLAZING_WIDTH = 14;'),
    ('every cell solid', ') < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);', ') < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH) void i;'),
    ('every cell glazed', ') < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);', ') < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH || true) glazed.add(i);'),
    ('a glazed cell in the field, outside both zones', ') < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);', ') < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH || i % 97 === 0) glazed.add(i);'),
    ('rooflights omitted', 'return ROOFLIGHT_AZIMUTHS.map(azimuth => {', 'return ([] as number[]).map(azimuth => {'),
    ('rooflight is a rhombus narrower across the slope than up it', 'export const ROOFLIGHT_HALF = { along: 4, across: 4.7 } as const;', 'export const ROOFLIGHT_HALF = { along: 4.7, across: 4 } as const;'),
    ('rooflights shrunk to slivers', 'export const ROOFLIGHT_HALF = { along: 4, across: 4.7 } as const;', 'export const ROOFLIGHT_HALF = { along: 1, across: 1.2 } as const;'),
    ('rooflights swollen to a quarter of the dome', 'export const ROOFLIGHT_HALF = { along: 4, across: 4.7 } as const;', 'export const ROOFLIGHT_HALF = { along: 12, across: 14 } as const;'),
    ('rooflights round the south of the dome, out of sight from the west', 'export const ROOFLIGHT_AZIMUTHS = [-26, -14, -2, 10] as const;', 'export const ROOFLIGHT_AZIMUTHS = [-26, -14, -2, 100] as const;'),
    ('rooflights half way out', 'export const ROOFLIGHT_RADIUS = 58;', 'export const ROOFLIGHT_RADIUS = 40;'),
    ('rooflight frame omitted', '    for (let j = 0; j < 4; j++) cladding.poly([outer[j]!,', '    for (let j = 0; j < 0; j++) cladding.poly([outer[j]!,'),
    ('rooflight glass omitted', 'cladding.poly(inner, undefined, { facing: UP, color: rgb(0x405468) });', 'void inner;'),
    ('rooflight glass pale as the cladding', '{ facing: UP, color: rgb(0x405468) }', '{ facing: UP, color: rgb(0xc2c7cc) }'),
    ('rooflight frame dark as the glass', '{ facing: UP, color: rgb(0xeef1f4) }', '{ facing: UP, color: rgb(0x405468) }'),
    ('rooflight frame a hairline', 'export const ROOFLIGHT_FRAME = 0.14;', 'export const ROOFLIGHT_FRAME = 0.01;'),
    ('rooflight frame most of the rhombus', 'export const ROOFLIGHT_FRAME = 0.14;', 'export const ROOFLIGHT_FRAME = 0.5;'),
    ('rooflight kerb buried in the pillows', 'export const ROOFLIGHT_KERB = [0.7, 1.1] as const;', 'export const ROOFLIGHT_KERB = [0.3, 0.7] as const;'),
    ('rooflight kerb stands a chimney high', 'export const ROOFLIGHT_KERB = [0.7, 1.1] as const;', 'export const ROOFLIGHT_KERB = [0.7, 3.5] as const;'),
    ('rooflight floats off the roof', 'export const ROOFLIGHT_KERB = [0.7, 1.1] as const;', 'export const ROOFLIGHT_KERB = [2.5, 2.9] as const;'),
    ('rooflight on a roof without the outline drawn in', '(canopy.radius * r) / (r + rim(x, z))); }; // the nodes', 'r); }; // the nodes'),
    ('rooflight corner stands a metre proud', 'return [px, surface(px, pz) + lift, pz];', 'return [px, surface(px, pz) + lift + (s === 1 ? 1 : 0), pz];'),
    ('rooflight frame faces down', 'for (let j = 0; j < 4; j++) cladding.poly([outer[j]!, outer[(j + 1) % 4]!, inner[(j + 1) % 4]!, inner[j]!], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], { facing: UP,', 'for (let j = 0; j < 4; j++) cladding.poly([outer[j]!, outer[(j + 1) % 4]!, inner[(j + 1) % 4]!, inner[j]!], [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], { facing: [0, -1, 0],'),
    ('panes seen from inside are grey, not sky blue', 'return [k * 0.68, k * 0.82, k]; }', 'return [k, k, k]; }'),
    ('soffit at the cladding level', 'soffit.poly([nodeAt(t[0], SOFFIT_LIFT), nodeAt(t[1], SOFFIT_LIFT), nodeAt(t[2], SOFFIT_LIFT)]', 'soffit.poly([nodeAt(t[0], SKIN_LIFT), nodeAt(t[1], SKIN_LIFT), nodeAt(t[2], SKIN_LIFT)]'),
    ('cladding diamonds omitted', 'cladding.poly([p, q, M], [up, uq, [0.5, 0.5]], { facing: UP, color });', 'void color;'),
    ('soffit only front-facing', "side: THREE.DoubleSide, name: 'concourse-soffit'", "side: THREE.FrontSide, name: 'concourse-soffit'"),
    ('soffit lit, so black from below', "soffit: new THREE.MeshBasicMaterial({ map: pillowTexture('triangle', 0.5)", "soffit: new THREE.MeshLambertMaterial({ map: pillowTexture('triangle', 0.5)"),
    ('members unlit-dark underside', 'emissive: 0xbcc1c7, name:', 'emissive: 0x101214, name:'),
    ('glass bright from above too', 'emissive: 0x16202b', 'emissive: 0xbdd2e6'),
    ('glass seen from above only', "side: THREE.BackSide, depthWrite: false, name: 'concourse-skylight'", "side: THREE.FrontSide, depthWrite: false, name: 'concourse-skylight'"),
    ('oculus omitted', 'for (let i = 0; i < crown.length; i++) {', 'for (let i = 0; i < 0; i++) {'),
    ('edge fascia omitted', '    standing.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]],', '    if (!rimEdges) standing.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]],'),
    ('edge fascia hangs below the wall top', 'export const FASCIA_BOTTOM = 0;', 'export const FASCIA_BOTTOM = -0.2;'),
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
    ('closure floats over the cornice', 'a: V3 = [A[0], Math.min(CORNICE_TOP, A[1]), A[2]]', 'a: V3 = [A[0], Math.min(CORNICE_TOP + 3, A[1]), A[2]]'),
    ('no gable closing the cut from the Range side', '    cladding.poly([a, b, B, A], [[0, 0], [1, 0], [1, 1], [0, 1]], { facing: EAST,', '    if (!rimEdges) cladding.poly([a, b, B, A], [[0, 0], [1, 0], [1, 1], [0, 1]], { facing: EAST,'),
    ('gable faces the concourse, not the Range side', '{ facing: EAST, color: scaled(CLADDING_TONE, 0.9 + 0.2 * tone()) }', '{ facing: [-EAST[0], 0, -EAST[2]], color: scaled(CLADDING_TONE, 0.9 + 0.2 * tone()) }'),
    ('gable stops half way up the cut', '    cladding.poly([a, b, B, A], [[0, 0]', '    cladding.poly([a, b, [b[0], (b[1] + B[1]) / 2, b[2]], [a[0], (a[1] + A[1]) / 2, a[2]]], [[0, 0]'),
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
