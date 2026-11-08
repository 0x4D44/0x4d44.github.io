// The ground under King's Cross as numbers: a height field in the model's frame (x east, z south, y up,
// metres; core/geo.ts) and the adaptive triangle mesh drawn from it. Pure functions, no three.js and no
// I/O, so the rules are testable without a browser. The page's web/src/world.ts only turns this into meshes.
//
// WHERE THE HEIGHTS COME FROM. tools/build-terrain.ts reduces the Environment Agency's LIDAR Composite
// DTM 1 m (bare earth, Open Government Licence v3) to the grids in web/src/data/kx-terrain.json, already
// re-levelled to the model: the rail head at the station buffers is y = 0, the ground under every track bed
// is GROUND_Y, and the land around a railway is moved up or down with the real fall of the line so a
// cutting keeps its real depth (see the build tool's header for the rule and the numbers).
//
// THE FILE. A few grids of different spacing, coarse first. Each is a rectangle of nodes `step` metres
// apart; heights are whole multiples of `q` metres, stored as a zigzag varint stream of the differences
// from a planar guess (W + N - NW), base64 text so it sits in JSON and gzips well. `heightAt` asks the
// finest grid that holds the point and interpolates bilinearly inside its cell. Outside every grid the
// ground is `groundY`, the flat plane web/src/world.ts keeps for the rest of the world.
import type { Pt } from './geo.ts';

export interface Extent {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** One grid as written to kx-terrain.json. */
export interface GridFile {
  /** metres between nodes */
  step: number;
  /** model x and z of node (0, 0), the north-west corner */
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** metres per height unit */
  q: number;
  /** base64 of the zigzag varint residuals, row by row (z outer, x inner) */
  data: string;
}

export interface TerrainFile {
  attribution: string;
  /** where the numbers came from and what was done to them */
  source: string;
  /** y of ground a railway is built on, and of everything outside the grids */
  groundY: number;
  /** metres above Ordnance Datum (Newlyn) of the rail head at the King's Cross buffer stops, i.e. y = 0 */
  datumAod: number;
  extent: Extent;
  grids: GridFile[];
}

// ---- encoding ------------------------------------------------------------------------------------

/** Zigzag varint residuals of an integer height grid against the planar guess W + N - NW. */
export function encodeUnits(units: ArrayLike<number>, nx: number, nz: number): Uint8Array {
  const out: number[] = [];
  const at = (i: number, j: number): number => units[j * nx + i] as number;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const w = i ? at(i - 1, j) : j ? at(i, j - 1) : 0;
      const n = j ? at(i, j - 1) : w;
      const nw = i && j ? at(i - 1, j - 1) : n;
      const guess = i && j ? w + n - nw : i ? w : n;
      const d = at(i, j) - guess;
      let v = d >= 0 ? d * 2 : -d * 2 - 1;
      while (v >= 128) {
        out.push((v & 127) | 128);
        v = Math.floor(v / 128);
      }
      out.push(v);
    }
  }
  return Uint8Array.from(out);
}

export function decodeUnits(bytes: Uint8Array, nx: number, nz: number): Int32Array {
  const units = new Int32Array(nx * nz);
  let p = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let v = 0;
      let shift = 1;
      for (;;) {
        if (p >= bytes.length) throw new Error('terrain grid data ends early');
        const b = bytes[p++] as number;
        v += (b & 127) * shift;
        if (b < 128) break;
        shift *= 128;
      }
      const d = v % 2 === 0 ? v / 2 : -(v + 1) / 2;
      const w = i ? (units[j * nx + i - 1] as number) : j ? (units[(j - 1) * nx + i] as number) : 0;
      const n = j ? (units[(j - 1) * nx + i] as number) : w;
      const nw = i && j ? (units[(j - 1) * nx + i - 1] as number) : n;
      const guess = i && j ? w + n - nw : i ? w : n;
      units[j * nx + i] = guess + d;
    }
  }
  if (p !== bytes.length) throw new Error('terrain grid data has trailing bytes');
  return units;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/** Heights in metres to a grid file entry (rounded to whole multiples of q). */
