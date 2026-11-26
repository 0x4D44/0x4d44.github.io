"""Catch B2 shed regressions (the two vaults springing from the spine wall's opposite faces, a valley gutter sunk between them; the ribs' spine feet on the
corbel caps; the roof height on the vaults' own axes) through web/tests/kx-shed-b2-valley.test.ts only.
Usage: python3 -I -u tools/mutation/kx-shed-b2-valley.py SOURCE WORKTREE_SCRATCH
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
    ('the valley closed again', 'core/station.ts', 'export const SHED_VALLEY_WIDTH = 1.0;', 'export const SHED_VALLEY_WIDTH = 0;', 'B2: each vault springs'),
    ('the vaults at the published radius', 'web/src/shed.ts', 'const R = SHED_VAULT_RADIUS;', 'const R = SHED_SPAN_WIDTH / 2;', 'B2: nothing of either vault'),
    ('the axes back on the old lines', 'web/src/shed.ts', 'const centres = shedVaultCentres(layout);', 'const centres = [spine - R, spine + R];', 'B2: nothing of either vault'),
    ('the spine foot as the outer one', 'web/src/shed.ts', '[RIB_FOOT, RIB_FOOT_SPINE])) rib.box(', '[RIB_FOOT, RIB_FOOT])) rib.box(', "B2: the ribs"),
    ('the east truss not turned', 'web/src/shed.ts', 'uc > spine ? mat.makeTranslation(uc, 0, -v).multiply(turn) :', 'false ? mat.makeTranslation(uc, 0, -v).multiply(turn) :', "B2: the ribs"),
    ('no gutter in the wall', 'web/src/shed.ts', 'spineLowerOpenings(L), ROOF_EXTERIOR.valleyGutter, ROOF_EXTERIOR.valleyKerbUp);', 'spineLowerOpenings(L));', 'B2: a valley gutter'),
    ('no kerbs', 'web/src/shed.ts', '    if (gutter) {\n      const kerb', '    if (false) {\n      const kerb', 'B2: a valley gutter'),
    ('the lead on the wall top', 'web/src/shed.ts', 'valleyTop(sp) - ROOF_EXTERIOR.valleyGutter[1] + 0.005', 'valleyTop(sp) + 0.005', 'B2: a valley gutter'),
    ('the roof height at the old radius', 'web/src/furniture.ts', 'const r = SHED_VAULT_RADIUS; // B2', 'const r = SHED_VAULT_RADIUS + 0.25; // B2', "B2: the ribs"),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-shed-b2-valley.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-shed-b2-valley-', dir=out) as tmp:
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
