import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewGeographicEvidence } from '../berths.ts';
import type { AnchorMap, BerthAnchor } from '../anchors.ts';
import type { KxData } from '../osm.ts';
import { project, unproject } from '../geo.ts';

// Invented references, coordinates and previous placements; no recording/SMART fixture.
const data: KxData = { attribution: 'Synthetic', origin: { lat: 0, lon: 0 },
  nodes: [[1, 0, 0], [2, 0, -100]],
  rails: [{ id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }],
  buffers: [], switches: [], signals: [], platforms: [], buildings: [] };
function map(): AnchorMap { return { area: 'Y9', sources: ['synthetic'], anchors: [], unmapped: [
  { berth: '2300', reason: 'no-evidence', detail: 'No independently bounded route', seen: 7 },
  { berth: '2302', reason: 'conflict', detail: 'Held-out placement failed 15 m criterion', seen: 9 },
] }; }
function signal(ref: string, z = -200, id = 91) {
  return { type: 'node', id, ...unproject(0, z, data.origin), tags: { railway: 'signal', ref } };
}
function at(berth: string, kind: BerthAnchor['kind'] = 'inferred'): BerthAnchor {
  return { berth, kind, from: 1, to: 2, t: .4, point: [0, -40], errorM: 75, evidence: 'Earlier chain prediction' };
}
const review = (m: AnchorMap, elements: unknown[], errorM?: number) =>
  reviewGeographicEvidence(data, m, { elements }, { source: 'synthetic-overpass.json', errorM });

test('berth geography: an exact YA identity beyond its screening interval supplies an auditable outside reason', () => {
  const r = review(map(), [signal('YA 2300')]);
  const u = r.map.unmapped.find((u) => u.berth === '2300')!;
  assert.equal(u.reason, 'outside-network'); assert.equal(u.seen, 7);
  assert.match(u.detail, /OSM node 91.*YA 2300/); assert.match(u.detail, /Previous evidence: No independently bounded route/);
  assert.deepEqual(r.decisions[0]?.signals[0], { osmId: 91, ref: 'YA 2300', ...unproject(0, -200, data.origin),
    northOfBoundaryM: 100, url: 'https://www.openstreetmap.org/node/91' });
  assert.equal(r.summary.outsideDecisions, 1); assert.equal(r.summary.screeningErrorM, 50);
  assert.equal(r.summary.matchedBerths, 1); assert.match(r.map.sources.at(-1)!, /synthetic-overpass.json.*50 m/);
});

test('berth geography: contrary exact ref removes only the candidate inference and never mutates runtime positions', () => {
  const m = map(), disputed = at('2300'), retained = at('2400', 'signal');
  m.anchors = [disputed, retained]; m.unmapped = m.unmapped.filter((u) => u.berth !== '2300');
  const before = structuredClone(m), r = reviewGeographicEvidence(data, m, { elements: [signal('YA2300')] },
    { source: 'synthetic-overpass.json', seen: new Map([['2300', 12]]) });
  assert.deepEqual(m, before); assert.deepEqual(r.map.anchors, [retained]);
  assert.equal(r.map.anchors[0], retained); assert.equal(r.summary.removedAnchors, 1);
  assert.equal(r.map.unmapped.find((u) => u.berth === '2300')?.reason, 'outside-network');
  assert.equal(r.map.unmapped.find((u) => u.berth === '2300')?.seen, 12);
  assert.match(r.map.unmapped.find((u) => u.berth === '2300')!.detail, /Earlier chain prediction/);
});

test('berth geography: direct outside identity supersedes a conflict while retaining its failed calibration evidence', () => {
  const r = review(map(), [signal('ya 2302')]);
  assert.equal(r.map.unmapped.find((u) => u.berth === '2302')?.reason, 'outside-network');
  assert.match(r.map.unmapped.find((u) => u.berth === '2302')!.detail, /failed 15 m criterion/);
  assert.equal(r.decisions.find((d) => d.berth === '2302')?.before, 'conflict');
});

test('berth geography: a boundary-straddling or touching interval never establishes outside status', () => {
  for (const z of [-149, -150, -90]) {
    const s = signal('YA2302', z);
    // Exact equality tests the strict comparison independently of projection rounding.
    const errorM = z === -150 ? -100 - project(s.lat, s.lon, data.origin)[1] : 50;
    const r = review(map(), [s], errorM);
    assert.equal(r.map.unmapped.find((u) => u.berth === '2302')?.reason, 'conflict');
    assert.equal(r.decisions.find((d) => d.berth === '2302')?.status, 'boundary-straddle');
    assert.match(r.map.unmapped.find((u) => u.berth === '2302')!.detail, /straddles or touches/);
  }
});

