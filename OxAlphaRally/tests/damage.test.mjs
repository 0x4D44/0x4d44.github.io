import test from "node:test";
import assert from "node:assert/strict";

import {
  createDamage,
  applyImpact,
  stepDamage,
  damageEffects,
  damageReport,
  damageVisuals,
  createRepairPlan,
  applyRepairs,
  componentHealth,
  setComponentHealth,
  componentStatus,
  severityLabel,
  COMPONENTS,
  IMPACT_KINDS,
  EFFECT_BOUNDS,
  ARRAY_EFFECT_BOUNDS,
} from "../damage.js";
import { makeRng } from "../rng.js";

function makeCar(over = {}) {
  return {
    spec: { mass: 1230, drive: "awd" },
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    speed: 0,
    engineLoad: 0,
    rolledOver: false,
    ...over,
  };
}

const FRONT = { x: 0, y: 0, z: 2.05 };
const FRONT_LEFT = { x: -0.8, y: -0.05, z: 1.9 };
const HEAD_ON = { x: 0, y: 0, z: -1 };

function run(damage, car, seconds, dt = 0.05) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i += 1) stepDamage(damage, car, dt);
  return damage;
}

test("a light scrape costs little", () => {
  const d = createDamage({ seed: "scrape" });
  applyImpact(d, makeCar(), {
    speed: 8,
    kind: "scrape",
    point: { x: -0.95, y: 0.05, z: 0.4 },
    normal: { x: 1, y: 0, z: 0 },
    dir: { x: -0.15, y: 0, z: 0.99 },
  });
  const fx = damageEffects(d);
  assert.ok(d.severity > 0, "a scrape must leave a mark");
  assert.ok(d.severity < 0.02, `scrape severity ${d.severity} should be trivial`);
  assert.equal(fx.retired, false);
  assert.equal(fx.powerScale, 1);
  assert.equal(componentStatus(componentHealth(d, "bodyLeft")) === "ok"
    || componentStatus(componentHealth(d, "bodyLeft")) === "scratched", true);
});

test("a square 100 km/h hit is catastrophic", () => {
  const d = createDamage({ seed: "bank" });
  const res = applyImpact(d, makeCar(), {
    speed: 100 / 3.6,
    kind: "hit",
    point: FRONT,
    normal: HEAD_ON,
    dir: { x: 0, y: 0, z: 1 },
  });
  const fx = damageEffects(d);
  assert.ok(res.energy > 3e5, `expected a big number of joules, got ${res.energy}`);
  assert.ok(d.severity > 0.55, `severity ${d.severity}`);
  assert.equal(componentHealth(d, "bodyFront"), 0);
  assert.equal(componentHealth(d, "radiator"), 0, "the radiator is behind the panel and it went too");
  assert.ok(componentHealth(d, "suspFL") <= 0.02 && componentHealth(d, "suspFR") <= 0.02);
  assert.equal(fx.retired, true);
  assert.equal(fx.retiredReason, "Both front suspensions destroyed");
  assert.equal(severityLabel(d.severity) === "critical" || severityLabel(d.severity) === "terminal", true);
});

test("obliqueness: a glance costs far less than a square hit", () => {
  const square = createDamage({ seed: "oblique" });
  applyImpact(square, makeCar(), {
    speed: 20, kind: "hit", point: FRONT_LEFT,
    normal: HEAD_ON, dir: { x: 0, y: 0, z: 1 },
  });

  const glance = createDamage({ seed: "oblique" });
  const n = Math.hypot(0.98, 0.2);
  applyImpact(glance, makeCar(), {
    speed: 20, kind: "hit", point: FRONT_LEFT,
    normal: { x: -0.98 / n, y: 0, z: -0.2 / n },
    dir: { x: 0, y: 0, z: 1 },
  });

  assert.ok(glance.severity > 0, "a glance still costs something");
  assert.ok(square.severity > glance.severity * 5,
    `square ${square.severity} vs glance ${glance.severity}`);
});

