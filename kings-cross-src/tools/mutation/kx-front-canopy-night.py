"""Catch the south front's canopy, entrance colours, night glow and sill course regressions (round 5, second pass) through web/tests/kx-front-canopy-night.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-canopy-night.py SOURCE WORKTREE_SCRATCH
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
    ('canopy back to 7.2 m deep', 'web/src/shed.ts', 'depth: 8.6,', 'depth: 7.2,', 'roof sheet runs unbroken'),
    ('the west bay back, into the grey canopy', 'web/src/shed.ts', 'cx0 = fx0 + 0.3, cx1 = fx1 - 0.3;', 'cx0 = fx0 - 9.6, cx1 = fx1 - 0.3;', 'stops short of the city'),
    ('canopy back to the ribs\' slate blue', 'web/src/shed.ts', 'frontSteel.color.set(FRONT_COLOURS.steel);', 'frontSteel.color.set(0x343b42);', 'are charcoal'),
    ('fascia saturated blue', 'web/src/shed.ts', 'fascia: 0x1b2a4a', 'fascia: 0x1c3c78', 'are charcoal'),
    ('glass back to near-black', 'web/src/shed.ts', 'glass: 0x56687a', 'glass: 0x1e262b', 'are charcoal'),
    # re-pointed in round 9: since round 6 the board's face is a quad of its own (its lettering's uvs), so the whole board is moved by its top
    ('fascia back down at the transom', 'web/src/shed.ts', 'const s1 = GROUND_Y + FRONT_CANOPY.top - FRONT_CANOPY.sheet - 0.02, s0', 'const s1 = GROUND_Y + FRONT_CANOPY.top - FRONT_CANOPY.sheet - 1.02, s0', 'are charcoal'),
    ('no downlights', 'web/src/shed.ts', 'for (const row of FRONT_CANOPY.lightRows) {', 'for (const row of FRONT_CANOPY.lightRows.slice(0, 0)) {', 'at night a row of downlights'),
    ('lamps flat on the soffit, behind the fascia', 'web/src/shed.ts', 'ly = top - FRONT_CANOPY.fascia - 0.05 - lh / 2;', 'ly = top - FRONT_CANOPY.sheet - lh / 2;', 'at night a row of downlights'),
    ('glass glows white', 'web/src/shed.ts', 'glass: [0xffc98a, 0.45]', 'glass: [0xffffff, 0.45]', 'at night a row of downlights'),
    ('glow ignores the night level', 'web/src/shed.ts', 'uFrontGlow * uWinNight * mix(', 'uFrontGlow * mix(', 'at night a row of downlights'),
    ('flat entrance glow, no fade', 'web/src/shed.ts', 'head: 0.3 }', 'head: 1.0 }', 'at night a row of downlights'),
    ('frames glow at night', 'web/src/shed.ts', 'frontSteel.emissive.set(FRONT_COLOURS.steelLift);', 'frontSteel.emissive.set(0x806040);', 'at night a row of downlights'),
    ('sill course back to 0.3 m proud', 'web/src/shed.ts', 'proud(spine, sp - 0.325, FW + 0.6, 0.65, 0.5)', 'proud(spine, sp - 0.3, FW + 0.4, 0.6, 0.3)', 'sill course is the front'),
    # re-pointed in round 9: round 8 made the cap the springing course (FRONT_RELIEF.springing), a stone.box of its own
    ('sill course\'s cap omitted', 'web/src/shed.ts', "  stone.box([spine, sp - sc.height / 2,", "  void ([spine, sp - sc.height / 2,", 'sill course is the front'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-canopy-night.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-canopy-night-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 5 else 0)
