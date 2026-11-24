"""Catch round S2 shed regressions (the haunch rings in the ribs foot panels clear of the web, the ribs 2x by day, B1; the imposts paler, deeper and bracketed, B3) through web/tests/kx-shed-round2.test.ts only.
Usage: python3 -I -u tools/mutation/kx-shed-round2.py SOURCE WORKTREE_SCRATCH
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
    ('the foot diagonals back', 'web/src/shed.ts', '    if (i === 0 || i === n - 1) continue;\n', '', 'B1: each haunch ring'),
    ('only the west foot freed', 'web/src/shed.ts', 'if (i === 0 || i === n - 1) continue;', 'if (i === 0) continue;', 'B1: each haunch ring'),
    ('the ring up in the next panel', 'web/src/shed.ts', 'HAUNCH_RING = { radius: 0.4, tube: 0.05, rise: 1.5 }', 'HAUNCH_RING = { radius: 0.4, tube: 0.05, rise: 4.5 }', 'B1: each haunch ring'),
    ('a ring too big for the panel', 'web/src/shed.ts', 'HAUNCH_RING = { radius: 0.4, tube: 0.05,', 'HAUNCH_RING = { radius: 0.6, tube: 0.05,', 'B1: each haunch ring'),
    ('the ring on the inner boom', 'web/src/shed.ts', 'const cx = (xi + xo) / 2;', 'const cx = xi;', 'B1: each haunch ring'),
    ('the ribs at 1.38 again', 'web/src/shed.ts', 'export const RIB_DAY_LIFT = 2.0;', 'export const RIB_DAY_LIFT = 1.38;', 'B1: the ribs and rings'),
    ('the ribs too pale', 'web/src/shed.ts', 'export const RIB_DAY_LIFT = 2.0;', 'export const RIB_DAY_LIFT = 3.0;', 'B1: the ribs and rings'),
    ('imposts flat again', 'web/src/shed.ts', 'ARCADE_IMPOST = { tall: 0.35, out: 0.3,', 'ARCADE_IMPOST = { tall: 0.35, out: 0.08,', 'B3: each impost'),
    ('no bracket', 'web/src/shed.ts', 'steps: [[0.2, 0.2], [0.2, 0.1]] as const }', 'steps: [] as const }', 'B3: each impost'),
    ('the bracket not stepped', 'web/src/shed.ts', 'steps: [[0.2, 0.2], [0.2, 0.1]] as const }', 'steps: [[0.2, 0.2], [0.2, 0.2]] as const }', 'B3: each impost'),
    ('the bracket proud of the impost', 'web/src/shed.ts', 'steps: [[0.2, 0.2], [0.2, 0.1]] as const }', 'steps: [[0.2, 0.4], [0.2, 0.1]] as const }', 'B3: each impost'),
    ('imposts in the dressings', 'web/src/shed.ts', "group.add(mesh(imposts.build(), material('stoneImpost'), 'shed-arcade-imposts'));", "group.add(mesh(imposts.build(), material('stoneDressing'), 'shed-arcade-imposts'));", 'B3: each impost'),
    ('imposts across the openings', 'web/src/shed.ts', 'const len = Math.min(along, b.vc - b.r - (a.vc + a.r) - 2 * margin);', 'const len = b.vc - b.r - (a.vc + a.r) + 0.6;', 'B3: each impost'),
    ('imposts back in the casting stone', 'web/src/shed.ts', '  arcadeImposts(imposts, x - h, -1, opens);', '  arcadeImposts(stone, x - h, -1, opens);', 'B3: each impost'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-shed-round2.test.ts'], cwd=work, timeout=60)

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
    raise SystemExit(1 if failures or len(passing) != 3 else 0)
