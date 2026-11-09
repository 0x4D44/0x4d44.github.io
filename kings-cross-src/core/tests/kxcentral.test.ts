// core/kxcentral.ts: the King's Cross Central landmarks as numbers (Coal Drops Yard, the Granary and its sheds, the
// gasholders, the Crick, the British Library, the German Gymnasium, Platform 37). Positions are checked against the real
// OSM extract, heights against the sources named in that file's header ([CM], [HE-GRA], [HE-GAS], [AM], [ADF], [HE-BL],
// [HE-GYM], [WP-P37], [NSC], [GU]), and the polygon toolbox (ear clipping, the conforming mesh, half-plane clips, the
// walls over a lower neighbour) against shapes whose answers are known.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Pt } from '../geo.ts';
import { ringSelfIntersects } from '../landmarks.ts';
import type { KxData } from '../osm.ts';
import {
  area2,
  clipHalfPlane,
  coalDropsPlan,
  CRICK_PARTS,
  crickPlan,
  distToPolyline,
  distToRing,
  dropSharpTurns,
  dropSpikes,
  doubleHippedRoof,
  earClip,
  exposedEdges,
  FIG,
  gableRoof,
  GASHOLDER_WAYS,
  gasholderPlan,
  granaryComplex,
  gymnasiumPlan,
  insertCrossings,
  KXCENTRAL_OSM_IDS,
  landscraperPlan,
  libraryPlan,
  meshPolygon,
  nearestVertex,
  onRing,
  OSM,
  outlineOf,
  pointInPolygon,
  polygonArea,
  polygonEdges,
  raisedWalls,
  rand,
  simplifyRing,
  surfaceNormal,
} from '../kxcentral.ts';
import type { PolyMesh } from '../kxcentral.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const area = (r: readonly Pt[]): number => Math.abs(area2(r)) / 2;
const osmRing = (id: number): Pt[] => (data.buildings.find((b) => b.id === id) as { pts: Pt[] }).pts;
const centroid = (r: readonly Pt[]): Pt => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
/** every vertex of `ring` is on the boundary of `outer` (within tol) or inside it */
const withinOutline = (ring: readonly Pt[], outer: readonly Pt[], tol: number): boolean => ring.every((p) => distToRing(p, outer) <= tol || pointInPolygon(p, outer as Pt[]));
const sq = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// =============================================================================================
// 1. which buildings these are

test('the ten OSM ids are in the data, unique, and the ones the brief got wrong are corrected (Granary 222021576, landscraper 1018561795)', () => {
  assert.equal(KXCENTRAL_OSM_IDS.length, 10);
  assert.equal(new Set(KXCENTRAL_OSM_IDS).size, 10);
  for (const [name, id] of Object.entries(OSM)) assert.ok(osmRing(id).length >= 4, `${name} ${id} is in the extract`);
  const by = (id: number) => data.buildings.find((b) => b.id === id) as { name?: string; levels?: number };
  assert.equal(by(OSM.westernCoalDrops).name, 'Western Coal Drops');
  assert.equal(by(OSM.easternCoalDrops).name, 'Eastern Coal Drops');
  assert.equal(by(OSM.crick).name, 'The Francis Crick Institute');
  assert.equal(by(OSM.britishLibrary).name, 'British Library');
  assert.equal(by(OSM.gymnasium).name, 'German Gymnasium');
  assert.equal(by(OSM.landscraper).name, 'Platform 37');
  assert.match(by(OSM.granaryStreet).name as string, /Central Saint Martins/, '222021578 is the CSM street, not the Granary');
  assert.equal(by(OSM.granary).levels, FIG.granary.storeys, 'the Granary is six storeys in the data and in [HE-GRA]');
  assert.throws(() => outlineOf(data, 1), /OSM building 1 is not in the data/);
});

// =============================================================================================
// 2. Coal Drops Yard

test('Coal Drops Yard: the two outlines touch at the kiss, which stands 25 m [CM] over both buildings and nowhere else', () => {
  const plan = coalDropsPlan(data);
  assert.deepEqual(plan.west.outline, outlineOf(data, OSM.westernCoalDrops));
  assert.deepEqual(plan.east.outline, outlineOf(data, OSM.easternCoalDrops));
  assert.ok(plan.gap < 0.5, `the outlines come within ${plan.gap} m`);
  assert.ok(distToRing(plan.kiss, plan.west.outline) < 0.3 && distToRing(plan.kiss, plan.east.outline) < 0.3, 'the kiss is on both outlines');
  close(plan.apex, 25, 0, '[CM] 25 m');
  close(plan.roofHeight('west', plan.kiss), 25, 1e-9, 'west roof at the kiss');
  close(plan.roofHeight('east', plan.kiss), 25, 1e-9, 'east roof at the kiss');
  close(plan.eaves, 10.5, 1e-9, 'three storeys of 3.5 m');
  // beyond the lift radius the roof is the shallow pitched one: at the eaves on the wall, never above the unlifted ridge
  for (const which of ['west', 'east'] as const) {
    const ring = plan[which].outline;
    let max = 0;
    for (const p of ring) {
      const h = plan.roofHeight(which, p);
      assert.ok(h >= plan.eaves - 1e-9 && h <= plan.apex + 1e-9, `${which}: ${h} outside [eaves, apex]`);
      if (Math.hypot(p[0] - plan.kiss[0], p[1] - plan.kiss[1]) >= plan.radius) close(h, plan.eaves, 1e-9, `${which} on the wall beyond the lift`);
      max = Math.max(max, h);
    }
    assert.ok(max > 20, `${which}: the lift reaches a long way up the wall (${max})`);
  }
  // the lift falls away from the kiss
  let prev = Infinity;
  for (let r = 0; r <= plan.radius; r += 10) {
    const h = plan.roofHeight('east', [plan.kiss[0] + r, plan.kiss[1]]);
    assert.ok(h <= prev + 1e-9, `east roof falls away from the kiss (${r} m: ${h})`);
    prev = h;
  }
  // [CM]: the sheds are 150 m (east) and 120 m (west) long; the OSM outlines measure 153 m and 99 m (the west one is shorter than [CM] says)
  assert.ok(plan.east.length > 145 && plan.east.length < 160, `east ${plan.east.length}`);
  assert.ok(plan.west.length > 90 && plan.west.length < 125, `west ${plan.west.length}`);
});

