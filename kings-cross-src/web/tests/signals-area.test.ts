// The signal layer per TD area: a synthetic area "ZZ" whose OSM refs name berths like Z123. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createSignals, signalRefBerth, SIGNAL_REF_RULES } from '../src/signals.ts';
import type { OverlaySignal, SignalRefRule } from '../src/signals.ts';
import type { TimedTdEvent } from '../../core/sclass.ts';
import { buildGraph } from '../../core/graph.ts';

const ZZ: SignalRefRule = { berth: /^(?:ZZ\s*)?(Z\d{3})[A-Z]?$/, prefixed: /^ZZ\s*Z\d{3}[A-Z]?$/, prefix: 'ZZ' };
const head = (extra: Partial<OverlaySignal> = {}): OverlaySignal => ({ id: 1, ref: 'ZZ Z123', kinds: ['main'],
  edge: { wayId: 9, from: 1, to: 2, t: 0.5, point: [10, 0] }, travel: [1, 0], side: 'left', sideSource: 'assumed-left',
  review: 'unreviewed', ...extra });
const evidence = () => ({ trials: 5, support: 4, contradictions: 1, precision: 0.8, unmatchedCycles: 1, recall: 0.8 });
const table = (area = 'ZZ') => ({ area, hypotheses: [{ id: 'synthetic', kind: 'proceed', address: '10', bit: 2, berth: 'Z123', proceedValue: 1,
  training: evidence(), heldOut: evidence(), status: 'decoded', reason: 'synthetic only' }] });
const row = (data: string, area = 'ZZ'): TimedTdEvent => ({ t: 1, e: { kind: 'sclass', area, msgType: 'SF', data, address: '10' } });

test('an area\'s own ref rule binds its heads to its berths, and its feed drives them', () => {
  assert.equal(signalRefBerth('ZZ Z123', ZZ), 'Z123');
  assert.equal(signalRefBerth('Z123B', ZZ), 'Z123', 'a variant suffix is the same berth');
  assert.equal(signalRefBerth('YA 1004', ZZ), undefined, 'another area\'s prefix is not this area\'s berth');
  assert.equal(signalRefBerth('ZZ Z123', null), undefined, 'no rule, no berth');
  assert.equal(signalRefBerth('YA 1004'), '1004', 'the King\'s Cross rule stays the default');
  const layer = createSignals({ attribution: 'synthetic', signals: [head()] }, new THREE.Scene(), { area: 'ZZ', refRule: ZZ });
  const drawn = layer.signals()[0]!;
  layer.setTable(table()); layer.apply(row('04')); assert.equal(drawn.state, 'proceed');
  layer.apply(row('00')); assert.equal(drawn.state, 'danger');
  layer.apply(row('04', 'Y9')); assert.equal(drawn.state, 'danger', 'another area\'s bytes cannot change it');
  layer.dispose();
});

test('a ref rule may keep a letter its plates space off: its capture groups join into the berth', () => {
  // the shape of a plate that reads "Z 123" for berth Z123 (Edinburgh's plates read so); synthetic area only
  const spaced: SignalRefRule = { berth: /^(Z)\s*(\d{3})[A-Z]?$/, prefixed: /^Z\s*\d{3}[A-Z]?$/, prefix: 'Z' };
  assert.equal(signalRefBerth('Z 123', spaced), 'Z123');
  assert.equal(signalRefBerth('Z123', spaced), 'Z123');
  assert.equal(signalRefBerth('Z 123B', spaced), 'Z123', 'a variant suffix is the same berth');
  assert.equal(signalRefBerth('Z 123BR', spaced), undefined, 'a two-letter suffix is another object');
  assert.equal(signalRefBerth('ZZ 123', spaced), undefined);
  const layer = createSignals({ attribution: 'synthetic', signals: [head({ ref: 'Z 123' })] }, new THREE.Scene(), { area: 'ZZ', refRule: spaced });
  layer.setTable(table()); layer.apply(row('04')); assert.equal(layer.signals()[0]!.state, 'proceed', 'the spaced plate drives its berth');
  layer.dispose();
  assert.ok(SIGNAL_REF_RULES.EB, 'EB has a ref rule');
});

