#!/usr/bin/env python3
"""Prove the Axis 07 relay probe tests fail under planted guard regressions."""
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SCRATCH = ROOT.parent / '.scratch'
SOURCE = 'tools/axis07-relay.mjs'
TEST = 'tools/tests/axis07-relay.test.mjs'

MUTATIONS = [
    (
        'expected HTTP refusal codes are inverted',
        "else addCheck(checks, name, response.status === expected);",
        "else addCheck(checks, name, response.status !== expected);",
        'full request matrix',
    ),
    (
        'bound address check always passes',
        "addCheck(checks, 'listener_bound_loopback', loopbackAddress(relay.host));",
        "addCheck(checks, 'listener_bound_loopback', true);",
        'rejects wildcard binding',
    ),
    (
        'marker scan is disabled',
        "const leaked = Object.values(markers).some((marker) => marker && scanText.includes(marker));",
        'const leaked = false;',
        'rejects wildcard binding',
    ),
    (
        'listener permission error is reported as a failure',
        "addUnavailable(checks, 'listener_started', {",
        "addCheck(checks, 'listener_started', false, {",
        'permission denial as unavailable',
    ),
    (
        'late listener cleanup is disabled',
        "if (safeCode(error) === 'ETIMEDOUT' && pendingRelayStart) {",
        'if (false && pendingRelayStart) {',
        'closes a listener that starts after',
    ),
]


def run_mutation(label, old, new, pattern, index):
    with tempfile.TemporaryDirectory(prefix=f'axis07-{index:02d}-', dir=SCRATCH) as temp:
        work = Path(temp)
        for name in ('relay', 'core', 'tools'):
            shutil.copytree(ROOT / name, work / name)
        module = work / SOURCE
        source = module.read_text()
        if old not in source:
            raise SystemExit(f'mutation pattern missing: {label}')
        module.write_text(source.replace(old, new, 1))
        command = ['node', '--test', '--test-reporter=tap', f'--test-name-pattern={pattern}', TEST]
        try:
            result = subprocess.run(command, cwd=work, stdin=subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    text=True, timeout=15, check=False)
        except subprocess.TimeoutExpired:
            print(f'[TIMEOUT] {label}')
            return False
        failed = re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M)
        if result.returncode and any(pattern in name for name in failed):
            print(f'[KILLED] {label}')
            return True
        print(f'[SURVIVED] {label} (exit {result.returncode})')
        return False


SCRATCH.mkdir(parents=True, exist_ok=True)
passed = sum(run_mutation(*mutation, index) for index, mutation in enumerate(MUTATIONS))
print(f'\n{passed}/{len(MUTATIONS)} planted Axis 07 relay mutations killed')
raise SystemExit(0 if passed == len(MUTATIONS) else 1)
