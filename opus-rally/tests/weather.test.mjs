// Run: node tests/weather.test.mjs   (or: node --test tests/weather.test.mjs)
//
// THREE constructs fine under Node as long as nothing asks for a WebGLRenderer,
// so the rig under test here is the real one: a real Scene, real lights, real
// InstancedBufferGeometry pools, real uniforms.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "../three.module.min.js";
import { wrapAngle } from "../mathx.js";
import {
  WEATHER_PRESETS,
  WEATHER_NUMERIC_FIELDS,
  WEATHER_COLOUR_FIELDS,
  WEATHER_LABEL_FIELDS,
  CLOUD_TYPES,
  PRECIP_TYPES,
  presetById,
  makePresetState,
  copyPreset,
  lerpPreset,
  mixColour,
  luminance,
  sunlightColour,
  solarPosition,
  createWeather,
  stepWeather,
  setWeather,
  setWeatherTimeline,
  setStageProgress,
  setSunElevation,
  setTimeOfDay,
  setWeatherMotion,
  setSprayLead,
  setWiperMode,
  stepHeadlights,
  weatherSurfaceModifier,
  weatherLensState,
  disposeWeather,
  SKY_FRAG,
  PRECIP_SHADERS,
} from "../weather.js";
import { surfaceProps, SURFACE } from "../surfaces.js";

const DEG = Math.PI / 180;

// Small pools and a small cloud texture keep the suite quick; nothing under test
// depends on either size, and the pool-constancy test asserts on the value it
// was given rather than on a default.
const RIG = { cloudTextureSize: 48, rainPool: 800, snowPool: 600, seed: "test-weather" };

function rig(preset, extra) {
  const scene = new THREE.Scene();
  const w = createWeather(THREE, scene, preset, { ...RIG, ...(extra || {}) });
  return { scene, w, camera: new THREE.PerspectiveCamera(60, 1.6, 0.1, 5000) };
}

function countObjects(root) {
  let n = 1;
  for (const child of root.children) n += countObjects(child);
  return n;
}

const FIELD_BY_KEY = new Map(WEATHER_NUMERIC_FIELDS.map((f) => [f.key, f]));

test("every preset carries every field, in range, with a sane vocabulary", () => {
  assert.ok(WEATHER_PRESETS.length >= 12, `expected >= 12 presets, got ${WEATHER_PRESETS.length}`);

  const required = [
    "clear-dawn", "midday-hard", "golden-hour", "overcast",
    "light-rain", "heavy-rain", "thunderstorm", "hill-fog",
    "light-snow", "blizzard", "night-clear", "night-rain",
  ];
  for (const id of required) assert.ok(presetById(id), `missing preset ${id}`);

  const ids = new Set();
  const names = new Set();
  for (const p of WEATHER_PRESETS) {
    assert.ok(!ids.has(p.id), `duplicate preset id ${p.id}`);
    assert.ok(!names.has(p.name), `duplicate preset name ${p.name}`);
    ids.add(p.id);
    names.add(p.name);

    for (const l of WEATHER_LABEL_FIELDS) {
      assert.equal(typeof p[l], "string", `${p.id}.${l} must be a string`);
      assert.ok(p[l].length > 0, `${p.id}.${l} must not be empty`);
    }
    assert.ok(CLOUD_TYPES.includes(p.cloudType), `${p.id} cloudType ${p.cloudType}`);
    assert.ok(PRECIP_TYPES.includes(p.precipType), `${p.id} precipType ${p.precipType}`);

    for (const f of WEATHER_NUMERIC_FIELDS) {
      const v = p[f.key];
      assert.equal(typeof v, "number", `${p.id}.${f.key} missing`);
      assert.ok(Number.isFinite(v), `${p.id}.${f.key} is not finite`);
      assert.ok(v >= f.min && v <= f.max,
        `${p.id}.${f.key} = ${v} outside [${f.min}, ${f.max}]`);
    }

    for (const c of WEATHER_COLOUR_FIELDS) {
      const col = p[c];
      assert.ok(Array.isArray(col) || ArrayBuffer.isView(col), `${p.id}.${c} not a triple`);
      assert.equal(col.length, 3, `${p.id}.${c} must have 3 channels`);
      for (let i = 0; i < 3; i += 1) {
        assert.ok(Number.isFinite(col[i]), `${p.id}.${c}[${i}] not finite`);
        assert.ok(col[i] >= 0, `${p.id}.${c}[${i}] negative`);
        assert.ok(col[i] <= 4, `${p.id}.${c}[${i}] absurdly bright`);
      }
    }

    // The precipitation label and the mix weights have to agree, or the label
    // says snow while the rain system is the one that draws.
    const wet = p.precipRainMix + p.precipSnowMix;
    if (p.precipType === "none") {
      assert.equal(p.precipRate, 0, `${p.id} says none but has a rate`);
      assert.equal(wet, 0, `${p.id} says none but mixes precipitation`);
    } else {
      assert.ok(p.precipRate > 0, `${p.id} has a precip type but no rate`);
      assert.ok(wet > 0, `${p.id} has a precip type but no mix`);
    }
    if (p.precipType === "snow" || p.precipType === "blizzard") {
      assert.ok(p.precipSnowMix > 0.5, `${p.id} should fall as snow`);
    }
    if (p.precipType === "rain" || p.precipType === "drizzle" || p.precipType === "downpour") {
      assert.ok(p.precipRainMix > 0.5, `${p.id} should fall as rain`);
    }
  }
});

test("presets are mechanically distinct from one another", () => {
  for (let i = 0; i < WEATHER_PRESETS.length; i += 1) {
    for (let j = i + 1; j < WEATHER_PRESETS.length; j += 1) {
      const a = WEATHER_PRESETS[i];
      const b = WEATHER_PRESETS[j];
      let differing = 0;
      for (const f of WEATHER_NUMERIC_FIELDS) {
        const span = f.max - f.min;
        if (Math.abs(a[f.key] - b[f.key]) / span > 0.05) differing += 1;
      }
      assert.ok(differing >= 4,
        `${a.id} and ${b.id} differ in only ${differing} fields — not distinct enough`);
    }
  }
});

test("the module reaches for no undeterministic randomness", () => {
  // A plain substring search, so line endings cannot change the answer.
  const src = readFileSync(fileURLToPath(new URL("../weather.js", import.meta.url)), "utf8");
  assert.ok(!src.includes("Math.random"), "weather.js must go through rng.js");
});

test("Oklab colour mixing stays finite, non-negative and continuous", () => {
  for (const a of WEATHER_PRESETS) {
    for (const b of WEATHER_PRESETS) {
      for (const key of WEATHER_COLOUR_FIELDS) {
        const out = [0, 0, 0];
        const prev = [0, 0, 0];
        mixColour(a[key], b[key], 0, out);
        for (let i = 0; i < 3; i += 1) assert.equal(out[i], a[key][i], `${key} t=0 endpoint`);
        mixColour(a[key], b[key], 1, out);
        for (let i = 0; i < 3; i += 1) assert.equal(out[i], b[key][i], `${key} t=1 endpoint`);

        mixColour(a[key], b[key], 0, prev);
        for (let s = 1; s <= 100; s += 1) {
          mixColour(a[key], b[key], s / 100, out);
          for (let i = 0; i < 3; i += 1) {
            assert.ok(Number.isFinite(out[i]), `${a.id}->${b.id} ${key} NaN`);
            assert.ok(out[i] >= 0, `${a.id}->${b.id} ${key} negative`);
            assert.ok(Math.abs(out[i] - prev[i]) < 0.12,
              `${a.id}->${b.id} ${key} jumped ${Math.abs(out[i] - prev[i])} in 1% of the blend`);
            prev[i] = out[i];
          }
        }
      }
    }
  }
});

test("interpolating any two presets is continuous and monotonic in t", () => {
  const out = makePresetState();
  const prev = makePresetState();
  const steps = 200;
  for (let i = 0; i < WEATHER_PRESETS.length; i += 1) {
    for (let j = 0; j < WEATHER_PRESETS.length; j += 1) {
      const a = WEATHER_PRESETS[i];
      const b = WEATHER_PRESETS[j];
      lerpPreset(a, b, 0, prev);
      for (const f of WEATHER_NUMERIC_FIELDS) {
        // Angles come back wrapped, so they are only equal modulo a whole turn.
        const d = f.kind === "angle"
          ? Math.abs(wrapAngle(prev[f.key] - a[f.key]))
          : Math.abs(prev[f.key] - a[f.key]);
        assert.ok(d <= 1e-9, `${f.key} t=0 endpoint`);
      }
      lerpPreset(a, b, 1, out);
      for (const f of WEATHER_NUMERIC_FIELDS) {
        if (f.kind === "angle") continue; // wrapped, so equality is modulo TAU
        assert.ok(Math.abs(out[f.key] - b[f.key]) < 1e-9, `${f.key} t=1 endpoint`);
      }

      lerpPreset(a, b, 0, prev);
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        lerpPreset(a, b, t, out);
        for (const f of WEATHER_NUMERIC_FIELDS) {
          const v = out[f.key];
          assert.ok(Number.isFinite(v), `${a.id}->${b.id} ${f.key} NaN at t=${t}`);
          assert.ok(v >= f.min - 1e-6 && v <= f.max + 1e-6,
            `${a.id}->${b.id} ${f.key} left its range: ${v}`);
          if (f.kind === "angle") continue;
          // Continuity: one step of the blend can never move a field further
          // than a generous Lipschitz bound on the whole span.
          const bound = (Math.abs(a[f.key]) + Math.abs(b[f.key]) + 1) * 8 / steps;
          assert.ok(Math.abs(v - prev[f.key]) <= bound,
            `${a.id}->${b.id} ${f.key} jumped ${Math.abs(v - prev[f.key])} > ${bound}`);
          // Monotonic: the field never doubles back on the way across.
          const dir = Math.sign(b[f.key] - a[f.key]);
          const move = v - prev[f.key];
          if (dir > 0) assert.ok(move >= -1e-9, `${a.id}->${b.id} ${f.key} went backwards`);
          if (dir < 0) assert.ok(move <= 1e-9, `${a.id}->${b.id} ${f.key} went backwards`);
          if (dir === 0) assert.ok(Math.abs(move) < 1e-9, `${a.id}->${b.id} ${f.key} moved off a fixed value`);
        }
        for (const c of WEATHER_COLOUR_FIELDS) {
          for (let k = 0; k < 3; k += 1) {
            assert.ok(Number.isFinite(out[c][k]), `${a.id}->${b.id} ${c} NaN`);
            assert.ok(out[c][k] >= 0, `${a.id}->${b.id} ${c} negative`);
          }
        }
        copyPreset(out, prev);
      }
    }
  }
});

// What a flat patch of ground actually receives from the key light: its colour,
// its intensity and the cosine between them, which is the product three itself
// forms. `key.intensity` on its own is the beam a surface held square to the sun
// would get — atmospheric extinction lives in `key.color`, where it belongs, so
// the intensity is deliberately near-flat across the whole day and asserting on
// it says nothing at all about how lit the stage is.
function keyOnGround(w) {
  const k = w.lights.key;
  const p = k.position;
  const n = Math.hypot(p.x, p.y, p.z) || 1;
  return luminance([k.color.r, k.color.g, k.color.b]) * k.intensity * Math.max(p.y / n, 0);
}

test("sun elevation drives light intensity and sky colour monotonically", () => {
  for (const id of ["clear-dawn", "midday-hard", "night-clear", "overcast"]) {
    const { w } = rig(id);
    let lastKey = -1;
    let lastGround = -1;
    let lastSky = -1;
    let lastLevel = -1;
    let firstAtZero = null;
    let atSixty = null;
    for (let e = -20; e <= 88; e += 0.5) {
      setSunElevation(w, e * DEG, 180 * DEG);
      const key = w.lights.key.intensity;
      const ground = keyOnGround(w);
      const sky = w.metrics.skyLuminance;
      const level = w.metrics.lightLevel;
      assert.ok(Number.isFinite(key) && key >= 0, `${id}: key intensity ${key} at ${e} deg`);
      assert.ok(Number.isFinite(sky) && sky >= 0, `${id}: sky luminance ${sky} at ${e} deg`);
      assert.ok(key >= lastKey - 1e-12, `${id}: key intensity fell at ${e} deg`);
      assert.ok(ground >= lastGround - 1e-12, `${id}: sunlight on the ground fell at ${e} deg`);
      assert.ok(sky >= lastSky - 1e-12, `${id}: sky luminance fell at ${e} deg`);
      assert.ok(level >= lastLevel - 1e-12, `${id}: light level fell at ${e} deg`);
      lastKey = key;
      lastGround = ground;
      lastSky = sky;
      lastLevel = level;
      if (firstAtZero === null && e >= 0) firstAtZero = { ground, sky };
      if (atSixty === null && e >= 60) atSixty = { ground, sky };
    }
    // Non-decreasing is not enough — a constant would pass that. Assert the
    // useful part of the arc actually climbs, and climb it on the quantity a
    // driver sees: the sun on the road, not the dial that feeds it. The gate,
    // the extinction and the cosine all pull the same way, so an order of
    // magnitude over sixty degrees is the floor, not an ambition.
    assert.ok(atSixty.ground > firstAtZero.ground * 10 && atSixty.ground > 0,
      `${id}: sunlight on the ground only went ${firstAtZero.ground.toExponential(2)} -> `
      + `${atSixty.ground.toExponential(2)} from the horizon to sixty degrees`);
    assert.ok(atSixty.sky > firstAtZero.sky,
      `${id}: sky should brighten from horizon to high sun`);
    disposeWeather(w);
  }
});

