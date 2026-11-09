// web/src/landmarks.ts: the geometry of the Great Northern Hotel, the Midland Grand and the Barlow vault.
// No DOM: only the geometry builders and the scene assembly are exercised.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { barlowHeight, barlowPlan, barlowSection, chainBays, FIGURES, greatNorthernHotelPlan, midlandGrandPlan, OSM_IDS, polygonEdges, REPLACED_BUILDING_IDS } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { pointInPolygon, worldToShed } from '../../core/station.ts';
import { addArch, addBand, addLandmarks, addTwin, addWalls, ARCH, barlowGeometry, createMaterials, headArc, HOTEL_ADVANCED, hotelGeometry, LANDMARK_OSM_IDS, midlandGeometry, PAVILIONS, pointInQuad, ROWS, segmentsOutside, towerSquare, towerStages, windowOutline } from '../src/landmarks.ts';
import type { Key } from '../src/landmarks.ts';
import { Batch, material, TEXTURES } from '../src/materials.ts';
import type { PartMap, V3 } from '../src/materials.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);

interface Tri {
  p: [V3, V3, V3];
  uv: [[number, number], [number, number], [number, number]];
  n: V3;
}
/** The triangles of a mesh, with their stored normals. */
function triangles(m: Batch): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const k = [m.indices[i], m.indices[i + 1], m.indices[i + 2]] as [number, number, number];
    const v = (j: number): V3 => [m.positions[j * 3] as number, m.positions[j * 3 + 1] as number, m.positions[j * 3 + 2] as number];
    const t = (j: number): [number, number] => [m.uvs[j * 2] as number, m.uvs[j * 2 + 1] as number];
    out.push({ p: [v(k[0]), v(k[1]), v(k[2])], uv: [t(k[0]), t(k[1]), t(k[2])], n: [m.normals[k[0] * 3] as number, m.normals[k[0] * 3 + 1] as number, m.normals[k[0] * 3 + 2] as number] });
  }
  return out;
}
const geoNormal = (t: Tri): V3 => {
  const a = t.p[0];
  const b = t.p[1];
  const c = t.p[2];
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
};
const worldArea = (t: Tri): number => Math.hypot(...geoNormal(t)) / 2;
const uvArea = (t: Tri): number => Math.abs((t.uv[1][0] - t.uv[0][0]) * (t.uv[2][1] - t.uv[0][1]) - (t.uv[2][0] - t.uv[0][0]) * (t.uv[1][1] - t.uv[0][1])) / 2;
const allVertices = (parts: PartMap<Key>): V3[] => Object.values(parts).flatMap((m) => triangles(m as Batch).flatMap((t) => t.p));
const merged = (...sets: PartMap<Key>[]): PartMap<Key> => {
  const out: PartMap<Key> = {};
  for (const s of sets) for (const [k, m] of Object.entries(s)) (out[k as Key] ??= new Batch()).append(m as Batch);
  return out;
};

const hotel = greatNorthernHotelPlan(data);
const midland = midlandGrandPlan(data);
const barlow = barlowPlan(data);

// ---- Batch and the wall builders ---------------------------------------------------------------

test('Batch.quadUV: the winding and the stored normal turn toward the hint', () => {
  for (const hint of [[0, 0, 1], [0, 0, -1]] as V3[]) {
    const m = new Batch();
    m.quadUV([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], undefined, hint);
    const ts = triangles(m);
    assert.equal(ts.length, 2);
    for (const t of ts) {
      const g = geoNormal(t);
      assert.ok(g[2] * hint[2] > 0, `geometric normal agrees with hint ${hint}`);
      close(t.n[2], hint[2], 1e-12, 'stored normal agrees too');
      close(Math.hypot(...t.n), 1, 1e-12, 'unit length');
      close(worldArea(t), 0.5, 1e-12, 'half a unit square');
    }
  }
});

test('addWalls: UVs are metres, so brick is brick-sized: a 12 x 6 m wall carries u 0..12 and v 0..6', () => {
  const m = new Batch();
  addWalls(m, [[0, 0], [12, 0], [12, 4], [0, 4]], 0, 6);
  const ts = triangles(m);
  assert.equal(ts.length, 8);
  for (const t of ts) close(uvArea(t), worldArea(t), 1e-9, 'texel area equals wall area');
  const us = ts.flatMap((t) => t.uv.map((q) => q[0]));
  const vs = ts.flatMap((t) => t.uv.map((q) => q[1]));
  close(Math.max(...us), 12 + 4 + 12 + 4, 1e-9, 'u runs round the perimeter');
  close(Math.max(...vs), 6, 1e-9, 'v is height');
  for (const t of ts) { // outward: the walls face away from the polygon's middle
    const g = geoNormal(t);
    const mid = [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3 - 6, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3 - 2];
    assert.ok(g[0] * mid[0] + g[2] * mid[1] > 0, 'faces out');
  }
});

test('brick is never stretched: every wall triangle of the hotels, towers and the shed\'s end wall has texel area = wall area', () => {
  const parts = merged(hotelGeometry(hotel), midlandGeometry(midland), barlowGeometry(barlow));
  for (const key of ['brick', 'brickRed'] as const) {
    const ts = triangles(parts[key] as Batch);
    assert.ok(ts.length > 30, `${key} has walls`);
    let worst = 0;
    for (const t of ts) worst = Math.max(worst, Math.abs(uvArea(t) / worldArea(t) - 1));
    assert.ok(worst < 1e-3, `${key}: worst texel-area error ${worst}`);
  }
});

test('windowOutline: convex, as wide and tall as asked, with the head on top', () => {
  const sizes: [number, number][] = [[1.3, 3.6], [1.7, 3.4], [1.0, 2.0]];
  for (const head of ['flat', 'round', 'pointed'] as const) {
    for (const [w, h] of sizes) {
      const pts = windowOutline(w, h, head);
      close(Math.max(...pts.map((p) => p[1])), h, 1e-9, `${head} height`);
      close(Math.min(...pts.map((p) => p[1])), 0, 1e-9, `${head} sill`);
      close(Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])), w, 1e-9, `${head} width`);
      let sign = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i] as [number, number];
        const b = pts[(i + 1) % pts.length] as [number, number];
        const c = pts[(i + 2) % pts.length] as [number, number];
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cr) < 1e-12) continue;
        if (sign === 0) sign = Math.sign(cr);
        assert.equal(Math.sign(cr), sign, `${head} outline is convex`);
      }
    }
  }
  // a round head is a semicircle: its apex is on the centre line; a pointed one meets there too
  const apex = (head: 'round' | 'pointed'): [number, number] => windowOutline(1.4, 3, head).reduce((best, p) => (p[1] > best[1] ? p : best));
  close(apex('round')[0], 0, 0.2, 'round head apex');
  close(apex('pointed')[0], 0, 1e-9, 'pointed head apex');
});

// ---- cutting bands round towers ----------------------------------------------------------------

test('pointInQuad: either winding, edges count as inside', () => {
  const q: Pt[] = [[0, 0], [4, 0], [4, 4], [0, 4]];
  for (const ring of [q, [...q].reverse()]) {
    assert.equal(pointInQuad([2, 2], ring), true);
    assert.equal(pointInQuad([5, 2], ring), false);
    assert.equal(pointInQuad([-0.1, 2], ring), false);
    assert.equal(pointInQuad([4, 4], ring), true);
  }
});

test('segmentsOutside: an edge crossing a tower is cut where the tower stands, and carries its perimeter distance on', () => {
  const edges = polygonEdges([[0, 0], [20, 0], [20, 10], [0, 10]]);
  const tower: Pt[] = [[8, -2], [12, -2], [12, 2], [8, 2]];
  const segs = segmentsOutside(edges.slice(0, 1), [tower]);
  assert.equal(segs.length, 2);
  assert.deepEqual([segs[0]?.a, segs[0]?.b], [[0, 0], [8, 0]]);
  assert.deepEqual([segs[1]?.a, segs[1]?.b], [[12, 0], [20, 0]]);
  assert.equal(segs[1]?.s0, 12, 'the second piece starts 12 m along the perimeter');
  // the same tower wound the other way gives the same cut
  assert.deepEqual(segmentsOutside(edges.slice(0, 1), [[...tower].reverse()]).map((s) => [s.a, s.b]), segs.map((s) => [s.a, s.b]));
  // a tower nowhere near leaves every edge whole; a tower swallowing an edge removes it
  assert.equal(segmentsOutside(edges, [[[50, 50], [52, 50], [52, 52], [50, 52]]]).length, 4);
  assert.equal(segmentsOutside(edges.slice(0, 1), [[[-5, -5], [25, -5], [25, 5], [-5, 5]]]).length, 0);
  // the perimeter distance accumulates over edges
  assert.equal(segmentsOutside(edges, [])[1]?.s0, 20);
});

test('addBand: the bands of two walls that meet at a slight turn are mitred into one, with no step; a building\'s corner is not', () => {
  // a 20 degree facet join at (10, 0), then turns of 70 and 90 degrees: only the first is mitred
  const [c, s] = [Math.cos(Math.PI / 9), Math.sin(Math.PI / 9)];
  const outline: Pt[] = [[0, 0], [10, 0], [10 + 10 * c, 10 * s], [10 + 10 * c, 20], [0, 20]];
  const segs = segmentsOutside(polygonEdges(outline), []);
  assert.equal(segs.length, 5);
  const m = new Batch();
  addBand(m, segs, 0, 1, 0.5);
  const tris = triangles(m);
  assert.equal(tris.length, 6 * segs.length, 'a front, a top and an underside to each wall');
  // the UVs are in metres on the mitred quads too (a mitre moves a front's ends along its wall, and the map follows)
  for (const t of tris) close(uvArea(t), worldArea(t), 1e-9, 'texel area equals surface area');
  /** the two front corners of wall i at the foot of its band, in order along the wall */
  const corners = (i: number): [V3, V3] => {
    const sg = segs[i] as (typeof segs)[number];
    const feet = tris.slice(6 * i, 6 * i + 2).flatMap((t) => t.p).filter((v) => v[1] === 0);
    const along = (v: V3): number => (v[0] - sg.a[0]) * (sg.b[0] - sg.a[0]) + (v[2] - sg.a[1]) * (sg.b[1] - sg.a[1]);
    const sorted = [...feet].sort((p, q) => along(p) - along(q));
    return [sorted[0] as V3, sorted[sorted.length - 1] as V3];
  };
  const [n0, n1] = [(segs[0] as (typeof segs)[number]).normal, (segs[1] as (typeof segs)[number]).normal];
  const k = 0.5 / (1 + n0[0] * n1[0] + n0[1] * n1[1]);
  const mitre: V3 = [10 + (n0[0] + n1[0]) * k, 0, (n0[1] + n1[1]) * k];
  const end0 = corners(0)[1];
  const start1 = corners(1)[0];
  for (const v of [end0, start1]) for (let i = 0; i < 3; i++) close(v[i] as number, mitre[i] as number, 1e-9, `the join's corner, axis ${i}`);
  // the corner is where the two lines 0.5 m off the walls cross: 0.5 m from each, more than 0.5 m from the vertex they turn about
  for (const sg of [segs[0], segs[1]] as (typeof segs)[number][]) close((mitre[0] - sg.a[0]) * sg.normal[0] + (mitre[2] - sg.a[1]) * sg.normal[1], 0.5, 1e-9, 'half a metre off each wall');
  assert.ok(Math.hypot(mitre[0] - 10, mitre[2]) > 0.5 && Math.hypot(mitre[0] - 10, mitre[2]) < 0.51, 'the mitre stands 0.5 / cos 10 degrees from the vertex');
  // a turn past 60 degrees keeps each wall's front square to it: the corner at (10 + 10 c, 10 s) leaves a gap between the two fronts, each end straight out from its wall
  const [a2, b1] = [corners(2)[0], corners(1)[1]];
  const p2 = (segs[2] as (typeof segs)[number]).a;
  const sg1 = segs[1] as (typeof segs)[number];
  const sg2 = segs[2] as (typeof segs)[number];
  close(b1[0], p2[0] + sg1.normal[0] * 0.5, 1e-9, 'the first wall\'s front ends straight out from its end');
  close(a2[0], p2[0] + sg2.normal[0] * 0.5, 1e-9, 'the second wall\'s front starts straight out from its start');
  close(Math.hypot(a2[0] - b1[0], a2[2] - b1[2]), 0.5 * Math.hypot(sg1.normal[0] - sg2.normal[0], sg1.normal[1] - sg2.normal[1]), 1e-9, 'so the two fronts do not meet there');
});

test('Midland Grand: no band stands in front of a tower\'s face', () => {
  const cutters = midland.towers.map((t) => towerSquare(t, 0.45));
  const m = new Batch();
  addBand(m, segmentsOutside(polygonEdges(midland.outline), cutters), 6, 0.35, 0.6);
  const verts = triangles(m).flatMap((t) => t.p);
  assert.ok(verts.length > 100);
  for (const t of midland.towers) {
    const sq = towerSquare(t, 0);
    for (const v of verts) assert.equal(pointInQuad([v[0], v[2]], sq), false, `a band vertex at (${v[0].toFixed(1)}, ${v[2].toFixed(1)}) is inside the ${t.name} tower`);
  }
  // and without cutting there would be: the test can fail
  const whole = new Batch();
  addBand(whole, segmentsOutside(polygonEdges(midland.outline), []), 6, 0.35, 0.6);
  const poking = triangles(whole).flatMap((t) => t.p).filter((v) => midland.towers.some((t) => pointInQuad([v[0], v[2]], towerSquare(t, 0))));
  assert.ok(poking.length > 0, 'uncut bands do poke into the towers');
});

test('Midland Grand: the building itself cuts its eaves cornice where the towers stand', () => {
  const stone = midlandGeometry(midland).stone as Batch;
  // the cornice is the only stone between 1 m under the eaves and the eaves: the towers' own bands and windows are at other heights
  const cornice = triangles(stone).filter((t) => t.p.every((v) => v[1] >= midland.eaves - 1 - 1e-6 && v[1] <= midland.eaves + 1e-6));
  assert.ok(cornice.length > 100, `${cornice.length} cornice triangles`);
  for (const t of cornice) for (const v of t.p) for (const tower of midland.towers) assert.equal(pointInQuad([v[0], v[2]], towerSquare(tower, 0)), false, `a cornice vertex at (${v[0].toFixed(1)}, ${v[2].toFixed(1)}) is inside the ${tower.name} tower`);
});

test('Midland Grand [hist-b]: a continuous stone sill course 0.45 m under each of the three upper window rows, cut where the towers stand, 0.14 m proud of the wall (the first floor\'s, its balcony, 0.4 m)', () => {
  const stone = triangles(midlandGeometry(midland).stone as Batch);
  const segs = segmentsOutside(polygonEdges(midland.outline), midland.towers.map((t) => towerSquare(t, 0.45)));
  assert.deepEqual(ROWS.map(([y]) => y), [6.9, 12.4, 17.9]);
  for (const y of [6.9, 12.4, 17.9]) {
    const proud = y === 6.9 ? 0.4 : 0.14;
    const front = stone.filter((t) => t.p.every((v) => Math.abs(v[1] - (y - 0.45)) < 1e-9 || Math.abs(v[1] - (y - 0.2)) < 1e-9) && t.p.some((v) => Math.abs(v[1] - (y - 0.45)) < 1e-9) && t.p.some((v) => Math.abs(v[1] - (y - 0.2)) < 1e-9));
    assert.equal(front.length, 2 * segs.length, `the course under the row at ${y} m is one front face to every uncut wall`);
    for (const t of front) for (const v of t.p) for (const tower of midland.towers) assert.equal(pointInQuad([v[0], v[2]], towerSquare(tower, 0)), false, 'and nowhere inside a tower');
    // each wall's front face (a quad of two triangles) stands exactly `proud` off the line of its wall, its ends where it meets its neighbour's mitre or the cut at a tower
    for (const sg of segs) {
      const l = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
      const depth = (v: V3): number => (v[0] - sg.a[0]) * sg.normal[0] + (v[2] - sg.a[1]) * sg.normal[1];
      const along = (v: V3): number => ((v[0] - sg.a[0]) * (sg.b[0] - sg.a[0]) + (v[2] - sg.a[1]) * (sg.b[1] - sg.a[1])) / l;
      const mine = front.filter((t) => t.p.every((v) => Math.abs(depth(v) - proud) < 1e-6) && Math.min(...t.p.map(along)) < l - 1e-6 && Math.max(...t.p.map(along)) > 1e-6);
      assert.equal(mine.length, 2, `the course under the row at ${y} m: the wall from (${sg.a[0].toFixed(1)}, ${sg.a[1].toFixed(1)}) has one front face standing ${proud} m proud`);
    }
  }
  assert.equal(stone.filter((t) => t.p.every((v) => Math.abs(v[1] - (1.0 - 0.45)) < 1e-9 || Math.abs(v[1] - (1.0 - 0.2)) < 1e-9)).length, 0, 'there is none under the ground row');
});

// ---- the Great Northern Hotel ------------------------------------------------------------------

type Bay = (typeof hotel.faces)[number]['bays'][number];
/** a world point in a bay's frame: along its wall from the bay's middle, and out of it */
const inBay = (v: V3, b: Bay): { along: number; depth: number } => ({ along: (v[0] - b.at[0]) * b.dir[0] + (v[2] - b.at[1]) * b.dir[1], depth: (v[0] - b.at[0]) * b.normal[0] + (v[2] - b.at[1]) * b.normal[1] });
/** the middle bays of a face's advanced blocks: those with an advanced bay on both sides or on neither */
const isMiddle = (adv: readonly number[], i: number): boolean => adv.includes(i) && adv.includes(i - 1) === adv.includes(i + 1);
type Strip = { name: string; b: Bay; k: number; lo: number; hi: number; depth: number; block: boolean };
/**
 * The cream strips the hotel should have, each in its bay's frame (`lo` to `hi` along the bay's side `k`, its front `depth` out): one at each end of every face whose end bay is 2.2 m
 * wide (the outer metre, or what the light leaves, 0.8 m in at the least; 0.14 m proud of the wall), and one at each end of every advanced block (from 0.3 m inside its end bay, no nearer
 * the middle than the outer light of a bay of three, 1.2 m, to a metre outside it, no nearer than 0.8 m to the light of the bay beside it; 0.14 m proud of the block).
 */
function pilasterRects(): Strip[] {
  const out: Strip[] = [];
  for (const face of hotel.faces) {
    const adv = HOTEL_ADVANCED[face.kind];
    assert.ok(adv.every((i) => i < face.bays.length), `${face.kind}: every advanced bay is on the face`);
    face.bays.forEach((b, i) => {
      for (const k of [-1, 1]) {
        const next = face.bays[i + k];
        const name = `${face.kind} bay ${i + 1}, side ${k}`;
        if (!next) {
          if (b.width >= 2.2) out.push({ name, b, k, lo: Math.max(b.width / 2 - 1, 0.8), hi: b.width / 2, depth: 0.14, block: false });
        } else if (adv.includes(i) && !adv.includes(i + k)) {
          out.push({ name, b, k, lo: Math.max(b.width / 2 - 0.3, isMiddle(adv, i) ? 1.2 : 0), hi: Math.min(b.width / 2 + 1, (b.width + next.width) / 2 - 0.8), depth: 0.54, block: true });
        }
      }
    });
  }
  return out;
}

test('Great Northern Hotel: facade windows keep their counts and assumed attic dormers add one sash per bay', () => {
  const parts = hotelGeometry(hotel);
  const bays = hotel.faces.reduce((s, f) => s + f.bays.length, 0);
  assert.equal(bays, 50);
  assert.equal(triangles(parts.sashArch as Batch).length, 2 * bays);
  // 4 upper storeys per bay; the middle bay of each advanced block (the sixth and thirteenth of the main front, and the same on the road front and the returns) is tripartite: two more lights per storey
  const sashes = triangles(parts.sash as Batch);
  const middles = hotel.faces.reduce((n, f) => n + HOTEL_ADVANCED[f.kind].filter((i, _, adv) => adv.includes(i - 1) === adv.includes(i + 1)).length, 0);
  assert.equal(middles, 6, 'two on each long front and one on each end');
  assert.equal(sashes.filter(t => t.p.every(v => v[1] <= hotel.eaves)).length, 2 * (4 * bays + middles * 2 * 4));
  // HE confirms plural attic dormers; one per OSM-derived facade bay is ASSUMED.
  assert.equal(sashes.filter(t => t.p.every(v => v[1] > hotel.eaves)).length, 2 * bays);
});