export function encodeGrid(heights: ArrayLike<number>, g: Pick<GridFile, 'step' | 'x0' | 'z0' | 'nx' | 'nz' | 'q'>): GridFile {
  const units = new Int32Array(g.nx * g.nz);
  for (let i = 0; i < units.length; i++) units[i] = Math.round((heights[i] as number) / g.q);
  return { step: g.step, x0: g.x0, z0: g.z0, nx: g.nx, nz: g.nz, q: g.q, data: toBase64(encodeUnits(units, g.nx, g.nz)) };
}

// ---- the height field ----------------------------------------------------------------------------

export interface Grid {
  step: number;
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** east and south limits (the last node) */
  x1: number;
  z1: number;
  /** node heights, metres */
  h: Float32Array;
}

export function decodeGrid(f: GridFile): Grid {
  const units = decodeUnits(fromBase64(f.data), f.nx, f.nz);
  const h = new Float32Array(units.length);
  for (let i = 0; i < h.length; i++) h[i] = (units[i] as number) * f.q;
  return { step: f.step, x0: f.x0, z0: f.z0, nx: f.nx, nz: f.nz, x1: f.x0 + (f.nx - 1) * f.step, z1: f.z0 + (f.nz - 1) * f.step, h };
}

/** Bilinear height of one grid at a point inside it. */
export function sampleGrid(g: Grid, x: number, z: number): number {
  const fx = (x - g.x0) / g.step;
  const fz = (z - g.z0) / g.step;
  const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
  const tx = Math.max(0, Math.min(1, fx - i));
  const tz = Math.max(0, Math.min(1, fz - j));
  const o = j * g.nx + i;
  const a = g.h[o] as number;
  const b = g.h[o + 1] as number;
  const c = g.h[o + g.nx] as number;
  const d = g.h[o + g.nx + 1] as number;
  return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
}

export interface Terrain {
  extent: Extent;
  groundY: number;
  datumAod: number;
  grids: readonly Grid[];
  /** Ground height at a model point: the finest grid that holds it, bilinear; `groundY` outside every grid. */
  heightAt(x: number, z: number): number;
  /** The smallest node spacing of any grid that overlaps the rectangle (metres); Infinity if none does. */
  stepIn(x0: number, z0: number, x1: number, z1: number): number;
  /** Unit surface normal [x, y, z] from central differences over `d` metres (default: the local node spacing). */
  normalAt(x: number, z: number, d?: number): [number, number, number];
  /** Lowest and highest ground under a polygon: its corners, edge midpoints and an interior lattice of about `spacing` metres. */
  rangeUnder(pts: readonly Pt[], spacing?: number): { min: number; max: number; mean: number };
}

export function createTerrain(file: TerrainFile): Terrain {
  const grids = file.grids.map(decodeGrid);
  const fineFirst = [...grids].sort((a, b) => a.step - b.step);
  const groundY = file.groundY;
  const heightAt = (x: number, z: number): number => {
    for (const g of fineFirst) if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1) return sampleGrid(g, x, z);
    return groundY;
  };
  return terrainWith({ extent: file.extent, groundY, datumAod: file.datumAod, grids }, heightAt);
}

/**
 * The same terrain with its ground read off the mesh drawn for it (`TerrainMesh.heightAt`) instead of the field the mesh
 * approximates. Seat everything that stands on the ground on this one: the field and the mesh differ by up to the mesh's
 * tolerance, and the mesh is what the eye sees.
 */
export function overMesh(terrain: Terrain, mesh: Pick<TerrainMesh, 'heightAt'>): Terrain {
  return terrainWith({ extent: terrain.extent, groundY: terrain.groundY, datumAod: terrain.datumAod, grids: terrain.grids }, mesh.heightAt);
}

