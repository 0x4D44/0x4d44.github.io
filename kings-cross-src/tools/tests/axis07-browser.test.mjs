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
import { archiveUrl, liveUrl, WEATHER_ORIGINS } from '../../web/src/weather.ts';
import { auditPageCsp, createBrowserEvidenceServer, EXPECTED_CONNECT_SRC, expectedWeatherConsoleError, foreignRequest, syntheticOfflineReplayFixture, createSyntheticRelay, finalizeStatus, freshDiagnostics,
  hardwareRenderer, parseOptions, phaseIsComplete, recordCdpNetworkEvent, resolveLogEntryUrl, syncDiagnostics, syntheticRelayFixture, syntheticSseFrame,
  WEATHER_ENDPOINTS, weatherEndpoint } from '../axis07-browser.mjs';

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

/** A browser report that passes: all six phases observed, every credit shown, the built page's CSP audited. */
function completeReport() {
  const phases = ['no-relay', 'connected', 'stopped', 'sse-drop', 'recovered', 'offline-replay'].map(name => ({
    name, conditionObserved: true, cityLoaded: true, mode: name === 'no-relay' ? 'demo' : name === 'offline-replay' ? 'replay' : 'live',
    replayStartMs: name === 'offline-replay' ? 1000 : null, replayTimeMs: name === 'offline-replay' ? 2000 : null,
    proxyEnabled: !['no-relay', 'stopped', 'offline-replay'].includes(name),
    statusLine: name === 'no-relay' ? 'sample trains at the buffers, not live · relay absent' : 'SYN synthetic feed · 1 trains shown',
    connection: name === 'no-relay' ? 'relay absent' : name === 'offline-replay' ? 'playing' : ['stopped', 'sse-drop'].includes(name) ? 'reconnecting; retry in 0.5s' : 'connected',
    trainCount: 1, board: { present: true, mode: name === 'no-relay' ? 'sample' : name === 'offline-replay' ? 'replay' : 'live', platformTrainCount: 1 }, screenshot: `${name}.png`,
    attribution: { present: { osm: true, environmentAgency: true, openGovernmentLicence: true, openMeteo: true } },
    cspErrorCount: 0, cspInvalidSourceCount: 0, validCsp: true, consoleErrorCount: 0, unexpectedNetworkFailures: [],
    relayRequestCounts: name === 'no-relay' ? { '/relay/health': 1 } : {},
  }));
  return { phases, gaps: [], validGpu: true, genuineMetalGpu: true, renderer: 'ANGLE Metal Renderer: Apple M4', cspAudit: { valid: true, connectSrc: EXPECTED_CONNECT_SRC, problems: [] } };
}

