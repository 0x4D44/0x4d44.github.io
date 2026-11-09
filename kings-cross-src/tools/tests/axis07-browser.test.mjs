import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../../core/graph.ts';
import { createMotion } from '../../core/motion.ts';
import { loadOfflineReplay } from '../../web/src/offline-replay.ts';
import { createReplayFeed } from '../../web/src/feed.ts';
import { createEventReconciler, parseEvent } from '../../web/src/feed.ts';
import { createBrowserEvidenceServer, syntheticOfflineReplayFixture, createSyntheticRelay, finalizeStatus, freshDiagnostics, hardwareRenderer, parseOptions, phaseIsComplete,
  recordCdpNetworkEvent, resolveLogEntryUrl, syncDiagnostics, syntheticRelayFixture, syntheticSseFrame } from '../axis07-browser.mjs';

const fixtureTrack = {
  nodes: [[101, 0, 0], [102, 100, 0], [103, 200, 0], [104, 300, 0], [105, 400, 0], [106, 500, 0]],
  rails: [{ id: 201, service: 'main', tunnel: false, nodes: [101, 102, 103, 104, 105, 106] }],
};

test('browser CLI requires explicit GPU mode and a built output directory under worktree scratch', () => {
  assert.throws(() => parseOptions(['--dist', 'dist']), /pass --gpu/);
  assert.throws(() => parseOptions(['--gpu']), /pass --dist/);
  assert.throws(() => parseOptions(['--gpu', '--dist', 'dist', '--out', '/private/tmp/report']), /under this worktree \.scratch/);
  const scratchOutput = fileURLToPath(new URL('../../../.scratch/axis07-test', import.meta.url));
  const parsed = parseOptions(['--gpu', '--dist', 'dist', '--out', scratchOutput]);
  assert.equal(parsed.gpu, true);
  assert.match(parsed.dist, /dist$/);
});

test('GPU acceptance requires a genuine Metal renderer and rejects SwiftShader', () => {
  assert.equal(hardwareRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M4)'), true);
  assert.equal(hardwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))'), false);
  assert.equal(hardwareRenderer('llvmpipe (LLVM 19.0.0, 256 bits)'), false);
  assert.equal(hardwareRenderer('unknown'), false);
});

