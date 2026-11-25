"""Catch round 7's regressions (the stems' shadow budget, the fascia lettering and its mips, the spade hands, the cornice's shadow line,
the impost) through web/tests/kx-signs-round7.test.ts only.
Usage: python3 -I -u tools/mutation/kx-signs-round7.py SOURCE WORKTREE_SCRATCH
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
    ('stems back in the porch', 'web/src/shed.ts', "  for (const [c, s] of stems) frames.box(c, s, { skip: ['+y', '-y'] });", "  for (const [c, s] of stems) canopy.box(c, s, { skip: ['+y', '-y'] });", 'stems are the entrances'),
    ('small letters', 'web/src/shed.ts', "ink: '#ffffff', height: 0.55,", "ink: '#ffffff', height: 0.35,", "fascia's white capitals"),
    ('no arrow', 'web/src/shed.ts', "[['\\u2190 Entrance', 0.27]", "[['Entrance', 0.27]", "fascia's white capitals"),
    ('one side only', 'web/src/shed.ts', "[['\\u2190 Entrance', 0.27], ['No entry', 0.75]]", "[['\\u2190 Entrance', 0.27]]", "fascia's white capitals"),
    ('no outline on the middle levels', 'web/src/shed.ts', 'if (h <= 32) { // pre-sharpened', 'if (h <= 0) { // pre-sharpened', "fascia's white capitals"),
    ('no pale band on the smallest levels', 'web/src/shed.ts', 'lerp(new THREE.Color(FRONT_FASCIA_TEXT.ink), FRONT_FASCIA_TEXT.band)', 'lerp(new THREE.Color(FRONT_FASCIA_TEXT.ink), 0)', "fascia's white capitals"),
    ('thin hands again', 'web/src/clocks.ts', 'minute: { length: 0.86, tail: 0.15, width: 0.065,', 'minute: { length: 0.86, tail: 0.15, width: 0.045,', 'broad at the boss'),
    ('no spade', 'web/src/clocks.ts', '[0.2, 0.72], [0.5, 0.84], [0, 1], [-0.5, 0.84], [-0.2, 0.72]', '[0.2, 0.72], [0.2, 0.84], [0, 1], [-0.2, 0.84], [-0.2, 0.72]', 'broad at the boss'),
    ('no cornice soffit', 'web/src/shed.ts', "{ facing: [0, -1, 0] }); // the cornice's soffit", "{ facing: [0, 1, 0] }); // the cornice's soffit", 'dark soffit and shadow line'),
    ('no shadow line', 'web/src/shed.ts', '{ facing: [0, 0, 1] }); // the shadow line', '{ facing: [0, 0, -1] }); // the shadow line', 'dark soffit and shadow line'),
    ('impost no prouder than the orders', 'web/src/shed.ts', 'impost: { height: 0.35, out: 1.1, past: 0.15 }', 'impost: { height: 0.35, out: 0.5, past: 0.15 }', 'dark soffit and shadow line'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-signs-round7.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-signs-round7-', dir=out) as tmp:
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
