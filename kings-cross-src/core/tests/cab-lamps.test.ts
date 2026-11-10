// The lamps and cab light of a train standing at a platform (core/cab-lamps.ts). Every headcode, time and platform here is
// invented; no real timetable, TD or PTAC data is used.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cabPlan, callDepartureMs, createCabLampTracker, kingsCrossDepartures, SERVICE_PLAN } from '../cab-lamps.ts';
import type { CabPlanInput, Departure, DepartureCall, StandingTrain } from '../cab-lamps.ts';
import { createMotion } from '../motion.ts';
import type { MotionEvent } from '../motion.ts';
import { buildGraph } from '../graph.ts';
import type { AnchorMap, BerthAnchor } from '../anchors.ts';

const MIN = 60_000;
const DEP = Date.UTC(2026, 10, 10, 12, 0);
const standing = (departure: Departure, terminus = true, reversalsSinceArrival = 0): CabPlanInput => ({ atPlatform: true, reversalsSinceArrival, terminus, departure });
const timed = (ms: number | null, source: Departure['source'] = 'timetable'): Departure => ({ departureMs: ms, source });

test('cabPlan at a terminus: red tail on arrival, white at the leaving end and the cab lit from T-10, the cab dark from T-1, service after the cab change', () => {
  const rows: [string, CabPlanInput, number, ReturnType<typeof cabPlan>][] = [
    // arriving (moving, not yet standing): in service, white at the leading end (car 0) and the red tail lamp at the rear
    ['arrival', { ...standing(timed(DEP)), atPlatform: false }, DEP - 30 * MIN, SERVICE_PLAN],
    // standing more than ten minutes out: the red tail it arrived with at the leaving end (rear), the buffer end dark
    ['T-11', standing(timed(DEP)), DEP - 11 * MIN, { front: 'off', rear: 'tail', cabLit: null }],
    ['T-10', standing(timed(DEP)), DEP - 10 * MIN, { front: 'tail', rear: 'head', cabLit: 'rear' }],
    ['T-2', standing(timed(DEP)), DEP - 2 * MIN, { front: 'tail', rear: 'head', cabLit: 'rear' }],
    ['T-1', standing(timed(DEP)), DEP - 1 * MIN, { front: 'tail', rear: 'head', cabLit: null }],
    // late: still white, the cab dark, until it actually moves
    ['T+3', standing(timed(DEP)), DEP + 3 * MIN, { front: 'tail', rear: 'head', cabLit: null }],
    // after the cab change car 0 is at the leaving end, and the train is in service
    ['after reversal', standing(timed(DEP), true, 1), DEP - 5 * MIN, SERVICE_PLAN],
    // no time at all: white and the cab lit once the departure headcode is interposed (it stays lit until TD steps it out)...
    ['no time, interposed', standing(timed(null, 'interposed')), DEP + 60 * MIN, { front: 'tail', rear: 'head', cabLit: 'rear' }],
    // ...and never before
    ['no time, not interposed', standing(timed(null, 'none')), DEP, { front: 'off', rear: 'tail', cabLit: null }],
    // ASSUMED platform guess: the same rule on the guessed time
    ['platform guess T-11', standing(timed(DEP, 'platform-guess')), DEP - 11 * MIN, { front: 'off', rear: 'tail', cabLit: null }],
    ['platform guess T-9', standing(timed(DEP, 'platform-guess')), DEP - 9 * MIN, { front: 'tail', rear: 'head', cabLit: 'rear' }],
    // a Waverley through train leaves by its leading end (car 0): white and the cab lit at the front, red at the rear
    ['Waverley through T-11', standing(timed(DEP, 'ptac'), false), DEP - 11 * MIN, { front: 'off', rear: 'tail', cabLit: null }],
    ['Waverley through T-4', standing(timed(DEP, 'ptac'), false), DEP - 4 * MIN, { front: 'head', rear: 'tail', cabLit: 'front' }],
    ['Waverley through T-1', standing(timed(DEP, 'ptac'), false), DEP - 1 * MIN, { front: 'head', rear: 'tail', cabLit: null }],
  ];
  for (const [name, input, now, want] of rows) assert.deepEqual(cabPlan(input, now), want, name);
});

