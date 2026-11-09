// tools/frame-stats.mjs: the frame-time distribution of the per-camera sweep. Synthetic frame times only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FRAME_BUDGET_MS, FRAME_HISTOGRAM_EDGES_MS, SLOW_FRAME_MS, STEADY_SLOW_SHARE, frameDistribution, steadyAt60 } from '../frame-stats.mjs';

const repeat = (value, count) => Array(count).fill(value);

test('a clean 60 Hz run has no slow frames and everything in the first bin', () => {
  const d = frameDistribution(repeat(16.7, 300));
  assert.equal(d.frames, 300);
  assert.deepEqual([d.p50, d.p90, d.p95, d.p99, d.max], [16.7, 16.7, 16.7, 16.7, 16.7]);
  assert.equal(d.slowFrames, 0); assert.equal(d.slowShare, 0); assert.equal(d.missedSlots, 0);
  assert.deepEqual(d.histogram.counts, [300, 0, 0, 0, 0, 0, 0]);
  assert.equal(d.histogram.edgesMs.length + 1, d.histogram.counts.length, 'one more bin than edges');
});

test('late frames are counted by the slots they overran, and land in the right bins', () => {
  // 290 on time, 6 one-slot drops (33.3 ms), 3 two-slot drops (50 ms), one 120 ms stall (seven slots: 120 / 16.67 = 7.2, so six missed).
  const d = frameDistribution([...repeat(16.7, 290), ...repeat(33.3, 6), ...repeat(50, 3), 120]);
  assert.equal(d.frames, 300);
  assert.equal(d.slowFrames, 10);
  assert.equal(d.slowShare, 0.0333);
  assert.equal(d.missedSlots, 6 * 1 + 3 * 2 + 6);
  assert.equal(d.max, 120);
  assert.deepEqual(d.histogram.counts, [290, 0, 0, 6, 3, 0, 1], '<=17.5 | <=20 | <=25 | <=34 | <=51 | <=100 | above');
  assert.equal(d.p99, 50, 'the fourth-slowest of 300 frames');
});

test('a frame exactly on a bin edge belongs to that bin, and exactly 20 ms is not slow', () => {
  const d = frameDistribution([17.5, 20, 20.01]);
  assert.deepEqual(d.histogram.counts.slice(0, 3), [1, 1, 1]);
  assert.equal(d.slowFrames, 1, 'only 20.01 is later than 20 ms');
  assert.equal(SLOW_FRAME_MS, 20);
});

test('values that are not frames are dropped, and an empty run says so with nulls', () => {
  const d = frameDistribution([16.7, 0, -3, NaN, Infinity, undefined, null, '16', 16.7]);
  assert.equal(d.frames, 2);
  const none = frameDistribution([]);
  assert.equal(none.frames, 0); assert.equal(none.p50, null); assert.equal(none.max, null); assert.equal(none.slowShare, null);
  assert.deepEqual(none.histogram.counts, repeat(0, FRAME_HISTOGRAM_EDGES_MS.length + 1));
  assert.equal(frameDistribution(undefined).frames, 0);
});

test('percentiles follow the sorted frames, whatever order they arrive in', () => {
  const d = frameDistribution([5, 1, 4, 2, 3, 10, 9, 8, 7, 6]);
  assert.deepEqual([d.p50, d.p90, d.max], [5, 9, 10]);
});

test('steady at 60 needs the median second at 60 and at most 1% slow frames', () => {
  const clean = frameDistribution(repeat(16.7, 300));
  assert.equal(steadyAt60(60, clean), true);
  assert.equal(steadyAt60(59, clean), false, 'a median second below 60');
  assert.equal(steadyAt60(61, clean), true);
  const threeSlow = frameDistribution([...repeat(16.7, 297), ...repeat(33.3, 3)]);
  assert.equal(threeSlow.slowShare, 0.01);
  assert.equal(steadyAt60(60, threeSlow), true, 'exactly 1% is the limit');
  const fourSlow = frameDistribution([...repeat(16.7, 296), ...repeat(33.3, 4)]);
  assert.equal(steadyAt60(60, fourSlow), false, 'over 1% slow');
  assert.equal(steadyAt60(60, frameDistribution([])), false, 'no frames is not steady');
  assert.equal(steadyAt60(undefined, clean), false);
  assert.equal(STEADY_SLOW_SHARE, 0.01); assert.ok(Math.abs(FRAME_BUDGET_MS - 16.667) < 1e-3);
});
