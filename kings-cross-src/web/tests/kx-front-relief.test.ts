import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildShed, TOWER_SIZE } from '../src/shed.ts';
import { material } from '../src/materials.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import { GROUND_Y } from '../src/world.ts';

// The south front's relief (rubric A2) and lower arcade (A3), measured from R-kx-front-a (2026, square-on) and R-kx-front-b (2016, oblique).
// Heights are above the model ground; the bands are the photographs' reading plus or minus what the eye can tell.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const X0 = layout.spine - SHED_SPAN_WIDTH;
const FW = 2 * SHED_SPAN_WIDTH;
const bay = (FW - TOWER_SIZE) / 6;
const centres = [...[0, 1, 2].map(i => X0 + (i + 0.5) * bay), ...[2, 1, 0].map(i => X0 + FW - (i + 0.5) * bay)];
const foot = GROUND_Y + 0.2;
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (...names: string[]): THREE.Object3D[] => names.map(n => { const o = group.getObjectByName(n); assert.ok(o, `${n} is built`); return o!; });

/** the z (shed frame, south +) of the first surface a ray going north meets at (x, y), or null */
const hitZ = (x: number, y: number, targets: THREE.Object3D[], from = 10, mats?: number[]): number | null => {
  const origin = group.localToWorld(new THREE.Vector3(x, y, from));
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
  const hit = new THREE.Raycaster(origin, dir, 0, from + 3).intersectObjects(targets, true).find(h => !mats || mats.includes(h.face?.materialIndex ?? -1));
  return hit ? group.worldToLocal(hit.point.clone()).z : null;
};
/** runs of samples whose value passes `keep`, as [first, last] sample positions */
const runs = (xs: number[], keep: (i: number) => boolean): [number, number][] => {
  const out: [number, number][] = [];
  xs.forEach((x, i) => { if (!keep(i)) return; const last = out[out.length - 1]; if (last && i > 0 && keep(i - 1)) last[1] = x; else out.push([x, x]); });
  return out;
};

test('A2: proud stone string courses at the lower arcade\'s impost and at the great windows\' sill, distinct bands of the measured heights', () => {
  const masonry = named('shed-front', 'shed-stone');
  const x = X0 + bay; // the pier between the first two porch openings: clear of the tower, the end piers and the openings
  const ys: number[] = [];
  for (let y = GROUND_Y + 2.5; y <= layout.springing + 0.5; y += 0.025) ys.push(y);
  const zs = ys.map(y => hitZ(x, y, masonry) ?? -9);
  const bands = runs(ys, i => (zs[i] as number) > 0.1).map(([a, b]) => ({ mid: (a + b) / 2 - GROUND_Y, h: b - a }));
  assert.ok(bands.length >= 2, `two proud courses between the arcade and the springing, found ${bands.length}`);
  const impost = bands.find(b => b.mid > 4.5 && b.mid < 5.2);
  const sill = bands.find(b => b.mid > 5.2 && b.mid < 6.0);
  assert.ok(impost && impost.h >= 0.15 && impost.h <= 0.5, 'a string course over the lower arches\' crowns, 4.5 to 5.2 m up, 0.15 to 0.5 m deep');
  assert.ok(sill && sill.h >= 0.4, 'the sill course at the great windows\' springing');
});

test('A2: each great arch\'s reveal steps back in three orders toward the glass, each step 0.1 to 0.25 m', () => {
  const masonry = named('shed-front', 'shed-arch-rings');
  for (const uc of [layout.spine - R, layout.spine + R]) {
    for (const a of [Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.7]) {
      const rs: number[] = [];
      for (let r = R + 0.02; r <= R + 2.5; r += 0.02) rs.push(r);
      const zs = rs.map(r => hitZ(uc + r * Math.cos(a), layout.springing + r * Math.sin(a), masonry));
      // plateaus of constant face depth, from the glass outward
      const levels: number[] = [];
      for (const z of zs) { if (z === null) continue; const q = Math.round(z * 100) / 100; if (levels[levels.length - 1] !== q) levels.push(q); }
      assert.ok(levels.length >= 4, `three orders and the wall at ${(a * 180 / Math.PI).toFixed(0)} degrees, found ${levels.length} levels`);
      const orders = levels.slice(0, 3);
      for (let i = 1; i < 3; i++) {
        const step = (orders[i] as number) - (orders[i - 1] as number);
        assert.ok(step >= 0.1 && step <= 0.25, `order ${i} stands 0.1 to 0.25 m in front of the one inside it (${step.toFixed(2)})`);
      }
      assert.ok((orders[0] as number) > -0.1, 'the innermost order is still a reveal, in front of the glass');
    }
  }
});

