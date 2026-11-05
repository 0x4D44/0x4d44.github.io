// node --test js/sim/steer.test.mjs
// The steering kinematics (js/sim/steer.js) - how a person's speed and facing evolve - as pure maths: nobody stops dead, nobody crab-walks, nobody spins on the spot faster than a
// body can, and a person who is going to stand somewhere arrives there at rest. The crowd (people.js), the recorder and the offline emulator all move people through these
// functions, so what is pinned down here is what the game does and what the rubric (research/people-motion-rubric.md) measures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STEER, angDiff, turnGate, yawCap, turnToward, steerStep, arrived } from './steer.js';

const DT = 1 / 60, DEG = 180 / Math.PI;
/** walk a person from the origin toward (0, -D) (so heading 0: forward is -z) for up to `T` s; returns a trace of { t, v, a, z, yaw, w } */
function walkTo(D, want, stop, T = 20, p0 = {}) {
  const p = Object.assign({ yaw: 0, yw: 0, sp: 0, stopHere: !!stop }, p0), tr = []; let x = 0, z = 0, pv = p.sp;
  for (let k = 0; k < T / DT; k++) {
    const gx = 0, gz = -D, d = Math.hypot(gx - x, gz - z);
    if (stop && arrived(p, d)) { tr.push({ t: k * DT, v: 0, a: 0, vTaken: p.sp, x, z, yaw: p.yaw, w: 0, d, arrived: true }); p.sp = 0; break; }
    const yw0 = p.yaw, mv = steerStep(p, DT, { hT: Math.atan2(-(gx - x), -(gz - z)), want, d, stop: !!stop });
    x += -Math.sin(p.yaw) * mv; z += -Math.cos(p.yaw) * mv;
    tr.push({ t: k * DT, v: p.sp, a: (p.sp - pv) / DT, x, z, yaw: p.yaw, w: angDiff(yw0, p.yaw) / DT, d });
    pv = p.sp;
  }
  return tr;
}

