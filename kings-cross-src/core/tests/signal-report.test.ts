import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { capturePlan, osmHeadReview, signalReport, signalReportMarkdown } from '../../tools/signal-report.ts';
import type { AnchorMap } from '../anchors.ts';
import type { KxData } from '../osm.ts';
import type { TimedTdEvent } from '../sclass.ts';
import type { PublicSignalReview, SignalOverlay } from '../../web/src/signals.ts';

const evidence = { trials: 4, support: 4, contradictions: 0, unmatchedCycles: 0, precision: 1, recall: 1 };
const hypothesis = (berth: string, bit: number, kind = 'proceed') => ({ id: berth, berth, bit, kind, address: '10', proceedValue: 1,
  training: evidence, heldOut: evidence, status: 'decoded', reason: 'synthetic correlation' });
const data = { attribution: 'synthetic', nodes: [[1, 0, 0], [2, 100, 0]], rails: [{ id: 1, nodes: [1, 2], service: 'main', tunnel: false }], platforms: [], signals: [], switches: [], buffers: [] } as unknown as KxData;
const overlay: SignalOverlay = { attribution: 'synthetic', signals: [1, 2].map(id => ({ id, ref: `YA990${id}`, berth: `990${id}`, point: [10 * id, 0], kinds: ['main'],
  direction: 'forward', edge: { wayId: 1, from: 1, to: 2, t: id / 10, point: [10 * id, 0] }, travel: [1, 0], facing: [-1, 0], side: 'left', sideSource: 'assumed-left', review: 'osm-ref-match' })) };
const anchors: AnchorMap = { area: 'Y9', sources: ['synthetic'], anchors: [], unmapped: [{ berth: '9903', reason: 'no-evidence', detail: 'synthetic missing line identity', seen: 0 }] };
const table = { area: 'Y9', hypotheses: [hypothesis('9901', 0), hypothesis('9902', 1, 'route'), hypothesis('9903', 2)] };
const event = (t: number, kind = 'heartbeat', extra = {}): TimedTdEvent => ({ t, e: { kind, area: 'Y9', ...extra } });
const rows = [event(0), event(100, 'sclass', { msgType: 'SF', address: '10', data: '01' }),
  event(200, 'sclass', { msgType: 'SF', address: '10', data: '00' }), event(300, 'sclass', { msgType: 'SG', address: '20', data: '00000000' }), event(400)];
const report = () => signalReport([rows], data, overlay, anchors, table);

test('signal report separates public geographic review from identity and inventories every uncertainty and displacement', () => {
  const reviewed = structuredClone(overlay);
  reviewed.signals[0]!.sideSource = 'osm';
  reviewed.signals[0]!.positionReview = { status: 'reviewed' };
  const review: PublicSignalReview = { id: 1, status: 'reviewed', reviewedAt: '2026-11-09', point: [10, 0],
    wayId: 1, from: 1, to: 2, direction: 'forward', rawPosition: 'left', side: 'left', nodeVersion: 1, wayVersion: 1,
    latitude: 0, longitude: 0, evidence: ['https://www.openstreetmap.org/node/1/history'], reason: 'Synthetic public coordinate, direction and side review', previousPost: [10, 0] as [number, number] };
  const map: AnchorMap = { ...anchors, anchors: [{ berth: '9903', kind: 'inferred', from: 1, to: 2, t: .5, point: [50, 0], errorM: 75, evidence: 'synthetic private chain' }] };
  const r = signalReport([rows], data, reviewed, map, table, undefined, [review]);
  assert.deepEqual(r.counts.positionReview, { reviewed: 1, topology: 0, uncertain: 2 });
  assert.equal(r.counts.positionReviewedDecodedHeads, 1); assert.equal(r.counts.positionUncertainDecodedHeads, 1);
  const head = r.heads.find(h => h.id === 1)!;
  assert.equal(head.positionReview.status, 'reviewed'); assert.equal(head.review, 'osm-ref-match');
  assert.deepEqual(head.postDeltaM, [0, -2]);
  assert.equal(r.heads.find(h => h.inferred)!.positionReview.status, 'uncertain');
  assert.match(r.heads.find(h => h.inferred)!.positionReview.reason, /no public.*side/i);
  assert.match(r.heads.find(h => h.inferred)!.positionReview.reason, /synthetic private chain/);
  assert.ok(r.heads.find(h => h.inferred)!.positionReview.evidence.includes('https://www.openstreetmap.org/way/1'));
  const md = signalReportMarkdown(r);
  assert.match(md, /Every drawn head: position and side review/);
  assert.match(md, /openstreetmap.org\/node\/1\/history/); assert.match(md, /synthetic private chain/);

  const stale = signalReport([rows], data, reviewed, map, table, undefined, [{ ...review, point: [10.02, 0] }]);
  assert.equal(stale.heads.find(h => h.id === 1)!.positionReview.status, 'uncertain', 'a review coordinate outside the builder tolerance is not rejoined');
  assert.equal(stale.heads.find(h => h.id === 1)!.postDeltaM, null, 'rejected review coordinates do not contribute a post baseline');
});

