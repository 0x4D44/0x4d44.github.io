"""F7 actual geometry mutations. Usage: western-front.py SOURCE SCRATCH [PRE_FIX_SOURCE].
All runs use copies inside SCRATCH, never the source tree or original tracked source.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

src, out = (Path(s).resolve() for s in sys.argv[1:3])
if out == src or out.is_relative_to(src) or src.is_relative_to(out):
    raise SystemExit('output must be separate from source')
out.mkdir(parents=True, exist_ok=True)
titles = [
    'five southern bays give broad actual passages through Range and shed flank',
    'the five gateline plinth cuts reach ground while adjoining lower walls remain solid',
    'gateline bays retain full-depth headers and internal Y supports under the upper floors',
    'adjoining public frontage is recessed and glazed with upper sash floors and northern frontage retained',
]
mutations = [
    ('missing fifth bay', 'Array.from({ length: 5 }', 'Array.from({ length: 4 }', 0),
    ('narrow passages', '[v - 3.3, v + 3.3]', '[v - 2, v + 2]', 0),
    ('shed flank occludes passages', 'outward < 0 ? westernCuts() : []', '[]', 0),
    ('plinth closes passages', 'GROUND_Y + 1, westernCuts(true)', 'GROUND_Y + 1, []', 1),
    ('support stems omitted', '[0.7, 2.5 - GROUND_Y, 0.7]', '[0.7, 0.01, 0.7]', 2),
    ('flared support heads omitted', 'for (const side of [-1, 1]) stone.box', 'for (const side of []) stone.box', 2),
    ('public glazing omitted', "mesh(panes.build(), material('pane'), 'range-public-glazing')", "mesh(new Batch().build(), material('pane'), 'range-public-glazing')", 3),
    ('shop backing mass hollowed', '[depth - 0.65, WESTERN_HEAD - GROUND_Y, 2.8]', '[0.01, 0.01, 0.01]', 3),
    ('upper floors removed', 'v0, v1, eaves, westernCuts(true)', 'v0, v1, 3.6, westernCuts(true)', 3),
]

def run(work):
    return subprocess.run(['deltic', 'timeout', '60', 'node', '--test', '--test-reporter=tap', 'web/tests/western-front.test.ts'], cwd=work, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=75)

def copy(source, work):
    for name in ('core', 'web'):
        shutil.copytree(source / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    shutil.copy2(src / 'web/tests/western-front.test.ts', work / 'web/tests/western-front.test.ts')
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)

def failed_assertions(result):
    return set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M)) if 'AssertionError' in result.stdout and not re.search(r'(ERR_MODULE_NOT_FOUND|SyntaxError|TypeError)', result.stdout + result.stderr) else set()

with tempfile.TemporaryDirectory(prefix='western-front-', dir=out) as tmp:
    work = Path(tmp) / 'current'
    copy(src, work)
    baseline = run(work)
    (out / 'baseline.log').write_text(baseline.stdout + baseline.stderr)
    if baseline.returncode or len(re.findall(r'^ok \d+ - ', baseline.stdout, re.M)) != 4:
        raise SystemExit(baseline.stdout + baseline.stderr)
    if len(sys.argv) > 3:
        old = Path(tmp) / 'pre-fix'
        copy(Path(sys.argv[3]).resolve(), old)
        red = run(old)
        (out / 'pre-fix-red.log').write_text(red.stdout + red.stderr)
        if failed_assertions(red) != set(titles):
            raise SystemExit('all four tests must assertion-fail on pre-fix geometry: ' + red.stdout + red.stderr)
        print('[RED] all four new tests assertion-fail on pre-fix geometry', flush=True)
    file = work / 'web/src/shed.ts'
    original = file.read_text()
    survivors = []
    for i, (label, old, new, which) in enumerate(mutations, 1):
        if original.count(old) != 1:
            raise SystemExit(f'nonunique mutation anchor: {label}: {original.count(old)}')
        file.write_text(original.replace(old, new, 1))
        result = run(work)
        file.write_text(original)
        (out / f'mutation-{i}.log').write_text(result.stdout + result.stderr)
        if result.returncode and titles[which] in failed_assertions(result):
            print(f'[CAUGHT] {label} -> {titles[which]}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED] {label}', flush=True)
    print(f'{len(mutations) - len(survivors)}/{len(mutations)} caught; survivors: {survivors}', flush=True)
    raise SystemExit(1 if survivors else 0)
