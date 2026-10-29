// DYNAMICS lane round 2: car character, mud, keyboard stability, crash energy, damageScale, names.
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { flatStage, makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const I = (o = {}) => ({ steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false, ...o });
const mk = (id, surf = SURFACE.GRAVEL, tyre = "gravel", opts = {}) => {
  const st = flatStage(surf, 5000);
  const v = createVehicle(CARS[id], { tyre, ...opts });
  v.reset(st.startPose, 0, st);
  return { st, v };
};

test("mud: every car reaches 100 km/h within 25 s, slower than on gravel", () => {
  const t100 = (id, surf) => {
    const { st, v } = mk(id, surf, "gravel");
    let t = 0;
    while (v.state.speedKmh < 100 && t < 40) { v.step(DT, I({ throttle: 1 }), st); v.state.events.length = 0; t += DT; }
    return t;
  };
  for (const id of CAR_IDS) {
    const m = t100(id, SURFACE.MUD), g = t100(id, SURFACE.GRAVEL);
    assert.ok(m < 25, `${id} mud 0-100 ${m.toFixed(1)}`);
    assert.ok(m > g, `${id} mud ${m.toFixed(1)} should be slower than gravel ${g.toFixed(1)}`);
  }
});

// simulated keyboard: a key held for `hold` s, pressed at t0, ramped as core/input.mjs does (4.2/s in, 9/s out)
function keyboardRun(id, kmh, pattern, seconds = 6, surf = SURFACE.GRAVEL, throttle = 1) {
  const { st, v } = mk(id, surf, surf === SURFACE.TARMAC ? "tarmac" : "gravel");
  v.reset(st.startPose, kmh / 3.6, st);
  let ks = 0, badT = 0, worst = 0;
  for (let i = 0; i < seconds / DT; i++) {
    const t = i * DT;
    const want = pattern(t);
    const rate = want !== 0 && Math.sign(want) === Math.sign(ks) ? 4.2 : 9;
    ks += Math.max(-rate * DT, Math.min(rate * DT, want - ks));
    v.step(DT, I({ steer: ks, throttle: throttle(t) }), st);
    v.state.events.length = 0;
    const a = Math.abs(v.state.slideAngle);
    worst = Math.max(worst, a);
    if (a > 60 / 57.3) badT += DT; else badT = Math.max(0, badT - DT);
    if (badT > 1) return { spun: true, worst };
  }
  return { spun: false, worst };
}

test("keyboard: taps and holds on 60-150 km/h never spin any car", () => {
  const patterns = {
    tap: (t) => (t > 1 && t < 1.15 ? 1 : 0),
    holdLeft: (t) => (t > 1 && t < 2.5 ? -1 : 0),
    holdRight: (t) => (t > 1 && t < 3 ? 1 : 0),
    weave: (t) => (Math.sin(t * 2.2) > 0 ? 1 : -1),
    tapLift: (t) => (t > 1 && t < 1.6 ? 0.6 : 0),
  };
  for (const id of CAR_IDS) for (const kmh of [60, 90, 120, 150]) for (const [pn, p] of Object.entries(patterns)) {
    const lift = pn === "tapLift" ? (t) => (t < 1.2 ? 1 : 0) : () => 1;
    const r = keyboardRun(id, kmh, p, 6, SURFACE.GRAVEL, lift);
    assert.ok(!r.spun, `${id} ${kmh} km/h ${pn}: spun (worst slide ${(r.worst * 57.3).toFixed(0)} deg)`);
  }
});

test("lift-off oversteer is gentle: 0.6 steer at 80 km/h then lift stays under 30 deg slide on every car", () => {
  for (const id of CAR_IDS) {
    const { st, v } = mk(id);
    v.reset(st.startPose, 80 / 3.6, st);
    let worst = 0;
    for (let i = 0; i < 4 / DT; i++) {
      const t = i * DT;
      v.step(DT, I({ steer: t < 2 ? 0.6 : 0, throttle: t < 0.5 ? 1 : 0 }), st);
      v.state.events.length = 0;
      worst = Math.max(worst, Math.abs(v.state.slideAngle));
    }
    assert.ok(worst < 30 / 57.3, `${id} slid ${(worst * 57.3).toFixed(0)} deg`);
  }
});

test("a handbrake turn still rotates the car 60+ degrees on gravel (slides stay possible)", () => {
  for (const id of CAR_IDS) {
    const { st, v } = mk(id);
    v.reset(st.startPose, 80 / 3.6, st);
    const y0 = v.state.yaw;
    let peak = 0;
    for (let i = 0; i < 2 / DT; i++) {
      const t = i * DT;
      v.step(DT, I({ steer: 1, throttle: 0.3, handbrake: t < 0.6 ? 1 : 0 }), st);
      v.state.events.length = 0;
      peak = Math.max(peak, Math.abs(v.state.yaw - y0));
    }
    assert.ok(peak * 57.3 > 60, `${id} rotated only ${(peak * 57.3).toFixed(0)} deg`);
  }
});

test("car character: kea turns in quickest, piwakawaka has the most power-on slide, huia is neutral", () => {
  const yawResp = (id) => { // yaw rate 0.25 s after a 0.3 steer step at 70 km/h on tarmac
    const { st, v } = mk(id, SURFACE.TARMAC, "tarmac");
    v.reset(st.startPose, 70 / 3.6, st);
    for (let i = 0; i < 0.25 / DT; i++) { v.step(DT, I({ steer: 0.3, throttle: 0.3 }), st); v.state.events.length = 0; }
    return Math.abs(v.state.yawRate);
  };
  const yr = Object.fromEntries(CAR_IDS.map((c) => [c, yawResp(c)]));
  assert.ok(yr.kea >= yr.huia && yr.kea >= yr.piwakawaka && yr.kea >= yr.takahe * 0.97, "kea yaw response " + JSON.stringify(yr));
  const powerSlide = (id) => {
    const { st, v } = mk(id);
    v.reset(st.startPose, 40 / 3.6, st);
    let w = 0;
    for (let i = 0; i < 3 / DT; i++) { v.step(DT, I({ steer: 0.35, throttle: 1 }), st); v.state.events.length = 0; w = Math.max(w, Math.abs(v.state.slideAngle)); }
    return w;
  };
  const ps = Object.fromEntries(CAR_IDS.map((c) => [c, powerSlide(c)]));
  assert.ok(ps.piwakawaka > ps.huia && ps.piwakawaka > ps.takahe, "power-on slide " + JSON.stringify(ps));
  const brk = (id) => { const { st, v } = mk(id, SURFACE.TARMAC, "tarmac"); v.reset(st.startPose, 27.8, st); const z = v.state.z; while (v.state.speed > 0.3) { v.step(DT, I({ brake: 1 }), st); v.state.events.length = 0; } return z - v.state.z; };
  const b = Object.fromEntries(CAR_IDS.map((c) => [c, brk(c)]));
  assert.ok(b.takahe <= b.huia && b.takahe <= b.piwakawaka, "takahe brakes shortest " + JSON.stringify(b));
  const acc = (id) => { const { st, v } = mk(id, SURFACE.TARMAC, "tarmac"); let t = 0; while (v.state.speedKmh < 100) { v.step(DT, I({ throttle: 1 }), st); v.state.events.length = 0; t += DT; } return t; };
  assert.ok(acc("piwakawaka") > 0 && acc("kea") < acc("takahe"), "kea out-accelerates takahe");
});

function crash(kmh, opts = {}, id = "huia") {
  const st = makeTestStage({ length: 800, width: 12, boundary: 400, obstacles: [{ x: 0, z: -40, r: 0.5, kind: "tree", hardness: 1, y0: 0, y1: 6 }] });
  const v = createVehicle(CARS[id], { tyre: "gravel", ...opts });
  v.reset(st.startPose, kmh / 3.6, st);
  let hit = -1, vBack = 0;
  for (let i = 0; i < 8 / DT; i++) {
    v.step(DT, I(), st);
    if (hit < 0 && v.state.collided < 0.01) hit = i * DT;
    if (hit >= 0 && i * DT > hit + 4 && !vBack) vBack = v.state.speed * 3.6;
    v.state.events.length = 0;
  }
  return { dmg: v.state.damage.total, vBack, v, body: v.state.damage.body.front };
}

test("crash energy: 120 km/h head-on stops dead (no roll-back), 180 is a write-off, 30 is a scrape", () => {
  for (const id of CAR_IDS) {
    const a = crash(30, {}, id), b = crash(120, {}, id), c = crash(180, {}, id);
    assert.ok(a.dmg < 0.05, `${id} 30 km/h dmg ${a.dmg.toFixed(2)}`);
    assert.ok(b.dmg >= 0.35 && b.dmg <= 0.65, `${id} 120 km/h dmg ${b.dmg.toFixed(2)}`);
    assert.ok(Math.abs(b.vBack) < 8, `${id} still rolling ${b.vBack.toFixed(0)} km/h 4 s after the hit`);
    assert.ok(c.dmg >= 0.85, `${id} 180 km/h dmg ${c.dmg.toFixed(2)}`);
  }
});

test("damageScale multiplies crash damage, survives snapshot/restore, and repair still works", () => {
  const a = crash(90, { damageScale: 1 }), b = crash(90, { damageScale: 1.35 });
  assert.ok(Math.abs(b.body / a.body - 1.35) < 0.08, `body ratio ${(b.body / a.body).toFixed(2)}`);
  const snap = JSON.parse(JSON.stringify(b.v.snapshot()));
  const w = createVehicle(CARS.huia, { tyre: "gravel" });
  w.restore(snap);
  assert.equal(w.options.damageScale, 1.35);
  b.v.configure({ damageScale: 1 });
  assert.equal(b.v.options.damageScale, 1);
  b.v.repair();
  assert.equal(b.v.state.damage.total, 0);
});

test("display names carry macrons, ids stay ASCII, no real-brand sponsors", () => {
  assert.equal(CARS.takahe.name.startsWith("Takahē"), true);
  assert.equal(CARS.piwakawaka.name.startsWith("Pīwakawaka"), true);
  for (const id of CAR_IDS) assert.match(id, /^[a-z]+$/);
  const banned = /\b(tui|kauri|pounamu|moana|aroha|tussock bank|fiordland outfitters|southern ice|piwakawaka pies|pacific freight)\b/i;
  for (const id of CAR_IDS) for (const l of CARS[id].liveries) {
    assert.ok(!banned.test(l.sponsor) && !banned.test(l.name), `${id}: ${l.name} / ${l.sponsor}`);
    assert.ok(l.sponsor && l.name && l.number > 0);
  }
});
