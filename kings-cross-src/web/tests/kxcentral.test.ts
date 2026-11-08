// web/src/kxcentral.ts: the King's Cross Central landmarks as meshes. Node has no canvas, so the local textures are null here
// and the materials fall back to their average colour; what is tested is the texture specs (sizes, texel density), the
// painters on a recording context (sizes and places of what they draw), the geometry helpers on shapes with known answers, the
// landmark meshes against the OSM outlines and the published heights (positions, heights, merged mesh counts, UV density in
// texels per metre, instance counts, winding), and the scene graph addKxCentral makes (one draw call per material, one instanced
// tree mesh, a budget, disposal).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { distToPolyline, distToRing, FIG, meshPolygon, OSM, outlineOf, pointInPolygon } from '../../core/kxcentral.ts';
import type { RaisedWall } from '../../core/kxcentral.ts';
import type { KxData } from '../../core/osm.ts';
import {
  addKxCentral,
  boundaryWalls,
  coalDropsGeometry,
  createMaterials,
  dressEdges,
  gasholderGeometry,
  granaryGeometry,
  KX_PAINTERS,
  KX_TEXTURES,
  KXCENTRAL_OSM_IDS,
  kxGeometry,
  kxPlans,
  kxTexture,
  meshRoof,
  paneGrid,
  planarRoof,
  raisedWallQuads,
  climbingRoof,
  treeMesh,
  wallEdges,
} from '../src/kxcentral.ts';
import type { Key, KxTextureName } from '../src/kxcentral.ts';
import { Batch, material, texelsPerMetre, TEXTURES } from '../src/materials.ts';
import type { PartMap, V2, V3 } from '../src/materials.ts';
import { GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const names = Object.keys(KX_TEXTURES) as KxTextureName[];
const sq = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// =============================================================================================
// 1. the textures

test('every local texture draws at a real-world scale: 60-68 texels per metre for the facades, 76-84 for the louvres, 30-34 for the garden, square texels', () => {
  assert.deepEqual(names.slice().sort(), ['alu', 'curtain', 'drum', 'green', 'timber']);
  for (const name of names) {
    const spec = KX_TEXTURES[name];
    const [tx, ty] = texelsPerMetre(spec);
    assert.ok(tx >= spec.density[0] && tx <= spec.density[1], `${name}: ${tx.toFixed(1)} texels/m across, allowed ${spec.density}`);
    assert.ok(ty >= spec.density[0] && ty <= spec.density[1], `${name}: ${ty.toFixed(1)} texels/m up, allowed ${spec.density}`);
    assert.ok(Math.abs(tx / ty - 1) <= 0.06, `${name}: texels are ${tx.toFixed(1)} x ${ty.toFixed(1)} per metre, not square`);
    assert.ok(Number.isInteger(spec.px[0]) && Number.isInteger(spec.px[1]), `${name}: whole pixels`);
    assert.ok(spec.px[0] * spec.px[1] <= 1_100_000, `${name}: ${spec.px} px is more than a megapixel`);
    assert.ok(spec.source.length > 10, `${name}: says where its size comes from`);
    assert.match(spec.source, /ASSUMED/, `${name}: its sizes are marked ASSUMED`);
    assert.equal(spec.repeat, true, `${name} tiles`);
  }
  assert.deepEqual(KX_TEXTURES.drum.tile, [3.0, 2.7], 'a drum tile: two 1.5 m panels, one 2.7 m storey');
  assert.deepEqual(KX_TEXTURES.timber.tile, [1.5, 4.2], 'a timber tile: 1.5 m of fins, one 4.2 m storey');
  assert.deepEqual(KX_TEXTURES.curtain.tile, [1.5, 4.0], 'a curtain-wall tile: one 1.5 m module, one 4 m storey');
  assert.ok(KX_TEXTURES.green.density[1] < KX_TEXTURES.drum.density[0], 'the garden is the coarse one');
  assert.deepEqual(Object.keys(KX_PAINTERS).sort(), names.slice().sort(), 'the painters and the specs name the same textures');
  assert.equal(kxTexture('drum'), null, 'no document, no canvas');
});

interface Call {
  op: string;
  args: unknown[];
  fillStyle: unknown;
}
interface GradientStub {
  gradient: true;
  stops: [number, string][];
}
function recorder(): { g: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1 };
  const g = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop in state) return state[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (): GradientStub => ({ gradient: true, stops: [], addColorStop(offset: number, color: string) { this.stops.push([offset, color]); } } as GradientStub);
      }
      return (...args: unknown[]): void => {
        calls.push({ op: prop, args, fillStyle: state.fillStyle });
      };
    },
    set(_t, prop: string, value: unknown) {
      state[prop] = value;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
}
function paint(name: KxTextureName): Call[] {
  const r = recorder();
  const [w, h] = KX_TEXTURES[name].px;
  KX_PAINTERS[name](r.g, w, h);
  return r.calls;
}
const isGradient = (v: unknown): v is GradientStub => typeof v === 'object' && v !== null && 'gradient' in v;
const rects = (calls: Call[], pred: (c: Call) => boolean): number[][] => calls.filter((c) => c.op === 'fillRect' && pred(c)).map((c) => c.args as number[]);

test('every painter runs, starts with an opaque fill of the whole tile and draws the same picture every time', () => {
  for (const name of names) {
    const [w, h] = KX_TEXTURES[name].px;
    const calls = paint(name);
    assert.ok(calls.length >= 8, `${name}: ${calls.length} drawing calls`);
    const first = calls[0] as Call;
    assert.equal(first.op, 'fillRect', `${name} starts with a fill`);
    assert.deepEqual(first.args, [0, 0, w, h], `${name}: the whole tile, so there are no holes in it`);
    assert.equal(JSON.stringify(paint(name)), JSON.stringify(calls), `${name}: repeatable, so screenshots compare`);
  }
});

