"""Catch round F12 regressions (front A6: the outside gable sheet dark head-on and lighter at grazing, a little pane life and one broad ramp, no mosaic,
glintEven 0 exactly as before; the deeper lattice girder) through web/tests/kx-front-round32.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round32.py SOURCE WORKTREE_SCRATCH
Anchors moved round F13 (the new pane, band and web figures), and round F13b.
Anchors moved round F14 (the gr line's max, the cloud's lift).
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
    ('the old angle law (strong head-on)', 'web/src/materials.ts', 'float gr = max( ${glslFloat(GABLE_SHEET.f0)} + ${glslFloat(1 - GABLE_SHEET.f0)} * pow(', 'float gr = max( 0.45 + 0.4 * pow(', 'head-on'),
    ('no Fresnel rise', 'web/src/materials.ts', '* pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 5.0 ), ', '* 0.0, ', 'head-on'),
    ('a pale sheet', 'web/src/materials.ts', 'tone: [0x35 / 255, 0x42 / 255, 0x4e / 255]', 'tone: [0x70 / 255, 0x72 / 255, 0x74 / 255]', 'head-on'),
    ('a grey sheet', 'web/src/materials.ts', 'tone: [0x35 / 255, 0x42 / 255, 0x4e / 255]', 'tone: [0x42 / 255, 0x42 / 255, 0x42 / 255]', 'head-on'),
    ('a high F0', 'web/src/materials.ts', 'f0: 0.05,', 'f0: 0.2,', 'head-on'),
    ('the lit colour kept', 'web/src/materials.ts', '43758.5453 ) - 1.0 ) ), uGlintEven );', '43758.5453 ) - 1.0 ) ), 0.5 * uGlintEven );', 'head-on'),  # anchor moved round F16 (the pane's offset after the sheet's mix)
    ('a loud pane offset', 'web/src/materials.ts', 'pane: 0.12,', 'pane: 0.3,', 'some life'),
    ('a loud cloud', 'web/src/materials.ts', 'lift: 0.2,', 'lift: 0.5,', 'some life'),
    ('dead panes', 'web/src/materials.ts', 'pane: 0.12, graze: 0.25, row: GLAZING.tier / 3, cloud: { lift: 0.2,', 'pane: 0, graze: 0.25, row: GLAZING.tier / 3, cloud: { lift: 0,', 'some life'),
    # 'a busy ramp' retired round F13b: round 32's grid samples one point a pane, so a cloud too busy aliases there; kx-front-round33's 'a sharp cloud' holds it
    ('the sheet everywhere', 'web/src/materials.ts', '43758.5453 ) - 1.0 ) ), uGlintEven );', '43758.5453 ) - 1.0 ) ), 1.0 );', 'exactly the old'),  # anchor moved round F16
    ('the alpha touched', 'web/src/materials.ts', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( gt,', 'gl_FragColor.a = mix( gl_FragColor.a, 1.0, 0.1 );\ngl_FragColor.rgb = mix( gl_FragColor.rgb, mix( gt,', 'exactly the old'),
    ('the old shallow girder', 'web/src/shed.ts', 'depth: 2.4, panel', 'depth: 1.5, panel', 'girder is front-d'),
    ('thin diagonals', 'web/src/shed.ts', 'web: [0.15, 0.15] as const', 'web: [0.1, 0.1] as const', 'girder is front-d'),
    ('thin chords', 'web/src/shed.ts', 'chord: [0.3, 0.3] as const', 'chord: [0.2, 0.25] as const', 'girder is front-d'),
    ('a solid wall', 'web/src/shed.ts', 'web: [0.15, 0.15] as const', 'web: [0.5, 0.5] as const', 'girder is front-d'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round32.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round32-', dir=out) as tmp:
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
