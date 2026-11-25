"""Catch round 10's roof regressions (the crown rail in the seams' paint, the north end rib's lips and lighter top) through
web/tests/kx-roof-round10.test.ts only.
Usage: python3 -I -u tools/mutation/kx-roof-round10.py SOURCE WORKTREE_SCRATCH
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
    ('crown rails back in the ribs\' paint', 'web/src/shed.ts', "outer.box([uc, top + h, -L / 2], [size, size, L], { color: seamPaint });", "outer.box([uc, top + h, -L / 2], [size, size, L]);", 'crown walkway rail'),
    ('rail posts back in the ribs\' paint', 'web/src/shed.ts', "{ skip: ['-y'], color: seamPaint });", "{ skip: ['-y'] });", 'crown walkway rail'),
    ('no lips', 'web/src/shed.ts', "for (const [r0, r1] of [[R, R + lw], [R + gd - lw, R + gd + over]]) ring(", "for (const [r0, r1] of [] as number[][]) ring(", 'lip along both edges'),
    ('lips buried in the rib', 'web/src/shed.ts', "ring((r0 + r1) / 2, -L - gt - lp / 2,", "ring((r0 + r1) / 2, -L - gt + lp / 2,", 'lip along both edges'),
    ('outer lip without its overhang', 'web/src/shed.ts', "[R + gd - lw, R + gd + over]]", "[R + gd - lw, R + gd]]", 'lip along both edges'),
    ('one thick band, not two lips', 'web/src/shed.ts', "[[R, R + lw], [R + gd - lw, R + gd + over]]", "[[R, R + gd + over]]", 'lip along both edges'),
    ('gable rib top without its sheen', 'web/src/shed.ts', "['+x', '-x', '-y', '+z', '-z'], sheenPaint);", "['+x', '-x', '-y', '+z', '-z']);", 'lighter tone'),
    ('end-rib cap top without its sheen', 'web/src/shed.ts', "skip: ['+x', '-x', '-y', '+z', '-z'], color: sheenPaint });", "skip: ['+x', '-x', '-y', '+z', '-z'] });", 'lighter tone'),
    ('sheen as dark as the paint', 'web/src/shed.ts', 'ribSheen: 0x5a646d,', 'ribSheen: 0x3a4148,', 'lighter tone'),
    ('sheen on the underside', 'web/src/shed.ts', "['+x', '-x', '-y', '+z', '-z'], sheenPaint);", "['+x', '-x', '+y', '+z', '-z'], sheenPaint);", 'lighter tone'),
]

def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-roof-round10.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-roof-round10-', dir=out) as tmp:
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
