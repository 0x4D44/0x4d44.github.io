import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraph } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import type { AnchorMap, BerthAnchor } from '../../core/anchors.ts';
import type { BoardRow, BoardTrain, BoardService } from '../src/board.ts';
import { approachPlatforms, applyBoardTrust, boardHtml, boardRows, createBoard, stationName, operatorName } from '../src/board.ts';

import { createLiveFeed, createReplayFeed, createScheduleFeed, ukDate } from '../src/feed.ts';
import type { EventStream } from '../src/feed.ts';

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

const bookedAt = Date.parse('2026-11-09T10:00Z');
function service(extra: Partial<BoardService> = {}): BoardService {
  return { uid: 'SYN001', headcode: '1A01', operator: 'SYN', category: 'XX', date: '2026-11-09', serviceDate: '2026-11-09', stp: 'P',
    startDate: '2026-11-09', endDate: '2026-11-09', platform: '4', origin: 'SYNORIG', destination: 'SYNDEST',
    originName: 'Synthetic Origin', destinationName: 'Synthetic Destination',
    arrival: '10:00', departure: '10:10', publicArrival: '10:01', publicDeparture: '10:09',
    arrivalMs: bookedAt, departureMs: bookedAt + 10 * 60_000, publicArrivalMs: bookedAt + 60_000, publicDepartureMs: bookedAt + 9 * 60_000,
    ...extra };
}

test('timetable enriches platform approach and departed rows and preserves matched call identity', () => {
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const services = [service(), service({ uid: 'SYN002', arrivalMs: bookedAt + 60_000, departureMs: null, publicDepartureMs: null })];
  const held = train(1, { state: 'held', speed: 0, lastBerth: '1004' });
  const first = boardRows([held], map, { nowMs: bookedAt, services });
  assert.equal(row(first, 1)!.uid, 'SYN001'); assert.equal(row(first, 1)!.operator, 'SYN');
  const approaching = boardRows([train(2, { description: '1A01', state: 'moving', speed: 8, targetBerth: '1004' })], map, { nowMs: bookedAt, services });
  assert.equal(row(approaching, 2)?.service?.uid, 'SYN001');
  const departed = boardRows([train(1, { state: 'departing', speed: 8 })], map, { previous: first, nowMs: bookedAt + 60_000, services });
  assert.equal(departed.departed[0]!.uid, 'SYN001');
  const later = boardRows([], map, { previous: departed, nowMs: bookedAt + 120_000, services });
  assert.equal(later.departed[0]!.uid, 'SYN001');
  const html = boardHtml(first);
  assert.doesNotMatch(html, /UID SYN001/); assert.match(html, /· SYN/); assert.match(html, /(?:from Synthetic Origin|to Synthetic Destination)/i);
  assert.match(html.replace(/<[^>]*>/g, ''), /10:(?:01|09)/);
  assert.equal(row(first, 1)?.service?.arrival, '10:00'); assert.equal(row(first, 1)?.service?.publicArrival, '10:01');
});

test('due lists next thirty minutes including unseen calls and booked platform without TD placement', () => {
  const unseen = service({ headcode: '2B02', uid: 'SYN002', platform: '10' });
  const boundary = service({ uid: 'SYN003', publicArrivalMs: bookedAt + 30 * 60_000, arrivalMs: bookedAt + 31 * 60_000, departureMs: null, publicDepartureMs: null });
  const outside = service({ uid: 'SYN004', arrivalMs: bookedAt + 31 * 60_000, publicArrivalMs: bookedAt + 31 * 60_000, departureMs: null, publicDepartureMs: null });
  const past = service({ uid: 'SYN005', arrivalMs: bookedAt - 1, publicArrivalMs: bookedAt - 1, departureMs: null, publicDepartureMs: null });
  const rows = boardRows([], anchors([]), { nowMs: bookedAt, services: [outside, boundary, past, unseen] });
  assert.equal(rows.timetable, true); assert.equal(rows.platforms.flatMap(p => p.trains).length, 0);
  assert.deepEqual(rows.due.map(d => [d.service.uid, d.direction, d.bookedMs]), [
    ['SYN002', 'arrival', bookedAt + 60_000], ['SYN002', 'departure', bookedAt + 9 * 60_000], ['SYN003', 'arrival', bookedAt + 30 * 60_000],
  ]);
  assert.match(boardHtml(rows), /Due in next 30 minutes/); assert.match(boardHtml(rows), /2B02/); assert.match(boardHtml(rows), /P10/);
});

