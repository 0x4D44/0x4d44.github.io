import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditBerths, buildAnchors, analyseSteps, leaveOneOut } from '../berths.ts';
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

test('berths: outside SMART endpoints retain anchored boundaries while station-only components become outside', () => {
  const d = data(); signal(d, 10, 'YA 2202', 50);
  const rows = [{ TD: 'Y9', FROMBERTH: '2200', TOBERTH: '2201', STANOX: '54238' },
    { TD: 'Y9', FROMBERTH: '2204', TOBERTH: '2205', STANOX: '54311', PLATFORM: '' }];
  const map = buildAnchors(d, [[event('step', '2201', '2202'), event('step', '2202', '2203'), event('step', '2200', '2204'), event('step', '2204', '2206')]], rows);
  reason(map, '2200', 'outside-network'); reason(map, '2201', 'outside-network');
  assert.equal(anchor(map, '2202').kind, 'signal');
  assert.notEqual(map.unmapped.find((u) => u.berth === '2203')?.reason, 'outside-network');
  reason(map, '2206', 'outside-network');
  assert.match(map.unmapped.find((u) => u.berth === '2206')!.detail, /observed.*component/i);
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

function throat(): KxData {
  const d = data([[1, 20, -1200], [2, 20, -400], [3, 40, -200], [4, 0, -200]], [[1, 2, 3], [2, 4]]);
  d.buffers = [{ id: 3, x: 40, z: -200 }, { id: 4, x: 0, z: -200 }];
  d.platforms = [
    { id: 11, ref: '0', pts: [[42, -310], [47, -310], [47, -200], [42, -200]] },
    { id: 12, ref: '1', pts: [[2, -310], [7, -310], [7, -200], [2, -200]] },
  ];
  return d;
}
function arrivals(berth = '2900'): RecordingEvent[][] { return [[event('step', berth, '1000'), event('step', berth, '1001')]]; }

test('berths: platform fan-out arrival uses the shared northern track with clearance and faces south', () => {
  const a = anchor(buildAnchors(throat(), arrivals(), [], { calibrate: false }), '2900');
  assert.deepEqual(a.point, [20, -425]); assert.deepEqual([a.from, a.to], [1, 2]);
  assert.match(a.evidence, /Topology platform fan-out/); assert.match(a.evidence, /25 m set-back/);
});

test('berths: platform fan-in departure uses the shared northern track and faces north', () => {
  const a = anchor(buildAnchors(throat(), [[event('step', '1000', '2901'), event('step', '1001', '2901')]], [], { calibrate: false }), '2901');
  assert.deepEqual(a.point, [20, -425]); assert.deepEqual([a.from, a.to], [2, 1]);
  assert.match(a.evidence, /Topology platform fan-in/);
});

test('berths: topology snaps to an unreferenced main signal facing along the arrival route', () => {
  const d = throat(); d.signals.push({ id: 90, x: 20, z: -440, direction: 'forward', kinds: ['main'] });
  const a = anchor(buildAnchors(d, arrivals(), [], { calibrate: false }), '2900');
  assert.deepEqual(a.point, [20, -440]); assert.deepEqual([a.from, a.to], [1, 2]);
  assert.equal(a.errorM, 15); assert.match(a.evidence, /matched unreferenced main signal/);
});

test('berths: topology rejects unclassified, protection-only, foreign-referenced and wrongly facing signals', () => {
  for (const candidate of [
    { id: 90, x: 20, z: -430, direction: 'forward', kinds: [] },
    { id: 90, x: 20, z: -430, direction: 'forward', kinds: ['train_protection'] },
    { id: 90, x: 20, z: -430, direction: 'forward', kinds: ['main'], ref: 'NL 9998' },
    { id: 90, x: 20, z: -430, direction: 'backward', kinds: ['main'] },
  ]) {
    const d = throat(); d.signals.push(candidate);
    const a = anchor(buildAnchors(d, arrivals(), [], { calibrate: false }), '2900');
    assert.deepEqual(a.point, [20, -425], JSON.stringify(candidate)); assert.equal(a.kind, 'inferred');
  }
});

function junctionFan(): { d: KxData; recordings: RecordingEvent[][] } {
  const d = throat();
  // The two referenced signals bound distinct approach tracks that share the northern junction.
  signal(d, 80, 'YA 3200', 30, -300);
  signal(d, 81, 'YA 3201', 10, -300);
  // Topology may identify this signal, but that inferred identity is only a sensitivity check.
  d.signals.push({ id: 90, x: 20, z: -450, direction: 'forward', kinds: ['main'] });
  const recordings = [[event('step', '2900', '3200'), event('step', '2900', '3201'), event('interpose', undefined, '3202')]];
  signal(d, 82, 'YA 3202', 20, -800);
  return { d, recordings };
}

test('berths: topology junction fan-out stays in its family when chain calibration fails', () => {
  const { d, recordings } = junctionFan();
  const trials = leaveOneOut(d, recordings, []);
  const independentFailures = trials.filter((t) => t.independent && !t.trusted);
  assert.ok(independentFailures.length > 0, 'the referenced target signals provide a chain-family calibration failure');
  assert.ok(independentFailures.some((t) => t.method === 'chain'));

  const sensitivity = trials.find((t) => t.signalId === 90);
  assert.ok(sensitivity, 'the topology-identified signal gets a held-out sensitivity trial');
  assert.equal(sensitivity.independent, false);
  assert.equal(sensitivity.placed, true);
  assert.equal(sensitivity.method, 'topology');
  near(sensitivity.distanceM!, 25);
  assert.equal(sensitivity.trusted, false);
  assert.match(sensitivity.detail, /sensitivity check only, not an independent oracle/);

  const calibrated = buildAnchors(d, recordings, []);
  const junction = anchor(calibrated, '2900');
  assert.equal(junction.kind, 'signal');
  assert.match(junction.evidence, /Topology junction fan-out/);
});

test('berths: a leave-one-out error of twenty metres exceeds the fifteen-metre trust boundary', () => {
  const d = throat(); signal(d, 90, 'YA 2900', 20, -445);
  const trial = leaveOneOut(d, [arrivals()[0]!], []).find((t) => t.signalId === 90);
  assert.ok(trial, 'the referenced signal gets a held-out trial');
  assert.equal(trial.independent, true);
  assert.equal(trial.placed, true);
  near(trial.distanceM!, 20);
  assert.equal(trial.directionOk, true);
  assert.equal(trial.trusted, false);
});

test('berths: audit counts only same-area SMART evidence and reports the nearest observed anchor path', () => {
  const d = data([[1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 300, 0], [5, 400, 0]], [[1, 2, 3, 4, 5]]);
  signal(d, 90, 'YA 6800', 20);
  signal(d, 91, 'YA 6891', 220);
  signal(d, 92, 'YA 6892', 400);
  const recordings = [
    [event('interpose', undefined, '6800', 0), event('step', '6800', '6801', 1000),
      event('step', '6801', '6802', 3000), event('step', '6802', '6803', 4000, '****'), event('interpose', undefined, '6804')],
    [event('interpose', undefined, '6800', 0), event('step', '6800', '6801', 1000),
      event('step', '6801', '6802', 3000), event('step', '6802', '6803', 4000, '****')],
  ];
  const smart = [
    { TD: 'Y9', FROMBERTH: '6801', TOBERTH: '6802', STANME: 'LOCAL STATION' },
    { TD: 'Y9', FROMBERTH: '6801', TOBERTH: '6802', STANME: 'LOCAL STATION' },
    { TD: 'Y9', FROMBERTH: '6802', TOBERTH: '6801', STANME: 'REVERSE ASSOCIATION' },
    { TD: 'Y9', FROMBERTH: '6802', TOBERTH: '', STANME: 'ONE-SIDED ASSOCIATION' },
    { TD: 'XX', FROMBERTH: '6801', TOBERTH: '6802', STANME: 'FOREIGN STATION' },
  ];
  const map = buildAnchors(d, recordings, smart, { calibrate: false });
  const audits = auditBerths(d, recordings, smart, map);
  const audit = audits.find((a) => a.berth === '6802');
  assert.ok(audit, 'the non-outside unplaced berth appears in the audit');
  assert.equal(audit.reason, 'no-evidence');
  assert.equal(audit.cause, 'one-sided-chain');
  assert.equal(audit.smartPairs, 2, 'duplicate directed pairs count once while the reverse pair remains distinct');
  assert.deepEqual(audit.smartLocations, ['LOCAL STATION', 'ONE-SIDED ASSOCIATION', 'REVERSE ASSOCIATION']);
  assert.equal(audit.observedSteps, 2, 'placeholder steps do not count as train movement');
  assert.equal(audit.timedSteps, 2);
  assert.deepEqual(audit.nearestAnchor, { berth: '6800', steps: 2 });
  assert.equal(audit.nearbySignals, 2, 'YA refs within 250 graph metres of the nearest anchor count');
  assert.match(audit.detail, /not a position estimate for this berth/);
  assert.match(audit.detail, /YA 6800, YA 6891/);
  assert.doesNotMatch(audit.detail, /YA 6892/);
  assert.doesNotMatch(audit.detail, /FOREIGN STATION/);

  const noSteps = audits.find((a) => a.berth === '6804');
  assert.ok(noSteps, 'an interposed but unstepped berth appears in the audit');
  assert.equal(noSteps.cause, 'no-train-steps');
  assert.equal(noSteps.observedSteps, 0);
  assert.equal(noSteps.nearestAnchor, undefined);
  assert.equal(noSteps.nearbySignals, 0);
});

function branchFixture(second = 30): { d: KxData; recordings: RecordingEvent[][] } {
  const d = data([[1, 0, 0], [2, 1000, 0]]);
  signal(d, 11, 'YA 3000', 10); signal(d, 12, 'YA 3001', second); signal(d, 13, 'YA 3003', 200);
  return { d, recordings: [[event('step', '3000', '3002'), event('step', '3001', '3002'), event('step', '3002', '3003')]] };
}

test('berths: bounded branching chains place a berth only when directed graph estimates agree', () => {
  const { d, recordings } = branchFixture();
  const a = anchor(buildAnchors(d, recordings, [], { calibrate: false }), '3002');
  near(a.point[0], 115); near(a.point[1], 0); assert.match(a.evidence, /2 bounding route estimates agree/);
});

test('berths: an unbounded observed branch prevents branching placement', () => {
  const { d, recordings } = branchFixture(); recordings[0]!.push(event('step', '3002', '3099'));
  const map = buildAnchors(d, recordings, [], { calibrate: false }); reason(map, '3002', 'no-evidence');
});

test('berths: incompatible directed branches produce conflict instead of an average', () => {
  const { d, recordings } = branchFixture(300); d.signals[2]!.x = 1000;
  const map = buildAnchors(d, recordings, [], { calibrate: false }); reason(map, '3002', 'conflict');
});

test('berths: boundary continuation uses explicit nominal speed and marks travel beyond the graph outside', () => {
  const d = throat(); signal(d, 90, 'YA 3100', 20, -450, 'backward');
  const recordings = [[event('interpose', undefined, '3100'), event('step', '3100', '3101', 10000), event('step', '3101', '3102', 210000)]];
  const map = buildAnchors(d, recordings, [], { nominalSpeedMps: 10, calibrate: false });
  const a = anchor(map, '3101'); assert.deepEqual(a.point, [20, -550]); assert.deepEqual([a.from, a.to], [2, 1]);
  assert.match(a.evidence, /Boundary continuation/); assert.match(a.evidence, /nominal 10 m\/s/);
  reason(map, '3102', 'outside-network'); assert.match(map.unmapped.find((u) => u.berth === '3102')!.detail, /north boundary node/);
});

test('berths: leave-one-out removes the complete held-out signal and predicts within fifteen metres', () => {
  const d = throat(); signal(d, 90, 'YA 2900', 20, -440); signal(d, 91, 'YA 2999', 20, -800);
  const trials = leaveOneOut(d, [arrivals()[0]!.concat(event('interpose', undefined, '2999'))], []);
  const trial = trials.find((t) => t.berth === '2900');
  assert.ok(trial, 'the referenced berth gets a held-out trial');
  assert.equal(trial.signalId, 90); assert.equal(trial.role, 'berth'); assert.equal(trial.method, 'topology');
  assert.equal(trial.placed, true); near(trial.distanceM!, 15); assert.equal(trial.directionOk, true); assert.equal(trial.trusted, true);
  const orphan = trials.find((t) => t.berth === '2999');
  assert.ok(orphan, 'the other referenced berth gets a held-out trial');
  assert.equal(orphan.placed, false); assert.equal(orphan.trusted, false); assert.equal(orphan.distanceM, null);
  assert.equal(d.signals.length, 2); assert.equal(d.signals[0]!.ref, 'YA 2900');
});

test('berths: failed leave-one-out calibration withholds the affected inference method', () => {
  const { d, recordings } = branchFixture();
  const unchecked = buildAnchors(d, recordings, [], { calibrate: false }); assert.equal(anchor(unchecked, '3002').kind, 'inferred');
  const checked = buildAnchors(d, recordings, []); reason(checked, '3002', 'conflict');
  assert.match(checked.unmapped.find((u) => u.berth === '3002')!.detail, /Leave-one-out.*placement withheld/);
  assert.equal(anchor(checked, '3000').kind, 'signal');
});

test('berths: directed routing finds a longer compatible route when the shortest route reverses', () => {
  // Start points east at node 2. The short westward chord to node 7 opposes it.
  // The six-sided route turns at sixty degrees each time and arrives westbound.
  const d = data([[1, -10, 0], [2, 0, 0], [3, 100, 0], [4, 150, 86.6025403784], [5, 100, 173.2050807568], [6, 0, 173.2050807568], [7, -50, 86.6025403784], [8, -100, 86.6025403784]], [[1, 2, 3, 4, 5, 6, 7, 8], [2, 7]]);
  const map = manual([at('A', 1, 2, 1, [0, 0]), at('B', 7, 8, 0, [-50, 86.6025403784])]);
  const c = analyseSteps(d, [[event('step', 'A', 'B')]], map)[0]!;
  assert.equal(c.reversal, false); assert.equal(c.issues.some((s) => /revers/i.test(s)), false);
  near(c.lengthM!, 500);
});

function outsideComponentRows() {
  return [
    { TD: 'Y9', FROMBERTH: '6400', TOBERTH: '', STANOX: '54311', STANME: 'KINGS CROSS' },
    { TD: 'Y9', FROMBERTH: '6402', TOBERTH: '', STANOX: '', STANME: 'MORGAT' },
    { TD: 'Y9', FROMBERTH: '6405', TOBERTH: '', STANOX: '54238', STANME: 'FINSBURY PARK' },
  ];
}
function outsideComponentSteps(): RecordingEvent[] {
  // Both seeds are reachable only against one arrow; the longer branch is listed first.
  return [event('step', '6400', '6403'), event('step', '6403', '6404'), event('step', '6405', '6404'),
    event('step', '6400', '6401'), event('step', '6402', '6401')];
}

test('berths: unanchored observed component overrides station association and reports the nearest actual outside seed', () => {
  for (const options of [{}, { calibrate: false }]) {
    const map = buildAnchors(data(), [outsideComponentSteps()], outsideComponentRows(), options);
    for (const b of ['6400', '6401', '6402', '6403', '6404', '6405']) reason(map, b, 'outside-network');
    const detail = map.unmapped.find((u) => u.berth === '6400')!.detail;
    assert.match(detail, /observed.*component/i); assert.match(detail, /MORGAT/);
    assert.match(detail, /6402/); assert.match(detail, /2 (?:observed steps|(?:step )?hops?)/i);
    assert.doesNotMatch(detail, /FINSBURY PARK/);
    const seed = map.unmapped.find((u) => u.berth === '6402')!.detail;
    assert.match(seed, /6402/); assert.match(seed, /0 (?:observed steps|(?:step )?hops?)/i);
  }
});

test('berths: component outside rule preserves anchors and never floods around an anchor into another branch', () => {
  const d = data(); signal(d, 1, 'YA 6500', 30);
  const base = anchor(buildAnchors(d, seen('6500'), []), '6500');
  const rows = outsideComponentRows().concat({ TD: 'Y9', FROMBERTH: '6501', TOBERTH: '', STANOX: '', STANME: 'MORGAT' });
  const steps = outsideComponentSteps().concat(event('step', '6500', '6501'), event('step', '6500', '6502'), event('step', '6501', '6503'), event('step', '6503', '6502'));
  const map = buildAnchors(d, [steps], rows);
  assert.deepEqual(anchor(map, '6500'), base);
  reason(map, '6502', 'no-evidence'); // An alternate path avoids the anchor but is in its component.
  reason(map, '6400', 'outside-network');
});

test('berths: unknown SMART locations and placeholder links cannot seed or join outside components', () => {
  const d = data(); signal(d, 1, 'YA 6500', 30);
  const rows = outsideComponentRows().concat(
    { TD: 'Y9', FROMBERTH: '6600', TOBERTH: '', STANOX: '99999', STANME: 'INVENTED TOWN' },
    { TD: 'Y9', FROMBERTH: '6601', TOBERTH: '', STANOX: '54311', STANME: 'KINGS CROSS' },
    { TD: 'XX', FROMBERTH: '6601', TOBERTH: '', STANOX: '', STANME: 'MORGAT' });
  const steps = outsideComponentSteps().concat(event('step', '6600', '6601'),
    event('step', '6402', '6601', 0, '****'), event('step', '6400', '6500', 0, '****'));
  const map = buildAnchors(d, [steps], rows);
  reason(map, '6600', 'no-evidence'); reason(map, '6601', 'no-evidence');
  reason(map, '6400', 'outside-network'); // Placeholder connection to an anchor does not protect this component.
  assert.equal(anchor(map, '6500').kind, 'signal');
});

test('berths: final component processing runs after calibration and preserves geographic and withheld conflicts', () => {
  const { d, recordings } = branchFixture();
  signal(d, 20, 'YA 6700', 0); signal(d, 21, 'YA6700', 1000);
  const rows = outsideComponentRows().concat({ TD: 'Y9', FROMBERTH: '6700', TOBERTH: '', STANOX: '', STANME: 'MORGAT' });
  recordings[0]!.push(...outsideComponentSteps(), event('step', '6700', '6400'));
  const map = buildAnchors(d, recordings, rows);
  reason(map, '3002', 'conflict'); assert.match(map.unmapped.find((u) => u.berth === '3002')!.detail, /placement withheld/);
  reason(map, '6700', 'conflict'); assert.match(map.unmapped.find((u) => u.berth === '6700')!.detail, /disagree/);
  reason(map, '6400', 'outside-network');
});

test('berths: no-evidence details report undirected graph distance and only reachable SMART associations', () => {
  const d = data([[1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 300, 0]]);
  signal(d, 90, 'YA 6800', 20);
  const recordings = [[event('step', '6800', '6801'), event('step', '6801', '6802'), event('step', '6802', '6803'),
    event('step', '6801', '6804', 0, '****')]];
  const smart = [
    { TD: 'Y9', FROMBERTH: '6803', TOBERTH: '', STANOX: '77777', STANME: 'CONNECTED STATION' },
    { TD: 'Y9', FROMBERTH: '6804', TOBERTH: '', STANOX: '54238', STANME: 'MORGAT' },
    { TD: 'Y9', FROMBERTH: '9999', TOBERTH: '', STANOX: '99999', STANME: 'UNRELATED TOWN' },
  ];
  const noSmart = buildAnchors(d, recordings, [], { calibrate: false });
  const map = buildAnchors(d, recordings, smart, { calibrate: false });
  const earlyDefault = buildAnchors(d, recordings, smart); // Fewer than three references takes the same calibration bypass.
  const unmapped = map.unmapped.find((u) => u.berth === '6801');
  assert.ok(unmapped, 'expected berth 6801 to remain unplaced');
  const detail = unmapped?.detail ?? '';

  reason(map, '6801', 'no-evidence');
  assert.match(detail, /Shortest observed undirected path to graph anchor 6800: 6801 ↔ 6800 \(1 observed steps\)/);
  assert.match(detail, /Nearest SMART association: CONNECTED STATION \(STANOX 77777\) at berth 6803 in 2 observed steps/);
  assert.match(detail, /no positive matched residence timing|No bounded, agreeing directed route/i);
  assert.match(detail, /SMART offsets supply no metric point/);
  assert.doesNotMatch(detail, /MORGAT|UNRELATED TOWN|99999|6804|no trusted continuation through/i);
  assert.equal(map.unmapped.find((u) => u.berth === '6804')!.reason, 'outside-network');
  assert.deepEqual(map.anchors, noSmart.anchors);
  assert.equal(map.anchors.length, noSmart.anchors.length);
  assert.equal(earlyDefault.unmapped.find((u) => u.berth === '6801')!.detail, detail);
});