test("sunlight reddens toward the horizon, channel by channel", () => {
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  sunlightColour(2 * DEG, 3, lo);
  sunlightColour(70 * DEG, 3, hi);
  for (let i = 0; i < 3; i += 1) assert.ok(hi[i] > lo[i], `channel ${i} should brighten with elevation`);
  // Blue is scattered out hardest, so a low sun is far redder than it is blue.
  assert.ok(lo[0] / Math.max(lo[2], 1e-9) > 4, "low sun should be strongly red-shifted");
  assert.ok(hi[0] / Math.max(hi[2], 1e-9) < 1.6, "high sun should be near-white");
});

test("headlights switch with hysteresis and never chatter", () => {
  const on = 0.18;
  const off = 0.30;
  const dwell = 1.0;
  const dt = 1 / 60;

  // Settle bright and off.
  let s = { on: false, smoothed: 1, dwell: 99, changes: 0 };
  for (let i = 0; i < 600; i += 1) stepHeadlights(s, 0.9, dt, on, off, dwell);
  assert.equal(s.on, false, "bright daylight must not call for headlights");

  // Oscillate hard inside the hysteresis band for ten seconds.
  const before = s.changes;
  for (let i = 0; i < 600; i += 1) stepHeadlights(s, i % 2 === 0 ? 0.15 : 0.35, dt, on, off, dwell);
  assert.equal(s.changes, before, "oscillating inside the band must not toggle the lights");
  assert.equal(s.on, false);

  // Oscillate straddling the ON threshold: at most the one legitimate switch.
  const before2 = s.changes;
  for (let i = 0; i < 900; i += 1) stepHeadlights(s, i % 2 === 0 ? 0.16 : 0.20, dt, on, off, dwell);
  assert.ok(s.changes - before2 <= 1,
    `straddling the on-threshold toggled ${s.changes - before2} times`);

  // Real darkness turns them on and keeps them on.
  s = { on: false, smoothed: 1, dwell: 99, changes: 0 };
  for (let i = 0; i < 600; i += 1) stepHeadlights(s, 0.02, dt, on, off, dwell);
  assert.equal(s.on, true, "night must call for headlights");
  const nightChanges = s.changes;
  for (let i = 0; i < 600; i += 1) stepHeadlights(s, 0.02 + 0.05 * Math.sin(i), dt, on, off, dwell);
  assert.equal(s.changes, nightChanges, "flickering night light must not toggle the lights");

  // And full daylight turns them off again.
  for (let i = 0; i < 600; i += 1) stepHeadlights(s, 0.85, dt, on, off, dwell);
  assert.equal(s.on, false, "daylight must switch headlights off");
});

test("headlights follow the time of day through the rig", () => {
  const { w, camera } = rig("clear-dawn");
  setTimeOfDay(w, 1, { latitude: 46 * DEG, dayOfYear: 288 });
  for (let i = 0; i < 400; i += 1) stepWeather(w, camera, 1 / 30);
  assert.equal(w.metrics.headlights, true, "01:00 should need lights");
  assert.ok(w.metrics.sunElevation < 0, "the sun should be below the horizon at 01:00");

  setTimeOfDay(w, 13);
  for (let i = 0; i < 400; i += 1) stepWeather(w, camera, 1 / 30);
  assert.equal(w.metrics.headlights, false, "13:00 should not need lights");
  assert.ok(w.metrics.sunElevation > 0.4, "the sun should be high at 13:00");
  disposeWeather(w);
});

test("the solar path is continuous over a whole day", () => {
  const out = { elevation: 0, azimuth: 0 };
  let prev = null;
  for (let h = 0; h <= 24; h += 0.02) {
    solarPosition(h, 46 * DEG, 288, out);
    assert.ok(Number.isFinite(out.elevation) && Number.isFinite(out.azimuth));
    assert.ok(Math.abs(out.elevation) <= Math.PI / 2 + 1e-9);
    if (prev !== null) assert.ok(Math.abs(out.elevation - prev) < 0.01, `elevation jumped at ${h}h`);
    prev = out.elevation;
  }
});

test("the particle pool is fixed and the scene graph never grows", () => {
  const { scene, w, camera } = rig("heavy-rain");
  const objects0 = countObjects(scene);
  const sceneChildren0 = scene.children.length;
  const rainPool = w.rain.pool;
  const snowPool = w.snow.pool;
  const rainBase = w.rain.geometry.getAttribute("iBase").array;
  const snowBase = w.snow.geometry.getAttribute("iBase").array;
  const rainLen = rainBase.length;
  const snowLen = snowBase.length;

  // Identity of every per-frame uniform payload: if any of these were rebuilt,
  // the frame would be allocating.
  const identities = [
    w.rain.uniforms.uDrift.value, w.rain.uniforms.uStreakVel.value,
    w.rain.uniforms.uColour.value, w.snow.uniforms.uDrift.value,
    w.snow.uniforms.uWindDir.value, w.sky.uniforms.uZenith.value,
    w.sky.uniforms.uSunDir.value, w.sky.uniforms.uCloudScroll.value,
    w.lights.key.color, w.lights.fill.groundColor, w.fog.color,
    weatherSurfaceModifier(w), weatherLensState(w),
  ];

  assert.equal(rainPool, RIG.rainPool);
  assert.equal(snowPool, RIG.snowPool);
  assert.equal(rainLen, RIG.rainPool * 3);

  // Ride a whole stage's worth of weather: rain to blizzard and back, moving.
  setWeatherTimeline(w, [
    { at: 0, preset: "heavy-rain" },
    { at: 20, preset: "blizzard" },
    { at: 40, preset: "thunderstorm" },
    { at: 55, preset: "clear-dawn" },
  ]);
  for (let i = 0; i < 4000; i += 1) {
    camera.position.z += 28 / 60;
    stepWeather(w, camera, 1 / 60);
    assert.equal(w.rain.pool, rainPool, `rain pool changed at step ${i}`);
    assert.equal(w.snow.pool, snowPool, `snow pool changed at step ${i}`);
    assert.equal(w.rain.geometry.getAttribute("iBase").array, rainBase, "rain attribute reallocated");
    assert.equal(w.snow.geometry.getAttribute("iBase").array, snowBase, "snow attribute reallocated");
    assert.equal(w.rain.geometry.getAttribute("iBase").array.length, rainLen);
    assert.equal(w.snow.geometry.getAttribute("iBase").array.length, snowLen);
    assert.ok(w.rain.geometry.instanceCount >= 0 && w.rain.geometry.instanceCount <= rainPool,
      `rain instance count ${w.rain.geometry.instanceCount} outside the pool`);
    assert.ok(w.snow.geometry.instanceCount >= 0 && w.snow.geometry.instanceCount <= snowPool,
      `snow instance count ${w.snow.geometry.instanceCount} outside the pool`);
    assert.equal(countObjects(scene), objects0, `scene grew to ${countObjects(scene)} at step ${i}`);
  }
  assert.equal(scene.children.length, sceneChildren0);

  const identities2 = [
    w.rain.uniforms.uDrift.value, w.rain.uniforms.uStreakVel.value,
    w.rain.uniforms.uColour.value, w.snow.uniforms.uDrift.value,
    w.snow.uniforms.uWindDir.value, w.sky.uniforms.uZenith.value,
    w.sky.uniforms.uSunDir.value, w.sky.uniforms.uCloudScroll.value,
    w.lights.key.color, w.lights.fill.groundColor, w.fog.color,
    weatherSurfaceModifier(w), weatherLensState(w),
  ];
  for (let i = 0; i < identities.length; i += 1) {
    assert.equal(identities2[i], identities[i], `per-frame object ${i} was reallocated`);
  }
  disposeWeather(w);
});

test("rain streaks backwards past a moving car and lengthens with speed", () => {
  const { w, camera } = rig("heavy-rain");
  setWeatherMotion(w, 0, 0, 0);
  stepWeather(w, camera, 1 / 60);
  const stillLen = w.rain.uniforms.uLength.value;
  const stillVel = w.rain.uniforms.uStreakVel.value.clone();

  for (let i = 0; i < 240; i += 1) {
    setWeatherMotion(w, 0, 0, 40);
    stepWeather(w, camera, 1 / 60);
  }
  const fastVel = w.rain.uniforms.uStreakVel.value;
  const fastLen = w.rain.uniforms.uLength.value;

  assert.ok(fastVel.z < -30, `apparent rain should sweep backwards, got vz=${fastVel.z}`);
  assert.ok(Math.abs(stillVel.z) < 15, "a stationary car should see near-vertical rain");
  assert.ok(fastLen > stillLen * 2, `streaks should lengthen with speed: ${stillLen} -> ${fastLen}`);
  assert.ok(fastLen <= 3.2 + 1e-9, "streak length must stay clamped");
  disposeWeather(w);
});

test("the right system draws for the right precipitation", () => {
  const { w, camera } = rig("blizzard");
  for (let i = 0; i < 120; i += 1) stepWeather(w, camera, 1 / 60);
  assert.ok(w.snow.geometry.instanceCount > 0, "a blizzard must draw snow");
  assert.equal(w.rain.geometry.instanceCount, 0, "a blizzard must not draw rain");
  assert.equal(w.snow.mesh.visible, true);
  assert.equal(w.rain.mesh.visible, false);

  setWeather(w, "heavy-rain", 0);
  for (let i = 0; i < 120; i += 1) stepWeather(w, camera, 1 / 60);
  assert.ok(w.rain.geometry.instanceCount > 0, "a downpour must draw rain");
  assert.equal(w.snow.geometry.instanceCount, 0, "a downpour must not draw snow");

  setWeather(w, "midday-hard", 0);
  for (let i = 0; i < 120; i += 1) stepWeather(w, camera, 1 / 60);
  assert.equal(w.rain.geometry.instanceCount, 0);
  assert.equal(w.snow.geometry.instanceCount, 0);
  assert.equal(w.rain.mesh.visible, false);
  assert.equal(w.snow.mesh.visible, false);
  disposeWeather(w);
});

test("a timeline brings rain in smoothly across a stage", () => {
  const { w, camera } = rig("clear-dawn");
  setWeatherTimeline(w, [
    { at: 0, preset: "clear-dawn" },
    { at: 0.45, preset: "overcast" },
    { at: 1.0, preset: "heavy-rain" },
  ], "progress");

  let prevVis = Infinity;
  let prevRate = -1;
  let lastWet = -1;
  const visSamples = [];
  for (let i = 0; i <= 600; i += 1) {
    setStageProgress(w, i / 600);
    stepWeather(w, camera, 1 / 30);
    const vis = w.current.visibility;
    const rate = w.current.precipRate;
    assert.ok(Number.isFinite(vis) && vis > 0);
    assert.ok(vis <= prevVis + 1e-6, `visibility rose at ${i}`);
    assert.ok(rate >= prevRate - 1e-9, `precip rate fell at ${i}`);
    assert.ok(w.wet.film >= lastWet - 1e-6 || rate === 0, `road dried while it rained at ${i}`);
    prevVis = vis;
    prevRate = rate;
    lastWet = w.wet.film;
    visSamples.push(vis);
  }
  assert.ok(visSamples[0] > 8000, "the stage should start clear");
  assert.ok(visSamples[visSamples.length - 1] < 1500, "the stage should finish in rain");
  assert.ok(w.wet.film > 0.5, `the road should be wet by the finish, got ${w.wet.film}`);
  assert.ok(w.metrics.standingWater > 0.1, "standing water should have built up");
  disposeWeather(w);
});

test("weatherSurfaceModifier reports a coherent, reusable road state", () => {
  const { w, camera } = rig("midday-hard");
  for (let i = 0; i < 60; i += 1) stepWeather(w, camera, 1 / 30);
  const dry = weatherSurfaceModifier(w);
  assert.equal(weatherSurfaceModifier(w), dry, "the modifier must be a reused object");
  assert.ok(dry.wetness < 0.05, `dry stage wetness ${dry.wetness}`);
  assert.ok(dry.gripScale > 0.95, `dry stage grip ${dry.gripScale}`);
  assert.ok(dry.aquaplaneRisk < 0.02);
  assert.ok(dry.visibility > 10000);
  const dryGrip = dry.gripScale;
  const dryVis = dry.visibility;

  setWeather(w, "thunderstorm", 0);
  for (let i = 0; i < 3000; i += 1) stepWeather(w, camera, 1 / 30);
  const wet = weatherSurfaceModifier(w);
  assert.ok(wet.wetness > 0.9, `storm wetness ${wet.wetness}`);
  assert.ok(wet.gripScale < dryGrip - 0.15, `storm grip ${wet.gripScale} vs dry ${dryGrip}`);
  assert.ok(wet.gripScale > 0.2, "grip must never collapse to nothing");
  assert.ok(wet.visibility < dryVis * 0.2, `storm visibility ${wet.visibility}`);
  assert.ok(wet.aquaplaneRisk > 0.3, `storm aquaplane risk ${wet.aquaplaneRisk}`);

  setWeather(w, "blizzard", 0);
  for (let i = 0; i < 3000; i += 1) stepWeather(w, camera, 1 / 30);
  const snow = weatherSurfaceModifier(w);
  assert.ok(snow.snowCover > 0.4, `blizzard snow cover ${snow.snowCover}`);
  assert.ok(snow.gripScale < 0.85, `blizzard grip ${snow.gripScale}`);

  for (const p of WEATHER_PRESETS) {
    setWeather(w, p.id, 0);
    for (let i = 0; i < 200; i += 1) stepWeather(w, camera, 1 / 30);
    const m = weatherSurfaceModifier(w);
    assert.ok(m.wetness >= 0 && m.wetness <= 1, `${p.id} wetness ${m.wetness}`);
    assert.ok(m.gripScale > 0.2 && m.gripScale <= 1.06, `${p.id} grip ${m.gripScale}`);
    assert.ok(m.visibility > 10 && m.visibility < 50000, `${p.id} visibility ${m.visibility}`);
    assert.ok(m.aquaplaneRisk >= 0 && m.aquaplaneRisk <= 1, `${p.id} aquaplane ${m.aquaplaneRisk}`);
  }
  disposeWeather(w);
});

