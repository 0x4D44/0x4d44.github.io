import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

// Round 20 (cornice-round-1 score, section 5): A3 the porch infill's depth (the glass set back, deep frames, the concourse and its barriers read behind
// the glass, glowing warm after dark) and A2 the cornice's shadow band (the corona's overhang over the cornice's face).
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const X0 = layout.spine - SHED_SPAN_WIDTH, FW = 2 * SHED_SPAN_WIDTH, bay = (FW - shed.TOWER_SIZE) / 6;
const centres = [...[0, 1, 2].map(i => X0 + (i + 0.5) * bay), ...[2, 1, 0].map(i => X0 + FW - (i + 0.5) * bay)];
const foot = GROUND_Y + 0.2;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const hit = (x: number, y: number, target: THREE.Object3D, mats: number[]): number | null => {
  const origin = group.localToWorld(new THREE.Vector3(x, y, 10)), dir = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 13).intersectObject(target, true).find(q => mats.includes(q.face?.materialIndex ?? -1));
  return h ? group.worldToLocal(h.point.clone()).z : null;
};

test('A3: each lower opening\'s glass stands 0.3-1.15 m behind the front\'s face, its mullions about 0.3 m deep in front of it', () => {
  const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
  const D = S.PORCH_DEPTH as { glass: number; frame: number } | undefined;
  assert.ok(D, 'PORCH_DEPTH');
  for (const x of centres) {
    const g = hit(x + 0.3, foot + 2.6, infill, [0]); // over the transom: the glass, no interior plane there
    assert.ok(g !== null && g <= -0.3 && g >= -1.15, // re-pinned round 23 (A3): 0.8 m, so the reveal's dark returns read 2-3 px at the pedestrian view; round 26 (front-round-5 score, A3: still no void): 1.05 m, inside the 1.2 m wall
      `the glass at z ${g?.toFixed(2)}`);
    // a mullion of the fixed screen (bay 1 of 5): its face well in front of the glass
    const dx = -3.4 + (2 * 3.4) / 5, m = hit(x + dx, foot + 1.6, infill, [1]);
    assert.ok(m !== null && m - g >= 0.25, `the mullion's face ${m === null ? 'missing' : (m - g).toFixed(2)} m in front of the glass`);
  }
});

test('A3: behind the glass the concourse reads: a warm plane under the transom, glowing warm after dark, and a row of barrier silhouettes in front of it', () => {
  const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
  const mats = infill.material as THREE.MeshLambertMaterial[];
  const k = mats.findIndex(m => m.customProgramCacheKey().includes('kx-front-infill-interior'));
  assert.ok(k > 0, 'the interior, its own material in the infill mesh (no new draw outside it)');
  const c = mats[k]!.color, glow = mats[k]!.userData.nightGlow as THREE.Color;
  assert.ok(c.r > c.b * 1.2 && glow && glow.r > glow.b, 'warm by day and after dark');
  const D = S.PORCH_DEPTH as { barriers: number; barrier: readonly [number, number] };
  for (const x of centres) {
    const z = hit(x + 0.3 + 3.4 / D.barriers, foot + 1.9, infill, [k]); // between the barriers' tops and the transom
    assert.ok(z !== null, `the interior plane in the opening at x ${x.toFixed(1)}`);
    // the barriers: their material (re-pinned arcade round 1: the figures' mid tone, the infill's eighth material, PORCH_TONES; was the frames') runs across the opening at their height, in front of the plane
    const xs: number[] = [];
    for (let dx = -3.3; dx <= 3.3; dx += 0.02) xs.push(x + dx);
    let runs = 0, prev = false;
    for (const px of xs) {
      const f = hit(px, foot + 0.3 + D.barrier[1] * 0.4, infill, [7]);
      const on = f !== null && f > z! + 1e-4 && f < z! + 0.02; // in front of the plane, on it
      if (on && !prev) runs++;
      prev = on;
    }
    assert.ok(runs >= D.barriers - 1, `${runs} barrier silhouettes across the opening`);
  }
});

test('A2: the corona overhangs the cornice\'s face by 0.25 m at most, so its shadow band at a 50 degree sun covers under half the face', () => {
  const C = S.FRONT_CORNICE as { out: number; height: number } | undefined;
  assert.ok(C, 'FRONT_CORNICE');
  const corona = (shed.FRONT_RELIEF as { corona: { height: number; out: number } }).corona;
  const overhang = corona.out - C.out, face = C.height - corona.height;
  const band = overhang * Math.tan((50 * Math.PI) / 180); // a sun due south of the front, 50 degrees up (ASSUMED: a summer afternoon's capture)
  assert.ok(overhang > 0.05 && overhang <= 0.25, `the corona overhangs by ${overhang.toFixed(2)} m`);
  assert.ok(band / face < 0.5, `its shadow ${band.toFixed(2)} m down the ${face.toFixed(2)} m face`);
  // and the built cornice's face is where FRONT_CORNICE puts it
  const stone = group.getObjectByName('shed-stone')!;
  const top = Math.max(...(group.getObjectByName('shed-front') as THREE.Mesh).geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
  const origin = group.localToWorld(new THREE.Vector3(X0 + 2, top - 0.6, 10)), dir = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 13).intersectObject(stone, true)[0];
  assert.ok(h && Math.abs(group.worldToLocal(h.point.clone()).z - C.out) < 0.01, `the cornice's face at z ${h ? group.worldToLocal(h.point.clone()).z.toFixed(2) : '-'}`);
});
