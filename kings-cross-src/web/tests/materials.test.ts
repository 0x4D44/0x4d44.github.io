import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Batch, boxProjectUV, CITY_PAINTERS, cityMaterial, IN, material, mergeParts, PAINTERS, part, rgb, rng, TEXTURES, terrainMaterial, texelsPerMetre, texture, wallQuad, windowKey } from '../src/materials.ts';
import type { PartMap, TextureName, V3 } from '../src/materials.ts';
import { Glsl } from './glsl.ts';

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

// ---- the one mesh builder: every station module builds on Batch -----------------------------------

/** One triangle of a batch: its corners, the normal stored on its first corner, the normal its winding gives. */
function triOf(b: Batch, t: number): { p: V3[]; stored: V3; geometric: V3 } {
  const ix = [0, 1, 2].map((k) => b.indices[t * 3 + k] as number);
  const p = ix.map((i): V3 => [b.positions[i * 3] as number, b.positions[i * 3 + 1] as number, b.positions[i * 3 + 2] as number]);
  const [a, c, d] = p as [V3, V3, V3];
  const u: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const w: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const g: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const l = Math.hypot(...g) || 1;
  const i0 = ix[0] as number;
  return { p, stored: [b.normals[i0 * 3] as number, b.normals[i0 * 3 + 1] as number, b.normals[i0 * 3 + 2] as number], geometric: [g[0] / l, g[1] / l, g[2] / l] };
}
const trisOf = (b: Batch): ReturnType<typeof triOf>[] => Array.from({ length: b.triangles }, (_, t) => triOf(b, t));
/** A unit square in the z = 0 plane, counter-clockwise seen from +z. */
const SQUARE: V3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];

test('Batch.poly: facing turns the winding and the stored normal to face the viewer; normal stores the one given and turns the winding to match', () => {
  for (const sign of [1, -1]) {
    for (const opts of [{ facing: [0, 0, sign] as V3 }, { normal: [0, 0, sign] as V3 }]) {
      const b = new Batch();
      b.poly(SQUARE, undefined, opts);
      const ts = trisOf(b);
      assert.equal(ts.length, 2, 'a quad is two triangles');
      for (const t of ts) {
        assert.ok(t.geometric[2] * sign > 0.999, `winding faces ${sign} (${Object.keys(opts)[0]})`);
        t.stored.forEach((v, k) => close(v, [0, 0, sign][k] as number, 1e-12)); // the stored normal (a turned one may be -0, which is fine)
        assert.deepEqual(t.p[0], SQUARE[0], 'the fan starts at the first corner whichever way it is turned');
      }
    }
  }
  // with neither, the winding is kept and the normal is the one it gives
  const plain = new Batch();
  plain.poly(SQUARE);
  for (const t of trisOf(plain)) assert.ok(t.geometric[2] > 0.999 && t.stored[2] > 0.999);
  // a normal is stored exactly as given, not re-derived (a hair off the face's own is kept)
  const tilt = new Batch();
  tilt.poly(SQUARE, undefined, { normal: [0, 0.6, 0.8] });
  assert.deepEqual(triOf(tilt, 0).stored, [0, 0.6, 0.8]);
});

test('Batch.poly: per-corner normals are kept for smooth shading, and the winding turns to face their sum', () => {
  const b = new Batch();
  const normals: V3[] = [[-0.6, 0, -0.8], [0.6, 0, -0.8], [0.6, 0, -0.8], [-0.6, 0, -0.8]];
  b.poly(SQUARE, undefined, { normals });
  for (const t of trisOf(b)) assert.ok(t.geometric[2] < -0.999, 'turned to face -z, where the normals point');
  // each vertex still carries the normal of the corner it came from
  for (let i = 0; i < b.count; i++) {
    const at = [b.positions[i * 3], b.positions[i * 3 + 1], b.positions[i * 3 + 2]];
    const k = SQUARE.findIndex((q) => q[0] === at[0] && q[1] === at[1] && q[2] === at[2]);
    assert.deepEqual([b.normals[i * 3], b.normals[i * 3 + 1], b.normals[i * 3 + 2]], normals[k], `corner ${k}`);
  }
});

