import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import { buildShed, TOWER_SIZE } from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const W = layout.width;
const perSide = 3;
const openingWidth = 6.8; // ASSUMED clear width; six porch openings are sourced, their dimensions are not.
const jambHeight = 2.0;
const archRise = 2.0;
const ringWidth = 0.4;
const foot = GROUND_Y + 0.2; // ASSUMED threshold is 0.2 m above the model ground.
const bay = (W - TOWER_SIZE) / (2 * perSide);
const centers = [
  ...Array.from({ length: perSide }, (_, i) => (i + 0.5) * bay),
  ...Array.from({ length: perSide }, (_, i) => W - (perSide - 0.5 - i) * bay),
];

const facade = (): { group: THREE.Group; arch: THREE.Object3D } => {
  const group = buildShed(layout, { range: false });
  group.updateMatrixWorld(true);
  const arch = group.getObjectByName('shed-front')!;
  assert.ok(arch, 'south-front wall exists');
  return { group, arch };
};

const rayHits = (group: THREE.Group, x: number, y: number, target: THREE.Object3D = group): boolean => {
  const origin = group.localToWorld(new THREE.Vector3(x, y, 1));
  const direction = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
  return new THREE.Raycaster(origin, direction, 0, 3).intersectObject(target, true).length > 0;
};

test('the ground-floor porch has six broad arches, three in evenly spaced bays on each side of the tower', () => {
  assert.equal(centers.length, 6);
  assert.ok(openingWidth >= 4.5, 'the clear arch width should read as a broad entrance');
  for (let i = 1; i < perSide; i++) {
    assert.ok(Math.abs((centers[i]! - centers[i - 1]!) - bay) < 1e-8, 'left-side bays are evenly spaced');
    assert.ok(Math.abs((centers[i + perSide]! - centers[i + perSide - 1]!) - bay) < 1e-8, 'right-side bays are evenly spaced');
  }
  const { group } = facade();
  for (const x of centers) {
    for (const dx of [-3, 0, 3]) assert.equal(rayHits(group, x + dx, foot + 1), false, `opening at x=${x.toFixed(2)} is blocked at offset ${dx}`);
  }
});

test('the openings pass through the plinth while their piers and low sill remain solid', () => {
  const { group } = facade();
  // The low ray crosses the old plinth course as well as the wall, so a front-only cut is not enough.
  assert.equal(rayHits(group, centers[0]! + 3, foot + 1), false, 'broad entrance edge is blocked by the plinth or front wall');
  assert.equal(rayHits(group, (centers[2]! + centers[3]!) / 2, foot + 1), true, 'the central pier should remain');
  assert.equal(rayHits(group, centers[0]!, GROUND_Y + 0.1), true, 'the 0.2 m sill below the opening should remain');
});

test('each entrance has a visible stone arch ring on the south face', () => {
  const { group } = facade();
  const ring = group.getObjectByName('shed-front-porch-arches') as THREE.Mesh | null;
  assert.ok(ring, 'merged stone arch outlines exist');
  ring.geometry.computeBoundingBox();
  const b = ring.geometry.boundingBox!;
  assert.ok(b.max.x - b.min.x > openingWidth, 'the merged rings span all six openings');
  assert.ok(b.max.y > foot + jambHeight + archRise && b.max.y < 5.64, 'segmental arch rings rise above the head while staying below the sill');
  assert.ok(b.max.z > 0.4, 'arch outlines stand proud of the south face');
  for (const x of centers) assert.equal(rayHits(group, x, foot + jambHeight + archRise + ringWidth / 2, ring), true, `no physical arch ring at x=${x.toFixed(2)}`);
});
