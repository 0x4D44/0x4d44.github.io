"""Strict named-assertion mutations; all temporary output stays in round21-geometry.
Usage: python3 -I -u kings-cross-src/tools/mutation/axis01-evidence.py kings-cross-src
"""
from __future__ import annotations
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = src.parent / '.scratch' / 'round21-geometry' / 'mutations'
scratch.mkdir(parents=True, exist_ok=True)
FILE = 'tools/axis01-evidence.ts'
TEST = 'tools/tests/axis01-evidence.test.ts'
NAMES = [
    'measures transformed mesh vertices and platform tops separately from operational lengths',
    'rays measure actual inner rail faces and react to changed drawn gauge',
    'proves station surface refs exclude underground eleven and measures actual 26 metre car',
    'measures portal brick planes against OSM boundary nodes with throat tolerance',
    'renders explicit numeric published flags and missing gauge evidence without claiming a survey',
    'compares the drawn concourse roof extent with Arup and flags a missing station footprint',
    'names the documented Platform 9 outline inference instead of an unexplained OSM mismatch',
]
MUTATIONS = [
    ('published flags suppressed', "p.withinPublishedTolerance === false", 'false', NAMES[4]),
    ('world transform ignored', '.applyMatrix4(o.matrixWorld).dot(axis)', '.dot(axis)', NAMES[0]),
    ('drawn gauge replaced by input constant', 'gaugeM: round(hits[0]!.distance + hits[1]!.distance)', 'gaugeM: GAUGE', NAMES[1]),
    ('car extent fabricated', 'const drawnCarLengthM = meshExtent(car, new THREE.Vector3(0, 0, 1));', 'const drawnCarLengthM = 25;', NAMES[2]),
    ('portal measured plane fabricated', 'const setbackM = [...planes].sort((a, b) => b[1] - a[1])[0]![0];', 'const setbackM = 0;', NAMES[3]),
    ('surface eleven hidden by report', "drawn: platforms.some(p => p.ref === '11')", 'drawn: false', NAMES[2]),
    ('concourse tolerance tightened past the drawn roof', 'withinTolerance: Math.abs(drawnNorthSouthM - 138) <= 3', 'withinTolerance: Math.abs(drawnNorthSouthM - 138) <= 0.3', NAMES[5]),
    ('documented outline inference reported as OSM mismatch', "? { code: 'platform-outline-inferred'", "? { code: 'platform-osm-tolerance'", NAMES[6]),
]

def run(work: Path, name: str | None = None):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=15000']
    if name:
        command.append('--test-name-pattern=^' + re.escape(name) + '$')
    command.append(TEST)
    return subprocess.run(command, cwd=work, capture_output=True, text=True,
                          stdin=subprocess.DEVNULL, timeout=45)

with tempfile.TemporaryDirectory(prefix='axis01-', dir=scratch) as temp:
    work = Path(temp)
    for folder in ['core', 'web', 'node_modules']:
        (work / folder).symlink_to(src / folder, target_is_directory=True)
    (work / 'tools' / 'tests').mkdir(parents=True)
    for name in [FILE, TEST, 'package.json']:
        shutil.copy2(src / name, work / name)
    baseline = run(work)
    names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    if baseline.returncode or baseline.stderr or names != set(NAMES):
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('baseline must pass every named assertion')
    observed = set()
    failures = []
    for label, old, new, name in MUTATIONS:
        target = work / FILE
        original = target.read_text()
        if original.count(old) != 1:
            raise SystemExit('mutation anchor must occur exactly once: ' + label)
        target.write_text(original.replace(old, new, 1))
        try:
            result = run(work, name)
        finally:
            target.write_text(original)
        failed = re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M)
        results = re.findall(r'^(?:not )?ok \d+ - ', result.stdout, re.M)
        if result.returncode and failed == [name] and len(results) == 1 and 'ERR_ASSERTION' in result.stdout and not result.stderr:
            observed.add(name)
            print('[CAUGHT] ' + label + ': ' + name, flush=True)
        else:
            failures.append(label)
            print(result.stdout, result.stderr)
    missing = set(NAMES) - observed
    print(f'{len(MUTATIONS) - len(failures)}/{len(MUTATIONS)} caught; {len(observed)}/{len(NAMES)} named tests seen fail; missing={sorted(missing)}')
    raise SystemExit(1 if failures or missing else 0)
