import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { capturePlan, signalReport, signalReportMarkdown } from '../../tools/signal-report.ts';
import type { AnchorMap } from '../anchors.ts';
import type { KxData } from '../osm.ts';
import type { TimedTdEvent } from '../sclass.ts';
import type { SignalOverlay } from '../../web/src/signals.ts';

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
  reviewed.signals[0]!.positionReview = { id: 1, status: 'reviewed', reviewedAt: '2026-11-09', point: [10, 0],
    wayId: 1, from: 1, to: 2, direction: 'forward', rawPosition: 'left', side: 'left', nodeVersion: 1, wayVersion: 1,
    latitude: 0, longitude: 0, evidence: ['https://www.openstreetmap.org/node/1/history'], reason: 'Synthetic public coordinate, direction and side review', previousPost: [10, 0] };
  const map: AnchorMap = { ...anchors, anchors: [{ berth: '9903', kind: 'inferred', from: 1, to: 2, t: .5, point: [50, 0], errorM: 75, evidence: 'synthetic private chain' }] };
  const r = signalReport([rows], data, reviewed, map, table);
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
