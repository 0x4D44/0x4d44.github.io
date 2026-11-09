"""Bounded CLI-semantic mutations for synthetic berth reconciliation tests.

Usage: python3 -I -u tools/mutation/berths-cli.py <kings-cross-src> <worktree/.scratch>
Each mutant runs the focused synthetic CLI suite in an isolated copied tree.
"""
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
scratch.mkdir(parents=True, exist_ok=True)

MUTATIONS = [
    ('removed anchor step inventory is omitted', 'seen: new Map(observationInventory(recordings, builtMap.area).map(({ berth, observations }) => [berth, observations.step]))', 'seen: new Map()'),
    ('geographic review is omitted from candidate map', 'const candidateMap = geographicReview?.map ?? builtMap;', 'const candidateMap = builtMap;'),
    ('geographic evidence provenance is omitted', "...(geographicSourceHash ? [geographicSourceHash] : []),", ''),
    ('geographic decisions are omitted from report', '...(geographicEvidence ? { geographicEvidence } : {}),', ''),
    ('preserve mode adopts candidate anchor geometry', 'anchors: previous.anchors,', 'anchors: candidate.anchors,'),
    ('candidate-only placement loses pending reason', "reason: 'no-evidence' as const,\n    detail: `Candidate-pending-validation:", "reason: 'conflict' as const,\n    detail: `Candidate-pending-validation:"),
    ('position displacement is erased', 'displacementM: Math.hypot(next.point[0] - old.point[0], next.point[1] - old.point[1])', 'displacementM: 0'),
    ('position-review cause is misreported', "cause: 'candidate-position-review'", "cause: 'unbounded-or-ambiguous-chain'"),
    ('previous map requirement is bypassed', "if (preservePositions && !previous) throw new Error('--preserve-positions requires --previous');", "if (false && preservePositions && !previous) throw new Error('--preserve-positions requires --previous');"),
    ('corpus without geographic evidence is accepted', "if (corpus && !geographicEvidence) throw new Error('--corpus requires --geographic-evidence');", "if (false && corpus && !geographicEvidence) throw new Error('--corpus requires --geographic-evidence');"),
    ('source hash is fabricated', "createHash('sha256').update(bytes).digest('hex')", "'0'.repeat(64)"),
    ('berths report JSON output guard is removed',
     'await Promise.all(outputs.map(([name]) => checkOutputFile(outDir, name)));',
     "await Promise.all(outputs.filter(([name]) => name !== 'berths-report.json').map(([name]) => checkOutputFile(outDir, name)));")
]


def run(package):
    return kxmut.run_process(
        ['node', '--test', '--test-reporter=tap', '--test-timeout=15000', 'tools/tests/berths.test.ts'],
        cwd=package, timeout=25)


def test_names(output, prefix):
    return set(re.findall(rf'^{prefix} \d+ - (berths CLI: [^\n]+)$', output, re.M))


def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        name = re.search(r'^not ok \d+ - (berths CLI: [^\n]+)$', block, re.M)
        if name and re.search(r"code: ['\"]?ERR_ASSERTION", block, re.M):
            failures.add(name[1])
    return failures


killed = 0
observed = set()
survivors = []
with tempfile.TemporaryDirectory(prefix='berths-cli-mutations-', dir=scratch) as temporary:
    root = Path(temporary)
    package = root / 'kings-cross-src'
    package.mkdir()
    shutil.copytree(src / 'core', package / 'core')
    (package / 'tools').mkdir()
    (package / 'tools' / 'tests').mkdir()
    (package / 'tools' / 'mutation').mkdir()
    shutil.copy2(src / 'tools' / 'berths.ts', package / 'tools' / 'berths.ts')
    shutil.copy2(src / 'tools' / 'tests' / 'berths.test.ts', package / 'tools' / 'tests' / 'berths.test.ts')
    shutil.copy2(src / 'package.json', package / 'package.json')
    original = (package / 'tools' / 'berths.ts').read_text()
    baseline = run(package)
    if baseline.returncode:
        print(baseline.stdout + baseline.stderr)
        sys.exit('Baseline synthetic CLI suite must pass before mutation testing')
    expected = test_names(baseline.stdout, 'ok')
    total = re.search(r'^# tests (\d+)$', baseline.stdout, re.M)
    if total is None or len(expected) != int(total[1]):
        sys.exit('Baseline TAP output is incomplete; cannot prove every test red')

    for label, old, new in MUTATIONS:
        if old not in original:
            survivors.append(label)
            print(f'[INVALID] {label}: source pattern missing', flush=True)
            continue
        (package / 'tools' / 'berths.ts').write_text(original.replace(old, new, 1))
        try:
            result = run(package)
        except subprocess.TimeoutExpired as error:
            survivors.append(label)
            print(f'[INVALID] {label}: {kxmut.why(error)}', flush=True)
            continue
        failed = assertion_failures(result.stdout)
        named = test_names(result.stdout, 'not ok')
        complete = re.search(r'^# tests (\d+)$', result.stdout, re.M)
        if failed and failed == named and complete and int(complete[1]) == len(expected) and not result.stderr:
            killed += 1
            observed.update(failed)
            print(f'[KILLED] {label}', flush=True)
            for name in sorted(failed):
                print(f'  {name}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED/INVALID] {label}', flush=True)
            if result.returncode:
                print(result.stdout + result.stderr, flush=True)

print(f'\n{killed}/{len(MUTATIONS)} mutations caught; {len(observed & expected)}/{len(expected)} tests observed fail')
for name in sorted(expected - observed):
    print(f'NEVER RED: {name}')
for label in survivors:
    print(f'NOT CAUGHT: {label}')
sys.exit(1 if survivors or expected - observed else 0)
