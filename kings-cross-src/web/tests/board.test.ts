import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import type { AnchorMap, BerthAnchor } from '../../core/anchors.ts';
import type { BoardRow, BoardTrain } from '../src/board.ts';
import { approachPlatforms, boardHtml, boardRows, createBoard } from '../src/board.ts';

// Every berth, route and train below is synthetic; no station inventory or recording is a fixture.
function network(nodes: readonly [number, number, number][], ways: readonly number[][]): Graph {
  return buildGraph({ nodes: [...nodes], rails: ways.map((ids, i) => ({ id: i + 1, nodes: ids, service: 'main', tunnel: false, bridge: false, layer: 0 })) });
}

function anchor(berth: string, from: number, to: number, t: number, platform?: string, evidence = 'synthetic'): BerthAnchor {
  return { berth, kind: platform === undefined ? 'signal' : 'platform', from, to, t, point: [0, 0], errorM: 1, evidence,
    ...(platform === undefined ? {} : { platform }) };
}

function anchors(items: BerthAnchor[], unmapped: AnchorMap['unmapped'] = []): AnchorMap {
  return { area: 'SYN', sources: ['synthetic'], anchors: items, unmapped };
}

function train(id: number, extra: Partial<BoardTrain> = {}): BoardTrain {
  return { id, description: `1A${String(id).padStart(2, '0')}`, ...extra };
}

function row(rows: ReturnType<typeof boardRows>, id: number): BoardRow | undefined {
  return [...rows.platforms.flatMap((p) => p.trains), ...rows.approaching, ...rows.departed].find((r) => r.trainId === id);
}

test('occupied interval matches a reverse-directed platform anchor on the same physical edge', () => {
  const graph = network([[1, 0, 0], [2, 100, 0]], [[1, 2]]);
  const edge = graph.edges[0]!;
  // The anchor is expressed from node 2 back to node 1: t=.2 is canonical edge t=.8.
  const map = anchors([anchor('SYNPLAT', 2, 1, 0.2, '4')]);
  const held = train(1, { state: 'held', speed: 0, lastBerth: 'unmapped',
    occupied: [{ edge, fromT: 0.7, toT: 0.9 }] });
  const rows = boardRows([held], map, { nowMs: 5000, graph });
  const platform = rows.platforms.find((p) => p.platform === 4)!;
  assert.deepEqual(rows.platforms.map((p) => p.platform), Array.from({ length: 11 }, (_, i) => i));
  assert.equal(rows.platforms[0]!.trains.length, 0);
  assert.equal(platform.trains.length, 1);
  assert.equal(platform.trains[0]!.headcode, '1A01');
  assert.equal(platform.trains[0]!.state, 'standing');
  assert.equal(platform.trains[0]!.platform, 4);
});

test('a held train resolves platform 10 from synthetic berth B010 when anchor metadata is absent', () => {
  const map = anchors([anchor('B010', 1, 2, 0.5)]);
  const held = train(10, { state: 'held', speed: 0, lastBerth: 'B010' });
  const rows = boardRows([held], map, { nowMs: 8000 });
  const platform = rows.platforms.find((p) => p.platform === 10)!;
  assert.deepEqual(platform.trains.map((r) => [r.headcode, r.state]), [['1A10', 'standing']]);
});

test('a moving train whose target is a platform remains in approaching', () => {
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const moving = train(1, { state: 'moving', speed: 8, lastBerth: 'outside', targetBerth: '1004' });
  const rows = boardRows([moving], map, { nowMs: 9000 });
  assert.equal(rows.platforms[4]!.trains.length, 0);
  assert.deepEqual(rows.approaching.map((r) => [r.headcode, r.platforms, r.state]), [['1A01', [4], 'approaching']]);
});