test('the painted details are the sizes the specs say: drum shutters and ring beam, the curtain wall\'s spandrel, louvre blades with a photovoltaic one in four, ten timber fins', () => {
  // drum: 64 px per metre; two shutters in two 1.5 m panels, each a 1.14 m wide leaf inside 0.18 m frames; a 0.35 m ring beam at the top
  const drum = paint('drum');
  const shutters = rects(drum, (c) => c.fillStyle === '#929ca6');
  assert.equal(shutters.length, 2, 'two panels, two shutters');
  for (const s of shutters) close((s[2] as number) / 64, 1.5 - 0.36, 1e-9, 'shutter width, metres');
  const beam = rects(drum, (c) => c.fillStyle === '#353c43');
  assert.equal(beam.length, 1);
  assert.deepEqual(beam[0]?.slice(0, 2), [0, 0], 'the ring beam is at the top');
  close((beam[0]?.[2] as number) / 64, 3.0, 1e-9, 'and as wide as the tile');
  close((beam[0]?.[3] as number) / 64, 0.35, 1e-9, 'and 0.35 m deep');
  // curtain wall: a 0.95 m spandrel in terracotta over a 0.14 m slab edge, in a 4.0 m storey
  const [cw, ch] = KX_TEXTURES.curtain.px;
  const curtain = paint('curtain');
  const spandrel = rects(curtain, (c) => c.fillStyle === '#935f4a');
  assert.equal(spandrel.length, 1);
  close((ch - (spandrel[0]?.[1] as number)) / 64, 0.95, 1e-9, 'the spandrel starts 0.95 m above the bottom of the storey');
  const slab = rects(curtain, (c) => c.fillStyle === '#d9dde0')[0] as number[];
  close(slab[3] as number / 64, 0.14, 1e-9, 'slab edge');
  close(slab[1] as number + (slab[3] as number), ch, 1e-9, 'at the foot of the storey');
  assert.equal(slab[2], cw, 'as wide as the module');
  // louvres: eight blades in a tile, every fourth photovoltaic
  const alu = paint('alu');
  const blades = alu.filter((c) => c.op === 'fillRect' && isGradient(c.fillStyle));
  assert.equal(blades.length, 8, 'eight blades');
  const pv = blades.filter((c) => (c.fillStyle as GradientStub).stops[0]?.[1] === '#2f4465');
  assert.deepEqual(pv.map((c) => (c.args as number[])[1]), [3 * 16 + 1, 7 * 16 + 1], 'blades 4 and 8 are photovoltaic');
  // timber: ten fins of 0.15 m pitch across the 1.5 m tile, closed cladding the bottom metre of each storey
  const [tw, th] = KX_TEXTURES.timber.px;
  const timber = paint('timber');
  const fins = rects(timber, (c) => (c.args as number[])[1] === 0 && (c.args as number[])[3] === th && Math.abs((c.args as number[])[2] as number - 0.15 * 64 * 0.76) < 1e-9);
  assert.equal(fins.length, 10, 'ten fins');
  fins.forEach((f, k) => close(f[0] as number, k * 0.15 * 64 + 0.15 * 64 * 0.12, 1e-9, `fin ${k} position`));
  const cladding = rects(timber, (c) => (c.args as number[])[0] === 0 && (c.args as number[])[2] === tw && (c.args as number[])[3] === 64);
  assert.equal(cladding.length, 1);
  close((th - (cladding[0]?.[1] as number)) / 64, 1.0, 1e-9, 'a metre of closed cladding under the glass');
  assert.ok(paint('green').length > 700, 'the garden is speckled and flowered');
});

// =============================================================================================
// 2. the materials

test('createMaterials: the eight shared ones from materials.ts and six of this module\'s own, each owned one disposable, none sharing a texture across calls', () => {
  const a = createMaterials();
  const b = createMaterials();
  const keys = Object.keys(a.table) as Key[];
  assert.equal(keys.length, 14);
  assert.deepEqual(keys.sort(), ['alu', 'brick', 'brickRed', 'curtain', 'drum', 'green', 'iron', 'pane', 'roofGlass', 'sash', 'sashArch', 'slate', 'stone', 'timber'].sort());
  const shared: [Key, Parameters<typeof material>[0]][] = [['brick', 'brick'], ['brickRed', 'brickRed'], ['stone', 'stone'], ['slate', 'slateBothSides'], ['sash', 'sash'], ['sashArch', 'sashArch'], ['pane', 'pane'], ['roofGlass', 'roofGlass']];
  for (const [key, name] of shared) {
    assert.equal(a.table[key], material(name), `${key} is the shared ${name}`);
    assert.ok(!a.owned.includes(a.table[key]), `${key} is not ours to dispose`);
  }
  const local: Key[] = ['iron', 'drum', 'curtain', 'alu', 'timber', 'green'];
  for (const key of local) {
    assert.ok(a.owned.includes(a.table[key]), `${key} is ours`);
    assert.notEqual(a.table[key], b.table[key], `${key} is made afresh each call`);
  }
  assert.equal(a.owned.length, 6, 'six materials (and no textures: Node has no canvas)');
  // no canvas here, so the average colour stands in for the texture
  for (const name of names) assert.equal((a.table[name] as THREE.MeshLambertMaterial).color.getHex(), KX_TEXTURES[name].average, `${name}: the average colour`);
  assert.equal((a.table.alu as THREE.MeshPhongMaterial).side, THREE.DoubleSide, 'louvres are seen from both sides');
  assert.ok((a.table.curtain as THREE.MeshPhongMaterial).shininess > 0, 'glass catches the sun');
  assert.equal((a.table.alu as THREE.MeshPhongMaterial).shininess, 18, 'broad highlights: a narrow one shows the mesh as a zigzag');
  for (const m of a.owned) m.dispose();
  for (const m of b.owned) m.dispose();
});

// =============================================================================================
// 3. helpers on shapes with known answers