function terrainWith(base: Pick<Terrain, 'extent' | 'groundY' | 'datumAod' | 'grids'>, heightAt: (x: number, z: number) => number): Terrain {
  const { grids, groundY } = base;
  const stepIn = (x0: number, z0: number, x1: number, z1: number): number => {
    let best = Infinity;
    for (const g of grids) if (g.step < best && x1 >= g.x0 && x0 <= g.x1 && z1 >= g.z0 && z0 <= g.z1) best = g.step;
    return best;
  };
  const stepAt = (x: number, z: number): number => stepIn(x, z, x, z);
  return {
    ...base,
    heightAt,
    stepIn,
    normalAt(x, z, d) {
      const s = d ?? Math.min(4, Math.max(0.5, stepAt(x, z) === Infinity ? 4 : stepAt(x, z)));
      const dx = heightAt(x + s, z) - heightAt(x - s, z);
      const dz = heightAt(x, z + s) - heightAt(x, z - s);
      const nx = -dx / (2 * s);
      const nz = -dz / (2 * s);
      const l = Math.hypot(nx, 1, nz);
      return [nx / l, 1 / l, nz / l];
    },
    rangeUnder(pts, spacing = 4) {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let n = 0;
      const take = (x: number, z: number): void => {
        const h = heightAt(x, z);
        if (h < min) min = h;
        if (h > max) max = h;
        sum += h;
        n++;
      };
      let bx0 = Infinity;
      let bz0 = Infinity;
      let bx1 = -Infinity;
      let bz1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i] as Pt;
        const q = pts[(i + 1) % pts.length] as Pt;
        take(p[0], p[1]);
        take((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
        bx0 = Math.min(bx0, p[0]);
        bx1 = Math.max(bx1, p[0]);
        bz0 = Math.min(bz0, p[1]);
        bz1 = Math.max(bz1, p[1]);
      }
      for (let x = bx0 + spacing / 2; x < bx1; x += spacing) {
        for (let z = bz0 + spacing / 2; z < bz1; z += spacing) if (pointInRing(x, z, pts)) take(x, z);
      }
      return n ? { min, max, mean: sum / n } : { min: groundY, max: groundY, mean: groundY };
    },
  };
}

/**
 * Where a building's base goes: the lowest ground under its footprint (corners, edge midpoints and an interior lattice
 * about `spacing` metres apart). The wall bottoms stand on it, so nothing floats; on a slope the uphill side is in the ground.
 */
export function seatY(terrain: Pick<Terrain, 'rangeUnder'>, ring: readonly Pt[], spacing = 2): number {
  return terrain.rangeUnder(ring, spacing).min;
}

/** A terrain from a function on one grid: for tests and tools that need a known surface (a slope, a trench). Heights round to `q` (default 1 mm). */
export function terrainFromFunction(
  f: (x: number, z: number) => number,
  extent: Extent,
  step: number,
  opts: { groundY?: number; q?: number; datumAod?: number } = {},
): Terrain {
  const q = opts.q ?? 0.001;
  const nx = Math.round((extent.x1 - extent.x0) / step) + 1;
  const nz = Math.round((extent.z1 - extent.z0) / step) + 1;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = f(extent.x0 + i * step, extent.z0 + j * step);
  return createTerrain({
    attribution: 'synthetic',
    source: 'terrainFromFunction',
    groundY: opts.groundY ?? -0.2,
    datumAod: opts.datumAod ?? 0,
    extent,
    grids: [encodeGrid(h, { step, x0: extent.x0, z0: extent.z0, nx, nz, q })],
  });
}

