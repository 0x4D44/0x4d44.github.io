import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createReplayFeed, createTimeline } from '../src/feed.ts';
import { buildSignalOverlay } from '../../tools/build-signals.ts';
import type { KxData, Platform } from '../../core/osm.ts';
import type { AnchorMap, BerthAnchor } from '../../core/anchors.ts';
import type { Graph } from '../../core/graph.ts';
import { project, round } from '../../core/geo.ts';
import { createSignals, platformStarter } from '../src/signals.ts';
import type { OverlaySignal, SignalEvent, PublicSignalReview } from '../src/signals.ts';
import type { TimedTdEvent } from '../../core/sclass.ts';

const signal = (extra: Partial<OverlaySignal> = {}): OverlaySignal => ({ id: 1, point: [11, 21], ref: 'YA 1004', kinds: ['main'],
  edge: { wayId: 9, from: 1, to: 2, t: 0.8, point: [10, 20] }, travel: [0.6, 0.8], facing: [-0.6, -0.8],
  side: 'left', sideSource: 'assumed-left', berth: '1004', review: 'osm-ref-match', ...extra });
const ev = () => ({ trials: 5, support: 4, contradictions: 1, precision: 0.8, unmatchedCycles: 1 });
const hypothesis = () => ({ id: 'synthetic', address: '10', bit: 2, berth: '1004', proceedValue: 1, training: ev(), heldOut: ev(), status: 'decoded', reason: 'synthetic only' });
const currentEv = () => ({ trials: 5, support: 4, contradictions: 1, precision: 0.8, unmatchedCycles: 1, recall: 0.8 });
const currentHypothesis = (extra: Record<string, unknown> = {}) => ({ ...hypothesis(), kind: 'proceed', training: currentEv(), heldOut: currentEv(), ...extra });
const table = () => ({ area: 'Y9', hypotheses: [hypothesis()] });
function fixture(signals = [signal()], fetchImpl?: typeof fetch) {
  const scene = new THREE.Scene(); const layer = createSignals({ attribution: 'synthetic', signals }, scene, { fetchImpl });
  return { scene, layer, drawn: layer.signals()[0]! };
}
interface SignalRecordContract {
  signal: OverlaySignal; group: THREE.Group; state: string; inferredPosition: boolean; label: string; mappingSource?: string;
}
const records = (layer: ReturnType<typeof createSignals>) => layer.signals() as unknown as SignalRecordContract[];
const inferred = (layer: ReturnType<typeof createSignals>) => records(layer).filter((r) => r.inferredPosition);
function tdAnchor(berth: string, extra: Partial<BerthAnchor> = {}): BerthAnchor {
  return { berth, kind: 'inferred', from: 1, to: 2, t: 0.8, point: [8, 0], errorM: 5, evidence: 'synthetic TD anchor', ...extra };
}
function tdMap(items: BerthAnchor[]): AnchorMap { return { area: 'Y9', sources: ['synthetic TD'], anchors: items, unmapped: [] }; }
function signalGraph(): Pick<Graph, 'pos'> { return { pos: new Map<number, [number, number]>([[1, [0, 0]], [2, [10, 0]]]) }; }
const tableFor = (berth: string, extra: Record<string, unknown> = {}) => ({ area: 'Y9', hypotheses: [currentHypothesis({ berth, ...extra })] });
function nearbySignal(extra: Partial<OverlaySignal> = {}): OverlaySignal {
  return signal({ ref: undefined, berth: undefined, direction: 'forward', point: [8, 0], travel: [1, 0], facing: [-1, 0],
    edge: { wayId: 9, from: 1, to: 2, t: 0.8, point: [28, 0] }, review: 'unreviewed', ...extra });
}
const row = (msgType = 'SF', data = '04', address = '10', area = 'Y9'): TimedTdEvent => ({ t: 1, e: { kind: 'sclass', area, msgType, data, address } });
const aspect = (group: THREE.Group) => (group.getObjectByName('aspect') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.color.getHex();
const close = (x: number, y: number) => assert.ok(Math.abs(x - y) < 1e-9, `${x} != ${y}`);

const starterPlatform: Platform = { id: 77, ref: '4', pts: [[2, -180], [12, -180], [12, -300], [2, -300]] };
const bufferAnchor = (): BerthAnchor => tdAnchor('TD1', { kind: 'platform', platform: '4', from: 1, to: 2, t: 1, point: [0, -180] });
function starterGraph(): Pick<Graph, 'pos' | 'edges'> {
  const pos = new Map<number, [number, number]>([[1, [0, -230]], [2, [0, -180]], [3, [4, -280]], [4, [8, -340]]]);
  const edges = [[1, 2], [1, 3], [3, 4]].map(([a, b]) => ({ a: a!, b: b!, length: Math.hypot(pos.get(a!)![0] - pos.get(b!)![0], pos.get(a!)![1] - pos.get(b!)![1]), wayId: 7, tunnel: false, service: 'main' as const }));
  return { pos, edges };
}

test('platform starters follow their own rail to the north end and face departing drivers', () => {
  const graph = starterGraph(), anchor = bufferAnchor();
  const starter = platformStarter(anchor, graph, starterPlatform);
  assert.ok(starter); close(starter.point[0], 4 + 4 / 3); close(starter.point[1], -300);
  assert.equal(starter.from, 3); assert.equal(starter.to, 4); close(starter.t, 1 / 3);
  assert.deepEqual(anchor.point, [0, -180]);
  const scene = new THREE.Scene(), layer = createSignals({ attribution: 'synthetic', signals: [] }, scene, { platforms: [starterPlatform] });
  layer.setAnchors(tdMap([anchor]), graph); layer.setTable(tableFor('TD1')); layer.apply(row());
  const head = inferred(layer)[0]; assert.ok(head); assert.equal(head.state, 'proceed');
  close(head.signal.edge.point[0], starter.point[0]); close(head.signal.edge.point[1], starter.point[1]);
  assert.ok(head.signal.travel[1] < 0, 'departure runs north instead of into the buffers');
  const facing = new THREE.Vector3(0, 0, 1).applyEuler(head.group.rotation);
  close(facing.x, -head.signal.travel[0]); close(facing.z, -head.signal.travel[1]);
  close(head.group.position.x, starter.point[0] + 2 * head.signal.travel[1]);
  close(head.group.position.z, starter.point[1] - 2 * head.signal.travel[0]);
  assert.match(head.label, /platform departure end.*position inferred from TD/); layer.dispose();
  const long = starterGraph(); long.pos.set(1, [0, -580]); long.edges = [long.edges[0]!];
  const alongOneLongEdge = platformStarter(anchor, long, starterPlatform);
  assert.ok(alongOneLongEdge); close(alongOneLongEdge.point[1], -300);
});

test('platform starters without trustworthy north-end geometry are omitted instead of using buffers', () => {
  const graph = starterGraph(), anchor = bufferAnchor();
  assert.equal(platformStarter(anchor, graph, undefined), undefined);
  assert.equal(platformStarter(anchor, { pos: graph.pos }, starterPlatform), undefined);
  assert.equal(platformStarter(anchor, { ...graph, edges: [graph.edges[0]!] }, starterPlatform), undefined);
  assert.equal(platformStarter(anchor, graph, { ...starterPlatform, tunnel: true }), undefined);
  const displaced: Platform = { ...starterPlatform, pts: starterPlatform.pts.map(([x, z]) => [x, z - 40]) };
  assert.equal(platformStarter(anchor, graph, displaced), undefined);
  const fork = starterGraph(); fork.pos.set(5, [-4, -280]);
  fork.edges.push({ ...fork.edges[1]!, b: 5 });
  assert.equal(platformStarter(anchor, fork, starterPlatform), undefined);
  const sideways = starterGraph(); sideways.pos.set(3, [50, -280]); sideways.pos.set(4, [80, -340]);
  assert.equal(platformStarter(anchor, sideways, starterPlatform), undefined);
  const layer = createSignals({ attribution: 'synthetic', signals: [] }, new THREE.Scene(), { platforms: [] });
  layer.setAnchors(tdMap([anchor]), graph); layer.setTable(tableFor('TD1')); layer.apply(row());
  assert.equal(inferred(layer).length, 0); layer.dispose();
});

test('platform starters reuse an OSM head beside their north-end track', () => {
  const graph = starterGraph(), direction: [number, number] = [4 / Math.hypot(4, 60), -60 / Math.hypot(4, 60)];
  const candidate = signal({ ref: undefined, berth: undefined, direction: 'forward', travel: direction, facing: [-direction[0], -direction[1]],
    edge: { wayId: 7, from: 3, to: 4, t: 1 / 3, point: [4 + 4 / 3, -300] } });
  const layer = createSignals({ attribution: 'synthetic', signals: [candidate] }, new THREE.Scene(), { platforms: [starterPlatform] });
  layer.setTable(tableFor('TD1')); layer.setAnchors(tdMap([bufferAnchor()]), graph); layer.apply(row());
  assert.equal(records(layer)[0]!.state, 'proceed'); assert.equal(records(layer)[0]!.mappingSource, 'nearby');
  assert.equal(inferred(layer).length, 0); layer.dispose();
});

test('posts sit two metres to their side of travel and the head faces oncoming traffic', () => {
  const { layer } = fixture([signal(), signal({ id: 2, side: 'right' })]);
  for (const [i, r] of layer.signals().entries()) {
    close(r.group.position.x, 10 + (i ? -1 : 1) * 1.6); close(r.group.position.z, 20 - (i ? -1 : 1) * 1.2);
    const facing = new THREE.Vector3(0, 0, 1).applyEuler(r.group.rotation); close(facing.x, -0.6); close(facing.z, -0.8);
  }
  layer.dispose();
});

test('without a table a byte remains grey unknown with a white vector question mark', () => {
  const { layer, drawn } = fixture(); layer.apply(row());
  assert.equal(drawn.state, 'unknown'); assert.equal(aspect(drawn.group), 0x666666);
  assert.equal(drawn.group.getObjectByName('unknown')!.visible, true);
  const line = drawn.group.getObjectByName('unknown')!.children.find((o) => o instanceof THREE.Line) as THREE.Line;
  assert.ok(line.geometry.getAttribute('position').count >= 6); assert.equal((line.material as THREE.LineBasicMaterial).color.getHex(), 0xffffff);
  assert.deepEqual(layer.counts(), { drawn: 1, decoded: 0 }); layer.dispose();
});

test('validated evidence drives green proceed and red danger and reset forgets bytes', () => {
  const { layer, drawn } = fixture(); layer.setTable(table()); assert.equal(drawn.state, 'unknown');
  layer.apply(row()); assert.equal(drawn.state, 'proceed'); assert.equal(aspect(drawn.group), 0x35ff69);
  assert.equal(drawn.group.getObjectByName('unknown')!.visible, false); assert.deepEqual(layer.counts(), { drawn: 1, decoded: 1 });
  layer.apply(row('SF', '00')); assert.equal(drawn.state, 'danger'); assert.equal(aspect(drawn.group), 0xff2929);
  layer.reset(); assert.equal(drawn.state, 'unknown'); layer.dispose();
});

test('numeric OSM YA berth decodes only a valid proceed hypothesis, never a route aspect', () => {
  const { layer, drawn } = fixture(); layer.apply(row());
  const proceed = currentHypothesis();
  layer.setTable({ area: 'Y9', hypotheses: [proceed] }); assert.equal(drawn.state, 'proceed');
  // A route may share the berth with a proceed candidate; it neither drives nor vetoes the aspect.
  layer.setTable({ area: 'Y9', hypotheses: [proceed, currentHypothesis({ id: 'route', kind: 'route', bit: 3, to: '2000' })] });
  assert.equal(drawn.state, 'proceed');
  layer.setTable({ area: 'Y9', hypotheses: [currentHypothesis({ kind: 'route' })] }); assert.equal(drawn.state, 'unknown');
  layer.dispose();
});

test('new evidence uses conventional precision and recall while compatible legacy evidence remains accepted', () => {
  const invalid = [
    currentHypothesis({ training: { ...currentEv(), precision: 1 } }),
    currentHypothesis({ heldOut: { ...currentEv(), recall: 1 } }),
    currentHypothesis({ training: { ...currentEv(), support: 2, contradictions: 3, recall: 0.4, precision: 2 / 3 } }),
    currentHypothesis({ heldOut: { ...currentEv(), unmatchedCycles: 2, precision: 2 / 3 } }),
    currentHypothesis({ kind: 'bogus' }),
    currentHypothesis({ kind: 'route', to: 7 }),
  ];
  const { layer, drawn } = fixture(); layer.apply(row());
  for (const value of invalid) { layer.setTable({ area: 'Y9', hypotheses: [currentHypothesis()] }); assert.equal(drawn.state, 'proceed');
    layer.setTable({ area: 'Y9', hypotheses: [value] }); assert.equal(drawn.state, 'unknown'); }
  // Legacy tables omit recall and kind; their old precision is accepted only where it agrees with the new formula.
  layer.setTable(table()); assert.equal(drawn.state, 'proceed');
  const incompatibleLegacy = { area: 'Y9', hypotheses: [{ ...hypothesis(), training: { ...ev(), unmatchedCycles: 0, precision: 1 } }] };
  layer.setTable(incompatibleLegacy); assert.equal(drawn.state, 'unknown'); layer.dispose();
});

test('unknown held-out candidates do not invalidate a decoded proceed table', () => {
  const { layer, drawn } = fixture(); layer.apply(row());
  const weak = currentHypothesis({ id: 'weak', berth: '9999', bit: 3, status: 'unknown',
    heldOut: { trials: 2, support: 0, contradictions: 2, precision: null, unmatchedCycles: 0, recall: 0 } });
  layer.setTable({ area: 'Y9', hypotheses: [currentHypothesis(), weak] });
  assert.equal(drawn.state, 'proceed'); layer.dispose();
});

test('SF SG SH all update the requested byte in ascending order and foreign areas cannot change it', () => {
  const { layer, drawn } = fixture(); layer.setTable(table());
  for (const msgType of ['SG', 'SH']) {
    layer.apply(row(msgType, '00000400', '0E')); assert.equal(drawn.state, 'proceed');
    layer.apply(row(msgType, '00000000', '0E')); assert.equal(drawn.state, 'danger');
  }
  layer.apply(row('SF')); assert.equal(drawn.state, 'proceed');
  layer.apply(row('SF', '00', '10', 'OTHER')); assert.equal(drawn.state, 'proceed');
  layer.apply(row('SF', 'zz')); assert.equal(drawn.state, 'proceed'); layer.dispose();
});

test('arbitrary invalid tables fail closed and cannot retain an earlier decode', () => {
  const invalid: unknown[] = [null, [], {}, { ...table(), area: 'OTHER' }, { area: 'Y9', hypotheses: {} }];
  for (const key of ['bit', 'proceedValue', 'address', 'status', 'id', 'berth', 'reason']) {
    for (const value of [null, {}, -1, 8, 0.5, ...(['id', 'reason'].includes(key) ? [] : ['bogus'])]) invalid.push({ area: 'Y9', hypotheses: [{ ...hypothesis(), [key]: value }] });
  }
  for (const fold of ['training', 'heldOut']) for (const patch of [
    { support: 2, trials: 3, contradictions: 1, precision: 2 / 3 }, { precision: 1 }, { trials: 0, support: 0, contradictions: 0, precision: null },
    { support: 4.5 }, { contradictions: -1 }, { precision: NaN }, { unmatchedCycles: -1 }, { trials: '5' },
  ]) invalid.push({ area: 'Y9', hypotheses: [{ ...hypothesis(), [fold]: { ...ev(), ...patch } }] });
  const { layer, drawn } = fixture(); layer.apply(row());
  for (const value of invalid) { layer.setTable(table()); assert.equal(drawn.state, 'proceed'); layer.setTable(value); assert.equal(drawn.state, 'unknown', JSON.stringify(value)); }
  layer.dispose();
});

test('competing bits berths polarities and unknown candidates cannot choose a decode', () => {
  const { layer, drawn } = fixture(); layer.apply(row());
  for (const patch of [{ bit: 3 }, { berth: '2000' }, { proceedValue: 0 }, { status: 'unknown' }, {}]) {
    layer.setTable({ area: 'Y9', hypotheses: [hypothesis(), { ...hypothesis(), id: 'other', ...patch }] });
    assert.equal(drawn.state, 'unknown');
  }
  const zero = table(); zero.hypotheses[0]!.proceedValue = 0; layer.setTable(zero); assert.equal(drawn.state, 'danger');
  layer.apply(row('SF', '00')); assert.equal(drawn.state, 'proceed'); layer.dispose();
});

test('boards foreign refs duplicate refs and nonmatching berth claims remain unknown', () => {
  for (const s of [signal({ kinds: ['stop'] }), signal({ ref: 'NL 1004' }), signal({ berth: '2000' }), signal({ ref: undefined })]) {
    const { layer, drawn } = fixture([s]); layer.apply(row()); layer.setTable(table()); assert.equal(drawn.state, 'unknown'); layer.dispose();
  }
  const { layer } = fixture([signal(), signal({ id: 2 })]); layer.setTable(table()); layer.apply(row());
  assert.ok(layer.signals().every((r) => r.state === 'unknown')); layer.dispose();
});

test('private reviewed topology mappings only map unique nearby unreferenced main signals', () => {
  const s = signal({ ref: undefined, berth: undefined, review: 'unreviewed' });
  const { layer, drawn } = fixture([s]); layer.apply(row());
  const mapping = { signalId: 1, berth: '1004', distanceM: 40, review: 'topology' };
  layer.setTable({ ...table(), signalMappings: [mapping] }); assert.equal(drawn.state, 'proceed');
  for (const mappings of [[{ ...mapping, distanceM: 40.01 }], [{ ...mapping, distanceM: -1 }], [{ ...mapping, distanceM: NaN }],
    [{ ...mapping, review: 'unreviewed' }], [{ ...mapping, signalId: '1' }], [mapping, mapping], [mapping, { ...mapping, signalId: 2 }]]) {
    layer.setTable({ ...table(), signalMappings: mappings }); assert.equal(drawn.state, 'unknown');
  }
  layer.setTable(table()); assert.equal(drawn.state, 'unknown'); layer.dispose();
  for (const other of [signal({ ref: 'NL 1004', berth: undefined }), signal({ kinds: ['stop'], ref: undefined, berth: undefined })]) {
    const f = fixture([other]); f.layer.apply(row()); f.layer.setTable({ ...table(), signalMappings: [mapping] }); assert.equal(f.drawn.state, 'unknown'); f.layer.dispose();
  }
});

test('OSM ref mapping takes precedence over private mappings', () => {
  const { layer, drawn } = fixture(); layer.apply(row());
  layer.setTable({ ...table(), signalMappings: [{ signalId: 1, berth: '2000', distanceM: 1, review: 'topology' }] });
  assert.equal(drawn.state, 'proceed'); layer.dispose();
});

test('anchored canonical refs bind YA, bare numeric and single-letter suffix forms only', () => {
  for (const ref of ['YA    1004', '1004', '1004A', 'YA 1004B']) {
    const f = fixture([signal({ ref, berth: undefined })]); f.layer.apply(row());
    f.layer.setAnchors(tdMap([tdAnchor('1004')]), signalGraph()); f.layer.setTable(tableFor('1004'));
    const drawn = records(f.layer)[0]!;
    assert.equal(drawn.state, 'proceed', ref); assert.equal(drawn.mappingSource, 'reference', ref);
    assert.equal(drawn.inferredPosition, false); assert.equal(inferred(f.layer).length, 0); f.layer.dispose();
  }
  for (const ref of ['NL 1004', '1004AB', 'YA 1004AB']) {
    const f = fixture([signal({ ref, berth: undefined })]); f.layer.apply(row());
    f.layer.setAnchors(tdMap([tdAnchor('1004')]), signalGraph()); f.layer.setTable(tableFor('1004'));
    const drawn = records(f.layer)[0]!;
    assert.equal(drawn.state, 'unknown', ref); assert.notEqual(drawn.mappingSource, 'reference', ref); f.layer.dispose();
  }
});

test('unique canonical OSM refs decode without a TD anchor and ambiguous refs stay unknown', () => {
  for (const ref of ['YA 1004', '1004', '1004A', 'YA 1004B']) {
    const f = fixture([signal({ ref, berth: undefined })]);
    f.layer.setTable(tableFor('1004')); f.layer.apply(row());
    assert.equal(f.drawn.state, 'proceed', ref); assert.equal(f.drawn.mappingSource, 'reference');
    f.layer.apply(row('SF', '00')); assert.equal(f.drawn.state, 'danger');
    f.layer.setAnchors(tdMap([]), signalGraph()); assert.equal(f.drawn.state, 'danger');
    assert.equal(inferred(f.layer).length, 0); f.layer.dispose();
  }
  for (const others of [
    [signal({ ref: '1004A', berth: undefined }), signal({ id: 2, ref: 'YA 1004B', berth: undefined })],
    [nearbySignal({ ref: '1004', berth: '2000' })],
  ]) {
    const f = fixture(others); f.layer.setTable(tableFor('1004')); f.layer.apply(row());
    assert.ok(records(f.layer).every(r => r.state === 'unknown'));
    f.layer.setAnchors(tdMap([tdAnchor('1004')]), signalGraph());
    assert.ok(records(f.layer).filter(r => !r.inferredPosition).every(r => r.state === 'unknown')); f.layer.dispose();
  }
});

test('qualified proceed reuses a unique YA head with unspecified kinds without changing its OSM type', () => {
  const f = fixture([signal({ kinds: [] })]); f.layer.setAnchors(tdMap([tdAnchor('1004')]), signalGraph());
  f.layer.setTable(tableFor('1004')); f.layer.apply(row());
  assert.equal(f.drawn.state, 'proceed'); assert.equal(f.drawn.mappingSource, 'reference');
  assert.equal(f.layer.counts().drawn, 1); assert.equal(inferred(f.layer).length, 0);
  assert.deepEqual(f.drawn.signal.kinds, []); assert.equal(f.drawn.inferredPosition, false);
  f.layer.setTable(tableFor('1004', { kind: 'route' })); assert.equal(f.drawn.state, 'unknown');
  assert.equal(aspect(f.drawn.group), 0x666666); assert.equal(f.drawn.mappingSource, undefined);
  f.layer.setTable(tableFor('1004', { status: 'unknown' })); assert.equal(f.drawn.state, 'unknown'); f.layer.dispose();
  for (const s of [signal({ kinds: [], ref: '1004' }), signal({ kinds: [], ref: 'NL 1004' }),
    signal({ kinds: ['stop'] }), signal({ kinds: [], berth: '2000' })]) {
    const x = fixture([s]); x.layer.setTable(tableFor('1004')); x.layer.apply(row());
    assert.equal(x.drawn.state, 'unknown'); x.layer.dispose();
  }
  const x = fixture([signal({ kinds: [] }), signal({ id: 2, kinds: [], ref: 'YA 1004A' })]);
  x.layer.setTable(tableFor('1004')); x.layer.apply(row()); assert.ok(records(x.layer).every(r=>r.state==='unknown')); x.layer.dispose();
});

test('available bytes never light a head without a decoded proceed hypothesis', () => {
  const f = fixture();
  for (const hypotheses of [[], [currentHypothesis({ kind: 'route' })], [currentHypothesis({ status: 'unknown' })],
    [currentHypothesis({ kind: 'route' }), currentHypothesis({ status: 'unknown', id: 'unknown', bit: 3 })]]) {
    f.layer.setTable({ area: 'Y9', hypotheses });
    for (const data of ['00', '04', 'FF']) {
      f.layer.apply(row('SF', data)); assert.equal(f.drawn.state, 'unknown');
      assert.equal(aspect(f.drawn.group), 0x666666);
      assert.equal(f.drawn.group.getObjectByName('unknown')!.visible, true);
    }
  }
  f.layer.dispose();
});

test('nearby binding accepts directed same-edge candidates through 20m, including reverse edge order', () => {
  for (const [candidate, berthAnchor] of [
    [nearbySignal(), tdAnchor('1004')],
    [nearbySignal({ direction: 'backward', travel: [-1, 0], facing: [1, 0], edge: { wayId: 9, from: 1, to: 2, t: 0.8, point: [8, 0] } }),
      tdAnchor('1004', { from: 2, to: 1, t: 0.2 })],
  ] as const) {
    const f = fixture([candidate]); f.layer.apply(row()); f.layer.setTable(tableFor('1004'));
    f.layer.setAnchors(tdMap([berthAnchor]), signalGraph());
    const drawn = records(f.layer)[0]!;
    assert.equal(drawn.state, 'proceed'); assert.equal(drawn.mappingSource, 'nearby');
    assert.equal(drawn.inferredPosition, false); assert.equal(inferred(f.layer).length, 0); f.layer.dispose();
  }
});

test('nearby binding rejects distance direction ref and one-to-many ambiguity then infers at the TD anchor', () => {
  const rejected: Array<[OverlaySignal[], BerthAnchor[]]> = [
    [[nearbySignal({ direction: undefined })], [tdAnchor('1004')]],
    [[nearbySignal({ travel: [-1, 0], facing: [1, 0] })], [tdAnchor('1004')]],
    [[nearbySignal({ edge: { wayId: 9, from: 1, to: 2, t: 0.8, point: [28.01, 0] } })], [tdAnchor('1004')]],
    [[nearbySignal({ edge: { wayId: 9, from: 3, to: 4, t: 0.8, point: [8, 0] } })], [tdAnchor('1004')]],
    [[nearbySignal({ ref: 'YA 2000' })], [tdAnchor('1004')]],
    [[nearbySignal({ ref: 'NL 1004' })], [tdAnchor('1004')]],
    [[nearbySignal(), nearbySignal({ id: 2 })], [tdAnchor('1004')]],
  ];
  for (const [candidates, berthAnchors] of rejected) {
    const f = fixture(candidates); f.layer.apply(row());
    f.layer.setTable(tableFor('1004')); f.layer.setAnchors(tdMap([...berthAnchors]), signalGraph());
    assert.ok(records(f.layer).filter(r => !r.inferredPosition).every(r => r.state === 'unknown'));
    assert.equal(inferred(f.layer).length, 1);
    assert.equal(inferred(f.layer)[0]!.mappingSource, 'td-anchor'); f.layer.dispose();
  }
  const competingBerths = fixture([nearbySignal()]); competingBerths.layer.apply(row());
  competingBerths.layer.setTable({ area: 'Y9', hypotheses: [currentHypothesis({ berth: '1004' }),
    currentHypothesis({ id: 'other', berth: '1005', address: '11', bit: 3 })] });
  competingBerths.layer.setAnchors(tdMap([tdAnchor('1004'), tdAnchor('1005', { t: 0.7, point: [9, 0] })]), signalGraph());
  assert.equal(records(competingBerths.layer)[0]!.state, 'unknown'); assert.equal(inferred(competingBerths.layer).length, 2);
  competingBerths.layer.dispose();
});

test('TD inferred heads use directed left offset and label a qualified proceed position', () => {
  const { layer } = fixture([]); layer.apply(row());
  layer.setAnchors(tdMap([tdAnchor('TD1'), tdAnchor('TD2', { t: 0.6, point: [6, 0] })]), signalGraph());
  assert.equal(inferred(layer).length, 0);
  layer.setTable({ area: 'Y9', hypotheses: [currentHypothesis({ berth: 'TD1' }),
    currentHypothesis({ id: 'other', berth: 'TD2', address: '11', bit: 3 })] });
  const heads = inferred(layer); assert.equal(heads.length, 2); assert.ok(heads.every(r => r.signal.berth));
  const first = heads.find(r => r.signal.berth === 'TD1'); assert.ok(first);
  assert.equal(first.state, 'proceed'); assert.equal(first.inferredPosition, true); assert.equal(first.mappingSource, 'td-anchor');
  assert.match(first.label, /position inferred from TD/); assert.match(String(first.group.userData.label), /position inferred from TD/);
  close(first.group.position.x, 8); close(first.group.position.z, -2);
  const facing = new THREE.Vector3(0, 0, 1).applyEuler(first.group.rotation); close(facing.x, -1); close(facing.z, 0);
  const post = first.group.children.find(o => o instanceof THREE.Mesh && o.geometry instanceof THREE.CylinderGeometry) as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  assert.equal(post.material.transparent, true); assert.ok(post.material.opacity < 1);
  const ring = first.group.getObjectByName('inferred-position');
  assert.ok(ring instanceof THREE.Line); assert.ok(ring.material instanceof THREE.LineDashedMaterial);
  layer.dispose();

  const reverse = fixture([]); reverse.layer.apply(row());
  reverse.layer.setAnchors(tdMap([tdAnchor('TD-reverse', { from: 2, to: 1, t: 0.2 })]), signalGraph());
  reverse.layer.setTable(tableFor('TD-reverse'));
  assert.equal(inferred(reverse.layer).length, 1);
  const reverseHead = inferred(reverse.layer)[0]!;
  close(reverseHead.group.position.x, 8); close(reverseHead.group.position.z, 2);
  const reverseFacing = new THREE.Vector3(0, 0, 1).applyEuler(reverseHead.group.rotation);
  close(reverseFacing.x, 1); close(reverseFacing.z, 0); reverse.layer.dispose();
});

test('route unknown unanchored duplicate and invalid evidence create no inferred head', () => {
  const cases = [
    { value: tableFor('TD1', { kind: 'route', to: 'TD2' }), map: tdMap([tdAnchor('TD1')]) },
    { value: tableFor('TD1', { status: 'unknown' }), map: tdMap([tdAnchor('TD1')]) },
    { value: tableFor('TD1', { training: { ...currentEv(), precision: 1 } }), map: tdMap([tdAnchor('TD1')]) },
    { value: tableFor('TD1', { training: { trials: 5, support: 2, contradictions: 3, precision: 0.4, unmatchedCycles: 3, recall: 0.4 } }), map: tdMap([tdAnchor('TD1')]) },
    { value: tableFor('TD1'), map: tdMap([]) },
    { value: tableFor('TD1'), map: tdMap([tdAnchor('TD1'), tdAnchor('TD1', { point: [7, 0], t: 0.7 })]) },
    { value: tableFor('TD1'), map: tdMap([tdAnchor('TD1', { point: [NaN, 0] })]) },
    { value: tableFor('TD1'), map: tdMap([tdAnchor('TD1', { from: 3, to: 4 })]) },
  ];
  for (const { value, map } of cases) {
    const { layer } = fixture([]); layer.apply(row()); layer.setAnchors(map, signalGraph()); layer.setTable(value);
    assert.equal(inferred(layer).length, 0); layer.dispose();
  }
});

test('anchor and table replacement reuse matching heads and dispose stale geometry', () => {
  const { layer } = fixture([]); layer.apply(row()); layer.setTable(tableFor('TD1'));
  const firstMap = tdMap([tdAnchor('TD1')]); layer.setAnchors(firstMap, signalGraph());
  assert.equal(inferred(layer).length, 1);
  const first = inferred(layer)[0]!;
  const firstResources = new Set<THREE.BufferGeometry | THREE.Material>();
  first.group.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      firstResources.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) firstResources.add(material);
    }
  });
  let firstDisposals = 0; for (const resource of firstResources) resource.addEventListener('dispose', () => { firstDisposals++; });
  layer.setAnchors(tdMap([tdAnchor('TD1')]), signalGraph());
  assert.equal(inferred(layer).length, 1); assert.equal(inferred(layer)[0]!.group, first.group); assert.equal(firstDisposals, 0);
  layer.setAnchors(tdMap([tdAnchor('TD2')]), signalGraph());
  assert.equal(first.group.parent === null, true, 'stale TD head detached');
  assert.equal(firstDisposals, firstResources.size); assert.equal(inferred(layer).length, 0);
  layer.setTable(tableFor('TD2')); assert.equal(inferred(layer).length, 1); const second = inferred(layer)[0]!;
  let secondDisposals = 0;
  second.group.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      for (const resource of [node.geometry, ...Array.isArray(node.material) ? node.material : [node.material]])
        resource.addEventListener('dispose', () => { secondDisposals++; });
    }
  });
  const secondResources = new Set<THREE.BufferGeometry | THREE.Material>();
  second.group.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      secondResources.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) secondResources.add(material);
    }
  });
  layer.setTable(null); assert.equal(second.group.parent, null); assert.equal(secondDisposals, secondResources.size);
  assert.equal(inferred(layer).length, 0); layer.dispose();
});

