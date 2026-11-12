import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildGraph } from '../../core/graph.ts';
import { waverleyTrackData } from '../../core/waverley-anchors.ts';
import type { WaverleyAnchorScene } from '../../core/waverley-anchors.ts';
import type { AnchorMap } from '../../core/anchors.ts';
import { rowsForEvidence } from '../../core/train-neutral.ts';
import { matchBooked } from '../../core/edinburgh-diagrams.ts';
import type { FleetTable } from '../../core/edinburgh-diagrams.ts';
import { EDINBURGH_FLEET } from '../src/edinburgh-fleet.ts';
import { bookedServiceFor, createEdinburghLive, createEdinburghMotion, edinburghLiveDependencies, validateEdinburghAnchors } from '../src/edinburgh-live.ts';

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
    fetchImpl: async input => { urls.push(String(input)); return String(input).includes('/fleet') ? new Response('{}', { status: 404 }) : new Response(String(input).includes('/anchors') ? JSON.stringify(anchors)
      : JSON.stringify({ t: 5000, e: { kind: 'snapshot', area: 'EB', berths: { SYN1: '1A11' } } }) + '\n'); } });
  await runtime.load(); runtime.frame(0, true, 4000);
  assert.equal(runtime.state().trains.length, 0, 'do not publish a future snapshot');
  runtime.frame(0, true, 5000);
  assert.deepEqual(urls, ['/relay/anchors?area=EB', '/relay/fleet?area=EB', '/relay/recording?area=EB&date=20260101']);
  assert.match(runtime.status(), /fleet: no evidence \(no table\); neutral/, 'a missing fleet table is noted, not fatal');
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

// A synthetic booked-diagram table. The replay clock below starts on Thursday 1970-01-01; whichever offset London had
// that year, its first hour is within 30 minutes of 00:30 or 01:30.
const fleetTable: FleetTable = { source: 'synthetic', builtAt: '2026-11-10T00:00:00.000Z', workings: [
  { headcode: '1A11', days: 'ThO', edinburghMinutes: [30, 90], units: [{ diagram: 'ZZ101', class: '385', cars: 3 }] },
  { headcode: '1A12', days: 'SX', edinburghMinutes: [600], units: [{ diagram: 'ZZ101', class: '385', cars: 3 }, { diagram: 'ZZ102', class: '385', cars: 4 }] },
] };

test('bookedServiceFor answers from the table as it stands at each birth, and gives nothing without one', () => {
  let table: FleetTable | undefined;
  const serviceFor = bookedServiceFor(() => table);
  const tuesday = Date.UTC(2026, 10, 10, 10, 0);
  assert.equal(serviceFor('1A12', tuesday), undefined, 'no table yet: neutral');
  table = fleetTable;
  assert.deepEqual(serviceFor('1A12', tuesday), { operator: 'SR', units: [{ class: '385', cars: 3 }, { class: '385', cars: 4 }], orderAssumed: true, basis: 'booked diagram' });
  assert.equal(serviceFor('1A99', tuesday), undefined, 'a headcode the diagrams do not book');
  assert.equal(serviceFor('1A12', Date.UTC(2026, 10, 7, 10, 0)), undefined, 'Saturday: not a day of the working');
});

async function replayWith(fleet: (init?: RequestInit) => Response | Promise<Response>, anchorsStatus = 200) {
  const { parent } = parentFixture(), calls: { url: string; cache?: RequestCache }[] = [];
  const runtime = createEdinburghLive({ geometry, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), parent,
    mode: 'replay', hostname: 'localhost', date: '20260101', speed: 10,
    fetchImpl: async (input, init) => {
      const url = String(input); calls.push({ url, cache: init?.cache });
      if (url.includes('/fleet')) return fleet(init);
      if (url.includes('/anchors')) return new Response(JSON.stringify(anchors), { status: anchorsStatus });
      return new Response(JSON.stringify({ t: 5000, e: { kind: 'snapshot', area: 'EB', berths: { SYN1: '1A11' } } }) + '\n');
    } });
  await runtime.load(); runtime.frame(0, true, 5000);
  return { runtime, calls };
}