test('Great Northern Hotel: a synthetic impost run clears its arch and carries a keystone above the crown', () => {
  const outline: Pt[] = [[0, 0], [12, 0], [12, 8], [0, 8]];
  const edge = polygonEdges(outline)[0]!;
  const chain = { vertices: [0, 1], edges: [edge], length: edge.length, turning: 0 };
  const synthetic = { ...hotel, outline, faces: [{ kind: 'main' as const, chain, bays: chainBays(chain.edges, 1) }], roof: { ring: outline, inset: 0 } };
  const bay = synthetic.faces[0]!.bays[0]!;
  const stone = triangles(hotelGeometry(synthetic).stone as Batch);
  const spring = ARCH.sill + ARCH.height - ARCH.width / 2;
  const crown = ARCH.sill + ARCH.height;
  const impost = stone.filter((t) => t.p.every((v) => Math.abs(v[1] - spring) <= 0.08 + 1e-9));
  const keystone = stone.filter((t) => t.p.every((v) => v[1] >= crown - 0.126 && v[1] <= crown + 0.326));
  assert.equal(impost.length, 30, 'five unbroken facade segments, each with the three faces of one moulded band');
  assert.equal(keystone.length, 12, 'one six-sided stone block over the arch');
  const depths = keystone.flatMap((t) => t.p.map((v) => (v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1]));
  assert.ok(Math.min(...depths) > 0.08, 'the keystone clears the sash plane, so their faces do not z-fight');
  for (const t of impost) for (const v of t.p) {
    const along = (v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1];
    const depth = (v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1];
    assert.ok(depth < -1e-6 || depth > 0.3 || Math.abs(along) >= ARCH.width / 2 - 1e-6, 'the impost does not overlap the pane');
  }
});

test('Great Northern Hotel: every real ground arch gets one keystone and the impost stays below the cornice', () => {
  const parts = hotelGeometry(hotel);
  const bays = hotel.faces.reduce((n, f) => n + f.bays.length, 0);
  const stone = triangles(parts.stone as Batch);
  const crown = ARCH.sill + ARCH.height;
  const keystones = stone.filter((t) => t.p.every((v) => v[1] >= crown - 0.126 && v[1] <= crown + 0.326));
  const spring = ARCH.sill + ARCH.height - ARCH.width / 2;
  const impost = stone.filter((t) => t.p.every((v) => Math.abs(v[1] - spring) <= 0.08 + 1e-9));
  assert.equal(keystones.length, bays * 12);
  assert.ok(impost.length > bays * 6, `${impost.length} impost triangles run around the facade between the arches`);
  assert.ok(Math.max(...[...keystones, ...impost].flatMap((t) => t.p.map((v) => v[1]))) < hotel.eaves - 0.6, 'the details clear the upper facade and roof');
  assert.equal(Object.keys(parts).length, 5, 'the details stay in the existing five material batches');
});

test('Great Northern Hotel: every window stands on a wall (the advanced bays\' lights, on their box), a hand\'s breadth proud, and faces out', () => {
  const parts = hotelGeometry(hotel);
  const edges = polygonEdges(hotel.outline);
  const distance = (p: Pt): number => Math.min(...edges.map((e) => {
    const t = Math.max(0, Math.min(e.length, (p[0] - e.a[0]) * e.dir[0] + (p[1] - e.a[1]) * e.dir[1]));
    return Math.hypot(p[0] - (e.a[0] + e.dir[0] * t), p[1] - (e.a[1] + e.dir[1] * t));
  }));
  const advanced = hotel.faces.flatMap((f) => HOTEL_ADVANCED[f.kind].map((i) => f.bays[i]!));
  assert.equal(advanced.length, 14, 'two blocks of three bays on each long front, a central bay on each end');
  for (const key of ['sash', 'sashArch'] as const) {
    const windows = triangles(parts[key] as Batch).filter(t => key === 'sash' ? t.p.every(v => v[1] <= hotel.eaves) : true);
    for (const t of windows) {
      for (const v of t.p) {
        assert.equal(pointInPolygon([v[0], v[2]], hotel.outline), false, `${key} vertex outside the walls`);
        // [HE-GNH] the advanced blocks: their lights stand on the block, 0.4 m out, a hand's breadth (0.08) proud of it
        const onBox = advanced.find((b) => Math.abs(inBay(v, b).along) <= b.width / 2 + 1e-6 && inBay(v, b).depth > 0.3);
        if (onBox) close(inBay(v, onBox).depth, 0.48, 1e-6, 'a light of an advanced bay stands on its box');
        else assert.ok(distance([v[0], v[2]]) < 0.2, `${key} vertex ${distance([v[0], v[2]])} m off the wall`);
      }
      const g = geoNormal(t);
      assert.ok(Math.abs(g[1]) < 1e-9, 'windows are vertical');
    }
  }
  // and none is buried: the lights of the first floor and above in an advanced bay are all on its block, those of the ground floor on the wall
  hotel.faces.forEach((face) => face.bays.forEach((b, i) => {
    const adv = HOTEL_ADVANCED[face.kind].includes(i);
    const upper = triangles(parts.sash as Batch).filter((t) => t.p.every((v) => v[1] <= hotel.eaves)).flatMap((t) => t.p).filter((v) => Math.abs(inBay(v, b).along) <= b.width / 2 + 1e-6 && inBay(v, b).depth > -1e-6 && inBay(v, b).depth < 0.6);
    assert.ok(upper.length >= 4 * (hotel.storeys - 1), `${face.kind} bay ${i + 1}: its lights are there`);
    for (const v of upper) close(inBay(v, b).depth, adv ? 0.48 : 0.08, 1e-6, `${face.kind} bay ${i + 1}: a light stands ${adv ? 'on its block' : 'a hand\'s breadth off the wall'}`);
  }));
});

test('Great Northern Hotel [HE-GNH, hist-a]: advanced blocks stand 0.4 m out from the first floor to the cornice, three bays to a block on the main and road fronts, one on each end; the middle bay of a block cream, its neighbours brick, and no other bay is advanced', () => {
  const parts = hotelGeometry(hotel);
  // [HE-GNH]: the sixth and thirteenth bays of the main front, each the middle of three; the road front "similar", its blocks at the same thirds of its 22 bays (ASSUMED); the return's and the end's central bays
  assert.deepEqual({ ...HOTEL_ADVANCED }, { main: [4, 5, 6, 11, 12, 13], rear: [5, 6, 7, 14, 15, 16], return: [2], end: [2] });
  assert.deepEqual(hotel.faces.map((f) => f.bays.length), [18, 22, 5, 5]);
  for (const face of hotel.faces) {
    const adv = HOTEL_ADVANCED[face.kind];
    face.bays.forEach((b, i) => {
      const front = (m: Batch): Tri[] => triangles(m).filter((t) => t.p.every((v) => Math.abs(inBay(v, b).depth - 0.4) < 1e-6 && Math.abs(inBay(v, b).along) <= b.width / 2 + 1e-6));
      const [cream, brick] = [front(parts.stone as Batch), front(parts.brick as Batch)];
      const name = `${face.kind} bay ${i + 1}`;
      if (!adv.includes(i)) return assert.equal(cream.length + brick.length, 0, `${name} is not advanced`);
      assert.equal(cream.length, isMiddle(adv, i) ? 2 : 0, `${name}: ${isMiddle(adv, i) ? 'the middle of its block is cream' : 'not cream'}`);
      assert.equal(brick.length, isMiddle(adv, i) ? 0 : 2, `${name}: ${isMiddle(adv, i) ? 'not brick' : 'the side of its block is brick'}`);
      const fronts = [...cream, ...brick];
      const ys = fronts.flatMap((t) => t.p.map((v) => v[1]));
      const along = fronts.flatMap((t) => t.p.map((v) => inBay(v, b).along));
      close(Math.min(...ys), hotel.groundStorey, 1e-9, `${name}: the block starts at the first floor`);
      close(Math.max(...ys), hotel.eaves - 0.7, 1e-9, `${name}: and ends under the cornice`);
      close(Math.max(...along) - Math.min(...along), b.width, 1e-6, `${name}: as wide as its bay`);
    });
  }
});

test('Great Northern Hotel [hist-a]: full-height cream strips close every face (0.14 m proud) and stand at both ends of every advanced block (0.14 m proud of it, 0.54 m of the wall), each clear of every light', () => {
  const parts = hotelGeometry(hotel);
  const top = hotel.eaves - 0.7;
  /** a strip's front: two triangles at `depth`, spanning from the ground-floor base (1 m) to the cornice, between `lo` and `hi` along the side `side` of the bay */
  const strips = (b: Bay, depth: number, lo: number, hi: number, side: number): Tri[] => triangles(parts.stone as Batch).filter((t) => t.p.every((v) => {
    const f = inBay(v, b);
    return Math.abs(f.depth - depth) < 1e-6 && f.along * side >= lo - 1e-6 && f.along * side <= hi + 1e-6 && (Math.abs(v[1] - 1) < 1e-9 || Math.abs(v[1] - top) < 1e-9);
  }));
  const rects = pilasterRects();
  for (const r of rects) {
    const got = strips(r.b, r.depth, r.lo, r.hi, r.k);
    assert.equal(got.length, 2, `${r.name}: ${r.block ? 'a pilaster ends the block' : 'a strip closes the face'}`);
    const along = got.flatMap((t) => t.p.map((v) => inBay(v, r.b).along * r.k));
    close(Math.min(...along), r.lo, 1e-6, `${r.name}: the strip starts where it should`);
    close(Math.max(...along), r.hi, 1e-6, `${r.name}: and ends where it should`);
  }
  const [ends, pilasters] = [rects.filter((r) => !r.block).length, rects.filter((r) => r.block).length];
  assert.equal(pilasters, 12, 'two to each of the four blocks and the two ends\' central bays');
  // and there are no others: every strip front in the whole stone is one of those
  const all = triangles(parts.stone as Batch).filter((t) => t.p.every((v) => Math.abs(v[1] - 1) < 1e-9 || Math.abs(v[1] - top) < 1e-9) && t.p.some((v) => Math.abs(v[1] - 1) < 1e-9) && t.p.some((v) => Math.abs(v[1] - top) < 1e-9));
  const fronts = all.filter((t) => hotel.faces.some((f) => f.bays.some((b) => t.p.every((v) => [0.14, 0.54].some((d) => Math.abs(inBay(v, b).depth - d) < 1e-6) && Math.abs(inBay(v, b).along) < b.width))));
  assert.equal(fronts.length, 2 * (ends + pilasters), `${fronts.length} strip front triangles: the ends of the faces whose end bays are 2.2 m wide, and both sides of every block`);
  // none stands on a light: no corner of a sash falls in any strip's footprint (between the wall and its front, along its width, above the base)
  const sashes = triangles(parts.sash as Batch).filter((t) => t.p.every((v) => v[1] <= hotel.eaves));
  for (const r of rects) for (const s of sashes) for (const v of s.p) {
    const f = inBay(v, r.b);
    assert.ok(!(f.along * r.k > r.lo + 1e-6 && f.along * r.k < r.hi - 1e-6 && f.depth > -1e-6 && f.depth < r.depth + 1e-6 && v[1] > 1), `a light's corner at (${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)}) stands inside the strip of ${r.name}`);
  }
});

test('Great Northern Hotel [hist-a]: the cornice is broken forward over each advanced block and its pilasters, 1.4 m out against 1.0 m elsewhere, and its facet joins are mitred', () => {
  const stone = triangles(hotelGeometry(hotel).stone as Batch);
  const top = hotel.eaves - 0.7;
  const level = (t: Tri): boolean => t.p.every((v) => Math.abs(v[1] - top) < 1e-9 || Math.abs(v[1] - hotel.eaves) < 1e-9) && t.p.some((v) => Math.abs(v[1] - top) < 1e-9) && t.p.some((v) => Math.abs(v[1] - hotel.eaves) < 1e-9);
  const fronts = stone.filter(level);
  const rects = pilasterRects().filter((r) => r.block);
  let broken = 0;
  for (const face of hotel.faces) {
    const adv = HOTEL_ADVANCED[face.kind];
    face.bays.forEach((b, i) => {
      // (a pilaster is a metre wide at most)
      const over = fronts.filter((t) => t.p.every((v) => Math.abs(inBay(v, b).depth - 1.4) < 1e-6 && Math.abs(inBay(v, b).along) <= b.width / 2 + 1 + 1e-6));
      if (!adv.includes(i)) return assert.equal(over.length, 0, `${face.kind} bay ${i + 1}: the cornice stays 1.0 m out`);
      assert.equal(over.length, 2, `${face.kind} bay ${i + 1}: one front, 1.4 m out`);
      // it is as wide as the bay and the pilaster beside it, if the bay ends its block, and sits over both
      const along = over.flatMap((t) => t.p.map((v) => inBay(v, b).along));
      const reach = (k: number): number => { const r = rects.find((q) => q.b === b && q.k === k); return r ? r.hi - b.width / 2 : 0; };
      close(Math.min(...along), -(b.width / 2 + reach(-1)), 1e-6, `${face.kind} bay ${i + 1}: over its pilaster on the left`);
      close(Math.max(...along), b.width / 2 + reach(1), 1e-6, `${face.kind} bay ${i + 1}: and on the right`);
      broken++;
    });
  }
  assert.equal(broken, 14);
  // every wall has its cornice front 1.0 m off its line, one quad to a wall
  for (const e of polygonEdges(hotel.outline).filter((q) => q.length >= 0.05)) {
    const depth = (v: V3): number => (v[0] - e.a[0]) * e.normal[0] + (v[2] - e.a[1]) * e.normal[1];
    const along = (v: V3): number => (v[0] - e.a[0]) * e.dir[0] + (v[2] - e.a[1]) * e.dir[1];
    const own = fronts.filter((t) => t.p.every((v) => Math.abs(depth(v) - 1.0) < 1e-6) && Math.min(...t.p.map(along)) < e.length - 1e-6 && Math.max(...t.p.map(along)) > 1e-6);
    assert.equal(own.length, 2, `the wall ${e.i}: its cornice front is one quad 1.0 m out`);
  }
  // no step at a facet join: the front of one wall's cornice ends where the next one's begins, one corner 1.0 m off both walls, for every join of the road front and the main front
  for (const face of hotel.faces.filter((f) => f.kind === 'rear' || f.kind === 'main')) {
    const walls = face.chain.edges;
    for (let i = 0; i + 1 < walls.length; i++) {
      const [e, f] = [walls[i]!, walls[i + 1]!];
      const depthIn = (q: typeof e) => (v: V3): number => (v[0] - q.a[0]) * q.normal[0] + (v[2] - q.a[1]) * q.normal[1];
      const corner = fronts.flatMap((t) => t.p).filter((v) => Math.abs(v[1] - top) < 1e-9 && Math.abs(depthIn(e)(v) - 1) < 1e-6 && Math.abs(depthIn(f)(v) - 1) < 1e-6);
      assert.equal(new Set(corner.map((v) => v.map((c) => c.toFixed(6)).join())).size, 1, `the cornice of walls ${e.i} and ${f.i} meets at one corner, 1.0 m off each`);
    }
  }
});

test('Great Northern Hotel [hist-a]: a stucco sill course under each of the upper rows, 0.1 m out and carried across the advanced blocks 0.5 m out, the cornice 1.0 m out', () => {
  const stone = triangles(hotelGeometry(hotel).stone as Batch);
  const edges = polygonEdges(hotel.outline).filter((e) => e.length >= 0.05);
  /** the front quads between two heights whose corners all stand `depth` off a wall's line and span some of its length */
  const fronts = (y0: number, y1: number, e: { a: Pt; b: Pt; normal: Pt; length: number }, depth: number): Tri[] => stone.filter((t) => t.p.every((v) => (Math.abs(v[1] - y0) < 1e-9 || Math.abs(v[1] - y1) < 1e-9) && Math.abs((v[0] - e.a[0]) * e.normal[0] + (v[2] - e.a[1]) * e.normal[1] - depth) < 1e-6) && t.p.some((v) => Math.abs(v[1] - y0) < 1e-9) && t.p.some((v) => Math.abs(v[1] - y1) < 1e-9)
    && Math.min(...t.p.map((v) => ((v[0] - e.a[0]) * (e.b[0] - e.a[0]) + (v[2] - e.a[1]) * (e.b[1] - e.a[1])) / e.length)) < e.length - 1e-6 && Math.max(...t.p.map((v) => ((v[0] - e.a[0]) * (e.b[0] - e.a[0]) + (v[2] - e.a[1]) * (e.b[1] - e.a[1])) / e.length)) > 1e-6);
  const sashes = triangles(hotelGeometry(hotel).sash as Batch).filter((t) => t.p.every((v) => v[1] <= hotel.eaves)).flatMap((t) => t.p.map((v) => v[1]));
  for (const s of [2, 3, 4]) {
    const y0 = hotel.groundStorey + (s - 1) * hotel.upperStorey + 0.2;
    for (const e of edges) assert.equal(fronts(y0, y0 + 0.3, e, 0.1).length, 2, `row ${s}: wall ${e.i} has one front face (two triangles) 0.1 m out`);
    for (const face of hotel.faces) face.bays.forEach((b, i) => {
      const own = stone.filter((t) => t.p.every((v) => Math.abs(inBay(v, b).depth - 0.5) < 1e-6 && Math.abs(inBay(v, b).along) <= b.width / 2 + 1e-6 && (Math.abs(v[1] - y0) < 1e-9 || Math.abs(v[1] - (y0 + 0.3)) < 1e-9)));
      assert.equal(own.length, HOTEL_ADVANCED[face.kind].includes(i) ? 2 : 0, `row ${s}: ${face.kind} bay ${i + 1}${HOTEL_ADVANCED[face.kind].includes(i) ? ' carries the course across its block' : ' has none beyond the wall\'s'}`);
    });
    assert.ok(sashes.some((y) => Math.abs(y - (y0 + 0.3)) < 1e-9), `row ${s}: the windows stand on the top of the course`);
  }
  for (const e of edges) assert.equal(fronts(hotel.eaves - 0.7, hotel.eaves, e, 1.0).length, 2, `wall ${e.i}: the cornice is one front face 1.0 m out`);
});

test('Great Northern Hotel [hist-a]: a stucco base 1 m tall stands 0.06 m proud round the ground floor, and every upper light has a cream architrave 0.25 m wide behind its sash', () => {
  const stone = triangles(hotelGeometry(hotel).stone as Batch);
  for (const e of polygonEdges(hotel.outline).filter((q) => q.length >= 0.05)) {
    const depth = (v: V3): number => (v[0] - e.a[0]) * e.normal[0] + (v[2] - e.a[1]) * e.normal[1];
    const along = (v: V3): number => (v[0] - e.a[0]) * e.dir[0] + (v[2] - e.a[1]) * e.dir[1];
    const base = stone.filter((t) => t.p.every((v) => (Math.abs(v[1]) < 1e-9 || Math.abs(v[1] - 1) < 1e-9) && Math.abs(depth(v) - 0.06) < 1e-6) && t.p.some((v) => Math.abs(v[1]) < 1e-9) && t.p.some((v) => Math.abs(v[1] - 1) < 1e-9) && Math.min(...t.p.map(along)) < e.length - 1e-6 && Math.max(...t.p.map(along)) > 1e-6);
    assert.equal(base.length, 2, `wall ${e.i}: one front face (two triangles) 0.06 m out`);
  }
  // the architrave: a flat stucco surround 0.25 m wider each side than the sash (the bay's width less 0.1 m at most), 0.1 m below its sill, 0.05 m over its head, a hair behind the sash
  const [tw] = TEXTURES.window.tile;
  for (const face of hotel.faces) {
    const adv = HOTEL_ADVANCED[face.kind];
    const mid = Math.floor(face.bays.length / 2);
    const b = face.bays[adv.includes(mid) ? 1 : mid]!;
    const w = Math.min(tw + 0.5, b.width - 0.1);
    for (let s = 1; s < hotel.storeys; s++) {
      const sill = hotel.groundStorey + (s - 1) * hotel.upperStorey + 0.5;
      const surround = stone.filter((t) => t.p.every((v) => Math.abs(inBay(v, b).depth - 0.04) < 1e-6 && Math.abs(inBay(v, b).along) <= w / 2 + 1e-6 && v[1] >= sill - 0.1 - 1e-9 && v[1] <= sill + 2.45 + 1e-9));
      assert.equal(surround.length, 2, `${face.kind} face, row ${s}: one flat quad`);
      const along = surround.flatMap((t) => t.p.map((v) => inBay(v, b).along));
      const ys = surround.flatMap((t) => t.p.map((v) => v[1]));
      close(Math.max(...along) - Math.min(...along), w, 1e-6, 'as wide as the sash and 0.25 m each side');
      close(Math.min(...ys), sill - 0.1, 1e-9, 'from 0.1 m under the sill');
      close(Math.max(...ys), sill + 2.45, 1e-9, 'to 0.05 m over the head of the 2.4 m sash');
    }
  }
  // on an advanced block the architrave stands on the block (0.4 m out), as do the sashes (a hand's breadth further)
  for (const face of hotel.faces) face.bays.forEach((b, i) => {
    const adv = HOTEL_ADVANCED[face.kind];
    if (!adv.includes(i) || isMiddle(adv, i)) return;
    const w = Math.min(tw + 0.5, b.width - 0.1);
    const sill = hotel.groundStorey + 0.5;
    const surround = stone.filter((t) => t.p.every((v) => Math.abs(inBay(v, b).depth - 0.44) < 1e-6 && Math.abs(inBay(v, b).along) <= w / 2 + 1e-6 && v[1] >= sill - 0.1 - 1e-9 && v[1] <= sill + 2.45 + 1e-9));
    assert.equal(surround.length, 2, `${face.kind} bay ${i + 1}: the side bay of a block keeps its architrave, on the block`);
  });
});

