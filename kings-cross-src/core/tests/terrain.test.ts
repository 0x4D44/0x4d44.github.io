// The ground under King's Cross: the grid format, the height field, the adaptive mesh, and the committed data
// (web/src/data/kx-terrain.json) held to the facts the portals, the track and the city rely on.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildTerrainMesh,
  createTerrain,
  decodeUnits,
  distanceField,
  encodeGrid,
  encodeUnits,
  fromBase64,
  NEAR_RAILS,
  overMesh,
  seatY,
  SLOPE,
  splitBySlope,
  terrainFromFunction,
  toBase64,
  toleranceNearRails,
} from '../terrain.ts';
import type { Terrain, TerrainFile, TerrainMesh } from '../terrain.ts';
import { FIGURES, tunnelMouths } from '../landmarks.ts';
import { shedBufferStops, shedLayout, worldToShed } from '../station.ts';
import type { KxData } from '../osm.ts';
import type { Pt } from '../geo.ts';

const EXT = { x0: 0, z0: 0, x1: 128, z1: 128 };

// ---- encoding -------------------------------------------------------------------------------------

test('terrain: heights survive the zigzag-varint round trip, steep steps and negative values included', () => {
  const nx = 17;
  const nz = 13;
  const units = new Int32Array(nx * nz);
  let seed = 12345;
  for (let i = 0; i < units.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    units[i] = (seed % 4000) - 2000; // up to +-2000 units: multi-byte varints
  }
  units[5] = 100000;
  units[6] = -100000;
  const bytes = encodeUnits(units, nx, nz);
  assert.deepEqual([...decodeUnits(bytes, nx, nz)], [...units]);
  assert.deepEqual([...fromBase64(toBase64(bytes))], [...bytes]);
});

test('terrain: a smooth surface costs about a byte per node or less; truncated and padded data are refused', () => {
  const nx = 64;
  const nz = 64;
  const units = new Int32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) units[j * nx + i] = Math.round(3 * i + 2 * j + 0.01 * i * j); // a gentle bowl
  const bytes = encodeUnits(units, nx, nz);
  assert.ok(bytes.length < nx * nz * 1.2, `${bytes.length} bytes for ${nx * nz} nodes`);
  assert.throws(() => decodeUnits(bytes.subarray(0, bytes.length - 3), nx, nz), /ends early/);
  assert.throws(() => decodeUnits(Uint8Array.from([...bytes, 0]), nx, nz), /trailing/);
});

// ---- the height field -----------------------------------------------------------------------------

test('terrain: heightAt reproduces a plane exactly (bilinear), and is groundY outside every grid', () => {
  const t = terrainFromFunction((x, z) => 0.1 * x - 0.05 * z + 3, EXT, 8);
  for (const [x, z] of [[0, 0], [3.7, 90.2], [64, 64], [127.9, 0.1], [128, 128]] as const) assert.ok(Math.abs(t.heightAt(x, z) - (0.1 * x - 0.05 * z + 3)) < 1e-3, `at ${x}, ${z}`);
  assert.equal(t.heightAt(-0.5, 10), -0.2);
  assert.equal(t.heightAt(60, 128.5), -0.2);
});

test('terrain: the finest grid that holds a point answers for it, and stepIn reports the finest spacing in a box', () => {
  const coarse = encodeGrid(new Float32Array(17 * 17).fill(10), { step: 8, x0: 0, z0: 0, nx: 17, nz: 17, q: 0.1 });
  const fine = encodeGrid(new Float32Array(11 * 11).fill(20), { step: 2, x0: 40, z0: 40, nx: 11, nz: 11, q: 0.1 });
  const file: TerrainFile = { attribution: '', source: '', groundY: -0.2, datumAod: 0, extent: EXT, grids: [coarse, fine] };
  const t = createTerrain(file);
  assert.ok(Math.abs(t.heightAt(10, 10) - 10) < 1e-6);
  assert.ok(Math.abs(t.heightAt(50, 50) - 20) < 1e-6);
  assert.ok(Math.abs(t.heightAt(60, 60) - 20) < 1e-6, 'the patch holds its own corner');
  assert.ok(Math.abs(t.heightAt(60.5, 60) - 10) < 1e-6);
  assert.equal(t.stepIn(0, 0, 30, 30), 8);
  assert.equal(t.stepIn(30, 30, 50, 50), 2);
  assert.equal(t.stepIn(200, 200, 210, 210), Infinity);
});