test('signal report inventories all eight bits of constant refresh bytes and separates route from proceed', () => {
  const r = report();
  assert.equal(r.bits.length, 40); assert.equal(r.counts.addresses, 5);
  assert.equal(r.counts.decodedBits, 3); assert.equal(r.counts.unknownBits, 37);
  assert.equal(r.bits.find(b => b.address === '20' && b.bit === 7)?.decoded, false);
  const route = r.bits.find(b => b.address === '10' && b.bit === 1)!;
  assert.equal(route.kind, 'route'); assert.equal(route.drivesAspect, false);
  assert.equal(r.bits.find(b => b.address === '10' && b.bit === 0)?.drivesAspect, true);
  assert.equal(r.heldOut.all.precision, 1); assert.equal(r.heldOut.all.recall, 1);
});

test('signal report keeps unpositioned decoded heads and every positioned undecoded head with reasons', () => {
  const r = report();
  assert.equal(r.heads.length, 2);
  assert.equal(r.counts.positionedDecodedHeads, 1); assert.equal(r.counts.unpositionedDecodedHeads, 1);
  assert.equal(r.counts.positionedUndecodedHeads, 1);
  assert.match(r.decodedHeads.find(h => h.berth === '9903')!.reason, /no-evidence.*missing line identity/);
  assert.equal(r.heads.find(h => h.id === 1)!.positionSource, 'reference');
  assert.deepEqual(r.heads.find(h => h.id === 2)!.observedStates, ['unknown'], 'route evidence never implies a red lamp');
  const md = signalReportMarkdown(r);
  assert.match(md, /\| 20 \| 7 \| unknown/); assert.match(md, /Every positioned head without/);
  assert.match(md, /9903.*unpositioned/); assert.match(md, /100\.00%/);
});

test('signal report preserves inferred anchor evidence and never substitutes it for an OSM reference', () => {
  const map: AnchorMap = { ...anchors, anchors: [{ berth: '9903', kind: 'inferred', from: 1, to: 2, t: .5, point: [50, 0], errorM: 75, evidence: 'synthetic topology chain' }] };
  const r = signalReport([rows], data, overlay, map, table);
  const head = r.heads.find(h => h.berth === '9903')!;
  assert.equal(head.positionSource, 'td-anchor'); assert.equal(head.inferred, true); assert.equal(head.errorM, 75);
  assert.match(head.positionReason, /synthetic topology chain/); assert.equal(head.review, 'unreviewed');
  assert.equal(r.counts.unpositionedDecodedHeads, 0);
});

test('signal report resets bytes between recordings and captures only genuine observed intervals', () => {
  const second = [event(1000), event(1100, 'sclass', { msgType: 'SF', address: '10', data: '00' }), event(1200)];
  const r = signalReport([rows, second], data, overlay, anchors, table);
  assert.equal(r.captures.length, 2);
  assert.deepEqual(r.captures[0]!.cases.map(c => c.state).sort(), ['danger', 'proceed', 'unknown']);
  assert.equal(r.captures[1]!.cases.some(c => c.state === 'proceed'), false);
  assert.ok(r.intervals.some(i => i.recording === 1 && i.state === 'unknown' && i.startMs === 1000 && i.endMs === 1100));
  for (const c of r.captures[0]!.cases) assert.ok(c.timeMs > c.startMs && c.timeMs < c.endMs);
  assert.ok(r.unsupportedStates.includes('caution'));
});

