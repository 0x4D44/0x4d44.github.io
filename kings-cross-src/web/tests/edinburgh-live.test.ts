import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildGraph } from '../../core/graph.ts';
import { waverleyTrackData } from '../../core/waverley-anchors.ts';
import type { WaverleyAnchorScene } from '../../core/waverley-anchors.ts';
import type { AnchorMap } from '../../core/anchors.ts';
import { createEdinburghLive, createEdinburghMotion, edinburghLiveDependencies, validateEdinburghAnchors } from '../src/edinburgh-live.ts';

// Invented local graph/berths. No operational fixtures or route assumptions.
const geometry: WaverleyAnchorScene = { origin: { lat: 0, lon: 0 }, attribution: 'synthetic',
  rails: [{ id: 'synthetic/rail', path: [[0, -500], [0, 0], [0, 500]], tags: {} }],
  platforms: [{ id: 'synthetic/platform', ref: '1', tags: {}, path: [[1, -50], [4, -50], [4, 50], [1, 50]] }] };
const graph = buildGraph(waverleyTrackData(geometry));
const anchors: AnchorMap = { area: 'EB', sources: ['synthetic'], anchors: [
  { berth: 'SYN1', kind: 'smart', from: 1, to: 2, t: .8, point: [0, -100], errorM: 100, evidence: 'synthetic reviewed direction' },
], unmapped: [] };

test('EB validates its own on-track map and withholds terminal semantics and conflicting alternatives', () => {
  assert.equal(validateEdinburghAnchors(anchors, graph), anchors);
  assert.throws(() => validateEdinburghAnchors({ ...anchors, area: 'WH' }, graph), /EB anchor map/);
  for (const update of [(a: AnchorMap) => { a.anchors[0]!.point = [50, 50]; },
    (a: AnchorMap) => { a.anchors[0]!.t = NaN; }, (a: AnchorMap) => { a.anchors.push(a.anchors[0]!); }]) {
    const a = structuredClone(anchors); update(a); assert.throws(() => validateEdinburghAnchors(a, graph), /invalid EB anchor/);
  }
  assert.throws(() => validateEdinburghAnchors({ ...anchors, anchors: [{ ...anchors.anchors[0]!, platform: '1' }] }, graph), /terminal buffer semantics/);
  assert.throws(() => validateEdinburghAnchors({ ...anchors, platformAssociations: [{ berth: 'SYN1', platform: '1' }, { berth: 'SYN1', platform: '2' }] }, graph), /conflicting platform alternatives/);
});

test('EB rejects same-named London events and uses neutral assumed fleet without allocation evidence', () => {
  const session = createEdinburghMotion(geometry, anchors);
  session.sink.apply({ kind: 'interpose', area: 'Y9', descr: '1A11', to: 'SYN1' }, 0);
  session.sink.apply({ kind: 'interpose', area: 'WH', descr: '1A11', to: 'SYN1' }, 0);
  assert.equal(session.motion.trains().length, 0);
  session.sink.apply({ kind: 'interpose', area: 'EB', descr: '1A11', to: 'SYN1' }, 0);
  const train = session.motion.trains()[0]!;
  assert.equal(train.description, '1A11'); assert.equal(train.lengthM, 130);
  assert.equal(session.kinds.kindFor(train), 'neutral');
  assert.match(session.kinds.formationFor(train)!.label, /assumed fleet/);
});

test('EB SSE reconnects always select EB at the fixed local endpoint', () => {
  const urls: string[] = [];
  const deps = edinburghLiveDependencies({ source: u => { urls.push(u); return {} as EventSource; } });
  deps.source!('/relay/events'); deps.source!('/foreign?area=WH');
  assert.deepEqual(urls, ['/relay/events?area=EB', '/relay/events?area=EB']);
});

function parentFixture() {
  const roots: any[] = [];
  const doc = { createElement: (): any => ({ style: {}, children: [] as any[], textContent: '', hidden: false,
    ownerDocument: doc, append(...items: any[]) { this.children.push(...items); }, remove() { this.removed = true; } }) };
  return { parent: { ownerDocument: doc, append: (...items: any[]) => roots.push(...items) } as unknown as HTMLElement, roots };
}

test('private EB replay uses area endpoints, shared UTC, flat neutral bodies and explicit fleet labels', async () => {
  const { parent, roots } = parentFixture(), scene = new THREE.Scene(), urls: string[] = [];
  const runtime = createEdinburghLive({ geometry, scene, camera: new THREE.PerspectiveCamera(), parent,
    mode: 'replay', hostname: 'localhost', date: '20260101', speed: 10,
    fetchImpl: async input => { urls.push(String(input)); return new Response(String(input).includes('/anchors') ? JSON.stringify(anchors)
      : JSON.stringify({ t: 5000, e: { kind: 'snapshot', area: 'EB', berths: { SYN1: '1A11' } } }) + '\n'); } });
  await runtime.load(); runtime.frame(0, true, 4000);
  assert.equal(runtime.state().trains.length, 0, 'do not publish a future snapshot');
  runtime.frame(0, true, 5000);
  assert.deepEqual(urls, ['/relay/anchors?area=EB', '/relay/recording?area=EB&date=20260101']);
  assert.equal(runtime.state().ready, true); assert.equal(runtime.timeMs(), 5000);
  assert.equal(runtime.group.children.length, 1); const train = runtime.group.children[0]!;
  assert.equal(train.userData.kind, 'neutral'); assert.equal(train.userData.area, 'EB'); assert.equal(train.userData.allocation, 'assumed fleet');
  assert.ok(train.children.some(c => c.visible)); assert.ok(train.children.every(c => c.position.y === 0));
  assert.match(roots[0].children[0].textContent, /1A11.*assumed fleet/); assert.doesNotMatch(runtime.status(), /LNER/);
  runtime.frame(0, false, 6000); assert.equal(runtime.group.visible, false); assert.equal(roots[0].hidden, true);
  runtime.dispose(); assert.equal(scene.children.length, 0); assert.equal(roots[0].removed, true);
});

test('unresolved EB headings stay unavailable and never start a stream; public/demo views fetch nothing', async () => {
  for (const [mode, hostname] of [['demo', 'localhost'], ['auto', 'example.org']] as const) {
    let calls = 0; const { parent } = parentFixture();
    const runtime = createEdinburghLive({ geometry, scene: new THREE.Scene(), camera: new THREE.Camera(), parent, mode, hostname, date: '', speed: 1,
      fetchImpl: async () => { ++calls; throw new Error('unexpected fetch'); } });
    await runtime.load(); assert.equal(calls, 0); assert.equal(runtime.state().ready, false); assert.match(runtime.status(), /unavailable/); runtime.dispose();
  }
  let streams = 0; const { parent } = parentFixture();
  const runtime = createEdinburghLive({ geometry, scene: new THREE.Scene(), camera: new THREE.Camera(), parent, mode: 'auto', hostname: 'localhost', date: '', speed: 1,
    fetchImpl: async () => new Response(JSON.stringify({ ...anchors, anchors: [] })),
    liveDependencies: { source: () => { ++streams; return {} as EventSource; } } });
  await runtime.load(); assert.equal(streams, 0); assert.equal(runtime.state().ready, false); assert.match(runtime.status(), /headings unresolved/); runtime.dispose();
});