test('terrain: normalAt leans away from a slope and is straight up on flat ground; rangeUnder and seatY read the ground under a footprint', () => {
  const slope = terrainFromFunction((x) => 0.2 * x, EXT, 4); // rises to the east
  const [nx, ny, nz] = slope.normalAt(50, 50);
  assert.ok(nx < -0.15 && nx > -0.25 && ny > 0.95 && Math.abs(nz) < 1e-9, `${nx} ${ny} ${nz}`);
  const flat = terrainFromFunction(() => 2, EXT, 4);
  const f = flat.normalAt(50, 50);
  assert.ok(Math.abs(f[0]) < 1e-9 && Math.abs(f[1] - 1) < 1e-9);
  const ring: Pt[] = [[40, 40], [60, 40], [60, 60], [40, 60]];
  const r = slope.rangeUnder(ring);
  assert.ok(Math.abs(r.min - 8) < 0.01 && Math.abs(r.max - 12) < 0.01 && Math.abs(r.mean - 10) < 0.1, JSON.stringify(r));
  assert.ok(Math.abs(seatY(slope, ring) - 8) < 0.01);
  // a thin sliver that holds no lattice point still reports its corners and edge middles
  const sliver: Pt[] = [[10, 10], [30, 10.2], [30, 10.4]];
  assert.ok(Math.abs(slope.rangeUnder(sliver, 50).min - 2) < 0.01);
});

// ---- the mesh -------------------------------------------------------------------------------------

/** Every undirected edge of a mesh with how many triangles use it, and the signed area of each triangle seen from above. */
function edgeUse(mesh: { positions: Float32Array; indices: Uint32Array }): { edges: Map<string, number>; minArea: number; area: number } {
  const edges = new Map<string, number>();
  let minArea = Infinity;
  let area = 0;
  const p = mesh.positions;
  const key = (a: number, b: number): string => (a < b ? `${a}/${b}` : `${b}/${a}`);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] as number;
    const b = mesh.indices[i + 1] as number;
    const c = mesh.indices[i + 2] as number;
    for (const k of [key(a, b), key(b, c), key(c, a)]) edges.set(k, (edges.get(k) ?? 0) + 1);
    // normal.y of (b-a) x (c-a) is positive when the triangle is counter-clockwise seen from above
    const ux = (p[b * 3] as number) - (p[a * 3] as number);
    const uz = (p[b * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const vx = (p[c * 3] as number) - (p[a * 3] as number);
    const vz = (p[c * 3 + 2] as number) - (p[a * 3 + 2] as number);
    const ny = uz * vx - ux * vz;
    minArea = Math.min(minArea, ny / 2);
    area += ny / 2;
  }
  return { edges, minArea, area };
}

/** a small deterministic generator in [0, 1) */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** The height of the drawn surface at a point, found the slow way: the triangle that holds it, by barycentric weights. NaN if none does. */
function drawnHeight(m: TerrainMesh, x: number, z: number): number {
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i], m.indices[i + 1], m.indices[i + 2]] as [number, number, number];
    const P = (v: number): [number, number, number] => [m.positions[v * 3] as number, m.positions[v * 3 + 1] as number, m.positions[v * 3 + 2] as number];
    const [pa, pb, pc] = [P(a), P(b), P(c)];
    const d = (pb[2] - pc[2]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[2] - pc[2]);
    const l1 = ((pb[2] - pc[2]) * (x - pc[0]) + (pc[0] - pb[0]) * (z - pc[2])) / d;
    const l2 = ((pc[2] - pa[2]) * (x - pc[0]) + (pa[0] - pc[0]) * (z - pc[2])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * pa[1] + l2 * pb[1] + l3 * pc[1];
  }
  return Number.NaN;
}

const trench = (x: number, z: number): number => 0.02 * x + (Math.abs(z - 50) < 6 ? -5 : 0) + (x > 80 && x < 96 && z > 20 && z < 70 ? 3 : 0); // a canal and a step

