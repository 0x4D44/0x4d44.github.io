// The west extension's ground (Perth west brief, 2026-11-13): the land from the main terrain's west edge (x -1200) out past the A9 western
// bypass (x -2800), z -1600 to 1232, from tools/build-perth-west-terrain.ts (Phase I 1 m DTM, the main terrain's own 16 m lattice, a ground
// class per node). Drawn as the main ground is (core/terrain.ts buildTerrainMesh over 16 m leaves, so the main's own cells and diagonals) and
// as the east patch is (perth-east-ground.ts: a vertex colour per node class, a skirt out to the haze on the outer edges, Perth's haze
// material), all in ONE draw. Not wired into the scene: perth-city.ts calls buildPerthWestGround(ground) as it calls buildPerthEastGround.
// - Seam: the east column (x -1200), where the main terrain has ground (z -1200 to 912), is read off the main DRAWN terrain at each of its
//   16 m rows, which are this lattice's own rows, so the two meshes share that edge vertex for vertex. (The two data files agree there too:
//   tools/tests/perth-west-terrain.test.ts.) The seam's two extra stretches, z -1600 to -1200 and 912 to 1232, lie beside the main
//   terrain's north and south aprons: they are the DTM, and the apron beside them is a flat shelf at the main edge's height, so the tile's
//   edge there stands up to 33 m above it (south) or 13 m below it (north), as built on 2026-11-13. Left alone by default; `opts.beside`
//   hangs a curtain from the edge to whatever is drawn beside it (mainApronEdge is that, for the main apron as it is drawn today).
// - Skirt: the west, north and south edges fall away outward EAST_SKIRT.out m to just under the world's flat plane in the hazed field tone,
//   as the east patch's do, so the tile runs out into the haze (its own triangles; no extra draw). The main terrain's apron
//   (perth-east-ground.ts MAIN_APRON: its west strip and its north-west and south-west corner quads) lies over this ground and has to be
//   left out wherever this tile is drawn.
// - Heights: `heightAt` is the DRAWN surface (the mesh's triangles, as overMesh); seat what stands on this ground on it or on `terrain`,
//   not on PERTH_WEST, which is the field the mesh approximates (they agree at every node).
// - Colour: per vertex from the node classes (water where the DTM itself has no ground, else OSM land use, else field), the east patch's tones.
import * as THREE from 'three';
import {buildTerrainMesh, createTerrain, overMesh} from '../../core/terrain.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import {GROUND_Y} from './world.ts';
import {EAST_SKIRT, EAST_TONES, hazeLand} from './perth-east-ground.ts';
import file from './data/perth-terrain-west.json' with {type: 'json'};

export const PERTH_WEST_FILE = file as unknown as TerrainFile & {classNames: string[]; classes: string};
/** The DTM field (bilinear on the 16 m lattice, the shared edge as the data file has it); the drawn ground is `buildPerthWestGround(...).terrain`. */
export const PERTH_WEST = createTerrain(PERTH_WEST_FILE);
/** The mesh: the main ground's own (addPerthGround): 16 m leaves, so plain cells, each on the diagonal that follows the surface. */
export const WEST_MESH = {maxLeaf: 16, tolerance: .08} as const;

/** The class at a point: the nearest node's. */
export function westClassAt(x: number, z: number): string {
  const g = PERTH_WEST_FILE.grids[0]!, i = Math.max(0, Math.min(g.nx - 1, Math.round((x - g.x0) / g.step))), j = Math.max(0, Math.min(g.nz - 1, Math.round((z - g.z0) / g.step)));
  return PERTH_WEST_FILE.classNames[Number(PERTH_WEST_FILE.classes[j * g.nx + i])]!;
}

/** Whether the tile meets `main` along its west edge (the contract buildPerthWestGround needs). */
const meets = (main: Pick<Terrain, 'extent'>, west: Pick<Terrain, 'extent'>) => Math.abs(main.extent.x0 - west.extent.x1) < 1e-6;

/**
 * The field the tile's mesh is cut from: the DTM, except on the shared edge (x = the tile's east edge = the main terrain's west edge), where
 * it is the main drawn terrain's own height at every row that terrain has ground on, so the two meshes' edge vertices are the same.
 */
export function westField(main: Pick<Terrain, 'heightAt' | 'extent'>, west: Pick<Terrain, 'heightAt' | 'extent'> = PERTH_WEST): Terrain['heightAt'] {
  if (!meets(main, west)) throw new Error(`the west tile's east edge ${west.extent.x1} is not the main terrain's west edge ${main.extent.x0}`);
  const M = main.extent;
  return (x, z) => Math.abs(x - west.extent.x1) < 1e-9 && z >= M.z0 - 1e-9 && z <= M.z1 + 1e-9 ? main.heightAt(x, z) : west.heightAt(x, z);
}