test('turnGate: nothing is lost under 20 degrees, a right angle costs about half, turning right round leaves a crawl, and it never rises with the error', () => {
  assert.ok(turnGate(0) === 1 && turnGate(15 / DEG) > 0.99);
  assert.ok(turnGate(90 / DEG) > 0.45 && turnGate(90 / DEG) < 0.65, 'a right angle ' + turnGate(90 / DEG));
  assert.ok(turnGate(170 / DEG) < 0.2, 'about face ' + turnGate(170 / DEG));
  let last = 1; for (let e = 0; e <= Math.PI; e += 0.05) { const g = turnGate(e); assert.ok(g <= last + 1e-12 && g > 0, 'monotone and never zero at ' + e); last = g; }
  assert.equal(turnGate(-1), turnGate(1), 'the same either way round');
});
test('a person speeds up from rest no faster than a person can (about a step and a half to a walk), and reaches the speed they want', () => {
  const tr = walkTo(30, 1.3, false, 8);
  assert.ok(tr.every((s) => s.a <= STEER.A + 1e-6), 'peak acceleration ' + Math.max(...tr.map((s) => s.a)));
  const k = tr.findIndex((s) => s.v >= 1.2999); assert.ok(k > 0 && tr[k].t > 0.7 && tr[k].t < 1.1, 'reaches 1.3 m/s after ' + (k > 0 ? tr[k].t.toFixed(2) : 'never') + ' s');
});
test('a planned stop brakes along v = sqrt(2 b d): from walking pace it takes under a second and a half, never exceeds the planned braking, never overshoots, and ends at rest on the spot', () => {
  for (const v of [0.6, 1.0, 1.3, 1.6]) for (const D of [3, 8]) {
    const tr = walkTo(D, v, true, 30), last = tr[tr.length - 1];
    assert.ok(last.arrived, `${v} m/s over ${D} m arrives`);
    assert.ok(last.d < STEER.ARR + 0.011 || (last.d < 0.15), 'arrives at the place: ' + last.d.toFixed(3));
    // (a short run is still speeding up when the braking curve starts and joins it a little harder than planned, and the last frames of a sampled sqrt curve are a little steeper
    // than the maths: 1.3 planned, never more than 1.6 x that - against the 11 m/s2 of the stop-dead steering this replaced)
    let peak = 0; for (const s of tr) peak = Math.max(peak, -s.a); assert.ok(peak < 1.6 * STEER.BR && peak <= STEER.BMAX, `${v}@${D}: peak braking ${peak.toFixed(2)} m/s2 (planned ${STEER.BR})`);
    assert.ok(tr.every((s) => s.z >= -D - 1e-6), 'never beyond the target');
    // the speed at the moment of arrival is nothing (arrival at rest, not a stop dead from walking pace): the last few frames before it are slow
    assert.ok(last.vTaken < 0.065, `${v}@${D}: ${last.vTaken.toFixed(3)} m/s taken off the person at the moment of arrival (a walk is ~1 m/s)`);
    assert.ok(tr.length * DT < D / v + 2.2, `${v}@${D}: arrives after ${(tr.length * DT).toFixed(1)} s (a walk at that speed ${(D / v).toFixed(1)} s, plus the start and the stop)`);
  }
});
test('an unplanned stop (the speed wanted drops to nothing, a person steps in front) is still limited to the hardest braking a person does', () => {
  const p = { yaw: 0, yw: 0, sp: 1.3, stopHere: false }; let pv = 1.3, peak = 0, k = 0;
  while (p.sp > 0 && k++ < 600) { steerStep(p, DT, { hT: 0, want: 0, d: 5, stop: false }); peak = Math.max(peak, (pv - p.sp) / DT); pv = p.sp; }
  assert.ok(peak <= STEER.BMAX + 1e-6, 'peak ' + peak); assert.ok(k * DT > 1.3 / STEER.BMAX - 0.05, 'takes ' + (k * DT).toFixed(2) + ' s from 1.3 m/s');
});
test('the facing turns at a limited rate and angular acceleration, never overshoots, and is the way the person moves (no crab-walking)', () => {
  for (const a of [20, 60, 120, 175]) for (const sign of [1, -1]) {
    const p = { yaw: 0, yw: 0, sp: 0 }, tgt = sign * a / DEG; let pw = 0, maxW = 0, maxAcc = 0, over = 0, k = 0;
    for (; k < 600; k++) { const y0 = p.yaw; turnToward(p, tgt, DT, yawCap(p.sp)); const w = (p.yaw - y0) / DT; maxW = Math.max(maxW, Math.abs(w)); maxAcc = Math.max(maxAcc, Math.abs(w - pw) / DT); pw = w; over = Math.max(over, sign * (p.yaw - tgt)); if (Math.abs(angDiff(p.yaw, tgt)) < 1e-9 && !p.yw) break; }
    assert.ok(k < 600, `${a} deg: arrives`); assert.ok(maxW <= yawCap(0) + 1e-6, `${a} deg: rate ${(maxW * DEG).toFixed(0)} deg/s`); assert.ok(maxAcc <= STEER.AW + 0.5, `${a} deg: angular acceleration ${maxAcc.toFixed(1)}`);
    assert.ok(over < 1e-6, `${a} deg: overshoot ${(over * DEG).toFixed(2)} deg`);
  }
});
test('walking round a corner: slower while the facing is off the heading, and the path is the facing (the displacement is along the way the person faces every frame)', () => {
  const p = { yaw: 0, yw: 0, sp: 1.3, stopHere: false }; let x = 0, z = 0, minV = 9, maxRate = 0;
  for (let k = 0; k < 6 * 60; k++) {
    const y0 = p.yaw, mv = steerStep(p, DT, { hT: Math.PI / 2, want: 1.3, d: 50, stop: false }), dx = -Math.sin(p.yaw) * mv, dz = -Math.cos(p.yaw) * mv;
    x += dx; z += dz; minV = Math.min(minV, p.sp); maxRate = Math.max(maxRate, Math.abs(angDiff(y0, p.yaw)) / DT);
    if (mv > 1e-9) assert.ok(Math.abs(Math.atan2(-dx, -dz) - p.yaw) < 1e-9, 'moves along its facing');
  }
  assert.ok(minV < 1.0, 'slows for the corner: ' + minV.toFixed(2)); assert.ok(maxRate * DEG < 160, 'turns at ' + (maxRate * DEG).toFixed(0) + ' deg/s'); assert.ok(Math.abs(angDiff(p.yaw, Math.PI / 2)) < 0.02, 'ends facing the way it wanted');
});
test('arrival: a person who stops is there within a few centimetres (or crawling within 15 cm); one who is passing through is there at 30 cm', () => {
  assert.ok(arrived({ stopHere: true, sp: 0 }, 0.04) && !arrived({ stopHere: true, sp: 0.5 }, 0.12) && arrived({ stopHere: true, sp: 0.01 }, 0.12) && !arrived({ stopHere: true, sp: 0 }, 0.3) && !arrived({ stopHere: true, sp: 0.5 }, 0.04), 'only when all but at rest');
  assert.ok(arrived({ stopHere: false, sp: 1 }, 0.29) && !arrived({ stopHere: false, sp: 1 }, 0.31));
});
