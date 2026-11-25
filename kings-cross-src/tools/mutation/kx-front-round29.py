"""Catch round F9 regressions (front A7: the roof layers kept transparent in every mode, the glazings in a fixed draw order, the x-ray crown bars at full strength outside, the end glass dimmed with the roof in x-ray) through web/tests/kx-front-round29.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round29.py SOURCE WORKTREE_SCRATCH
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
    ('the slate opaque but in x-ray', 'web/src/shed.ts', 'cladMat.transparent = true;', "cladMat.transparent = opts.roof === 'xray';", 'three layers stay'),
    ('the roof glass writes depth when thinned', 'web/src/shed.ts', '    glassMat.opacity = glazingOpacity(o);\n', '    glassMat.opacity = glazingOpacity(o);\n    glassMat.depthWrite = o < 0.98;\n', 'three layers stay'),
    ('the glass order reversed', 'web/src/shed.ts', 'GLASS_ORDER = { gable: 2.5, roof: 3, front: 3.5 }', 'GLASS_ORDER = { gable: 3.5, roof: 3, front: 2.5 }', 'draw in a fixed order'),
    ('the front glass after the bars', 'web/src/shed.ts', 'GLASS_ORDER = { gable: 2.5, roof: 3, front: 3.5 }', 'GLASS_ORDER = { gable: 2.5, roof: 3, front: 4.5 }', 'draw in a fixed order'),
    ('the front glass shares the roof order again', 'web/src/shed.ts', '  lunMesh.renderOrder = GLASS_ORDER.front;\n', '  lunMesh.renderOrder = GLASS_ORDER.roof;\n', 'draw in a fixed order'),
    ('the x-ray bars halved again', 'web/src/shed.ts', "  if (mode === 'xray') return crownOutside(cam, layout);\n", "  if (mode === 'xray') return XRAY_OPACITY * crownOutside(cam, layout);\n", 'outside bars keep'),
    ('the x-ray bars even inside', 'web/src/shed.ts', "  if (mode === 'xray') return crownOutside(cam, layout);\n", "  if (mode === 'xray') return 1;\n", 'outside bars keep'),
    ('the bars at full strength in auto too', 'web/src/shed.ts', "  if (mode === 'xray') return crownOutside(cam, layout);\n", "  if (mode !== 'solid') return crownOutside(cam, layout);\n", 'outside bars keep'),
    ('the end glass never dims', 'web/src/shed.ts', "  return mode === 'xray' ? glazingOpacity(XRAY_OPACITY) / glazingOpacity(1) : 1;", '  return 1;', 'the end glass'),
    ('the end glass dims in auto', 'web/src/shed.ts', "  return mode === 'xray' ? glazingOpacity(XRAY_OPACITY) / glazingOpacity(1) : 1;", '  return glazingOpacity(XRAY_OPACITY) / glazingOpacity(1);', 'the end glass'),
    ('the end glass dims by the slate', 'web/src/shed.ts', "  return mode === 'xray' ? glazingOpacity(XRAY_OPACITY) / glazingOpacity(1) : 1;", "  return mode === 'xray' ? XRAY_OPACITY : 1;", 'the end glass'),
    ('the shared glass not put back', 'web/src/shed.ts', '  glass.onAfterRender = (_r, _s, _c, _g, mat) => { mat.opacity = was; };\n', '', 'the end glass'),
    ('the gables not dimmed', 'web/src/shed.ts', '  dimInXray(gableGlass, group);\n', '', 'the end glass'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round29.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round29-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web', 'tools'):  # the whole tools package: the test imports tools/evidence.mjs and its siblings
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
