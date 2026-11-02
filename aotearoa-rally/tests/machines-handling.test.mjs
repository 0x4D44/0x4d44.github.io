// Round 9: the Handling setting (Standard / Easy). Default, persistence, the options Easy hands the vehicle, key-steer lock, and the no-record tag.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCareer, vehicleOptionsFor, HANDLING, DEFAULT_OPTIONS } from "../core/career.mjs";
import { createStorage } from "../core/storage.mjs";
import { shapeKeySteer, KEY_STEER } from "../core/input.mjs";
import { CARS } from "../core/cars.mjs";

const spec = CARS.huia;
const mem = () => { const m = new Map(); return createStorage({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }); };
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("handling defaults to Standard and the options table is untouched", () => {
  const c = createCareer({ storage: mem() });
  assert.equal(c.handling, "standard");
  assert.ok(!("handling" in DEFAULT_OPTIONS));
  assert.equal(c.setHandling("bogus"), "standard");
});

test("Easy persists across a save and load", () => {
  const st = mem();
  const a = createCareer({ storage: st });
  a.setHandling("easy"); a.save();
  const b = createCareer({ storage: st }); b.load && b.load();
  assert.equal(b.handling, "easy");
});

test("Easy hands the vehicle full assist and half damage; Standard is unchanged", () => {
  const std = vehicleOptionsFor(spec, null, { steerAssist: 0.5, difficulty: "pro" });
  const easy = vehicleOptionsFor(spec, null, { steerAssist: 0.5, difficulty: "pro", handling: "easy" });
  assert.equal(std.assist, 0.35); assert.equal(std.damageScale, 1);
  assert.equal(easy.assist, HANDLING.easy.assist); assert.ok(easy.assist >= 0.7 - 1e-9);
  assert.equal(easy.damageScale, 0.5);
  assert.equal(vehicleOptionsFor(spec, null, { steerAssist: 0.5, difficulty: "expert", handling: "easy" }).damageScale, 1.35 * 0.5);
  assert.equal(easy.setup.brakeBias, std.setup.brakeBias); // the cars' balance is not touched
});

test("a smaller key-steer lock at speed, and the default call is unchanged", () => {
  const std = shapeKeySteer(0, 1, 45, 1), same = shapeKeySteer(0, 1, 45, 1, KEY_STEER.lockAtSpeed);
  const easy = shapeKeySteer(0, 1, 45, 1, HANDLING.easy.keyLockAtSpeed);
  assert.equal(std, same); assert.ok(easy < std);
});

test("wiring: setting row, pause button, live retune, no-record tag", () => {
  assert.ok(/row\("Handling"/.test(src("ui/screens.mjs")) && /onHandling/.test(src("ui/screens.mjs")));
  const g = src("game.mjs");
  assert.ok(/handling: career\.handling/.test(g) && /!result\.easy/.test(g) && /keyLock = career\.handling/.test(g) && /k === "handling"/.test(g));
  assert.ok(/easy: !!run\.easy/.test(src("core/rules.mjs")));
});