// =============================================================================================
// 3. the polygon toolbox

test('earClip: the triangles tile a convex, a concave and a clockwise polygon exactly, each turning the positive way', () => {
  const shapes: [string, Pt[], number][] = [
    ['square', sq(0, 0, 4, 4), 16],
    ['L', [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]], 12],
    ['clockwise square', [[0, 0], [0, 4], [4, 4], [4, 0]], 16],
    ['with a straight run', [[0, 0], [2, 0], [4, 0], [4, 4], [0, 4]], 16],
  ];
  for (const [name, ring, want] of shapes) {
    const tris = earClip(ring);
    let sum = 0;
    for (const [a, b, c] of tris) {
      const t = area2([ring[a] as Pt, ring[b] as Pt, ring[c] as Pt]);
      assert.ok(t > 0, `${name}: a triangle turns the wrong way`);
      sum += t / 2;
    }
    close(sum, want, 1e-9, `${name}: area`);
  }
  assert.equal(earClip(sq(0, 0, 4, 4)).length, 2);
  assert.equal(earClip(shapes[1]?.[1] as Pt[]).length, 4);
});

test('earClip tiles every landmark outline exactly (the area of the triangles is the polygon\'s)', () => {
  for (const [name, id] of Object.entries(OSM)) {
    const ring = outlineOf(data, id);
    const tris = earClip(ring);
    const sum = tris.reduce((s, [a, b, c]) => s + area2([ring[a] as Pt, ring[b] as Pt, ring[c] as Pt]) / 2, 0);
    close(sum, area(ring), area(ring) * 1e-6, name);
    assert.ok(tris.length >= ring.length - 4 && tris.length <= ring.length - 2, `${name}: ${tris.length} triangles for ${ring.length} corners`);
  }
});

/** the invariants of a conforming mesh over `ring`: the same area, every triangle positive, no edge longer than maxEdge, no T-junctions, a closed boundary */
function checkMesh(name: string, ring: readonly Pt[], mesh: PolyMesh, maxEdge: number): void {
  const simple = simplifyRing(ring, 0, 0.05);
  let sum = 0;
  const edgeCount = new Map<string, number>();
  const key = (p: number, q: number): string => (p < q ? `${p}-${q}` : `${q}-${p}`);
  let longest = 0;
  for (const [a, b, c] of mesh.tris) {
    const [pa, pb, pc] = [mesh.points[a] as Pt, mesh.points[b] as Pt, mesh.points[c] as Pt];
    const t = area2([pa, pb, pc]) / 2;
    assert.ok(t > 1e-9, `${name}: a triangle with area ${t}`);
    sum += t;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      edgeCount.set(key(p, q), (edgeCount.get(key(p, q)) ?? 0) + 1);
      longest = Math.max(longest, Math.hypot((mesh.points[p] as Pt)[0] - (mesh.points[q] as Pt)[0], (mesh.points[p] as Pt)[1] - (mesh.points[q] as Pt)[1]));
    }
  }
  close(sum, polygonArea(simple), polygonArea(simple) * 1e-6, `${name}: the mesh covers the polygon`);
  assert.ok(longest <= maxEdge + 1e-6, `${name}: longest edge ${longest} over ${maxEdge}`);
  const counts = [...edgeCount.values()];
  assert.ok(counts.every((c) => c === 1 || c === 2), `${name}: an edge is shared by ${Math.max(...counts)} triangles`);
  const boundaryEdges = counts.filter((c) => c === 1).length;
  assert.equal(boundaryEdges, mesh.boundary.length, `${name}: the boundary ring is the set of single-triangle edges (no T-junctions)`);
  // Euler for a disc: V - E + F = 1
  assert.equal(mesh.points.length - edgeCount.size + mesh.tris.length, 1, `${name}: Euler characteristic`);
  // the boundary runs the positive way, through every (simplified) outline vertex, and is the outline's length
  const b = mesh.boundary.map((i) => mesh.points[i] as Pt);
  assert.ok(area2(b) > 0, `${name}: boundary turns the positive way`);
  let perimeter = 0;
  for (let i = 0; i < b.length; i++) perimeter += Math.hypot((b[i] as Pt)[0] - (b[(i + 1) % b.length] as Pt)[0], (b[i] as Pt)[1] - (b[(i + 1) % b.length] as Pt)[1]);
  close(perimeter, polygonEdges(simple).reduce((s, e) => s + e.length, 0), 1e-6, `${name}: boundary length`);
  for (const p of simple) assert.ok(b.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9), `${name}: outline corner ${p} is on the boundary`);
}

