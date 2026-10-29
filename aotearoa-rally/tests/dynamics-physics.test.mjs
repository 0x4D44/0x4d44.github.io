// DYNAMICS lane: vehicle physics tests (pure Node, no DOM). Run: node --test tests/dynamics-physics.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { flatStage, makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const KMH = 1 / 3.6;
const input = () => ({ steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false });
const drain = (v) => { v.state.events.length = 0; };

function drive(v, st, inp, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    if (each) each(i * DT, inp, v.state);
    v.step(DT, inp, st);
    drain(v);
  }
}
const mk = (id, surf = SURFACE.GRAVEL, tyre = "gravel", opts = {}) => {
  const st = flatStage(surf);
  const v = createVehicle(CARS[id], { tyre, ...opts });
  v.reset(st.startPose, 0, st);
  return { st, v };
};

function hashState(s) {
  let h = 2166136261 >>> 0;
  const f = new Float64Array(1), u = new Uint32Array(f.buffer);
  for (const x of [s.x, s.y, s.z, s.yaw, s.pitch, s.roll, s.vx, s.vz, s.rpm, s.speed, s.wheels[0].spin, s.wheels[3].load]) {
    f[0] = x;
    h = Math.imul(h ^ u[0], 16777619) >>> 0;
    h = Math.imul(h ^ u[1], 16777619) >>> 0;
  }
  return h;
}

function scriptedRun(id) {
  const st = makeTestStage({ length: 800, curv: (s) => (s > 100 && s < 300 ? 1 / 80 : 0), surf: SURFACE.GRAVEL, width: 12, boundary: 400 });
  const v = createVehicle(CARS[id], { tyre: "gravel" });
  v.reset(st.startPose, 5, st);
  const inp = input();
  for (let i = 0; i < 120 * 12; i++) {
    const t = i * DT;
    inp.throttle = t < 8 ? 1 : 0.3;
    inp.steer = Math.sin(t * 1.3) * 0.4;
    inp.brake = t > 9 && t < 10 ? 0.6 : 0;
    v.step(DT, inp, st);
    drain(v);
  }
  return hashState(v.state);
}

