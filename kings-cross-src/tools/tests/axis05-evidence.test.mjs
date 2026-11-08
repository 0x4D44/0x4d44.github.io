import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { evidenceCollector, handlingEvidence, runAxis05 } from '../axis05-evidence.ts';
import { auditRecording } from '../motion-audit.ts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const anchors = { area: 'Y9', sources: ['synthetic'], anchors: [], unmapped: [] };
const sample = (atMs, speed, distanceM, heldPlatform) => ({ atMs, zone: 'platform', speedLimitMps: 5, accelerationMps2: speed ? 0.7 : 0, decelerationMps2: 0,
  heldPlatform, train: { id: 1, description: '1A01', speed, distanceM, state: heldPlatform ? 'held' : 'moving', leading: { point: [distanceM, 0] }, occupied: [], heading: 0, reversals: 0, lengthM: 10 } });
test('Axis 05 distributions include holds and applicable occupied-track limits', () => {
  const c = evidenceCollector(0); c.onSample(sample(0, 0, 0, '1')); c.onSample(sample(100, 6, 0.3));
  const z = c.result().distributionsByZone.platform;
  assert.equal(z.speedMps.samples, 2); assert.equal(z.speedMps.mean, 3); assert.equal(z.speedMps.p95, 6);
  assert.equal(z.accelerationMps2.max, 0.7); assert.equal(z.applicableSpeedLimitMps.max, 5); assert.equal(z.speedViolationSamples, 1);
});
test('Axis 05 arrival candidates require body travel then a confirmed platform hold', () => {
  const c = evidenceCollector(1);
  for (let t = 0; t <= 10000; t += 100) c.onSample(sample(t, t < 8000 ? 1 : 0, Math.min(t / 1000, 8), t < 8000 ? undefined : '2'));
  assert.equal(c.result().captureCandidates.length, 1);
  const [a] = c.result().captureCandidates;
  assert.equal(a.direction, 'arrival'); assert.equal(a.recordingIndex, 1); assert.equal(a.trainId, 1); assert.equal(a.platform, '2');
  assert.equal(a.transitionMs, 8000); assert.equal(a.endMs, 10000); assert.equal(a.frames.length, 5); assert.equal(a.frames.at(-1).state, 'held');
  const staticOnly = evidenceCollector(0);
  for (let t = 0; t <= 10000; t += 100) staticOnly.onSample(sample(t, 0, 0, '1'));
  assert.equal(staticOnly.result().captureCandidates.length, 0);
});
test('Axis 05 departure candidates preserve held first frame and measure body displacement', () => {
  const c = evidenceCollector(0);
  for (let t = 0; t <= 20000; t += 100) c.onSample(sample(t, t <= 4000 ? 0 : 1, Math.max(0, t / 1000 - 4), t <= 4000 ? '3' : undefined));
  const [a] = c.result().captureCandidates;
  assert.equal(a.direction, 'departure'); assert.equal(a.frames[0].state, 'held'); assert.equal(a.frames.at(-1).state, 'moving'); assert.ok(a.movedM >= 15);
  const noTravel = evidenceCollector(0);
  for (let t = 0; t <= 20000; t += 100) noTravel.onSample(sample(t, t <= 4000 ? 0 : 1, 0, t <= 4000 ? '3' : undefined));
  assert.equal(noTravel.result().captureCandidates.length, 0);
});
test('Axis 05 handling distinguishes observed lag, chain gaps and unmapped endpoints', () => {
  const rows = [
    { t: 5000, e: { kind: 'step', area: 'Y9', descr: '1A01', from: 'A', to: 'B', time: 3000 } },
    { t: 6000, e: { kind: 'step', area: 'Y9', descr: '1A01', from: 'C', to: 'D' } },
    { t: 7000, e: { kind: 'snapshot', area: 'Y9', berths: {} } },
    { t: 8000, e: { kind: 'step', area: 'Y9', descr: '1A01', from: 'E', to: 'F', time: 8000 } },
  ];
  const h = handlingEvidence(rows, { ...anchors, anchors: [{ berth: 'A' }, { berth: 'B' }] });
  assert.equal(h.steps, 3); assert.equal(h.lateSourceSteps, 1); assert.equal(h.maxSourceLagMs, 2000); assert.equal(h.missingSourceTimeSteps, 1);
  assert.equal(h.missingMappedEndpointSteps, 2); assert.equal(h.discontinuousDescriptionSteps, 1); assert.equal(h.snapshots, 1);
});
const data = { attribution: 'synthetic', origin: { lat: 0, lon: 0 }, nodes: [[1, 0, -200], [2, 100, -200]],
  rails: [{ id: 10, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0, maxspeed: '10 mph' }], switches: [], buffers: [], signals: [], platforms: [], buildings: [] };
