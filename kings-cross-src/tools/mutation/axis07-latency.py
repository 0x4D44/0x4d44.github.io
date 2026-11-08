#!/usr/bin/env python3
"""Plant stage/report regressions in isolated scratch copies; never edit source."""
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = ROOT.parent / '.scratch' / 'axis07-latency' / 'mutation'
MODULE = 'tools/axis07-latency.mjs'
TEST = 'tools/tests/axis07-latency.test.mjs'
MUTATIONS = [
    ('quantile rank reversed', MODULE, 'Math.ceil(sorted.length * p) - 1', '0', 'latency quantiles'),
    ('receive/send subtraction reversed', MODULE, "r[b] - r[a]", "r[a] - r[b]", 'latency summaries'),
    ('missing/order validity ignored', MODULE, "status: valid ? 'PASS' : 'FAIL'", "status: 'PASS'", 'latency summaries'),
    ('SSE event duplicated', MODULE, 'onEvent(type, JSON.parse(data));', 'onEvent(type, JSON.parse(data)); onEvent(type, JSON.parse(data));', 'latency SSE parser'),
    ('permission denial called pass', MODULE, "? 'UNAVAILABLE' : 'FAIL'", "? 'PASS' : 'FAIL'", 'latency probe reports bind'),
    ('input validation disabled', MODULE, "throw new Error('invalid probe limits');", "return {};", 'latency probe refuses invalid'),
    ('injected handler never receives events', 'relay/relay.mjs', 'const server = createServer(async (req, res) => {', 'const server = createServer(async (req, res) => { return;', 'real relay handler sends'),
]

SCRATCH.mkdir(parents=True, exist_ok=True)
failures = 0
for index, (label, file, before, after, pattern) in enumerate(MUTATIONS):
    work = Path(tempfile.mkdtemp(prefix=f'{index:02d}-', dir=SCRATCH))
    for directory in ('relay', 'core', 'web/src'):
        shutil.copytree(ROOT / directory, work / directory)
    (work / 'tools/tests').mkdir(parents=True)
    shutil.copy2(ROOT / MODULE, work / MODULE)
    shutil.copy2(ROOT / TEST, work / TEST)
    target = work / file
    source = target.read_text()
    if before not in source:
        raise SystemExit(f'missing mutation anchor: {label}')
    target.write_text(source.replace(before, after, 1))
    try:
        result = subprocess.run(['node', '--test', '--test-reporter=tap', f'--test-name-pattern={pattern}', TEST], cwd=work,
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        failed = re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M)
        killed = result.returncode != 0 and any(pattern in name for name in failed)
    except subprocess.TimeoutExpired:
        killed = False
    print(f'[{"KILLED" if killed else "SURVIVED"}] {label}', flush=True)
    failures += not killed
raise SystemExit(1 if failures else 0)