test("impact energy scales with the square of closing speed", () => {
  const slow = createDamage({ seed: "e" });
  const fast = createDamage({ seed: "e" });
  const a = applyImpact(slow, makeCar(), { speed: 10, kind: "hit", point: FRONT, normal: HEAD_ON, dir: { x: 0, y: 0, z: 1 } });
  const ea = a.energy;
  const b = applyImpact(fast, makeCar(), { speed: 20, kind: "hit", point: FRONT, normal: HEAD_ON, dir: { x: 0, y: 0, z: 1 } });
  assert.ok(Math.abs(b.energy / ea - 4) < 1e-9, `ratio ${b.energy / ea}`);
});

test("a heavy landing loads all four corners and the driveshaft", () => {
  const d = createDamage({ seed: "landing" });
  applyImpact(d, makeCar({ vel: { x: 0, y: -14, z: 25 }, yaw: 0 }), {
    speed: 14, kind: "landing", point: { x: 0, y: -0.4, z: 0 }, normal: { x: 0, y: 1, z: 0 },
  });
  for (const key of ["suspFL", "suspFR", "suspRL", "suspRR"]) {
    assert.ok(componentHealth(d, key) < 1, `${key} should be loaded by a landing`);
  }
  assert.ok(componentHealth(d, "driveshaft") < 1);
  assert.ok(componentHealth(d, "windscreen") > 0.9, "a landing is not a windscreen event");
});

test("a roll takes the roof and the glass", () => {
  const d = createDamage({ seed: "roll" });
  applyImpact(d, makeCar(), { speed: 9, kind: "roll", point: { x: 0, y: 0.7, z: 0 } });
  assert.ok(componentHealth(d, "bodyRoof") < componentHealth(d, "bodyRear"));
  assert.ok(componentHealth(d, "windscreen") < 0.9);
  const vis = damageVisuals(d);
  assert.equal(vis.glass.windscreenCracked, true);
});

test("a front-left hit does not reach across the car", () => {
  const d = createDamage({ seed: "reach" });
  applyImpact(d, makeCar(), {
    speed: 60 / 3.6, kind: "hit",
    point: { x: -0.85, y: -0.05, z: 1.95 },
    normal: { x: 0.35, y: 0, z: -0.94 },
  });
  assert.ok(componentHealth(d, "suspFL") < 0.2, "the struck corner takes it");
  assert.ok(componentHealth(d, "bodyLeft") < 0.6, "and so does the near flank");
  assert.ok(componentHealth(d, "bodyRight") > 0.95, "the far flank must not");
  assert.ok(componentHealth(d, "suspRR") > 0.95);
  assert.ok(componentHealth(d, "bodyRear") > 0.95);
  assert.ok(componentHealth(d, "suspFL") < componentHealth(d, "suspFR"));
  assert.ok(damageEffects(d).steerPull > 0.02, "a bent left corner pulls left");
});

test("the effects object is reused, never rebuilt", () => {
  const d = createDamage({ seed: "alloc" });
  const car = makeCar({ speed: 30, engineLoad: 0.7 });
  const fx = damageEffects(d);
  const grip = fx.tyreGrip;
  const susp = fx.suspension[2];
  const gears = fx.gearBlocked;
  for (let i = 0; i < 500; i += 1) stepDamage(d, car, 1 / 120);
  const after = damageEffects(d);
  assert.equal(after, fx);
  assert.equal(after.tyreGrip, grip);
  assert.equal(after.suspension[2], susp);
  assert.equal(after.gearBlocked, gears);
  assert.equal(damageVisuals(d), damageVisuals(d));
  assert.equal(damageReport(d), damageReport(d));
});