test('browser report completeness requires all phases, attribution, status, board, counts and screenshots', () => {
  const report = completeReport();
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
    ['weather credit missing from a phase', r => { r.phases[3].attribution.present.openMeteo = false; }],
    ['page CSP never audited', r => { delete r.cspAudit; }],
    ['page CSP audit failed', r => { r.cspAudit = { valid: false, connectSrc: null, problems: ['connect-src is absent'] }; }],
    ['weather request failed but the page did not say so', r => { r.phases[1].expectedWeatherFailures = [{ url: 'https://api.open-meteo.com/v1/forecast' }]; }],
    ['weather console error but the page did not say so', r => { r.phases[1].expectedWeatherConsoleErrorCount = 1; }],
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

test('the harness accepts exactly the two Open-Meteo endpoints the page requests and no lookalike', () => {
  assert.deepEqual([...WEATHER_ENDPOINTS.keys()], [...WEATHER_ORIGINS], 'the harness lists the page\'s weather origins, in its order');
  assert.deepEqual(EXPECTED_CONNECT_SRC, ["'self'", 'ws://127.0.0.1:*', 'ws://localhost:*', ...WEATHER_ORIGINS]);
  assert.equal(weatherEndpoint(liveUrl()), 'https://api.open-meteo.com');
  assert.equal(weatherEndpoint(archiveUrl('2026-11-06', '2026-11-08')), 'https://archive-api.open-meteo.com');
  for (const lookalike of ['https://api.open-meteo.com.evil.test/v1/forecast', 'https://evil-api.open-meteo.com/v1/forecast',
    'https://api.open-meteo.com@evil.test/v1/forecast', 'https://user:pw@api.open-meteo.com/v1/forecast', 'http://api.open-meteo.com/v1/forecast',
    'https://api.open-meteo.com:8443/v1/forecast', 'https://api.open-meteo.com/v1/archive', 'https://archive-api.open-meteo.com/v1/forecast',
    'https://api.open-meteo.com/v1/forecast/extra', 'https://open-meteo.com/v1/forecast', 'https://geocoding-api.open-meteo.com/v1/search',
    'https://customer-api.open-meteo.com/v1/forecast', 'https://example.com/v1/forecast', 'not a url', undefined, null]) {
    assert.equal(weatherEndpoint(lookalike), null, `${lookalike} is not a weather endpoint`);
  }
  for (const own of ['http://127.0.0.1:4173/kings-cross/', 'ws://localhost:8080/relay/events', 'data:image/png;base64,AAAA', 'blob:http://127.0.0.1:4173/abc', 'about:blank',
    liveUrl(), archiveUrl('2026-11-06', '2026-11-08')]) assert.equal(foreignRequest(own), false, `${own} is the page's own`);
  for (const other of ['https://example.com/x.js', 'https://api.open-meteo.com.evil.test/v1/forecast', 'https://geocoding-api.open-meteo.com/v1/search',
    'http://example.com/', 'wss://relay.example/events', 'https://127.0.0.1/', 'http://192.168.1.5/relay/events', 'not a url']) {
    assert.equal(foreignRequest(other), true, `${other} may not be requested`);
  }
});

test('the page CSP audit accepts exactly the expected connect-src and rejects wider, narrower or looser policies', async () => {
  const html = await readFile(new URL('../../web/index.html', import.meta.url), 'utf8');
  const audit = auditPageCsp(html);
  assert.deepEqual(audit.problems, []);
  assert.equal(audit.valid, true);
  assert.deepEqual(audit.connectSrc, EXPECTED_CONNECT_SRC);
  const weather = 'https://api.open-meteo.com https://archive-api.open-meteo.com';
  assert.ok(html.includes(`ws://localhost:* ${weather};`), 'the fixture below edits this exact text');
  const variants = new Map([
    ['an extra origin', `ws://localhost:* ${weather} https://example.com;`],
    ['a wildcard sibling', `ws://localhost:* ${weather} https://*.open-meteo.com;`],
    ['a lookalike host', `ws://localhost:* https://api.open-meteo.com.evil.test https://archive-api.open-meteo.com;`],
    ['a plain-http copy', `ws://localhost:* ${weather} http://api.open-meteo.com;`],
    ['the geocoding origin', `ws://localhost:* ${weather} https://geocoding-api.open-meteo.com;`],
    ['any https', `ws://localhost:* ${weather} https:;`],
    ['everything', `ws://localhost:* ${weather} *;`],
    ['a missing archive origin', 'ws://localhost:* https://api.open-meteo.com;'],
    ['a missing forecast origin', 'ws://localhost:* https://archive-api.open-meteo.com;'],
    ['no weather at all', 'ws://localhost:*;'],
    ['the origins reversed', 'ws://localhost:* https://archive-api.open-meteo.com https://api.open-meteo.com;'],
    ['an IPv6 socket wildcard', `ws://localhost:* ws://[::1]:* ${weather};`],
  ]);
  for (const [name, replacement] of variants) {
    const edited = auditPageCsp(html.replace(`ws://localhost:* ${weather};`, replacement));
    assert.equal(edited.valid, false, `${name} must fail the audit`);
    assert.ok(edited.problems.some(problem => /^connect-src is /.test(problem)), `${name}: the problem names connect-src`);
  }
  for (const [name, edit] of [['script-src widened', ["script-src 'self'", "script-src 'self' https://cdn.example"]],
    ['default-src opened', ["default-src 'none'", "default-src 'self'"]], ['eval allowed', ["script-src 'self'", "script-src 'self' 'unsafe-eval'"]],
    ['workers opened', ["worker-src 'self' blob:", "worker-src 'self' blob: https:"]], ['forms opened', ["form-action 'none'", "form-action 'self'"]],
    ['eval allowed in a directive that is not in the fixed list', ["style-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' 'unsafe-eval'"]]]) {
    assert.equal(auditPageCsp(html.replace(edit[0], edit[1])).valid, false, `${name} must fail the audit`);
  }
  assert.ok(auditPageCsp(html.replace("style-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' 'unsafe-eval'")).problems.includes('unsafe-eval is allowed'), 'and it says why');
  assert.deepEqual(auditPageCsp('<html></html>'), { valid: false, connectSrc: null, problems: ['no Content-Security-Policy meta tag'] });
});

test('Open-Meteo being unreachable is expected; any other origin, a client error, or a leak is not', () => {
  const forecast = liveUrl(), archive = archiveUrl('2026-11-06', '2026-11-08'), info = new Map();
  const sent = (diagnostics, requestId, url) => recordCdpNetworkEvent({ method: 'Network.requestWillBeSent', params: { requestId, request: { url } } }, diagnostics, info);
  const failed = (diagnostics, requestId, errorText, canceled = false, blockedReason = undefined) => recordCdpNetworkEvent({ method: 'Network.loadingFailed', params: { requestId, errorText, canceled, blockedReason } }, diagnostics, info);
  const answered = (diagnostics, requestId, url, status) => recordCdpNetworkEvent({ method: 'Network.responseReceived', params: { requestId, response: { url, status } } }, diagnostics, info);

  const offline = freshDiagnostics('no-relay', false);
  sent(offline, 'w1', forecast); failed(offline, 'w1', 'net::ERR_INTERNET_DISCONNECTED');
  assert.deepEqual(offline.weatherRequestCounts, { 'https://api.open-meteo.com': 1 });
  assert.equal(offline.expectedWeatherFailures.length, 1);
  assert.equal(offline.expectedWeatherFailures[0].classification, 'expected-weather');
  assert.equal(offline.expectedWeatherFailures[0].url, forecast, 'the failed request keeps its full URL');
  assert.equal(offline.unexpectedNetworkFailures.length, 0, 'Open-Meteo down is a designed state, not a failure of the page');

  const busy = freshDiagnostics('offline-replay', false);
  sent(busy, 'w2', archive); answered(busy, 'w2', archive, 503);
  assert.deepEqual(busy.weatherRequestCounts, { 'https://archive-api.open-meteo.com': 1 });
  assert.equal(busy.expectedWeatherFailures.length, 1);
  assert.equal(busy.unexpectedNetworkFailures.length, 0);

  const bad = freshDiagnostics('connected', true);
  sent(bad, 'w3', forecast); answered(bad, 'w3', forecast, 400);
  assert.equal(bad.expectedWeatherFailures.length, 0, 'a 400 is the page asking wrongly, not the service being away');
  assert.equal(bad.unexpectedNetworkFailures.length, 1);

  for (const [how, errorText, reason] of [['by its error text', 'net::ERR_BLOCKED_BY_CSP', undefined], ['by the blocked reason', 'net::ERR_FAILED', 'csp']]) {
    const blocked = freshDiagnostics('connected', true);
    sent(blocked, 'c1', forecast); failed(blocked, 'c1', errorText, false, reason);
    assert.equal(blocked.expectedWeatherFailures.length, 0, `a request the page's own CSP blocked (${how}) is not Open-Meteo being away`);
    assert.equal(blocked.unexpectedNetworkFailures.length, 1);
  }

  const cancelled = freshDiagnostics('connected', true);
  sent(cancelled, 'w4', forecast); failed(cancelled, 'w4', 'net::ERR_ABORTED', true);
  assert.equal(cancelled.expectedWeatherFailures.length, 0);
  assert.equal(cancelled.unexpectedNetworkFailures.length, 0, 'an aborted request (the page timed it out or closed) is as it was for the relay');

  const leaked = freshDiagnostics('connected', true);
  sent(leaked, 'x1', 'https://example.com/pixel.gif'); answered(leaked, 'x1', 'https://example.com/pixel.gif', 200);
  assert.equal(leaked.unexpectedNetworkFailures.length, 1, 'a request to any other origin is a finding even when it succeeds');
  assert.equal(leaked.unexpectedNetworkFailures[0].url, 'https://example.com/pixel.gif');
  sent(leaked, 'x2', 'https://api.open-meteo.com.evil.test/v1/forecast'); failed(leaked, 'x2', 'net::ERR_NAME_NOT_RESOLVED');
  assert.equal(leaked.unexpectedNetworkFailures.length, 3, 'the lookalike is both a foreign request and a failure');
  assert.equal(leaked.expectedWeatherFailures.length, 0);
  assert.deepEqual(leaked.weatherRequestCounts, {});
  const own = freshDiagnostics('connected', true);
  sent(own, 'o1', 'http://127.0.0.1:4173/kings-cross/assets/index.js'); sent(own, 'o2', 'blob:http://127.0.0.1:4173/1'); sent(own, 'o3', 'data:image/png;base64,AAAA');
  assert.equal(own.unexpectedNetworkFailures.length, 0, 'its own origin, blobs and data URLs are not findings');

  // a phase that lost its weather must show the honest fallback on the status line to count as complete
  const report = completeReport();
  report.phases[1].expectedWeatherFailures = [offline.expectedWeatherFailures[0]];
  assert.equal(phaseIsComplete(report), false, 'a silent fallback to clear sky is not accepted');
  report.phases[1].statusLine = 'SYN synthetic feed · 1 trains shown · weather unavailable (net::ERR_INTERNET_DISCONNECTED), clear sky assumed';
  assert.equal(phaseIsComplete(report), true, 'the same failure, said plainly on the status line, is');
  report.phases[1].expectedWeatherFailures = [];
  report.phases[1].expectedWeatherConsoleErrorCount = 1;
  assert.equal(phaseIsComplete(report), true, 'its console error is the same failure');
});

test('the console error of an unreachable Open-Meteo is expected; a CSP block, a CORS error, a client error or a lookalike is not', () => {
  const forecast = liveUrl(), archive = archiveUrl('2026-11-06', '2026-11-08');
  const log = (text, url, status = null, over = {}) => ({ method: 'Log.entryAdded', error: true, text, url, status, ...over });
  assert.equal(expectedWeatherConsoleError(log('Failed to load resource: net::ERR_INTERNET_DISCONNECTED', forecast)), true);
  assert.equal(expectedWeatherConsoleError(log('Failed to load resource: net::ERR_NAME_NOT_RESOLVED', archive)), true);
  assert.equal(expectedWeatherConsoleError(log('Failed to load resource: the server responded with a status of 503 ()', forecast, 503)), true);
  assert.equal(expectedWeatherConsoleError(log('Failed to load resource: the server responded with a status of 500 ()', archive, 500)), true);
  for (const [what, entry] of [
    ['a 400', log('Failed to load resource: the server responded with a status of 400 ()', forecast, 400)],
    ['a 404', log('Failed to load resource: the server responded with a status of 404 ()', archive, 404)],
    ['a CORS error', log(`Access to fetch at '${forecast}' from origin 'http://127.0.0.1:4173' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.`, forecast)],
    ['a CSP block', log(`Refused to connect to '${forecast}' because it violates the following Content Security Policy directive: "connect-src 'self'".`, forecast)],
    ['a CSP block logged as a failed load', log('Failed to load resource: net::ERR_BLOCKED_BY_CSP', forecast)],
    ['a lookalike host', log('Failed to load resource: net::ERR_NAME_NOT_RESOLVED', 'https://api.open-meteo.com.evil.test/v1/forecast')],
    ['another origin', log('Failed to load resource: net::ERR_INTERNET_DISCONNECTED', 'https://example.com/x')],
    ['a url that did not resolve', log('Failed to load resource: net::ERR_INTERNET_DISCONNECTED', '')],
    ['a console call, not a log entry', log('Failed to load resource: net::ERR_INTERNET_DISCONNECTED', forecast, null, { method: 'Runtime.consoleAPICalled' })],
    ['a message that is not an error', log('Failed to load resource: net::ERR_INTERNET_DISCONNECTED', forecast, null, { error: false })],
    ['an exception of the page\'s own', log('TypeError: weather is undefined', forecast)],
  ]) assert.equal(expectedWeatherConsoleError(entry), false, `${what} stays an error`);
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
