// web/src/landmarks.ts: the geometry of the Great Northern Hotel, the Midland Grand and the Barlow vault.
// No DOM: only the geometry builders and the scene assembly are exercised.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { barlowPlan, chainBays, FIGURES, greatNorthernHotelPlan, midlandGrandPlan, OSM_IDS, polygonEdges, REPLACED_BUILDING_IDS } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { pointInPolygon, worldToShed } from '../../core/station.ts';
import { addBand, addLandmarks, addWalls, barlowGeometry, createMaterials, hotelGeometry, LANDMARK_OSM_IDS, midlandGeometry, pointInQuad, segmentsOutside, towerSquare, windowOutline } from '../src/landmarks.ts';
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

test('Great Northern Hotel: a round-headed window on the ground floor and four sashes above, in every bay', () => {
  const parts = hotelGeometry(hotel);
  const bays = hotel.faces.reduce((s, f) => s + f.bays.length, 0);
  assert.equal(bays, 50);
  assert.equal(triangles(parts.sashArch as Batch).length, 2 * bays);
  // 4 upper storeys per bay; the sixth and thirteenth bays of the main front are tripartite: two more lights per storey
  assert.equal(triangles(parts.sash as Batch).length, 2 * (4 * bays + 2 * 2 * 4));
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
    for (const t of triangles(parts[key] as Batch)) {
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
  close(Math.max(...allVertices(parts).map((v) => v[1])), hotel.ridge, 1e-9, 'the highest point is the ridge');
  close(Math.min(...allVertices(parts).map((v) => v[1])), 0, 1e-9, 'walls stand on the ground');
  // the cornice is the highest stone band: windows end below its underside
  const stoneYs = triangles(parts.stone as Batch).flatMap((t) => t.p.map((v) => v[1]));
  const corniceBottom = Math.min(...stoneYs.filter((y) => y > hotel.eaves - 1.0 && y < hotel.eaves - 0.3));
  const sashTop = Math.max(...triangles(parts.sash as Batch).flatMap((t) => t.p.map((v) => v[1])));
  assert.ok(sashTop < corniceBottom, `window tops reach ${sashTop}, the cornice starts at ${corniceBottom}`);
  // the slate roof stands on the walls: its lowest edge is the eaves
  close(Math.min(...triangles(parts.slate as Batch).flatMap((t) => t.p.map((v) => v[1]))), hotel.eaves, 1e-9, 'roof eaves');
});

// ---- the Midland Grand -------------------------------------------------------------------------

test('Midland Grand: the clock tower reaches 76 m [WP-MGH], the entrance tower its assumed height, and nothing is taller', () => {
  const ys = allVertices(midlandGeometry(midland)).map((v) => v[1]);
  close(Math.max(...ys), 76, 1e-6, 'tallest point');
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
  // the clock sits above the belfry, below the spire: 0.5 .. 0.8 of the tower
  const ys = clocks.flatMap((t) => t.p.map((v) => v[1]));
  assert.ok(Math.min(...ys) > 0.55 * 76 && Math.max(...ys) < 0.8 * 76, `clock between ${Math.min(...ys)} and ${Math.max(...ys)}`);
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

// ---- the Barlow vault --------------------------------------------------------------------------

/** world -> (across, along, up) in the vault's frame */
const inVault = (p: V3): { u: number; v: number; y: number } => ({ ...worldToShed({ origin: barlow.origin, heading: barlow.heading }, [p[0], p[2]]), y: p[1] });

test('Barlow vault [WP-STP]: 100 ft at the crown, on the ground at the springings, inside the 245 ft 6 in walls', () => {
  const parts = barlowGeometry(barlow);
  const roof = [...triangles(parts.slate as Batch), ...triangles(parts.roofGlass as Batch)].flatMap((t) => t.p).map(inVault);
  close(Math.max(...roof.map((p) => p.y)), FIGURES.barlow.rise, 1e-3, 'crown');
  close(Math.min(...roof.map((p) => p.y)), 0, 1e-9, 'springings');
  const margin = (barlow.width - barlow.span) / 2;
  close(Math.min(...roof.map((p) => p.u)), margin, 1e-6, 'west springing');
  close(Math.max(...roof.map((p) => p.u)), margin + barlow.span, 1e-6, 'east springing (73.15 m apart)');
  close(Math.min(...roof.map((p) => p.v)), 0, 1e-6, 'south end');
  close(Math.max(...roof.map((p) => p.v)), barlow.length, 1e-6, 'north end');
  // the arch is symmetric about the shed's middle
  close(Math.max(...roof.filter((p) => p.y > 29).map((p) => p.u)) + Math.min(...roof.filter((p) => p.y > 29).map((p) => p.u)), barlow.width, 1.5, 'the crown is mid-shed');
});

test('Barlow vault [WP-STP]: glass covers the middle half of the arch, slate the outer quarters, to 210 m; glass alone beyond', () => {
  const parts = barlowGeometry(barlow);
  const glassAll = triangles(parts.roofGlass as Batch);
  const slate = triangles(parts.slate as Batch);
  // the glass strips that start at the south wall (the middle of the arch): glass u is the distance along the arch, slate v likewise
  const glass = glassAll.filter((t) => t.p.some((p) => inVault(p).v < 1e-6));
  const glassFrom = Math.min(...glass.flatMap((t) => t.uv.map((q) => q[0])));
  const glassTo = Math.max(...glass.flatMap((t) => t.uv.map((q) => q[0])));
  const total = Math.max(...slate.flatMap((t) => t.uv.map((q) => q[1])));
  close((glassTo - glassFrom) / total, FIGURES.barlow.glassFraction, 0.05, 'fraction of the arch that is glass');
  close(glassFrom / total, 0.25, 0.05, 'the west quarter is slate');
  close(Math.max(...slate.flatMap((t) => t.p.map((p) => inVault(p).v))), barlow.barlowLength, 1e-6, 'slate ends at 689 ft');
  // beyond the Barlow shed the roof is glass right down to the ground
  const ext = glassAll.filter((t) => t.p.every((p) => inVault(p).v >= barlow.barlowLength - 1e-6));
  assert.ok(ext.length > 0);
  assert.ok(Math.min(...ext.flatMap((t) => t.p.map((p) => inVault(p).y))) < 1e-6, 'extension glazing reaches the ground');
});

test('Barlow vault: a rib of 24 segments at every rib position, each along the arch; the south wall closes the end', () => {
  const parts = barlowGeometry(barlow);
  assert.equal(triangles(parts.steel as Batch).length, barlow.ribs.length * 24 * 3 * 2);
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

test('materials: every look but the clock is the library\'s shared one (red brick, two-sided slate, sashes, panes now live in materials.ts), and nothing shared is changed', () => {
  const before = (material('brick') as THREE.MeshLambertMaterial).color.getHex();
  const set = createMaterials();
  assert.equal(set.table.brick, material('brick'));
  assert.equal(set.table.stone, material('stone'));
  assert.equal(set.table.roofGlass, material('roofGlass'));
  assert.equal(set.table.steel, material('steel'));
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
  assert.deepEqual(set.owned, [set.table.clock], 'the clock face is all this set makes (no document here, so no texture)');
  for (const key of ['brick', 'brickRed', 'slate', 'sash', 'sashArch', 'pane'] as const) assert.ok(!set.owned.includes(set.table[key]), `we never dispose the shared ${key}`);
});

test('addLandmarks: one mesh per material, a modest triangle budget, the replaced OSM ids, and a clean dispose', () => {
  const scene = new THREE.Scene();
  const lm = addLandmarks(scene, data);
  assert.equal(lm.group.parent, scene);
  assert.ok(lm.group.children.length <= 10, `${lm.group.children.length} draw calls`);
  assert.ok(lm.stats.triangles > 5000 && lm.stats.triangles < 30000, `${lm.stats.triangles} triangles`);
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