test("overheating only seizes the engine once the radiator is holed", () => {
  const hard = makeCar({ speed: 25, engineLoad: 1 });

  const healthy = createDamage({ seed: "cool" });
  run(healthy, hard, 1800);
  assert.equal(healthy.seized, false, "a healthy cooling system must never cook the engine");
  assert.ok(healthy.engineTemp < 130, `healthy temp ${healthy.engineTemp}`);
  assert.equal(componentHealth(healthy, "engine"), 1);

  const hot = createDamage({ seed: "cool", ambient: 35 });
  run(hot, makeCar({ speed: 3, engineLoad: 1 }), 1800);
  assert.equal(hot.seized, false, "even a hot day and a slow climb must not seize a healthy car");

  const holed = createDamage({ seed: "cool" });
  applyImpact(holed, makeCar(), {
    speed: 18, kind: "water", point: { x: 0, y: 0, z: 1.9 },
    normal: HEAD_ON, dir: { x: 0, y: 0, z: 1 },
  });
  assert.ok(componentHealth(holed, "radiator") < 0.5, "the water hit should hole the radiator");
  assert.ok(componentHealth(holed, "engine") > 0.6, "but not wreck the engine outright");

  const before = holed.engineTemp;
  run(holed, hard, 60);
  const mid = holed.engineTemp;
  assert.ok(mid > before, `temp should climb: ${before} -> ${mid}`);
  run(holed, hard, 340);
  assert.equal(holed.seized, true, `expected a seize, temp ${holed.engineTemp}`);
  assert.equal(damageEffects(holed).powerScale, 0);
  assert.equal(holed.retiredReason, "Engine seized");
});

test("a puncture degrades in stages and grip falls monotonically", () => {
  const d = createDamage({ seed: "puncture" });
  const car = makeCar({ speed: 22, engineLoad: 0.4 });

  let tries = 0;
  while (d.tyreLeak[0] <= 0 && tries < 20) {
    applyImpact(d, car, {
      speed: 5, kind: "kerb",
      point: { x: -0.8, y: -0.35, z: 1.3 },
      normal: { x: 1, y: 0.2, z: 0 },
      dir: { x: -1, y: 0, z: 0.2 },
    });
    tries += 1;
  }
  assert.ok(tries < 20, "a kerb strike should eventually cut the tyre");
  assert.equal(damageEffects(d).punctureStage[0], 0, "it starts as a slow puncture, not a blowout");

  const stages = [0];
  let grip = damageEffects(d).tyreGrip[0];
  const first = grip;
  for (let i = 0; i < 4000; i += 1) {
    stepDamage(d, car, 0.05);
    const fx = damageEffects(d);
    const g = fx.tyreGrip[0];
    assert.ok(g <= grip + 1e-12, `grip rose from ${grip} to ${g}`);
    assert.ok(g >= ARRAY_EFFECT_BOUNDS.tyreGrip[0] && g <= ARRAY_EFFECT_BOUNDS.tyreGrip[1]);
    grip = g;
    const st = fx.punctureStage[0];
    if (st !== stages[stages.length - 1]) stages.push(st);
  }
  assert.deepEqual(stages, [0, 1, 2, 3], `stage sequence ${stages}`);
  assert.ok(grip < first * 0.75, `grip ${grip} should be well below ${first}`);
  assert.ok(damageEffects(d).tyreRolling[0] > 2, "a rim drags");
  assert.equal(damageVisuals(d).wheels[0].rim, true);
  assert.equal(damageVisuals(d).sparks, 1);
});

test("a bent front corner makes the car pull, and a bent rack shortens the lock", () => {
  const d = createDamage({ seed: "pull" });
  setComponentHealth(d, "suspFL", 0.3);
  setComponentHealth(d, "steering", 0.4);
  const fx = damageEffects(d);
  assert.ok(fx.steerPull > 0.005, `pull ${fx.steerPull}`);
  assert.ok(fx.steerRangeScale < 0.7);
  assert.ok(fx.steerSlop > 0.02);
  assert.ok(fx.suspension[0].travelScale < 0.6);
  assert.equal(fx.suspension[0].stuck, false);
  setComponentHealth(d, "suspFL", 0.1);
  assert.equal(damageEffects(d).suspension[0].stuck, true);
});

