// WORLD lane: weather.set accepts every documented type; `clear` removes the stage default haze; `fog` is heavier than `mist`.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { createWeather, fogFactor } from "../render/weather.mjs";

const SU = { uTime: { value: 0 }, uWet: { value: 0 }, uSnow: { value: 0 }, uWindAmp: { value: 0 }, uWind: { value: new THREE.Vector2() }, uFlash: { value: 0 } };
const mk = () => createWeather(THREE, { SU, getCfg: () => ({ rain: 200, snow: 200 }) });
const mistyStage = { weather: { type: "mist", intensity: 0.25, wetness: 0.05 }, windStrength: 0.3 };

test("weather types clear, cloud, mist, fog, rain, storm, snow are accepted and set the matching amounts", () => {
  const w = mk();
  for (const type of ["clear", "cloud", "mist", "fog", "rain", "storm", "snow"]) {
    assert.equal(w.setWeather(mistyStage, { type, intensity: 0.8 }).type, type);
  }
  assert.ok(w.setWeather(mistyStage, { type: "rain", intensity: 0.8 }).rainAmt > 0.5);
  assert.ok(w.setWeather(mistyStage, { type: "snow", intensity: 0.8 }).snowAmt > 0.5);
  assert.ok(w.setWeather(mistyStage, { type: "storm", intensity: 0.5 }).storm);
  assert.ok(w.setWeather(mistyStage, { type: "fog", intensity: 0.8 }).fog > 0.5);
});

test("clear over a misty stage default thins the haze; fog is heavier than mist", () => {
  const w = mk();
  const base = fogFactor(w.setWeather(mistyStage, {}));
  const clear = fogFactor(w.setWeather(mistyStage, { type: "clear", intensity: 0 }));
  const mist = fogFactor(w.setWeather(mistyStage, { type: "mist", intensity: 0.6 }));
  const fog = fogFactor(w.setWeather(mistyStage, { type: "fog", intensity: 0.8 }));
  assert.ok(clear < 1, "clear factor below 1");
  assert.ok(clear < base, "clear thinner than the stage's own mist");
  assert.ok(fog > mist * 1.5, "fog clearly heavier than mist");
  assert.equal(w.setWeather({ weather: { type: "clear" } }, { type: "clear" }).cleared, false);
});
