"""Protect the documented runner's coverage without running the whole suite.

python3 -I -u kings-cross-src/tools/mutation/test-suite.py
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src = Path(__file__).resolve().parents[2]
scratch = src.parent / '.scratch' / 'test-suite-mutations'
scratch.mkdir(parents=True, exist_ok=True)
suite = 'tools/tests/test-suite.test.mjs'

with tempfile.TemporaryDirectory(prefix='case-', dir=scratch) as temporary:
    root = Path(temporary)
    work = root / 'kings-cross-src'
    (work / 'tools/tests').mkdir(parents=True)
    shutil.copy2(src / suite, work / suite)
    shutil.copy2(src.parent / 'package.json', root / 'package.json')
    original = json.loads((src / 'package.json').read_text())
    target = work / 'package.json'

    def run(document):
        target.write_text(json.dumps(document))
        return kxmut.run_process(['node', '--test', '--test-reporter=tap', '--test-timeout=5000', suite], cwd=work, timeout=15)  # a hang or an over-cap run raises TimeoutExpired: the driver stops

    baseline = run(original)
    if baseline.returncode: raise SystemExit(baseline.stdout + baseline.stderr)
    for pattern in ['tools/tests/*.test.mjs', 'tools/tests/*.test.ts']:
        altered = json.loads(json.dumps(original))
        altered['scripts']['test'] = altered['scripts']['test'].replace(' ' + pattern, '')
        result = run(altered)
        if not result.returncode or 'ERR_ASSERTION' not in result.stdout:
            raise SystemExit('SURVIVED/INVALID ' + pattern + '\n' + result.stdout + result.stderr)
        print('CAUGHT missing ' + pattern, flush=True)
    print('2/2 mutations caught; 1/1 new tests seen failing; zero survivors')