test("a broken driveshaft drops a 4WD car onto one axle", () => {
  const d = createDamage({ seed: "drive", drive: "awd" });
  assert.equal(damageEffects(d).driveMode, "awd");
  setComponentHealth(d, "driveshaft", 0.15);
  const mode = damageEffects(d).driveMode;
  assert.ok(mode === "fwd" || mode === "rwd", `mode ${mode}`);
  assert.equal(damageEffects(d).frontDriveBias, mode === "fwd" ? 1 : 0);
  setComponentHealth(d, "driveshaft", 0.0);
  assert.equal(damageEffects(d).driveMode, "none");
  assert.equal(damageEffects(d).drivetrainScale, 0);
});

test("a wrecked gearbox loses gears, and never gear one first", () => {
  const d = createDamage({ seed: "box" });
  setComponentHealth(d, "gearbox", 0.5);
  const fx = damageEffects(d);
  let blocked = 0;
  for (let g = 0; g < 9; g += 1) blocked += fx.gearBlocked[g];
  assert.equal(blocked, 1);
  assert.equal(fx.gearBlocked[1], 0, "first gear is the last thing to go");
  assert.ok(fx.shiftTimeScale > 1);
  setComponentHealth(d, "gearbox", 0.05);
  let blocked2 = 0;
  for (let g = 0; g < 9; g += 1) blocked2 += damageEffects(d).gearBlocked[g];
  assert.equal(blocked2, 5);
});

test("rolled and unable to restart retires the car", () => {
  const d = createDamage({ seed: "upside" });
  const car = makeCar({ rolledOver: true, speed: 0 });
  run(d, car, 9);
  assert.equal(d.retired, false);
  run(d, car, 4);
  assert.equal(d.retired, true);
  assert.equal(d.retiredReason, "Rolled and unable to restart");
});

test("repair plans respect the time budget and fix what matters", () => {
  const d = createDamage({ seed: "service" });
  setComponentHealth(d, "steering", 0.0);
  setComponentHealth(d, "headlights", 0.0);
  setComponentHealth(d, "bodyLeft", 0.2);
  d.tyrePressure[2] = 0;

  const plan = createRepairPlan(d, 4);
  const spent = plan.items.reduce((a, i) => a + i.minutes, 0);
  assert.ok(spent <= 4 + 1e-9, `spent ${spent} of 4 minutes`);
  assert.ok(Math.abs(spent - plan.usedMinutes) < 1e-9);
  const keys = plan.items.map((i) => i.key);
  assert.ok(keys.includes("steering"), `steering must be on the list: ${keys}`);
  assert.ok(keys.includes("tyreRL"), `a flat is cheap and vital: ${keys}`);
  assert.ok(!keys.includes("headlights"), `cosmetics wait: ${keys}`);
  assert.ok(!keys.includes("bodyLeft"), `panels wait: ${keys}`);
  assert.ok(plan.predictedSeverity < d.severity);

  applyRepairs(d, plan);
  assert.ok(componentHealth(d, "steering") > 0.3, "the rack got some attention");
  assert.equal(d.tyrePressure[2], 1);
  assert.equal(componentHealth(d, "headlights"), 0);

  const full = createRepairPlan(d, 600);
  applyRepairs(d, full);
  for (const c of COMPONENTS) {
    assert.ok(componentHealth(d, c.key) > 0.99, `${c.key} should be rebuilt with 600 minutes`);
  }
  assert.equal(d.retired, false);
  assert.ok(d.severity < 0.01);
});

test("a zero-minute service changes nothing", () => {
  const d = createDamage({ seed: "nostop" });
  setComponentHealth(d, "suspRR", 0.4);
  const plan = createRepairPlan(d, 0);
  assert.equal(plan.items.length, 0);
  applyRepairs(d, plan);
  assert.ok(Math.abs(componentHealth(d, "suspRR") - 0.4) < 1e-12);
});

test("a service park cannot un-seize an engine it did not rebuild", () => {
  const d = createDamage({ seed: "seize" });
  setComponentHealth(d, "engine", 0);
  assert.equal(d.seized, true);
  applyRepairs(d, createRepairPlan(d, 2));
  assert.equal(d.seized, true, "two minutes does not rebuild an engine");
  applyRepairs(d, createRepairPlan(d, 60));
  assert.equal(d.seized, false);
  assert.equal(d.retired, false);
});