test('terrain mesh: flat ground is a few big blocks; a trench makes small ones only where it is', () => {
  const flat = buildTerrainMesh(terrainFromFunction(() => 1, EXT, 2), { maxLeaf: 64 });
  assert.equal(flat.leaves, 4, 'a flat 128 m square is four 64 m blocks');
  assert.equal(flat.triangles, 8);
  const t = terrainFromFunction(trench, EXT, 2);
  const m = buildTerrainMesh(t, { maxLeaf: 64 });
  assert.ok(m.leaves > 20 && m.leaves < 1500, `${m.leaves} leaves`);
  const near = [...Array(m.vertices).keys()].filter((i) => Math.abs((m.positions[i * 3 + 2] as number) - 50) < 8).length;
  const far = [...Array(m.vertices).keys()].filter((i) => (m.positions[i * 3 + 2] as number) > 100).length;
  assert.ok(near > 3 * far, `${near} vertices by the trench against ${far} on open ground`);
  // every vertex is on the field exactly
  for (let i = 0; i < m.vertices; i++) {
    const x = m.positions[i * 3] as number;
    const z = m.positions[i * 3 + 2] as number;
    assert.ok(Math.abs((m.positions[i * 3 + 1] as number) - t.heightAt(x, z)) < 1e-4);
  }
});

test('terrain mesh: no cracks (each interior edge has two triangles, each boundary edge one), all counter-clockwise, area = extent', () => {
  const t = terrainFromFunction(trench, EXT, 2);
  const m = buildTerrainMesh(t, { maxLeaf: 64 });
  const { edges, minArea, area } = edgeUse(m);
  assert.ok(minArea > 0, `a triangle faces down or is degenerate (${minArea})`);
  assert.ok(Math.abs(area - 128 * 128) < 1e-3, `area ${area}`);
  let boundary = 0;
  for (const [k, n] of edges) {
    assert.ok(n === 1 || n === 2, `edge ${k} is used ${n} times`);
    if (n === 1) boundary++;
  }
  // the extent's perimeter is 4 x 128 m; every boundary edge is one lattice step of 1 m or longer, so at most 512 of them
  assert.ok(boundary >= 16 && boundary <= 512, `${boundary} boundary edges`);
});

test('terrain mesh: the surface stays within the tolerance of the field at points between the vertices', () => {
  const tol = 0.05;
  const t = terrainFromFunction((x, z) => 3 * Math.sin(x / 11) + 2 * Math.cos(z / 7), EXT, 2);
  const m = buildTerrainMesh(t, { maxLeaf: 64, tolerance: () => tol });
  let worst = 0;
  const rnd = lcg(99);
  for (let k = 0; k < 300; k++) {
    const x = rnd() * 127;
    const z = rnd() * 127;
    const y = drawnHeight(m, x, z);
    assert.ok(Number.isFinite(y), `no triangle at ${x}, ${z}`);
    worst = Math.max(worst, Math.abs(y - t.heightAt(x, z)));
  }
  assert.ok(worst < 2.5 * tol, `worst departure ${worst.toFixed(3)} m for tolerance ${tol}`);
});

test('terrain mesh: heightAt answers with the drawn triangles, fans at a change of block size included, and the field outside the extent', () => {
  const t = terrainFromFunction((x, z) => trench(x, z) + 1.5 * Math.sin(x / 9) * Math.cos(z / 13), EXT, 2);
  const m = buildTerrainMesh(t, { maxLeaf: 64, tolerance: (s) => 0.04 + s * 0.01 });
  assert.ok(m.triangles > 2 * m.leaves, `expected fans where blocks of two sizes meet (${m.triangles} triangles, ${m.leaves} leaves)`);
  const rnd = lcg(7);
  let worst = 0;
  for (let k = 0; k < 1500; k++) {
    const x = rnd() * 128;
    const z = rnd() * 128;
    worst = Math.max(worst, Math.abs(m.heightAt(x, z) - drawnHeight(m, x, z)));
  }
  assert.ok(worst < 1e-4, `heightAt differs from the triangle under the point by ${worst} m`);
  // every vertex of the mesh reads back as itself, and the extent's own edges answer too
  for (let i = 0; i < m.vertices; i += 7) assert.ok(Math.abs(m.heightAt(m.positions[i * 3] as number, m.positions[i * 3 + 2] as number) - (m.positions[i * 3 + 1] as number)) < 1e-4);
  for (const [x, z] of [[0, 0], [128, 128], [0, 128], [128, 0], [64, 0], [0, 64]] as const) assert.ok(Number.isFinite(m.heightAt(x, z)));
  assert.equal(m.heightAt(-5, 40), -0.2, 'outside the extent: the flat ground');
  assert.equal(m.heightAt(40, 500), -0.2);
});