export interface PerthWestGround {
  group: THREE.Group;
  stats: {triangles: number; drawCalls: number};
  /** The drawn surface's height (the field outside the tile). */
  heightAt(x: number, z: number): number;
  /** The tile's terrain over the drawn surface (overMesh): `rangeUnder`, `normalAt`, `stepIn` for whatever stands on it. */
  terrain: Terrain;
}

export interface PerthWestOptions {
  /**
   * The height, at z, of whatever is drawn just east of the tile's shared edge where the main terrain has no ground of its own: north of
   * its north edge and south of its south edge, out to the skirt's far corners. When given, the tile hangs a curtain along that stretch of
   * its east edge between its own height and this one (a quad per 16 m, each way round, in the node's tone: 4 triangles a segment).
   */
  beside?: (z: number) => number;
}

/**
 * The height at z of the main terrain's apron (perth-east-ground.ts MAIN_APRON) along the line x = the main terrain's west edge, where it
 * leaves the main terrain's north and south edges: from the edge's own height less 5 cm, straight down to EAST_SKIRT.to over EAST_SKIRT.out
 * (what `buildPerthEastGround` draws, as the apron's strips are built). Within the main terrain's rows: the main terrain's own height.
 * Pass it as `beside` while the main apron's north and south strips still start at x = its west edge.
 */
export function mainApronEdge(main: Pick<Terrain, 'heightAt' | 'extent'>): (z: number) => number {
  const M = main.extent, inner = (z: number) => Math.max(main.heightAt(M.x0, z) - .05, GROUND_Y + .3), n0 = inner(M.z0), s0 = inner(M.z1);
  const along = (t: number) => Math.max(0, Math.min(1, t / EAST_SKIRT.out));
  return z => z < M.z0 ? n0 + (EAST_SKIRT.to - n0) * along(M.z0 - z) : z > M.z1 ? s0 + (EAST_SKIRT.to - s0) * along(z - M.z1) : main.heightAt(M.x0, z);
}

/**
 * The tile over `main` (the drawn main terrain, whose west edge it meets): the mesh, one draw, with its skirt.
 * Triangles: (nx - 1)(nz - 1) cells of two, plus two per skirt quad (the west, north and south strips and the two west corners).
 */
