import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CLOCK_TOWER_HEIGHT } from '../../core/station.ts';
import { buildTower, TOWER_SIZE } from '../src/shed.ts';

// The clock tower's top (rubric A4) against R-kx-front-c (2019, close up), R-kx-front-a and R-kx-front-b: the clock stage set back on the
// shaft's cornice, a deep bracketed stone cornice, and a near-flat dark cap under the vane. The bands are what the photographs show within
// what the eye can tell; the sizes are ASSUMED (shed.ts TOWER_TOP).
const tower = buildTower(0);
tower.position.set(0, 0, 0);
tower.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const m = tower.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(m, `${n} is built`); return m; };
const box = (m: THREE.Mesh): THREE.Box3 => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox!.clone(); };
/** the z of the first surface of `target` a ray going north meets at (x, y), or null */
const hitZ = (x: number, y: number, target: THREE.Object3D): number | null => {
  const h = new THREE.Raycaster(new THREE.Vector3(x, y, 20), new THREE.Vector3(0, 0, -1), 0, 40).intersectObject(target, false)[0];
  return h ? h.point.z : null;
};
const clockY = (tower.getObjectsByProperty('type', 'Mesh') as THREE.Mesh[]).find(m => m.geometry instanceof THREE.CircleGeometry)!.position.y;

test('the clock stage is set back on the shaft\'s cornice by 0.15 to 0.5 m, its clocks on its own faces', () => {
  const brick = named('tower-brick');
  const shaftTop = CLOCK_TOWER_HEIGHT - 8.2;
  const shaft = hitZ(0, shaftTop - 1.5, brick), stage = hitZ(0, clockY - 2.35, brick);
  assert.ok(shaft !== null && stage !== null, 'both stages are brick on the south face');
  assert.ok(Math.abs(shaft - TOWER_SIZE / 2) < 0.02, 'the shaft is the tower\'s full size');
  const setback = shaft - stage;
  assert.ok(setback >= 0.15 && setback <= 0.5, `set back ${setback.toFixed(2)} m`);
  for (const d of tower.userData.clockDials as { centre: number[]; normal: number[] }[]) {
    const out = d.centre[0]! * d.normal[0]! + d.centre[2]! * d.normal[2]!;
    assert.ok(Math.abs(out - (stage + 0.06)) < 0.02, 'each dial sits on the stage\'s face');
  }
});

test('a deep bracketed cornice: eight or more stone brackets to a face, carrying a corona at least 1 m past the stage\'s brick', () => {
  const stone = named('tower-stone'), brick = named('tower-brick');
  const stage = hitZ(0, clockY - 2.35, brick)!;
  let best = 0;
  for (let y = clockY + 2.2; y < clockY + 4; y += 0.05) {
    const xs: number[] = [];
    for (let x = -TOWER_SIZE / 2; x <= TOWER_SIZE / 2; x += 0.02) xs.push(x);
    let runs = 0, prev = false;
    for (const x of xs) { const z = hitZ(x, y, stone); const on = z !== null && z > stage + 0.3 && z < stage + 1.0; if (on && !prev) runs++; prev = on; }
    best = Math.max(best, runs);
  }
  assert.ok(best >= 8, `brackets counted across the south face: ${best}`);
  let reach = 0;
  for (let y = clockY + 2.2; y < clockY + 4.5; y += 0.05) { const z = hitZ(0.05, y, stone); if (z !== null) reach = Math.max(reach, z - stage); }
  assert.ok(reach >= 1.0 && reach <= 1.6, `the corona overhangs the stage's brick by ${reach.toFixed(2)} m`);
});

test('the cap is near-flat, its dark edge overhanging the stage, under the vane at the published height', () => {
  const cap = box(named('tower-cap')), brick = named('tower-brick');
  const stage = hitZ(0, clockY - 2.35, brick)!;
  assert.ok(cap.max.y - cap.min.y <= 0.6, `a near-flat top, not a pitched hip: ${(cap.max.y - cap.min.y).toFixed(2)} m from edge to apex`);
  assert.ok(cap.max.z - stage >= 1.0, 'its edge overhangs the stage by a metre or more');
  const top = Math.max(...(tower.getObjectsByProperty('type', 'Mesh') as THREE.Mesh[]).map(m => box(m).max.y));
  assert.ok(Math.abs(top - CLOCK_TOWER_HEIGHT) < 0.5, `the vane's top at ${top.toFixed(2)} m, published ${CLOCK_TOWER_HEIGHT.toFixed(2)}`);
});