test("lens water accumulates, the wipers clear it, and airflow helps", () => {
  const { w, camera } = rig("heavy-rain");
  setWeatherMotion(w, 0, 0, 0);
  for (let i = 0; i < 600; i += 1) {
    setWeatherMotion(w, 0, 0, 0);
    stepWeather(w, camera, 1 / 60);
  }
  const parked = weatherLensState(w).dropletCoverage;
  assert.ok(parked > 0.5, `a parked car in a downpour should stream, got ${parked}`);
  assert.ok(w.lens.wiperMode >= 2, `heavy rain should call for fast wipers, got ${w.lens.wiperMode}`);

  let sweptOnce = false;
  for (let i = 0; i < 600; i += 1) {
    setWeatherMotion(w, 0, 0, 45);
    stepWeather(w, camera, 1 / 60);
    if (w.lens.wiperSweep > 0.8) sweptOnce = true;
    assert.ok(w.lens.wiperSweep >= 0 && w.lens.wiperSweep <= 1);
  }
  assert.ok(sweptOnce, "the blade should complete a sweep");
  const fast = weatherLensState(w).dropletCoverage;
  assert.ok(fast < parked, `airflow should clear the chase lens: ${parked} -> ${fast}`);
  assert.ok(w.lens.glassDrops < 0.9, "the wipers should be keeping the glass usable");

  // Spray from a car ahead is a separate contribution and it has to arrive.
  const before = w.spray.density;
  for (let i = 0; i < 120; i += 1) {
    setSprayLead(w, 18, 30);
    setWeatherMotion(w, 0, 0, 30);
    stepWeather(w, camera, 1 / 60);
  }
  assert.ok(w.spray.density > before, "a close, fast car ahead should throw spray");
  assert.ok(w.spray.density <= 1);

  // Three minutes of dry running: the road dries out, the car stops throwing its
  // own spray, and only then does the lens actually clear.
  setWeather(w, "midday-hard", 0);
  for (let i = 0; i < 5400; i += 1) {
    setWeatherMotion(w, 0, 0, 30);
    setSprayLead(w, Infinity, 0);
    stepWeather(w, camera, 1 / 30);
  }
  assert.ok(w.wet.film < 0.02, `the road should have dried, film ${w.wet.film}`);
  assert.ok(weatherLensState(w).dropletCoverage < 0.02, "the lens should dry in the sun");
  assert.equal(w.lens.wiperMode, 0, "dry weather should park the wipers");
  disposeWeather(w);
});

test("thunderstorms flash deterministically and change nothing structural", () => {
  const a = rig("thunderstorm");
  const b = rig("thunderstorm");
  const flashesA = [];
  const flashesB = [];
  for (let i = 0; i < 1800; i += 1) {
    stepWeather(a.w, a.camera, 1 / 60);
    stepWeather(b.w, b.camera, 1 / 60);
    flashesA.push(a.w.lightning.flash);
    flashesB.push(b.w.lightning.flash);
  }
  assert.deepEqual(flashesA, flashesB, "the same seed must give the same storm");
  assert.ok(Math.max(...flashesA) > 0.2, "a thunderstorm should actually flash");
  assert.equal(countObjects(a.scene), countObjects(b.scene));
  disposeWeather(a.w);
  disposeWeather(b.w);
});

test("the generated cloud texture is deterministic and seamless", () => {
  const a = rig("overcast", { cloudTextureSize: 128 });
  const b = rig("overcast", { cloudTextureSize: 128 });
  const da = a.w.cloudTexture.image.data;
  const db = b.w.cloudTexture.image.data;
  assert.equal(da.length, db.length);
  for (let i = 0; i < da.length; i += 1) assert.equal(da[i], db[i], `cloud texel ${i} differs`);

  // Seamlessness: the step across the wrap must be no bigger than an ordinary
  // step between neighbouring texels. A visible seam in a cloud deck is the
  // first thing that gives a procedural sky away.
  const size = a.w.cloudTexture.image.width;
  const at = (x, y, ch) => da[(y * size + x) * 4 + ch];
  let wrapSum = 0;
  let innerSum = 0;
  let innerN = 0;
  for (let y = 0; y < size; y += 1) {
    for (let ch = 0; ch < 4; ch += 1) {
      wrapSum += Math.abs(at(0, y, ch) - at(size - 1, y, ch));
      for (let x = 1; x < size; x += 1) {
        innerSum += Math.abs(at(x, y, ch) - at(x - 1, y, ch));
        innerN += 1;
      }
    }
  }
  const wrapMean = wrapSum / (size * 4);
  const innerMean = innerSum / innerN;
  assert.ok(wrapMean <= innerMean * 2 + 1,
    `wrap step ${wrapMean.toFixed(2)} vs interior ${innerMean.toFixed(2)} — that is a seam`);
  disposeWeather(a.w);
  disposeWeather(b.w);
});

test("every preset drives a finite, sane rig", () => {
  for (const p of WEATHER_PRESETS) {
    const { scene, w, camera } = rig(p.id);
    const objects0 = countObjects(scene);
    for (let i = 0; i < 300; i += 1) {
      camera.position.z += 25 / 60;
      stepWeather(w, camera, 1 / 60);
    }
    assert.equal(countObjects(scene), objects0, `${p.id} changed the scene graph`);
    for (const light of [w.lights.key, w.lights.moon, w.lights.fill, w.lights.bounce, w.lights.ambient]) {
      assert.ok(Number.isFinite(light.intensity) && light.intensity >= 0,
        `${p.id}: ${light.name} intensity ${light.intensity}`);
      assert.ok(light.color.r >= 0 && light.color.g >= 0 && light.color.b >= 0,
        `${p.id}: ${light.name} has a negative colour`);
      assert.ok(Number.isFinite(light.color.r + light.color.g + light.color.b),
        `${p.id}: ${light.name} colour is NaN`);
    }
    for (const [key, u] of Object.entries(w.sky.uniforms)) {
      const v = u.value;
      if (typeof v === "number") {
        assert.ok(Number.isFinite(v), `${p.id}: sky uniform ${key} is ${v}`);
      } else if (v && typeof v.r === "number") {
        assert.ok(v.r >= 0 && v.g >= 0 && v.b >= 0 && Number.isFinite(v.r + v.g + v.b),
          `${p.id}: sky colour uniform ${key} is bad`);
      } else if (v && typeof v.x === "number") {
        assert.ok(Number.isFinite(v.x + v.y + (v.z || 0)), `${p.id}: sky vector uniform ${key} is NaN`);
      }
    }
    assert.ok(w.fog.near >= 0 && w.fog.far > w.fog.near, `${p.id}: fog ${w.fog.near}..${w.fog.far}`);
    assert.ok(Number.isFinite(w.metrics.lightLevel));
    // Lights go on when it is dark or when you cannot be seen, and stay off when
    // it is neither.
    const shouldLight = p.sunElevation < 0 || p.visibility < 1500;
    assert.equal(w.metrics.headlights, shouldLight,
      `${p.id}: headlights ${w.metrics.headlights}, expected ${shouldLight} `
      + `(demand ${w.metrics.headlightDemand.toFixed(3)})`);
    disposeWeather(w);
  }
});

test("createWeather accepts an options object and a preset object", () => {
  const scene = new THREE.Scene();
  const w = createWeather(THREE, scene, { preset: "hill-fog", ...RIG });
  assert.equal(w.current.id, "hill-fog");
  assert.equal(w.rain.pool, RIG.rainPool);
  disposeWeather(w);

  const scene2 = new THREE.Scene();
  const w2 = createWeather(THREE, scene2, presetById("light-snow"), RIG);
  assert.equal(w2.current.id, "light-snow");
  assert.equal(scene2.children.length, 1, "the whole rig must hang off one group");
  disposeWeather(w2);
  assert.equal(scene2.children.length, 0, "dispose must take the rig back out");
});

test("headlights are already right on the very first frame", () => {
  // Dark, or blind: a white-out and a hill fog are bright and still need lights.
  for (const id of ["night-clear", "night-rain", "thunderstorm", "heavy-rain", "blizzard", "hill-fog"]) {
    const { w } = rig(id);
    assert.equal(w.metrics.headlights, true, `${id} should start with lights on`);
    disposeWeather(w);
  }
  for (const id of ["midday-hard", "golden-hour", "clear-dawn", "overcast", "light-rain", "light-snow"]) {
    const { w } = rig(id);
    assert.equal(w.metrics.headlights, false, `${id} should start with lights off`);
    disposeWeather(w);
  }
});

test("rain density follows the rate and the speed", () => {
  const { w, camera } = rig("light-rain");
  setWeatherMotion(w, 0, 0, 0);
  stepWeather(w, camera, 1 / 60);
  const slow = w.rain.geometry.instanceCount;
  for (let i = 0; i < 120; i += 1) {
    setWeatherMotion(w, 0, 0, 45);
    stepWeather(w, camera, 1 / 60);
  }
  const fast = w.rain.geometry.instanceCount;
  assert.ok(slow > 0, "light rain should still draw");
  assert.ok(fast > slow, `speed should thicken the field: ${slow} -> ${fast}`);
  assert.ok(fast <= w.rain.pool, "and never exceed the pool");

  setWeather(w, "heavy-rain", 0);
  for (let i = 0; i < 60; i += 1) stepWeather(w, camera, 1 / 60);
  assert.ok(w.rain.geometry.instanceCount > fast, "a downpour should be denser than a drizzle");
  disposeWeather(w);
});

test("wipers can be taken over and handed back", () => {
  const { w, camera } = rig("heavy-rain");
  for (let i = 0; i < 300; i += 1) stepWeather(w, camera, 1 / 60);
  assert.ok(w.lens.wiperMode > 0, "auto wipers should be running in a downpour");
  setWiperMode(w, 0);
  for (let i = 0; i < 300; i += 1) stepWeather(w, camera, 1 / 60);
  assert.equal(w.lens.wiperMode, 0, "a manual off must stick");
  assert.equal(w.lens.wiperSweep, 0);
  assert.ok(w.lens.glassDrops > 0.8, "and the glass must fill up with the blades parked");
  setWiperMode(w, -1);
  for (let i = 0; i < 300; i += 1) stepWeather(w, camera, 1 / 60);
  assert.ok(w.lens.wiperMode > 0, "handing back should restore the rain sensor");
  disposeWeather(w);
});

test("a crossfade between two presets is continuous in the rig", () => {
  const { w, camera } = rig("clear-dawn");
  setWeather(w, "thunderstorm", 6);
  let prevKey = w.lights.key.intensity;
  let prevFog = w.fog.far;
  let prevLum = w.metrics.skyLuminance;
  for (let i = 0; i < 400; i += 1) {
    stepWeather(w, camera, 1 / 60);
    const key = w.lights.key.intensity;
    const fog = w.fog.far;
    const lum = w.metrics.skyLuminance;
    assert.ok(Math.abs(key - prevKey) < 0.15, `key intensity jumped ${Math.abs(key - prevKey)}`);
    assert.ok(Math.abs(fog - prevFog) / Math.max(prevFog, 1) < 0.05, "fog distance jumped");
    assert.ok(Math.abs(lum - prevLum) < 0.05, "sky luminance jumped");
    prevKey = key;
    prevFog = fog;
    prevLum = lum;
  }
  assert.equal(w.current.id, "thunderstorm");
  assert.ok(luminance(w.current.skyZenith) < luminance(presetById("clear-dawn").skyZenith) * 0.6,
    "the storm sky should end up far darker than the dawn it faded from");
  disposeWeather(w);
});

// ---- the dome
//
// A JS mirror of the cloud-and-haze arithmetic in SKY_FRAG, so the sky can be
// measured rather than eyeballed. It reproduces the terms below verbatim; the
// anchor test asserts every one of those lines is still the literal source of
// the shader, so a change on one side and not the other fails loudly instead of
// leaving the mirror quietly measuring a sky nobody renders. Stars and the moon
// are left out: they only fire below the horizon gate and nothing here looks at
// night.