export function buildPerthWestGround(main: Pick<Terrain, 'heightAt' | 'extent'>, opts: PerthWestOptions = {}): PerthWestGround {
  const W = PERTH_WEST_FILE.extent, G = PERTH_WEST_FILE.grids[0]!, step = G.step, nx = G.nx, nz = G.nz, out = EAST_SKIRT.out;
  const tm = buildTerrainMesh({extent: W, heightAt: westField(main), stepIn: PERTH_WEST.stepIn}, {maxLeaf: WEST_MESH.maxLeaf, tolerance: () => WEST_MESH.tolerance});
  const P = Array.from(tm.positions), C: number[] = [], index = Array.from(tm.indices), node = new Int32Array(nx * nz).fill(-1);
  const c = new THREE.Color(), plane = new THREE.Color().setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace);
  const tones = PERTH_WEST_FILE.classNames.map(n => new THREE.Color().setHex(EAST_TONES[n]!, THREE.SRGBColorSpace));
  for (let v = 0; v < tm.vertices; v++) {
    const i = Math.round((P[v * 3]! - W.x0) / step), j = Math.round((P[v * 3 + 2]! - W.z0) / step);
    node[j * nx + i] = v; c.copy(tones[Number(PERTH_WEST_FILE.classes[j * nx + i])]!); C.push(c.r, c.g, c.b);
  }
  if (node.some(v => v < 0)) throw new Error('the west mesh is not the whole 16 m lattice');
  // the skirt: a strip of quads off each outer edge, its far edge `out` m away at the plane's level in the hazed tone; the corners between
  const outer = (x: number, z: number, y: number): number => { P.push(x, Math.min(y, EAST_SKIRT.to), z); C.push(plane.r, plane.g, plane.b); return P.length / 3 - 1; };
  const up = (a: number, b: number, d: number) => { // wound to face up
    const ux = P[b * 3]! - P[a * 3]!, uz = P[b * 3 + 2]! - P[a * 3 + 2]!, vx = P[d * 3]! - P[a * 3]!, vz = P[d * 3 + 2]! - P[a * 3 + 2]!;
    if (uz * vx - ux * vz > 0) index.push(a, b, d); else index.push(a, d, b);
  };
  const quad = (a: number, b: number, d: number, e: number) => { up(a, b, e); up(a, e, d); }; // a-b the inner edge, d-e the outer one under a and b
  const strip = (inner: number[], ox: number, oz: number): number[] => {
    const o = inner.map(v => outer(P[v * 3]! + ox, P[v * 3 + 2]! + oz, P[v * 3 + 1]!));
    for (let k = 0; k + 1 < inner.length; k++) quad(inner[k]!, inner[k + 1]!, o[k]!, o[k + 1]!);
    return o;
  };
  const row = (j: number) => Array.from({length: nx}, (_, i) => node[j * nx + i]!), column = (i: number) => Array.from({length: nz}, (_, j) => node[j * nx + i]!);
  const westOuter = strip(column(0), -out, 0), northOuter = strip(row(0), 0, -out), southOuter = strip(row(nz - 1), 0, out);
  // the corners: the corner node, the two strips' first outer vertices and the corner of the skirt's own outline
  for (const [corner, a, b, oz] of [[node[0]!, westOuter[0]!, northOuter[0]!, -out], [node[(nz - 1) * nx]!, westOuter[nz - 1]!, southOuter[0]!, out]] as const)
    quad(corner, a, b, outer(P[corner * 3]! - out, P[corner * 3 + 2]! + oz, P[corner * 3 + 1]!));
  if (opts.beside) { // the curtain along the seam's two stretches beside no main ground: the far skirt corner, then the seam nodes down to the main's rows
    const M = main.extent, last = nx - 1, rowOf = (z: number) => Math.round((z - W.z0) / step), beside = opts.beside;
    const north = [northOuter[last]!, ...Array.from({length: rowOf(M.z0) + 1}, (_, j) => node[j * nx + last]!)];
    const south = [...Array.from({length: nz - rowOf(M.z1)}, (_, k) => node[(rowOf(M.z1) + k) * nx + last]!), southOuter[last]!];
    // each triangle on vertices of its own, once each way round: its own face normal (a quad whose two ends lie either side of the line is
    // twisted: its triangles then face opposite ways, which shared vertices would average to nothing)
    const corner = (v: number, y: number): [number, number] => [v, y];
    const emit = (corners: [number, number][]) => { for (const c of corners) { P.push(P[c[0] * 3]!, c[1], P[c[0] * 3 + 2]!); C.push(C[c[0] * 3]!, C[c[0] * 3 + 1]!, C[c[0] * 3 + 2]!); } const o = P.length / 3 - 3; index.push(o, o + 1, o + 2); };
    for (const path of [north, south]) for (let k = 0; k + 1 < path.length; k++) {
      const a = path[k]!, b = path[k + 1]!, ba = beside(P[a * 3 + 2]!), bb = beside(P[b * 3 + 2]!);
      if (Math.abs(P[a * 3 + 1]! - ba) < 1e-3 && Math.abs(P[b * 3 + 1]! - bb) < 1e-3) continue;
      const ta = corner(a, P[a * 3 + 1]!), tb = corner(b, P[b * 3 + 1]!), la = corner(a, ba), lb = corner(b, bb);
      for (const t of [[ta, tb, lb], [ta, lb, la]] as const) {
        const [p, q, r] = t, flat = Math.abs((q[1] - p[1]) * (P[r[0] * 3 + 2]! - P[p[0] * 3 + 2]!) - (r[1] - p[1]) * (P[q[0] * 3 + 2]! - P[p[0] * 3 + 2]!)) < 1e-6;
        if (!flat) { emit([p, q, r]); emit([p, r, q]); } // (flat: where the gap is nil, at the main terrain's first and last rows)
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(index); g.computeVertexNormals(); g.computeBoundingSphere();
  const gm = new THREE.MeshLambertMaterial({vertexColors: true}); hazeLand(gm, {inside: [W.x0, W.z0, W.x1, W.z1]}); // fields on the skirt only, as the east patch
  const mesh = new THREE.Mesh(g, gm); mesh.name = 'perth-west-ground';
  const group = new THREE.Group(); group.name = 'perth-west'; group.add(mesh);
  return {group, stats: {triangles: index.length / 3, drawCalls: 1}, heightAt: tm.heightAt, terrain: overMesh(PERTH_WEST, tm)};
}

/**
 * The main drawn terrain and the west tile's as one Terrain, for whatever must stand on both (a block over x -1200, a road across it):
 * west of the shared edge the tile's height, from it eastward the main terrain's (its own flat plane past its edges), the extent their union.
 */
export function withWest(main: Terrain, west: Pick<Terrain, 'heightAt' | 'extent' | 'grids'>): Terrain {
  if (!meets(main, west)) throw new Error(`the west tile's east edge ${west.extent.x1} is not the main terrain's west edge ${main.extent.x0}`);
  const a = main.extent, b = west.extent;
  return overMesh({...main, extent: {x0: Math.min(a.x0, b.x0), z0: Math.min(a.z0, b.z0), x1: Math.max(a.x1, b.x1), z1: Math.max(a.z1, b.z1)}, grids: [...main.grids, ...west.grids]},
    {heightAt: (x, z) => x < b.x1 - 1e-9 ? west.heightAt(x, z) : main.heightAt(x, z)});
}
