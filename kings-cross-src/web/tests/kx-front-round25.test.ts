import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout, shedVaultCentres } from '../../core/station.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';

// Round 25 (front-round-4 score, section 5): A2 the orders' steps and the spandrel panels' reveals in a darker return tone, the panels 0.4 m back;
// A3 the fascia's night glow following its pale lettering.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
// Re-pinned 2026-11-25 (B2, partner-approved: the vaults spring from the spine wall's two faces, a valley gutter between): each great arch's radius is
// SHED_VAULT_RADIUS (the published half span less a quarter of the valley) and its centre shedVaultCentres(layout), a quarter of the valley out from the spine -/+ R before.
const [cw, ce] = shedVaultCentres(layout);
// Re-pinned 2026-11-26 (front phase 1, signed off: the great windows decoupled from the vaults): each arch's radius and springing are the window's,
// shed.FRONT_WINDOW (19.5 m span, sill 7.5 m over the forecourt), on the same centres; were SHED_VAULT_RADIUS and layout.springing
const X0 = layout.spine - SHED_SPAN_WIDTH, R = shed.FRONT_WINDOW_R, sp = shed.FRONT_WINDOW_SPRING;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const frontTop = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
const ray = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[]): { y: number; z: number; name: string; mat: number } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 40).intersectObjects(targets, true)[0];
  if (!h) return null;
  const p = group.worldToLocal(h.point.clone());
  return { y: p.y, z: p.z, name: h.object.name, mat: h.face?.materialIndex ?? -1 };
};
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const RET = S.FRONT_RETURN as number;

test('A2: the front\'s returns are a darker shade of its brick, by day and at night, on the brick\'s own texture and program', () => {
  assert.ok(RET >= 0.4 && RET <= 0.7, `FRONT_RETURN ${RET}`);
  const day = front.material as THREE.MeshLambertMaterial[], night = [buildingNightMaterialsOf(front)!.night].flat() as THREE.MeshLambertMaterial[];
  assert.ok(Array.isArray(day) && day.length >= 2 && night.length === day.length, 'faces and returns'); // re-pinned round 27: a third, the orders' lighter faces (FRONT_ORDER_FACE, kx-front-round27)
  const brick = material('brickFoot') as THREE.MeshLambertMaterial;
  assert.equal(day[0], brick, 'the faces in the brick itself');
  assert.ok(day[1]!.map === brick.map && day[1]!.customProgramCacheKey() === brick.customProgramCacheKey(), 'the returns on its texture and program');
  for (const [f, r, when] of [[day[0]!, day[1]!, 'by day'], [night[0]!, night[1]!, 'at night']] as const)
    assert.ok(Math.abs(lum(r.color) / lum(f.color) - RET) < 0.01, `${when}: returns ${(lum(r.color) / lum(f.color)).toFixed(2)} of the faces`);
  assert.ok(night[1]!.customProgramCacheKey() !== night[0]!.customProgramCacheKey(), 'the returns\' night wash its own program');
});

test('A2: each order\'s step face is a return: under the crown, between one order\'s face and the next, a ray up meets the darker group', () => {
  const F = shed.FRONT_RELIEF;
  for (const uc of [cw, ce]) for (let i = 1; i < F.orders; i++) {
    const z = shed.frontOrderZ(i) - F.orderStep / 2; // in front of order i - 1's face, behind order i's (re-pinned round A2: the faces at frontOrderZ)
    const up = ray([uc, sp + R - 1.0, z], [0, 1, 0], [front]);
    const sy = (F as typeof F & { splay?: number }).splay ?? 0; // re-pinned round 26 (front-round-5 score, A2): the step splayed, so halfway up it stands half the splay out from its foot
    assert.ok(up && up.mat === 1 && Math.abs(up.y - (sp + R + i * F.orderWidth + sy / 2)) < 0.05, `order ${i}'s step face over x ${uc.toFixed(1)}: ${up?.mat} at ${up?.y.toFixed(2)}`);
    const face = ray([uc, sp + R + i * F.orderWidth + (sy + F.orderWidth) / 2, 5], [0, 0, -1], [front]); // re-pinned round 26: the face's middle, outside the splayed step
    assert.ok(face && face.mat !== 1 && Math.abs(face.z - shed.frontOrderZ(i)) < 0.02, // re-pinned round 27: the orders' faces in their own lighter brick (mat 2, kx-front-round27), still not the return tone
      `and its face in the brick (${face?.mat} at ${face?.z.toFixed(2)})`);
  }
});

test('A2: each spandrel panel stands 0.35 m or more back, its reveal in the return tone', () => {
  const T = S.FRONT_TYMPANUM as { band: number; recess: number };
  assert.ok(T.recess >= 0.35, `recess ${T.recess}`);
  const yBand = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band;
  for (const xa of [X0 + 1.0, layout.spine + shed.TOWER_SIZE / 2]) {
    const panel = ray([xa + 2.5, yBand - 1.0, 5], [0, 0, -1], [front]);
    assert.ok(panel && panel.mat === 0 && Math.abs(panel.z + T.recess) < 0.02, `the panel at ${panel?.z.toFixed(2)}`);
    const top = ray([xa + 2.5, yBand - 1.0, -T.recess / 2], [0, 1, 0], [front]);
    assert.ok(top && top.mat === 1 && top.y > yBand - 0.01, `its reveal over it: ${top?.mat} at ${top?.y.toFixed(2)}`);
  }
});

test('A3: the fascia glows by its map at night, a pale light, so its lettering reads light on the navy', () => {
  const N = S.FRONT_NIGHT as Record<string, readonly [number, number]>;
  const hsl = { h: 0, s: 0, l: 0 }; new THREE.Color(N.fascia![0]).getHSL(hsl);
  assert.ok(hsl.l > 0.8, `FRONT_NIGHT.fascia pale (${hsl.l.toFixed(2)})`);
  const fascia = (infill.material as THREE.MeshLambertMaterial[])[2]!;
  assert.ok(fascia.defines?.KX_GLOW_BY_MAP !== undefined, 'its glow follows its map');
});