test('meshPolygon: a conforming triangle mesh (no T-junctions, area kept, edges <= maxEdge, boundary = outline) on shapes and on every landmark outline', () => {
  checkMesh('square', sq(0, 0, 40, 25), meshPolygon(sq(0, 0, 40, 25), 5), 5);
  const L: Pt[] = [[0, 0], [30, 0], [30, 10], [10, 10], [10, 30], [0, 30]];
  checkMesh('L', L, meshPolygon(L, 4), 4);
  checkMesh('already fine', sq(0, 0, 2, 2), meshPolygon(sq(0, 0, 2, 2), 5), 5);
  for (const [name, id] of Object.entries(OSM)) {
    const ring = outlineOf(data, id);
    checkMesh(name, ring, meshPolygon(ring, FIG.coal.maxEdge), FIG.coal.maxEdge);
  }
});

test('meshPolygon is finer where asked: halving maxEdge at least doubles the triangles', () => {
  const a = meshPolygon(sq(0, 0, 40, 40), 10).tris.length;
  const b = meshPolygon(sq(0, 0, 40, 40), 5).tris.length;
  assert.ok(b >= a * 2, `${a} -> ${b}`);
  // The ratio alone sits on a boundary: the 40 m square takes 64 triangles at 10 m and 128 at anything from 9 m down to 7.1 m, so a mesh that stopped
  // refining near 8 m would still "double". The contract is that no triangle edge is longer than maxEdge; and a triangle with no side over maxEdge
  // covers at most (sqrt(3) / 4) maxEdge^2 (the equilateral one), so the 1600 m2 square needs at least that many triangles.
  for (const maxEdge of [10, 5]) {
    const mesh = meshPolygon(sq(0, 0, 40, 40), maxEdge);
    const least = Math.ceil(1600 / ((Math.sqrt(3) / 4) * maxEdge * maxEdge));
    assert.ok(mesh.tris.length >= least, `maxEdge ${maxEdge}: ${mesh.tris.length} triangles for 1600 m2, edges of at most ${maxEdge} m need at least ${least}`);
    checkMesh(`40 m square at maxEdge ${maxEdge}`, sq(0, 0, 40, 40), mesh, maxEdge);
  }
});

test('clipHalfPlane and insertCrossings: the two halves of a ring add up to the ring, and the crossings are the points on the line', () => {
  const r = sq(0, 0, 10, 6);
  const right = clipHalfPlane(r, [4, 0], [1, 0]);
  const left = clipHalfPlane(r, [4, 0], [-1, 0]);
  close(area(right), 36, 1e-9, 'right');
  close(area(left), 24, 1e-9, 'left');
  const U: Pt[] = [[0, 0], [10, 0], [10, 8], [7, 8], [7, 3], [3, 3], [3, 8], [0, 8]];
  close(area(clipHalfPlane(U, [0, 2], [0, 1])) + area(clipHalfPlane(U, [0, 2], [0, -1])), area(U), 1e-9, 'a concave ring cut where it stays in one piece');
  const crossed = insertCrossings(r, [4, 0], [1, 0]);
  assert.equal(crossed.length, 6);
  assert.equal(crossed.filter((p) => Math.abs(p[0] - 4) < 1e-9).length, 2);
  assert.deepEqual(insertCrossings(r, [-5, 0], [1, 0]), r, 'a line that misses the ring adds nothing');
  assert.ok(dropSpikes([[0, 0], [4, 0], [8, 0], [4, 0], [4, 4]]).length < 5, 'the double-back is dropped');
});

test('simplifyRing and dropSharpTurns: drop the corners that are not corners, keep the real ones', () => {
  const r = simplifyRing([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]], 1.5, 3);
  assert.equal(r.length, 4, 'a point on a straight run goes');
  assert.equal(simplifyRing([[0, 0], [0.5, 0], [10, 0], [10, 10], [0, 10]], 1.5, 3).length, 4, 'a corner closer than minEdge goes');
  assert.equal(simplifyRing([[0, 0], [10, 0], [10, 10], [0, 10]], 1.5, 3).length, 4, 'a square stays a square');
  // a short edge at a REAL corner: a 1.4 m chamfer turns 45 degrees at both its ends, so the straightness test keeps both and only minEdge can drop the second
  const chamfered: Pt[] = [[0, 0], [10, 0], [10, 10], [1, 10], [0, 9]];
  assert.deepEqual(simplifyRing(chamfered, 1.5, 3), [[0, 0], [10, 0], [10, 10], [1, 10]], 'a corner closer than minEdge goes even where it is a real corner (45 degrees)');
  assert.deepEqual(simplifyRing(chamfered, 1, 3), chamfered, 'the same corner stays when it is farther than minEdge');
  const spike: Pt[] = [[0, 0], [10, 0], [10, 10], [5.2, 10], [5, 30], [4.8, 10], [0, 10]];
  const out = dropSharpTurns(spike, 150);
  assert.ok(!out.some((p) => p[1] === 30), 'the thin spike is dropped');
  assert.equal(dropSharpTurns(sq(0, 0, 4, 4), 150).length, 4);
});