test("determinism: identical scripted runs give identical state hashes, different cars differ", () => {
  const a = scriptedRun("huia"), b = scriptedRun("huia"), c = scriptedRun("kea");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("rest stability: a parked car stays put and settles", () => {
  for (const id of CAR_IDS) {
    const { st, v } = mk(id);
    drive(v, st, input(), 10);
    const s = v.state;
    const p0 = { x: s.x, z: s.z, y: s.y };
    drive(v, st, input(), 10);
    assert.ok(Math.hypot(s.x - p0.x, s.z - p0.z) < 0.01, id + " drifted at rest");
    assert.ok(Math.abs(s.y - p0.y) < 0.005, id + " bounces at rest");
    assert.ok(Math.abs(s.pitch) < 0.05 && Math.abs(s.roll) < 0.05, id + " not level");
    assert.ok(s.speed === 0 || Math.abs(s.speed) < 0.01);
    for (const w of s.wheels) assert.ok(w.grounded && w.load > 1500, id + " wheel load");
  }
});

test("acceleration 0-100 km/h and top speed fall in sane windows per car", () => {
  const win = { huia: [3.8, 6.0, 190, 235], kea: [3.8, 6.0, 185, 225], takahe: [5.0, 7.5, 200, 250], piwakawaka: [5.0, 7.5, 190, 230] };
  for (const id of CAR_IDS) {
    const { st, v } = mk(id, SURFACE.TARMAC, "tarmac");
    const inp = input(); inp.throttle = 1;
    let t100 = NaN, t = 0;
    for (let i = 0; i < 120 * 90; i++) {
      v.step(DT, inp, st); drain(v); t += DT;
      if (isNaN(t100) && v.state.speed >= 100 * KMH) t100 = t;
      if (t > 20 && !isNaN(t100) && i % 120 === 0 && t > 60) break;
    }
    const top = v.state.speedKmh;
    const w = win[id];
    assert.ok(t100 >= w[0] && t100 <= w[1], `${id} 0-100 ${t100.toFixed(2)}s outside ${w[0]}..${w[1]}`);
    assert.ok(top >= w[2] && top <= w[3], `${id} top ${top.toFixed(0)} outside ${w[2]}..${w[3]}`);
  }
});

function brakeDistance(id, surf, tyre) {
  const { st, v } = mk(id, surf, tyre);
  v.reset(st.startPose, 100 * KMH, st);
  const inp = input(); inp.brake = 1;
  const s0 = v.state.s;
  for (let i = 0; i < 120 * 25 && v.state.speed > 0.3; i++) { v.step(DT, inp, st); drain(v); }
  return v.state.s - s0;
}

test("braking distance from 100 km/h per surface: tarmac 40-55 m, gravel 65-90 m, snow longer than gravel", () => {
  for (const id of CAR_IDS) {
    const t = brakeDistance(id, SURFACE.TARMAC, "tarmac");
    const g = brakeDistance(id, SURFACE.GRAVEL, "gravel");
    const sn = brakeDistance(id, SURFACE.SNOW, "snow");
    assert.ok(t >= 40 && t <= 55, `${id} tarmac ${t.toFixed(1)}`);
    assert.ok(g >= 65 && g <= 90, `${id} gravel ${g.toFixed(1)}`);
    assert.ok(sn > g * 1.05 && sn < 140, `${id} snow ${sn.toFixed(1)} vs gravel ${g.toFixed(1)}`);
  }
});

test("steady-state cornering: tarmac supports > 0.8 g, gravel 0.5-0.95 g", () => {
  const peakG = (surf, tyre, id) => {
    const { st, v } = mk(id, surf, tyre);
    v.reset(st.startPose, 22, st);
    const inp = input();
    let best = 0;
    // ramp steering with speed held; record peak lateral g before it washes out
    for (let i = 0; i < 120 * 8; i++) {
      inp.steer = Math.min(1, i * DT * 0.35);
      inp.throttle = v.state.speed < 22 ? 0.5 : 0.12;
      v.step(DT, inp, st); drain(v);
      if (Math.abs(v.state.gLat) > best) best = Math.abs(v.state.gLat);
    }
    return best;
  };
  for (const id of CAR_IDS) {
    const t = peakG(SURFACE.TARMAC, "tarmac", id), g = peakG(SURFACE.GRAVEL, "gravel", id);
    assert.ok(t > 0.8 && t < 1.8, `${id} tarmac peak ${t.toFixed(2)} g`);
    assert.ok(g > 0.5 && g < 1.0, `${id} gravel peak ${g.toFixed(2)} g`);
    assert.ok(t > g, `${id} tarmac must out-grip gravel`);
  }
});

test("handbrake in a corner rotates the car (more yaw rate than the same corner without it)", () => {
  for (const id of CAR_IDS) {
    const run = (hb) => {
      const { st, v } = mk(id);
      v.reset(st.startPose, 20, st);
      const inp = input();
      let maxSlide = 0, maxYaw = 0;
      for (let i = 0; i < 120 * 4; i++) {
        const t = i * DT;
        inp.steer = t > 0.5 ? 0.18 : 0;
        inp.throttle = 0.4;
        inp.handbrake = hb && t > 1 && t < 2 ? 1 : 0;
        v.step(DT, inp, st); drain(v);
        maxSlide = Math.max(maxSlide, Math.abs(v.state.slideAngle));
        maxYaw = Math.max(maxYaw, Math.abs(v.state.yawRate));
      }
      return { maxSlide, maxYaw };
    };
    const a = run(false), b = run(true);
    assert.ok(b.maxSlide > a.maxSlide + 0.15, `${id} slide ${b.maxSlide.toFixed(2)} vs ${a.maxSlide.toFixed(2)}`);
    assert.ok(b.maxYaw > a.maxYaw * 1.1, `${id} yaw ${b.maxYaw.toFixed(2)} vs ${a.maxYaw.toFixed(2)}`);
  }
});

test("weight transfer signs: braking loads the front, accelerating loads the rear, cornering loads the outside", () => {
  const { st, v } = mk("huia");
  v.reset(st.startPose, 25, st);
  const inp = input();
  drive(v, st, inp, 0.5);
  inp.brake = 0.7;
  drive(v, st, inp, 0.6);
  assert.ok(v.state.wheels[0].load + v.state.wheels[1].load > v.state.wheels[2].load + v.state.wheels[3].load, "front heavier under braking");
  assert.ok(v.state.pitch < -0.002, "nose down under braking: pitch " + v.state.pitch);
  inp.brake = 0; inp.throttle = 1;
  const a = createVehicle(CARS.huia, { tyre: "gravel" }); a.reset(st.startPose, 8, st);
  drive(a, st, inp, 1.0);
  assert.ok(a.state.wheels[2].load + a.state.wheels[3].load > a.state.wheels[0].load + a.state.wheels[1].load - 200, "rear loaded under power");
  assert.ok(a.state.pitch > 0.002, "nose up under power: pitch " + a.state.pitch);
  // right turn (steer > 0): body rolls onto the outside (left) wheels, so left loads exceed right loads
  const c = createVehicle(CARS.huia, { tyre: "tarmac" });
  const tst = flatStage(SURFACE.TARMAC);
  c.reset(tst.startPose, 25, tst);
  const ci = input(); ci.steer = 0.4; ci.throttle = 0.3;
  drive(c, tst, ci, 1.5);
  const L = c.state.wheels[0].load + c.state.wheels[2].load, R = c.state.wheels[1].load + c.state.wheels[3].load;
  assert.ok(L > R * 1.2, `outside (left) load ${L.toFixed(0)} vs inside ${R.toFixed(0)}`);
});

test("drivetrain layout: launch wheelspin appears only on the driven axle(s)", () => {
  const spinOf = (id) => {
    const { st, v } = mk(id, SURFACE.GRAVEL, "gravel");
    const inp = input(); inp.throttle = 1;
    let f = 0, r = 0;
    for (let i = 0; i < 120 * 1.5; i++) {
      v.step(DT, inp, st); drain(v);
      const w = v.state.wheels;
      f += Math.max(0, w[0].slipRatio) + Math.max(0, w[1].slipRatio);
      r += Math.max(0, w[2].slipRatio) + Math.max(0, w[3].slipRatio);
    }
    return { f, r, speed: v.state.speed };
  };
  const awd = spinOf("huia"), fwd = spinOf("takahe"), rwd = spinOf("piwakawaka");
  assert.ok(awd.f > 1 && awd.r > 1, `AWD both axles drive ${awd.f.toFixed(1)}/${awd.r.toFixed(1)}`);
  assert.ok(fwd.f > 5 * Math.max(fwd.r, 0.01), `FWD front drives ${fwd.f.toFixed(1)}/${fwd.r.toFixed(1)}`);
  assert.ok(rwd.r > 5 * Math.max(rwd.f, 0.01), `RWD rear drives ${rwd.f.toFixed(1)}/${rwd.r.toFixed(1)}`);
  assert.ok(awd.speed > 3 && fwd.speed > 3 && rwd.speed > 3);
});

test("turbo spools up with time at full throttle and falls off when lifted", () => {
  const { st, v } = mk("huia", SURFACE.TARMAC, "tarmac");
  v.reset(st.startPose, 15, st);
  const inp = input(); inp.throttle = 0;
  drive(v, st, inp, 1.5);
  const idleBoost = v.state.boost;
  inp.throttle = 1;
  drive(v, st, inp, 0.3);
  const early = v.state.boost;
  drive(v, st, inp, 2.5);
  const late = v.state.boost;
  assert.ok(late > early + 0.05 && late > idleBoost + 0.3, `boost ${idleBoost.toFixed(2)} -> ${early.toFixed(2)} -> ${late.toFixed(2)}`);
  inp.throttle = 0;
  drive(v, st, inp, 2.0);
  assert.ok(v.state.boost < late * 0.6, "boost decays after lift: " + v.state.boost.toFixed(2));
  const n = mk("takahe");
  drive(n.v, n.st, Object.assign(input(), { throttle: 1 }), 2);
  assert.equal(n.v.state.boost, 0, "naturally aspirated car reports no boost");
});

test("auto gearbox does not hunt: steady throttle gives a bounded number of shifts and no rapid reversals", () => {
  for (const id of CAR_IDS) {
    const { st, v } = mk(id, SURFACE.TARMAC, "tarmac");
    const inp = input();
    let shifts = 0, lastShiftT = -9, lastDir = 0, rapid = 0, t = 0;
    for (let i = 0; i < 120 * 40; i++) {
      inp.throttle = t < 22 ? 1 : 0.35;
      v.step(DT, inp, st); t += DT;
      for (const e of v.state.events) if (e.t === "shift") {
        const dir = Math.sign(e.to - e.from);
        shifts++;
        if (dir !== lastDir && t - lastShiftT < 1.0 && lastDir !== 0) rapid++;
        lastShiftT = t; lastDir = dir;
      }
      drain(v);
    }
    assert.ok(shifts >= 4 && shifts <= 14, `${id} shifts ${shifts}`);
    assert.equal(rapid, 0, `${id} had up/down reversals within 1 s`);
  }
});

test("manual gearbox honours edge-triggered gearUp/gearDown", () => {
  const { st, v } = mk("kea", SURFACE.TARMAC, "tarmac", { auto: false });
  const inp = input(); inp.throttle = 0.5;
  drive(v, st, inp, 1);
  const g0 = v.state.gear;
  inp.gearUp = true; v.step(DT, inp, st); drain(v);
  drive(v, st, inp, 0.5); // held gearUp: edge-triggered, must not keep climbing
  assert.equal(v.state.gear, g0 + 1);
  inp.gearUp = false; inp.gearDown = true;
  drive(v, st, inp, 0.5);
  assert.equal(v.state.gear, g0);
});

test("setup options: gear ratio scale and steering lock change behaviour", () => {
  const t100 = (setup) => {
    const { st, v } = mk("huia", SURFACE.TARMAC, "tarmac", { setup });
    const inp = input(); inp.throttle = 1;
    let t = 0;
    while (v.state.speed < 27.7 && t < 20) { v.step(DT, inp, st); drain(v); t += DT; }
    return t;
  };
  assert.ok(t100({ gearRatioScale: 1.15 }) !== t100({ gearRatioScale: 1.0 }));
  const { st, v } = mk("huia", SURFACE.TARMAC, "tarmac", { setup: { steeringLock: 1.2 } });
  const w = mk("huia", SURFACE.TARMAC, "tarmac", { setup: { steeringLock: 0.8 } });
  const inp = input(); inp.steer = 1;
  drive(v, st, inp, 1); drive(w.v, w.st, inp, 1);
  assert.ok(Math.abs(v.state.steerAngle) > Math.abs(w.v.state.steerAngle) * 1.3);
});

test("snapshot/restore round-trip reproduces the future exactly", () => {
  const { st, v } = mk("kea");
  const inp = input();
  const script = (t) => { inp.throttle = 0.8; inp.steer = Math.sin(t * 2) * 0.3; };
  drive(v, st, inp, 3, (t) => script(t));
  const snap = JSON.parse(JSON.stringify(v.snapshot()));
  drive(v, st, inp, 3, (t) => script(t + 3));
  const h1 = hashState(v.state);
  const w = createVehicle(CARS.kea, { tyre: "gravel" });
  w.reset(st.startPose, 0, st);
  w.restore(snap);
  drive(w, st, inp, 3, (t) => script(t + 3));
  assert.equal(hashState(w.state), h1);
});

test("step cost: <= 0.35 ms per step (typically ~0.03) and no GC pressure from the step", () => {
  const { st, v } = mk("huia");
  const inp = input(); inp.throttle = 1;
  for (let i = 0; i < 2000; i++) { inp.steer = Math.sin(i * 0.01) * 0.4; v.step(DT, inp, st); drain(v); }
  if (global.gc) global.gc();
  const heap0 = process.memoryUsage().heapUsed;
  const N = 20000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) { inp.steer = Math.sin(i * 0.01) * 0.4; v.step(DT, inp, st); drain(v); }
  const us = ((performance.now() - t0) * 1000) / N;
  const heap = process.memoryUsage().heapUsed - heap0;
  assert.ok(us < 350, `step ${us.toFixed(1)} us`);
  // Without --expose-gc, uncollected young-generation garbage from the loop itself shows up here, so
  // allow a few MB; a real per-step leak (>= 1 KB/step) is 20 MB over this run and still fails.
  assert.ok(heap < (global.gc ? 1e6 : 8e6), `heap grew ${heap} bytes over ${N} steps`);
});