test('runtime fan-out reaches platforms recursively and approaching rows use curved graph distance', () => {
  const graph = network([
    [1, 0, 0], [2, 10, 0], [3, 10, 10], [4, 10, 20], [5, 5, 2],
  ], [[1, 2, 3, 4], [3, 5]]);
  const map = anchors([
    anchor('PLAT-A', 3, 4, 0.8, '1'),
    anchor('PLAT-B', 3, 5, 1, '2'),
    anchor('FAN', 2, 3, 0.5, undefined, 'Synthetic fan-out to PLAT-B, BRANCH; runtime evidence'),
  ], [{ berth: 'WITHHELD', reason: 'outside-network', detail: 'Boundary continuation north from FAN: synthetic route evidence', seen: 1 },
    { berth: 'BRANCH', reason: 'outside-network', detail: 'synthetic successors [PLAT-A]', seen: 1 }]);
  const arrivals = approachPlatforms(map);
  assert.deepEqual(arrivals.get('WITHHELD'), [1, 2]);
  const a = train(1, { description: '1A01', state: 'moving', speed: 10, lastBerth: 'WITHHELD',
    leading: { edge: graph.edges[0]!, t: 0.5, point: [5, 0] } });
  const b = train(2, { description: '1A02', state: 'moving', speed: 10, lastBerth: 'WITHHELD',
    leading: { edge: graph.edges[1]!, t: 0.5, point: [10, 5] } });
  const rows = boardRows([a, b], map, { nowMs: 10_000, graph, arrivals });
  assert.deepEqual(rows.approaching.map((r) => r.trainId), [2, 1]);
  assert.ok(Math.abs(rows.approaching[0]!.distanceM! - 13) < 1e-8);
  // PLAT-B is geometrically nearer to train 1, but the rail route to PLAT-A is shorter.
  assert.ok(Math.abs(rows.approaching[1]!.distanceM! - 23) < 1e-8);
});

test('departures retain their simulation timestamp and age out after the retention window', () => {
  const graph = network([[1, 0, 0], [2, 100, 0], [3, 200, 0]], [[1, 2, 3]]);
  const [platformEdge, leavingEdge] = graph.edges;
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const standing = train(1, { state: 'held', speed: 0, lastBerth: '1004', occupied: [{ edge: platformEdge!, fromT: 0.5, toT: 0.85 }] });
  const first = boardRows([standing], map, { nowMs: 1000, graph });
  const departing = train(1, { state: 'departing', speed: 2, lastBerth: '1004', occupied: [{ edge: leavingEdge!, fromT: 0, toT: 0.3 }] });
  const left = boardRows([departing], map, { previous: first, nowMs: 12_000, graph });
  assert.equal(left.departed.length, 1);
  assert.equal(left.departed[0]!.state, 'leaving');
  assert.equal(left.departed[0]!.leftAtMs, 12_000);
  assert.equal(left.departed[0]!.platform, 4);
  const atLimit = boardRows([], map, { previous: left, nowMs: 192_000, retentionMs: 180_000 });
  assert.equal(atLimit.departed.length, 1);
  const expired = boardRows([], map, { previous: atLimit, nowMs: 192_001, retentionMs: 180_000 });
  assert.equal(expired.departed.length, 0);
});

test('a missing standing train is not evidence of a departure', () => {
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const previous = boardRows([train(1, { state: 'held', speed: 0, lastBerth: '1004' })], map, { nowMs: 1000 });
  const current = boardRows([], map, { previous, nowMs: 2000 });
  assert.equal(current.departed.length, 0);
});

test('sample platform placements are labelled sample and do not leak into live mode', () => {
  const map = anchors([]);
  const sample = train(1, { samplePlatform: 4, state: 'held', speed: 0 });
  const live = boardRows([sample], map, { nowMs: 1000, mode: 'live' });
  assert.equal(live.platforms[4]!.trains.length, 0);
  const rows = boardRows([sample], map, { nowMs: 1000, mode: 'sample' });
  const sampleRow = rows.platforms[4]!.trains[0]!;
  assert.equal(sampleRow.sample, true);
  assert.equal(sampleRow.platform, 4);
  assert.match(boardHtml(rows), /Sample, not live · no timetable/);
  assert.match(boardHtml(rows), /· sample/);
});

