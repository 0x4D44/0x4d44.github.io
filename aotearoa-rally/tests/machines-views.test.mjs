import test from "node:test";
import assert from "node:assert/strict";
import { eyePoints, dimsFor } from "../render/cars/profiles.mjs";
import { nextShot, carFadeForDistance, distToCarBox } from "../render/camera.mjs";
import { foil, plateProfile } from "../render/cars/body.mjs";
import { makeRng } from "../core/rng.mjs";
import { CARS, CAR_IDS } from "../core/cars.mjs";

test("bonnet eye is centred just inside the windscreen base, low; cockpit eye is the driver's; bumper is in front of the grille", () => {
  for (const id of CAR_IDS) {
    const d = dimsFor(CARS[id]), e = eyePoints(CARS[id]);
    assert.equal(e.bonnet[0], 0, id);
    assert.ok(e.bonnet[2] > d.zAt(d.cabin.t0) && e.bonnet[2] < d.zAt(d.cabin.re), `${id} bonnet eye z inside the cabin`);
    assert.ok(e.bonnet[1] > d.topC(d.cabin.t0) && e.bonnet[1] < d.roof - 0.05, `${id} bonnet eye low: ${e.bonnet[1]}`);
    assert.ok(e.cockpit[0] > 0.2, `${id} driver on the right`);
    assert.ok(e.bumper[2] < d.zF, `${id} bumper eye ahead of the nose`);
  }
});

test("a cinematic / replay never opens on a cockpit shot and replays avoid cabin shots entirely", () => {
  const rng = makeRng("shots");
  for (let i = 0; i < 400; i++) assert.notEqual(nextShot(rng, false, "").type, "cabin");
  for (let i = 0; i < 400; i++) assert.notEqual(nextShot(rng, true, "chase").type, "cabin");
});

test("the car fades out as the lens gets close and is fully visible beyond 1.2 m", () => {
  assert.equal(carFadeForDistance(0), 0);
  assert.equal(carFadeForDistance(1.2), 1);
  assert.ok(carFadeForDistance(0.8) > 0 && carFadeForDistance(0.8) < 1);
  const car = { x: 0, y: 0, z: 0, yaw: 0, hl: 2.5, hw: 1, top: 1.4 };
  assert.equal(distToCarBox({ x: 0, y: 0.5, z: 0 }, car), 0);
  assert.ok(Math.abs(distToCarBox({ x: 0, y: 0.5, z: 6 }, car) - 3.5) < 1e-9);
});

test("aerofoil profiles are closed, finite and thin", () => {
  const f = foil(0.4, 0.1, -0.05, 0.12, 5, 1);
  assert.ok(f.length > 20 && f.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])));
  const zs = f.map((p) => p[0]), ys = f.map((p) => p[1]);
  assert.ok(Math.max(...zs) - Math.min(...zs) < 0.45 && Math.max(...ys) - Math.min(...ys) < 0.2);
  assert.equal(plateProfile(0, 0).length, 7);
});