test('Batch.tri and Batch.fan: a sliver with no area is dropped, a fan is one triangle per corner past the second with a normal each', () => {
  const b = new Batch();
  b.tri([0, 0, 0], [1, 0, 0], [2, 0, 0]);
  assert.equal(b.triangles, 0, 'three points in a line draw nothing');
  b.tri([0, 0, 0], [1, 0, 0], [0, 1, 0], undefined, [0, 0, -1]);
  assert.equal(b.triangles, 1);
  assert.ok(triOf(b, 0).geometric[2] < -0.999, 'turned to face the hint');
  const f = new Batch();
  f.fan([[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0], [-1, 1, 0]], [0, 0, -1], (p) => [p[0], p[1]]);
  assert.equal(f.triangles, 3, 'a pentagon');
  for (const t of trisOf(f)) assert.ok(t.geometric[2] < -0.999 && t.stored[2] < -0.999);
  for (let i = 0; i < f.count; i++) assert.deepEqual([f.uvs[i * 2], f.uvs[i * 2 + 1]], [f.positions[i * 3], f.positions[i * 3 + 1]], 'uvOf gives each corner its UV');
  // a fan with a repeated corner loses the sliver it makes and keeps the rest
  const g = new Batch();
  g.fan([[0, 0, 0], [1, 0, 0], [1, 0, 0], [1, 1, 0]]);
  assert.equal(g.triangles, 1);
});

