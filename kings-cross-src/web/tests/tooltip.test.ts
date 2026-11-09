import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { TrainView } from '../../core/motion.ts';
import type { BoardRow, BoardRows, BoardService } from '../src/board.ts';
import { ALMANAC_PILL, boardEntry, createTrainTooltip, describeTrain, pickTrain, placeTip, tipHtml, trainTip } from '../src/tooltip.ts';
import type { TipModel } from '../src/tooltip.ts';

// Every service, berth and train below is synthetic; no recording or timetable is a fixture.
const NOW = Date.UTC(2030, 0, 2, 10, 0);
const at = (h: number, m: number): number => Date.UTC(2030, 0, 2, h, m);

function view(extra: Partial<TrainView> = {}): TrainView {
  return { id: 1, description: '1A01', leading: { edge: undefined as never, t: 0, point: [0, 0] }, heading: 0, speed: 0, lengthM: 130, occupiedLengthM: 130, occupied: [],
    state: 'held', opacity: 1, targetBerth: 'SYN1', lastBerth: 'SYN1', blocked: false, distanceM: 0, reversals: 0, ...extra };
}
function service(extra: Partial<BoardService> = {}): BoardService {
  return { uid: 'S00001', headcode: '1A01', operator: 'GR', category: 'XX', date: '2030-01-02', serviceDate: '2030-01-02', stp: 'P', startDate: '2030-01-01', endDate: '2030-12-31',
    platform: '5', origin: 'SYNORG', destination: 'KNGX', arrival: '10:12:30', departure: null, publicArrival: '10:13', publicDeparture: null,
    arrivalMs: at(10, 12), departureMs: null, publicArrivalMs: at(10, 13), publicDepartureMs: null,
    originName: 'SYNTHETIC ORIGIN', destinationName: "KING'S CROSS LONDON", ...extra };
}
const standing = (platform: number, extra: Partial<BoardRow> = {}): { row: BoardRow; where: 'platform' } =>
  ({ row: { trainId: 1, headcode: '1A01', platform, state: 'standing', sinceMs: NOW - 192_000, stoodMs: 192_000, ...extra }, where: 'platform' });
const value = (model: TipModel, label: string): string | undefined => model.rows.find((r) => r.label === label)?.value;
const row = (model: TipModel, label: string) => model.rows.find((r) => r.label === label);

test('a capped formation tooltip preserves its birth reason and still calls the formation assumed', () => {
  const capped = { ...view(), formationNote: 'capped to platform length: P9, 159 m usable' };
  const model = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'gn387x4', view: capped, services: [service({ operator: 'GN' })] });
  assert.match(value(model, 'Drawn as')!, /formation assumed · capped to platform length: P9, 159 m usable$/);
  const unfit = { ...view(), formationNote: 'shortest available; exceeds platform length: P9, 159 m usable' };
  assert.match(value(describeTrain({ mode: 'replay', nowMs: NOW, description: '1A01', kind: 'tl700x8', view: unfit }), 'Drawn as')!, /all assumed · shortest available; exceeds platform length/);
});

test('a train standing at its booked platform shows service, booked times, platform, dwell and TRUST', () => {
  const s = service({ realtime: { eventType: 'ARRIVAL', actualArrivalMs: at(10, 14), variationMinutes: 1, platform: '5', trainId: '99A01SYN01' } });
  const model = describeTrain({ mode: 'live', nowMs: at(10, 20), description: '1A01', kind: 'lner9', view: view({ lastBerth: 'SYNB05' }),
    entry: { ...standing(5, { service: s, sinceMs: at(10, 12) }) }, services: [s] });
  assert.equal(model.headcode, '1A01');
  assert.equal(model.operator, 'LNER');
  assert.equal(value(model, 'Service'), "Synthetic Origin → King's Cross London");
  assert.equal(value(model, 'Booked'), 'arr 10:13');
  assert.equal(value(model, 'Platform'), 'P5 · as booked');
  assert.equal(value(model, 'State'), 'Standing, dwell 8:00 since observed');
  assert.equal(value(model, 'TD berth'), 'SYNB05');
  assert.equal(value(model, 'TRUST'), 'arrived 10:14, 1 min late · platform 5 · id 99A01SYN01');
  assert.equal(row(model, 'TRUST')!.warn, true);
  assert.equal(value(model, 'Schedule'), 'S00001 · express passenger');
  assert.equal(model.badge, undefined);
  assert.equal(model.rows.some((r) => r.label === 'Speed'), false);
});

