"""Catch round 19's platform regressions (the nested trolleys, the trolley point beside its group, the neutral night dial, the clock's cheeks and roundels, B5) through web/tests/kx-platform-round19.test.ts only.
Usage: python3 -I -u tools/mutation/kx-platform-round19.py SOURCE WORKTREE_SCRATCH
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
    ('splayed: no nesting', 'web/src/furniture.ts', "export const TROLLEY = { n: 4, pitch: 0.27,", "export const TROLLEY = { n: 4, pitch: 0.6,", 'B5: the trolleys'),
    ('no castors', 'web/src/furniture.ts', "for (const z of [z0 + 0.03, z1 - 0.06]) b.aabb(sx - 0.025, 0, z,", "for (const z of [z0 + 0.03, z1 - 0.06]) b.aabb(sx - 0.025, 0.07, z,", 'B5: the trolleys'),
    ('upright handles', 'web/src/furniture.ts', "bar(sx, 0.08, z0, 1.02, z0 - 0.16, TROLLEY_GREY);", "bar(sx, 0.08, z0, 1.02, z0 - 0.001, TROLLEY_GREY);", 'B5: the trolleys'),
    ('no base frame', 'web/src/furniture.ts', "b.aabb(sx - q, 0.07, z0, sx + q, 0.07 + 2 * q, z1, TROLLEY_GREY, true);", "", 'B5: the trolleys'),
    ('handle over the nose', 'web/src/furniture.ts', "b.aabb(-hw - 0.03, 1.0, z0 - 0.17, hw + 0.03, 1.0 + 3 * q, z0 - 0.17 + 3 * q, IRON, true);", "b.aabb(-hw - 0.03, 1.0, z1, hw + 0.03, 1.0 + 3 * q, z1 + 3 * q, IRON, true);", 'B5: the trolleys'),
    ('the trolley point on the centreline', 'web/src/furniture.ts', "side === 'mid' ? b.mid : !b.loTrack && b.hiTrack ? b.s0 : b.s1", "b.mid", 'B5: the trolley point'),
    ('the island averaged back', 'web/src/furniture.ts', "const pick = side === 'wall' ? [pts.reduce(", "const pick = side === 'never' ? [pts.reduce(", 'B5: the trolley point'),
    ('not beside its group', 'web/src/furniture.ts', "for (const d of [...first, ...spec.offsets]) {", "for (const d of [...spec.offsets]) {", 'B5: the trolley point'),
    ('the dial blue again', 'web/src/night.ts', "= [1.18, 1.1, 0.96];", "= [1.1, 1.1, 1.1];", 'B5: the platform clock\'s night dial'),
    ('the dial overwarm', 'web/src/night.ts', "= [1.18, 1.1, 0.96];", "= [1.3, 1.1, 0.85];", 'B5: the platform clock\'s night dial'),
    ('the roundels small again', 'web/src/shed.ts', "[[0.15, -0.15, 0.13],", "[[0.15, -0.15, 0.075],", 'B5: the platform clock has'),
    ('a roundel through the curve', 'web/src/shed.ts', "[[0.15, -0.15, 0.13],", "[[0.3, -0.3, 0.13],", 'B5: the platform clock has'),
    ('no cheek plates', 'web/src/shed.ts', "for (const f of [-1, 1]) iron.poly(fan.map(", "for (const f of []) iron.poly(fan.map(", 'B5: the platform clock has'),
    ('one cheek', 'web/src/shed.ts', "for (const f of [-1, 1]) iron.poly(fan.map(([px, py]): V3 => [px, py, z + (f * CHEEK.depth) / 2]), undefined, { facing: [0, 0, f] });", "if (s > 0) for (const f of [-1, 1]) iron.poly(fan.map(([px, py]): V3 => [px, py, z + (f * CHEEK.depth) / 2]), undefined, { facing: [0, 0, f] });", 'B5: the platform clock has'),
    ('the big roundel unpierced', 'web/src/shed.ts', "    const cuts = roundels.filter(([rx, , rr]) => edge(rx) < rr)", "    const cuts = roundels.filter(([rx, , rr]) => edge(rx) < -rr)", 'B5: the platform clock has'),
    ('the cheek unrimmed', 'web/src/shed.ts', "    for (let k = 0; k < 6; k++) {\n      const [ax, ay] = pt(", "    for (let k = 0; k < 0; k++) {\n      const [ax, ay] = pt(", 'B5: the platform clock has'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-platform-round19.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-platform-round19-', dir=out) as tmp:
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