test('in the shed, the tower stands 1 to 2 m proud of the front (R-kx-front-b), and nothing of it hangs into the shed below the roofs', async () => {
  const { readFileSync } = await import('node:fs');
  const { shedLayout, SHED_SPAN_WIDTH } = await import('../../core/station.ts');
  const { buildShed, ROOF_SKIN } = await import('../src/shed.ts');
  const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')));
  const shed = buildShed(layout, { range: false });
  shed.updateMatrixWorld(true);
  const t = shed.getObjectByName('clock-tower')!;
  const inv = shed.matrixWorld.clone().invert(), v = new THREE.Vector3();
  const R = SHED_SPAN_WIDTH / 2, roof = (d: number): number => layout.springing + Math.sqrt(Math.max(0, (R + ROOF_SKIN) ** 2 - (R - d) ** 2));
  let face = -Infinity, hanging = 0;
  for (const name of ['tower-brick', 'tower-stone']) {
    const m = t.getObjectByName(name) as THREE.Mesh, p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      if (v.y < 20) face = Math.max(face, v.z);
      if (v.z < -1.21 && v.y < roof(Math.min(TOWER_SIZE / 2, Math.abs(v.x - layout.spine))) - 0.5) hanging++;
    }
  }
  assert.ok(face >= 1 && face <= 2.2, `the lower shaft's south face (with its plinth) ${face.toFixed(2)} m proud of the front`);
  assert.equal(hanging, 0, 'no tower vertex behind the front lower than half a metre under the roof above it');
});

test('the round-2 scorer\'s cheap ones: the canopy lamps are not bright by day, and each entrance\'s doors are told from its fixed glazing', async () => {
  const { readFileSync } = await import('node:fs');
  const { shedLayout, SHED_SPAN_WIDTH } = await import('../../core/station.ts');
  const { buildShed } = await import('../src/shed.ts');
  const { GROUND_Y } = await import('../src/world.ts');
  const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')));
  const shed = buildShed(layout, { range: false });
  shed.updateMatrixWorld(true);
  const infill = shed.getObjectByName('shed-front-infill') as THREE.Mesh;
  const lamp = (infill.material as THREE.MeshLambertMaterial[])[3]!;
  const hex = lamp.color.getHex(), lift = lamp.emissive.getHex();
  assert.ok(Math.max((hex >> 16) & 255, (hex >> 8) & 255, hex & 255) <= 0xc0 && Math.max((lift >> 16) & 255, (lift >> 8) & 255, lift & 255) <= 0x18, 'a lamp by day is a grey fitting, not a white light');
  const X0 = layout.spine - SHED_SPAN_WIDTH, bay = (2 * SHED_SPAN_WIDTH - TOWER_SIZE) / 6, foot = GROUND_Y + 0.2, dw = 6.8 / 5;
  const frameAt = (x: number, y: number): boolean => new THREE.Raycaster(shed.localToWorld(new THREE.Vector3(x, y, 1)), new THREE.Vector3(0, 0, -1).transformDirection(shed.matrixWorld), 0, 3)
    .intersectObject(infill, false).some(h => h.face?.materialIndex === 1);
  for (const c of [0, 1, 2].map(i => X0 + (i + 0.5) * bay)) {
    assert.ok(frameAt(c, foot + 0.45) && !frameAt(c - 2 * dw, foot + 0.45), 'a solid kick panel in the doors, none in the fixed screen');
    let stiles = 0, prev = false;
    for (let dx = -dw / 2 + 0.02; dx < dw / 2 - 0.02; dx += 0.01) { const on = frameAt(c + dx, foot + 1.6); if (on && !prev) stiles++; prev = on; }
    assert.ok(stiles >= 3, `the doors' leaf and meeting stiles: ${stiles}`);
  }
});