test('a platform other than the booked one is flagged as changed', () => {
  const model = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view(), entry: { ...standing(6, { service: service() }) }, services: [service()] });
  assert.equal(value(model, 'Platform'), 'P6 · booked P5 · (changed)');
  assert.equal(row(model, 'Platform')!.warn, true);
  const unbooked = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view(), entry: { ...standing(6, { service: service({ platform: null }) }) } });
  assert.equal(value(unbooked, 'Platform'), 'P6');
  assert.equal(row(unbooked, 'Platform')!.warn, false);
});

test('a moving train gets a modelled speed in mph and km/h and the berth it heads for', () => {
  const model = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner5', view: view({ state: 'moving', speed: 12, lastBerth: 'SYN7', targetBerth: 'SYN9' }) });
  assert.equal(value(model, 'State'), 'Moving');
  assert.equal(value(model, 'Speed'), '27 mph (43 km/h), modelled');
  assert.equal(value(model, 'TD berth'), 'SYN7 → heading to SYN9');
  const crawl = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner5', view: view({ state: 'moving', speed: 0.1 }) });
  assert.equal(crawl.rows.some((r) => r.label === 'Speed'), false);
});

test('without a timetable match the card says so and names no operator or route', () => {
  const none = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view(), services: [service({ headcode: '2Z99' })] });
  assert.equal(none.operator, undefined);
  assert.equal(value(none, 'Timetable'), 'no match for 1A01');
  for (const label of ['Service', 'Booked', 'TRUST', 'Schedule']) assert.equal(value(none, label), undefined, label);
  assert.match(value(none, 'Drawn as')!, /^LNER 800\/1, 801\/2 · 9 cars · 234 m · all assumed$/);
  const unloaded = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view() });
  assert.equal(value(unloaded, 'Timetable'), 'not loaded');
  const matched = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view(), services: [service()] });
  assert.match(value(matched, 'Drawn as')!, /formation assumed$/);
});

test('a call with no TRUST report says none was received, and an actual in the future is not shown', () => {
  const none = describeTrain({ mode: 'replay', nowMs: NOW, description: '1A01', kind: 'lner9', view: view(), services: [service({ realtime: null })] });
  assert.equal(value(none, 'TRUST'), 'no report received');
  const future = describeTrain({ mode: 'replay', nowMs: NOW, description: '1A01', kind: 'lner9', view: view(),
    services: [service({ realtime: { eventType: 'ARRIVAL', actualArrivalMs: NOW + 60_000, variationMinutes: 4 } })] });
  assert.equal(value(future, 'TRUST'), '4 min late');
  const both = describeTrain({ mode: 'live', nowMs: NOW + 3_600_000, description: '1A01', kind: 'lner9', view: view(),
    services: [service({ realtime: { eventType: 'DEPARTURE', actualArrivalMs: at(10, 14), actualDepartureMs: at(10, 31), variationMinutes: -2 } })] });
  assert.equal(value(both, 'TRUST'), 'arrived 10:14 · departed 10:31, 2 min early');
  assert.equal(row(both, 'TRUST')!.warn, false);
  const onTime = describeTrain({ mode: 'live', nowMs: NOW + 3_600_000, description: '1A01', kind: 'lner9', view: view(),
    services: [service({ realtime: { eventType: 'ARRIVAL', actualArrivalMs: at(10, 13), variationMinutes: 0 } })] });
  assert.equal(value(onTime, 'TRUST'), 'arrived 10:13, on time');
});

test('an estimated train is labelled estimated, with the berth that has no map position', () => {
  const model = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9',
    view: view({ state: 'estimated', opacity: 0.55, speed: 8, lastBerth: 'SYNX1', unmappedBerth: 'SYNX1', targetBerth: 'SYN9' }) });
  assert.deepEqual(model.badge, { text: 'estimated', warn: true });
  assert.match(model.note!, /^Position is estimated along the expected route; TD does not report it\. Berth SYNX1 has no map position\.$/);
  assert.equal(value(model, 'TD berth'), 'SYNX1 (not on the map) → heading to SYN9');
  assert.equal(value(model, 'State'), 'Moving');
  const plain = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view({ state: 'moving', speed: 8 }) });
  assert.equal(plain.note, undefined);
  assert.equal(plain.badge, undefined);
});