test('signal capture planning prefers an observed OSM head and never manufactures a missing state', () => {
  const cases = capturePlan([{ headId: -1, berth: 'a', state: 'proceed', startMs: 0, endMs: 1000 },
    { headId: 1, berth: 'b', state: 'proceed', startMs: 10, endMs: 20 }]);
  assert.equal(cases.length, 1); assert.equal(cases[0]!.headId, 1); assert.equal(cases[0]!.timeMs, 15);
});

test('signal report rejects an unsupported aspect even when the byte is present', () => {
  for (const heldOut of [{ ...evidence, recall: .1 }, { ...evidence, precision: .9 }]) {
    const invalid = { ...table, hypotheses: [{ ...hypothesis('9901', 0), heldOut }] };
    const r = signalReport([rows], data, overlay, anchors, invalid);
    assert.equal(r.counts.decodedBits, 0); assert.equal(r.counts.positionedDecodedHeads, 0);
    assert.equal(r.heads.length, overlay.signals.length);
    assert.deepEqual(r.heads[0]!.observedStates, ['unknown']); assert.equal(r.captures[0]!.cases.length, 0);
  }
});

const diagnosticWindows = { beforeMs: 100, afterMs: 10, earlyMs: 0, routeAfterMs: 120 };
const fixedDiagnosticTable = () => ({ area: 'Y9', windows: diagnosticWindows,
  folds: [{ startMs: 0, splitMs: 4000, endMs: 8000 }],
  hypotheses: [
    { ...hypothesis('A', 0), id: 'fixed-A', training: evidence, heldOut: evidence },
    { ...hypothesis('B', 1), id: 'excluded-B', status: 'unknown' as const, training: evidence, heldOut: evidence },
  ] });
const diagStep = (t: number, berth = 'A'): TimedTdEvent => event(t, 'step', { from: berth, to: 'EXIT', descr: 'SYN1' });
const diagByte = (t: number, value: number): TimedTdEvent => event(t, 'sclass', { msgType: 'SF', address: '10', data: value.toString(16).padStart(2, '0') });
const diagnosticRows = (support: number, trials: number, lateResets = false): TimedTdEvent[] => {
  const result: TimedTdEvent[] = [event(0), diagByte(0, 0)];
  for (let index = 0; index < trials; index += 1) {
    const passage = 1000 + index * 800;
    result.push(diagStep(passage));
    if (index < support) result.push(diagByte(passage - 20, 1), diagByte(passage + (lateResets && index >= Math.ceil(support / 2) ? 50 : 2), 0));
  }
  result.push(event(1000 + (trials - 1) * 800 + 200));
  return result.sort((a, b) => a.t - b.t);
};

