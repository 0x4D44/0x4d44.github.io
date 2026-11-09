"""Mutation check: break the relay on purpose in a copy and confirm a test fails.

usage: python3 -I -u tools/mutation/relay.py <path to kings-cross-src/relay> <scratch dir>
The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first,
and a load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py). A run that hangs is reported as
caught with timeout, as it always was; tools/axis07-evidence.mjs reads these summary lines.
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

# (label, file, old, new)
# The former recorder TRUST-state mutation was retired as equivalent: TdState.apply's
# validTdEvent guard already rejects TRUST events, whether or not recorder checks kind.
MUTATIONS = [
    ('area sclass: private state leaks into Y9 root', 'sclass-areas.mjs', 'const areaData = areaDataDir(dataDir, area);', 'const areaData = dataDir;'),
    ('area sclass: unknown geography uses KX assets', 'sclass-areas.mjs', 'if (!isY9 && (!areaConfig.overlayPath || !areaConfig.trackPath)) {', 'if (false) {'),
    ('area sclass: duplicate jobs accepted', 'sclass-areas.mjs', 'if (seen.has(area)) throw new Error(`duplicate area ${area}`);', ''),
    ('area sclass: shared recordings location lost', 'sclass-areas.mjs', 'recordingsDir: isY9 ? undefined : recordingsDir,', 'recordingsDir: undefined,'),
    ('area sclass: runner ignores recordings directory', 'sclass-job.mjs', "if (recordingsDir !== undefined) args.push('--recordings-dir', recordingsDir);", ''),
    ('area sclass: runner ignores station overlay', 'sclass-job.mjs', "if (overlayPath !== undefined) args.push('--overlay', overlayPath);", ''),
    ('area sclass: runner ignores station track', 'sclass-job.mjs', "if (trackPath !== undefined) args.push('--track', trackPath);", ''),
    ('areas: malformed configured selectors accepted', 'areas.mjs', 'const AREA_ID = /^[A-Z0-9]{2}$/;', 'const AREA_ID = /^.+$/;'),
    ('areas: duplicate configuration entries create duplicate routers', 'areas.mjs', 'if (!seen.has(area)) {', 'if (true) {'),
    ('areas: unknown selector accepted', 'areas.mjs', 'if (!allowed.has(selected)) throw new Error(`areas: unknown area ${JSON.stringify(selected)}`);', ''),
    ('areas: repeated query selector accepted', 'areas.mjs', "if (selectors.length > 1) throw new Error('areas: area selector must appear only once');", ''),
    ('areas: configured selector ignored', 'areas.mjs', 'selectors.length === 0 ? fallback : selectors[0]', 'fallback'),
    ('areas: private tables use the Y9 root', 'areas.mjs', "return area === 'Y9' ? dataDir : path.join(dataDir, 'areas', area);", 'return dataDir;'),
    ('feed: allowlist filter missing', 'feed.mjs', 'parseTdBody(body).filter((event) => acceptedAreas.has(event.area))', 'parseTdBody(body)'),
    ('feed: parse each body twice', 'feed.mjs', 'parseTdBody(body).filter((event) => acceptedAreas.has(event.area))', '(parseTdBody(body), parseTdBody(body)).filter((event) => acceptedAreas.has(event.area))'),
    ('feed: legacy area always becomes Y9', 'feed.mjs', "(area ?? 'Y9')", "'Y9'"),
    ('feed: invalid allowlist falls back silently', 'feed.mjs', "const acceptedAreas = new Set(configuredAreas(areas === undefined ? (area ?? 'Y9') : areas));", "const acceptedAreas = new Set(['Y9']);"),
    ('relay router: all events enter default state', 'relay.mjs', 'const context = contexts.get(e.area);', 'const context = contexts.get(defaultArea);'),
    ('relay router: area selector ignored after validation', 'relay.mjs', 'area = requestArea(url, allowedAreas, defaultArea);', 'requestArea(url, allowedAreas, defaultArea); area = defaultArea;'),
    ('relay router: reconnect snapshots only the first area', 'relay.mjs', 'for (const { status, recorder } of contexts.values()) {', 'for (const { status, recorder } of [...contexts.values()].slice(0, 1)) {'),
    ('relay router: another area refreshes freshness', 'relay.mjs', 'status.lastEventAt = t;', 'for (const c of contexts.values()) c.status.lastEventAt = t;'),
    ('relay router: nonY9 inherits KX timetable', 'relay.mjs', "const schedules = station?.schedule === 'available' ? createScheduleStore", 'const schedules = true ? createScheduleStore'),
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
    ("state: SG/SH only refresh their first byte", "state.mjs", "offset < sclassWidth", "offset < 1"),
    ("state: S-class payload width is unchecked", "state.mjs", "if (!sclassWidth || e.data.length !== sclassWidth * 2) return false;", "if (!sclassWidth) return false;"),
    ("state: S-class address overflow is accepted", "state.mjs", "if (sclassFirst + sclassWidth - 1 > 0xffff) return false;", "if (false) return false;"),
    ("keychain: first lookup asks for the password", "keychain.mjs", "['find-generic-password', '-s', service])", "['find-generic-password', '-s', service, '-w'])"),
    ("keychain: error leaks stderr text", "keychain.mjs", "reject(new Error(`keychain: lookup failed (exit ${err.code ?? 'unknown'})`))", "reject(new Error(`keychain: ${err.message} (exit ${err.code ?? 'unknown'})`))"),
    ("keychain: allow non-macOS", "keychain.mjs", "if (platform !== 'darwin') throw new Error('keychain: only macOS is supported');", ""),
    ("relay: no Host check", "relay.mjs", "if (!['127.0.0.1', 'localhost'].some((h) => host === `${h}:${port}`))", "if (false)"),
    ("relay: Host check by prefix", "relay.mjs", "host === `${h}:${port}`", "(host ?? '').startsWith(h)"),
    ("relay: Host check ignores the port", "relay.mjs", "host === `${h}:${port}`", "(host ?? '').split(':')[0] === h"),
    ("relay: Host check by suffix", "relay.mjs", "host === `${h}:${port}`", "(host ?? '').endsWith(`${port}`)"),
    ("relay: any method allowed", "relay.mjs", "return method === 'GET' ? null : 405;", "return null;"),
    ("relay: bind all interfaces", "relay.mjs", "server.listen(port, '127.0.0.1', resolve)", "server.listen(port, '0.0.0.0', resolve)"),
    ("relay: no recording", "relay.mjs", "const row = recorder.append(e);\n            recent.push(row);", "const row = { t, e };\n            recent.push(row);"),
    ("relay: no initial SSE snapshot", "relay.mjs", "if (!writeEvent(res, `event: snapshot\\ndata: ${JSON.stringify({ ...state.snapshot(), t: now() })}\\n\\n`)) return;", "if (false) return;"),
    ("relay: CORS wide open", "relay.mjs", "'cache-control': 'no-store' });\n  res.end(text);", "'cache-control': 'no-store', 'access-control-allow-origin': '*' });\n  res.end(text);"),
    ("feed: log leaks the passcode", "feed.mjs", "log(`feed: connected${server ? ` to ${server}` : ''}, subscribed to ${topic}`);", "log(`feed: connected ${creds.secret}`);"),
    ("feed: never reconnect on close", "feed.mjs", "      onStatus({ state: 'disconnected' });\n      schedule();", "      onStatus({ state: 'disconnected' });"),
    ("feed: bad message not logged", "feed.mjs", "log(`feed: dropped a bad message (${err.message})`);", ""),
    ("static: password omitted from basic auth", "static.mjs", "`${account}:${secret}`", "`${account}:`"),
    ("static: stale cache always trusted", "static.mjs", "if (now() - st.mtimeMs < maxAgeMs) return await cached.readFile();", "return await cached.readFile();"),
    ("static: unknown names allowed", "static.mjs", "if (!Object.hasOwn(KINDS, kind)) throw new Error('static: unknown file');", "if (false) throw new Error('static: unknown file');"),
    ("recorder: never roll the day", "recorder.mjs", "if (d !== streamDay) {", "if (streamDay === '') {"),
    ("recorder: records lose their newline separators", "recorder.mjs", "const text = `${JSON.stringify(row)}\\n`;", "const text = JSON.stringify(row);"),
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
    ("relay: shutdown omits recorder close", "relay.mjs", "const recorded = Promise.all([...contexts.values()].map(({ recorder }) => recorder.close()));", "const recorded = Promise.resolve();"),
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
    ("schedule: missing HTTP validation", "relay.mjs", "dates.length > 1 || !validDate(date) || [...url.searchParams.keys()].some(key => key !== 'date' && key !== 'area')", "false"),
    ("schedule: all requests use today", "relay.mjs", "const date = dates[0] ?? scheduleDate(now());", "const date = scheduleDate(now());"),
    ("schedule: unavailable timetable is an HTTP error", "relay.mjs", "if (!doc) return json(res, 200, { date, available: false, reason: 'no timetable' });", "if (!doc) return json(res, 404, { date, available: false, reason: 'no timetable' });"),
    ("relay: unknown routes claim success", "relay.mjs", "default:\n          return json(res, 404, { error: 'not found' });", "default:\n          return json(res, 200, { error: 'not found' });"),
    ("feed: TRUST subscription missing", "feed.mjs", "if (trustTopic) client.subscribe(trustTopic, { id: 'trust' });", ""),
    ("feed: TRUST routed into TD parser", "feed.mjs", "trustTopic && (destination === trustTopic || subscription === 'trust')", "false"),
    ("relay: TRUST not broadcast", "relay.mjs", "else if (row.e.kind === 'trust')", "else if (false)"),
    ("relay: TRUST not recorded", "relay.mjs", "const row = recorder.append(e);\n        for (const send", "const row = { t: now(), e };\n        for (const send"),
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
    ("stomp: intentional disconnect leaves the client active", "stomp.mjs", "    } finally {\n      this.#onClose();", "    } finally {"),
    ("recorder: successful close retains deadline", "recorder.mjs", ".finally(() => clearTimeout(deadline));", ".finally(() => {});"),
    ("recorder: blocked close never times out", "recorder.mjs", "setTimeout(() => fail('close timeout'), 5000)", "setTimeout(() => fail('close timeout'), 50_000)"),
    ("recorder: failed cleanup escapes", "recorder.mjs", "try { entry.stream.destroy(); }\n      catch { /* Recording is already failed; transport cleanup cannot recover it. */ }", "entry.stream.destroy();\n      try {}"),
    ("stomp: handshake never times out", "stomp.mjs", "30_000);", "3_600_000);"),
    ("stomp: successful handshake retains deadline", "stomp.mjs", "        clearTimeout(this.#handshakeTimer);", ""),
    ("recorder: stream errors are unhandled", "recorder.mjs", "stream.on('error', () => { fail('write failed'); entry.settle(); });", ""),
    ("recorder: stream errors expose private details", "recorder.mjs", "stream.on('error', () => { fail('write failed');", "stream.on('error', (error) => { fail(error.message);"),
    ("recorder: queue limit doubled", "recorder.mjs", "const MAX_QUEUE_BYTES = 4 * 1024 * 1024;", "const MAX_QUEUE_BYTES = 8 * 1024 * 1024;"),
    ("recorder: failed writer is not destroyed", "recorder.mjs", "entry.stream.destroy();", ""),
    ("recorder: recording failure suppresses live snapshots", "recorder.mjs", "if (event.kind === 'snapshot') onSnapshot(row);", "if (!failure && event.kind === 'snapshot') onSnapshot(row);"),
    ("relay: recording failures missing from health", "relay.mjs", "recording: recorder.stats(),", ""),
    ("relay clock: initial snapshot loses capture timestamp", "relay.mjs", "JSON.stringify({ ...state.snapshot(), t: now() })", "JSON.stringify(state.snapshot())"),
    ("relay clock: checkpoint loses recorder timestamp", "relay.mjs", "JSON.stringify({ ...snapshot, t: row.t })", "JSON.stringify(snapshot)"),
    ("relay clock: TD uses an independent timestamp", "relay.mjs", "const row = recorder.append(e);\n            recent.push(row);", "const row = { ...recorder.append(e), t: now() };\n            recent.push(row);"),
    ("relay clock: TRUST uses an independent timestamp", "relay.mjs", "const row = recorder.append(e);\n        for (const send", "const row = { ...recorder.append(e), t: now() };\n        for (const send"),
    ("recorder clock: append does not return captured row", "recorder.mjs", "if (event.kind !== 'trust') state.apply(event);\n      return row;", "if (event.kind !== 'trust') state.apply(event);\n      return undefined;"),
    ("recorder clock: failed writer loses captured row", "recorder.mjs", "if (event.kind !== 'trust') state.apply(event);\n      return row;", "if (event.kind !== 'trust') state.apply(event);\n      return failure ? undefined : row;"),
]

OFFLINE_TEST_PATTERN = r'^(?:area S-class jobs|sclass job:|areas:|relay multi-area:|feed: invalid areas|feed: legacy area|encode then parse|a frame split into single bytes|two frames in one chunk|content-length lets a body|header values are escaped|CONNECT headers are not escaped|first occurrence of a repeated header|a frame whose content-length|a frame over the size cap|the client never emits or stringifies|stomp: fake transport|feed: fake transport|td:|state:|keychain:|static:|recorder:|recorder robustness:|recorder canonical clock:|relay canonical clock:|stomp robustness:|relay robustness:|relay files:|relay snapshot:|relay offline:|relay heartbeat:|relay shutdown:|schedule stream:|schedule cache:|schedule endpoint offline:|schedule integration offline:|trust:|round17 |parser properties:|TD properties:|Origin guard|SSE heartbeat reports|recording and cache symlinks|recordings stream|reference downloads reject|HTTP errors and logs never echo)'
TEST_FILES = [
    'sclass-areas.test.mjs', 'sclass-job.test.mjs', 'areas.test.mjs', 'multi-area.test.mjs', 'parser-properties.test.mjs', 'relay.test.mjs', 'robustness17.test.mjs',
    'schedule.test.mjs', 'security17.test.mjs', 'stomp.test.mjs',
    'trust.test.mjs', 'units.test.mjs', 'sclass-state.test.mjs', 'recorder.test.mjs',
]

FILES = [f'relay/tests/{name}' for name in TEST_FILES]
NEW_PREFIXES = (
    'area S-class jobs', 'sclass job: CLI runner passes shared', 'areas:', 'relay multi-area:', 'feed: invalid areas', 'feed: legacy area', 'feed: fake transport parses a mixed-area',
    'relay canonical clock:', 'recorder canonical clock:',
    'relay offline:', 'schedule endpoint offline:', 'schedule integration offline:',
    'round17 ', 'parser properties:', 'TD properties:',
    'Origin guard', 'SSE heartbeat reports', 'recording and cache symlinks',
    'recordings stream', 'reference downloads reject', 'HTTP errors and logs never echo',
    'relay heartbeat: a connected SSE client', 'trust:', 'state: S-class',
)

tally = kxmut.Tally(timeout_is_caught=True)
with kxmut.workspace(src.parent, scratch, 'relay') as work:
    suite = kxmut.Suite(work, test_timeout_ms=5000, timeout=12)
    names = suite.baseline(FILES, [OFFLINE_TEST_PATTERN]).passed
    new_names = {name for name in names if name.startswith(NEW_PREFIXES)}
    for label, fname, old, new in MUTATIONS:
        try:
            with kxmut.mutated(work / 'relay' / fname, [(old, new)]):
                # A listener refused by the sandbox (EPERM/EACCES) is not a test noticing the mutation.
                verdict, run = suite.judge(FILES, [OFFLINE_TEST_PATTERN], block_markers=r'EPERM|EACCES')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        if verdict.kind == kxmut.KILLED and run.stderr:
            verdict = kxmut.Verdict(kxmut.ERROR, 'unexpected stderr: ' + run.stderr.strip()[:200])
        tally.record(label, verdict)
status = tally.finish()
seen = tally.red
print(f'{len(new_names & seen)}/{len(new_names)} new tests observed failing at least once')
for name in sorted(new_names - seen):
    print('  NEVER FAILED:', name)
sys.exit(1 if status or new_names - seen else 0)
