import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Batch, boxProjectUV, IN, material, PAINTERS, rng, TEXTURES, texelsPerMetre, texture, wallQuad } from '../src/materials.ts';
import type { TextureName } from '../src/materials.ts';

const names = Object.keys(TEXTURES) as TextureName[];
const close = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('every texture draws at a real-world scale: texels per metre inside its range, and square', () => {
  for (const name of names) {
    const spec = TEXTURES[name];
    const [tx, ty] = texelsPerMetre(spec);
    assert.ok(tx >= spec.density[0] && tx <= spec.density[1], `${name}: ${tx.toFixed(1)} texels/m across, allowed ${spec.density}`);
    assert.ok(ty >= spec.density[0] && ty <= spec.density[1], `${name}: ${ty.toFixed(1)} texels/m along, allowed ${spec.density}`);
    // a stretched texture has different density on its two axes
    assert.ok(Math.abs(tx / ty - 1) <= 0.06, `${name}: texels are ${tx.toFixed(1)} x ${ty.toFixed(1)} per metre, not square`);
    assert.ok(spec.tile[0] > 0 && spec.tile[1] > 0, `${name}: tile size`);
    assert.ok(spec.px[0] * spec.px[1] <= 1_100_000, `${name}: ${spec.px} px is more than a megapixel`);
    assert.ok(spec.source.length > 10, `${name}: says where its size comes from`);
  }
});

test('a brick tile is the real brick: 8 courses of 3 in, 4 periods of a 9 in stretcher, a 4.5 in header and two joints', () => {
  const [w, h] = TEXTURES.brick.tile;
  close(h / IN, 24, 1e-9); // 8 courses x 3 in (four courses to the foot)
  const period = 9 + 4.5 + 2 * 0.375; // inches
  close(w / IN, 4 * period, 1e-9);
  // one course is 0.0762 m: a brick-height texture band is 244 / 8 = 30.5 px
  const [, ty] = texelsPerMetre(TEXTURES.brick);
  close((3 * IN) * ty, TEXTURES.brick.px[1] / 8, 0.05);
});

test('the painters and the specs name the same textures', () => {
  assert.deepEqual(Object.keys(PAINTERS).sort(), names.slice().sort());
});

test('there is no document in Node: textures are null and materials fall back to the texture average', () => {
  for (const name of names) assert.equal(texture(name), null, name);
  const brick = material('brick') as THREE.MeshLambertMaterial;
  assert.equal(brick.map, null);
  assert.equal(brick.color.getHex(), TEXTURES.brick.average);
  assert.equal(material('brick'), material('brick'), 'materials are shared');
  assert.notEqual(material('brick'), material('stone'));
  assert.equal(material('roofGlass').transparent, true);
  assert.equal(material('roofGlass').depthWrite, false, 'glazing must not hide what is behind it');
  assert.equal(material('lining').side, THREE.BackSide, 'the lining is seen from inside');
});

