// Flight model + pilot unit tests. Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/flight.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRCRAFT, getAircraft } from '../src/craft/roster.js';
import { createFlightState, resetFlightState, stepFlight, applyTumble, startBoost, addBoostMeter, topSpeed, FLIGHT } from '../src/flight/flight.js';
import { createControls } from '../src/controls.js';
import { pilotSteer, pilotLevel } from '../src/flight/pilot.js';
import { RNG, deg, wrapPi } from '../src/util.js';

const DT = 1 / 60;
function make(id = 'falcon', speed, pos = new THREE.Vector3(0, 500, 0), quat = new THREE.Quaternion()) {
  const fs = createFlightState(getAircraft(id));
  resetFlightState(fs, pos, quat, speed ?? fs.params.cruise);
  return fs;
}
function run(fs, c, secs, ctx, each) {
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) { stepFlight(fs, typeof c === 'function' ? c(i * DT, fs) : c, DT, ctx); each?.(fs, i * DT); }
}
const ctl = (o = {}) => Object.assign(createControls(), o);
const finite = (fs) => [fs.pos.x, fs.pos.y, fs.pos.z, fs.speed, fs.quat.x, fs.quat.y, fs.quat.z, fs.quat.w, fs.angVel.x, fs.gLoad].every(Number.isFinite);

test('cruise speed per craft is in range and stable', () => {
  for (const a of AIRCRAFT) {
    const fs = make(a.id, 60);
    run(fs, ctl(), 14);
    assert.ok(fs.speed > 85 && fs.speed < 125, `${a.id} cruise ${fs.speed}`);
    assert.ok(Math.abs(fs.speed - fs.params.cruise) < 3, `${a.id} settles at its cruise (${fs.speed} vs ${fs.params.cruise})`);
    assert.ok(Math.abs(fs.pitch) < 0.05 && Math.abs(fs.bank) < 0.05, 'level flight stays level');
  }
});

test('dives gain speed, climbs lose it (energy exchange)', () => {
  const dive = make('falcon'); run(dive, ctl({ pitch: -0.5 }), 1.2); run(dive, ctl({ pitch: 0 }), 0.01);
  const level = make('falcon');
  run(dive, ctl({ pitch: 0 }), 0.0);
  let vmax = 0;
  const d2 = make('falcon'); run(d2, (t) => ctl({ pitch: t < 1.8 ? -0.6 : 0 }), 4, undefined, (f) => { vmax = Math.max(vmax, f.speed); });
  assert.ok(vmax > level.speed + 15, `dive peak ${vmax} vs cruise ${level.speed}`);
  const cl = make('falcon'); let vmin = 1e9; run(cl, (t) => ctl({ pitch: t < 1.0 ? 0.6 : 0 }), 3, undefined, (f) => { vmin = Math.min(vmin, f.speed); });
  assert.ok(vmin < level.speed - 12, `climb min ${vmin}`);
});

test('bank turns the nose in the bank direction; pitch sign: + = nose up', () => {
  const r = make('falcon'); run(r, ctl({ roll: 1 }), 2);
  assert.ok(r.bank > 1.0, `bank right ${r.bank}`);
  assert.ok(r.heading < -0.8, `turned right (heading ${r.heading})`);   // right turn = heading decreases (atan2(-x,-z))
  const l = make('falcon'); run(l, ctl({ roll: -1 }), 2);
  assert.ok(l.bank < -1.0 && l.heading > 0.8);
  const u = make('falcon'); run(u, ctl({ pitch: 1 }), 0.5);
  assert.ok(u.pitch > 0.4, `pull climbs (${u.pitch})`);
  assert.ok(Math.abs(r.pos.y - 500) < 25, 'banked turn holds altitude within 25 m');
});

test('standard assist levels wings when released, pro holds the bank', () => {
  const s = make('falcon'); run(s, ctl({ roll: 1 }), 1); run(s, ctl(), 3);
  assert.ok(Math.abs(s.bank) < 0.1, `standard level ${s.bank}`);
  const p = make('falcon'); run(p, ctl({ roll: 0.9 }), 1, { assist: 'pro' }); const b0 = p.bank; run(p, ctl(), 2, { assist: 'pro' });
  assert.ok(p.bank > 0.7 * b0 && b0 > 0.9, `pro holds bank ${b0} -> ${p.bank}`);
});