test('exposedEdges: the edges two neighbours share are not walls', () => {
  const a = sq(0, 0, 10, 10);
  const b = sq(10, 0, 20, 10);
  assert.equal(exposedEdges(a, [b]).length, 3);
  assert.equal(exposedEdges(a, []).length, 4);
  assert.equal(exposedEdges(a, [b]).every((e) => e.normal[0] <= 0.01), true, 'the one on the east side is the one left out');
  assert.ok(onRing([10, 5], a, 0.01) && !onRing([11, 5], a, 0.5));
  // a neighbour has to cover the whole edge: the two prongs of a U round a passage touch both ends of the south edge but not its middle, which stays a wall
  const prongs: Pt[] = [[0, 0], [0, -6], [10, -6], [10, 0], [8, 0], [8, -4], [2, -4], [2, 0]];
  assert.ok(onRing([0, 0], prongs) && onRing([10, 0], prongs) && !onRing([5, 0], prongs), 'the fixture touches both ends of the south edge and not its middle');
  assert.equal(exposedEdges(a, [prongs]).length, 4, 'a neighbour that touches both ends of an edge but not its middle does not hide it');
  // and it has to be ONE neighbour that does: three that touch one end, the other end and the middle of the edge do not hide it between them
  const apart: Pt[][] = [sq(-4, -4, 0, 0), sq(10, -4, 14, 0), sq(4, -4, 6, 0)];
  assert.equal(exposedEdges(a, apart).length, 4, 'three neighbours that touch one end, the other end and the middle of an edge do not hide it between them');
});

test('gableRoof: a ridge at eaves + rise over the middle of the width, the eaves on the long walls, a crossing in each end wall', () => {
  const r = gableRoof(sq(0, 0, 30, 10), 11, 4);
  close(r.height(r.origin), 15, 1e-9, 'ridge');
  close(r.height([5, 0]), 11, 1e-9, 'long wall');
  close(r.height([5, 10]), 11, 1e-9, 'other long wall');
  close(r.height([5, 2.5]), 13, 1e-9, 'halfway up the slope (a quarter of the width in from the wall)');
  assert.equal(r.halves.length, 2);
  close(area(r.halves[0] as Pt[]) + area(r.halves[1] as Pt[]), 300, 1e-9, 'the halves tile the plan');
  close(area(r.halves[0] as Pt[]), 150, 1e-9, 'halves');
  assert.equal(r.ring.length, 6, 'the ring has a point where each end wall meets the ridge');
  close(r.halfWidth, 5, 1e-9);
});

test('doubleHippedRoof: eight facets over the rectangle (two hipped halves), ridges a quarter of the depth in, rise above the eaves', () => {
  const facets = doubleHippedRoof([0, 0], [1, 0], [0, 1], 40, 20, 12, 5);
  assert.equal(facets.length, 8);
  const ys = facets.flat().map((p) => p[1]);
  close(Math.max(...ys), 17, 1e-9, 'ridge');
  close(Math.min(...ys), 12, 1e-9, 'eaves');
  let plan = 0;
  for (const f of facets) plan += area2(f.map((p) => [p[0], p[2]] as Pt)) / 2;
  close(Math.abs(plan), 800, 1e-6, 'the facets cover the rectangle exactly');
  const ridgeZs = facets.flat().filter((p) => p[1] === 17).map((p) => p[2]);
  assert.deepEqual([...new Set(ridgeZs.map((z) => Math.round(z * 1000) / 1000))].sort((a, b) => a - b), [5, 15], 'two ridges, at a quarter and three quarters of the depth');
});

test('surfaceNormal: the unit normal of a height field, from its slope', () => {
  const n = surfaceNormal((p) => 0.5 * p[0], [3, 4], 0.5);
  close(Math.hypot(...n), 1, 1e-9, 'unit');
  close(n[0], -0.5 / Math.sqrt(1.25), 1e-9);
  close(n[1], 1 / Math.sqrt(1.25), 1e-9);
  close(n[2], 0, 1e-9);
  assert.deepEqual(surfaceNormal(() => 7, [0, 0]), [-0, 1, -0]);
});

test('rand is deterministic and in [0, 1); nearestVertex finds the closest corner', () => {
  const a = rand(5);
  const b = rand(5);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notEqual(rand(5)(), rand(6)(), 'another seed, another sequence');
  const v = nearestVertex(sq(0, 0, 10, 10), [9, 1]);
  assert.equal(v.index, 1);
  close(v.distance, Math.SQRT2, 1e-9);
});

// =============================================================================================
// 4. walls over a lower neighbour (the Granary's sides above the sheds' roofs)

test('raisedWalls: a wall from the neighbour\'s roof up to the taller building, followed over a gable\'s peak, none where the neighbour is as tall', () => {
  const tall = sq(0, 0, 10, 10); // 20 m
  const lowRing: Pt[] = [[10, 0], [20, 0], [20, 10], [10, 10], [10, 5]]; // 10 m, with a vertex on the shared edge at z = 5
  const low = { ring: lowRing, top: (p: Pt) => (Math.abs(p[1] - 5) < 1e-9 ? 14 : 10) };
  const walls = raisedWalls(tall, () => 20, [low]);
  assert.equal(walls.length, 2, 'two pieces: the shared edge is cut at the neighbour\'s vertex');
  close(walls.reduce((s, w) => s + w.edge.length, 0), 10, 1e-9, 'the whole shared edge');
  for (const w of walls) {
    assert.ok(w.edge.normal[0] > 0.999 && Math.abs(w.edge.normal[1]) < 1e-9, 'faces the neighbour (east)');
    close(w.topA, 20, 0);
    close(w.topB, 20, 0);
  }
  const lowest = Math.min(...walls.flatMap((w) => [w.baseA, w.baseB]));
  const highest = Math.max(...walls.flatMap((w) => [w.baseA, w.baseB]));
  close(lowest, 10, 1e-9, 'foot at the neighbour\'s eaves');
  close(highest, 14, 1e-9, 'foot at the neighbour\'s peak');
  assert.deepEqual(raisedWalls(tall, () => 10, [low]), [], 'a neighbour as tall leaves no wall');
  assert.deepEqual(raisedWalls(tall, () => 20, []), [], 'no neighbour, no raised wall (the exposed walls are built from the ground)');
  const lowerOnly = raisedWalls(lowRing, low.top, [{ ring: tall, top: () => 20 }]);
  assert.deepEqual(lowerOnly, [], 'the low building has nothing to raise over the tall one');
});