test('fixed signal revalidation scores admitted mappings per recording without promoting unknowns or changing the supplied table', () => {
  const supplied = fixedDiagnosticTable();
  const original = structuredClone(supplied);
  const r = signalReport([diagnosticRows(6, 8, true), diagnosticRows(2, 2)], data, overlay, anchors, supplied);
  const diagnostic = r.fixedRevalidation;
  assert.ok(diagnostic, 'report must add fixed-mapping revalidation diagnostics');
  assert.equal(diagnostic.admittedMappingCount, 1);
  assert.deepEqual(diagnostic.excludedUnknownMappings.map(h => h.hypothesisId), ['excluded-B']);
  assert.deepEqual(diagnostic.recordings.map(recording => [recording.rowCount, recording.areaRowCount, recording.spanMs]), [
    [23, 23, 6800], [9, 9, 2000],
  ]);
  assert.equal(diagnostic.recordings[0]!.tableFoldRelation, 'overlaps-training-and-held-out');
  assert.equal(diagnostic.recordings[0]!.mappings.length, 1);
  assert.equal(diagnostic.recordings[0]!.mappings[0]!.hypothesisId, 'fixed-A');
  assert.equal(diagnostic.recordings[0]!.mappings[0]!.heldOut.support, 3);
  assert.equal(diagnostic.recordings[0]!.mappings[0]!.heldOut.trials, 8);
  assert.equal(diagnostic.recordings[0]!.mappings[0]!.heldOut.cycles, 6);
  assert.equal(diagnostic.recordings[0]!.mappings[0]!.heldOut.precision, .5);
  assert.equal(diagnostic.recordings[0]!.mappings[0]!.heldOut.recall, .375);
  assert.deepEqual(diagnostic.recordings[0]!.outcomes, { insufficientSupport: 0, belowPrecisionOrRecallThreshold: 1, meetsAcceptance: 0 });
  assert.equal(diagnostic.recordings[1]!.mappings[0]!.heldOut.support, 2);
  assert.deepEqual(diagnostic.recordings[1]!.outcomes, { insufficientSupport: 1, belowPrecisionOrRecallThreshold: 0, meetsAcceptance: 0 });
  assert.deepEqual(supplied, original, 'fixed revalidation must leave the input table byte-for-byte equivalent');
  assert.match(signalReportMarkdown(r), /Fixed mapping revalidation/);
  assert.match(signalReportMarkdown(r), /Recording \| Address\.bit \| Fixed mapping/);
});

test('fixed signal revalidation resets byte history between recordings', () => {
  const first = [diagByte(0, 0), diagByte(940, 1), event(950)];
  const second = [diagByte(0, 0), diagStep(1000), diagByte(1002, 0), event(1200)];
  const diagnostic = signalReport([first, second], data, overlay, anchors, fixedDiagnosticTable()).fixedRevalidation;
  assert.ok(diagnostic, 'report must revalidate each recording separately');
  assert.equal(diagnostic.recordings[1]!.mappings[0]!.heldOut.support, 0);
  assert.equal(diagnostic.recordings[1]!.mappings[0]!.heldOut.trials, 1);
  assert.equal(diagnostic.aggregate.all.support, 0, 'a clear in one recording cannot pair with a reset in another');
});

test('fixed revalidation labels only nonempty table folds as overlaps and never infers independence', () => {
  const input = [diagnosticRows(0, 1)];
  const relation = (fold: { startMs: number; splitMs: number; endMs: number } | null) => {
    const supplied = fixedDiagnosticTable();
    return signalReport(input, data, overlay, anchors, { ...supplied, folds: fold ? [fold] : [] })
      .fixedRevalidation.recordings[0]!.tableFoldRelation;
  };
  assert.equal(relation({ startMs: 0, splitMs: 1000, endMs: 1000 }), 'overlaps-training');
  assert.equal(relation({ startMs: 1000, splitMs: 1000, endMs: 8000 }), 'overlaps-held-out');
  assert.equal(relation({ startMs: 10000, splitMs: 15000, endMs: 20000 }), 'outside-table-folds-independence-unknown');
  assert.equal(relation(null), 'unknown-folds');
});