test('timetable availability distinguishes empty data and stays hidden for sample and none', () => {
  const map = anchors([]);
  assert.equal(boardRows([], map).timetable, false);
  assert.equal(boardRows([], map, { services: [] }).timetable, true);
  assert.match(boardHtml(boardRows([], map, { services: [] })), /None booked in the next 30 minutes/);
  for (const mode of ['sample', 'none'] as const) {
    const rows = boardRows([train(1, { samplePlatform: 4 })], map, { mode, nowMs: bookedAt, services: [service()] });
    assert.equal(rows.timetable, false); assert.equal(rows.due.length, 0);
    assert.doesNotMatch(boardHtml(rows), /UID SYN|Due in next/);
  }
});

test('recorded TRUST links UID and date before repeated headcodes and projects only actual facts', () => {
  const services = [service(), service({ uid: 'SYN002', headcode: '1A01', arrivalMs: bookedAt + 60_000 })];
  const event = { kind: 'trust', type: 'movement', uid: 'SYN001', date: '2026-11-09', serviceDate: '2026-11-09',
    headcode: '1A01', plannedMs: bookedAt + 60_000, actualMs: bookedAt + 120_000, eventType: 'ARRIVAL', variationMinutes: 2,
    platform: '5', receivedAtMs: bookedAt + 120_000, secret: 'never-copy', expectedArrivalMs: bookedAt + 180_000 };
  const enriched = applyBoardTrust(services, { t: bookedAt, e: event });
  assert.equal(enriched[0]!.realtime?.actualArrivalMs, bookedAt + 120_000);
  assert.equal(enriched[0]!.realtime?.variationMinutes, 2); assert.equal(enriched[0]!.realtime?.platform, '5');
  assert.equal(enriched[1]!.realtime, undefined); assert.equal(services[0]!.realtime, undefined);
  assert.equal('secret' in enriched[0]!.realtime!, false); assert.equal('expectedArrivalMs' in enriched[0]!.realtime!, false);
  const stale = applyBoardTrust(enriched, { ...event, actualMs: bookedAt + 1, receivedAtMs: bookedAt });
  assert.equal(stale[0]!.realtime?.actualArrivalMs, bookedAt + 120_000);
  const html = boardHtml(boardRows([train(1, { state: 'held', lastBerth: '1004' })], anchors([anchor('1004', 1, 2, 0.8, '4')]), { nowMs: bookedAt + 120_000, services: enriched.slice(0, 1) }));
  assert.match(html, /actual 10:02/i); assert.match(html, /\(\+2\)/);
  assert.doesNotMatch(html, /expected|forecast|never-copy/);
});

test('recorded TRUST headcode fallback uses planned time and refuses unknown identities and invalid values', () => {
  const services = [service(), service({ uid: 'SYN002', arrivalMs: bookedAt + 60 * 60_000, departureMs: null })];
  const base = { kind: 'trust', type: 'movement', headcode: '1A01', plannedMs: bookedAt + 60 * 60_000, actualMs: bookedAt, eventType: 'DEPARTURE', variationMinutes: -2 };
  const enriched = applyBoardTrust(services, base);
  assert.equal(enriched[1]!.realtime?.actualDepartureMs, bookedAt); assert.equal(enriched[0]!.realtime, undefined);
  assert.deepEqual(applyBoardTrust(services, { ...base, uid: 'missing' }), services);
  assert.deepEqual(applyBoardTrust(services, { ...base, plannedMs: NaN }), services);
  assert.deepEqual(applyBoardTrust(services, { ...base, type: 'activation' }), services);
  assert.deepEqual(applyBoardTrust(services, { ...base, eventType: 'PASS' }), services);
  const invalid = applyBoardTrust(services, { ...base, actualMs: '123', variationMinutes: Infinity, platform: '<bad>' });
  assert.equal(invalid[1]!.realtime?.actualDepartureMs, undefined); assert.equal(invalid[1]!.realtime?.variationMinutes, undefined);
  assert.equal(invalid[1]!.realtime?.platform, undefined);
});