test('a fading train says it is no longer reported and shows no speed', () => {
  const model = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view({ state: 'fading', opacity: 0.4, speed: 5 }) });
  assert.deepEqual(model.badge, { text: 'fading' });
  assert.equal(value(model, 'State'), 'Fading out, no longer reported');
  assert.equal(model.rows.some((r) => r.label === 'Speed'), false);
});

test('a sample train is labelled a sample and claims no timetable, TRUST or berth', () => {
  const model = describeTrain({ mode: 'sample', nowMs: 0, description: '1S01', kind: 'lner9', entry: standing(1, { headcode: '1S01', sample: true }), services: [service({ headcode: '1S01' })] });
  assert.deepEqual(model.badge, { text: 'sample' });
  assert.equal(model.operator, undefined);
  assert.equal(value(model, 'Timetable'), 'none: a sample, not a real service');
  assert.equal(value(model, 'Platform'), 'P1 (sample)');
  assert.equal(value(model, 'State'), 'Standing (sample)');
  for (const label of ['Service', 'TRUST', 'TD berth', 'Speed']) assert.equal(value(model, label), undefined, label);
});

test('approaching and recently departed trains name their platforms and distance', () => {
  const approach: BoardRow = { trainId: 1, headcode: '1A01', state: 'approaching', platforms: [5, 6, 7, 9], distanceM: 412 };
  const a = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view({ state: 'moving', speed: 6 }), entry: { row: approach, where: 'approaching' }, services: [service()] });
  assert.equal(value(a, 'Platform'), 'heading for P5–P7, P9 · booked P5');
  assert.equal(value(a, 'State'), 'Moving, approaching, 410 m from the platform');
  const left: BoardRow = { trainId: 1, headcode: '1A01', state: 'leaving', platform: 5, leftAtMs: at(10, 20) };
  const d = describeTrain({ mode: 'live', nowMs: at(10, 21), description: '1A01', kind: 'lner9', view: view({ state: 'moving', speed: 4 }), entry: { row: left, where: 'departed' } });
  assert.equal(value(d, 'Platform'), 'was P5');
  assert.equal(value(d, 'State'), 'Moving, left the platform at 10:20');
  const wait = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view({ state: 'held', speed: 0, blocked: true }) });
  assert.equal(value(wait, 'State'), 'Standing, held for the train ahead');
});

test('a stale standing row does not contradict a train that has started to move', () => {
  const model = describeTrain({ mode: 'live', nowMs: NOW, description: '1A01', kind: 'lner9', view: view({ state: 'moving', speed: 3 }), entry: standing(5) });
  assert.equal(value(model, 'State'), 'Moving');
});

test('card text is escaped, so a feed string cannot add markup', () => {
  const html = tipHtml({ headcode: '<img src=x>', operator: 'A&B', rows: [{ label: '"l"', value: "<script>alert('x')</script>" }], note: '<b>' });
  assert.doesNotMatch(html, /<img|<script|<b>/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /A&amp;B/);
});

test('trainTip finds a train by id, prefers the board row\'s call, and has nothing for an unknown id', () => {
  const rowService = service({ uid: 'FROMROW', origin: 'ROWORIG', originName: 'ROW ORIGIN' });
  const rows = { platforms: [{ platform: 4, trains: [] as BoardRow[] }, { platform: 5, trains: [standing(5, { service: rowService }).row] }], approaching: [], departed: [], due: [], timetable: true, timeMs: NOW, mode: 'live' } as BoardRows;
  const ctx = { mode: 'live' as const, nowMs: NOW, views: [view({ id: 1 }), view({ id: 2, description: '2B02' })], rows, services: [service()] };
  assert.equal(boardEntry(rows, 1)?.where, 'platform');
  assert.equal(boardEntry(rows, 3), undefined);
  assert.equal(value(trainTip(ctx, 1, 'lner9')!, 'Service'), 'Row Origin → King\'s Cross London');
  const other = trainTip(ctx, 2, 'lner5')!;
  assert.equal(other.headcode, '2B02');
  assert.equal(value(other, 'Timetable'), 'no match for 2B02');
  assert.equal(trainTip(ctx, 9, 'lner5'), null);
  assert.equal(trainTip(ctx, undefined, 'lner5'), null);
});