test('signal report CLI freezes complete input lines and refuses output outside private scratch', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const dir = mkdtempSync(`${root}/.scratch/signal-report-test-`);
  writeFileSync(`${dir}/rows.ndjson`, rows.map(r => JSON.stringify(r)).join('\n') + '\n{"partial":');
  writeFileSync(`${dir}/anchors.json`, JSON.stringify(anchors)); writeFileSync(`${dir}/table.json`, JSON.stringify(table));
  const invoke = (out: string) => spawnSync(process.execPath, ['kings-cross-src/tools/signal-report.ts', '--recording', `${dir}/rows.ndjson`, '--anchors', `${dir}/anchors.json`, '--table', `${dir}/table.json`, '--out', out], { cwd: root, encoding: 'utf8', timeout: 20000 });
  const accepted = invoke(`${dir}/out`); assert.equal(accepted.status, 0, accepted.stderr);
  const r = JSON.parse(readFileSync(`${dir}/out/signal-report.json`, 'utf8'));
  assert.equal(r.bits.length, 40); assert.equal(r.inputs.recordings.length, 1);
  assert.match(r.inputs.recordings[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(readFileSync(`${dir}/out/recording-0.ndjson`, 'utf8').endsWith('\n'), true);
  assert.notEqual(invoke(`${root}/kings-cross-src`).status, 0);
  assert.notEqual(invoke(`${dir}/out`).status, 0, 'an existing pack is immutable');
});

test('OSM head review locates an inferred head only through a unique same-way, same-direction main signal and never moves it', () => {
  const head = { berth: '9903', point: [50, 0], travel: [1, 0], wayId: 1 };
  const signal = (id: number, x: number, extra: Partial<SignalOverlay['signals'][number]> = {}) =>
    ({ ...overlay.signals[0]!, id, ref: undefined, berth: undefined, edge: { ...overlay.signals[0]!.edge, point: [x, 0] as [number, number] }, ...extra });
  assert.equal(osmHeadReview(head, [signal(7, 60)]).outcome, 'unique-osm-main-candidate');
  const cases: [SignalOverlay['signals'], RegExp][] = [
    [[], /no OSM railway=signal node within 40 m/],
    [[signal(7, 60, { kinds: ['train_protection'] })], /7 10 m: not a main signal/],
    [[signal(7, 60, { travel: [-1, 0] })], /faces the other way/],
    [[signal(7, 60, { edge: { ...overlay.signals[0]!.edge, wayId: 9, point: [60, 0] } })], /other way/],
    [[signal(7, 60, { ref: 'YA9905' })], /ref names another signal/],
    [[signal(7, 60), signal(8, 55)], /2 same-way, same-direction OSM main signals/],
    [[signal(7, 95)], /no OSM railway=signal node/],
  ];
  for (const [signals, reason] of cases) {
    const review = osmHeadReview(head, signals);
    assert.equal(review.outcome, 'no-compatible-osm-main-signal'); assert.match(review.reason, reason);
  }
  assert.match(osmHeadReview(head, [signal(7, 60)], new Set([7])).reason, /already bound to another berth/);
  assert.deepEqual(head.point, [50, 0]);
  const map: AnchorMap = { ...anchors, anchors: [{ berth: '9903', kind: 'inferred', from: 1, to: 2, t: .5, point: [50, 0], errorM: 75, evidence: 'synthetic chain' }] };
  const r = signalReport([rows], data, overlay, map, table);
  const inferred = r.heads.find(h => h.inferred)!;
  assert.equal(inferred.osmReview?.outcome, 'no-compatible-osm-main-signal');
  assert.match(inferred.positionReview.reason, /OSM review: Position left uncertain/);
  assert.equal(inferred.positionReview.status, 'uncertain');
  assert.match(signalReportMarkdown(r), /## Decoded heads with an uncertain position[\s\S]*\| -\d+ \| 9903 \| td-anchor \| no-compatible-osm-main-signal/);
});

test('signal report shows the table leave-one-recording-out scores when present', () => {
  const nested = [{ recording: 0, startMs: 0, endMs: 1, admitted: 2, all: { support: 9, cycles: 10, trials: 10, precision: .9, recall: .9 }, proceed: { support: 4, cycles: 4, trials: 5, precision: 1, recall: .8 } }];
  const md = signalReportMarkdown(signalReport([rows], data, overlay, anchors, { ...table, loo: { scheme: 'leave-one-recording-out', sessionGapMs: 600000, rule: 'synthetic rule', nested } }));
  assert.match(md, /## Leave-one-recording-out held-out recall/);
  assert.match(md, /\| 0 \| 1970-01-01T00:00:00.000Z to 1970-01-01T00:00:00.001Z \| 2 \| 90.00% \/ 90.00% \(9\/10\) \| 100.00% \/ 80.00% \(4\/5\) \|/);
  assert.doesNotMatch(signalReportMarkdown(report()), /Leave-one-recording-out/);
});
