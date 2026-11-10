import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { EDINBURGH_FLEET } from '../../web/src/edinburgh-fleet.ts';
import { carPoses } from '../../web/src/trains-live.ts';
import { polylineRoute, trainViewAt } from '../train-capture.mjs';
import { syntheticTrainsFrom } from '../perf.mjs';
import { SYNTHETIC_FILE, SYNTHETIC_REACH, loadSyntheticPlan, poseCars, routeSamples, syntheticPlan, syntheticScript } from '../waverley-synthetic.mjs';

const scene = JSON.parse(readFileSync(new URL('../../web/src/data/waverley-scene.json', import.meta.url), 'utf8'));
const timetable = JSON.parse(readFileSync(SYNTHETIC_FILE, 'utf8'));
const plan = await loadSyntheticPlan();

test('the synthetic Waverley is busy, made up, and has every Edinburgh kind in it, some of them moving', () => {
  const kinds = new Set(plan.trains.map((t) => t.kind));
  for (const row of EDINBURGH_FLEET) assert.ok(kinds.has(row.kind), `${row.kind} is in the synthetic station`);
  assert.ok(plan.trains.length >= 18, `about a peak's worth of trains (${plan.trains.length})`);
  const moving = plan.trains.filter((t) => t.loop);
  assert.ok(moving.length >= 4 && moving.every((t) => t.speedMps > 0 && t.loop[1] - t.loop[0] >= t.lengthM), 'at least four trains run, each over at least its own length');
  assert.equal(new Set(plan.trains.map((t) => t.id)).size, plan.trains.length);
  assert.ok(plan.trains.every((t) => /^SYN-\d{2}$/.test(t.id)), 'made-up ids only');
  const fields = new Set(['id', 'kind', 'platform', 'heading', 'speedMps', 'offsetM']);
  assert.ok(timetable.trains.every((t) => Object.keys(t).every((key) => fields.has(key))), 'a train has a made-up id, a kind, a platform, a heading and a speed or offset: no headcode, berth or time');
  assert.match(plan.note, /SYNTHETIC, test only/);
});

test('poseCars poses every train as the page\'s carPoses does on the same track, standing and along each moving train\'s loop', () => {
  let compared = 0;
  for (const t of plan.trains) {
    const route = polylineRoute(t.route.points), stops = t.loop ? [0, 0.17, 0.5, 0.83, 1].map((u) => t.loop[0] + u * (t.loop[1] - t.loop[0])) : [t.noseS];
    assert.ok(Math.abs(route.lengthM - t.route.cum.at(-1)) < 1e-9);
    for (const noseS of stops) {
      const want = carPoses(route.graph, trainViewAt(route, noseS, t.lengthM), { cars: t.cars }), got = poseCars(t.route, t.cars, noseS);
      assert.equal(got.length, t.cars.length, `${t.id}: every car is posed`);
      assert.equal(got.length, want.length);
      got.forEach((g, i) => {
        const w = want[i], near = (a, b) => Math.abs(a - b) <= 1e-6;
        assert.ok(near(g.position[0], w.position[0]) && near(g.position[1], w.position[1]) && near(g.rotationY, w.rotationY) && near(g.scaleZ, w.scaleZ), `${t.id} car ${i} at ${noseS}`);
        for (const k of ['frontBogie', 'rearBogie']) assert.ok([0, 1].every((j) => near(g[k].point[j], w[k].point[j]) && near(g[k].back[j], w[k].back[j])), `${t.id} car ${i} ${k}`);
        compared++;
      });
    }
  }
  assert.ok(compared > 150);
});

test('no two synthetic trains ever meet: each moving train loops over track no other train stands on or runs over', () => {
  const gap = SYNTHETIC_REACH.gapM, far = (A, B) => A.every((p) => B.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) >= gap));
  const reach = (t) => (t.loop ? routeSamples(t.route, 0, t.loop[1]) : routeSamples(t.route, t.noseS - t.lengthM, t.noseS));
  const swept = plan.trains.map((t) => [t, reach(t)]);
  for (let i = 0; i < swept.length; i++) for (let j = i + 1; j < swept.length; j++) assert.ok(far(swept[i][1], swept[j][1]), `${swept[i][0].id} and ${swept[j][0].id} come within ${gap} m`);
});