test('a full loop completes at cruise speed, fires exactly one loop event and returns near start altitude', () => {
  const fs = make('falcon'); const ev = []; let vmin = 1e9, tDone = 0;
  const y0 = fs.pos.y, dirStart = fs.forward.clone();
  run(fs, ctl({ pitch: 1 }), 3.8, undefined, (f, t) => { vmin = Math.min(vmin, f.speed); for (const e of f.events) ev.push(e); f.events.length = 0; if (!tDone && ev.length) tDone = t; });
  run(fs, ctl(), 1.0, undefined, (f) => { for (const e of f.events) ev.push(e); f.events.length = 0; });
  const loops = ev.filter((e) => e.kind === 'loop');
  assert.equal(loops.length, 1, JSON.stringify(ev));
  assert.equal(loops[0].reward, 25);
  assert.ok(vmin > fs.params.minSpeed, `speed stays above min speed over the top (${vmin})`);
  assert.ok(fs.speed > fs.params.minSpeed);
  assert.ok(tDone < 4 && tDone > 2, `loop time ${tDone}`);
  assert.ok(!ev.some((e) => e.type === 'stall'), 'no stall in a loop');
});

test('barrel roll: 360 degrees, 10-14 m lateral shift, evasion window, cooldown', () => {
  const fs = make('falcon');
  const right0 = fs.right.clone(), p0 = fs.pos.clone(), fwd0 = fs.forward.clone();
  const c = ctl({ barrel: 1 });
  stepFlight(fs, c, DT);
  assert.ok(fs.barrel.t > 0, 'evasion window opens immediately');
  assert.equal(fs.events.filter((e) => e.kind === 'barrel').length, 1); fs.events.length = 0;
  let wasT = 0, ev = 0, rolledMax = 0;
  const q0 = fs.quat.clone();
  for (let i = 0; i < 80; i++) {
    stepFlight(fs, ctl(), DT);
    if (fs.barrel.t > 0) wasT = i * DT;
    for (const e of fs.events) if (e.kind === 'barrel') ev++; fs.events.length = 0;
    rolledMax = Math.max(rolledMax, Math.abs(fs.bank));
  }
  assert.ok(wasT > 0.55 && wasT < 0.7, `window length ${wasT}`);
  assert.equal(ev, 0, 'no re-trigger');
  assert.ok(rolledMax > 1.2, 'actually rolled');
  assert.ok(fs.quat.angleTo(q0) < 0.15, `ends upright (${fs.quat.angleTo(q0)})`);
  const d = fs.pos.clone().sub(p0); const lateral = d.dot(right0);
  assert.ok(lateral > 10 && lateral < 14, `lateral shift ${lateral}`);
  // cooldown: an immediate second request is ignored
  const f2 = make('falcon'); stepFlight(f2, ctl({ barrel: -1 }), DT); run(f2, ctl(), 0.7); assert.ok(f2.barrel.t <= 0);
  stepFlight(f2, ctl({ barrel: -1 }), DT); assert.ok(f2.barrel.t <= 0, 'cooldown blocks');
  run(f2, ctl(), 0.6); stepFlight(f2, ctl({ barrel: -1 }), DT); assert.ok(f2.barrel.t > 0, 'allowed after cooldown');
  assert.ok(fs.forward.dot(fwd0) > 0.99);
  // left barrel moves left
  const f3 = make('falcon'); const r3 = f3.right.clone(), pp = f3.pos.clone(); stepFlight(f3, ctl({ barrel: -1 }), DT); run(f3, ctl(), 0.8);
  assert.ok(f3.pos.clone().sub(pp).dot(r3) < -10);
});