function pointInRing(x: number, z: number, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as Pt;
    const b = pts[j] as Pt;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

// ---- the adaptive mesh ---------------------------------------------------------------------------

export interface MeshOptions {
  /** Largest leaf, metres (a power of two; the extent must be a whole number of these). Default 64. */
  maxLeaf?: number;
  /** Largest allowed departure of the surface from the field, metres, for a leaf of this size. Default 0.05 up to 16 m, then growing. */
  tolerance?: (size: number) => number;
  /**
   * The same, but told where the block is and the finest grid spacing under it (`step`, metres): a coarse tolerance
   * far from the railway, a fine one where the data are fine. Wins over `tolerance` when both are given.
   */
  toleranceAt?: (x0: number, z0: number, size: number, step: number) => number;
  /** Force a block this size at this corner to split down to the grid spacing (the portal zones). */
  detail?: (x0: number, z0: number, size: number) => boolean;
  /** Leave out a triangle whose centre is here (a hole for something that stands in the ground). */
  exclude?: (x: number, z: number) => boolean;
}

export interface TerrainMesh {
  /** x, y, z per vertex */
  positions: Float32Array;
  /** counter-clockwise seen from above */
  indices: Uint32Array;
  leaves: number;
  vertices: number;
  triangles: number;
  /**
   * Height of the surface the mesh draws (its triangles, not the field they approximate) at a point; the field's
   * height outside the extent. Whatever stands on the ground should be seated on this, or it floats or sinks by
   * the tolerance. A portal's `exclude` hole is not honoured: the surface is answered as if it were filled.
   */
  heightAt(x: number, z: number): number;
}

interface Node {
  x: number;
  z: number;
  s: number;
  kids: [Node, Node, Node, Node] | null;
  /** index into the per-leaf vertex table, set once the leaves are collected */
  id: number;
}

const defaultTolerance = (size: number): number => (size <= 16 ? 0.05 : 0.05 + (size - 16) * 0.004);

/** Ints per leaf in the vertex table `buildTerrainMesh` keeps for `TerrainMesh.heightAt`. */
const LEAF_INTS = 10;

/**
 * A restricted quadtree over the extent: blocks split until the surface through their corners is within
 * `tolerance` of the field (or they reach the grid spacing); neighbours differ by at most one level, and a
 * block next to smaller ones gets their edge vertices, so the mesh has no cracks. Everything is on a 1 m lattice
 * from the extent's north-west corner, which is why the grids' spacings are whole metres.
 */
export function buildTerrainMesh(terrain: Pick<Terrain, 'extent' | 'heightAt' | 'stepIn'>, opts: MeshOptions = {}): TerrainMesh {
  const { x0, z0, x1, z1 } = terrain.extent;
  const maxLeaf = opts.maxLeaf ?? 64;
  const tol = opts.tolerance ?? defaultTolerance;
  const H = terrain.heightAt;
  const nbx = Math.round((x1 - x0) / maxLeaf);
  const nbz = Math.round((z1 - z0) / maxLeaf);
  if (nbx * maxLeaf !== x1 - x0 || nbz * maxLeaf !== z1 - z0) throw new Error('terrain extent must be a whole number of maxLeaf blocks');
  const roots: Node[] = [];
  for (let j = 0; j < nbz; j++) for (let i = 0; i < nbx; i++) roots.push({ x: x0 + i * maxLeaf, z: z0 + j * maxLeaf, s: maxLeaf, kids: null, id: -1 });

  const leafAt = (px: number, pz: number): Node | null => {
    const bi = Math.floor((px - x0) / maxLeaf);
    const bj = Math.floor((pz - z0) / maxLeaf);
    if (bi < 0 || bj < 0 || bi >= nbx || bj >= nbz) return null;
    let n = roots[bj * nbx + bi] as Node;
    while (n.kids) {
      const h = n.s / 2;
      n = n.kids[(px >= n.x + h ? 1 : 0) + (pz >= n.z + h ? 2 : 0)] as Node;
    }
    return n;
  };
  const split = (n: Node): void => {
    const h = n.s / 2;
    n.kids = [
      { x: n.x, z: n.z, s: h, kids: null, id: -1 },
      { x: n.x + h, z: n.z, s: h, kids: null, id: -1 },
      { x: n.x, z: n.z + h, s: h, kids: null, id: -1 },
      { x: n.x + h, z: n.z + h, s: h, kids: null, id: -1 },
    ];
  };
  const ensureSplit = (n: Node): void => {
    if (n.kids) return;
    const e = 1e-3;
    const m = n.s / 2;
    for (const [px, pz] of [[n.x - e, n.z + m], [n.x + n.s + e, n.z + m], [n.x + m, n.z - e], [n.x + m, n.z + n.s + e]] as const) {
      const nb = leafAt(px, pz);
      if (nb && nb.s > n.s) ensureSplit(nb);
    }
    split(n);
  };

  const surfaceError = (n: Node): number => {
    // sample about every 2 m (but never fewer than 2 intervals, never more than 16), so a trench 3 m wide is not skipped
    const k = Math.max(2, Math.min(16, Math.round(n.s / 2)));
    const a = H(n.x, n.z);
    const b = H(n.x + n.s, n.z);
    const c = H(n.x, n.z + n.s);
    const d = H(n.x + n.s, n.z + n.s);
    let worst = 0;
    for (let j = 0; j <= k; j++) {
      for (let i = 0; i <= k; i++) {
        const tx = i / k;
        const tz = j / k;
        const guess = a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
        const e = Math.abs(H(n.x + tx * n.s, n.z + tz * n.s) - guess);
        if (e > worst) worst = e;
      }
    }
    return worst;
  };

  const refine = (n: Node): void => {
    if (!n.kids) {
      const floor = terrain.stepIn(n.x, n.z, n.x + n.s, n.z + n.s);
      if (n.s <= floor || n.s <= 1 || !Number.isFinite(floor)) return;
      const limit = opts.toleranceAt ? opts.toleranceAt(n.x, n.z, n.s, floor) : tol(n.s);
      if (!(opts.detail?.(n.x, n.z, n.s) || surfaceError(n) > limit)) return;
      ensureSplit(n);
    }
    for (const k of n.kids ?? []) refine(k);
  };
  for (const r of roots) refine(r);

  // collect leaves
  const leaves: Node[] = [];
  const walk = (n: Node): void => {
    if (n.kids) for (const k of n.kids) walk(k);
    else leaves.push(n);
  };
  for (const r of roots) walk(r);

  const width = x1 - x0 + 1;
  const index = new Map<number, number>();
  const pos: number[] = [];
  const vertex = (x: number, z: number): number => {
    const key = Math.round(z - z0) * width + Math.round(x - x0);
    let v = index.get(key);
    if (v === undefined) {
      v = pos.length / 3;
      index.set(key, v);
      pos.push(x, H(x, z), z);
    }
    return v;
  };
  const tris: number[] = [];
  const keep = (a: number, b: number, c: number): void => {
    if (opts.exclude) {
      const cx = ((pos[a * 3] as number) + (pos[b * 3] as number) + (pos[c * 3] as number)) / 3;
      const cz = ((pos[a * 3 + 2] as number) + (pos[b * 3 + 2] as number) + (pos[c * 3 + 2] as number)) / 3;
      if (opts.exclude(cx, cz)) return;
    }
    tris.push(a, b, c);
  };
  // per leaf, the vertices of its triangles: nw, ne, sw, se, centre, and the north, east, south, west edge midpoints
  // (-1 where it has none), then 1 if the plain two-triangle form runs its diagonal nw-se, else 0
  const table = new Int32Array(leaves.length * LEAF_INTS).fill(-1);
  for (let li = 0; li < leaves.length; li++) {
    const n = leaves[li] as Node;
    n.id = li;
    const o = li * LEAF_INTS;
    const h = n.s / 2;
    const e = 1e-3;
    // does the neighbour across this side hold smaller blocks?
    const finer = (px: number, pz: number): boolean => {
      const nb = leafAt(px, pz);
      return !!nb && nb.s < n.s;
    };
    const north = finer(n.x + h, n.z - e);
    const south = finer(n.x + h, n.z + n.s + e);
    const west = finer(n.x - e, n.z + h);
    const east = finer(n.x + n.s + e, n.z + h);
    const nw = vertex(n.x, n.z);
    const ne = vertex(n.x + n.s, n.z);
    const sw = vertex(n.x, n.z + n.s);
    const se = vertex(n.x + n.s, n.z + n.s);
    table[o] = nw;
    table[o + 1] = ne;
    table[o + 2] = sw;
    table[o + 3] = se;
    if (!north && !south && !west && !east) {
      // counter-clockwise from above is nw, sw, se, ne (x east, z south): pick the diagonal that follows the surface
      const d1 = Math.abs((pos[nw * 3 + 1] as number) - (pos[se * 3 + 1] as number));
      const d2 = Math.abs((pos[ne * 3 + 1] as number) - (pos[sw * 3 + 1] as number));
      if (d1 <= d2) {
        table[o + 9] = 1;
        keep(nw, sw, se);
        keep(nw, se, ne);
      } else {
        table[o + 9] = 0;
        keep(nw, sw, ne);
        keep(ne, sw, se);
      }
      continue;
    }
    const mid = (ok: boolean, slot: number, px: number, pz: number): number => {
      if (!ok) return -1;
      const v = vertex(px, pz);
      table[o + slot] = v;
      return v;
    };
    const ring: number[] = [nw];
    if (north) ring.push(mid(north, 5, n.x + h, n.z));
    ring.push(ne);
    if (east) ring.push(mid(east, 6, n.x + n.s, n.z + h));
    ring.push(se);
    if (south) ring.push(mid(south, 7, n.x + h, n.z + n.s));
    ring.push(sw);
    if (west) ring.push(mid(west, 8, n.x, n.z + h));
    const c = vertex(n.x + h, n.z + h);
    table[o + 4] = c;
    // the ring above runs nw -> ne -> se -> sw: clockwise from above, so flip each fan triangle
    for (let i = 0; i < ring.length; i++) keep(c, ring[(i + 1) % ring.length] as number, ring[i] as number);
  }
  const positions = Float32Array.from(pos);
  const hy = (v: number): number => positions[v * 3 + 1] as number;
  const heightAt = (px: number, pz: number): number => {
    const n = leafAt(px, pz);
    if (!n) return H(px, pz);
    const o = n.id * LEAF_INTS;
    const u = Math.max(0, Math.min(1, (px - n.x) / n.s));
    const v = Math.max(0, Math.min(1, (pz - n.z) / n.s));
    const hnw = hy(table[o] as number);
    const hne = hy(table[o + 1] as number);
    const hsw = hy(table[o + 2] as number);
    const hse = hy(table[o + 3] as number);
    const centre = table[o + 4] as number;
    if (centre < 0) {
      if (table[o + 9] === 1) return v >= u ? hnw + v * (hsw - hnw) + u * (hse - hsw) : hnw + u * (hne - hnw) + v * (hse - hne);
      return u + v <= 1 ? hnw + u * (hne - hnw) + v * (hsw - hnw) : hse + (1 - u) * (hsw - hse) + (1 - v) * (hne - hse);
    }
    // a fan: the triangle between the centre and the ring segment the ray from the centre through the point leaves by
    const hc = hy(centre);
    const du = u - 0.5;
    const dv = v - 0.5;
    const lambda = Math.max(Math.abs(du), Math.abs(dv)) / 0.5;
    if (lambda < 1e-12) return hc;
    const bu = 0.5 + du / lambda;
    const bv = 0.5 + dv / lambda;
    let a: number;
    let b: number;
    let m: number;
    let t: number;
    if (Math.abs(du) >= Math.abs(dv)) {
      // east or west side, running north to south
      if (du > 0) [a, b, m, t] = [hne, hse, table[o + 6] as number, bv];
      else [a, b, m, t] = [hnw, hsw, table[o + 8] as number, bv];
    } else if (dv > 0) [a, b, m, t] = [hsw, hse, table[o + 7] as number, bu];
    else [a, b, m, t] = [hnw, hne, table[o + 5] as number, bu];
    let edge: number;
    if (m < 0) edge = a + (b - a) * t;
    else if (t < 0.5) edge = a + (hy(m) - a) * (t / 0.5);
    else edge = hy(m) + (b - hy(m)) * ((t - 0.5) / 0.5);
    return hc + lambda * (edge - hc);
  };
  return { positions, indices: Uint32Array.from(tris), leaves: leaves.length, vertices: pos.length / 3, triangles: tris.length / 3, heightAt };
}

// ---- how closely the mesh must follow ------------------------------------------------------------------

/**
 * Distance to the nearest of `segments` (x0, z0, x1, z1), metres, as a function of a point: a raster of `step` metres over
 * `extent` (nodes within about a metre of the true distance, then a 1 / sqrt 2 chamfer sweep, so a few percent off far from
 * a segment), read back bilinearly. Never more than `max`; a point outside the extent reads the nearest edge node.
 */
export function distanceField(segments: readonly (readonly [number, number, number, number])[], extent: Extent, step = 4, max = 600): (x: number, z: number) => number {
  const nx = Math.ceil((extent.x1 - extent.x0) / step) + 1;
  const nz = Math.ceil((extent.z1 - extent.z0) / step) + 1;
  const d = new Float32Array(nx * nz).fill(max);
  for (const [ax, az, bx, bz] of segments) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (step / 2)));
    for (let k = 0; k <= n; k++) {
      const px = ax + ((bx - ax) * k) / n;
      const pz = az + ((bz - az) * k) / n;
      const fi = (px - extent.x0) / step;
      const fj = (pz - extent.z0) / step;
      for (let j = Math.floor(fj) - 1; j <= Math.floor(fj) + 2; j++) {
        for (let i = Math.floor(fi) - 1; i <= Math.floor(fi) + 2; i++) {
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const dist = Math.hypot(extent.x0 + i * step - px, extent.z0 + j * step - pz);
          if (dist < (d[j * nx + i] as number)) d[j * nx + i] = dist;
        }
      }
    }
  }
  const diag = step * Math.SQRT2;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const o = j * nx + i;
      let v = d[o] as number;
      if (i > 0) v = Math.min(v, (d[o - 1] as number) + step);
      if (j > 0) {
        v = Math.min(v, (d[o - nx] as number) + step);
        if (i > 0) v = Math.min(v, (d[o - nx - 1] as number) + diag);
        if (i < nx - 1) v = Math.min(v, (d[o - nx + 1] as number) + diag);
      }
      d[o] = v;
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const o = j * nx + i;
      let v = d[o] as number;
      if (i < nx - 1) v = Math.min(v, (d[o + 1] as number) + step);
      if (j < nz - 1) {
        v = Math.min(v, (d[o + nx] as number) + step);
        if (i < nx - 1) v = Math.min(v, (d[o + nx + 1] as number) + diag);
        if (i > 0) v = Math.min(v, (d[o + nx - 1] as number) + diag);
      }
      d[o] = v;
    }
  }
  return (x, z) => {
    const fx = Math.max(0, Math.min(nx - 1, (x - extent.x0) / step));
    const fz = Math.max(0, Math.min(nz - 1, (z - extent.z0) / step));
    const i = Math.min(nx - 2, Math.floor(fx));
    const j = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - i;
    const tz = fz - j;
    const o = j * nx + i;
    const v = (d[o] as number) * (1 - tx) * (1 - tz) + (d[o + 1] as number) * tx * (1 - tz) + (d[o + nx] as number) * (1 - tx) * tz + (d[o + nx + 1] as number) * tx * tz;
    return Math.min(max, v);
  };
}

