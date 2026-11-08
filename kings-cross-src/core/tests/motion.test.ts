import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotion, maxspeedMps, overlapM } from '../motion.ts';
import type { MotionEvent, MotionOptions, TrainView } from '../motion.ts';
import { buildGraph } from '../graph.ts';
import type { AnchorMap, BerthAnchor } from '../anchors.ts';

// Invented straight railway, away from the station zone. No production TD data.
const graph = buildGraph({
  nodes: [[1, 0, -1000], [2, 1000, -1000], [3, 2000, -1000], [4, 3000, -1000], [5, 4000, -1000]],
  rails: [{ id: 7, nodes: [1, 2, 3, 4, 5], service: 'main', tunnel: false, bridge: false, layer: 0 }],
});
function anchor(berth: string, x: number, reverse = false, platform?: string): BerthAnchor {
  const i = Math.min(3, Math.floor(x / 1000));
  const a = i + 1, b = i + 2, t = (x - i * 1000) / 1000;
  return { berth, kind: platform === undefined ? 'signal' : 'platform', from: reverse ? b : a, to: reverse ? a : b, t: reverse ? 1 - t : t, point: [x, -1000], errorM: 1, evidence: 'synthetic', ...(platform === undefined ? {} : { platform }) };
}
const anchors: AnchorMap = {
  area: 'TEST', sources: ['synthetic'], unmapped: [],
  anchors: [anchor('A', 400), anchor('B', 1500), anchor('C', 2800), anchor('P', 2900, false, '1'), anchor('P2', 2900, false, '1'), anchor('EXIT', 1800, true), anchor('TAIL', 100)],
};
const step = (from: string, to: string, descr = 'SYN1'): MotionEvent => ({ kind: 'step', area: 'TEST', descr, from, to, time: null });
const interpose = (to: string, descr = 'SYN1'): MotionEvent => ({ kind: 'interpose', area: 'TEST', descr, to });
const one = (m: ReturnType<typeof createMotion>): TrainView => { assert.equal(m.trains().length, 1); return m.trains()[0]!; };
const close = (a: number, b: number, tolerance = 1e-6): void => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
function finish(m: ReturnType<typeof createMotion>, seconds = 800): TrainView {
  for (let i = 0; i < seconds * 10; i++) {
    m.advance(0.1);
    const t = one(m);
    if (t.state === 'held' && t.distanceM > 0) return t;
  }
  assert.fail('train did not arrive');
}
function normal(opts: MotionOptions = {}) {
  const m = createMotion(graph, anchors, opts);
  m.apply(step('A', 'B'), 0);
  return m;
}

test('a normal run accelerates and service brakes within the speed cap and stops exactly at its anchor', () => {
  const m = normal({ wayMaxspeed: new Map([[7, '36']]) });
  let previous = one(m), sawCruise = false, sawBrake = false;
  for (let i = 0; i < 3000; i++) {
    m.advance(0.1);
    const t = one(m), dv = (t.speed - previous.speed) / 0.1;
    assert.ok(dv <= 0.7 + 1e-7, `acceleration ${dv}`);
    assert.ok(dv >= -0.6 - 1e-7, `deceleration ${dv}`);
    assert.ok(t.speed <= 10 + 1e-7);
    assert.ok(t.distanceM >= previous.distanceM);
    assert.ok(t.distanceM - previous.distanceM <= 1 + 1e-7);
    assert.ok(t.distanceM - previous.distanceM >= previous.speed * 0.1 - 0.6 * 0.1 ** 2 / 2 - 1e-7);
    assert.ok(t.leading.point[0] <= 1500 + 1e-7);
    close(t.occupiedLengthM, 260);
    sawCruise ||= t.speed > 9.99; sawBrake ||= dv < -0.59;
    previous = t;
    if (t.state === 'held') break;
  }
  close(previous.leading.point[0], 1500);
  assert.equal(previous.speed, 0);
  assert.ok(sawCruise && sawBrake);
});

test('a late next step leaves the train held with no overshoot or creep', () => {
  const m = normal();
  const stopped = finish(m);
  m.advance(90);
  assert.deepEqual(one(m), stopped);
});