test('stall: climbing to low speed drops the nose, diving recovers, events fire', () => {
  const fs = make('falcon', 70); const ev = [];
  run(fs, ctl({ pitch: 1 }), 0.45, undefined, (f) => { for (const e of f.events) ev.push(e.type); f.events.length = 0; });
  run(fs, ctl({ pitch: 0 }), 40, undefined, (f) => { for (const e of f.events) ev.push(e.type); f.events.length = 0; });
  assert.ok(finite(fs));
  assert.ok(fs.speed > fs.params.minSpeed - 1, `recovered to flying speed (${fs.speed})`);
  // forced stall from low speed
  const s2 = make('falcon', 30); const e2 = []; let sawDrop = false;
  run(s2, ctl(), 10, undefined, (f) => { for (const e of f.events) e2.push(e.type); f.events.length = 0; if (f.pitch < -0.3) sawDrop = true; });
  assert.ok(e2.includes('stall') && e2.includes('recover'), JSON.stringify(e2));
  assert.ok(sawDrop, 'nose drops in a stall');
  assert.ok(s2.speed > s2.params.minSpeed * 0.95);
});

test('airbrake slows (not below min speed) and tightens turns; boost speeds up', () => {
  const a = make('falcon'); run(a, ctl({ airbrake: 1 }), 6);
  assert.ok(a.speed < a.params.cruise - 20 && a.speed >= a.params.minSpeed - 1, `airbrake speed ${a.speed}`);
  const t0 = make('falcon'); run(t0, ctl({ roll: 1 }), 2);
  const t1 = make('falcon'); run(t1, ctl({ roll: 1, airbrake: 1 }), 2);
  assert.ok(Math.abs(t1.heading) > Math.abs(t0.heading) || Math.abs(t1.heading - t0.heading) > 0.1 || t1.speed < t0.speed, 'airbrake turn');
  const b = make('falcon'); addBoostMeter(b, 100); let on = false; run(b, ctl({ boost: true }), 3, undefined, (f) => { on = on || f.boost.active; });
  assert.ok(on && b.speed > b.params.cruise * 1.35 && b.speed <= b.params.cruise * 1.6, `boost speed ${b.speed}`);
  assert.ok(b.boost.meter < 100);
  const tb = make('falcon'); startBoost(tb, 2, 1.6); run(tb, ctl(), 1.5); assert.ok(tb.speed > tb.params.cruise * 1.25);
  run(tb, ctl(), 8); assert.ok(Math.abs(tb.speed - tb.params.cruise) < 4, 'boost decays back to cruise');
  assert.ok(topSpeed(getAircraft('falcon')) > 150);
});

test('speedMul scales speed but not rotation rates', () => {
  const a = make('falcon'); run(a, ctl(), 15, { speedMul: 1.05 });
  assert.ok(Math.abs(a.speed / a.params.cruise - 1.05) < 0.02, `${a.speed}`);
});

test('tumble: spin, speed loss, recovery to a flyable attitude', () => {
  const fs = make('falcon'); applyTumble(fs, 1.5, 1);
  let wmax = 0; run(fs, ctl({ roll: -1, pitch: 1 }), 1.5, undefined, (f) => { wmax = Math.max(wmax, Math.abs(f.angVel.z)); });
  assert.ok(wmax > 5, `visible spin ${wmax}`);
  assert.ok(fs.speed < fs.params.cruise * 0.8, `speed loss ${fs.speed}`);
  run(fs, ctl(), 4);
  assert.ok(fs.tumble.t <= 0 && Math.abs(fs.bank) < 0.15 && Math.abs(fs.pitch) < 0.4, `recovered bank ${fs.bank} pitch ${fs.pitch}`);
  assert.ok(fs.speed > fs.params.cruise * 0.9);
});

test('inverted flight reward and manual roll (pro) events', () => {
  const inv = make('falcon'); inv.quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI); resetFlightState(inv, inv.pos, inv.quat, 100);
  const ie = []; run(inv, ctl(), 2.6, { assist: 'pro' }, (f) => { for (const x of f.events) ie.push(x.kind); f.events.length = 0; });
  assert.equal(ie.filter((k) => k === 'inverted').length, 3, `inverted rewards ${JSON.stringify(ie)}`);
  const e = [];
  const r = make('falcon'); run(r, ctl({ roll: 1 }), 2.6, { assist: 'pro' }, (f) => { for (const x of f.events) e.push(x.kind); f.events.length = 0; });
  assert.ok(e.includes('roll'), `manual roll detected ${JSON.stringify(e)} (${r.stunt.roll})`);
});