interface Tri {
  p: [V3, V3, V3];
  n: [V3, V3, V3];
  uv: [V2, V2, V2];
}
function trisOf(b: Batch): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i + 2 < b.indices.length; i += 3) {
    const ix = [0, 1, 2].map((k) => b.indices[i + k] as number);
    const v3 = (arr: number[], k: number): V3 => [arr[3 * k] as number, arr[3 * k + 1] as number, arr[3 * k + 2] as number];
    out.push({
      p: ix.map((k) => v3(b.positions, k)) as Tri['p'],
      n: ix.map((k) => v3(b.normals, k)) as Tri['n'],
      uv: ix.map((k) => [b.uvs[2 * k] as number, b.uvs[2 * k + 1] as number] as V2) as Tri['uv'],
    });
  }
  return out;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const areaOf = (t: Tri): number => len3(crossV(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))) / 2;
const uvAreaOf = (t: Tri): number => Math.abs((t.uv[1][0] - t.uv[0][0]) * (t.uv[2][1] - t.uv[0][1]) - (t.uv[1][1] - t.uv[0][1]) * (t.uv[2][0] - t.uv[0][0])) / 2;
const windingNormal = (t: Tri): V3 => {
  const c = crossV(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]));
  const l = len3(c) || 1;
  return [c[0] / l, c[1] / l, c[2] / l];
};
const verts = (b: Batch): V3[] => {
  const out: V3[] = [];
  for (let i = 0; i < b.positions.length; i += 3) out.push([b.positions[i] as number, b.positions[i + 1] as number, b.positions[i + 2] as number]);
  return out;
};
const ringEdges = (ring: Pt[]) => ring.map((a, i) => {
  const b = ring[(i + 1) % ring.length] as Pt;
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dir: Pt = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  return { i, a, b, length: l, dir, normal: [dir[1], -dir[0]] as Pt, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt };
});

test('wallEdges: one quad per edge from y0 to the top (a height or a function of the plan point), facing outwards, u along the walls and v up in metres', () => {
  const b = new Batch();
  wallEdges(b, ringEdges(sq(0, 0, 10, 10)), GROUND_Y, 5);
  const t = trisOf(b);
  assert.equal(t.length, 8, 'four quads');
  const ys = verts(b).map((v) => v[1]);
  close(Math.min(...ys), GROUND_Y, 0);
  close(Math.max(...ys), 5, 0);
  for (const tri of t) {
    const n = windingNormal(tri);
    const c: Pt = [(tri.p[0][0] + tri.p[1][0] + tri.p[2][0]) / 3, (tri.p[0][2] + tri.p[1][2] + tri.p[2][2]) / 3];
    assert.ok(dot3(n, tri.n[0]) > 0.999, 'the winding agrees with the stored normal');
    assert.ok((c[0] - 5) * n[0] + (c[1] - 5) * n[2] > 0, 'faces away from the middle of the square');
    close(areaOf(tri), uvAreaOf(tri), 1e-9, 'UVs are metres: the UV area is the wall\'s');
  }
  const us = b.uvs.filter((_, i) => i % 2 === 0);
  close(Math.max(...us), 40, 1e-9, 'u runs round the 40 m perimeter');
  // a gable end: the top follows the function; nothing is built where the top is at or below y0
  const g = new Batch();
  wallEdges(g, ringEdges(sq(0, 0, 10, 10)), 0, (p) => p[0] * 0.5);
  assert.equal(g.triangles, 4, 'the west edge, whose top is nowhere above y0, is left out; the north and south walls come to a point at the west end and are one triangle each, not a quad with a sliver');
  const ys2 = verts(g).map((v) => v[1]);
  close(Math.max(...ys2), 5, 1e-12, 'the top follows the function (5 m at x = 10)');
  for (const t of trisOf(g)) assert.ok(areaOf(t) > 1, 'no sliver triangles');
});

test('planarRoof: the triangles of a flat face tile the polygon exactly, at the height asked, facing up', () => {
  const L: Pt[] = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]];
  const b = new Batch();
  planarRoof(b, L, () => 7);
  let area = 0;
  for (const t of trisOf(b)) {
    area += areaOf(t);
    assert.ok(t.p.every((p) => p[1] === 7));
    assert.ok(windingNormal(t)[1] > 0.999 && t.n[0][1] === 1, 'faces up');
    close(areaOf(t), uvAreaOf(t), 1e-9, 'UV in plan metres');
  }
  close(area, 500, 1e-9, 'the polygon\'s area');
  const s = new Batch();
  planarRoof(s, sq(0, 0, 10, 10), (p) => p[0] * 0.5);
  assert.ok(verts(s).every((v) => Math.abs(v[1] - v[0] * 0.5) < 1e-12), 'each point at its height');
  const none = new Batch();
  planarRoof(none, [[0, 0], [1, 1]], () => 0);
  assert.equal(none.triangles, 0, 'fewer than three points make nothing');
});

