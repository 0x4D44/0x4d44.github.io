import test from "node:test";
import assert from "node:assert/strict";
import {
  rpmNorm, firingHz, engineLoad, engineVoice, turboVoice, gearWhine, viewMix, tyreMix, NOISE_CATS, windVoice, ambiencePlan, impactVoice,
  crackleLevel, engineCharacter, volumesClean, noiseCategory,
} from "../audio/params.mjs";
import { SURFACE_INFO } from "../core/surfaces.mjs";
import { CARS, CAR_IDS } from "../core/cars.mjs";

const finiteObj = (o, path = "") => { for (const [k, v] of Object.entries(o)) { if (typeof v === "number") assert.ok(Number.isFinite(v), `${path}${k}=${v}`); else if (v && typeof v === "object") finiteObj(v, path + k + "."); } };

test("rpm normalisation is bounded and monotonic", () => {
  let prev = -1;
  for (let r = 0; r <= 12000; r += 250) { const n = rpmNorm(r, 950, 7200); assert.ok(n >= 0 && n <= 1 && n >= prev); prev = n; }
  assert.equal(rpmNorm(NaN, 900, 7000), 0);
});

test("firing frequency scales with rpm and cylinder count", () => {
  assert.equal(firingHz(6000, 4), 200);
  assert.equal(firingHz(6000, 6), 300);
  assert.ok(firingHz(3000, 4) < firingHz(6000, 4));
  assert.equal(firingHz(-5, 4), 0);
});

test("engine voice: pitch up with rpm; gain and brightness never decrease with load; everything bounded and finite", () => {
  for (const id of CAR_IDS) {
    const spec = CARS[id], chr = engineCharacter(spec), idle = spec.engine.idleRpm, red = spec.engine.redline;
    let prevHz = -1;
    for (let rpm = 0; rpm <= red * 1.2; rpm += 200) {
      const v = engineVoice(rpm, 1, 0.8, idle, red, chr);
      finiteObj(v);
      assert.ok(v.fundHz >= prevHz); prevHz = v.fundHz;
      assert.ok(v.gain > 0 && v.gain <= 0.62, `gain ${v.gain}`);
      let g = -1, c = -1;
      for (let th = 0; th <= 1.0001; th += 0.1) {
        const w = engineVoice(rpm, th, th * 0.9, idle, red, chr);
        assert.ok(w.gain >= g - 1e-9 && w.lowpass >= c - 1e-9, `${id} rpm ${rpm} th ${th}`);
        g = w.gain; c = w.lowpass;
        assert.ok(w.lowpass >= 400 && w.lowpass <= 11000 && w.drive >= 0.5 && w.drive <= 6);
      }
    }
  }
  finiteObj(engineVoice(NaN, NaN, NaN, 900, 7000, engineCharacter(null)));
});

test("per-car character differs (cylinders, turbo whistle only on turbo cars)", () => {
  // round 4: true firing orders per car (V8, inline-five, flat-four, four) and three exhaust resonances each
  assert.equal(engineCharacter(CARS.piwakawaka).cyl, 8);
  assert.equal(engineCharacter(CARS.huia).cyl, 5);
  assert.equal(engineCharacter(CARS.kea).cyl, 4);
  assert.equal(engineCharacter(CARS.takahe).cyl, 4);
  for (const id of ["huia", "kea", "takahe", "piwakawaka"]) assert.equal(engineCharacter(CARS[id]).res.length, 3);
  assert.ok(engineCharacter(CARS.huia).turboWhistle > 0);
  assert.equal(engineCharacter(CARS.takahe).turboWhistle, 0);
});

test("turbo whistle rises with boost, is silent without boost, bounded", () => {
  const chr = engineCharacter(CARS.huia);
  let prevH = 0, prevG = -1;
  for (let b = 0; b <= 1.001; b += 0.1) { const t = turboVoice(b, 1, 0.5, chr); finiteObj(t); assert.ok(t.whistleHz >= prevH && t.whistleGain >= prevG); assert.ok(t.whistleGain <= 0.08); prevH = t.whistleHz; prevG = t.whistleGain; }
  assert.equal(turboVoice(0, 1, 0.5, chr).whistleGain, 0);
  assert.equal(turboVoice(1, 1, 0.5, engineCharacter(CARS.takahe)).whistleGain, 0);
});

test("gear whine grows with speed, is bounded", () => {
  const chr = engineCharacter(CARS.kea);
  let prev = -1;
  for (let v = 0; v <= 70; v += 5) { const w = gearWhine(v, 3, 1, chr); finiteObj(w); assert.ok(w.hz >= 150 && w.hz <= 3200 && w.gain <= 0.03 && w.gain >= prev - 1e-12); prev = w.gain; }
});

test("cockpit views muffle the engine more than exterior views", () => {
  assert.ok(viewMix("bonnet").lowpass < viewMix("chase").lowpass);
  assert.ok(viewMix("bonnet").cockpit > viewMix("far").cockpit);
  assert.ok(viewMix("nonsense").engine === 1);
});