test('terrain mesh: toleranceAt sets the tolerance where a block is and under what data, and wins over tolerance', () => {
  const t = terrainFromFunction((x, z) => 2 * Math.sin(x / 10) + Math.cos(z / 8), EXT, 2);
  const asked: { x: number; z: number; size: number; step: number }[] = [];
  const m = buildTerrainMesh(t, {
    maxLeaf: 64,
    tolerance: () => 1e-6, // would split to the grid everywhere, if it were consulted
    toleranceAt: (x, z, size, step) => {
      asked.push({ x, z, size, step });
      return x < 64 ? 0.02 : 2;
    },
  });
  assert.ok(asked.length > 4 && asked.every((a) => a.step === 2), 'every block is asked, with the finest grid spacing under it');
  assert.ok(asked.some((a) => a.size === 64) && asked.some((a) => a.size <= 8));
  const west = [...Array(m.vertices).keys()].filter((i) => (m.positions[i * 3] as number) < 64).length;
  const east = m.vertices - west;
  assert.ok(west > 8 * east, `${west} vertices where the tolerance is 2 cm, ${east} where it is 2 m`);
});

test('terrain mesh: overMesh is the same terrain with its ground read off the mesh', () => {
  const t = terrainFromFunction((x, z) => 3 * Math.sin(x / 11) + 2 * Math.cos(z / 7), EXT, 2);
  const m = buildTerrainMesh(t, { maxLeaf: 64, tolerance: () => 0.3 });
  const g = overMesh(t, m);
  assert.equal(g.heightAt(31.4, 77.7), m.heightAt(31.4, 77.7));
  assert.notEqual(g.heightAt(31.4, 77.7), t.heightAt(31.4, 77.7), 'a coarse mesh is not the field');
  assert.deepEqual([g.extent, g.groundY, g.datumAod], [t.extent, t.groundY, t.datumAod]);
  assert.equal(g.stepIn(0, 0, 128, 128), 2);
  const ring: Pt[] = [[20, 20], [60, 24], [58, 70], [18, 66]];
  const lowest = Math.min(...[...Array(41).keys()].flatMap((i) => [...Array(41).keys()].map((j) => m.heightAt(20 + i, 20 + j))));
  assert.ok(g.rangeUnder(ring, 1).min >= lowest - 1e-9 && g.rangeUnder(ring, 1).min < lowest + 0.5, 'seatY reads the mesh');
  assert.equal(seatY(g, ring, 2), g.rangeUnder(ring, 2).min);
  const n = g.normalAt(40, 40);
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9 && n[1] > 0);
});

// ---- how closely the mesh must follow --------------------------------------------------------------------

test('terrain distance: the distance to the nearest segment, within the raster\'s step, clamped at max', () => {
  const d = distanceField([[100, 100, 300, 100], [400, 300, 400, 500]], { x0: 0, z0: 0, x1: 512, z1: 512 }, 4, 150);
  assert.ok(Math.abs(d(200, 100)) < 1.5, 'on a segment');
  assert.ok(Math.abs(d(200, 140) - 40) < 2.5, `40 m beside it: ${d(200, 140)}`);
  assert.ok(Math.abs(d(200, 60) - 40) < 2.5);
  assert.ok(Math.abs(d(60, 100) - 40) < 3, `40 m beyond its end: ${d(60, 100)}`);
  assert.ok(Math.abs(d(340, 400) - 60) < 4, `60 m from the second segment: ${d(340, 400)}`);
  const diag = d(340, 160); // 60 m from the corner of the first segment's end (300, 100) along a diagonal: sqrt(40^2 + 60^2) = 72.1
  assert.ok(Math.abs(diag - Math.hypot(40, 60)) < 0.08 * 72 + 2, `diagonal: ${diag}`);
  assert.equal(d(0, 500), 150, 'clamped');
  assert.equal(d(-100, -100) > 0, true, 'outside the extent reads the edge');
});

