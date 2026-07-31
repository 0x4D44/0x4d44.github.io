// The geometry plumbing, checked under node.
//
// three.js imports cleanly here — it only reaches for a document when a
// renderer or a canvas texture is made — so the parts of the build that
// are pure geometry can be tested without a GPU.
//
// carveTube is the one that earned a test the hard way: a tunnel drawn as
// a tube INSIDE a closed hill is not a tunnel at all. The bore is hidden
// in solid geometry, and riding into it puts the camera straight through
// the hillside — reported, accurately, as "we crash through the grass".

import test from "node:test";
import assert from "node:assert/strict";

import * as THREE from "../three.module.min.js";
import { carveTube, distanceToPath, mergeParts, part } from "../mesh.js";

// Every triangle centroid in a geometry, as Vector3s.
function centroids(geometry) {
  const position = geometry.attributes.position;
  const out = [];
  for (let t = 0; t + 2 < position.count; t += 3) {
    const c = new THREE.Vector3();
    const corner = new THREE.Vector3();
    for (let k = 0; k < 3; k++) c.add(corner.fromBufferAttribute(position, t + k));
    out.push(c.multiplyScalar(1 / 3));
  }
  return out;
}

test("distanceToPath measures to the nearest segment, not the nearest corner", () => {
  const path = [{ x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
  // Straight above the middle: 5 from the segment, 11.2 from either end.
  assert.ok(Math.abs(distanceToPath(new THREE.Vector3(0, 5, 0), path) - 5) < 1e-6);
  // Off the end: measured from the endpoint.
  assert.ok(Math.abs(distanceToPath(new THREE.Vector3(13, 4, 0), path) - 5) < 1e-6);
  // On the line.
  assert.ok(distanceToPath(new THREE.Vector3(2, 0, 0), path) < 1e-6);
});

test("carveTube cuts a hole right through a solid", () => {
  const hill = new THREE.SphereGeometry(20, 32, 24);
  // A path straight through the middle, out both sides.
  const path = [];
  for (let i = 0; i <= 40; i++) path.push({ x: -30 + i * 1.5, y: 0, z: 0 });
  const radius = 4;

  const before = centroids(hill).filter((c) => distanceToPath(c, path) <= radius).length;
  assert.ok(before > 0, "the test solid was not in the way to begin with");

  const shell = carveTube(hill, path, radius);
  const after = centroids(shell).filter((c) => distanceToPath(c, path) <= radius).length;
  assert.equal(after, 0, `${after} triangles still block the bore`);

  // And it is still a hill: cutting a 4m hole through a 20m sphere must
  // not take most of it away.
  const kept = shell.attributes.position.count / 3;
  const total = centroids(hill).length + before;
  assert.ok(kept > total * 0.5,
    `carving removed ${total - kept} of ${total} triangles — that is a demolition, not a tunnel`);
});

test("carveTube handles indexed geometry too", () => {
  // BoxGeometry is indexed; IcosahedronGeometry is not. Both turn up.
  const box = new THREE.BoxGeometry(20, 20, 20, 8, 8, 8);
  assert.ok(box.index, "BoxGeometry stopped being indexed — the test is checking nothing");
  const path = [{ x: -30, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }];
  const shell = carveTube(box, path, 5);
  assert.equal(
    centroids(shell).filter((c) => distanceToPath(c, path) <= 5).length, 0,
    "an indexed solid was left blocking the bore",
  );
  assert.ok(shell.attributes.position.count > 0, "carving an indexed solid removed everything");
});

test("carveTube leaves a solid alone when the path misses it", () => {
  const blob = new THREE.IcosahedronGeometry(5, 2);
  const faces = centroids(blob).length;
  const path = [{ x: -50, y: 40, z: 0 }, { x: 50, y: 40, z: 0 }];
  const shell = carveTube(blob, path, 3);
  assert.equal(shell.attributes.position.count / 3, faces,
    "a path nowhere near the solid still removed triangles");
});

test("mergeParts bakes transforms and colours into one geometry", () => {
  const merged = mergeParts([
    part(new THREE.BoxGeometry(1, 1, 1), 0xff0000, [10, 0, 0]),
    part(new THREE.BoxGeometry(1, 1, 1), 0x00ff00, [-10, 0, 0]),
  ]);
  const position = merged.attributes.position;
  const colour = merged.attributes.color;
  assert.equal(position.count, 48, "two boxes should merge to 48 vertices");
  assert.ok(colour, "no colour attribute was baked");

  let red = 0;
  let green = 0;
  for (let i = 0; i < colour.count; i++) {
    if (colour.getX(i) > 0.5 && colour.getY(i) < 0.5) red += 1;
    if (colour.getY(i) > 0.5 && colour.getX(i) < 0.5) green += 1;
  }
  assert.equal(red, 24);
  assert.equal(green, 24);

  // The translations are baked in, not left on a parent transform.
  merged.computeBoundingBox();
  assert.ok(merged.boundingBox.min.x < -10, "the left box did not move");
  assert.ok(merged.boundingBox.max.x > 10, "the right box did not move");
});