test('stability sweep: 60 s of random input stays finite and bounded, deterministic', () => {
  const simulate = (seed) => {
    const rng = new RNG(seed), fs = make('wasp', 90), c = createControls(); let hold = 0;
    for (let i = 0; i < 3600; i++) {
      if (hold-- <= 0) { hold = rng.int(3, 50); c.pitch = rng.pick([-1, -0.5, 0, 0.5, 1]); c.roll = rng.pick([-1, 0, 1, 0.3]); c.yaw = rng.pick([-1, 0, 1]); c.boost = rng.chance(0.3); c.airbrake = rng.chance(0.2) ? 1 : 0; c.barrel = rng.chance(0.2) ? rng.pick([-1, 1]) : 0; if (rng.chance(0.05)) applyTumble(fs, 1.2, rng.pick([-1, 1])); if (rng.chance(0.1)) addBoostMeter(fs, 50); }
      stepFlight(fs, c, rng.chance(0.1) ? rng.range(0, 0.1) : DT, { assist: rng.chance(0.5) ? 'pro' : 'standard', speedMul: 1.05 });
      assert.ok(finite(fs), `non-finite at step ${i}`);
      assert.ok(Math.abs(fs.quat.length() - 1) < 1e-4);
      assert.ok(fs.speed >= 0 && fs.speed < 260);
      fs.events.length = 0;
    }
    return fs.pos.toArray().join(',') + ',' + fs.speed;
  };
  assert.equal(simulate(5), simulate(5), 'deterministic');
  simulate(77);
});

test('dt edge cases: 0, tiny, 0.1, NaN controls are safe', () => {
  const fs = make('manta'); const c = ctl();
  stepFlight(fs, c, 0); stepFlight(fs, c, 1e-9); stepFlight(fs, c, 0.1); stepFlight(fs, c, 5);
  c.pitch = NaN; c.roll = Infinity;
  stepFlight(fs, c, DT);
  assert.ok(finite(fs));
});

test('handling ordering follows stats', () => {
  const hdg = (id) => { const fs = make(id); run(fs, ctl({ roll: 1 }), 1.5); return Math.abs(fs.heading); };
  const rollT = (id) => { const fs = make(id); let t = 0; run(fs, ctl({ roll: 1 }), 2, undefined, (f, tt) => { if (!t && f.bank > 1.0) t = tt; }); return t || 9; };
  const loopT = (id) => { const fs = make(id); let t = 0; run(fs, ctl({ pitch: 1 }), 5, undefined, (f, tt) => { for (const e of f.events) if (e.kind === 'loop' && !t) t = tt; f.events.length = 0; }); return t || 9; };
  assert.ok(hdg('sprite') > hdg('bulldog') * 1.1, `turn: sprite ${hdg('sprite')} bulldog ${hdg('bulldog')}`);
  assert.ok(rollT('sprite') < rollT('bulldog'), 'sprite rolls faster');
  assert.ok(loopT('wasp') < loopT('bulldog'), 'wasp loops tighter');
  const top = (id) => make(id).params.cruise;
  assert.ok(top('manta') > top('falcon') && top('falcon') > top('sprite'));
  assert.ok(top('comet') > top('bulldog'));
  const k = (id) => { const fs = make(id, 60); let t = 0; run(fs, ctl(), 10, undefined, (f, tt) => { if (!t && f.speed > 95) t = tt; }); return t; };
  assert.ok(k('comet') < k('bulldog'), 'comet accelerates harder');
});

test('hard pull at 90 degrees of bank is a horizontal knife-edge turn', () => {
  const fs = make('falcon'); run(fs, ctl({ roll: 1 }), 0.8);
  const y0 = fs.pos.y; let hp = fs.heading, tp = 0; run(fs, ctl({ roll: 1, pitch: 1 }), 1.2, undefined, (f) => { tp += Math.abs(wrapPi(f.heading - hp)); hp = f.heading; });
  const level = make('falcon'); run(level, ctl({ roll: 1 }), 0.8); let hl = level.heading, tl = 0; run(level, ctl({ roll: 1 }), 1.2, undefined, (f) => { tl += Math.abs(wrapPi(f.heading - hl)); hl = f.heading; });
  assert.ok(tp > tl * 1.4, `pull tightens the turn: ${tp} vs ${tl}`);
  assert.ok(Math.abs(fs.pos.y - y0) < 90, `stays roughly level ${fs.pos.y - y0}`);
});

