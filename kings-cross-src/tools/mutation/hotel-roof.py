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
     'for (const face of plan.faces) for (const bay of face.bays) addHotelDormer(parts, plan, bay);',
     '// dormers omitted', 'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('pediment flattened',
     'const apex: V3 = [centre[0], centre[1] + GNH_DORMER_WALL_HEIGHT + GNH_DORMER_PEDIMENT_RISE, centre[2]];',
     'const apex: V3 = [centre[0], centre[1] + GNH_DORMER_WALL_HEIGHT, centre[2]];',
     'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('one dormer foot lifted off the roof',
     'const left = hotelRoofPoint(plan, bay.edge, t - dt, GNH_DORMER_INSET);',
     'const leftRoot = hotelRoofPoint(plan, bay.edge, t - dt, GNH_DORMER_INSET);\n  const left: V3 = [leftRoot[0], leftRoot[1] + 0.2, leftRoot[2]];',
     'not ok 2 - Great Northern Hotel: roof details sit on the drawn OSM-derived roof'),
    ('chimneys omitted',
     'for (const bay of hotelChimneyBays(plan)) addHotelChimney(parts, plan, bay);',
     '// chimneys omitted', 'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('chimney caps moved inside dormer hoods',
     'const inset = Math.min(1 - capHalfInset - 0.02, GNH_DORMER_REAR_INSET + capHalfInset + GNH_ROOF_DETAIL_GAP / roofRun);',
     'const inset = 0.58;', 'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
    ('cap base falls back to the roof',
     'const capBase = capRoofCorners.map(([x, , z]): V3 => [x, shaftTopY, z]);',
     'const capBase = capRoofCorners.map(([x, y, z]): V3 => [x, y, z]);',
     'not ok 1 - Great Northern Hotel: assumed pedimented dormers'),
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
