import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CLOCK_TOWER_HEIGHT } from '../../core/station.ts';
import { buildTower } from '../src/shed.ts';

const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
};
const bounds = (m: THREE.Mesh): THREE.Box3 => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!; };

// The architect's built south-front photograph puts the clock in the upper turret,
// directly below its eaves; it does not have the old model's arched belfry above it.
// https://mcaslan.agencyprojects.com/storage/app/uploads/public/69a/2be/fdc/69a2befdcf61f464137352.jpg
// The 80% floor is a generous image-derived check, not a surveyed clock elevation.
test('tower clock occupies the upper turret immediately below the cap eaves', () => {
  const tower = buildTower(0), all = meshes(tower);
  const clocks = all.filter(m => m.geometry instanceof THREE.CircleGeometry);
  assert.equal(clocks.length, 4);
  const cap = all.find(m => m.name === 'tower-cap')!;
  assert.ok(cap, 'slate cap exists');
  const eaves = bounds(cap).min.y;
  for (const clock of clocks) {
    const radius = bounds(clock).max.y;
    assert.ok(clock.position.y > CLOCK_TOWER_HEIGHT * .8, `clock at ${clock.position.y} is below the upper turret`);
    const gap = eaves - (clock.position.y + radius);
    assert.ok(gap > 0 && gap < 2, `clock top is ${gap} m below the cap, rather than immediately below its eaves`);
  }
});

test('tower has no unsupported arched-window stage above its clocks', () => {
  const tower = buildTower(0), all = meshes(tower);
  const clockY = all.find(m => m.geometry instanceof THREE.CircleGeometry)!.position.y;
  const openings = all.filter(m => m.name === 'tower-openings');
  assert.ok(openings.every(m => bounds(m).max.y <= clockY), 'arched belfry openings remain above the clock');
});

// Historic England 1078328 identifies a weather vane; require physical geometry,
// not just a group/name or userData. Overall height remains the published 112 ft.
test('a physical weather vane crowns the cap and preserves the published total height', () => {
  const tower = buildTower(0), all = meshes(tower);
  const vane = all.filter(m => m.name === 'tower-vane');
  assert.ok(vane.length > 0, 'no weather-vane mesh');
  const box = new THREE.Box3();
  for (const m of vane) box.union(bounds(m));
  const cap = bounds(all.find(m => m.name === 'tower-cap')!);
  assert.ok(box.min.y < cap.max.y && box.max.y > cap.max.y + .5, 'vane mast must join the cap and rise above it');
  assert.ok(box.max.x - box.min.x >= 1, 'directional crossbar must have a visible span');
  const top = Math.max(...all.map(m => bounds(m).max.y));
  assert.ok(Math.abs(top - CLOCK_TOWER_HEIGHT) < 1e-4, `tower/vane top ${top} differs from published ${CLOCK_TOWER_HEIGHT}`);
});
