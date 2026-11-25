"""Catch round F14 regressions (front A6/B3: the cloud lightens only, in broad patches with brighter cores that drift with the camera; the sky tint aslant, none
head-on; the girder's 1.6 m panel on the mullions) through web/tests/kx-front-round34.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round34.py SOURCE WORKTREE_SCRATCH
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
    ('the cloud darkens', 'web/src/materials.ts', 'mix( fogColor, vec3( 1.0 ), ${glslFloat(GABLE_SHEET.haze)} ), ${glslFloat(GABLE_SHEET.cloud.lift)}', 'vec3( 0.0 ), ${glslFloat(GABLE_SHEET.cloud.lift)}', 'the cloud only lightens'),
    ('a weak cloud', 'web/src/materials.ts', 'lift: 0.2,', 'lift: 0.05,', 'the cloud only lightens'),
    ('a loud cloud', 'web/src/materials.ts', 'lift: 0.2,', 'lift: 0.4,', 'the cloud only lightens'),
    ('no cores', 'web/src/materials.ts', 'smoothstep( 0.05, 0.95, sin(', 'smoothstep( 0.05, 3.0, sin(', 'the cloud only lightens'),
    ('small patches', 'web/src/materials.ts', 'waves: [0.28, 0.1, -0.05, 0.2]', 'waves: [0.9, 0.1, -0.05, 0.2]', 'broad and elongated'),
    ('no drift', 'web/src/materials.ts', 'drift: 0.02 }', 'drift: 0 }', 'broad and elongated'),
    ('a jumpy drift', 'web/src/materials.ts', 'drift: 0.02 }', 'drift: 0.5 }', 'broad and elongated'),
    ('no tint', 'web/src/materials.ts', 'tint: 0.18,', 'tint: 0,', 'aslant the colour'),
    ('a loud tint', 'web/src/materials.ts', 'tint: 0.18,', 'tint: 0.4,', 'aslant the colour'),
    ('the tint head-on', 'web/src/materials.ts', '${glslFloat(GABLE_SHEET.tint)} * ( 1.0 - smoothstep(', '${glslFloat(GABLE_SHEET.tint)} * ( 1.0 - 0.0 * smoothstep(', 'aslant the colour'),
    ('the tint thickens', 'web/src/materials.ts', 'gl_FragColor.a = mix( gl_FragColor.a, gl_FragColor.a + ( 1.0 - gl_FragColor.a ) * ${glslFloat(GABLE_THICKEN.thicken)}', 'gl_FragColor.a = mix( gl_FragColor.a, gl_FragColor.a + ( 1.0 - gl_FragColor.a ) * ( ${glslFloat(GABLE_THICKEN.thicken)} + gr )', 'aslant the colour'),
    ('the old panel', 'web/src/shed.ts', 'depth: 2.4, panel: 1.6,', 'depth: 2.4, panel: 1.15,', 'panel is the glazing'),
    ('points off the mullions', 'web/src/shed.ts', '(_, i) => (i - k) * panel)', '(_, i) => (i - k) * panel + 0.3)', 'panel is the glazing'),
    ('the X back', 'web/src/shed.ts', '    const [ya, yb] = i % 2 === 0 ? [y0, top] : [top, y0]; // round F13b: one diagonal a panel, zigzagging (a Warren with the verticals)\n    out.push(', '    for (const [ya, yb] of [[y0, top], [top, y0]]) out.push(', 'panel is the glazing'),
    ('all one way', 'web/src/shed.ts', 'const [ya, yb] = i % 2 === 0 ? [y0, top] : [top, y0]; // round F13b', 'const [ya, yb] = [y0, top]; // round F13b', 'panel is the glazing'),
    ('a sliver end panel', 'web/src/shed.ts', 'Math.floor((half - 0.4) / panel)', 'Math.floor((half + 1.5) / panel)', 'panel is the glazing'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round34.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round34-', dir=out) as tmp:
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