test('explicit fetch uses the local endpoint while 404 JSON errors and invalid tables clear stale state', async () => {
  for (const fetchImpl of [async (url: unknown) => { assert.equal(url, '/relay/sclass'); return new Response(JSON.stringify(table()), { status: 404 }); },
    async () => { throw new Error('offline'); }, async () => new Response('not json'), async () => new Response('{}')]) {
    const { layer, drawn } = fixture(undefined, fetchImpl as typeof fetch); layer.apply(row()); layer.setTable(table());
    const pending = layer.loadTable(); assert.equal(drawn.state, 'unknown'); await pending; assert.equal(drawn.state, 'unknown'); layer.dispose();
  }
  const { layer, drawn } = fixture(undefined, (async () => new Response(JSON.stringify(table()))) as typeof fetch);
  layer.apply(row()); await layer.loadTable(); assert.equal(drawn.state, 'proceed'); layer.dispose();
});

test('late fetch responses cannot replace a newer table or revive a disposed layer', async () => {
  let resolve!: (value: Response) => void;
  const { layer, drawn, scene } = fixture(undefined, (() => new Promise<Response>((r) => { resolve = r; })) as typeof fetch);
  layer.apply(row()); const first = layer.loadTable(); layer.setTable(null); resolve(new Response(JSON.stringify(table()))); await first;
  assert.equal(drawn.state, 'unknown');
  const second = layer.loadTable(); layer.dispose(); resolve(new Response(JSON.stringify(table()))); await second;
  layer.apply(row()); layer.setTable(table()); assert.equal(drawn.state, 'unknown'); assert.equal(scene.children.length, 0);
});

