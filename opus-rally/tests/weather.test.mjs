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
} from "../weather.js";

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

test("sun elevation drives light intensity and sky colour monotonically", () => {
  for (const id of ["clear-dawn", "midday-hard", "night-clear", "overcast"]) {
    const { w } = rig(id);
    let lastKey = -1;
    let lastSky = -1;
    let lastLevel = -1;
    let firstAtZero = null;
    let atSixty = null;
    for (let e = -20; e <= 88; e += 0.5) {
      setSunElevation(w, e * DEG, 180 * DEG);
      const key = w.lights.key.intensity;
      const sky = w.metrics.skyLuminance;
      const level = w.metrics.lightLevel;
      assert.ok(Number.isFinite(key) && key >= 0, `${id}: key intensity ${key} at ${e} deg`);
      assert.ok(Number.isFinite(sky) && sky >= 0, `${id}: sky luminance ${sky} at ${e} deg`);
      assert.ok(key >= lastKey - 1e-12, `${id}: key intensity fell at ${e} deg`);
      assert.ok(sky >= lastSky - 1e-12, `${id}: sky luminance fell at ${e} deg`);
      assert.ok(level >= lastLevel - 1e-12, `${id}: light level fell at ${e} deg`);
      lastKey = key;
      lastSky = sky;
      lastLevel = level;
      if (firstAtZero === null && e >= 0) firstAtZero = { key, sky };
      if (atSixty === null && e >= 60) atSixty = { key, sky };
    }
    // Non-decreasing is not enough — a constant would pass that. Assert the
    // useful part of the arc actually climbs.
    assert.ok(atSixty.key > firstAtZero.key * 1.5 && atSixty.key > 0,
      `${id}: key intensity should climb from horizon to high sun`);
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