const SKY_ANCHORS = [
  "float above = smoothstep(0.0, 0.62, h);",
  "vec3 col = mix(uHorizon, uZenith, pow(above, 0.72));",
  "col = mix(col, uGround, smoothstep(0.0, -0.22, h));",
  "float mie = pow(max(sd, 0.0), 6.0) * 0.09 + pow(max(sd, 0.0), 60.0) * 0.35;",
  "col += uSunColour * uSunIntensity * (disc * 26.0 + bloom * 8.0 + mie * uHalo);",
  "vec4 n3 = texture2D(uCloudTex, uv * 0.23 + uCloudScroll * 0.31);",
  "float density = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.42 / uCloudSharp, field);",
  "density *= uCloudOpacity;",
  "density *= smoothstep(0.006, 0.09, h);",
  "float swell = dot(n3, uCloudMix) / wsum;",
  "float body = clamp(0.5 + (mix(field, swell, 0.42) - 0.5) * 2.7, 0.0, 1.0);",
  "float thin = 1.0 - smoothstep(0.16, 0.86, body);",
  "float through = (0.35 + 0.65 * thin)",
  "* (pow(toward, 1.3) * 0.30 + pow(toward, 5.0) * 0.42 + pow(toward, 24.0) * 0.52);",
  "float rim = pow(toward, 3.0) * thin;",
  "vec3 cloud = mix(uCloudDark, uCloudLit, clamp(0.06 + 0.88 * thin + 0.30 * rim, 0.0, 1.0));",
  "cloud *= mix(1.46, 0.58, smoothstep(0.02, 0.66, h));",
  "cloud += uSunColour * uCloudGlow * through;",
  "col = mix(col, uFogColour, 1.0 - smoothstep(0.0, mix(0.05, 0.55, uHaze), h));",
];

test("the dome mirror below is still a mirror of the shader above it", () => {
  for (const line of SKY_ANCHORS) {
    assert.ok(SKY_FRAG.includes(line),
      `SKY_FRAG no longer contains "${line}" — update the mirror in this file to match`);
  }
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const lum3 = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Bilinear, RepeatWrapping — what texture2D does to the generated cloud texture.
function sampleCloudTex(tex, u, v, out) {
  const size = tex.image.width;
  const d = tex.image.data;
  const fx = (((u % 1) + 1) % 1) * size - 0.5;
  const fy = (((v % 1) + 1) % 1) * size - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const wrap = (i) => ((i % size) + size) % size;
  for (let c = 0; c < 4; c += 1) {
    const g = (x, y) => d[(wrap(y) * size + wrap(x)) * 4 + c] / 255;
    const a = lerp(g(x0, y0), g(x0 + 1, y0), tx);
    const b = lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), tx);
    out[c] = lerp(a, b, ty);
  }
  return out;
}

const TEXA = [0, 0, 0, 0];
const TEXB = [0, 0, 0, 0];
const TEXC = [0, 0, 0, 0];

function domeRadiance(w, dx, dy, dz, camX, camZ, out) {
  const u = w.sky.uniforms;
  const num = (k) => u[k].value;
  const rgb = (k) => { const c = u[k].value; return [c.r, c.g, c.b]; };
  const h = dy;
  const above = ss(0, 0.62, h);
  const zen = rgb("uZenith");
  const hor = rgb("uHorizon");
  const gnd = rgb("uGround");
  const p = Math.pow(above, 0.72);
  const under = ss(0, -0.22, h);
  for (let i = 0; i < 3; i += 1) out[i] = lerp(lerp(hor[i], zen[i], p), gnd[i], under);

  const sun = num("uSunDir");
  const sd = dx * sun.x + dy * sun.y + dz * sun.z;
  const size = num("uSunSize");
  const sunR = Math.cos(size);
  const disc = ss(sunR - size * 0.35, sunR + size * 0.05, sd);
  const bloom = Math.pow(Math.max(sd, 0), 1400);
  const mie = Math.pow(Math.max(sd, 0), 6) * 0.09 + Math.pow(Math.max(sd, 0), 60) * 0.35;
  const sunCol = rgb("uSunColour");
  const sunI = num("uSunIntensity");
  for (let i = 0; i < 3; i += 1) {
    out[i] += sunCol[i] * sunI * (disc * 26 + bloom * 8 + mie * num("uHalo"));
  }

  if (h > 0.006 && num("uCloudOpacity") > 0.001) {
    const t = num("uCloudAlt") / h;
    const scale = num("uCloudScale");
    const scroll = num("uCloudScroll");
    const uu = (camX + dx * t) * scale + scroll.x;
    const vv = (camZ + dz * t) * scale + scroll.y;
    sampleCloudTex(w.cloudTexture, uu, vv, TEXA);
    sampleCloudTex(w.cloudTexture, uu * 2.17 - scroll.x * 0.6, vv * 2.17 - scroll.y * 0.6, TEXB);
    sampleCloudTex(w.cloudTexture, uu * 0.23 + scroll.x * 0.31, vv * 0.23 + scroll.y * 0.31, TEXC);
    const m = num("uCloudMix");
    const wsum = Math.max(m.x + m.y + m.z + m.w, 0.001);
    const dot4 = (a) => (a[0] * m.x + a[1] * m.y + a[2] * m.z + a[3] * m.w) / wsum;
    const field = lerp(dot4(TEXA), dot4(TEXB), 0.35);
    const cover = num("uCloudCover");
    let density = ss(1 - cover, 1 - cover + 0.42 / num("uCloudSharp"), field);
    density *= num("uCloudOpacity");
    density *= ss(0.006, 0.09, h);
    const swell = dot4(TEXC);
    const body = clamp01(0.5 + (lerp(field, swell, 0.42) - 0.5) * 2.7);
    const thin = 1 - ss(0.16, 0.86, body);
    const toward = Math.max(sd, 0);
    const through = (0.35 + 0.65 * thin)
      * (Math.pow(toward, 1.3) * 0.30 + Math.pow(toward, 5) * 0.42 + Math.pow(toward, 24) * 0.52);
    const rim = Math.pow(toward, 3) * thin;
    const shade = clamp01(0.06 + 0.88 * thin + 0.30 * rim);
    const lit = rgb("uCloudLit");
    const dark = rgb("uCloudDark");
    const base = lerp(1.46, 0.58, ss(0.02, 0.66, h));
    const glow = num("uCloudGlow");
    for (let i = 0; i < 3; i += 1) {
      const cloud = lerp(dark[i], lit[i], shade) * base + sunCol[i] * glow * through;
      out[i] = lerp(out[i], cloud, clamp01(density));
    }
  }

  const fog = rgb("uFogColour");
  const band = 1 - ss(0, lerp(0.05, 0.55, num("uHaze")), h);
  for (let i = 0; i < 3; i += 1) out[i] = lerp(out[i], fog[i], band) + num("uFlash");
  return out;
}

// The dome's luminance in the linear radiance the shader writes.
//
// Radiance ratios alone are not enough and once let a white wash ship: the tone
// curve is monotonic, which preserves the *order* of two values and says nothing
// about their distance. Every overcast preset sat high on the ACES shoulder,
// where a factor of two in radiance is worth about sixteen levels of 8-bit
// pixel, so a dome that passed a 1.9x span here photographed as one flat sheet
// of near-white. Anything about how flat the sky *looks* is measured in
// skyPixel() below instead.
const DOME = [0, 0, 0];
function domeLum(w, elev, az) {
  const ce = Math.cos(elev);
  return lum3(domeRadiance(w, ce * Math.sin(az), Math.sin(elev), ce * Math.cos(az), 0, 0, DOME));
}

// ---- what the screen actually shows
//
// render.js's composite runs exposure, then ACES, then the grade, then sRGB.
// Reproducing the first two and the encode is enough to answer "is this sky one
// pale wash?", because the grade is a mild per-channel trim that cannot turn a
// flat image into a graded one. The anchors keep this honest the same way
// SKY_ANCHORS keeps the dome mirror honest: render.js is another module's file,
// so a curve change there has to fail here rather than silently unmeasure the
// sky.
const RENDER_SRC = readFileSync(fileURLToPath(new URL("../render.js", import.meta.url)), "utf8");

const POST_ANCHORS = [
  "return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);",
  "col *= uExposure;",
  "col = acesFilmic(col);",
];

test("the post chain this file tone maps through is still the one render.js runs", () => {
  for (const line of POST_ANCHORS) {
    assert.ok(RENDER_SRC.includes(line),
      `render.js no longer contains "${line}" — the pixel mirror below is measuring a curve nobody runs`);
  }
  for (const [name, value] of [["a", "2.51"], ["b", "0.03"], ["c", "2.43"], ["d", "0.59"], ["e", "0.14"]]) {
    assert.ok(RENDER_SRC.includes(`const float ${name} = ${value};`),
      `render.js's ACES constant ${name} is no longer ${value}`);
  }
});

function aces(x) {
  const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  return clamp01(v);
}

function encodeSrgb8(linear) {
  const c = clamp01(linear);
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return s * 255;
}

// One 8-bit channel triple for a direction, as the composite would write it.
const PIXEL = [0, 0, 0];
function skyPixel(w, elevRad, az) {
  const ce = Math.cos(elevRad);
  domeRadiance(w, ce * Math.sin(az), Math.sin(elevRad), ce * Math.cos(az), 0, 0, DOME);
  const exposure = w.current.exposure;
  for (let i = 0; i < 3; i += 1) PIXEL[i] = encodeSrgb8(aces(DOME[i] * exposure));
  return PIXEL;
}

function skyPixelLum(w, elevRad, az) {
  return lum3(skyPixel(w, elevRad, az));
}

// ---- what the ground gets, split into the beam and everything else
//
// The rig's irradiance on a horizontal, up-facing patch — a road, a verge, the
// bonnet — separated into the part a shadow can take away and the part it
// cannot. render.js sets useLegacyLights false, so a directional contributes
// colour x intensity x N.L and a hemisphere seen by an up-facing surface
// contributes its sky colour x intensity outright.
//
// The split is the whole point. Shadow contrast is direct over diffuse and
// nothing else: at 1.5:1 a shadowed patch is 40% darker than lit ground, which
// after exposure and the ACES curve is nothing at all, and a low sun raking
// across a stage produces no visible shadow anywhere in the frame.
function groundIrradiance(w) {
  const L = w.lights;
  const direct = [0, 0, 0];
  const diffuse = [0, 0, 0];
  for (const [light, into] of [[L.key, direct], [L.moon, direct], [L.bounce, diffuse]]) {
    const p = light.position;
    const n = Math.hypot(p.x, p.y, p.z) || 1;
    const dotNL = Math.max(p.y / n, 0);
    into[0] += light.color.r * light.intensity * dotNL;
    into[1] += light.color.g * light.intensity * dotNL;
    into[2] += light.color.b * light.intensity * dotNL;
  }
  diffuse[0] += L.fill.color.r * L.fill.intensity + L.ambient.color.r * L.ambient.intensity;
  diffuse[1] += L.fill.color.g * L.fill.intensity + L.ambient.color.g * L.ambient.intensity;
  diffuse[2] += L.fill.color.b * L.fill.intensity + L.ambient.color.b * L.ambient.intensity;
  return { direct, diffuse };
}

// A Lambertian patch of `albedo` under irradiance `E`, in 8-bit levels, through
// the same exposure/ACES/sRGB the composite runs.
const GROUND = [0, 0, 0];
function groundPixel(E, albedo, exposure) {
  for (let i = 0; i < 3; i += 1) GROUND[i] = encodeSrgb8(aces(E[i] * albedo[i] / Math.PI * exposure));
  return lum3(GROUND);
}

// The same patch before the composite: linear radiance, which is what a particle
// drawn in front of it composites against.
function groundRadiance(E, albedo) {
  return lum3([E[0] * albedo[0], E[1] * albedo[1], E[2] * albedo[2]]) / Math.PI;
}

// The whole rig on an up-facing patch, shadow or no shadow, in one array.
const IRRADIANCE = [0, 0, 0];
function totalIrradiance(w) {
  const { direct, diffuse } = groundIrradiance(w);
  for (let i = 0; i < 3; i += 1) IRRADIANCE[i] = direct[i] + diffuse[i];
  return IRRADIANCE;
}

// Lowest, highest and mean pixel luma in the band a driver can see: the horizon
// up to about fifty degrees, all the way round. The sun's own disc and bloom are
// skipped — they are a light source, and a sky that only spans a range because
// it contains a clipped white sun is still a flat sky.
function visibleBandPixels(w) {
  const sun = w.sky.uniforms.uSunDir.value;
  const near = Math.cos(15 * DEG);
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  let n = 0;
  for (let elevDeg = 2; elevDeg <= 50; elevDeg += 2) {
    const e = elevDeg * DEG;
    const ce = Math.cos(e);
    for (let i = 0; i < 72; i += 1) {
      const az = (i / 72) * Math.PI * 2;
      const dx = ce * Math.sin(az);
      const dy = Math.sin(e);
      const dz = ce * Math.cos(az);
      if (dx * sun.x + dy * sun.y + dz * sun.z > near) continue;
      const L = skyPixelLum(w, e, az);
      if (L < lo) lo = L;
      if (L > hi) hi = L;
      sum += L;
      n += 1;
    }
  }
  return { lo, hi, span: hi - lo, mean: sum / n };
}

// How warm a direction reads, as a share of its own brightness. Positive is
// warm (red over blue), negative cool.
function warmth(w, elevDeg, az) {
  const p = skyPixel(w, elevDeg * DEG, az);
  return (p[0] - p[2]) / Math.max(lum3(p), 1);
}

