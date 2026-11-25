import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { buildingNightMaterialsOf, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';

// Round 27 (front-round-6 score, section 5): A2 the orders' faces light with their splayed steps dark, the spandrel panels' heads in the return tone;
// A3 the porch interiors darker by day, their night glow as it was.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const X0 = layout.spine - SHED_SPAN_WIDTH, R = SHED_SPAN_WIDTH / 2, sp = layout.springing;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const S = shed as unknown as Record<string, unknown>;
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const frontTop = Math.max(...front.geometry.getAttribute('position').array.filter((_, i) => i % 3 === 1));
const ray = (o: [number, number, number], targets: THREE.Object3D[]): { z: number; mat: number; uv: THREE.Vector2 | undefined; nz: number } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, 40).intersectObjects(targets, true)[0];
  return h ? { z: group.worldToLocal(h.point.clone()).z, mat: h.face?.materialIndex ?? -1, uv: h.uv, nz: h.face?.normal.z ?? 0 } : null;
};
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

test('A2: the orders\' faces are a lighter brick than the front, by day and at night, their splayed steps still in the return tone', () => {
  const L = S.FRONT_ORDER_FACE as number, F = shed.FRONT_RELIEF;
  assert.ok(L >= 1.15 && L <= 1.4, `FRONT_ORDER_FACE ${L}`);
  const day = front.material as THREE.MeshLambertMaterial[], night = [buildingNightMaterialsOf(front)!.night].flat() as THREE.MeshLambertMaterial[];
  assert.ok(day.length === 3 && night.length === 3, `${day.length} day, ${night.length} night materials`);
  const brick = material('brickFoot') as THREE.MeshLambertMaterial;
  assert.ok(day[2]!.map === brick.map && day[2]!.customProgramCacheKey() === brick.customProgramCacheKey(), 'the faces on the brick\'s texture and program');
  for (const [f, o, when] of [[day[0]!, day[2]!, 'by day'], [night[0]!, night[2]!, 'at night']] as const)
    assert.ok(Math.abs(lum(o.color) / lum(f.color) - L) < 0.02, `${when}: the order faces ${(lum(o.color) / lum(f.color)).toFixed(2)} of the front`);
  for (const uc of [layout.spine - R, layout.spine + R]) for (const a of [Math.PI / 2, Math.PI / 4, (3 * Math.PI) / 4]) for (let i = 0; i < F.orders; i++) {
    const r0 = R + i * F.orderWidth, at = (r: number): [number, number, number] => [uc + r * Math.cos(a), sp + r * Math.sin(a), 5];
    const face = ray(at(r0 + (F.splay + F.orderWidth) / 2), [front]), step = ray(at(r0 + F.splay / 2), [front]);
    assert.ok(face && face.mat === 2, `order ${i}'s face at ${(a * 180 / Math.PI).toFixed(0)} deg: ${face?.mat}`);
    assert.ok(step && step.mat === 1, `order ${i}'s step at ${(a * 180 / Math.PI).toFixed(0)} deg: ${step?.mat}`);
  }
});

test('A2: each spandrel panel\'s head, under the frame\'s band, is in the return tone square-on; the panel below it in the brick', () => {
  const T = S.FRONT_TYMPANUM as { band: number; recess: number }, Hd = S.FRONT_PANEL_HEAD as { height: number };
  assert.ok(Hd.height >= 0.25 && Hd.height <= 0.6, `head ${Hd.height}`);
  const yH = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band + 0.05;
  for (const xa of [X0 + 2.5, layout.spine + shed.TOWER_SIZE / 2 + 1.5, layout.spine - shed.TOWER_SIZE / 2 - 1.5, X0 + 4 * R - 2.5]) {
    const head = ray([xa, yH - Hd.height / 2, 5], [front]), below = ray([xa, yH - Hd.height - 0.3, 5], [front]);
    assert.ok(head && head.mat === 1 && Math.abs(head.z + T.recess) < 0.02, `the head at x ${xa.toFixed(1)}: ${head?.mat} at ${head?.z.toFixed(2)}`);
    assert.ok(below && below.mat === 0 && Math.abs(below.z + T.recess) < 0.02, `under it: ${below?.mat} at ${below?.z.toFixed(2)}`);
  }
});

