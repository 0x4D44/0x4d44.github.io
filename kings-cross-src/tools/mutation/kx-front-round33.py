"""Catch round F13 regressions (front A6/B3: the outside gables let through half the room, more pane life in a soft diagonal band, a secondary bar mid-pane
from outside only, the girder with both diagonals and verticals) through web/tests/kx-front-round33.test.ts only.
Usage: python3 -I -u tools/mutation/kx-front-round33.py SOURCE WORKTREE_SCRATCH
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
    ('the old opacity', 'web/src/shed.ts', 'opacity: 0.93,', 'opacity: 0.86,', 'lets through half'),
    ('the opacity outside unset', 'web/src/shed.ts', 'm.opacity = (was * (1 - k) + GABLE_OUTSIDE.opacity * k)', 'm.opacity = was', 'lets through half'),
    ('the old pane life', 'web/src/materials.ts', 'pane: 0.09,', 'pane: 0.04,', 'carry 6-10%'),
    ('a faint band', 'web/src/materials.ts', 'broad: 0.08,', 'broad: 0.03,', 'carry 6-10%'),
    ('a sharp band', 'web/src/materials.ts', 'band: [0.15, -0.12]', 'band: [1.5, -0.12]', 'carry 6-10%'),
    ('a checkerboard', 'web/src/materials.ts', 'pane: 0.09,', 'pane: 0.18,', 'carry 6-10%'),
    ('no secondary bar', 'web/src/materials.ts', 'shade: 0.3 }', 'shade: 0.0 }', 'secondary bar'),
    ('a wide bar', 'web/src/materials.ts', 'width: 0.05, soft: 0.06', 'width: 0.3, soft: 0.06', 'secondary bar'),
    ('the bar on the mullion', 'web/src/materials.ts', '- 0.5 ) * ${glslFloat(GLAZING.spacing)};', '- 0.0 ) * ${glslFloat(GLAZING.spacing)};', 'secondary bar'),
    ('two bars a pane', 'web/src/materials.ts', 'float gq = abs( fract( ( vGlassPos.x - uPaneX ) /', 'float gq = abs( fract( 2.0 * ( vGlassPos.x - uPaneX ) /', 'secondary bar'),
    ('the bar inside too', 'web/src/materials.ts', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( gt,', 'gl_FragColor.rgb = mix( gl_FragColor.rgb * ( 1.0 - 0.3 * ( 1.0 - smoothstep( 0.025, 0.085, gq ) ) ), mix( gt,', 'secondary bar'),
    ('one diagonal a panel', 'web/src/shed.ts', 'for (const [ya, yb] of [[y0, top], [top, y0]])', 'for (const [ya, yb] of [i % 2 === 0 ? [y0, top] : [top, y0]])', 'the girder has'),
    ('no verticals', 'web/src/shed.ts', 'for (let i = 0; i <= n; i++) out.push({ c: [uc - half + i * w, y0 + depth / 2, 0]', 'for (let i = 0; i < 0; i++) out.push({ c: [uc - half + i * w, y0 + depth / 2, 0]', 'the girder has'),
    ('short verticals', 'web/src/shed.ts', "s: [web[0], depth, web[1]], rotZ: 0, kind: 'mullion' });\n  return out;", "s: [web[0], depth / 2, web[1]], rotZ: 0, kind: 'mullion' });\n  return out;", 'the girder has'),
    ('heavy webs', 'web/src/shed.ts', 'web: [0.15, 0.15] as const', 'web: [0.2, 0.2] as const', 'the girder has'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-front-round33.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round33-', dir=out) as tmp:
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
