// tools/camera-sweep.mjs: which cameras the frame-rate sweep runs, and how its results are summarised. Synthetic results only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { stationCameras } from '../evidence.mjs';
import { stationData } from '../station-scene.mjs';
import { sweepAcrossPairs, sweepCameraList, sweepSummary } from '../camera-sweep.mjs';

const CAMERAS = {
  overview: { pos: [1, 2, 3], target: [4, 5, 6], source: 'x' },
  'tower-close': { pos: [7, 8, 9], target: [1, 1, 1], fov: 35, near: .3, source: 'y' },
  top: { pos: [0, 3000, 0], target: [0, 0, 1], fov: 12, near: 100, grid: true, source: 'z' },
};

test('the sweep takes every fixed station camera, with the lens the evidence pack gives it', () => {
  const all = sweepCameraList(CAMERAS);
  assert.deepEqual(all.map(c => c.name), ['overview', 'tower-close', 'top']);
  assert.deepEqual(all[0], { name: 'overview', pos: [1, 2, 3], target: [4, 5, 6], fov: 50, near: .1 }, 'the evidence defaults: 50 degrees, 0.1 m');
  assert.deepEqual(all[1], { name: 'tower-close', pos: [7, 8, 9], target: [1, 1, 1], fov: 35, near: .3 });
  assert.equal(all[2].grid, true, 'a grid view is a fixed camera too (the overlay is not drawn)');
  assert.equal(all[0].source, undefined, 'the long source text stays out of the perf report');
});

test('--stations: all, none, or a list of names, and nothing else', () => {
  assert.equal(sweepCameraList(CAMERAS, 'all').length, 3);
  assert.deepEqual(sweepCameraList(CAMERAS, 'none'), []);
  assert.deepEqual(sweepCameraList(CAMERAS, 'top, overview').map(c => c.name), ['top', 'overview'], 'in the order given');
  assert.throws(() => sweepCameraList(CAMERAS, 'overview,nowhere'), /unknown: nowhere/);
  assert.throws(() => sweepCameraList(CAMERAS, 'overview,,top'), /empty name/);
  assert.throws(() => sweepCameraList(CAMERAS, 'overview,overview'), /twice/);
});

test('the real station cameras: all 42 are in the sweep, each with a finite lens', () => {
  const cameras = stationCameras(stationData().data), list = sweepCameraList(cameras);
  assert.equal(list.length, Object.keys(cameras).length, 'every fixed station camera is swept');
  assert.equal(list.length, 42, 'the 20 before wave 0, the 21 the rubrics add, and concourse-exterior-west');
  assert.ok(list.some(c => c.name === 'western-range') && list.some(c => c.name === 'western-range-full') && list.some(c => c.name === 'canal-lock'));
  for (const c of list) assert.ok([...c.pos, ...c.target, c.fov, c.near].every(Number.isFinite), c.name);
});

// The 5th percentile FPS sits 7 below the median FPS, and the trains drawn range from 2 below their median to 3 above it, so that a figure read
// from the wrong field of a report cannot pass for the right one.
const camera = (fps, p99, slowShare, shown, extra = {}) => ({
  fps: { median: fps, p5: fps - 7 }, frameDistribution: { p99, slowShare, missedSlots: Math.round(slowShare * 300) },
  trainsShown: { min: shown - 2, median: shown, max: shown + 3 }, realMetal: true, rAFThrottleDetected: false,
  steady60: fps >= 60 && slowShare <= .01, busy: shown >= 9, ...extra,
});

