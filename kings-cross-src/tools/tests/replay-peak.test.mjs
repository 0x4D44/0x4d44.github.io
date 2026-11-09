// tools/replay-peak.mjs: restarting a recording at its busy stretch, and finding that stretch. Synthetic recordings only: the real one is private.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createReplayFeed, parseRecording } from '../../web/src/feed.ts';
import { BUSY_FLOOR_SHARE, SCAN_SPEED, peakWindow, windowRecording } from '../replay-peak.mjs';

const row = (t, e) => JSON.stringify({ t, e: { area: 'Y9', ...e } });
const SCRIPT = [
  row(1000, { kind: 'interpose', descr: '1A01', to: 'B1' }),
  row(2000, { kind: 'step', descr: '1A01', from: 'B1', to: 'B2', time: 2000 }),
  row(3000, { kind: 'interpose', descr: '2B02', to: 'B1' }),
  row(4000, { kind: 'sclass', msgType: 'SF', address: '0A', data: '5f' }),
  row(5000, { kind: 'sclass', msgType: 'SG', address: '10', data: '01020304' }),
  row(6000, { kind: 'cancel', descr: '2B02', from: 'B1' }),
  row(7000, { kind: 'step', descr: '1A01', from: 'B2', to: 'B3', time: 7000 }),
  row(8000, { kind: 'interpose', descr: '3C03', to: 'B4' }),
  row(9000, { kind: 'sclass', msgType: 'SF', address: '0A', data: 'ff' }),
];
const text = lines => `${lines.join('\n')}\n`;
const rowsOf = output => output.split('\n').filter(Boolean).map(line => JSON.parse(line));

test('every row before the instant becomes one snapshot, and every row from it on is kept exactly as recorded', () => {
  const result = windowRecording(text(SCRIPT), 6500);
  const lines = result.text.split('\n').filter(Boolean);
  assert.equal(lines.length, 1 + 3);
  assert.deepEqual(lines.slice(1), SCRIPT.slice(6), 'rows 7000, 8000 and 9000 are byte for byte what was recorded');
  const snapshot = JSON.parse(lines[0]);
  assert.equal(snapshot.t, 6500, 'the snapshot is stamped at the instant, so the replay clock starts there');
  assert.equal(snapshot.e.kind, 'snapshot'); assert.equal(snapshot.e.area, 'Y9');
  assert.deepEqual(snapshot.e.berths, { B2: '1A01' }, '1A01 stepped B1 to B2; 2B02 was interposed at B1 and cancelled; B1 is empty');
  assert.deepEqual({ rowsBefore: result.rowsBefore, rowsAfter: result.rowsAfter, areas: result.areas, berths: result.berths }, { rowsBefore: 6, rowsAfter: 3, areas: ['Y9'], berths: { Y9: 1 } });
});

test('the signal bytes at the instant ride in the snapshot: single-byte updates and four-byte refreshes, the last value of each address', () => {
  const { e } = rowsOf(windowRecording(text(SCRIPT), 6500).text)[0];
  assert.deepEqual(e.sclass, { addresses: 5, data: { '0A': '5f', 10: '01', 11: '02', 12: '03', 13: '04' } });
  const later = rowsOf(windowRecording(text(SCRIPT), 9500).text)[0].e;
  assert.equal(later.sclass.data['0A'], 'ff', 'a later update of the same address wins');
  assert.equal(rowsOf(windowRecording(text([SCRIPT[0], SCRIPT[1]]), 2500).text)[0].e.sclass, undefined, 'no signal bytes seen, none claimed');
});