function domeStats(w, elev, samples) {
  const n = samples || 360;
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const L = domeLum(w, elev, (i / n) * Math.PI * 2);
    if (L < lo) lo = L;
    if (L > hi) hi = L;
    sum += L;
  }
  return { lo, hi, mean: sum / n };
}

test("the overcast family is a sky, not a flat grey wall", () => {
  // Every one of these is a full or near-full lid — the family that photographed
  // as one value from horizon to zenith, because coverage clipped to one across
  // the whole field and coverage was also the only thing shading the deck.
  for (const id of ["overcast", "light-rain", "hill-fog", "light-snow", "blizzard"]) {
    const { w, camera } = rig(id);
    stepWeather(w, camera, 1 / 60);

    // The white-outs are held to less than the rest: inside cloud the sky
    // really is one value in every direction, and that is the weather rather
    // than a defect.
    const openSky = w.current.visibility > 400;

    // 1. Cloud-base structure: at a fixed altitude the deck has to vary around
    // the sky, and by a decent share of the range its own two colours were
    // authored to span — a deck that never leaves one end of that range is
    // exactly the wall this is looking for. The flat version measured 0.046 of
    // luminance across a full turn at 20 degrees against an authored span of
    // 0.32, a seventh of it.
    const deckSpan = luminance(w.current.cloudLit) - luminance(w.current.cloudDark);
    assert.ok(deckSpan > 0.1, `${id}: cloudLit and cloudDark are barely different`);
    for (const elevDeg of [20, 40]) {
      const s = domeStats(w, elevDeg * DEG);
      // The deck's own altitude ramp dims it overhead — a lid is brightest where
      // you look along its lit base — so the span it can paint at 40 degrees is
      // a little over half the one it paints at the horizon. Hold the structure
      // to a share of what is actually available at this altitude, or a deck
      // fails here for being correctly lit rather than for being flat.
      const gain = lerp(1.46, 0.58, ss(0.02, 0.66, Math.sin(elevDeg * DEG)));
      assert.ok(s.hi - s.lo > deckSpan * gain * 0.30,
        `${id}: only ${(s.hi - s.lo).toFixed(3)} of cloud structure at ${elevDeg} deg, `
        + `against an authored deck span of ${deckSpan.toFixed(3)} at ${gain.toFixed(2)}x`);
      if (openSky) {
        assert.ok(s.hi / s.lo > 1.35,
          `${id}: deck contrast ratio only ${(s.hi / s.lo).toFixed(2)} at ${elevDeg} deg`);
      }
    }

    // 2. The deck's base is brighter along the horizon than it is overhead...
    const low = domeStats(w, 4 * DEG).mean;
    const high = domeStats(w, 45 * DEG).mean;
    assert.ok(low > high, `${id}: the sky is no brighter at the horizon than overhead`);

    // ...and the whole visible band has to carry a real range. This is the
    // measurement the flat version failed outright: 0.36 to 0.42, a ratio of
    // 1.16 over every direction a driver can see, which photographed as one
    // pale grey wall.
    let bandLo = Infinity;
    let bandHi = -Infinity;
    for (let elevDeg = 3; elevDeg <= 50; elevDeg += 1) {
      const s = domeStats(w, elevDeg * DEG, 96);
      if (s.lo < bandLo) bandLo = s.lo;
      if (s.hi > bandHi) bandHi = s.hi;
    }
    const bandFloor = openSky ? 1.9 : 1.4;
    assert.ok(bandHi / bandLo > bandFloor,
      `${id}: the visible sky spans only ${bandLo.toFixed(3)}..${bandHi.toFixed(3)}, `
      + `a ratio of ${(bandHi / bandLo).toFixed(2)}, wanted ${bandFloor}`);

    // 3. A bright patch where the sun is: all five have the sun up, and a lid
    // diffuses it rather than deleting it. Not inside a white-out, where the
    // whole point is that you cannot tell where the sun is.
    const sun = w.sky.uniforms.uSunDir.value;
    const sunAz = Math.atan2(sun.x, sun.z);
    const sunElev = Math.asin(sun.y);
    assert.ok(sunElev > 0, `${id} should have the sun above the horizon`);
    if (openSky) {
      const atSun = domeLum(w, sunElev, sunAz);
      const away = domeLum(w, sunElev, sunAz + Math.PI);
      assert.ok(atSun / away > 1.4,
        `${id}: the sun's patch is only ${(atSun / away).toFixed(2)}x the far side of the sky`);
    }
    disposeWeather(w);
  }
});

// Which presets are a sky you look at rather than a cloud you are inside. The
// two white-outs are excluded on purpose: in hill fog and a blizzard the sky
// really is one value in every direction, and that is the weather.
const DAYLIGHT_SKIES = Object.freeze([
  "clear-dawn", "midday-hard", "golden-hour", "overcast",
  "light-rain", "heavy-rain", "thunderstorm", "light-snow",
]);

test("no daylight sky is a flat wash once it is through the tone curve", () => {
  // The measurement that matters, and the one the radiance tests above could
  // not make. Eleven shipped frames had their whole top third between #e8ebec
  // and #f2f4f5 — about ten levels of 8-bit spread — while the radiance under
  // it spanned nearly a factor of two. Both facts were true at once because the
  // whole sky sat on the ACES shoulder.
  for (const id of DAYLIGHT_SKIES) {
    const { w, camera } = rig(id);
    stepWeather(w, camera, 1 / 60);
    w.lightning.flash = 0;
    w.sky.uniforms.uFlash.value = 0;

    // Fifty levels is set from the two that failed: the shipped overcast spanned
    // 40 and the shipped midday 43, against 60 to 133 for every preset now.
    const band = visibleBandPixels(w);
    assert.ok(band.span > 50,
      `${id}: the visible sky spans only ${band.span.toFixed(0)} levels `
      + `(${band.lo.toFixed(0)}..${band.hi.toFixed(0)}, mean ${band.mean.toFixed(0)}) `
      + "— that is a wash, not a sky");
    // And it must not buy that span by clipping: a sky pinned against white has
    // nowhere left to put a cloud, and every highlight in the scene then reads
    // as darker than the background behind it.
    assert.ok(band.hi < 249,
      `${id}: the sky reaches ${band.hi.toFixed(0)} away from the sun — it is clipping`);
    disposeWeather(w);
  }
});

test("every daylight sky has a warm end and a cool end", () => {
  // A sky with no warm/cool axis says nothing about where it is or what time it
  // is; it is a grey card with a gradient. Clear air runs cool overhead and warm
  // along the horizon, because the long path scatters the blue out of it; a lid
  // does the same thing through its own base. Sign and size both matter — a
  // one-level difference is a rounding artefact, not an axis.
  for (const id of DAYLIGHT_SKIES) {
    const { w, camera } = rig(id);
    stepWeather(w, camera, 1 / 60);
    w.lightning.flash = 0;
    w.sky.uniforms.uFlash.value = 0;
    // Measured away from the sun so this reads the sky's own colour rather than
    // the sun's, which is warm in every preset that has one.
    const sun = w.sky.uniforms.uSunDir.value;
    const away = Math.atan2(sun.x, sun.z) + Math.PI;
    const low = warmth(w, 3, away);
    const high = warmth(w, 42, away);
    // 0.065 against 0.094 for the flattest preset and 1.07 for the warmest.
    // The shipped overcast managed 0.011 — one part in ninety of its own
    // brightness, which is not a colour decision, it is rounding.
    assert.ok(low - high > 0.065,
      `${id}: horizon ${low.toFixed(3)} vs zenith ${high.toFixed(3)} — no warm/cool axis in it`);
    disposeWeather(w);
  }
});

// The direct-to-diffuse ratio each preset family is allowed, and where a
// mid-albedo gravel road must land once the composite has had it.
//
// `ratio` is sunlight on flat ground over everything else falling on it. Real
// clear daylight runs 5:1 to 10:1 measured square to the beam; on horizontal
// ground the cosine takes most of that away at a low sun, so a raking sun is
// allowed to sit near 2:1 and a noon sun is not. An overcast sky genuinely is
// near 1:1 — there is no beam to cast anything — so the lid family is held the
// other way round, at a ceiling, and a lid that grew a shadow would fail here.
//
// `lit` is where sunlit gravel has to land in 8-bit levels. It is the assertion
// that would have caught the frame this test was written for: 76% of it sat in
// luminance buckets 2-5 of 16, buckets 8, 9 and 10 were empty, and road, verge,
// terrain and trees were all inside the same two-stop shadow band with the sky
// a separate bright plate above them. Ground under 85 is that frame.
//
// `gap` is lit minus shadowed, in the same levels — how much of a shadow you can
// actually see. Golden hour shipped at 13.
//
// `albedo` overrides the surface the band is judged on, for the one preset whose
// stage is not gravel by the time you drive it.
const SNOW_ALBEDO = surfaceProps(SURFACE.SNOW).albedo;

const GROUND_LIGHT = Object.freeze({
  "clear-dawn": { ratio: [1.15, 3.0], lit: [58, 120], gap: 25 },
  "midday-hard": { ratio: [4.0, 9.0], lit: [150, 215], gap: 90 },
  "golden-hour": { ratio: [1.5, 3.5], lit: [90, 155], gap: 45 },
  overcast: { ratio: [0, 0.35], lit: [85, 175], gap: 0 },
  "light-rain": { ratio: [0, 0.35], lit: [70, 165], gap: 0 },
  "heavy-rain": { ratio: [0, 0.35], lit: [50, 150], gap: 0 },
  thunderstorm: { ratio: [0, 0.35], lit: [55, 150], gap: 0 },
  "hill-fog": { ratio: [0, 0.35], lit: [90, 185], gap: 0 },
  "light-snow": { ratio: [0, 0.35], lit: [80, 175], gap: 0 },
  // Judged on snow, because by the time a blizzard stage is drivable
  // `weatherSurfaceModifier` reports 0.92 of snow cover and gravel is not the
  // surface in the frame: its level says nothing about whether the picture has
  // a midtone in it. The band is where the snow the car is actually on has to
  // land, and the frame agrees — driven to a stop on the ice stage the verge
  // beside the road measures 151 and the road itself 207.
  blizzard: { ratio: [0, 0.35], lit: [130, 220], gap: 0, albedo: SNOW_ALBEDO },
});

const ROAD_ALBEDO = surfaceProps(SURFACE.GRAVEL).albedo;

test("every daylight preset lights its ground to a defensible key-to-fill ratio", () => {
  for (const p of WEATHER_PRESETS) {
    const band = GROUND_LIGHT[p.id];
    // The two night presets have no beam at all — the sun is gated off below the
    // horizon and the moon carries the stage — so a key/fill ratio is not a
    // quantity they have. What a night has to do instead is asserted at the
    // bottom of this file.
    if (!band) {
      assert.ok(p.sunElevation < 0, `${p.id} has no entry in GROUND_LIGHT and the sun is up`);
      continue;
    }
    const { w, camera } = rig(p.id);
    stepWeather(w, camera, 1 / 60);
    w.lightning.flash = 0;

    const { direct, diffuse } = groundIrradiance(w);
    const lumDirect = lum3(direct);
    const lumDiffuse = lum3(diffuse);
    const ratio = lumDirect / Math.max(lumDiffuse, 1e-9);
    assert.ok(ratio >= band.ratio[0] && ratio <= band.ratio[1],
      `${p.id}: sun ${lumDirect.toFixed(4)} against fill ${lumDiffuse.toFixed(4)} is `
      + `${ratio.toFixed(2)}:1 on flat ground, outside ${band.ratio[0]}..${band.ratio[1]}`);

    const total = [direct[0] + diffuse[0], direct[1] + diffuse[1], direct[2] + diffuse[2]];
    const albedo = band.albedo || ROAD_ALBEDO;
    const lit = groundPixel(total, albedo, w.current.exposure);
    const shadowed = groundPixel(diffuse, albedo, w.current.exposure);
    assert.ok(lit >= band.lit[0] && lit <= band.lit[1],
      `${p.id}: sunlit ground comes out at ${lit.toFixed(0)}, outside ${band.lit[0]}..${band.lit[1]} `
      + "— the frame has no midtone for the eye to rest on");
    assert.ok(lit - shadowed >= band.gap,
      `${p.id}: lit ${lit.toFixed(0)} against shadowed ${shadowed.toFixed(0)} is only `
      + `${(lit - shadowed).toFixed(0)} levels — that shadow is not visible`);
    // Raising the key without dropping the fill blows the highlights instead of
    // filling the midtones, and the sky is already the brightest plate in the
    // frame. A patch square to the sun is the brightest lit thing on a stage.
    const facing = luminance([w.lights.key.color.r, w.lights.key.color.g, w.lights.key.color.b])
      * w.lights.key.intensity + lumDiffuse;
    const white = groundPixel([facing, facing, facing], [0.8, 0.8, 0.8], w.current.exposure);
    assert.ok(white < 252,
      `${p.id}: a white panel square to the sun clips at ${white.toFixed(0)}`);
    disposeWeather(w);
  }
});

