"""Catch round 25's south-front regressions (the front's returns in a darker brick, the orders' steps and the spandrel reveals with them, the panels 0.4 m back, A2; the fascia's night glow by its lettering, A3) through web/tests/kx-front-round25.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round25.py SOURCE WORKTREE_SCRATCH
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
    ('returns in the face tone', 'web/src/shed.ts', "export const FRONT_RETURN = 0.55;", "export const FRONT_RETURN = 1.0;", "A2: the front's returns"),
    ('faces and returns swapped', 'web/src/shed.ts', "(grp.materialIndex === 1 ? returns : faces).push(part);", "(grp.materialIndex === 0 ? returns : faces).push(part);", "A2: each order's step face"),
    ('day returns untinted', 'web/src/shed.ts', "  m.color.multiplyScalar(FRONT_RETURN);\n  frontReturnMaterial = m;", "  frontReturnMaterial = m;", "A2: the front's returns"),
    ('night returns untinted', 'web/src/shed.ts', "  m.color.multiplyScalar(tint); // round 25", "  m.color.multiplyScalar(1); // round 25", "A2: the front's returns"),
    ('the returns in the plain brick', 'web/src/shed.ts', "[material('brickFoot'), frontReturn()], 'shed-front')", "[material('brickFoot'), material('brickFoot')], 'shed-front')", "A2: the front's returns"),
    ('the panels back at 0.2', 'web/src/shed.ts', "strip: 0.5, recess: 0.4 }", "strip: 0.5, recess: 0.2 }", "A2: each spandrel panel"),
    ('the fascia glowing all over', 'web/src/shed.ts', "Object.assign(fasciaMaterial(), { defines: { KX_GLOW_BY_MAP: '' } })", "fasciaMaterial()", "A3: the fascia glows"),
    ('the fascia glowing blue', 'web/src/shed.ts', "fascia: [0xdfe8ff, 0.4],", "fascia: [0x2a5cc0, 0.35],", "A3: the fascia glows"),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round25.test.ts'], cwd=work, timeout=60)

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
    raise SystemExit(1 if failures or len(passing) != 4 else 0)