/** The numbers of `toleranceNearRails`. */
export interface NearRails {
  /** tolerance at a rail, metres (a track bed stands 6 cm proud of the ground: the surface must stay under it) */
  fine: number;
  /** distance over which the tolerance grows by a factor of e, metres */
  grow: number;
  /** the coarsest tolerance anywhere, metres */
  cap: number;
}

export const NEAR_RAILS: NearRails = { fine: 0.03, grow: 40, cap: 1.5 };

/**
 * `MeshOptions.toleranceAt` for a railway model: the surface hugs the field within a few centimetres around the rails
 * and platforms (`distance` reads the distance to the nearest open rail), and lets go of it with distance, to `cap` far
 * from any: a smooth swell of a metre over thirty metres reads the same drawn as 8 m facets with smooth normals. Where the
 * data are finer than 4 m (the portal patches) the block is held to the data's own scale.
 */
export function toleranceNearRails(distance: (x: number, z: number) => number, o: Partial<NearRails> = {}): NonNullable<MeshOptions['toleranceAt']> {
  const { fine, grow, cap } = { ...NEAR_RAILS, ...o };
  return (x0, z0, size, step) => {
    if (step < 4) return step <= 1 ? Math.max(fine, 0.04) : Math.max(fine, 0.06);
    const d = Math.max(0, distance(x0 + size / 2, z0 + size / 2) - size / 2);
    return Math.min(cap, fine * Math.exp(d / grow));
  };
}