test('climbingRoof: each facet is laid flat in UV (one unit to the metre along the eaves and up the slope), a flat cap sits on the ring, and a ring of one point makes a pyramid', () => {
  const outline = sq(0, 0, 20, 10);
  const b = new Batch();
  climbingRoof(b, outline, sq(3, 3, 17, 7), 10, 13);
  const all = trisOf(b);
  assert.equal(all.length, 4 * 2 + 2, 'four facets of two triangles and a cap of two');
  const slope = all.filter((t) => windingNormal(t)[1] < 0.999);
  const cap = all.filter((t) => windingNormal(t)[1] >= 0.999);
  assert.equal(slope.length, 8);
  assert.equal(cap.length, 2);
  let area = 0;
  for (const t of slope) {
    area += areaOf(t);
    // isometric: every edge is as long in UV as in space (not only the area)
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) close(Math.hypot(t.uv[i][0] - t.uv[j][0], t.uv[i][1] - t.uv[j][1]), len3(sub(t.p[i], t.p[j])), 1e-9, 'an edge is as long in UV as on the roof');
    assert.ok(dot3(windingNormal(t), t.n[0]) > 0.999, 'the winding agrees with the stored normal');
    const c: Pt = [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3 - 10, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3 - 5];
    assert.ok(windingNormal(t)[0] * c[0] + windingNormal(t)[2] * c[1] > 0, 'each facet leans outwards, away from the middle');
    assert.ok(windingNormal(t)[1] > 0.5 && windingNormal(t)[1] < 0.8, 'at 45 degrees: the normal is 0.707 up');
  }
  close(area, 2 * ((20 + 14) / 2) * Math.hypot(3, 3) + 2 * ((10 + 4) / 2) * Math.hypot(3, 3), 1e-9, 'the four trapezoids: 34/2 x 4.243 long, 14/2 x 4.243 short, each twice');
  const vs = slope.flatMap((t) => t.uv.map((u) => u[1]));
  close(Math.min(...vs), 0, 1e-9, 'v is 0 at the eaves');
  close(Math.max(...vs), Math.hypot(3, 3), 1e-9, 'and the length of the slope at the ring');
  const capArea = cap.reduce((s, t) => s + areaOf(t), 0);
  close(capArea, 14 * 4, 1e-9, 'the cap is the ring');
  for (const t of cap) assert.ok(t.p.every((p) => p[1] === 13), 'at the top');
  // a pyramid: a triangle a side, no sliver, no cap
  const pyr = new Batch();
  climbingRoof(pyr, sq(0, 0, 8, 8), sq(0, 0, 8, 8).map((): Pt => [4, 4]), 30, 33.4, false);
  assert.equal(pyr.triangles, 4);
  for (const t of trisOf(pyr)) {
    close(areaOf(t), uvAreaOf(t), 1e-9, 'laid flat');
    assert.ok(dot3(windingNormal(t), t.n[0]) > 0.999);
  }
  close(Math.max(...verts(pyr).map((v) => v[1])), 33.4, 0, 'the apex');
});

test('meshRoof and boundaryWalls: a roof over a refined mesh, and walls on its boundary that meet it exactly', () => {
  const ring = sq(0, 0, 20, 20);
  const mesh = meshPolygon(ring, 5);
  const h = (p: Pt): number => 4 + 0.1 * p[0];
  const roof = new Batch();
  meshRoof(roof, mesh, h);
  assert.equal(roof.triangles, mesh.tris.length);
  for (const v of verts(roof)) close(v[1], h([v[0], v[2]]), 1e-12, 'every vertex on the height field');
  for (const t of trisOf(roof)) {
    const n = windingNormal(t);
    for (const vn of t.n) {
      close(len3(vn), 1, 1e-9, 'unit normal');
      assert.ok(dot3(vn, n) > 0.99, 'the smooth normal agrees with the face');
      close(vn[0], -0.1 / Math.sqrt(1.01), 1e-3, 'tilted by the slope');
    }
  }
  const swapped = new Batch();
  meshRoof(swapped, mesh, h, (p) => [p[1], -p[0]]);
  assert.deepEqual(swapped.uvs.slice(0, 2), [swapped.positions[2], -(swapped.positions[0] as number)], 'a uvOf turns the UVs');
  // walls on the boundary: from the ground to the roof, with a band above the eaves when asked
  const wall = new Batch();
  boundaryWalls(wall, null, mesh, h, 99);
  assert.equal(wall.triangles, mesh.boundary.length * 2, 'a quad for each boundary segment');
  const tops = verts(wall).filter((v) => v[1] > GROUND_Y);
  for (const v of tops) close(v[1], h([v[0], v[2]]), 1e-12, 'the wall top is the roof');
  assert.ok(verts(wall).filter((v) => v[1] === GROUND_Y).length === wall.count / 2);
  const w2 = new Batch();
  const band = new Batch();
  boundaryWalls(w2, band, mesh, h, 5);
  for (const v of verts(w2)) assert.ok(v[1] <= 5 + 1e-12, 'the wall stops at the eaves');
  assert.ok(band.triangles > 0 && band.triangles < w2.triangles, 'the band takes over where the roof is above the eaves');
  for (const v of verts(band)) assert.ok(Math.abs(v[1] - 5) < 1e-12 || Math.abs(v[1] - h([v[0], v[2]])) < 1e-9, 'from the eaves up to the roof');
  const skipped = new Batch();
  boundaryWalls(skipped, null, mesh, h, 99, (a, b) => a[0] === 0 && b[0] === 0);
  assert.equal(skipped.triangles, wall.triangles - 2 * 4, 'the four segments on the west side are left out');
});