test('A3: each of the six lower openings carries glazing set back in its reveal, with mullions, a transom and door rails in dark frames', () => {
  // Re-pinned 2026-11-24 (round 5, second pass): the infill is its own mesh, 'shed-front-infill', of four materials (glass 0, frames 1,
  // signage fascia 2, downlights 3), so the glass is no longer the lunettes' and the frames are no longer the lunettes' bars; same checks
  const [infill, front] = named('shed-front-infill', 'shed-front');
  const glass = infill, bars = infill;
  for (const x of centres) {
    const g = hitZ(x + 0.3, foot + 1.6, [glass!], 10, [0]);
    assert.ok(g !== null && g < -0.3 && g > -1.2, `glass in the opening at x=${x.toFixed(1)}, set back 0.3 to 1.2 m`);
    const face = hitZ(x - 3.6, foot + 1.6, [front!]);
    assert.ok(face !== null && face > g, 'behind the front\'s face');
    const xs: number[] = [];
    for (let dx = -3.3; dx <= 3.3; dx += 0.02) xs.push(x + dx);
    const mullions = runs(xs, i => hitZ(xs[i] as number, foot + 1.6, [bars!], 10, [1]) !== null);
    assert.ok(mullions.length >= 4, `at least four mullions across the opening, found ${mullions.length}`);
    const ys: number[] = [];
    for (let y = foot; y <= foot + 3.9; y += 0.02) ys.push(y);
    const rails = runs(ys, i => hitZ(x + 0.3, ys[i] as number, [bars!], 10, [1, 2]) !== null);
    assert.ok(rails.length >= 2, `a door rail and a transom in the opening, found ${rails.length}`);
  }
});

test('A3: the low canopy of the current front runs across the six openings at the measured height, clear of the tower\'s face, and casts', () => {
  const porch = group.getObjectByName('shed-front-porch-arches') as THREE.Mesh | undefined;
  assert.ok(porch && Array.isArray(porch.material), 'the canopy is the porch mesh\'s second material');
  // Re-pinned 2026-11-24 (round 5, second pass): the canopy is charcoal now (its own steel, FRONT_COLOURS), not the ribs' paint
  const steel = (porch.material as THREE.Material[]).findIndex(m => m !== material('stone'));
  const span = porch.geometry.groups.find(g => g.materialIndex === steel);
  assert.ok(steel > 0 && span, 'dark steel, the second material');
  const pos = porch.geometry.getAttribute('position');
  const b = new THREE.Box3();
  for (let i = span.start; i < span.start + span.count; i++) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i));
  const canopy = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: span.count * 3 }, (_, k) => pos.getComponent(span.start + Math.floor(k / 3), k % 3)), 3)));
  group.add(canopy);
  group.updateMatrixWorld(true);
  assert.ok(b.max.y - GROUND_Y > 3.6 && b.max.y - GROUND_Y < 4.2, `its top 3.6 to 4.2 m up (${(b.max.y - GROUND_Y).toFixed(2)})`);
  assert.ok(b.min.x < (centres[0] as number) - 3.4 && b.max.x > (centres[5] as number) + 3.4, 'across all six openings');
  assert.ok(b.max.z > TOWER_SIZE + 0.15 && b.max.z < 9, 'deep enough to pass in front of the tower, no deeper than 9 m');
  assert.ok(b.min.z >= -0.01, 'nothing of it north of the front, toward the buffer stops');
  for (const x of centres) assert.ok(hitZ(x, foot + 1.6, [canopy]) === null, 'its columns stand clear of the doorways');
  group.remove(canopy);
  assert.ok(SHADOW_CASTERS.has('shed-front-porch-arches'), 'it casts the sun\'s shadow on the openings, as the photograph shows');
});