test('Great Northern Hotel [hist-a]: the ground floor is pale stucco, a wall of the cream stone from the ground to the foot of its string course on every wall, and the brick begins there', () => {
  const parts = hotelGeometry(hotel);
  const stone = triangles(parts.stone as Batch);
  const brick = triangles(parts.brick as Batch);
  const top = hotel.groundStorey - 0.12;
  for (const e of polygonEdges(hotel.outline).filter((q) => q.length >= 0.05)) {
    const depth = (v: V3): number => (v[0] - e.a[0]) * e.normal[0] + (v[2] - e.a[1]) * e.normal[1];
    const along = (v: V3): number => (v[0] - e.a[0]) * e.dir[0] + (v[2] - e.a[1]) * e.dir[1];
    const onWall = (t: Tri): boolean => t.p.every((v) => Math.abs(depth(v)) < 1e-6 && along(v) > -1e-6 && along(v) < e.length + 1e-6);
    const low = stone.filter((t) => onWall(t));
    assert.equal(low.length, 2, `wall ${e.i}: one stucco quad (two triangles)`);
    const lowYs = low.flatMap((t) => t.p.map((v) => v[1]));
    close(Math.min(...lowYs), 0, 1e-9, `wall ${e.i}: the stucco stands on the ground`);
    close(Math.max(...lowYs), top, 1e-9, `wall ${e.i}: and runs up to the foot of the string course`);
    const wall = brick.filter((t) => onWall(t));
    assert.equal(wall.length, 2, `wall ${e.i}: one brick quad`);
    const ys = wall.flatMap((t) => t.p.map((v) => v[1]));
    close(Math.min(...ys), top, 1e-9, `wall ${e.i}: the brick begins where the stucco ends`);
    close(Math.max(...ys), hotel.eaves, 1e-9, `wall ${e.i}: and runs to the eaves`);
  }
});

test('Great Northern Hotel [hist-a]: the ground-floor arches are 1.6 x 3.2 m on a sill 0.6 m up, each in a cream archivolt a quarter-metre wider each side (less where the bay is narrow)', () => {
  const parts = hotelGeometry(hotel);
  const stone = triangles(parts.stone as Batch);
  assert.deepEqual({ ...ARCH }, { sill: 0.6, width: 1.6, height: 3.2 }, 'the arch figures (ASSUMED, scaled from hist-a)');
  for (const face of hotel.faces) face.bays.forEach((b, i) => {
    const arch =triangles(parts.sashArch as Batch).filter((t) => t.p.every((v) => Math.abs(inBay(v, b).along) <= ARCH.width / 2 + 1e-6 && Math.abs(inBay(v, b).depth - 0.08) < 1e-6));
    assert.equal(arch.length, 2, `${face.kind} bay ${i + 1}: one arch light`);
    const ys = arch.flatMap((t) => t.p.map((v) => v[1]));
    close(Math.min(...ys), ARCH.sill, 1e-9, 'its sill');
    close(Math.max(...ys), ARCH.sill + ARCH.height, 1e-9, 'its crown');
    const along = arch.flatMap((t) => t.p.map((v) => inBay(v, b).along));
    close(Math.max(...along) - Math.min(...along), ARCH.width, 1e-6, 'its width');
    // the archivolt: a flat round-headed stucco shape 0.04 m off the wall, a hand's breadth (0.04) behind the light, 0.25 m wider each side or the bay's width less 0.1 m
    const w = Math.min(ARCH.width + 0.5, b.width - 0.1);
    const ring = stone.filter((t) => t.p.every((v) => Math.abs(inBay(v, b).depth - 0.04) < 1e-6 && Math.abs(inBay(v, b).along) <= w / 2 + 1e-6 && v[1] >= ARCH.sill - 0.1 - 1e-9 && v[1] <= ARCH.sill + ARCH.height + 0.2 + 1e-9));
    assert.ok(ring.length >= 8, `${face.kind} bay ${i + 1}: ${ring.length} triangles of a round-headed fan`);
    const rw = ring.flatMap((t) => t.p.map((v) => inBay(v, b).along));
    close(Math.max(...rw) - Math.min(...rw), w, 1e-6, `${face.kind} bay ${i + 1}: the archivolt is ${w} m wide`);
    close(Math.min(...ring.flatMap((t) => t.p.map((v) => v[1]))), ARCH.sill - 0.1, 1e-9, 'from 0.1 m under the sill');
    close(Math.max(...ring.flatMap((t) => t.p.map((v) => v[1]))), ARCH.sill + ARCH.height + 0.2, 1e-9, 'to 0.2 m over the crown');
  });
});

test('Great Northern Hotel [hist-a]: eight brick slab stacks on each long slope, each 3.2 m above the roof at its centre (one and a half dormers high) with a pale cap', () => {
  const stone = triangles(hotelGeometry(hotel).stone as Batch);
  const roof = new THREE.Mesh((hotelGeometry({ ...hotel, faces: [] }).slate as Batch).build(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  roof.updateMatrixWorld(true);
  const tops = stone.filter((t) => geoNormal(t)[1] > 0 && t.p.every((v) => v[1] > hotel.ridge && Math.abs(v[1] - t.p[0][1]) < 1e-9));
  const key = (v: V3): string => v.map((c) => c.toFixed(6)).join(',');
  const quads: V3[][] = [];
  const used = new Set<number>();
  tops.forEach((a, i) => {
    if (used.has(i)) return;
    const j = tops.findIndex((b, k) => k > i && !used.has(k) && b.p.filter((v) => a.p.some((u) => key(u) === key(v))).length === 2);
    assert.ok(j > i, 'a cap top is a quad of two triangles');
    used.add(i);
    used.add(j);
    quads.push([...new Map([...a.p, ...(tops[j] as Tri).p].map((v) => [key(v), v] as const)).values()]);
  });
  assert.equal(quads.length, 16, 'eight stacks on each of the two long slopes');
  // the shafts are the hotel's own brick: above the eaves the brick is those sixteen shafts, four quads of two triangles each
  assert.equal(triangles(hotelGeometry(hotel).brick as Batch).filter((t) => t.p.every((v) => v[1] > hotel.eaves)).length, 16 * 8);
  for (const q of quads) {
    assert.equal(q.length, 4);
    const c: V3 = [q.reduce((s, v) => s + v[0], 0) / 4, 0, q.reduce((s, v) => s + v[2], 0) / 4];
    const hit = new THREE.Raycaster(new THREE.Vector3(c[0], hotel.ridge + 10, c[2]), new THREE.Vector3(0, -1, 0), 0, 100).intersectObject(roof)[0];
    assert.ok(hit, 'a roof under the stack');
    close((q[0] as V3)[1] - hit.point.y, 3.2, 0.01, 'the stack top is 3.2 m above the roof under its middle');
  }
});

test('Great Northern Hotel: walls rise to the eaves, the roof to the ridge, and no window is hidden by the cornice', () => {
  const parts = hotelGeometry(hotel);
  close(Math.max(...triangles(parts.brick as Batch).filter((t) => t.p.some((v) => v[1] <= hotel.eaves)).flatMap((t) => t.p.map((v) => v[1]))), hotel.eaves, 1e-9, 'brick walls to the eaves');
  close(Math.min(...allVertices(parts).map((v) => v[1])), 0, 1e-9, 'walls stand on the ground');
  const slateYs = triangles(parts.slate as Batch).flatMap((t) => t.p.map((v) => v[1]));
  close(Math.max(...slateYs), hotel.ridge, 1e-9, 'the slate ridge remains the highest roof surface');
  // the cornice is the highest stone band: windows end below its underside
  const stoneYs = triangles(parts.stone as Batch).flatMap((t) => t.p.map((v) => v[1]));
  const corniceBottom = Math.min(...stoneYs.filter((y) => y > hotel.eaves - 1.0 && y < hotel.eaves - 0.3));
  const sashes = triangles(parts.sash as Batch);
  const wallSashTop = Math.max(...sashes.filter(t => t.p.every(v => v[1] <= hotel.eaves)).flatMap(t => t.p.map(v => v[1])));
  assert.ok(wallSashTop < corniceBottom, `wall window tops reach ${wallSashTop}, the cornice starts at ${corniceBottom}`);
  const atticSashTop = Math.max(...sashes.filter(t => t.p.every(v => v[1] > hotel.eaves)).flatMap(t => t.p.map(v => v[1])));
  assert.ok(atticSashTop > hotel.eaves && atticSashTop < hotel.ridge, `attic sashes reach ${atticSashTop}, above the wall and below the ridge`);
  assert.ok(Math.max(...stoneYs) > hotel.ridge, 'the assumed slab chimney stacks rise above the roof');
  // the slate roof stands on the walls: its lowest edge is the eaves
  close(Math.min(...slateYs), hotel.eaves, 1e-9, 'roof eaves');
});

// ---- the Midland Grand -------------------------------------------------------------------------

test('Midland Grand: the clock tower reaches 76 m ([WP-MGH] 249 ft; other sources give 73 to 85), the entrance tower its assumed height, and nothing is taller', () => {
  const ys = allVertices(midlandGeometry(midland)).map((v) => v[1]);
  close(Math.max(...ys), 76, 1e-6, 'tallest point');
  close(Math.max(...ys), FIGURES.midland.clockTowerHeight, 1e-6, 'the needle is the plan\'s height');
  assert.ok(ys.some((y) => Math.abs(y - FIGURES.midland.westTowerHeight) < 1e-6), 'the west tower\'s spire is there');
  close(Math.min(...ys), 0, 1e-9, 'on the ground');
  // the slate runs from the eaves to the spires, and the main roof's ridge is among its heights
  const slate = triangles(midlandGeometry(midland).slate as Batch).flatMap((t) => t.p.map((v) => v[1]));
  close(Math.min(...slate), midland.eaves, 1e-9, 'roof eaves');
  assert.ok(slate.some((y) => Math.abs(y - midland.ridge) < 1e-9), 'the ridge height is there');
  assert.ok(midland.ridge < FIGURES.midland.westTowerHeight, 'both towers rise above the roof');
});

test('Midland Grand: four faces of windows on the front bays, none behind a tower, a clock on each clock-tower face', () => {
  const parts = midlandGeometry(midland);
  const clocks = triangles(parts.clock as Batch);
  assert.equal(clocks.length, 8, 'a square panel on each of four faces');
  for (const t of clocks) assert.ok(Math.abs(geoNormal(t)[1]) < 1e-9, 'vertical');
  // the dial sits in the clock stage: above the corbel table that closes the belfry, under the wall head where the roof begins
  const ys = clocks.flatMap((t) => t.p.map((v) => v[1]));
  const stages = towerStages(FIGURES.midland.clockTowerHeight);
  assert.ok(Math.min(...ys) > stages.corbel && Math.max(...ys) < stages.wall, `clock between ${Math.min(...ys)} and ${Math.max(...ys)}`);
  // front windows: 4 storeys on every bay not under a tower
  const covered = (p: Pt): boolean => midland.towers.some((t) => pointInQuad(p, towerSquare(t, 0.45)));
  const open = [...midland.front.bays, ...midland.wing.bays].filter((b) => !covered(b.at)).length;
  assert.ok(open >= 28 && open <= 33, `${open} front and wing bays are open`);
  const panes = triangles(parts.pane as Batch).length;
  assert.ok(panes > open * 4 * 2, `at least a window per bay per storey, got ${panes} pane triangles`);
});

// Isolate attic additions from the identical roof/towers and the four lower window rows.
// The gabled bays have their own tests: here every bay carries its dormers, so the whole attic is dormers.
function dormerTriangles(plan = midland): Partial<Record<Key, Tri[]>> {
  const plain = midlandGeometry({ ...plan, front: { ...plan.front, bays: [] }, wing: { ...plan.wing, bays: [] } }, []);
  const full = midlandGeometry(plan, []), result: Partial<Record<Key, Tri[]>> = {};
  const signature = (t: Tri): string => JSON.stringify(t.p);
  for (const key of ['stone', 'slate', 'pane'] as const) {
    const old = new Set(triangles(plain[key] as Batch).map(signature));
    result[key] = triangles(full[key] as Batch).filter(t => t.p.every(v => v[1] > plan.eaves) && !old.has(signature(t)));
  }
  return result;
}

test('Midland Grand [hist-b]: two stacked gabled attic rows light the front and curved wing, the upper row over two bays in three [HE 1342037]', () => {
  const additions = dormerTriangles({ ...midland, towers: [] });
  const glass = additions.pane!;
  assert.ok(glass.length > 40, 'the attic has real glazed dormer faces, not unbroken slate');
  [...midland.front.bays, ...midland.wing.bays].forEach((bay, n) => {
    const near = glass.filter(t => t.p.every(v => Math.abs((v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1]) < bay.width / 2));
    assert.ok(near.some(t => t.p.every(v => v[1] < (midland.eaves + midland.ridge) / 2)), 'lower dormer row follows each bay');
    assert.equal(near.some(t => t.p.every(v => v[1] > (midland.eaves + midland.ridge) / 2)), n % 3 !== 2, `bay ${n}: the upper dormer is missing on every third bay, and only there`);
  });
  const gables = additions.stone!.filter(t => t.p.length === 3 && t.p.filter(v => Math.abs(v[1] - Math.max(...t.p.map(p => p[1]))) < 1e-8).length === 1);
  assert.ok(gables.length > 30, 'pale gables have apex vertices above their shoulders');
});

test('Midland Grand: dormer cheeks and roofs meet the existing pitch, stay below the ridge and clear both towers', () => {
  const additions = dormerTriangles();
  assert.ok(additions.slate!.length > 40, 'there are pitched dormer roofs to test');
  // Separating-axis test: catches crossings even when every triangle vertex misses a tower.
  const intersects = (triangle: Tri, tower: typeof midland.towers[number]): boolean => {
    const square = towerSquare(tower, 0.4);
    const polygons = [triangle.p.map(v => [v[0], v[2]] as Pt), square];
    for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!, axis = [b[1] - a[1], a[0] - b[0]];
      if (Math.hypot(...axis) < 1e-9) continue;
      const ranges = polygons.map(ps => ps.map(p => p[0] * axis[0]! + p[1] * axis[1]!));
      if (Math.max(...ranges[0]!) < Math.min(...ranges[1]!) - 1e-7 || Math.max(...ranges[1]!) < Math.min(...ranges[0]!) - 1e-7) return false;
    }
    return true;
  };
  const roofOnly = midlandGeometry({ ...midland, towers: [], front: { ...midland.front, bays: [] }, wing: { ...midland.wing, bays: [] } });
  // Compare the double-precision construction, avoiding Float32 upload rounding at the seams.
  const roofBatch = roofOnly.slate as Batch;
  const roofGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float64Array(roofBatch.positions), 3));
  roofGeometry.setIndex(roofBatch.indices);
  const mesh = new THREE.Mesh(roofGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  try {
    for (const [key, ts] of Object.entries(additions)) for (const triangle of ts!) {
      assert.ok(worldArea(triangle) > 1e-8, 'no degenerate dormer triangles');
      for (const tower of midland.towers) assert.equal(intersects(triangle, tower), false, `${key} crosses the ${tower.name} tower envelope`);
      let contacts = 0;
      for (const v of triangle.p) {
        assert.ok(v[1] < midland.ridge, 'attic details stay below the main ridge');
        ray.set(new THREE.Vector3(v[0], 100, v[2]), new THREE.Vector3(0, -1, 0));
        const roof = ray.intersectObject(mesh)[0];
        assert.ok(roof, 'a dormer is supported by the existing roof pitch');
        assert.ok(v[1] >= roof.point.y - 2e-5, `${key} penetrates the underlying roof: ${v[1]} < ${roof.point.y}`);
        if (Math.abs(v[1] - roof.point.y) < 2e-5) contacts++;
      }
      if (key === 'slate') assert.ok(contacts > 0, 'each cheek/hood meets the main pitch at its back seam');
    }
  } finally { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
});

// ---- the Midland Grand: roof facets, stacks, towers and arches ---------------------------------

/** inside a convex polygon, edges and corners counting, to `eps` */
function insideConvex(p: Pt, poly: readonly Pt[], eps = 1e-6): boolean {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Pt;
    const b = poly[(i + 1) % poly.length] as Pt;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return len < 1e-9 || (Math.sign(area) * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))) / len >= -eps;
  });
}
/** the roof facet of eaves edge `i`: the trapezoid between the eaves, the ring edge and the two hip lines */
function facetOf(i: number): Pt[] {
  const e = polygonEdges(midland.outline)[i] as ReturnType<typeof polygonEdges>[number];
  return [e.a, e.b, midland.roof.ring[(i + 1) % midland.outline.length] as Pt, midland.roof.ring[i] as Pt];
}

test('Midland Grand: every dormer stands on the roof facet of its own bay, between that facet\'s hip lines, and in the bay\'s own width [HE 1342037]', () => {
  const additions = dormerTriangles({ ...midland, towers: [] });
  const bays = [...midland.front.bays, ...midland.wing.bays];
  const served = new Array<number>(bays.length).fill(0);
  let checked = 0;
  for (const key of ['slate', 'stone', 'pane'] as const) for (const t of additions[key] as Tri[]) {
    const c: Pt = [(t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, (t.p[0][2] + t.p[1][2] + t.p[2][2]) / 3];
    // some bay owns it: the triangle lies wholly on that bay's facet, and its middle is within the bay's own width along it
    const owners = bays.map((b, k) => ({ b, k })).filter(({ b }) => t.p.every((v) => insideConvex([v[0], v[2]], facetOf(b.edge))) && Math.abs((c[0] - b.at[0]) * b.dir[0] + (c[1] - b.at[1]) * b.dir[1]) <= b.width / 2 + 0.2);
    assert.ok(owners.length > 0, `a ${key} dormer triangle at ${c[0].toFixed(1)}, ${c[1].toFixed(1)} is on no bay's facet`);
    for (const { k } of owners) served[k]++;
    checked++;
  }
  assert.ok(checked > 600, `${checked} dormer triangles checked`);
  served.forEach((n, k) => assert.ok(n >= 12, `bay ${k} (edge ${bays[k]?.edge}) has ${n} dormer triangles on its own facet`));
});

test('Midland Grand: dormers lie on the slopes, never on the crown, and no two dormers overlap in plan', () => {
  const additions = dormerTriangles();
  const dormers = additions.slate as Tri[];
  for (const t of [...dormers, ...(additions.stone as Tri[])]) for (const v of t.p) assert.equal(pointInPolygon([v[0], v[2]], midland.roof.ring) && v[1] > midland.ridge - 0.5, false, 'a dormer vertex over the crown');
  // a dormer's face and cheeks share corners: join the triangles that do, and compare the pieces' footprints (a window surround or a
  // finial stands on its own dormer, so only the slate, which is the dormer itself, is counted)
  const key = (v: V3): string => v.map((x) => x.toFixed(6)).join(',');
  const parent = new Map<string, string>();
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r) as string; return r; };
  for (const t of dormers) for (const v of t.p) if (!parent.has(key(v))) parent.set(key(v), key(v));
  for (const t of dormers) { parent.set(find(key(t.p[0])), find(key(t.p[1]))); parent.set(find(key(t.p[1])), find(key(t.p[2]))); }
  const pieces = new Map<string, Pt[]>();
  for (const t of dormers) for (const v of t.p) (pieces.get(find(key(v))) ?? pieces.set(find(key(v)), []).get(find(key(v))) as Pt[]).push([v[0], v[2]]);
  assert.ok(pieces.size >= 40, `${pieces.size} separate dormers`);
  const hull = (pts: Pt[]): Pt[] => {
    const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const build = (list: Pt[]): Pt[] => { const h: Pt[] = []; for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2] as Pt, h[h.length - 1] as Pt, p) <= 1e-12) h.pop(); h.push(p); } h.pop(); return h; };
    return [...build(s), ...build([...s].reverse())];
  };
  const hulls = [...pieces.values()].map(hull);
  const overlap = (a: Pt[], b: Pt[]): boolean => {
    for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
      const p = poly[i] as Pt;
      const q = poly[(i + 1) % poly.length] as Pt;
      const axis: Pt = [q[1] - p[1], p[0] - q[0]];
      const ra = a.map((x) => x[0] * axis[0] + x[1] * axis[1]);
      const rb = b.map((x) => x[0] * axis[0] + x[1] * axis[1]);
      if (Math.max(...ra) < Math.min(...rb) + 1e-6 || Math.max(...rb) < Math.min(...ra) + 1e-6) return false;
    }
    return true;
  };
  for (let i = 0; i < hulls.length; i++) for (let j = i + 1; j < hulls.length; j++) assert.equal(overlap(hulls[i] as Pt[], hulls[j] as Pt[]), false, `dormers ${i} and ${j} overlap in plan`);
});

