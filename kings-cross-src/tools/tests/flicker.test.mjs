// tools/flicker.mjs: the two-frame flicker metric of the evidence pack. Synthetic PNGs only: no scene or recording data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { FLICKER_FRACTION_LIMIT, FLICKER_GAP_MS, FLICKER_PIXEL_THRESHOLD, compareFrames, flickerSummary } from '../flicker.mjs';

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const b of body) { crc ^= b; for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
/** A width x height PNG, every pixel `fill` (a channel array), with `edits` ([x, y, channel array]) applied. */
function png(width, height, fill, edits = [], channels = fill.length) {
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < width * height; i++) pixels.set(fill, i * channels);
  for (const [x, y, value] of edits) pixels.set(value, (y * width + x) * channels);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = channels === 3 ? 2 : 6;
  const rows = [];
  for (let y = 0; y < height; y++) rows.push(Buffer.from([0]), pixels.subarray(y * width * channels, (y + 1) * width * channels));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const GREY = [100, 100, 100];
/** `count` pixels along the top row, each moved `delta` levels in red. */
const patch = (count, delta, channel = 0) => Array.from({ length: count }, (_, x) => [x, 0, GREY.map((v, c) => c === channel ? v + delta : v)]);

test('the documented limits: 8 levels of 255, half a thousandth of the frame', () => {
  assert.equal(FLICKER_PIXEL_THRESHOLD, 8);
  assert.equal(FLICKER_FRACTION_LIMIT, 0.0005);
  assert.equal(FLICKER_GAP_MS, 150);
});

test('two identical frames do not flicker', () => {
  const frame = png(100, 100, GREY);
  const result = compareFrames(frame, png(100, 100, GREY));
  assert.deepEqual({ differing: result.differingPixels, fraction: result.fraction, maxDelta: result.maxDelta, bbox: result.bbox, pass: result.pass }, { differing: 0, fraction: 0, maxDelta: 0, bbox: null, pass: true });
  assert.equal(result.width, 100); assert.equal(result.height, 100);
});

test('changed pixels are counted, boxed and held to the limit', () => {
  const frame = png(100, 100, GREY);
  const over = compareFrames(frame, png(100, 100, GREY, [[10, 20, [160, 100, 100]], [40, 70, [100, 100, 30]], [12, 25, [100, 220, 100]], [11, 21, [255, 100, 100]], [13, 22, [0, 0, 0]], [14, 23, [200, 200, 200]]]));
  assert.equal(over.differingPixels, 6);
  assert.equal(over.fraction, 6 / 10000);
  assert.deepEqual(over.bbox, [10, 20, 40, 70]);
  assert.equal(over.maxDelta, 155);
  assert.equal(over.pass, false, '6 of 10000 is over the 5 allowed');
  const edge = compareFrames(frame, png(100, 100, GREY, patch(5, 60)));
  assert.equal(edge.differingPixels, 5);
  assert.equal(edge.fraction, FLICKER_FRACTION_LIMIT);
  assert.equal(edge.pass, true, 'a fraction equal to the limit passes');
  assert.equal(compareFrames(frame, png(100, 100, GREY, patch(6, 60))).pass, false);
});

test('a change of exactly the threshold is noise, one level more is a difference', () => {
  const frame = png(100, 100, GREY);
  assert.equal(compareFrames(frame, png(100, 100, GREY, patch(50, 8))).differingPixels, 0);
  assert.equal(compareFrames(frame, png(100, 100, GREY, patch(50, 9))).differingPixels, 50);
  assert.equal(compareFrames(frame, png(100, 100, GREY, patch(50, -9))).differingPixels, 50, 'darker counts as much as lighter');
  assert.equal(compareFrames(frame, png(100, 100, GREY, patch(50, 1)), { threshold: 0 }).differingPixels, 50, 'an exact comparison counts one level');
  assert.equal(compareFrames(frame, png(100, 100, GREY, patch(50, 30)), { threshold: 30 }).differingPixels, 0);
  assert.equal(compareFrames(frame, png(100, 100, GREY, patch(50, 60)), { limit: 0.5 }).pass, true, 'the limit is a parameter');
});

test('every colour channel counts, the alpha channel does not', () => {
  const frame = png(100, 100, GREY);
  for (const channel of [0, 1, 2]) assert.equal(compareFrames(frame, png(100, 100, GREY, patch(20, 40, channel))).differingPixels, 20, `channel ${channel}`);
  const rgba = png(100, 100, [100, 100, 100, 255]);
  assert.equal(compareFrames(rgba, png(100, 100, [100, 100, 100, 255], patch(20, 0).map(([x, y]) => [x, y, [100, 100, 100, 0]]))).differingPixels, 0);
  assert.equal(compareFrames(rgba, png(100, 100, [100, 100, 100, 255], patch(20, 0).map(([x, y]) => [x, y, [180, 100, 100, 255]]))).differingPixels, 20);
});

test('frames of different sizes or formats cannot be compared, and bad limits are refused', () => {
  const frame = png(100, 100, GREY);
  assert.throws(() => compareFrames(frame, png(100, 99, GREY)), /differ in format/);
  assert.throws(() => compareFrames(frame, png(99, 100, GREY)), /differ in format/);
  assert.throws(() => compareFrames(frame, png(100, 100, [100, 100, 100, 255])), /differ in format/);
  for (const threshold of [-1, 256, 1.5, NaN, '8']) assert.throws(() => compareFrames(frame, frame, { threshold }), RangeError, `threshold ${threshold}`);
  for (const limit of [-0.1, 1.1, NaN]) assert.throws(() => compareFrames(frame, frame, { limit }), RangeError, `limit ${limit}`);
  assert.throws(() => compareFrames(Buffer.from('not a png'), frame));
});

test('the summary names the cameras that flickered and the worst fraction', () => {
  const fine = { file: 'axis-02/a.png', axis: '02', flicker: { pass: true, fraction: 0, differingPixels: 0, bbox: null } };
  const bad = { file: 'axis-02/b.png', axis: '02', flicker: { pass: false, fraction: 0.01, differingPixels: 128, bbox: [1, 2, 3, 4] } };
  const worse = { file: 'axis-01/c-10m-grid.png', axis: '01', flicker: { pass: false, fraction: 0.2, differingPixels: 2560, bbox: [0, 0, 9, 9] } };
  const summary = flickerSummary([fine, { file: 'axis-04/board.png', axis: '04' }, bad, worse]);
  assert.equal(summary.checked, 3, 'a shot without a flicker result was not checked');
  assert.equal(summary.pass, false);
  assert.equal(summary.worstFraction, 0.2);
  assert.deepEqual(summary.failed, [
    { camera: 'axis-02/b.png', axis: '02', differingPixels: 128, fraction: 0.01, bbox: [1, 2, 3, 4] },
    { camera: 'axis-01/c-10m-grid.png', axis: '01', differingPixels: 2560, fraction: 0.2, bbox: [0, 0, 9, 9] }]);
  assert.match(summary.definition, /150 ms.*8\/255.*0\.05%/);
  assert.equal(summary.threshold, FLICKER_PIXEL_THRESHOLD);
  assert.equal(summary.limit, FLICKER_FRACTION_LIMIT);
  const none = flickerSummary([]);
  assert.deepEqual({ checked: none.checked, pass: none.pass, worst: none.worstFraction, failed: none.failed }, { checked: 0, pass: true, worst: 0, failed: [] });
});
