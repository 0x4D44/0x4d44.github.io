"""Mutate Axis 07 browser/report and CSP guards; only named test failures count.

Usage: python3 -I -u kings-cross-src/tools/mutation/axis07-browser.py kings-cross-src <worktree>/.scratch/axis07-browser-mutations
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_command: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

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
     ('Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not',
      'browser report completeness requires all phases, attribution, status, board, counts and screenshots')),
    ('CSP accepts invalid IPv6 websocket wildcard', 'web/index.html',
     "https://archive-api.open-meteo.com; worker-src", "https://archive-api.open-meteo.com ws://[::1]:*; worker-src",
     ('page CSP denies arbitrary scripts frames and forms while allowing app assets and loopback dev sockets',
      'page CSP connect-src allows the weather origins the weather module requests, and the attribution credits Open-Meteo',
      'the page CSP audit accepts exactly the expected connect-src and rejects wider, narrower or looser policies')),
    ('SSE reconnect races the failure screenshot', 'tools/axis07-browser.mjs',
     'streamsDropped = true;', 'streamsDropped = false;',
     'synthetic SSE stays dropped until the failure screenshot has been captured'),
    ('fixture unavailable timetable returns HTTP404', 'tools/axis07-browser.mjs',
     "if (url.pathname === '/schedule') return sendJson(res, 200, {", "if (url.pathname === '/schedule') return sendJson(res, 404, {",
     'browser fixture reports an unavailable timetable as data and preserves genuine missing routes'),
    ('failed request loses its URL', 'tools/axis07-browser.mjs',
     'url: fullUrl,', 'url: null,',
     ('CDP failures retain full URLs and request IDs while genuine 404s fail and injected SSE drops are expected',
      'a console error with no URL resolves its CDP request ID after the request finishes',
      'Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not')),
    ('transport failures are omitted', 'tools/axis07-browser.mjs',
     "if (method === 'Network.loadingFailed') {", 'if (false) {',
     ('CDP failures retain full URLs and request IDs while genuine 404s fail and injected SSE drops are expected',
      'Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not')),
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
    ('CSP connect-src gains an origin beyond Open-Meteo', 'web/index.html',
     "https://archive-api.open-meteo.com; worker-src", "https://archive-api.open-meteo.com https://example.com; worker-src",
     ('page CSP denies arbitrary scripts frames and forms while allowing app assets and loopback dev sockets',
      'page CSP connect-src allows the weather origins the weather module requests, and the attribution credits Open-Meteo',
      'the page CSP audit accepts exactly the expected connect-src and rejects wider, narrower or looser policies')),
    ('CSP connect-src drops the archive origin the replay needs', 'web/index.html',
     " https://archive-api.open-meteo.com; worker-src", "; worker-src",
     ('page CSP denies arbitrary scripts frames and forms while allowing app assets and loopback dev sockets',
      'page CSP connect-src allows the weather origins the weather module requests, and the attribution credits Open-Meteo',
      'the page CSP audit accepts exactly the expected connect-src and rejects wider, narrower or looser policies')),
    ('the Open-Meteo credit is dropped from the attribution line', 'web/index.html',
     'Weather: <a href="https://open-meteo.com/"', 'Weather data: <a href="https://open-meteo.com/"',
     'page CSP connect-src allows the weather origins the weather module requests, and the attribution credits Open-Meteo'),
    ('a weather endpoint is accepted on any path', 'tools/axis07-browser.mjs',
     'return WEATHER_ENDPOINTS.get(url.origin) === url.pathname ? url.origin : null;',
     'return WEATHER_ENDPOINTS.has(url.origin) ? url.origin : null;',
     'the harness accepts exactly the two Open-Meteo endpoints the page requests and no lookalike'),
    ('a weather endpoint is accepted with credentials in the URL', 'tools/axis07-browser.mjs',
     "if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;",
     "if (url.protocol !== 'https:' || url.port) return null;",
     'the harness accepts exactly the two Open-Meteo endpoints the page requests and no lookalike'),
    ('the page CSP audit stops checking connect-src', 'tools/axis07-browser.mjs',
     'if (!same(connectSrc, EXPECTED_CONNECT_SRC)) problems.push(', 'if (false) problems.push(',
     'the page CSP audit accepts exactly the expected connect-src and rejects wider, narrower or looser policies'),
    ('the page CSP audit allows unsafe-eval', 'tools/axis07-browser.mjs',
     "if (policy.includes('unsafe-eval')) problems.push('unsafe-eval is allowed');", '',
     'the page CSP audit accepts exactly the expected connect-src and rejects wider, narrower or looser policies'),
    ('a request to any other origin is no longer a finding', 'tools/axis07-browser.mjs',
     'return weatherEndpoint(value) === null;', 'return false;',
     ('Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not',
      'the harness accepts exactly the two Open-Meteo endpoints the page requests and no lookalike')),
    ('an unreachable Open-Meteo is a network failure again', 'tools/axis07-browser.mjs',
     'const weather = !expected && !canceled && !blockedByCsp && weatherEndpoint(fullUrl) !== null &&', 'const weather = false &&',
     'Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not'),
    ('a client error from Open-Meteo is expected', 'tools/axis07-browser.mjs',
     '(detail.failed === true || (detail.status ?? 0) >= 500)', '(detail.failed === true || (detail.status ?? 0) >= 400)',
     'Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not'),
    ('a CSP block of Open-Meteo is an expected console error', 'tools/axis07-browser.mjs',
     "!/content security policy|blocked_by_csp/i.test(text ?? '') && weatherEndpoint(url) !== null &&", 'weatherEndpoint(url) !== null &&',
     'the console error of an unreachable Open-Meteo is expected; a CSP block, a CORS error, a client error or a lookalike is not'),
    ("a request the page's own CSP blocked counts as Open-Meteo being away", 'tools/axis07-browser.mjs',
     "const blockedByCsp = detail.blockedReason === 'csp' || /blocked_by_csp/i.test(detail.errorText ?? '');", 'const blockedByCsp = false;',
     'Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not'),
    ('any console error from Open-Meteo is expected', 'tools/axis07-browser.mjs',
     "(/net::ERR_/i.test(text ?? '') || (status ?? 0) >= 500)", 'true',
     'the console error of an unreachable Open-Meteo is expected; a CSP block, a CORS error, a client error or a lookalike is not'),
    ('a request to another origin is not recorded in the CDP stream', 'tools/axis07-browser.mjs',
     'else if (foreignRequest(request?.url)) diagnostics.unexpectedNetworkFailures.push({', 'else if (false) diagnostics.unexpectedNetworkFailures.push({',
     'Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not'),
    ('the report passes without the Open-Meteo credit on the page', 'tools/axis07-browser.mjs',
     'phase.attribution?.present?.openMeteo === true &&', 'true &&',
     'browser report completeness requires all phases, attribution, status, board, counts and screenshots'),
    ('the report passes without the page CSP audit', 'tools/axis07-browser.mjs',
     'return complete && replayObserved && report.cspAudit?.valid === true &&', 'return complete && replayObserved &&',
     'browser report completeness requires all phases, attribution, status, board, counts and screenshots'),
    ('a failed weather request may go unsaid on the status line', 'tools/axis07-browser.mjs',
     '/weather unavailable[^·]*clear sky/i.test(phase.statusLine)', 'true',
     ('Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not',
      'browser report completeness requires all phases, attribution, status, board, counts and screenshots')),

]


def run(work):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=5000',
               'web/tests/csp.test.ts', 'tools/tests/axis07-browser.test.mjs']
    ran = kxmut.run_command(work, command, timeout=12)
    return subprocess.CompletedProcess(command, ran.returncode, ran.stdout, ran.stderr), ran


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

    baseline, ran = run(root)
    expected = test_names(baseline.stdout)
    if baseline.returncode or baseline.stderr or ran.expired or len(expected) != 15 or '# tests 15' not in baseline.stdout:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('baseline failed or did not run exactly the fifteen focused tests')

    originals = {file: (root / file).read_text() for _, file, _, _, _ in MUTATIONS}
    for label, filename, old, new, expected_failure in MUTATIONS:
        for file, content in originals.items():
            (root / file).write_text(content)
        changed = originals[filename]
        if old not in changed:
            raise SystemExit(f'mutation pattern missing: {label}: {old}')
        (root / filename).write_text(changed.replace(old, new, 1))
        result, ran = run(root)
        failures = assertion_failures(result.stdout)
        required_failures = {expected_failure} if isinstance(expected_failure, str) else set(expected_failure)
        named = {name for name in test_names(result.stdout) if name in expected}
        if ran.expired:
            timeouts.append(label)
            print(f'[{"OVERCAP" if ran.overcap else "TIMEOUT"}] {label}: {ran.limit_note()}', flush=True)
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
