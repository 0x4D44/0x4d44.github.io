"""Mutation check: break the relay on purpose in a copy and confirm a test fails.

usage: python3 -I -u tools/mutation/relay.py <path to kings-cross-src/relay> <scratch dir>
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

src = Path(sys.argv[1])
scratch = Path(sys.argv[2])

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
    ("relay: no Host check", "relay.mjs", "if (!['127.0.0.1', 'localhost'].some((h) => req.headers.host === `${h}:${boundPort}`)) {", "if (false) {"),
    ("relay: any method allowed", "relay.mjs", "if (req.method !== 'GET')", "if (false)"),
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
]

survived = []
for i, (label, fname, old, new) in enumerate(MUTATIONS):
    work = scratch / f"m{i:02d}"
    if work.exists():
        shutil.rmtree(work)
    shutil.copytree(src, work / "relay", ignore=shutil.ignore_patterns("node_modules"))
    f = work / "relay" / fname
    text = f.read_text()
    if old not in text:
        print(f"[SKIP ] {label}: pattern not found in {fname}")
        survived.append((label, "pattern not found"))
        continue
    f.write_text(text.replace(old, new, 1))
    try:
        r = subprocess.run(
            ["node", "--test", "--test-force-exit", "--test-timeout=4000", *sorted(str(p.relative_to(work)) for p in (work / "relay" / "tests").glob("*.test.mjs"))],
            cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=45,
        )
    except subprocess.TimeoutExpired:
        print(f"[KILLED] {label}  (suite hung: counted as caught)", flush=True)
        shutil.rmtree(work, ignore_errors=True)
        continue
    failed = sorted(set(re.findall(r"^\s*✖ (.+?) \(", r.stdout, re.M)))
    # top-level test failures only: drop the summary lines
    failed = [n for n in failed if not n.startswith("failing tests")]
    if r.returncode != 0 and failed:
        print(f"[KILLED] {label}  <- {failed[0]}" + (f" (+{len(failed) - 1} more)" if len(failed) > 1 else ""))
    elif r.returncode != 0:
        print(f"[KILLED] {label}  (non-zero exit, no named test)")
    else:
        print(f"[SURVIVED] {label}")
        survived.append((label, "tests still pass"))
    shutil.rmtree(work)

print()
print(f"{len(MUTATIONS) - len(survived)}/{len(MUTATIONS)} mutations caught")
for label, why in survived:
    print("  NOT CAUGHT:", label, "-", why)