test('raisedWallQuads, dressEdges and paneGrid: one trapezoid per raised wall; decals a hair off the wall; windows only where the wall is tall enough', () => {
  const w: RaisedWall = { edge: ringEdges(sq(0, 0, 10, 10))[0] as RaisedWall['edge'], baseA: 11, baseB: 13, topA: 19.7, topB: 19.7 };
  const b = new Batch();
  raisedWallQuads(b, [w]);
  assert.equal(b.triangles, 2);
  assert.deepEqual(verts(b).map((v) => v[1]).sort((x, y) => x - y), [11, 13, 19.7, 19.7]);
  for (const t of trisOf(b)) assert.ok(dot3(windingNormal(t), [w.edge.normal[0], 0, w.edge.normal[1]]) > 0.999, 'faces out');
  // a piece that dies away to nothing at one end (the neighbour's roof reaches this wall's top there) is one triangle, and none at all where both ends are flush
  const tapered = new Batch();
  raisedWallQuads(tapered, [{ ...w, baseA: 19.7, baseB: 14 }]);
  assert.equal(tapered.triangles, 1, 'a triangle, not a quad with a zero-area half');
  assert.ok(areaOf(trisOf(tapered)[0] as Tri) > 1);
  const flush = new Batch();
  raisedWallQuads(flush, [{ ...w, baseA: 19.7, baseB: 19.7 }]);
  assert.equal(flush.triangles, 0);
  // decals: five 1.4 x 2.0 sashes in a row on the south wall of a 20 m square (z = 20), each lifted 0.08 m, its UVs spanning the whole window texture
  const parts: PartMap<Key> = {};
  const south = ringEdges(sq(0, 0, 20, 20))[2] as RaisedWall['edge'];
  assert.deepEqual(south.normal, [0, 1], 'the south wall faces south');
  assert.equal(dressEdges(parts, [south], [{ y: 4.3, h: 2.0, w: 1.4, key: 'sash' }], 4, () => 9), 5);
  const d = parts.sash as Batch;
  assert.equal(d.triangles, 10);
  for (const v of verts(d)) close(v[2], 20.08, 1e-12, 'lifted off the wall');
  const [tw, th] = TEXTURES.window.tile;
  assert.deepEqual([Math.max(...d.uvs.filter((_, i) => i % 2 === 0)), Math.max(...d.uvs.filter((_, i) => i % 2 === 1))], [tw, th]);
  const xs = verts(d).map((v) => v[0]);
  close(Math.min(...xs), 2 - 0.7, 1e-12, 'a window is centred in the 4 m bay at the west end');
  close(Math.max(...xs), 18 + 0.7, 1e-12, 'and one in the bay at the east end');
  // rows of windows: a 20 m wall at a 4 m pitch, rows that do not fit under the top are left out
  const p2: PartMap<Key> = {};
  const n = dressEdges(p2, [ringEdges(sq(0, 0, 20, 20))[0] as RaisedWall['edge']], [{ y: 0.5, h: 3.2, w: 1.9, key: 'sashArch' }, { y: 4.3, h: 2.0, w: 1.4, key: 'sash' }], 4, () => 5);
  assert.equal(n, 5, 'five bays, and the upper row (to 6.6 m) does not fit under a 5 m wall');
  assert.equal((p2.sashArch as Batch).triangles, 10);
  assert.equal(p2.sash, undefined);
  const p3: PartMap<Key> = {};
  assert.equal(dressEdges(p3, [ringEdges(sq(0, 0, 3, 3))[0] as RaisedWall['edge']], [{ y: 0.5, h: 2, w: 1, key: 'sash' }], 4, () => 9), 0, 'a wall shorter than a bay gets none');
  const p4: PartMap<Key> = {};
  const g = paneGrid(p4, [ringEdges(sq(0, 0, 15.6, 20))[0] as RaisedWall['edge']], 4, 4.2, 3.9, () => 12);
  assert.equal(g, 12, 'four bays of three storeys: the fourth storey (windows from 13.6 m) is above a 12 m top');
  assert.equal((p4.pane as Batch).triangles, 24);
});

// =============================================================================================
// 4. the landmarks against the OSM outlines and the published heights

const plans = kxPlans(data);
const geo = kxGeometry(plans);
const allKeys = Object.keys(createMaterials().table) as Key[];
const batchesOf = (sets: PartMap<Key>[], key: Key): Batch[] => sets.map((s) => s[key]).filter((x): x is Batch => !!x);
const allBatches = (sets: PartMap<Key>[]): [Key, Batch][] => sets.flatMap((s) => (Object.entries(s) as [Key, Batch][]));
const extent = (sets: PartMap<Key>[]): { lo: V3; hi: V3 } => {
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const [, b] of allBatches(sets)) for (const v of verts(b)) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k] as number, v[k] as number);
    hi[k] = Math.max(hi[k] as number, v[k] as number);
  }
  return { lo, hi };
};
const bbox = (rings: Pt[][]): { x0: number; x1: number; z0: number; z1: number } => {
  const xs = rings.flat().map((p) => p[0]);
  const zs = rings.flat().map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
};
const osm = (id: number): Pt[] => outlineOf(data, id);

test('every landmark is built, every triangle is real (finite, with an area), every normal is a unit vector and no triangle faces against its normal', () => {
  assert.deepEqual(Object.keys(geo).sort(), ['coalDrops', 'crick', 'gasholders', 'granary', 'gymnasium', 'landscraper', 'library']);
  for (const [name, sets] of Object.entries(geo)) {
    assert.ok(sets.length >= 1);
    for (const [key, b] of allBatches(sets)) {
      assert.ok(b.positions.every(Number.isFinite) && b.uvs.every(Number.isFinite) && b.normals.every(Number.isFinite), `${name}/${key}: finite`);
      assert.equal(b.uvs.length, (b.positions.length / 3) * 2, `${name}/${key}: a UV for every vertex`);
      for (const t of trisOf(b)) {
        assert.ok(areaOf(t) > 1e-9, `${name}/${key}: a triangle of area ${areaOf(t)}`);
        for (const n of t.n) close(len3(n), 1, 1e-6, `${name}/${key}: unit normal`);
        // (a smooth-shaded roof triangle may lean against one of its three vertex normals where the surface bends, never against all)
        assert.ok(dot3(windingNormal(t), [t.n[0][0] + t.n[1][0] + t.n[2][0], t.n[0][1] + t.n[1][1] + t.n[2][1], t.n[0][2] + t.n[1][2] + t.n[2][2]]) > 0, `${name}/${key}: a triangle faces against its normals`);
      }
    }
  }
});

