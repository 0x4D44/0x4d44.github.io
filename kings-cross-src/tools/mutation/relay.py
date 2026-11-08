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
MUTATIONS = [
    ("stomp: ignore content-length", "stomp.mjs", "if (cl !== undefined && /^\\d+$/.test(cl)) {", "if (false) {"),
    ("stomp: do not skip heart-beat newlines", "stomp.mjs", "while (skip < this.#buf.length && (this.#buf[skip] === 0x0a || this.#buf[skip] === 0x0d)) skip++;", "while (false) skip++;"),
    ("stomp: do not escape colon in headers", "stomp.mjs", ".replace(/:/g, '\\\\c')", ""),
    ("stomp: escape CONNECT headers", "stomp.mjs", "new Set(['CONNECT', 'CONNECTED', 'STOMP'])", "new Set([])"),
    ("stomp: last header wins", "stomp.mjs", "if (!(key in headers)) headers[key]", "if (true) headers[key]"),
    ("stomp: heart-beat timeout never fires", "stomp.mjs", "expect * 2.5", "expect * 1e9"),
    ("stomp: subscribe immediately", "stomp.mjs", "if (this.#connected) this.#socket.write(frame);", "if (true) this.#socket.write(frame);"),
    ("stomp: no frame size cap", "stomp.mjs", "if (n > MAX_FRAME_BYTES) throw new Error('stomp: frame too large');", ""),
    ("stomp: ERROR frame ignored", "stomp.mjs", "this.#fault(new Error(`stomp: ERROR frame: ${frame.headers.message ?? 'no message'}`));", ""),
    ("td: area filter keeps everything", "td.mjs", "events.filter((e) => e.area === area)", "events"),
    ("td: CA time not numeric", "td.mjs", "time: ms(m.time) };\n    case 'CB'", "time: m.time };\n    case 'CB'"),
    ("state: step does not clear old berth", "state.mjs", "if (e.from) this.#berths.delete(e.from);", ""),
    ("state: ignore area", "state.mjs", "if (e.area !== this.#area) return false;", ""),
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
    ("relay: no initial SSE snapshot", "relay.mjs", "res.write(`event: snapshot\\ndata: ${JSON.stringify(state.snapshot())}\\n\\n`);", ""),
    ("relay: CORS wide open", "relay.mjs", "'cache-control': 'no-store' });\n  res.end(text);", "'cache-control': 'no-store', 'access-control-allow-origin': '*' });\n  res.end(text);"),
    ("feed: log leaks the passcode", "feed.mjs", "log(`feed: connected${server ? ` to ${server}` : ''}, subscribed to ${topic}`);", "log(`feed: connected ${creds.secret}`);"),
    ("feed: never reconnect on close", "feed.mjs", "      onStatus({ state: 'disconnected' });\n      schedule();", "      onStatus({ state: 'disconnected' });"),
    ("feed: bad message not logged", "feed.mjs", "log(`feed: dropped a bad message (${err.message})`);", ""),
    ("static: password omitted from basic auth", "static.mjs", "`${account}:${secret}`", "`${account}:`"),
    ("static: stale cache always trusted", "static.mjs", "if (now() - st.mtimeMs < maxAgeMs) return await readFile(file);", "return await readFile(file);"),
    ("static: unknown names allowed", "static.mjs", "if (!(kind in KINDS)) throw new Error(`static: unknown file \"${kind}\"`);", ""),
    ("recorder: never roll the day", "recorder.mjs", "if (d !== streamDay) {", "if (streamDay === '') {"),
    ("recorder: records lose their newline separators", "recorder.mjs", "stream.write(`${JSON.stringify(row)}\\n`);", "stream.write(JSON.stringify(row));"),
    ("recorder: no startup snapshot", "recorder.mjs", "  checkpoint();\n  const timer", "  const timer"),
    ("recorder: checkpoint interval is one hour", "recorder.mjs", "10 * 60_000", "60 * 60_000"),
    ("recorder: interval never checkpoints", "recorder.mjs", "schedule(checkpoint,", "schedule(() => {},"),
    ("recorder: snapshots forget observed state", "recorder.mjs", "state.apply(event);", ""),
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
]

def run(work):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=5000',
               *sorted(str(p.relative_to(work)) for p in (work / 'relay/tests').glob('*.test.mjs'))]
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

for label, fname, old, _ in MUTATIONS:
    if old not in (src / fname).read_text():
        raise SystemExit(f'mutation pattern missing: {label}')

baseline, expired = run(src.parent)
if baseline.returncode or expired:
    print(baseline.stdout, baseline.stderr)
    raise SystemExit('baseline must pass and exit with loopback listeners enabled')
names = {m.group(1) for m in re.finditer(r'^ok \d+ - (.+)$', baseline.stdout, re.M) if '# SKIP' not in m.group(1)}
new_names = {name for name in names if name.startswith(('recorder: captures', 'recorder: ignores', 'relay snapshot:', 'relay shutdown:', 'relay files: sclass', 'stomp: fake', 'feed: fake'))}
seen, survived, timeouts = set(), [], []
for i, (label, fname, old, new) in enumerate(MUTATIONS):
    with tempfile.TemporaryDirectory(prefix='relay-', dir=scratch) as tmp:
        work = Path(tmp)
        shutil.copytree(src, work / 'relay')
        f = work / 'relay' / fname
        f.write_text(f.read_text().replace(old, new, 1))
        result, expired = run(work)
        failures = re.finditer(r'^not ok \d+ - (.+)\n((?:[ \t].*\n)*)', result.stdout, re.M)
        failed = {m.group(1) for m in failures if 'ERR_ASSERTION' in m.group(2)} & names
        seen.update(failed)
        if expired:
            log = scratch / f'mutation-{i:02d}.log'
            log.write_text(result.stdout + result.stderr)
            print(f'[CAUGHT WITH TIMEOUT] {label} ({log})', flush=True)
            timeouts.append(label)
            continue
        # A timeout is reported separately above; ordinary kills need a named assertion.
        if result.returncode and failed:
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