test('dispose detaches groups and releases every geometry and material exactly once', () => {
  const { layer, drawn, scene } = fixture(); const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  drawn.group.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) { resources.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) resources.add(m); }
  });
  let disposals = 0; for (const resource of resources) resource.addEventListener('dispose', () => { disposals++; });
  layer.dispose(); layer.dispose(); assert.equal(scene.children.length, 0); assert.equal(drawn.group.parent, null); assert.equal(disposals, resources.size);
});


function builderData(): KxData {
  return { attribution: 'synthetic OSM only', origin: { lat: 0, lon: 0 },
    nodes: [[1, 0, -200], [2, 0, -250], [3, 0, -300], [4, 0, -400]],
    rails: [{ id: 9, nodes: [1, 2, 3, 4], service: 'main', tunnel: false, bridge: false, layer: 0 }],
    switches: [], buffers: [{ id: 1, x: 0, z: -200 }], buildings: [],
    platforms: [{ id: 100, ref: '4', pts: [[2, -200], [4, -200], [4, -290], [2, -290]] }],
    signals: [{ id: 2, x: 0, z: -250, ref: 'YA 1004', direction: 'backward', kinds: ['main'] },
      { id: 3, x: 0, z: -300, direction: 'forward', kinds: ['main'] },
      { id: 99, x: 0, z: -270, ref: 'NL 2000', direction: 'forward', kinds: ['train_protection'] }] };
}
function privateAnchors(z = -320, reverse = false): AnchorMap {
  return { area: 'Y9', sources: ['synthetic private'], unmapped: [], anchors: [{ berth: 'PRIVATE', kind: 'inferred',
    from: reverse ? 4 : 3, to: reverse ? 3 : 4, t: (-300 - z) / 100, point: [0, z], errorM: 5, evidence: 'synthetic only' }] };
}

