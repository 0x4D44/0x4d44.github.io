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

test('the clock stage is 0.6 to 0.8 of the shaft\'s width (R-kx-front-a), set back on the shaft\'s cornice, its clocks on its own faces', () => {
  const brick = named('tower-brick');
  const shaftTop = CLOCK_TOWER_HEIGHT - 8.2;
  const shaft = hitZ(0, shaftTop - 1.5, brick), stage = hitZ(0, clockY - 2.35, brick);
  assert.ok(shaft !== null && stage !== null, 'both stages are brick on the south face');
  assert.ok(Math.abs(shaft - TOWER_SIZE / 2) < 0.02, 'the shaft is the tower\'s full size');
  const setback = shaft - stage;
  // re-pinned 2026-11-24 (the held round 1a): the stage is narrower, 0.72 of the shaft (it was 0.92, set back 0.25 m)
  const ratio = stage / shaft;
  assert.ok(setback > 0 && ratio >= 0.6 && ratio <= 0.8, `the stage ${ratio.toFixed(2)} of the shaft's width`);
  for (const d of tower.userData.clockDials as { centre: number[]; normal: number[] }[]) {
    const out = d.centre[0]! * d.normal[0]! + d.centre[2]! * d.normal[2]!;
    assert.ok(Math.abs(out - (stage + 0.06)) < 0.02, 'each dial sits on the stage\'s face');
  }
});

test('a deep bracketed cornice: five to eight large stone brackets to a face (R-kx-front-c), carrying a corona at least 1 m past the stage\'s brick', () => {
  const stone = named('tower-stone'), brick = named('tower-brick');
  const stage = hitZ(0, clockY - 2.35, brick)!;
  let best = 0, narrowest = Infinity;
  for (let y = clockY + 2.2; y < clockY + 4; y += 0.05) {
    const xs: number[] = [];
    for (let x = -TOWER_SIZE / 2; x <= TOWER_SIZE / 2; x += 0.02) xs.push(x);
    let runs = 0, prev = false, start = 0;
    for (const x of xs) { const z = hitZ(x, y, stone); const on = z !== null && z > stage + 0.3 && z < stage + 1.0; if (on && !prev) { runs++; start = x; } if (!on && prev) narrowest = Math.min(narrowest, x - start); prev = on; }
    if (runs > best) best = runs;
  }
  // re-pinned 2026-11-24 (the held round 1a): fewer and larger brackets than the nine of the first pass
  assert.ok(best >= 5 && best <= 8, `brackets counted across the south face: ${best}`);
  assert.ok(narrowest >= 0.4, `each bracket at least 0.4 m wide (${narrowest.toFixed(2)})`);
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

test('in the shed, the tower stands about its own width proud of the front (R-kx-front-b, the held round 1a)', async () => {
  const { readFileSync } = await import('node:fs');
  const { shedLayout } = await import('../../core/station.ts');
  const { buildShed } = await import('../src/shed.ts');
  const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')));
  const shed = buildShed(layout, { range: false });
  shed.updateMatrixWorld(true);
  const t = shed.getObjectByName('clock-tower')!;
  const inv = shed.matrixWorld.clone().invert(), v = new THREE.Vector3();
  const m = t.getObjectByName('tower-brick') as THREE.Mesh, p = m.geometry.getAttribute('position');
  let face = -Infinity, back = Infinity;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv); if (v.y < 20) { face = Math.max(face, v.z); back = Math.min(back, v.z); } }
  // re-pinned 2026-11-24 (the held round 1a): the scorer measured the shaft's west face at 0.8 of its south face in front-b; 1.5 m was wrong
  assert.ok(face - Math.max(back, 0) >= 0.8 * TOWER_SIZE, `the lower shaft stands ${(face - Math.max(back, 0)).toFixed(2)} m proud of the front`);
});

test('the shaft\'s top is a heavy stepped stone cornice with a weathered slope in to the stage, and the vane a gilded banner', () => {
  const stone = named('tower-stone');
  const shaftTop = CLOCK_TOWER_HEIGHT - 8.2;
  const depths = new Set<number>();
  for (let y = shaftTop - 0.7; y <= shaftTop + 0.05; y += 0.02) { const z = hitZ(1.0, y, stone); if (z !== null && z > TOWER_SIZE / 2 + 0.05) depths.add(Math.round((z - TOWER_SIZE / 2) * 20) / 20); }
  assert.ok(depths.size >= 2 && Math.max(...depths) >= 0.3, `stepped courses standing out ${[...depths].join(', ')} m`);
  const slope: number[] = [];
  for (let y = shaftTop + 0.08; y <= shaftTop + 0.4; y += 0.08) { const z = hitZ(0.3, y, stone); assert.ok(z !== null, `the weathered top at ${(y - shaftTop).toFixed(2)} m`); slope.push(z!); }
  assert.ok(slope.every((z, i) => i === 0 || z < slope[i - 1]! - 0.01), 'and it slopes in as it rises');
  const vane = named('tower-vane'), c = (vane.material as THREE.MeshLambertMaterial).color;
  assert.ok(c.r > c.b + 0.2 && c.g > c.b, 'gilded, not black');
  const b = box(vane);
  assert.ok(b.max.y - b.min.y > 1 && hitZ(0.6, CLOCK_TOWER_HEIGHT - 0.25, vane) !== null, 'a banner on the mast, not a thin arrow');
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
