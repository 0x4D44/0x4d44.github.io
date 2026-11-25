import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
import { buildingNightMaterialsOf } from '../src/materials.ts';

// Round A2 (gap scan 2, A2 8.5): each great lunette arch in four brick orders stepping back about 0.4 m apiece, each step a soffit that casts an
// arc shadow by day (R-kx-front-a/b), the glazing screen still recessed behind the innermost order, with no new triangle. Measured on the geometry.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2, sp = layout.springing, W = shed.FRONT_RELIEF.orderWidth;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const front = group.getObjectByName('shed-front') as THREE.Mesh;
const glass = group.getObjectByName('shed-front-glass') as THREE.Mesh;
const bars = group.getObjectByName('shed-front-bars') as THREE.Mesh;
const masonry = ['shed-front', 'shed-stone', 'shed-brick'].map(n => group.getObjectByName(n)!).filter(Boolean);
const centres = [layout.spine - R, layout.spine + R];
type Hit = { p: THREE.Vector3; n: THREE.Vector3; name: string };
const cast = (o: [number, number, number], d: [number, number, number], targets: THREE.Object3D[], far = 40): Hit | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).normalize().transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, far).intersectObjects(targets, true)[0];
  if (!h) return null;
  const n = h.face!.normal.clone().transformDirection(h.object.matrixWorld).transformDirection(group.matrixWorld.clone().invert());
  return { p: group.worldToLocal(h.point.clone()), n, name: h.object.name };
};
const at = (uc: number, r: number, a: number, z: number): [number, number, number] => [uc + r * Math.cos(a), sp + r * Math.sin(a), z];
const faceZ = (uc: number, r: number, a: number): number | null => cast(at(uc, r, a, 5), [0, 0, -1], [front])?.p.z ?? null;
/** The reveal's face levels from the glass outward along angle a: plateaus of one depth, five samples (0.05 m) or more. */
const levels = (uc: number, a: number): { z: number; r0: number; r1: number }[] => {
  const out: { z: number; r0: number; r1: number }[] = [];
  let run: { z: number; r0: number; r1: number; n: number } | null = null;
  for (let r = R - W + 0.03; r <= R + 3 * W - 0.03; r += 0.01) {
    const z = faceZ(uc, r, a), q = z === null ? null : Math.round(z * 100) / 100;
    if (q !== null && run && run.z === q) { run.r1 = r; run.n++; continue; }
    if (run && run.n >= 5) out.push(run);
    run = q === null ? null : { z: q, r0: r, r1: r, n: 1 };
  }
  if (run && run.n >= 5) out.push(run);
  // a level within 0.05 m of the one inside it is that face's own splayed edge, not an order
  return out.filter((l, i) => i === 0 || Math.abs(l.z - out[i - 1]!.z) >= 0.05);
};
const local = (m: THREE.Mesh): THREE.Vector3[] => {
  const pos = m.geometry.getAttribute('position'), inv = group.matrixWorld.clone().invert(), toLocal = inv.multiply(m.matrixWorld), out: THREE.Vector3[] = [];
  for (let k = 0; k < pos.count; k++) out.push(new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(toLocal));
  return out;
};

test('A2 orders: four stepped orders round each great arch, each step 0.35-0.45 m, the reveal 1.1-1.4 m deep in all, the innermost behind the wall\'s face', () => {
  for (const uc of centres) for (const a of [Math.PI * 0.3, Math.PI * 0.5, Math.PI * 0.7]) {
    const ls = levels(uc, a), tag = `x ${uc.toFixed(1)}, ${(a * 180 / Math.PI).toFixed(0)} deg: ${ls.map(l => l.z.toFixed(2)).join(' ')}`;
    assert.equal(ls.length, 4, `four face levels, ${tag}`);
    for (let i = 1; i < ls.length; i++) {
      const step = ls[i]!.z - ls[i - 1]!.z;
      assert.ok(step >= 0.35 && step <= 0.45, `step ${i} ${step.toFixed(2)} m, ${tag}`);
    }
    const depth = ls[3]!.z - ls[0]!.z;
    assert.ok(depth >= 1.1 && depth <= 1.4, `the reveal ${depth.toFixed(2)} m deep, ${tag}`);
    assert.ok(ls[0]!.z <= -0.2, `the innermost order stands back of the wall's face, ${tag}`);
    assert.ok(ls[3]!.z <= shed.FRONT_RELIEF.impost.out - 0.03, `the outer order behind the impost it stands on, ${tag}`);
  }
});