// ---------------- pilot ----------------
function splineCurve() {
  // a closed, genuinely 3-D curve with a vertical loop: x,z lap shape plus a loop bulge in the y/forward plane
  const pts = [];
  const R = 520;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * R * 1.3, 500 + 100 * Math.sin(a * 2) + 40 * Math.cos(a * 3), -Math.cos(a) * R + R));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}
function flyPilot(curve, id, secs, { loop = false } = {}) {
  const L = curve.getLength(), fs = make(id);
  const p0 = curve.getPointAt(0), p1 = curve.getPointAt(0.01);
  fs.pos.copy(p0); const m = new THREE.Matrix4().lookAt(p0, p1, new THREE.Vector3(0, 1, 0)); fs.quat.setFromRotationMatrix(m); resetFlightState(fs, p0, fs.quat, fs.params.cruise);
  const c = createControls(), tgt = new THREE.Vector3(), tmp = new THREE.Vector3();
  let u = 0, sse = 0, n = 0, worst = 0;
  const N = 400;
  const pts = []; for (let i = 0; i < N; i++) pts.push(curve.getPointAt(i / N));
  for (let i = 0; i < secs * 60; i++) {
    // nearest curve point (search near previous)
    let best = 1e18, bi = u;
    for (let k = -12; k <= 12; k++) { const j = (u + k + N) % N; const d = fs.pos.distanceToSquared(pts[j]); if (d < best) { best = d; bi = j; } }
    u = bi;
    const look = Math.round(fs.speed * 0.9 / (L / N));   // ~0.9 s lookahead
    tgt.copy(pts[(u + Math.max(3, look)) % N]);
    pilotSteer(fs, tgt, c);
    stepFlight(fs, c, DT, { assist: 'standard' });
    fs.events.length = 0;
    if (i > 120) { const d = Math.sqrt(best); sse += best; n++; worst = Math.max(worst, d); }
  }
  return { rms: Math.sqrt(sse / n), worst, u };
}

test('pilotSteer tracks a 3-D spline within 25 m RMS (every craft)', () => {
  const curve = splineCurve();
  for (const a of AIRCRAFT) {
    const r = flyPilot(curve, a.id, 50);
    assert.ok(r.rms < 25, `${a.id} rms ${r.rms.toFixed(1)} worst ${r.worst.toFixed(1)}`);
  }
});

function loopCurve() {
  // straight run-in, a full vertical loop (radius 200 m), straight run-out, then a wide return turn
  const pts = [];
  const Rl = 200;
  for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(0, 800, -i * 150));                    // run-in towards -z
  const z0 = -8 * 150;
  for (let i = 1; i < 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push(new THREE.Vector3(((1 - Math.cos(a)) * 0) + (i > 16 ? 70 : 0) * 0 + 30 * Math.sin(a * 0.5) * 0, 800 + Rl * (1 - Math.cos(a)), z0 - Rl * Math.sin(a))); }
  for (let i = 1; i <= 10; i++) pts.push(new THREE.Vector3(0, 800, z0 - i * 150));
  // closing arc back to the start, wide enough to be flyable
  const zE = z0 - 1500; const Rt = 700;
  for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI; pts.push(new THREE.Vector3(Rt * (1 - Math.cos(a)) * 0.8 + 0, 800, zE + Rt * Math.sin(a) * 0)); }
  return pts;
}