test("golden hour keeps the cloud and the colour it always had", () => {
  const { w, camera } = rig("golden-hour");
  stepWeather(w, camera, 1 / 60);
  const s = domeStats(w, 20 * DEG);
  assert.ok(s.hi - s.lo > 0.15, `broken cumulus should still read: ${(s.hi - s.lo).toFixed(3)}`);
  // A low warm sun leaves the sky blue overhead and orange along the horizon.
  const zen = w.sky.uniforms.uZenith.value;
  const hor = w.sky.uniforms.uHorizon.value;
  assert.ok(zen.b > zen.r * 2, `zenith should stay blue, got ${zen.r},${zen.g},${zen.b}`);
  assert.ok(hor.r > hor.b, `horizon should stay warm, got ${hor.r},${hor.g},${hor.b}`);
  disposeWeather(w);
});

test("the dome arrives at the fog colour on the horizon line, at every sun angle", () => {
  const out = [0, 0, 0];
  for (const p of WEATHER_PRESETS) {
    const { w, camera } = rig(p.id);
    for (let elevDeg = -20; elevDeg <= 80; elevDeg += 5) {
      stepWeather(w, camera, 1 / 60);
      // A lightning flash lifts the whole dome including the horizon band, and
      // lifts the terrain with it through the fill and ambient. It is not a
      // seam, but it is an offset, so measure between strikes.
      w.lightning.flash = 0;
      setSunElevation(w, elevDeg * DEG, 200 * DEG);

      // The terrain fades to w.fog.color and the dome has to end up there too,
      // or the two draw a line between them. Both sides go through the one tone
      // curve now, so equal radiance here is equal pixels on the screen.
      const fogU = w.sky.uniforms.uFogColour.value;
      assert.ok(Math.abs(fogU.r - w.fog.color.r) < 1e-9
        && Math.abs(fogU.g - w.fog.color.g) < 1e-9
        && Math.abs(fogU.b - w.fog.color.b) < 1e-9,
        `${p.id} at ${elevDeg} deg: the dome's haze and the scene fog are different colours`);

      domeRadiance(w, 0, 0, 1, 0, 0, out);
      for (let i = 0; i < 3; i += 1) {
        const f = [fogU.r, fogU.g, fogU.b][i];
        assert.ok(Math.abs(out[i] - f) < 1e-6,
          `${p.id} at ${elevDeg} deg: dome ${out[i]} vs fog ${f} on the horizon line`);
      }

      // And the band above it has to be a haze rather than a step: the dome a
      // few degrees up may not be a different order of brightness from the fog
      // it stands on. Measured away from the sun, whose own glare on the horizon
      // is a light source rather than a seam.
      const sun = w.sky.uniforms.uSunDir.value;
      const fogL = Math.max(lum3([fogU.r, fogU.g, fogU.b]), 1e-6);
      const upL = domeLum(w, 6 * DEG, Math.atan2(sun.x, sun.z) + Math.PI);
      assert.ok(upL / fogL > 0.5 && upL / fogL < 2.4,
        `${p.id} at ${elevDeg} deg: ${(upL / fogL).toFixed(2)}x step from the fog to the sky above it`);
    }
    disposeWeather(w);
  }
});

function fogFraction(w, distance) {
  const t = (distance - w.fog.near) / (w.fog.far - w.fog.near);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

test("aerial perspective actually reaches the terrain", () => {
  const { w, camera } = rig("overcast");
  for (const p of WEATHER_PRESETS) {
    setWeather(w, p.id, 0);
    stepWeather(w, camera, 1 / 60);
    const vis = w.current.visibility;
    assert.ok(w.fog.far > w.fog.near && w.fog.near >= 0, `${p.id}: fog ${w.fog.near}..${w.fog.far}`);
    // Visibility is a contrast threshold, not a draw distance: the ramp finishes
    // well inside it, or a ridge far short of the sight-line still stands at
    // full albedo against the sky. The 145 is the white-out floor.
    assert.ok(w.fog.far <= vis * 0.55 || w.fog.far <= 145,
      `${p.id}: fog ends at ${w.fog.far.toFixed(0)} m for ${vis} m of visibility`);
    if (vis > 400) {
      // A quarter of the sight-line is already well hazed — the part the old
      // ramp missed, and the part a two-kilometre ridge lives in.
      const quarter = fogFraction(w, vis * 0.25);
      assert.ok(quarter > 0.4, `${p.id}: only ${quarter.toFixed(2)} fogged at a quarter of ${vis} m`);
      // But the near field stays clear, or the car drives inside its own fog.
      assert.ok(fogFraction(w, 40) < 0.35,
        `${p.id}: ${fogFraction(w, 40).toFixed(2)} fogged at 40 m`);
    }
  }
  // The measured case: a ridge two kilometres out on an overcast stage came back
  // at 81,89,76 against a 204,203,210 sky. It has to be more than half gone.
  setWeather(w, "overcast", 0);
  stepWeather(w, camera, 1 / 60);
  assert.ok(fogFraction(w, 2000) > 0.45,
    `a 2 km ridge is only ${fogFraction(w, 2000).toFixed(2)} hazed on an overcast stage`);
  disposeWeather(w);
});

// A three.js stand-in that keeps a live set of everything the rig allocates on
// the GPU and takes each one out again when it is disposed. Every stage builds a
// rig, so one missed dispose is a leak per race, not a leak per session.
function countingThree() {
  const live = new Set();
  // A resource freed a second time is a defect of its own — three re-fires the
  // dispose event and the renderer goes looking for a handle it has already
  // deleted — so the stub records it rather than shrugging.
  const doubles = [];
  // The vendored three is minified, so a class carries no useful name of its
  // own — label each one here or a failure reports a leak of "Zd".
  const track = (Base, label) => class extends Base {
    constructor(...args) {
      super(...args);
      live.add(this);
    }

    dispose() {
      if (!live.delete(this)) doubles.push(label);
      super.dispose();
    }
  };
  const stub = {
    ...THREE,
    SphereGeometry: track(THREE.SphereGeometry, "SphereGeometry"),
    InstancedBufferGeometry: track(THREE.InstancedBufferGeometry, "InstancedBufferGeometry"),
    ShaderMaterial: track(THREE.ShaderMaterial, "ShaderMaterial"),
    DataTexture: track(THREE.DataTexture, "DataTexture"),
    // A shadow map is a render target the renderer builds lazily and nothing
    // else ever frees; track the shadow rather than the light, because the
    // shadow is what owns it.
    DirectionalLight: class extends THREE.DirectionalLight {
      constructor(...args) {
        super(...args);
        const shadow = this.shadow;
        live.add(shadow);
        const inner = shadow.dispose.bind(shadow);
        shadow.dispose = () => {
          if (!live.delete(shadow)) doubles.push("DirectionalLightShadow");
          inner();
        };
      }
    },
  };
  return { stub, live, doubles };
}

test("fifty stages of weather leak nothing, and disposing twice is safe", () => {
  const { stub, live, doubles } = countingThree();
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 5000);
  let peak = 0;
  for (let i = 0; i < 50; i += 1) {
    const scene = new THREE.Scene();
    const preset = WEATHER_PRESETS[i % WEATHER_PRESETS.length];
    const w = createWeather(stub, scene, preset.id, RIG);
    for (let f = 0; f < 5; f += 1) stepWeather(w, camera, 1 / 60);
    peak = Math.max(peak, live.size);
    assert.ok(live.size >= 7,
      `stage ${i}: only ${live.size} tracked resources — the stub is not seeing the whole rig`);
    assert.equal(scene.children.length, 1);

    disposeWeather(w);
    assert.equal(live.size, 0, `stage ${i} (${preset.id}) leaked ${live.size} GPU resources`);
    assert.equal(scene.children.length, 0, `stage ${i} left the rig in the scene`);
    assert.equal(scene.fog, null, `stage ${i} left its fog on the scene`);
    assert.equal(w.root.children.length, 0, `stage ${i} left the rig holding its children`);

    // Twice, because whoever ends a stage should not have to know whether the
    // one before it already did — and the second call has to be a no-op rather
    // than a second free of everything.
    disposeWeather(w);
    assert.equal(live.size, 0);
    assert.deepEqual(doubles, [], `stage ${i} freed ${doubles.join(", ")} twice`);
  }
  assert.ok(peak >= 7, `the stub never saw a whole rig, peak was ${peak}`);
});

// ---- precipitation: what a drop and a flake actually put on the screen
//
// A precipitation system can be geometrically perfect and draw nothing at all.
// This one did. The streak quad was built on a left-handed basis, came out wound
// clockwise, and every drop in the game was back-face culled: twenty-two
// thousand triangles a frame and not one pixel, so a downpour photographed as
// clear air with a wet road under it. Nothing downstream catches that — the
// instance count is right, the uniforms are right, the geometry is submitted —
// so the two things that actually decide whether rain reaches the screen are
// mirrored here: the winding, and the contrast once the composite has had it.
//
// The mirrors are anchored on the literal source of the lines they reproduce,
// the same way SKY_ANCHORS anchors the dome.

const PRECIP_ANCHORS = [
  ["rainVert", "const float RAIN_MIN_ANGLE = 0.0016;"],
  ["rainVert", "vec2 sv = vel.xy * depth + mv.xy * vel.z;"],
  ["rainVert", "vec2 perp = vec2(d.y, -d.x);"],
  ["rainVert", "float width = max(uWidth, depth * RAIN_MIN_ANGLE);"],
  ["rainVert",
    "float len = max(uLength * (0.55 + 0.9 * iRand.x) * svl / (depth * max(length(vel), 1e-4)), width);"],
  ["rainVert", "mv.xy += d * (position.y * len) + perp * (position.x * width);"],
  ["rainVert", "float haze = mix(1.0, RAIN_HAZE_KEEP, smoothstep(RAIN_HAZE_NEAR, RAIN_HAZE_FAR, depth));"],
  ["rainFrag", "float across = smoothstep(0.0, 0.55, 1.0 - abs(vUv.x * 2.0 - 1.0));"],
  ["rainFrag", "float along = smoothstep(0.0, 0.42, vUv.y) * (1.0 - smoothstep(0.58, 1.0, vUv.y));"],
  ["snowVert", "const float SNOW_MIN_ANGLE = 0.0024;"],
  ["snowVert", "float grade = iRand.y * iRand.y * iRand.y;"],
  ["snowVert", "float size = uSize * (0.22 + 2.1 * grade);"],
  ["snowVert", "float angle = size / depth;"],
  ["snowVert", "float drawn = max(size, depth * SNOW_MIN_ANGLE);"],
  ["snowVert", "float soft = min(1.0, (SNOW_SOFT_ANGLE * SNOW_SOFT_ANGLE) / (angle * angle));"],
  ["snowVert", "float keep = soft * (size * size) / (drawn * drawn);"],
  ["snowVert", "vec2 q = vec2(position.x * face, position.y) * drawn;"],
  ["snowFrag", "float a = (exp(-r * 4.2) - 0.0150) * 1.0152 * vAlpha;"],
];

test("the precipitation mirrors below are still mirrors of the shaders above", () => {
  for (const [key, line] of PRECIP_ANCHORS) {
    assert.ok(PRECIP_SHADERS[key].includes(line),
      `${key} no longer contains "${line}" — update the mirror in this file to match`);
  }
});

// Both angular floors are read out of the shaders rather than copied, so slack
// given there shows up here as the pixels it costs. A duplicated constant can
// only ever agree with the copy of itself.
function shaderConst(key, name) {
  const m = new RegExp(`const float ${name} = ([0-9.eE+-]+);`).exec(PRECIP_SHADERS[key]);
  assert.ok(m, `${key} no longer declares ${name}`);
  return Number(m[1]);
}

const RAIN_MIN_ANGLE = shaderConst("rainVert", "RAIN_MIN_ANGLE");
const SNOW_MIN_ANGLE = shaderConst("snowVert", "SNOW_MIN_ANGLE");
const SNOW_SOFT_ANGLE = shaderConst("snowVert", "SNOW_SOFT_ANGLE");

// The quad corners the geometry hands the shader, in the order its index buffer
// walks them, so the shoelace of that ring is the winding the rasteriser is
// given.
const QUAD = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

// Read the streak's second basis vector out of the shader instead of copying it
// here. A mirror that carries its own copy of the line under test can only agree
// with itself: the defect was one sign in this expression, and a hand-written
// copy of the fixed sign would have gone on passing while the game drew nothing.
// The grammar is deliberately narrow — two signed components of d — so anything
// else fails here rather than being quietly mismodelled.
function shaderPerp(d) {
  const m = /vec2 perp = vec2\(\s*(-?)d\.([xy])\s*,\s*(-?)d\.([xy])\s*\)\s*;/.exec(PRECIP_SHADERS.rainVert);
  assert.ok(m, "RAIN_VERT no longer builds perp as a pair of signed components of d");
  const pick = (sign, axis) => (sign === "-" ? -1 : 1) * (axis === "x" ? d[0] : d[1]);
  return [pick(m[1], m[2]), pick(m[3], m[4])];
}

// RAIN_VERT's offset in view-space metres: d is the drop's own screen-space
// direction of travel written back as a unit view-space vector, perp is its
// partner.
function rainQuadArea(dx, dy, len, width) {
  const dl = Math.hypot(dx, dy);
  const d = dl > 1e-4 ? [dx / dl, dy / dl] : [0, -1];
  const perp = shaderPerp(d);
  const pts = QUAD.map(([px, py]) => [
    d[0] * (py * len) + perp[0] * (px * width),
    d[1] * (py * len) + perp[1] * (px * width),
  ]);
  let a = 0;
  for (let i = 0; i < 4; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    a += x0 * y1 - x1 * y0;
  }
  return a * 0.5;
}