test('berth geography: an in-envelope coordinate cannot create an anchor or override calibration', () => {
  const r = review(map(), [signal('YA2300', 20)]);
  assert.equal(r.decisions[0]?.status, 'not-north-outside');
  assert.equal(r.map.unmapped[0]?.reason, 'no-evidence'); assert.deepEqual(r.map.anchors, []);
  assert.match(r.map.unmapped[0]!.detail, /does not establish a route on the graph/);
});

test('berth geography: a platform YA starter never replaces the nose-to-buffer platform anchor', () => {
  const m = map(), platform = { ...at('1005', 'platform'), platform: '5' };
  m.anchors.push(platform); const r = review(m, [signal('YA1005')]);
  assert.equal(r.map.anchors[0], platform); assert.equal(r.summary.removedAnchors, 0);
  assert.equal(r.map.unmapped.some((u) => u.berth === '1005'), false);
  assert.equal(r.decisions.find((d) => d.berth === '1005')?.status, 'platform-starter-reference');
});

test('berth geography: named junctions and other signal prefixes never locate neighbouring or numeric-suffix berths', () => {
  const junction = { ...signal('2300'), tags: { railway: 'junction', name: 'Invented South Junction', 'ref:tiploc': 'TESTJN' } };
  const r = review(map(), [junction, signal('K2300', -300, 92), signal('YA2300A', -300, 93), signal('2302', -300, 94)]);
  assert.deepEqual(r.map.unmapped.map((u) => u.reason), ['no-evidence', 'conflict']);
  assert.equal(r.summary.outsideDecisions, 0); assert.equal(r.summary.noRefDecisions, 2);
  assert.equal(r.summary.otherRefSignals, 3); assert.equal(r.summary.signalNodes, 3); assert.equal(r.summary.referencedSignals, 3);
  assert.equal(r.namedLocations[0]?.tiploc, 'TESTJN'); assert.equal(r.namedLocations[0]?.osmId, 91);
  assert.match(r.decisions[0]!.detail, /connectivity do not locate/); assert.match(r.summary.propagation, /^none:/);
});

test('berth geography: distinct OSM nodes sharing a ref are ambiguous even when both are north', () => {
  const r = review(map(), [signal('YA2300'), signal('YA 2300', -300, 92)]);
  assert.equal(r.decisions[0]?.status, 'ambiguous-ref'); assert.equal(r.decisions[0]?.signals.length, 2);
  assert.equal(r.map.unmapped[0]?.reason, 'no-evidence'); assert.equal(r.summary.yaSignals, 2);
});

test('berth geography: repeated identical nodes are deduplicated but contradictory node coordinates are rejected', () => {
  const s = signal('YA2300');
  assert.equal(review(map(), [s, structuredClone(s)]).summary.yaSignals, 1);
  assert.throws(() => review(map(), [s, signal('YA2300', -300)]), /contradictory coordinates/);
});

test('berth geography: malformed documents and unbounded or invalid screening options are rejected', () => {
  for (const doc of [null, {}, { elements: {} }, { elements: new Array(100001).fill(null) }])
    assert.throws(() => reviewGeographicEvidence(data, map(), doc, { source: 'synthetic' }));
  for (const errorM of [0, 14.99, NaN, Infinity, -Infinity]) assert.throws(() => review(map(), [], errorM));
  assert.throws(() => reviewGeographicEvidence(data, map(), { elements: [] }, { source: '  ' }));
  assert.throws(() => reviewGeographicEvidence({ ...data, nodes: [] }, map(), { elements: [] }, { source: 'synthetic' }));
});

test('berth geography: relevant node identities and coordinates must be finite and in geographic range', () => {
  for (const patch of [{ id: 0 }, { id: 1.5 }, { id: Infinity }, { lat: NaN }, { lat: 91 }, { lat: '0' }, { lon: Infinity }, { lon: -181 }])
    assert.throws(() => review(map(), [{ ...signal('YA2300'), ...patch }]), /invalid geographic node/);
  assert.equal(review(map(), [null, 3, { type: 'way', id: -1 }, { type: 'node', tags: [] }]).summary.signalNodes, 0);
});

