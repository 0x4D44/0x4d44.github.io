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