test("report rows are worst-first and carry a status word", () => {
  const d = createDamage({ seed: "rows" });
  setComponentHealth(d, "bodyFront", 0.5);
  setComponentHealth(d, "turbo", 0.05);
  const rows = damageReport(d);
  assert.equal(rows.length, COMPONENTS.length);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i].health >= rows[i - 1].health);
  assert.equal(rows[0].key, "turbo");
  assert.equal(rows[0].status, "destroyed");
  const front = rows.find((r) => r.key === "bodyFront");
  assert.equal(front.status, "bent");
  assert.equal(front.damaged, true);
  const gearbox = rows.find((r) => r.key === "gearbox");
  assert.equal(gearbox.status, "ok");
  assert.equal(gearbox.damaged, false);
  assert.equal(damageEffects(d).turboScale, 0, "a destroyed turbo makes no boost");
});

test("visual deformation tracks the panels and sheds parts", () => {
  const d = createDamage({ seed: "visual" });
  const clean = damageVisuals(d);
  assert.equal(clean.detachedCount, 0);
  assert.equal(clean.panels.front, 0);

  for (let i = 0; i < 6; i += 1) {
    applyImpact(d, makeCar(), {
      speed: 14, kind: "hit", point: FRONT, normal: HEAD_ON, dir: { x: 0, y: 0, z: 1 },
    });
  }
  const v = damageVisuals(d);
  assert.ok(v.panels.front > 0.9);
  assert.ok(v.panels.bonnet >= v.panels.front);
  assert.ok(v.detachedCount > 0, "a flattened nose loses its bumper");
  assert.ok(v.detachedList.slice(0, v.detachedCount).includes("bumperFront"));
  assert.equal(v.lights.leftOut || v.lights.rightOut, true);
  for (let i = 0; i < v.detachedCount; i += 1) assert.equal(v.detached[v.detachedList[i]], true);
});

test("every effect multiplier stays finite and in its declared range", () => {
  const rng = makeRng("fuzz");
  const d = createDamage({ seed: "fuzz" });
  const car = makeCar();
  for (let i = 0; i < 600; i += 1) {
    car.speed = rng.range(0, 55);
    car.engineLoad = rng.next();
    car.rolledOver = rng.chance(0.05);
    car.vel.x = rng.range(-40, 40);
    car.vel.y = rng.range(-25, 10);
    car.vel.z = rng.range(-40, 40);
    car.yaw = rng.range(-Math.PI, Math.PI);
    if (rng.chance(0.4)) {
      applyImpact(d, car, {
        speed: rng.range(0, 45),
        kind: rng.pick(IMPACT_KINDS),
        point: { x: rng.range(-1.2, 1.2), y: rng.range(-0.6, 1.0), z: rng.range(-2.3, 2.3) },
        normal: { x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1) },
      });
    }
    stepDamage(d, car, rng.range(0.001, 0.3));
    checkBounds(damageEffects(d));
    damageVisuals(d);
    damageReport(d);
  }
  assert.equal(d.retired, true, "600 rounds of abuse should end the rally");
});

test("degenerate impacts are absorbed, not propagated as NaN", () => {
  const d = createDamage({ seed: "degenerate" });
  applyImpact(d, null, { speed: 0, kind: "hit" });
  applyImpact(d, makeCar(), { speed: Number.NaN, kind: "nonsense", point: { x: 0, y: 0, z: 0 } });
  applyImpact(d, makeCar(), { speed: 12, kind: "rock", normal: { x: 0, y: 0, z: 0 }, point: { x: 0, y: 0, z: 0 } });
  stepDamage(d, null, 0);
  stepDamage(d, null, 50);
  checkBounds(damageEffects(d));
  assert.ok(Number.isFinite(d.severity));
});