test('A3: the porch interior is darker by day by PORCH_DEPTH.dayDark, back to its full tone at night, its night glow unchanged', () => {
  const D = S.PORCH_DEPTH as { dayDark: number };
  assert.ok(D.dayDark >= 0.4 && D.dayDark <= 0.65, `dayDark ${D.dayDark}`);
  const m = (infill.material as THREE.MeshLambertMaterial[])[4]!;
  assert.equal(Number(m.defines?.KX_DAY_DARK), D.dayDark, 'the interior defines KX_DAY_DARK');
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <emissivemap_fragment>' };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
  const at = shader.fragmentShader.indexOf('#ifdef KX_DAY_DARK\ndiffuseColor.rgb *= mix( KX_DAY_DARK, 1.0, uWinNight );');
  assert.ok(at > 0, 'the diffuse scaled by day, not at night');
  const [c, g] = shed.FRONT_NIGHT.glass;
  assert.ok((m.userData.nightGlow as THREE.Color).equals(new THREE.Color(c).multiplyScalar(g)), 'the night glow the glass\'s own');
});

test('A2 (round 27b): each panel head carries the brick map in metres as the panel\'s own face does, its normal out toward the light', () => {
  const T = S.FRONT_TYMPANUM as { band: number; recess: number }, Hd = S.FRONT_PANEL_HEAD as { height: number };
  const yH = frontTop - 0.9 - 0.25 - 0.25 - 0.1 - T.band + 0.05;
  const pos = front.geometry.getAttribute('position'), nrm = front.geometry.getAttribute('normal');
  for (const xa of [X0 + 2.5, layout.spine + shed.TOWER_SIZE / 2 + 1.5, layout.spine - shed.TOWER_SIZE / 2 - 1.5, X0 + 4 * R - 2.5]) {
    const a = ray([xa, yH - 0.1, 5], [front]), b = ray([xa + 0.7, yH - Hd.height + 0.1, 5], [front]), below = ray([xa, yH - Hd.height - 0.3, 5], [front]);
    assert.ok(a && b && below && a.mat === 1 && a.uv && b.uv && below.uv, `the head at x ${xa.toFixed(1)}`);
    // the panel's face maps 1 m to 1 unit of uv: so must the head, and on the same grid
    assert.ok(Math.abs((b.uv!.x - a.uv!.x) - 0.7) < 0.01 && Math.abs((a.uv!.y - b.uv!.y) - (Hd.height - 0.2)) < 0.01, `the head's uv runs with it: ${a.uv!.toArray()} to ${b.uv!.toArray()}`);
    assert.ok(Math.abs(a.uv!.x - below.uv!.x) < 0.01 && Math.abs((a.uv!.y - below.uv!.y) - (Hd.height + 0.2)) < 0.01, `on the panel's grid: ${a.uv!.toArray()} over ${below.uv!.toArray()}`);
    assert.ok(a.nz > 0.99, `its face turned out (${a.nz.toFixed(2)})`);
  }
  // and its vertex normals out too (the lighting's, not only the winding's)
  const grp = front.geometry.groups.find(g => g.materialIndex === 1)!;
  let n = 0;
  for (let k = grp.start; k < grp.start + grp.count; k++) {
    const y = pos.getY(k), z = pos.getZ(k);
    if (Math.abs(z + T.recess - 0.005) < 1e-4 && y > yH - Hd.height - 1e-3 && y < yH + 1e-3) { n++; assert.ok(nrm.getZ(k) > 0.99, `a head vertex's normal ${nrm.getZ(k).toFixed(2)}`); }
  }
  assert.ok(n >= 24, `${n} head vertices`);
});