test('EB fetches the booked fleet after the anchors and reports it; the booked evidence reaches the births', async () => {
  const { runtime, calls } = await replayWith(() => new Response(JSON.stringify({ booked: fleetTable, ptac: null })));
  assert.deepEqual(calls.map(c => c.url), ['/relay/anchors?area=EB', '/relay/fleet?area=EB', '/relay/recording?area=EB&date=20260101']);
  assert.ok(calls.every(c => c.cache === 'no-store'));
  assert.equal(runtime.state().ready, true);
  assert.match(runtime.status(), /fleet: booked diagrams \(2 workings\)/);
  assert.doesNotMatch(runtime.status(), /allocations unavailable/);
  // 1A11 is booked as one 385 3-car. The train is drawn from it when the fleet table has a ScotRail row for it,
  // and stays the neutral assumed fleet when it has none.
  const expected = rowsForEvidence(EDINBURGH_FLEET, matchBooked(fleetTable, '1A11', 5000)) ? 'booked diagram' : 'assumed fleet';
  assert.equal(runtime.group.children[0]!.userData.allocation, expected);
  runtime.dispose();
});

test('EB carries on neutral, and says so, when the fleet table is absent, refused, invalid or unreachable', async () => {
  const cases: [() => Response | Promise<Response>, RegExp][] = [
    [() => new Response('{}', { status: 404 }), /fleet: no evidence \(no table\); neutral/],
    [() => new Response('{}', { status: 502 }), /fleet: no evidence \(502\); neutral/],
    [() => new Response('not json'), /fleet: no evidence \(table unreadable or invalid\); neutral/],
    [() => new Response(JSON.stringify({ booked: { ...fleetTable, workings: [{ ...fleetTable.workings[0]!, headcode: 'x' }] }, ptac: null })), /table unreadable or invalid/],
    [() => new Response(JSON.stringify({ booked: { ...fleetTable, extra: 1 }, ptac: null })), /table unreadable or invalid/],
    [() => new Response(JSON.stringify(fleetTable)), /table unreadable or invalid/],
    [() => new Response(JSON.stringify({ booked: fleetTable, ptac: null, extra: 1 })), /table unreadable or invalid/],
    [() => new Response(JSON.stringify({ booked: null, ptac: { format: 'kx-ptac/0', trains: {} } })), /table unreadable or invalid/],
    [() => { throw new Error('network down'); }, /table unreadable or invalid/],
  ];
  for (const [fleet, message] of cases) {
    const { runtime } = await replayWith(fleet);
    assert.equal(runtime.state().ready, true, 'positions still work');
    assert.equal(runtime.state().error, undefined);
    assert.match(runtime.status(), message);
    assert.doesNotMatch(runtime.status(), /booked diagrams/);
    assert.equal(runtime.group.children[0]!.userData.allocation, 'assumed fleet');
    runtime.dispose();
  }
});

test('EB asks for no fleet table while its anchors are unavailable', async () => {
  const { runtime, calls } = await replayWith(() => new Response(JSON.stringify({ booked: fleetTable, ptac: null })), 404);
  assert.deepEqual(calls.map(c => c.url), ['/relay/anchors?area=EB']);
  assert.equal(runtime.state().ready, false);
  runtime.dispose();
  // ... nor while the anchors resolve to no placed berth.
  const urls: string[] = [], { parent } = parentFixture();
  const unresolved = createEdinburghLive({ geometry, scene: new THREE.Scene(), camera: new THREE.Camera(), parent, mode: 'auto', hostname: 'localhost', date: '', speed: 1,
    fetchImpl: async input => { urls.push(String(input)); return new Response(JSON.stringify({ ...anchors, anchors: [] })); } });
  await unresolved.load();
  assert.deepEqual(urls, ['/relay/anchors?area=EB']);
  assert.match(unresolved.status(), /headings unresolved/);
  unresolved.dispose();
});

