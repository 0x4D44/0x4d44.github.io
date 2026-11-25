import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildShed, TOWER_SIZE } from '../src/shed.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';

// Round 8 (the signs-hands score, A2: "a painted line is not relief"): the springing course across the screen and the cornice's corona are
// real proud stone that casts (R-kx-front-b, the oblique photograph: the arches spring from a course across the screen; the parapet's
// cornice throws a shadow down the wall).
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const o = group.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(o, `${n} is built`); return o!; };
const X0 = layout.spine - SHED_SPAN_WIDTH, FW = 2 * SHED_SPAN_WIDTH;
const front = named('shed-front'), stone = named('shed-stone');
const hit = (o: THREE.Vector3, d: THREE.Vector3): { z: number; y: number; name: string } | null => {
  const h = new THREE.Raycaster(group.localToWorld(o.clone()), d.clone().transformDirection(group.matrixWorld), 0, 20).intersectObjects([front, stone], false)[0];
  if (!h) return null;
  const p = group.worldToLocal(h.point.clone());
  return { z: p.z, y: p.y, name: h.object.name };
};

test('A2: a springing course 0.95 m or more proud runs across the whole screen at the great arches\' springing, and casts', () => {
  const sp = layout.springing;
  let n = 0;
  for (let x = X0 + 0.5; x < X0 + FW - 0.5; x += 1.0) {
    if (Math.abs(x - layout.spine) < TOWER_SIZE / 2 + 0.5) continue; // behind the tower
    const h = hit(new THREE.Vector3(x, sp - 0.15, 5), new THREE.Vector3(0, 0, -1));
    assert.ok(h && h.name === 'shed-stone' && h.z >= 0.95, `the course at x=${x.toFixed(1)}: ${h ? h.z.toFixed(2) : 'none'} m proud`);
    n++;
  }
  assert.ok(n >= 50 && SHADOW_CASTERS.has('shed-stone'), `across the screen (${n} samples), in the shadow pass`);
});

test('A2: the parapet\'s cornice carries a corona 1.0 m or more proud, its soffit over the cornice\'s face, so the overhang throws a real shadow', () => {
  const top = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
  const x = X0 + 2;
  const out = hit(new THREE.Vector3(x, top - 0.15, 5), new THREE.Vector3(0, 0, -1));
  assert.ok(out && out.name === 'shed-stone' && out.z >= 1.0, `the corona ${out?.z.toFixed(2)} m proud`);
  const under = hit(new THREE.Vector3(x, top - 3, (out!.z + 0.75) / 2), new THREE.Vector3(0, 1, 0));
  assert.ok(under && under.name === 'shed-stone' && under.y > top - 0.5, `its soffit stands over the cornice's face, at ${under?.y.toFixed(2)} (top ${top.toFixed(2)})`);
});
