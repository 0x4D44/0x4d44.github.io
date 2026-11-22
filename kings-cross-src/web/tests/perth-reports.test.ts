import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { WaverleyAnchorScene } from '../../core/waverley-anchors.ts';
import { lampEnds } from '../src/train-lamp-pool.ts';

const geometry: WaverleyAnchorScene = { attribution: 'synthetic', origin: { lat: 0, lon: 0 },
  rails: [
    { id: 'synthetic/north', tags: { railway: 'rail', ref: 'HGL1' }, path: [[0, -800], [0, -150]] },
    { id: 'synthetic/station', tags: { railway: 'rail', ref: 'HGL1' }, path: [[0, -150], [0, 150]] },
    { id: 'synthetic/south', tags: { railway: 'rail', ref: 'SCM4' }, path: [[0, 150], [0, 800]] },
  ],
  platforms: [{ id: 'synthetic/face', ref: '1', tags: {}, path: [[1, -100], [4, -100], [4, 100], [1, 100]] }],
};
const t = Date.UTC(2035, 0, 10, 14);
const call = { uid: 'SYN01', headcode: '9Z90', platform: '1', arrivalMs: t, departureMs: t + 120_000, passMs: null,
  from: 'south', to: 'north' } as const;
const report = (eventType: 'ARRIVAL' | 'DEPARTURE' | 'PASS', plannedMs: number, actualMs: number) => ({
  headcode: call.headcode, eventType, plannedMs, actualMs, receivedAtMs: actualMs + 1000, platform: null,
});

test('Perth reports control approach, arrival, dwell and departure, then release the train', async () => {
  const { createPerthTrack, planPerthTrains } = await import('../../core/perth-motion.ts');
  const track = createPerthTrack(geometry);
  const arrival = t + 20_000, departure = t + 190_000;
  const before = planPerthTrains(track, [call], []);
  assert.ok(before.trainsAt(t - 20_000)[0]!.view.leading.point[1] > 0);
  const plan = planPerthTrains(track, [call], [report('ARRIVAL', t, arrival), report('DEPARTURE', t + 120_000, departure)]);
  assert.equal(plan.trainsAt(arrival + 1000)[0]!.phase, 'dwell');
  assert.ok(Math.abs(plan.trainsAt(departure - 2000)[0]!.view.leading.point[1]) < 1e-8);
  const leaving = plan.trainsAt(departure + 15_000)[0]!;
  assert.equal(leaving.phase, 'departure');
  assert.equal(leaving.source, 'live');
  assert.ok(leaving.view.leading.point[1] < 0);
  assert.equal(plan.trainsAt(departure + 180_000).length, 0);
});

test('Perth follows booked times without reports and a pass traverses without dwelling', async () => {
  const { createPerthTrack, planPerthTrains } = await import('../../core/perth-motion.ts');
  const track = createPerthTrack(geometry), plan = planPerthTrains(track, [call], []);
  assert.equal(plan.trainsAt(t + 1000)[0]!.source, 'scheduled');
  assert.equal(plan.trainsAt(t + 1000)[0]!.phase, 'dwell');
  assert.equal(plan.trainsAt(t + 121_000)[0]!.phase, 'departure');
  const actualPass = t + 5000;
  const passing = planPerthTrains(track, [{ ...call, arrivalMs: null, departureMs: null, passMs: t }], [report('PASS', t, actualPass)]);
  assert.ok(passing.trainsAt(actualPass - 1000)[0]!.view.leading.point[1] > 0);
  assert.equal(passing.trainsAt(actualPass + 1000)[0]!.phase, 'pass');
  assert.equal(passing.trainsAt(actualPass + 1000)[0]!.source, 'live');
  assert.ok(passing.trainsAt(actualPass + 1000)[0]!.view.leading.point[1] < 0);
});

test('Perth resolves a unique track, prefers a reported platform and labels a timetable-line fallback', async () => {
  const { createPerthTrack, planPerthTrains } = await import('../../core/perth-motion.ts');
  const track = createPerthTrack(geometry);
  assert.deepEqual([...track.platforms.keys()], ['1']);
  const fallback = planPerthTrains(track, [{ ...call, platform: '2' }], []);
  assert.equal(fallback.trainsAt(t + 1000)[0]!.platform, null);
  assert.deepEqual(fallback.unresolvedPlatforms, ['2']);
  const mapped = planPerthTrains(track, [{ ...call, platform: '2' }], [{ ...report('ARRIVAL', t, t), platform: '1' }]);
  assert.equal(mapped.trainsAt(t + 1000)[0]!.platform, '1');
  const reportedUnknown = planPerthTrains(track, [call], [{ ...report('ARRIVAL', t, t), platform: '2' }]);
  assert.equal(reportedUnknown.trainsAt(t + 1000)[0]!.platform, null);
});

test('Perth renders reported traffic with neutral lamps and never polls or draws in capture modes', async () => {
  const { createPerthLive } = await import('../src/perth-live.ts');
  const scene = new THREE.Scene(), urls: string[] = [];
  const doc = { createElement: () => ({ style: {}, ownerDocument: doc, append() {}, remove() {} }) };
  const parent = { ownerDocument: doc, append() {} } as unknown as HTMLElement;
  const options = { geometry, scene, camera: new THREE.Camera(), parent, hostname: '127.0.0.1', date: '', speed: 1,
    now: () => t + 1000, fetchImpl: async (u: RequestInfo | URL) => {
      urls.push(String(u)); return new Response(JSON.stringify({ date: '2035-01-10', scheduleAvailable: true,
        feed: 'connected', calls: [call], reports: [report('ARRIVAL', t, t)] }));
    } };
  for (const mode of ['none', 'demo'] as const) {
    assert.equal(createPerthLive({ ...options, mode }), undefined);
    assert.equal(scene.children.length, 0);
  }
  assert.deepEqual(urls, []);
  const runtime = createPerthLive({ ...options, mode: 'live' });
  assert.ok(runtime);
  try {
    await runtime.load(); runtime.frame(0, true);
    assert.deepEqual(urls, ['/relay/perth']);
    assert.match(runtime.status(), /live from train reports/);
    const train = runtime.lampTrains()[0]!;
    assert.equal(train.group.userData.kind, 'neutral');
    assert.deepEqual(lampEnds(train.group).map(end => end.mode), ['head', 'tail']);
  } finally { runtime.dispose(); }
  assert.equal(scene.children.length, 0);
});