test('the card sits below and right of the pointer, and flips at the right and bottom edges', () => {
  const size = { w: 280, h: 150 }, port = { w: 1280, h: 800 };
  assert.deepEqual(placeTip({ x: 400, y: 300 }, size, port), { x: 414, y: 314 });
  assert.deepEqual(placeTip({ x: 1200, y: 300 }, size, port), { x: 1200 - 14 - 280, y: 314 });
  assert.deepEqual(placeTip({ x: 400, y: 760 }, size, port), { x: 414, y: 760 - 14 - 150 });
  assert.deepEqual(placeTip({ x: 1200, y: 760 }, size, port), { x: 906, y: 596 });
});

test('the card stays inside a 390 px viewport wherever the pointer is', () => {
  const size = { w: 280, h: 190 }, port = { w: 390, h: 844 };
  for (let x = 0; x <= 390; x += 13) for (let y = 0; y <= 844; y += 17) {
    const p = placeTip({ x, y }, size, port, [ALMANAC_PILL]);
    assert.ok(p.x >= 8 && p.x + size.w <= port.w - 8, `x ${p.x} for ${x},${y}`);
    assert.ok(p.y >= 8 && p.y + size.h <= port.h - 8, `y ${p.y} for ${x},${y}`);
  }
});

test('the card keeps clear of the almanac pill', () => {
  const size = { w: 280, h: 150 }, port = { w: 1280, h: 800 };
  const overlaps = (p: { x: number; y: number }): boolean => p.x < ALMANAC_PILL.x + ALMANAC_PILL.w && p.x + size.w > ALMANAC_PILL.x && p.y < ALMANAC_PILL.y + ALMANAC_PILL.h && p.y + size.h > ALMANAC_PILL.y;
  // A pointer on the pill puts the preferred spot (14,14) under it.
  const p = placeTip({ x: 0, y: 0 }, size, port, [ALMANAC_PILL]);
  assert.equal(overlaps(p), false);
  assert.equal(p.y, ALMANAC_PILL.h + 8);
  assert.equal(overlaps(placeTip({ x: 60, y: 20 }, size, port, [ALMANAC_PILL])), false);
  for (let x = 0; x <= 400; x += 7) for (let y = 0; y <= 120; y += 7) assert.equal(overlaps(placeTip({ x, y }, size, port, [ALMANAC_PILL])), false, `${x},${y}`);
});

// A scene of box "cars" in the real layout: a root group per train, one child per car, each car a
// node whose local z runs from the car's front end back.
const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.5, 9000);
camera.position.set(0, 60, 80); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
function car(name: string, x: number, z: number, length = 26): THREE.Group {
  const node = new THREE.Group(); node.name = name;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.7, 4, length), new THREE.MeshBasicMaterial());
  body.position.set(0, 2, length / 2); node.add(body);
  node.position.set(x, 0, z);
  return node;
}
function train(name: string, x: number, z: number, cars = 2): THREE.Group {
  const group = new THREE.Group(); group.name = name;
  for (let i = 0; i < cars; i++) group.add(car(`car-${i}`, x, z + i * 26));
  group.updateMatrixWorld(true);
  return group;
}
function rayAt(world: THREE.Vector3): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  const ndc = world.clone().project(camera);
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  return raycaster;
}
const pixel = (world: THREE.Vector3): { x: number; y: number } => {
  const ndc = world.clone().project(camera);
  return { x: (ndc.x + 1) / 2 * 800, y: (1 - ndc.y) / 2 * 600 };
};

test('pickTrain hits a drawn car and nothing beside it', () => {
  const a = train('A', 0, -20);
  assert.equal(pickTrain(rayAt(new THREE.Vector3(0, 2, -5)), [a])?.group, a);
  assert.equal(pickTrain(rayAt(new THREE.Vector3(0, 2, -5)), [a])?.exact, true);
  assert.equal(pickTrain(rayAt(new THREE.Vector3(20, 0, -5)), [a]), undefined);
});

test('pickTrain skips a hidden car and a hidden train, and returns the nearer of two', () => {
  const a = train('A', 0, -20);
  const target = new THREE.Vector3(0, 2, -5);
  a.children[0]!.visible = false; // no pose: its stale position must not be hit
  assert.equal(pickTrain(rayAt(target), [a]), undefined);
  a.children[0]!.visible = true; a.visible = false;
  assert.equal(pickTrain(rayAt(target), [a]), undefined);
  a.visible = true;
  const behind = train('B', 0, -20); behind.position.y = -3; behind.updateMatrixWorld(true);
  assert.equal(pickTrain(rayAt(target), [behind, a])?.group, a);
});

