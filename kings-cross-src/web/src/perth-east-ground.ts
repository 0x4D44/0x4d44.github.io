// P3's east patch (lead ruling 2026-11-10 13:13): the Tay's corridor below Kinnoull east of the main terrain (x 2624 to 4128,
// z 80 to 1232, past the main terrain's south edge at 912), which pt-kinnoull-cliff looks over, from tools/build-perth-east-terrain.ts (Phase I NO12, 32 m lattice, a ground class
// per node). Phase I has no data north of z 80 there, so the patch ends at z 80; nothing north of it is drawn.
// - Seam: the west column (x 2624), where the main terrain has ground (z up to its 912), is read off the main drawn terrain at every 16 m, its own vertices, so the two meshes share that
//   edge exactly (the patch's other rows are the 32 m data, bilinear at the 16 m rows).
// - Edges (round 3): the north, east and south edges are skirted outward EAST_SKIRT.out m down to just under the world's flat plane
//   (world.ts GROUND_Y), their colour fading to a hazed field tone (EAST_SKIRT, round 4). So the patch runs out in a long, gentle apron that meets
//   the plane far off in the haze, not a ruled edge with grey beyond it (round 2's cliff capture).
// - The Tay (round 3, C3): the river nodes (DTM nodata) trace one winding channel with breaks of one to three nodes, and a stray
//   node on the hill. eastWater closes them into one channel (a morphological closing: grown, then shrunk, by EAST_WATER.close m) and
//   drops pieces under EAST_WATER.minNodes nodes; and a flat water sheet (Perth's WATER look) lies over the wet cells at the river's local level (a low quantile
//   of the wet nodes' ground within EAST_WATER.reach m, never under a node's own ground), so it reads as one river, not a chain of
//   ponds. Wet nodes' ground is painted as the bank's shingle (SHORE.shore), so the sheet's edge meets the bank, not green.
// - Bank trees (round 3, C3): crowns along the river's banks (land nodes beside wet ones), as 2166751 and 46028 show tree-lined banks:
//   EAST_TREES.)
// - Colour: per vertex from the node classes (water where the DTM itself has no ground, else OSM land use, else field): ASSUMED tones
//   matched to the main ground paint (waverley-city-ground.ts GROUND_COLOURS) and Perth's water.
import * as THREE from 'three';
import {createTerrain} from '../../core/terrain.ts';
import {GROUND_Y} from './world.ts';
import {SHORE, WATER} from './perth-city-features.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import file from './data/perth-terrain-east.json' with {type: 'json'};

export const PERTH_EAST_FILE = file as unknown as TerrainFile & {classNames: string[]; classes: string};
export const PERTH_EAST = createTerrain(PERTH_EAST_FILE);
/** Round 4 (round-3 score, C3): the grey world plane still showed as a flat band at the cliff view's horizon. The apron now runs `out` m
 *  (past which the haze has the ground), still ending just under the plane, and fades to `tone`, a hazed field green-grey (ASSUMED), not
 *  the plane's grey: the land runs on into the haze. No triangles are added (it is the same skirt ring). */
export const EAST_SKIRT = {out: 6000, to: GROUND_Y - .3, tone: 0x7c8770} as const;
/** ASSUMED: the river sheet's level is the `quantile` of the wet nodes' ground within `reach` m, lifted `lift`; the closing radius
 *  `close` m bridges the channel's breaks (up to about twice that); pieces under `minNodes` nodes are dropped. */
export const EAST_WATER = {reach: 160, quantile: .25, lift: .35, close: 96, minNodes: 6} as const;
/** ASSUMED bank trees: one crown on a bank node with this share by hash, `size` m tall, crown `crown` of the height, in WOODLAND-like greens. */
export const EAST_TREES = {share: .7, size: [9, 16] as const, crown: .55, tones: [[.13, .22, .10], [.20, .31, .12], [.26, .36, .15]] as const} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
/** The wet nodes, closed into one channel: a node's own DTM pixel is nodata (class water); then a closing by EAST_WATER.close m (wet
 *  if any wet node is that near, then dry if any dry node is that near), and pieces under EAST_WATER.minNodes dropped. Indexed j * nx + i. */
