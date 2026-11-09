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
import { addBand, addLandmarks, addTwin, addWalls, barlowGeometry, createMaterials, headArc, hotelGeometry, LANDMARK_OSM_IDS, midlandGeometry, pointInQuad, segmentsOutside, towerSquare, towerStages, windowOutline } from '../src/landmarks.ts';
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

// ---- the Great Northern Hotel ------------------------------------------------------------------

test('Great Northern Hotel: facade windows keep their counts and assumed attic dormers add one sash per bay', () => {
  const parts = hotelGeometry(hotel);
  const bays = hotel.faces.reduce((s, f) => s + f.bays.length, 0);
  assert.equal(bays, 50);
  assert.equal(triangles(parts.sashArch as Batch).length, 2 * bays);
  // 4 upper storeys per bay; the sixth and thirteenth bays of the main front are tripartite: two more lights per storey
  const sashes = triangles(parts.sash as Batch);
  assert.equal(sashes.filter(t => t.p.every(v => v[1] <= hotel.eaves)).length, 2 * (4 * bays + 2 * 2 * 4));
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
  const spring = 0.75 + TEXTURES.windowArch.tile[1] - TEXTURES.windowArch.tile[0] / 2;
  const crown = 0.75 + TEXTURES.windowArch.tile[1];
  const impost = stone.filter((t) => t.p.some((v) => Math.abs(v[1] - spring) <= 0.081));
  const keystone = stone.filter((t) => t.p.every((v) => v[1] >= crown - 0.126 && v[1] <= crown + 0.326));
  assert.equal(impost.length, 30, 'five unbroken facade segments, each with the three faces of one moulded band');
  assert.equal(keystone.length, 12, 'one six-sided stone block over the arch');
  const depths = keystone.flatMap((t) => t.p.map((v) => (v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1]));
  assert.ok(Math.min(...depths) > 0.08, 'the keystone clears the sash plane, so their faces do not z-fight');
  for (const t of impost) for (const v of t.p) {
    const along = (v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1];
    const depth = (v[0] - bay.at[0]) * bay.normal[0] + (v[2] - bay.at[1]) * bay.normal[1];
    assert.ok(depth < -1e-6 || depth > 0.3 || Math.abs(along) >= TEXTURES.windowArch.tile[0] / 2 - 1e-6, 'the impost does not overlap the pane');
  }
});

test('Great Northern Hotel: every real ground arch gets one keystone and the impost stays below the cornice', () => {
  const parts = hotelGeometry(hotel);
  const bays = hotel.faces.reduce((n, f) => n + f.bays.length, 0);
  const stone = triangles(parts.stone as Batch);
  const crown = 0.75 + TEXTURES.windowArch.tile[1];
  const keystones = stone.filter((t) => t.p.every((v) => v[1] >= crown - 0.126 && v[1] <= crown + 0.326));
  const spring = 0.75 + TEXTURES.windowArch.tile[1] - TEXTURES.windowArch.tile[0] / 2;
  const impost = stone.filter((t) => t.p.some((v) => Math.abs(v[1] - spring) <= 0.081));
  assert.equal(keystones.length, bays * 12);
  assert.ok(impost.length > bays * 6, `${impost.length} impost triangles run around the facade between the arches`);
  assert.ok(Math.max(...[...keystones, ...impost].flatMap((t) => t.p.map((v) => v[1]))) < hotel.eaves - 0.6, 'the details clear the upper facade and roof');
  assert.equal(Object.keys(parts).length, 5, 'the details stay in the existing five material batches');
});

