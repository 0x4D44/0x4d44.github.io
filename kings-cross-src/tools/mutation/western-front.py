"""F7 actual geometry mutations. Usage: western-front.py SOURCE SCRATCH [PRE_FIX_SOURCE].
All runs use copies inside SCRATCH, never the source tree or original tracked source.

Two test files are driven: western-front.test.ts (the passages, headers and shops; the tall openings, dressings and quoins of the concourse face) and the Range's
own test in shed.test.ts (bays, brick centre, windows, meshes). A mutation is caught only when its named test fails by assertion.
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

src, out = (Path(s).resolve() for s in sys.argv[1:3])
if out == src or out.is_relative_to(src) or src.is_relative_to(out):
    raise SystemExit('output must be separate from source')
out.mkdir(parents=True, exist_ok=True)
FRONT, SHED = 'web/tests/western-front.test.ts', 'web/tests/shed.test.ts'
titles = [
    (FRONT, 'five southern bays give broad actual passages through Range and shed flank'),
    (FRONT, 'the five gateline plinth cuts reach ground while adjoining lower walls remain solid'),
    (FRONT, 'gateline bays retain full-depth headers and internal Y supports under the upper floors'),
    (FRONT, 'adjoining public frontage is recessed and glazed with upper sash floors and northern frontage retained'),
    (FRONT, 'ground floor: a tall round-headed opening under each window and in every bay north of the brick centre, a dark pane under a stone ring and key, the plinth broken at each'),
    (FRONT, 'brick centre: six first-floor windows dressed in stone, a round-headed light at each end and a three-light window with mullions, a sill and a hood with a shallow pediment between; the top storey is plain, and so is all beside the centre above its openings'),
    (FRONT, "brick centre: a stone quoin at each end from the openings' heads up, the second course and the cornice over its length only, the first course the whole length"),
    (SHED, 'buildWesternRange: three storeys of brick west of the shed wall, between its OSM limits'),
]
mutations = [
    ('missing fifth bay', 'Array.from({ length: 5 }', 'Array.from({ length: 4 }', 0),
    ('narrow passages', '[v - 3.3, v + 3.3]', '[v - 2, v + 2]', 0),
    ('shed flank occludes passages', 'outward < 0 ? westernCuts() : []', '[]', 0),
    ('plinth closes passages', 'GROUND_Y + 1, [...westernCuts(true), ...arches', 'GROUND_Y + 1, [...arches', 1),
    ('support stems omitted', '[0.7, 2.5 - GROUND_Y, 0.7]', '[0.7, 0.01, 0.7]', 2),
    ('flared support heads omitted', 'for (const side of [-1, 1]) stone.box', 'for (const side of []) stone.box', 2),
    ('public glazing omitted', "mesh(panes.build(), material('pane'), 'range-public-glazing')", "mesh(new Batch().build(), material('pane'), 'range-public-glazing')", 3),
    ('shop backing mass hollowed', '[depth - 0.65, WESTERN_HEAD - GROUND_Y, 2.8]', '[0.01, 0.01, 0.01]', 3),
    ('upper floors removed', 'v0, v1, eaves, westernCuts(true)', 'v0, v1, 3.6, westernCuts(true)', 3),
    # the tall openings (the ground floor's, and the arched lights at the ends of the first floor, which share the helper)
    ('plinth runs across the openings', ', ...arches.map((v): [number, number] => [v - half - ring, v + half + ring])]', ']', 4),
    ('square-headed openings', 'y1 + r * Math.sin((k * Math.PI) / 8)', 'y1 + r', 4),
    ('no key at the crown', 'stone.box([x0 - 0.1, y1 + half + 0.15, -v], [0.2, 0.3, 0.3]);', '', 4),
    ('opening panes omitted', 'west(panes, head(-v, half, pane, y0, y1));', '', 4),
    ('no stone ring round the openings', 'for (let k = 0; k + 1 < inner.length; k++) west(stone, [inner[k]!, inner[k + 1]!, outer[k + 1]!, outer[k]!]);', '', 4),
    ('openings narrower', 'export const WESTERN_ARCH = { half: 1,', 'export const WESTERN_ARCH = { half: 0.8,', 4),
    ('openings only to the springing', 'export const WESTERN_ARCH = { half: 1, spring: 3,', 'export const WESTERN_ARCH = { half: 1, spring: 2,', 4),
    ('an opening in every bay of the brick centre too', '...westernBays().filter(v => v < a || v > b), ...westernWindows()', '...westernBays(), ...westernWindows()', 4),
    ('no opening under the windows', '...westernBays().filter(v => v < a || v > b), ...westernWindows()', '...westernBays().filter(v => v < a || v > b)', 4),
    # the first floor's windows: an arched light at each end, a three-light window between
    ('the end windows three-light too', 'if (i % 5 === 0) {', 'if (i < 0) {', 5),
    ('the end windows cut off square', 'arch(v, 4.75, 6.75);', 'arch(v, 4.75, 4.75);', 5),
    ('the end windows dressed as the rest', 'arch(v, 4.75, 6.75);\n      return;', 'arch(v, 4.75, 6.75);', 5),
    ('mullions omitted', 'for (const k of [-1.8, -0.6, 0.6, 1.8]) stone.box([x0 - 0.06, 6.15, z + k], [0.12, 2.8, 0.2]);', '', 5),
    ('only the outer mullions', 'for (const k of [-1.8, -0.6, 0.6, 1.8]) stone.box', 'for (const k of [-1.8, 1.8]) stone.box', 5),
    ('mullions short', '[0.12, 2.8, 0.2]', '[0.12, 2.0, 0.2]', 5),
    ('one light only', "for (const k of [-1.2, 0, 1.2]) windowQuad(win, [x0 - 0.02, 4.75, z + k], '-x', 1, 2.8);", "for (const k of [0]) windowQuad(win, [x0 - 0.02, 4.75, z + k], '-x', 1, 2.8);", 5),
    ('sills omitted', 'for (const [y, h] of [[4.69, 0.12], [7.65, 0.2]] as const)', 'for (const [y, h] of [[7.65, 0.2]] as const)', 5),
    ('hoods omitted', 'for (const [y, h] of [[4.69, 0.12], [7.65, 0.2]] as const)', 'for (const [y, h] of [[4.69, 0.12]] as const)', 5),
    ('sills and hoods narrow', 'stone.box([x0 - 0.1, y, z], [0.2, h, 4]);', 'stone.box([x0 - 0.1, y, z], [0.2, h, 2]);', 5),
    ('pediments omitted', 'west(stone, [-1, -0.5, 0, 0.5, 1].map((k): V3 => [x0 - 0.14, 7.75 + 0.28 * (1 - k * k), z + 2 * k]));', '', 5),
    ('pediments flat', '7.75 + 0.28 * (1 - k * k)', '7.75 + 0 * k', 5),
    ('pediments narrow', 'z + 2 * k]));', 'z + k]));', 5),
    ('the top storey dressed too', "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.9, 2.9);", "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.9, 2.9); stone.box([x0 - 0.1, 11.9, z], [0.2, 0.2, 2]);", 5),
    ('top storey sashes as small as a bay\'s', "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.9, 2.9);", "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.4, 2.6);", 5),
    # the quoins and the courses
    ('quoins omitted', 'for (const v of [b0, b1]) stone.box([x0 - 0.05, (WESTERN_HEAD + eaves) / 2, -v], [0.3, eaves - WESTERN_HEAD, 0.8]);', '', 6),
    ('quoins down over the shop', '(WESTERN_HEAD + eaves) / 2, -v], [0.3, eaves - WESTERN_HEAD, 0.8]', 'eaves / 2, -v], [0.3, eaves, 0.8]', 6),
    ('second course along the flanks', '[2 * storey, 0.3, 0.3, b0, b1]', '[2 * storey, 0.3, 0.3, v0, v1]', 6),
    ('cornice along the flanks', '[eaves + 0.25, 0.9, 0.5, b0, b1]', '[eaves + 0.25, 0.9, 0.5, v0, v1]', 6),
    ('first course over the brick centre only', '[storey, 0.3, 0.3, v0, v1]', '[storey, 0.3, 0.3, b0, b1]', 6),
    # the Range's own test: bays, brick centre, windows, meshes
    ('no top-storey window on the east face', "for (const v of westernBays()) windowQuad(win, [x1 + 0.02, 9.1, -v], '+x');", '', 7),
    ('windows on the ground floor too', "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.9, 2.9);", "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.9, 2.9); windowQuad(win, [x0 - 0.02, 1.4, z], '-x');", 7),
    ('one storey of windows in the brick centre', "for (const k of [-1.2, 0, 1.2]) windowQuad(win, [x0 - 0.02, 4.75, z + k], '-x', 1, 2.8);", '', 7),
    ('top storey sashes narrower', "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.9, 2.9);", "windowQuad(win, [x0 - 0.02, 8.95, z], '-x', 1.4, 2.9);", 7),
    ('the bays not centred in the length', 'v0 + (v1 - v0 - n * bay) / 2 + (i + 0.5) * bay', 'v0 + (i + 0.5) * bay', 7),
    ('a brick centre of eight bays', 'centre: 72.85, block: 17, windows: 6 }', 'centre: 72.85, block: 14, windows: 6 }', 7),
    ('the brick centre off the funnel by 8 m', 'centre: 72.85,', 'centre: 80.85,', 7),
    ('seven windows', 'centre: 72.85, block: 17, windows: 6 }', 'centre: 72.85, block: 17, windows: 7 }', 7),
    ('four windows', 'centre: 72.85, block: 17, windows: 6 }', 'centre: 72.85, block: 17, windows: 4 }', 7),
    ('windows not centred on their sixths', 'a + ((i + 0.5) * (b - a)) / n', 'a + (i * (b - a)) / n', 7),
    ('windows all along the Range', 'const [a, b] = westernBlock(), n = WESTERN_RANGE.windows;', 'const a = WESTERN_RANGE.v0, b = WESTERN_RANGE.v1, n = WESTERN_RANGE.windows;', 7),
    ('an opening where a shop is', 'v + 0.7 > lo && v - 0.7 < hi', 'v + 0.7 > lo + 1 && v - 0.7 < hi - 1', 7),
    ('a mesh for the arched windows again', "g.add(mesh(win.build(), material('sash'), 'range-windows'));", "g.add(mesh(win.build(), material('sash'), 'range-windows'));\n  g.add(mesh(new Batch().build(), material('sashArch'), 'range-windows-arched'));", 7),
]


def run(work, file):
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', file], cwd=work, timeout=90)


def copy(source, work):
    for name in ('core', 'web'):
        shutil.copytree(source / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    for file in (FRONT, SHED):
        shutil.copy2(src / file, work / file)
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)


def failed_assertions(result):
    return set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M)) if 'AssertionError' in result.stdout and not re.search(r'(ERR_MODULE_NOT_FOUND|SyntaxError|TypeError)', result.stdout + result.stderr) else set()


with tempfile.TemporaryDirectory(prefix='western-front-', dir=out) as tmp:
    work = Path(tmp) / 'current'
    copy(src, work)
    for file in (FRONT, SHED):
        baseline = run(work, file)
        (out / f'baseline-{Path(file).stem}.log').write_text(baseline.stdout + baseline.stderr)
        passed = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
        if baseline.returncode or not {t for f, t in titles if f == file} <= passed:
            raise SystemExit(f'{file}: the baseline must pass and include every named test: ' + baseline.stdout + baseline.stderr)
    if len(sys.argv) > 3:
        old = Path(tmp) / 'pre-fix'
        copy(Path(sys.argv[3]).resolve(), old)
        red = run(old, FRONT)
        (out / 'pre-fix-red.log').write_text(red.stdout + red.stderr)
        if not {t for f, t in titles[:4]} <= failed_assertions(red):
            raise SystemExit('the first four tests must assertion-fail on pre-fix geometry: ' + red.stdout + red.stderr)
        print('[RED] the first four tests assertion-fail on pre-fix geometry', flush=True)
    file = work / 'web/src/shed.ts'
    original = file.read_text()
    survivors = []
    for i, (label, old, new, which) in enumerate(mutations, 1):
        if original.count(old) != 1:
            raise SystemExit(f'nonunique mutation anchor: {label}: {original.count(old)}')
        file.write_text(original.replace(old, new, 1))
        try:
            result = run(work, titles[which][0])
        except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap: not a kill
            file.write_text(original)
            (out / f'mutation-{i}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
            survivors.append(label)
            print(f'[SURVIVED] {label} ({kxmut.why(error)}; that is not a kill)', flush=True)
            continue
        file.write_text(original)
        (out / f'mutation-{i}.log').write_text(result.stdout + result.stderr)
        if result.returncode and titles[which][1] in failed_assertions(result):
            print(f'[CAUGHT] {label} -> {titles[which][1][:70]}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED] {label}', flush=True)
    print(f'{len(mutations) - len(survivors)}/{len(mutations)} caught; survivors: {survivors}', flush=True)
    raise SystemExit(1 if survivors else 0)