test('Batch options: a coloured batch keeps a colour per vertex (white unless a face says otherwise), the others none; uv false builds no UVs', () => {
  const plain = new Batch();
  plain.poly(SQUARE, SQUARE.map((p): [number, number] => [p[0], p[1]]), { color: [1, 0, 0] });
  const g = plain.build();
  assert.ok(g.getAttribute('uv'), 'UVs by default');
  assert.equal(g.getAttribute('color'), undefined, 'no colour attribute unless the batch is coloured');
  const col = new Batch({ colored: true });
  col.poly(SQUARE, undefined, { color: [1, 0, 0] });
  col.poly(SQUARE);
  const cg = col.build();
  assert.equal(cg.getAttribute('color').count, 8);
  assert.deepEqual([...cg.getAttribute('color').array], [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const bare = new Batch({ uv: false, colored: true });
  bare.box([0, 0, 0], [1, 1, 1], { color: [0, 1, 0] });
  const bg = bare.build();
  assert.equal(bg.getAttribute('uv'), undefined, 'no UV attribute');
  assert.equal(bare.uvs.length, 0);
  assert.ok([...bg.getAttribute('color').array].every((v, i) => v === (i % 3 === 1 ? 1 : 0)), 'a box takes one colour on every face');
});

test('Batch.aabb: corners in either order make the same box, the underside can be left out, a colour goes on every corner', () => {
  const a = new Batch({ colored: true });
  a.aabb(0, 0, 0, 1, 2, 3, [0.5, 0.25, 0.125]);
  const b = new Batch({ colored: true });
  b.aabb(1, 2, 3, 0, 0, 0, [0.5, 0.25, 0.125]); // opposite corner first: still outward faces
  for (const m of [a, b]) {
    assert.equal(m.count, 24);
    for (const t of trisOf(m)) {
      const c = [0, 1, 2].map((k) => t.p.reduce((s, q) => s + (q[k] as number), 0) / 3);
      assert.ok(t.geometric[0] * ((c[0] as number) - 0.5) + t.geometric[1] * ((c[1] as number) - 1) + t.geometric[2] * ((c[2] as number) - 1.5) > 0, 'faces outward');
    }
    assert.deepEqual([...m.colors.slice(0, 3)], [0.5, 0.25, 0.125]);
  }
  const open = new Batch();
  open.aabb(0, 0, 0, 1, 1, 1, undefined, true);
  assert.equal(open.count, 20);
  assert.ok(trisOf(open).every((t) => t.stored[1] > -0.5), 'no face looks down');
});

test('Batch.append: the other batch follows, re-indexed; colour and UVs follow the receiving batch', () => {
  const a = new Batch({ colored: true });
  a.poly(SQUARE, undefined, { color: [1, 0, 0] });
  const b = new Batch();
  b.poly(SQUARE.map((p): V3 => [p[0] + 5, p[1], p[2]]), SQUARE.map((p): [number, number] => [p[0], p[1]]));
  a.append(b);
  assert.equal(a.count, 8);
  assert.equal(a.triangles, 4);
  assert.deepEqual(a.indices.slice(6), [4, 5, 6, 4, 6, 7], 're-indexed past the first batch');
  assert.deepEqual([...a.colors.slice(12, 15)], [1, 1, 1], 'an uncoloured batch comes in white');
  assert.equal(a.positions[12], 5);
  assert.deepEqual([a.uvs[8], a.uvs[9]], [0, 0]);
  assert.deepEqual([a.uvs[10], a.uvs[11]], [1, 0], 'its UVs came across');
  const plain = new Batch();
  plain.append(a);
  assert.equal(plain.colors.length, 0, 'a batch that is not coloured takes no colours');
  assert.equal(plain.triangles, 4);
});

test('part and mergeParts: one mesh per material, merged across buildings, empty parts left out, triangles totalled, render order kept', () => {
  type K = 'brick' | 'stone' | 'glass';
  const one: PartMap<K> = {};
  const two: PartMap<K> = {};
  part(one, 'brick').poly(SQUARE);
  assert.equal(part(one, 'brick'), part(one, 'brick'), 'the same batch each time');
  part(two, 'brick').poly(SQUARE);
  part(two, 'stone').poly(SQUARE);
  part(one, 'stone'); // started, never drawn in
  const mats: Record<K, THREE.Material> = { brick: new THREE.MeshBasicMaterial(), stone: new THREE.MeshBasicMaterial(), glass: new THREE.MeshBasicMaterial() };
  const { group, triangles } = mergeParts([one, two], mats, 'hotels', { stone: 3 });
  assert.equal(group.name, 'hotels');
  assert.deepEqual(group.children.map((c) => c.name), ['hotels-brick', 'hotels-stone'], 'glass has no triangles: no mesh');
  assert.equal(triangles, 6, 'two bricks and one stone, two triangles each');
  const [brick, stone] = group.children as THREE.Mesh[];
  assert.equal(((brick as THREE.Mesh).geometry.index?.count ?? 0) / 3, 4, 'both buildings brick in one mesh');
  assert.equal((brick as THREE.Mesh).material, mats.brick);
  assert.equal((stone as THREE.Mesh).renderOrder, 3);
  assert.equal((brick as THREE.Mesh).renderOrder, 0);
});

test('the decal and strip materials are pulled toward the camera, the plain ones are not; red brick is the tinted brick, the two-sided slate is two-sided', () => {
  for (const name of ['sash', 'sashArch', 'pane', 'platformEdgeStrip'] as const) {
    const m = material(name);
    assert.equal(m.polygonOffset, true, name);
    assert.equal(m.polygonOffsetFactor, -2, name);
    assert.equal(m.polygonOffsetUnits, -2, name);
    assert.equal(m.name, name);
    assert.equal(material(name), m, `${name} is shared`);
  }
  for (const name of ['window', 'windowArch', 'platformEdge', 'brick'] as const) assert.equal(material(name).polygonOffset, false, name);
  assert.equal(material('sash').transparent, true);
  assert.equal((material('sash') as THREE.MeshLambertMaterial).alphaTest, 0.05);
  assert.equal(material('slateBothSides').side, THREE.DoubleSide);
  assert.equal(material('slate').side, THREE.FrontSide);
  assert.notEqual(material('brickRed'), material('brick'));
});

test('the red brick is its own texture, orange-red, in the same bond at the same scale as the stock brick (R-lighting-materials-c)', () => {
  const red = TEXTURES.brickRed;
  assert.deepEqual(red.tile, TEXTURES.brick.tile, 'the same tile, so the UVs in metres that fit the stock brick fit the red');
  assert.deepEqual(red.px, TEXTURES.brick.px);
  const [r, g, b] = [(red.average >> 16) & 255, (red.average >> 8) & 255, red.average & 255];
  assert.ok(r > g * 1.4 && g > b, `an orange-red average, got ${r},${g},${b}`);
  assert.ok(r > 150 && r < 215, `red, lit enough to read ${r}`);
  // the stock brick is yellow-buff: its blue is far below its red, but its green is close to it
  const stock = TEXTURES.brick.average;
  assert.ok(((stock >> 8) & 255) > ((stock >> 16) & 255) * 0.8, 'the stock brick is buff, not red');
  assert.equal((material('brickRed') as THREE.MeshLambertMaterial).color.getHex(), red.average, 'in Node the material is flat in the texture average');
  assert.equal(material('brickRed').name, 'brickRed');
});

/** A canvas context that only writes down what it is asked to draw: the fill style each rectangle was drawn in, and the gradients made. */
function recorder() {
  const rects: { style: unknown; args: number[] }[] = [];
  const styles: unknown[] = [];
  const gradients: { stops: [number, string][] }[] = [];
  let fillStyle: unknown = '';
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'fillStyle') return fillStyle;
      if (prop === 'createLinearGradient') return () => { const g = { stops: [] as [number, string][], addColorStop: (o: number, c: string) => g.stops.push([o, c]) }; gradients.push(g); return g; };
      if (prop === 'fillRect') return (...args: number[]) => { rects.push({ style: fillStyle, args }); };
      return () => undefined;
    },
    set(_t, prop: string, v) { if (prop === 'fillStyle') { fillStyle = v; styles.push(v); } return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, styles, gradients };
}
const hexLuma = (hex: string): number => { const n = parseInt(hex.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
const PANE_OVERLAY = /^rgba\((255,255,255|8,14,22),/;

test('a sash window\'s glass mirrors the sky at the top and the room at the bottom, with a slanting glint and a different share of each in every pane (R-lighting-materials-a2)', () => {
  for (const name of ['window', 'windowArch'] as const) {
    const [w, h] = TEXTURES[name].px;
    const a = recorder();
    PAINTERS[name](a.ctx, w, h);
    const glass = a.gradients[0] as { stops: [number, string][] };
    assert.ok(glass.stops.length >= 3, `${name}: the glass is a gradient of at least three tones, not a two-stop ramp`);
    assert.ok(hexLuma(glass.stops[0]![1]) > 1.8 * hexLuma(glass.stops[glass.stops.length - 1]![1]), `${name}: pale sky at the top, a dark room at the bottom`);
    assert.ok(a.gradients.length >= 2, `${name}: and a second gradient for the glint of sky across it`);
    const panes = a.rects.filter((r) => PANE_OVERLAY.test(String(r.style)) && r.args[2] === w / 2);
    assert.equal(panes.length, 8, `${name}: two columns by four rows of panes, each overlaid once`);
    assert.ok(new Set(panes.map((r) => r.style)).size >= 6, `${name}: the panes differ from one another (${new Set(panes.map((r) => r.style)).size} of 8 distinct)`);
    assert.ok(panes.some((r) => String(r.style).startsWith('rgba(255')) && panes.some((r) => String(r.style).startsWith('rgba(8')), `${name}: some panes catch the sky, others show the room`);
    const b = recorder();
    PAINTERS[name](b.ctx, w, h);
    const plain = (rs: typeof a.rects) => rs.map((r) => ({ style: typeof r.style === 'string' ? r.style : 'gradient', args: r.args }));
    assert.deepEqual(plain(b.rects), plain(a.rects), `${name}: the same window every load, so screenshots compare`);
  }
});

test('the city\'s sash windows differ pane by pane too, and the walls beside them are not touched by it', () => {
  for (const key of ['stock', 'stone'] as const) {
    const [w, h] = [TEXTURES.brick.px[0], 1];
    const a = recorder();
    CITY_PAINTERS[key](a.ctx, w * 4, h * 400);
    const panes = a.rects.filter((r) => PANE_OVERLAY.test(String(r.style)));
    assert.equal(panes.length, 12, `${key}: two columns by six rows`);
    assert.ok(new Set(panes.map((r) => r.style)).size >= 8, `${key}: ${new Set(panes.map((r) => r.style)).size} of 12 panes distinct`);
    const g = a.gradients.find((x) => x.stops.length >= 3);
    assert.ok(g && hexLuma(g.stops[0]![1]) > 1.8 * hexLuma(g.stops[g.stops.length - 1]![1]), `${key}: sky above, room below`);
  }
});

test('windowKey: the number a decal window is read from is spread over 0..1 across a facade, differs from one window to the next, and does not move when the shader\'s idea of the corner wanders', () => {
  // a facade of 12 bays by 5 storeys: windows 3.2 m apart along it, 3.4 m apart up it, on a wall at 40 degrees to the grid
  const along = [Math.cos(0.7), 0, Math.sin(0.7)], up = [0, 1, 0];
  const keys: number[][] = [];
  for (let row = 0; row < 5; row++) {
    const r: number[] = [];
    for (let col = 0; col < 12; col++) r.push(windowKey(-80 + col * 3.2 * along[0]! + row * 3.4 * up[0]!, 2 + row * 3.4, -40 + col * 3.2 * along[2]!));
    keys.push(r);
  }
  const flat = keys.flat();
  const mean = flat.reduce((s, v) => s + v, 0) / flat.length;
  const sd = Math.sqrt(flat.reduce((s, v) => s + (v - mean) ** 2, 0) / flat.length);
  assert.ok(flat.every((v) => v >= 0 && v <= 1));
  assert.ok(mean > 0.35 && mean < 0.65, `about half on average: ${mean}`);
  assert.ok(sd > 0.25, `windows are spread across the range, not clustered: sd ${sd}`);
  assert.ok(Math.min(...flat) < 0.1 && Math.max(...flat) > 0.9, 'the darkest and the brightest windows are far apart');
  let alike = 0, pairs = 0;
  for (const r of keys) for (let c = 1; c < r.length; c++) { pairs++; if (Math.abs((r[c] as number) - (r[c - 1] as number)) < 0.05) alike++; }
  assert.ok(alike < 0.2 * pairs, `neighbouring windows differ: ${alike} of ${pairs} pairs within 0.05`);
  // the corner the shader rebuilds from derivatives is good to a few millimetres at worst: a window does not change with it
  for (const [x, y, z] of [[-60, 5, -30], [12.3, 18, 40], [-140, 9, 77]] as const) {
    for (const d of [0.003, -0.003]) {
      assert.ok(Math.abs(windowKey(x + d, y + d, z - d) - windowKey(x, y, z)) < 0.05, `steady at ${x},${y},${z}`);
    }
  }
});

test('window glass varies from window to window: the decals by their quad, the city\'s facades by their tile, and only where the texture is glass', () => {
  const shader = (m: THREE.Material) => {
    const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
    return s;
  };
  for (const name of ['sash', 'sashArch', 'window', 'windowArch'] as const) {
    const m = material(name);
    const s = shader(m);
    assert.ok(s.vertexShader.includes('varying vec3 vWinPos;') && s.vertexShader.includes('vWinPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'), `${name}: the vertex shader hands over the world position`);
    assert.ok(s.fragmentShader.includes('dFdx( vWinPos )') && s.fragmentShader.includes('float gk = 0.5;'), `${name}: the fragment shader finds the quad's own corner`);
    assert.ok(s.fragmentShader.indexOf('#include <map_fragment>') < s.fragmentShader.indexOf('float gShare'), `${name}: after the texture is read, so the glass can be told from the wall`);
    assert.ok(s.fragmentShader.includes('diffuseColor.rgb *= mix( vec3( 1.0 ), gTint * mix( 0.55, 1.55, gk ), gShare );'), `${name}: the glass alone is brightened or darkened`);
    assert.equal(m.customProgramCacheKey(), 'glassVaries-quad', `${name}: its own program`);
  }
  for (const name of ['stock', 'red', 'stone', 'panel', 'glass', 'shop'] as const) {
    const m = cityMaterial(name);
    const s = shader(m);
    const curtain = name === 'glass';
    assert.ok(!s.vertexShader.includes('vWinPos'), `${name}: a facade needs no world position`);
    assert.ok(s.fragmentShader.includes('floor( vMapUv )') && s.fragmentShader.includes('vColor.rgb'), `${name}: a window to a tile, mixed with the building's own colour`);
    assert.equal(m.customProgramCacheKey(), curtain ? 'glassVaries-curtain' : 'glassVaries-tile', `${name}: its own program`);
    // a curtain wall takes most of its window's number from a smooth field across the tiles and swings less far (round three: it was a chequer of random blue panes);
    // the houses keep a window's number to itself, at the full swing
    assert.equal(s.fragmentShader.includes('gk = mix( gk, 0.5 + 0.5 * sin('), curtain, `${name}: the smooth field is the curtain wall's`);
    assert.ok(s.fragmentShader.includes(curtain ? 'gTint * mix( 0.8, 1.3, gk )' : 'gTint * mix( 0.55, 1.55, gk )'), `${name}: its swing of light`);
    // and a curtain wall's number rises with the height up the wall and takes a share of its building's own colour (round five, E4: "uniform blue horizontal stripes on every building,
    // with no sky gradient"); after the smooth field it is a number of, before the glass takes it
    const gradient = 'gk = clamp( gk + 0.07 + 0.6 * fract( gSeed ) - exp( -0.2 * vMapUv.y ), 0.0, 1.0 );';
    assert.equal(s.fragmentShader.includes(gradient), curtain, `${name}: the sky gradient is the curtain wall's`);
    if (curtain) {
      const order = ['gk = mix( gk, 0.5 + 0.5 * sin(', gradient, 'float gShare'].map((needle) => s.fragmentShader.indexOf(needle));
      assert.ok(order[0] >= 0 && order[0] < order[1] && order[1] < order[2], `${name}: after the smooth field, before the glass takes its number (${order})`);
    }
    // every facade is darker at its foot: the contact shade of the wall meeting the ground (0.22 over a storey, 0.14 in the first third of one)
    assert.ok(s.fragmentShader.includes('diffuseColor.rgb *= 1.0 - 0.22 * exp( -vMapUv.y ) - 0.14 * exp( -8.0 * vMapUv.y );'), `${name}: contact shade at the foot of the wall`);
  }
  assert.ok(!shader(material('window')).fragmentShader.includes('exp( -vMapUv.y )'), 'a window decal is no wall: it has no foot to darken');
});

test('a curtain wall\'s window number rises with the height up the wall and takes a share of its building\'s own colour: darker and warmer glass at the foot, paler and bluer in the upper storeys, and one tower not the next (round five, E4)', () => {
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  cityMaterial('glass').onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const line = s.fragmentShader.split('\n').find((l) => l.startsWith('gk = clamp(')) ?? '';
  const expression = /^gk = (clamp\(.*\));$/.exec(line)?.[1] ?? '';
  assert.ok(expression !== '', `the line is in the curtain wall's shader: ${line}`);
  const glsl = new Glsl('');
  // the number a window ends with: its own (`gk`, from the smooth field), the building's colour's seed (`gSeed`), the storeys up the wall (vMapUv.y)
  const number = (gk: number, seed: number, storeys: number): number => glsl.evaluate(expression, { vars: {} }, { gk, gSeed: seed, vMapUv: [0, storeys] }) as number;
  // up the wall, whatever the window's own number: the foot is darker and warmer (lower; the tint is warm at 0 and cool at 1), the top paler and bluer
  for (const gk of [0.2, 0.5, 0.8]) {
    let last = -1;
    for (const storeys of [0, 1, 2, 4, 8, 16]) {
      const k = number(gk, 0.5, storeys);
      assert.ok(k >= last, `a window's number never falls with the height: ${k} after ${last}, at ${storeys} storeys, from ${gk}`);
      last = k;
    }
    assert.ok(number(gk, 0.5, 8) - number(gk, 0.5, 0) > 0.3, `the foot of a tower is well below its upper storeys: ${number(gk, 0.5, 0)} against ${number(gk, 0.5, 8)}, from ${gk}`);
    // held level at five storeys up on a building of the middle tint: a facade's mean is where it was
    assert.ok(Math.abs(number(gk, 0.5, 5) - gk) < 0.01, `five storeys up the middle tint keeps the window's number: ${number(gk, 0.5, 5)} from ${gk}`);
  }
  // one tower is paler and bluer overall and its neighbour darker, by the fraction of the colour's seed (the integer part is not the building's own)
  assert.ok(number(0.5, 0.9, 5) - number(0.5, 0.1, 5) > 0.4, `two towers differ: ${number(0.5, 0.9, 5)} against ${number(0.5, 0.1, 5)}`);
  assert.ok(Math.abs(number(0.5, 3.4, 5) - number(0.5, 0.4, 5)) < 1e-6, 'by the seed\'s fraction alone');
  // it is a number between 0 and 1 whatever it is given: the glass's mix of tint and light takes it as one
  for (const gk of [0, 1]) for (const seed of [0, 0.5, 0.99]) for (const storeys of [0, 5, 40]) {
    const k = number(gk, seed, storeys);
    assert.ok(k >= 0 && k <= 1, `held to 0..1: ${k} at ${gk}, ${seed}, ${storeys}`);
  }
  assert.equal(number(1, 0.99, 40), 1, 'the brightest, bluest glass a tall wall has');
  assert.equal(number(0, 0, 0), 0, 'and the darkest, warmest, at the foot');
});

test('the stock brick is worn like the close-up (burnt ends, duller grey-brown bricks and none of them green, cracks, chipped corners) and the red brick is drawn as it was (R-lighting-materials-a, -c)', () => {
  const [w, h] = TEXTURES.brick.px;
  const draw = (name: 'brick' | 'brickRed') => { const a = recorder(); PAINTERS[name](a.ctx, w, h); return a; };
  const stock = draw('brick');
  const red = draw('brickRed');
  const burnt = (rs: typeof stock.rects) => rs.filter((r) => /^rgba\(52,36,18,/.test(String(r.style)));
  const cracks = (rs: typeof stock.rects) => rs.filter((r) => r.style === 'rgba(30,22,14,0.4)');
  const chips = (rs: typeof stock.rects) => rs.filter((r) => r.style === '#b8ae96').slice(1); // the first is the wall of mortar under everything
  assert.ok(burnt(stock.rects).length >= 25, `most stock bricks have a burnt end: ${burnt(stock.rects).length} of about 64`);
  assert.ok(cracks(stock.rects).length >= 2, `a few are cracked: ${cracks(stock.rects).length}`);
  assert.ok(chips(stock.rects).length >= 4, `a few have a chipped corner: ${chips(stock.rects).length}`);
  assert.equal(burnt(red.rects).length + cracks(red.rects).length + chips(red.rects.filter((r) => r.style === '#b8aa94')).length, 0, 'the red brick has none of it');
  // a stretcher (the long face) of a stock fired a duller grey-brown is less saturated than a yellow-buff one: about one in three of them. Round four: and it is never olive: the
  // E3 scorer found olive-green bricks in facade-brick-close that R-a and R-a2 do not show, so no stretcher's green sits closer to its red than 0.2 of the way down to its blue (0.28 in the buff, 0.11 in the olive it was)
  const stretchers = stock.rects.filter((r) => typeof r.style === 'string' && r.style.startsWith('rgb(') && r.args[2]! > 80 && r.args[3]! > 20);
  const channels = (s: unknown) => String(s).match(/\d+/g)!.map(Number) as [number, number, number];
  const olive = stretchers.filter((r) => { const [R, , B] = channels(r.style); return R - B < 64; });
  for (const r of stretchers) { const [R, G, B] = channels(r.style); assert.ok((R - G) / (R - B) > 0.2, `a stretcher is yellow-buff or grey-brown, never olive: in ${r.style} green sits ${((R - G) / (R - B)).toFixed(2)} of the way down from red to blue (the buff's is 0.28, an olive's 0.1)`); }
  assert.ok(stretchers.length >= 20, `the stretchers are found: ${stretchers.length}`);
  assert.ok(olive.length / stretchers.length > 0.15 && olive.length / stretchers.length < 0.5, `about a third are the duller grey-brown: ${olive.length} of ${stretchers.length}`);
  const again = draw('brick');
  const plain = (rs: typeof stock.rects) => rs.map((r) => ({ style: String(r.style), args: r.args }));
  assert.deepEqual(plain(again.rects), plain(stock.rects), 'the same wall every load, so screenshots compare');
});

test('a brick wall has a wide pale joint and not a thin dark line (round five, the E3 scorer: "R-a shows a wide pale lime joint")', () => {
  const [w, h] = TEXTURES.brick.px;
  for (const [name, mortar] of [['brick', '#b8ae96'], ['brickRed', '#b8aa94']] as const) {
    const a = recorder();
    PAINTERS[name](a.ctx, w, h);
    assert.equal(a.rects[0]!.style, mortar, `${name}: the wall of mortar is under everything`);
    // the bricks' faces are the flat rgb() fills (the arris, the shade and the wear are rgba, the chips the mortar's own hex): their area inside the tile is the brick's share
    const brickArea = a.rects.filter((r) => String(r.style).startsWith('rgb(')).reduce((sum, r) => {
      const [x, y, rw, rh] = r.args as [number, number, number, number];
      return sum + Math.max(0, Math.min(x + rw, w) - Math.max(x, 0)) * Math.max(0, Math.min(y + rh, h) - Math.max(y, 0));
    }, 0);
    // R-a's close-up is 23.5% mortar by pixel count (50.7% brick face, 25.8% shadow and dark brick); a 3/8 in joint alone is 17% of a Flemish wall, which is what drew a line
    const share = 1 - brickArea / (w * h);
    assert.ok(share > 0.2 && share < 0.27, `${name}: the mortar is about 23% of the wall, as in R-a: ${(100 * share).toFixed(1)}%`);
  }
  // the stock's mortar is a pale lime, lighter than the median brick face by over 15 of 255 in luma (it was 3 lighter than the bricks' own and read as a grey outline)
  const stock = recorder();
  PAINTERS.brick(stock.ctx, w, h);
  const faces = stock.rects.filter((r) => typeof r.style === 'string' && r.style.startsWith('rgb(') && r.args[2]! > 80 && r.args[3]! > 20).map((r) => String(r.style).match(/\d+/g)!.map(Number) as [number, number, number]);
  const lumas = faces.map(([R, G, B]) => 0.2126 * R + 0.7152 * G + 0.0722 * B).sort((p, q) => p - q);
  const median = lumas[Math.floor(lumas.length / 2)]!;
  assert.ok(faces.length > 20, `the stretchers are found: ${faces.length}`);
  assert.ok(hexLuma(String(stock.rects[0]!.style)) - median > 15, `the mortar is paler than the brick: luma ${hexLuma(String(stock.rects[0]!.style)).toFixed(0)} against a median stretcher's ${median.toFixed(0)}`);
});

test('asphalt is a neutral mid grey, not the blue-grey it was, and the paths on the forecourt are a visible strip darker than the square (E5)', () => {
  const avg = TEXTURES.asphalt.average;
  const [r, g, b] = [(avg >> 16) & 255, (avg >> 8) & 255, avg & 255];
  assert.ok(Math.abs(r - b) <= 6 && Math.abs(r - g) <= 4, `neutral: ${r},${g},${b}`);
  assert.ok(r >= 104 && r <= 130, `about 0.17 reflective (sRGB 118): ${r}`);
  const road = (cityMaterial('asphalt') as THREE.MeshLambertMaterial).color;
  // round four (lighting-materials E5): London tarmac in daylight is a mid grey (L 44 in hist-a, 52 in hist-e), 7 to 10 L under the paving beside it, not the near-black
  // (L 24, 35 L under the footway) a road at a quarter of the platform asphalt's light drew. A road is the same tarmac at about three-fifths of the light (0.11
  // reflective), cool-neutral, still the darkest flat thing in the street and under the open ground (0.13); at four-fifths (0.14) the roads were the ground's own tone and
  // drew as one plain from the overview
  const [rb, , bb] = [(road.getHex() >> 16) & 255, (road.getHex() >> 8) & 255, road.getHex() & 255];
  // round five (the E5 scorer: the roads were L 41 in the overview, within 5 L of the footways, the ground and the flat roofs, so the street pattern dissolved): about 0.7 of that light again,
  // L 36 to 40 there and 10 L or more under the footway (L 50 to 52)
  assert.ok(road.r > 0.36 && road.r < 0.5 && bb >= rb && bb - rb <= 16, `a road is the same tarmac at about two-fifths of the platform's light (0.42 linear), cool-neutral: ${rb},${(road.getHex() >> 8) & 255},${bb}`);
  const lin = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const roadLight = lin(road) * lin(new THREE.Color(avg));
  const groundLight = lin((terrainMaterial('ground') as THREE.MeshLambertMaterial).color);
  const pavingLight = lin((cityMaterial('pavement') as THREE.MeshLambertMaterial).color) * lin(new THREE.Color(TEXTURES.floorSlab.average));
  assert.ok(roadLight > 0.065 && roadLight < 0.09, `the road's reflectance is about 0.078 (mid-grey tarmac, L 36 to 40 in the overview, hist-a's sunlit L 44): ${roadLight.toFixed(3)}`);
  assert.ok(roadLight < 0.9 * groundLight, `the road's reflectance (${roadLight.toFixed(3)}) is under the open ground's (${groundLight.toFixed(3)}), so it still reads apart from it`);
  // (a road at 0.5 of the paving's light is about 14 L under it, L 37 against 51 in the overview; round three's quarter-light road was 35 L under it)
  assert.ok(roadLight > 0.4 * pavingLight && roadLight < 0.65 * pavingLight, `the road sits at about half the paving's light (${pavingLight.toFixed(3)}), 14 L under it and not 35 L: ${roadLight.toFixed(3)}`);
  const a = recorder();
  PAINTERS.asphalt(a.ctx, 256, 256);
  const base = String(a.styles[0]);
  const n = parseInt(base.slice(1), 16);
  assert.ok(base.startsWith('#') && Math.abs(((n >> 16) & 255) - (n & 255)) <= 6, `the painted base is neutral too: ${base}`);
});

test('rgb: the linear triple a vertex colour wants (sRGB hex in, linear out)', () => {
  assert.deepEqual(rgb(0xffffff), [1, 1, 1]);
  assert.deepEqual(rgb(0x000000), [0, 0, 0]);
  const [r, g, b] = rgb(0x808080);
  assert.ok(r > 0.2 && r < 0.23 && r === g && g === b, `mid grey is about 0.216 linear, not 0.5: ${r}`);
});