class BoardStream implements EventStream {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners = new Map<string, (event: MessageEvent<string>) => void>();
  addEventListener(type: string, fn: (event: MessageEvent<string>) => void): void { this.listeners.set(type, fn); }
  close(): void {}
  emit(type: string, payload: unknown): void { this.listeners.get(type)?.({ data: JSON.stringify(payload) } as MessageEvent<string>); }
}
function boardTimers() {
  const jobs = new Map<number, { fn: () => void; ms: number }>();
  let serial = 0;
  return { jobs, schedule: (fn: () => void, ms: number): number => { jobs.set(++serial, { fn, ms }); return serial; },
    unschedule: (id: unknown): void => { jobs.delete(id as number); } };
}
const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('live TRUST SSE and replay recording deliver identical actuals into timetable state', async () => {
  const options = { hostname: 'localhost', relayPresent: true, now: () => bookedAt,
    fetchImpl: (async () => jsonResponse({ date: '2026-11-09', calls: [service()] })) as typeof fetch,
    schedule: () => 1, unschedule: () => {} };
  const liveBoard = createScheduleFeed({ ...options, mode: 'live' });
  const replayBoard = createScheduleFeed({ ...options, mode: 'replay', date: '2026-11-09' });
  await Promise.all([liveBoard.refresh(), replayBoard.refresh()]);
  const event = { kind: 'trust', area: 'SYN', type: 'movement', uid: 'SYN001', serviceDate: '2026-11-09', date: '2026-11-09',
    eventType: 'ARRIVAL', actualMs: bookedAt + 120_000, variationMinutes: 2 };
  const stream = new BoardStream();
  const live = createLiveFeed({ apply: (e, t) => liveBoard.apply(e, t), advance: () => {} }, () => {}, { source: () => stream, schedule: () => 1, unschedule: () => {} });
  stream.emit('trust', { t: bookedAt, e: event });
  const replay = createReplayFeed([{ t: bookedAt, e: event }] as Parameters<typeof createReplayFeed>[0], 1,
    { apply: (e, t) => replayBoard.apply(e, t), advance: () => {} }, () => {});
  assert.equal(liveBoard.services()?.[0]?.realtime?.actualArrivalMs, bookedAt + 120_000);
  assert.equal(liveBoard.services()?.[0]?.realtime?.updatedAtMs, bookedAt);
  assert.deepEqual(liveBoard.services()?.[0]?.realtime, replayBoard.services()?.[0]?.realtime);
  live.dispose(); replay.dispose(); liveBoard.dispose(); replayBoard.dispose();
});

test('schedule fetch gates on local relay and refreshes London date with cancellable timers', async () => {
  let now = Date.parse('2026-07-01T23:30Z');
  assert.equal(ukDate(now), '2026-07-02');
  const requests: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input); requests.push(url);
    if (url === '/relay/health') return jsonResponse({ ok: true });
    const date = new URL(url, 'http://localhost').searchParams.get('date');
    return jsonResponse({ date, calls: [] });
  }) as typeof fetch;
  const gated = createScheduleFeed({ mode: 'live', hostname: 'example.invalid', fetchImpl, schedule: () => 1, unschedule: () => {} });
  await gated.refresh(); assert.equal(requests.length, 0); gated.dispose();
  const timers = boardTimers();
  const feed = createScheduleFeed({ mode: 'live', hostname: 'localhost', fetchImpl, now: () => now, ...timers });
  await feed.refresh();
  assert.deepEqual(requests, ['/relay/health', '/relay/schedule?date=2026-07-02']);
  assert.equal([...timers.jobs.values()][0]?.ms, 60_000);
  now = Date.parse('2026-07-02T23:30Z');
  const [id, job] = [...timers.jobs][0]!; timers.jobs.delete(id); job.fn(); await feed.refresh();
  assert.equal(requests.at(-1), '/relay/schedule?date=2026-07-03');
  await feed.refresh(); assert.equal(requests.filter(p => p.includes('2026-07-03')).length, 2);
  feed.dispose(); assert.equal(timers.jobs.size, 0);
  const count = requests.length; await feed.refresh(); assert.equal(requests.length, count);
});

test('replay timetable fixes recording date strips live actuals and replays buffered TRUST only', async () => {
  const timers = boardTimers(); let requests = 0;
  const feed = createScheduleFeed({ mode: 'replay', hostname: 'localhost', relayPresent: true, date: '2026-11-09',
    now: () => Date.parse('2026-12-01T12:00Z'), ...timers,
    fetchImpl: (async (input: RequestInfo | URL) => { requests++; assert.equal(String(input), '/relay/schedule?date=2026-11-09');
      return jsonResponse({ date: '2026-11-09', calls: [service({ realtime: { actualArrivalMs: bookedAt + 600_000, actualDepartureMs: bookedAt + 900_000 } })] }); }) as typeof fetch });
  feed.apply({ kind: 'trust', type: 'movement', uid: 'SYN001', serviceDate: '2026-11-09', date: '2026-11-09', eventType: 'ARRIVAL', actualMs: bookedAt + 120_000 }, bookedAt);
  await feed.refresh();
  assert.equal(requests, 1); assert.equal(feed.services()?.[0]?.realtime?.actualArrivalMs, bookedAt + 120_000);
  assert.equal(feed.services()?.[0]?.realtime?.actualDepartureMs, undefined);
  await feed.refresh(); assert.equal(feed.services()?.[0]?.realtime?.actualArrivalMs, bookedAt + 120_000);
  feed.dispose();
});