test('a terminus departure swaps the leading end while preserving every occupied interval', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('A', 'P'), 0);
  const arrived = finish(m);
  close(arrived.leading.point[0], 2900);
  m.apply(step('P', 'EXIT'), 0); // advance owns the simulation clock between events.
  const swapped = one(m);
  close(swapped.leading.point[0], 2640);
  close(overlapM(arrived.occupied, swapped.occupied), 260);
  close(swapped.distanceM, arrived.distanceM);
  close(Math.abs(swapped.heading - arrived.heading), Math.PI);
  assert.equal(swapped.reversals, 1);
  let last = swapped;
  for (let i = 0; i < 2000; i++) {
    m.advance(0.1);
    const t = one(m);
    assert.ok(t.leading.point[0] <= last.leading.point[0] + 1e-7);
    assert.ok(last.leading.point[0] - t.leading.point[0] <= 40 / 3.6 * 0.1 + 1e-7);
    assert.ok(Math.abs(t.speed - last.speed) <= 0.7 * 0.1 + 1e-7);
    last = t;
    if (t.state === 'held') break;
  }
  close(last.leading.point[0], 1800);
});

test('an early departure step waits for the platform and partner berth steps do not reverse twice', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('A', 'P'), 0);
  m.advance(5);
  m.apply(step('P', 'P2'), 5000);
  assert.equal(one(m).reversals, 0);
  m.apply(step('P2', 'EXIT'), 5000);
  const t = finish(m);
  close(t.leading.point[0], 1800);
  assert.equal(t.reversals, 1);
});

test('partner berths at the same buffer hold without attempting a cab change', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('A', 'P'), 0);
  m.advance(5);
  m.apply(step('P', 'P2'), 5000);
  const t = finish(m);
  close(t.leading.point[0], 2900);
  assert.equal(t.reversals, 0);
  assert.deepEqual(m.diagnostics(), []);
});

test('a skipped berth reroutes from the current nose without a jump', () => {
  const m = normal();
  m.advance(12);
  const before = one(m);
  m.apply(step('A', 'C'), 12_000);
  assert.deepEqual(one(m).leading, before.leading);
  close(one(m).speed, before.speed);
  close(finish(m).leading.point[0], 2800);
});

test('a missed from berth never relocates an existing train', () => {
  const m = normal();
  m.advance(12);
  const before = one(m);
  m.apply(step('NOT-WHERE-IT-IS', 'C'), 12_000);
  assert.deepEqual(one(m).leading, before.leading);
  close(finish(m).leading.point[0], 2800);
});

test('an unmapped destination with a known anchored successor keeps that authority and exposes the missing berth', () => {
  const m = normal({ observedSteps: [step('UNKNOWN', 'B')] });
  m.apply(step('B', 'UNKNOWN'), 0);
  assert.equal(one(m).unmappedBerth, 'UNKNOWN');
  assert.equal(one(m).targetBerth, 'B');
  close(finish(m).leading.point[0], 1500);
  assert.equal(m.diagnostics().filter((i) => i.kind === 'unroutable').length, 0);
});

test('a follower stops short of the leading train and never overlaps it', () => {
  const m = createMotion(graph, anchors);
  m.apply(interpose('B', 'LEAD'), 0);
  m.apply(step('A', 'C', 'FOLLOW'), 0);
  let previous = m.trains().find((t) => t.description === 'FOLLOW')!;
  for (let i = 0; i < 4000; i++) {
    m.advance(0.1);
    const [lead, follow] = m.trains();
    assert.equal(overlapM(lead!.occupied, follow!.occupied), 0);
    assert.ok(follow!.leading.point[0] <= 1235 + 1e-6);
    assert.ok(follow!.speed >= previous.speed - 0.6 * 0.1 - 1e-7);
    assert.ok(follow!.distanceM - previous.distanceM >= previous.speed * 0.1 - 0.0030001);
    previous = follow!;
  }
  close(previous.leading.point[0], 1235);
  assert.equal(previous.speed, 0);
  assert.equal(previous.blocked, true);
  m.apply(step('B', 'C', 'LEAD'), 400_000);
  m.advance(60);
  assert.ok(m.trains()[1]!.leading.point[0] > 1235);
});