test('the Granary stands over its sheds: raised walls on its west, east and north sides up to the eaves, none on the south front, none the other way', () => {
  const c = granaryComplex(data);
  const g = c.granary;
  assert.equal(g.raised.length, 4, 'west, east and the north side in two pieces (the street\'s ridge)');
  close(g.raised.reduce((s, w) => s + w.edge.length, 0), 31.3 + 31.4 + 56.6, 0.5, 'the three shared sides');
  for (const w of g.raised) {
    close(w.topA, g.eaves, 1e-9);
    close(w.topB, g.eaves, 1e-9);
    assert.ok(w.baseA >= 10.9 && w.baseA <= 13.6 && w.baseB >= 10.9 && w.baseB <= 13.6, `foot ${w.baseA}/${w.baseB} is at the neighbour's roof`);
    assert.ok(w.edge.normal[1] < 0.5, 'none faces the south front');
  }
  assert.ok(g.raised.some((w) => Math.max(w.baseA, w.baseB) > 13.4), 'the foot rises to the street\'s ridge (13.5 m)');
  assert.deepEqual(c.westShed.raised, [], 'the west shed is lower than the Granary: nothing to raise');
  assert.deepEqual(c.street.raised, []);
  for (const w of c.eastShed.raised) assert.ok(w.topA - w.baseA < 0.5, 'the east shed\'s only steps are a few decimetres (its roof against the street\'s)');
});

// =============================================================================================
// 5. the Granary complex

test('the Granary [HE-GRA]: six storeys, 4.1 m then 2.4 m between floors, nine bays with the four hoist bays between five casements, a double-hipped roof', () => {
  const c = granaryComplex(data);
  const g = c.granary;
  assert.deepEqual(g.outline, outlineOf(data, OSM.granary));
  assert.equal(g.floors.length, 6);
  close((g.floors[1] as number) - (g.floors[0] as number), 4.1 + 0.6, 1e-9, 'ground storey: 4.1 m clear plus the slab');
  for (let s = 2; s < 6; s++) close((g.floors[s] as number) - (g.floors[s - 1] as number), 2.4 + 0.6, 1e-9, `storey ${s}`);
  close(g.eaves, 19.7, 1e-9, 'eaves: 4.7 + 4 x 3 + 3');
  assert.equal(g.bays.length, 9);
  assert.deepEqual(g.hoist, [1, 3, 5, 7]);
  assert.equal(g.bays.length - g.hoist.length, 5, 'five casement bays');
  for (const b of g.bays) {
    assert.ok(distToRing(b.at, g.outline) < 0.01, 'a bay is on the wall');
    assert.ok(b.normal[1] > 0.9, 'on the south front');
  }
  assert.equal(g.roof.length, 8);
  const top = Math.max(...g.roof.flat().map((p) => p[1]));
  close(top, g.eaves + g.roofRise, 1e-9, 'ridge height');
  close(g.roofRise, (g.frame.depth / 4) * Math.tan((FIG.granary.pitch * Math.PI) / 180), 1e-9, 'rise: a quarter of the depth at 35 degrees');
  close(g.frame.length * g.frame.depth, area(g.outline), area(g.outline) * 0.02, 'the outline is a rectangle (the roof frame) to within 2%');
  assert.deepEqual(g.walls.map((e) => e.i), [1, 2, 3], 'only the south front is an exposed wall');
});

test('the sheds and the street: gabled roofs from the outlines, a ridge at eaves + rise, shared walls left out, every wall edge on the outside', () => {
  const c = granaryComplex(data);
  const tiles = { westShed: c.westShed, eastShed: c.eastShed, street: c.street };
  const f = FIG.granary;
  const outlines = [c.granary.outline, c.westShed.outline, c.eastShed.outline, c.street.outline];
  close(c.westShed.eaves, f.shedEaves, 0);
  close(c.street.eaves, f.streetEaves, 0);
  for (const [name, t] of Object.entries(tiles)) {
    close(t.roof.height(t.roof.origin), t.eaves + (name === 'street' ? f.streetRise : f.shedRise), 1e-9, `${name} ridge`);
    close(area(t.roof.halves[0] as Pt[]) + area(t.roof.halves[1] as Pt[]), area(t.outline), area(t.outline) * 1e-3, `${name}: the halves tile the outline`);
    for (const p of t.roof.ring) {
      const h = t.roof.height(p);
      assert.ok(h >= t.eaves - 1e-9 && h <= t.eaves + 4 + 1e-9, `${name}: wall top ${h}`);
    }
    for (const e of t.walls) {
      const others = outlines.filter((o) => o !== t.outline);
      assert.ok(!others.some((o) => onRing(e.mid, o, 0.1)), `${name}: wall edge ${e.i} is shared with a neighbour and should not be built`);
    }
    assert.ok(t.walls.length >= 5, `${name}: has walls`);
  }
  // the four outlines tile one block: each shared side is counted once, so the walls are shorter than the perimeters
  const perimeter = (r: readonly Pt[]): number => polygonEdges(r).reduce((s, e) => s + e.length, 0);
  const wallLength = [c.granary, ...Object.values(tiles)].reduce((s, t) => s + t.walls.reduce((a, e) => a + e.length, 0), 0);
  assert.ok(wallLength < outlines.reduce((s, o) => s + perimeter(o), 0) - 2 * 400, `walls ${wallLength}`);
});

// =============================================================================================
// 6. the gasholders

