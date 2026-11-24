import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildShed, ROOF_EXTERIOR, ROOF_SKIN } from '../src/shed.ts';

// Round 10 (the end-rib-round-1 score, section 5): the crown rail no longer a dark grid line over the pale crown; the north gables' end rib with a lip
// along each edge of its face and a lighter top, all in the outside structure (shed-roof-bars), so the views from inside do not change.
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const o = group.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(o, `${n} is built`); return o!; };
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const R = SHED_SPAN_WIDTH / 2, L = layout.length, sp = layout.springing, [gd, gt] = ROOF_EXTERIOR.gableRib;
const bars = named('shed-roof-bars'), paint = (bars.material as THREE.MeshLambertMaterial).color;
const pos = bars.geometry.getAttribute('position'), col = bars.geometry.getAttribute('color'), nrm = bars.geometry.getAttribute('normal');
const centreOf = (x: number): number => (x < layout.spine ? layout.spine - R : layout.spine + R);
/** whether vertex i lies on a vault's rib top (radius r about that vault's centre, its normal pointing straight out from it); the gable ribs span their whole half
 * circles, so near the spine either vault's may be the one */
const onTop = (i: number, r: number, tol: number): boolean => [layout.spine - R, layout.spine + R].some(uc => {
  const dx = pos.getX(i) - uc, dy = pos.getY(i) - sp, d = Math.hypot(dx, dy);
  return Math.abs(d - r) < tol && (nrm.getX(i) * dx + nrm.getY(i) * dy) / d > 0.99;
});

test('A5: the crown walkway rail is drawn in the seams\' paler paint, not the ribs\' dark one', () => {
  const seamX = new THREE.Color(ROOF_EXTERIOR.seamColour).r / paint.r, top = sp + R + ROOF_SKIN;
  let rail = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (Math.abs(x - centreOf(x)) > 0.05 || y < top + 0.2 || pos.getZ(i) < -L + 1) continue; // the posts above their lowest 0.2 m, and both rails, short of the end rib
    rail++;
    assert.ok(Math.abs(col.getX(i) - seamX) < 1e-6, `rail vertex at y=${y.toFixed(2)} in the seams' paint`);
  }
  assert.ok(rail > 1000, `${rail} rail vertices`);
});

test('A6: the end rib\'s face has a lip along both edges, proud of the face, the outer one overhanging the rib\'s top', () => {
  const [lw, lp, over] = ROOF_EXTERIOR.ribLip;
  for (const uc of [layout.spine - R, layout.spine + R]) for (const a of [Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4]) {
    // rays from the north, square to the gable, across the rib at angle a: where the outside structure stands north of the rib's face
    const proud: number[] = [];
    for (let d = -0.2; d <= gd + 0.3; d += 0.01) {
      const r = R + d, o = new THREE.Vector3(uc + r * Math.cos(a), sp + r * Math.sin(a), -L - 5);
      const h = new THREE.Raycaster(group.localToWorld(o), new THREE.Vector3(0, 0, 1).transformDirection(group.matrixWorld), 0, 10).intersectObject(bars, false)[0];
      if (h && group.worldToLocal(h.point.clone()).z < -L - gt - lp / 2) proud.push(d);
    }
    const inner = proud.filter(d => d < gd / 2), outer = proud.filter(d => d >= gd / 2);
    assert.ok(inner.length && outer.length, `a lip at both edges at x=${uc.toFixed(1)}, a=${a.toFixed(2)}`);
    assert.ok(Math.min(...inner) < 0.02 && Math.max(...inner) > lw - 0.03 && Math.max(...inner) < lw + 0.02, `inner lip ${Math.min(...inner).toFixed(2)}..${Math.max(...inner).toFixed(2)}`);
    assert.ok(Math.min(...outer) > gd - lw - 0.03 && Math.max(...outer) > gd + over - 0.03 && Math.max(...outer) < gd + over + 0.02, `outer lip ${Math.min(...outer).toFixed(2)}..${Math.max(...outer).toFixed(2)}`);
    assert.ok(Math.max(...inner) < Math.min(...outer) - 0.4, 'the face between the lips is open: a flange at each edge, not a thicker band');
  }
});

test('A6: the end rib\'s top (the gable rib\'s outer face and the end-rib cap\'s) is a lighter tone than the ribs\' paint, darker than the seams', () => {
  const sheenX = new THREE.Color(ROOF_EXTERIOR.ribSheen).r / paint.r;
  let n = 0, front = 0, cap = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(col.getX(i) - sheenX) > 1e-6) continue;
    n++;
    const z = pos.getZ(i);
    assert.ok(onTop(i, R + gd, 0.06), `on the rib's top and facing out, the top face only, at (${pos.getX(i).toFixed(2)}, ${pos.getY(i).toFixed(2)})`);
    assert.ok(z >= -L - gt - 1e-3 && z <= -L + ROOF_EXTERIOR.endRib[0] + 1e-3, `over the end rib, z=${z.toFixed(2)}`);
    if (z < -L - 0.01) front++; else if (z > -L + 0.01) cap++; // a vertex on z = -L, where the two meet, may be either's
  }
  assert.ok(front > 50 && cap > 50, `${front} on the gable rib's top, ${cap} on the cap's`);
  const c = new THREE.Color(ROOF_EXTERIOR.ribSheen), seam = new THREE.Color(ROOF_EXTERIOR.seamColour);
  assert.ok(lum(c) >= 1.4 * lum(paint) && lum(c) <= 0.8 * lum(seam), `sheen ${lum(c).toFixed(3)} between the paint ${lum(paint).toFixed(3)} and the seams ${lum(seam).toFixed(3)}`);
});
