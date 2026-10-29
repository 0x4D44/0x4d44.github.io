import test from "node:test";
import assert from "node:assert/strict";
import { parseLaunch, weatherOverride, WEATHERS } from "../core/launch.mjs";

const ctx = { stageIds: ["waitomo", "otago"], carIds: ["huia", "kea"] };
const P = (s) => new URLSearchParams(s);

test("valid launch parameters pass through with no warnings", () => {
  const l = parseLaunch(P("stage=otago&car=kea&weather=fog&quality=high&camera=bonnet"), ctx);
  assert.deepEqual({ ...l }, { stageId: "otago", carId: "kea", weather: "fog", quality: "high", camera: "bonnet", warnings: [] });
});

test("invalid stage, car, weather, quality and camera are dropped with one warning each", () => {
  const l = parseLaunch(P("stage=nope&car=ghost&weather=hail&quality=ultra9&camera=sky"), ctx);
  assert.equal(l.stageId, undefined);
  assert.equal(l.carId, undefined);
  assert.equal(l.weather, undefined);
  assert.equal(l.quality, undefined);
  assert.equal(l.camera, undefined);
  assert.equal(l.warnings.length, 5);
  assert.match(l.warnings[0], /\?stage=nope/);
});

test("prototype-ish values are not valid ids", () => {
  const l = parseLaunch(P("stage=__proto__&car=constructor"), ctx);
  assert.equal(l.stageId, undefined);
  assert.equal(l.carId, undefined);
  assert.equal(l.warnings.length, 2);
});

test("weather override: fog is fog, mist is 0.55, clear is zero intensity, no override keeps the stage default", () => {
  const def = { type: "mist", intensity: 0.25, wetness: 0.05 };
  assert.deepEqual(weatherOverride(def, "fog"), { type: "fog", intensity: 0.9, wetness: 0.3 });
  assert.deepEqual(weatherOverride(def, "mist"), { type: "mist", intensity: 0.55, wetness: 0.3 });
  assert.deepEqual(weatherOverride(def, "clear"), { type: "clear", intensity: 0, wetness: 0 });
  assert.deepEqual(weatherOverride(def, undefined), def);
  assert.deepEqual(weatherOverride(def, "hail"), def);
  assert.deepEqual(weatherOverride(def, "__proto__"), def);
  for (const w of WEATHERS) assert.equal(weatherOverride(def, w).type, w);
  const table = { clear: [0, 0], cloud: [0.5, 0.3], mist: [0.55, 0.3], fog: [0.9, 0.3], rain: [0.8, 0.9], storm: [0.8, 0.9], snow: [0.7, 0.3] };
  for (const [w, [i, wet]] of Object.entries(table)) assert.deepEqual(weatherOverride(def, w), { type: w, intensity: i, wetness: wet }, w);
  assert.ok(weatherOverride(def, "rain").wetness > weatherOverride(def, "snow").wetness);
});