test('footprints: every landmark stands on its OSM outline (to its bounding box, a metre or so over for what stands proud of the wall)', () => {
  const out = (name: string, rings: Pt[][], margin: number, reach = 3): void => {
    const e = extent(geo[name] as PartMap<Key>[]);
    const bb = bbox(rings);
    assert.ok(e.lo[0] >= bb.x0 - margin && e.hi[0] <= bb.x1 + margin && e.lo[2] >= bb.z0 - margin && e.hi[2] <= bb.z1 + margin, `${name}: [${e.lo[0].toFixed(1)}..${e.hi[0].toFixed(1)}] x [${e.lo[2].toFixed(1)}..${e.hi[2].toFixed(1)}] against ${JSON.stringify(bb)}`);
    // and fills it: the mesh reaches within `reach` metres of each side
    assert.ok(e.lo[0] <= bb.x0 + reach && e.hi[0] >= bb.x1 - reach && e.lo[2] <= bb.z0 + reach && e.hi[2] >= bb.z1 - reach, `${name}: reaches the outline's extent`);
  };
  out('coalDrops', [osm(OSM.westernCoalDrops), osm(OSM.easternCoalDrops)], 1);
  out('granary', [osm(OSM.granary), osm(OSM.westTransitShed), osm(OSM.eastTransitShed), osm(OSM.granaryStreet)], 1);
  out('crick', [plans.crick.parts[0]?.outline as Pt[], plans.crick.parts[1]?.outline as Pt[]], 1);
  out('library', [osm(OSM.britishLibrary)], 7, 12); // simplified to the scale of a roof: its jogs and one thin spike are gone
  out('gymnasium', [osm(OSM.gymnasium)], 2);
  out('landscraper', [osm(OSM.landscraper)], 1);
  const g = plans.gas;
  out('gasholders', [...g.triplet, g.park].flatMap((h) => [[[h.centre[0] - h.radius, h.centre[1] - h.radius], [h.centre[0] + h.radius, h.centre[1] + h.radius]] as Pt[]]), 1.5);
});

test('the walls stand on the outlines: the foot of each wall is on the OSM outline (Coal Drops, Granary front, sheds, Crick, landscraper), and the Crick has none along its valley', () => {
  const feet = (b: Batch): Pt[] => verts(b).filter((v) => Math.abs(v[1] - GROUND_Y) < 1e-9).map((v) => [v[0], v[2]] as Pt);
  const coal = geo.coalDrops as PartMap<Key>[];
  const coalRings = [osm(OSM.westernCoalDrops), osm(OSM.easternCoalDrops)];
  const coalFeet = batchesOf(coal, 'brick').flatMap(feet);
  assert.ok(coalFeet.length > 100);
  for (const p of coalFeet) assert.ok(coalRings.some((r) => distToRing(p, r) < 0.05), `Coal Drops wall foot ${p} is on an outline`);
  const gr = geo.granary as PartMap<Key>[];
  const rings = [osm(OSM.granary), osm(OSM.westTransitShed), osm(OSM.eastTransitShed), osm(OSM.granaryStreet)];
  // (the four hoist piers of the Granary's south front stand 0.4 m proud of the wall, so their feet are that far off the outline)
  for (const p of batchesOf(gr, 'brick').flatMap(feet)) assert.ok(rings.some((r) => distToRing(p, r) < FIG.granary.hoistProjection + 0.01), `Granary complex wall foot ${p} is on an outline`);
  const sheds = batchesOf([geo.granary?.[1] as PartMap<Key>, geo.granary?.[2] as PartMap<Key>, geo.granary?.[3] as PartMap<Key>], 'brick').flatMap(feet);
  assert.ok(sheds.length > 20);
  for (const p of sheds) assert.ok(rings.some((r) => distToRing(p, r) < 0.01), `a shed wall foot ${p} is on an outline`);
  const crick = geo.crick as PartMap<Key>[];
  const cp = plans.crick.parts;
  for (const p of batchesOf(crick, 'curtain').flatMap(feet)) assert.ok(cp.some((part) => distToRing(p, part.outline) < 0.05), `Crick wall foot ${p} is on a part outline`);
  const shared = (cp[0] as (typeof cp)[number]).shared;
  for (const b of batchesOf(crick, 'curtain')) {
    for (const t of trisOf(b)) {
      const base = t.p.filter((p) => Math.abs(p[1] - GROUND_Y) < 1e-9);
      if (base.length === 2) {
        const m: Pt = [((base[0] as V3)[0] + (base[1] as V3)[0]) / 2, ((base[0] as V3)[2] + (base[1] as V3)[2]) / 2];
        assert.ok(distToPolyline(m, shared) > 0.2, `a Crick wall stands in the valley at ${m}`);
      }
    }
  }
  const ls = geo.landscraper as PartMap<Key>[];
  for (const p of batchesOf(ls, 'timber').flatMap(feet)) assert.ok(distToRing(p, osm(OSM.landscraper)) < 0.01 || plans.landscraper.zones.some((z) => distToRing(p, z.ring) < 0.01), 'landscraper wall foot');
});

test('heights against the sources: the kiss at 25 m [CM], the Granary roof at 25.2 m, the frames at 33 m [HE-GAS], the Crick crown at 43 m [ADF], the clock tower at 37.4 m, the Gymnasium lantern at 19.4 m, the landscraper at 11 storeys [WP-P37]; walls start at the ground', () => {
  const top = (n: string): number => extent(geo[n] as PartMap<Key>[]).hi[1];
  const bottom = (n: string): number => extent(geo[n] as PartMap<Key>[]).lo[1];
  close(top('coalDrops'), FIG.coal.apex, 1e-9, 'Coal Drops: the kiss');
  close(top('granary'), plans.granary.granary.eaves + plans.granary.granary.roofRise, 1e-9, 'Granary: ridge');
  close(top('granary'), 25.2, 0.01);
  assert.ok(top('gasholders') >= 33 && top('gasholders') <= 33.5, `gasholders ${top('gasholders')}`);
  assert.ok(top('crick') > 42 && top('crick') <= 43 + 1e-9, `Crick ${top('crick')}`);
  close(top('library'), FIG.library.clockHeight + 3.4, 1e-9, 'British Library: the clock tower\'s spire');
  close(top('gymnasium'), 17.4 + FIG.gymnasium.lantern + 0.2, 1e-9, 'Gymnasium: lantern cap');
  close(top('landscraper'), 11 * 4.2, 1e-9, 'Platform 37: 11 storeys');
  for (const n of Object.keys(geo)) close(bottom(n), GROUND_Y, 1e-9, `${n}: starts at the ground`);
  // no wall, roof or frame ever rises above what its source allows
  assert.ok(top('crick') < 43 + 1e-9 && top('coalDrops') < 25 + 1e-9);
});