test('missing timetable retries after five seconds and reconnect refresh preserves bookings', async () => {
  const timers = boardTimers(); let available = false;
  const feed = createScheduleFeed({ mode: 'live', hostname: 'localhost', relayPresent: true, now: () => bookedAt, ...timers,
    fetchImpl: (async () => available ? jsonResponse({ date: '2026-11-09', calls: [service()] }) : jsonResponse({ error: 'missing' }, 404)) as typeof fetch });
  await feed.refresh(); assert.equal(feed.services(), undefined); assert.equal([...timers.jobs.values()][0]?.ms, 5_000);
  available = true; await feed.refresh(); assert.equal(feed.services()?.length, 1);
  available = false; await feed.refresh(); assert.equal(feed.services()?.[0]?.uid, 'SYN001');
  assert.equal([...timers.jobs.values()][0]?.ms, 60_000); feed.dispose();
});

test('board names preserve station apostrophes and St while expanding known operators', () => {
  assert.equal(stationName("LONDON KING'S CROSS"), "London King's Cross");
  assert.equal(stationName('ST ALBANS CITY'), 'St Albans City');
  assert.equal(stationName('YORK'), 'York');
  assert.equal(stationName(''), '');
  for (const [code, name] of Object.entries({ GR: 'LNER', GN: 'Great Northern', HT: 'Hull Trains', LD: 'Lumo', GC: 'Grand Central', TL: 'Thameslink', ZZ: 'ZZ' })) assert.equal(operatorName(code), name);
});

test('Great Northern and Grand Central fit the 350px board operator column', () => {
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const services = [service({ operator: 'GN' }), service({ uid: 'SYN002', headcode: '1A02', operator: 'GC' })];
  const rows = boardRows([train(1, { state: 'held', lastBerth: '1004' }), train(2, { description: '1A02', state: 'held', lastBerth: '1004' })],
    map, { nowMs: bookedAt, services });
  const html = boardHtml(rows);
  assert.match(html, /class="kx-board-operator">Great Northern<\/span>/);
  assert.match(html, /class="kx-board-operator">Grand Central<\/span>/);
  const doc = new FakeDocument(), parent = new FakeElement(doc);
  const controller = createBoard(parent as unknown as HTMLElement);
  assert.match(parent.children[0]!.children[0]!.textContent, /\.kx-board\{[^}]*width:350px/);
  assert.match(parent.children[0]!.children[0]!.textContent, /\.kx-board-operator\{[^}]*max-width:92px/);
  controller.dispose();
});

test('Due limits eight public passenger directions and excludes stock freight and nonpublic calls', () => {
  const passenger = service({ headcode: '1A11', uid: 'PASS01', publicDeparture: null, publicDepartureMs: null });
  const nonpublicArrival = service({ headcode: '2B22', uid: 'PASS02', publicArrival: null, publicArrivalMs: null });
  const excluded = ['0A01', '3A01', '5A01'].map((headcode, i) => service({ headcode, uid: `EXCL0${i}` }));
  const noPublic = service({ uid: 'HIDDEN', headcode: '1A33', publicArrival: null, publicArrivalMs: null, publicDeparture: null, publicDepartureMs: null });
  const rows = boardRows([], anchors([]), { nowMs: bookedAt, services: [passenger, nonpublicArrival, ...excluded, noPublic] });
  assert.deepEqual(rows.due.map(d => [d.service.uid, d.direction]), [['PASS01', 'arrival'], ['PASS02', 'departure']]);
  const many = Array.from({ length: 12 }, (_, i) => service({ uid: `MANY${String(i).padStart(2, '0')}`, headcode: `1C${String(i).padStart(2, '0')}`, publicDeparture: null, publicDepartureMs: null }));
  const capped = boardRows([], anchors([]), { nowMs: bookedAt, services: many });
  assert.equal(capped.due.length, 8);
  capped.due = many.map(s => ({ service: s, direction: 'arrival' as const, bookedMs: s.publicArrivalMs! }));
  const html = boardHtml(capped);
  assert.match(html, /1C07/); assert.doesNotMatch(html, /1C08|1C09|1C10|1C11/);
});

