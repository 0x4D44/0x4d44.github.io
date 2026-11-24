import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { SHED_PLATFORM_REFS, shedLayout, worldToShed } from '../../core/station.ts';
import * as furniture from '../src/furniture.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import { SURFACES } from '../src/atmosphere.ts';
import { PAINTERS, TEXTURES } from '../src/materials.ts';
import { PLATFORM_CLOCK, ribPositions } from '../src/shed.ts';

// Round 16 (platform-round-3 score, section 5; rubric shed-interior B5, R-kx-shed-interior-e and -a viewed): the furniture the photographs show that the shed lacked,
// a pair of bins, a platform-number blade and a trolley point on every platform or shared island, in one draw, casting nothing, standing on the platform,
// clear of the other furniture, behind the safety lines and out of the platform clock's bay.
const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const layout = shedLayout(data);
const F = furniture as unknown as Record<string, unknown>;
type Extra = { kind: string; label: string; x: number; z: number; r: number; ref: string };

test('B5: bins, a number blade and a trolley point on every shed platform or island, clear of everything and of the clock\'s bay', () => {
  const plan = furniture.furniturePlan(data, layout) as unknown as Record<string, unknown>;
  const extras = plan.extras as Extra[] | undefined;
  assert.ok(Array.isArray(extras), 'the plan has extras');
  const groups = new Set(extras.map((e) => e.label));
  for (const label of groups) assert.deepEqual(extras.filter((e) => e.label === label).map((e) => e.kind).sort(), ['bins', 'blade', 'trolley'], `one of each on ${label}`);
  const covered = new Set([...groups].flatMap((l) => l.split(' ')));
  const missing = SHED_PLATFORM_REFS.filter((r) => !covered.has(r));
  assert.ok(missing.length <= 1, `every shed platform has them, at most one too short to: missing ${missing}`);
  for (const e of extras) assert.ok(e.label.split(' ').includes(e.ref), `${e.kind} on ${e.label} stands on one of its platforms (${e.ref})`);
  // clear of every other piece of furniture, footprint to footprint
  const others = ['lamps', 'benches', 'helpPoints', 'totems', 'clocks'].flatMap((k) => plan[k] as { x: number; z: number; r: number }[]);
  for (const e of extras) {
    for (const q of [...others, ...extras.filter((o) => o !== e)]) assert.ok(Math.hypot(q.x - e.x, q.z - e.z) >= q.r + e.r - 1e-9, `${e.kind} on ${e.label} clear of a neighbour`);
  }
  // the clock's bay
  const ribs = ribPositions(layout.length), clockV = ribs.reduce((b, v) => (Math.abs(v - PLATFORM_CLOCK.v * layout.length) < Math.abs(b - PLATFORM_CLOCK.v * layout.length) ? v : b));
  for (const e of extras) assert.ok(Math.abs(worldToShed(layout, [e.x, e.z]).v - clockV) >= 6, `${e.kind} on ${e.label} out of the clock's bay`);
});

test('B5: one merged mesh, casting no shadow, standing on the platform; the blades carry their platforms\' numbers', () => {
  const g = furniture.buildFurniture(data, layout);
  const m = g.getObjectByName('platform-extras') as THREE.Mesh | undefined;
  assert.ok(m, 'a platform-extras mesh');
  assert.ok(!m.castShadow && !SHADOW_CASTERS.has('platform-extras'), 'casts no shadow');
  assert.equal(g.children.filter((c) => c.name === 'platform-extras').length, 1, 'one draw');
  const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  assert.ok(tris < 4000, `${tris} triangles`);
  const extraGeometry = F.extraGeometry as (e: { kind: string; label: string }) => THREE.BufferGeometry;
  for (const kind of ['bins', 'blade', 'trolley']) {
    const geo = extraGeometry({ kind, label: '7' });
    geo.computeBoundingBox();
    assert.ok(Math.abs(geo.boundingBox!.min.y) < 1e-6, `the ${kind} stands on the platform`);
  }
  const blade = extraGeometry({ kind: 'blade', label: '7' }), blade8 = extraGeometry({ kind: 'blade', label: '8' }), blade67 = extraGeometry({ kind: 'blade', label: '6 7' });
  const n = (geo: THREE.BufferGeometry) => geo.getAttribute('position').count;
  assert.ok(n(blade8) > n(blade) && n(blade67) > n(blade8), 'the number drawn in strokes: 8 has more than 7, and "6 7" both digits');
  blade.computeBoundingBox();
  assert.ok(blade.boundingBox!.max.y > 3 && blade.boundingBox!.max.y < 4, 'the blade over head height, on its post');
});