test('an area without a ref rule binds no head by its ref, and never borrows King\'s Cross\'s', () => {
  assert.equal(SIGNAL_REF_RULES.ZZ, undefined);
  for (const ref of ['ZZ Z123', 'YA 1004', '1004']) {
    const layer = createSignals({ attribution: 'synthetic', signals: [head({ ref })] }, new THREE.Scene(), { area: 'ZZ' });
    layer.setTable({ ...table(), hypotheses: [{ ...table().hypotheses[0]!, berth: ref === 'ZZ Z123' ? 'Z123' : '1004' }] });
    layer.apply(row('04'));
    assert.equal(layer.signals()[0]!.state, 'unknown', ref); layer.dispose();
  }
  const kx = createSignals({ attribution: 'synthetic', signals: [head({ ref: 'YA 1004' })] }, new THREE.Scene(), { area: 'ZZ', refRule: null });
  kx.setTable({ ...table(), hypotheses: [{ ...table().hypotheses[0]!, berth: '1004' }] }); kx.apply(row('04'));
  assert.equal(kx.signals()[0]!.state, 'unknown', 'refRule null turns the area default off'); kx.dispose();
});

test('a layer for a named area asks the relay for that area\'s table and refuses another area\'s', async () => {
  const urls: unknown[] = [];
  const fetchImpl = (async (url: unknown) => { urls.push(url); return new Response(JSON.stringify(table())); }) as typeof fetch;
  const layer = createSignals({ attribution: 'synthetic', signals: [head()] }, new THREE.Scene(), { area: 'ZZ', refRule: ZZ, fetchImpl });
  layer.apply(row('04')); await layer.loadTable();
  assert.deepEqual(urls, ['/relay/sclass?area=ZZ']); assert.equal(layer.signals()[0]!.state, 'proceed');
  layer.setTable(table('Y9')); assert.equal(layer.signals()[0]!.state, 'unknown', 'a Y9 table is not ZZ\'s');
  layer.dispose();
});


// A straight line along +x: nodes every 100 m. Heads facing +x trains at x 50 (ref ZZ Z123), 150 and 250.
const lineGraph = () => buildGraph({ nodes: [[1, 0, 0], [2, 100, 0], [3, 200, 0], [4, 300, 0], [5, 400, 0]],
  rails: [{ id: 1, nodes: [1, 2, 3, 4, 5], service: 'main', tunnel: false, bridge: false, layer: 0 }] }, { curves: true });
const lineHeads = (aspects?: 4) => [[1, 2, 'ZZ Z123'], [2, 3, undefined], [3, 4, undefined]].map(([from, to, ref], i) =>
  head({ id: i + 1, ref: ref as string | undefined, edge: { wayId: 1, from: from as number, to: to as number, t: 0.5, point: [50 + 100 * i, 0] }, ...(aspects ? { aspects } : {}) }));

test('with infer, the trains ahead light yellows and greens, the feed\'s red wins, and no occupancy is dark', () => {
  const layer = createSignals({ attribution: 'synthetic', signals: lineHeads(4) }, new THREE.Scene(), { area: 'ZZ', refRule: ZZ, track: lineGraph(), infer: true });
  const states = () => layer.signals().map(s => s.state);
  assert.deepEqual(states(), ['unknown', 'unknown', 'unknown'], 'no occupancy yet: dark');
  layer.setOccupancy([]);
  assert.deepEqual(states(), ['preliminary', 'caution', 'unknown'], 'clear: as permissive as the known sections allow');
  layer.setOccupancy([{ a: 2, b: 3, fromT: 0.6, toT: 0.8 }]);
  assert.deepEqual(states(), ['caution', 'danger', 'unknown']);
  layer.setTable(table()); layer.apply(row('00'));
  assert.equal(states()[0], 'danger', 'the feed\'s red beats the inferred yellow');
  layer.apply(row('04')); assert.equal(states()[0], 'caution');
  layer.setOccupancy([{ a: 1, b: 2, fromT: 0.6, toT: 0.9 }]);
  assert.equal(states()[0], 'caution', 'off red in the feed: never shown red by inference, capped at single yellow');
  layer.setOccupancy(undefined);
  assert.deepEqual(states(), ['caution', 'unknown', 'unknown'], 'occupancy lost: the feed alone');
  const lamp = (i: number) => (layer.signals()[i]!.group.getObjectByName('aspect') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material.color.getHex();
  assert.equal(lamp(0), 0xffc21a); assert.equal(lamp(1), 0x666666);
  layer.dispose();
});

test('without infer (King\'s Cross) occupancy changes nothing: a head shows only the feed', () => {
  const layer = createSignals({ attribution: 'synthetic', signals: lineHeads() }, new THREE.Scene(), { area: 'ZZ', refRule: ZZ, track: lineGraph() });
  layer.setTable(table()); layer.apply(row('04'));
  layer.setOccupancy([{ a: 1, b: 2, fromT: 0.6, toT: 0.9 }]);
  assert.deepEqual(layer.signals().map(s => s.state), ['proceed', 'unknown', 'unknown']);
  layer.dispose();
});

const meshes = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse(o => { if (o instanceof THREE.Mesh) out.push(o); }); return out; };
const triangles = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3 * (m instanceof THREE.InstancedMesh ? m.count : 1);