export function eastWater(): Uint8Array {
  const g = PERTH_EAST_FILE.grids[0]!, wetCls = String(PERTH_EAST_FILE.classNames.indexOf('water')), N = g.nx * g.nz, r = Math.floor(EAST_WATER.close / g.step);
  const raw = new Uint8Array(N); for (let k = 0; k < N; k++) raw[k] = PERTH_EAST_FILE.classes[k] === wetCls ? 1 : 0;
  // grow (any within reach) or shrink (all within reach, inside the lattice)
  const pass = (src: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(N);
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      let hit = !grow;
      for (let dj = -r; dj <= r && hit !== grow; dj++) for (let di = -r; di <= r; di++) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= g.nx || b >= g.nz || Math.hypot(di, dj) * g.step > EAST_WATER.close) continue;
        if (grow ? src[b * g.nx + a] : !src[b * g.nx + a]) { hit = grow; break; }
      }
      out[j * g.nx + i] = hit ? 1 : 0;
    }
    return out;
  };
  const wet = pass(pass(raw, true), false); for (let k = 0; k < N; k++) wet[k] = wet[k]! | raw[k]!;
  // drop the small pieces (8-connected)
  const seen = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (!wet[k] || seen[k]) continue;
    const piece = [k]; seen[k] = 1;
    for (let q = 0; q < piece.length; q++) {
      const i = piece[q]! % g.nx, j = Math.floor(piece[q]! / g.nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj, n = b * g.nx + a; if (a >= 0 && b >= 0 && a < g.nx && b < g.nz && wet[n] && !seen[n]) { seen[n] = 1; piece.push(n); } }
    }
    if (piece.length < EAST_WATER.minNodes) for (const n of piece) wet[n] = 0;
  }
  return wet;
}
/** ASSUMED tones per class (sRGB): field and grass as the main paint's park and grass, the houses' gardens darker, wood, scrub, rock,
 *  and the Tay as the water sheet. */
export const EAST_TONES: Record<string, number> = {field: 0x6b6f3a, water: 0x6f8794, wood: 0x2d4120, scrub: 0x45502c, grass: 0x566b2e, houses: 0x4a5a30, rock: 0x6f6c66};

/** The class at a point: the nearest node's. */
export function eastClassAt(x: number, z: number): string {
  const g = PERTH_EAST_FILE.grids[0]!, i = Math.max(0, Math.min(g.nx - 1, Math.round((x - g.x0) / g.step))), j = Math.max(0, Math.min(g.nz - 1, Math.round((z - g.z0) / g.step)));
  return PERTH_EAST_FILE.classNames[Number(PERTH_EAST_FILE.classes[j * g.nx + i])]!;
}

