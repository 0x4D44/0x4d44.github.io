import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile, stat, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { axis05SchedulePolicy, evidenceCollector, handlingEvidence, runAxis05 } from '../axis05-evidence.ts';
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

const date = '2026-11-08', atMs = Date.parse(date + 'T12:00:00Z');
const call = { date, serviceDate: date, uid: 'SYNTH', headcode: '1A01', operator: 'GN', origin: 'MOORGATE', destination: 'KNGX',
  platform: null, arrivalMs: atMs, departureMs: null };
test('Axis 05 schedules select the birth day and preserve fallback and physical formation', async () => {
  const { createTrainKinds } = await import('../../web/src/trains-live.ts');
  const policy = axis05SchedulePolicy([{ date, calls: [call] }]);
  assert.deepEqual(policy.dates, [date]);
  assert.equal(policy.serviceFor('1A01', atMs), call);
  assert.equal(policy.serviceFor('1A01', atMs - 86400000), undefined);
  assert.equal(policy.serviceFor('1A01', atMs + 91 * 60000), undefined);
  const kinds = createTrainKinds(policy.serviceFor), fallback = createTrainKinds(() => undefined);
  const length = kinds.lengthM('1A01', { id: 1, timeMs: atMs });
  assert.equal(kinds.formationFor({ id: 1 }).kind, 'gn717x6');
  assert.notEqual(length, fallback.lengthM('1A01', { id: 1, timeMs: atMs }));
  assert.equal(kinds.lengthM('2Z01', { id: 1, timeMs: atMs - 86400000 }), length);
  kinds.lengthM('1A01', { id: 2, timeMs: atMs - 86400000 });
  assert.equal(kinds.formationFor({ id: 2 }).kind, 'lner9');
});
test('Axis 05 schedules reject invalid dates duplicate days and mismatched calls', () => {
  for (const docs of [ [{ date: '2026-02-30', calls: [] }], [{ dates: [date], calls: [] }],
    [{ date, dates: [date], calls: [] }], [{ date, calls: [] }, { date, calls: [] }],
    [{ date, calls: [{ ...call, date: '2026-11-07' }] }], [{ date, calls: [{ ...call, arrivalMs: 'no' }] }],
    [{ date, calls: null }] ]) assert.throws(() => axis05SchedulePolicy(docs), /schedule/);
});
test('Axis 05 optional inputs freeze private bytes and reproduce all supplied caches', async () => {
  await mkdir(resolve(root, '.scratch'), { recursive: true });
  const dir = await mkdtemp(resolve(root, '.scratch/axis05-input-test-'));
  const graph = resolve(dir, 'graph.json'), map = resolve(dir, 'anchors.json'), recording = resolve(dir, 'recording.ndjson');
  const schedule = resolve(dir, 'schedule.json'), second = resolve(dir, 'second.json'), sclass = resolve(dir, 'sclass.json');
  const birthAnchors = { ...anchors, anchors: [{ berth: 'S1', kind: 'signal', from: 1, to: 2, t: 0.5,
    point: [50, -200], errorM: 5, evidence: 'synthetic signal birth' }] };
  const birthRows = [{ t: atMs, e: { kind: 'interpose', area: 'Y9', descr: '1A01', to: 'S1' } },
    { t: atMs + 100, e: { kind: 'heartbeat', area: 'Y9' } }];
  await Promise.all([writeFile(graph, JSON.stringify(data)), writeFile(map, JSON.stringify(birthAnchors)),
    writeFile(recording, birthRows.map((row) => JSON.stringify(row)).join('\n') + '\n'),
    writeFile(schedule, JSON.stringify({ date, calls: [call] })), writeFile(second, JSON.stringify({ date: '2026-11-07', calls: [] })),
    writeFile(sclass, JSON.stringify({ area: 'Y9', hypotheses: [] }))]);
  const base = ['--recording', recording, '--anchors', map, '--graph', graph];
  const out = resolve(dir, 'report');
  const report = await runAxis05([...base, '--out', out, '--schedule', schedule, '--schedule', second, '--sclass', sclass]);
  assert.equal(report.recordings[0].audit.trains[0].kind, 'gn717x6');
  const inputs = report.reproducibility.inputHashes;
  assert.equal(inputs.schedules.length, 2);
  for (const input of [...inputs.schedules, inputs.sclass]) {
    assert.equal(input.sha256, createHash('sha256').update(await readFile(input.path)).digest('hex'));
    assert.deepEqual(await readFile(input.path), await readFile(input.capturedPath));
    assert.equal((await stat(input.capturedPath)).mode & 0o777, 0o600);
    assert.ok(report.reproducibility.command.args.includes(input.capturedPath));
  }
  assert.equal(report.reproducibility.command.args.filter((a) => a === '--schedule').length, 2);
  assert.ok(report.reproducibility.command.args.includes('--sclass'));
  const rerun = await runAxis05(report.reproducibility.command.args.slice(1));
  assert.deepEqual(rerun.recordings.map((r) => r.audit.counts), report.recordings.map((r) => r.audit.counts));
  const plain = await runAxis05([...base, '--out', resolve(dir, 'plain')]);
  assert.deepEqual(plain.recordings[0].audit.counts, report.recordings[0].audit.counts);
  assert.equal(plain.recordings[0].audit.trains[0].kind, 'lner9');
  assert.notEqual(plain.recordings[0].audit.trains[0].lengthM, report.recordings[0].audit.trains[0].lengthM);
  assert.match(plain.lengthPolicy, /404/);
  assert.deepEqual(plain.recordings[0].scheduleCoverage.fallbackDates, [date]);
  assert.deepEqual(report.recordings[0].scheduleCoverage.scheduledDates, [date]);
  assert.deepEqual(report.recordings[0].scheduleCoverage.fallbackDates, []);
  assert.equal(plain.reproducibility.inputHashes.schedules, undefined);
  await assert.rejects(runAxis05([...base, '--out', resolve(dir, 'invalid'), '--sclass', sclass, '--sclass', sclass]), /repeated/);
  // Refuse an existing symlink even when it points at the exact same private bytes.
  const trapped = resolve(dir, 'trapped'); await mkdir(resolve(trapped, 'inputs'), { recursive: true });
  const input = inputs.schedules[0];
  await symlink(schedule, resolve(trapped, 'inputs', 'schedule-' + date + '-' + input.sha256.slice(0, 12) + '.json'));
  await assert.rejects(runAxis05([...base, '--out', trapped, '--schedule', schedule]), /different content/);
});