const call = (over: Partial<DepartureCall> & { headcode: string }): DepartureCall => ({
  uid: `Z${over.headcode}`, operator: 'GR', category: 'XX', date: '2026-11-10', serviceDate: '2026-11-10', stp: 'P', startDate: '2026-01-01', endDate: '2026-12-31',
  platform: '4', origin: 'KNGX', destination: 'ZZZZ', arrival: null, departure: '12:00', publicArrival: null, publicDeparture: '12:00',
  arrivalMs: null, departureMs: DEP, publicArrivalMs: null, publicDepartureMs: DEP, ...over,
});
const train = (over: Partial<StandingTrain> & { id: number }): StandingTrain => ({ description: '1Z90', arrivalDescription: '1Z90', platform: '4', arrivedAtMs: DEP - 40 * MIN, ...over });

test('a King\'s Cross departure: the own headcode\'s call (public time, TRUST applied), else interposed, else ASSUMED the next unclaimed departure from the platform', () => {
  const calls = [
    call({ headcode: '1Z01', departureMs: DEP - 30_000, publicDepartureMs: DEP }),
    call({ headcode: '1Z02', departureMs: DEP + 20 * MIN, publicDepartureMs: null }),
    call({ headcode: '1Z03', departureMs: DEP + 30 * MIN, publicDepartureMs: DEP + 30 * MIN }),
    call({ headcode: '1Z04', departureMs: DEP + 50 * MIN, publicDepartureMs: DEP + 50 * MIN }),
    call({ headcode: '1Z05', platform: '7', departureMs: DEP + 5 * MIN, publicDepartureMs: DEP + 5 * MIN }),
    // an arrival-only call (the arriving headcode's own) is not a departure
    call({ headcode: '1Z90', platform: '4', arrivalMs: DEP - 40 * MIN, departureMs: null, publicDepartureMs: null, departure: null }),
  ];
  const now = DEP - 15 * MIN;
  const got = kingsCrossDepartures([
    // renamed to a booked departure: its public departure time
    train({ id: 1, description: '1Z01', arrivalDescription: '1Z90' }),
    // renamed to a headcode the timetable does not have: no time, but interposed
    train({ id: 2, description: '1Z77', arrivalDescription: '1Z91' }),
    // not renamed, platform 4: 1Z01 is claimed by train 1 and 1Z02 by the earlier arrival (train 4), so 1Z03
    train({ id: 3, description: '1Z90', arrivedAtMs: DEP - 30 * MIN }),
    train({ id: 4, description: '1Z92', arrivalDescription: '1Z92', arrivedAtMs: DEP - 35 * MIN }),
    // not renamed, platform 9: nothing is booked from it
    train({ id: 5, description: '1Z93', arrivalDescription: '1Z93', platform: '9' }),
  ], calls, now);
  assert.deepEqual(got.get(1), { departureMs: DEP, source: 'timetable' }, 'the public time, not the working time');
  assert.deepEqual(got.get(2), { departureMs: null, source: 'interposed' });
  assert.deepEqual(got.get(4), { departureMs: DEP + 20 * MIN, source: 'platform-guess' }, 'the working time where there is no public one; the earlier arrival claims first');
  assert.deepEqual(got.get(3), { departureMs: DEP + 30 * MIN, source: 'platform-guess' });
  assert.deepEqual(got.get(5), { departureMs: null, source: 'none' });
  // a guess never takes a departure booked before the train arrived, or one long gone
  const early = kingsCrossDepartures([train({ id: 6, arrivedAtMs: DEP + 25 * MIN })], calls, DEP + 25 * MIN);
  assert.deepEqual(early.get(6), { departureMs: DEP + 30 * MIN, source: 'platform-guess' });
  // TRUST: a cancellation leaves no time; a reported departure is the actual
  assert.equal(callDepartureMs(call({ headcode: '1Z01', realtime: { cancelled: true } })), null);
  assert.equal(callDepartureMs(call({ headcode: '1Z01', realtime: { actualDepartureMs: DEP + 4 * MIN } })), DEP + 4 * MIN);
  assert.equal(callDepartureMs(call({ headcode: '1Z01', stp: 'C' })), null);
  const cancelled = kingsCrossDepartures([train({ id: 7, description: '1Z03', arrivalDescription: '1Z90' })],
    [call({ headcode: '1Z03', departureMs: DEP, realtime: { cancelled: true } })], now);
  assert.deepEqual(cancelled.get(7), { departureMs: null, source: 'none' }, 'a cancelled departure lights nothing');
  // a TRUST platform alteration moves the guess
  const moved = kingsCrossDepartures([train({ id: 8, platform: '6' })], [call({ headcode: '1Z06', platform: '4', realtime: { platform: '6' } })], now);
  assert.deepEqual(moved.get(8), { departureMs: DEP, source: 'platform-guess' });
});