test('Midland Grand [hist-b, hist-c]: chimney stacks stand in clusters of three wholly on the crown, 8.4 m tall, and keep clear of both towers and of the dormers', () => {
  // the red brick standing on the crown, apart from the towers' own envelopes (the clock stage reaches 0.5 m out of the shaft)
  const stacksOf = (plan: typeof midland): Tri[] => triangles(midlandGeometry(plan).brickRed as Batch).filter((t) => t.p.every((v) => v[1] >= plan.ridge - 0.3 - 1e-6 && !plan.towers.some((tw) => pointInQuad([v[0], v[2]], towerSquare(tw, 0.6)))));
  const near = (v: V3, grow: number, plan = midland): boolean => plan.towers.some((tw) => pointInQuad([v[0], v[2]], towerSquare(tw, grow)));
  const stacks = stacksOf(midland);
  assert.ok(stacks.length >= 12 * 20 && stacks.length % 20 === 0, `${stacks.length} stack triangles (a shaft and a pot of 20 to a stack)`);
  const count = stacks.length / 20;
  assert.ok(count >= 12 && count % 3 === 0, `${count} stacks, in clusters of three`);
  // the clusters: a stack's neighbours along the crown stand 2.0 m off, the middle one's two, each end's one
  const centres: Pt[] = [];
  for (let k = 0; k < count; k++) {
    const vs = stacks.slice(k * 20, k * 20 + 10).flatMap((t) => t.p);
    centres.push([vs.reduce((s, v) => s + v[0], 0) / vs.length, vs.reduce((s, v) => s + v[2], 0) / vs.length]);
  }
  const neighbours = centres.map((c) => centres.filter((d) => Math.abs(Math.hypot(d[0] - c[0], d[1] - c[1]) - 2) < 1e-6).length);
  assert.equal(neighbours.filter((n) => n === 2).length, count / 3, 'one middle stack to a cluster');
  assert.equal(neighbours.filter((n) => n === 1).length, (2 * count) / 3, 'and two ends');
  // a tower standing on the crown clears the stacks beside it: set the clock tower down with its wall a metre from a stack, and that cluster goes
  // (the stacks within 1.6 m of a tower are left out), the rest staying in threes
  const foot = (stacks.flatMap((t) => t.p).find((v) => Math.abs(v[1] - (midland.ridge - 0.3)) < 1e-9) as V3);
  const clock = midland.towers.find((tw) => tw.name === 'clock') as (typeof midland.towers)[number];
  const side = clock.side / 2 + 1.0;
  const moved = { ...midland, towers: midland.towers.map((tw) => (tw === clock ? { ...tw, centre: [foot[0] + clock.out[0] * side, foot[2] + clock.out[1] * side] as Pt } : tw)) };
  const left = stacksOf(moved);
  assert.ok(left.length % 60 === 0 && left.length > 0, `${left.length / 20} stacks left, in clusters of three`);
  assert.equal(left.some((t) => t.p.some((v) => Math.hypot(v[0] - foot[0], v[2] - foot[2]) < 1e-6)), false, 'the stack beside the tower has gone');
  for (const t of left) for (const v of t.p) assert.equal(near(v, 1.4, moved), false, 'a stack within 1.4 m of the moved tower');
  const ys = stacks.flatMap((t) => t.p.map((v) => v[1]));
  close(Math.min(...ys), midland.ridge - 0.3, 1e-9, 'they stand on the crown, a little below its ridge');
  // [hist-b, hist-c: tall, grouped stacks dominate the skyline, well above the cresting] 8.4 m of shaft, a cap and a pot (0.95 m): 9.05 m over the ridge (the round-3 stacks, 4.2 m, were a dormer tall)
  close(Math.max(...ys), midland.ridge - 0.3 + 8.4 + 0.95, 1e-6, 'and rise 8.4 m, with their pots, clear above it');
  for (const t of stacks) for (const v of t.p) {
    assert.ok(pointInPolygon([v[0], v[2]], midland.roof.ring), `a stack corner at ${v[0].toFixed(1)}, ${v[2].toFixed(1)} is off the crown`);
    assert.equal(near(v, 1.4), false, 'a stack is within 0.8 m of a tower');
  }
  // the dormers keep to the slopes: nothing of theirs stands where a stack does
  const dormers = dormerTriangles();
  for (const t of [...(dormers.slate as Tri[]), ...(dormers.stone as Tri[])]) for (const v of t.p) assert.equal(stacks.some((s) => s.p.some((w) => Math.hypot(w[0] - v[0], w[2] - v[2]) < 0.5)), false, 'a dormer corner within half a metre of a stack');
});

test('Midland Grand [hist-b, hist-e]: a dark cresting strip 0.7 m tall runs along the crown, wholly on its edge and nowhere inside a tower', () => {
  const crestOf = (plan: typeof midland): Tri[] => triangles(midlandGeometry(plan).pane as Batch).filter((t) => t.p.every((v) => v[1] >= plan.ridge - 1e-9 && v[1] <= plan.ridge + 0.7 + 1e-9));
  const crest = crestOf(midland);
  assert.ok(crest.length >= 40, `${crest.length} cresting triangles`);
  const ys = crest.flatMap((t) => t.p.map((v) => v[1]));
  close(Math.min(...ys), midland.ridge, 1e-9, 'it stands on the crown');
  close(Math.max(...ys), midland.ridge + 0.7, 1e-9, 'and rises 0.7 m');
  const ring = polygonEdges(midland.roof.ring);
  const offRing = (p: Pt): number => Math.min(...ring.map((e) => {
    const t = Math.max(0, Math.min(e.length, (p[0] - e.a[0]) * e.dir[0] + (p[1] - e.a[1]) * e.dir[1]));
    return Math.hypot(p[0] - (e.a[0] + e.dir[0] * t), p[1] - (e.a[1] + e.dir[1] * t));
  }));
  for (const t of crest) for (const v of t.p) {
    assert.ok(offRing([v[0], v[2]]) <= 0.05 + 1e-6, `a cresting vertex ${offRing([v[0], v[2]])} m off the crown's edge (it is 0.1 m thick)`);
    for (const tower of midland.towers) assert.equal(pointInQuad([v[0], v[2]], towerSquare(tower, 0.3)), false, `cresting inside the ${tower.name} tower`);
  }
  // it is cut where a tower stands on the crown: the strip is shorter than the whole crown by what the towers cover (the two long faces of a strip are 1.4 m of height per metre of it)
  const length = (ts: Tri[]): number => ts.filter((t) => Math.abs(geoNormal(t)[1]) < 1e-9).reduce((s, t) => s + worldArea(t), 0) / 1.4;
  const whole = length(crestOf({ ...midland, towers: [] }));
  assert.ok(length(crest) < whole - 5, `the cresting of ${length(crest)} m is shorter than the ${whole} m of a crown with no tower on it`);
});

test('Midland Grand: the slate roof is a true-to-scale surface: every facet is laid out flat, texel area = roof area', () => {
  const roofOnly = midlandGeometry({ ...midland, towers: [], front: { ...midland.front, bays: [] }, wing: { ...midland.wing, bays: [] } });
  const ts = triangles(roofOnly.slate as Batch);
  assert.ok(ts.length > 80, `${ts.length} roof triangles`);
  for (const t of ts) {
    assert.ok(worldArea(t) > 1e-9, 'no degenerate roof triangle');
    close(uvArea(t) / worldArea(t), 1, 1e-3, 'slate is never stretched');
  }
  // the pitch is the one the plan says: each facet is as steep as its own run gives
  const rise = midland.ridge - midland.eaves;
  const pitches = ts.map((t) => Math.atan2(Math.hypot(geoNormal(t)[0], geoNormal(t)[2]), Math.abs(geoNormal(t)[1])) * 180 / Math.PI).filter((a) => a > 1);
  assert.ok(pitches.length > 40);
  for (const a of pitches) assert.ok(a > Math.atan2(rise, Math.max(...midland.roof.runs)) * 180 / Math.PI - 0.01 && a < 89, `facet pitch ${a}`);
});

test('towerStages: the stages rise in order, with the needle running on above the lantern', () => {
  for (const H of [56, 76, 82]) {
    const s = towerStages(H);
    const order = [0, s.shaft, s.belfry, s.corbel, s.wall, s.roof, s.lantern, H];
    for (let i = 1; i < order.length; i++) assert.ok((order[i] as number) > (order[i - 1] as number), `stage ${i} of ${H} m`);
    assert.ok(H - s.lantern >= 2.5, 'a needle you can see');
  }
});

/** world -> (along, out, up) of a tower */
const inTower = (t: (typeof midland.towers)[number], v: V3): { a: number; o: number; y: number } => ({
  a: (v[0] - t.centre[0]) * t.along[0] + (v[2] - t.centre[1]) * t.along[1],
  o: (v[0] - t.centre[0]) * t.out[0] + (v[2] - t.centre[1]) * t.out[1],
  y: v[1],
});

test('Midland Grand: the clock tower has a belfry of paired arches on every face, a portal at its foot, four equal turrets at the corners of the clock stage below the roof\'s top, and one needle at 76 m', () => {
  const parts = midlandGeometry(midland);
  const t = midland.towers.find((x) => x.name === 'clock') as (typeof midland.towers)[number];
  const st = towerStages(t.height);
  const h = t.side / 2;
  const all = allVertices(parts).map((v) => inTower(t, v)).filter((p) => Math.abs(p.a) < h + 1 && Math.abs(p.o) < h + 1);
  // the needle: nothing but a single point reaches the top
  const top = all.filter((p) => p.y > t.height - 1e-6);
  assert.ok(top.length >= 1 && top.every((p) => Math.hypot(p.a, p.o) < 1e-6), 'one needle, on the tower\'s axis');
  // each face has its belfry: lancets (panes) between the shaft's top and the belfry's top, in the face's plane
  const panes = triangles(parts.pane as Batch);
  for (const [name, n] of [['out', [1, 0]], ['back', [-1, 0]], ['along', [0, 1]], ['against', [0, -1]]] as const) {
    const onFace = panes.filter((tr) => tr.p.every((v) => {
      const p = inTower(t, v);
      const d = p.o * n[0] + p.a * n[1];
      return v[1] > st.shaft && v[1] < st.belfry && d > h - 0.05 && d < h + 0.5 && Math.abs(n[0] ? p.a : p.o) < h;
    }));
    assert.ok(onFace.length >= 4, `the ${name} face has ${onFace.length} belfry pane triangles`);
  }
  // the portal: a tall pointed opening on the street face, clear of the ground, under the first string course
  const portal = panes.filter((tr) => tr.p.every((v) => { const p = inTower(t, v); return p.o > h - 0.05 && p.o < h + 0.3 && Math.abs(p.a) < 2 && v[1] < 6; }));
  assert.ok(portal.length >= 6, 'a portal');
  const py = portal.flatMap((tr) => tr.p.map((v) => v[1]));
  assert.ok(Math.min(...py) > 0.2 && Math.max(...py) < 5.7 && Math.max(...py) - Math.min(...py) > 4, `portal from ${Math.min(...py)} to ${Math.max(...py)}`);
  // the turrets: four spirelets, one to a corner, all the same height, below the roof's top
  const tipY = st.wall + 6.6;
  const tips = all.filter((p) => Math.abs(p.y - tipY) < 1e-6);
  const corners = new Set(tips.map((p) => `${Math.sign(p.a)},${Math.sign(p.o)}`));
  assert.equal(corners.size, 4, `${tips.length} turret tips at ${[...corners]}`);
  assert.ok(tips.every((p) => Math.abs(Math.abs(p.a) - Math.abs(tips[0]!.a)) < 1e-6 && Math.abs(Math.abs(p.o) - Math.abs(tips[0]!.o)) < 1e-6), 'one pattern of four');
  assert.ok(tipY < st.roof, 'the turrets stand below the roof\'s top');
  // and above the roof's top nothing stands out beyond the lantern (1.7 m a side, its corner pinnacles 0.22 m more)
  for (const p of all) if (p.y > st.roof + 1e-6) assert.ok(Math.abs(p.a) < 2.0 && Math.abs(p.o) < 2.0, `a vertex at ${p.y} above the roof's top is off the lantern`);
});

test('Midland Grand [hist-b, hist-c]: the clock tower\'s spire is a steep slate pyramid between the turrets, an open pinnacled lantern part-way up, a long needle and a rod', () => {
  const parts = midlandGeometry(midland);
  const t = midland.towers.find((x) => x.name === 'clock') as (typeof midland.towers)[number];
  const st = towerStages(t.height);
  const stage = t.side / 2 + 0.5;
  const g = 4.3;
  const within = (half: number) => (s: Tri): boolean => s.p.every((v) => Math.abs(inTower(t, v).a) <= half + 1e-6 && Math.abs(inTower(t, v).o) <= half + 1e-6);
  const pitch = (s: Tri): number => (Math.atan2(Math.hypot(geoNormal(s)[0], geoNormal(s)[2]), Math.abs(geoNormal(s)[1])) * 180) / Math.PI;
  // taller than the clock stage it crowns, by a good margin: the spire is the building's signature
  assert.ok(t.height - st.wall >= 3 * (st.wall - st.corbel), `${t.height - st.wall} m of spire over a ${st.wall - st.corbel} m clock stage`);
  // the steep roof: its base a little over half the stage's width (hist-c), its facets near 73 degrees, as steep as hist-b and hist-c show
  const slate = triangles(parts.slate as Batch).filter(within(stage));
  const steep = slate.filter((s) => s.p.every((v) => v[1] >= st.wall + g - 1e-6 && v[1] <= st.roof + 1e-6) && within(3.3)(s) && worldArea(s) > 5); // not the little cheeks and roofs of the lucarnes
  assert.equal(steep.length, 8, 'four facets of two triangles');
  for (const s of steep) assert.ok(pitch(s) > 70 && pitch(s) < 76, `a steep roof facet at ${pitch(s)} degrees`);
  assert.ok(Math.max(...steep.flatMap((s) => s.p.map((v) => Math.max(Math.abs(inTower(t, v).a), Math.abs(inTower(t, v).o))))) <= 0.65 * stage, 'its base is under two thirds of the stage\'s width');
  // the gables' cheeks meet the hip where the steep roof begins: an apex-back point on each face, on the pyramid's base
  const backs = slate.flatMap((s) => s.p).filter((v) => Math.abs(v[1] - (st.wall + g)) < 1e-6 && Math.abs(Math.hypot(inTower(t, v).a, inTower(t, v).o) - 3.3) < 1e-6 && (Math.abs(inTower(t, v).a) < 1e-6 || Math.abs(inTower(t, v).o) < 1e-6));
  assert.ok(new Set(backs.map((v) => `${Math.sign(inTower(t, v).a)},${Math.sign(inTower(t, v).o)}`)).size === 4, 'one cheek meeting point on each face');
  // the lantern is open: dark lights behind two mullions a face, a cornice, a pinnacle on each corner; the needle starts from inside its cornice
  const lantern = (s: Tri): boolean => s.p.every((v) => v[1] >= st.roof + 0.4 - 1e-6 && v[1] <= st.lantern - 0.4 + 1e-6) && within(2.0)(s);
  assert.equal(triangles(parts.pane as Batch).filter(lantern).length, 8, 'four dark walls');
  const mullions = triangles(parts.stone as Batch).filter((s) => lantern(s) && Math.abs(geoNormal(s)[1]) < 1e-9);
  assert.equal(mullions.length, 64, 'eight mullions, a box each with four sides of two triangles');
  const pinnacles = triangles(parts.stone as Batch).filter((s) => s.p.some((v) => Math.abs(v[1] - (st.lantern + 0.9)) < 1e-6));
  assert.equal(new Set(pinnacles.flatMap((s) => s.p.filter((v) => Math.abs(v[1] - (st.lantern + 0.9)) < 1e-6).map((v) => `${Math.sign(inTower(t, v).a)},${Math.sign(inTower(t, v).o)}`))).size, 4, 'a pinnacle on each corner of the lantern');
  // the needle: slender (taller than twice its base), then a thin rod to the tower's height (76 m)
  const needle = slate.filter((s) => s.p.every((v) => v[1] >= st.lantern - 1e-6) && s.p.some((v) => v[1] > st.lantern + 1));
  assert.ok(needle.length >= 8, 'a needle and a rod');
  const baseHalf = Math.max(...needle.flatMap((s) => s.p.filter((v) => Math.abs(v[1] - st.lantern) < 1e-6).map((v) => Math.max(Math.abs(inTower(t, v).a), Math.abs(inTower(t, v).o)))));
  assert.ok(t.height - 1.8 - st.lantern > 2 * (2 * baseHalf), `a needle ${t.height - 1.8 - st.lantern} m tall on a base ${2 * baseHalf} m wide`);
  const rod = needle.flatMap((s) => s.p).filter((v) => Math.abs(v[1] - (t.height - 1.8)) < 1e-6);
  assert.ok(rod.length > 0 && rod.every((v) => Math.max(Math.abs(inTower(t, v).a), Math.abs(inTower(t, v).o)) < 0.2), 'the rod rises from the needle\'s tip');
});

test('Midland Grand [hist-b, hist-c]: a lucarne on each face of the clock tower\'s spire: a stone gablet 1.2 m wide and 2.6 m to its apex standing on the slope with its cheeks meeting the roof, over a pointed light', () => {
  const parts = midlandGeometry(midland);
  const t = midland.towers.find((x) => x.name === 'clock') as (typeof midland.towers)[number];
  const st = towerStages(t.height);
  const foot = st.wall + 4.3; // where the steep roof begins
  const yb = foot + 0.9;
  const slate = triangles(parts.slate as Batch);
  const stone = triangles(parts.stone as Batch);
  const pane = triangles(parts.pane as Batch);
  for (const n of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const depth = (v: V3): number => inTower(t, v).o * n[0] + inTower(t, v).a * n[1];
    const across = (v: V3): number => (n[0] ? inTower(t, v).a : inTower(t, v).o);
    // the spire's facet on this face, and from its own corners the depth of the slope at any height
    const facet = slate.filter((s) => worldArea(s) > 5 && s.p.every((v) => v[1] >= foot - 1e-6 && v[1] <= st.roof + 1e-6 && depth(v) > 1.6 - 1e-6));
    assert.equal(facet.length, 2, `${n}: the facet of two triangles`);
    const corners = facet.flatMap((s) => s.p);
    const [low, high] = [corners.find((v) => Math.abs(v[1] - foot) < 1e-6) as V3, corners.find((v) => Math.abs(v[1] - st.roof) < 1e-6) as V3];
    const slope = (y: number): number => depth(low) + ((y - foot) / (st.roof - foot)) * (depth(high) - depth(low));
    const front = slope(yb);
    // the gablet's stone face and its border, in one plane on the slope
    const face = stone.filter((s) => s.p.every((v) => Math.abs(depth(v) - front) < 1e-6 && v[1] >= yb - 1e-6 && v[1] <= yb + 3));
    assert.equal(face.length, 11, `${n}: a face of three triangles and a border of four quads (up the sides and along the rakes)`);
    const ys = face.flatMap((s) => s.p.map((v) => v[1]));
    close(Math.min(...ys), yb, 1e-9, `${n}: its foot is on the slope, 0.9 m above where the steep roof begins`);
    close(Math.max(...ys), yb + 2.6 + 1.7 * 0.14, 1e-9, `${n}: 2.6 m to the apex, and the border over it`);
    const xs = face.flatMap((s) => s.p.map(across));
    close(Math.max(...xs), 0.6 + 0.14, 1e-6, `${n}: 1.2 m wide, and its border`);
    close(Math.min(...xs), -(0.6 + 0.14), 1e-6, `${n}: centred on the face`);
    // the light: a pointed pane 0.7 x 1.5 m, 0.25 m up the face and 0.1 m in front of it
    const light = pane.filter((s) => s.p.every((v) => Math.abs(depth(v) - front - 0.1) < 1e-6 && v[1] >= yb - 1e-6 && v[1] <= yb + 3));
    assert.ok(light.length >= 7, `${n}: a fan of triangles for the light`);
    close(Math.min(...light.flatMap((s) => s.p.map((v) => v[1]))), yb + 0.25, 1e-9, `${n}: the light's sill`);
    close(Math.max(...light.flatMap((s) => s.p.map((v) => v[1]))), yb + 1.75, 1e-9, `${n}: its head`);
    close(Math.max(...light.flatMap((s) => s.p.map((v) => Math.abs(across(v))))), 0.35, 1e-6, `${n}: 0.7 m wide`);
    // the cheeks and the little roof: slate, from the face back to the slope, every back corner on it
    const cheeks = slate.filter((s) => worldArea(s) < 5 && s.p.every((v) => v[1] >= yb - 1e-6 && v[1] <= yb + 2.6 + 1e-6 && Math.abs(across(v)) <= 0.6 + 1e-6 && depth(v) > 1.6));
    assert.equal(cheeks.length, 6, `${n}: a cheek (a triangle) and half a roof (a quad) on each side`);
    for (const v of cheeks.flatMap((s) => s.p)) assert.ok(Math.abs(depth(v) - front) < 1e-6 || Math.abs(depth(v) - slope(v[1])) < 1e-6, `${n}: a cheek corner at height ${v[1].toFixed(2)} is on the face or on the slope`);
    assert.ok(cheeks.flatMap((s) => s.p).filter((v) => Math.abs(depth(v) - slope(v[1])) < 1e-6 && Math.abs(depth(v) - front) > 1e-6).length >= 4, `${n}: the cheeks run back into the roof`);
  }
});