test('synthetic relay fixture supplies fake health metadata, a synthetic snapshot and named SSE ping frames', async () => {
  const fixture = syntheticRelayFixture(fixtureTrack, 123456789);
  assert.deepEqual(fixture.health, {
    ok: true, area: 'SYN', feed: 'connected', connectedAt: 123455789, lastEventAgeMs: 0,
    badMessages: 0, counts: { berths: 1, descriptions: 1 },
    schedule: { cached: 0, requested: 0 }, trust: { retained: 0, rejected: 0 },
  });
  assert.deepEqual(fixture.anchors.anchors[0], {
    berth: 'SYN4', kind: 'smart', from: 104, to: 105, t: 0.5,
    point: [350, 0], errorM: 0, platform: '4', evidence: 'synthetic browser fixture on a public OSM track edge',
  });
  assert.deepEqual(fixture.snapshot, { area: 'SYN', berths: { SYN4: 'SYN1' }, sclass: { addresses: 0, data: {} }, lastEventTime: 123456789 });
  assert.match(syntheticSseFrame('snapshot', fixture.snapshot), /event: snapshot\ndata: .*"area":"SYN".*"SYN4":"SYN1"/);
  assert.match(syntheticSseFrame('ping', fixture.ping), /event: ping\ndata: .*"feed":"connected".*"lastEventAt":123456789/);
  assert.deepEqual(fixture.sclass, { area: 'SYN', hypotheses: [] });
  const motion = createMotion(buildGraph(fixtureTrack), fixture.anchors);
  const deliver = createEventReconciler((event, atMs) => motion.apply(event, atMs));
  deliver(parseEvent({ ...fixture.snapshot, kind: 'snapshot' }), fixture.snapshot.lastEventTime);
  assert.equal(motion.trains().length, 1, 'the parsed synthetic snapshot births one train');
  assert.ok(motion.trains()[0].occupiedLengthM >= 259, 'the synthetic train has a full-length body on the graph');
  const publicTrack = JSON.parse(await readFile(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
  const publicFixture = syntheticRelayFixture(publicTrack, 123456789);
  const publicMotion = createMotion(buildGraph(publicTrack), publicFixture.anchors);
  createEventReconciler((event, atMs) => publicMotion.apply(event, atMs))(
    parseEvent({ ...publicFixture.snapshot, kind: 'snapshot' }), publicFixture.snapshot.lastEventTime);
  assert.equal(publicMotion.trains().length, 1, 'the fixture spawns on the committed public graph');
  assert.ok(publicMotion.trains()[0].occupiedLengthM >= 259, 'committed track supplies the full synthetic train body');
});

test('browser report completeness requires all phases, attribution, status, board, counts and screenshots', () => {
  const phases = ['no-relay', 'connected', 'stopped', 'sse-drop', 'recovered', 'offline-replay'].map(name => ({
    name, conditionObserved: true, cityLoaded: true, mode: name === 'no-relay' ? 'demo' : name === 'offline-replay' ? 'replay' : 'live',
    replayStartMs: name === 'offline-replay' ? 1000 : null, replayTimeMs: name === 'offline-replay' ? 2000 : null,
    proxyEnabled: !['no-relay', 'stopped', 'offline-replay'].includes(name),
    statusLine: name === 'no-relay' ? 'sample trains at the buffers, not live · relay absent' : 'SYN synthetic feed · 1 trains shown',
    connection: name === 'no-relay' ? 'relay absent' : name === 'offline-replay' ? 'playing' : ['stopped', 'sse-drop'].includes(name) ? 'reconnecting; retry in 0.5s' : 'connected',
    trainCount: 1, board: { present: true, mode: name === 'no-relay' ? 'sample' : name === 'offline-replay' ? 'replay' : 'live', platformTrainCount: 1 }, screenshot: `${name}.png`,
    attribution: { present: { osm: true, environmentAgency: true, openGovernmentLicence: true } },
    cspErrorCount: 0, cspInvalidSourceCount: 0, validCsp: true, consoleErrorCount: 0, unexpectedNetworkFailures: [],
    relayRequestCounts: name === 'no-relay' ? { '/relay/health': 1 } : {},
  }));
  const report = { phases, gaps: [], validGpu: true, genuineMetalGpu: true, renderer: 'ANGLE Metal Renderer: Apple M4' };
  assert.equal(phaseIsComplete(report), true);
  assert.equal(finalizeStatus(report), 'PASS');
  const invalidObservations = [
    ['offline replay clock frozen', r => { r.phases[5].replayTimeMs = 1000; }],
    ['offline replay touched relay', r => { r.phases[5].relayRequestCounts['/relay/sclass'] = 1; }],
    ['offline replay missing train', r => { r.phases[5].trainCount = 0; }],
    ['offline replay proxy enabled', r => { r.phases[5].proxyEnabled = true; }],
    ['offline replay wrong board', r => { r.phases[5].board.mode = 'sample'; }],
    ['connected is reconnecting', r => { r.phases[1].connection = 'reconnecting; retry in 0.5s'; }],
    ['recovered is reconnecting', r => { r.phases[4].connection = 'reconnecting; retry in 0.5s'; }],
    ['recovered is demo', r => { r.phases[4].mode = 'demo'; }],
    ['stopped is demo', r => { r.phases[2].mode = 'demo'; }],
    ['no relay proxy enabled', r => { r.phases[0].proxyEnabled = true; }],
    ['SSE drop proxy disabled', r => { r.phases[3].proxyEnabled = false; }],
    ['missing board', r => { delete r.phases[1].board; }],
    ['empty board', r => { r.phases[1].board = {}; }],
    ['sample board in live', r => { r.phases[1].board.mode = 'sample'; }],
    ['invalid board count', r => { r.phases[1].board.platformTrainCount = -1; }],
    ['empty screenshot', r => { r.phases[1].screenshot = ''; }],
    ['duplicate phase', r => { r.phases.push(structuredClone(r.phases[1])); }],
  ].map(([reason, corrupt]) => {
    const invalid = structuredClone(report);
    corrupt(invalid);
    return [reason, finalizeStatus(invalid)];
  });
  assert.deepEqual(invalidObservations, invalidObservations.map(([reason]) => [reason, 'GAP']),
    'a true polling flag cannot replace the captured page and proxy observations');

  assert.equal(finalizeStatus({ ...report, error: 'synthetic failure' }), 'ERROR');
  const missingAttribution = structuredClone(report);
  missingAttribution.phases[2].attribution.present.osm = false;
  assert.equal(phaseIsComplete(missingAttribution), false);
  assert.equal(finalizeStatus({ ...missingAttribution, validGpu: false }), 'GAP');
  const missingRecovery = structuredClone(report);
  missingRecovery.phases[4].conditionObserved = false;
  assert.equal(phaseIsComplete(missingRecovery), false);
  const lostTrainDuringFault = structuredClone(report);
  lostTrainDuringFault.phases[2].trainCount = 0;
  assert.equal(phaseIsComplete(lostTrainDuringFault), false);
  const repeatedProbe = structuredClone(report);
  repeatedProbe.phases[0].relayRequestCounts['/relay/health'] = 2;
  assert.equal(phaseIsComplete(repeatedProbe), false);
  const transition = freshDiagnostics('proxy-restored', true);
  transition.unexpectedNetworkFailures.push({ url: 'http://127.0.0.1:43210/missing', status: 404 });
  assert.equal(finalizeStatus({ ...report, networkDiagnostics: [transition] }), 'GAP', 'errors between screenshots are retained');
  const late = freshDiagnostics('connected', true), lateReport = structuredClone(report);
  late.consoleErrorCount = 1;
  lateReport.networkDiagnostics = [late];
  syncDiagnostics(lateReport);
  assert.equal(lateReport.phases[1].consoleErrorCount, 1, 'late failures update their phase rather than disappearing');
});

test('synthetic SSE stays dropped until the failure screenshot has been captured', async (t) => {
  const relay = createSyntheticRelay(fixtureTrack);
  t.after(() => relay.close());
  const request = (url) => {
    const response = new EventEmitter();
    response.destroyed = false;
    response.writableEnded = false;
    response.chunks = [];
    response.writeHead = (status) => { response.status = status; return response; };
    response.write = (chunk) => { response.chunks.push(chunk); return true; };
    response.end = (chunk) => { if (chunk) response.chunks.push(chunk); response.writableEnded = true; };
    response.destroy = () => { response.destroyed = true; response.emit('close'); };
    relay.server.emit('request', { method: 'GET', url }, response);
    return response;
  };
  const original = request('/events');
  assert.equal(original.status, 200);
  assert.equal(relay.dropStreams(), 1);
  assert.equal(original.destroyed, true);
  assert.equal(request('/events').destroyed, true, 'automatic reconnect cannot beat the failure screenshot');
  assert.equal(request('/health').status, 200, 'the relay stays reachable during this SSE-only fault');
  relay.resumeStreams();
  const recovered = request('/events');
  assert.equal(recovered.status, 200);
  assert.ok(recovered.chunks.some((chunk) => chunk.startsWith('event: snapshot')));
});

test('browser fixture reports an unavailable timetable as data and preserves genuine missing routes', async (t) => {
  const relay = createSyntheticRelay(fixtureTrack);
  t.after(() => relay.close());
  const request = url => {
    let status, text;
    relay.server.emit('request', { method: 'GET', url }, {
      writeHead(code) { status = code; }, end(body) { text = body; },
    });
    return { status, body: JSON.parse(text) };
  };
  assert.deepEqual(request('/schedule?date=2026-11-07'), {
    status: 200, body: { date: '2026-11-07', available: false, reason: 'no timetable' },
  });
  assert.equal(request('/unknown').status, 404);
});

test('CDP failures retain full URLs and request IDs while genuine 404s fail and injected SSE drops are expected', () => {
  const info = new Map(), connected = freshDiagnostics('connected', true);
  const url = 'http://127.0.0.1:43210/relay/schedule?date=2026-11-07';
  recordCdpNetworkEvent({ method: 'Network.requestWillBeSent', params: { requestId: 'missing', request: { url } } }, connected, info);
  recordCdpNetworkEvent({ method: 'Network.responseReceived', params: { requestId: 'missing', response: { status: 404 } } }, connected, info);
  assert.equal(connected.failedRequests.length, 1);
  assert.equal(connected.failedRequests[0].url, url);
  assert.equal(connected.failedRequests[0].requestId, 'missing');
  assert.equal(connected.failedRequests[0].status, 404);
  assert.equal(connected.unexpectedNetworkFailures.length, 1, 'a schedule 404 is a real HTTP error');
  const events = 'http://127.0.0.1:43210/relay/events';
  recordCdpNetworkEvent({ method: 'Network.requestWillBeSent', params: { requestId: 'stream', request: { url: events } } }, connected, info);
  recordCdpNetworkEvent({ method: 'Network.responseReceived', params: { requestId: 'stream', response: { status: 200, url: events } } }, connected, info);
  const dropped = freshDiagnostics('sse-drop', true);
  recordCdpNetworkEvent({ method: 'Network.loadingFailed', params: { requestId: 'stream', errorText: 'net::ERR_INCOMPLETE_CHUNKED_ENCODING' } }, dropped, info);
  assert.equal(dropped.failedRequests.length, 1);
  assert.equal(dropped.failedRequests[0].url, events);
  assert.equal(dropped.failedRequests[0].status, 200);
  assert.equal(dropped.failedRequests[0].errorText, 'net::ERR_INCOMPLETE_CHUNKED_ENCODING');
  assert.equal(dropped.expectedRelayFailures.length, 1);
  assert.equal(dropped.unexpectedNetworkFailures.length, 0);
});

test('a console error with no URL resolves its CDP request ID after the request finishes', () => {
  const info = new Map(), diagnostics = freshDiagnostics('connected', true);
  const url = 'http://127.0.0.1:43210/missing-texture.png?synthetic=1';
  recordCdpNetworkEvent({ method: 'Network.requestWillBeSent', params: { requestId: 'texture', request: { url } } }, diagnostics, info);
  recordCdpNetworkEvent({ method: 'Network.responseReceived', params: { requestId: 'texture', response: { status: 404, url } } }, diagnostics, info);
  recordCdpNetworkEvent({ method: 'Network.loadingFinished', params: { requestId: 'texture' } }, diagnostics, info);
  assert.equal(diagnostics.failedRequests[0].url, url);
  assert.equal(resolveLogEntryUrl({ networkRequestId: 'texture' }, info), url);
  assert.equal(resolveLogEntryUrl({ networkRequestId: 'texture', url: 'not a URL' }, info), url);
  assert.equal(resolveLogEntryUrl({ networkRequestId: 'texture', url: 'http://127.0.0.1:43210/other' }, info), 'http://127.0.0.1:43210/other');
  assert.equal(resolveLogEntryUrl({ networkRequestId: 'unknown' }, info), null);
});


test('offline browser fixture serves finite static replay while the relay proxy is disabled', async (t) => {
  const fixture = syntheticOfflineReplayFixture(fixtureTrack);
  const control = createBrowserEvidenceServer({ dist: '/unused', relay: null }, fixture);
  t.after(() => control.close());
  control.setProxy(false);
  const requested = [];
  const fetchImpl = async (input) => {
    const pathname = new URL(String(input)).pathname; requested.push(pathname);
    return new Promise(resolve => {
      let status = 200, headers;
      const response = { writeHead(code, fields) { status = code; headers = fields; return response; },
        end(body) { resolve(new Response(body, { status, headers })); return response; } };
      control.server.emit('request', { method: 'GET', url: pathname, headers: { host: '127.0.0.1:1234' } }, response);
    });
  };
  const bundle = await loadOfflineReplay('/axis07-offline/manifest.json', 'http://127.0.0.1:1234/kings-cross/', buildGraph(fixtureTrack), '2026-11-07', fetchImpl);
  const motion = createMotion(buildGraph(fixtureTrack), bundle.anchors), states = [];
  const replay = createReplayFeed(bundle.recording, 1, motion, state => states.push(state));
  replay.advance(1);
  assert.ok(replay.timeMs() > fixture.startMs);
  assert.equal(motion.trains().length, 1);
  replay.advance(120);
  assert.equal(states.at(-1), 'recording ended');
  assert.ok(requested.every(url => !url.startsWith('/relay/')));
  assert.equal((await fetchImpl('http://127.0.0.1:1234/relay/health')).status, 503);
});