test('the tracker reports a plan only when it changes, keyed by id through a rename, and resolves departures only when they can have changed', () => {
  let resolves = 0, departure: Departure = { departureMs: DEP, source: 'timetable' };
  const tracker = createCabLampTracker({ terminus: true, resolve: (trains) => { resolves++; return new Map(trains.map((t) => [t.id, departure])); } });
  const subject = (over: { description?: string; atPlatform?: boolean; reversals?: number } = {}) =>
    ({ id: 9, description: '1Z90', reversals: 0, atPlatform: true, platform: '4', ...over });
  assert.deepEqual([...tracker.update([subject({ atPlatform: false })], DEP - 30 * MIN)], [], 'arriving: service state, nothing to change');
  assert.deepEqual([...tracker.update([subject()], DEP - 20 * MIN)], [[9, { front: 'off', rear: 'tail', cabLit: null }]]);
  assert.deepEqual([...tracker.update([subject()], DEP - 20 * MIN + 5_000)], [], 'the same plan is not reported again');
  assert.equal(resolves, 1, 'resolved once for the standing train, not every frame');
  tracker.update([subject()], DEP - 20 * MIN + 15_000);
  assert.equal(resolves, 2, 'and again after RESOLVE_EVERY_MS of the scene clock');
  // the departure headcode is interposed: the id is unchanged, the departure is resolved again at once
  tracker.update([subject({ description: '1Z01' })], DEP - 20 * MIN + 16_000);
  assert.equal(resolves, 3);
  assert.deepEqual([...tracker.update([subject({ description: '1Z01' })], DEP - 10 * MIN)], [[9, { front: 'tail', rear: 'head', cabLit: 'rear' }]]);
  assert.deepEqual([...tracker.update([subject({ description: '1Z01' })], DEP - 1 * MIN)], [[9, { front: 'tail', rear: 'head', cabLit: null }]]);
  // a timetable change is picked up on the next update
  departure = { departureMs: DEP + 30 * MIN, source: 'timetable' };
  tracker.invalidate();
  assert.deepEqual([...tracker.update([subject({ description: '1Z01' })], DEP - 1 * MIN + 1)], [[9, { front: 'off', rear: 'tail', cabLit: null }]]);
  // TD steps it out: the cab change makes it a departing train, in service
  assert.deepEqual([...tracker.update([subject({ description: '1Z01', atPlatform: false, reversals: 1 })], DEP)], [[9, SERVICE_PLAN]]);
  assert.deepEqual(tracker.shown(9), SERVICE_PLAN);
});