test('pilotSteer flies a vertical loop (target above / behind / inverted) and recovers', () => {
  const pts = loopCurve().slice(0, 9 + 31 + 10);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const L = curve.getLength(), fs = make('falcon');
  fs.pos.copy(pts[0]); resetFlightState(fs, pts[0], new THREE.Quaternion(), fs.params.cruise);
  const c = createControls(), tgt = new THREE.Vector3(); const N = 600, P = []; for (let i = 0; i < N; i++) P.push(curve.getPointAt(i / N));
  let u = 0, worst = 0, sawInverted = false, loops = 0;
  for (let i = 0; i < 60 * 40 && u < N - 8; i++) {
    let best = 1e18, bi = u; for (let k = -10; k <= 10; k++) { const j = Math.min(N - 1, Math.max(0, u + k)); const d = fs.pos.distanceToSquared(P[j]); if (d < best) { best = d; bi = j; } }
    u = bi; tgt.copy(P[Math.min(N - 1, u + Math.max(3, Math.round(fs.speed * 0.8 / (L / N))))]);
    pilotSteer(fs, tgt, c); stepFlight(fs, c, DT, { assist: 'standard' });
    for (const e of fs.events) if (e.kind === 'loop') loops++; fs.events.length = 0;
    if (fs.up.y < -0.5) sawInverted = true;
    if (u > 40) worst = Math.max(worst, Math.sqrt(best));
  }
  assert.ok(sawInverted, 'the pilot went inverted over the top');
  assert.ok(worst < 45, `loop path error ${worst.toFixed(1)} m`);
  assert.ok(u >= N - 12, `reached the end of the path (${u}/${N})`);
});

test('pilotSteer turns around to a target behind and fixes inverted attitudes', () => {
  for (const [dir, label] of [[new THREE.Vector3(0, 0, 1), 'behind'], [new THREE.Vector3(0, 1, 0), 'above'], [new THREE.Vector3(-1, -0.2, 0.3), 'left-behind-below']]) {
    const fs = make('falcon'); const c = createControls(); const tgt = fs.pos.clone().addScaledVector(dir.clone().normalize(), 600);
    let err = 9;
    for (let i = 0; i < 60 * 8; i++) { err = pilotSteer(fs, tgt, c); stepFlight(fs, c, DT, { assist: 'standard' }); fs.events.length = 0; if (err < 0.15) break; }
    assert.ok(err < 0.3 || fs.pos.distanceTo(tgt) < 200, `${label}: ended with error ${err}`);
  }
  const fs = make('falcon'); fs.quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI); resetFlightState(fs, fs.pos, fs.quat, 100);
  const c = createControls();
  for (let i = 0; i < 60 * 4; i++) { pilotLevel(fs, c); stepFlight(fs, c, DT, { assist: 'pro' }); fs.events.length = 0; }
  assert.ok(fs.up.y > 0.9, `levelled from inverted (${fs.up.y})`);
});

test('no hovering: a sustained vertical climb bleeds speed, stalls, and the nose falls', () => {
  const fs = make('falcon'); const ev = []; let vmin = 1e9;
  fs.quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); resetFlightState(fs, fs.pos, fs.quat, fs.params.cruise);
  run(fs, ctl(), 25, undefined, (f) => { vmin = Math.min(vmin, f.speed); for (const e of f.events) ev.push(e.type); f.events.length = 0; });
  assert.ok(ev.includes('stall'), JSON.stringify(ev));
  assert.ok(vmin < fs.params.minSpeed, `speed fell below min speed (${vmin})`);
  assert.ok(finite(fs));
});

// ---------------------------------------------------------------- round 1 fixes (P-02, P-06, P-07, P-11, P-17)
const turnDeg = (fs0, c, secs, ctx) => { let tot = 0, prev = fs0.heading; run(fs0, c, secs, ctx, (f) => { let d = f.heading - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; tot += d; prev = f.heading; }); return Math.abs(tot) * 180 / Math.PI / secs; };

test('P-02: bank + pull tightens the turn, never past the bank limit or onto the back (all 6 craft)', () => {
  for (const a of AIRCRAFT) {
    const only = make(a.id); const rateBank = turnDeg(only, ctl({ roll: 1 }), 1.5);
    const fs = make(a.id);
    const rate = turnDeg(fs, ctl({ roll: 1, pitch: 1 }), 1.5, undefined);
    let maxBank = 0, minUp = 1;
    const f2 = make(a.id); run(f2, ctl({ roll: 1, pitch: 1 }), 1.5, undefined, (f) => { maxBank = Math.max(maxBank, Math.abs(f.bank)); minUp = Math.min(minUp, f.up.y); });
    assert.ok(maxBank < deg(85), `${a.id} bank ${maxBank * 57.3}`);
    assert.ok(minUp > 0, `${a.id} up.y ${minUp}`);
    assert.ok(rate >= rateBank, `${a.id} turn ${rate} vs bank-only ${rateBank}`);
    assert.ok(finite(f2));
  }
});

