"""Catch round 24's south-front regressions (the spandrel panels recessed, the cornice line lifted at night and soffits in the night wash, A2; the porch soffit's tone and width, the head returns, and the voussoirs and canopy at night, A3) through web/tests/kx-front-round24.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round24.py SOURCE WORKTREE_SCRATCH
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
    ('no recess', 'web/src/shed.ts', "strip: 0.5, recess: 0.4 }", "strip: 0.5, recess: 0.0 }", "A2: each spandrel's panel"),
    ('no panel holes', 'web/src/shed.ts', "    outline.holes.push(...panels);", "", "A2: each spandrel's panel"),
    ('holes left open', 'web/src/shed.ts', "  for (const h of panels) frontParts.push(", "  if (panels.length < 0) frontParts.push(", "A2: each spandrel's panel"),
    ('the shadow line back in the frames', 'web/src/shed.ts', "    shades.poly([[fx0, yb - FRONT_RELIEF.shadowLine, e]", "    frames.poly([[fx0, yb - FRONT_RELIEF.shadowLine, e]", "A2: the cornice's painted"),
    ('no night lift on the line', 'web/src/shed.ts', "FRONT_NIGHT.shade, 'kx-front-infill-shade'),", "FRONT_NIGHT.shade, 'kx-front-infill-sh'),", "A2: the cornice's painted"),
    ('a black night line', 'web/src/shed.ts', "shade: [0x8a6a48, 0.12] }", "shade: [0x8a6a48, 0.0] }", "A2: the cornice's painted"),
    ('a soffit unwashed', 'web/src/shed.ts', "(max(vKxWashNormal.z,0.0) + ${FRONT_WASH_SOFFIT.toFixed(2)}*max(-vKxWashNormal.y,0.0))", "max(vKxWashNormal.z,0.0)", "A2: the front's night wash"),
    ('a tan soffit', 'web/src/shed.ts', "soffit: 0xa99a7c }", "soffit: 0xe6d6b4 }", "A3: each porch soffit"),
    ('the soffit past the band', 'web/src/shed.ts', "    const sw = fw;", "    const sw = 2 * halfAt(s0) - 0.04;", "A3: each porch soffit"),
    ('a glowing soffit by day', 'web/src/shed.ts', "new THREE.MeshLambertMaterial({ color: PORCH_DEPTH.soffit })", "new THREE.MeshLambertMaterial({ color: PORCH_DEPTH.soffit, emissive: 0x3a3020 })", "A3: each porch soffit"),
    ('the head reveal covered in charcoal again', 'web/src/shed.ts', "    // the signage fascia: navy, across the top of the opening", "    frames.poly([[x - entryR, headY(0) - 0.01, 0], [x + entryR, headY(0) - 0.01, 0], [x + entryR, headY(0) - 0.01, -PORCH_DEPTH.glass], [x - entryR, headY(0) - 0.01, -PORCH_DEPTH.glass]], undefined, { facing: [0, -1, 0] });\n    // the signage fascia: navy, across the top of the opening", "A3: each opening's arched head"),
    ('the reveals and faces swapped', 'web/src/shed.ts', "(grp.materialIndex === 1 ? returns : faces).push(part);", "(grp.materialIndex === 0 ? returns : faces).push(part);", "A3: each opening's arched head"),
    ('voussoirs in plain stone', 'web/src/shed.ts', "[material('stoneFoot'), canopySteel]", "[material('stone'), canopySteel]", "A3: the voussoirs"),
    ('a bright canopy (round 24)', 'web/src/shed.ts', "canopy: [0xffe2b8, 0.012]", "canopy: [0xffe2b8, 0.12]", "A3: the voussoirs"),
    ('a canopy lit on every face', 'web/src/shed.ts', "{ defines: { ...frontSteel.defines, KX_GLOW_DOWN: '' } }", "{ defines: { ...frontSteel.defines } }", "A3: the voussoirs"),
    ('the down-only glow dropped from the shader', 'web/src/shed.ts', "#ifdef KX_GLOW_DOWN\\nfrontGlowAdd *= max( -vFrontNy, 0.0 );\\n#endif\\n", "", "A3: the voussoirs"),
    ('canopy without its lift', 'web/src/shed.ts', "[material('stoneFoot'), canopySteel]", "[material('stoneFoot'), frontSteel]", "A3: the voussoirs"),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round24.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round24-', dir=out) as tmp:
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
