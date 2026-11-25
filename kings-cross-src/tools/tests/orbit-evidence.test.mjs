// Round F10 (front A7): the glass-order orbit's pure parts: its camera paths, masked frame difference, spike rule and JSON record.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shedLayout, worldToShed } from '../../core/station.ts';
import { glassOrder } from '../../web/src/shed.ts';
import { ELEMENT_VIEWS, ORBIT, maskedMeanDiff, optionsFrom, orbitPaths, orbitRecord, orbitSpikes, resolveViews, stationCameras, stationViewNames } from '../evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = JSON.parse(await readFile(path.join(root, 'web/src/data/kx-track.json'), 'utf8'));
const layout = shedLayout(data), cameras = stationCameras(data), paths = orbitPaths(layout, cameras);
const order = p => { const { v } = worldToShed(layout, [p[0], p[2]]); return JSON.stringify(glassOrder([0, p[1], -v], layout)); };

test('each orbit path has ORBIT.frames frames, starts at its station view, keeps its range, height and target, and crosses its plane so the glass order changes', () => {
  assert.equal(ORBIT.frames, 12);
  for (const [name, view, plane] of [['front', 'front-oblique', 0], ['gable', 'gable-oblique', layout.length]]) {
    const frames = paths[name], c = cameras[view];
    assert.equal(frames.length, 12, name);
    frames[0].pos.forEach((x, i) => assert.ok(Math.abs(x - c.pos[i]) < 1e-6, `${name} starts at ${view}`));
    const at = worldToShed(layout, [c.target[0], c.target[2]]), range = q => { const e = worldToShed(layout, [q[0], q[2]]); return Math.hypot(e.u - at.u, e.v - at.v); };
    for (const f of frames) {
      assert.deepEqual(f.target, c.target, name);
      assert.equal(f.pos[1], c.pos[1], name);
      assert.ok(Math.abs(range(f.pos) - range(c.pos)) < 1e-6, `${name} keeps its range`);
      assert.ok(Math.abs(worldToShed(layout, [f.pos[0], f.pos[2]]).v - f.v) < 1e-6, `${name} v is the eye's`);
    }
    const sides = frames.map(f => Math.sign(f.v - plane));
    assert.ok(sides.includes(1) && sides.includes(-1), `${name} crosses v = ${plane}`);
    assert.ok(sides.filter(s => s === sides[0]).length >= 3 && sides.filter(s => s !== sides[0]).length >= 3, `${name} spends 3+ frames each side`);
    const steps = frames.slice(1).map((f, i) => Math.hypot(f.pos[0] - frames[i].pos[0], f.pos[2] - frames[i].pos[2]));
    assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-6 && steps[0] > 1, `${name} steps evenly`);
    assert.ok(new Set(frames.map(f => order(f.pos))).size >= 2, `${name} sees the glass order switch`);
  }
});

test('maskedMeanDiff is the mean absolute RGB difference inside the union of the rects, clamped to the frame, alpha ignored, null with no mask', () => {
  const frame = (w, h, fill) => ({ width: w, height: h, channels: 4, pixels: Uint8Array.from({ length: w * h * 4 }, (_, i) => fill(Math.floor(i / 4) % w, Math.floor(i / 4 / w), i % 4)) });
  const a = frame(4, 3, () => 100), b = frame(4, 3, (x, y, c) => c === 3 ? 0 : x === 0 && y === 0 ? 130 : x === 3 ? (c === 0 ? 40 : 100) : 100);
  assert.equal(maskedMeanDiff(a, b, [[0, 0, 0, 0]]), 30);
  assert.equal(maskedMeanDiff(a, b, [[0, 0, 1, 0]]), 15);
  assert.equal(maskedMeanDiff(a, b, [[0, 0, 1, 0], [0, 0, 0, 0]]), 15, 'a union, not a sum');
  assert.equal(maskedMeanDiff(a, b, [[3, -5, 9, 9]]), 20, 'clamped: column 3, rows 0-2, R off by 60');
  assert.equal(maskedMeanDiff(a, b, [[1, 1, 2, 2]]), 0);
  assert.equal(maskedMeanDiff(a, b, []), null);
  assert.equal(maskedMeanDiff(a, b, [[10, 10, 20, 20]]), null);
  assert.throws(() => maskedMeanDiff(a, frame(3, 3, () => 0), [[0, 0, 0, 0]]));
});