/** The patch mesh over `main` (the drawn main terrain, whose east edge it meets). */
export function buildPerthEastGround(main: Pick<Terrain, 'heightAt' | 'extent'>): {group: THREE.Group; stats: {triangles: number; drawCalls: number}; heightAt(x: number, z: number): number} {
  const E = PERTH_EAST_FILE.extent, step = PERTH_EAST_FILE.grids[0]!.step, row = step / 2;
  const xs: number[] = []; for (let x = E.x0; x <= E.x1 + 1e-6; x += step) xs.push(x);
  const zs: number[] = []; for (let z = E.z0; z <= E.z1 + 1e-6; z += row) zs.push(z);
  const heightAt = (x: number, z: number) => x <= E.x0 + 1e-6 && z <= main.extent.z1 + 1e-6 ? main.heightAt(E.x0, z) : PERTH_EAST.heightAt(x, z);
  // the lattice, then a skirt ring round the three outer edges (index -1 and n are the skirt)
  const nx = xs.length, nz = zs.length, pos: number[] = [], col: number[] = [], index: number[] = [], c = new THREE.Color(), plane = new THREE.Color();
  plane.setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace);
  const G = PERTH_EAST_FILE.grids[0]!, wet = eastWater(), wetAt = (x: number, z: number) => wet[Math.max(0, Math.min(G.nz - 1, Math.round((z - G.z0) / G.step))) * G.nx + Math.max(0, Math.min(G.nx - 1, Math.round((x - G.x0) / G.step)))] === 1;
  const shore = parseInt(SHORE.shore.slice(1), 16);
  const toneAt = (x: number, z: number) => wetAt(x, z) ? shore : EAST_TONES[eastClassAt(x, z)]!;
  const vertex = (x: number, z: number, y: number, tone: number, fade = 0) => { c.setHex(tone, THREE.SRGBColorSpace).lerp(plane, fade); pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const id: number[][] = [];
  for (let j = -1; j <= nz; j++) {
    const r: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const ci = Math.min(i, nx - 1), cj = Math.max(0, Math.min(j, nz - 1)), x = xs[ci]!, z = zs[cj]!, y = heightAt(x, z), tone = toneAt(x, z);
      const sx = i === nx ? EAST_SKIRT.out : 0, sz = j === -1 ? -EAST_SKIRT.out : j === nz ? EAST_SKIRT.out : 0;
      // the apron's outer edge: just under the world's flat plane, in the plane's colour
      if (ci === 0 && (j === -1 || j === nz)) { r.push(vertex(x, z + sz, Math.min(y, EAST_SKIRT.to), tone, 1)); continue; }
      r.push(sx || sz ? vertex(x + sx, z + sz, Math.min(y, EAST_SKIRT.to), tone, 1) : vertex(x, z, y, tone));
    }
    id.push(r);
  }
  for (let j = 0; j + 1 < id.length; j++) for (let i = 0; i + 1 < id[j]!.length; i++) {
    const a = id[j]![i]!, b = id[j]![i + 1]!, d = id[j + 1]![i]!, e = id[j + 1]![i + 1]!;
    index.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index); g.computeVertexNormals(); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({vertexColors: true}));
  mesh.name = 'perth-east-ground';
  const group = new THREE.Group(); group.name = 'perth-east'; group.add(mesh);
  const stats = {triangles: index.length / 3, drawCalls: 1};
  // the river sheet over the wet cells, at the local river level
  const wetNodes: [number, number, number][] = [];
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) if (wet[j * G.nx + i]) { const x = G.x0 + i * G.step, z = G.z0 + j * G.step; wetNodes.push([x, z, heightAt(x, z)]); }
  const level = (x: number, z: number) => {
    const hs = wetNodes.filter(([wx, wz]) => Math.hypot(wx - x, wz - z) <= EAST_WATER.reach).map(w => w[2]).sort((a, b) => a - b);
    return Math.max((hs[Math.floor(hs.length * EAST_WATER.quantile)] ?? heightAt(x, z)) + EAST_WATER.lift, heightAt(x, z) + .15);
  };
  const wpos: number[] = [], widx: number[] = [], wid = new Int32Array(G.nx * G.nz).fill(-1);
  const wv = (i: number, j: number) => { const k = j * G.nx + i; if (wid[k]! < 0) { const x = G.x0 + i * G.step, z = G.z0 + j * G.step; wpos.push(x, level(x, z), z); wid[k] = wpos.length / 3 - 1; } return wid[k]!; };
  for (let j = 0; j + 1 < G.nz; j++) for (let i = 0; i + 1 < G.nx; i++) {
    const a = wet[j * G.nx + i], b = wet[j * G.nx + i + 1], d = wet[(j + 1) * G.nx + i], e = wet[(j + 1) * G.nx + i + 1];
    if (a && b && d && e) { widx.push(wv(i, j), wv(i, j + 1), wv(i + 1, j), wv(i + 1, j), wv(i, j + 1), wv(i + 1, j + 1)); continue; }
    if (a && b && d) widx.push(wv(i, j), wv(i, j + 1), wv(i + 1, j));
    if (b && d && e) widx.push(wv(i + 1, j), wv(i, j + 1), wv(i + 1, j + 1));
    if (a && d && e && !b) widx.push(wv(i, j), wv(i, j + 1), wv(i + 1, j + 1));
    if (a && b && e && !d) widx.push(wv(i, j), wv(i + 1, j + 1), wv(i + 1, j));
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wg.setIndex(widx); wg.computeVertexNormals();
  const water = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({color: WATER.colour, specular: WATER.specular, shininess: WATER.shininess}));
  water.name = 'perth-east-water'; group.add(water); stats.triangles += widx.length / 3; stats.drawCalls++;
  // bank trees: a crown on a share of the land nodes beside wet ones
  const banks: [number, number][] = [];
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
    if (wet[j * G.nx + i]) continue; let near = false;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) if (i + di >= 0 && j + dj >= 0 && i + di < G.nx && j + dj < G.nz && wet[(j + dj) * G.nx + i + di]) { near = true; break; }
    const x = G.x0 + i * G.step, z = G.z0 + j * G.step; if (near && hash(x, z, 81) < EAST_TREES.share) banks.push([x, z]);
  }
  const crown = new THREE.IcosahedronGeometry(1, 0), trees = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial(), Math.max(1, banks.length * 2));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tc = new THREE.Color(); let n = 0;
  for (const [bx, bz] of banks) for (const k of [0, 1]) {
    const x = bx + (hash(bx, bz, 82 + k) - .5) * G.step * .8, z = bz + (hash(bx, bz, 84 + k) - .5) * G.step * .8, h = EAST_TREES.size[0] + (EAST_TREES.size[1] - EAST_TREES.size[0]) * hash(x, z, 86), r = h * EAST_TREES.crown / 2;
    m.compose(new THREE.Vector3(x, heightAt(x, z) + h - r, z), q, new THREE.Vector3(r * 1.1, r, r * 1.1)); trees.setMatrixAt(n, m);
    const t = EAST_TREES.tones[Math.floor(hash(x, z, 87) * EAST_TREES.tones.length)]!; tc.setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace); trees.setColorAt(n, tc); n++;
  }
  trees.count = n; trees.name = 'perth-east-bank-trees'; group.add(trees); stats.triangles += n * crown.getAttribute('position').count / 3; stats.drawCalls++;
  return {group, stats, heightAt};
}