test('the gasholders: circles fitted to the OSM ways (nodes within 0.5 m of them), three tangent in a triplet, diameters near [HE-GAS], heights 33 m and 25 m', () => {
  const plan = gasholderPlan();
  assert.equal(plan.triplet.length, 3);
  assert.deepEqual(plan.triplet.map((g) => g.id), [1106694288, 1106694289, 1106694290]);
  assert.equal(plan.park.id, 453267219);
  for (const g of [...plan.triplet, plan.park]) {
    for (const p of GASHOLDER_WAYS[g.id] as Pt[]) close(Math.hypot(p[0] - g.centre[0], p[1] - g.centre[1]), g.radius, 0.5, `way ${g.id} node ${p}`);
    assert.ok(g.rms < 0.1, `way ${g.id} rms ${g.rms}`);
    assert.ok(Math.abs(g.columns * FIG.gas.columnPitch - 2 * Math.PI * g.radius) <= FIG.gas.columnPitch / 2 + 1e-9, `${g.id}: columns at 5.5 m`);
  }
  // [HE-GAS] internal diameters 40.8, 44.3 and 32.3 m: the OSM outline is the outside of the frame, a metre or so more
  for (const g of plan.triplet) {
    const published = FIG.gas.diameters[g.id] as number;
    const extra = 2 * g.radius - published;
    assert.ok(extra > 0.3 && extra < 2.5, `${g.id}: outline ${2 * g.radius} against [HE-GAS] ${published}`);
    assert.equal(g.height, 33, '[HE-GAS] about 33 m');
    assert.equal(g.tiers, 3);
  }
  assert.equal(plan.park.height, 25, '[AM] about 25 m');
  assert.ok(Math.abs(2 * plan.park.radius - 40) / 40 < 0.15, `[AM] "about 40 m": ${2 * plan.park.radius}`);
  // the three frames touch one another
  const [a, b, c] = plan.triplet as [typeof plan.park, typeof plan.park, typeof plan.park];
  for (const [p, q] of [[a, b], [a, c], [b, c]] as const) close(Math.hypot(p.centre[0] - q.centre[0], p.centre[1] - q.centre[1]), p.radius + q.radius, 0.5, `${p.id} and ${q.id} touch`);
  // Gasholder Park stands clear of the triplet
  for (const g of plan.triplet) assert.ok(Math.hypot(g.centre[0] - plan.park.centre[0], g.centre[1] - plan.park.centre[1]) > g.radius + plan.park.radius, `park clear of ${g.id}`);
  // The OSM circles sit within 0.15 of a whole number of columns (24.14, 19.04 and 26.05 pitches for the triplet), so these ways cannot tell the nearest
  // column count from the one below it. Bend each way, in turn, into a circle that is a known fraction of a pitch over a whole number: the count is the NEAREST.
  const ways = GASHOLDER_WAYS as Record<number, Pt[]>;
  for (const real of [...plan.triplet, plan.park]) {
    const kept = ways[real.id] as Pt[];
    try {
      for (const [pitches, columns] of [[20.6, 21], [20.4, 20]] as const) {
        const radius = (pitches * FIG.gas.columnPitch) / (2 * Math.PI);
        ways[real.id] = Array.from({ length: 36 }, (_, k): Pt => [real.centre[0] + radius * Math.cos((2 * Math.PI * k) / 36), real.centre[1] + radius * Math.sin((2 * Math.PI * k) / 36)]);
        const bent = gasholderPlan();
        const g = [...bent.triplet, bent.park].find((h) => h.id === real.id) as typeof real;
        close(g.radius, radius, 1e-3, `${real.id}: the fitted circle`);
        assert.equal(g.columns, columns, `${real.id}: a circle of ${pitches} column pitches gets ${g.columns} columns, the nearest whole number is ${columns}`);
      }
    } finally {
      ways[real.id] = kept;
    }
  }
});

test('the apartment drums [DC] [AR]: 12, 9 and 8 storeys, the biggest drum the tallest, each inside its frame with a courtyard, none in the park', () => {
  const plan = gasholderPlan();
  const bySize = [...plan.triplet].sort((p, q) => q.radius - p.radius);
  assert.deepEqual(bySize.map((g) => g.drum?.storeys), [12, 9, 8]);
  for (const g of plan.triplet) {
    const d = g.drum as NonNullable<typeof g.drum>;
    close(d.height, d.storeys * FIG.gas.storeyHeight, 1e-9);
    assert.ok(d.height < g.height, 'the drum is lower than its frame');
    close(d.radius, g.radius - FIG.gas.frameStandoff, 1e-9, 'the frame stands proud of the drum');
    assert.ok(d.court > 0 && d.court < d.radius, 'a courtyard inside');
  }
  assert.equal(plan.park.drum, null);
});

// =============================================================================================
// 7. the Crick

