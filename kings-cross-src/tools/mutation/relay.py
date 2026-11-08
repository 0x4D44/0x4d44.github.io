"""Mutation check: break the relay on purpose in a copy and confirm a test fails.

usage: python3 -I -u tools/mutation/relay.py <path to kings-cross-src/relay> <scratch dir>
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
if not scratch.is_relative_to(src.parent.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

# (label, file, old, new)
# The former recorder TRUST-state mutation was retired as equivalent: TdState.apply's
# validTdEvent guard already rejects TRUST events, whether or not recorder checks kind.
MUTATIONS = [
    ("stomp: ignore content-length", "stomp.mjs", "if (cl !== undefined) {", "if (false) {"),
    ("stomp: do not skip heart-beat newlines", "stomp.mjs", "while (skip < this.#buf.length && (this.#buf[skip] === 0x0a || this.#buf[skip] === 0x0d)) skip++;", "while (false) skip++;"),
    ("stomp: do not escape colon in headers", "stomp.mjs", ".replace(/:/g, '\\\\c')", ""),
    ("stomp: escape CONNECT headers", "stomp.mjs", "new Set(['CONNECT', 'CONNECTED', 'STOMP'])", "new Set([])"),
    ("stomp: last header wins", "stomp.mjs", "if (!(key in headers)) headers[key]", "if (true) headers[key]"),
    ("stomp: heart-beat timeout never fires", "stomp.mjs", "expect * 2.5", "expect * 1e9"),
    ("stomp: subscribe immediately", "stomp.mjs", "if (this.#connected) this.#socket.write(frame);", "if (true) this.#socket.write(frame);"),
    ("stomp: no frame size cap", "stomp.mjs", "const MAX_FRAME_BYTES = 16 * 1024 * 1024;", "const MAX_FRAME_BYTES = 32 * 1024 * 1024;"),
    ("stomp: ERROR frame ignored", "stomp.mjs", "this.#fault(new Error('stomp: ERROR frame'));", ""),
    ("td: area filter keeps everything", "td.mjs", "events.filter((e) => e.area === area)", "events"),
    ("td: CA time not numeric", "td.mjs", "time: ms(m.time) };\n    case 'CB'", "time: m.time };\n    case 'CB'"),
    ("state: step does not clear old berth", "state.mjs", "if (e.from) this.#berths.delete(e.from);", ""),
    ("state: ignore area", "state.mjs", "|| e.area !== this.#area", ""),
    ("keychain: first lookup asks for the password", "keychain.mjs", "['find-generic-password', '-s', service])", "['find-generic-password', '-s', service, '-w'])"),
    ("keychain: error leaks stderr text", "keychain.mjs", "reject(new Error(`keychain: lookup failed (exit ${err.code ?? 'unknown'})`))", "reject(new Error(`keychain: ${err.message} (exit ${err.code ?? 'unknown'})`))"),
    ("keychain: allow non-macOS", "keychain.mjs", "if (platform !== 'darwin') throw new Error('keychain: only macOS is supported');", ""),
    ("relay: no Host check", "relay.mjs", "if (!['127.0.0.1', 'localhost'].some((h) => host === `${h}:${port}`))", "if (false)"),
    ("relay: Host check by prefix", "relay.mjs", "host === `${h}:${port}`", "(host ?? '').startsWith(h)"),
    ("relay: Host check ignores the port", "relay.mjs", "host === `${h}:${port}`", "(host ?? '').split(':')[0] === h"),
    ("relay: Host check by suffix", "relay.mjs", "host === `${h}:${port}`", "(host ?? '').endsWith(`${port}`)"),
    ("relay: any method allowed", "relay.mjs", "return method === 'GET' ? null : 405;", "return null;"),
    ("relay: bind all interfaces", "relay.mjs", "server.listen(port, '127.0.0.1', resolve)", "server.listen(port, '0.0.0.0', resolve)"),
    ("relay: no recording", "relay.mjs", "recorder.append(e);", ""),
    ("relay: no initial SSE snapshot", "relay.mjs", "if (!writeEvent(res, `event: snapshot\\ndata: ${JSON.stringify(state.snapshot())}\\n\\n`)) return;", "if (false) return;"),
    ("relay: CORS wide open", "relay.mjs", "'cache-control': 'no-store' });\n  res.end(text);", "'cache-control': 'no-store', 'access-control-allow-origin': '*' });\n  res.end(text);"),
    ("feed: log leaks the passcode", "feed.mjs", "log(`feed: connected${server ? ` to ${server}` : ''}, subscribed to ${topic}`);", "log(`feed: connected ${creds.secret}`);"),
    ("feed: never reconnect on close", "feed.mjs", "      onStatus({ state: 'disconnected' });\n      schedule();", "      onStatus({ state: 'disconnected' });"),
    ("feed: bad message not logged", "feed.mjs", "log(`feed: dropped a bad message (${err.message})`);", ""),
    ("static: password omitted from basic auth", "static.mjs", "`${account}:${secret}`", "`${account}:`"),
    ("static: stale cache always trusted", "static.mjs", "if (now() - st.mtimeMs < maxAgeMs) return await cached.readFile();", "return await cached.readFile();"),
    ("static: unknown names allowed", "static.mjs", "if (!Object.hasOwn(KINDS, kind)) throw new Error('static: unknown file');", "if (false) throw new Error('static: unknown file');"),
    ("recorder: never roll the day", "recorder.mjs", "if (d !== streamDay) {", "if (streamDay === '') {"),
    ("recorder: records lose their newline separators", "recorder.mjs", "stream.write(`${JSON.stringify(row)}\\n`);", "stream.write(JSON.stringify(row));"),
    ("recorder: no startup snapshot", "recorder.mjs", "  checkpoint();\n  const timer", "  const timer"),
    ("recorder: checkpoint interval is one hour", "recorder.mjs", "10 * 60_000", "60 * 60_000"),
    ("recorder: interval never checkpoints", "recorder.mjs", "schedule(checkpoint,", "schedule(() => {},"),
    ("recorder: snapshots forget observed state", "recorder.mjs", "if (event.kind !== 'trust') state.apply(event);", "void event;"),
    ("recorder: rollover lacks initial snapshot", "recorder.mjs", "if (event.kind !== 'snapshot') write({ kind: 'snapshot', ...state.snapshot() }, t);", ""),
    ("recorder: accepts other TD areas", "recorder.mjs", "closed || event.area !== area", "closed"),
    ("recorder: close leaves periodic timer running", "recorder.mjs", "unschedule(timer);", ""),
    ("recorder: queued checkpoint writes after close", "recorder.mjs", "if (!closed) write", "if (true) write"),
    ("relay: feed reconnect never checkpoints", "relay.mjs", "recorder.checkpoint();", ""),
    ("relay: checkpoints are not broadcast live", "relay.mjs", "onSnapshot: (row) => { for (const send of listeners) send(row); }", "onSnapshot: () => {}"),
    ("relay: checkpoint uses the wrong SSE event", "relay.mjs", "if (row.e.kind === 'snapshot')", "if (false)"),
    ("relay: configured S-class map ignored", "relay.mjs", "file = sclassFile;", "file = path.join(dataDir, 'missing-sclass.json');"),
    ("relay: KX_SCLASS override ignored", "relay.mjs", "process.env.KX_SCLASS ?? path.join(dataDir, 'sclass.json')", "path.join(dataDir, 'sclass.json')"),
    ("relay: client chooses S-class path", "relay.mjs", "file = sclassFile;", "file = url.searchParams.get('path') ?? sclassFile;"),
    ("relay: missing files return success", "relay.mjs", "return { status: 404, body:", "return { status: 200, body:"),
    ("relay: ping interval keeps the process alive", "relay.mjs", "  timer?.unref?.();", ""),
    ("relay: concurrent shutdowns close twice", "relay.mjs", "if (closing) return closing;", ""),
    ("relay: shutdown leaves SSE heartbeats running", "relay.mjs", "for (const stopHeartbeat of heartbeats) stopHeartbeat();", ""),
    ("relay: shutdown omits recorder close", "relay.mjs", "const recorded = recorder.close();", "const recorded = Promise.resolve();"),
    ("relay: server shutdown errors disappear", "relay.mjs", "server.close((error) => error ? reject(error) : resolve());", "server.close(() => resolve());"),
    ("schedule: discard all station calls", "schedule.mjs", "selector.apply(record);", ""),
    ("schedule: accept an empty extract", "schedule.mjs", "if (!records) throw new Error('schedule: no schedule records');", ""),
    ("schedule: accept malformed schedules", "schedule.mjs", "if (!value || typeof value !== 'object' || Array.isArray(value) || Object.hasOwn(value, 'JsonScheduleV1')) throw new Error('schedule: invalid schedule record');", "if (false) throw new Error('schedule: invalid schedule record');"),
    ("schedule: auth omits password", "schedule.mjs", "`${account}:${secret}`", "`${account}:`"),
    ("schedule: choose an incomplete update", "schedule.mjs", "type=CIF_ALL_FULL_DAILY", "type=CIF_ALL_UPDATE_DAILY"),
    ("schedule: lose station names", "schedule.mjs", "names.get(call.destination) || call.destination", "call.destination"),
    ("schedule: ignore cached data", "schedule.mjs", "if (cached) {", "if (false) {"),
    ("schedule: expose download exception", "schedule.mjs", "'schedule: refresh failed'", "error.message"),
    ("schedule: timer keeps process alive", "schedule.mjs", "timer?.unref?.();", ""),
    ("schedule: close leaves timer running", "schedule.mjs", "if (timer) unschedule(timer);", ""),
    ("schedule: daily timer never refreshes", "schedule.mjs", "void refresh(date);", "void 0;"),
    ("schedule: accepts arbitrary cache paths", "schedule.mjs", "if (!validDate(date)) throw new Error('invalid schedule date');", ""),
    ("schedule: missing HTTP validation", "relay.mjs", "dates.length > 1 || !validDate(date) || [...url.searchParams.keys()].some(key => key !== 'date')", "false"),
    ("schedule: all requests use today", "relay.mjs", "const date = dates[0] ?? scheduleDate(now());", "const date = scheduleDate(now());"),
    ("feed: TRUST subscription missing", "feed.mjs", "if (trustTopic) client.subscribe(trustTopic, { id: 'trust' });", ""),
    ("feed: TRUST routed into TD parser", "feed.mjs", "trustTopic && (destination === trustTopic || subscription === 'trust')", "false"),
    ("relay: TRUST not broadcast", "relay.mjs", "else if (row.e.kind === 'trust')", "else if (false)"),
    ("relay: TRUST not recorded", "relay.mjs", "recorder.append(e);\n      const row", "\n      const row"),
    ("schedule: HTTP errors treated as extract", "schedule.mjs", "if (!res.ok) {", "if (false) {"),
    ("trust: startup activations lost", "trust.mjs", "return resolvePending(serviceRows);", "return [];"),
    ("trust: early variation sign wrong", "trust.mjs", "case 'EARLY': return -value;", "case 'EARLY': return value;"),
    ("trust: no headcode-time fallback", "trust.mjs", "else if (headcode && matchTime !== null)", "else if (false)"),
    ("trust: retain movements at other stations", "trust.mjs", "if (text(body.loc_stanox) !== KX_STANOX) return null;", ""),
    ("trust: train identities never expire", "trust.mjs", "at - value.receivedAtMs >= DAY_MS", "false"),
    ("trust: pending activations unbounded", "trust.mjs", "const MAX_PENDING_ACTIVATIONS = 5_000;", "const MAX_PENDING_ACTIVATIONS = 50_000;"),
    ("trust: recent movements unbounded", "trust.mjs", "const MAX_MOVEMENTS = 3_000;", "const MAX_MOVEMENTS = 30_000;"),
    ("trust: origin day uses UTC", "trust.mjs", "timeZone: 'Europe/London'", "timeZone: 'UTC'"),
    ("stomp: partially parse malformed content-length", "stomp.mjs", "if (!/^\\d+$/.test(cl)) throw new Error('stomp: invalid content-length');\n        const n = Number(cl);", "const n = Number.parseInt(cl, 10);"),
    ("stomp: accept invalid UTF8", "stomp.mjs", "new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })", "new TextDecoder('utf-8', { fatal: false, ignoreBOM: true })"),
    ("stomp: accept invalid header escapes", "stomp.mjs", "if (!['r', 'n', 'c', '\\\\'].includes(c)) throw new Error('stomp: invalid header escape');", "if (false)"),
    ("stomp: repeated CONNECTED is accepted", "stomp.mjs", "if (this.#connected) { this.#fault(new Error('stomp: repeated CONNECTED')); break; }", "if (false) { this.#fault(new Error('stomp: repeated CONNECTED')); break; }"),
    ("stomp: unsafe heartbeat values schedule timers", "stomp.mjs", "if (!parts || parts.slice(1).some(n => Number(n) > 2_147_483_647)) {", "if (false) {"),
    ("stomp: faults do not stop a batched frame", "stomp.mjs", "if (this.#closed || this.#faulted) break;", "if (false) break;"),
    ("td: malformed normalized rows enter the picture", "td.mjs", "if (validTdEvent(event)) events.push(event);", "if (true) events.push(event);"),
    ("td: malformed direct state calls are accepted", "state.mjs", "if (!validTdEvent(e) || e.area !== this.#area) return false;", "if (e.area !== this.#area) return false;"),
    ("td: berth flood exceeds the cap", "state.mjs", "this.#berths.size >= MAX_BERTHS", "false"),
    ("relay: hostile Origin is accepted", "relay.mjs", "if (origin !== undefined) {", "if (false) {"),
    ("relay: slow SSE consumers keep accumulating writes", "relay.mjs", "if (res.write(text) !== false) return true;", "if (true) return true;"),
    ("relay: ping omits feed health metadata", "relay.mjs", "const data = { t: now(), ...(info ? { feed: info.feed, lastEventAt: info.lastEventAt } : {}) };", "const data = { t: now() };"),
    ("relay: private feed exception text reaches logs", "relay.mjs", "log: (message) => log(safeFeedLog(message)),", "log: (message) => log(message),"),
    ("relay: oversized local JSON is accepted", "relay.mjs", "const MAX_LOCAL_JSON = 16 * 1024 * 1024;", "const MAX_LOCAL_JSON = 32 * 1024 * 1024;"),
    ("schedule: accepts overlong lines", "schedule.mjs", "if (pending.length + tail.length > maxLineBytes) throw new Error('schedule: line limit exceeded');", "if (false) throw new Error('schedule: line limit exceeded');"),
    ("schedule: accepts overlarge decoded streams", "schedule.mjs", "if (decodedBytes > maxDecodedBytes) throw new Error('schedule: decoded byte limit exceeded');", "if (false) throw new Error('schedule: decoded byte limit exceeded');"),
    ("schedule: accepts too many records", "schedule.mjs", "if (++records > maxRecords) throw new Error('schedule: record limit exceeded');", "if (false) throw new Error('schedule: record limit exceeded');"),
    ("schedule: cache errors expose parser details", "schedule.mjs", "throw new Error('schedule: cache read failed');", "throw error;"),
    ("schedule: refresh memo grows without a date bound", "schedule.mjs", "memo.set(date, doc);\n      while (memo.size > 7) memo.delete(memo.keys().next().value);\n      state = 'ready';", "memo.set(date, doc);\n      state = 'ready';"),
    ("trust: malformed JSON exposes upstream text", "trust.mjs", "catch { throw new Error('trust: invalid JSON'); }", "catch (error) { throw error; }"),
    ("trust: timestamp coercion accepts nonnumeric values", "trust.mjs", "if (typeof value !== 'number' && (typeof value !== 'string' || !/^\\d{1,16}$/.test(value))) return null;", "if (value === null || value === undefined || value === '') return null;"),
    ("trust: oversized train ids enter retained state", "trust.mjs", "return /^[A-Z0-9]{6,32}$/.test(trainId) && /^[0-9][A-Z][0-9]{2}$/.test(trainId.slice(2, 6)) ? trainId.slice(2, 6) : '';", "return trainId.length >= 6 ? trainId.slice(2, 6) : '';"),
    ("trust: activate a nonstation uid", "trust.mjs", "if (service?.uid !== activation.uid) return false;", ""),
    ("trust: corrections merge backwards", "trust.mjs", "for (const event of [...realtime].reverse())", "for (const event of realtime)"),
    ("trust: arrival corrections roll backward", "trust.mjs", "if (previousActual !== null && (event.actualMs ?? -Infinity) < previousActual) continue;", "if (false) continue;"),
    ("relay: events endpoint delays its first health ping", "relay.mjs", "if (immediate) ping();", "if (false) ping();"),
    ("trust: reinstatements are ignored", "trust.mjs", "} else if (type === '0002' || type === '0005') {", "} else if (type === '0002') {"),
    ("trust: controls received before activation are dropped", "trust.mjs", "putRecent(pendingCancellations, key, control, MAX_PENDING_CANCELLATIONS);", "void key;"),
    ("trust: old cancellation source time overrides newer status", "trust.mjs", "control.sourceMs < previous.sourceMs ||", "false ||"),
    ("trust: later remote control point changes KX cancellation status", "trust.mjs", "control.departureMs > lastCall", "false"),
    ("trust: remote-origin cancellations are dropped", "trust.mjs", "const linked = activationFor(control.currentTrainId, control.originalTrainId);", "const linked = control.location === KX_STANOX ? activationFor(control.currentTrainId, control.originalTrainId) : null;"),
    ("trust: negative cancellation timestamps are accepted", "trust.mjs", "parsed > 0 && parsed <= 8_640_000_000_000_000", "parsed <= 8_640_000_000_000_000"),
    ("trust: pending cancellations exceed their cap", "trust.mjs", "const MAX_PENDING_CANCELLATIONS = 5_000;", "const MAX_PENDING_CANCELLATIONS = 50_000;"),
    ("trust: retained cancellations exceed their cap", "trust.mjs", "const MAX_CANCELLATIONS = 2_000;", "const MAX_CANCELLATIONS = 20_000;"),
    ("trust: cancellation status never expires", "trust.mjs", "if (at - value.event.receivedAtMs >= DAY_MS) cancellations.delete(key);", "if (false) cancellations.delete(key);"),
    ("schedule: malformed corpus container is read as rows", "schedule.mjs", "const rows = Array.isArray(candidate) ? candidate : [];", "const rows = candidate;"),
]

OFFLINE_TEST_PATTERN = r'^(?:encode then parse|a frame split into single bytes|two frames in one chunk|content-length lets a body|header values are escaped|CONNECT headers are not escaped|first occurrence of a repeated header|a frame whose content-length|a frame over the size cap|the client never emits or stringifies|stomp: fake transport|feed: fake transport|td:|state:|keychain:|static:|recorder:|relay files:|relay snapshot:|relay offline:|relay heartbeat:|relay shutdown:|schedule stream:|schedule cache:|schedule endpoint offline:|schedule integration offline:|trust:|round17 |parser properties:|TD properties:|Origin guard|SSE heartbeat reports|recording and cache symlinks|recordings stream|reference downloads reject|HTTP errors and logs never echo)'
TEST_FILES = [
    'parser-properties.test.mjs', 'relay.test.mjs', 'robustness17.test.mjs',
    'schedule.test.mjs', 'security17.test.mjs', 'stomp.test.mjs',
    'trust.test.mjs', 'units.test.mjs',
]

def run(work):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=5000',
               f'--test-name-pattern={OFFLINE_TEST_PATTERN}',
               *[str((work / 'relay/tests' / name).relative_to(work)) for name in TEST_FILES]]
    process = subprocess.Popen(command, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, stdin=subprocess.DEVNULL, start_new_session=True)
    expired = False
    try:
        stdout, stderr = process.communicate(timeout=12)
    except subprocess.TimeoutExpired:
        expired = True
        # Node's test runner has child processes. Kill the whole group before reading
        # its pipes, otherwise a leaked child can hang the mutation driver itself.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = process.communicate(timeout=3)
    result = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
    return result, expired or 'testTimeoutFailure' in stdout


def test_names(output):
    return {m.group(1) for m in re.finditer(r'^ok \d+ - (.+)$', output, re.M)
            if '# SKIP' not in m.group(1) and not m.group(1).startswith('relay/tests/')}


def complete_tests(output, expected):
    names = [name for name in re.findall(r'^(?:ok|not ok) \d+ - ([^\n]+)$', output, re.M)
             if not name.startswith('relay/tests/')]
    total = re.search(r'^# tests (\d+)$', output, re.M)
    return total is not None and int(total[1]) == len(expected) and len(names) == len(expected) and set(names) == expected


def named_failures(output, expected):
    failed = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        match = re.match(r'not ok \d+ - ([^\n]+)', block)
        if match and match[1] in expected and 'EPERM' not in block and 'EACCES' not in block:
            failed.add(match[1])
    return failed

for label, fname, old, _ in MUTATIONS:
    if old not in (src / fname).read_text():
        raise SystemExit(f'mutation pattern missing: {label}')

baseline, expired = run(src.parent)
if baseline.returncode or expired:
    print(baseline.stdout, baseline.stderr)
    raise SystemExit('offline baseline must pass')
names = test_names(baseline.stdout)
if not names or not complete_tests(baseline.stdout, names):
    raise SystemExit('offline baseline TAP output is incomplete')
new_names = {name for name in names if name.startswith((
    'relay offline:', 'schedule endpoint offline:', 'schedule integration offline:',
    'round17 ', 'parser properties:', 'TD properties:',
    'Origin guard', 'SSE heartbeat reports', 'recording and cache symlinks',
    'recordings stream', 'reference downloads reject', 'HTTP errors and logs never echo',
    'relay heartbeat: a connected SSE client', 'trust:',
))}
seen, survived, timeouts = set(), [], []
for i, (label, fname, old, new) in enumerate(MUTATIONS):
    with tempfile.TemporaryDirectory(prefix='relay-', dir=scratch) as tmp:
        work = Path(tmp)
        shutil.copytree(src, work / 'relay')
        shutil.copytree(src.parent / 'core', work / 'core')
        f = work / 'relay' / fname
        f.write_text(f.read_text().replace(old, new, 1))
        result, expired = run(work)
        failed = named_failures(result.stdout, names)
        seen.update(failed)
        if expired:
            log = scratch / f'mutation-{i:02d}.log'
            log.write_text(result.stdout + result.stderr)
            print(f'[CAUGHT WITH TIMEOUT] {label} ({log})', flush=True)
            timeouts.append(label)
            continue
        # A timeout is reported separately above; ordinary kills need a named assertion.
        if result.returncode and failed and complete_tests(result.stdout, names) and not result.stderr:
            print(f'[KILLED] {label} <- {sorted(failed)[0]}', flush=True)
        else:
            log = scratch / f'mutation-{i:02d}.log'
            log.write_text(result.stdout + result.stderr)
            print(f'[SURVIVED] {label} (exit {result.returncode}; {log})', flush=True)
            survived.append((label, 'no named assertion failed'))

print(f'\n{len(MUTATIONS) - len(survived)}/{len(MUTATIONS)} mutations caught')
print(f'{len(timeouts)} caught with timeout')
print(f'{len(new_names & seen)}/{len(new_names)} new tests observed failing at least once')
for label, why in survived:
    print('  NOT CAUGHT:', label, '-', why)
for name in sorted(new_names - seen):
    print('  NEVER FAILED:', name)
raise SystemExit(1 if survived or new_names - seen else 0)