test('Midland Grand [hist-c]: a row of corbels 0.9 m tall under the corbel table on every face of each tower, no farther out than its first step, in front of a dark recess, clear of the belfry\'s windows', () => {
  const parts = midlandGeometry(midland);
  const stone = triangles(parts.stone as Batch);
  const pane = triangles(parts.pane as Batch);
  for (const t of midland.towers) {
    const st = towerStages(t.height);
    const bT = st.belfry;
    const half = t.side / 2;
    const nc = Math.round(t.side / 0.9);
    const reachOf = (v: V3): number => Math.max(Math.abs((v[0] - t.centre[0]) * t.along[0] + (v[2] - t.centre[1]) * t.along[1]), Math.abs((v[0] - t.centre[0]) * t.out[0] + (v[2] - t.centre[1]) * t.out[1]));
    const corbels = stone.filter((s) => s.p.some((v) => v[1] < bT - 0.1) && s.p.every((v) => v[1] >= bT - 0.9 - 1e-9 && v[1] <= bT + 1e-9 && reachOf(v) < half + 0.3));
    assert.equal(corbels.length, 4 * nc * 10, `${t.name}: ${nc} corbels to a face, five faces to a corbel (the top is under the first step)`);
    close(Math.max(...corbels.flatMap((s) => s.p.map(reachOf))), half + 0.25, 1e-6, `${t.name}: as far out as the first step of the table`);
    close(Math.min(...corbels.flatMap((s) => s.p.map((v) => v[1]))), bT - 0.9, 1e-9, `${t.name}: hanging 0.9 m under the table`);
    // the recess behind them, dark: a band of the library's pane, 0.04 m out, the corbels' height, one front face to each side
    const recess = pane.filter((s) => s.p.every((v) => (Math.abs(v[1] - (bT - 0.9)) < 1e-9 || Math.abs(v[1] - bT) < 1e-9) && reachOf(v) < half + 0.3) && s.p.some((v) => Math.abs(v[1] - (bT - 0.9)) < 1e-9) && s.p.some((v) => Math.abs(v[1] - bT) < 1e-9));
    assert.equal(recess.length, 8, `${t.name}: a dark recess, two triangles to a side`);
    close(Math.max(...recess.flatMap((s) => s.p.map(reachOf))), half + 0.04, 1e-6, `${t.name}: standing 0.04 m out`);
    // nothing of the belfry's stonework (the arches, jambs and sills) reaches up into the corbels' band
    const belfry = stone.filter((s) => s.p.every((v) => v[1] > st.shaft - 1e-9 && v[1] < bT - 1e-9 && Math.hypot(v[0] - t.centre[0], v[2] - t.centre[1]) < half + 0.5) && !s.p.every((v) => v[1] >= bT - 0.9 - 1e-9));
    assert.ok(belfry.length > 0, `${t.name}: the belfry has stonework`);
    assert.ok(Math.max(...belfry.flatMap((s) => s.p.map((v) => v[1]))) < bT - 0.9, `${t.name}: the belfry's stonework ends under the corbels`);
  }
});

test('Midland Grand [hist-c]: each face of the clock tower\'s belfry has two groups of twin lancets, a 0.6 m stone shaft between each pair, every group under a pointed arch of red and stone voussoirs with a pale apex', () => {
  const parts = midlandGeometry(midland);
  const t = midland.towers.find((x) => x.name === 'clock') as (typeof midland.towers)[number];
  const st = towerStages(t.height);
  const h = t.side / 2;
  // hist-c: the belfry stands on a balcony, a slab 0.5 m thick standing 0.45 m out all round, and its groups run from just above it to just under the corbels
  const slab = triangles(parts.stone as Batch).filter((tr) => tr.p.every((v) => Math.abs(v[1] - st.shaft) < 1e-9 || Math.abs(v[1] - st.shaft - 0.5) < 1e-9) && tr.p.some((v) => Math.abs(v[1] - st.shaft) < 1e-9) && tr.p.some((v) => Math.abs(v[1] - st.shaft - 0.5) < 1e-9));
  assert.equal(slab.length, 8, 'a front face to each of the four sides (two triangles)');
  close(Math.max(...slab.flatMap((tr) => tr.p.map((v) => Math.max(Math.abs(inTower(t, v).a), Math.abs(inTower(t, v).o))))), h + 0.45, 1e-6, 'the balcony stands 0.45 m out');
  const groupBase = st.shaft + 0.9;
  const groupHeight = st.belfry - st.shaft - 2.4;
  const lancetTop = groupBase + groupHeight - 0.9; // the lancets end under the oculus of their group
  for (const n of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const across = (v: V3): number => (n[0] ? inTower(t, v).a : inTower(t, v).o);
    const onFace = (tr: Tri): boolean => tr.p.every((v) => { const p = inTower(t, v); const d = p.o * n[0] + p.a * n[1]; return d > h - 0.05 && d < h + 0.5 && Math.abs(across(v)) < 4 && v[1] > st.shaft && v[1] < st.belfry; });
    // the lancets: merge the triangles' spans across the face into the panes they make
    const spans = triangles(parts.pane as Batch).filter((tr) => onFace(tr) && tr.p.every((v) => v[1] < lancetTop + 1e-9)).map((tr) => [Math.min(...tr.p.map(across)), Math.max(...tr.p.map(across))] as const).sort((a, b) => a[0] - b[0]);
    const panes: [number, number][] = [];
    for (const [lo, hi] of spans) {
      const last = panes[panes.length - 1];
      if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi);
      else panes.push([lo, hi]);
    }
    assert.equal(panes.length, 4, `${n}: four lancets, two groups of two`);
    // tall: from the group's sill to under its oculus, 4.3 m of the 7.6 m stage, over half of it (the round-3 lancets were 4.0 m)
    const ys = triangles(parts.pane as Batch).filter((tr) => onFace(tr) && tr.p.every((v) => v[1] < lancetTop + 1e-9)).flatMap((tr) => tr.p.map((v) => v[1]));
    close(Math.max(...ys) - Math.min(...ys), 4.3, 1e-6, `${n}: the lancets are 4.3 m tall`);
    assert.ok((Math.max(...ys) - Math.min(...ys)) / (st.belfry - st.shaft) > 0.55, `${n}: and fill over half the stage`);
    close((panes[1] as [number, number])[0] - (panes[0] as [number, number])[1], 0.6, 1e-6, `${n}: a 0.6 m shaft between the pair`);
    close((panes[3] as [number, number])[0] - (panes[2] as [number, number])[1], 0.6, 1e-6, `${n}: and between the other pair`);
    close((panes[2] as [number, number])[0] + (panes[1] as [number, number])[1], 0, 1e-6, `${n}: the groups are mirror images about the face's middle`);
    // each group's arch: red voussoirs all round it, none at its apex (the pale pair), on the jambs down to the sill
    for (const centre of [-1.8, 1.8]) {
      const red = triangles(parts.brickRed as Batch).filter((tr) => onFace(tr) && tr.p.every((v) => Math.abs(across(v) - centre) < 1.8));
      assert.ok(red.length >= 8, `${n}, group at ${centre}: ${red.length} red triangles`);
      assert.ok(red.every((tr) => tr.p.every((v) => Math.abs(across(v) - centre) > 1e-6)), `${n}, group at ${centre}: no red block at the apex`);
    }
  }
});

test('Midland Grand: each dial is upright and reads left to right as a viewer outside sees it, whichever face it is on', () => {
  const clocks = triangles(midlandGeometry(midland).clock as Batch);
  const t = midland.towers.find((x) => x.name === 'clock') as (typeof midland.towers)[number];
  const faces = new Set<string>();
  for (const tr of clocks) {
    const g = geoNormal(tr);
    const len = Math.hypot(g[0], g[2]);
    const n: [number, number] = [g[0] / len, g[2] / len];
    // out of the tower, not into it
    const c: V3 = [(tr.p[0][0] + tr.p[1][0] + tr.p[2][0]) / 3, 0, (tr.p[0][2] + tr.p[1][2] + tr.p[2][2]) / 3];
    assert.ok((c[0] - t.centre[0]) * n[0] + (c[2] - t.centre[1]) * n[1] > 0, 'faces away from the tower');
    // the dial's own axes in the world: u runs to the viewer's right, v runs up
    const [p0, p1, p2] = tr.p;
    const [a0, a1, a2] = tr.uv;
    const det = (a1[0] - a0[0]) * (a2[1] - a0[1]) - (a1[1] - a0[1]) * (a2[0] - a0[0]);
    const du: V3 = [0, 1, 2].map((k) => ((a2[1] - a0[1]) * (p1[k] - p0[k]) - (a1[1] - a0[1]) * (p2[k] - p0[k])) / det) as V3;
    const dv: V3 = [0, 1, 2].map((k) => (-(a2[0] - a0[0]) * (p1[k] - p0[k]) + (a1[0] - a0[0]) * (p2[k] - p0[k])) / det) as V3;
    const right: [number, number] = [n[1], -n[0]];
    assert.ok((du[0] * right[0] + du[2] * right[1]) / Math.hypot(du[0], du[2]) > 0.999 && Math.abs(du[1]) < 1e-6, `u runs to the viewer's right: ${du}`);
    assert.ok(dv[1] > 0 && Math.hypot(dv[0], dv[2]) < 1e-6, `v runs up: ${dv}`);
    faces.add(n.map((x) => x.toFixed(2)).join(','));
  }
  assert.equal(faces.size, 4, 'four faces');
});

// ---- arches ------------------------------------------------------------------------------------

test('headArc: a pointed head, two arcs of one radius springing from the jambs and meeting on the centre line, each ring concentric with the opening', () => {
  for (const [w, spring, grow, steps] of [[2.4, 1.3, 0, 3], [3.4, 2.0, 0.22, 4], [5.0, 1.1, 0.3, 5]] as const) {
    const pts = headArc(w, spring, grow, steps);
    const n = 2 * steps;
    const hw = w / 2;
    const r = w + grow;
    assert.equal(pts.length, n + 1, 'points');
    close(pts[0]![0], hw + grow, 1e-9, 'starts grow outside the right jamb');
    close(pts[0]![1], spring, 1e-9, 'at the springing');
    close(pts[n]![0], -(hw + grow), 1e-9, 'ends outside the left jamb');
    close(pts[steps]![0], 0, 1e-9, 'the apex is on the centre line');
    close(pts[steps]![1], spring + Math.sqrt(r * r - hw * hw), 1e-9, 'at the height a pointed arch of this span has');
    for (let k = 0; k <= steps; k++) {
      close(Math.hypot(pts[k]![0] + hw, pts[k]![1] - spring), r, 1e-9, `right arc point ${k} is one radius from the left jamb`);
      close(Math.hypot(pts[n - k]![0] - hw, pts[n - k]![1] - spring), r, 1e-9, `left arc point ${k} is one radius from the right jamb`);
      close(pts[k]![0], -pts[n - k]![0], 1e-9, 'mirror in x');
      close(pts[k]![1], pts[n - k]![1], 1e-9, 'and level');
    }
  }
});