const publicReview = (extra: Partial<PublicSignalReview> = {}): PublicSignalReview => ({ id: 3, status: 'reviewed', reviewedAt: '2026-11-09',
  point: [0, -300], wayId: 9, from: 3, to: 4, direction: 'forward', rawPosition: 'left', side: 'left',
  nodeVersion: 1, wayVersion: 1, latitude: 0, longitude: 0,
  evidence: ['https://www.openstreetmap.org/node/3', 'https://www.openstreetmap.org/way/9'],
  reason: 'Synthetic public review: containing rail, direction and left side explicitly tagged.', previousPost: [-2, -300], ...extra });

test('public position review is independent of a berth identity and rejects stale geometry or side evidence', () => {
  const raw = [{ type: 'node' as const, id: 3, tags: { 'railway:signal:position': 'left' } }];
  const build = (reviews = [publicReview()]) => buildSignalOverlay(builderData(), { raw, reviews });
  const reviewed = build().overlay.signals.find(s => s.id === 3)!;
  assert.equal(reviewed.berth, undefined); assert.equal(reviewed.review, 'unreviewed', 'identity remains separate');
  assert.equal(reviewed.positionReview?.status, 'reviewed');
  assert.equal(reviewed.positionReview?.side, 'left');
  assert.match(reviewed.positionReview!.evidence[0]!, /openstreetmap/);
  const { layer, drawn } = fixture([reviewed]);
  assert.match(drawn.label, /reviewed track position and side/); layer.dispose();
  for (const change of [{ point: [0, -301] }, { wayId: 10 }, { from: 2 }, { direction: 'backward' }, { rawPosition: 'right' }, { side: 'right' }] satisfies Partial<PublicSignalReview>[]) {
    assert.notEqual(build([publicReview(change)]).overlay.signals.find(s => s.id === 3)!.positionReview?.status, 'reviewed');
  }
  assert.notEqual(buildSignalOverlay(builderData(), { reviews: [publicReview()] }).overlay.signals.find(s => s.id === 3)!.positionReview?.status, 'reviewed');
});

