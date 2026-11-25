"""Catch round S1 shed regressions (the north screens without the ring and with the lattice girder, the arcades impost stones, B3; the haunch rings and the ribs lighter by day, B1) through web/tests/kx-shed-round1.test.ts only.
Usage: python3 -I -u tools/mutation/kx-shed-round1.py SOURCE WORKTREE_SCRATCH
Anchor moved round F14 (the girder's panel points).
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
    ('the ring kept in the gable bars', 'web/src/shed.ts', "} else if (b.kind !== 'ring' && b.c[1] > from + 0.2) out.push(b);", '} else if (b.c[1] > from + 0.2) out.push(b);', 'B3: the north screens'),
    ('no girder', 'web/src/shed.ts', '    addBars(gBars, gableGirder(uc, sp, GABLE_GLASS_FROM), 0, -L);', '', 'B3: a lattice girder'),
    ('the girder without diagonals', 'web/src/shed.ts', '  for (let i = 0; i + 1 < points.length; i++) {', '  for (let i = 0; i < 0; i++) {', 'B3: a lattice girder'),
    ('a shallow girder', 'web/src/shed.ts', 'GABLE_GIRDER = { depth: 2.4,', 'GABLE_GIRDER = { depth: 0.6,', 'B3: a lattice girder'),
    ('no haunch rings', 'web/src/shed.ts', 'for (const [u, y] of ringCentres) if (Math.sign(u)', 'for (const [u, y] of ringCentres.slice(0, 0)) if (Math.sign(u)', 'B1: a ring in each'),
    ('the rings casting', 'web/src/shed.ts', '  haunch.castShadow = false;\n', '  haunch.castShadow = true;\n', 'B1: a ring in each'),
    ('the rings off the wall', 'web/src/shed.ts', 'const cx = (xi + xo) / 2;', 'const cx = (xi + xo) / 2 + 3.0;', 'B1: a ring in each'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('the rings into the boom', 'web/src/shed.ts', 'rise: 1.5 }', 'rise: 0.2 }', 'B1: a ring in each'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('rings off the ribs plane', 'web/src/shed.ts', 'haunch.setMatrixAt(k++, mat.makeTranslation(uc + u, y, -v));', 'haunch.setMatrixAt(k++, mat.makeTranslation(uc + u, y, -v - 1.0));', 'B1: a ring in each'),
    ('big rings', 'web/src/shed.ts', 'HAUNCH_RING = { radius: 0.4,', 'HAUNCH_RING = { radius: 1.0,', 'B1: a ring in each'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('no east imposts', 'web/src/shed.ts', '  arcadeImposts(imposts, x - h, -1, opens);\n', '', 'B3: a cream stone'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('no west imposts', 'web/src/shed.ts', '  arcadeImposts(imposts, depth, 1, opens);\n', '', 'B3: a cream stone'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('imposts under the springing', 'web/src/shed.ts', 'stone.box([f + side * out / 2, y - tall / 2, -mid]', 'stone.box([f + side * out / 2, y - tall / 2 - 0.5, -mid]', 'B3: a cream stone'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('imposts to the jambs again', 'web/src/shed.ts', 'const len = Math.min(along, b.vc - b.r - (a.vc + a.r) - 2 * margin);', 'const len = b.vc - b.r - (a.vc + a.r);', 'B3: a cream stone'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('imposts across the next opening', 'web/src/shed.ts', 'const len = Math.min(along, b.vc - b.r - (a.vc + a.r) - 2 * margin);', 'const len = b.vc - b.r - (a.vc + a.r) + 0.8;', 'B3: a cream stone'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('imposts 0.35 m proud again', 'web/src/shed.ts', '{ tall: 0.35, out: 0.3,', '{ tall: 0.35, out: 0.45,', 'B3: a cream stone'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('imposts barely proud', 'web/src/shed.ts', '{ tall: 0.35, out: 0.3,', '{ tall: 0.35, out: 0.02,', 'B3: a cream stone'),  # re-anchored round S2 (the code it mutated was reshaped)
    ('ribs not lifted', 'web/src/shed.ts', '  m.color.multiplyScalar(RIB_DAY_LIFT);\n  ribDayMaterial = m;', '  ribDayMaterial = m;', 'B1: the ribs and haunch'),
    ('ribs lifted at night too', 'web/src/shed.ts', "  withBuildingNightMaterial(ribs, material('ribPaint'));", '', 'B1: the ribs and haunch'),
    ('the shared paint lifted', 'web/src/shed.ts', 'ribDayMaterial = m;\n  return m;', 'ribDayMaterial = original;\n  original.color.multiplyScalar(RIB_DAY_LIFT);\n  return original;', 'B1: the ribs and haunch'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-shed-round1.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round25-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web', 'tools/tests'):
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