test('terrain tolerance: fine at a rail, growing with distance to a cap, held to the data\'s own scale where the grids are finer than 4 m', () => {
  const dist = (x: number): number => x; // a "rail" along x = 0
  const tol = toleranceNearRails((x) => dist(x));
  const at = (x: number, size = 4, step = 4): number => tol(x - size / 2, 0, size, step);
  assert.ok(Math.abs(at(0) - NEAR_RAILS.fine) < 0.012, `at the rail: ${at(0)}`);
  let last = 0;
  for (const d of [0, 20, 40, 80, 120, 160, 400]) {
    assert.ok(at(d) >= last, `grows with distance (${d} m)`);
    last = at(d);
  }
  assert.equal(at(5000), NEAR_RAILS.cap);
  assert.equal(at(5000, 64), NEAR_RAILS.cap);
  // a big block is judged by its nearest edge (half its size nearer than its centre), so a coarse tolerance never reaches a rail
  assert.ok(at(40, 64) < 0.8 * at(40, 4), `a 64 m block centred 40 m out: ${at(40, 64)}, a 4 m one: ${at(40, 4)}`);
  assert.equal(tol(1000, 0, 4, 1), 0.04);
  assert.equal(tol(1000, 0, 4, 2), 0.06);
  assert.equal(toleranceNearRails(() => 1000, { cap: 0.3, fine: 0.01 })(0, 0, 4, 8), 0.3, 'the numbers can be overridden');
});

test('terrain mesh: exclude removes exactly the triangles whose centre is inside, and nothing else', () => {
  const t = terrainFromFunction(trench, EXT, 2);
  const all = buildTerrainMesh(t, { maxLeaf: 64 });
  const hole = (x: number, z: number): boolean => x > 20 && x < 44 && z > 20 && z < 44;
  const cut = buildTerrainMesh(t, { maxLeaf: 64, exclude: hole });
  assert.ok(cut.triangles < all.triangles);
  const a = edgeUse(all).area;
  const b = edgeUse(cut).area;
  assert.ok(a - b > 24 * 24 * 0.5 && a - b < 24 * 24 * 2, `lost ${a - b} m2`);
  for (let i = 0; i < cut.indices.length; i += 3) {
    const cx = [0, 1, 2].reduce((s, k) => s + (cut.positions[(cut.indices[i + k] as number) * 3] as number), 0) / 3;
    const cz = [0, 1, 2].reduce((s, k) => s + (cut.positions[(cut.indices[i + k] as number) * 3 + 2] as number), 0) / 3;
    assert.ok(!hole(cx, cz), 'a triangle inside the hole survived');
  }
});

test('terrain mesh: triangles are sorted into ground, bank and wall by their own steepness, and none is lost', () => {
  const deg = (d: number): number => Math.tan((d * Math.PI) / 180);
  for (const [angle, want] of [[5, 'ground'], [20, 'ground'], [40, 'bank'], [50, 'bank'], [65, 'wall'], [80, 'wall']] as const) {
    const m = buildTerrainMesh(terrainFromFunction((x) => deg(angle) * x, EXT, 2), { maxLeaf: 64 });
    const s = splitBySlope(m);
    assert.equal(s.ground.length + s.bank.length + s.wall.length, m.indices.length, 'every triangle lands in exactly one class');
    assert.equal(s[want].length, m.indices.length, `a ${angle} degree slope is ${want}`);
  }
  // a plain with a ridge: both classes appear
  const ridge = buildTerrainMesh(terrainFromFunction((x) => (x > 60 ? 1.5 * (x - 60) : 0), EXT, 2), { maxLeaf: 64 });
  const split = splitBySlope(ridge);
  assert.ok(split.ground.length > 0 && split.wall.length === 0 && split.bank.length > 0, `${split.ground.length} ground, ${split.bank.length} bank, ${split.wall.length} wall`);
});