test('a few pixels of slack catch a thin train, and a mesh hit always beats a near miss', () => {
  const thin = train('thin', 0, -20);
  const beside = new THREE.Vector3(3.6, 2, -5); // 2.25 m outside the 2.7 m wide car
  assert.equal(pickTrain(rayAt(beside), [thin]), undefined);
  const near = pickTrain(rayAt(beside), [thin], () => 3);
  assert.equal(near?.group, thin);
  assert.equal(near?.exact, false);
  assert.equal(pickTrain(rayAt(new THREE.Vector3(6, 2, -5)), [thin], () => 3), undefined);
  const front = train('front', 0, -20); front.position.set(3.6, 0, 40); front.updateMatrixWorld(true); // nearer the camera, only a near miss
  assert.equal(pickTrain(rayAt(new THREE.Vector3(0, 2, -5)), [front, thin], () => 12)?.group, thin);
});

test('a hidden part inside a visible car is not hit', () => {
  const t = train('A', 0, -20, 1);
  const part = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 4), new THREE.MeshBasicMaterial());
  part.position.set(8, 2, 13); part.visible = false; // sticks out beside the car, as an unused level of detail might
  t.children[0]!.add(part); t.updateMatrixWorld(true);
  const ray = rayAt(new THREE.Vector3(8, 2, -7));
  assert.notEqual(pickTrain(ray, [t])?.exact, true);
  part.visible = true;
  assert.equal(pickTrain(ray, [t])?.exact, true);
});

test('the same ray stops hitting a train once it has moved away', () => {
  const t = train('A', 0, -20);
  const ray = rayAt(new THREE.Vector3(0, 2, -5));
  assert.equal(pickTrain(ray, [t])?.group, t);
  t.position.z -= 100; t.updateMatrixWorld(true);
  assert.equal(pickTrain(ray, [t]), undefined);
});

// ---- the controller, with a fake page ----
class FakeStyle { transform = ''; }
class FakeElement {
  ownerDocument: FakeDocument; className = ''; hidden = false; innerHTML = ''; textContent = ''; offsetWidth = 280; offsetHeight = 150;
  children: FakeElement[] = []; parentNode: FakeElement | null = null; attrs = new Map<string, string>(); style = new FakeStyle();
  constructor(doc: FakeDocument) { this.ownerDocument = doc; }
  setAttribute(name: string, v: string): void { this.attrs.set(name, v); }
  append(...kids: FakeElement[]): void { for (const k of kids) { k.parentNode = this; this.children.push(k); } }
  remove(): void { this.parentNode!.children = this.parentNode!.children.filter((c) => c !== this); this.parentNode = null; }
}
class FakeView extends EventTarget { innerWidth = 800; innerHeight = 600; }
class FakeDocument { defaultView = new FakeView(); createElement(_tag: string): FakeElement { return new FakeElement(this); } }
class FakeCanvas extends EventTarget { getBoundingClientRect(): { left: number; top: number; width: number; height: number } { return { left: 0, top: 0, width: 800, height: 600 }; } }
let clockMs = 1000;
function fire(target: EventTarget, type: string, props: Record<string, unknown>): void {
  const event = new Event(type);
  const merged = { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, timeStamp: clockMs, ...props };
  for (const [k, v] of Object.entries(merged)) Object.defineProperty(event, k, { value: v });
  target.dispatchEvent(event);
}
function harness(trains: THREE.Object3D[], info?: (g: THREE.Object3D) => TipModel | null) {
  const doc = new FakeDocument(), parent = new FakeElement(doc), canvas = new FakeCanvas();
  const calls = { groups: 0, info: 0 };
  let list = trains;
  const tip = createTrainTooltip({ parent: parent as unknown as HTMLElement, canvas: canvas as unknown as HTMLCanvasElement, camera,
    groups: () => { calls.groups++; return list; },
    info: (g) => { calls.info++; return info ? info(g) : { headcode: g.name, rows: [{ label: 'calls', value: String(calls.info) }] }; } });
  const root = parent.children[0]!;
  return { tip, root, canvas, doc, parent, calls, view: doc.defaultView, set: (next: THREE.Object3D[]) => { list = next; } };
}
const move = (h: { canvas: FakeCanvas }, p: { x: number; y: number }, extra: Record<string, unknown> = {}): void => fire(h.canvas, 'pointermove', { clientX: p.x, clientY: p.y, ...extra });