/** The fills a painter makes, in a recording context. */
function fills(name: string): { x: number; y: number; w: number; h: number; c: string }[] {
  const spec = (TEXTURES as Record<string, { px: [number, number] }>)[name]!, [w, h] = spec.px, out: { x: number; y: number; w: number; h: number; c: string }[] = [];
  let style = '';
  const g = new Proxy({}, {
    get: (_t, k) => (k === 'fillRect' ? (x: number, y: number, fw: number, fh: number) => out.push({ x, y, w: fw, h: fh, c: style }) : k === 'fillStyle' ? style : () => undefined),
    set: (_t, k, v) => { if (k === 'fillStyle') style = String(v); return true; },
  });
  ((PAINTERS as Record<string, unknown>)[name] as (g: unknown, w: number, h: number) => void)(g, w, h);
  return out;
}
const joints = (name: string) => { const [w] = (TEXTURES as Record<string, { px: [number, number] }>)[name]!.px; return fills(name).filter((f) => f.w >= w && f.h < 3 && /rgba\(20,20,18/.test(f.c)); };

test('B4: the shed\'s platform tops have their own texture with transverse slab joints at 0.6-0.9 m, the edge strip one a tile at the same pitch, the shared asphalt untouched', () => {
  const top = (TEXTURES as Record<string, { tile: [number, number]; px: [number, number] }>).platformTop;
  assert.ok(top, 'a platformTop texture');
  const pxm = top.px[1] / top.tile[1], ys = joints('platformTop').map((f) => f.y / pxm).sort((a, b) => a - b);
  assert.ok(ys.length >= 2, `joints: ${ys}`);
  const pitch = [...ys.slice(1), ys[0]! + top.tile[1]].map((y, i) => y - ys[i]!);
  for (const p of pitch) assert.ok(p >= 0.6 && p <= 0.9 && Math.abs(p - pitch[0]!) < 1e-6, `an even pitch of 0.6-0.9 m, across the tile's wrap too: ${pitch}`);
  const edge = TEXTURES.platformEdge, ej = joints('platformEdge');
  assert.ok(Math.abs(edge.tile[1] - pitch[0]!) < 1e-6 && ej.length === 1, `the edge strip: one joint a ${edge.tile[1]} m tile, the tops' pitch`);
  assert.equal(joints('asphalt').length, 0, 'the asphalt (the city\'s roads, Perth\'s bridge) has no joints');
  assert.deepEqual(SURFACES.get('platformTop'), SURFACES.get('asphalt'), 'wet and snow as the asphalt');
  const tops = furniture.buildPlatforms(data, layout).getObjectByName('platform-tops') as THREE.Mesh;
  assert.equal((tops.material as THREE.Material).name, 'platformTop', 'the shed\'s platform tops wear it');
  // the coping paler for the night
  const band = fills('platformEdge').find((f) => f.x === 0 && f.h >= edge.px[1] && /^#/.test(f.c))!;
  const n = parseInt(band.c.slice(1), 16), lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  assert.ok(lum >= 205, `the coping ${band.c}, luminance ${lum.toFixed(0)}`);
});

test('B5: the platform clock\'s face is white with a gold inner chapter ring; the tower\'s dial is as it was', async () => {
  const shed = await import('../src/shed.ts') as unknown as Record<string, unknown>;
  const paint = shed.paintDial as (g: unknown, size: number, bezel?: string, look?: unknown) => void;
  const look = shed.PLATFORM_DIAL_LOOK as { face: string; chapter?: string } | undefined;
  assert.ok(look, 'a platform dial look');
  const record = (l?: unknown) => {
    const ops: { op: string; style: string }[] = [];
    let fill = '', stroke = '';
    const g = new Proxy({}, {
      get: (_t, k) => (k === 'fill' ? () => ops.push({ op: 'fill', style: fill }) : k === 'stroke' ? () => ops.push({ op: 'stroke', style: stroke }) : k === 'fillStyle' ? fill : k === 'strokeStyle' ? stroke : () => undefined),
      set: (_t, k, v) => { if (k === 'fillStyle') fill = String(v); if (k === 'strokeStyle') stroke = String(v); return true; },
    });
    paint(g, 512, undefined, l);
    return ops;
  };
  const rgbOf = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const plat = record(look), tower = record();
  const face = rgbOf(plat[1]!.style);
  assert.ok(Math.min(...face) >= 245 && Math.max(...face) - Math.min(...face) <= 6, `the face white, not cream: ${plat[1]!.style}`);
  const gold = plat.filter((o) => o.op === 'stroke').map((o) => rgbOf(o.style)).find(([r, g, b]) => r > 150 && g > 110 && b < 100 && r - b > 80);
  assert.ok(gold, 'a gold ring among the strokes');
  assert.equal(tower[1]!.style, '#efe8d4', 'the tower\'s field still ivory');
  assert.ok(!tower.some((o) => o.op === 'stroke' && /^#c9a03a$/i.test(o.style)), 'and no gold ring on it');
  const clock = (shed.buildPlatformClock as (l: number) => THREE.Group)(layout.length);
  const mat = (clock.getObjectByName('shed-platform-clock-faces') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  assert.ok(mat.color.getHex() === parseInt(look.face.slice(1), 16), 'the clock wears it (Node: the flat colour)');
});

test('B5: the clock\'s spandrel web is pierced by roundels, each ringed; its cresting a scroll, an elliptical edge either side of the dial', async () => {
  const shed = await import('../src/shed.ts') as unknown as Record<string, unknown>;
  const roundels = shed.SPANDREL_ROUNDELS as [number, number, number][] | undefined, crest = shed.CRESTING as { a: number; b: number } | undefined;
  assert.ok(roundels && roundels.length >= 2 && roundels.length <= 3 && crest, 'two or three roundels, and the cresting\'s scroll, are declared');
  const spec = shed.PLATFORM_CLOCK as { y: number; beamDrop: number; wall: number; out: number; radius: number; rim: number };
  const clock = (shed.buildPlatformClock as (l: number) => THREE.Group)(layout.length);
  const pos = (clock.getObjectByName('shed-platform-clock-iron') as THREE.Mesh).geometry.getAttribute('position');
  const pts: [number, number][] = [];
  const zs: number[] = [];
  for (let i = 0; i < pos.count; i++) { pts.push([pos.getX(i), pos.getY(i)]); zs.push(pos.getZ(i)); }
  const z0 = (Math.min(...zs) + Math.max(...zs)) / 2;
  const beamY = spec.y - spec.beamDrop, cx = spec.wall + spec.out;
  for (const [dx, dy, r] of roundels) {
    const c: [number, number] = [spec.wall + dx, beamY + dy], d = (p: [number, number]) => Math.hypot(p[0] - c[0], p[1] - c[1]);
    assert.equal(pts.filter((p) => d(p) < 0.6 * r).length, 0, `the roundel at ${dx}, ${dy} open`);
    assert.ok(pts.filter((p, i) => Math.abs(d(p) - r) < 0.03 && Math.abs(Math.abs(zs[i]! - z0) - 0.02) < 0.002).length >= 8, 'and ringed (the ring 0.04 m deep, proud of the web\'s 0.03 m plate)');
    assert.ok(pts.some((p) => d(p) > r + 0.02 && d(p) < r + 0.08), 'in a web');
  }
  const top = Math.max(...pts.filter((p) => Math.abs(p[1] - beamY) < 0.1).map((p) => p[1]));
  for (const s of [-1, 1]) for (const u of [0, (5 * Math.PI) / 12]) { // the scroll's top and a point low on it: no bar of its field reaches either
    const q: [number, number] = [cx + s * spec.radius * 0.55 + s * crest.a * Math.sin(u), top + crest.b * Math.cos(u)];
    assert.ok(pts.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.035), `the scroll's edge through ${q.map((n) => n.toFixed(2))}`);
  }
});