test('terrain mesh: a wall is a region: the steep faces that touch it join it, and a patch too small to be a wall is a bank', () => {
  const rad = (d: number): number => (d * Math.PI) / 180;
  const OLD = { wallKeepDeg: 58, wallMinArea: 0 }; // every face steeper than wallDeg on its own
  const centroid = (m: TerrainMesh, indices: Uint32Array, i: number): [number, number] => {
    let x = 0;
    let z = 0;
    for (let k = 0; k < 3; k++) {
      x += m.positions[(indices[i + k] as number) * 3] as number;
      z += m.positions[(indices[i + k] as number) * 3 + 2] as number;
    }
    return [x / 3, z / 3];
  };
  // a 65 degree scarp from x = 60 to 72, then a 52 degree slope: steeper than a bank, short of a wall on its own
  const rise = Math.tan(rad(65)) * 12;
  const scarp = buildTerrainMesh(terrainFromFunction((x) => (x < 60 ? 0 : x < 72 ? Math.tan(rad(65)) * (x - 60) : rise + Math.tan(rad(52)) * (x - 72)), EXT, 2), { maxLeaf: 64 });
  const joined = splitBySlope(scarp);
  const alone = splitBySlope(scarp, OLD);
  let steeper = 0;
  let touching = 0;
  for (let i = 0; i < joined.wall.length; i += 3) if (centroid(scarp, joined.wall, i)[0] > 74) touching += 1;
  for (let i = 0; i < alone.wall.length; i += 3) if (centroid(scarp, alone.wall, i)[0] > 74) steeper += 1;
  assert.equal(steeper, 0, 'on their own the 52 degree faces are only a bank');
  assert.ok(touching > 0, 'the 52 degree faces that touch the scarp are wall with it');
  for (let i = 0; i < joined.ground.length; i += 3) assert.ok(centroid(scarp, joined.ground, i)[0] < 62, 'only the plain below is ground');
  assert.equal(joined.ground.length + joined.bank.length + joined.wall.length, scarp.indices.length, 'every triangle is in exactly one class');
  // a lone peak with 60 degree faces: steep, but a few square metres
  const peak = buildTerrainMesh(terrainFromFunction((x, z) => (x === 64 && z === 64 ? 3.5 : 0), EXT, 2), { maxLeaf: 64 });
  const old = splitBySlope(peak, OLD);
  assert.ok(old.wall.length > 0, 'each face of the peak is steeper than a wall limit');
  let patch = 0;
  for (let i = 0; i < old.wall.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (old.wall[i + k] as number) * 3) as [number, number, number];
    const u = [0, 1, 2].map((k) => (peak.positions[b + k] as number) - (peak.positions[a + k] as number));
    const v = [0, 1, 2].map((k) => (peak.positions[c + k] as number) - (peak.positions[a + k] as number));
    patch += Math.hypot((u[1] as number) * (v[2] as number) - (u[2] as number) * (v[1] as number), (u[2] as number) * (v[0] as number) - (u[0] as number) * (v[2] as number), (u[0] as number) * (v[1] as number) - (u[1] as number) * (v[0] as number)) / 2;
  }
  assert.ok(patch < SLOPE.wallMinArea, `the peak is ${patch.toFixed(1)} m2 of steep face, under the ${SLOPE.wallMinArea} m2 a wall needs`);
  const now = splitBySlope(peak);
  assert.equal(now.wall.length, 0, 'too small to be a wall');
  assert.ok(now.bank.length >= old.wall.length, 'it is a bank');
});

test('terrain mesh: an extent that is not a whole number of blocks is refused', () => {
  const t = terrainFromFunction(() => 0, { x0: 0, z0: 0, x1: 100, z1: 64 }, 2);
  assert.throws(() => buildTerrainMesh(t, { maxLeaf: 64 }), /whole number/);
});

// ---- the committed data ---------------------------------------------------------------------------

const file: TerrainFile = JSON.parse(readFileSync(new URL('../../web/src/data/kx-terrain.json', import.meta.url), 'utf8'));
const track: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const terrain: Terrain = createTerrain(file);
const GROUND_Y = -0.2;

