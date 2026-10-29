// DYNAMICS lane: impact response. Glancing hits deflect and keep speed, soft props give way, a hit car still accelerates.
// Run: node --test tests/dynamics-impact.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { CARS, CAR_IDS } from "../core/cars.mjs";
import { createVehicle } from "../core/physics.mjs";
import { SURFACE } from "../core/surfaces.mjs";
import { makeTestStage } from "./dynamics-testtrack.mjs";

const DT = 1 / 120;
const input = () => ({ steer: 0, throttle: 1, brake: 0, handbrake: 0, gearUp: false, gearDown: false });
const prop = (x, z, r, hardness, kind) => ({ x, z, r, kind, hardness, y0: 0, y1: 6 });
const kmh = (s) => s.speed * 3.6;

/** Drive from `startKmh` at `deg` degrees off the road axis; returns speed samples relative to the first impact. */
function drive(stage, id, startKmh, deg, seconds, tyre = "tarmac") {
  const v = createVehicle(CARS[id], { tyre });
  v.reset({ x: 0, y: 0, z: 0, yaw: (-deg * Math.PI) / 180 }, startKmh / 3.6, stage);
  const inp = input();
  let t0 = -1, v0 = startKmh, impacts = 0;
  const at = {};
  const series = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const preSpeed = kmh(v.state);
    v.step(DT, inp, stage);
    for (const e of v.state.events) if (e.t === "impact") { impacts++; if (t0 < 0) { t0 = i * DT; v0 = preSpeed; } }
    v.state.events.length = 0;
    if (t0 >= 0) series.push([i * DT - t0, kmh(v.state)]);
  }
  return { v, t0, v0, impacts, series, speedAt: (t) => (series.find((p) => p[0] >= t) || [0, NaN])[1], maxAfter: (a, b) => Math.max(...series.filter((p) => p[0] >= a && p[0] <= b).map((p) => p[1])) };
}

// A steep bank on the right (about 72 degrees): the terrain contact path, as on the real stages.
const bankStage = () => makeTestStage({ length: 900, width: 12, boundary: 400, surf: SURFACE.TARMAC, height: (x) => (x > 6 ? Math.min(6, (x - 6) * 3) : 0) });
// A hard boundary wall at +-6 m: the soft-wall contact path.
const wallStage = () => makeTestStage({ length: 900, width: 12, boundary: 6, surf: SURFACE.TARMAC });

test("a glancing 25 degree bank or wall hit at 90 km/h keeps >= 60% of its speed after 0.7 s and recovers to 70% within 5 s", () => {
  for (const id of CAR_IDS) {
    for (const [name, st] of [["bank", bankStage()], ["wall", wallStage()]]) {
      const r = drive(st, id, 90, 25, 8);
      assert.ok(r.t0 > 0, `${id} ${name}: never hit`);
      const keep = r.speedAt(0.7) / r.v0;
      assert.ok(keep >= 0.6, `${id} ${name}: kept ${(keep * 100).toFixed(0)}% after 0.7 s`);
      assert.ok(r.maxAfter(0.7, 5) >= 0.7 * r.v0, `${id} ${name}: only back to ${r.maxAfter(0.7, 5).toFixed(0)} km/h (of ${r.v0.toFixed(0)}) within 5 s`);
    }
  }
});

test("a head-on hit into a solid tree sheds most of the speed without bouncing back", () => {
  const st = makeTestStage({ length: 900, width: 12, boundary: 400, surf: SURFACE.TARMAC, obstacles: [prop(0.2, -60, 0.5, 1, "tree")] });
  for (const id of CAR_IDS) {
    const r = drive(st, id, 90, 0, 3);
    assert.ok(r.speedAt(0.3) < 0.3 * r.v0, `${id}: still at ${r.speedAt(0.3).toFixed(0)} km/h 0.3 s after a tree`);
    assert.ok(Math.min(...r.series.map((p) => p[1])) > -15, `${id}: bounced back at ${Math.min(...r.series.map((p) => p[1])).toFixed(0)} km/h`);
    assert.ok(r.v.state.damage.total > 0.3, `${id}: a 90 km/h tree hit should hurt (${r.v.state.damage.total.toFixed(2)})`);
  }
});

test("a soft prop (warning sign) is struck once and the car rolls on at > 60% of its speed", () => {
  const st = makeTestStage({ length: 900, width: 12, boundary: 400, surf: SURFACE.TARMAC, obstacles: [prop(0, -60, 0.12, 0.25, "sign_warning")] });
  for (const id of CAR_IDS) {
    const r = drive(st, id, 90, 0, 4);
    assert.ok(r.impacts >= 1 && r.impacts <= 2, `${id}: ${r.impacts} impact events`);
    assert.ok(r.speedAt(1) >= 0.6 * r.v0, `${id}: ${r.speedAt(1).toFixed(0)} km/h one second after a sign (from ${r.v0.toFixed(0)})`);
    assert.ok(r.v.state.damage.total < 0.2, `${id}: sign damage ${r.v.state.damage.total.toFixed(2)}`);
  }
});

test("full throttle after a hard hit reaches >= 50 km/h within 5 s (no crawl in first gear)", () => {
  // a wide tarmac apron so the car does not end up on grass: this isolates the drivetrain / assist logic
  const st = makeTestStage({ length: 900, width: 80, boundary: 400, surf: SURFACE.TARMAC, obstacles: [prop(0.3, -60, 0.5, 1, "tree")] });
  for (const id of CAR_IDS) {
    const r = drive(st, id, 90, 0, 8);
    assert.ok(r.maxAfter(0, 5) >= 50 && r.speedAt(5) >= 50, `${id}: ${r.speedAt(5).toFixed(0)} km/h five seconds after the hit (max ${r.maxAfter(0, 5).toFixed(0)})`);
  }
});

test("a single unloaded or spinning wheel does not hold the throttle closed (traction assist uses the mean slip)", () => {
  const st = makeTestStage({ length: 900, width: 80, boundary: 400, surf: SURFACE.TARMAC });
  const v = createVehicle(CARS.huia, { tyre: "tarmac" });
  v.reset(st.startPose, 5, st);
  const inp = input();
  let t = 0;
  // launch while one front wheel is forced to spin: the car must still get away like a clean launch
  for (let i = 0; i < 120 * 2; i++) {
    v.step(DT, inp, st);
    v.state.events.length = 0;
    t += DT;
  }
  const clean = kmh(v.state);
  const w = createVehicle(CARS.huia, { tyre: "tarmac" });
  w.reset(st.startPose, 5, st);
  for (let i = 0; i < 120 * 2; i++) {
    if (i < 120) w.state.wheels[1].slipRatio = 1.2; // the assist reads this, the tyre model overwrites it each step
    w.step(DT, inp, st);
    w.state.events.length = 0;
  }
  assert.ok(kmh(w.state) >= 0.8 * clean, `with one wheel reading slip 1.2 the car got to ${kmh(w.state).toFixed(0)} km/h vs ${clean.toFixed(0)} km/h`);
});