test('hovering a train shows its card beside the pointer; leaving hides it', () => {
  const a = train('A', 0, -20);
  const h = harness([a]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  h.tip.frame();
  assert.equal(h.root.hidden, true);
  assert.equal(h.calls.groups, 0, 'no pointer, no hit test');
  move(h, p); h.tip.frame();
  assert.equal(h.root.hidden, false);
  assert.match(h.root.children[1]!.innerHTML, /<strong>A<\/strong>/);
  assert.equal(h.root.style.transform, `translate(${Math.round(p.x + 14)}px, ${Math.round(p.y + 14)}px)`);
  assert.equal(h.calls.groups, 1);
  move(h, { x: p.x + 300, y: p.y + 200 }); h.tip.frame();
  assert.equal(h.root.hidden, true, 'pointer off the train');
  move(h, p); h.tip.frame();
  assert.equal(h.root.hidden, false);
  fire(h.canvas, 'pointerleave', {}); h.tip.frame();
  assert.equal(h.root.hidden, true, 'pointer left the canvas');
});

test('a train moving under a still pointer keeps the card attached and its text live', () => {
  const a = train('A', 0, -20);
  const h = harness([a], (g) => ({ headcode: g.name, rows: [{ label: 'z', value: String(Math.round(g.children[0]!.position.z)) }] }));
  const p = pixel(new THREE.Vector3(0, 2, -5));
  move(h, p); h.tip.frame();
  assert.match(h.root.children[1]!.innerHTML, /<dd>-20<\/dd>/);
  const placed = h.root.style.transform;
  // The pointer never moves; the train creeps 4 m a frame, so the pointer stays over its 52 m length for a while.
  for (const car of a.children) car.position.z += 4;
  a.updateMatrixWorld(true); h.tip.frame();
  assert.equal(h.root.hidden, false);
  assert.match(h.root.children[1]!.innerHTML, /<dd>-16<\/dd>/, 'content updated without any pointer event');
  assert.equal(h.root.style.transform, placed, 'card stays at the pointer');
  for (const car of a.children) car.position.z += 200;
  a.updateMatrixWorld(true); h.tip.frame();
  assert.equal(h.root.hidden, true, 'the train has left the pointer');
  for (const car of a.children) car.position.z -= 200;
  a.updateMatrixWorld(true); h.tip.frame();
  assert.equal(h.root.hidden, false, 'and it is found again when it returns');
});

test('the pointer is hit tested at most once per frame, and the list of trains is read once', () => {
  const h = harness([train('A', 0, -20), train('B', 40, -20)]);
  move(h, pixel(new THREE.Vector3(0, 2, -5)));
  for (let i = 1; i <= 5; i++) { h.tip.frame(); assert.equal(h.calls.groups, i); }
  assert.equal(h.calls.info, 5);
});

test('the card hides while the camera is dragged and returns when the button is released', () => {
  const a = train('A', 0, -20);
  const h = harness([a]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  move(h, p); h.tip.frame();
  assert.equal(h.root.hidden, false);
  fire(h.canvas, 'pointerdown', { clientX: p.x, clientY: p.y, button: 0 });
  h.tip.frame();
  assert.equal(h.root.hidden, false, 'a press that has not moved is not a drag');
  move(h, { x: p.x + 2, y: p.y }); h.tip.frame();
  assert.equal(h.root.hidden, false, 'a 2 px wobble is not a drag');
  move(h, { x: p.x + 9, y: p.y + 1 }); h.tip.frame();
  assert.equal(h.root.hidden, true, 'dragging');
  move(h, p); h.tip.frame();
  assert.equal(h.root.hidden, true, 'still dragging after returning over the train');
  fire(h.canvas, 'pointerup', { clientX: p.x, clientY: p.y });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
});

test('a touch tap on a train shows its card, which follows the train; a tap elsewhere hides it', () => {
  const a = train('A', 0, -20);
  const h = harness([a]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: p.x, clientY: p.y, timeStamp: clockMs + 80 });
  fire(h.canvas, 'pointerleave', { pointerType: 'touch' });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
  const first = h.root.style.transform;
  // The finger has gone; the train moves 10 m and the card goes with it.
  for (const car of a.children) car.position.z += 10;
  a.updateMatrixWorld(true); h.tip.frame();
  assert.equal(h.root.hidden, false);
  assert.notEqual(h.root.style.transform, first, 'the card moved with the train');
  const groupsBefore = h.calls.groups;
  h.tip.frame();
  assert.equal(h.calls.groups, groupsBefore + 1);
  const empty = pixel(new THREE.Vector3(30, 0, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: empty.x, clientY: empty.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: empty.x, clientY: empty.y, timeStamp: clockMs + 80 });
  h.tip.frame();
  assert.equal(h.root.hidden, true, 'a tap on empty ground clears it');
});

test('a touch drag or pinch is not a tap, hides a pinned card while it lasts, and a train that goes clears the pin', () => {
  const a = train('A', 0, -20);
  const h = harness([a]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: p.x, clientY: p.y, timeStamp: clockMs + 80 });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 300, clientY: 300 });
  fire(h.canvas, 'pointermove', { pointerType: 'touch', pointerId: 7, clientX: 340, clientY: 300 });
  h.tip.frame();
  assert.equal(h.root.hidden, true, 'hidden while the camera moves');
  fire(h.canvas, 'pointerup', { pointerType: 'touch', pointerId: 7, clientX: 340, clientY: 300, timeStamp: clockMs + 90 });
  h.tip.frame();
  assert.equal(h.root.hidden, false, 'the pin survives a drag and the card returns');
  // A drag that ends over empty ground is not a tap, so it does not clear the pin.
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', pointerId: 8, clientX: 700, clientY: 500 });
  fire(h.canvas, 'pointermove', { pointerType: 'touch', pointerId: 8, clientX: 760, clientY: 520 });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', pointerId: 8, clientX: 760, clientY: 520, timeStamp: clockMs + 90 });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
  h.set([]); h.tip.frame();
  assert.equal(h.root.hidden, true, 'the train is gone');
  h.set([a]); h.tip.frame();
  assert.equal(h.root.hidden, true, 'and the pin was dropped with it');
});