test('a row stamped exactly at the instant is after it, and the berth picture follows the page\'s own rule for cancels', () => {
  const at7000 = windowRecording(text(SCRIPT), 7000);
  assert.equal(at7000.rowsBefore, 6); assert.equal(at7000.rowsAfter, 3);
  assert.deepEqual(rowsOf(at7000.text)[0].e.berths, { B2: '1A01' }, 'the step at 7000 is not yet applied');
  // A cancel that names another origin berth leaves the description where it is; one with no origin removes it wherever it is.
  const wrongOrigin = windowRecording(text([row(1, { kind: 'interpose', descr: 'X1', to: 'P1' }), row(2, { kind: 'cancel', descr: 'X1', from: 'P9' })]), 10);
  assert.deepEqual(rowsOf(wrongOrigin.text)[0].e.berths, { P1: 'X1' });
  const anyOrigin = windowRecording(text([row(1, { kind: 'interpose', descr: 'X1', to: 'P1' }), row(2, { kind: 'cancel', descr: 'X1', from: '' })]), 10);
  assert.deepEqual(rowsOf(anyOrigin.text)[0].e.berths, {});
  // A step empties its origin whoever is there, and the destination takes the stepped description.
  const stepped = windowRecording(text([row(1, { kind: 'interpose', descr: 'X1', to: 'P1' }), row(2, { kind: 'interpose', descr: 'Z9', to: 'P2' }), row(3, { kind: 'step', descr: 'X1', from: 'P1', to: 'P2' })]), 10);
  assert.deepEqual(rowsOf(stepped.text)[0].e.berths, { P2: 'X1' });
});

test('rows out of order are sorted as the page sorts them, and a second TD area gets its own snapshot', () => {
  const shuffled = [SCRIPT[8], SCRIPT[2], SCRIPT[0], SCRIPT[6], SCRIPT[1], SCRIPT[5], SCRIPT[3], SCRIPT[7], SCRIPT[4]];
  assert.equal(windowRecording(text(shuffled), 6500).text, windowRecording(text(SCRIPT), 6500).text);
  const two = windowRecording(text([...SCRIPT, JSON.stringify({ t: 500, e: { kind: 'interpose', area: 'Z1', descr: '9Z99', to: 'Q1' } })]), 6500);
  assert.deepEqual(two.areas, ['Y9', 'Z1']);
  assert.deepEqual(rowsOf(two.text).slice(0, 2).map(r => [r.e.area, r.t]), [['Y9', 6500], ['Z1', 6500]]);
  assert.deepEqual(rowsOf(two.text).slice(0, 2).map(r => r.e.berths), [{ B2: '1A01' }, { Q1: '9Z99' }], 'each area has only its own berths');
  assert.deepEqual(two.berths, { Y9: 1, Z1: 1 });
});

test('a window before the first row changes nothing; one after the last row leaves only the snapshot', () => {
  const unchanged = windowRecording(text(SCRIPT), 10);
  assert.equal(unchanged.text, text(SCRIPT)); assert.equal(unchanged.rowsBefore, 0);
  const only = windowRecording(text(SCRIPT), 99_999);
  const rows = rowsOf(only.text);
  assert.equal(rows.length, 1); assert.equal(rows[0].e.kind, 'snapshot'); assert.deepEqual(rows[0].e.berths, { B3: '1A01', B4: '3C03' });
  assert.equal(windowRecording('', 5).text, '');
});

test('input that is not a recording is refused, with the line number', () => {
  assert.throws(() => windowRecording(text([SCRIPT[0], 'not json']), 5), /recording line 2 is not JSON/);
  assert.throws(() => windowRecording(text([JSON.stringify({ t: 'soon', e: {} })]), 5), /recording line 1 has no time and event/);
  assert.throws(() => windowRecording(text([JSON.stringify({ t: 5 })]), 5), /recording line 1 has no time and event/);
  assert.throws(() => windowRecording(text(SCRIPT), NaN), /finite/);
  assert.throws(() => windowRecording(text(SCRIPT), undefined), /finite/);
});

test('the page\'s own parser and replay feed accept the windowed recording and place the train at its berth at once', () => {
  const rows = parseRecording(windowRecording(text(SCRIPT), 6500).text);
  assert.equal(rows[0].t, 6500); assert.equal(rows.length, 4);
  const applied = [];
  const feed = createReplayFeed(rows, 30, { apply: event => applied.push(event), advance() {} }, () => {});
  assert.deepEqual(applied.map(event => event.kind), ['snapshot', 'interpose'], 'the snapshot, then one first observation per described berth, before any time has passed');
  assert.deepEqual([applied[1].descr, applied[1].to], ['1A01', 'B2']);
  assert.equal(feed.timeMs(), 6500, 'the replay clock starts at the instant');
});

// ---- peakWindow -------------------------------------------------------------------------------------------------------------------

/** One sample every 30 s of replay clock from 0, with the trains drawn at each. */
const series = shown => shown.map((count, i) => ({ clockMs: i * 30_000, shown: count }));
const MINUTES = 60_000;