test('addTwin: paired lancets under an arch of stone and red voussoirs, the halves mirror images with a pale apex, red courses down the jambs, a stone moulding round it all', () => {
  const parts: PartMap<Key> = {};
  const W = 2.4;
  const h = 3.4;
  addTwin(parts, { at: [0, 0], dir: [1, 0], normal: [0, 1] }, 0, W, h);
  const red = triangles(parts.brickRed as Batch);
  const stone = triangles(parts.stone as Batch);
  assert.ok(red.length >= 8 && stone.length >= 40, `${red.length} red and ${stone.length} stone triangles`);
  // two lancets, each (W - 0.6) / 2 wide, with a 0.6 m stone shaft between them (hist-b, hist-c: the pair reads as a pair across the street); the oculus above is on the centre line
  const lancets = triangles(parts.pane as Batch).filter((t) => t.p.every((v) => v[1] < h - 0.9 + 1e-9));
  close(Math.min(...lancets.flatMap((t) => t.p.map((v) => Math.abs(v[0])))), 0.3, 1e-9, 'a 0.6 m shaft between the lancets');
  close(Math.max(...lancets.flatMap((t) => t.p.map((v) => Math.abs(v[0])))), 0.3 + (W - 0.6) / 2, 1e-9, 'each lancet (W - 0.6) / 2 wide');
  // a five-step ring: red at the second and fourth of five blocks each side, the pale pair at the apex
  const spring = h - W * Math.sin(Math.PI / 3);
  assert.equal(red.filter((t) => t.p.every((v) => v[1] >= spring - 1e-9)).length, 8, 'four red voussoirs in the head, two each side of the pale apex pair');
  const cx = (t: Tri): number => (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3;
  const area = (ts: Tri[]): number => ts.reduce((s, t) => s + worldArea(t), 0);
  close(area(red.filter((t) => cx(t) < 0)), area(red.filter((t) => cx(t) > 0)), 1e-9, 'the red area on each side of the centre line');
  assert.ok(red.every((t) => t.p.every((v) => Math.abs(v[0]) > 1e-6)), 'no red block at the apex');
  for (const t of red) assert.ok(geoNormal(t)[2] > 0, 'red blocks face out');
  // red blocks reach down the jambs to the sill's height and up round the head
  const ry = red.flatMap((t) => t.p.map((v) => v[1]));
  assert.ok(Math.min(...ry) < 0.7 && Math.max(...ry) > h - 1.2, `red from ${Math.min(...ry)} to ${Math.max(...ry)}`);
  // the moulding outside the arch: stone beyond the red, so the red is framed, and it reaches the arch's own outer edge
  const outer = Math.max(...red.flatMap((t) => t.p.map((v) => Math.abs(v[0]))));
  const stoneOuter = Math.max(...stone.filter((t) => t.p.every((v) => v[1] > 0.4)).flatMap((t) => t.p.map((v) => Math.abs(v[0]))));
  assert.ok(stoneOuter > outer + 0.05, `the moulding (${stoneOuter}) stands outside the red blocks (${outer})`);
});

test('headArc, round: a semicircle about the middle of the springing, each ring concentric with the opening', () => {
  for (const [w, spring, grow, steps] of [[1.4, 2.5, 0, 3], [1.7, 3.1, 0.22, 4], [1.0, 2.0, 0.3, 5]] as const) {
    const pts = headArc(w, spring, grow, steps, true);
    const n = 2 * steps;
    assert.equal(pts.length, n + 1, 'points');
    close(pts[0]![0], w / 2 + grow, 1e-9, 'starts grow outside the right jamb');
    close(pts[0]![1], spring, 1e-9, 'at the springing');
    close(pts[steps]![0], 0, 1e-9, 'the apex is on the centre line');
    close(pts[steps]![1], spring + w / 2 + grow, 1e-9, 'a radius above the springing');
    for (let k = 0; k <= n; k++) close(Math.hypot(pts[k]![0], pts[k]![1] - spring), w / 2 + grow, 1e-9, `point ${k} is one radius from the middle of the springing`);
    for (let k = 0; k <= steps; k++) {
      close(pts[k]![0], -pts[n - k]![0], 1e-9, 'mirror in x');
      close(pts[k]![1], pts[n - k]![1], 1e-9, 'and level');
    }
  }
});

test('addArch [hist-b]: a round-headed dark opening in a ring of voussoirs, red and stone in turn with a pale pair at the apex, on jambs whose top course is red, a stone moulding outside all', () => {
  const parts: PartMap<Key> = {};
  const w = 1.5;
  const h = 3.9;
  const spring = h - w / 2;
  addArch(parts, { at: [0, 0], dir: [1, 0], normal: [0, 1] }, 0, w, h);
  const pane = triangles(parts.pane as Batch);
  close(Math.max(...pane.flatMap((t) => t.p.map((v) => v[1]))), h, 1e-9, 'the opening is h tall');
  close(Math.max(...pane.flatMap((t) => t.p.map((v) => v[0]))), w / 2, 1e-9, 'and w wide');
  const red = triangles(parts.brickRed as Batch);
  const stone = triangles(parts.stone as Batch);
  const head = red.filter((t) => t.p.every((v) => v[1] >= spring - 1e-9));
  assert.equal(head.length, 4, 'two red voussoirs (a quad is two triangles), one on each side of the pale apex');
  for (const t of head) for (const v of t.p) {
    const r = Math.hypot(v[0], v[1] - spring);
    assert.ok(r >= w / 2 - 1e-9 && r <= w / 2 + 0.22 + 1e-9, `a red voussoir corner is ${r} m from the middle of the springing: on the ring`);
  }
  const jambs = red.filter((t) => t.p.some((v) => v[1] < spring - 1e-9));
  assert.equal(jambs.length, 12, 'red courses down both jambs: three each side of five');
  close(Math.max(...jambs.flatMap((t) => t.p.map((v) => v[1]))), spring, 1e-9, 'the top course, under the springing, is red');
  const cx = (t: Tri): number => (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3;
  const area = (ts: Tri[]): number => ts.reduce((s, t) => s + worldArea(t), 0);
  close(area(red.filter((t) => cx(t) < 0)), area(red.filter((t) => cx(t) > 0)), 1e-9, 'the red area on each side of the centre line');
  assert.ok(red.every((t) => t.p.every((v) => Math.abs(v[0]) > 1e-6)), 'no red block at the apex');
  const outer = Math.max(...red.flatMap((t) => t.p.map((v) => Math.abs(v[0]))));
  const stoneOuter = Math.max(...stone.filter((t) => t.p.every((v) => v[1] > 0.4)).flatMap((t) => t.p.map((v) => Math.abs(v[0]))));
  assert.ok(stoneOuter > outer + 0.05, `the moulding (${stoneOuter}) stands outside the red blocks (${outer})`);
  for (const t of [...pane, ...red, ...stone]) assert.ok(geoNormal(t)[2] > 0, 'everything faces out');
});

test('Midland Grand [hist-b]: the ground storey is an arcade of those arches, one to a bay of the front and the wing, and the upper rows keep their paired lancets', () => {
  const parts = midlandGeometry(midland);
  const dressed = [...midland.front.bays, ...midland.wing.bays].filter((b) => !midland.towers.some((t) => pointInQuad(b.at, towerSquare(t, 0.45))));
  assert.ok(dressed.length >= 25, `${dressed.length} bays`);
  const pane = triangles(parts.pane as Batch);
  const red = triangles(parts.brickRed as Batch);
  const entrances = PAVILIONS.flatMap((i) => [midland.front.bays[i], midland.front.bays[i + 1]]);
  assert.equal(entrances.filter((b) => b && dressed.includes(b)).length, 6, 'three gabled bays of two window bays each, none behind a tower');
  for (const b of dressed) {
    const near = (v: V3): boolean => Math.hypot(v[0] - b.at[0], v[2] - b.at[1]) < 1.5;
    // a gabled bay's arch is the entrance: wider and taller, its sill 0.5 m up like the tower portal's
    const [w, sill, top] = entrances.includes(b) ? [2.4, 0.5, 4.7] : [Math.max(1.0, Math.min(1.7, b.width * 0.32)), 1.0, 4.9];
    const spring = top - w / 2;
    const opening = pane.filter((t) => t.p.every((v) => near(v) && v[1] < 5.5));
    assert.equal(opening.length, 9, 'one round-headed pane: a fan of eleven points');
    close(Math.max(...opening.flatMap((t) => t.p.map((v) => v[1]))), top, 1e-9, `up to ${top} m`);
    close(Math.min(...opening.flatMap((t) => t.p.map((v) => v[1]))), sill, 1e-9, `from ${sill} m`);
    assert.equal(red.filter((t) => t.p.every((v) => near(v) && v[1] >= spring - 1e-9 && v[1] < 5.5)).length, 4, 'two red voussoirs in its ring');
  }
  const [y1, h1] = ROWS[0];
  const lancets = pane.filter((t) => t.p.every((v) => v[1] >= y1 - 1e-9 && v[1] <= y1 + h1 + 1e-9));
  assert.ok(lancets.length > dressed.length * 6, 'the first floor keeps its paired lancets');
});

test('Midland Grand [hist-b]: the window groups shorten storey by storey, the first floor\'s 4.0 m, the second\'s 3.4 m, the top\'s 2.6 m, clear under the cornice', () => {
  assert.deepEqual(ROWS.map(([, h]) => h), [4.0, 3.4, 2.6], 'hist-b: taller first-floor lights, a shorter top storey');
  const pane = triangles(midlandGeometry(midland).pane as Batch);
  const bay = midland.front.bays[16] as Bay0; // an ordinary bay of the front
  const mine = pane.filter((t) => t.p.every((v) => Math.abs((v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1]) < bay.width / 2 && Math.abs((v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1]) < 1 && v[1] > 6 && v[1] < midland.eaves));
  ROWS.forEach(([y, h], i) => {
    // the highest pane of a group is its round light (a disc of 0.27 m, its middle 0.45 m under the head of the group)
    const row = mine.filter((t) => t.p.every((v) => v[1] >= y - 1e-9 && v[1] < y + 5));
    close(Math.max(...row.flatMap((t) => t.p.map((v) => v[1]))), y + h - 0.45 + 0.27, 1e-9, `the group of storey ${i + 2}: its head`);
  });
  const [yt, ht] = ROWS[2];
  assert.ok(yt + ht + 0.4 < midland.eaves - 1.0, 'the top storey\'s arches, with their rings, stand clear under the cornice');
});

test('Midland Grand [hist-b]: a tower carries the facade\'s window rows (ROWS) on each face that stands clear of the hotel, and none on a face turned toward it', () => {
  const pane = triangles(midlandGeometry(midland).pane as Batch);
  let free = 0;
  let turned = 0;
  for (const t of midland.towers) {
    const h = t.side / 2;
    for (const [n, d] of [[t.out, t.along], [t.along, t.out]] as const) {
      for (const s of [1, -1]) {
        const centre: Pt = [t.centre[0] + n[0] * h * s, t.centre[1] + n[1] * h * s];
        const onFace = (v: V3): boolean => Math.abs((v[0] - centre[0]) * n[0] * s + (v[2] - centre[1]) * n[1] * s) < 0.3 && Math.abs((v[0] - centre[0]) * d[0] + (v[2] - centre[1]) * d[1]) < h - 0.2;
        const inside = pointInPolygon([centre[0] + n[0] * s, centre[1] + n[1] * s], midland.outline);
        ROWS.forEach(([y, wh], i) => {
          const row = pane.filter((p) => p.p.every((v) => onFace(v) && v[1] >= y - 1e-9 && v[1] < y + 5));
          if (inside) return assert.equal(row.length, 0, `${t.name}: no windows in row ${i} on a face turned toward the hotel`);
          assert.ok(row.length > 0, `${t.name}: windows in row ${i}`);
          close(Math.max(...row.flatMap((p) => p.p.map((v) => v[1]))), y + wh - 0.45 + 0.27, 1e-9, `${t.name}: row ${i} is ${wh} m tall, as on the facade`);
        });
        if (inside) turned++;
        else free++;
      }
    }
  }
  assert.ok(free >= midland.towers.length && turned >= 1, `${free} faces clear of the hotel, ${turned} turned toward it`);
});

/** where a vertex is in a pavilion's frame: along the front from its middle, and out of the wall */
function inPavilion(pair: readonly [Bay0, Bay0], v: V3): { along: number; out: number } {
  const [a, b] = pair;
  const c: Pt = [(a.at[0] + b.at[0]) / 2, (a.at[1] + b.at[1]) / 2];
  return { along: (v[0] - c[0]) * a.dir[0] + (v[2] - c[1]) * a.dir[1], out: (v[0] - c[0]) * a.normal[0] + (v[2] - c[1]) * a.normal[1] };
}
type Bay0 = (typeof midland.front.bays)[number];
const pavilionPairs = PAVILIONS.map((i) => [midland.front.bays[i], midland.front.bays[i + 1]] as [Bay0, Bay0]);

test('Midland Grand [hist-b]: three gabled bays two windows wide stand 0.5 m out from the first string course and rise through the cornice to a gable 9 m above the eaves', () => {
  assert.equal(pavilionPairs.length, 3);
  const withP = midlandGeometry(midland);
  const without = midlandGeometry(midland, []);
  const sig = (t: Tri): string => JSON.stringify(t.p);
  const added = (key: Key): Tri[] => { const old = new Set(triangles(without[key] as Batch).map(sig)); return triangles(withP[key] as Batch).filter((t) => !old.has(sig(t))); };
  const brick = added('brickRed');
  const stoneAdded = added('stone');
  for (const pair of pavilionPairs) {
    const [a, b] = pair;
    assert.equal(a.edge, b.edge, 'its two bays are on one wall');
    const w = (a.width + b.width) / 2 - 0.2;
    const mine = (t: Tri): boolean => t.p.every((v) => Math.abs(inPavilion(pair, v).along) <= w + 1e-6);
    // the front: a brick wall 0.5 m out, from the first string course (6 m) to the eaves
    const front = brick.filter((t) => mine(t) && t.p.every((v) => Math.abs(inPavilion(pair, v).out - 0.5) < 1e-6 && v[1] <= midland.eaves + 1e-9));
    assert.equal(front.length, 2, 'one quad');
    close(Math.min(...front.flatMap((t) => t.p.map((v) => v[1]))), 6, 1e-9, 'it starts at the first string course');
    close(Math.max(...front.flatMap((t) => t.p.map((v) => v[1]))), midland.eaves, 1e-9, 'and rises to the eaves');
    close(Math.max(...front.flatMap((t) => t.p.map((v) => inPavilion(pair, v).along))) - Math.min(...front.flatMap((t) => t.p.map((v) => inPavilion(pair, v).along))), a.width + b.width - 0.4, 1e-6, 'two bays wide, less a clearance of 0.2 m each side');
    // its sides run back to the wall
    const sides = brick.filter((t) => mine(t) && t.p.every((v) => Math.abs(Math.abs(inPavilion(pair, v).along) - w) < 1e-6) && t.p.some((v) => inPavilion(pair, v).out < 0.1));
    assert.equal(sides.length, 4, 'two side walls');
    for (const t of sides) for (const v of t.p) assert.ok(inPavilion(pair, v).out > -1e-6 && inPavilion(pair, v).out < 0.5 + 1e-6, 'from the wall to its front');
    // the gable: its face a triangle on the same plane, to the apex 9 m above the eaves, on the middle line
    const face = brick.filter((t) => mine(t) && t.p.every((v) => Math.abs(inPavilion(pair, v).out - 0.5) < 1e-6 && v[1] >= midland.eaves - 1e-9));
    const apex = face.flatMap((t) => t.p).reduce((m, v) => (v[1] > m[1] ? v : m));
    close(apex[1], midland.eaves + 9, 1e-9, 'the gable is 9 m high');
    close(inPavilion(pair, apex).along, 0, 1e-6, 'its apex over the middle');
    // the cornice and the string courses go round its front, and a porch hood stands over the entrances
    const stoneHere = stoneAdded.filter((t) => t.p.every((v) => Math.abs(inPavilion(pair, v).along) <= w + 0.5));
    const outs = (lo: number, hi: number): number => Math.max(...stoneHere.filter((t) => t.p.every((v) => v[1] >= lo - 1e-9 && v[1] <= hi + 1e-9)).flatMap((t) => t.p.map((v) => inPavilion(pair, v).out)));
    assert.ok(outs(midland.eaves - 1, midland.eaves) > 0.5 + 0.2, 'the cornice runs round the front');
    for (const y of [11.5, 17]) assert.ok(outs(y, y + 0.35) > 0.5 + 0.1, `the string course at ${y} m runs round the front`);
    close(outs(5.1, 6), 0.9, 1e-6, 'the porch hood stands 0.9 m out, over the entrances');
    assert.ok(stoneHere.some((t) => t.p.some((v) => Math.abs(v[1] - (midland.eaves + 10.4)) < 1e-9 && Math.abs(inPavilion(pair, v).along) < 1e-9)), 'a finial 1.4 m high stands on the apex');
    // the twin lancet in the gable: dark glass in front of the roof, within the gable
    const glass = triangles(withP.pane as Batch).filter((t) => t.p.every((v) => v[1] > midland.eaves && inPavilion(pair, v).out > 0.4 && Math.abs(inPavilion(pair, v).along) < w));
    assert.ok(glass.length >= 14, 'a twin lancet in the gable');
    for (const t of glass) for (const v of t.p) assert.ok(Math.abs(inPavilion(pair, v).along) < w * (1 - (v[1] - midland.eaves) / 9) + 1e-9, 'inside the gable');
    // its lights stand out with the front: each bay's first-floor lancets and oculus all 0.6 m out of the wall (the front's 0.5 m and the glass's 0.1 m)
    for (const bay of pair) {
      const lights = triangles(withP.pane as Batch).filter((t) => t.p.every((v) => v[1] >= 6.9 - 1e-9 && v[1] < 10.4 && Math.abs((v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1]) < bay.width / 2 && Math.abs((v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1]) < 2));
      assert.ok(lights.length > 6, 'the bay has its first-floor lancets');
      for (const t of lights) for (const v of t.p) close((v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1], 0.6, 1e-6, 'a first-floor light is 0.6 m out of the wall');
    }
    // the lower dormer row is the gable itself; the upper row stands behind it, clear of the cheeks (they end where the roof meets them)
    for (const bay of pair) {
      const behind = triangles(withP.pane as Batch).filter((t) => t.p.every((v) => v[1] > midland.eaves && Math.abs((v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1]) < bay.width / 2 && (v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1] < -0.3));
      assert.ok(behind.length > 0 && behind.every((t) => t.p.every((v) => v[1] >= 28)), 'only the upper dormer is left on a gabled bay');
    }
    // the parapet gives way where the cheeks start: no part of one overlaps the gable's width (it is one long quad per wall, so look at what it spans)
    const parapet = (g: PartMap<Key>): Tri[] => triangles(g.stone as Batch).filter((t) => t.p.every((v) => v[1] >= midland.eaves - 1e-9 && v[1] <= midland.eaves + 0.9 + 1e-9 && inPavilion(pair, v).out < 0.4 && inPavilion(pair, v).out > -0.05) && Math.min(...t.p.map((v) => inPavilion(pair, v).along)) < w - 1e-6 && Math.max(...t.p.map((v) => inPavilion(pair, v).along)) > -w + 1e-6);
    assert.ok(parapet(without).length > 0, 'the parapet runs across the place without a gabled bay');
    assert.equal(parapet(withP).length, 0, 'and gives way to the gable with one');
  }
});

test('Midland Grand [hist-b]: a gabled bay\'s cheeks are planar roof planes from the gable\'s rakes back to the roof, meeting it at their back ends and nowhere under it', () => {
  const withP = midlandGeometry(midland);
  const without = midlandGeometry(midland, []);
  const sig = (t: Tri): string => JSON.stringify(t.p);
  const old = new Set(triangles(without.slate as Batch).map(sig));
  const roofOnly = midlandGeometry({ ...midland, towers: [], front: { ...midland.front, bays: [] }, wing: { ...midland.wing, bays: [] } }, []);
  const roofGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float64Array((roofOnly.slate as Batch).positions), 3));
  roofGeometry.setIndex((roofOnly.slate as Batch).indices);
  const mesh = new THREE.Mesh(roofGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  try {
    for (const pair of pavilionPairs) {
      const w = (pair[0].width + pair[1].width) / 2 - 0.2;
      const cheeks = triangles(withP.slate as Batch).filter((t) => !old.has(sig(t)) && t.p.every((v) => Math.abs(inPavilion(pair, v).along) <= w + 1e-6 && v[1] >= midland.eaves - 1e-9));
      // four triangles: a quad a side, and the pitch of each is the same on both sides (mirror images)
      const mine = cheeks.filter((t) => t.p.some((v) => inPavilion(pair, v).out > 0.4));
      assert.equal(mine.length, 4, 'two cheeks of two triangles');
      for (const side of [-1, 1]) {
        const half = mine.filter((t) => t.p.every((v) => inPavilion(pair, v).along * side >= -1e-6));
        assert.equal(half.length, 2);
        const n0 = unit(geoNormal(half[0] as Tri));
        const n1 = unit(geoNormal(half[1] as Tri));
        assert.ok(Math.abs(dot(n0, n1) - 1) < 1e-9, 'one plane');
        assert.ok(n0[1] > 0.3, 'facing up and out');
        // it rises from the eaves at the side wall to the apex on the middle line: 9 m over half the width
        close(Math.max(...half.flatMap((t) => t.p.map((v) => v[1]))), midland.eaves + 9, 1e-9, 'to the apex');
        close(Math.min(...half.flatMap((t) => t.p.map((v) => v[1]))), midland.eaves, 1e-9, 'from the eaves');
      }
      // wherever there is roof under a cheek's corner, the corner stands on it or above it; the ridge meets it at one (the valley runs on from there to the eaves line)
      for (const side of [-1, 1]) {
        const half = mine.filter((t) => t.p.every((v) => inPavilion(pair, v).along * side >= -1e-6));
        const corners = new Map<string, V3>();
        for (const t of half) for (const v of t.p) corners.set(v.map((x) => x.toFixed(6)).join(), v);
        let contacts = 0;
        for (const v of corners.values()) {
          ray.set(new THREE.Vector3(v[0], 100, v[2]), new THREE.Vector3(0, -1, 0));
          const roof = ray.intersectObject(mesh)[0];
          if (!roof) { assert.ok(inPavilion(pair, v).out > -1e-6, 'a corner with no roof under it is out in front of the wall'); continue; }
          assert.ok(v[1] >= roof.point.y - 2e-5, `a cheek corner is under the roof: ${v[1]} < ${roof.point.y}`);
          if (Math.abs(v[1] - roof.point.y) < 2e-5) contacts++;
        }
        assert.ok(contacts >= 1 && contacts <= 2, `${contacts} cheek corners meet the roof: the ridge's end, and the foot at the eaves line if the ray catches its edge`);
        assert.ok([...corners.values()].some((v) => Math.abs(inPavilion(pair, v).out) < 1e-9 && Math.abs(v[1] - midland.eaves) < 1e-9), 'and the cheek\'s foot reaches the eaves line at the wall');
      }
    }
  } finally { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
});

test('Midland Grand [hist-b]: a stone base 0.9 m tall and 0.12 m proud runs under the ground storey of every bay not behind a tower', () => {
  const stone = triangles(midlandGeometry(midland).stone as Batch);
  const open = [...midland.front.bays, ...midland.wing.bays].filter((b) => !midland.towers.some((t) => pointInQuad(b.at, towerSquare(t, 0.45))));
  assert.ok(open.length >= 28, `${open.length} bays`);
  const base = stone.filter((t) => t.p.every((v) => Math.abs(v[1]) < 1e-9 || Math.abs(v[1] - 0.9) < 1e-9) && t.p.some((v) => Math.abs(v[1]) < 1e-9) && t.p.some((v) => Math.abs(v[1] - 0.9) < 1e-9));
  for (const b of open) {
    const frame = (v: V3): { along: number; depth: number } => ({ along: (v[0] - b.at[0]) * b.dir[0] + (v[2] - b.at[1]) * b.dir[1], depth: (v[0] - b.at[0]) * b.normal[0] + (v[2] - b.at[1]) * b.normal[1] });
    const under = base.filter((t) => t.p.every((v) => Math.abs(frame(v).depth - 0.12) < 1e-6) && Math.min(...t.p.map((v) => frame(v).along)) <= 1e-6 && Math.max(...t.p.map((v) => frame(v).along)) >= -1e-6);
    assert.ok(under.length >= 1, `a stone base under the bay at (${b.at[0].toFixed(1)}, ${b.at[1].toFixed(1)})`);
    for (const t of under) assert.ok(geoNormal(t)[0] * b.normal[0] + geoNormal(t)[2] * b.normal[1] > 0, 'it faces out');
  }
});

test('Midland Grand [hist-b]: each gabled bay stands on a stone entrance block 0.5 m out and 6 m tall, its sides running back to the wall, with no brick below the first string course', () => {
  const withP = midlandGeometry(midland);
  const sig = (t: Tri): string => JSON.stringify(t.p);
  const old = new Set(triangles(midlandGeometry(midland, []).stone as Batch).map(sig));
  const stoneAdded = triangles(withP.stone as Batch).filter((t) => !old.has(sig(t)));
  for (const pair of pavilionPairs) {
    const w = (pair[0].width + pair[1].width) / 2 - 0.2;
    const mine = (t: Tri): boolean => t.p.every((v) => Math.abs(inPavilion(pair, v).along) <= w + 1e-6 && v[1] <= 6 + 1e-9);
    const front = stoneAdded.filter((t) => mine(t) && t.p.every((v) => Math.abs(inPavilion(pair, v).out - 0.5) < 1e-6));
    assert.equal(front.length, 2, 'one stone quad');
    close(Math.min(...front.flatMap((t) => t.p.map((v) => v[1]))), 0, 1e-9, 'from the ground');
    close(Math.max(...front.flatMap((t) => t.p.map((v) => v[1]))), 6, 1e-9, 'to the first string course');
    const alongs = front.flatMap((t) => t.p.map((v) => inPavilion(pair, v).along));
    close(Math.max(...alongs) - Math.min(...alongs), 2 * w, 1e-6, 'as wide as the gabled bay');
    const sides = stoneAdded.filter((t) => mine(t) && t.p.every((v) => Math.abs(Math.abs(inPavilion(pair, v).along) - w) < 1e-6) && t.p.some((v) => inPavilion(pair, v).out < 0.1));
    assert.equal(sides.length, 4, 'two stone side walls');
    const redBelow = triangles(withP.brickRed as Batch).filter((t) => t.p.every((v) => Math.abs(inPavilion(pair, v).out - 0.5) < 1e-6 && Math.abs(inPavilion(pair, v).along) <= w + 1e-6 && v[1] < 6 - 1e-9));
    assert.equal(redBelow.length, 0, 'the block is stone, not brick');
  }
});

test('Midland Grand [hist-b]: each gabled bay carries two slender striped spirelets at the feet of its gable, standing on the parapet and rising above the main ridge', () => {
  const parts = midlandGeometry(midland);
  const tip = midland.eaves + 0.9 + 3.5 + 9;
  assert.ok(tip > midland.ridge, 'they break the skyline');
  const vertices = [...triangles(parts.stone as Batch), ...triangles(parts.brickRed as Batch)].flatMap((t) => t.p);
  for (const pair of pavilionPairs) {
    const w = (pair[0].width + pair[1].width) / 2 - 0.2;
    const at = (y: number): string[] => [...new Set(vertices.filter((v) => Math.abs(v[1] - y) < 1e-9 && Math.abs(Math.abs(inPavilion(pair, v).along) - w) < 1e-6 && Math.abs(inPavilion(pair, v).out - 0.2) < 1e-6).map((v) => `${Math.sign(inPavilion(pair, v).along)}`))];
    assert.deepEqual(at(tip).sort(), ['-1', '1'], 'a tip at each foot of the gable');
    const flare = vertices.filter((v) => Math.abs(v[1] - (midland.eaves + 0.9)) < 1e-9 && Math.abs(Math.abs(inPavilion(pair, v).along) - w) < 0.51 && Math.abs(inPavilion(pair, v).out - 0.2) < 0.51);
    assert.ok(flare.length >= 8, 'each stands on the parapet, 0.9 m over the eaves');
    // striped: the three bands of the spire alternate stone and red brick, so both materials reach the cap's foot height
    const bands = new Set([...triangles(parts.stone as Batch).map((t) => ['stone', t] as const), ...triangles(parts.brickRed as Batch).map((t) => ['brickRed', t] as const)].filter(([, t]) => t.p.every((v) => v[1] >= midland.eaves + 0.9 + 3.5 - 1e-9 && v[1] <= tip + 1e-9 && Math.abs(Math.abs(inPavilion(pair, v).along) - w) < 0.51 && Math.abs(inPavilion(pair, v).out - 0.2) < 0.51)).map(([k]) => k));
    assert.deepEqual([...bands].sort(), ['brickRed', 'stone'], 'banded in stone and red');
  }
});

test('Midland Grand [hist-b, hist-c, hist-e]: the dormers are a storey tall in two tiers, and the stacks a row of big brick ones round the roof, the shed side included', () => {
  const rise = midland.ridge - midland.eaves;
  const additions = dormerTriangles();
  const slate = additions.slate as Tri[];
  // an ordinary bay of the long front (no gabled bay, no tower near): the lower dormer's face is 5 m tall and about 3 m wide, the upper's 3.6 m tall
  const bay = midland.front.bays[16] as Bay0;
  const along = (v: V3): number => (v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1];
  const run = midland.roof.runs[bay.edge] as number;
  const mine = slate.filter((t) => t.p.every((v) => Math.abs(along(v)) < bay.width / 2));
  const lower = mine.filter((t) => t.p.every((v) => v[1] < midland.eaves + rise * 0.5));
  const upper = mine.filter((t) => t.p.every((v) => v[1] > midland.eaves + rise * 0.5));
  close(Math.max(...lower.flatMap((t) => t.p.map((v) => v[1]))), midland.eaves + rise * 0.08 + 5, 1e-6, 'the lower dormer: 5 m above its foot');
  close(Math.max(...upper.flatMap((t) => t.p.map((v) => v[1]))), midland.eaves + rise * 0.62 + 3.6, 1e-6, 'the upper dormer: 3.6 m above its foot');
  const width = (ts: Tri[]): number => Math.max(...ts.flatMap((t) => t.p.map(along))) - Math.min(...ts.flatMap((t) => t.p.map(along)));
  assert.ok(width(lower) > 3 && width(lower) < bay.width, `the lower dormer is ${width(lower)} m wide: a good half of the bay`);
  assert.ok(width(upper) > 2 && width(upper) < width(lower), 'the upper is narrower');
  assert.ok(run > 6, 'on a full-depth facet');
  // the stacks: 1.4 m x 0.95 m shafts in a row along the crown of the long shed side too, in clusters of three
  const stacks = triangles(midlandGeometry(midland).brickRed as Batch).filter((t) => t.p.every((v) => v[1] >= midland.ridge - 0.3 - 1e-6 && !midland.towers.some((tw) => pointInQuad([v[0], v[2]], towerSquare(tw, 0.6)))));
  const count = stacks.length / 20;
  assert.ok(count >= 60 && count % 3 === 0, `${count} stacks`);
  const edges = polygonEdges(midland.outline);
  const shed = edges[32] as (typeof edges)[number];
  const ra = midland.roof.ring[32] as Pt;
  const onShedSide = (c: Pt): boolean => Math.abs((c[0] - ra[0]) * shed.normal[0] + (c[1] - ra[1]) * shed.normal[1] + 1.2) < 0.01;
  let shedStacks = 0;
  for (let k = 0; k < count; k++) {
    const shaft = stacks.slice(k * 20, k * 20 + 10);
    const vs = shaft.flatMap((t) => t.p);
    const c: Pt = [vs.reduce((s, v) => s + v[0], 0) / vs.length, vs.reduce((s, v) => s + v[2], 0) / vs.length];
    if (onShedSide(c)) {
      shedStacks++;
      const a = vs.map((v) => (v[0] - c[0]) * shed.dir[0] + (v[2] - c[1]) * shed.dir[1]);
      const d = vs.map((v) => (v[0] - c[0]) * shed.normal[0] + (v[2] - c[1]) * shed.normal[1]);
      close(Math.max(...a) - Math.min(...a), 1.4, 1e-6, 'a shaft is 1.4 m along the crown');
      close(Math.max(...d) - Math.min(...d), 0.95, 1e-6, 'and 0.95 m across');
    }
  }
  assert.ok(shedStacks >= 8, `${shedStacks} stacks along the shed side`);
});

// ---- the Barlow vault --------------------------------------------------------------------------

/** world -> (across, along, up) in the vault's frame */
const inVault = (p: V3): { u: number; v: number; y: number } => ({ ...worldToShed({ origin: barlow.origin, heading: barlow.heading }, [p[0], p[2]]), y: p[1] });

const margin = (barlow.width - barlow.span) / 2;
const skin = barlowSection(24, barlow.span, barlow.rise).map((p) => ({ u: p.x + margin, y: p.y }));
/** how far the point (across, up) is from the roof's skin: the nearest of the 24 strips of the arch */
function underSkin(u: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < skin.length; k++) {
    const a = skin[k] as { u: number; y: number };
    const b = skin[k + 1] as { u: number; y: number };
    const t = Math.max(0, Math.min(1, ((u - a.u) * (b.u - a.u) + (y - a.y) * (b.y - a.y)) / ((b.u - a.u) ** 2 + (b.y - a.y) ** 2)));
    best = Math.min(best, Math.hypot(u - a.u - t * (b.u - a.u), y - a.y - t * (b.y - a.y)));
  }
  return best;
}
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V3): V3 => a.map((x) => x / Math.hypot(...a)) as V3;

