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
    ('fixture unavailable timetable returns HTTP404', 'tools/axis07-browser.mjs',
     "if (url.pathname === '/schedule') return sendJson(res, 200, {", "if (url.pathname === '/schedule') return sendJson(res, 404, {",
     'browser fixture reports an unavailable timetable as data and preserves genuine missing routes'),
    ('failed request loses its URL', 'tools/axis07-browser.mjs',
     'url: fullUrl,', 'url: null,',
     ('CDP failures retain full URLs and request IDs while genuine 404s fail and injected SSE drops are expected',
      'a console error with no URL resolves its CDP request ID after the request finishes')),
    ('transport failures are omitted', 'tools/axis07-browser.mjs',
     "if (method === 'Network.loadingFailed') {", 'if (false) {',
     'CDP failures retain full URLs and request IDs while genuine 404s fail and injected SSE drops are expected'),
    ('schedule404 is whitelisted again', 'tools/axis07-browser.mjs',
     'if (!pathname) return false;', "if (!pathname) return false; if (pathname === '/relay/schedule' && status === 404) return true;",
     'CDP failures retain full URLs and request IDs while genuine 404s fail and injected SSE drops are expected'),
    ('console errors cannot recover their URL by request ID', 'tools/axis07-browser.mjs',
     "return usableUrl(entry?.url) ?? usableUrl(requestInfo.get(entry?.networkRequestId)?.url);", 'return usableUrl(entry?.url);',
     'a console error with no URL resolves its CDP request ID after the request finishes'),
    ('errors between screenshots are hidden', 'tools/axis07-browser.mjs',
     "if (report.networkDiagnostics?.some(d => d.consoleErrorCount || d.cspErrorCount || d.unexpectedNetworkFailures.length)) return 'GAP';", '',
     'browser report completeness requires all phases, attribution, status, board, counts and screenshots'),
    ('offline replay clock may remain frozen', 'tools/axis07-browser.mjs',
     'replay.replayTimeMs > replay.replayStartMs', 'replay.replayTimeMs >= replay.replayStartMs',
     'browser report completeness requires all phases, attribution, status, board, counts and screenshots'),
    ('offline replay may request relay endpoints', 'tools/axis07-browser.mjs',
     'Object.values(replay.relayRequestCounts).every(count => count === 0)', 'true',
     'browser report completeness requires all phases, attribution, status, board, counts and screenshots'),
    ('sample board accepted in live replay evidence', 'tools/axis07-browser.mjs',
     "phase.board.mode === (offline ? 'sample' : replay ? 'replay' : 'live')", 'true',
     'browser report completeness requires all phases, attribution, status, board, counts and screenshots'),
    ('static fixture clock disagrees with its recording', 'tools/axis07-browser.mjs',
     'return { startMs, resources: new Map([', 'return { startMs: startMs + 120_000, resources: new Map([',
     'offline browser fixture serves finite static replay while the relay proxy is disabled'),

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
    if baseline.returncode or baseline.stderr or expired or len(expected) != 10 or '# tests 10' not in baseline.stdout:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('baseline failed or did not run exactly the ten focused tests')

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
        required_failures = {expected_failure} if isinstance(expected_failure, str) else set(expected_failure)
        named = {name for name in test_names(result.stdout) if name in expected}
        if expired:
            timeouts.append(label)
            print(f'[TIMEOUT] {label}', flush=True)
        elif result.returncode and failures == required_failures and named == expected and not result.stderr:
            print(f'[CAUGHT] {label}: {", ".join(sorted(failures))}', flush=True)
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
