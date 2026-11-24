import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { GROUND_Y } from '../src/world.ts';
import * as shed from '../src/shed.ts';

// Round 26 (front-round-5 score, section 5): A2 the orders' steps splayed so they read square-on, the spandrel panels deeper;
// A3 the porches deeper, their interiors darker toward the sides and the ceiling.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const X0 = layout.spine - SHED_SPAN_WIDTH, R = SHED_SPAN_WIDTH / 2, sp = layout.springing;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const frontTop = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
const ray = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[]): { z: number; mat: number; nz: number } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 40).intersectObjects(targets, true)[0];
  if (!h) return null;
  return { z: group.worldToLocal(h.point.clone()).z, mat: h.face?.materialIndex ?? -1, nz: h.face?.normal.z ?? 0 };
};

test('A2: square-on, each order shows a band of its splayed step in the return tone inside a narrower face, each face a step behind the one outside it', () => {
  const F = shed.FRONT_RELIEF as typeof shed.FRONT_RELIEF & { splay: number };
  assert.ok(F.splay >= 0.15 && F.splay <= F.orderWidth - 0.1, `splay ${F.splay}`);
  for (const uc of [layout.spine - R, layout.spine + R]) for (const a of [Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4]) for (let i = 0; i < F.orders; i++) {
    const r0 = R + i * F.orderWidth, at = (r: number): [number, number, number] => [uc + r * Math.cos(a), sp + r * Math.sin(a), 5];
    const step = ray(at(r0 + F.splay / 2), [0, 0, -1], [front]);
    assert.ok(step && step.mat === 1 && step.z > i * F.orderStep + 0.02 && step.z < (i + 1) * F.orderStep - 0.02 && step.nz > 0.3,
      `order ${i}'s step at x ${uc.toFixed(1)}, ${(a * 180 / Math.PI).toFixed(0)} deg: ${step?.mat} at ${step?.z.toFixed(2)} facing ${step?.nz.toFixed(2)}`);
    const face = ray(at(r0 + (F.splay + F.orderWidth) / 2), [0, 0, -1], [front]);
    assert.ok(face && face.mat === 0 && Math.abs(face.z - (i + 1) * F.orderStep) < 0.01, `and its face: ${face?.mat} at ${face?.z.toFixed(2)}`);
  }
  // the opening's clear width kept: inside the inner order nothing of the front
  const clear = ray([layout.spine - R - (R - F.orderWidth) + 0.1, sp + 0.3, 5], [0, 0, -1], [front]);
  assert.ok(!clear || clear.z < -1.0, `the opening clear: ${clear?.z}`);
});

test('A2: each spandrel panel stands 0.55-0.7 m back of the wall\'s face', () => {
  const T = S.FRONT_TYMPANUM as { band: number; recess: number };
  assert.ok(T.recess >= 0.55 && T.recess <= 0.7, `recess ${T.recess}`);
  const yBand = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band;
  const panel = ray([X0 + 3.5, yBand - 1.0, 5], [0, 0, -1], [front]);
  assert.ok(panel && panel.mat === 0 && Math.abs(panel.z + T.recess) < 0.02, `the panel at ${panel?.z.toFixed(2)}`);
});

test('A3: the porch glass 1.0 m or more back; the interior darker toward its sides and its ceiling, and as light as before where the figures stand', () => {
  const D = S.PORCH_DEPTH as { glass: number; gradient: readonly [number, number]; figure: readonly [number, number] };
  assert.ok(D.glass >= 1.0 && D.glass <= 1.15, `glass ${D.glass}`);
  const mats = infill.material as THREE.MeshLambertMaterial[], map = mats[4]!.map as THREE.DataTexture;
  const { data: px, width, height } = map.image as { data: Uint8Array; width: number; height: number };
  assert.ok(width >= 8 && height >= 8, `a ${width}x${height} map`);
  const at = (u: number, v: number): number => px[(Math.round(v * (height - 1)) * width + Math.round(u * (width - 1))) * 4]! / 255;
  const mid = at(0.5, 0.8);
  assert.ok(at(0, 0.5) < 0.6 * at(0.5, 0.5) && at(1, 0.5) < 0.6 * at(0.5, 0.5), `sides ${at(0, 0.5).toFixed(2)} ${at(1, 0.5).toFixed(2)} against ${at(0.5, 0.5).toFixed(2)}`);
  assert.ok(at(0.5, 1) < 0.65 * mid, `ceiling ${at(0.5, 1).toFixed(2)} against ${mid.toFixed(2)}`);
  const lo = D.gradient[0], hi = D.gradient[1];
  for (const u of [0.33, 0.78]) for (const v of [0, 0.4, 0.8]) assert.ok(Math.abs(at(u, v) - (lo + (hi - lo) * Math.min(1, v / 0.85))) < 0.04, `behind a figure at ${u}, ${v}: ${at(u, v).toFixed(2)}`);
  // the interior on the glass, at that depth, over the figures' heads
  const A = shed.SOUTH_FRONT_ARCADES, x = shed.southFrontArcadeCentres(4 * R, shed.TOWER_SIZE)[0]! + layout.spine - 2 * R;
  const g = ray([x + 0.3, GROUND_Y + A.footAboveGround + 2.1, 5], [0, 0, -1], [infill]);
  assert.ok(g && g.mat === 4 && Math.abs(g.z + D.glass) < 0.01, `the interior: ${g?.mat} at ${g?.z.toFixed(2)}`);
});