test('the busy window is the one that stays busy: a lone spike does not beat a plateau', () => {
  const shown = Array(200).fill(2);
  shown[20] = 30; // a one-sample spike
  for (let i = 100; i < 160; i++) shown[i] = 12; // a plateau of 30 minutes
  const window = peakWindow(series(shown), 20 * MINUTES);
  assert.ok(window.startMs >= 100 * 30_000 && window.endMs <= 159 * 30_000, `the window lies on the plateau, not at the spike: ${window.startMs}..${window.endMs}`);
  assert.equal(window.windowMs, 20 * MINUTES);
  assert.deepEqual([window.minShown, window.p25Shown, window.medianShown, window.maxShown], [12, 12, 12, 12]);
  assert.equal(window.samples, 41, 'a 20 minute window at one sample per 30 s, both ends included');
});

test('a dip inside a window disqualifies it: the quietest sample is what counts, not the average', () => {
  // A busier stretch with one near-empty moment in its middle, then a steady slightly quieter one. Every page load starts at the window start,
  // so a window that dips to 3 trains is not a busy peak however high its average.
  const shown = [...Array(5).fill(12), 3, ...Array(5).fill(12), ...Array(20).fill(10)];
  const window = peakWindow(series(shown), 5 * MINUTES);
  assert.equal(window.minShown, 10);
  assert.ok(window.startMs > 5 * 30_000, `the window starts after the dip at sample 5, at sample ${window.startMs / 30_000}`);
});

test('a window never runs past the last sample, and the earliest of equal windows wins', () => {
  const rising = peakWindow(series(Array.from({ length: 100 }, (_, i) => i)), 10 * MINUTES);
  assert.equal(rising.endMs, 99 * 30_000, 'the best window of a rising series ends at the end of the recording');
  assert.equal(rising.startMs, 99 * 30_000 - 10 * MINUTES);
  assert.equal(peakWindow(series(Array(50).fill(5)), 10 * MINUTES).startMs, 0, 'a flat series: the first window');
});

test('a recording shorter than the window is used whole', () => {
  const window = peakWindow(series([3, 4, 5, 6]), 60 * MINUTES);
  assert.equal(window.startMs, 0); assert.equal(window.endMs, 3 * 30_000); assert.equal(window.windowMs, 3 * 30_000);
  assert.deepEqual([window.minShown, window.p25Shown, window.medianShown, window.meanShown, window.maxShown], [3, 3, 4, 4.5, 6], 'four samples: the median is the lower middle one, and the mean is exact');
  const single = peakWindow([{ clockMs: 5, shown: 7 }], 60 * MINUTES);
  assert.deepEqual([single.startMs, single.endMs, single.medianShown, single.samples], [5, 5, 7, 1]);
});

test('unsorted and non-finite samples are handled, and nothing to measure is null', () => {
  const messy = [{ clockMs: 60_000, shown: 9 }, { clockMs: 0, shown: 9 }, { clockMs: 30_000, shown: 9 }, { clockMs: NaN, shown: 99 }, { clockMs: 90_000, shown: undefined }, null];
  const window = peakWindow(messy, 60_000);
  assert.deepEqual([window.startMs, window.endMs, window.minShown, window.maxShown], [0, 60_000, 9, 9]);
  assert.equal(peakWindow([], 1000), null); assert.equal(peakWindow(undefined, 1000), null); assert.equal(peakWindow([{ clockMs: NaN, shown: 1 }], 1000), null);
});

test('the busy floor is three quarters of the window median, never below one', () => {
  assert.equal(BUSY_FLOOR_SHARE, .75);
  assert.equal(peakWindow(series(Array(10).fill(12)), MINUTES).busyFloor, 9);
  assert.equal(peakWindow(series(Array(10).fill(1)), MINUTES).busyFloor, 1);
  assert.equal(peakWindow(series(Array(10).fill(0)), MINUTES).busyFloor, 1, 'an empty replay still has a floor of one: nothing passes as busy');
  assert.equal(peakWindow(series(Array(10).fill(12)), MINUTES, { floorShare: .5 }).busyFloor, 6);
  assert.ok(SCAN_SPEED > 30);
});
