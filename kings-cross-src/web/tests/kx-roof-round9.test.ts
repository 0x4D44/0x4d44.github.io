import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildShed, ROOF_EXTERIOR, ROOF_SKIN } from '../src/shed.ts';
import { material } from '../src/materials.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';

// Round 9 (the roof-exterior-round-2 score, A5/A6): each north gable framed by a dark, heavy metal end rib, not a pale ring (R-kx-front-d), and the
// crown's seams in a paler paint so that, seen through the glass, they read as glazing texture rather than a crossed lattice (R-kx-front-e).
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const o = group.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(o, `${n} is built`); return o!; };
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const R = SHED_SPAN_WIDTH / 2, L = layout.length;

test('A6: each north gable is framed by a dark metal end rib about 0.9 m deep, standing proud of the glass, heavier than a rib cap, and casting', () => {
  const ring = named('shed-arch-rings'), m = ring.material as THREE.MeshLambertMaterial;
  assert.ok(m === material('ribPaint') && lum(m.color) < 0.5 * lum((material('stone') as THREE.MeshLambertMaterial).color), 'the ribs\' dark paint, not stone');
  assert.ok(SHADOW_CASTERS.has('shed-arch-rings'), 'it casts');
  for (const uc of [layout.spine - R, layout.spine + R]) {
    // across the rib at the crown, from the north: it starts at the glass's edge and runs gableRib[0] out
    const ys: number[] = [];
    for (let y = layout.springing + R - 0.2; y < layout.springing + R + 1.5; y += 0.02) {
      const h = new THREE.Raycaster(group.localToWorld(new THREE.Vector3(uc, y, -L - 5)), new THREE.Vector3(0, 0, 1).transformDirection(group.matrixWorld), 0, 10).intersectObject(ring, false)[0];
      if (h && group.worldToLocal(h.point.clone()).z <= -L - 0.5 + 1e-6) ys.push(y);
    }
    const depth = ys.length ? ys[ys.length - 1]! - ys[0]! : 0;
    assert.ok(depth >= 0.8 && depth >= 2 * ROOF_EXTERIOR.ribCap[0], `the rib ${depth.toFixed(2)} m deep and 0.5 m or more proud of the glass at x=${uc.toFixed(1)}`);
  }
});

test('A5: the crown\'s seams are a paler paint than the rib caps, between the ribs\' and the glass\'s, the rest of the bars the ribs\' paint', () => {
  const bars = named('shed-roof-bars'), m = bars.material as THREE.MeshLambertMaterial, col = bars.geometry.getAttribute('color');
  assert.ok(m.vertexColors && col, 'the bars carry a colour per vertex');
  const pos = bars.geometry.getAttribute('position');
  let seam = 0, other = 0, seamLum = 0, rMin = Infinity, rMax = -Infinity;
  const { post, size } = ROOF_EXTERIOR.rail, top = layout.springing + R + ROOF_SKIN, posts: number[] = [];
  for (let v = post / 2; v < L; v += post) posts.push(v);
  const seamX = new THREE.Color(ROOF_EXTERIOR.seamColour).r / m.color.r, sheenX = new THREE.Color(ROOF_EXTERIOR.ribSheen).r / m.color.r;
  for (let i = 0; i < pos.count; i++) {
    const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).multiply(m.color);
    // re-pinned 2026-11-24 (round 10): the crown rail is in the seams' paint too, and the end rib's top in ROOF_EXTERIOR.ribSheen (kx-roof-round10.test.ts
    // pins both); the seams are still the only paler vertices on the shell, all on their one radius, and every other bar is still the ribs' paint
    const x = pos.getX(i), uc = x < layout.spine ? layout.spine - R : layout.spine + R, r = Math.hypot(x - uc, pos.getY(i) - layout.springing);
    const z = pos.getZ(i), onRail = Math.abs(x - uc) <= size / 2 + 1e-4 && pos.getY(i) >= top - 1e-4 && (Math.abs(z) < 1e-3 || Math.abs(z + L) < 1e-3 || posts.some(v => Math.abs(z + v) <= size / 2 + 1e-4));
    if (Math.abs(col.getX(i) - seamX) < 1e-6 && !onRail) {
      seam++; seamLum += lum(c);
      // only the seams: every paler vertex on the seams' one radius about its vault's centre (a rib cap stands further out)
      rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    } else if (onRail) continue;
    else if (Math.abs(col.getX(i) - sheenX) > 1e-6) { other++; assert.ok(Math.abs(col.getX(i) - 1) < 1e-6, 'every other bar the ribs\' paint'); }
  }
  assert.ok(seam > 1000 && other > 1000, `${seam} seam vertices, ${other} others`);
  assert.ok(rMax - rMin < 0.01, `the paler paint on the seams alone: radii ${rMin.toFixed(3)} to ${rMax.toFixed(3)}`);
  const avg = seamLum / seam;
  assert.ok(avg >= 2 * lum(m.color) && avg <= 0.6, `the seams' paint ${avg.toFixed(3)} against the ribs' ${lum(m.color).toFixed(3)}: paler, not white`);
});
