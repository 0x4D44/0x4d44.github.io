"""Mutation checks for the live train renderer, feed and relay file endpoints.

python3 -I -u kings-cross-src/tools/mutation/live.py kings-cross-src .scratch/live-mutations
Listener-free relay tests run here; the lead runs the socket integration suite outside the sandbox.
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
F = 'web/src/feed.ts'
T = 'web/src/trains-live.ts'
R = 'relay/relay.mjs'
M = [
    ('live cancellation uses last frame instead of recorded time', F, 'recordedAtMs - epochMs', 'timeline.timeMs()'),
    ('timeline drops observation time before applying', F, 'sink.apply(event, atMs, observedAtMs)', 'sink.apply(event, atMs)'),
    ('snapshot cancels drop their observation time', F, 'for (const change of changes) apply(change, atMs, observedAtMs);', 'for (const change of changes) apply(change, atMs);'),
    ('invalid recorder timestamp accepted', F, "if (!epoch(packet.t)) throw new Error('invalid recorder timestamp');", "void packet.t;"),
    ('proxy preserves the wrong Host', 'vite.config.ts', 'changeOrigin: true', 'changeOrigin: false'),
    ('default mode never probes relay', F, "requested === null ? 'auto'", "requested === null ? 'demo'"),
    ('recording rows remain out of time order', F, 'return rows.sort((a, b) => a.t - b.t);', 'return rows;'),
    ('recording parse start is not measured', F, "performance.mark('kx:recording-parse-start');", ''),
    ('failed recording parse is not timed', F, "} finally { performance.mark('kx:recording-parse-end'); }", "} finally { if (false) performance.mark('kx:recording-parse-end'); }"),
    ('replay speed ignored', F, 'seconds * speed * 1000', 'seconds * 1000'),
    ('event applied before advancing to its time', F, 'advanceTo(atMs); reconcile(event, time, observedAtMs);', 'reconcile(event, time, observedAtMs); advanceTo(atMs);'),
    ('backoff never increases', F, '500 * 2 ** Math.min(16, Math.max(0, Math.floor(attempt)))', '500'),
    ('reconnect snapshot does not cancel missing descriptions', F, 'if (!present.has(descr))', 'if (false)'),
    ('failed EventSource left connected', F, 'stream?.close(); stream = undefined;', 'stream = undefined;'),
    ('scheduled reconnect survives disposal', F, 'if (timer !== undefined) unschedule(timer);', 'if (false) unschedule(timer);'),
    ('failed default probe repeats its request', F, 'catch { return false; }', "catch { await fetchImpl('/relay/health').catch(() => {}); return false; }"),
    ('silence watchdog waits too long', F, 'const silenceLimitMs = 15_000;', 'const silenceLimitMs = 150_000;'),
    ('opening the stream does not renew the watchdog deadline', F, 'opened = true; lastMessageAt = now(); watch(current);', 'opened = true; watch(current);'),
    ('ping events do not refresh liveness', F, "current.addEventListener('ping',", "current.addEventListener('ignored-ping',"),
    ('stale stream ping extends liveness', F, "current.addEventListener('ping', (event) => {\n      if (disposed || stream !== current) return;", "current.addEventListener('ping', (event) => {\n      if (disposed) return;"),
    ('snapshot does not refresh liveness', F, "received(current); deliver(parsed, at);\n      } catch { retry('invalid relay snapshot'); }", "deliver(parsed, at);\n      } catch { retry('invalid relay snapshot'); }"),
    ('TD does not refresh liveness', F, "received(current); deliver(parsed, at);\n      } catch { retry('invalid relay event'); }", "deliver(parsed, at);\n      } catch { retry('invalid relay event'); }"),
    ('dispose leaves the watchdog scheduled', F, 'disposed = true; stopWatchdog(); stream?.close();', 'disposed = true; stream?.close();'),
    ('retry leaves the old watchdog scheduled', F, 'opened = false;\n    stopWatchdog();', 'opened = false;'),
    ('cancelled watchdog callback replaces its successor', F, ' || generation !== watchdogGeneration', ''),
    ('watchdog ignores the injected clock', F, 'const now = deps.now ?? (() => performance.now());', 'const now = () => performance.now();'),
    ('legacy heartbeat no longer connects consumers', F, "upstream = 'connected';\n        }", "upstream = undefined;\n        }"),
    ('legacy heartbeat overrides explicit upstream state', F, " && upstream === undefined", ""),
    ('legacy heartbeat erases stale data age', F, "        paintConnection();\n      } catch { retry('invalid relay heartbeat'); }", "        lastDataAt = now(); paintConnection();\n      } catch { retry('invalid relay heartbeat'); }"),
    ('HTTP open alone resets retry backoff', F, 'opened = true; lastMessageAt = now();', 'opened = true; attempt = 0; lastMessageAt = now();'),
    ('malformed snapshot holds the bad stream open', F, "catch { retry('invalid relay snapshot'); }", "catch { report('invalid relay snapshot'); }"),
    ('malformed heartbeat holds the bad stream open', F, "catch { retry('invalid relay heartbeat'); }", "catch { report('invalid relay heartbeat'); }"),
    ('heartbeat accepts a missing receive time', F, '!object(ping) || !epoch(ping.t) ||', '!object(ping) ||'),
    ('heartbeat accepts an invalid upstream state', F, "if (Object.hasOwn(ping, 'feed') && !['connecting', 'connected', 'disconnected', 'disabled'].includes(String(ping.feed)))", 'if (false)'),
    ('heartbeat accepts an invalid last-event time', F, '(ping.lastEventAt != null && !epoch(ping.lastEventAt))', 'false'),
    ('public TRUST arrival timestamp falls through to text validation', F, "['actualArrivalMs', 'actualDepartureMs', 'publicArrivalMs', 'publicDepartureMs', 'updatedAtMs', 'cancellationUpdatedAtMs']", "['actualArrivalMs', 'actualDepartureMs', 'publicDepartureMs', 'updatedAtMs', 'cancellationUpdatedAtMs']"),
    ('public TRUST departure timestamp falls through to text validation', F, "['actualArrivalMs', 'actualDepartureMs', 'publicArrivalMs', 'publicDepartureMs', 'updatedAtMs', 'cancellationUpdatedAtMs']", "['actualArrivalMs', 'actualDepartureMs', 'publicArrivalMs', 'updatedAtMs', 'cancellationUpdatedAtMs']"),
    ('public TRUST timestamp accepts numeric strings', F, "].includes(key) ? !epoch(field)", "].includes(key) ? !(epoch(field) || typeof field === 'string')"),
    ('legacy cache requires nonexistent realtime metadata', F, "doc.calls.some(call => !validBoardService(call))", "doc.calls.some(call => !validBoardService(call) || !call.realtime)"),
    ('malformed calls bypass schedule validation', F, "doc.calls.some(call => !validBoardService(call))", "false"),
    ('malformed schedule discards last accepted bookings', F, "})().catch(() => { misses++;", "})().catch(() => { calls = undefined; misses++;"),
    ('unavailable timetable fact is ignored', F, 'if (doc.available === false) {', 'if (false) {'),
    ('unavailable timetable is presented as available empty bookings', F, 'if (doc.available === false) {', 'if (doc.available === false) { calls = [];'),
    ('unavailable replay timetable is polled forever', F, "if (options.mode === 'replay') settled = true;", 'if (false) settled = true;'),
    ('relay heartbeat interval triples', R, 'schedule(ping, 5000)', 'schedule(ping, 15000)'),
    ('relay heartbeat uses an invisible event name', R, 'event: ping', 'event: wrong'),
    ('request close leaves heartbeat running', R, "req.once('close', stop);", "req.once('unused-close', stop);"),
    ('heartbeat writes after request close', R, 'if (!stopped) {', 'if (true) {'),
    ('heartbeat stop clears twice', R, 'if (stopped) return;', ''),
    ('events endpoint omits its heartbeat', R, 'const stopHeartbeat = startEventHeartbeat(req, res, { now, immediate: true, metadata: () => ({ feed: status.state, lastEventAt: status.lastEventAt }) });', 'const stopHeartbeat = () => {};'),
    ('trail sampled from tail instead of nose', T, 'let i = train.occupied.length - 1; i >= 0; i--', 'let i = 0; i < train.occupied.length; i++'),
    ('car chord compression ignored', T, 'const scaleZ = chord / (car.bogies[1] - car.bogies[0]);', 'const scaleZ = 1;'),
    ('all cars face the same direction', T, 'node.rotation.y = pose.rotationY;', 'node.rotation.y = 0;'),
    ('body clearances removed', T, 'export const COUPLING_CLEARANCE = END_GAP;', 'export const COUPLING_CLEARANCE = 0;'),
    ('all headcodes use five cars', T, "description[0] === '1'", "description[0] === '9'"),
    ('same-opacity trains do not share a palette', T, 'const shared = buckets.get(opacity);', 'const shared = undefined;'),
    ('exact opacity is quantized in a palette copy', T, 'setOpacity(shared, palette.opacity);', 'setOpacity(shared, Math.round(palette.opacity * 100) / 100);'),
    ('fading opacity never enables material transparency', T, 'const transparent = opacity < 1;', 'const transparent = false;'),
    ('fading opacity keeps depth writes enabled', T, 'material.opacity = opacity; material.depthWrite = !transparent;', 'material.opacity = opacity; material.depthWrite = true;'),
    ('palette lookup ignores train kind', T, 'const shared = buckets.get(opacity);', "const shared = palettes.get('lner9')?.get(opacity);"),
    ('fade palettes churn instead of reusing their materials', T, 'if (previous && !needed.has(previous.opacity)) {', 'if (false && previous && !needed.has(previous.opacity)) {'),
    ('palette lookup follows the changing headcode', T, 'assigned.get(view.id)', 'assigned.get(view.description as unknown as number)'),
    ('live layer mutates cached template materials', T, 'const shared = original.clone();', 'const shared = original;'),
    ('palette copies clone their shared textures', T, 'const shared = original.clone();', 'const shared = original.clone(); if (shared instanceof THREE.MeshStandardMaterial) shared.map = shared.map?.clone() ?? null;'),
    ('live palette disposal disposes cached template materials', T, 'for (const material of palette.copies.values()) material.dispose();', 'for (const material of palette.copies.keys()) material.dispose();'),
    ('shared palette is disposed before its last user leaves', T, 'if (!used.has(palette)) {', 'if (used.has(palette)) {'),
    ('empty update leaves unused palettes cached', T, 'releaseUnused(used);', 'if (views.length) releaseUnused(used);'),
    ('vanished groups left in scene', T, 'parent.remove(t.group);', 't.group.visible = false;'),
    ('clipped trains extrapolate unseen cars', T, 'if (car.end > train.occupiedLengthM + 1e-7) continue;', 'if (false) continue;'),
    ('straight cars shifted off track', T, 'position: [frontBogie.point[0] - dx', 'position: [1 + frontBogie.point[0] - dx'),
    ('birth layout ignores the injected physical kind', T, 'const resolvedKind = kindFor?.(view);', 'const resolvedKind = undefined;'),
    ('GR uses the wrong operator fleet', T, "case 'GR': return spec.operator === 'LNER';", "case 'GR': return spec.operator === 'Great Northern';"),
    ('GN destination Moorgate is ignored', T, "const moorgate = [service.origin, service.destination].some(s => /^(?:MORGATE|MOORGATE)$/i.test(s.trim()));", "const moorgate = /^(?:MORGATE|MOORGATE)$/i.test(service.origin.trim());"),
    ('GN formation matching ignores the nearest length', T, 'Math.abs(layoutForKind(kind).length - lengthM) < Math.abs(layoutForKind(best).length - lengthM) ? kind : best, undefined);', 'Math.abs(layoutForKind(kind).length - lengthM) > Math.abs(layoutForKind(best).length - lengthM) ? kind : best, undefined);'),
    ('TL class matching ignores the 700 catalogue entry', T, "case 'TL': return spec.operator === 'Thameslink' && /700/.test(spec.classes);", "case 'TL': return spec.operator === 'Thameslink' && /701/.test(spec.classes);"),
    ('GC class matching ignores the 180 catalogue entry', T, "case 'GC': return spec.operator === 'Grand Central' && /180/.test(spec.classes);", "case 'GC': return spec.operator === 'Grand Central' && /181/.test(spec.classes);"),
    ('unsupported operators fall back to an Azuma kind', T, '? kind : best, undefined);', "? kind : best, 'lner5');"),
    ('new physical births skip timetable resolution', T, 'const service = serviceFor(description, birth.timeMs), platform = service?.platform ?? undefined;', 'const service = undefined, platform = undefined;'),
    ('physical kind follows the renamed headcode', T, 'born.get(view.id)?.kind, { formationFor }', 'kindForDescription(view.description), { formationFor }'),
    ('known platform does not restrict operator formations', T, 'maxLengthM === undefined || layoutForKind(kind).length <= maxLengthM + 1e-8', 'true'),
    ('non-fitting fleet chooses its longest formation', T, 'layoutForKind(kind).length < layoutForKind(best).length ? kind : best, undefined);', 'layoutForKind(kind).length > layoutForKind(best).length ? kind : best, undefined);'),
    ('default platform capacities are never loaded', T, 'options.platformLimitsM ?? defaultPlatformLimits', 'options.platformLimitsM ?? new Map<string, number>()'),
    ('matched platform capacity is discarded', T, 'platform === undefined ? undefined : limits.get(platform)', 'undefined'),
    ('birth formation changes with late platform evidence', T, 'if (previous) return layoutForKind(previous.kind).length;', 'if (false && previous) return layoutForKind(previous.kind).length;'),
    ('oversized shortest formation loses its flag', T, 'const doesNotFit = limitM !== undefined && layoutForKind(kind).length > limitM + 1e-8;', 'const doesNotFit = false;'),
    ('capped formation loses its flag', T, 'const capped = !doesNotFit && kind !== preferred;', 'const capped = false;'),
    ('fresh motion views lose the capped birth reason', T, 'view.formationNote = kindFor?.formationFor?.(view)?.note;', 'view.formationNote = undefined;'),
    ('tooltip hides capped formation reasons', 'web/src/tooltip.ts', "(view as TrainView & { formationNote?: string })?.formationNote ?", 'false ?'),
    ('platform limits prefer the polygon over the published authority', 'core/station.ts', 'publishedLengthsM[ref] ?? polygons.get(ref)', 'polygons.get(ref) ?? publishedLengthsM[ref]'),
    ('platform limits omit the polygon fallback', 'core/station.ts', 'publishedLengthsM[ref] ?? polygons.get(ref)', 'publishedLengthsM[ref]'),
    ('platform limits lose published lengths without a polygon', 'core/station.ts', 'if (lengthM !== undefined) limits.set', 'if (lengthM !== undefined && polygons.has(ref)) limits.set'),
    ('platform limits omit the stop clearance', 'core/station.ts', 'Math.max(0, lengthM - stopClearanceM)', 'Math.max(0, lengthM)'),
    ('platform limits accept invalid clearance', 'core/station.ts', '!Number.isFinite(stopClearanceM) || stopClearanceM < 0', 'false'),
    ('platform limits permit negative capacity', 'core/station.ts', 'Math.max(0, lengthM - stopClearanceM)', 'lengthM - stopClearanceM'),
    ('published suburban platform length is inflated', 'core/station.ts', "'9': 176, '10': 176", "'9': 276, '10': 276"),
    ('motion birth resolver loses its physical id', 'core/motion.ts', 'lengthFor(description, { id, timeMs: now });', 'lengthFor(description, { id: nextId, timeMs: now });'),
    ('motion birth resolver loses its event time', 'core/motion.ts', 'lengthFor(description, { id, timeMs: now });', 'lengthFor(description, { id, timeMs: 0 });'),
    ('car poses change layout after a rename', T, 'carPoses(graph, view, t.layout)', 'carPoses(graph, view, layoutForDescription(view.description))'),
    ('renames rebuild their physical group', T, 'drawn.get(view.id) ?? build(view)', 'drawn.get(view.id)?.description === view.description ? drawn.get(view.id)! : build(view)'),
    ('renamed metadata keeps the old description', T, 't.description = view.description; t.group.userData.description = view.description;', 't.description = t.description;'),
    ('reused headcodes retain the faded group', T, 'if (!present.has(id)) remove(id);', 'if (!present.has(id) && !views.some((v) => v.description === drawn.get(id)!.description)) remove(id);'),
    ('physical length chooses the opposite consist', T, '? long : short', '? short : long'),
    ('group retention uses descriptions instead of physical ids', T, 'new Set(views.map((t) => t.id))', 'new Set(views.map((t) => t.description as unknown as number))'),
    ('configured anchor file ignored', R, 'file = anchorsFile;', "file = path.join(dataDir, 'missing-anchors.json');"),
    ('missing local files claim success', R, "return { status: 404, body: JSON.stringify({ error: 'not found' }), type: 'application/json; charset=utf-8' };", "return { status: 200, body: JSON.stringify({ error: 'not found' }), type: 'application/json; charset=utf-8' };"),
    ('recording date guard disabled', R, "dates.length !== 1 || !/^\\d{8}$/.test(dates[0])", 'false'),
    ('recording uses another TD area', R, '`td-${area}-${dates[0]}.ndjson`', '`td-WRONG-${dates[0]}.ndjson`'),
    ('client can override recording path', R, "file = path.join(dataDir, 'recordings',", "file = url.searchParams.get('path') ?? path.join(dataDir, 'recordings',"),
    ('Host guard disabled', R, "if (!['127.0.0.1', 'localhost'].some((h) => host === `${h}:${port}`))", 'if (false)'),
    ('non-GET requests allowed', R, "return method === 'GET' ? null : 405;", 'return null;'),
    ('recorded snapshots ignored by replay', F, 'timeline.deliver(row.e, row.t);', "{ if (row.e.kind !== 'snapshot') timeline.deliver(row.e, row.t); }"),
    ('live snapshot messages ignored', F, "current.addEventListener('snapshot', (event)", "current.addEventListener('ignored-snapshot', (event)"),
    ('live TD messages ignored', F, "current.addEventListener('td', (event)", "current.addEventListener('ignored-td', (event)"),
    ('snapshots bypass shared reconciliation', F, "if (event.kind === 'snapshot') {", "if (false) {"),
    ('snapshot validation skipped by recording parser', F, 'snapshotEvents(e);', '// snapshotEvents(e);'),
    ('snapshot S-class validation disabled', F, 'if (e.sclass !== undefined)', 'if (false)'),
    ('reconciliation loses full S-class snapshots', F, 'apply(event, atMs, observedAtMs);\n      for (const change', 'for (const change'),
    ('snapshot cancels descriptions in other areas', F, 'snapshotEvents(event, [...descriptions.get(event.area) ?? []])', 'snapshotEvents(event, [...descriptions.values()].flatMap((s) => [...s]))'),
    ('invalid snapshot changes the world before validation', F, "if (event.kind === 'snapshot') {", "if (event.kind === 'snapshot') { apply(event, atMs);"),
    ('audit omits snapshot reconciliation', 'tools/motion-check.ts', 'reconcile(event, start + time * 1000);', 'motion.apply(event, start + time * 1000);'),
    ('configured S-class file ignored', R, 'file = sclassFile;', "file = path.join(dataDir, 'missing-sclass.json');"),
    ('ping interval keeps the process alive', R, '  timer?.unref?.();', ''),
    ('concurrent relay shutdowns close twice', R, 'if (closing) return closing;', ''),
    ('relay shutdown leaves SSE heartbeats running', R, 'for (const stopHeartbeat of heartbeats) stopHeartbeat();', ''),
    ('relay shutdown omits recorder close', R, 'const recorded = recorder.close();', 'const recorded = Promise.resolve();'),
    ('relay shutdown errors disappear', R, 'server.close((error) => error ? reject(error) : resolve());', 'server.close(() => resolve());'),
]

def run(work, rel=None):
    # Renderer geometry tests are expensive; a feed/relay mutation cannot affect them.
    # Keep the full baseline, then run the owning tests and their direct consumers.
    files = {
        F: ['web/tests/feed.test.ts', 'web/tests/feed-fault.test.ts'],
        R: ['relay/tests/relay.test.mjs'],
        T: ['web/tests/trains-live.test.ts', 'web/tests/tooltip.test.ts'],
        'core/station.ts': ['core/tests/station.test.ts', 'web/tests/trains-live.test.ts'],
        'web/src/tooltip.ts': ['web/tests/tooltip.test.ts'],
        'core/motion.ts': ['web/tests/trains-live.test.ts'],
        'vite.config.ts': ['web/tests/feed.test.ts'],
        'tools/motion-check.ts': ['web/tests/feed.test.ts'],
    }.get(rel, ['web/tests/feed.test.ts', 'web/tests/feed-fault.test.ts', 'web/tests/trains-live.test.ts',
                'web/tests/tooltip.test.ts', 'core/tests/station.test.ts', 'relay/tests/relay.test.mjs'])
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=5000',
               '--test-name-pattern=^(recorded .* time controls|timeline forwards observation|live feed rejects invalid recorder|relay files:|relay heartbeat:|relay shutdown:|the dev relay proxy|train URL|feed parses|feed snapshot|feed audit|replay clock|live and replay|backoff grows|a reconnect snapshot|live SSE|legacy timestamp-only|full legacy timetable|malformed legacy timetable|HTTP timetable enrichment|public TRUST timestamps|the default relay probe|an explicit unavailable timetable|live car|consecutive car|straight car|the headcode|service kind matching|Great Northern formation|Thameslink and Grand Central|unknown service evidence|a physical birth freezes|platform-capped|station: formation limits|a capped formation|fading one train|eight same-kind trains|exact fading opacity|a unique fading palette|different train kinds|cars whose|a renamed train|a fresh physical train)',
               *files]
    process = subprocess.Popen(command, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, stdin=subprocess.DEVNULL, start_new_session=True)
    expired = False
    try:
        stdout, stderr = process.communicate(timeout=30)
    except subprocess.TimeoutExpired:
        expired = True
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = process.communicate(timeout=3)
    result = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
    return result, expired or 'testTimeoutFailure' in stdout

for label, rel, old, _ in M:
    if old not in (src / rel).read_text():
        raise SystemExit(f'mutation pattern missing: {label}')

baseline, expired = run(src)
if baseline.returncode or expired:
    print(baseline.stdout, baseline.stderr)
    raise SystemExit('baseline must pass')
names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
seen = set()
survivors = []
timeouts = []
for i, (label, rel, old, new) in enumerate(M):
    original = (src / rel).read_text()
    if old not in original:
        raise SystemExit(f'mutation pattern missing: {label}')
    with tempfile.TemporaryDirectory(prefix='live-', dir=scratch) as tmp:
        work = Path(tmp)
        for directory in ['core', 'web', 'relay', 'tools']:
            shutil.copytree(src / directory, work / directory)
        for file in ['package.json', 'vite.config.ts']:
            shutil.copy2(src / file, work / file)
        (work / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
        (work / rel).write_text(original.replace(old, new, 1))
        result, expired = run(work, rel)
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M)) & names
        seen.update(failed)
        if expired:
            log = scratch / f'mutation-{i:02d}.log'
            log.write_text(result.stdout + result.stderr)
            timeouts.append(label)
            print(f'[CAUGHT WITH TIMEOUT] {label} ({log})', flush=True)
            continue
        # A crashed or timed-out test file is not an assertion killing the mutation.
        if result.returncode and failed:
            print(f'[KILLED ] {label} <- {sorted(failed)[0]}', flush=True)
        else:
            survivors.append(label)
            log = scratch / f'mutation-{i:02d}.log'
            log.write_text(result.stdout + result.stderr)
            print(f'[SURVIVED] {label} (exit {result.returncode}; {log})', flush=True)

unproven = names - seen
print(f'\n{len(M) - len(survivors)}/{len(M)} mutations caught')
print(f'{len(timeouts)} caught with timeout')
print(f'{len(names) - len(unproven)}/{len(names)} new tests observed failing at least once')
for label in survivors:
    print('  NOT CAUGHT:', label)
for name in sorted(unproven):
    print('  NEVER FAILED:', name)
raise SystemExit(1 if survivors or unproven else 0)