test('the Crick [ADF]: two vaults meeting at one valley at the eaves (8 storeys), crowns at 43 m, never lower than the eaves, never higher than the crown', () => {
  const plan = crickPlan(data);
  assert.equal(plan.parts.length, 2);
  assert.deepEqual(plan.outline, outlineOf(data, OSM.crick));
  const eaves = FIG.crick.storeys * FIG.crick.storeyHeight;
  close(eaves, 32, 0, '8 storeys of 4 m');
  const sumAreas = plan.parts.reduce((s, p) => s + area(p.outline), 0);
  assert.ok(sumAreas > 0.92 * area(plan.outline) && sumAreas < 1.05 * area(plan.outline), `the parts (${sumAreas}) cover the OSM building (${area(plan.outline)})`);
  for (const p of plan.parts) {
    assert.equal(p.eaves, 32);
    assert.equal(p.crown, 43);
    // the shared valley is on both outlines, and at the eaves on both sides
    for (const q of p.shared) assert.ok(distToRing(q, p.outline) < 0.01, `${p.id}: shared vertex ${q} on its outline`);
    for (let i = 0; i + 1 < p.shared.length; i++) {
      for (let t = 0; t <= 1; t += 0.25) {
        const a = p.shared[i] as Pt;
        const b = p.shared[i + 1] as Pt;
        close(p.roofHeight([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]), 32, 1e-6, `${p.id}: the valley at the eaves`);
      }
    }
    // a grid over the part: within [eaves, crown]
    const xs = p.outline.map((q) => q[0]);
    const zs = p.outline.map((q) => q[1]);
    let hi = 0;
    let lo = Infinity;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 4) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 4) {
        if (!pointInPolygon([x, z], p.outline)) continue;
        const h = p.roofHeight([x, z]);
        hi = Math.max(hi, h);
        lo = Math.min(lo, h);
      }
    }
    assert.ok(hi <= 43 + 1e-9 && hi > 42, `${p.id}: highest ${hi}`);
    assert.ok(lo >= 32 - 1e-9 && lo < 33.5, `${p.id}: lowest ${lo}`);
    assert.ok(p.halfLength * 2 > 120 && p.halfLength * 2 < 175, `${p.id}: ${p.halfLength * 2} m long (the building is 170 m [ADF])`);
    close(Math.hypot(p.axis[0], p.axis[1]), 1, 1e-9, 'unit axis');
  }
  // the vaults are arches: highest in the middle between the two long sides, lower towards either
  const p = plan.parts[0] as (typeof plan.parts)[number];
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const sA = p.shared[2] as Pt;
  const oA = p.outer[0] as Pt;
  const m = mid(sA, oA);
  assert.ok(p.roofHeight(m) > p.roofHeight(mid(sA, m)) && p.roofHeight(m) > p.roofHeight(mid(oA, m)), 'an arch across the part');
  assert.ok(distToPolyline(m, p.shared) > 10);
  assert.equal(CRICK_PARTS.north.levels, 11);
});

// =============================================================================================
// 8. the British Library

test('the British Library [HE-BL]: two blocks that tile the outline at the cut, four and six storeys, stepped slate roofs inside the walls, a clock tower facing south, a gateway in the piazza front', () => {
  const lib = libraryPlan(data);
  const f = FIG.library;
  close(area(lib.west) + area(lib.east), area(lib.outline), 1, 'the two blocks tile the outline');
  assert.ok(!ringSelfIntersects(lib.west) && !ringSelfIntersects(lib.east) && !ringSelfIntersects(lib.outline), 'simple rings');
  const raw = osmRing(OSM.britishLibrary);
  assert.ok(withinOutline(lib.outline, raw, 6), 'the simplified outline is on the OSM one (to the scale of the simplification)');
  assert.ok(Math.abs(area(lib.outline) - area(raw)) / area(raw) < 0.03, 'and has the same area to 3%');
  assert.ok(withinOutline(lib.west, lib.outline, 0.01) && withinOutline(lib.east, lib.outline, 0.01), 'the blocks are inside the outline');
  close(lib.westEaves, 4 * 4.2, 1e-9, 'four storeys');
  close(lib.eastEaves, 6 * 4.2, 1e-9, 'six storeys');
  assert.ok(lib.eastEaves > lib.westEaves);
  // the stepped roofs climb inwards: each ring is inside the one it rises from, and no roof climbs more than the cap
  const [s1, s2] = lib.steps as [(typeof lib.steps)[number], (typeof lib.steps)[number]];
  assert.ok(s1.inset > 4 && s1.inset <= f.stepInset + 1e-9, `first inset ${s1.inset}`);
  assert.ok(s2.inset > 4 && s2.inset <= f.stepInset + 1e-9, `second inset ${s2.inset}`);
  assert.ok(withinOutline(s1.ring, s1.outline, 0.01) && withinOutline(s2.ring, s2.outline, 0.01), 'each roof climbs inside its walls');
  assert.ok(withinOutline(s2.outline, lib.west, 0.01), 'the upper storey stands on the first roof, inside the block');
  for (const s of lib.steps) {
    assert.ok(s.top > s.base && s.top - s.base <= f.maxStepRise + 1e-9, `rise ${s.top - s.base}`);
    assert.ok(polygonArea(s.ring) < polygonArea(s.outline));
  }
  close(s1.base, lib.westEaves, 1e-9);
  close(lib.upper.base, s1.top, 1e-9, 'the upper storey starts where the first roof ends');
  close(lib.upper.top - lib.upper.base, f.upperStoreys * f.storeyHeight, 1e-9);
  close(s2.base, lib.upper.top, 1e-9, 'and carries the second roof');
  // the east block's gabled roof
  close(lib.eastRoof.height(lib.eastRoof.origin), lib.eastEaves + f.eastRise, 1e-9, 'ridge of the east block');
  // the clock tower: one bay square, inside the east block, higher than the block, its clock on the south face [HE-BL]
  const ck = lib.clock;
  assert.ok(pointInPolygon(ck.centre, lib.east), 'the tower stands in the east block');
  assert.equal(ck.corners.length, 4);
  for (let i = 0; i < 4; i++) close(Math.hypot((ck.corners[i] as Pt)[0] - (ck.corners[(i + 1) % 4] as Pt)[0], (ck.corners[i] as Pt)[1] - (ck.corners[(i + 1) % 4] as Pt)[1]), f.clockSide, 1e-9, 'a bay square');
  assert.ok(ck.height > lib.eastEaves);
  assert.ok((ck.faces[0] as (typeof ck.faces)[number]).normal[1] > 0.5, 'the clock faces south');
  // the piazza front: five bays of 7.8 m at least, facing south; the gateway is one bay wide at its middle
  assert.ok(lib.front.length >= 5 * f.grid, `front ${lib.front.length} m`);
  assert.ok(lib.front.normal[1] > 0.7);
  close(lib.gate.width, f.grid, 0);
  assert.deepEqual(lib.gate.at, lib.front.mid);
  assert.ok(distToRing(lib.gate.at, lib.west) < 0.01);
});

