"""Mutate Great Northern Hotel roof details in a retained scratch copy: SOURCE SCRATCH."""
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
    raise SystemExit('Choose a separate output under worktree .scratch')
out.mkdir(parents=True, exist_ok=True)
work = out / 'work'
if work.exists():
    raise SystemExit('Choose fresh output; retained copy already exists')
shutil.copytree(src, work, ignore=shutil.ignore_patterns('node_modules', '.git', '.scratch', 'dist'))
(work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
target = work / 'web/src/landmarks.ts'
original = target.read_text()
mutations = [
    ('dormers omitted',
     "for (const face of plan.faces) face.bays.forEach((bay, i) => { if (i % 3 !== 1 && bay.width > 2.4) addHotelDormer(parts, plan, bay); });",
     '// dormers omitted', 'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('a dormer over every bay',
     'if (i % 3 !== 1 && bay.width > 2.4) addHotelDormer(parts, plan, bay);',
     'if (bay.width > 2.4) addHotelDormer(parts, plan, bay);', 'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('a dormer on a bay too narrow for one (its feet leave the roof on a hip)',
     'if (i % 3 !== 1 && bay.width > 2.4) addHotelDormer(parts, plan, bay);',
     'if (i % 3 !== 1) addHotelDormer(parts, plan, bay);', 'not ok 2 - Great Northern Hotel: roof details sit on the drawn OSM-derived roof'),
    ('pediment flattened',
     'const GNH_DORMER_PEDIMENT_RISE = 0.7; // ASSUMED',
     'const GNH_DORMER_PEDIMENT_RISE = 0; // ASSUMED',
     'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('dormers lifted off the roof',
     'addGable(parts, [x, y, z], bay.dir, bay.normal,',
     'addGable(parts, [x, y + 0.2, z], bay.dir, bay.normal,',
     'not ok 2 - Great Northern Hotel: roof details sit on the drawn OSM-derived roof'),
    ('dormer ridges meeting the roof too far back (the run taken as the mean of the corners)',
     'return { edgeLength, t, roofRun: (x0 - x1) * bay.normal[0] + (z0 - z1) * bay.normal[1] };',
     'return { edgeLength, t, roofRun: 1.5 * ((x0 - x1) * bay.normal[0] + (z0 - z1) * bay.normal[1]) };',
     'not ok 2 - Great Northern Hotel: roof details sit on the drawn OSM-derived roof'),
    ('chimneys omitted',
     'hotelChimneyBays(plan).forEach((bay, i) => addHotelChimney(parts, plan, bay, GNH_STACKS[i % GNH_STACKS.length] as readonly [number, number, number]));',
     '// chimneys omitted', 'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('chimney caps moved in front of the dormer rears',
     'const [x, , z] = hotelRoofPoint(plan, bay.edge, t, 1 + (0.7 * k + GNH_ROOF_DETAIL_GAP) / roofRun);',
     'const [x, , z] = hotelRoofPoint(plan, bay.edge, t, 0.58);', 'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('stack feet sunk into the flat top',
     "bay.dir, plan.ridge, hh as number, s as number, 'brick');",
     "bay.dir, plan.ridge - 0.5, hh as number, s as number, 'brick');",
     'not ok 2 - Great Northern Hotel: roof details sit on the drawn OSM-derived roof'),
]


def run(name):
    try:
        result = kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/hotel-roof.test.ts'], cwd=work, timeout=60)
    except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap; the log keeps what it wrote
        (out / f'{name}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
        raise
    (out / f'{name}.log').write_text(result.stdout + result.stderr)
    return result


if run('baseline').returncode:
    raise SystemExit('Baseline test failed')
caught = 0
for i, (label, old, new, expected_failure) in enumerate(mutations):
    if original.count(old) != 1:
        raise SystemExit(f'Missing/ambiguous mutation anchor: {label}')
    target.write_text(original.replace(old, new, 1))
    try:
        result = run(f'm{i:02d}')
    except subprocess.TimeoutExpired as error:
        print(f'SURVIVED/INVALID: {label} ({kxmut.why(error)}; that is not a kill)', flush=True)
        continue
    finally:
        target.write_text(original)
    body = result.stdout + result.stderr
    valid = bool(result.returncode and 'AssertionError' in body and
                 expected_failure in body and
                 not re.search(r'SyntaxError|TypeError|ERR_MODULE_NOT_FOUND', body))
    print(f'{"CAUGHT" if valid else "SURVIVED/INVALID"}: {label}', flush=True)
    caught += valid
print(f'{caught}/{len(mutations)} caught')
raise SystemExit(caught != len(mutations))
