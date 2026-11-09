"""Run focused, isolated mutations against the Axis 03 dimension evidence tests.

Usage: python3 -I -u kings-cross-src/tools/mutation/axis03-evidence.py kings-cross-src .scratch/axis03-evidence-mutation
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be under worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

FILE = 'tools/axis03-evidence.ts'
TEST = 'tools/tests/axis03-evidence.test.ts'
WEB_TEST = 'web/tests/train-detail.test.ts'
WEB_CLASS_180 = 'Class 180: five cars of the fleet owner’s 23.71 and 23.02 m, single-leaf doors, no pantograph, a driven bogie and a trailer bogie on every car, and an uncovered Scharfenberg at each end'
TESTS = [
    'measures every ALL_KINDS coach body and roof envelope while excluding separate running gear',
    'uses the published Class 802 driving-car figure and selects the Class 180 fleet owner’s dimensions',
    'joins motion birth kinds only when recording and anchor hashes match',
    'labels missing source dimensions and model-derived measurements as non-independent',
    WEB_CLASS_180,
]
MUTATIONS = [
    ('Class 180 drawn formation loses primary car dimensions', 'core/train.ts', 'carLength: { value: 23.02,', 'carLength: { value: 23.03,', WEB_CLASS_180),
    ('pantograph mesh enters body envelope', FILE,
     "const BODY_MESH_NAMES = new Set(['body-shell', 'body-detail', 'livery-decals', 'cab-glass']);",
     "const BODY_MESH_NAMES = new Set(['body-shell', 'body-detail', 'livery-decals', 'cab-glass', 'pantograph-mesh']);", TESTS[0]),
    ('rail-relative roof height is replaced by envelope thickness', FILE,
     'heightAboveRailM: roundMm(box.max.y),',
     'heightAboveRailM: roundMm(envelopeHeightM),', TESTS[0]),
    ('Class 802 driving length is replaced by the Class 800/801 figure', FILE,
     'valueM: drive ? HULL_802_DRIVING_CAR.value : 26,',
     'valueM: drive ? 25.85 : 26,', TESTS[1]),
    ('actual drawn length falsely replaced by the reference figure', FILE, 'vehicleLengthM: car.length,', 'vehicleLengthM: figures.length.value,', TESTS[1]),
    ('Class 802 published driving figure falsely called assumed', FILE, '? HULL_802_DRIVING_CAR : lengthFigure', "? { ...HULL_802_DRIVING_CAR, basis: 'assumed' } : lengthFigure", TESTS[1]),
    ('Class 180 owner figure replaced by secondary number', 'core/train.ts', 'carLength: { value: 23.02,', 'carLength: { value: 23.03,', TESTS[1]),
    ('motion report recording hash is not checked', FILE,
     "if (input.sha256 !== expected!.sha256) throw new Error(`motion report recording ${index + 1} hash does not match the supplied recording`);",
     "if (false) throw new Error(`motion report recording ${index + 1} hash does not match the supplied recording`);", TESTS[2]),
    ('model-derived geometry is called independent verification', FILE,
     'independentVerification: false,', 'independentVerification: true,', TESTS[3]),
]


def run(work: Path, test_name: str | None = None) -> subprocess.CompletedProcess[str]:
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=10000']
    if test_name:
        command.append(f'--test-name-pattern={test_name}')
    command.extend([WEB_TEST if test_name == WEB_CLASS_180 else TEST] if test_name else [TEST, WEB_TEST])
    return kxmut.run_process(command, cwd=work, timeout=45)


with tempfile.TemporaryDirectory(prefix='axis03-evidence-', dir=scratch) as temp:
    repo = Path(temp)
    work = repo / 'kings-cross-src'
    work.mkdir()
    for name in ['core', 'tools', 'web']:
        shutil.copytree(src / name, work / name)
    for name in ['package.json', 'tsconfig.json']:
        shutil.copy2(src / name, work / name)
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)

    baseline = run(work)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('baseline axis03-evidence tests must pass')
    baseline_names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    if not set(TESTS).issubset(baseline_names):
        raise SystemExit(f'axis03 baseline assertions missing: {sorted(set(TESTS) - baseline_names)}')

    survivors: list[str] = []
    observed: set[str] = set()
    for label, relative, old, new, test_name in MUTATIONS:
        target = work / relative
        original = target.read_text()
        if old not in original:
            raise SystemExit(f'missing mutation pattern: {label}')
        target.write_text(original.replace(old, new, 1))
        try:
            result = run(work, test_name)
        except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap: not a kill
            survivors.append(label)
            print(f'[SURVIVED] {label} ({kxmut.why(error)}; that is not a kill)', flush=True)
            continue
        finally:
            target.write_text(original)
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        complete = len(re.findall(r'^ok \d+ - |^not ok \d+ - ', result.stdout, re.M)) == 1
        if result.returncode and failed == {test_name} and complete and 'ERR_ASSERTION' in result.stdout and not result.stderr:
            observed.add(test_name)
            print(f'[CAUGHT] {label}: {test_name}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED] {label}', flush=True)
            (scratch / f'{len(survivors):02d}.log').write_text(result.stdout + result.stderr)

    never_failed = set(TESTS) - observed
    print(f'{len(MUTATIONS) - len(survivors)}/{len(MUTATIONS)} mutations caught; survivors: {survivors}')
    print(f'{len(TESTS) - len(never_failed)}/{len(TESTS)} new assertions observed failing; never failed: {sorted(never_failed)}')
    raise SystemExit(1 if survivors or never_failed else 0)

try:
    scratch.rmdir()
except OSError:
    pass
