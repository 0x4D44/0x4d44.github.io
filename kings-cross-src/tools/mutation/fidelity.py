"""Bounded, synthetic mutations for the fidelity CLI; no browser, relay or private feed is opened."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit('usage: python3 -I tools/mutation/fidelity.py <kings-cross-src> <worktree .scratch output>')
PACKAGE, SCRATCH = (Path(p).resolve() for p in sys.argv[1:])
if (PACKAGE == SCRATCH or PACKAGE.is_relative_to(SCRATCH) or SCRATCH.is_relative_to(PACKAGE)
        or '.scratch' not in SCRATCH.parts or not PACKAGE.is_dir()):
    raise SystemExit('Choose a source package and a separate output under worktree .scratch')
TEST = 'tools/tests/fidelity.test.ts'
TESTS = [
    'fidelity CLI reports P0–P10 operational lengths with the current cited source',
    'fidelity CLI separates compact OSM, synthetic raw input, and actual drawn mesh lengths',
    'fidelity CLI reports the P9 cap as a separate documented drawing inference',
    'fidelity CLI distinguishes the partial concourse arc fit from overall roof evidence',
    'fidelity unresolved issues retain real survey, definition, gradient, and canal limits only',
]

MUTATIONS = [
    ('wrong P10 published length',
     "map(([ref, m]) => [ref, { m, source: PUBLISHED_LENGTH_SOURCE.citation }])",
     "map(([ref, m]) => [ref, { m: ref === '10' ? 276 : m, source: PUBLISHED_LENGTH_SOURCE.citation }])",
     TESTS[0]),
    ('wrong published citation URL',
     "url: 'https://sacuksprodnrdigital0001.blob.core.windows.net/sectional-appendix/Sectional%20Appendix%20full%20PDFs%20September%2026/London%20North%20Eastern%20%28NCS%29%20Sectional%20Appendix%20September%202026.pdf#page=110',",
     "url: 'https://example.invalid/sectional-appendix.pdf#page=110',",
     TESTS[0]),
    ('report compact P9 as drawn mesh length',
     'drawnMeshM: drawn?.drawnLengthM ?? null,',
     'drawnMeshM: p.lengthM,',
     TESTS[1]),
    ('claim the P9 inference is a survey',
     'independentSurvey: false,',
     'independentSurvey: true,',
     TESTS[2]),
    ('report partial arc radius as drawn roof extent',
     'drawnNorthSouthM: axis01.concourse?.drawnNorthSouthM ?? null,',
     'drawnNorthSouthM: canopy.radius,',
     TESTS[3]),
    ('restore stale 276 m unresolved claim',
     "'OSM polygon extents describe mapped physical footprints; the cited published figures are operational lengths.",
     "'Platform 10 has a 276 m published length. OSM polygon extents describe mapped physical footprints; the cited published figures are operational lengths.",
     TESTS[4]),
    ('restore stale 74 m radius claim',
     "'The concourse circle fit uses only a partial OSM arc; its radius is not the overall roof radius.",
     "'The concourse circle fit uses only a partial OSM arc; the published roof radius is 74 m.",
     TESTS[4]),
    ('claim every check passed',
     "'\\nOK: compact/raw OSM platform and track comparisons, arithmetic gauge and shed dimensions are inside their tolerances; Axis01 actual-mesh flags are reported separately.'",
     "'\\nOK: every check is inside tolerance.'",
     TESTS[4]),
]

if SCRATCH.exists():
    raise SystemExit('Choose fresh output; mutation directory already exists')
SCRATCH.mkdir(parents=True)


def run(root: Path, scratch: Path, timeout: int = 55):
    env = dict(os.environ)
    env['ROUND36_FIDELITY_SCRATCH'] = str(scratch)
    return subprocess.run(
        ['deltic', 'timeout', '45', 'node', '--test', '--test-reporter=tap',
         '--test-timeout=20000', TEST],
        cwd=root, env=env, stdin=subprocess.DEVNULL, capture_output=True,
        text=True, timeout=timeout,
    )


baseline = run(PACKAGE, SCRATCH / 'baseline-fixtures')
(SCRATCH / 'baseline.log').write_text(baseline.stdout + baseline.stderr)
if baseline.returncode:
    raise SystemExit('baseline failed\n' + baseline.stdout + baseline.stderr)
names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
if names != set(TESTS):
    raise SystemExit(f'baseline test set differs: {sorted(names)}')

seen, survivors, invalid = set(), [], []
source = (PACKAGE / 'tools/fidelity.ts').read_text()
for number, (label, old, new, expected) in enumerate(MUTATIONS, 1):
    if source.count(old) != 1:
        raise SystemExit(f'stale or ambiguous mutation {number}: {label}')
    with tempfile.TemporaryDirectory(prefix=f'case-{number:02d}-', dir=SCRATCH) as temporary:
        case = Path(temporary)
        mutated_package = case / 'tree' / 'kings-cross-src'
        mutated_package.parent.mkdir(parents=True)
        shutil.copytree(
            PACKAGE,
            mutated_package,
            ignore=shutil.ignore_patterns('.git', 'node_modules', '.scratch', 'dist', 'coverage'),
        )
        modules = PACKAGE / 'node_modules'
        if modules.exists():
            (mutated_package / 'node_modules').symlink_to(modules.resolve(), target_is_directory=True)
        tool = mutated_package / 'tools/fidelity.ts'
        tool.write_text(tool.read_text().replace(old, new, 1))
        try:
            result = run(mutated_package, case / 'fixtures')
        except subprocess.TimeoutExpired as error:
            invalid.append(label)
            (SCRATCH / f'{number:02d}.log').write_text(f'TIMEOUT: {label}\n{error.stdout or ""}{error.stderr or ""}')
            print(f'INVALID TIMEOUT: {label}', flush=True)
            continue
        output = result.stdout + result.stderr
        (SCRATCH / f'{number:02d}.log').write_text(output)
        failures = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        import_errors = ('SyntaxError:', 'ERR_MODULE_NOT_FOUND', 'ERR_IMPORT_', 'Cannot find package', 'ETIMEDOUT')
        assertion_killed = (
            result.returncode != 0 and expected in failures and 'ERR_ASSERTION' in result.stdout
            and not any(marker in output for marker in import_errors)
            and f'# tests {len(TESTS)}' in result.stdout
        )
        if assertion_killed:
            seen.update(failures)
            print(f'KILLED BY ASSERTION: {label} -> {expected}', flush=True)
        else:
            survivors.append(label)
            print(f'NOT PROVEN: {label}; expected test failure {expected}', flush=True)

print(f'{len(MUTATIONS) - len(survivors) - len(invalid)}/{len(MUTATIONS)} mutations caught by assertions; {len(invalid)} invalid runs')
print(f'{len(seen & names)}/{len(names)} tests seen failing; unproven: {sorted(names - seen)}')
if survivors:
    print(f'SURVIVED: {survivors}')
if invalid:
    print(f'INVALID: {invalid}')
raise SystemExit(1 if survivors or invalid or names - seen else 0)
