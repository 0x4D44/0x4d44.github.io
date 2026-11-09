"""Bounded F1 member-geometry mutations. Usage: concourse.py SOURCE SCRATCH.
Copies source once; never mutates SOURCE. Kills require assertion evidence, not load failures.
"""
import re
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_command: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

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
    ('opaque shell restored', '  return batch.build();\n}\n\n// Roof materials,', "  return new THREE.LatheGeometry([[2, 0], [2.1, 19.5]].map(([r,y])=>new THREE.Vector2(r,y)),40);\n}\n\n// Roof materials,"),
    ('one parent removes branching connectivity', '.slice(0, Math.round((2 * below.length) / count))) edges.push', '.slice(0, 1)) edges.push'),
    ('drawn members missing', 'return edges.map(([a, b], e) => {\n', 'return edges.map(([a, b], e) => {\n    if (e % 2) return { pts: [[0, 40, 0], [0, 41, 0]] as V3[], tans: [[0, 1, 0], [0, 1, 0]] as V3[] };\n'),
    ('members outside the trumpet', 'r = columnRadius(t, mouth);', 'r = columnRadius(t, mouth) + 1;'),
    ('head one metre below the roof', 'const p: V3 = last ? [...head[i]!] :', 'const p: V3 = last ? [head[i]![0], head[i]![1] - 1, head[i]![2]] :'),
    ('column moved into facade', 'column.position.set(cx, 0, cz);', 'column.position.set(cx + 10, 0, cz);'),
    ('upstands back in the soffit soup', 'standing.poly([nodeAt(a, SOFFIT_LIFT), nodeAt(b, SOFFIT_LIFT), nodeAt(b, SKIN_LIFT), nodeAt(a, SKIN_LIFT)]', 'soffit.poly([nodeAt(a, SOFFIT_LIFT), nodeAt(b, SOFFIT_LIFT), nodeAt(b, SKIN_LIFT), nodeAt(a, SKIN_LIFT)]'),
    ('fascia back in the soffit soup', '    standing.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]],', '    soffit.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]],'),
    ('edge band beside the panels, not under them', "if (panels) add(standing, mat.soffit, 'concourse-edges', 0, panels);", "add(standing, mat.soffit, 'concourse-edges');"),
]
def run(label):
    """(exit code, output, why): `why` is empty unless the run was cut short, for its time or the memory it held (never a kill)."""
    result = kxmut.run_command(work, ['node', '--test', '--test-reporter=tap', '--test-timeout=10000', 'web/tests/concourse.test.ts'], timeout=30)
    output = result.stdout + result.stderr
    (scratch / f'{label}.log').write_text(output)
    return result.returncode, output, (('OVERCAP' if result.overcap else 'TIMEOUT'), result.limit_note()) if result.expired else None

code, _, stalled = run('baseline')
if code or stalled:
    raise SystemExit('Baseline failed; inspect baseline.log')
survivors, invalid = [], []
try:
    for i, (label, old, new) in enumerate(mutations):
        if original.count(old) != 1:
            raise SystemExit(f'Expected one mutation anchor for {label}')
        (work / rel).write_text(original.replace(old, new, 1))
        code, output, stalled = run(f'm{i:02d}')
        if stalled:
            invalid.append(label)
            print(f'[{stalled[0]}] {label}: {stalled[1]} (that is not a kill)', flush=True)
        elif code == 0:
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
