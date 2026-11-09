"""Bounded mutations of the roof's supports (tree columns and wall struts). Usage: concourse-supports.py SOURCE SCRATCH.
Copies source once; never mutates SOURCE. Kills require assertion evidence, not load failures.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

src, scratch = (Path(p).resolve() for p in sys.argv[1:])
scratch.mkdir(parents=True, exist_ok=True)
work = scratch / 'work'
if work.exists():
    raise SystemExit('Choose a new scratch directory; an existing work copy is retained.')
shutil.copytree(src, work, ignore=shutil.ignore_patterns('node_modules', '.git', '.scratch', 'tools', 'dist'))
(work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
rel = 'web/src/concourse.ts'
original = (work / rel).read_text()
mutations = [
    ('arc radius 50 m, not 52.1', 'spacing: 12, radius: 52.1,', 'spacing: 12, radius: 50,'),
    ('sites 11 m apart', 'spacing: 12, radius: 52.1,', 'spacing: 11, radius: 52.1,'),
    ('fifteen tree columns', 'count: 16, spacing', 'count: 15, spacing'),
    ('a tree stands inside another building', 'exclusions.some(h => pointInPolygon(site, h)) || ', ''),
    ('trees stand inside the Range', 'worldToShed(shed, site).u > WEST_WALL - 3 || ', ''),
    ('trunk 0.4 m through', "roundMember(struts, [site[0], 0, site[1]], fork, TREES.trunk);", "roundMember(struts, [site[0], 0, site[1]], fork, 0.4);"),
    ('fork one metre lower', 'Math.min(...near.map(n => n[1])) - TREES.fork', 'Math.min(...near.map(n => n[1])) - TREES.fork - 1'),
    ('three branches', '.slice(0, 4).map(at)', '.slice(0, 3).map(at)'),
    ('branches 0.2 m through', 'roundMember(struts, fork, tip, TREES.branch);', 'roundMember(struts, fork, tip, 0.2);'),
    ('branches to the farthest of five nodes', '.slice(0, 4).map(at)', '.slice(1, 5).map(at)'),
    ('one strut to each pane', 'for (const end of [p, q]) roundMember(struts, foot, end, STRUT_DIAMETER);', 'for (const end of [p]) roundMember(struts, foot, end, STRUT_DIAMETER);'),
    ('struts end a metre under the roof edge', 'roundMember(struts, foot, end, STRUT_DIAMETER);', 'roundMember(struts, foot, [end[0], end[1] - 1, end[2]], STRUT_DIAMETER);'),
    ('struts start from the rail at the wrong height', '(MULLION.transom * (ws[1] + wt[1])) / 2, (ws[2] + wt[2]) / 2];', '(0.3 * (ws[1] + wt[1])) / 2, (ws[2] + wt[2]) / 2];'),
]
def run(label):
    result = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=60000', 'web/tests/concourse-supports.test.ts'], cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=120)
    output = result.stdout + result.stderr
    (scratch / f'{label}.log').write_text(output)
    return result.returncode, output

code, _ = run('baseline')
if code:
    raise SystemExit('Baseline failed; inspect baseline.log')
survivors, invalid = [], []
try:
    for i, (label, old, new) in enumerate(mutations):
        if original.count(old) != 1:
            raise SystemExit(f'Expected one mutation anchor for {label}')
        (work / rel).write_text(original.replace(old, new, 1))
        code, output = run(f'm{i:02d}')
        if code == 0:
            survivors.append(label)
            print(f'[SURVIVED] {label}', flush=True)
        elif 'AssertionError' in output and not re.search(r'SyntaxError|TypeError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION', output):
            print(f'[KILLED] {label}: assertion failure', flush=True)
        else:
            invalid.append(label)
            print(f'[INVALID] {label}: non-assertion failure', flush=True)
finally:
    (work / rel).write_text(original)
print(f'{len(mutations)-len(survivors)-len(invalid)}/{len(mutations)} killed; {len(survivors)} survivors; {len(invalid)} invalid')
sys.exit(bool(survivors or invalid))