// Invented terminus: a straight line ending at a platform buffer. No production TD data.
const graph = buildGraph({
  nodes: [[1, 0, -1000], [2, 1000, -1000], [3, 2000, -1000], [4, 3000, -1000]],
  rails: [{ id: 7, nodes: [1, 2, 3, 4], service: 'main', tunnel: false, bridge: false, layer: 0 }],
});
function anchor(berth: string, x: number, reverse = false, platform?: string): BerthAnchor {
  const i = Math.min(2, Math.floor(x / 1000)), t = (x - i * 1000) / 1000;
  return { berth, kind: platform === undefined ? 'signal' : 'platform', from: reverse ? i + 2 : i + 1, to: reverse ? i + 1 : i + 2, t: reverse ? 1 - t : t, point: [x, -1000], errorM: 1, evidence: 'synthetic', ...(platform === undefined ? {} : { platform }) };
}
const anchors: AnchorMap = { area: 'TEST', sources: ['synthetic'], unmapped: [], anchors: [anchor('A', 400), anchor('P', 2900, false, '4'), anchor('EXIT', 1800, true)] };
const event = (kind: 'step' | 'interpose', to: string, descr: string, from?: string): MotionEvent => ({ kind, area: 'TEST', descr, to, ...(from ? { from } : {}), time: null });

test('a King\'s Cross arrival, its departure headcode interposed and the step out: one id, one cab change, and the white lamps move from the rear to the front', () => {
  const m = createMotion(graph, anchors);
  const tracker = createCabLampTracker({ terminus: true, resolve: (trains, now) => kingsCrossDepartures(trains, [call({ headcode: '1Z01', platform: '4' })], now) });
  const lamps = (now: number) => {
    const [v] = m.trains();
    assert.ok(v);
    // as web/src/trains-live.ts standingAt: held, not blocked, the nose at the platform's stop (a train just born at a signal is held too)
    const stop = anchors.anchors.find((a) => a.berth === v.targetBerth && a.platform !== undefined);
    const atPlatform = !!stop && v.state === 'held' && !v.blocked && Math.hypot(v.leading.point[0] - stop.point[0], v.leading.point[1] - stop.point[1]) <= 4.5;
    tracker.update([{ id: v.id, description: v.description, reversals: v.reversals, platform: stop?.platform, atPlatform }], now);
    return { view: v, plan: tracker.shown(v.id) };
  };
  let now = DEP - 40 * MIN;
  m.apply(event('step', 'P', '1Z90', 'A'), now);
  const arriving = lamps(now);
  assert.equal(arriving.view.state, 'held', 'born at its first berth, not yet moving: held, but not at its platform');
  assert.deepEqual(arriving.plan, SERVICE_PLAN, 'arriving: in service');
  for (let i = 0; i < 8000; i++) {
    m.advance(0.1); now += 100;
    const v = m.trains()[0]!;
    if (v.state === 'held' && v.distanceM > 0) break;
    assert.deepEqual(lamps(now).plan, SERVICE_PLAN, 'running in: in service');
  }
  const arrived = lamps(now);
  assert.equal(arrived.view.state, 'held');
  assert.equal(arrived.view.id, arriving.view.id);
  assert.deepEqual(arrived.plan, { front: 'off', rear: 'tail', cabLit: null }, 'standing, its own headcode has no departure: ASSUMED 1Z01 from its platform, more than ten minutes away, so the red tail only');
  assert.deepEqual(tracker.departure(arrived.view.id), { departureMs: DEP, source: 'platform-guess' });
  m.apply(event('interpose', 'P', '1Z01'), now);
  const named = lamps(DEP - 8 * MIN);
  assert.equal(named.view.description, '1Z01');
  assert.equal(named.view.id, arriving.view.id, 'the rename keeps the id');
  assert.equal(named.view.reversals, 0);
  assert.deepEqual(named.plan, { front: 'tail', rear: 'head', cabLit: 'rear' }, 'T-8: the leaving end is the rear, before the cab change');
  m.apply(event('step', 'EXIT', '1Z01', 'P'), DEP);
  const out = lamps(DEP);
  assert.equal(out.view.id, arriving.view.id, 'the step out keeps the id');
  assert.equal(out.view.reversals, 1, 'one cab change');
  assert.notEqual(out.view.state, 'held');
  assert.deepEqual(out.plan, SERVICE_PLAN, 'after the cab change the leaving end is car 0\'s, the front: white there, red at the rear');
});