test("a rain streak's quad is wound the way the rasteriser needs it", () => {
  // Positive is counter-clockwise, which is front facing under three's default
  // frontFace. Measured rather than assumed: on the headless stack the same
  // geometry with a negative area draws exactly nothing where a positive one
  // draws, which is the whole defect. The streak direction sweeps the full
  // circle because it is a view-space quantity set by the wind, the fall speed
  // and the car — every direction of it is reachable in normal play.
  for (let i = 0; i < 32; i += 1) {
    const a = (i / 32) * Math.PI * 2;
    const area = rainQuadArea(Math.cos(a), Math.sin(a), 0.7, 0.012);
    assert.ok(area > 0,
      `streak at ${(a / DEG).toFixed(0)} deg is wound clockwise (signed area ${area.toExponential(2)})`
      + " — the rasteriser culls it and the rain is invisible");
  }
  // The degenerate apparent velocity takes the fallback branch, and it has to be
  // wound the same way or a car sitting still in dead air loses its rain.
  assert.ok(rainQuadArea(0, 0, 0.7, 0.012) > 0, "the still-air fallback is wound backwards");
});

test("neither precipitation billboard can be culled by which way it happens to face", () => {
  // Belt and braces for the above. Both quads are built in view space out of a
  // view-dependent basis, so which face is toward the camera carries no
  // information at all and must not be allowed to decide whether they draw.
  const { w } = rig("heavy-rain");
  assert.equal(w.rain.material.side, THREE.DoubleSide, "the rain quad is single sided");
  assert.equal(w.snow.material.side, THREE.DoubleSide, "the flake quad is single sided");
  assert.equal(w.rain.material.depthWrite, false, "rain must not write depth");
  assert.equal(w.snow.material.depthWrite, false, "snow must not write depth");
  disposeWeather(w);
});

// 720 lines over the vertical field the game runs at, for turning a world-space
// size at a depth into pixels.
const PX_PER_RAD = 720 / (2 * Math.tan(21.3 * DEG));

const RAIN_HAZE_NEAR = shaderConst("rainVert", "RAIN_HAZE_NEAR");
const RAIN_HAZE_FAR = shaderConst("rainVert", "RAIN_HAZE_FAR");
const RAIN_HAZE_KEEP = shaderConst("rainVert", "RAIN_HAZE_KEEP");

// One particle's peak alpha where its profile is fullest, taken from the rig's
// own uniforms rather than from a copy of the preset: mid-field, so neither the
// shell fade nor the near fade is in play, and the median instance random.
function rainPeakAlpha(w, depth) {
  const u = w.rain.uniforms;
  const width = Math.max(u.uWidth.value, depth * RAIN_MIN_ANGLE);
  const haze = lerp(1, RAIN_HAZE_KEEP, ss(RAIN_HAZE_NEAR, RAIN_HAZE_FAR, depth));
  return { alpha: u.uOpacity.value * (u.uWidth.value / width) * haze * 0.775, width };
}

// One streak's screen geometry: where the drop sits in view space decides which
// way it is drawn and how long it comes out, which is the whole of the change
// this mirrors. `mvx`/`mvy` are the drop's view-space offset from the optical
// axis at `depth`; `vel` is the apparent velocity already in view space.
// Returned length is in *screen* units — the view-space offset over the depth it
// is drawn at — because a streak twice as long twice as far away is the same
// streak, and comparing the view-space figures would say otherwise.
function rainStreak(u, vel, mvx, mvy, depth, rand) {
  const sv = [vel[0] * depth + mvx * vel[2], vel[1] * depth + mvy * vel[2]];
  const svl = Math.hypot(sv[0], sv[1]);
  const d = svl > 1e-6 ? [sv[0] / svl, sv[1] / svl] : [0, -1];
  const width = Math.max(u.uWidth.value, depth * RAIN_MIN_ANGLE);
  const vl = Math.max(Math.hypot(vel[0], vel[1], vel[2]), 1e-4);
  const len = Math.max(u.uLength.value * (0.55 + 0.9 * rand) * svl / (depth * vl), width);
  return { dir: d, angle: Math.atan2(d[1], d[0]), screenLen: len / depth };
}

function snowPeakAlpha(w, depth, grade) {
  const u = w.snow.uniforms;
  const size = u.uSize.value * (0.22 + 2.1 * grade);
  const angle = size / depth;
  const drawn = Math.max(size, depth * SNOW_MIN_ANGLE);
  const soft = Math.min(1, (SNOW_SOFT_ANGLE * SNOW_SOFT_ANGLE) / (angle * angle));
  return { alpha: u.uOpacity.value * soft * (size * size) / (drawn * drawn), size, drawn, soft };
}

// A particle of linear colour `colour` at peak alpha `a`, laid over a background
// of linear radiance `bg`, in 8-bit levels of difference through the composite.
function precipDelta(colour, a, bg, exposure) {
  const c = lum3([colour.r, colour.g, colour.b]);
  const over = bg * (1 - a) + c * a;
  return encodeSrgb8(aces(over * exposure)) - encodeSrgb8(aces(bg * exposure));
}

// The shipped pools and boxes, not the suite's small ones: how many particles a
// preset puts in a cubic metre is one of the things under test.
function precipRig(id, speed) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 5000);
  const w = createWeather(THREE, scene, id, { cloudTextureSize: 48, seed: "test-precip" });
  for (let i = 0; i < 4; i += 1) {
    setWeatherMotion(w, 0, 0, speed);
    stepWeather(w, camera, 1 / 60);
  }
  return w;
}

test("rain reads as rain rather than as a set of ruled white lines", () => {
  // Two bands, both in output levels. Below the floor a drop is a rounding error
  // against the road and the heaviest weather in the game is clear air; above
  // the ceiling it is a hard white bar, which is what a peak alpha of 0.39 over
  // a colour brighter than the sky gave — a hundred and one levels over a dark
  // bank. A drop is a lens on the sky, so against a bright overcast it is
  // allowed to read a little dark; what it may not do is punch a hole in it.
  for (const id of ["light-rain", "heavy-rain", "thunderstorm", "night-rain", "hill-fog"]) {
    const w = precipRig(id, 25);
    const u = w.rain.uniforms;
    const { alpha, width } = rainPeakAlpha(w, 8);
    const dark = precipDelta(u.uColour.value, alpha, 0.02, w.current.exposure);
    const bright = precipDelta(u.uColour.value, alpha, 0.30, w.current.exposure);
    assert.ok(dark >= 12, `${id}: a drop over a dark bank is worth ${dark.toFixed(0)} levels — invisible`);
    assert.ok(dark <= 80, `${id}: a drop over a dark bank is worth ${dark.toFixed(0)} levels — a white line`);
    assert.ok(Math.abs(bright) <= 30,
      `${id}: a drop over a bright sky is worth ${bright.toFixed(0)} levels — a hole in the sky`);
    // And it has to be a streak rather than a bar: a drop is millimetres across
    // and metres long in a fiftieth of a second.
    const wpx = width / 8 * PX_PER_RAD;
    assert.ok(wpx >= 1.0 && wpx <= 3.0, `${id}: a drop at 8 m is ${wpx.toFixed(1)} px wide`);
    assert.ok(u.uLength.value / u.uWidth.value > 15, `${id}: the streak is not long against its width`);
    disposeWeather(w);
  }
});

test("rain has depth in it rather than being a decal over the frame", () => {
  // The complaint this answers: every streak the same length, the same angle and
  // the same weight from the vanishing point to the bonnet, so heavy rain read
  // as a screen effect laid over the image instead of as water the car is
  // driving through. All three come from the same place — the streak direction
  // was taken from the apparent velocity alone, which is one vector for the
  // whole field, and nothing anywhere in the shader knew how far away a drop
  // was except the width floor.
  const w = precipRig("heavy-rain", 30);
  const u = w.rain.uniforms;
  const v = u.uStreakVel.value;
  // precipRig's camera never leaves the origin unrotated, so view space is world
  // space here and the apparent velocity can be read straight off the uniform.
  const vel = [v.x, v.y, v.z];
  assert.ok(vel[2] < -20, `a car at 30 m/s should be closing on the rain, got vz ${vel[2].toFixed(1)}`);

  // Across the frame at one distance. tan(21.3 deg) is the half-field the game
  // runs at, so +-0.39 of the depth is the edge of the picture.
  const depth = 12;
  const edge = Math.tan(21.3 * DEG) * depth;
  const centre = rainStreak(u, vel, 0, 0, depth, 0.5);
  const left = rainStreak(u, vel, -edge * 1.6, 0, depth, 0.5);
  const right = rainStreak(u, vel, edge * 1.6, 0, depth, 0.5);
  const spread = Math.abs(wrapAngle(left.angle - right.angle));
  assert.ok(spread > 25 * DEG,
    `streaks at opposite edges of the frame differ by ${(spread / DEG).toFixed(1)} deg `
    + "— that is one ruled angle over the whole picture, not perspective");
  assert.ok(right.screenLen > centre.screenLen * 1.5,
    `a streak at the frame edge is ${right.screenLen.toFixed(4)} against ${centre.screenLen.toFixed(4)} `
    + "near the point the rain is heading for — they should not be the same streak");

  // And prove that is the closing speed doing it rather than the arithmetic
  // wandering: with nothing coming at the camera there is no vanishing point,
  // and a drop's position must then buy it no angle at all.
  const flat = [vel[0], vel[1], 0];
  const flatL = rainStreak(u, flat, -edge * 1.6, 0, depth, 0.5);
  const flatR = rainStreak(u, flat, edge * 1.6, 0, depth, 0.5);
  assert.ok(Math.abs(wrapAngle(flatL.angle - flatR.angle)) < 1e-9,
    "with no closing speed the field has no vanishing point and every streak is parallel");

  // Along the frame. A drop on the bonnet and a drop at the far wall of the box
  // may not arrive at the same weight, and the far one may not disappear either.
  const near = rainPeakAlpha(w, 3).alpha;
  const far = rainPeakAlpha(w, 20).alpha;
  assert.ok(far < near * 0.45,
    `a drop at 20 m keeps ${(far / near * 100).toFixed(0)}% of a drop at 3 m — the field is flat in depth`);
  assert.ok(far > near * 0.08,
    `a drop at 20 m keeps only ${(far / near * 100).toFixed(0)}% — the far field has gone`);
  disposeWeather(w);
});

test("a flake stays sampleable at the distance it is drawn at, without gaining light", () => {
  // Half the field is finer than a third of the mean by design, and a
  // three-centimetre flake fifteen metres out is under two pixels: with no floor
  // on the angle it subtends the rasteriser misses most of them, and light snow
  // comes back as a dozen specks. The floor may only widen a flake if it dims it
  // by exactly the area it gained.
  for (const id of ["light-snow", "blizzard"]) {
    const w = precipRig(id, 20);
    const u = w.snow.uniforms;
    for (const depth of [12, 25, 40]) {
      const { alpha, size, drawn, soft } = snowPeakAlpha(w, depth, 0.125);
      const px = drawn / depth * PX_PER_RAD;
      assert.ok(px >= 2.0, `${id}: the median flake at ${depth} m is ${px.toFixed(2)} px across`);
      assert.equal(soft, 1, `${id}: a flake at ${depth} m is being treated as out of focus`);
      const gained = (alpha * drawn * drawn) / (u.uOpacity.value * size * size);
      assert.ok(Math.abs(gained - 1) < 1e-6,
        `${id}: widening a flake at ${depth} m changed the light it carries by ${((gained - 1) * 100).toFixed(1)}%`);
    }
    // A flake close enough to resolve on its own is never inflated.
    const near = snowPeakAlpha(w, 2, 0.125);
    assert.equal(near.drawn, near.size, `${id}: the floor is touching a flake two metres away`);
    // Bright, but a Gaussian core over a mostly empty disc: the scene has to
    // come through the flake rather than be replaced by it.
    const over = precipDelta(u.uColour.value, near.alpha, 0.06, w.current.exposure);
    assert.ok(over > 40, `${id}: a near flake is worth only ${over.toFixed(0)} levels`);
    assert.ok(u.uOpacity.value <= 0.85, `${id}: a flake at ${u.uOpacity.value.toFixed(2)} peak alpha is a hole`);

    // The other end. A flake a metre and a half off the lens covers a patch of
    // screen, and at full alpha over a bright sky it clips, blooms and hangs
    // there as an opaque white blob — a sprite, which is the one thing a
    // snowfall must not look like. Its light is fixed, so covering more screen
    // has to cost it per pixel.
    const close = snowPeakAlpha(w, 1.5, 0.9);
    const closePx = close.drawn / 1.5 * PX_PER_RAD;
    assert.ok(closePx > 12, `${id}: the biggest near flake is only ${closePx.toFixed(0)} px — nothing to blow out`);
    assert.ok(close.soft < 0.6,
      `${id}: a ${closePx.toFixed(0)} px flake keeps ${(close.soft * 100).toFixed(0)}% of its alpha`);
    const blob = precipDelta(u.uColour.value, close.alpha, 0.45, w.current.exposure);
    assert.ok(blob < 26,
      `${id}: a near flake over a bright sky is worth ${blob.toFixed(0)} levels — that is a white blob`);
    disposeWeather(w);
  }
});