test('instanced heads: four draws however many heads, one lamp colour each, a second lamp lit only for double yellow', () => {
  const many = Array.from({ length: 60 }, (_, i) => head({ id: 100 + i, ref: undefined, edge: { wayId: 1, from: 1, to: 2, t: 0.5, point: [i, 50] },
    ...(i % 2 ? { aspects: 4 as const } : {}), ...(i === 0 ? { side: 'over-track' as const } : {}) }));
  const scene = new THREE.Scene(), graph = lineGraph();
  const layer = createSignals({ attribution: 'synthetic', signals: [...lineHeads(4), ...many] }, scene, { area: 'ZZ', refRule: ZZ, track: graph, infer: true, instanced: true });
  const drawn = meshes(scene);
  assert.deepEqual(drawn.map(m => m.name).sort(), ['signal-boxes', 'signal-lamps', 'signal-posts', 'signal-upper-lamps']);
  assert.ok(drawn.every(m => m instanceof THREE.InstancedMesh));
  const part = (name: string) => drawn.find(m => m.name === name) as THREE.InstancedMesh;
  assert.equal(part('signal-boxes').count, 63); assert.equal(part('signal-posts').count, 62, 'a gantry head has no post');
  assert.equal(part('signal-upper-lamps').count, 33, 'only four-aspect heads carry the second lamp');
  const lampOf = (id: number) => { const c = new THREE.Color(); part('signal-lamps').getColorAt(layer.signals().findIndex(s => s.signal.id === id), c); return c.getHex(); };
  const upperOf = (i: number) => { const c = new THREE.Color(); part('signal-upper-lamps').getColorAt(i, c); return c.getHex(); };
  assert.equal(lampOf(1), 0x666666, 'dark before any data');
  layer.setOccupancy([]);
  assert.deepEqual([lampOf(1), upperOf(0)], [0xffc21a, 0xffc21a], 'double yellow: both lamps');
  assert.deepEqual([lampOf(2), upperOf(1)], [0xffc21a, 0x666666], 'single yellow: the second lamp dark');
  layer.setOccupancy([{ a: 1, b: 2, fromT: 0.6, toT: 0.9 }]); assert.equal(lampOf(1), 0xff2929);
  // each head still has its group, posed, for its label; the head's lamp stands where the group stands
  const m = new THREE.Matrix4(), p = new THREE.Vector3(); part('signal-boxes').getMatrixAt(0, m); p.setFromMatrixPosition(m);
  const g = layer.signals()[0]!.group; assert.ok(p.distanceTo(g.position) < 1e-9); assert.equal(g.children.length, 0);
  const tris = drawn.reduce((n, mesh) => n + triangles(mesh), 0);
  assert.equal(tris, 62 * 24 + 63 * 12 + 63 * 80 + 33 * 80, 'post 24, box 12, lamp 80 triangles, and 80 for a second lamp');
  const released: unknown[] = []; for (const mesh of drawn) { mesh.geometry.addEventListener('dispose', () => released.push(mesh.geometry)); (mesh.material as THREE.Material).addEventListener('dispose', () => released.push(mesh.material)); }
  layer.dispose(); assert.equal(released.length, 8); assert.equal(scene.children.length, 0);
});

test('instanced mode still draws a head inferred from TD as its own group, and disposes it with its berth', () => {
  const scene = new THREE.Scene();
  const layer = createSignals({ attribution: 'synthetic', signals: lineHeads() }, scene, { area: 'ZZ', refRule: ZZ, track: lineGraph(), instanced: true });
  const before = meshes(scene).length;
  assert.equal(before, 3, 'three-aspect overlay heads: three instanced parts');
  layer.setTable({ ...table(), hypotheses: [{ ...table().hypotheses[0]!, berth: 'Z999' }] });
  layer.setAnchors({ area: 'ZZ', sources: [], unmapped: [], anchors: [{ berth: 'Z999', kind: 'inferred', from: 4, to: 5, t: 0.5, point: [350, 0], errorM: 5, evidence: 'synthetic' }] }, lineGraph());
  const td = layer.signals().filter(s => s.inferredPosition); assert.equal(td.length, 1);
  layer.apply(row('04')); assert.equal(td[0]!.state, 'proceed');
  assert.ok(meshes(td[0]!.group).length >= 3); assert.equal(meshes(scene).length, before + meshes(td[0]!.group).length);
  layer.setAnchors({ area: 'ZZ', sources: [], unmapped: [], anchors: [] }, lineGraph());
  assert.equal(meshes(scene).length, before); layer.dispose();
});