/** the brick strips that run the length of the shed: its side walls, the outer strip of the arch on each side (not the south wall, not the stacks) */
const sideWalls = (parts: PartMap<Key>): Tri[] => triangles(parts.brickRed as Batch).filter((t) => Math.max(...t.p.map((p) => inVault(p).v)) - Math.min(...t.p.map((p) => inVault(p).v)) > barlow.barlowLength - 1);

test('Barlow vault [WP-STP]: 100 ft at the crown, on the ground at the springings, inside the 245 ft 6 in walls', () => {
  const parts = barlowGeometry(barlow);
  const slate = triangles(parts.slate as Batch).flatMap((t) => t.p).map(inVault);
  const walls = sideWalls(parts).flatMap((t) => t.p).map(inVault);
  const roof = [...slate, ...walls, ...triangles(parts.roofGlass as Batch).flatMap((t) => t.p).map(inVault)];
  close(Math.max(...roof.map((p) => p.y)), FIGURES.barlow.rise, 1e-3, 'crown');
  close(Math.min(...walls.map((p) => p.y)), 0, 1e-9, 'springings: the brick side walls stand on the ground');
  close(Math.min(...[...slate, ...walls].map((p) => p.u)), margin, 1e-6, 'west springing');
  close(Math.max(...[...slate, ...walls].map((p) => p.u)), margin + barlow.span, 1e-6, 'east springing (73.15 m apart)');
  close(Math.min(...slate.map((p) => p.v)), 0, 1e-6, 'south end');
  close(Math.max(...slate.map((p) => p.v)), barlow.barlowLength, 1e-6, 'the arch ends at the 689 ft gable: the extension is not arched');
  // the arch is symmetric about the shed's middle
  close(Math.max(...roof.filter((p) => p.y > 29).map((p) => p.u)) + Math.min(...roof.filter((p) => p.y > 29).map((p) => p.u)), barlow.width, 1.5, 'the crown is mid-shed');
});

test('Barlow vault [WP-STP]: glass covers the middle half of the arch, slate the outer quarters, to 210 m', () => {
  const parts = barlowGeometry(barlow);
  const slate = triangles(parts.slate as Batch);
  // the glass strips that start at the south wall (the middle of the arch): glass u is the distance along the arch, slate v likewise
  const glass = triangles(parts.roofGlass as Batch).filter((t) => t.p.some((p) => inVault(p).v < 1e-6));
  const glassFrom = Math.min(...glass.flatMap((t) => t.uv.map((q) => q[0])));
  const glassTo = Math.max(...glass.flatMap((t) => t.uv.map((q) => q[0])));
  const total = Math.max(...[...slate, ...sideWalls(parts)].flatMap((t) => t.uv.map((q) => q[1]))); // the whole arch: its outer strips are the brick walls
  close((glassTo - glassFrom) / total, FIGURES.barlow.glassFraction, 0.05, 'fraction of the arch that is glass');
  close(glassFrom / total, 0.25, 0.05, 'the west quarter is slate');
  close(Math.max(...slate.flatMap((t) => t.p.map((p) => inVault(p).v))), barlow.barlowLength, 1e-6, 'slate ends at 689 ft');
  close(Math.max(...glass.flatMap((t) => t.p.map((p) => inVault(p).v))), barlow.barlowLength, 1e-6, 'and so does the glass');
  // UVs are metres, so slate, panes and boards come out true to scale along the whole shed
  for (const t of [...slate, ...glass, ...triangles(parts.lining as Batch)]) close(uvArea(t) / worldArea(t), 1, 0.01, 'texel area equals roof area');
});

test('Barlow ribs [WP-STP, hist-d, hist-d2]: an X-braced lattice truss 2.6 m deep of heavy members at each of the 24 rib positions, springing from the platform, wholly inside the roof', () => {
  const parts = barlowGeometry(barlow);
  assert.equal(barlow.ribs.length, 24);
  // a rib lies in its own 0.4 m slab (a chord is 0.4 m thick along the shed): the purlins run the whole length and the extension's plates stand beyond the gable, so neither is a rib
  const slab = (t: Tri): number => barlow.ribs.findIndex((r) => t.p.every((p) => Math.abs(inVault(p).v - r) <= 0.2 + 1e-6));
  const ribTris = triangles(parts.rib as Batch).filter((t) => slab(t) >= 0);
  barlow.ribs.forEach((_, i) => {
    const ts = ribTris.filter((t) => slab(t) === i);
    const pts = ts.flatMap((t) => t.p).map(inVault);
    close(Math.min(...pts.map((p) => p.y)), 0, 1e-9, `rib ${i} springs from the platform`);
    close(Math.max(...pts.map((p) => p.y)), barlow.rise - 0.1, 0.01, `rib ${i} reaches the crown`);
    const crown = pts.filter((p) => Math.abs(p.u - barlow.width / 2) < 0.05); // a ribbon is half a chord's width either side of the crown node
    close(Math.min(...crown.map((p) => p.y)), barlow.rise - 2.6, 0.01, `rib ${i} is 2.6 m deep at the crown (round 3's 2 m read as a slim single member against hist-d and hist-d2's deep girders)`);
    assert.ok(Math.min(...pts.map((p) => underSkin(p.u, p.y))) >= 0.05, `rib ${i} stands wholly inside the roof`); // 0.10 under it but for the feet, which are held to the platform
    // two chords, and a lattice that crosses the gap between them: four diagonals (two crossed pairs, an X) and a vertical to each of the 24 segments, each seen from both sides
    const depths = ts.map((t) => t.p.map((p) => underSkin(inVault(p).u, inVault(p).y)));
    const topTs = ts.filter((_, j) => Math.max(...(depths[j] as number[])) < 0.5);
    const bottomTs = ts.filter((_, j) => Math.min(...(depths[j] as number[])) > 1.5);
    const latticeTs = ts.filter((t) => !topTs.includes(t) && !bottomTs.includes(t));
    assert.equal(topTs.length, 24 * 3 * 2, `rib ${i}: the top chord, two sides and an underside to a segment`);
    assert.equal(bottomTs.length, 24 * 3 * 2, `rib ${i}: the bottom chord`);
    assert.equal(latticeTs.length, 24 * 20 + 4, `rib ${i}: four diagonals and a vertical to a segment, and the closing vertical`);
    // heavy members, not wires (hist-d, hist-d2): every face of a chord stands 0.2 m either side of the rib's plane (0.4 m thick), of a lattice bar 0.1 m (0.2 m)
    for (const [name, sel, half] of [['top chord', topTs, 0.2], ['bottom chord', bottomTs, 0.2], ['lattice', latticeTs, 0.1]] as const) {
      for (const t of sel) for (const p of t.p) close(Math.abs(inVault(p).v - (barlow.ribs[i] as number)), half, 1e-6, `rib ${i}: the ${name} is ${2 * half} m thick`);
    }
  });
  // the purlins run the length of the shed, one under each node of the arch
  const purlins = triangles(parts.rib as Batch).filter((t) => Math.max(...t.p.map((p) => inVault(p).v)) - Math.min(...t.p.map((p) => inVault(p).v)) > barlow.barlowLength - 1);
  assert.equal(purlins.length, 25 * 3 * 2, 'a purlin of three faces under each of the 25 nodes');
  // each is 0.2 m wide and 0.16 m deep, in groups of six triangles in order across the shed
  const byU = [...purlins].sort((a, b) => a.p.reduce((x, p) => x + inVault(p).u, 0) / 3 - b.p.reduce((x, p) => x + inVault(p).u, 0) / 3);
  for (let n = 0; n < 25; n++) {
    const pts = byU.slice(6 * n, 6 * n + 6).flatMap((t) => t.p).map(inVault);
    close(Math.max(...pts.map((p) => p.u)) - Math.min(...pts.map((p) => p.u)), 0.2, 1e-6, `purlin ${n}: 0.2 m wide`);
    close(Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)), 0.16, 1e-6, `purlin ${n}: 0.16 m deep`);
  }
  // all of the vault's ironwork is the rib material: the extension's plate girders beyond the gable are the roof panels' (metal)
  assert.equal(triangles(parts.rib as Batch).filter((t) => t.p.some((p) => inVault(p).v > barlow.barlowLength + 1e-6)).length, 0, 'no rib ironwork beyond the gable');
});

test('Barlow shed [hist-d]: pale boarding 8 cm under each slate strip, parallel to it, facing out so that it shows from inside only', () => {
  const parts = barlowGeometry(barlow);
  const slate = triangles(parts.slate as Batch);
  const lining = triangles(parts.lining as Batch);
  assert.equal(lining.length, slate.length, 'a strip of boarding to every strip of slate');
  assert.equal((createMaterials().table.lining as THREE.MeshLambertMaterial).side, THREE.BackSide, 'seen from inside only');
  for (const t of lining) {
    const n = unit(geoNormal(t));
    const s = slate.find((q) => dot(n, unit(geoNormal(q))) > 1 - 1e-4); // the foot of the boarding is held to the platform, a tenth of a degree off the strip
    assert.ok(s, 'a slate strip faces the same way');
    for (const p of t.p) if (p[1] > 0.5) close(dot(unit(geoNormal(s)), [s.p[0][0] - p[0], s.p[0][1] - p[1], s.p[0][2] - p[2]]), 0.08, 1e-6, 'under the slate');
  }
  close(Math.max(...lining.flatMap((t) => t.uv.map((q) => q[1]))), barlow.barlowLength, 1e-6, 'the boards run the length of the shed, to the gable');
});

test('Barlow end screen [hist-d2]: the gable is glazed from the foot of the transition roof up to the arch, in panes about 3.6 m', () => {
  const parts = barlowGeometry(barlow);
  const screen = triangles(parts.roofGlass as Batch).filter((t) => t.p.every((p) => Math.abs(inVault(p).v - barlow.barlowLength) < 1e-6));
  assert.ok(screen.length >= 15, 'a screen');
  const pts = screen.flatMap((t) => t.p).map(inVault);
  close(Math.min(...pts.map((p) => p.y)), FIGURES.barlow.screenFoot, 1e-9, 'it starts where the transition roof meets it');
  close(Math.max(...pts.map((p) => p.y)), FIGURES.barlow.rise, 1e-3, 'and reaches the crown');
  assert.ok(pts.every((p) => underSkin(p.u, p.y) < 1e-6 || p.y <= FIGURES.barlow.screenFoot + 1e-9), 'every corner is on the arch, or on the foot');
  // its area is the arch's above the foot (a 24-sided arch is a hair inside the curve)
  let want = 0;
  for (let u = 0.005; u < barlow.span; u += 0.01) want += Math.max(0, barlowHeight(u - barlow.span / 2) - FIGURES.barlow.screenFoot) * 0.01;
  close(screen.reduce((s, t) => s + worldArea(t), 0) / want, 1, 0.01, 'it fills the arch above its foot');
  // the shared pane is 0.9 x 1.8 m: stretched four times across and twice up, it is 3.6 m square
  const tile = TEXTURES.shedGlass.tile;
  close(tile[0] * 4, 3.6, 1e-9, 'panes 3.6 m across');
  close(tile[1] * 2, 3.6, 1e-9, 'and 3.6 m high');
  for (const t of screen) t.p.forEach((p, i) => {
    close((t.uv[i] as [number, number])[0], inVault(p).u / 4, 1e-6, 'u is across the gable, a quarter metre to the metre');
    close((t.uv[i] as [number, number])[1], p[1] / 2, 1e-6, 'v is up it, half a metre to the metre');
  });
});

test('Barlow end screen [hist-d2]: a grid of 0.3 m iron bars stands inside the glass, a mullion at the middle and every 3.6 m either side up to the arch, and a transom at every pane\'s height', () => {
  const parts = barlowGeometry(barlow);
  const L = barlow.barlowLength;
  const F = FIGURES.barlow;
  const mid = margin + barlow.span / 2;
  const skinY = (u: number): number => {
    for (let k = 0; k + 1 < skin.length; k++) {
      const a = skin[k] as { u: number; y: number };
      const b = skin[k + 1] as { u: number; y: number };
      if (u >= a.u && u <= b.u) return a.y + ((u - a.u) / (b.u - a.u)) * (b.y - a.y);
    }
    return -Infinity;
  };
  const grid = triangles(parts.rib as Batch).filter((t) => t.p.every((p) => Math.abs(inVault(p).v - (L - 0.15)) < 0.05 + 1e-6));
  // a ribbon of two triangles to a face, a face each side of the bar's plane, 0.1 m apart, the nearer 0.1 m inside the glass
  assert.ok(grid.length > 0 && grid.length % 4 === 0, `${grid.length} triangles, four to a bar`);
  assert.deepEqual([...new Set(grid.flatMap((t) => t.p.map((p) => inVault(p).v.toFixed(6))))].sort(), [(L - 0.2).toFixed(6), (L - 0.1).toFixed(6)], 'faces 0.2 and 0.1 m inside the glass');
  const box = (t: Tri): { u0: number; u1: number; y0: number; y1: number } => {
    const q = t.p.map(inVault);
    return { u0: Math.min(...q.map((p) => p.u)), u1: Math.max(...q.map((p) => p.u)), y0: Math.min(...q.map((p) => p.y)), y1: Math.max(...q.map((p) => p.y)) };
  };
  const upright = grid.filter((t) => { const b = box(t); return b.y1 - b.y0 > 2 && b.u1 - b.u0 < 0.4; });
  const across = grid.filter((t) => { const b = box(t); return b.u1 - b.u0 > 3 && b.y1 - b.y0 < 0.4; });
  assert.equal(upright.length + across.length, grid.length, 'every bar is a mullion or a transom');
  // every corner is inside the arch's outline and above the screen's foot
  for (const t of grid) for (const p of t.p.map(inVault)) assert.ok(p.y <= skinY(p.u) + 1e-9 && p.y >= F.screenFoot - 1e-9, `a corner at (${p.u.toFixed(2)}, ${p.y.toFixed(2)}) is inside the glass`);
  // the mullions: a pane (3.6 m) apart about the middle, each from the foot up to 0.1 m under the arch, where the arch stands over a metre above the foot
  const mullions = [...new Set(upright.map((t) => { const b = box(t); return ((b.u0 + b.u1) / 2).toFixed(6); }))].map(Number).sort((a, b) => a - b);
  const want: number[] = [];
  for (let j = -9; j <= 9; j++) if (Math.min(skinY(mid + 3.6 * j - 0.15), skinY(mid + 3.6 * j + 0.15)) - 0.1 > F.screenFoot + 1) want.push(mid + 3.6 * j);
  assert.equal(mullions.length, want.length, `${mullions.length} mullions`);
  assert.ok(mullions.length >= 15, 'across most of the screen');
  mullions.forEach((u, i) => {
    close(u, want[i] as number, 1e-6, `mullion ${i}: a pane from the next`);
    const mine = upright.filter((t) => Math.abs((box(t).u0 + box(t).u1) / 2 - u) < 1e-6);
    assert.equal(mine.length, 4, `mullion ${i}: four triangles`);
    close(Math.min(...mine.map((t) => box(t).y0)), F.screenFoot, 1e-9, `mullion ${i}: from the screen's foot`);
    close(Math.max(...mine.map((t) => box(t).y1)), Math.min(skinY(u - 0.15), skinY(u + 0.15)) - 0.1, 1e-6, `mullion ${i}: to 0.1 m under the arch`);
  });
  // the transoms: one at every pane's height above the foot, each running across the arch
  const heights = [...new Set(across.map((t) => ((box(t).y0 + box(t).y1) / 2).toFixed(6)))].map(Number).sort((a, b) => a - b);
  assert.deepEqual(heights.map((y) => +y.toFixed(6)), [15.6, 19.2, 22.8, 26.4].map((d, i) => +(F.screenFoot + 3.6 * (i + 1)).toFixed(6)), 'a transom every 3.6 m up from the foot');
  for (const y of heights) assert.equal(across.filter((t) => Math.abs((box(t).y0 + box(t).y1) / 2 - y) < 1e-6).length, 4, `transom at ${y}: four triangles`);
});