test('a pinned card moves to a car still on the canvas when the tapped car leaves it, and hides while none is', () => {
  const t = new THREE.Group(); t.name = 'T';
  t.add(car('car-0', 0, -20), car('car-1', 30, -20));
  t.updateMatrixWorld(true);
  const h = harness([t]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: p.x, clientY: p.y, timeStamp: clockMs + 80 });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
  const cardAt = (a: { x: number; y: number }): string => {
    const c = placeTip(a, { w: 280, h: 150 }, { w: 800, h: 600 }, [ALMANAC_PILL]);
    return `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)`;
  };
  assert.equal(h.root.style.transform, cardAt(p), 'anchored on the tapped point');
  t.children[0]!.position.x = 900; t.updateMatrixWorld(true); // the tapped car is far off the canvas; the other is not
  h.tip.frame();
  const second = pixel(new THREE.Vector3(30, 2, -7)); // the middle of car-1
  assert.equal(h.root.hidden, false);
  assert.equal(h.root.style.transform, cardAt(second), 'followed to the car still in view');
  assert.notEqual(cardAt(second), cardAt(p));
  t.children[1]!.position.x = 900; t.updateMatrixWorld(true);
  h.tip.frame();
  assert.equal(h.root.hidden, true, 'no car on the canvas');
  t.children[1]!.position.x = 30; t.updateMatrixWorld(true);
  h.tip.frame();
  assert.equal(h.root.hidden, false, 'the pin was kept, so the card returns with the train');
});