test('Great Northern Hotel: every window stands on a wall, a hand\'s breadth proud, and faces out', () => {
  const parts = hotelGeometry(hotel);
  const edges = polygonEdges(hotel.outline);
  const distance = (p: Pt): number => Math.min(...edges.map((e) => {
    const t = Math.max(0, Math.min(e.length, (p[0] - e.a[0]) * e.dir[0] + (p[1] - e.a[1]) * e.dir[1]));
    return Math.hypot(p[0] - (e.a[0] + e.dir[0] * t), p[1] - (e.a[1] + e.dir[1] * t));
  }));
  for (const key of ['sash', 'sashArch'] as const) {
    const windows = triangles(parts[key] as Batch).filter(t => key === 'sash' ? t.p.every(v => v[1] <= hotel.eaves) : true);
    for (const t of windows) {
      for (const v of t.p) {
        assert.equal(pointInPolygon([v[0], v[2]], hotel.outline), false, `${key} vertex outside the walls`);
        assert.ok(distance([v[0], v[2]]) < 0.2, `${key} vertex ${distance([v[0], v[2]])} m off the wall`);
      }
      const g = geoNormal(t);
      assert.ok(Math.abs(g[1]) < 1e-9, 'windows are vertical');
    }
  }
});

test('Great Northern Hotel: walls rise to the eaves, the roof to the ridge, and no window is hidden by the cornice', () => {
  const parts = hotelGeometry(hotel);
  close(Math.max(...triangles(parts.brick as Batch).flatMap((t) => t.p.map((v) => v[1]))), hotel.eaves, 1e-9, 'brick to the eaves');
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

test('Midland Grand: the clock tower reaches 82 m (the graphical-fidelity rubric: 82 +/- 4; sources give 76 to 85), the entrance tower its assumed height, and nothing is taller', () => {
  const ys = allVertices(midlandGeometry(midland)).map((v) => v[1]);
  close(Math.max(...ys), 82, 1e-6, 'tallest point');
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
function dormerTriangles(plan = midland): Partial<Record<Key, Tri[]>> {
  const plain = midlandGeometry({ ...plan, front: { ...plan.front, bays: [] }, wing: { ...plan.wing, bays: [] } });
  const full = midlandGeometry(plan), result: Partial<Record<Key, Tri[]>> = {};
  const signature = (t: Tri): string => JSON.stringify(t.p);
  for (const key of ['stone', 'slate', 'pane'] as const) {
    const old = new Set(triangles(plain[key] as Batch).map(signature));
    result[key] = triangles(full[key] as Batch).filter(t => t.p.every(v => v[1] > plan.eaves) && !old.has(signature(t)));
  }
  return result;
}

test('Midland Grand: two stacked gabled attic rows light the front and curved wing [HE 1342037]', () => {
  const additions = dormerTriangles({ ...midland, towers: [] });
  const glass = additions.pane!;
  assert.ok(glass.length > 40, 'the attic has real glazed dormer faces, not unbroken slate');
  for (const face of [midland.front, midland.wing]) {
    for (const bay of face.bays) {
      const near = glass.filter(t => t.p.every(v => Math.abs((v[0] - bay.at[0]) * bay.dir[0] + (v[2] - bay.at[1]) * bay.dir[1]) < bay.width / 2));
      assert.ok(near.some(t => t.p.every(v => v[1] < (midland.eaves + midland.ridge) / 2)), 'lower dormer row follows each bay');
      assert.ok(near.some(t => t.p.every(v => v[1] > (midland.eaves + midland.ridge) / 2)), 'upper dormer stacks above it');
    }
  }
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

test('Midland Grand: chimney stacks stand in pairs wholly on the crown, rise above the ridge, and keep clear of both towers and of the dormers', () => {
  // the red brick standing on the crown, apart from the towers' own envelopes (the clock stage reaches 0.5 m out of the shaft)
  const stacksOf = (plan: typeof midland): Tri[] => triangles(midlandGeometry(plan).brickRed as Batch).filter((t) => t.p.every((v) => v[1] >= plan.ridge - 0.3 - 1e-6 && !plan.towers.some((tw) => pointInQuad([v[0], v[2]], towerSquare(tw, 0.6)))));
  const near = (v: V3, grow: number, plan = midland): boolean => plan.towers.some((tw) => pointInQuad([v[0], v[2]], towerSquare(tw, grow)));
  const stacks = stacksOf(midland);
  assert.ok(stacks.length >= 8 * 20 && stacks.length % 20 === 0, `${stacks.length} stack triangles (a shaft and a pot of 20 to a stack)`);
  const count = stacks.length / 20;
  assert.ok(count >= 8 && count % 2 === 0, `${count} stacks, in pairs`);
  // a tower standing on the crown clears the stacks beside it: set the clock tower down with its wall a metre from a stack, and that pair goes
  // (the stacks within 1.6 m of a tower are left out), the rest staying in pairs
  const foot = (stacks.flatMap((t) => t.p).find((v) => Math.abs(v[1] - (midland.ridge - 0.3)) < 1e-9) as V3);
  const clock = midland.towers.find((tw) => tw.name === 'clock') as (typeof midland.towers)[number];
  const side = clock.side / 2 + 1.0;
  const moved = { ...midland, towers: midland.towers.map((tw) => (tw === clock ? { ...tw, centre: [foot[0] + clock.out[0] * side, foot[2] + clock.out[1] * side] as Pt } : tw)) };
  const left = stacksOf(moved);
  assert.ok(left.length % 40 === 0 && left.length > 0, `${left.length / 20} stacks left, in pairs`);
  assert.equal(left.some((t) => t.p.some((v) => Math.hypot(v[0] - foot[0], v[2] - foot[2]) < 1e-6)), false, 'the stack beside the tower has gone');
  for (const t of left) for (const v of t.p) assert.equal(near(v, 1.4, moved), false, 'a stack within 1.4 m of the moved tower');
  const ys = stacks.flatMap((t) => t.p.map((v) => v[1]));
  close(Math.min(...ys), midland.ridge - 0.3, 1e-9, 'they stand on the crown, a little below its ridge');
  assert.ok(Math.max(...ys) > midland.ridge + 3.5, 'and rise clear above it');
  for (const t of stacks) for (const v of t.p) {
    assert.ok(pointInPolygon([v[0], v[2]], midland.roof.ring), `a stack corner at ${v[0].toFixed(1)}, ${v[2].toFixed(1)} is off the crown`);
    assert.equal(near(v, 1.4), false, 'a stack is within 0.8 m of a tower');
  }
  // the dormers keep to the slopes: nothing of theirs stands where a stack does
  const dormers = dormerTriangles();
  for (const t of [...(dormers.slate as Tri[]), ...(dormers.stone as Tri[])]) for (const v of t.p) assert.equal(stacks.some((s) => s.p.some((w) => Math.hypot(w[0] - v[0], w[2] - v[2]) < 0.5)), false, 'a dormer corner within half a metre of a stack');
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
  for (const H of [56, 82]) {
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

test('Midland Grand: the clock tower has a belfry of paired arches on every face, a portal at its foot, four equal turrets at the corners of the clock stage below the roof\'s top, and one needle at 82 m', () => {
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
  // and nothing above the wall head but the roof, the lantern, the turrets and the gables stands out beyond the lantern's width
  for (const p of all) if (p.y > st.roof + 1e-6) assert.ok(Math.abs(p.a) < 1.6 && Math.abs(p.o) < 1.6, `a vertex at ${p.y} above the roof's top is off the lantern`);
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

test('Barlow vault [WP-STP]: 100 ft at the crown, on the ground at the springings, inside the 245 ft 6 in walls', () => {
  const parts = barlowGeometry(barlow);
  const slate = triangles(parts.slate as Batch).flatMap((t) => t.p).map(inVault);
  const roof = [...slate, ...triangles(parts.roofGlass as Batch).flatMap((t) => t.p).map(inVault)];
  close(Math.max(...roof.map((p) => p.y)), FIGURES.barlow.rise, 1e-3, 'crown');
  close(Math.min(...slate.map((p) => p.y)), 0, 1e-9, 'springings');
  close(Math.min(...slate.map((p) => p.u)), margin, 1e-6, 'west springing');
  close(Math.max(...slate.map((p) => p.u)), margin + barlow.span, 1e-6, 'east springing (73.15 m apart)');
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
  const total = Math.max(...slate.flatMap((t) => t.uv.map((q) => q[1])));
  close((glassTo - glassFrom) / total, FIGURES.barlow.glassFraction, 0.05, 'fraction of the arch that is glass');
  close(glassFrom / total, 0.25, 0.05, 'the west quarter is slate');
  close(Math.max(...slate.flatMap((t) => t.p.map((p) => inVault(p).v))), barlow.barlowLength, 1e-6, 'slate ends at 689 ft');
  close(Math.max(...glass.flatMap((t) => t.p.map((p) => inVault(p).v))), barlow.barlowLength, 1e-6, 'and so does the glass');
  // UVs are metres, so slate, panes and boards come out true to scale along the whole shed
  for (const t of [...slate, ...glass, ...triangles(parts.lining as Batch)]) close(uvArea(t) / worldArea(t), 1, 0.01, 'texel area equals roof area');
});

test('Barlow ribs [WP-STP, hist-d]: a lattice truss 1.4 m deep at each of the 24 rib positions, springing from the platform, wholly inside the roof', () => {
  const parts = barlowGeometry(barlow);
  assert.equal(barlow.ribs.length, 24);
  // a rib lies in its own 0.3 m slab: the purlins run the whole length and the extension's plates stand beyond the gable, so neither is a rib
  const slab = (t: Tri): number => barlow.ribs.findIndex((r) => t.p.every((p) => Math.abs(inVault(p).v - r) <= 0.15 + 1e-6));
  const ribTris = triangles(parts.rib as Batch).filter((t) => slab(t) >= 0);
  barlow.ribs.forEach((_, i) => {
    const ts = ribTris.filter((t) => slab(t) === i);
    const pts = ts.flatMap((t) => t.p).map(inVault);
    close(Math.min(...pts.map((p) => p.y)), 0, 1e-9, `rib ${i} springs from the platform`);
    close(Math.max(...pts.map((p) => p.y)), barlow.rise - 0.1, 0.01, `rib ${i} reaches the crown`);
    const crown = pts.filter((p) => Math.abs(p.u - barlow.width / 2) < 0.05); // a ribbon is half a chord's width either side of the crown node
    close(Math.min(...crown.map((p) => p.y)), barlow.rise - 1.4, 0.01, `rib ${i} is 1.4 m deep at the crown`);
    assert.ok(Math.min(...pts.map((p) => underSkin(p.u, p.y))) >= 0.05, `rib ${i} stands wholly inside the roof`); // 0.10 under it but for the feet, which are held to the platform
    // two chords, and a lattice that crosses the gap between them: a diagonal and a vertical to each of the 24 segments, each seen from both sides
    const depths = ts.map((t) => t.p.map((p) => underSkin(inVault(p).u, inVault(p).y)));
    const top = depths.filter((d) => Math.max(...d) < 0.45).length;
    const bottom = depths.filter((d) => Math.min(...d) > 0.9).length;
    assert.equal(top, 24 * 3 * 2, `rib ${i}: the top chord, two sides and an underside to a segment`);
    assert.equal(bottom, 24 * 3 * 2, `rib ${i}: the bottom chord`);
    assert.equal(ts.length - top - bottom, 24 * 12 + 4, `rib ${i}: two diagonals and a vertical to a segment, and the closing vertical`);
  });
  // the purlins run the length of the shed, one under each node of the arch
  const purlins = triangles(parts.rib as Batch).filter((t) => Math.max(...t.p.map((p) => inVault(p).v)) - Math.min(...t.p.map((p) => inVault(p).v)) > barlow.barlowLength - 1);
  assert.equal(purlins.length, 25 * 3 * 2, 'a purlin of three faces under each of the 25 nodes');
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
  const slopes = triangles(parts.metal as Batch).filter((t) => dot(unit(geoNormal(t)), [0, 1, 0]) > 0);
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
  const risers = triangles(parts.pane as Batch);
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
  const wall = triangles(parts.brickRed as Batch);
  assert.equal(wall.length, 24, 'one triangle per arch segment, fanned from the middle of the sill');
  for (const t of wall) for (const p of t.p) close(inVault(p).v, 0.15, 1e-6, 'the wall stands on the south end');
  close(Math.max(...wall.flatMap((t) => t.p.map((p) => inVault(p).y))), FIGURES.barlow.rise, 1e-3, 'wall rises to the crown');
  for (const t of wall) {
    const g = geoNormal(t);
    assert.ok(-g[0] * Math.sin(barlow.heading) + g[2] * Math.cos(barlow.heading) > 0, 'the wall faces south, out of the shed');
  }
});

// ---- assembly ----------------------------------------------------------------------------------

test('materials: every look but the clock and the extension\'s roof panels is the library\'s shared one (red brick, two-sided slate, the shed\'s glass, ribs and boarding, sashes, panes), and nothing shared is changed', () => {
  const before = (material('brick') as THREE.MeshLambertMaterial).color.getHex();
  const set = createMaterials();
  assert.equal(set.table.brick, material('brick'));
  assert.equal(set.table.stone, material('stone'));
  assert.equal(set.table.roofGlass, material('shedGlass'), 'the shed\'s milky glazing: bright from inside');
  assert.equal(set.table.rib, material('ribPaint'), 'the restored shed\'s pale ironwork');
  assert.equal(set.table.lining, material('lining'));
  assert.equal(set.table.brickRed, material('brickRed'), 'the Midland Grand\'s brick is the library\'s tinted one');
  assert.notEqual(set.table.brickRed, material('brick'));
  assert.equal(set.table.slate, material('slateBothSides'));
  assert.notEqual(set.table.slate, material('slate'), 'the shed\'s slate is seen from inside: a two-sided one');
  assert.equal((set.table.slate as THREE.MeshLambertMaterial).side, THREE.DoubleSide);
  assert.equal((material('slate') as THREE.MeshLambertMaterial).side, THREE.FrontSide, 'the shared one is untouched');
  assert.equal(set.table.sash, material('sash'));
  assert.equal(set.table.sashArch, material('sashArch'));
  assert.equal(set.table.pane, material('pane'));
  for (const key of ['sash', 'sashArch', 'pane'] as const) assert.equal((set.table[key] as THREE.MeshLambertMaterial).polygonOffset, true, `${key} is pulled toward the camera`);
  assert.equal((material('window') as THREE.MeshLambertMaterial).polygonOffset, false, 'the plain window is not');
  assert.equal((material('brick') as THREE.MeshLambertMaterial).color.getHex(), before, 'the shared brick keeps its colour');
  assert.ok((set.table.brickRed as THREE.MeshLambertMaterial).color.r > (set.table.brickRed as THREE.MeshLambertMaterial).color.g, 'red brick');
  assert.deepEqual(set.owned, [set.table.clock, set.table.metal], 'the clock face and the extension\'s roof panels are all this set makes (no document here, so no texture)');
  for (const key of ['brick', 'brickRed', 'slate', 'sash', 'sashArch', 'pane', 'roofGlass', 'rib', 'lining'] as const) assert.ok(!set.owned.includes(set.table[key]), `we never dispose the shared ${key}`);
});

test('addLandmarks: one mesh per material, a modest triangle budget, the replaced OSM ids, and a clean dispose', () => {
  const scene = new THREE.Scene();
  const lm = addLandmarks(scene, data);
  assert.equal(lm.group.parent, scene);
  assert.ok(lm.group.children.length <= 10 + 6, `${lm.group.children.length} draw calls: the 10 of the first build, and the 6 the fidelity rubric allows`);
  assert.ok(lm.stats.triangles > 5000 && lm.stats.triangles < 40000, `${lm.stats.triangles} triangles`);
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