test('berth geography: an Overpass timeout remark cannot be treated as a complete absence of matching refs', () => {
  assert.throws(() => reviewGeographicEvidence(data, map(), { elements: [], remark: 'runtime error: Query timed out' },
    { source: 'synthetic' }), /incomplete Overpass/);
});

test('berth geography: another signal prefix identifies berths only when CORPUS names that signal as a SMART location of the berth', () => {
  const corpus = [{ STANOX: '99001', TIPLOC: 'TESTSIG', NLCDESC: 'INVENTED SOUTH SIG K 512' }];
  const tied = [{ TD: 'Y9', STANOX: '99001', FROMBERTH: '0512', TOBERTH: '0510' }];
  const run = (smart: typeof tied, rows = corpus) => reviewGeographicEvidence(data, map(), { elements: [signal('K2300')] },
    { source: 'synthetic-overpass.json', corpus: rows, smart });
  const r = run(tied);
  assert.equal(r.map.unmapped.find((u) => u.berth === '2300')?.reason, 'outside-network');
  assert.match(r.map.unmapped.find((u) => u.berth === '2300')!.detail, /ref "K2300".*CORPUS TESTSIG.*SIG K 512.*berth 0512/);
  assert.equal(r.summary.prefixedSignals, 1); assert.equal(r.summary.yaSignals, 0);
  // Same CORPUS name without the SMART tie, another area's tie, or a YA-named location: no identity.
  for (const [smart, rows] of [[[{ ...tied[0]!, FROMBERTH: '0511', TOBERTH: '0513' }], corpus], [[{ ...tied[0]!, TD: 'XX' }], corpus],
    [tied, [{ ...corpus[0]!, NLCDESC: 'INVENTED SIG YA 512' }]]] as const) {
    const n = run([...smart], [...rows]);
    assert.equal(n.map.unmapped.find((u) => u.berth === '2300')?.reason, 'no-evidence'); assert.equal(n.summary.prefixedSignals, 0);
  }
});

// A rail way 80 -> 91 (signal) -> 2 (north graph end): way order runs into the graph.
function overhang(z: number, direction?: string, ref = 'YA 2300') {
  const s = { ...signal(ref, z), tags: { railway: 'signal', ref, ...(direction ? { 'railway:signal:direction': direction } : {}) } };
  const way = { type: 'way', id: 7, nodes: [80, 91, 2], tags: { railway: 'rail' },
    geometry: [unproject(0, z - 40, data.origin), unproject(0, z, data.origin), unproject(0, -100, data.origin)] };
  return [s, way];
}

test('berth geography: an exact YA signal just past the cut on a rail into a graph end is anchored there with its overhang as error', () => {
  const r = review(map(), overhang(-110, 'forward'));
  const a = r.map.anchors.find((a) => a.berth === '2300')!;
  assert.equal(a.kind, 'signal'); assert.equal(a.from, 2); assert.equal(a.to, 1); assert.equal(a.t, 0);
  assert.ok(Math.abs(a.point[1] + 100) < 1e-6); assert.ok(Math.abs(a.errorM - 15) < .2);
  assert.match(a.evidence, /YA 2300.*beyond graph end 2 along OSM way 7.*into the graph/);
  assert.equal(r.map.unmapped.some((u) => u.berth === '2300'), false);
  assert.equal(r.decisions.find((d) => d.berth === '2300')?.status, 'boundary-anchored');
  assert.equal(r.summary.boundaryAnchors, 1);
  // A signal facing away from the graph is reached just after leaving it.
  const out = review(map(), overhang(-110, 'backward')).map.anchors.find((a) => a.berth === '2300')!;
  assert.equal(out.from, 1); assert.equal(out.to, 2); assert.equal(out.t, 1);
});

test('berth geography: no direction, an overhang past 25 m of track or a conflict never becomes a boundary anchor', () => {
  for (const [z, direction] of [[-110, undefined], [-130, 'forward']] as const) {
    const r = review(map(), overhang(z, direction));
    assert.deepEqual(r.map.anchors, []);
    assert.equal(r.map.unmapped.find((u) => u.berth === '2300')?.reason, 'no-evidence');
    assert.equal(r.decisions[0]?.status, 'boundary-straddle');
    assert.match(r.map.unmapped.find((u) => u.berth === '2300')!.detail, /Boundary anchor not established/);
  }
  const conflict = review(map(), overhang(-110, 'forward', 'YA 2302'));
  assert.deepEqual(conflict.map.anchors, []);
  assert.equal(conflict.map.unmapped.find((u) => u.berth === '2302')?.reason, 'conflict');
});