test('Barlow extension [NSC-EXT]: no arch past the gable; a 22 m transition of glass pyramids, then seven bays of saw-tooth roof to the outline\'s end', () => {
  const parts = barlowGeometry(barlow);
  const F = FIGURES.barlow;
  const beyond = (t: Tri): boolean => t.p.some((p) => inVault(p).v > barlow.barlowLength + 1e-6);
  const lo = F.screenFoot - F.girder;
  // nothing beyond the gable is arched or high: the extension is subservient to the Barlow shed
  const all = Object.values(parts).flatMap((m) => triangles(m as Batch)).filter(beyond).flatMap((t) => t.p).map(inVault);
  assert.ok(Math.max(...all.map((p) => p.y)) <= Math.max(F.screenFoot + F.pyramid, lo + F.truss) + 1e-9, 'under half the crown');
  assert.ok(Math.min(...all.map((p) => p.y)) > 5, 'on its own height: no glass to the ground as the arch had');
  close(Math.max(...all.map((p) => p.v)), barlow.length, 1e-9, 'to the outline\'s north end');
  assert.ok(all.every((p) => p.u > -1e-9 && p.u < barlow.width + 1e-9), 'wall to wall');
  // the transition: 12 x 4 pyramids of glass, 1.5 m high, over the 22 m behind the gable
  const pyramids = triangles(parts.roofGlass as Batch).filter(beyond);
  assert.equal(pyramids.length, 12 * 4 * 4, 'four faces to each pyramid');
  assert.ok(pyramids.every((t) => t.p.every((p) => inVault(p).v <= barlow.barlowLength + F.transition + 1e-9)), 'they fill the 22 m, no more');
  close(Math.max(...pyramids.flatMap((t) => t.p.map((p) => inVault(p).y))) - F.screenFoot, F.pyramid, 1e-9, 'each rises 1.5 m');
  // the main roof: 14 teeth in 7 bays; each slope climbs a truss depth to the north, wall to wall, and a dark riser drops back to the low edge
  const slopes = triangles(parts.metal as Batch).filter((t) => dot(unit(geoNormal(t)), [0, 1, 0]) > 0.5); // the roof panels, not the girders and fascias standing on edge
  assert.equal(slopes.length, 14 * 2, 'two triangles to a tooth\'s slope');
  const tooth = barlow.bay / F.teeth;
  for (const t of slopes) {
    const ps = t.p.map(inVault);
    assert.ok(Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y)) <= F.truss + 1e-9);
    assert.ok(Math.max(...ps.map((p) => p.v)) - Math.min(...ps.map((p) => p.v)) <= tooth + 1e-9);
  }
  const slopePts = slopes.flatMap((t) => t.p).map(inVault);
  close(Math.min(...slopePts.map((p) => p.y)), lo, 1e-9, 'the low edge is level with the girders\' underside');
  close(Math.max(...slopePts.map((p) => p.y)), lo + F.truss, 1e-9, 'each tooth climbs a 2.6 m truss depth');
  close(Math.min(...slopePts.map((p) => p.v)), barlow.barlowLength + F.transition, 1e-9, 'the roof starts where the transition ends');
  const risers = triangles(parts.pane as Batch).filter(beyond); // the dark recesses of the shed's arcading are pane too, inside the vault
  assert.equal(risers.length, 14 * 2 * 2, 'a riser to each tooth, seen from both sides');
  assert.ok(risers.every((t) => Math.abs(unit(geoNormal(t))[1]) < 1e-9), 'upright');
  const north: V3 = [Math.sin(barlow.heading), 0, -Math.cos(barlow.heading)];
  assert.equal(risers.filter((t) => dot(unit(geoNormal(t)), north) > 0).length, 14 * 2, 'half of them face north, half south');
  const planes = [...new Set(risers.flatMap((t) => t.p.map((p) => inVault(p).v.toFixed(3))))].map(Number).sort((a, b) => a - b);
  assert.equal(planes.length, 14, 'one plane to each tooth');
  planes.forEach((v, i) => close(v, barlow.barlowLength + F.transition + (i + 1) * tooth, 1e-3, `riser ${i} is at the north end of its tooth`));
});

test('Barlow vault: the south wall closes the end', () => {
  const parts = barlowGeometry(barlow);
  const wall = triangles(parts.brickRed as Batch).filter((t) => t.p.every((p) => Math.abs(inVault(p).v - 0.15) < 1e-6)); // not the side walls or the stacks
  assert.equal(wall.length, 24, 'one triangle per arch segment, fanned from the middle of the sill');
  for (const t of wall) for (const p of t.p) close(inVault(p).v, 0.15, 1e-6, 'the wall stands on the south end');
  close(Math.max(...wall.flatMap((t) => t.p.map((p) => inVault(p).y))), FIGURES.barlow.rise, 1e-3, 'wall rises to the crown');
  for (const t of wall) {
    const g = geoNormal(t);
    assert.ok(-g[0] * Math.sin(barlow.heading) + g[2] * Math.cos(barlow.heading) > 0, 'the wall faces south, out of the shed');
  }
});

test('Barlow shed [hist-d2, hist-e]: the springing strip of the arch on each side is red brick, the length of the shed, on the ground, drawn facing out and facing in, and the slate begins where it ends', () => {
  const parts = barlowGeometry(barlow);
  const walls = sideWalls(parts);
  assert.equal(walls.length, 8, 'two strips, a quad each, drawn both ways');
  const knee = (skin[1] as { y: number }).y;
  close(Math.min(...walls.flatMap((t) => t.p.map((p) => inVault(p).y))), 0, 1e-9, 'on the ground');
  close(Math.max(...walls.flatMap((t) => t.p.map((p) => inVault(p).y))), knee, 1e-9, 'up to the first node of the arch');
  close(Math.min(...triangles(parts.slate as Batch).flatMap((t) => t.p.map((p) => inVault(p).y))), knee, 1e-9, 'where the slate begins');
  const across: V3 = [Math.cos(barlow.heading), 0, Math.sin(barlow.heading)]; // the shed's +u (east) in the world
  const key = (t: Tri): string => JSON.stringify(t.p.map((p) => p.map((x) => x.toFixed(6))).sort());
  for (const side of [-1, 1]) {
    const mine = walls.filter((t) => Math.sign(inVault(t.p[0]).u - barlow.width / 2) === side);
    const out = mine.filter((t) => dot(unit(geoNormal(t)), across) * side > 0);
    const inward = mine.filter((t) => dot(unit(geoNormal(t)), across) * side < 0);
    assert.equal(out.length, 2, `${side < 0 ? 'west' : 'east'}: a quad facing out`);
    assert.equal(inward.length, 2, 'and the same quad facing in');
    assert.deepEqual(inward.map(key).sort(), out.map(key).sort(), 'on the same corners, so the wall shows from inside and out');
  }
});

test('Barlow shed [hist-d2]: Gothic arcading on both brick side walls, between the ribs: two pointed arches to a bay, a stone surround round a dark recess, standing 0.03 and 0.06 m inside the wall and facing in', () => {
  const parts = barlowGeometry(barlow);
  const [first, last] = [barlow.ribs[0] as number, barlow.ribs[barlow.ribs.length - 1] as number];
  const bays = barlow.ribs.length - 1;
  assert.equal(bays, 23);
  for (const [key, w, h, base, d] of [['stone', 3.3, 6.1, 0.85, 0.03], ['pane', 2.6, 5.6, 1.2, 0.06]] as const) {
    // the vault's own triangles low on the walls between the first and last rib (the stacks' stone is at the eaves, the extension's risers beyond the gable)
    const all = triangles(parts[key] as Batch).filter((t) => t.p.every((p) => inVault(p).y < 8 && inVault(p).v > first - 1e-6 && inVault(p).v < last + 1e-6));
    assert.equal(all.length, 2 * bays * 2 * 7, `${key}: two walls, two arches to each of ${bays} bays, a fan of seven triangles`);
    for (const side of [-1, 1]) {
      const [a, b] = (side < 0 ? [skin[0], skin[1]] : [skin[23], skin[24]]) as [{ u: number; y: number }, { u: number; y: number }];
      const [lo, hi] = side < 0 ? [a, b] : [b, a]; // from the foot up the wall
      const l = Math.hypot(b.u - a.u, b.y - a.y);
      const n: [number, number] = [-(b.y - a.y) / l, (b.u - a.u) / l]; // the wall's outward normal in the section
      const up: [number, number] = [(hi.u - lo.u) / l, (hi.y - lo.y) / l];
      const mine = all.filter((t) => Math.sign(inVault(t.p[0]).u - barlow.width / 2) === side);
      assert.equal(mine.length, bays * 2 * 7, `${key}, ${side < 0 ? 'west' : 'east'} wall: two arches to each bay`);
      for (let g = 0; g < bays * 2; g++) {
        const fan = mine.slice(g * 7, g * 7 + 7);
        const pts = fan.flatMap((t) => t.p).map(inVault);
        const bay = Math.floor(g / 2);
        const [r0, r1, f] = [barlow.ribs[bay] as number, barlow.ribs[bay + 1] as number, g % 2 ? 0.73 : 0.27];
        const vs = pts.map((p) => p.v);
        close((Math.min(...vs) + Math.max(...vs)) / 2, r0 * (1 - f) + r1 * f, 1e-6, `${key} arch ${g}: ${f} of the way across bay ${bay + 1}`);
        close(Math.max(...vs) - Math.min(...vs), w, 1e-6, `${key} arch ${g}: ${w} m wide`);
        assert.ok(Math.min(...vs) > r0 + 0.2 && Math.max(...vs) < r1 - 0.2, `${key} arch ${g}: clear of the ribs either side`);
        const s = pts.map((p) => (p.u - lo.u) * up[0] + (p.y - lo.y) * up[1]);
        close(Math.min(...s), base, 1e-6, `${key} arch ${g}: its foot ${base} m up the wall`);
        close(Math.max(...s), base + h, 1e-6, `${key} arch ${g}: ${h} m tall`);
        for (const p of pts) close(-((p.u - lo.u) * n[0] + (p.y - lo.y) * n[1]), d, 1e-6, `${key} arch ${g}: ${d} m inside the wall`);
        for (const t of fan) {
          const c: V3 = [0, 1, 2].map((k) => (t.p[0][k] + t.p[1][k] + t.p[2][k]) / 3) as V3;
          const g3 = unit(geoNormal(t));
          const here = inVault(c);
          const ahead = inVault([c[0] + g3[0], c[1] + g3[1], c[2] + g3[2]]);
          assert.ok((ahead.u - here.u) * -side > 0.5, `${key} arch ${g}: faces into the shed`);
        }
      }
    }
  }
});

test('Barlow shed [hist-e]: a row of tall brick stacks along the top of the Pancras Road (east) wall, one every 14 m, each 3.6 m tall from a foot 0.5 m under the eaves and wholly outside the shell', () => {
  const parts = barlowGeometry(barlow);
  // the east half of the arch, from its foot up to the crown: where the wall's outer face stands at each height
  const wallU = (y: number): number => {
    for (let k = skin.length - 1; k > 0; k--) {
      const [a, b] = [skin[k], skin[k - 1]] as { u: number; y: number }[] as [{ u: number; y: number }, { u: number; y: number }];
      if (y >= a.y - 1e-9 && y <= b.y + 1e-9) return a.u + ((y - a.y) / (b.y - a.y)) * (b.u - a.u);
    }
    return NaN;
  };
  const span = (t: Tri): number => Math.max(...t.p.map((p) => inVault(p).v)) - Math.min(...t.p.map((p) => inVault(p).v));
  const stacks = triangles(parts.brickRed as Batch).filter((t) => span(t) < 5 && inVault(t.p[0]).v > 1); // not the south wall (v = 0.15) and not the side walls
  const n = Math.round(barlow.barlowLength / 14);
  assert.equal(stacks.length, n * 20, `${n} stacks, a shaft and a pot of 20 triangles each`);
  const eave = skin[skin.length - 2] as { u: number; y: number };
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  for (let k = 0; k < n; k++) {
    const shaft = stacks.slice(k * 20, k * 20 + 10).flatMap((t) => t.p).map(inVault);
    close(mean(shaft.map((p) => p.v)), ((k + 0.5) * barlow.barlowLength) / n, 1e-6, `stack ${k} is evenly spaced along the shed`);
    close(mean(shaft.map((p) => p.u)), eave.u + 0.7, 1e-6, `stack ${k} stands on the east wall`);
    close(Math.min(...shaft.map((p) => p.y)), eave.y - 0.5, 1e-9, 'its foot is 0.5 m under the eaves');
    close(Math.max(...shaft.map((p) => p.y)) - Math.min(...shaft.map((p) => p.y)), 3.6, 1e-9, 'a shaft 3.6 m tall');
    close(Math.max(...shaft.map((p) => p.v)) - Math.min(...shaft.map((p) => p.v)), 1.4, 1e-6, '1.4 m along the wall');
    close(Math.max(...shaft.map((p) => p.u)) - Math.min(...shaft.map((p) => p.u)), 0.95, 1e-6, 'and 0.95 m across it');
  }
  // nothing of a stack, its stone corbel and cap included, is inside the shell: from the vault the wall shows whole
  // (the stone of the arcading on the walls below is inside the vault on purpose: a stack's stone is up at the eaves)
  const all = [...stacks, ...triangles(parts.stone as Batch).filter((t) => t.p.every((p) => inVault(p).y > 8))].flatMap((t) => t.p).map(inVault);
  assert.ok(all.length >= n * 60, `${all.length} stack vertices`);
  for (const p of all) assert.ok(p.u >= wallU(p.y) - 1e-6, `a stack vertex at height ${p.y.toFixed(2)} is ${(wallU(p.y) - p.u).toFixed(3)} m inside the shell`);
});

// ---- assembly ----------------------------------------------------------------------------------

test('materials: the tinted looks (terracotta and buff brick, cream dressings, lighter slate, the shed\'s silver glass and pale blue-grey ribs, the extension\'s roof panels, the clock face) are this set\'s own clones, the rest is the library\'s, and nothing shared is changed', () => {
  const hex = (name: Parameters<typeof material>[0]): number[] => {
    const m = material(name) as THREE.MeshLambertMaterial;
    return [m.color.getHex(), m.emissive.getHex()];
  };
  const before = Object.fromEntries((['brick', 'brickRed', 'stone', 'slateBothSides', 'shedGlass', 'ribPaint'] as const).map((n) => [n, hex(n)]));
  const set = createMaterials();
  const lambert = (k: keyof typeof set.table): THREE.MeshLambertMaterial => set.table[k] as THREE.MeshLambertMaterial;
  const shared = (n: Parameters<typeof material>[0]): THREE.MeshLambertMaterial => material(n) as THREE.MeshLambertMaterial;
  // the dressings and the two bricks keep the library's texture and differ from its colour
  const cream = lambert('stone');
  assert.notEqual(cream, shared('stone'), 'the dressings are their own: creamier and paler than the library\'s grey ashlar [hist-a, hist-b]');
  assert.equal(cream.map, shared('stone').map, 'on the same coursed-stone texture');
  assert.ok(cream.color.r > shared('stone').color.r && cream.color.g > shared('stone').color.g && cream.color.b > shared('stone').color.b && cream.color.r > cream.color.b, 'paler, and warm');
  const red = lambert('brickRed');
  assert.notEqual(red, shared('brickRed'), 'the Midland Grand\'s brick is its own: a lighter terracotta than the library\'s crimson [hist-b]');
  assert.equal(red.map, shared('brickRed').map, 'on the same stock-brick texture');
  assert.ok(red.color.g > shared('brickRed').color.g * 2 && red.color.b > shared('brickRed').color.b * 2 && red.color.r >= shared('brickRed').color.r, 'lighter, and less saturated');
  assert.ok(red.color.r > red.color.g && red.color.r > red.color.b, 'a red tint on the stock brick');
  const buff = lambert('brick');
  assert.notEqual(buff, shared('brick'), 'the hotel\'s brick is its own: a lighter, golden buff [hist-a]');
  assert.equal(buff.map, shared('brick').map, 'on the same stock-brick texture');
  assert.ok(buff.color.r > shared('brick').color.r && buff.color.g > shared('brick').color.g && buff.color.b > shared('brick').color.b, 'lighter than the library\'s');
  assert.ok(buff.color.r > buff.color.g && buff.color.g > buff.color.b && buff.color.g / buff.color.r > 0.9, 'warm, and golden rather than red');
  assert.notEqual(lambert('brick'), lambert('brickRed'));
  // the shed [hist-d]: silver-grey glazing that is not blue, and pale blue-grey steel ribs
  const glass = lambert('roofGlass');
  assert.notEqual(glass, shared('shedGlass'));
  assert.equal(glass.map, shared('shedGlass').map, 'on the same astragal-barred texture');
  assert.equal(glass.emissiveMap, shared('shedGlass').emissiveMap);
  assert.ok(glass.transparent && glass.side === THREE.DoubleSide && glass.depthWrite === false, 'still see-through from either side, and never hiding what is behind it');
  // the glow is the emissive colour times the pane texture, whose average colour the library records: neutral here, blue in the library's
  const average = new THREE.Color(TEXTURES.shedGlass.average);
  const glow = (m: THREE.MeshLambertMaterial): number[] => [m.emissive.r * average.r, m.emissive.g * average.g, m.emissive.b * average.b];
  const spread = (v: number[]): number => Math.max(...v) / Math.min(...v);
  assert.ok(spread(glow(shared('shedGlass'))) > 2, 'the library\'s glass glows blue (the test\'s yardstick)');
  assert.ok(spread(glow(glass)) < 1.2, 'its glow is neutral: silver, not sky');
  assert.ok(Math.min(...glow(glass)) > Math.max(...glow(shared('shedGlass'))) * 0.9, 'and bright: no dimmer than the library\'s brightest channel');
  assert.ok(glass.color.b <= glass.color.r, 'no bluer than it is red: silver, not sky');
  const iron = lambert('rib');
  const luminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  assert.notEqual(iron, shared('ribPaint'));
  assert.equal(iron.map, shared('ribPaint').map);
  assert.ok(iron.color.b > iron.color.r, 'blue-grey steel, bluer than it is red [hist-d]');
  assert.ok(luminance(iron.color) > 0.5 && luminance(iron.color) < luminance(shared('ribPaint').color), 'pale (hist-d2 shows the ribs dark only in shadow), a shade under the library\'s white paint');
  assert.ok(luminance(iron.emissive) > 0 && luminance(iron.emissive) < luminance(shared('ribPaint').emissive), 'with less of the library\'s glow, so it keeps its form in the sun');
  // the slate [hist-a, hist-b]: lighter than the library's dark grey, a clone of its two-sided one (the shed's slate is seen from inside too)
  const slate = lambert('slate');
  assert.notEqual(slate, shared('slateBothSides'), 'the slate is its own');
  assert.notEqual(slate, material('slate'), 'not the shared one-sided slate');
  assert.equal(slate.map, shared('slateBothSides').map, 'on the same slate texture');
  assert.ok(slate.color.r > shared('slateBothSides').color.r && slate.color.g > shared('slateBothSides').color.g && slate.color.b > shared('slateBothSides').color.b, 'lighter than the library\'s');
  assert.ok(slate.color.b / slate.color.r < shared('slateBothSides').color.b / shared('slateBothSides').color.r, 'and less blue: hist-b\'s slate is grey with a hint of green, not blue');
  assert.equal(slate.side, THREE.DoubleSide);
  assert.equal((material('slate') as THREE.MeshLambertMaterial).side, THREE.FrontSide, 'the shared one is untouched');
  for (const n of ['brick', 'brickRed', 'stone', 'slateBothSides', 'shedGlass', 'ribPaint'] as const) assert.deepEqual(hex(n), before[n], `the shared ${n} keeps its colours`);
  // the rest is the library's own
  assert.equal(set.table.lining, material('lining'));
  assert.equal(set.table.sash, material('sash'));
  assert.equal(set.table.sashArch, material('sashArch'));
  assert.equal(set.table.pane, material('pane'));
  for (const key of ['sash', 'sashArch', 'pane'] as const) assert.equal((set.table[key] as THREE.MeshLambertMaterial).polygonOffset, true, `${key} is pulled toward the camera`);
  assert.equal((material('window') as THREE.MeshLambertMaterial).polygonOffset, false, 'the plain window is not');
  assert.deepEqual(set.owned, [set.table.clock, set.table.metal, set.table.brickRed, set.table.stone, set.table.brick, set.table.roofGlass, set.table.rib, set.table.slate], 'the clock face, the roof panels, the two bricks, the dressings, the glass, the ribs and the slate are all this set makes (no document here, so no texture)');
  for (const key of ['sash', 'sashArch', 'pane', 'lining'] as const) assert.ok(!set.owned.includes(set.table[key]), `we never dispose the shared ${key}`);
});

test('addLandmarks: one mesh per material, a modest triangle budget, the replaced OSM ids, and a clean dispose', () => {
  const scene = new THREE.Scene();
  const lm = addLandmarks(scene, data);
  assert.equal(lm.group.parent, scene);
  assert.ok(lm.group.children.length <= 10 + 6, `${lm.group.children.length} draw calls: the 10 of the first build, and the 6 the fidelity rubric allows`);
  // measured baseline + the rubric's cap: the landmarks drew 18,836 triangles at the start of the graphical-fidelity rounds (commit 42a27702, 10 meshes), and the
  // midland-grand-front view may grow by 60,000. That view's cap is not a landmarks allowance, but the view holds all three landmarks, so the landmarks alone can not pass it.
  assert.ok(lm.stats.triangles > 5000 && lm.stats.triangles < 18836 + 60000, `${lm.stats.triangles} triangles`);
  assert.equal(lm.stats.meshes, lm.group.children.length);
  assert.deepEqual([...lm.excludeIds].sort(), [OSM_IDS.greatNorthernHotel, OSM_IDS.midlandGrandHotel, OSM_IDS.stPancrasStation].sort());
  assert.deepEqual([...LANDMARK_OSM_IDS], [...REPLACED_BUILDING_IDS]);
  const meshes = lm.group.children as THREE.Mesh[];
  const glass = meshes.find((m) => m.name.endsWith('roofGlass'));
  assert.ok(glass && glass.renderOrder > 0, 'translucent glazing draws after the opaque meshes');
  let disposed = 0;
  for (const m of meshes) m.geometry.addEventListener('dispose', () => disposed++);
  lm.dispose();
  assert.equal(lm.group.parent, null, 'removed from the scene');
  assert.equal(disposed, meshes.length, 'every geometry freed');
});

test('the replaced OSM boxes: nothing else stands inside the Barlow vault once they are left out', () => {
  const frame = { origin: barlow.origin, heading: barlow.heading };
  const rest = data.buildings.filter((b) => !LANDMARK_OSM_IDS.includes(b.id));
  for (const b of rest) {
    const c: Pt = [b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length, b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length];
    const { u, v } = worldToShed(frame, c);
    assert.ok(!(u > 0 && u < barlow.width && v > 0 && v < barlow.length), `building ${b.id} would stand inside the vault`);
  }
});
