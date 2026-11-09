"""Fit-out and floor mutations: ticket blocks, totems, boards, plates, gate cabinets, shopfronts, lettering, the floor's tone.
Usage: concourse-fitout.py SOURCE SCRATCH. Mutates a private copy of SOURCE under SCRATCH (which must lie beneath a .scratch
directory); each kill needs an assertion failure from web/tests/concourse-fitout.test.ts, not a load failure.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

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
BOARD = 'board: { length: 16.8, height: 1.05, bottom: 5.6, standoff: 0.3, depth: 0.12 }'
TOTEMS = 'totems: [[-30, -15], [-30, 15], [-24, -26]]'
mutations = [
    ('ticket block beside the funnel feet', 'clusters: [[-23.5, -12], [-23.5, 12]]', 'clusters: [[-19.5, -2], [-23.5, 12]]'),
    ('totem against the Range', TOTEMS, 'totems: [[-30, -15], [-30, 15], [-13, -30]]'),
    ('totem beyond the concourse', TOTEMS, 'totems: [[-30, -15], [-30, 15], [-24, -80]]'),
    ('board inside the brickwork', BOARD, BOARD.replace('standoff: 0.3', 'standoff: -0.3')),
    ('board low enough to meet the plates', BOARD, BOARD.replace('bottom: 5.6', 'bottom: 3.7')),
    ('boards hung low, as in round 1', BOARD, BOARD.replace('bottom: 5.6', 'bottom: 4.9')),
    ('ticket machines shorter than a person plus a head', 'cluster: { size: 1.78, height: 2.2 }', 'cluster: { size: 1.78, height: 1.8 }'),
    ('ticket machines with white cowls', 'part(mu, 1.55, mv, cowl[0]!, cluster.height - 1.55, cowl[1]!, RED);', 'part(mu, 1.55, mv, cowl[0]!, cluster.height - 1.55, cowl[1]!, PAPER);'),
    ('a block of three ticket machines', '      const du = Math.round(Math.cos((k * Math.PI) / 2)), dz', '      if (k === 3) continue;\n      const du = Math.round(Math.cos((k * Math.PI) / 2)), dz'),
    ('totems no taller than before', 'totem: { width: 1.1, depth: 0.22, height: 3 }', 'totem: { width: 1.1, depth: 0.22, height: 2.4 }'),
    ('gate cabinets into the reveals', 'offsets: [-3, -1.8, -0.6, 0.6, 1.8, 3] as readonly number[]', 'offsets: [-3.5, -1.8, -0.6, 0.6, 1.8, 3.5] as readonly number[]'),
    ('gate cabinets between the bays', 'bays: 5, firstBay: 4, pitch: 8 }', 'bays: 5, firstBay: 8, pitch: 8 }'),
    ('shop centre off by a metre', 'shops: [WESTERN_RANGE.v0 + 44, WESTERN_RANGE.v0 + 48] as readonly number[],', 'shops: [WESTERN_RANGE.v0 + 44, WESTERN_RANGE.v0 + 49] as readonly number[],'),
    ('shopfront behind its pane', 'u: RANGE_FACE + 0.335 }', 'u: RANGE_FACE + 0.5 }'),
    ('shopfront loses the depth fight to the pane', 'polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, name: \'concourse-signs\'', 'name: \'concourse-signs\''),
    ('a brand on a plate', "'Cafe', 'News and gifts'", "'Costa', 'News and gifts'"),
    ('a brand on a board', "'York   Platform 6   On time'", "'Costa   Platform 6   On time'"),
    ('totem lettering mirrored', 'const left = side < 0 ? 1 : -1;', 'const left = side < 0 ? -1 : 1;'),
    ('plate lettering mirrored', '[[v + half - 0.02, y0], [v - half + 0.02, y0], [v - half + 0.02, y1], [v + half - 0.02, y1]]', '[[v - half + 0.02, y0], [v + half - 0.02, y0], [v + half - 0.02, y1], [v - half + 0.02, y1]]'),
    ('plates face east', '{ normal: [-1, 0, 0], color: textured ? WHITE : NAVY }', '{ normal: [1, 0, 0], color: textured ? WHITE : NAVY }'),
    ('signs lit, not glowing', 'signs: new THREE.MeshBasicMaterial({', 'signs: new THREE.MeshLambertMaterial({'),
    ('floor as pale as the shared paving', 'FLOOR_TINT = 0x94948e;', 'FLOOR_TINT = 0xffffff;'),
    ('floor black', 'FLOOR_TINT = 0x94948e;', 'FLOOR_TINT = 0x0a0a0a;'),
    ('ticket machines missing', 'for (const [u, dv] of FITOUT.clusters) {', 'for (const [u, dv] of [] as (readonly [number, number])[]) {'),
    ('gate cabinets missing', 'part(gate.u, 0, v, gate.length, gate.height - 0.1, gate.width, SILVER);', 'void SILVER;'),
    ('plate bodies missing', 'part(back - plate.depth / 2, plate.bottom, v, plate.depth, plate.height, half * 2, NAVY);', 'void NAVY;'),
    ('board bodies missing', 'part(face + board.depth / 2, board.bottom, (v0 + v1) / 2, board.depth, board.height, board.length, BOARD);', 'void BOARD;'),
    ('shopfront interiors missing', 'for (const v of FITOUT.shops) {', 'for (const v of [] as number[]) {'),
]

def run(name: str) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=60000', 'web/tests/concourse-fitout.test.ts'],
                            cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
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