test('Axis 05 audit observer emits every measured tick with platform and limit metadata', () => {
  const seen = [], rows = [{ t: 0, e: { kind: 'heartbeat', area: 'Y9' } }, { t: 200, e: { kind: 'heartbeat', area: 'Y9' } }];
  auditRecording(rows, data, anchors, { onSample: (s) => seen.push(s), createMotion: (graph) => ({ apply() {}, advance() {}, trains: () => [{
    ...sample(0, 0, 0).train, leading: { edge: graph.edges[0], t: 0, point: [0, -200] }, occupiedLengthM: 0, targetBerth: '', lastBerth: '', blocked: false, opacity: 1,
  }] }) });
  assert.deepEqual(seen.map((s) => s.atMs), [0, 100, 200]); assert.ok(seen[0].speedLimitMps < 5);
});
test('Axis 05 command freezes both recording inputs and anchor hash', async () => {
  await mkdir(resolve(root, '.scratch'), { recursive: true });
  const dir = await mkdtemp(resolve(root, '.scratch/axis05-test-'));
  const graph = resolve(dir, 'synthetic-graph.json'), map = resolve(dir, 'synthetic-anchors.json');
  await writeFile(graph, JSON.stringify(data)); await writeFile(map, JSON.stringify(anchors));
  const paths = [];
  for (let i = 0; i < 2; i++) { const path = resolve(dir, `synthetic-${i}.ndjson`); await writeFile(path, JSON.stringify({ t: 1000 + i, e: { kind: 'heartbeat', area: 'Y9' } }) + '\n'); paths.push(path); }
  const out = resolve(dir, 'report');
  const r = await runAxis05([...paths.flatMap((p) => ['--recording', p]), '--anchors', map, '--graph', graph, '--out', out]);
  assert.equal(r.recordings.length, 2); assert.equal(r.schemaVersion, 1); assert.equal(r.reproducibility.inputHashes.recordings.length, 2);
  assert.equal(r.reproducibility.inputHashes.anchors.sha256, createHash('sha256').update(await readFile(map)).digest('hex'));
  assert.deepEqual(JSON.parse(await readFile(resolve(out, 'axis05-evidence.json'), 'utf8')).captureCandidates, []);
  for (const p of r.recordings) assert.equal(createHash('sha256').update(await readFile(p.input.capturedPath)).digest('hex'), p.input.sha256);
});


test('Axis 05 pass-through compares occupied centers and excludes stationary cab swaps', () => {
  const c = evidenceCollector(0);
  const occupied = (at, id, fromT, toT, reversedEdge = false) => {
    const s = sample(at, 1, 0);
    s.train.id = id;
    s.train.occupied = [{ edge: { a: reversedEdge ? 2 : 1, b: reversedEdge ? 1 : 2 }, fromT, toT }];
    c.onSample(s);
  };
  occupied(0, 1, 0.1, 0.2); occupied(0, 2, 0.7, 0.8);
  // Reverse both interval orientation and graph endpoint order: same bodies, same centers.
  occupied(100, 1, 0.8, 0.9, true); occupied(100, 2, 0.8, 0.7);
  occupied(200, 1, 0.7, 0.8); occupied(200, 2, 0.1, 0.2);
  const r = c.result().passThrough;
  assert.equal(r.sameEdgeOrderExchangeSamples, 1); assert.equal(r.distinctPairs, 1);
  assert.deepEqual(r.exchanges, [{ atMs: 200, edge: [1, 2], trainIds: [1, 2] }]);
  // No comparison across an observation gap; no second count from repeated result reads.
  occupied(500, 1, 0.1, 0.2); occupied(500, 2, 0.7, 0.8);
  assert.equal(c.result().passThrough.sameEdgeOrderExchangeSamples, 1);
  assert.equal(c.result().passThrough.sameEdgeOrderExchangeSamples, 1);
});