test('a second finger down makes a gesture, not a tap', () => {
  const h = harness([train('A', 0, -20)]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', pointerId: 1, clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 700, clientY: 500 });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', pointerId: 1, clientX: p.x, clientY: p.y, timeStamp: clockMs + 60 });
  h.tip.frame();
  assert.equal(h.root.hidden, true, 'the first finger came up quickly over a train, but a second was down');
  fire(h.canvas, 'pointerup', { pointerType: 'touch', pointerId: 2, clientX: 700, clientY: 500, timeStamp: clockMs + 70 });
  h.tip.frame();
  assert.equal(h.root.hidden, true);
  // The two fingers can also come up between two frames (the end of a pinch), with no frame() between to clear a tap: the rule itself has to
  // have marked BOTH as part of a gesture when the second came down, whichever lifts first. Both rest on the train, so a tap from either would show the card.
  const p2 = pixel(new THREE.Vector3(0, 2, 20)); // the train's second car
  const where = new Map([[1, p], [2, p2]]);
  const lone = (spot: { x: number; y: number }): boolean => {
    const g = harness([train('A', 0, -20)]);
    fire(g.canvas, 'pointerdown', { pointerType: 'touch', pointerId: 1, clientX: spot.x, clientY: spot.y });
    fire(g.canvas, 'pointerup', { pointerType: 'touch', pointerId: 1, clientX: spot.x, clientY: spot.y, timeStamp: clockMs + 60 });
    g.tip.frame();
    return !g.root.hidden;
  };
  assert.ok(lone(p) && lone(p2), 'control: a lone finger on either spot is a tap, so only the second finger can be what keeps the card away below');
  for (const order of [[1, 2], [2, 1]]) {
    const g = harness([train('A', 0, -20)]);
    for (const id of [1, 2]) fire(g.canvas, 'pointerdown', { pointerType: 'touch', pointerId: id, clientX: where.get(id)!.x, clientY: where.get(id)!.y });
    for (const id of order) fire(g.canvas, 'pointerup', { pointerType: 'touch', pointerId: id, clientX: where.get(id)!.x, clientY: where.get(id)!.y, timeStamp: clockMs + 60 });
    g.tip.frame();
    assert.equal(g.root.hidden, true, `both fingers lifted between two frames, in the order ${order.join(' then ')}: a card means a finger of the pinch was taken for a tap`);
  }
});

test('a pinned train the page can no longer describe is dropped, not shown again later', () => {
  let known = true;
  const h = harness([train('A', 0, -20)], (g) => known ? { headcode: g.name, rows: [] } : null);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: p.x, clientY: p.y, timeStamp: clockMs + 80 });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
  known = false; h.tip.frame();
  assert.equal(h.root.hidden, true);
  known = true; h.tip.frame();
  assert.equal(h.root.hidden, true, 'the pin went with the train\'s card');
});

test('a pinned card hides while its train is behind the camera', () => {
  const t = train('A', 0, -20, 1);
  const h = harness([t]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: p.x, clientY: p.y, timeStamp: clockMs + 80 });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
  t.children[0]!.position.set(0, 90, 120); t.updateMatrixWorld(true); // back along the view axis, behind the camera
  h.tip.frame();
  assert.equal(h.root.hidden, true);
});

test('a mouse moving over the canvas takes over from a tapped card', () => {
  const h = harness([train('A', 0, -20)]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: p.x, clientY: p.y, timeStamp: clockMs + 80 });
  h.tip.frame();
  assert.equal(h.root.hidden, false);
  move(h, pixel(new THREE.Vector3(30, 0, -5))); h.tip.frame();
  assert.equal(h.root.hidden, true, 'the mouse is over empty ground');
});

test('a slow touch press is not a tap', () => {
  const h = harness([train('A', 0, -20)]);
  const p = pixel(new THREE.Vector3(0, 2, -5));
  fire(h.canvas, 'pointerdown', { pointerType: 'touch', clientX: p.x, clientY: p.y });
  fire(h.canvas, 'pointerup', { pointerType: 'touch', clientX: p.x, clientY: p.y, timeStamp: clockMs + 900 });
  h.tip.frame();
  assert.equal(h.root.hidden, true);
});

test('the card is placed clear of the pill and inside a 390 px viewport', () => {
  const h = harness([train('A', 0, -20)]);
  h.view.innerWidth = 390; h.view.innerHeight = 844;
  const p = pixel(new THREE.Vector3(0, 2, -5)); // lands inside the 800 px fake canvas, past 390: the card flips and clamps
  move(h, p); h.tip.frame();
  const [x, y] = /translate\((-?\d+)px, (-?\d+)px\)/.exec(h.root.style.transform)!.slice(1).map(Number) as [number, number];
  assert.ok(x >= 8 && x + 280 <= 390 - 8, `x ${x}`);
  assert.ok(y >= 8 && y + 150 <= 844 - 8, `y ${y}`);
});

test('dispose removes the card and every listener', () => {
  const h = harness([train('A', 0, -20)]);
  assert.equal(h.parent.children.length, 1);
  h.tip.dispose();
  assert.equal(h.parent.children.length, 0);
  move(h, pixel(new THREE.Vector3(0, 2, -5)));
  h.tip.frame();
  assert.equal(h.calls.groups, 0, 'its listeners are gone');
});