test('P-07: a clean keyboard-ramped 360 loop pays exactly one LOOP, a half loop pays none', () => {
  for (const a of AIRCRAFT) {
    let loops = 0;
    const count = (f) => { for (const e of f.events) if (e.type === 'stunt' && e.kind === 'loop') loops++; f.events.length = 0; };
    const fs = make(a.id); let rot = 0;
    run(fs, (t) => ctl({ pitch: rot >= 330 * Math.PI / 180 ? 0 : Math.min(1, t * 4.5) }), 6, undefined, (f) => { rot += f.angVel.x / 60; count(f); });
    assert.equal(loops, 1, `${a.id}: one LOOP for a full loop (rotated ${rot})`);
    loops = 0; const h = make(a.id); let rot2 = 0;
    run(h, (t) => ctl({ pitch: rot2 >= Math.PI ? 0 : Math.min(1, t * 4.5) }), 6, undefined, (f) => { rot2 += f.angVel.x / 60; count(f); });
    assert.equal(loops, 0, `${a.id}: a half loop pays nothing`);
    loops = 0; const two = make(a.id); let rot3 = 0, seg = 0;
    run(two, (t) => { if (t > 2.5 && seg === 0) { seg = 1; rot3 = 0; } if (t > 5.5 && seg === 1) { seg = 2; rot3 = 0; } return ctl({ pitch: (seg === 0 || seg === 2) && rot3 < 0.9 * Math.PI ? Math.min(1, (t % 3) * 4.5) : 0 }); }, 9, undefined, (f) => { rot3 += f.angVel.x / 60; count(f); });
    assert.equal(loops, 0, `${a.id}: two separate half loops do not add up`);
  }
});

test('P-06: after a missile hit every craft is back to 90% cruise within 3.5 s, without a stall; armour shortens the tumble', async () => {
  const { applyHit } = await import('../src/race/damage.js');
  const { WEAPONS } = await import('../src/race/balance.js');
  const race = { game: { events: { emit() {} } }, rng: { chance: () => true } };
  for (const a of AIRCRAFT) {
    const fs = make(a.id); run(fs, ctl(), 1);
    const victim = { flight: fs, invuln: 0, shield: 0, finished: false, stats: { hitsTaken: 0 }, tumble: 0, empT: 0 };
    assert.ok(applyHit(race, victim, null, 'missile', { tumble: WEAPONS.missile.tumble, loss: WEAPONS.missile.loss }));
    assert.ok(fs.tumble.t >= 0.8, `${a.id} tumble ${fs.tumble.t}`);
    assert.ok(fs.speed < 0.75 * fs.params.cruise, `${a.id} the hit still costs speed (${fs.speed / fs.params.cruise})`);
    let t90 = null, stalled = false;
    run(fs, ctl(), 6, undefined, (f, t) => { if (f.stall.active) stalled = true; if (t90 === null && f.tumble.t <= 0 && f.speed >= 0.9 * f.params.cruise) t90 = t; });
    assert.ok(t90 !== null && t90 <= 3.5, `${a.id} recovered at ${t90}`);
    assert.ok(!stalled, `${a.id} no forced stall`);
  }
  const mk = (id) => ({ flight: make(id), invuln: 0, shield: 0, finished: false, stats: { hitsTaken: 0 }, tumble: 0, empT: 0 });
  const bull = mk('bulldog'), wasp = mk('wasp');
  applyHit(race, bull, null, 'missile', { tumble: 1.5, loss: 0.4 }); applyHit(race, wasp, null, 'missile', { tumble: 1.5, loss: 0.4 });
  assert.ok(bull.flight.tumble.t < wasp.flight.tumble.t, `armour 9 tumbles shorter than armour 3 (${bull.flight.tumble.t} vs ${wasp.flight.tumble.t})`);
});