// =============================================================================================
// 9. the German Gymnasium

test('the German Gymnasium [HE-GYM]: the OSM outline under a gabled roof to 17.4 m, a ridge lantern on the ridge, the east end with five pointed windows over an oculus', () => {
  const g = gymnasiumPlan(data);
  const raw = osmRing(OSM.gymnasium);
  assert.ok(Math.abs(area(g.outline) - area(raw)) / area(raw) < 0.03, 'the outline is the OSM one');
  assert.ok(withinOutline(g.outline, raw, 1.5));
  assert.equal(g.ridge, 17.4);
  close(g.roof.height(g.roof.origin), 17.4, 1e-9, '57 ft hall');
  close(g.eaves, 12, 0);
  const l = g.lantern;
  for (const p of [l.a, l.b]) {
    assert.ok(pointInPolygon(p, g.outline), 'a lantern end is inside the walls');
    close(g.roof.height(p), 17.4, 1e-9, 'on the ridge');
  }
  close(l.base, 17.4, 0);
  close(l.top, 17.4 + FIG.gymnasium.lantern, 1e-9);
  close(l.width, 2.6, 0);
  assert.ok(Math.hypot(l.a[0] - l.b[0], l.a[1] - l.b[1]) > 10, 'a continuous ridge lantern');
  const east = g.east as NonNullable<typeof g.east>;
  assert.ok(east && east.normal[0] > 0.5 && east.length > 9, 'the east end');
  assert.equal(FIG.gymnasium.eastWindows, 5);
  assert.ok((FIG.gymnasium.eastWindows - 1) * 3.2 + 1.5 + 0.4 <= east.length, 'five windows at 3.2 m centres fit the east wall');
});

// =============================================================================================
// 10. Platform 37

test('Platform 37 [WP-P37] [NSC]: three terraces that tile the OSM outline, stepping up to 11 storeys at the north, and 250 trees [GU] each on a roof, clear of its edge', () => {
  const p = landscraperPlan(data);
  const f = FIG.landscraper;
  assert.deepEqual(p.outline, outlineOf(data, OSM.landscraper));
  assert.equal(p.zones.length, 3);
  close(p.zones.reduce((s, z) => s + area(z.ring), 0), area(p.outline), area(p.outline) * 0.005, 'the terraces tile the outline');
  assert.deepEqual(p.zones.map((z) => z.storeys), [7, 9, 11]);
  p.zones.forEach((z, i) => {
    close(z.height, z.storeys * f.storeyHeight, 1e-9);
    assert.ok(withinOutline(z.ring, p.outline, 0.01), `terrace ${i} inside the outline`);
    if (i > 0) {
      assert.ok(z.height > (p.zones[i - 1] as (typeof p.zones)[number]).height, 'steps up');
      assert.ok(centroid(z.ring)[1] < centroid((p.zones[i - 1] as (typeof p.zones)[number]).ring)[1], 'to the north (smaller z)');
    }
  });
  close((p.zones[2] as (typeof p.zones)[number]).height, 11 * 4.2, 1e-9, '11 storeys');
  assert.ok(p.axis[1] < 0, 'the axis points north');
  // trees
  assert.equal(p.trees.length, 250, '[GU] about 250 trees');
  const seen = new Set<string>();
  for (const t of p.trees) {
    const z = p.zones.find((zz) => Math.abs(zz.height - t.y) < 1e-9) as (typeof p.zones)[number];
    assert.ok(z, 'a tree stands at a roof height');
    assert.ok(pointInPolygon([t.x, t.z], z.ring), 'a tree is inside its roof');
    assert.ok(distToRing([t.x, t.z], z.ring) >= f.treeInset - 1e-9, 'and clear of the edge');
    assert.ok(t.size >= 3.2 && t.size <= 6.0 + 1e-9, `crown ${t.size}`);
    seen.add(`${t.x.toFixed(3)},${t.z.toFixed(3)}`);
  }
  assert.equal(seen.size, 250, 'no two trees in one place');
  let min = Infinity;
  for (let i = 0; i < p.trees.length; i++) for (let j = i + 1; j < p.trees.length; j++) min = Math.min(min, Math.hypot((p.trees[i] as (typeof p.trees)[number]).x - (p.trees[j] as (typeof p.trees)[number]).x, (p.trees[i] as (typeof p.trees)[number]).z - (p.trees[j] as (typeof p.trees)[number]).z));
  assert.ok(min >= 3.8, `closest trees ${min} m apart`);
  // shared out by area
  const total = p.zones.reduce((s, z) => s + area(z.ring), 0);
  p.zones.forEach((z) => {
    const n = p.trees.filter((t) => Math.abs(t.y - z.height) < 1e-9).length;
    close(n / 250, area(z.ring) / total, 0.06, 'trees by area');
  });
  assert.deepEqual(landscraperPlan(data).trees, p.trees, 'the same trees every time');
});