// ---- what a slope is made of -----------------------------------------------------------------------

/**
 * Slope limits, degrees from horizontal: below `bankDeg` it is ground, up to `wallDeg` a grassed bank, beyond that a
 * masonry retaining wall. A wall is a region, not a scatter of faces: it starts from the faces steeper than
 * `wallDeg`, takes in every face steeper than `wallKeepDeg` that touches it (an adaptive mesh on a slope near the
 * limit flips from face to face, which on its own reads as loose tiles), and stands only if it is at least
 * `wallMinArea` m2 of surface; a smaller one is a bank.
 */
export const SLOPE = { bankDeg: 28, wallDeg: 58, wallKeepDeg: 50, wallMinArea: 40 } as const;

export interface SlopeLimits {
  bankDeg: number;
  wallDeg: number;
  wallKeepDeg: number;
  wallMinArea: number;
}

export interface SlopeSplit {
  ground: Uint32Array;
  bank: Uint32Array;
  wall: Uint32Array;
}

/** The mesh's triangles sorted by how steep each one is (its own face normal, not the smoothed vertex one), walls as regions (see `SLOPE`). */
export function splitBySlope(mesh: Pick<TerrainMesh, 'positions' | 'indices'>, limits: Partial<SlopeLimits> = {}): SlopeSplit {
  const { bankDeg, wallDeg, wallKeepDeg, wallMinArea } = { ...SLOPE, ...limits };
  const cosOf = (deg: number): number => Math.cos((deg * Math.PI) / 180);
  const bankCos = cosOf(bankDeg);
  const wallCos = cosOf(wallDeg);
  const keepCos = cosOf(Math.min(wallKeepDeg, wallDeg));
  const p = mesh.positions;
  const ix = mesh.indices;
  const n = ix.length / 3;
  const up = new Float64Array(n);
  const area = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const a = (ix[t * 3] as number) * 3;
    const b = (ix[t * 3 + 1] as number) * 3;
    const c = (ix[t * 3 + 2] as number) * 3;
    const ux = (p[b] as number) - (p[a] as number);
    const uy = (p[b + 1] as number) - (p[a + 1] as number);
    const uz = (p[b + 2] as number) - (p[a + 2] as number);
    const vx = (p[c] as number) - (p[a] as number);
    const vy = (p[c + 1] as number) - (p[a + 1] as number);
    const vz = (p[c + 2] as number) - (p[a + 2] as number);
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    up[t] = l > 0 ? Math.abs(ny) / l : 1;
    area[t] = l / 2;
  }
  // The faces steep enough to belong to a wall, joined across shared edges (union-find); a region is a wall if one of its faces is steeper than wallDeg and it is big enough.
  const steep: number[] = [];
  const slot = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    if ((up[t] as number) <= keepCos) {
      slot[t] = steep.length;
      steep.push(t);
    }
  }
  const parent = Int32Array.from(steep, (_, k) => k);
  const find = (k: number): number => {
    let r = k;
    while (parent[r] !== r) r = parent[r] as number;
    while (parent[k] !== r) {
      const next = parent[k] as number;
      parent[k] = r;
      k = next;
    }
    return r;
  };
  const owner = new Map<number, number>(); // shared edge (vertex pair) -> the first steep face seen on it
  for (const t of steep) {
    for (let k = 0; k < 3; k++) {
      const u = ix[t * 3 + k] as number;
      const v = ix[t * 3 + ((k + 1) % 3)] as number;
      const key = u < v ? u * 67108864 + v : v * 67108864 + u;
      const other = owner.get(key);
      if (other === undefined) owner.set(key, t);
      else {
        const ra = find(slot[t] as number);
        const rb = find(slot[other] as number);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }
  const regionArea = new Float64Array(steep.length);
  const seeded = new Uint8Array(steep.length);
  for (const t of steep) {
    const r = find(slot[t] as number);
    regionArea[r] = (regionArea[r] as number) + (area[t] as number);
    if ((up[t] as number) <= wallCos) seeded[r] = 1;
  }
  const ground: number[] = [];
  const bank: number[] = [];
  const wall: number[] = [];
  for (let t = 0; t < n; t++) {
    const s = slot[t] as number;
    let into = (up[t] as number) >= bankCos ? ground : bank;
    if (s >= 0) {
      const r = find(s);
      if (seeded[r] && (regionArea[r] as number) >= wallMinArea) into = wall;
    }
    into.push(ix[t * 3] as number, ix[t * 3 + 1] as number, ix[t * 3 + 2] as number);
  }
  return { ground: Uint32Array.from(ground), bank: Uint32Array.from(bank), wall: Uint32Array.from(wall) };
}