test('terrain data: credits the Environment Agency, records the datum and holds the model extent in whole 64 m blocks', () => {
  assert.match(file.attribution, /Environment Agency/);
  assert.match(file.attribution, /Open Government Licence/);
  assert.equal(file.groundY, GROUND_Y);
  assert.ok(file.datumAod > 16 && file.datumAod < 18, `datum ${file.datumAod} m AOD`);
  assert.equal((file.extent.x1 - file.extent.x0) % 64, 0);
  assert.equal((file.extent.z1 - file.extent.z0) % 64, 0);
  const steps = file.grids.map((g) => g.step);
  assert.equal(steps[0], 8, 'the base grid comes first: it is the parent every patch is blended into');
  assert.deepEqual([...new Set(steps)].sort((a, b) => b - a), [8, 4, 2, 1]);
  const base = file.grids[0] as TerrainFile['grids'][number];
  assert.deepEqual([base.x0, base.z0, base.x0 + (base.nx - 1) * base.step, base.z0 + (base.nz - 1) * base.step], [file.extent.x0, file.extent.z0, file.extent.x1, file.extent.z1], 'the base grid covers the whole extent');
  for (const g of file.grids) {
    assert.ok(g.x0 >= file.extent.x0 && g.x0 + (g.nx - 1) * g.step <= file.extent.x1 && g.z0 >= file.extent.z0 && g.z0 + (g.nz - 1) * g.step <= file.extent.z1, 'a grid sticks out of the extent');
    assert.ok(g.x0 % g.step === 0 && g.z0 % g.step === 0, 'grid nodes sit on the lattice');
  }
});

test('terrain data: every height is finite and plausible for London re-levelled to the rails, and the edge of the extent is the flat plane', () => {
  for (const g of terrain.grids) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of g.h) {
      assert.ok(Number.isFinite(v));
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    assert.ok(lo > -15 && hi < 40, `${g.step} m grid runs ${lo}..${hi}`);
  }
  const e = file.extent;
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    for (const [x, z] of [[e.x0 + t * (e.x1 - e.x0), e.z0], [e.x0 + t * (e.x1 - e.x0), e.z1], [e.x0, e.z0 + t * (e.z1 - e.z0)], [e.x1, e.z0 + t * (e.z1 - e.z0)]] as const) {
      assert.ok(Math.abs(terrain.heightAt(x, z) - GROUND_Y) < 0.06, `edge at ${x}, ${z}: ${terrain.heightAt(x, z)}`);
    }
  }
});

