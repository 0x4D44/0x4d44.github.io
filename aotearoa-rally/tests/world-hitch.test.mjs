// WORLD round 5: main-thread / GPU stall guards that can be proven without a GPU.
// WORLD_BREAK=<name>: ringchurn (1: a fresh ring list per call), farevery (2: far cascade refreshed every frame), nojump (3: a teleport does not refresh it).
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { ringOrder } from "../render/scenery.mjs";
import { createLighting } from "../render/sky.mjs";
import { QUALITY } from "../render/quality.mjs";

const BREAK = process.env.WORLD_BREAK || "";

test("scenery ring order is computed once per radius, nearest first, and is not rebuilt per call", () => {
  const a = ringOrder(17), b = BREAK === "ringchurn" ? ringOrder(18) : ringOrder(17);
  assert.equal(a, b, "same cached object (no per-rebuild allocation)");
  assert.ok(a.n > 800);
  for (let i = 1; i < a.n; i++) assert.ok(a.d2[i] >= a.d2[i - 1], "sorted nearest first");
  assert.equal(a.d2[0], 0);
});

test("far shadow cascade refreshes on a fixed cadence and on a jump, near cascade every frame", () => {
  const scene = new THREE.Scene();
  const lit = createLighting(THREE, scene, () => QUALITY.high);
  const cascade = scene.children.find((o) => o.isDirectionalLight && o.shadow.camera.userData.far);
  lit.setShadowMap(2048, 35, true, true, 200);
  lit.setEnvironment({ sunColor: 0xffffff, sunIntensity: 3, ambient: 0x8899aa, stars: 0 }, new THREE.Vector3(0.3, 0.7, 0.2).normalize());
  const pos = new THREE.Vector3(100, 5, 100);
  const hits = [];
  for (let i = 0; i < 30; i++) {
    pos.x += 0.4;
    cascade.shadow.needsUpdate = false;
    lit.update(pos, 0, 25, 0);
    hits.push(cascade.shadow.needsUpdate);
    if (BREAK === "farevery") cascade.shadow.autoUpdate = true;
  }
  assert.equal(cascade.shadow.autoUpdate, false, "far cascade is manual");
  const n = hits.filter(Boolean).length;
  assert.ok(n >= 8 && n <= 12, `refreshed ${n} of 30 frames`);
  assert.ok(hits.every((h, i) => !h || i === 0 || !hits[i - 1]), "never two refreshes back to back");
  lit.update(pos, 0, 0, 0); // frame 30 is on the cadence; frame 31 is not
  cascade.shadow.needsUpdate = false;
  pos.x += BREAK === "nojump" ? 0.4 : 200;
  lit.update(pos, 0, 0, 0);
  const flagged = cascade.shadow.needsUpdate;
  assert.ok(flagged, "a 200 m jump refreshes the far cascade at once");
});
