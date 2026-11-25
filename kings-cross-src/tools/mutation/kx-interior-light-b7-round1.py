"""Catch shed-interior B7 round 1's regressions (the shed's floor draws its lamps' pools: brighter under a lamp than midway and at the island's
edge, warm white, after dark and inside the shed only; the shed heads' bounded decals off; by day the floor's sky light falls from the crown toward the
vault walls, direct and indirect; round 1b: on-screen pool contrast 2.2-3.2:1) through web/tests/kx-interior-light-b7-round1.test.ts only.
Usage: python3 -I -u tools/mutation/kx-interior-light-b7-round1.py SOURCE WORKTREE_SCRATCH
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
    ('the decals back on (atmosphere)', 'web/src/atmosphere.ts', 'fill(SHED_POOL.decal)]', 'fill(1)]', 'decals are off'),
    ('the decal gain 1', 'web/src/kx-shed-pools.ts', 'moon: 0.2, decal: 0,', 'moon: 0.2, decal: 1,', 'decals are off'),
    ('the decal ignores its gain', 'web/src/streetlights.ts', "gl_FragColor.a *= vPoolGain;", "gl_FragColor.a *= 1.0;", 'decals are off'),
    ('the gain not passed', 'web/src/station-lamps.ts', 'poolGainAt:poolGain.length?(_s,i)=>poolGain[i]??1:undefined,', '', 'decals are off'),
    ('main not wired', 'web/src/main.ts', "  lightShedFloor([material('platformTop'), material('platformEdgeStripShed')], bakeShedFloor(layout, kxSites.shed));\n", "  void lightShedFloor; void bakeShedFloor; void material;\n", 'decals are off'),
    ('the floor light before the lights', 'web/src/kx-shed-pools.ts', ".replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${shedFloorGlsl()}`)", ".replace('#include <lights_fragment_begin>', `${shedFloorGlsl()}\\n#include <lights_fragment_begin>`)", 'decals are off'),
    ('a flat wash (broad pools)', 'web/src/kx-shed-pools.ts', 'SHED_POOL = { sigma: 1.2,', 'SHED_POOL = { sigma: 12,', 'B7 night'),
    ('spots, not pools', 'web/src/kx-shed-pools.ts', 'SHED_POOL = { sigma: 1.2,', 'SHED_POOL = { sigma: 0.8,', 'B7 night'),
    ('pools capped flat', 'web/src/kx-shed-pools.ts', 'spill: 0.18, max: 1.2,', 'spill: 0.18, max: 0.6,', 'B7 night'),
    ('a big spill', 'web/src/kx-shed-pools.ts', 'spill: 0.18, max: 1.2,', 'spill: 0.6, max: 1.2,', 'B7 night'),
    ('cool pools', 'web/src/kx-shed-pools.ts', 'tint: 0xffe6c4,', 'tint: 0xe6ecf5,', 'B7 night'),
    ('amber pools', 'web/src/kx-shed-pools.ts', 'tint: 0xffe6c4,', 'tint: 0xffbc74,', 'B7 night'),
    ('the moon kept under the roof', 'web/src/kx-shed-pools.ts', 'moon: 0.2, decal: 0,', 'moon: 0.5, decal: 0,', 'B7 night'),
    ('the pool not on the albedo', 'web/src/kx-shed-pools.ts', '* shedFloorNight ) * diffuseColor.rgb;', '* shedFloorNight ) * 0.15;', 'B7 night'),
    ('pools by day', 'web/src/kx-shed-pools.ts', 'float shedFloorNight = shedFloorT.g * uShedFloorNight;', 'float shedFloorNight = shedFloorT.g;', 'no pools by day'),
    ('no inside mask', 'web/src/kx-shed-pools.ts', 'return smoothstep(0, SHED_POOL.edge, Math.min(u, layout.width - u, v, layout.length - v));', 'return 1;', 'none outside'),
    ('no crown fall-off', 'web/src/kx-shed-pools.ts', 'SHED_CROWN_FLOOR = { flank: 0.6,', 'SHED_CROWN_FLOOR = { flank: 1,', 'B7 day'),
    ('a deeper crown fall-off (0.45)', 'web/src/kx-shed-pools.ts', 'SHED_CROWN_FLOOR = { flank: 0.6,', 'SHED_CROWN_FLOOR = { flank: 0.45,', 'B7 day'),
    ('the crown term inverted', 'web/src/kx-shed-pools.ts', 'return 1 - smoothstep(SHED_CROWN_FLOOR.from,', 'return smoothstep(SHED_CROWN_FLOOR.from,', 'B7 day'),
    ('the crown term at night', 'web/src/kx-shed-pools.ts', '* shedFloorT.g * uShedFloorDay;\n', '* shedFloorT.g;\n', 'B7 day'),
    ('the crown term on the sky only (round 1)', 'web/src/kx-shed-pools.ts', '    reflectedLight.directDiffuse *= shedFloorDayK;\n', '', 'B7 day'),
    ('the crown term on the sun only', 'web/src/kx-shed-pools.ts', '    reflectedLight.indirectDiffuse *= shedFloorDayK;\n', '', 'B7 day'),
    ('pools clipped (gain doubled)', 'web/src/kx-shed-pools.ts', 'gain: 0.85,', 'gain: 1.7,', 'B7 night'),
    ('the round-1 pools (broad, half moon)', 'web/src/kx-shed-pools.ts', 'sigma: 1.2, spill: 0.18, max: 1.2, gain: 0.85, tint: 0xffe6c4, moon: 0.2,', 'sigma: 3.5, spill: 0.15, max: 1.2, gain: 0.7, tint: 0xffe6c4, moon: 0.5,', 'B7 night'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-interior-light-b7-round1.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-interior-light-b7-round1-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web'):
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
