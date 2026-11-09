import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { AnchorMap } from '../../core/anchors.ts';
import type { KxData } from '../../core/osm.ts';
import { buildGraph } from '../../core/graph.ts';
import { emrTrainLayout } from '../../core/train-emr.ts';
import { ASSUMED_MML_KIND, MML_ALLOCATION_NOTE, createMmlMotion, createMmlReplay, createStPancrasLive, mmlLiveDependencies, validateMmlAnchors } from '../src/stpancras-live.ts';

const data: KxData = { attribution: 'synthetic', origin: { lat: 0, lon: 0 }, nodes: [[1, 0, 0], [2, 0, -500]],
  rails: [{ id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 1 }], platforms: [], buildings: [], signals: [], switches: [], buffers: [] };
const anchors: AnchorMap = { area: 'WH', sources: ['synthetic'], anchors: [{ berth: 'SYN1', kind: 'platform', platform: '1', from: 2, to: 1, t: 1, point: [0, 0], errorM: 270, evidence: 'synthetic provisional berth association' }], unmapped: [] };
const fresh = (): AnchorMap => structuredClone(anchors);

test('MML accepts only a WH map with finite on-edge anchors and MML platform vocabulary', () => {
  const graph = buildGraph(data);
  assert.equal(validateMmlAnchors(anchors, graph), anchors);
  assert.throws(() => validateMmlAnchors({ ...anchors, area: 'Y9' }, graph), /WH anchor map/);
  for (const modify of [(a: AnchorMap) => { a.anchors[0]!.platform = '5'; }, (a: AnchorMap) => { a.anchors[0]!.t = NaN; }, (a: AnchorMap) => { a.anchors[0]!.point = [20, 0]; }, (a: AnchorMap) => { a.anchors.push(a.anchors[0]!); }]) {
    const map = fresh(); modify(map); assert.throws(() => validateMmlAnchors(map, graph), /invalid WH anchor/);
  }
});

test('MML cannot materialize KX events with identical local berth and headcode', () => {
  const session = createMmlMotion(data, anchors);
  session.sink.apply({ kind: 'interpose', area: 'Y9', descr: '1A11', to: 'SYN1' }, 0);
  assert.equal(session.motion.trains().length, 0);
  session.sink.apply({ kind: 'interpose', area: 'WH', descr: '1A11', to: 'SYN1' }, 0);
  const [train] = session.motion.trains();
  assert.equal(train!.description, '1A11');
  assert.equal(train!.lengthM, emrTrainLayout('emr222x5').length);
  assert.equal(session.kind, 'emr222x5'); assert.equal(ASSUMED_MML_KIND, session.kind);
  assert.match(MML_ALLOCATION_NOTE, /assumed fleet/); assert.doesNotMatch(MML_ALLOCATION_NOTE, /LNER/i);
});

test('WH live source uses a fixed allowlisted area query on every reconnect', () => {
  const urls: string[] = [];
  const deps = mmlLiveDependencies({ source: url => { urls.push(url); return {} as EventSource; } });
  deps.source!('/relay/events'); deps.source!('/untrusted?area=Y9');
  assert.deepEqual(urls, ['/relay/events?area=WH', '/relay/events?area=WH']);
});

test('WH replay follows the shared UTC clock without publishing a future checkpoint', () => {
  const session = createMmlMotion(data, anchors), rows = [{ t: 5000, e: { kind: 'snapshot', area: 'WH', berths: { SYN1: '1A11' } } }];
  const replay = createMmlReplay(rows, session.sink, 10);
  replay.frame(1, 4000); assert.equal(session.motion.trains().length, 0); assert.equal(replay.timeMs(), 4000);
  replay.frame(1, 5000); assert.equal(session.motion.trains().length, 1); assert.equal(replay.timeMs(), 5000);
  replay.frame(1, 7000); assert.equal(replay.timeMs(), 7000);
  assert.throws(() => createMmlReplay([{ t: 1, e: { kind: 'snapshot', area: 'Y9', berths: {} } }], session.sink), /another area/);
});

function fakeParent() {
  const nodes: any[] = [];
  const doc = { createElement: () => ({ style: { cssText: '', left: '', top: '' }, hidden: false, className: '', textContent: '', children: [] as any[], append(...items: any[]) { this.children.push(...items); }, remove() { this.removed = true; }, removed: false, ownerDocument: undefined as any }) };
  const original = doc.createElement;
  doc.createElement = () => { const node = original(); node.ownerDocument = doc; return node; };
  return { parent: { ownerDocument: doc, append: (...items: any[]) => nodes.push(...items) } as unknown as HTMLElement, nodes };
}

test('unavailable WH data remains honest and never fetches off-loopback or in demo', async () => {
  for (const [mode, hostname] of [['demo', 'localhost'], ['auto', 'example.org']] as const) {
    let calls = 0; const { parent } = fakeParent(), scene = new THREE.Scene();
    const runtime = createStPancrasLive({ data, scene, camera: new THREE.PerspectiveCamera(), parent, mode, hostname, date: '', speed: 1,
      fetchImpl: async () => { ++calls; throw new Error('should not fetch'); } });
    await runtime.load(); assert.equal(calls, 0); assert.equal(runtime.state().ready, false);
    assert.match(runtime.status(), /not yet enabled/); assert.match(runtime.status(), /Thameslink\/HS1 not yet enabled/);
    runtime.dispose(); assert.equal(scene.children.length, 0);
  }
});

test('private WH replay loads area endpoints, draws flat EMR cars, labels assumptions and disposes its group', async () => {
  const { parent, nodes } = fakeParent(), scene = new THREE.Scene(), urls: string[] = [];
  const camera = new THREE.PerspectiveCamera(); camera.position.set(50, 80, 80); camera.lookAt(0, 0, -50); camera.updateMatrixWorld();
  const runtime = createStPancrasLive({ data, scene, camera, parent, mode: 'replay', hostname: 'localhost', date: '20260101', speed: 1,
    fetchImpl: async input => {
      urls.push(String(input));
      return new Response(String(input).includes('/anchors') ? JSON.stringify(anchors) : JSON.stringify({ t: 5000, e: { kind: 'snapshot', area: 'WH', berths: { SYN1: '1A11' } } }) + '\n');
    } });
  await runtime.load(); runtime.frame(0, true);
  assert.deepEqual(urls, ['/relay/anchors?area=WH', '/relay/recording?area=WH&date=20260101']);
  assert.equal(runtime.state().ready, true); assert.equal(runtime.state().trains.length, 1);
  assert.equal(runtime.group.children.length, 1); const train = runtime.group.children[0]!;
  assert.equal(train.userData.kind, 'emr222x5'); assert.equal(train.userData.area, 'WH');
  assert.match(nodes[0].children[0].textContent, /1A11.*assumed fleet/);
  assert.equal(train.children.length, 5); assert.ok(train.children.every(c => c.visible && c.position.y === 0));
  runtime.frame(0, false); assert.equal(runtime.group.visible, false); assert.equal(nodes[0].hidden, true);
  runtime.dispose(); assert.equal(scene.children.length, 0); assert.equal(nodes[0].removed, true);
});
