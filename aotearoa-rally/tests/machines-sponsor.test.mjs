// Round 5: the car sponsor is always "0x4d44 software", one shared constant, no other sponsor text in the car/livery/screens source.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARS, CAR_IDS, SPONSOR } from "../core/cars.mjs";

test("SPONSOR is the exact owner string and every livery of every car carries it", () => {
  assert.equal(SPONSOR, "0x4d44 software");
  for (const id of CAR_IDS) for (const l of CARS[id].liveries) assert.strictEqual(l.sponsor, SPONSOR, `${id} ${l.name}`);
});

test("no old sponsor name survives in the car, livery, screens or car-visual source", () => {
  const old = /ridgeline|cobalt sound|wavecrest|brightcell|frostline|skylink|trailhead|copperfield|greenleaf|goldcrust|longhaul|cinderpot|rimu oil|kowhai tyres|ngaio mutual|manuka parts|tawa freight/i;
  for (const f of ["core/cars.mjs", "render/cars/livery.mjs", "render/car.mjs", "ui/screens.mjs"]) assert.ok(!old.test(readFileSync(new URL(`../${f}`, import.meta.url), "utf8")), f);
});

test("livery text comes only from SPONSOR (no per-livery sponsor field, no literal sponsor list)", () => {
  const src = readFileSync(new URL("../render/cars/livery.mjs", import.meta.url), "utf8");
  assert.ok(!/livery\.sponsor/.test(src) && !/SPONSORS2/.test(src));
});
