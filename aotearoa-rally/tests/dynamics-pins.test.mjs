// DYNAMICS round 3: pin every weight and threshold in core/damage.mjs so that changing one by x10 or /10 turns a test red.
// Expected numbers are written out independently of the module (literal coefficients), not read back from it.
import test from "node:test";
import assert from "node:assert/strict";
import { CARS } from "../core/cars.mjs";
import { makeDamageState, createDamage } from "../core/damage.mjs";

const near = (a, b, msg, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b}`);
const mk = (spec = CARS.huia) => {
  const dmg = makeDamageState();
  const events = [];
  const api = createDamage(spec, dmg, (t, a) => events.push([t, a]));
  const eRef = spec.mass * 700 * (0.7 + 0.06 * spec.stats.toughness);
  return { dmg, api, events, eRef };
};

/** The documented total: 1.6 x weighted mean, floored by 0.9 x the worst body zone and by engine damage. */
function expectedTotal(d) {
  const ms = d.suspension.reduce((a, b) => a + b, 0) / 4, mt = d.tyres.reduce((a, b) => a + b, 0) / 4;
  const mb = (d.body.front + d.body.rear + d.body.left + d.body.right) / 4;
  let t = 1.6 * (0.22 * d.engine + 0.08 * d.gearbox + 0.08 * d.steering + 0.12 * ms + 0.08 * mt + 0.06 * d.radiator + 0.36 * mb);
  const bz = Math.max(d.body.front, d.body.rear, d.body.left, d.body.right);
  if (t < 0.9 * bz) t = 0.9 * bz;
  if (t < d.engine) t = d.engine;
  return Math.min(1, t);
}
const setAll = (dmg, o) => {
  dmg.engine = o.engine || 0; dmg.gearbox = o.gearbox || 0; dmg.steering = o.steering || 0; dmg.radiator = o.radiator || 0;
  for (let i = 0; i < 4; i++) { dmg.suspension[i] = (o.suspension || [0, 0, 0, 0])[i]; dmg.tyres[i] = (o.tyres || [0, 0, 0, 0])[i]; }
  const b = o.body || [0, 0, 0, 0];
  dmg.body.front = b[0]; dmg.body.rear = b[1]; dmg.body.left = b[2]; dmg.body.right = b[3];
  dmg.total = 0;
};

test("total damage: every weight, the body floor and the engine floor", () => {
  const cfgs = [
    { gearbox: 0.9 }, { steering: 0.9 }, { radiator: 0.9 }, { suspension: [0.9, 0.9, 0.9, 0.9] }, { tyres: [0.6, 0.6, 0.6, 0.6] },
    { engine: 0.1, gearbox: 0.9 },
    { engine: 0.3, body: [0.5, 0.5, 0.5, 0.5], suspension: [0.5, 0.5, 0.5, 0.5], tyres: [0.5, 0.5, 0.5, 0.5] },
    { body: [0.3, 0.3, 0.3, 0.3], engine: 0.2, gearbox: 0.4, steering: 0.4 },
    { body: [0.2, 0, 0, 0] }, { body: [0.9, 0, 0, 0] }, { engine: 0.6 },
    { engine: 0.2, body: [0.4, 0.4, 0.4, 0.4], suspension: [1, 0.2, 0.2, 0.2], radiator: 0.5 },
  ];
  for (const c of cfgs) {
    const { dmg, api } = mk();
    setAll(dmg, c);
    api.repair({}); // recompute total + effects from the state
    near(dmg.total, expectedTotal(dmg), JSON.stringify(c));
  }
  // exact hand-computed anchors (so the helper itself is pinned too)
  { const { dmg, api } = mk(); setAll(dmg, { gearbox: 0.9 }); api.repair({}); near(dmg.total, 0.1152, "gearbox 0.9"); }
  { const { dmg, api } = mk(); setAll(dmg, { body: [0.3, 0.3, 0.3, 0.3], engine: 0.2, gearbox: 0.4, steering: 0.4 }); api.repair({}); near(dmg.total, 0.3456, "weighted sum"); }
  { const { dmg, api } = mk(); setAll(dmg, { engine: 0.3, body: [0.5, 0.5, 0.5, 0.5], suspension: [0.5, 0.5, 0.5, 0.5], tyres: [0.5, 0.5, 0.5, 0.5] }); api.repair({}); near(dmg.total, 0.5536, "mixed"); }
});

test("handling effects of damage: steering lock, pull, gearbox, springs, dampers, grip, rolling, power", () => {
  const { dmg, api } = mk();
  setAll(dmg, { steering: 0.5, gearbox: 0.5, suspension: [0, 0, 0.5, 0], tyres: [0, 0, 0.5, 0], radiator: 1, engine: 0.5 });
  api.repair({});
  const fx = api.fx;
  near(fx.lockMul, 1 - 0.38 * 0.5, "lockMul");
  near(fx.pull, 0.045 * 0.25 + 0.01 * 0.5, "pull");
  near(fx.shiftExtra, 0.3 * 0.5, "shiftExtra");
  near(fx.torqueMul, 1 - 0.22 * 0.5, "torqueMul");
  near(fx.springMul[2], 1 - 0.3 * 0.5, "springMul");
  near(fx.damperMul[2], 1 - 0.65 * 0.5, "damperMul");
  near(fx.gripMul[2], 1 - 0.12 * 0.5 - 0.1 * 0.5, "gripMul");
  near(fx.rollExtra[2], 0.015 * 0.5, "rollExtra");
  near(fx.powerMul, (1 - 0.5 * Math.pow(0.5, 1.3)) * (1 - 0.32 * 1), "powerMul");
  near(fx.springMul[0], 1, "undamaged spring"); near(fx.gripMul[0], 1, "undamaged grip");
});

test("puncture at 0.7 tyre damage (grip x0.55, rolling 0.06), engine failure at 0.995 (power x0.12)", () => {
  { const { dmg, api, events } = mk(); setAll(dmg, { tyres: [0.69, 0, 0, 0] }); api.repair({}); assert.equal(events.length, 0); }
  { const { dmg, api, events } = mk(); setAll(dmg, { tyres: [0.71, 0, 0, 0] }); api.impact("front", 0.005 * 987840, -0.5, -2); // any small hit runs the puncture check
    assert.deepEqual(events.filter((e) => e[0] === "puncture"), [["puncture", 0]]);
    near(api.fx.gripMul[0], (1 - 0.12 * dmg.tyres[0] - 0.1 * dmg.suspension[0]) * 0.55, "punctured grip");
    near(api.fx.rollExtra[0], 0.06, "punctured rolling"); }
  { const { dmg, api, events } = mk(); dmg.engine = 0.99; api.refresh(); assert.equal(events.length, 0); near(api.fx.powerMul, (1 - 0.5 * Math.pow(0.99, 1.3)) * 1, "pre-fail power");
    dmg.engine = 0.996; api.refresh(); api.refresh();
    assert.deepEqual(events, [["engine_fail", 0]]); near(api.fx.powerMul, 0.12, "dead power"); assert.equal(api.fx.engineDead, true); }
});

test("impact scaling: reference energy, scuff threshold 0.004, clamp at 1.2, expert scale", () => {
  const { dmg, api, eRef } = mk();
  near(eRef, 1260 * 700 * (0.7 + 0.06 * 7), "huia reference energy");
  assert.equal(api.impact("front", 0.0039 * eRef, 0, -2), 0); near(dmg.body.front, 0, "below the scuff threshold");
  near(api.impact("front", 0.0041 * eRef, 0, -2), 0.0041, "above the threshold"); near(dmg.body.front, 0.0041, "front body");
  { const k = mk(CARS.kea); near(k.api.impact("rear", 0.5 * k.eRef, 0, 2), 0.5, "kea half reference"); near(k.eRef, 1085 * 700 * (0.7 + 0.06 * 5), "kea reference energy"); }
  { const r = mk(); r.api.setScale(0.5); near(r.api.impact("rear", 3 * r.eRef, 0.3, 2), 1.2, "clamped at 1.2"); near(r.dmg.gearbox, 0.35 * 1.2, "gearbox from the clamped value"); }
  { const r = mk(); r.api.setScale(1.35); near(r.api.impact("rear", 0.2 * r.eRef, 0.3, 2), 0.27, "expert scale"); }
});

test("front impact distribution (off-centre spares the engine, past 0.8 adds a bonus), pull side", () => {
  { const { dmg, api, eRef } = mk(); api.impact("front", 0.5 * eRef, -0.4, -2);
    near(dmg.body.front, 0.5, "body"); near(dmg.engine, 0.5 * (0.5 - 0.2 * 0.5), "engine"); near(dmg.radiator, 0.5 * (0.85 - 0.3 * 0.5), "radiator");
    near(dmg.steering, 0.5 * 0.4, "steering"); near(dmg.suspension[0], 0.5 * 0.5 + 0.5 * 0.2, "corner + side suspension"); near(dmg.suspension[1], 0, "other side");
    near(dmg.tyres[0], 0.5 * 0.2, "tyre"); assert.ok(api.fx.pull < 0, "pulls toward the hit side (left)"); }
  { const { dmg, api, eRef } = mk(); api.impact("front", 0.6 * eRef, 0.4, -2);
    near(dmg.suspension[1], 0.6 * 0.5 + 0.6 * 0.2, "right corner"); assert.ok(api.fx.pull > 0, "pulls right"); }
  { const { dmg, api, eRef } = mk(); api.impact("front", 0.9 * eRef, 0, -2);
    near(dmg.engine, 0.9 * 0.5 + (0.9 - 0.8) * 2.5 * 1, "centre hit past 0.8"); }
});

test("rear, side and underbody impact distribution", () => {
  { const { dmg, api, eRef } = mk(); api.impact("rear", 0.4 * eRef, 0.3, 2);
    near(dmg.body.rear, 0.4, "rear"); near(dmg.gearbox, 0.4 * 0.35, "gearbox"); near(dmg.engine, 0.4 * 0.1, "engine");
    near(dmg.suspension[3], 0.4 * 0.5, "rear-right suspension"); near(dmg.tyres[3], 0.4 * 0.2, "rear-right tyre"); }
  { const { dmg, api, eRef } = mk(); api.impact("left", 0.4 * eRef, -0.9, -1);
    near(dmg.body.left, 0.4, "left"); near(dmg.suspension[0], 0.4 * 0.65, "susp"); near(dmg.tyres[0], 0.4 * 0.55, "tyre");
    near(dmg.steering, 0.4 * 0.3, "steering (front half)"); near(dmg.engine, 0.4 * 0.05, "engine"); assert.ok(api.fx.pull < 0); }
  { const { dmg, api, eRef } = mk(); api.impact("right", 0.4 * eRef, 0.9, 1);
    near(dmg.gearbox, 0.4 * 0.1, "rear half hurts the gearbox"); near(dmg.steering, 0, "no steering damage"); near(dmg.suspension[3], 0.4 * 0.65, "susp"); }
  { const { dmg, api, eRef } = mk(); api.impact("under", 0.4 * eRef, 0, 0);
    near(dmg.engine, 0.12, "sump"); near(dmg.gearbox, 0.12, "gearbox"); near(dmg.radiator, 0.06, "hoses"); for (let i = 0; i < 4; i++) near(dmg.suspension[i], 0.1, "springs " + i); }
});

test("landing, bottom-out and scrape damage", () => {
  { const { dmg, api } = mk(); api.landing(0.24); near(dmg.suspension[0], 0, "soft landing is free");
    api.landing(0.5); const d = 0.25 * 0.35; for (let i = 0; i < 4; i++) { near(dmg.suspension[i], d * 0.5, "susp"); near(dmg.tyres[i], d * 0.1, "tyre"); } near(dmg.engine, d * 0.08, "engine"); }
  { const { dmg, api } = mk(); api.bottomout(0.14, 1); near(dmg.suspension[1], 0, "light bottom-out is free");
    api.bottomout(0.5, 1); const d = 0.25 * 0.12; near(dmg.suspension[1], d, "susp"); near(dmg.engine, d * 0.2, "engine"); near(dmg.gearbox, d * 0.25, "gearbox"); }
  { const { dmg, api } = mk(); api.scrape("left", 0.1); near(dmg.body.left, 0.1, "left scrape"); near(dmg.tyres[0], 0.015, "left tyre wear");
    api.scrape("front", 0.1); near(dmg.body.front, 0.1, "front scrape"); near(dmg.tyres[1], 0, "no tyre wear from a front scrape"); }
});

test("thresholds around repair and puncture, off-centre bonus, default toughness", () => {
  // off-centre hit past 0.8 gets a smaller bonus: off = 0.5 here
  { const { dmg, api, eRef } = mk(); api.impact("front", 0.9 * eRef, 0.4, -2);
    near(dmg.engine, 0.9 * (0.5 - 0.2 * 0.5) + (0.9 - 0.8) * 2.5 * (1 - 0.6 * 0.5), "off-centre engine"); }
  // no stats block: toughness defaults to 6
  { const dmg = makeDamageState(); const api = createDamage({ mass: 1000 }, dmg, () => {});
    near(api.impact("rear", 0.5 * 1000 * 700 * (0.7 + 0.06 * 6), 0, 2), 0.5, "default toughness 6"); }
  // a tyre at 0.69 is not punctured by an unrelated small hit; at 0.71 it is
  { const { dmg, api, events } = mk(); dmg.tyres[0] = 0.69; api.impact("rear", 0.005 * 987840, 0.3, 2); assert.equal(events.length, 0, "0.69 must hold air"); }
  // repairing a punctured tyre below 0.7 re-inflates it; repairing it only part way (still >= 0.7) does not
  { const { dmg, api, eRef } = mk(); dmg.tyres[0] = 0.8; api.impact("rear", 0.005 * eRef, -0.3, 2);
    api.repair({ tyres: [0.05, 0, 0, 0] }); near(api.fx.gripMul[0], (1 - 0.12 * dmg.tyres[0] - 0.1 * dmg.suspension[0]) * 0.55, "still flat at 0.76");
    api.repair({ tyres: [0.5, 0, 0, 0] }); near(api.fx.gripMul[0], 1 - 0.12 * dmg.tyres[0] - 0.1 * dmg.suspension[0], "re-inflated below 0.7"); }
  // engine failure clears once repair brings it under 0.995, and not before
  { const { dmg, api } = mk(); dmg.engine = 1; api.refresh(); assert.equal(api.fx.engineDead, true);
    dmg.engine = 0.996; api.repair({ gearbox: 1 }); assert.equal(api.fx.engineDead, true, "0.996 stays failed");
    api.repair({ engine: 0.01 }); assert.equal(api.fx.engineDead, false, "0.986 recovers"); }
});

test("repair: fractions, per-part, total recomputed; reset clears everything", () => {
  const { dmg, api, eRef } = mk();
  api.impact("front", 0.8 * eRef, 0, -2);
  const e0 = dmg.engine, b0 = dmg.body.front;
  api.repair({ body: 0.5 }); near(dmg.body.front, b0 * 0.5, "half body repair"); near(dmg.engine, e0, "engine untouched");
  api.repair({ engine: 1 }); near(dmg.engine, 0, "engine repaired");
  near(dmg.total, expectedTotal(dmg), "total recomputed after repair");
  api.repair(); near(dmg.total, 0, "full repair");
  api.impact("front", 0.8 * eRef, 0, -2); api.reset(); near(dmg.total, 0, "reset"); near(dmg.body.front, 0, "reset body");
});