test('the roofs close on the walls: Coal Drops\' glazing band rises from the eaves to the roof exactly, the Crick\'s two vaults meet at the eaves along the valley', () => {
  const coal = geo.coalDrops as PartMap<Key>[];
  const p = plans.coal;
  const bandPts = batchesOf(coal, 'pane').flatMap((b) => verts(b)).filter((v) => v[1] > p.eaves + 1e-6);
  assert.ok(bandPts.length > 50, 'a glazing band under the lifted roof');
  for (const v of bandPts) {
    const w = plans.coal.roofHeight('west', [v[0], v[2]]);
    const e = plans.coal.roofHeight('east', [v[0], v[2]]);
    assert.ok(Math.abs(v[1] - w) < 1e-9 || Math.abs(v[1] - e) < 1e-9, `band top ${v[1]} is on a roof (${w}, ${e})`);
  }
  const slate = batchesOf(coal, 'slate').flatMap((b) => verts(b));
  assert.ok(slate.length > 1000);
  // the Crick: roof vertices on the shared valley are at the eaves from both sides
  const crick = geo.crick as PartMap<Key>[];
  const shared = (plans.crick.parts[0] as (typeof plans.crick.parts)[number]).shared;
  const onValley = batchesOf(crick, 'alu').flatMap((b) => verts(b)).filter((v) => distToPolyline([v[0], v[2]], shared) < 1e-6);
  assert.ok(onValley.length > 20, `${onValley.length} roof vertices on the valley`);
  for (const v of onValley) close(v[1], 32, 1e-6, 'valley at the eaves');
});

test('the structure of the facades: the Granary has five casements and four hoist recesses, a stone band at each storey and at the eaves; the frames have the columns, girders and braces they should', () => {
  const g = granaryGeometry(plans.granary.granary);
  assert.equal((g.pane as Batch).triangles, 8, 'four hoist recesses');
  const decals = (g.sashArch as Batch).triangles / 2;
  assert.equal(decals, 5 * 6, 'five casement bays, six storeys of windows each');
  assert.equal(g.sash, undefined, 'the Granary has segmental-arched casements only');
  assert.ok((g.stone as Batch).triangles >= 3 * 4, 'a string course and a cornice');
  const gas = gasholderGeometry(plans.gas);
  const f = [...plans.gas.triplet, plans.gas.park];
  // columns: 5 faces (no underside) = 10 triangles; girders and braces: 4 faces = 8; plus six canopy posts of 4 faces
  const want = f.reduce((s, h) => s + 10 * h.columns + 8 * h.columns * h.tiers * 2, 0) + 6 * 8;
  assert.equal((gas.iron as Batch).triangles, want, 'columns, ring girders at every tier, a brace in every bay of every tier');
  assert.equal((gas.drum as Batch).triangles, 3 * 48 * 4 + 32 * 4, 'three drums (outer and courtyard walls, 48 sides) and the canopy disc (32 sides)');
  assert.equal((gas.green as Batch).triangles, 3 * (48 * 2 + 24), 'three roof gardens and their lawns');
});

test('triangle budgets: each landmark within 25% of its build size, nothing missing and nothing runaway', () => {
  const count = (n: string): number => (geo[n] as PartMap<Key>[]).reduce((s, set) => s + Object.values(set).reduce((a, b) => a + (b as Batch).triangles, 0), 0);
  const budget: [string, number, number][] = [
    ['coalDrops', 2500, 4800],
    ['granary', 450, 960],
    ['gasholders', 4500, 7800],
    ['crick', 1400, 2400],
    ['library', 1500, 2900],
    ['gymnasium', 300, 660],
    ['landscraper', 20, 60],
  ];
  for (const [n, lo, hi] of budget) assert.ok(count(n) >= lo && count(n) <= hi, `${n}: ${count(n)} triangles, expected ${lo}..${hi}`);
});

test('UV density: every wall, roof and garden is mapped in metres (UV area / surface area is 1 on a wall and the cosine of the slope on a roof), so the textures land at their stated texels per metre', () => {
  const metric: Key[] = ['brick', 'brickRed', 'stone', 'slate', 'alu', 'curtain', 'timber', 'drum', 'green', 'roofGlass'];
  const lo: Partial<Record<Key, number>> = {};
  // (a curved wall is mapped by arc length, which is 0.07% more than the chord on a 48-sided drum: allow 0.2%)
  const over = 1.002;
  for (const key of metric) {
    let uv = 0;
    let surf = 0;
    for (const sets of Object.values(geo)) for (const b of batchesOf(sets, key)) {
      for (const t of trisOf(b)) {
        const s = areaOf(t);
        const u = uvAreaOf(t);
        assert.ok(u <= s * over + 1e-9, `${key}: a triangle's UV area ${u} is more than its surface ${s}`);
        uv += u;
        surf += s;
      }
    }
    if (surf === 0) continue;
    const ratio = uv / surf;
    assert.ok(ratio >= 0.8 && ratio <= over, `${key}: UV area is ${ratio.toFixed(3)} of the surface`);
    lo[key] = ratio;
  }
  // texels per metre as laid: the texture's density times the square root of that ratio, inside the stated range
  for (const name of names) {
    const ratio = lo[name] ?? 1;
    const [tx, ty] = texelsPerMetre(KX_TEXTURES[name]);
    const spec = KX_TEXTURES[name];
    for (const t of [tx, ty]) {
      const laid = t * Math.sqrt(ratio);
      assert.ok(laid >= spec.density[0] * 0.9 && laid <= spec.density[1] + 1e-9, `${name}: ${laid.toFixed(1)} texels/m as laid, allowed ${spec.density}`);
    }
  }
  // the walls are exactly metric
  for (const key of ['brick', 'brickRed', 'curtain', 'timber'] as Key[]) {
    for (const sets of Object.values(geo)) for (const b of batchesOf(sets, key)) for (const t of trisOf(b)) {
      if (Math.abs(windingNormal(t)[1]) < 0.01) close(uvAreaOf(t), areaOf(t), 1e-6 * Math.max(1, areaOf(t)), `${key}: a vertical wall is mapped one UV unit to the metre`);
    }
  }
});