test('OSM bridge mounting stays over its governed track without an invented left-hand mast', () => {
  const result = buildSignalOverlay(builderData(), { raw: [{ type: 'node', id: 3, tags: { 'railway:signal:position': 'bridge' } }] });
  const bridge = result.overlay.signals.find(s => s.id === 3)!;
  assert.equal(bridge.side, 'over-track'); assert.equal(bridge.sideSource, 'osm');
  const { layer, drawn } = fixture([bridge]);
  close(drawn.group.position.x, bridge.edge.point[0]); close(drawn.group.position.z, bridge.edge.point[1]);
  assert.equal(Boolean(drawn.group.getObjectByName('post')), false);
  assert.match(drawn.label, /uncertain.*bridge.*height/i); layer.dispose();
});

test('uncertain public and inferred positions say why even if the aspect and identity decode', () => {
  const { layer, drawn } = fixture(); layer.setTable(table()); layer.apply(row());
  assert.equal(drawn.state, 'proceed'); assert.match(drawn.label, /uncertain.*side/i);
  layer.setAnchors(tdMap([tdAnchor('OTHER')]), signalGraph()); layer.setTable(tableFor('OTHER'));
  const head = inferred(layer)[0]!;
  assert.ok(head);
  assert.match(head.label, /position inferred from TD.*uncertain.*side/i); layer.dispose();
});