test('P-11: a scripted barrel roll keeps turning the nose', () => {
  const a = make('falcon'); run(a, ctl({ roll: 1 }), 1.2);
  const b = make('falcon'); run(b, ctl({ roll: 1 }), 1.2);
  const h0 = a.heading; run(a, ctl({ roll: 1 }), 0.7);
  const dNo = Math.abs(wrapPi(a.heading - h0));
  const h1 = b.heading; run(b, ctl({ roll: 1, barrel: 1 }), 0.7);
  const dRoll = Math.abs(wrapPi(b.heading - h1));
  assert.ok(dNo > 0.4 && dRoll > 0.6 * dNo, `heading change with roll ${dRoll} vs without ${dNo}`);
});

test('P-17: Pro assist with a held bank key keeps turning (no continuous roll below full analog stick)', () => {
  for (const a of AIRCRAFT) {
    const fs = make(a.id); const rate = turnDeg(fs, ctl({ roll: 0.98 }), 2, { assist: 'pro' });
    assert.ok(rate > 35, `${a.id} pro turn rate ${rate}`);
  }
});

test('E-19: the airbrake tightens the turn rate by itself (at the same speed, not just by slowing the craft)', () => {
  for (const id of ['falcon', 'manta']) {
    const rate = (airbrake) => { const f = make(id); f.speed = 90; f.vel.copy(f.forward).multiplyScalar(90); let prev = f.heading, tot = 0; run(f, ctl({ roll: 1, airbrake }), 1.5, undefined, (g) => { g.speed = 90; g.vel.copy(g.forward).multiplyScalar(90); let d = g.heading - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; tot += d; prev = g.heading; }); return Math.abs(tot) * 180 / Math.PI / 1.5; };
    const free = rate(0), braked = rate(1);
    assert.ok(braked > free * 1.2, `${id} airbraked turn ${braked.toFixed(1)} deg/s vs free ${free.toFixed(1)} at equal speed`);
  }
});

test('P-07: a zoom climb pushed over into a dive (never on its back) pays no LOOP', () => {
  for (const id of ['falcon', 'comet']) {
    const fs = make(id); let loops = 0, phase = 0;
    run(fs, (t) => ctl({ pitch: phase === 0 ? 1 : phase === 1 ? -1 : 0 }), 8, undefined, (f) => {
      for (const e of f.events) if (e.type === 'stunt' && e.kind === 'loop') loops++; f.events.length = 0;
      if (phase === 0 && f.forward.y > 0.8) phase = 1; else if (phase === 1 && f.forward.y < -0.7) phase = 2;
    });
    assert.equal(phase, 2, `${id}: the push-over reached the dive`);
    assert.equal(loops, 0, `${id}: climb + push-over is not a loop`);
  }
});

test('R2-P-07 (F13): the boost meter refills passively while cruising, and the sprite refills faster than the bulldog', () => {
  const refill = (id) => { const fs = make(id); fs.boost.meter = 20; run(fs, ctl(), 5); return fs.boost.meter - 20; };
  const sprite = refill('sprite'), bulldog = refill('bulldog');
  assert.ok(bulldog > 1, `the bulldog's meter refills at all (+${bulldog.toFixed(1)} in 5 s)`);
  assert.ok(sprite > bulldog * 1.2, `the sprite refills faster (+${sprite.toFixed(1)} vs +${bulldog.toFixed(1)})`);
});

test('R2-P-06 (T10): after any tumble the craft is back to >= 95 % of cruise within 3 s of the tumble ending (all 6 craft, 0.8 / 1.2 / 1.7 s tumbles: the damage table spans 0.8 to 1.7 s)', () => {
  // measured (1.0 s tumble, cruise start): 1.9 .. 2.4 s after the tumble ends (2.5 .. 3.4 s after the hit)
  for (const a of AIRCRAFT) for (const secs of [0.8, 1.2, 1.7]) {
    const fs = make(a.id, undefined, new THREE.Vector3(0, 900, 0)); run(fs, ctl(), 5);
    applyTumble(fs, secs); let end = null, t95 = null;
    run(fs, ctl(), secs + 6, undefined, (f, t) => { if (end === null && f.tumble.t <= 0) end = t; if (t95 === null && end !== null && f.speed >= 0.95 * f.params.cruise) t95 = t; });
    assert.ok(end !== null && t95 !== null && t95 - end <= 3, `${a.id} ${secs} s tumble: 95 % of cruise ${t95 === null ? 'never' : (t95 - end).toFixed(2) + ' s'} after it ends`);
  }
});
