"""Catch round 15's platform regressions (the clock on its beam, its spandrel, cresting, bay and glow cap, B5; the strip's clamp, tactile and coping, B4) through
web/tests/kx-platform-round15.test.ts only.
Usage: python3 -I -u tools/mutation/kx-platform-round15.py SOURCE WORKTREE_SCRATCH
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
    ('an arm over the dial again', 'web/src/shed.ts', "  iron.box([x0 + beam, beamY, z], [0.1, 0.1, 0.1]); // its end boss\n", "  iron.box([x0 + beam, beamY, z], [0.1, 0.1, 0.1]); // its end boss\n  iron.box([x0 + beam / 2, y + 1, z], [beam, 0.12, 0.12]);\n", 'B5: the dial sits'),
    ('the dial lifted off the beam', 'web/src/shed.ts', 'beamDrop: 0.82,', 'beamDrop: 1.2,', 'B5: the dial sits'),
    ('a short beam, not past the dial', 'web/src/shed.ts', "  iron.box([x0 + beam / 2, beamY, z], [beam, bd, 0.12]);", "  iron.box([x0 + 0.4, beamY, z], [0.8, bd, 0.12]);", 'B5: the dial sits'),
    ('a straight strut, not the curved bracket', 'web/src/shed.ts', "const at = (a: number): [number, number] => [x0 + R + R * Math.cos(a), beamY - R + R * Math.sin(a)];", "const at = (a: number): [number, number] => [x0 + R * (1 - (a - Math.PI / 2) / (Math.PI / 2)), beamY - R * ((a - Math.PI / 2) / (Math.PI / 2))];", 'B5: the dial sits'),
    ('no cresting', 'web/src/shed.ts', "  for (const s of [-1, 1]) {\n    const xc = cx", "  for (const s of [] as number[]) {\n    const xc = cx", 'B5: the dial sits'),
    ('cresting one side only', 'web/src/shed.ts', "  for (const s of [-1, 1]) {\n    const xc = cx", "  for (const s of [1]) {\n    const xc = cx", 'B5: the dial sits'),
    ('off the rib, mid-bay over an arch', 'web/src/shed.ts', "  const z = -rib, cx = x0 + out,", "  const z = -(rib + 3.05), cx = x0 + out,", 'B5: fixed to a pier'),
    ('back beside the pole clock', 'web/src/shed.ts', 'export const PLATFORM_CLOCK = { v: 0.638,', 'export const PLATFORM_CLOCK = { v: 0.55,', 'B5: fixed to a pier'),
    ('the glow uncapped', 'web/src/shed.ts', 'wall: WEST_ARCADE.depth, glow: 0.6 }', 'wall: WEST_ARCADE.depth, glow: 1 }', 'B5: fixed to a pier'),
    ('the cap ignored by the night lights', 'web/src/night.ts', "material.map, (material.userData.glowScale as number | undefined) ?? 1));", "material.map, 1));", 'B5: fixed to a pier'),
    ('the cap leaks to every face', 'web/src/night.ts', "material.map, (material.userData.glowScale as number | undefined) ?? 1));", "material.map, (material.userData.glowScale as number | undefined) ?? 0.6));", 'B5: fixed to a pier'),
    ('the strip wraps across again (the hairline back)', 'web/src/materials.ts', "average: 0x878479, repeat: true, clampU: true,", "average: 0x878479, repeat: true,", 'B4'),
    ('the clamp not honoured', 'web/src/materials.ts', "        if (spec.clampU) t.wrapS = THREE.ClampToEdgeWrapping;", "        if (spec.clampU) t.wrapT = THREE.ClampToEdgeWrapping;", 'B4'),
    ('the tactile back to round 14', 'web/src/materials.ts', "band(0.5, 0.9, '#92886a');", "band(0.5, 0.9, '#8a8270');", 'B4'),
    ('the coping back to round 14', 'web/src/materials.ts', "band(0, 0.2, '#d4d4ce');", "band(0, 0.2, '#b4b4ae');", 'B4'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-platform-round15.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-platform-round15-', dir=out) as tmp:
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