test('opposing trains stop before touching with service braking', () => {
  const custom = { ...anchors, anchors: [...anchors.anchors, anchor('R', 2400, true), anchor('L', 600, true)] };
  const m = createMotion(graph, custom);
  m.apply(step('A', 'C', 'EAST'), 0);
  m.apply(step('R', 'L', 'WEST'), 0);
  let prev = m.trains();
  for (let i = 0; i < 3000; i++) {
    m.advance(0.1);
    const ts = m.trains();
    assert.equal(overlapM(ts[0]!.occupied, ts[1]!.occupied), 0);
    ts.forEach((t, j) => {
      assert.ok(t.speed >= prev[j]!.speed - 0.0600001);
      assert.ok(t.distanceM - prev[j]!.distanceM >= prev[j]!.speed * 0.1 - 0.0030001, `tick ${i} ${t.description}: moved ${t.distanceM - prev[j]!.distanceM}, speed ${prev[j]!.speed} -> ${t.speed}, nose ${t.leading.point[0]}`);
    });
    prev = ts;
  }
  assert.ok(prev.every((t) => t.speed === 0));
});

test('a conflicting first observation waits until its initial occupied track is free', () => {
  const standing = createMotion(graph, { ...anchors, anchors: [...anchors.anchors, anchor('ALIAS', 400)] });
  standing.apply(interpose('A'), 0);
  standing.apply(interpose('ALIAS', 'SECOND'), 0);
  assert.equal(standing.trains().length, 1);
  assert.equal(standing.queuedCount(), 1);
  const m = normal();
  m.apply(interpose('A', 'SECOND'), 0);
  assert.equal(m.trains().length, 1);
  assert.equal(m.queuedCount(), 1);
  m.advance(40);
  assert.equal(m.trains().length, 2);
  assert.equal(m.queuedCount(), 0);
  assert.equal(overlapM(m.trains()[0]!.occupied, m.trains()[1]!.occupied), 0);
});

test('stars and other TD areas never create trains', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('A', 'B', '****'), 0);
  m.apply({ ...step('A', 'B'), area: 'ELSEWHERE' }, 0);
  m.advance(1);
  assert.deepEqual(m.trains(), []);
});

test('a cancel fades the train gradually before removing it', () => {
  const m = normal();
  m.advance(5);
  m.apply({ kind: 'cancel', area: 'TEST', descr: 'SYN1', from: 'B' }, 5000);
  assert.equal(one(m).state, 'fading');
  assert.equal(one(m).opacity, 1);
  m.advance(2.5);
  close(one(m).opacity, 0.5);
  m.advance(2.6);
  assert.deepEqual(m.trains(), []);
  assert.equal(m.diagnostics().at(-1)!.reason, 'completed fade');
});

test('quiet trains fade on simulation time and refreshed interposes never teleport them', () => {
  const m = normal({ quietMs: 2000, fadeSeconds: 2 });
  m.advance(2.5);
  assert.equal(one(m).state, 'fading');
  close(one(m).opacity, 0.75);
  const pos = one(m).leading;
  m.apply(interpose('C'), 2500);
  assert.deepEqual(one(m).leading, pos);
  assert.equal(one(m).opacity, 1);
  m.advance(4.1);
  assert.deepEqual(m.trains(), []);
});

test('a nonplatform train refuses a reverse route or an impossibly close new stop', () => {
  const m = normal();
  m.advance(20);
  const before = one(m);
  m.apply(step('B', 'TAIL'), 20_000);
  assert.equal(one(m).targetBerth, 'B');
  assert.deepEqual(one(m).leading, before.leading);
  assert.equal(one(m).reversals, 0);
  const closeAnchor = anchor('CLOSE', before.leading.point[0] + 0.1);
  const m2 = createMotion(graph, { ...anchors, anchors: [...anchors.anchors, closeAnchor] });
  m2.apply(step('A', 'B'), 0); m2.advance(20);
  m2.apply(step('B', 'CLOSE'), 20_000);
  assert.equal(one(m2).targetBerth, 'B');
  assert.ok(m2.diagnostics().some((i) => i.reason.includes('braking distance')));
});

