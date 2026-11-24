"""Catch round 27 south-front regressions (the orders faces lighter with their steps dark, the spandrel panels heads in the return tone, A2; the porch interior darker by day only, A3) through web/tests/kx-front-round27.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round27.py SOURCE WORKTREE_SCRATCH
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
    ('order faces in the front tone', 'web/src/shed.ts', 'export const FRONT_ORDER_FACE = 1.25;', 'export const FRONT_ORDER_FACE = 1.0;', 'A2: the orders'),
    ('order faces untinted by day', 'web/src/shed.ts', '  m.color.multiplyScalar(FRONT_ORDER_FACE);\n  frontOrderMaterial = m;', '  frontOrderMaterial = m;', 'A2: the orders'),
    ('order faces untinted at night', 'web/src/shed.ts', "frontWash('brickFoot', 'front', FW, FRONT_ORDER_FACE)]", "frontWash('brickFoot', 'front', FW)]", 'A2: the orders'),
    ('the steps lit as faces too', 'web/src/shed.ts', '(grp.materialIndex === 1 ? returns : orderParts.has(g) ? orderFaces : faces)', '(orderParts.has(g) ? orderFaces : grp.materialIndex === 1 ? returns : faces)', 'A2: the orders'),
    ('only the first order lightened', 'web/src/shed.ts', '      orderParts.add(g);\n', '      if (i === 0) orderParts.add(g);\n', 'A2: the orders'),
    ('no panel heads', 'web/src/shed.ts', 'for (const [x0, x1, y] of heads) head.poly(', 'for (const [x0, x1, y] of heads.slice(0, 0)) head.poly(', 'A2: each spandrel panel'),
    ('panel heads in the brick', 'web/src/shed.ts', "hg.addGroup(0, hg.getAttribute('position').count, 1);", "hg.addGroup(0, hg.getAttribute('position').count, 0);", 'A2: each spandrel panel'),
    ('panel heads too tall', 'web/src/shed.ts', 'export const FRONT_PANEL_HEAD = { height: 0.4 }', 'export const FRONT_PANEL_HEAD = { height: 1.2 }', 'A2: each spandrel panel'),
    ('panel heads on the wall face', 'web/src/shed.ts', 'z = FRONT_THICK - FRONT_TYMPANUM.recess + 0.005,', 'z = FRONT_THICK + 0.005,', 'A2: each spandrel panel'),
    ('no day darkening', 'web/src/shed.ts', '{ defines: { KX_DAY_DARK: PORCH_DEPTH.dayDark.toFixed(3) } }', '{ defines: {} }', 'A3: the porch interior'),
    ('darkened at night instead', 'web/src/shed.ts', 'diffuseColor.rgb *= mix( KX_DAY_DARK, 1.0, uWinNight );', 'diffuseColor.rgb *= mix( 1.0, KX_DAY_DARK, uWinNight );', 'A3: the porch interior'),
    ('a mild darkening', 'web/src/shed.ts', 'dayDark: 0.55,', 'dayDark: 0.9,', 'A3: the porch interior'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round27.test.ts'], cwd=work, timeout=60)

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
