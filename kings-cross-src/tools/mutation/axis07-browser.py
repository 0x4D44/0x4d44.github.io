"""Mutate Axis 07 browser/report and CSP guards; only named test failures count.

Usage: python3 -I -u kings-cross-src/tools/mutation/axis07-browser.py kings-cross-src <worktree>/.scratch/axis07-browser-mutations
"""
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

MUTATIONS = [
    ('browser CLI accepts software-mode invocation', 'tools/axis07-browser.mjs',
     "if (!values.has('--gpu')) throw new Error('pass --gpu; software renderers are not accepted');",
     "if (false && !values.has('--gpu')) throw new Error('pass --gpu; software renderers are not accepted');",
     'browser CLI requires explicit GPU mode and a built output directory under worktree scratch'),
    ('SwiftShader renderer is accepted', 'tools/axis07-browser.mjs',
     'return realMetal(renderer);', 'return true;',
     'GPU acceptance requires a genuine Metal renderer and rejects SwiftShader'),
    ('fake relay reports disconnected health', 'tools/axis07-browser.mjs',
     "ok: true, area: 'SYN', feed: 'connected', connectedAt: now - 1000, lastEventAgeMs: 0,",
     "ok: true, area: 'SYN', feed: 'disconnected', connectedAt: now - 1000, lastEventAgeMs: 0,",
     'synthetic relay fixture supplies fake health metadata, a synthetic snapshot and named SSE ping frames'),
    ('phase checker accepts absent status lines', 'tools/axis07-browser.mjs',
     "typeof phase.statusLine === 'string'", "typeof phase.statusLine === 'number'",
     'browser report completeness requires all phases, attribution, status, board, counts and screenshots'),
    ('CSP accepts invalid IPv6 websocket wildcard', 'web/index.html',
     "ws://localhost:*; worker-src", "ws://localhost:* ws://[::1]:*; worker-src",
     'page CSP denies arbitrary scripts frames and forms while allowing app assets and loopback dev sockets'),
    ('SSE reconnect races the failure screenshot', 'tools/axis07-browser.mjs',
     'streamsDropped = true;', 'streamsDropped = false;',
     'synthetic SSE stays dropped until the failure screenshot has been captured'),
]


def run(work):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=5000',
               'web/tests/csp.test.ts', 'tools/tests/axis07-browser.test.mjs']
    process = subprocess.Popen(command, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, stdin=subprocess.DEVNULL, start_new_session=True)
    expired = False
    try:
        stdout, stderr = process.communicate(timeout=12)
    except subprocess.TimeoutExpired:
        expired = True
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = process.communicate(timeout=3)
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr), expired


def test_names(output):
    return set(re.findall(r'^(?:ok|not ok) \d+ - ([^\n]+)$', output, re.M))


def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        name = re.match(r'not ok \d+ - ([^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION(?:['\"]|$)", block, re.M):
            failures.add(name[1])
    return failures


root = Path(tempfile.mkdtemp(prefix='axis07-browser-mutation-', dir=scratch))
survivors = []
timeouts = []
try:
    (root / 'tools/tests').mkdir(parents=True)
    (root / 'web/tests').mkdir(parents=True)
    shutil.copy2(src / 'package.json', root / 'package.json')
    for name in ['tools/axis07-browser.mjs', 'tools/evidence.mjs',
                 'tools/tests/axis07-browser.test.mjs', 'web/index.html', 'web/tests/csp.test.ts']:
        shutil.copy2(src / name, root / name)
    (root / 'core').symlink_to((src / 'core').resolve(), target_is_directory=True)
    (root / 'web/src').symlink_to((src / 'web/src').resolve(), target_is_directory=True)
    (root / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)

    baseline, expired = run(root)
    expected = test_names(baseline.stdout)
    if baseline.returncode or baseline.stderr or expired or len(expected) != 6 or '# tests 6' not in baseline.stdout:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('baseline failed or did not run exactly the six focused tests')

    originals = {file: (root / file).read_text() for _, file, _, _, _ in MUTATIONS}
    for label, filename, old, new, expected_failure in MUTATIONS:
        for file, content in originals.items():
            (root / file).write_text(content)
        changed = originals[filename]
        if old not in changed:
            raise SystemExit(f'mutation pattern missing: {label}: {old}')
        (root / filename).write_text(changed.replace(old, new, 1))
        result, expired = run(root)
        failures = assertion_failures(result.stdout)
        named = {name for name in test_names(result.stdout) if name in expected}
        if expired:
            timeouts.append(label)
            print(f'[TIMEOUT] {label}', flush=True)
        elif result.returncode and failures == {expected_failure} and named == expected and not result.stderr:
            print(f'[CAUGHT] {label}: {expected_failure}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED] {label}', flush=True)
            if result.stderr:
                print(result.stderr, flush=True)
finally:
    shutil.rmtree(root)

if timeouts or survivors:
    raise SystemExit(f'{len(timeouts)} timed out, {len(survivors)} survived: {timeouts + survivors}')
print(f'All {len(MUTATIONS)} Axis 07 browser/CSP mutations were caught.', flush=True)
