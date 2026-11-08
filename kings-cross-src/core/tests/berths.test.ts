import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnchors, analyseSteps } from '../berths.ts';
import type { RecordingEvent } from '../berths.ts';
import type { AnchorMap, BerthAnchor } from '../anchors.ts';
import type { KxData } from '../osm.ts';

// All geometry, TD traffic and SMART rows are invented; no recorded berth list is a fixture.
function data(nodes: KxData['nodes'] = [[1, 0, 0], [2, 100, 0]], ways: number[][] = [[1, 2]]): KxData {
  return { attribution: 'Synthetic test geometry', origin: { lat: 0, lon: 0 }, nodes,
    rails: ways.map((nodes, i) => ({ id: i + 1, nodes, service: 'main', tunnel: false, bridge: false, layer: 0 })),
    buffers: [], switches: [], signals: [], platforms: [], buildings: [] };
}
function event(kind: string, from?: string, to?: string, t = 0, descr = '1A01', area = 'Y9'): RecordingEvent {
  return { t, e: { kind, area, descr, ...(from ? { from } : {}), ...(to ? { to } : {}) } };
}
function seen(...berths: string[]): RecordingEvent[][] { return [berths.map((b) => event('interpose', undefined, b))]; }
function anchor(map: AnchorMap, berth: string): BerthAnchor {
  const found = map.anchors.find((a) => a.berth === berth);
  assert.ok(found, `expected anchor ${berth}`); return found;
}
function reason(map: AnchorMap, berth: string, expected: string): void {
  assert.equal(map.unmapped.find((u) => u.berth === berth)?.reason, expected);
}
function signal(d: KxData, id: number, ref: string, x: number, z = 0, direction = 'forward'): void {
  d.signals.push({ id, ref, x, z, direction, kinds: ['main'] });
}
function near(actual: number, expected: number): void { assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`); }
function manual(anchors: BerthAnchor[]): AnchorMap { return { area: 'Y9', sources: [], anchors, unmapped: [] }; }
function at(berth: string, from: number, to: number, t: number, point: [number, number], kind: BerthAnchor['kind'] = 'signal'): BerthAnchor {
  return { berth, from, to, t, point, kind, errorM: 5, evidence: 'synthetic' };
}

test('berths: platform partners share the correct polygon-adjacent buffer on distinct tracks', () => {
  const d = data([[1, 0, -400], [2, 0, -200], [3, 40, -400], [4, 40, -200]], [[1, 2], [3, 4]]);
  d.buffers = [{ id: 2, x: 0, z: -200 }, { id: 4, x: 40, z: -200 }];
  d.platforms = [
    { id: 11, ref: '1', pts: [[42, -310], [47, -310], [47, -200], [42, -200]] },
    { id: 12, ref: '4', pts: [[2, -310], [7, -310], [7, -200], [2, -200]] },
  ];
  const map = buildAnchors(d, seen('1001', 'B001', '1004', 'B004'), []);
  for (const [berth, x, platform] of [['1001', 40, '1'], ['B001', 40, '1'], ['1004', 0, '4'], ['B004', 0, '4']] as const) {
    const a = anchor(map, berth); assert.equal(a.kind, 'platform'); assert.equal(a.platform, platform);
    near(a.point[0], x); near(a.point[1], -200); assert.equal(a.to, x === 0 ? 2 : 4);
  }
  assert.notEqual(anchor(map, '1001').to, anchor(map, '1004').to);
});

test('berths: YA digit refs match exactly and foreign signal prefixes do not', () => {
  const d = data(); signal(d, 11, 'YA 2345', 20); signal(d, 12, 'YA2346', 30);
  signal(d, 13, 'NL 2347', 40); signal(d, 14, 'AF 2348', 50); signal(d, 15, 'WH 2349', 60);
  const map = buildAnchors(d, seen('2345', '2346', '2347', '2348', '2349', '345'), []);
  near(anchor(map, '2345').point[0], 20); near(anchor(map, '2346').point[0], 30);
  for (const b of ['2347', '2348', '2349', '345']) reason(map, b, 'no-evidence');
});

test('berths: forward and backward signals follow OSM way order', () => {
  const d = data([[1, 100, 0], [2, 0, 0]]); signal(d, 11, 'YA 2345', 75); signal(d, 12, 'YA 2346', 25, 0, 'backward');
  const map = buildAnchors(d, seen('2345', '2346'), []);
  const f = anchor(map, '2345'); const b = anchor(map, '2346');
  assert.deepEqual([f.from, f.to], [1, 2]); assert.deepEqual([b.from, b.to], [2, 1]); near(f.t, .25); near(b.t, .25);
});

test('berths: signal at a split endpoint keeps its containing way direction', () => {
  const d = data([[1, 0, 0], [2, 100, 0], [3, 200, 0]], [[1, 2], [2, 3]]);
  signal(d, 2, 'YA 2345', 100, 0, 'forward');
  const a = anchor(buildAnchors(d, seen('2345'), []), '2345');
  assert.ok(d.nodes.find((n) => n[0] === a.to)![1] > d.nodes.find((n) => n[0] === a.from)![1]);
  near(a.point[0], 100);
});

test('berths: platform 1004 outranks a physically separate starter signal without duplicate identity', () => {
  const d = data([[1, 0, -400], [2, 0, -200]]);
  d.buffers = [{ id: 2, x: 0, z: -200 }];
  d.platforms = [{ id: 3, ref: '4', pts: [[2, -310], [7, -310], [7, -200], [2, -200]] }];
  signal(d, 4, 'YA 1004', 0, -390, 'backward');
  const map = buildAnchors(d, seen('1004'), []);
  assert.equal(map.anchors.filter((a) => a.berth === '1004').length, 1);
  assert.equal(anchor(map, '1004').kind, 'platform'); near(anchor(map, '1004').point[1], -200);
  assert.equal(map.unmapped.some((u) => u.berth === '1004'), false);
});

function bent(): KxData {
  const d = data([[1, 0, 0], [2, 100, 0], [3, 100, 100]], [[1, 2, 3]]);
  signal(d, 1, 'YA 2100', 0); signal(d, 3, 'YA 2102', 100, 100); return d;
}

test('berths: unique step chain interpolates along the bent graph rather than the chord', () => {
  const d = bent(); const map = buildAnchors(d, [[event('step', '2100', '2101'), event('step', '2101', '2102')]], []);
  assert.equal(anchor(map, '2101').kind, 'inferred'); assert.deepEqual(anchor(map, '2101').point, [100, 0]);
});

test('berths: step-chain residence medians weight graph distance and ignore an outlier', () => {
  const d = bent();
  const recording = (a: number, b: number): RecordingEvent[] => [event('interpose', undefined, '2100'), event('step', '2100', '2101', a), event('step', '2101', '2102', a + b)];
  const map = buildAnchors(d, [recording(10000, 30000), recording(10000, 30000), recording(900000, 30000)], []);
  assert.deepEqual(anchor(map, '2101').point, [50, 0]);
});

test('berths: branched observed chains remain unplaced', () => {
  const d = bent();
  const map = buildAnchors(d, [[event('step', '2100', '2101'), event('step', '2101', '2102'), event('step', '2101', '2199')]], []);
  reason(map, '2101', 'no-evidence');
});

test('berths: outside SMART endpoints propagate only until strong or in-network evidence', () => {
  const d = data(); signal(d, 10, 'YA 2202', 50);
  const rows = [{ TD: 'Y9', FROMBERTH: '2200', TOBERTH: '2201', STANOX: '54238' },
    { TD: 'Y9', FROMBERTH: '2204', TOBERTH: '2205', STANOX: '54311', PLATFORM: '' }];
  const map = buildAnchors(d, [[event('step', '2201', '2202'), event('step', '2202', '2203'), event('step', '2200', '2204'), event('step', '2204', '2206')]], rows);
  reason(map, '2200', 'outside-network'); reason(map, '2201', 'outside-network');
  assert.equal(anchor(map, '2202').kind, 'signal');
  assert.notEqual(map.unmapped.find((u) => u.berth === '2203')?.reason, 'outside-network');
  assert.notEqual(map.unmapped.find((u) => u.berth === '2206')?.reason, 'outside-network');
});

test('berths: missing or unknown SMART location is no evidence of outside geography', () => {
  const map = buildAnchors(data(), [[event('step', '2300', '2301')]], [{ TD: 'Y9', FROMBERTH: '2300', TOBERTH: '2301', STANOX: '' }]);
  reason(map, '2300', 'no-evidence'); reason(map, '2301', 'no-evidence');
});

test('berths: every event berth is inventoried exactly once while foreign areas are ignored', () => {
  const events = [event('interpose', undefined, '2400'), event('step', '2400', '2401'), event('cancel', '2401'), event('step', '2402', '2402'), event('cancel', '2403'), event('interpose', undefined, '2404'), event('interpose', undefined, '9999', 0, '1A01', 'XX')];
  const map = buildAnchors(data(), [events], [], { sources: ['synthetic recording'] });
  assert.deepEqual(map.sources, ['synthetic recording']); assert.equal(map.area, 'Y9');
  assert.deepEqual(map.unmapped.map((u) => [u.berth, u.seen]).sort(), [['2400', 1], ['2401', 1], ['2402', 1], ['2403', 0], ['2404', 0]]);
  assert.equal(new Set([...map.anchors, ...map.unmapped].map((a) => a.berth)).size, 5);
});

test('berths: four-star events are inventoried but never establish a track chain', () => {
  const d = bent(); const map = buildAnchors(d, [[event('step', '2100', '2101', 0, '****'), event('step', '2101', '2102', 1000, '****')]], []);
  reason(map, '2101', 'no-evidence'); assert.equal(map.unmapped.find((u) => u.berth === '2101')?.seen, 2);
  assert.equal(analyseSteps(d, [[event('step', '2100', '2102', 1000, '****')]], map).length, 0);
});

test('berths: disparate duplicated YA signals produce a conflict rather than an arbitrary anchor', () => {
  const d = data([[1, 0, 0], [2, 1000, 0]]); signal(d, 3, 'YA 2500', 0); signal(d, 4, 'YA2500', 1000);
  const map = buildAnchors(d, seen('2500'), []); reason(map, '2500', 'conflict'); assert.equal(map.anchors.some((a) => a.berth === '2500'), false);
});

test('berths: analysis reports disconnected graph endpoints', () => {
  const d = data([[1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 300, 0]], [[1, 2], [3, 4]]);
  const checks = analyseSteps(d, [[event('step', 'A', 'B')]], manual([at('A', 1, 2, .5, [50, 0]), at('B', 3, 4, .5, [250, 0])]));
  assert.equal(checks.length, 1); assert.equal(checks[0]!.lengthM, null); assert.ok(checks[0]!.issues.some((s) => /disconnect/i.test(s)));
});

test('berths: analysis uses fractional same-edge distance, residence seconds and the speed limit', () => {
  const d = data(); const map = manual([at('A', 1, 2, .1, [10, 0]), at('B', 1, 2, .9, [90, 0])]);
  const checks = analyseSteps(d, [[event('interpose', undefined, 'A'), event('step', 'A', 'B', 1000)]], map);
  const c = checks[0]!; near(c.lengthM!, 80); near(c.seconds!, 1); near(c.speedMps!, 80); assert.equal(c.count, 1); assert.equal(c.timed, 1);
  assert.ok(c.issues.some((s) => /speed|50/.test(s)));
});

test('berths: analysis does not invent durations or speeds from a lone step', () => {
  const d = data(); const c = analyseSteps(d, [[event('step', 'A', 'B', 1000)]], manual([at('A', 1, 2, 0, [0, 0]), at('B', 1, 2, 1, [100, 0])]))[0]!;
  assert.equal(c.seconds, null); assert.equal(c.speedMps, null); assert.equal(c.timed, 0); near(c.lengthM!, 100);
});

test('berths: backwards movement is flagged but a platform departure may turn back', () => {
  const d = data();
  const recording = [[event('step', 'A', 'B')]];
  const b = at('B', 2, 1, .9, [10, 0]);
  const regular = analyseSteps(d, recording, manual([at('A', 1, 2, .9, [90, 0]), b]))[0]!;
  assert.equal(regular.reversal, true); assert.ok(regular.issues.some((s) => /revers/i.test(s)));
  const platform = analyseSteps(d, recording, manual([at('A', 1, 2, .9, [90, 0], 'platform'), b]))[0]!;
  assert.equal(platform.issues.some((s) => /revers/i.test(s)), false);
});

test('berths: timing state stays within one recording and cancellation clears occupancy', () => {
  const d = data();
  const recordings = [
    [event('interpose', undefined, 'A')],
    [event('step', 'A', 'B', 1000)],
    [event('interpose', undefined, 'A'), event('cancel', 'A', undefined, 1000), event('step', 'A', 'B', 2000)],
    [event('interpose', undefined, 'A'), event('step', 'A', 'B', 5000)],
  ];
  const c = analyseSteps(d, recordings, manual([at('A', 1, 2, .1, [10, 0]), at('B', 1, 2, .9, [90, 0])]))[0]!;
  assert.equal(c.count, 3); assert.equal(c.timed, 1); near(c.seconds!, 5); near(c.speedMps!, 16);
});

test('berths: any timed traversal over the speed limit is flagged even when median speed is slow', () => {
  const d = data();
  const recordings = [100, 10000, 10000].map((time) => [event('interpose', undefined, 'A'), event('step', 'A', 'B', time)]);
  const c = analyseSteps(d, recordings, manual([at('A', 1, 2, .1, [10, 0]), at('B', 1, 2, .9, [90, 0])]))[0]!;
  assert.equal(c.count, 3); assert.equal(c.timed, 3); near(c.seconds!, 10); near(c.speedMps!, 8);
  assert.ok(c.issues.some((s) => /speed|50/.test(s)), 'fast observation must survive median aggregation');
});

test('berths: zero-time movement is flagged while speed remains unknown and finite', () => {
  const d = data();
  const c = analyseSteps(d, [[event('interpose', undefined, 'A'), event('step', 'A', 'B')]], manual([at('A', 1, 2, .1, [10, 0]), at('B', 1, 2, .9, [90, 0])]))[0]!;
  near(c.lengthM!, 80); assert.equal(c.seconds, 0); assert.equal(c.speedMps, null);
  assert.ok(c.issues.some((s) => /zero.?time|co.timestamp/i.test(s)));
});

test('berths: a missing terminal leaves only that platform unplaced', () => {
  const d = data([[1, 70, -400], [2, 70, -200]]);
  d.buffers = [{ id: 2, x: 70, z: -200 }];
  d.platforms = [
    { id: 11, ref: '1', pts: [[72, -310], [77, -310], [77, -200], [72, -200]] },
    { id: 12, ref: '4', pts: [[2, -310], [7, -310], [7, -200], [2, -200]] },
  ];
  const map = buildAnchors(d, seen('1001', '1004'), []);
  const a = anchor(map, '1001'); assert.equal(a.kind, 'platform'); assert.equal(a.platform, '1');
  assert.deepEqual(a.point, [70, -200]); reason(map, '1004', 'no-evidence');
});

test('berths: inference between disconnected anchors reports a conflict for the intermediate berth', () => {
  const d = data([[1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 300, 0]], [[1, 2], [3, 4]]);
  signal(d, 1, 'YA 2700', 0); signal(d, 4, 'YA 2702', 300);
  const map = buildAnchors(d, [[event('step', '2700', '2701'), event('step', '2701', '2702')]], []);
  reason(map, '2701', 'conflict'); assert.equal(map.anchors.some((a) => a.berth === '2701'), false);
  assert.equal(anchor(map, '2700').kind, 'signal'); assert.equal(anchor(map, '2702').kind, 'signal');
});

test('berths: same-edge inference uses fractional anchor positions instead of full-edge endpoints', () => {
  const d = data(); signal(d, 11, 'YA 2800', 10); signal(d, 12, 'YA 2802', 70);
  const a = anchor(buildAnchors(d, [[event('step', '2800', '2801'), event('step', '2801', '2802')]], []), '2801');
  assert.equal(a.kind, 'inferred'); near(a.point[0], 40); near(a.point[1], 0);
  assert.deepEqual([a.from, a.to], [1, 2]); near(a.t, .4);
});

test('berths: platform dwell does not weight inferred travel distances', () => {
  const d = data([[1, 0, -400], [2, 0, -200]]);
  d.buffers = [{ id: 2, x: 0, z: -200 }];
  d.platforms = [{ id: 3, ref: '1', pts: [[2, -310], [7, -310], [7, -200], [2, -200]] }];
  signal(d, 1, 'YA 2902', 0, -400, 'backward');
  const recordings = [[event('interpose', undefined, '1001'), event('step', '1001', '2901', 900000), event('step', '2901', '2902', 910000)]];
  const a = anchor(buildAnchors(d, recordings, []), '2901');
  assert.equal(a.kind, 'inferred'); assert.deepEqual(a.point, [0, -300]);
  assert.match(a.evidence, /platform dwell/i);
});
