import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildShed, glazedHalfAngle, ROOF_SKIN } from '../src/shed.ts';

// Round 12 (crown-glass-round-1 score, item 4: a stippled lattice through the crown glass in gable-oblique): nothing crosses the crown's glass. The ribs inside
// stand wholly under it and the outside structure (shed-roof-bars) wholly over it, so each reads as a whole bar, under the glass or on it.
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const group = buildShed(layout, { range: false });
const R = SHED_SPAN_WIDTH / 2, sp = layout.springing, rg = R + ROOF_SKIN, phi = glazedHalfAngle(), steps = 12, da = (2 * phi) / steps;
/** the glass's radius at angle a: its band (vaultBand, 12 chords between its edges) is flat between vertices at rg */
const glassAt = (a: number): number => { const k = Math.min(steps - 1, Math.max(0, Math.floor((a - (Math.PI / 2 - phi)) / da))); return (rg * Math.cos(da / 2)) / Math.cos(a - (Math.PI / 2 - phi + (k + 0.5) * da)); };
/** every point along every triangle edge (five a side) over the glass's plan: its height above the glass, for the nearer vault whose glass it is over */
function clearances(mesh: THREE.Mesh, instances: THREE.Matrix4[]): number[] {
  const pos = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index, out: number[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), p = new THREE.Vector3();
  const n = idx ? idx.count : pos.count, at = (i: number): number => (idx ? idx.getX(i) : i);
  for (const m of instances) for (let t = 0; t < n; t += 3) for (let e = 0; e < 3; e++) {
    a.fromBufferAttribute(pos, at(t + e)).applyMatrix4(m); b.fromBufferAttribute(pos, at(t + ((e + 1) % 3))).applyMatrix4(m);
    for (let k = 0; k <= 4; k++) {
      p.lerpVectors(a, b, k / 4);
      if (p.z > 0 || p.z < -layout.length) continue;
      for (const uc of [layout.spine - R, layout.spine + R]) {
        const ang = Math.atan2(p.y - sp, uc - p.x), r = Math.hypot(p.x - uc, p.y - sp);
        if (Math.abs(ang - Math.PI / 2) < phi - 1e-6 && Math.abs(r - rg) < 0.5) out.push(r - glassAt(ang));
      }
    }
  }
  return out;
}

test('the ribs (the lattice inside) stand wholly under the crown glass, a centimetre or more', () => {
  const ribs = group.getObjectByName('shed-ribs') as THREE.InstancedMesh, ms: THREE.Matrix4[] = [];
  for (let i = 0; i < ribs.count; i++) { const m = new THREE.Matrix4(); ribs.getMatrixAt(i, m); ms.push(m); }
  const d = clearances(ribs, ms);
  assert.ok(d.length > 1000, `${d.length} points near the glass`);
  assert.ok(d.reduce((x, y) => Math.max(x, y), -Infinity) <= -0.01, `the nearest is ${d.reduce((x, y) => Math.max(x, y), -Infinity).toFixed(3)} m from the glass`);
});

test('the outside structure over the crown (rib caps, end ribs, seams, rail) stands wholly over the glass, none of it dipping through', () => {
  const bars = group.getObjectByName('shed-roof-bars') as THREE.Mesh;
  const d = clearances(bars, [new THREE.Matrix4()]);
  assert.ok(d.length > 10000, `${d.length} points near the glass`);
  assert.ok(d.reduce((x, y) => Math.min(x, y), Infinity) >= -1e-4, `the lowest is ${d.reduce((x, y) => Math.min(x, y), Infinity).toFixed(3)} m from the glass`);
});
