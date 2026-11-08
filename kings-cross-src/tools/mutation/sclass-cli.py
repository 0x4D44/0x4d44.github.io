"""Run isolated synthetic CLI/report mutations; only named assertion failures count.
Usage: python3 -I -u tools/mutation/sclass-cli.py <kings-cross-src> <worktree/.scratch>
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
scratch.mkdir(parents=True, exist_ok=True)
MUTATIONS = [
    ('false cycles omitted from micro precision', 'n + h.heldOut.support + h.heldOut.unmatchedCycles', 'n + h.heldOut.support'),
    ('micro recall becomes precision', 'recall: trials ? support / trials : null', 'recall: cycles ? support / cycles : null'),
    ('decoded kind filter ignored', "(!kind || h.kind === kind)", 'true'),
    ('unknown hypotheses included in totals', "h.status === 'decoded' && (!kind || h.kind === kind)", '(!kind || h.kind === kind)'),
    ('route evidence passed to renderer as proceed', 'layer.setTable(analysis);', "layer.setTable({ ...analysis, hypotheses: analysis.hypotheses.map(h => ({ ...h, kind: 'proceed' })) });"),
    ('missing renderer bytes invented', 'Object.entries(bytes).map', "Object.entries({ '10': 0, ...bytes }).map"),
    ('final available picture ignored', 'layer.apply({ t: 0,', 'if (false) layer.apply({ t: 0,'),
    ('validation option bypassed', 'analyseSclassRecordings(events, anchors, { validation: args.validation })', 'analyseSclassRecordings(events, anchors)'),
    ('baseline comparison omitted', 'const before = baseline ? metrics(baseline, countHeads(baseline, anchors, overlay, track, analysis.trace.state)) : null;', 'const before = null;'),
    ('provenance digest fabricated', "createHash('sha256').update(bytes).digest('hex')", "'0'.repeat(64)"),
    ('provenance byte length wrong', 'bytes: bytes.length, sha256:', 'bytes: bytes.length + 1, sha256:'),
    ('runtime hypotheses omitted', 'const runtime = { ...analysis, currentStates: states, comparison, provenance };', 'const runtime = { ...analysis, hypotheses: undefined, currentStates: states, comparison, provenance };'),
]


def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=15000', 'tools/tests/sclass.test.mjs'],
                          cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=40)


def completed(output, expected):
    names = re.findall(r'^(?:ok|not ok) \d+ - ([^\n]+)$', output, re.M)
    total = re.search(r'^# tests (\d+)$', output, re.M)
    return total is not None and int(total[1]) == len(expected) and len(names) == len(expected) and set(names) == expected


def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - ([^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION(?:['\"]|$)", block, re.M):
            failures.add(name[1])
    return failures


survivors = []
observed = set()
killed = 0
with tempfile.TemporaryDirectory(prefix='sclass-cli-mutation-', dir=scratch) as temporary:
    # Preserve the production package-under-repository layout used by the CLI guard and tests.
    work = Path(temporary) / 'kings-cross-src'
    work.mkdir()
    for directory in ['core', 'web', 'tools']:
        shutil.copytree(src / directory, work / directory)
    for name in ['package.json', 'package-lock.json']:
        shutil.copy2(src / name, work / name)
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    target = work / 'tools/sclass.ts'
    original = target.read_text()
    baseline = run(work)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout + baseline.stderr)
        sys.exit('Baseline must pass before mutation testing')
    expected = set(re.findall(r'^ok \d+ - ([^\n]+)$', baseline.stdout, re.M))
    if not expected or not completed(baseline.stdout, expected):
        sys.exit('Incomplete or duplicate baseline TAP')
    print(f'Baseline: {len(expected)} tests passed', flush=True)
    for label, old, new in MUTATIONS:
        if original.count(old) != 1:
            survivors.append(label)
            print(f'[INVALID] {label}: source pattern count {original.count(old)}', flush=True)
            continue
        target.write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[INVALID] {label}: timeout', flush=True)
            continue
        failed = assertion_failures(result.stdout)
        named = set(re.findall(r'^not ok \d+ - ([^\n]+)$', result.stdout, re.M))
        runtime_error = re.search(r'SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_TEST_TIMEOUT|ETIMEDOUT', result.stdout + result.stderr)
        if result.returncode and failed and failed == named and completed(result.stdout, expected) and not result.stderr and not runtime_error:
            killed += 1
            observed.update(failed)
            print(f'[KILLED] {label}', flush=True)
            for name in sorted(failed):
                print(f'  {name}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED/INVALID] {label}\n{result.stdout}{result.stderr}', flush=True)

print(f'{killed}/{len(MUTATIONS)} mutations caught; {len(observed & expected)}/{len(expected)} tests observed fail', flush=True)
for name in sorted(expected - observed):
    print(f'NEVER RED: {name}')
for label in survivors:
    print(f'NOT CAUGHT: {label}')
sys.exit(1 if survivors or expected - observed else 0)
