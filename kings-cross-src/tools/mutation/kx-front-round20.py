"""Catch round 20's south-front regressions (the porch infill's depth, its interior and barriers, A3; the cornice's overhang, A2) through web/tests/kx-front-round20.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round20.py SOURCE WORKTREE_SCRATCH
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
    ('the glass at mid-wall again', 'web/src/shed.ts', "g.translate(0, 0, -PORCH_DEPTH.glass); // round 20", "g.translate(0, 0, -0.7); // round 20", 'A3: each lower opening'),
    ('shallow frames', 'web/src/shed.ts', "PORCH_DEPTH = { glass: 0.8, frame: 0.3,", "PORCH_DEPTH = { glass: 0.8, frame: 0.12,", 'A3: each lower opening'),
    ('no interior plane', 'web/src/shed.ts', "    interior.poly([[x - entryR", "    if (x > 1e9) interior.poly([[x - entryR", 'A3: behind the glass'),
    ('a cold interior', 'web/src/shed.ts', "interior: 0x7a6a55", "interior: 0x556a7a", 'A3: behind the glass'),
    ('the interior glowing blue', 'web/src/shed.ts', "FRONT_NIGHT.glass, 'kx-front-infill-interior'", "[0x2040ff, 0.45], 'kx-front-infill-interior'", 'A3: behind the glass'),
    ('no barriers', 'web/src/shed.ts', "for (let k = 0; k < PORCH_DEPTH.barriers; k++) {", "for (let k = 0; k < 0; k++) {", 'A3: behind the glass'),
    ('barriers behind the plane', 'web/src/shed.ts', "bz = gz + 0.003,", "bz = gz - 0.003,", 'A3: behind the glass'),
    ('the cornice face back at 0.7', 'web/src/shed.ts', "FRONT_CORNICE = { out: 0.9,", "FRONT_CORNICE = { out: 0.7,", 'A2: the corona'),
    ('the cornice built at 0.7', 'web/src/shed.ts', "FW + toMass, 0.9, FRONT_CORNICE.out);", "FW + toMass, 0.9, 0.7);", 'A2: the corona'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round20.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round20-', dir=out) as tmp:
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