test('A2 orders: round each arch every order\'s face is foremost: no band, string or dressing stands in front of it, the crown included', () => {
  for (const uc of centres) for (const a of [0.15, 0.3, 0.5, 0.7, 0.85].map(f => f * Math.PI)) for (let k = 0; k < 3; k++) {
    const h = cast(at(uc, R + (k + 0.75) * W, a, 5), [0, 0, -1], masonry);
    assert.ok(h && h.name === 'shed-front' && h.n.z > 0.9, `order ${k} at ${(a * 180 / Math.PI).toFixed(0)} deg, x ${uc.toFixed(1)}: ${h?.name} at ${h?.p.z.toFixed(2)}`);
  }
});

test('A2 orders: each step is a soffit, a face turned to the arch\'s centre 0.35 m or more deep, at the order\'s foot', () => {
  for (const uc of centres) for (const a of [Math.PI * 0.35, Math.PI * 0.5, Math.PI * 0.65]) {
    const ls = levels(uc, a);
    assert.equal(ls.length, 4);
    for (let k = 1; k < 4; k++) {
      const zLo = ls[k - 1]!.z, zHi = ls[k]!.z, rFoot = R + (k - 1) * W;
      let seen = 0;
      for (const z of [zLo + 0.04, (zLo + zHi) / 2, zHi - 0.04]) {
        const h = cast(at(uc, R - 1.5, a, z), [Math.cos(a), Math.sin(a), 0], [front], 3);
        const radial = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
        assert.ok(h, `step ${k} at z ${z.toFixed(2)}: a ray out from the centre meets it`);
        const r = Math.hypot(h.p.x - uc, h.p.y - sp);
        assert.ok(Math.abs(r - rFoot) < 0.2 && h.n.dot(radial) < -0.8, `step ${k} at z ${z.toFixed(2)}: met at r - R ${(r - R).toFixed(2)}, facing ${h.n.dot(radial).toFixed(2)}`);
        seen++;
      }
      assert.ok(seen === 3 && zHi - zLo >= 0.35, `step ${k} ${(zHi - zLo).toFixed(2)} m deep`);
    }
  }
});

test('A2 orders: with the sun 45 degrees up in the south, each step casts an arc shadow onto the face inside it, and the fourth order\'s face clear of it is lit', () => {
  const e = (45 * Math.PI) / 180, sun: [number, number, number] = [0, Math.sin(e), Math.cos(e)];
  for (const uc of centres) for (const a of [Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3]) for (let k = 0; k < 3; k++) {
    const rFoot = R + k * W, probe = (r: number): Hit | null => {
      const z = faceZ(uc, r, a);
      assert.ok(z !== null, `a face at r - R ${(r - R).toFixed(2)}`);
      return cast(at(uc, r, a, z + 0.005), sun, masonry, 3);
    };
    assert.ok(probe(rFoot - 0.05), `order ${k}'s step shades the face just inside it at ${(a * 180 / Math.PI).toFixed(0)} deg, x ${uc.toFixed(1)}`);
    // round A2b: the splay back at 0.22, so the shadow at 45 degrees covers the narrower order faces at the crown; the fourth order's is wider
    if (k === 0) assert.ok(!probe(rFoot - 0.35), `and the face clear of the shadow is lit at ${(a * 180 / Math.PI).toFixed(0)} deg`);
  }
});

test('A2 orders: the glazing screen and its bars stand behind the innermost order, and nothing of the front lies in the clear opening (the tower hides where the two arches\' outer orders cross)', () => {
  const inner = Math.min(...centres.map(uc => levels(uc, Math.PI / 2)[0]!.z));
  const inArch = (v: THREE.Vector3): boolean => v.y > sp + 0.05 && centres.some(uc => Math.hypot(v.x - uc, v.y - sp) < R + 0.05);
  const gz = Math.max(...local(glass).filter(inArch).map(v => v.z)), bz = Math.max(...local(bars).filter(inArch).map(v => v.z));
  assert.ok(gz <= inner - 0.15, `the glass at ${gz.toFixed(2)}, the innermost order's face at ${inner.toFixed(2)}`);
  assert.ok(bz <= inner - 0.05, `the bars to ${bz.toFixed(2)}`);
  const intrude = local(front).filter(v => v.y > sp + 0.05 && Math.abs(v.x - layout.spine) > shed.TOWER_SIZE / 2 && centres.some(uc => Math.hypot(v.x - uc, v.y - sp) < R - W - 0.01));
  assert.equal(intrude.length, 0, `front vertices inside the clear opening: ${intrude.length}`);
  for (const uc of centres) for (const a of [0.2, 0.5, 0.8].map(f => f * Math.PI)) {
    const h = cast(at(uc, R - W - 0.15, a, 5), [0, 0, -1], [front, glass]);
    assert.ok(h && h.name === 'shed-front-glass', `through the opening the glass first: ${h?.name}`);
  }
});