test('EB gives its scene one instanced pool and one instanced halo for the light of all its trains: a lit 385 casts a pool ahead of its nose, the view hides it and disposal takes it away', async () => {
  const { parent } = parentFixture(), scene = new THREE.Scene();
  const runtime = createEdinburghLive({ geometry, scene, camera: new THREE.PerspectiveCamera(), parent,
    mode: 'replay', hostname: 'localhost', date: '20260101', speed: 10,
    fetchImpl: async input => {
      const url = String(input);
      if (url.includes('/fleet')) return new Response(JSON.stringify({ booked: fleetTable, ptac: null }));
      if (url.includes('/anchors')) return new Response(JSON.stringify(anchors));
      return new Response(JSON.stringify({ t: 5000, e: { kind: 'snapshot', area: 'EB', berths: { SYN1: '1A11' } } }) + '\n');
    } });
  // two frames: the second draws the light again, it does not pile up on the first
  await runtime.load(); runtime.frame(0, true, 5000); runtime.frame(0, true, 5100);
  const lights = scene.getObjectByName('train-lamp-lights')!;
  assert.ok(lights, 'the scene carries the trains\' light');
  const instanced: THREE.InstancedMesh[] = [];
  scene.traverse(o => { if ((o as THREE.InstancedMesh).isInstancedMesh) instanced.push(o as THREE.InstancedMesh); });
  assert.deepEqual(instanced.map(m => m.name).sort(), ['lamp-glow', 'lamp-pool'], 'two draws for the whole scene');
  const train = runtime.group.children[0]!, view = runtime.state().trains[0]!, pool = instanced.find(m => m.name === 'lamp-pool')!;
  // the booked diagram has a ScotRail 385 for 1A11 (the neutral fallback has no lamps to light); it is at no platform, so it runs in service state: white at its front
  const lit = String(train.userData.kind).startsWith('sr385');
  assert.equal(lit, rowsForEvidence(EDINBURGH_FLEET, matchBooked(fleetTable, '1A11', 5000)) !== undefined, 'a 385 where the table books one');
  assert.equal(pool.count, lit ? 1 : 0, 'one pool for the one lit end');
  if (lit) {
    const m = new THREE.Matrix4(), at = new THREE.Vector3(), q = new THREE.Quaternion(), size = new THREE.Vector3();
    pool.getMatrixAt(0, m); m.decompose(at, q, size);
    // a TrainView's heading is a compass bearing (core/motion.ts: atan2(x, -z), 0 towards -z), so the world direction of travel is (sin, -cos)
    const far = new THREE.Vector3(0, 0, 1).applyQuaternion(q), ahead = [Math.sin(view.heading), -Math.cos(view.heading)];
    assert.ok(Math.abs(far.x - ahead[0]!) < 0.05 && Math.abs(far.z - ahead[1]!) < 0.05, `the pool runs the way the train is heading: ${far.x.toFixed(3)}, ${far.z.toFixed(3)} against ${ahead}`);
    const nose = [at.x - far.x * size.z / 2, at.z - far.z * size.z / 2];
    assert.ok(Math.hypot(nose[0]! - view.leading.point[0], nose[1]! - view.leading.point[1]) < 1.5, `from the train's nose: ${nose} against ${view.leading.point}`);
  }
  assert.match(readFileSync(new URL('../src/edinburgh-live.ts', import.meta.url), 'utf8'), /lights\.add\(item\.group, view\.opacity\)/, 'a train that is fading gives its light the same fade (a source pin: the trains of this scene are all opaque)');
  runtime.frame(0, false, 6000);
  assert.equal(lights.visible, false, 'the view hides its light with its trains');
  runtime.dispose();
  assert.equal(scene.children.length, 0, 'and disposal takes it out of the scene');
});