test('every public overlay head has a source-backed review and assumed sides never pass as reviewed', () => {
  const overlay = JSON.parse(readFileSync(new URL('../src/data/kx-signals.json', import.meta.url), 'utf8'));
  assert.ok(overlay.signals.length > 0);
  for (const s of overlay.signals as OverlaySignal[]) {
    assert.ok(s.positionReview, `missing review for public OSM node ${s.id}`);
    const r = s.positionReview!;
    assert.equal(r.id, s.id); assert.deepEqual(r.point, s.edge.point);
    assert.ok(r.evidence.includes(`https://www.openstreetmap.org/node/${s.id}/history`));
    assert.ok(r.evidence.includes(`https://api.openstreetmap.org/api/0.6/node/${s.id}/${r.nodeVersion}.json`));
    // kx-track stores projected OSM nodes rounded to one decimal metre.
    const point = project(r.latitude, r.longitude).map(v => round(v));
    assert.deepEqual(point, r.point, 'reviewed coordinate matches the actual drawing');
    assert.ok(r.reason.length > 30); assert.equal(r.wayId, s.edge.wayId);
    assert.equal(r.status === 'reviewed', s.sideSource === 'osm' && s.side !== 'over-track');
    if (s.sideSource === 'assumed-left') assert.equal(r.side, 'uncertain');
  }
});

