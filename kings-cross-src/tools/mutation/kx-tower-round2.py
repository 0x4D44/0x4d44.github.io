"""Catch tower round 2's regressions (brick corner pilasters, the low hipped cap and its edge, the lifted soffit and frieze, the compass cross) through web/tests/kx-tower-round2.test.ts only.
Usage: python3 -I -u tools/mutation/kx-tower-round2.py SOURCE WORKTREE_SCRATCH
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
    ('stone quoins again', 'web/src/shed.ts', 'tb.box([sx * c, (y0 + y1) / 2, sz * c]', 'ts.box([sx * c, (y0 + y1) / 2, sz * c]', 'corners are pilasters'),
    ('no recess', 'web/src/shed.ts', 'pilaster: { width: 0.87, proud: 0.15 }', 'pilaster: { width: 0.87, proud: 0.0 }', 'corners are pilasters'),
    ('wide pilasters', 'web/src/shed.ts', 'pilaster: { width: 0.87, proud: 0.15 }', 'pilaster: { width: 1.3, proud: 0.15 }', 'corners are pilasters'),
    ('flat cap', 'web/src/shed.ts', 'edge: 0.25, rise: 0.6,', 'edge: 0.25, rise: 0.3,', 'low hipped dark metal roof'),
    ('thin edge', 'web/src/shed.ts', 'edge: 0.25, rise: 0.6,', 'edge: 0.15, rise: 0.6,', 'low hipped dark metal roof'),
    ('edge flush with the corona', 'web/src/shed.ts', 'eave: 0.18,', 'eave: 0.05,', 'low hipped dark metal roof'),
    ('no backing behind the brackets: sky through the lower tier', 'web/src/shed.ts', "fine.poly([at(-e, f, by), at(e, f, by), at(e, f, cyRow), at(-e, f, cyRow)]", "if (0) fine.poly([at(-e, f, by), at(e, f, by), at(e, f, cyRow), at(-e, f, cyRow)]", 'gap between the brackets'),
    ('backing only half way up', 'web/src/shed.ts', "fine.poly([at(-e, f, by), at(e, f, by), at(e, f, cyRow), at(-e, f, cyRow)]", "fine.poly([at(-e, f, by), at(e, f, by), at(e, f, by + 0.4), at(-e, f, by + 0.4)]", 'gap between the brackets'),
    ('the south backing turned in (culled)', 'web/src/shed.ts', "{ facing: [nx, 0, nz], color: shaded });", "{ facing: (nz > 0 ? [0, 0, -1] : [nx, 0, nz]) as V3, color: shaded });", 'gap between the brackets'),
    # round 3: the cyma's underside also closes the corona from below, so the mutant drops both (either alone leaves no sky to see)
    ('no corona soffit', 'web/src/shed.ts', "{ facing: [0, -1, 0], colors: [shaded, shaded, cream, cream] }", "{ facing: [0, 1, 0], colors: [shaded, shaded, cream, cream] }", 'gap between the brackets',
     "[span + 2 * cyma.out, cyma.height, span + 2 * cyma.out], { skip: ['+y'], color: cream });", "[span + 2 * cyma.out, cyma.height, span + 2 * cyma.out], { skip: ['+y', '-y'], color: cream });"),
    ('cross at the banner', 'web/src/shed.ts', 'crossBelow: 1.0,', 'crossBelow: 0.63,', 'compass cross'),
    ('short arms', 'web/src/shed.ts', 'vane: { arm: 0.9,', 'vane: { arm: 0.5,', 'compass cross'),
    ('no letters', 'web/src/shed.ts', 'for (const [a0, b0, a1, b1] of bars) {', 'for (const [a0, b0, a1, b1] of bars.slice(9)) {', 'compass cross'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-tower-round2.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-tower-round2-', dir=out) as tmp:
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
    for i, (label, rel, old, new, expected, *more) in enumerate(MUTATIONS, 1):
        file = work / rel
        original = file.read_text()
        mutated = original
        for o, n in [(old, new), *zip(more[::2], more[1::2])]:  # a mutant may make a second edit in the same file
            if o not in mutated:
                raise SystemExit(f'missing mutation anchor: {label}')
            mutated = mutated.replace(o, n, 1)
        file.write_text(mutated)
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
    raise SystemExit(1 if failures or len(passing) != 4 else 0)