test('the random numbers are the same every time, so screenshots compare', () => {
  const a = rng(11);
  const b = rng(11);
  const seq = Array.from({ length: 50 }, () => a());
  assert.deepEqual(seq, Array.from({ length: 50 }, () => b()));
  assert.ok(seq.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(seq, Array.from({ length: 50 }, ((c) => () => c())(rng(12))));
});

test('Batch.box: 24 vertices, unit outward normals, UVs in metres', () => {
  const b = new Batch();
  b.box([10, 20, 30], [2, 3, 4]);
  assert.equal(b.count, 24);
  assert.equal(b.indices.length, 36);
  for (let i = 0; i < b.count; i++) {
    const n: [number, number, number] = [b.normals[i * 3] as number, b.normals[i * 3 + 1] as number, b.normals[i * 3 + 2] as number];
    close(Math.hypot(...n), 1, 1e-9);
    const out: [number, number, number] = [(b.positions[i * 3] as number) - 10, (b.positions[i * 3 + 1] as number) - 20, (b.positions[i * 3 + 2] as number) - 30];
    assert.ok(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0, `vertex ${i}: normal points into the box`);
  }
  // the winding agrees with the stored normal (a front face seen from outside is counter-clockwise)
  for (let t = 0; t < b.indices.length; t += 3) {
    const p = [0, 1, 2].map((k) => {
      const i = b.indices[t + k] as number;
      return new THREE.Vector3(b.positions[i * 3], b.positions[i * 3 + 1], b.positions[i * 3 + 2]);
    }) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const face = new THREE.Vector3().crossVectors(p[1].clone().sub(p[0]), p[2].clone().sub(p[0])).normalize();
    const i0 = b.indices[t] as number;
    const stored = new THREE.Vector3(b.normals[i0 * 3], b.normals[i0 * 3 + 1], b.normals[i0 * 3 + 2]);
    assert.ok(face.dot(stored) > 0.999, `triangle ${t / 3}: winding disagrees with its normal`);
  }
  // a 2 x 3 x 4 box has faces of 2x3, 2x3, 4x3, 4x3, 2x4, 2x4 m: the UV extents are those metres
  const extents = new Set<string>();
  for (let f = 0; f < 6; f++) {
    const us = [0, 1, 2, 3].map((k) => b.uvs[(f * 4 + k) * 2] as number);
    const vs = [0, 1, 2, 3].map((k) => b.uvs[(f * 4 + k) * 2 + 1] as number);
    extents.add(`${Math.max(...us) - Math.min(...us)}x${Math.max(...vs) - Math.min(...vs)}`);
  }
  assert.deepEqual([...extents].sort(), ['2x3', '2x4', '4x3']);
});

test('Batch.box: skipped faces are left out, a turned box keeps its size', () => {
  const b = new Batch();
  b.box([0, 0, 0], [4, 1, 1], { skip: ['+x', '-x'] });
  assert.equal(b.count, 16);
  const turned = new Batch();
  turned.box([0, 0, 0], [4, 0.2, 0.2], { rotZ: Math.PI / 2 }); // lying along y
  const ys = Array.from({ length: turned.count }, (_, i) => turned.positions[i * 3 + 1] as number);
  close(Math.max(...ys) - Math.min(...ys), 4, 1e-9);
  const rot = new Batch();
  rot.box([0, 0, 0], [4, 0.2, 0.2], { rotY: Math.PI / 2 }); // lying along z
  const zs = Array.from({ length: rot.count }, (_, i) => rot.positions[i * 3 + 2] as number);
  close(Math.max(...zs) - Math.min(...zs), 4, 1e-9);
});

test('wallQuad: u runs along the wall in metres, v is the height, and it faces the right of travel', () => {
  const b = new Batch();
  const end = wallQuad(b, 0, 0, 3, 4, 1, 3.5, 2); // 5 m long wall
  close(end, 7, 1e-9);
  close(b.uvs[2] as number, 7, 1e-9); // second corner: u = 2 + 5
  close(b.uvs[5] as number, 3.5, 1e-9); // third corner: v = y1
  // walking east it faces south (+z): z grows southwards
  const e = new Batch();
  wallQuad(e, 0, 0, 10, 0, 0, 3);
  close(e.normals[2] as number, 1, 1e-9);
});

test('boxProjectUV: a box of 2 x 3 x 4 m gets UVs in metres on every face', () => {
  const g = boxProjectUV(new THREE.BoxGeometry(2, 3, 4));
  const uv = g.getAttribute('uv');
  let umax = 0;
  let vmax = 0;
  for (let i = 0; i < uv.count; i++) {
    umax = Math.max(umax, uv.getX(i) as number);
    vmax = Math.max(vmax, uv.getY(i) as number);
  }
  // box centred on the origin: each face's coordinates span its own size
  assert.ok(umax <= 2 + 1e-6 && vmax <= 2 + 1e-6, `uv beyond half a size: ${umax}, ${vmax}`);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i += 3) {
    const a = [0, 1, 2].map((k) => new THREE.Vector2(uv.getX(i + k), uv.getY(i + k)));
    const area2 = Math.abs((a[1]!.x - a[0]!.x) * (a[2]!.y - a[0]!.y) - (a[2]!.x - a[0]!.x) * (a[1]!.y - a[0]!.y));
    const q = [0, 1, 2].map((k) => new THREE.Vector3(p.getX(i + k), p.getY(i + k), p.getZ(i + k)));
    const world2 = new THREE.Vector3().crossVectors(q[1]!.clone().sub(q[0]!), q[2]!.clone().sub(q[0]!)).length();
    close(area2, world2, 1e-6); // UV area (metres squared, doubled) equals the triangle's real area: nothing is stretched
  }
});