test('OSM builder follows way direction raw side tags and strict YA reference prefixes', () => {
  const result = buildSignalOverlay(builderData(), { raw: [{ type: 'node', id: 2, tags: { 'railway:signal:position': 'right' } }] });
  assert.equal(result.overlay.signals.length, 3);
  const [backward, forward, foreign] = result.overlay.signals;
  assert.equal(backward!.edge.from, 1); assert.equal(backward!.edge.to, 2);
  close(backward!.travel[0], 0); close(backward!.travel[1], 1); close(backward!.facing[1], -1);
  assert.equal(backward!.side, 'left'); assert.equal(backward!.sideSource, 'osm'); assert.equal(backward!.berth, '1004');
  assert.equal(backward!.review, 'osm-ref-match'); assert.equal(forward!.edge.from, 3); assert.equal(forward!.edge.to, 4);
  close(forward!.travel[1], -1); assert.equal(forward!.side, 'left'); assert.equal(forward!.sideSource, 'assumed-left');
  assert.equal(foreign!.ref, 'NL 2000'); assert.equal(foreign!.berth, undefined); assert.equal(foreign!.review, 'unreviewed');
});

test('private builder inputs never alter public overlay JSON or promote public review', () => {
  const data = builderData(); const plain = buildSignalOverlay(data); const reviewed = buildSignalOverlay(data, { anchors: privateAnchors() });
  assert.equal(JSON.stringify(reviewed.overlay), JSON.stringify(plain.overlay));
  assert.equal(JSON.stringify(reviewed.overlay).includes('PRIVATE'), false);
  const mapped = reviewed.privateReview.signalMappings;
  assert.equal(mapped.length, 1); assert.equal(mapped[0]!.signalId, 3); assert.equal(mapped[0]!.berth, 'PRIVATE');
  assert.equal(mapped[0]!.distanceM, 20); assert.equal(mapped[0]!.review, 'topology');
  assert.equal(reviewed.overlay.signals.find((s) => s.id === 3)!.review, 'unreviewed');
  const topology = privateAnchors(); topology.anchors[0]!.kind = 'signal'; topology.anchors[0]!.evidence = 'Topology: synthetic directed route';
  const topologyReview = buildSignalOverlay(data, { anchors: topology });
  assert.deepEqual(topologyReview.privateReview.signalMappings, mapped);
  assert.equal(JSON.stringify(topologyReview.overlay), JSON.stringify(plain.overlay));
  topology.anchors[0]!.evidence = 'OSM signal ref: synthetic';
  assert.equal(buildSignalOverlay(data, { anchors: topology }).privateReview.signalMappings.length, 0);

});