test("a flake reads against both of the things it is seen against", () => {
  // What this replaces measured nothing. Its `dim` was luminance(uColour), and
  // updatePrecipitation sets uColour to precipColour scaled so that its
  // luminance IS luminance(_hazeCol) — so `dim <= haze` and `dim >= haze * 0.85`
  // were the line under test written down twice, and the third assertion was the
  // same identity applied to uSkyColour. All three passed on a blizzard in which
  // a fixed 420x220 patch of sky held ONE resolvable flake, counted on a real
  // frame by hiding the field and diffing, three capture pairs against a dither
  // floor of zero. The same patch holds twenty-two now.
  //
  // Measured here instead: one flake, at the peak alpha the field actually runs
  // at, composited over each of the two backgrounds a driver sees it against, in
  // 8-bit levels of difference. Neither background is the flake's own number.
  // The sky comes from the dome mirror at the elevation a chase camera looks at;
  // the snow comes from the light rig on the surface these two stages are made
  // of. A flake that goes out fails against both; one that clips fails the
  // ceiling.
  for (const id of ["light-snow", "blizzard"]) {
    const w = precipRig(id, 20);
    const u = w.snow.uniforms;
    const away = wrapAngle(presetById(id).sunAzimuth + Math.PI);
    const sky = domeLum(w, 8 * DEG, away);
    const snow = groundRadiance(totalIrradiance(w), SNOW_ALBEDO);
    // The median flake — grade is iRand.y cubed on a uniform, so half the field
    // is finer than this — in the near field where a snowfall is read.
    const { alpha } = snowPeakAlpha(w, 8, 0.125);
    const overSky = precipDelta(u.uColour.value, alpha, sky, w.current.exposure);
    const overSnow = precipDelta(u.uColour.value, alpha, snow, w.current.exposure);

    // The floor is where the eye stops finding it. Swept through the shipped
    // code with nothing else touched, a flake at 1.0x the horizon airlight — the
    // figure the hollow assertions above locked in — is worth -1.5 levels
    // against a blizzard sky and -0.1 against light snow's: darker than its own
    // background, which is why the frame had none. 1.15x gives 3.6 and 4.9 and
    // is still nothing; 1.3x gives 7.7 and 9.4.
    assert.ok(overSky >= 6,
      `${id}: a flake against the sky it falls through is worth ${overSky.toFixed(1)} levels `
      + "— that is a snowfall you cannot see");
    // And the ceiling is where it stops being a veil. The 1.9x this replaced
    // measures 19.1 and 23.0 here and shipped as a field of hard white chips
    // with a one-pixel edge, because at that level the top of a flake's Gaussian
    // lands past the end of the ACES shoulder and flattens.
    assert.ok(overSky <= 18,
      `${id}: a flake against the sky is worth ${overSky.toFixed(1)} levels — that is a chip, `
      + "not a flake");
    // Against the ground it falls over, which on both of these stages is snow.
    assert.ok(overSnow >= 12,
      `${id}: a flake against lit snow is worth only ${overSnow.toFixed(1)} levels`);

    // SNOW_FRAG mixes towards uSkyColour as vShade falls and vShade bottoms out
    // at 0.55, so this is the brightest flake the field can contain. It has to
    // be a spread upwards: set below uColour it would darken the brightest
    // flakes in the field, which is what a bright end riding on the raw haze
    // would have done once uColour came off it.
    const end = u.uSkyColour.value;
    const c = u.uColour.value;
    const brightest = {
      r: 0.45 * end.r + 0.55 * c.r,
      g: 0.45 * end.g + 0.55 * c.g,
      b: 0.45 * end.b + 0.55 * c.b,
    };
    const highOverSky = precipDelta(brightest, alpha, sky, w.current.exposure);
    assert.ok(highOverSky > overSky,
      `${id}: the field's bright end is worth ${highOverSky.toFixed(1)} levels against the sky `
      + `and its base ${overSky.toFixed(1)} — the spread runs the wrong way`);
    assert.ok(highOverSky <= 28,
      `${id}: the brightest flake in the field is worth ${highOverSky.toFixed(1)} levels`);
    disposeWeather(w);
  }
});

test("how hard it is falling is carried by the count, not by the per-particle alpha", () => {
  // Both scaled with the rate, so the two multiplied: a light shower came out a
  // quarter as visible as it should be while a downpour came out a wall. The
  // count is the one that should carry it — one drop looks much the same however
  // many of its neighbours there are.
  for (const [kind, lightId, heavyId, speed] of [
    ["rain", "light-rain", "heavy-rain", 25],
    ["snow", "light-snow", "blizzard", 20],
  ]) {
    const light = precipRig(lightId, speed);
    const heavy = precipRig(heavyId, speed);
    const lo = light[kind];
    const hi = heavy[kind];
    const countRatio = hi.count / lo.count;
    const alphaRatio = hi.uniforms.uOpacity.value / lo.uniforms.uOpacity.value;
    assert.ok(countRatio > 2.4,
      `${kind}: a downpour draws only ${countRatio.toFixed(2)}x the particles of a shower`);
    assert.ok(alphaRatio < 1.7,
      `${kind}: per-particle alpha still scales with the rate (${alphaRatio.toFixed(2)}x) — the fade is squared`);
    // And a light shower has to be a field rather than a scattering: particles
    // per cubic metre of the pool's own box is what a driver sees.
    const box = lo.uniforms.uBox.value;
    const density = lo.count / (box.x * box.y * box.z);
    assert.ok(density > 0.25,
      `${lightId}: ${density.toFixed(3)} particles per cubic metre is not weather, it is confetti`);
    disposeWeather(light);
    disposeWeather(heavy);
  }
});

// ---- night
//
// What a patch of ground away from the lamps comes back as, in 8-bit levels,
// through the same exposure/ACES/sRGB the composite runs. One model, the one
// groundIrradiance builds above: a second copy of it here could only ever agree
// with itself.
const NIGHT_ALBEDO = surfaceProps(SURFACE.GRAVEL).albedo;

function unlitGroundPixel(w, albedo) {
  const { direct, diffuse } = groundIrradiance(w);
  const total = [direct[0] + diffuse[0], direct[1] + diffuse[1], direct[2] + diffuse[2]];
  return groundPixel(total, albedo, w.current.exposure);
}

test("a night stage is dark on the ground and still a sky overhead", () => {
  // The measure that matters is the gap, not either end. At a moon of 3.2 into
  // an exposure of 2.3 the ground came back brighter than the sky above it,
  // which is a description of dusk; halving that left unlit gravel at 52 against
  // a sky of 71 — bright enough to read every bank in the frame without the
  // lamps, and still not a night. What makes headlights worth having is ground
  // far under the sky it stands against.
  const { w, camera } = rig("night-clear");
  stepWeather(w, camera, 1 / 60);
  const ground = unlitGroundPixel(w, NIGHT_ALBEDO);
  const skyLow = skyPixelLum(w, 10 * DEG, 90 * DEG);
  const skyHigh = skyPixelLum(w, 45 * DEG, 90 * DEG);
  assert.ok(ground <= 34,
    `unlit gravel comes out at ${ground.toFixed(1)} — a night stage away from the lamps is not that bright`);
  // Not black either: the horizon, the sky and falling snow all have to read.
  assert.ok(skyLow >= 50, `the night horizon is at ${skyLow.toFixed(1)} — nothing to see against`);
  assert.ok(skyHigh >= 25, `the night zenith is at ${skyHigh.toFixed(1)}`);
  assert.ok(skyLow / Math.max(ground, 1) >= 2.0,
    `sky ${skyLow.toFixed(1)} over ground ${ground.toFixed(1)} is a dusk, not a night`);
  // The moon still has to shape a bank rather than the flat terms greying it: a
  // directional keeps the lit side of a slope, a hemisphere only lifts it.
  const L = w.lights;
  const flat = L.fill.intensity * lum3([L.fill.color.r, L.fill.color.g, L.fill.color.b])
    + L.ambient.intensity * lum3([L.ambient.color.r, L.ambient.color.g, L.ambient.color.b]);
  const moon = L.moon.intensity * lum3([L.moon.color.r, L.moon.color.g, L.moon.color.b]);
  assert.ok(moon > flat * 2, `the flat fill (${flat.toFixed(4)}) is doing the moon's job (${moon.toFixed(4)})`);
  // And the headlights still have to come on, which is decided by the sky and
  // the sun rather than by any of the above.
  assert.equal(w.metrics.headlights, true, "a clear night must call for headlights");
  disposeWeather(w);
});

// The gap that let a threefold change in the dome's radiance pass all
// forty-two of the assertions above. Every one of them measured a ratio, a
// monotonicity or a relationship, and the sky can be a flat white ceiling while
// satisfying all three — which is exactly what it was: hard noon rendered
// (210,216,229) at the top of the frame and (233,233,238) near the horizon,
// fifteen levels of variation across the whole band, in every daylight preset.
//
// Two things this test does that the others did not. It measures the OUTPUT
// pixel, through the same exposure, ACES and sRGB the composite applies. And it
// samples the band the player can actually see: the chase camera's vertical
// field of view is 40 degrees and it looks slightly down, so nothing above about
// twenty degrees of elevation is ever drawn. A sky assertion that samples the
// zenith is measuring a direction the game never puts on screen — which is how
// a near-neutral horizon tint carrying 2.3x the zenith's weight went unnoticed.
test("a blizzard is a white-out with the road still in it", () => {
  // "White in every direction, including down" is the preset's brief and it was
  // being taken too literally: driven to a stop on the ice stage and
  // photographed with the snowfall hidden, the sky eight to forty-four rows
  // above the horizon measured 208.9 and the ground the same distance below it
  // 205.4 — three and a half levels, no horizon — while the verge beside the
  // road at 20 m stood at 194.0 against a road of 221.6. The same frame now
  // reads 189.8 against 184.3, and 162.8 against 203.6.
  //
  // The cause was where the picture sat on the curve, not what colour it was.
  // Snow returns 0.84 of what falls on it, so lit snow is a sixth below the sky
  // lighting it whatever the exposure — but at an exposure of 1.0 the sky landed
  // at 220/255, on the last stretch of the ACES shoulder, and a sixth was worth
  // almost nothing there. The two are measured here at the two ends the mirror
  // can reach honestly: the dome just above the horizon, and unfogged lit snow
  // under the whole rig.
  const { w, camera } = rig("blizzard");
  stepWeather(w, camera, 1 / 60);
  w.lightning.flash = 0;
  const away = wrapAngle(presetById("blizzard").sunAzimuth + Math.PI);
  const sky = skyPixelLum(w, 2 * DEG, away);
  const ground = groundPixel(totalIrradiance(w), SNOW_ALBEDO, w.current.exposure);

  // 37.3 levels before, 60.9 after. Both ends move, but not together: the sky is
  // so far up the shoulder that dropping the exposure barely touches it (220.2
  // to 206.3) while the ground it has to be told apart from falls 182.9 to
  // 145.3. That asymmetry is the whole of the fix.
  assert.ok(sky - ground >= 50,
    `a blizzard's lit snow reads ${ground.toFixed(0)} under a sky of ${sky.toFixed(0)} `
    + `— ${(sky - ground).toFixed(0)} levels apart, and the road goes with it`);
  // And it is still a white-out. Buying the separation by darkening the sky
  // would satisfy the line above and lose the weather.
  assert.ok(sky >= 185,
    `a blizzard's sky reads ${sky.toFixed(0)} — that is an overcast, not a white-out`);
  assert.ok(sky <= 235,
    `a blizzard's sky reads ${sky.toFixed(0)} — it is clipping`);
  // The snow itself has to stay snow: a white-out floor the car reads as grey is
  // the other way of passing the first line.
  assert.ok(ground >= 120,
    `a blizzard's lit snow reads ${ground.toFixed(0)} — that is not snow`);
  disposeWeather(w);
});

test("the sky the player can actually see is not a white ceiling", () => {
  // Fog and a blizzard ARE a white-out; that is the weather, not a fault.
  const WHITEOUT = new Set(["hill-fog", "blizzard"]);
  const VISIBLE_BAND = [0, 4, 8, 12, 16, 20];

  for (const preset of WEATHER_PRESETS) {
    const { w } = rig(preset);
    // Away from the sun, so this measures the dome and not the disc or its Mie
    // lobe — those are a separate question with a separate answer.
    const away = wrapAngle(preset.sunAzimuth + Math.PI);
    let peak = -1;
    let peakAt = 0;
    for (const deg of VISIBLE_BAND) {
      const l = skyPixelLum(w, (deg * Math.PI) / 180, away);
      if (l > peak) { peak = l; peakAt = deg; }
    }

    if (!WHITEOUT.has(preset.id)) {
      assert.ok(peak <= 214,
        `${preset.id}: the sky peaks at ${peak.toFixed(0)}/255 at ${peakAt} degrees `
        + "— that is a white ceiling, not a sky");
    }
    // The floor matters as much: a sky the treeline cannot be seen against is
    // the failure the night presets were caught by when this was first tried.
    assert.ok(peak >= 12,
      `${preset.id}: the sky peaks at only ${peak.toFixed(0)}/255 — nothing to see against`);
    disposeWeather(w);
  }
});
