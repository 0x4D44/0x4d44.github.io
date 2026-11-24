"""Catch round 6's texture regressions (the fascia lettering, the entrance glass's structure, the tower's brick stock) through web/tests/kx-textures-round6.test.ts only.
Usage: python3 -I -u tools/mutation/kx-textures-round6.py SOURCE WORKTREE_SCRATCH
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
    ('fascia blank', 'web/src/shed.ts', '  g.fillText(FRONT_FASCIA_TEXT.words, w / 2, h / 2, w * 0.8);', '', 'each entrance\'s navy fascia'),
    ('lettering dark', 'web/src/shed.ts', "ink: '#e8e4d8'", "ink: '#2a3550'", 'each entrance\'s navy fascia'),
    ('lettering runs past the ends', 'web/src/shed.ts', 'w / 2, h / 2, w * 0.8);', 'w / 2, h / 2, w * 1.2);', 'each entrance\'s navy fascia'),
    ('fascia face tiled in metres', 'web/src/shed.ts', '[[0, 0], [1, 0], [1, 1], [0, 1]], { facing: [0, 0, 1] }); // its face', '[[0, 0], [fw, 0], [fw, 1], [0, 1]], { facing: [0, 0, 1] }); // its face', 'each entrance\'s navy fascia'),
    ('flat glass', 'web/src/shed.ts', 'stops: [[0, 0.62], [2.2, 0.7], [2.75, 1.0], [3.15, 1.0], [3.35, 0.8], [4.4, 0.95]]', 'stops: [[0, 0.9], [4.4, 0.9]]', 'entrance glass is structured'),
    ('glow not shaped', 'web/src/shed.ts', ", { defines: { KX_GLOW_BY_MAP: '' } })", ', {})', 'entrance glass is structured'),
    ('structure upside down', 'web/src/shed.ts', 't.repeat.set(0, 1 / GLASS_STRUCTURE.height);', 't.repeat.set(0, -1 / GLASS_STRUCTURE.height);', 'entrance glass is structured'),
    ('tower brick untinted', 'web/src/shed.ts', 'export const TOWER_BRICK_TINT = 0xb4a68a;', 'export const TOWER_BRICK_TINT = 0xffffff;', 'darker yellow stock'),
    ('tower brick untinted at night', 'web/src/shed.ts', "if (kind === 'tower' && source === 'brickFoot') m.color.multiply", "if (kind === 'none' && source === 'brickFoot') m.color.multiply", 'darker yellow stock'),
    ('tower brick grey-blue', 'web/src/shed.ts', 'export const TOWER_BRICK_TINT = 0xb4a68a;', 'export const TOWER_BRICK_TINT = 0x8a9ab4;', 'darker yellow stock'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-textures-round6.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-textures-round6-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 3 else 0)
