import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../../core/graph.ts';
import { createMotion } from '../../core/motion.ts';
import { createEventReconciler, parseEvent } from '../../web/src/feed.ts';
import { createSyntheticRelay, finalizeStatus, hardwareRenderer, parseOptions, phaseIsComplete, syntheticRelayFixture, syntheticSseFrame } from '../axis07-browser.mjs';

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
  const phases = ['no-relay', 'connected', 'stopped', 'sse-drop', 'recovered'].map(name => ({
    name, conditionObserved: true, cityLoaded: true,
    statusLine: name === 'no-relay' ? 'sample trains at the buffers, not live · relay absent' : 'SYN synthetic feed · 1 trains shown',
    connection: name === 'no-relay' ? 'relay absent' : ['stopped', 'sse-drop'].includes(name) ? 'reconnecting; retry in 0.5s' : 'connected',
    trainCount: 1, board: { present: true, platformTrainCount: 1 }, screenshot: `${name}.png`,
    attribution: { present: { osm: true, environmentAgency: true, openGovernmentLicence: true } },
    cspErrorCount: 0, cspInvalidSourceCount: 0, validCsp: true, consoleErrorCount: 0, unexpectedNetworkFailures: [],
    relayRequestCounts: name === 'no-relay' ? { '/relay/health': 1 } : {},
  }));
  const report = { phases, gaps: [], validGpu: true, genuineMetalGpu: true, renderer: 'ANGLE Metal Renderer: Apple M4' };
  assert.equal(phaseIsComplete(report), true);
  assert.equal(finalizeStatus(report), 'PASS');
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
