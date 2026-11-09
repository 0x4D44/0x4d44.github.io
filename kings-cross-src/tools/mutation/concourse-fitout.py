"""Fit-out and floor mutations: ticket blocks, totems, boards, plates, gate cabinets, shopfronts, lettering, the floor's tone.
Usage: concourse-fitout.py SOURCE SCRATCH. Mutates a private copy of SOURCE under SCRATCH (which must lie beneath a .scratch
directory); each kill needs an assertion failure from web/tests/concourse-fitout.test.ts, not a load failure.
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
BOARD = 'board: { length: 16.8, height: 2.6, bottom: 5, standoff: 0.3, depth: 0.12, panels: 10, bar: 0.1 }'
TOTEMS = 'totems: [[-30, -15], [-30, 15], [-24, -26]]'
mutations = [
    ('ticket block beside the funnel feet', 'clusters: [[-23.5, -12], [-23.5, 12]]', 'clusters: [[-19.5, -2], [-23.5, 12]]'),
    ('totem against the Range', TOTEMS, 'totems: [[-30, -15], [-30, 15], [-13, -30]]'),
    ('totem beyond the concourse', TOTEMS, 'totems: [[-30, -15], [-30, 15], [-24, -80]]'),
    ('board inside the brickwork', BOARD, BOARD.replace('standoff: 0.3', 'standoff: -0.3')),
    ('board low enough to meet the plates', BOARD, BOARD.replace('bottom: 5,', 'bottom: 3.7,')),
    ('boards hung low, under the first-floor sills', BOARD, BOARD.replace('bottom: 5,', 'bottom: 4.5,')),
    ('boards a strip again, as in round 2', BOARD, BOARD.replace('height: 2.6', 'height: 1.05')),
    ('boards of two broad panels', BOARD, BOARD.replace('panels: 10', 'panels: 2')),
    ('ticket machines shorter than a person plus a head', 'cluster: { size: 1.78, height: 2.2 }', 'cluster: { size: 1.78, height: 1.8 }'),
    ('ticket machines with white cowls', 'part(mu, 1.55, mv, cowl[0]!, cluster.height - 1.55, cowl[1]!, RED);', 'part(mu, 1.55, mv, cowl[0]!, cluster.height - 1.55, cowl[1]!, PAPER);'),
    ('a block of three ticket machines', 'of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {\n      const body', 'of [[1, 0], [0, 1], [-1, 0]] as const) {\n      const body'),
    ('totems no taller than before', 'totem: { width: 1.1, depth: 0.22, height: 3 }', 'totem: { width: 1.1, depth: 0.22, height: 2.4 }'),
    ('gate cabinets into the reveals', 'offsets: [-3, -1.8, -0.6, 0.6, 1.8, 3] as readonly number[]', 'offsets: [-3.5, -1.8, -0.6, 0.6, 1.8, 3.5] as readonly number[]'),
    ('gate cabinets between the bays', 'bays: 5, firstBay: 4, pitch: 8 }', 'bays: 5, firstBay: 8, pitch: 8 }'),
    ('shop centre off by a metre', 'shops: [WESTERN_RANGE.v0 + 44, WESTERN_RANGE.v0 + 48] as readonly number[],', 'shops: [WESTERN_RANGE.v0 + 44, WESTERN_RANGE.v0 + 49] as readonly number[],'),
    ('shopfront behind its pane', 'u: RANGE_FACE + 0.335 }', 'u: RANGE_FACE + 0.5 }'),
    ('shopfront loses the depth fight to the pane', 'polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, name: \'concourse-signs\'', 'name: \'concourse-signs\''),
    ('a brand on a plate', "'Cafe', 'News and gifts'", "'Costa', 'News and gifts'"),
    ('a brand on a board', "'York Platform 6 On time'", "'Costa Platform 6 On time'"),
    ('totem lettering mirrored', 'const left = side < 0 ? 1 : -1;', 'const left = side < 0 ? -1 : 1;'),
    ('plate lettering mirrored', '[[v + half - 0.02, y0], [v - half + 0.02, y0], [v - half + 0.02, y1], [v + half - 0.02, y1]]', '[[v - half + 0.02, y0], [v + half - 0.02, y0], [v + half - 0.02, y1], [v - half + 0.02, y1]]'),
    ('plates face east', 'sign(ATLAS.plates[Math.max(0, i - gate.bays + 1)]!, pts, [-1, 0, 0], NAVY);', 'sign(ATLAS.plates[Math.max(0, i - gate.bays + 1)]!, pts, [1, 0, 0], NAVY);'),
    ('signs lit, not glowing', 'signs: new THREE.MeshBasicMaterial({', 'signs: new THREE.MeshLambertMaterial({'),
    ('floor as pale as the shared paving', 'FLOOR_TINT = 0x94948e;', 'FLOOR_TINT = 0xffffff;'),
    ('floor black', 'FLOOR_TINT = 0x94948e;', 'FLOOR_TINT = 0x0a0a0a;'),
    ('ticket machines missing', 'for (const [u, dv] of FITOUT.clusters) {', 'for (const [u, dv] of [] as (readonly [number, number])[]) {'),
    ('gate cabinets missing', 'part(gate.u, 0, v, gate.length, gate.height - 0.1, gate.width, SILVER);', 'void SILVER;'),
    ('plate bodies missing', 'part(back - plate.depth / 2, plate.bottom, v, plate.depth, plate.height, half * 2, NAVY);', 'void NAVY;'),
    ('board bodies missing', 'part(face + board.depth / 2, board.bottom + board.bar, (v0 + v1) / 2, board.depth, board.height - 2 * board.bar, board.length, BOARD);', 'void BOARD;'),
    ('board bars missing', 'for (const y of [board.bottom, board.bottom + board.height - board.bar]) part(', 'for (const y of [] as number[]) part('),
    ('shopfront interiors missing', '...FITOUT.shops.map(v => [v, shopfront.width / 2, shopfront.top, shopfront.u] as const), ', ''),
    ('opening interiors missing', ', ...westernArches().map(v => [v, WESTERN_ARCH.half, WESTERN_ARCH.spring, RANGE_FACE - WESTERN_ARCH.pane - 0.02] as const)', ''),
    ('opening interiors behind their panes', 'RANGE_FACE - WESTERN_ARCH.pane - 0.02', 'RANGE_FACE - WESTERN_ARCH.pane + 0.02'),
    ('opening interiors up into the arch', 'v, WESTERN_ARCH.half, WESTERN_ARCH.spring, RANGE_FACE', 'v, WESTERN_ARCH.half, WESTERN_ARCH.spring + 0.5, RANGE_FACE'),
    ('opening interiors wider than the pane', 'v, WESTERN_ARCH.half, WESTERN_ARCH.spring, RANGE_FACE', 'v, WESTERN_ARCH.half + 0.3, WESTERN_ARCH.spring, RANGE_FACE'),
    ('a board across the brick centre\'s windows', 'boards: [BLOCK[0] - 17.8, BLOCK[1] + 1]', 'boards: [BLOCK[0] - 17.8, BLOCK[1] - 12]'),
    ('both boards on the southern wall', 'boards: [BLOCK[0] - 17.8, BLOCK[1] + 1]', 'boards: [BLOCK[0] - 17.8, BLOCK[0] - 36]'),
    ('each gate bay its own sign, as in round 2', 'ATLAS.plates[Math.max(0, i - gate.bays + 1)]!', 'ATLAS.plates[Math.min(i, 2)]!'),
    ('the toilets over a gate', "'Platforms 0 to 8  →', 'Cafe'", "'Toilets', 'Cafe'"),
    ('the shops share one sign', 'ATLAS.plates[Math.max(0, i - gate.bays + 1)]!', 'ATLAS.plates[Math.min(1, Math.max(0, i - gate.bays + 1))]!'),
]

def run(name: str) -> subprocess.CompletedProcess[str]:
    try:
        result = kxmut.run_process(['node', '--test', '--test-reporter=tap', '--test-timeout=60000', 'web/tests/concourse-fitout.test.ts'], cwd=work, timeout=120)
    except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap; the log keeps what it wrote
        (out / f'{name}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
        raise
    (out / f'{name}.log').write_text(result.stdout + result.stderr)
    return result

baseline = run('baseline')
if baseline.returncode:
    raise SystemExit('baseline fit-out tests failed; inspect baseline.log')
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
