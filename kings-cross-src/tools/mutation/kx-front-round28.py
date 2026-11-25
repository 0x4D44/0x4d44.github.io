"""Catch round F8 regressions (front A7: a roof mode changes the roof opacities and depth writes only, the x-ray opacities the documented products, a run-time switch; the x-ray evidence shots) through web/tests/kx-front-round28.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round28.py SOURCE WORKTREE_SCRATCH
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
    ('the cladding writes depth in x-ray', 'web/src/shed.ts', 'cladMat.depthWrite = o > 0.98;', 'cladMat.depthWrite = true;', 'A7: in x-ray mode'),
    ('x-ray tints the slate', 'web/src/shed.ts', '    cladMat.opacity = o;\n', "    cladMat.opacity = o;\n    if (roofMode() === 'xray') cladMat.color.setHex(0xff0000);\n", 'A7: a roof mode'),
    ('x-ray reorders the glass', 'web/src/shed.ts', 'glassMesh.renderOrder = 3;', "glassMesh.renderOrder = opts.roof === 'xray' ? 5 : 3;", 'A7: a roof mode'),
    ('x-ray hides the ribs', 'web/src/shed.ts', "  ribs.name = 'shed-ribs';\n", "  ribs.name = 'shed-ribs';\n  ribs.visible = opts.roof !== 'xray';\n", 'A7: a roof mode'),
    ('x-ray casts the cladding', 'web/src/shed.ts', '  cladding.renderOrder = 2;\n', "  cladding.renderOrder = 2;\n  cladding.castShadow = opts.roof === 'xray';\n", 'A7: a roof mode'),
    ('the bars ignore the mode', 'web/src/shed.ts', 'roofBarsOpacity([local.x, local.y, local.z], layout, roofMode())', "roofBarsOpacity([local.x, local.y, local.z], layout, 'auto')", 'A7: in x-ray mode'),
    ('the crown alpha fixed at build', 'web/src/shed.ts', 'crownAlpha([local.x, local.y, local.z], layout, roofMode())', "crownAlpha([local.x, local.y, local.z], layout, opts.roof ?? 'auto')", 'A7: in x-ray mode'),
    ('the switch read once', 'web/src/shed.ts', 'const roofMode = (): RoofMode => group.userData.roofMode as RoofMode;', 'const built = group.userData.roofMode as RoofMode;\n  const roofMode = (): RoofMode => built;', 'A7: in x-ray mode'),
    ('the glass ignores the cladding', 'web/src/shed.ts', '    glassMat.opacity = glazingOpacity(o);\n  };', '    glassMat.opacity = glazingOpacity(1);\n  };', 'A7: in x-ray mode'),
    ('the evidence opacity drifts', 'tools/evidence.mjs', 'export const XRAY_EVIDENCE_OPACITY = 0.5;', 'export const XRAY_EVIDENCE_OPACITY = 0.6;', 'A7: in x-ray mode'),
    ('kx-front drops roof-above-xray', 'tools/evidence.mjs', "'front-oblique-xray', 'roof-above-xray', 'north-gable',", "'front-oblique-xray', 'north-gable',", 'A7 evidence'),
    ('no x-ray view names', 'tools/evidence.mjs', ', ...pairs.map(pair => `${pair.cameraName}-xray`)];', '];', 'A7 evidence'),
    ('the x-ray shot skips the flicker check', 'tools/evidence.mjs', "pair.xray.camera, { twoFrame: true,", "pair.xray.camera, { twoFrame: false,", 'A7 evidence'),
    ('the x-ray shot outside its override', 'tools/evidence.mjs', 'if (roofMaterialEvidence !== ROOF_MATERIAL_SOLID && roofMaterialEvidence !== ROOF_MATERIAL_XRAY) return await capture();', 'if (roofMaterialEvidence !== ROOF_MATERIAL_SOLID) return await capture();', 'A7 evidence'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round28.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round28-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 3 else 0)