test('one pair: how many cameras held 60 FPS and were measured at the peak, and the worst of each figure', () => {
  const summary = sweepSummary({ a: camera(60, 16.7, 0, 12), b: camera(60, 33.3, .02, 12), c: camera(48, 33.3, .3, 12), d: camera(60, 16.7, 0, 4) });
  assert.equal(summary.cameras, 4); assert.equal(summary.steadyAt60, 2);
  assert.deepEqual(summary.notSteady, ['b', 'c']);
  assert.equal(summary.busy, 3); assert.deepEqual(summary.notBusy, ['d']);
  assert.deepEqual(summary.worstMedianFps, { camera: 'c', value: 48 });
  assert.deepEqual(summary.slowestP99Ms, { camera: 'b', value: 33.3 });
  assert.deepEqual(summary.mostSlowFrames, { camera: 'c', value: .3 });
  assert.deepEqual(summary.trainsShownMedian, { min: 4, median: 12, max: 12 });
  assert.equal(summary.allRealMetal, true);
  assert.equal(sweepSummary({ a: camera(60, 16.7, 0, 12, { rAFThrottleDetected: true }) }).allRealMetal, false, 'a throttled page is not real Metal evidence');
  assert.equal(sweepSummary({ a: camera(60, 16.7, 0, 12, { realMetal: false }) }).allRealMetal, false);
  const none = sweepSummary({});
  assert.equal(none.cameras, 0); assert.equal(none.allRealMetal, false); assert.equal(none.worstMedianFps, null); assert.equal(none.trainsShownMedian, null);
});

const report = stationCameras => ({ stationCameras, replayPeak: { startMs: 1234, busyFloor: 9 } });

test('across pairs: per camera, the spread of its median FPS and whether it was steady and busy in every pair', () => {
  const pairs = [
    report({ a: camera(60, 16.7, 0, 12), b: camera(60, 16.7, 0, 12) }),
    report({ a: camera(60, 16.7, 0, 14), b: camera(59, 33.3, .02, 11) }),
    report({ a: camera(61, 16.8, 0, 13), b: camera(60, 16.7, 0, 12) }),
  ];
  const sweep = sweepAcrossPairs(pairs);
  assert.equal(sweep.pairs, 3); assert.equal(sweep.cameraCount, 2);
  assert.deepEqual(sweep.cameras.a.medianFps, { min: 60, median: 60, max: 61 });
  assert.deepEqual(sweep.cameras.a.p5Fps, { min: 53, median: 53, max: 54 }, 'the 5th percentile FPS, not the median');
  assert.deepEqual(sweep.cameras.a.trainsShownMedian, { min: 12, median: 13, max: 14 });
  assert.equal(sweep.cameras.a.steadyEveryPair, true);
  assert.equal(sweep.cameras.b.steadyEveryPair, false, 'one pair at 59 is enough');
  assert.deepEqual(sweep.cameras.b.p99FrameMs, { min: 16.7, median: 16.7, max: 33.3 });
  assert.deepEqual(sweep.cameras.b.slowShare, { min: 0, median: 0, max: .02 });
  assert.deepEqual(sweep.cameras.b.missedSlots, { min: 0, median: 0, max: 6 }, 'the slots the slow frames overran, not their p99');
  assert.equal(sweep.allSteadyAt60, false); assert.deepEqual(sweep.notSteady, ['b']);
  assert.equal(sweep.allBusy, true); assert.equal(sweep.allRealMetal, true); assert.equal(sweep.everyCameraEveryPair, true);
  assert.equal(sweep.worstMedianFps, 59); assert.equal(sweep.slowestP99FrameMs, 33.3);
  assert.deepEqual(sweep.peak, { startMs: 1234, busyFloor: 9 });
});

test('across pairs: a camera missing from a pair is not steady or busy in every pair, and a quiet pair is not a busy peak', () => {
  const sweep = sweepAcrossPairs([report({ a: camera(60, 16.7, 0, 12), b: camera(60, 16.7, 0, 12) }), report({ a: camera(60, 16.7, 0, 3) })]);
  assert.equal(sweep.everyCameraEveryPair, false);
  assert.equal(sweep.cameras.b.pairs, 1); assert.equal(sweep.cameras.b.steadyEveryPair, false); assert.equal(sweep.cameras.b.busyEveryPair, false);
  assert.equal(sweep.cameras.a.busyEveryPair, false, 'three trains in the second pair is below the floor');
  assert.deepEqual(sweep.notBusy, ['a', 'b']);
  assert.equal(sweep.allBusy, false);
});

test('across pairs: reports with no station sweep are ignored, and none at all is null', () => {
  assert.equal(sweepAcrossPairs([{ cameras: {} }, { stationCameras: {} }]), null);
  assert.equal(sweepAcrossPairs([]), null);
  const one = sweepAcrossPairs([{ cameras: {} }, report({ a: camera(60, 16.7, 0, 12) })]);
  assert.equal(one.pairs, 1, 'a report without the sweep is not a pair of the sweep');
});