test('a timetable that would put trains on top of each other, use a headcode for an id, or name a platform with no track is refused', () => {
  const one = (entry) => ({ note: 'x', trains: [entry] });
  assert.throws(() => syntheticPlan(scene, one({ id: '1A23', kind: 'sr158x2', platform: '13', heading: 'east' })), /not a SYN-nn id/);
  assert.throws(() => syntheticPlan(scene, one({ id: 'SYN-01', kind: 'sr158x2', platform: '7', heading: 'east' })), /no screened track/);
  assert.throws(() => syntheticPlan(scene, one({ id: 'SYN-01', kind: 'nope', platform: '13', heading: 'east' })), /neither an Edinburgh fleet row/);
  const twice = { note: 'x', trains: [{ id: 'SYN-01', kind: 'sr158x2', platform: '13', heading: 'east' }, { id: 'SYN-02', kind: 'sr170x3', platform: '13', heading: 'west' }] };
  assert.throws(() => syntheticPlan(scene, twice), /SYN-01 and SYN-02 meet/);
  // a moving train with another standing across its path is cut short of it
  const pair = { note: 'x', trains: [timetable.trains.find((t) => t.id === 'SYN-11'), timetable.trains.find((t) => t.id === 'SYN-24')] };
  const cut = syntheticPlan(scene, pair).trains[1], alone = syntheticPlan(scene, { note: 'x', trains: [pair.trains[1]] }).trains[0];
  assert.ok(cut.loop[1] < alone.loop[1] - 50, `the standing train shortens the moving one's run (${cut.loop[1].toFixed(0)} against ${alone.loop[1].toFixed(0)} m)`);
});

test('the page script builds each train with the page\'s own hook, adds it to the Waverley scene once, and moves only the moving trains', async () => {
  const { evidenceBuildEdinburgh } = await import('../../web/src/edinburgh-fleet.ts');
  const waverley = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 5000), frames = [];
  camera.position.set(60, 400, 400); camera.lookAt(60, 0, 0); camera.updateMatrixWorld();
  globalThis.window = { __kx: { camera, evidenceBuildEdinburgh, stations: { edinburgh: () => ({ scene: waverley, geometry: {} }) } } };
  globalThis.requestAnimationFrame = (f) => frames.push(f);
  try {
    const first = eval(syntheticScript(plan));
    assert.equal(first.trains, plan.trains.length);
    assert.equal(first.cars, plan.trains.reduce((n, t) => n + t.cars.length, 0), 'every car of every train is posed');
    assert.deepEqual(new Set(first.kinds), new Set(plan.trains.map((t) => t.kind)));
    assert.ok(first.inView > 0 && first.inView <= first.trains, `the overview sees some trains (${first.inView})`);
    assert.equal(eval(syntheticScript(plan)).trains, plan.trains.length, 'a second run adds nothing');
    assert.equal(waverley.children.filter((c) => c.userData.synthetic).length, plan.trains.length);
    const where = () => waverley.children.map((g) => g.children.find((c) => c.visible).position.toArray().join());
    const before = where();
    frames.shift()(1000); frames.shift()(2000);
    const after = where(), moved = waverley.children.filter((_, i) => before[i] !== after[i]).map((g) => g.userData.id);
    assert.deepEqual(moved.sort(), plan.trains.filter((t) => t.loop).map((t) => t.id).sort(), 'the moving trains moved and the standing ones did not');
    const run = window.__kx.synthetic.summary().travelledM, want = plan.trains.reduce((n, t) => n + t.speedMps, 0);
    assert.ok(Math.abs(run - Math.round(want * 0.25 * 10) / 10) < 0.11, `one step (capped at 0.25 s) of each moving train (${run} m)`);
  } finally { delete globalThis.window; delete globalThis.requestAnimationFrame; }
});

test('--synthetic-trains goes with --scene waverley only', () => {
  assert.equal(syntheticTrainsFrom(['--scene', 'waverley', '--synthetic-trains'], 'waverley'), true);
  assert.equal(syntheticTrainsFrom(['--scene', 'waverley'], 'waverley'), false);
  assert.equal(syntheticTrainsFrom([], 'kings-cross'), false);
  assert.throws(() => syntheticTrainsFrom(['--synthetic-trains'], 'kings-cross'), /--synthetic-trains is for --scene waverley/);
});