test('private builder topology requires compatible direction distance and one-to-one identity', () => {
  const data = builderData();
  assert.equal(buildSignalOverlay(data, { anchors: privateAnchors(-340) }).privateReview.signalMappings.length, 1);
  assert.equal(buildSignalOverlay(data, { anchors: privateAnchors(-340.01) }).privateReview.signalMappings.length, 0);
  assert.equal(buildSignalOverlay(data, { anchors: privateAnchors(-320, true) }).privateReview.signalMappings.length, 0);
  const extra = structuredClone(data); extra.signals.push({ id: 5, x: 0, z: -310, direction: 'forward', kinds: ['main'] });
  assert.equal(buildSignalOverlay(extra, { anchors: privateAnchors() }).privateReview.signalMappings.length, 0);
  const anchors = privateAnchors(); anchors.anchors.push({ ...anchors.anchors[0]!, berth: 'OTHER' });
  assert.equal(buildSignalOverlay(data, { anchors }).privateReview.signalMappings.length, 0);
});


const snapshot = (data?: Record<string, string>, extra: Record<string, unknown> = {}): SignalEvent => ({ t: 10,
  e: { kind: 'snapshot', area: 'Y9', berths: {}, ...(data ? { sclass: { addresses: Object.keys(data).length, data } } : {}), ...extra } });

test('live and replay snapshots replace byte state and subsequent SF SG SH continue identically', () => {
  const live = fixture(), replay = fixture(); live.layer.setTable(table()); replay.layer.setTable(table());
  const sequence = [row('SF', '00'), snapshot({ '10': '04', '11': '00' }), row('SF', '00'),
    snapshot({ '10': '04' }), row('SG', '00000000', '0E'), row('SH', '00000400', '0E')].map((event, i) => ({ ...event, t: i * 1000 }));
  const states = ['danger', 'proceed', 'danger', 'proceed', 'danger', 'proceed'];
  const timeline = createTimeline({ apply: (e, t) => live.layer.apply({ t, e }), advance: () => {} });
  const replayFeed = createReplayFeed(sequence as Parameters<typeof createReplayFeed>[0], 1, { apply: (e, t) => replay.layer.apply({ t, e }), advance: () => {} }, () => {});
  sequence.forEach((event, i) => { timeline.deliver(event.e, event.t); if (i) replayFeed.advance(1);
    assert.equal(live.drawn.state, states[i]); assert.equal(replay.drawn.state, live.drawn.state); });
  live.layer.apply(snapshot({ '11': '04' })); assert.equal(live.drawn.state, 'unknown');
  replayFeed.dispose(); live.layer.dispose(); replay.layer.dispose();
});

test('empty missing invalid and overlapping snapshots clear stale bytes atomically and foreign snapshots are ignored', () => {
  const { layer, drawn } = fixture(); layer.setTable(table());
  const invalid = [snapshot(), snapshot({}), snapshot({ '10': '04', '11': 'bad' }), snapshot({ '10': '04000000' }),
    snapshot({ '10': '04' }, { sclass: { addresses: 2, data: { '10': '04' } } }),
    snapshot({ 'A': '04', '0a': '00' }), snapshot({ '10000': '04' }), snapshot({ '10': '04' }, { berths: [] }),
    snapshot({ '10': '04' }, { sclass: { addresses: 1, data: [] } })];
  for (const event of invalid) { layer.apply(row()); assert.equal(drawn.state, 'proceed'); layer.apply(event); assert.equal(drawn.state, 'unknown'); }
  layer.apply(row()); layer.apply(snapshot({}, { area: 'OTHER' })); assert.equal(drawn.state, 'proceed'); layer.dispose();
});