function checkBounds(fx) {
  for (const [key, [lo, hi]] of Object.entries(EFFECT_BOUNDS)) {
    const v = fx[key];
    assert.equal(Number.isFinite(v), true, `${key} is ${v}`);
    assert.ok(v >= lo - 1e-9 && v <= hi + 1e-9, `${key} = ${v} outside [${lo}, ${hi}]`);
  }
  const arrays = {
    tyreGrip: fx.tyreGrip, tyreRolling: fx.tyreRolling, tyreRadiusScale: fx.tyreRadiusScale,
  };
  for (const [key, arr] of Object.entries(arrays)) {
    const [lo, hi] = ARRAY_EFFECT_BOUNDS[key];
    for (let i = 0; i < 4; i += 1) {
      assert.equal(Number.isFinite(arr[i]), true, `${key}[${i}] is ${arr[i]}`);
      assert.ok(arr[i] >= lo - 1e-9 && arr[i] <= hi + 1e-9, `${key}[${i}] = ${arr[i]} outside [${lo}, ${hi}]`);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const s = fx.suspension[i];
    const pairs = [
      ["suspTravelScale", s.travelScale], ["suspDampScale", s.dampScale],
      ["suspRideDrop", s.rideDrop], ["suspCamber", s.camber],
    ];
    for (const [key, v] of pairs) {
      const [lo, hi] = ARRAY_EFFECT_BOUNDS[key];
      assert.equal(Number.isFinite(v), true, `${key}[${i}] is ${v}`);
      assert.ok(v >= lo - 1e-9 && v <= hi + 1e-9, `${key}[${i}] = ${v} outside [${lo}, ${hi}]`);
    }
    assert.ok(fx.punctureStage[i] >= 0 && fx.punctureStage[i] <= 3);
  }
}

test("identical seeds produce identical damage", () => {
  const a = script("determinism");
  const b = script("determinism");
  assert.deepEqual(Array.from(a.health), Array.from(b.health));
  assert.deepEqual(Array.from(a.gearBlocked), Array.from(b.gearBlocked));
  assert.deepEqual(Array.from(a.detached), Array.from(b.detached));
  assert.deepEqual(Array.from(a.tyrePressure), Array.from(b.tyrePressure));
  assert.equal(a.severity, b.severity);
  assert.equal(a.engineTemp, b.engineTemp);
  assert.equal(a.retiredReason, b.retiredReason);
  assert.deepEqual(Array.from(a.tyreLeak), Array.from(b.tyreLeak));

  // The seed is what decides which roll of the dice goes against you, so two
  // seeds must diverge on the chance-driven outcomes.
  assert.deepEqual(punctureProbe("luck-a"), punctureProbe("luck-a"));
  assert.notDeepEqual(punctureProbe("luck-a"), punctureProbe("luck-b"));
});

function punctureProbe(seed) {
  const d = createDamage({ seed });
  const car = makeCar({ speed: 20, engineLoad: 0.5 });
  for (let i = 0; i < 16; i += 1) {
    applyImpact(d, car, {
      speed: 4.2, kind: "kerb",
      point: { x: 0.8, y: -0.35, z: -1.3 },
      normal: { x: -1, y: 0.2, z: 0 },
      dir: { x: 1, y: 0, z: 0.2 },
    });
    stepDamage(d, car, 0.1);
  }
  return Array.from(d.tyreLeak);
}

function script(seed) {
  const rng = makeRng("script");
  const d = createDamage({ seed });
  const car = makeCar();
  for (let i = 0; i < 120; i += 1) {
    car.speed = rng.range(5, 40);
    car.engineLoad = rng.next();
    if (i % 17 === 0) {
      applyImpact(d, car, {
        speed: rng.range(3, 13),
        kind: rng.pick(IMPACT_KINDS),
        point: { x: rng.range(-1, 1), y: rng.range(-0.4, 0.8), z: rng.range(-2, 2) },
        normal: { x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1) },
      });
    }
    stepDamage(d, car, 0.05);
  }
  damageVisuals(d);
  return d;
}
