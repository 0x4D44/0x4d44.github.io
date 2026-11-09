"""Bounded F1 member-geometry mutations. Usage: concourse.py SOURCE SCRATCH.
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
    ('opaque shell restored', 'return batch.build();', "return new THREE.LatheGeometry(columnProfile(apex).map(([r,y])=>new THREE.Vector2(r,y)),40);"),
    ('one parent removes branching connectivity', 'nearest.slice(0, 2)', 'nearest.slice(0, 1)'),
    ('drawn members missing', 'for (const [a,b] of edges) {', 'for (const [a,b] of edges.filter((_, i) => i % 2 === 0)) {'),
    ('members outside retained envelope', 'radius - COLUMN_MEMBER / Math.sqrt(2)', 'radius + 1'),
    ('stalk height shortened', 'nodes.push([r * Math.cos(angle), y, r * Math.sin(angle)]);', 'nodes.push([r * Math.cos(angle), y * .9, r * Math.sin(angle)]);'),
    ('column moved into facade', 'column.position.set(cx, 0, cz);', 'column.position.set(cx + 10, 0, cz);'),
]
def run(label):
    result = subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=10000', 'web/tests/concourse.test.ts'], cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)
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
