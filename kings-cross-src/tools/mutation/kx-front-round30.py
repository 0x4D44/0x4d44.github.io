"""Catch round F10 regressions (front A7: the glass-order orbit's camera paths, masked frame difference, spike rule, JSON record and --orbit switch) through tools/tests/orbit-evidence.test.mjs only.
Usage: python3 -I -u tools/mutation/kx-front-round30.py SOURCE WORKTREE_SCRATCH
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
    ('11 frames', 'tools/evidence.mjs', '{ frames: 12,', '{ frames: 11,', 'each orbit path'),
    ('the front path stops short of its plane', 'tools/evidence.mjs', 'front: 60,', 'front: 30,', 'each orbit path'),
    ('the gable path swings the wrong way', 'tools/evidence.mjs', 'gable: -80,', 'gable: 80,', 'each orbit path'),
    ('the path pulls in', 'tools/evidence.mjs', 'u = at.u + range * Math.cos(a)', 'u = at.u + 0.9 * range * Math.cos(a)', 'each orbit path'),
    ('the target drifts', 'tools/evidence.mjs', 'target: [...target], v };', 'target: [target[0] + 1, target[1], target[2]], v };', 'each orbit path'),
    ('uneven steps', 'tools/evidence.mjs', '* i / (ORBIT.frames - 1)', '* (i * i) / ((ORBIT.frames - 1) ** 2)', 'each orbit path'),
    ('alpha counted', 'tools/evidence.mjs', 'for (let c = 0; c < 3; c++)', 'for (let c = 0; c < 4; c++)', 'maskedMeanDiff is'),
    ('the mask is not clamped on the right', 'tools/evidence.mjs', 'x <= Math.min(width - 1, Math.ceil(r))', 'x <= Math.ceil(r)', 'maskedMeanDiff is'),
    ('the rect bottom exclusive', 'tools/evidence.mjs', 'y <= Math.min(height - 1, Math.ceil(btm))', 'y < Math.min(height - 1, Math.ceil(btm))', 'maskedMeanDiff is'),
    ('an empty mask reads 0', 'tools/evidence.mjs', 'return n ? sum / (3 * n) : null;', 'return n ? sum / (3 * n) : 0;', 'maskedMeanDiff is'),
    ('mismatched frames accepted', 'tools/evidence.mjs', "throw new Error('orbit frames differ in format');", '{}', 'maskedMeanDiff is'),
    ('2x is a spike', 'tools/evidence.mjs', 'spike: 3,', 'spike: 2,', 'orbitSpikes flags'),
    ('3x exactly is a spike', 'tools/evidence.mjs', 'if (d > floor && d > factor * m)', 'if (d > floor && d >= factor * m)', 'orbitSpikes flags'),
    ('no floor', 'tools/evidence.mjs', 'if (d > floor && d > factor * m)', 'if (d > factor * m)', 'orbitSpikes flags'),
    ('one neighbour each side', 'tools/evidence.mjs', '[i - 2, i - 1, i + 1, i + 2]', '[i - 1, i + 1]', 'orbitSpikes flags'),
    ('the mean, not the median', 'tools/evidence.mjs', 'const m = near.length % 2 ?', 'const m = 1 ? near.reduce((p, q) => p + q, 0) / near.length : near.length % 2 ?', 'orbitSpikes flags'),
    ('the median unsorted', 'tools/evidence.mjs', '.filter(x => x !== null && x !== undefined).sort((p, q) => p - q);', '.filter(x => x !== null && x !== undefined);', 'orbitSpikes flags'),
    ('names unpadded', 'tools/evidence.mjs', "`orbit-${path}-${String(i).padStart(2, '0')}", "`orbit-${path}-${String(i)}", 'orbitRecord names'),
    ('no x-ray suffix', 'tools/evidence.mjs', "const name = i => `orbit-${path}-${String(i).padStart(2, '0')}${mode === 'xray' ? '-xray' : ''}`;", "const name = i => `orbit-${path}-${String(i).padStart(2, '0')}`;", 'orbitRecord names'),
    ('no spike flag', 'tools/evidence.mjs', 'spike: spikes.includes(i) }', 'spike: false }', 'orbitRecord names'),
    ('no spike list', 'tools/evidence.mjs', 'spikes: spikes.map(name),', 'spikes: [],', 'orbitRecord names'),
    ('no glass order in the record', 'tools/evidence.mjs', 'glassOrder: f.glassOrder, diff: f.diff', 'diff: f.diff', 'orbitRecord names'),
    ('--orbit ignored', 'tools/evidence.mjs', "orbit: values.has('--orbit'),", 'orbit: false,', 'the orbit is shot only'),
    ('an orbit frame in an element', 'tools/evidence.mjs', "'front-oblique-xray', 'roof-above-xray', 'north-gable',", "'front-oblique-xray', 'roof-above-xray', 'orbit-front-00', 'north-gable',", 'the orbit is shot only'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'tools/tests/orbit-evidence.test.mjs'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-front-round30-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 5 else 0)