const mkOut = () => { const o = { roll: {}, slide: {}, squeal: 0, skidMax: 0 }; for (const k of NOISE_CATS) { o.roll[k] = 0; o.slide[k] = 0; } return o; };
const infoOf = (id) => (SURFACE_INFO[id] ? SURFACE_INFO[id].noise : "gravel");
const wheel = (o = {}) => ({ grounded: true, surf: 0, slipRatio: 0, slipAngle: 0, skid: 0, load: 4000, ...o });

test("tyre noise: every surface id maps to a known category; slides get louder with slip; airborne is silent; all within 0..1", () => {
  for (const si of SURFACE_INFO) assert.ok(NOISE_CATS.includes(noiseCategory(si.noise)), si.key);
  for (const si of SURFACE_INFO) {
    let prev = -1;
    for (let slip = 0; slip <= 1.0001; slip += 0.1) {
      const o = tyreMix([wheel({ surf: si.id, slipAngle: slip / 3.2 }), wheel({ surf: si.id, slipAngle: slip / 3.2 }), wheel({ surf: si.id }), wheel({ surf: si.id })], 25, infoOf, mkOut());
      const cat = noiseCategory(si.noise);
      assert.ok(o.slide[cat] >= prev - 1e-9 && o.slide[cat] <= 1 && o.roll[cat] >= 0 && o.roll[cat] <= 1);
      prev = o.slide[cat];
    }
  }
  const air = tyreMix([wheel({ grounded: false, slipAngle: 1 }), wheel({ grounded: false }), wheel({ grounded: false }), wheel({ grounded: false })], 30, infoOf, mkOut());
  assert.equal(air.roll.gravel, 0); assert.equal(air.slide.gravel, 0);
  const tar = tyreMix([wheel({ surf: 2, skid: 1 }), wheel({ surf: 2, skid: 1 }), wheel({ surf: 2 }), wheel({ surf: 2 })], 25, infoOf, mkOut());
  assert.ok(tar.squeal > 0.3);
  const noWheels = tyreMix(undefined, 10, infoOf, mkOut());
  assert.equal(noWheels.squeal, 0);
});

test("wind grows with speed and is quieter in cockpit views", () => {
  let prev = -1;
  for (let v = 0; v <= 90; v += 10) { const w = windVoice(v, viewMix("chase")); assert.ok(w.gain >= prev && w.gain <= 0.5); prev = w.gain; }
  assert.ok(windVoice(50, viewMix("bonnet")).gain < windVoice(50, viewMix("bumper")).gain);
});

test("ambience plan follows biome and weather", () => {
  const rain = ambiencePlan({ biome: "rainforest", environment: { weather: { type: "rain", intensity: 1 }, timeOfDay: 22, windStrength: 0.4 } });
  assert.ok(rain.rain > 0.9 && rain.stream > 0 && rain.birds === 0);
  const coast = ambiencePlan({ biome: "coast", environment: { weather: { type: "clear", intensity: 0 }, timeOfDay: 17, windStrength: 0.2 } });
  assert.ok(coast.surf > 0.5 && coast.rain === 0);
  const alpine = ambiencePlan({ biome: "alpine", environment: { weather: { type: "snow", intensity: 0.8 }, timeOfDay: 10, windStrength: 0.9 } });
  assert.ok(alpine.wind > 0.7);
  for (const k of Object.values(alpine)) assert.ok(k >= 0 && k <= 1);
  finiteObj(ambiencePlan(null));
});

test("impact voice scales with strength, pans by zone, is bounded", () => {
  let prev = -1;
  for (let s = 0; s <= 1.001; s += 0.1) { const v = impactVoice({ strength: s, zone: "front", kind: "terrain" }); finiteObj(v); assert.ok(v.thudGain >= prev && v.thudGain <= 1); prev = v.thudGain; }
  assert.ok(impactVoice({ strength: 0.5, zone: "left" }).pan < 0 && impactVoice({ strength: 0.5, zone: "right" }).pan > 0);
  assert.ok(impactVoice({ strength: 0.9, zone: "front", kind: "boulder" }).clang > 0.3);
  assert.equal(impactVoice({ strength: 0.2, zone: "front", kind: "terrain" }).glass, 0);
  finiteObj(impactVoice(undefined));
});

test("anti-lag crackle only on lift at high rpm and more with a turbo", () => {
  assert.equal(crackleLevel(1, 0.9, 1, true), 0);
  assert.equal(crackleLevel(0, 0.1, 1, true), 0);
  assert.ok(crackleLevel(0, 0.9, 1, true) > crackleLevel(0, 0.9, 1, false));
  for (let t = 0; t <= 1; t += 0.1) for (let r = 0; r <= 1; r += 0.1) { const c = crackleLevel(t, r, 0.5, true); assert.ok(c >= 0 && c <= 1); }
});

test("volumes are sanitised", () => {
  assert.deepEqual(volumesClean(undefined), { master: 1, engine: 1, effects: 1, voice: 1, ambience: 1 });
  assert.equal(volumesClean({ master: NaN, engine: 9 }).master, 1);
  assert.equal(volumesClean({ engine: 9 }).engine, 1.5);
  assert.equal(volumesClean({ voice: -1 }).voice, 0);
});

test("engine load rises with throttle", () => {
  let prev = -1;
  for (let t = 0; t <= 1.001; t += 0.1) { const l = engineLoad(t, 0.5, 0.6); assert.ok(l >= prev && l <= 1); prev = l; }
});