test('orbitSpikes flags a frame over 3x the median of up to two neighbours either side and over the floor, never a still path', () => {
  assert.equal(ORBIT.spike, 3);
  assert.deepEqual(orbitSpikes([null, 2, 2, 2, 9, 2, 2, 2]), [4]);
  assert.deepEqual(orbitSpikes([null, 2, 2, 2, 6, 2, 2, 2]), [], '3x exactly is no spike');
  assert.deepEqual(orbitSpikes([null, 2, 3, 2, 6.1, 1, 2, 2]), [4], 'median of 3, 2, 1, 2 is 2');
  assert.deepEqual(orbitSpikes([null, 9, 2, 2, 2]), [1], 'the first diff has neighbours on one side only');
  assert.deepEqual(orbitSpikes([null, 2, 2, 2, 2, 9]), [5], 'and the last');
  assert.deepEqual(orbitSpikes([null, 0, 0, 0.4, 0, 0]), [], 'under the floor');
  assert.deepEqual(orbitSpikes([null, 0, 0, 0.6, 0, 0]), [3]);
  assert.deepEqual(orbitSpikes([null, 1, 1, 1, 1]), []);
  assert.deepEqual(orbitSpikes([null, 5]), [], 'no neighbour, no verdict');
  assert.deepEqual(orbitSpikes([null, 2, null, 2, 9, 2]), [4], 'gaps are skipped');
  assert.deepEqual(orbitSpikes([null, 2, 2, 7, 2, 2], { factor: 4 }), []);
  assert.deepEqual(orbitSpikes([null, 1, 9, 4, 1, 1]), [2, 3], 'two neighbours each side, sorted for the median: 1, 9, 1, 1 gives 1');
});

test('orbitRecord names each frame, keeps its camera, glass order and difference, and lists the spikes', () => {
  const frames = [0, 1, 2, 3, 4].map(i => ({ pos: [i, 2, 3], target: [4, 5, 6], v: i, glassOrder: { gable: 2.5, roof: 3, front: 3.5 }, diff: [null, 1, 1, 8, 1][i] }));
  const r = orbitRecord('front', 'xray', frames);
  assert.deepEqual(Object.keys(r), ['path', 'mode', 'mask', 'spikeRule', 'frames', 'spikes']);
  assert.equal(r.path, 'front'); assert.equal(r.mode, 'xray');
  assert.match(r.mask, /bounding boxes projected/);
  assert.deepEqual(r.frames[3], { name: 'orbit-front-03-xray', camera: { pos: [3, 2, 3], target: [4, 5, 6] }, glassOrder: { gable: 2.5, roof: 3, front: 3.5 }, diff: 8, spike: true });
  assert.equal(r.frames[0].name, 'orbit-front-00-xray'); assert.equal(r.frames[0].diff, null); assert.equal(r.frames[0].spike, false);
  assert.deepEqual(r.spikes, ['orbit-front-03-xray']);
  assert.equal(orbitRecord('gable', 'auto', frames).frames[1].name, 'orbit-gable-01');
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
});

test('the orbit is shot only under --orbit and is in no element view list', () => {
  assert.equal(optionsFrom([]).orbit, false);
  assert.equal(optionsFrom(['--orbit']).orbit, true);
  assert.ok(!stationViewNames(cameras).some(v => /orbit/.test(v)), 'no orbit view among the station cameras');
  assert.ok(!Object.values(ELEMENT_VIEWS).flat().some(v => /orbit/.test(v)), 'nor in any element');
  assert.throws(() => resolveViews('orbit', cameras), /unknown view or element/);
});