test('routes follow the shortest forward graph path around a junction', () => {
  const g = buildGraph({ nodes: [[1, 0, -1000], [2, 500, -1000], [3, 1000, -1000], [4, 500, -1500], [5, 1500, -1000]], rails: [
    { id: 1, nodes: [1, 2, 3, 5], service: 'main', tunnel: false, bridge: false, layer: 0 },
    { id: 2, nodes: [2, 4, 3], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const start = { ...anchor('START', 400), from: 1, to: 2, t: 0.8 };
  const end = { ...anchor('END', 1400), from: 3, to: 5, t: 0.8 };
  const m = createMotion(g, { area: 'TEST', sources: [], unmapped: [], anchors: [start, end] });
  m.apply(step('START', 'END'), 0);
  for (let i = 0; i < 2000; i++) { m.advance(0.1); close(one(m).leading.point[1], -1000); }
  close(one(m).leading.point[0], 1400);
});

test('lower OSM limits and the station zone are anticipated without harsh braking', () => {
  const g = buildGraph({ nodes: [[1, 0, -2000], [2, 0, -500], [3, 0, -100]], rails: [
    { id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 },
    { id: 2, nodes: [2, 3], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const as: AnchorMap = { area: 'TEST', sources: [], unmapped: [], anchors: [
    { ...anchor('START', 400), from: 1, to: 2, t: 0.3 },
    { ...anchor('END', 1400), from: 2, to: 3, t: 0.8 },
  ] };
  const m = createMotion(g, as, { wayMaxspeed: new Map([[1, '72'], [2, '30']]) });
  m.apply(step('START', 'END'), 0);
  let prev = one(m), entered = false;
  for (let i = 0; i < 3000; i++) {
    m.advance(0.1); const t = one(m);
    assert.ok(t.speed >= prev.speed - 0.0600001);
    if (t.leading.edge.wayId === 2) assert.ok(t.speed <= 30 / 3.6 + 1e-6);
    if (t.leading.point[1] >= -320 && t.leading.point[1] <= -170) { entered = true; assert.ok(t.speed <= 25 / 3.6 + 1e-6); }
    prev = t;
  }
  assert.ok(entered);
  close(prev.leading.point[1], -180);
});

test('maxspeed parses kmh and mph conservatively and falls back for unknown tags', () => {
  close(maxspeedMps('25 mph'), 11.176);
  close(maxspeedMps('36'), 10);
  close(maxspeedMps('72;18 km/h'), 5);
  close(maxspeedMps('signals', 8), 8);
  close(maxspeedMps(undefined, 9), 9);
});

test('the last 400 metres of a platform approach stay below 25 kmh even outside the station rectangle', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('A', 'P'), 0);
  let entered = false;
  for (let i = 0; i < 5000; i++) {
    m.advance(0.1);
    const t = one(m);
    if (t.leading.point[0] >= 2500) { entered = true; assert.ok(t.speed <= 25 / 3.6 + 1e-6); }
  }
  assert.ok(entered);
  close(one(m).leading.point[0], 2900);
});

test('identical events and dt sequences produce identical states and diagnostics', () => {
  const a = normal(), b = normal();
  for (const dt of [0.016, 0.1, 1.7, 4, 0.035, 0, 22]) { a.advance(dt); b.advance(dt); }
  const event = step('MISSED', 'C'); a.apply(event, 30_000); b.apply(event, 30_000);
  for (const dt of [0.1, 0.5, 1 / 60, 70]) { a.advance(dt); b.advance(dt); }
  assert.deepEqual(a.trains(), b.trains());
  assert.deepEqual(a.diagnostics(), b.diagnostics());
  const snapshot = a.trains(); snapshot[0]!.leading.point[0] = 999999; snapshot[0]!.occupied[0]!.fromT = 999;
  assert.deepEqual(a.trains(), b.trains());
});

test('invalid dt and invalid physical options are rejected', () => {
  const m = normal();
  for (const dt of [-1, NaN, Infinity]) assert.throws(() => m.advance(dt));
  assert.throws(() => m.apply(step('A', 'B'), NaN));
  assert.throws(() => createMotion(graph, anchors, { braking: 0 }));
  assert.throws(() => createMotion(graph, anchors, { gapM: -1 }));
});

test('an interpose renames the train held at exactly that berth without changing its physical body', () => {
  const m = createMotion(graph, anchors, { lengthM: (d) => d === 'OLD' ? 130 : 260 });
  m.apply(interpose('P', 'OLD'), 0);
  const before = one(m);
  m.apply(interpose('P', 'NEW'), 0);
  const after = one(m);
  assert.equal(after.description, 'NEW'); assert.equal(after.id, before.id);
  assert.deepEqual(after.leading, before.leading); assert.deepEqual(after.occupied, before.occupied);
  close(after.lengthM, 130); close(after.speed, 0); close(after.opacity, 1);
  assert.equal(m.queuedCount(), 0);
  m.apply({ kind: 'cancel', area: 'TEST', descr: 'OLD', from: 'P' }, 0);
  assert.equal(one(m).state, 'held');
  assert.equal(m.diagnostics().at(-1)!.kind, 'renamed');
});

test('a step into an occupied stop renames its standing train even when the new origin is unmapped', () => {
  const m = createMotion(graph, anchors);
  m.apply(interpose('P', 'OLD'), 0); const before = one(m);
  m.apply(step('UNMAPPED', 'P', 'NEW'), 0);
  const after = one(m);
  assert.equal(after.description, 'NEW'); assert.equal(after.id, before.id);
  assert.deepEqual(after.occupied, before.occupied); close(after.opacity, 1);
  assert.equal(m.diagnostics().at(-1)!.reason, 'step');
});

test('separate partner berths hold different trains and a pending rename waits until the arriving body stops', () => {
  const a = { ...anchors, anchors: [...anchors.anchors, anchor('REAR', 2500, false, '1')] };
  const m = createMotion(graph, a);
  m.apply(interpose('P', 'FRONT'), 0); m.apply(interpose('REAR', 'REAR'), 0);
  assert.equal(m.trains().length, 2); assert.notEqual(m.trains()[0]!.id, m.trains()[1]!.id);
  const moving = createMotion(graph, anchors);
  moving.apply(step('A', 'P', 'INCOMING'), 0); moving.advance(1);
  moving.apply(interpose('P', 'STANDING'), 1000);
  assert.equal(moving.trains().length, 1);
  assert.equal(one(moving).description, 'INCOMING');
  assert.equal(moving.diagnostics().filter((i) => i.kind === 'renamed').length, 0);
  assert.equal(finish(moving).description, 'STANDING');
});

test('an unmapped departure without an anchored successor drives to the boundary under normal limits then fades', () => {
  const m = normal(); finish(m); m.apply(step('B', 'OUTSIDE'), 0);
  assert.equal(one(m).exiting, true);
  let previous = one(m), reached = false;
  for (let i = 0; i < 6000; i++) {
    m.advance(0.1);
    const t = one(m);
    assert.ok(t.leading.point[0] >= previous.leading.point[0] - 1e-7);
    assert.ok(t.speed <= 40 / 3.6 + 1e-7);
    assert.ok(t.speed >= previous.speed - 0.0600001 && t.speed <= previous.speed + 0.0700001);
    if (t.state === 'fading') { close(t.leading.point[0], 4000); reached = true; break; }
    previous = t;
  }
  assert.ok(reached); m.advance(5.1); assert.deepEqual(m.trains(), []);
});

test('a later anchored step replaces an exit route before the boundary without a jump', () => {
  const m = normal(); finish(m); m.apply(step('B', 'OUTSIDE'), 0); m.advance(10);
  const before = one(m); m.apply(step('OUTSIDE', 'C'), 0);
  assert.deepEqual(one(m).leading, before.leading); assert.equal(one(m).exiting, false);
  close(finish(m).leading.point[0], 2800);
});

test('an early unmapped platform departure waits for the buffers and changes cab once before leaving', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('A', 'P'), 0); m.advance(10); m.apply(step('P', 'OUTSIDE'), 0);
  assert.equal(one(m).reversals, 0);
  let reversed = false;
  for (let i = 0; i < 9000; i++) {
    m.advance(0.1); const t = one(m);
    if (t.reversals) { reversed = true; assert.equal(t.reversals, 1); assert.ok(t.leading.point[0] <= 2640 + 1e-6); }
    if (t.state === 'fading') { close(t.leading.point[0], 0); break; }
  }
  assert.ok(reversed); assert.equal(one(m).state, 'fading');
});

test('an arrival first seen outside enters at the boundary and drives to its mapped anchor', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('OUTSIDE', 'B'), 0);
  close(one(m).leading.point[0], 0); assert.equal(one(m).speed, 0);
  assert.equal(m.diagnostics().at(-1)!.kind, 'entering');
  close(finish(m).leading.point[0], 1500);
});

test('an outside arrival can use an anchored successor on an observed chain', () => {
  const m = createMotion(graph, anchors, { observedSteps: [step('MIDDLE', 'B')] });
  m.apply(step('OUTSIDE', 'MIDDLE'), 0);
  close(one(m).leading.point[0], 0); assert.equal(one(m).targetBerth, 'B');
  close(finish(m).leading.point[0], 1500);
});

test('a departing train prefers a previously travelled turn from the same berth over the straight branch', () => {
  const g = buildGraph({ nodes: [[1, 0, -1000], [2, 500, -1000], [3, 1000, -1000], [4, 900, -1200], [5, 1300, -1400]], rails: [
    { id: 1, nodes: [1, 2, 3], service: 'main', tunnel: false, bridge: false, layer: 0 },
    { id: 2, nodes: [2, 4, 5], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const as: AnchorMap = { area: 'TEST', sources: [], unmapped: [], anchors: [
    { ...anchor('START', 400), from: 1, to: 2, t: 0.8 }, { ...anchor('TURN', 1100), from: 4, to: 5, t: 0.5, point: [1100, -1300] },
  ] };
  const m = createMotion(g, as);
  m.apply(step('START', 'TURN', 'FIRST'), 0); finish(m);
  m.apply({ kind: 'cancel', area: 'TEST', descr: 'FIRST', from: 'TURN' }, 0); m.advance(5.1);
  m.apply(interpose('START', 'SECOND'), 0); m.apply(step('START', 'UNMAPPED', 'SECOND'), 0);
  for (let i = 0; i < 2000; i++) { m.advance(0.1); if (one(m).state === 'fading') break; }
  close(one(m).leading.point[0], 1300); close(one(m).leading.point[1], -1400);
});

test('an arrival joins an already interposed departure body and the extra observation fades without jumping', () => {
  const m = createMotion(graph, anchors);
  m.apply(interpose('P', 'DEPARTURE'), 0);
  const standing = one(m);
  m.apply(step('A', 'B', 'ARRIVAL'), 0); m.advance(10);
  const arrival = m.trains().find((t) => t.description === 'ARRIVAL')!;
  m.apply(step('B', 'P', 'ARRIVAL'), 10_000);
  const kept = m.trains().find((t) => t.id === standing.id)!;
  const retired = m.trains().find((t) => t.id === arrival.id)!;
  assert.equal(kept.description, 'ARRIVAL'); assert.equal(kept.state, 'held');
  assert.deepEqual(kept.leading, standing.leading); assert.deepEqual(kept.occupied, standing.occupied);
  assert.equal(retired.state, 'fading'); assert.deepEqual(retired.leading, arrival.leading);
  close(retired.speed, arrival.speed);
  m.advance(5.1); assert.equal(one(m).id, standing.id);
  assert.equal(m.diagnostics().filter((i) => i.kind === 'merged').length, 1);
});

test('an unmapped step after an early mapped departure still exits after reaching its last anchor', () => {
  const m = createMotion(graph, anchors);
  m.apply(step('A', 'P'), 0); m.advance(5);
  m.apply(step('P', 'EXIT'), 5000); m.apply(step('EXIT', 'OUTSIDE'), 5000);
  let last = one(m), left = false;
  for (let i = 0; i < 10_000; i++) {
    m.advance(0.1); const t = one(m);
    assert.equal(t.reversals <= 1, true);
    if (t.reversals === last.reversals) assert.ok(Math.hypot(t.leading.point[0] - last.leading.point[0], t.leading.point[1] - last.leading.point[1]) <= 40 / 3.6 * 0.1 + 1e-6);
    if (t.state === 'fading') { close(t.leading.point[0], 0); left = true; break; }
    last = t;
  }
  assert.ok(left);
});

test('another description on a shared approach does not choose an unseen arrivals platform', () => {
  const m = createMotion(graph, anchors, { observedSteps: [step('MIDDLE', 'B', 'OTHER')] });
  m.apply(step('OUTSIDE', 'MIDDLE'), 0);
  assert.deepEqual(m.trains(), []);
  m.apply(step('MIDDLE', 'C'), 0);
  close(one(m).leading.point[0], 0); close(finish(m).leading.point[0], 2800);
});

test('ambiguous known successors wait for the arrivals own next anchor', () => {
  const m = createMotion(graph, anchors, { observedSteps: [step('MIDDLE', 'B'), step('MIDDLE', 'C')] });
  m.apply(step('OUTSIDE', 'MIDDLE'), 0);
  assert.deepEqual(m.trains(), []);
  m.apply(step('MIDDLE', 'B'), 0); close(finish(m).leading.point[0], 1500);
});

test('a mapped route refuses a hairpin through different edges outside a platform', () => {
  const g = buildGraph({ nodes: [[1, 0, -1000], [2, 1000, -1000], [3, 100, -1010], [4, 0, -1010]], rails: [
    { id: 1, nodes: [1, 2, 3, 4], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const a: AnchorMap = { area: 'TEST', sources: [], unmapped: [], anchors: [anchor('START', 400), { ...anchor('END', 0), from: 3, to: 4, t: 0.5, point: [50, -1010] }] };
  const m = createMotion(g, a);
  m.apply(step('START', 'END'), 0); m.advance(60);
  close(one(m).leading.point[0], 400); assert.equal(one(m).reversals, 0);
  assert.ok(m.diagnostics().some((i) => i.reason === 'no forward graph path'));
});

test('exit continuation backtracks from a platform buffer to an external branch', () => {
  const g = buildGraph({ nodes: [[1, 0, -1000], [2, 1000, -1000], [3, 1200, -1000], [4, 2000, -1400]], rails: [
    { id: 1, nodes: [1, 2, 3], service: 'main', tunnel: false, bridge: false, layer: 0 },
    { id: 2, nodes: [2, 4], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const a: AnchorMap = { area: 'TEST', sources: [], unmapped: [], anchors: [anchor('START', 400), { ...anchor('BUFFER', 1200, false, '1'), from: 2, to: 3, t: 1, point: [1200, -1000] }] };
  const m = createMotion(g, a);
  m.apply(interpose('START'), 0); m.apply(step('START', 'OUTSIDE'), 0);
  for (let i = 0; i < 3000; i++) { m.advance(0.1); if (one(m).state === 'fading') break; }
  close(one(m).leading.point[0], 2000); close(one(m).leading.point[1], -1400);
  assert.equal(one(m).state, 'fading');
});

test('a missing external continuation is diagnosed instead of fading at an internal stop', () => {
  const g = buildGraph({ nodes: [[1, 0, -1000], [2, 1000, -1000], [3, 100, -1010]], rails: [
    { id: 1, nodes: [1, 2, 3], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const a: AnchorMap = { area: 'TEST', sources: [], unmapped: [], anchors: [anchor('START', 400)] };
  const m = createMotion(g, a);
  m.apply(interpose('START'), 0); m.apply(step('START', 'OUTSIDE'), 0); m.advance(10);
  assert.equal(one(m).exiting, false); assert.equal(one(m).state, 'held');
  assert.ok(m.diagnostics().some((i) => i.reason === 'no forward external graph boundary'));
});

test('an early unmapped step finishes its established route to the last anchor before choosing an exit', () => {
  const g = buildGraph({ nodes: [[1, 0, -1000], [2, 500, -1000], [3, 1000, -1000], [4, 900, -1200], [5, 1300, -1400]], rails: [
    { id: 1, nodes: [1, 2, 3], service: 'main', tunnel: false, bridge: false, layer: 0 },
    { id: 2, nodes: [2, 4, 5], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const a: AnchorMap = { area: 'TEST', sources: [], unmapped: [], anchors: [
    { ...anchor('START', 400), from: 1, to: 2, t: 0.8 }, { ...anchor('TURN', 1100), from: 4, to: 5, t: 0.5, point: [1100, -1300] },
  ] };
  const m = createMotion(g, a);
  m.apply(step('START', 'TURN'), 0); m.advance(1);
  m.apply(step('TURN', 'OUTSIDE'), 1000);
  for (let i = 0; i < 2000; i++) { m.advance(0.1); if (one(m).state === 'fading') break; }
  close(one(m).leading.point[0], 1300); close(one(m).leading.point[1], -1400);
});