test('A2 orders: each return round the arches is a band 0.17 m or more wide square-on, painted in a contact shade by day; the night wash and the porches\' reveals unshaded', () => {
  const F = shed.FRONT_RELIEF, mats = front.material as THREE.MeshLambertMaterial[], night = [buildingNightMaterialsOf(front)!.night].flat() as THREE.MeshLambertMaterial[];
  const S = (shed as unknown as { FRONT_ORDER_SHADE: number }).FRONT_ORDER_SHADE;
  assert.ok(S >= 0.4 && S <= 0.6, `FRONT_ORDER_SHADE ${S}`);
  assert.ok(mats[1]!.vertexColors && !mats[0]!.vertexColors && !mats[2]!.vertexColors && !night[1]!.vertexColors, 'the day returns alone take the vertex colour');
  const col = front.geometry.getAttribute('color'), shadeAt = (h: THREE.Intersection): number => col.getX(h.face!.a);
  const hit = (o: [number, number, number]): THREE.Intersection | undefined =>
    new THREE.Raycaster(group.localToWorld(new THREE.Vector3(...o)), new THREE.Vector3(0, 0, -1).transformDirection(group.matrixWorld), 0, 40).intersectObject(front)[0];
  // the band measured along the radius (the arcs are chords, so it sits up to 0.15 m inside the true circle mid-chord), every sample of it shaded
  for (const uc of centres) for (const a of [0.2, 0.5, 0.8].map(f => f * Math.PI)) for (let k = 1; k < F.orders; k++) {
    let band = 0;
    for (let d = -0.2; d <= 0.3; d += 0.01) {
      const h = hit(at(uc, R + k * W + d, a, 5));
      if (h?.face!.materialIndex !== 1) continue;
      band++;
      assert.ok(Math.abs(shadeAt(h) - S) < 1e-6, `x ${uc.toFixed(1)} order ${k}'s return ${d.toFixed(2)} m out at ${(a * 180 / Math.PI).toFixed(0)} deg: shade ${shadeAt(h)}`);
    }
    assert.ok(band >= 17, `x ${uc.toFixed(1)} order ${k}'s return ${band} cm wide square-on at ${(a * 180 / Math.PI).toFixed(0)} deg`);
  }
  // the opening's own soffit over the fourth order, met from the arch's centre
  for (const uc of centres) {
    const h = new THREE.Raycaster(group.localToWorld(new THREE.Vector3(uc, sp + R - 1, -0.1)), new THREE.Vector3(0, 1, 0).transformDirection(group.matrixWorld), 0, 3).intersectObject(front)[0];
    assert.ok(h && h.face!.materialIndex === 1 && Math.abs(shadeAt(h) - S) < 1e-6, `the soffit over the fourth order: ${h?.face?.materialIndex}, shade ${h && shadeAt(h)}`);
  }
  // a porch opening's reveal, under the springing: a return, unshaded
  const x = shed.southFrontArcadeCentres(4 * R, shed.TOWER_SIZE)[0]! + layout.spine - 2 * R;
  const p = new THREE.Raycaster(group.localToWorld(new THREE.Vector3(x, layout.springing - 4, -0.3)), new THREE.Vector3(-1, 0, 0).transformDirection(group.matrixWorld), 0, 8).intersectObject(front)[0];
  assert.ok(p && p.face!.materialIndex === 1 && shadeAt(p) === 1, `a porch reveal unshaded: ${p?.face?.materialIndex} ${p && shadeAt(p)}`);
});

test('A2 orders: no new triangle: the front mesh keeps its count', () => {
  const tris = front.geometry.getAttribute('position').count / 3;
  assert.equal(tris, 4204, `shed-front ${tris} triangles`);
});
