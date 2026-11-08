"""Synthetic board mutations; only named TAP assertion failures count.
Usage: python3 -I -u tools/mutation/board.py <kings-cross-src> <worktree/.scratch>
Copies the board projection, its synthetic tests and the tiny shared graph core.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
F = 'web/src/board.ts'
M = [
    ('reverse-directed stop t ignored', [
        ('const t = s.edge.a === stop.from ? stop.t : 1 - stop.t;', 'const t = stop.t;'),
    ]),
    ('B berth platform fallback omitted', [
        ("const lastPlatform = anchorPlatform(byBerth.get(train.lastBerth ?? '')) ?? namedPlatform(train.lastBerth);",
         "const lastPlatform = anchorPlatform(byBerth.get(train.lastBerth ?? ''));"),
    ]),
    ('moving platform target ignored', [
        ("const target = anchorPlatform(byBerth.get(train.targetBerth ?? '')) ?? namedPlatform(train.targetBerth);",
         'const target = undefined;'),
    ]),
    ('withheld boundary continuation ignored', [
        ("const continuation = /Boundary continuation north from (\\w+):/.exec(u.detail);",
         "const continuation = /Boundary continuation north from NEVER:/.exec(u.detail);"),
    ]),
    ('curved rail distance ignored', [
        ('const path = shortestPath(graph, from!, to!);', 'const path = null;'),
    ]),
    ('departure retention boundary shortened', [
        ('nowMs - r.leftAtMs! <= retentionMs', 'nowMs - r.leftAtMs! < retentionMs'),
    ]),
    ('missing standing train called a departure', [
        ("!train && old.state === 'departing'", '!train'),
    ]),
    ('sample platform rows omitted', [
        ("sample: mode === 'sample'", 'sample: false'),
    ]),
    ('renderer leaves feed values unescaped', [
        ("value.replace(/[&<>\"']/g", 'value.replace(/[&]/g'),
    ]),
    ('simulation rewind retains dwell history', [
        ('options.previous?.mode === mode && options.previous.timeMs <= nowMs ? options.previous : undefined',
         'options.previous?.mode === mode ? options.previous : undefined'),
    ]),
    ('narrow board does not start collapsed', [
        ('let collapsed = narrow.matches, chosen = false, html = \'\';', "let collapsed = false, chosen = false, html = '';"),
    ]),
    ('board top overlaps the page controls', [
        ('.kx-board{position:fixed;top:52px;left:16px;', '.kx-board{position:fixed;top:0px;left:16px;'),
    ]),
]


def run(work):
    return subprocess.run(
        ['node', '--test', '--test-reporter=tap', '--test-timeout=20000', 'web/tests/board.test.ts'],
        cwd=work, text=True, capture_output=True, stdin=subprocess.DEVNULL, timeout=40,
    )


def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - ([^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION(?:['\"]|$)", block, re.M):
            failures.add(name[1])
    return failures


def complete_tests(output, expected):
    names = re.findall(r'^(?:ok|not ok) \d+ - ([^\n]+)$', output, re.M)
    total = re.search(r'^# tests (\d+)$', output, re.M)
    return total is not None and int(total[1]) == len(expected) and len(names) == len(expected) and set(names) == expected


scratch.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix='board-mutation-', dir=scratch))
survivors = []
failed_tests = set()
try:
    for directory in ['core', 'web/src', 'web/tests']:
        (root / directory).mkdir(parents=True, exist_ok=True)
    for name in ['anchors.ts', 'graph.ts', 'geo.ts']:
        shutil.copy2(src / 'core' / name, root / 'core' / name)
    shutil.copy2(src / F, root / F)
    shutil.copy2(src / 'web/tests/board.test.ts', root / 'web/tests/board.test.ts')
    shutil.copy2(src / 'package.json', root / 'package.json')
    (root / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
    original = (src / F).read_text()
    baseline = run(root)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('Baseline failed')
    expected = set(re.findall(r'^ok \d+ - ([^\n]+)$', baseline.stdout, re.M))
    if not expected or not complete_tests(baseline.stdout, expected):
        raise SystemExit('Baseline TAP output is incomplete; cannot prove every test fails once')
    for label, replacements in M:
        (root / F).write_text(original)
        changed = original
        for old, new in replacements:
            if old not in changed:
                raise SystemExit(f'Mutation pattern missing: {label}: {old}')
            changed = changed.replace(old, new, 1)
        (root / F).write_text(changed)
        try:
            result = run(root)
            assertion_names = assertion_failures(result.stdout)
            named_failures = set(re.findall(r'^not ok \d+ - ([^\n]+)$', result.stdout, re.M))
            if result.returncode and assertion_names and assertion_names == named_failures and complete_tests(result.stdout, expected) and not result.stderr:
                failed_tests.update(assertion_names)
                print(f'[CAUGHT] {label}: {", ".join(sorted(assertion_names))}', flush=True)
            else:
                survivors.append(label)
                print(f'[SURVIVED] {label} (survived or invalid TAP/runtime result)', flush=True)
                if result.returncode:
                    print(result.stdout[-1500:], result.stderr[-1000:])
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[SURVIVED] {label} (timeout is not a kill)', flush=True)
    print(f'{len(M) - len(survivors)}/{len(M)} mutations caught; {len(failed_tests & expected)}/{len(expected)} tests observed red')
    for label in survivors:
        print('NOT CAUGHT:', label)
    for name in sorted(expected - failed_tests):
        print('NEVER RED:', name)
    if survivors or expected - failed_tests:
        raise SystemExit(1)
finally:
    shutil.rmtree(root)