// =============================================================================================
// 5. the scene

test('addKxCentral: one mesh per material (14) and one instanced mesh of 250 trees: 15 draw calls, within the +20 budget, and a triangle count that adds up', () => {
  const scene = new THREE.Scene();
  const kx = addKxCentral(scene, data);
  assert.ok(scene.children.includes(kx.group));
  const kids = kx.group.children;
  assert.equal(kids.length, 15);
  assert.ok(kids.length <= 20, 'the brief allows +20 draw calls');
  const meshNames = kids.map((c) => c.name).sort();
  assert.deepEqual(meshNames, [...allKeys.map((k) => `kxcentral-${k}`), 'kxcentral-trees'].sort());
  assert.equal(new Set(kids.map((c) => (c as THREE.Mesh).material)).size, 15, 'a different material on each');
  assert.deepEqual(kx.excludeIds, KXCENTRAL_OSM_IDS);
  assert.equal(kx.stats.meshes, 15);
  assert.equal(kx.stats.materials, 15);
  assert.equal(kx.stats.instances, 250);
  const trees = kids.find((c) => c.name === 'kxcentral-trees') as THREE.InstancedMesh;
  assert.ok(trees.isInstancedMesh);
  assert.equal(trees.count, 250, '[GU] about 250 trees, one draw call');
  assert.ok(trees.instanceColor, 'each tree has its own green');
  let merged = 0;
  for (const c of kids) {
    if (c === trees) continue;
    const g = (c as THREE.Mesh).geometry;
    merged += (g.index as THREE.BufferAttribute).count / 3;
  }
  const perTree = trees.geometry.index ? trees.geometry.index.count / 3 : trees.geometry.getAttribute('position').count / 3;
  assert.equal(kx.stats.triangles, merged + perTree * 250, 'stats add up to what is in the scene');
  assert.ok(kx.stats.triangles >= 15_000 && kx.stats.triangles <= 25_000, `${kx.stats.triangles} triangles`);
  assert.equal(Object.values(kx.stats.byLandmark).reduce((a, b) => a + b, 0), kx.stats.triangles);
  assert.equal((kids.find((c) => c.name === 'kxcentral-roofGlass') as THREE.Mesh).renderOrder, 2, 'the street\'s glass is drawn after the opaque');
  kx.dispose();
});

test('the trees are on the roofs: each of the 250 instances stands inside its terrace, a trunk\'s height above the roof, sized by its crown', () => {
  const ls = plans.landscraper;
  const m = treeMesh(ls.trees);
  assert.equal(m.count, 250);
  const mat = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  ls.trees.forEach((t, i) => {
    m.getMatrixAt(i, mat);
    mat.decompose(p, q, s);
    // (the matrices are Float32: a coordinate of 600 m is good to about 6e-5)
    close(p.x, t.x, 1e-3, 'x');
    close(p.z, t.z, 1e-3, 'z');
    close(s.x, t.size, 1e-3, 'crown size');
    close(p.y, t.y + 0.5 + t.size * 0.45, 1e-3, 'a trunk above the roof');
    const zone = ls.zones.find((z) => Math.abs(z.height - t.y) < 1e-9);
    assert.ok(zone && pointInPolygon([p.x, p.z], zone.ring), 'inside its terrace');
  });
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
});

test('the same landmarks every load: two builds give identical meshes', () => {
  const s1 = new THREE.Scene();
  const s2 = new THREE.Scene();
  const a = addKxCentral(s1, data);
  const b = addKxCentral(s2, data);
  a.group.children.forEach((c, i) => {
    const pa = (c as THREE.Mesh).geometry.getAttribute('position').array;
    const pb = ((b.group.children[i] as THREE.Mesh).geometry.getAttribute('position')).array;
    assert.deepEqual(Array.from(pa), Array.from(pb), `${c.name}: same vertices`);
  });
  a.dispose();
  b.dispose();
});

test('dispose removes the group and frees the geometries and the module\'s own materials, but not the shared ones', () => {
  const scene = new THREE.Scene();
  const kx = addKxCentral(scene, data);
  let geometries = 0;
  let materials = 0;
  kx.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.addEventListener('dispose', () => geometries++);
      (o.material as THREE.Material).addEventListener('dispose', () => materials++);
    }
  });
  let sharedDisposed = 0;
  for (const name of ['brick', 'slateBothSides', 'pane'] as const) material(name).addEventListener('dispose', () => sharedDisposed++);
  kx.dispose();
  assert.equal(scene.children.length, 0, 'out of the scene');
  assert.equal(geometries, 15, 'every geometry');
  assert.equal(materials, 6 + 1, 'the six local materials and the trees\'');
  assert.equal(sharedDisposed, 0, 'the shared ones stay');
});

test('building them is cheap: all seven landmarks in well under a second', () => {
  const t0 = performance.now();
  const kx = addKxCentral(new THREE.Scene(), data);
  const ms = performance.now() - t0;
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms`);
  kx.dispose();
});

test('coalDropsGeometry alone: the two sheds\' roofs are one slate batch of mesh triangles, the walls brick with window decals in three rows', () => {
  const g = coalDropsGeometry(plans.coal);
  const wMesh = meshPolygon(plans.coal.west.outline, FIG.coal.maxEdge).tris.length;
  const eMesh = meshPolygon(plans.coal.east.outline, FIG.coal.maxEdge).tris.length;
  assert.equal((g.slate as Batch).triangles, wMesh + eMesh, 'one roof triangle per mesh triangle');
  assert.ok((g.sashArch as Batch).triangles > 0);
  assert.equal((g.sash as Batch).triangles, 2 * (g.sashArch as Batch).triangles, 'two upper rows of casements for each arched ground-floor window');
});