test('HTML renderer includes schedule seam fields and escapes every feed value', () => {
  const rows = boardRows([], anchors([]), { nowMs: 60_000, mode: 'live' });
  rows.approaching.push({ trainId: 7, headcode: '<img src=x onerror="bad">', state: 'approaching', platforms: [2], distanceM: 32,
    booked: '<script>alert(1)</script>', expected: 'A&B', destination: 'King\'s & Cross' });
  rows.departed.push({ trainId: 8, headcode: '"<train>', state: 'leaving', platform: 3, leftAtMs: 30_000, destination: '<West>' });
  const html = boardHtml(rows);
  assert.match(html, /Approaching/);
  assert.match(html, /Departed \/ leaving/);
  assert.match(html, /booked &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /expected A&amp;B/);
  assert.match(html, /King&#39;s &amp; Cross/);
  assert.match(html, /&lt;img src=x onerror=&quot;bad&quot;&gt;/);
  assert.match(html, /&quot;&lt;train&gt;/);
  assert.doesNotMatch(html, /<script>|<img|<train>|<West>/);
});

test('simulation time rewind starts dwell history fresh', () => {
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const held = train(1, { state: 'held', speed: 0, lastBerth: '1004' });
  const first = boardRows([held], map, { nowMs: 10_000 });
  const later = boardRows([held], map, { previous: first, nowMs: 20_000 });
  assert.equal(row(later, 1)!.sinceMs, 10_000);
  assert.equal(row(later, 1)!.stoodMs, 10_000);
  const rewound = boardRows([held], map, { previous: later, nowMs: 500 });
  assert.equal(row(rewound, 1)!.sinceMs, 500);
  assert.equal(row(rewound, 1)!.stoodMs, 0);
});

class FakeMediaQuery {
  matches = true;
  listeners = new Map<string, () => void>();
  addEventListener(name: string, listener: () => void): void { this.listeners.set(name, listener); }
  removeEventListener(name: string, listener: () => void): void { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
}

class FakeView {
  innerHeight = 800;
  listeners = new Map<string, () => void>();
  media = new FakeMediaQuery();
  matchMedia(query: string): FakeMediaQuery { assert.equal(query, '(max-width: 600px)'); return this.media; }
  addEventListener(name: string, listener: () => void): void { this.listeners.set(name, listener); }
  removeEventListener(name: string, listener: () => void): void { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
}

class FakeDocument {
  defaultView = new FakeView();
  createElement(_tag: string): FakeElement { return new FakeElement(this); }
}

class FakeElement {
  ownerDocument: FakeDocument;
  className = '';
  id = '';
  type = '';
  hidden = false;
  innerHTML = '';
  textContent = '';
  attributes = new Map<string, string>();
  children: FakeElement[] = [];
  listeners = new Map<string, () => void>();
  hud: FakeElement | null = null;
  top = 0;
  parentNode: FakeElement | null = null;
  style = { values: new Map<string, string>(), setProperty: (name: string, value: string): void => { this.style.values.set(name, value); } };
  constructor(doc: FakeDocument) { this.ownerDocument = doc; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  append(...children: FakeElement[]): void { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  addEventListener(name: string, listener: () => void): void { this.listeners.set(name, listener); }
  removeEventListener(name: string, listener: () => void): void { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
  click(): void { this.listeners.get('click')?.(); }
  remove(): void {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  closest(selector: string): FakeElement | null { return selector === '.hud' ? this.hud : null; }
  getBoundingClientRect(): { top: number } { return { top: this.top }; }
}

test('controller collapses on narrow view, clears HUD, toggles accessibly and disposes listeners', () => {
  const doc = new FakeDocument();
  const parent = new FakeElement(doc);
  const hud = new FakeElement(doc); hud.top = 650;
  const status = new FakeElement(doc); status.hud = hud;
  const controller = createBoard(parent as unknown as HTMLElement, status as unknown as HTMLElement);
  const root = parent.children[0]!;
  const [style, toggle, body] = root.children;
  assert.ok(style && toggle && body);
  assert.match(style.textContent, /top:52px/);
  assert.match(style.textContent, /max-width:calc\(100vw - 32px\)/);
  assert.equal(body.hidden, true);
  assert.equal(toggle.attributes.get('aria-expanded'), 'false');
  assert.equal(root.style.values.get('--board-bottom'), '162px');
  toggle.click();
  assert.equal(body.hidden, false);
  assert.equal(toggle.attributes.get('aria-expanded'), 'true');
  assert.ok(doc.defaultView.listeners.has('resize'));
  assert.ok(doc.defaultView.media.listeners.has('change'));
  controller.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(doc.defaultView.listeners.has('resize'), false);
  assert.equal(doc.defaultView.media.listeners.has('change'), false);
  assert.equal(toggle.listeners.has('click'), false);
});