test('platforms precede bounded Due with eleven compact single line rows', () => {
  const rows = boardRows([], anchors([]), { nowMs: bookedAt, services: [service()] });
  const html = boardHtml(rows);
  assert.equal((html.match(/class="kx-board-platform"/g) ?? []).length, 11);
  assert.ok(html.indexOf('Platforms 0–10') < html.indexOf('Due in next 30 minutes'));
  assert.ok(html.indexOf('Due in next 30 minutes') < html.indexOf('Approaching'));
  assert.ok(html.indexOf('Approaching') < html.indexOf('Departed / leaving'));
  const doc = new FakeDocument(), parent = new FakeElement(doc);
  const controller = createBoard(parent as unknown as HTMLElement);
  const css = parent.children[0]!.children[0]!.textContent;
  assert.match(css, /width:350px/); assert.match(css, /\.kx-board-body\{[^}]*line-height:20px/); assert.match(css, /\.kx-board-train\{[^}]*line-height:20px/);
  assert.match(css, /white-space:nowrap/); assert.match(css, /text-overflow:ellipsis/);
  assert.match(css, /grid-template-columns:24px minmax\(0,1fr\)/);
  assert.doesNotMatch(css, /span:nth-of-type\(n\+2\)\{display:block/);
  controller.dispose();
});

test('platform stock replaces depot route and booked labels select public then working without dashes', () => {
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const stock = boardRows([train(1, { description: '5A01', state: 'held', lastBerth: '1004' })], map, { nowMs: bookedAt,
    services: [service({ headcode: '5A01', category: 'EE', originName: 'SYN EMUD', destinationName: 'SYN EMUD', operator: 'GN',
      arrival: '10:00', departure: '10:00', departureMs: bookedAt, publicArrival: null, publicArrivalMs: null, publicDeparture: null, publicDepartureMs: null })] });
  const stockHtml = boardHtml(stock);
  assert.match(stockHtml, /[Ee]mpty stock/); assert.doesNotMatch(stockHtml, /EMUD|public —|public—/);
  assert.match(stockHtml, /10:00/); assert.match(stockHtml, /Great Northern/);
  const passengerServices = [service({ originName: "LONDON KING'S CROSS", departure: null, departureMs: null, publicDeparture: null, publicDepartureMs: null }),
    service({ uid: 'PASS02', headcode: '1A02', destinationName: 'ST ALBANS CITY', arrival: null, arrivalMs: null, publicArrival: null, publicArrivalMs: null })];
  const passengerRows = boardRows([train(1, { state: 'held', lastBerth: '1004' }), train(2, { state: 'held', lastBerth: '1004' })], map, { nowMs: bookedAt, services: passengerServices });
  const passengerHtml = boardHtml(passengerRows);
  assert.match(passengerHtml, /London King&#39;s Cross/); assert.match(passengerHtml, /St Albans City/);
  const visible = passengerHtml.replace(/<[^>]*>/g, '');
  assert.match(visible, /10:01/); assert.match(visible, /10:09/); assert.doesNotMatch(visible, /10:00|10:10|public —/);
});

test('TRUST actual and signed variation appear only once actual time is reached', () => {
  const map = anchors([anchor('1004', 1, 2, 0.8, '4')]);
  const held = train(1, { state: 'held', lastBerth: '1004' });
  const render = (variationMinutes: number, actualArrivalMs: number, nowMs: number): string => boardHtml(boardRows([held], map, { nowMs,
    services: [service({ departure: null, departureMs: null, publicDeparture: null, publicDepartureMs: null, realtime: { eventType: 'ARRIVAL', actualArrivalMs, variationMinutes } })] }));
  const future = render(2, bookedAt + 120_000, bookedAt);
  assert.doesNotMatch(future, /actual 10:02|\(\+2\)/i);
  const late = render(2, bookedAt + 120_000, bookedAt + 120_000);
  assert.match(late, /actual 10:02/i); assert.match(late, /\(\+2\)/); assert.doesNotMatch(late, /10:02:00/);
  assert.match(render(-2, bookedAt - 120_000, bookedAt), /\(-2\)/);
  assert.match(render(0, bookedAt, bookedAt), /\bon time\b/i);
  const departure = boardHtml(boardRows([held], map, { nowMs: bookedAt + 12 * 60_000, services: [service({ arrival: null, arrivalMs: null, publicArrival: null, publicArrivalMs: null, realtime: { eventType: 'DEPARTURE', actualDepartureMs: bookedAt + 12 * 60_000, variationMinutes: 2 } })] }));
  assert.match(departure, /actual 10:12/i);
});