test('terrain data: the ground is the track bed (GROUND_Y) under every open ECML rail and under the buffer stops', () => {
  const pos = new Map(track.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  let checked = 0;
  for (const r of track.rails) {
    if (r.ref !== 'ECM1' || r.tunnel || r.bridge) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i] as number) as Pt;
      const b = pos.get(r.nodes[i + 1] as number) as Pt;
      for (const t of [0.15, 0.5, 0.85]) {
        const h = terrain.heightAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        assert.ok(Math.abs(h - GROUND_Y) < 0.08, `ECML way ${r.id} at (${(a[0] + (b[0] - a[0]) * t).toFixed(1)}, ${(a[1] + (b[1] - a[1]) * t).toFixed(1)}): ground ${h.toFixed(2)}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 150, `${checked} points checked`);
  for (const b of track.buffers) {
    if (b.z < -50 || b.z > 0) continue;
    assert.ok(Math.abs(terrain.heightAt(b.x, b.z) - GROUND_Y) < 0.08, `buffer ${b.id}`);
  }
});

test('terrain data: the three tunnel mouths are cuttings with earth over the bores and a clear floor in front', () => {
  const mouths = tunnelMouths(track);
  assert.equal(mouths.length, 3);
  for (const m of mouths) {
    const at = (u: number, w: number): number => terrain.heightAt(m.origin[0] + m.across[0] * u + m.axis[0] * w, m.origin[1] + m.across[1] * u + m.axis[1] * w);
    for (const bore of m.bores) {
      for (const tr of bore.tracks) {
        // in front of the face the ground is the track bed; behind it, over the first 8 m of the bore, it is above the crown
        for (const w of [-12, -6, -3]) assert.ok(Math.abs(at(tr.lateral, w) - GROUND_Y) < 0.1, `${m.id}: floor at ${w} m is ${at(tr.lateral, w).toFixed(2)}`);
        for (const w of [2.5, 4, 6, 8, 10]) assert.ok(at(tr.lateral, w) >= FIGURES.tunnel.crown + 0.9, `${m.id}: ground ${at(tr.lateral, w).toFixed(2)} m at w = ${w} is not over the crown`);
      }
    }
  }
});

test('terrain data: the model rail datum: ground at the shed ends is where the model expects, and the cutting walls are real (earth 5 m+ above the floor near a mouth)', () => {
  const [gasworksSouth, gasworksNorth, copenhagen] = tunnelMouths(track) as [ReturnType<typeof tunnelMouths>[number], ReturnType<typeof tunnelMouths>[number], ReturnType<typeof tunnelMouths>[number]];
  for (const m of [gasworksSouth, gasworksNorth, copenhagen]) {
    const behind = terrain.heightAt(m.origin[0] + m.axis[0] * 14, m.origin[1] + m.axis[1] * 14);
    assert.ok(behind > 5, `${m.id}: ground 14 m behind the face is ${behind.toFixed(1)} m`);
  }
  // the Gasworks Tunnel runs under the Regent's Canal: the ground there is a canal bed, lower than the ground 60 m on either side
  assert.equal(gasworksSouth.id, 'gasworks-south');
  // THE MODEL RAIL DATUM. y = 0 is the rail head at the shed's buffer stops and the ground that carries it is GROUND_Y: the level the grids are re-levelled
  // to (tools/build-terrain.ts) and the one the shed's walls and the platform walls start from (web/src/shed.ts, web/src/furniture.ts). The file records
  // it, and the AOD of that rail head (the build tool's header: "from the buffers (16.8 m AOD)").
  assert.equal(file.groundY, GROUND_Y, 'the datum: the file records the ground a railway stands on');
  assert.ok(Math.abs(file.datumAod - 16.8) < 0.15, `the datum: the rail head at the buffer stops is ${file.datumAod} m AOD, the build tool's header says 16.8`);
  // So the ground is GROUND_Y at both ends of the shed: at every buffer stop (the south end) ...
  const shed = shedLayout(track);
  const stops = shedBufferStops(track, shed);
  assert.ok(stops.length >= 9, `${stops.length} buffer stops at the south end of the shed`);
  for (const s of stops) {
    const ground = terrain.heightAt(s.x, s.z);
    assert.ok(Math.abs(ground - GROUND_Y) < 0.05, `buffer stop ${s.id}: the ground is ${ground.toFixed(2)} m, the datum puts it at ${GROUND_Y} m`);
  }
  // ... and under the open main-line rails in the last 20 m of each end (v is the distance north of the shed's south wall)
  const pos = new Map(track.nodes.map(([id, x, z]) => [id, [x, z] as Pt]));
  const sampled = { south: 0, north: 0 };
  for (const r of track.rails) {
    if (r.ref !== 'ECM1' || r.tunnel || r.bridge) continue;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i] as number) as Pt;
      const b = pos.get(r.nodes[i + 1] as number) as Pt;
      for (let k = 0; k <= 20; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / 20;
        const z = a[1] + ((b[1] - a[1]) * k) / 20;
        const { u, v } = worldToShed(shed, [x, z]);
        const end = u < 0 || u > shed.width ? null : v >= 0 && v < 20 ? 'south' : v > shed.length - 20 && v <= shed.length ? 'north' : null;
        if (!end) continue;
        sampled[end]++;
        const ground = terrain.heightAt(x, z);
        assert.ok(Math.abs(ground - GROUND_Y) < 0.05, `the ${end} end of the shed, ECML way ${r.id} at (${x.toFixed(1)}, ${z.toFixed(1)}): the ground is ${ground.toFixed(2)} m, the datum puts it at ${GROUND_Y} m`);
      }
    }
  }
  assert.ok(sampled.south > 20 && sampled.north > 10, `rail points sampled at the ends of the shed: ${JSON.stringify(sampled)}`);
});

test('terrain data: the grids fit the budget (committed JSON under 400 kB, 150 kB gzipped is the build tool\'s check)', () => {
  const bytes = readFileSync(new URL('../../web/src/data/kx-terrain.json', import.meta.url)).length;
  assert.ok(bytes < 400_000, `${bytes} bytes`);
});
