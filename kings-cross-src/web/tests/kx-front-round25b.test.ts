import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { GROUND_Y } from '../src/world.ts';
import * as shed from '../src/shed.ts';

// Round 25b (porch-close, after round 25 dropped the dark head ring): each porch opening's head transom meets the reveal at both ends.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const A = shed.SOUTH_FRONT_ARCADES, entryFoot = GROUND_Y + A.footAboveGround, entryR = A.openingWidth / 2;
const halfAt = (y: number): number => entryR * Math.sqrt(Math.max(0, 1 - ((y - entryFoot - A.jambHeight) / A.archRise) ** 2));
const centres = shed.southFrontArcadeCentres(4 * R, shed.TOWER_SIZE).map(x => x + layout.spine - 2 * R);
const [t0, t1] = shed.PORCH_INFILL.transom, yb = entryFoot + (t0 + t1) / 2 - (t1 - t0) / 6, yt = yb + (t1 - t0) / 3;
const zFront = -shed.PORCH_DEPTH.glass + shed.PORCH_DEPTH.frame;

test('A3: each porch opening\'s head transom runs to the reveal at both ends, at its foot and its top, and not into the wall', () => {
  assert.equal(centres.length, 2 * A.perSide);
  const ray = (x: number, y: number): { z: number; mat: number } | null => {
    const o = group.localToWorld(new THREE.Vector3(x, y, 5)), d = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
    const h = new THREE.Raycaster(o, d, 0, 20).intersectObject(infill, false)[0];
    return h ? { z: group.worldToLocal(h.point.clone()).z, mat: h.face?.materialIndex ?? -1 } : null;
  };
  for (const c of centres) for (const sd of [-1, 1]) for (const y of [yb + 0.01, (yb + yt) / 2, yt - 0.01]) {
    const h = ray(c + sd * (halfAt(y) - 0.015), y);
    assert.ok(h && h.mat === 1 && Math.abs(h.z - zFront) < 0.01, `x ${c.toFixed(1)} side ${sd} y ${(y - entryFoot).toFixed(2)}: ${h?.mat} at ${h?.z.toFixed(2)}`);
  }
  // and no frame vertex at the transom's height stands outside the arch line
  const pos = infill.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.y < yb - 0.001 || v.y > yt + 0.001 || v.z < -shed.PORCH_DEPTH.glass + 0.02 || v.z > zFront + 0.001) continue;
    const c = centres.reduce((a, b) => (Math.abs(b - v.x) < Math.abs(a - v.x) ? b : a));
    assert.ok(Math.abs(v.x - c) <= halfAt(v.y) + 0.005, `a vertex at x ${(v.x - c).toFixed(3)} from centre ${c.toFixed(1)}, y ${(v.y - entryFoot).toFixed(2)}, past the arch ${halfAt(v.y).toFixed(3)}`);
  }
});
