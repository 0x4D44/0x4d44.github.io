// Zoned damage model (DYNAMICS lane). Pure. Writes into the vehicle's `state.damage` object.
// Every component is 0 (new) .. 1 (destroyed) and is monotonic until repair().
// `fx` holds the handling multipliers that physics.mjs reads each step (no allocation).

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function makeDamageState() {
  return {
    engine: 0,
    gearbox: 0,
    steering: 0,
    suspension: [0, 0, 0, 0],
    tyres: [0, 0, 0, 0],
    radiator: 0,
    body: { front: 0, rear: 0, left: 0, right: 0 },
    total: 0,
  };
}

const W = { engine: 0.22, gearbox: 0.08, steering: 0.08, susp: 0.12, tyres: 0.08, radiator: 0.06, body: 0.36 };

/**
 * @param spec  car spec
 * @param dmg   the state.damage object (mutated)
 * @param emit  (type, a, b) -> void ; type "puncture" (a = wheel) | "engine_fail"
 */
export function createDamage(spec, dmg, emit) {
  const tough = spec.stats ? spec.stats.toughness : 6;
  const eRef = spec.mass * 700 * (0.7 + 0.06 * tough); // joules for a "write-off" frontal hit
  const punctured = [false, false, false, false];
  let engineFailed = false;
  let pullSign = 1;
  let dScale = 1;
  const fx = {
    powerMul: 1,
    torqueMul: 1,
    shiftExtra: 0,
    lockMul: 1,
    pull: 0,
    springMul: [1, 1, 1, 1],
    damperMul: [1, 1, 1, 1],
    gripMul: [1, 1, 1, 1],
    rollExtra: [0, 0, 0, 0],
    punctured,
    engineDead: false,
  };

  function add(v, inc) {
    const n = v + inc;
    return n > 1 ? 1 : n;
  }

  function refresh() {
    const d = dmg;
    let ms = 0, mt = 0, mb = 0;
    for (let i = 0; i < 4; i++) { ms += d.suspension[i]; mt += d.tyres[i]; }
    ms *= 0.25; mt *= 0.25;
    mb = (d.body.front + d.body.rear + d.body.left + d.body.right) * 0.25;
    let t = 1.6 * (W.engine * d.engine + W.gearbox * d.gearbox + W.steering * d.steering + W.susp * ms +
      W.tyres * mt + W.radiator * d.radiator + W.body * mb);
    const bz = Math.max(d.body.front, d.body.rear, d.body.left, d.body.right);
    if (t < 0.9 * bz) t = 0.9 * bz; // a write-off hit reads as one
    if (t < d.engine) t = d.engine;
    t = clamp01(t);
    if (t > d.total) d.total = t; // monotonic
    // engine failure
    if (d.engine >= 0.995 && !engineFailed) {
      engineFailed = true;
      emit("engine_fail", 0);
    }
    fx.engineDead = engineFailed;
    const e = d.engine;
    fx.powerMul = engineFailed ? 0.12 : (1 - 0.5 * Math.pow(e, 1.3)) * (1 - 0.32 * d.radiator);
    fx.torqueMul = 1 - 0.22 * d.gearbox;
    fx.shiftExtra = 0.3 * d.gearbox;
    fx.lockMul = 1 - 0.38 * d.steering;
    fx.pull = pullSign * 0.045 * d.steering * d.steering + pullSign * 0.01 * d.steering;
    for (let i = 0; i < 4; i++) {
      const s = d.suspension[i];
      fx.springMul[i] = 1 - 0.3 * s; // sag
      fx.damperMul[i] = 1 - 0.65 * s; // bouncy
      const tdm = d.tyres[i];
      fx.gripMul[i] = (1 - 0.12 * tdm - 0.1 * s) * (punctured[i] ? 0.55 : 1);
      fx.rollExtra[i] = punctured[i] ? 0.06 : 0.015 * tdm;
    }
  }

  function puncCheck() {
    for (let i = 0; i < 4; i++) {
      if (!punctured[i] && dmg.tyres[i] >= 0.7) {
        punctured[i] = true;
        emit("puncture", i);
      }
    }
  }

  function corner(lx, lz) {
    return (lz < 0 ? 0 : 2) + (lx < 0 ? 0 : 1);
  }

  const api = {
    fx,
    /** Expert-chip multiplier on impact / landing / bottom-out damage (default 1). */
    setScale(v) { dScale = v > 0 ? v : 1; },
    get scale() { return dScale; },
    punctured,
    /** damage for an impact; energy in joules actually dissipated, local contact point (x right, z back). */
    impact(zone, energy, lx, lz) {
      let d = (energy / eRef) * dScale;
      if (d < 0.004) return 0; // scuffs do nothing
      d = d > 1.2 ? 1.2 : d;
      const dm = dmg;
      const c = corner(lx, lz);
      const off = Math.min(1, Math.abs(lx) / 0.8); // off-centre hits spare the engine
      if (zone === "front") {
        dm.body.front = add(dm.body.front, d);
        dm.engine = add(dm.engine, d * (0.5 - 0.2 * off) + (d > 0.8 ? (d - 0.8) * 2.5 * (1 - 0.6 * off) : 0));
        dm.radiator = add(dm.radiator, d * (0.85 - 0.3 * off));
        dm.steering = add(dm.steering, d * 0.4);
        dm.suspension[c] = add(dm.suspension[c], d * 0.5);
        dm.suspension[lx < 0 ? 0 : 1] = add(dm.suspension[lx < 0 ? 0 : 1], d * 0.2);
        dm.tyres[lx < 0 ? 0 : 1] = add(dm.tyres[lx < 0 ? 0 : 1], d * 0.2);
        pullSign = lx < 0 ? -1 : 1;
      } else if (zone === "rear") {
        dm.body.rear = add(dm.body.rear, d);
        dm.gearbox = add(dm.gearbox, d * 0.35);
        dm.engine = add(dm.engine, d * 0.1);
        dm.suspension[c] = add(dm.suspension[c], d * 0.5);
        dm.tyres[lx < 0 ? 2 : 3] = add(dm.tyres[lx < 0 ? 2 : 3], d * 0.2);
      } else if (zone === "left" || zone === "right") {
        dm.body[zone] = add(dm.body[zone], d);
        dm.suspension[c] = add(dm.suspension[c], d * 0.65);
        dm.tyres[c] = add(dm.tyres[c], d * 0.55);
        if (lz < 0) { dm.steering = add(dm.steering, d * 0.3); pullSign = zone === "left" ? -1 : 1; }
        else dm.gearbox = add(dm.gearbox, d * 0.1);
        dm.engine = add(dm.engine, d * 0.05);
      } else {
        // under: sump, gearbox, radiator hoses, all springs
        dm.engine = add(dm.engine, d * 0.3);
        dm.gearbox = add(dm.gearbox, d * 0.3);
        dm.radiator = add(dm.radiator, d * 0.15);
        for (let i = 0; i < 4; i++) dm.suspension[i] = add(dm.suspension[i], d * 0.25);
      }
      puncCheck();
      refresh();
      return d;
    },
    landing(strength) {
      if (strength < 0.25) return;
      const d = strength * strength * 0.35 * dScale;
      for (let i = 0; i < 4; i++) {
        dmg.suspension[i] = add(dmg.suspension[i], d * 0.5);
        dmg.tyres[i] = add(dmg.tyres[i], d * 0.1);
      }
      dmg.engine = add(dmg.engine, d * 0.08);
      refresh();
      puncCheck();
    },
    bottomout(strength, wheel) {
      if (strength < 0.15) return;
      const d = strength * strength * 0.12 * dScale;
      dmg.suspension[wheel] = add(dmg.suspension[wheel], d);
      dmg.engine = add(dmg.engine, d * 0.2);
      dmg.gearbox = add(dmg.gearbox, d * 0.25);
      refresh();
    },
    /** slow wear from scraping along a wall; side = "left"|"right"|"front"|"rear" */
    scrape(side, amount) {
      dmg.body[side] = add(dmg.body[side], amount);
      if (side === "left" || side === "right") {
        const i = side === "left" ? 0 : 1;
        dmg.tyres[i] = add(dmg.tyres[i], amount * 0.15);
      }
      refresh();
      puncCheck();
    },
    refresh,
    reset() {
      dmg.engine = 0; dmg.gearbox = 0; dmg.steering = 0; dmg.radiator = 0; dmg.total = 0;
      for (let i = 0; i < 4; i++) { dmg.suspension[i] = 0; dmg.tyres[i] = 0; punctured[i] = false; }
      dmg.body.front = dmg.body.rear = dmg.body.left = dmg.body.right = 0;
      engineFailed = false;
      refresh();
    },
    /**
     * Service: restore damage by fractions (0 = nothing, 1 = fully repaired). Accepts
     * { engine, gearbox, steering, radiator, suspension:n|[4], tyres:n|[4], body:n|{front,rear,left,right}, all:n }.
     * No argument repairs everything. `total` is recomputed and may fall (repair is the only way it does).
     */
    repair(partial) {
      const p = partial === undefined || partial === null ? { all: 1 } : partial;
      const all = typeof p.all === "number" ? p.all : 0;
      const fr = (v, name) => clamp01(typeof p[name] === "number" ? Math.max(p[name], all) : all);
      dmg.engine *= 1 - fr(0, "engine");
      dmg.gearbox *= 1 - fr(0, "gearbox");
      dmg.steering *= 1 - fr(0, "steering");
      dmg.radiator *= 1 - fr(0, "radiator");
      for (let i = 0; i < 4; i++) {
        let fs = all, ft = all;
        if (typeof p.suspension === "number") fs = Math.max(fs, p.suspension);
        else if (Array.isArray(p.suspension)) fs = Math.max(fs, p.suspension[i] || 0);
        if (typeof p.tyres === "number") ft = Math.max(ft, p.tyres);
        else if (Array.isArray(p.tyres)) ft = Math.max(ft, p.tyres[i] || 0);
        dmg.suspension[i] *= 1 - clamp01(fs);
        dmg.tyres[i] *= 1 - clamp01(ft);
        if (dmg.tyres[i] < 0.7 && ft > 0) punctured[i] = false;
      }
      for (const z of ["front", "rear", "left", "right"]) {
        let f = all;
        if (typeof p.body === "number") f = Math.max(f, p.body);
        else if (p.body && typeof p.body[z] === "number") f = Math.max(f, p.body[z]);
        dmg.body[z] *= 1 - clamp01(f);
      }
      if (dmg.engine < 0.995) engineFailed = false;
      // recompute total from scratch (repair may lower it)
      dmg.total = 0;
      refresh();
    },
    snapshot() {
      return { punctured: punctured.slice(), engineFailed, pullSign };
    },
    restore(s) {
      for (let i = 0; i < 4; i++) punctured[i] = !!s.punctured[i];
      engineFailed = !!s.engineFailed;
      pullSign = s.pullSign || 1;
      refresh();
    },
  };
  refresh();
  return api;
}
