// Round 8: the four cars read as real rally cars. A big glasshouse (side glass from the windscreen base to the end of the rear
// quarter glass) and a rear overhang no longer than the front, with the wheels exactly where the physics spec puts them.
// BODY_ROOT=<dir with render/ and core/> measures another tree (used to prove this fails against the round-7 bodies).
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import * as THREE from "../vendor/three.module.min.js";

const root = process.env.BODY_ROOT ? pathToFileURL(resolve(process.env.BODY_ROOT) + "/").href : new URL("../", import.meta.url).href;
const { CARS, CAR_IDS } = await import(root + "core/cars.mjs");
const { dimsFor } = await import(root + "render/cars/profiles.mjs");
const { ghStations } = await import(root + "render/cars/body.mjs");
const { createCarVisual } = await import(root + "render/car.mjs");

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : k === "getImageData" ? () => ({}) : k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true }) }) };

export function measure(id) {
  const spec = CARS[id], d = dimsFor(spec), g = ghStations(d), L = d.zR - d.zF;
  const frontAxle = Math.min(...d.wheels.map((w) => w.z)), rearAxle = Math.max(...d.wheels.map((w) => w.z));
  return { glass: g.tG1 - g.gt0, glassM: (g.tG1 - g.gt0) * L, front: frontAxle - d.zF, rear: d.zR - rearAxle, L };
}

for (const id of CAR_IDS) {
  test(`${id}: big glasshouse, rear overhang no longer than the front`, () => {
    const m = measure(id);
    assert.ok(m.glass >= 0.38, `glasshouse share ${m.glass.toFixed(3)} of body length`);
    assert.ok(m.rear <= m.front, `rear overhang ${m.rear.toFixed(2)} m > front ${m.front.toFixed(2)} m`);
  });
  test(`${id}: wheel meshes sit at the spec axle, track and radius`, () => {
    const spec = CARS[id], a = spec.wheelbase * (1 - spec.weightFront), b = spec.wheelbase - a;
    const car = createCarVisual(THREE, spec, {});
    const found = [];
    car.object3d.traverse((o) => {
      if (o.isGroup && Math.abs(o.position.y - spec.wheelRadius) < 1e-6 && o.children.some((c) => c.isGroup && c.children.length === 2 && c.children.every((m) => m.isMesh))) {
        const tyre = o.children.find((c) => c.isGroup).children[0];
        tyre.geometry.computeBoundingBox();
        found.push({ x: o.position.x, z: o.position.z, r: (tyre.geometry.boundingBox.max.y - tyre.geometry.boundingBox.min.y) / 2 });
      }
    });
    assert.equal(found.length, 4);
    const want = [[-spec.trackFront / 2, -a], [spec.trackFront / 2, -a], [-spec.trackRear / 2, b], [spec.trackRear / 2, b]];
    for (const [x, z] of want) assert.ok(found.some((f) => Math.abs(f.x - x) < 1e-6 && Math.abs(f.z - z) < 1e-6 && Math.abs(f.r - spec.wheelRadius) < 0.01), `no wheel at x ${x} z ${z}`);
    car.dispose();
  });
}
