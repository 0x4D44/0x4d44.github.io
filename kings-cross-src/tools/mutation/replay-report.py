"""Replay-report CLI mutations; only the named replay assertion may kill each change.

Usage: python3 -I -u kings-cross-src/tools/mutation/replay-report.py kings-cross-src .scratch/replay-report-mutation
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be under worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

FILE = 'tools/replay-report.ts'
MUTATIONS = [
    ('second recording is ignored', FILE,
     'recordingPaths.push(v); else values.set(k, v);',
     'if (recordingPaths.length === 0) recordingPaths.push(v); else values.set(k, v);',
     'core/tests/replay-report.test.ts', 'CLI combines multiple recordings'),
    ('incomplete growing tail is retained', FILE,
     'if (!hasIncompleteJsonPrefix(tail)) return { bytes, trailingBytesOmitted: 0 };',
     'if (true) return { bytes, trailingBytesOmitted: 0 };',
     'core/tests/replay-report.test.ts', 'growing recording capture omits only an incomplete final JSON line'),
    ('replay metrics use the supplied map instead of preserved map', FILE,
     'metrics: replayReport(data, rows, effectiveAnchors)',
     'metrics: replayReport(data, rows, anchors)',
     'core/tests/replay-report.test.ts', 'optional SMART reconciliation classifies candidates before replay metrics'),
    ('Axis 04 omits replay reproduction', 'tools/axis04-summary.ts',
     "replayReproduction = reproduction(object(input.replay.reproducibility).command, 'Recompute replay berth and motion report', 'report');",
     'replayReproduction = null;', 'tools/tests/axis04-summary.test.ts',
     'Axis 04 links a multi-recording berth report'),
]

NEW_TESTS = [
    'CLI combines multiple recordings with union reasons, per-recording measures and bounded input hashes',
    'growing recording capture omits only an incomplete final JSON line',
    'optional SMART reconciliation classifies candidates before replay metrics and keeps positions pending',
    'Axis 04 links a multi-recording berth report and carries its compact evidence summary',
]


def run(work: Path, target: str | None = None, pattern: str | None = None) -> subprocess.CompletedProcess[str]:
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=10000']
    if pattern:
        command.append(f'--test-name-pattern={pattern}')
    if target:
        command.append(target)
    else:
        command.extend(['core/tests/replay-report.test.ts', 'tools/tests/axis04-summary.test.ts'])
    return subprocess.run(command, cwd=work, capture_output=True, text=True,
                          stdin=subprocess.DEVNULL, timeout=45)


with tempfile.TemporaryDirectory(prefix='replay-report-', dir=scratch) as temp:
    repo = Path(temp)
    work = repo / 'kings-cross-src'
    work.mkdir()
    for name in ['core', 'tools', 'web']:
        shutil.copytree(src / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    (repo / '.scratch').mkdir(exist_ok=True)

    baseline = run(work)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('baseline replay-report tests must pass')
    baseline_names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    if not set(NEW_TESTS).issubset(baseline_names):
        raise SystemExit(f'new replay-report baseline assertions missing: {sorted(set(NEW_TESTS) - baseline_names)}')

    survivors = []
    observed = set()
    for index, (label, relative, old, new, target_test, test_name) in enumerate(MUTATIONS):
        target = work / relative
        original = (src / relative).read_text()
        if old not in original:
            raise SystemExit(f'missing mutation pattern: {label}')
        target.write_text(original.replace(old, new, 1))
        result = run(work, target_test, test_name)
        target.write_text(original)
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        expected = {name for name in NEW_TESTS if name.startswith(test_name)}
        complete = len(re.findall(r'^ok \d+ - |^not ok \d+ - ', result.stdout, re.M)) == 1
        failed_block = result.stdout.split(f'not ok 1 - {next(iter(expected), "")}')[-1] if expected else ''
        if result.returncode and failed == expected and len(expected) == 1 and complete and 'ERR_ASSERTION' in failed_block and not result.stderr:
            observed.update(failed)
            print(f'[CAUGHT] {label}: {next(iter(failed))}', flush=True)
        else:
            survivors.append(label)
            (scratch / f'{index:02d}.log').write_text(result.stdout + result.stderr)
            print(f'[SURVIVED] {label}', flush=True)

    print(f'{len(MUTATIONS) - len(survivors)}/{len(MUTATIONS)} caught; survivors: {survivors}')
    new_tests_not_caught = set(NEW_TESTS) - observed
    print(f'{len(set(NEW_TESTS) - new_tests_not_caught)}/{len(NEW_TESTS)} new replay-report/Axis 04 tests observed failing; never failed: {sorted(new_tests_not_caught)}')
    raise SystemExit(1 if survivors or new_tests_not_caught else 0)
