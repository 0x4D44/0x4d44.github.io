"""Catch round 18's platform regressions (the night coping floor under the roof only, and the joint jog at the tops/strip boundary, B4; the blade's post and the wire trolleys, B5) through web/tests/kx-platform-round18.test.ts only.
Usage: python3 -I -u tools/mutation/kx-platform-round18.py SOURCE WORKTREE_SCRATCH
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
    ('the floor outside the roof too', 'web/src/furniture.ts', "const cover = underShedRoof(layout, c) ? 1 : 0;", "const cover = 1;", 'B4: after dark the coping floor'),
    ('the roof ends uncut', 'web/src/furniture.ts', "    for (const vb of [0, layout.length]) {", "    for (const vb of [] as number[]) {", 'B4: after dark the coping floor'),
    ('the roof only to its south half', 'web/src/furniture.ts', "return u >= 0 && u <= layout.width && v >= 0 && v <= layout.length;", "return u >= 0 && u <= layout.width && v >= 0 && v <= layout.length / 2;", 'B4: after dark the coping floor'),
    ('the floor unscaled by cover', 'web/src/materials.ts', " * vKxCover * uWinNight );", " * uWinNight );", 'B4: after dark the coping floor'),
    ('the floor flat again', 'web/src/materials.ts', " * diffuseColor.rgb / vec3( ${glslFloat(p.r)}, ${glslFloat(p.g)}, ${glslFloat(p.b)} )", "", 'B4: after dark the coping floor'),
    ('the other stations floored too', 'web/src/materials.ts', "  platformEdgeStrip: () => nearer(tiled('platformEdge')),", "  platformEdgeStrip: () => copingNight(nearer(tiled('platformEdge'))),", 'B4: after dark the coping floor'),
    ('the cover attribute unpassed', 'web/src/materials.ts', "#include <begin_vertex>\\nvKxCover = kxCover;", "#include <begin_vertex>\\nvKxCover = 1.0;", 'B4: after dark the coping floor'),
    ('the 12 mm lift back', 'web/src/furniture.ts', "export const SHED_STRIP_LIFT = 0.001;", "export const SHED_STRIP_LIFT = 0.012;", 'B4: the same slab joint'),
    ('a 3 mm lift', 'web/src/furniture.ts', "export const SHED_STRIP_LIFT = 0.001;", "export const SHED_STRIP_LIFT = 0.003;", 'B4: the same slab joint'),
    ('the strip v off by 2 cm', 'web/src/furniture.ts', "return [dot2(rel, e.inward), worldV ? -p[1] : s0 + dot2(rel, e.dir)];", "return [dot2(rel, e.inward), worldV ? -p[1] + 0.02 : s0 + dot2(rel, e.dir)];", 'B4: the same slab joint'),
    ('the post through the faces', 'web/src/furniture.ts', "b.aabb(-0.05, 0, -0.05, 0.05, BLADE.top - BLADE.size, 0.05, IRON);", "b.aabb(-0.05, 0, -0.05, 0.05, BLADE.top, 0.05, IRON);", 'B5: no blade post'),
    ('the post 30 cm into the panel', 'web/src/furniture.ts', "b.aabb(-0.05, 0, -0.05, 0.05, BLADE.top - BLADE.size, 0.05, IRON);", "b.aabb(-0.05, 0, -0.05, 0.05, BLADE.top - BLADE.size + 0.3, 0.05, IRON);", 'B5: no blade post'),
    ('thick wire: slabs', 'web/src/furniture.ts', "export const TROLLEY = { n: 4, pitch: 0.16, len: 0.85, wire: 0.012 } as const;", "export const TROLLEY = { n: 4, pitch: 0.16, len: 0.85, wire: 0.2 } as const;", 'B5: no blade post'),
    ('one trolley', 'web/src/furniture.ts', "export const TROLLEY = { n: 4, pitch: 0.16, len: 0.85, wire: 0.012 } as const;", "export const TROLLEY = { n: 1, pitch: 0.16, len: 0.85, wire: 0.012 } as const;", 'B5: no blade post'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-platform-round18.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-platform-round18-', dir=out) as tmp:
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
