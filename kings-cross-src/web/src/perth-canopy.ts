// P3 round 3, C1/C2: Kinnoull Hill's woods as one continuous canopy, not separate crowns. Round 2 drew the hill's woods as low-poly
// balls on bare grass. 4307 and 4599836 show a closed canopy over the whole hill: a lumpy, many-toned roof of crowns, broken only at the
// summit clearing and on the cliff.
// - One draped mesh on a CANOPY.step lattice over each of Perth's OSM wood polygons: Kinnoull's, and (round 3, after the 9e565a39
//   pack) the town's and the riverside woods', whose massed fill crowns read as huge faceted balls close to (pt-tay-from-bridgend:
//   two 8 to 10 m icosahedra on the island 35 m from the eye). A node
//   inside the wood stands at the ground plus a crown height: a smooth 64 m swell (woodNoise) for stands of old and young trees, and a
//   node hash for single crowns. A node outside the wood is tucked just under the ground, so the canopy's edge slopes down to a woodland
//   margin instead of ending in a wall.
// - It leaves out the summit clearing (inside WOODLAND.gorse.inner), the cliff (onCliff), and anything that would rise above the
//   panorama's view of the ground (sightHeight, over the whole frame: round 3's 700 m line let it hide the Tay and the North Inch); the
//   crown is lowered under it, or dropped when that leaves under CANOPY.min.
// - Vertex colours: patches of species (WOODLAND.tones, picked per CANOPY.patch m cell), crown tops lighter and hollows darker, so it
//   reads as crowns.
// - The massed fill trees it covers are not placed (inCanopy, in kinnoullWoodland's keep), which frees their triangles.
// Step, heights, margin and shading are ASSUMED, by eye against 4307, 4599836 and 152.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {KINNOULL_PEAK, WOODLAND, onCliff, sightHeight, woodNoise} from './perth-woodland.ts';

/** ASSUMED crown texture: a tile `tile` m square of `crowns` round crowns `r` m in radius, lit at the top and shaded at the rim, which
 *  multiplies the canopy's vertex colours, so the 12 m lattice reads as a roof of single crowns (4307, 4599836). */
export const CROWNS = {tile: 48, px: 256, crowns: 110, r: [1.8, 4.2] as const, base: '#b0b0b0', top: '#ffffff', rim: '#6a6a6a', lift: 1.4} as const;
/** The crown texture (browser only; null in Node). */
export function crownTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const N = CROWNS.px, s = N / CROWNS.tile, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = CROWNS.rim; g.fillRect(0, 0, N, N);
  for (let i = 0; i < CROWNS.crowns; i++) {
    const x = hash(i, 1, 71) * N, y = hash(i, 2, 72) * N, r = (CROWNS.r[0] + (CROWNS.r[1] - CROWNS.r[0]) * hash(i, 3, 73)) * s;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      const gr = g.createRadialGradient(x + ox - r * .3, y + oy - r * .3, r * .1, x + ox, y + oy, r);
      gr.addColorStop(0, CROWNS.top); gr.addColorStop(.6, CROWNS.base); gr.addColorStop(1, CROWNS.rim);
      g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / CROWNS.tile, 1 / CROWNS.tile); // a linear factor (no colour space): mean about .7, so the vertex colours are lifted CROWNS.lift
  return t;
}

/** ASSUMED canopy shape (see the header). */
export const CANOPY = {step: 12, base: 7, swell: 9, crown: 3.5, min: 3, tuck: 1.2, patch: 40, light: .22} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
const pip = (x: number, z: number, p: readonly Pt[]): boolean => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i]![1] > z) !== (p[j]![1] > z) && x < (p[j]![0] - p[i]![0]) * (z - p[i]![1]) / (p[j]![1] - p[i]![1]) + p[i]![0]) yes = !yes; return yes; };

export interface KinnoullCanopy {
  geometry: THREE.BufferGeometry | null;
  /** Is (x, z) under the drawn canopy (a node of the lattice cell holding it stands in the wood)? */
  inCanopy(x: number, z: number): boolean;
  /** The canopy top over (x, z), or undefined where there is none. */
  topAt(x: number, z: number): number | undefined;
  nodes: number;
}

/** The canopy over Kinnoull's OSM woods (`woods`: rings, outer first), on `ground`, keeping clear of the OSM `cliffs`. */
export function kinnoullCanopy(ground: Pick<Terrain, 'heightAt' | 'extent'>, woods: readonly (readonly (readonly Pt[])[])[], cliffs: readonly (readonly Pt[])[]): KinnoullCanopy {
  const C = CANOPY, hill = woods;
  const boxes = hill.map(rs => { let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity; for (const [x, z] of rs[0]!) { ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x); bz = Math.max(bz, z); } return {rs, ax, az, bx, bz}; });
  const inWood = (x: number, z: number) => boxes.some(b => x >= b.ax && x <= b.bx && z >= b.az && z <= b.bz && pip(x, z, b.rs[0]!) && !b.rs.slice(1).some(h => pip(x, z, h)));
  const [px, pz] = KINNOULL_PEAK;
  // the crown height at a lattice node, or undefined where the node is open
  const crownAt = (x: number, z: number): number | undefined => {
    if (!inWood(x, z) || Math.hypot(x - px, z - pz) < WOODLAND.gorse.inner || onCliff(ground, cliffs, x, z)) return undefined;
    let h = C.base + C.swell * woodNoise(x, z) + C.crown * (hash(x, z, 51) - .5);
    const s = sightHeight(ground, x, z), y = ground.heightAt(x, z);
    if (s !== undefined) h = Math.min(h, s - WOODLAND.sight.clear - y);
    return h >= C.min ? h : undefined;
  };
  if (!boxes.length) return {geometry: null, inCanopy: () => false, topAt: () => undefined, nodes: 0};
  const S = C.step, x0 = Math.floor(Math.min(...boxes.map(b => b.ax)) / S) * S - S, z0 = Math.floor(Math.min(...boxes.map(b => b.az)) / S) * S - S;
  const nx = Math.ceil((Math.max(...boxes.map(b => b.bx)) - x0) / S) + 2, nz = Math.ceil((Math.max(...boxes.map(b => b.bz)) - z0) / S) + 2;
  const crowns = new Float32Array(nx * nz).fill(NaN);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const h = crownAt(x0 + i * S, z0 + j * S); if (h !== undefined) crowns[j * nx + i] = h; }
  const at = (i: number, j: number) => i < 0 || j < 0 || i >= nx || j >= nz ? NaN : crowns[j * nx + i]!;
  const cellLive = (i: number, j: number) => !Number.isNaN(at(i, j)) || !Number.isNaN(at(i + 1, j)) || !Number.isNaN(at(i, j + 1)) || !Number.isNaN(at(i + 1, j + 1));
  // vertices: every node of a live cell; an open node is tucked under the ground
  const vid = new Int32Array(nx * nz).fill(-1), pos: number[] = [], col: number[] = [], idx: number[] = [];
  const tone = new THREE.Color();
  const vertex = (i: number, j: number): number => {
    const k = j * nx + i; if (vid[k]! >= 0) return vid[k]!;
    const x = x0 + i * S, z = z0 + j * S, y = ground.heightAt(x, z), h = at(i, j), open = Number.isNaN(h);
    pos.push(x, open ? y - C.tuck : y + h, z);
    // species patch, then crown-top light and hollow shade
    const px2 = Math.floor(x / C.patch), pz2 = Math.floor(z / C.patch);
    let r = hash(px2 * C.patch + (hash(x, z, 52) < .3 ? S : 0), pz2 * C.patch, 53), pick = WOODLAND.tones[WOODLAND.tones.length - 1]!;
    for (const t of WOODLAND.tones) { if (r < t.share) { pick = t; break; } r -= t.share; }
    const lift = open ? -.25 : (hash(x, z, 51) - .5) * 2 * C.light;
    const k2 = (1 + lift) * (.9 + .2 * hash(x, z, 54)) * CROWNS.lift;
    tone.setRGB(pick.rgb[0] * k2, pick.rgb[1] * k2, pick.rgb[2] * k2, THREE.SRGBColorSpace); col.push(tone.r, tone.g, tone.b);
    vid[k] = pos.length / 3 - 1; return vid[k]!;
  };
  for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
    if (!cellLive(i, j)) continue;
    const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i + 1, j + 1), d = vertex(i, j + 1);
    // counter-clockwise from above (x east, z south: a, d, c then a, c, b faces up)
    idx.push(a, d, c, a, c, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // UVs in plan metres, for the crown texture (crownTexture)
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, i) => i % 3 === 0 ? [v, pos[i + 2]!] : []), 2));
  geometry.setIndex(idx); geometry.computeVertexNormals();
  const cell = (x: number, z: number): [number, number] => [Math.floor((x - x0) / S), Math.floor((z - z0) / S)];
  return {
    geometry, nodes: pos.length / 3,
    inCanopy: (x, z) => { const [i, j] = cell(x, z); return i >= 0 && j >= 0 && i + 1 < nx && j + 1 < nz && cellLive(i, j); },
    topAt: (x, z) => {
      const [i, j] = cell(x, z); if (i < 0 || j < 0 || i + 1 >= nx || j + 1 >= nz || !cellLive(i, j)) return undefined;
      const fx = (x - x0) / S - i, fz = (z - z0) / S - j, y = (ii: number, jj: number) => { const h = at(ii, jj); const xx = x0 + ii * S, zz = z0 + jj * S, g = ground.heightAt(xx, zz); return Number.isNaN(h) ? g - C.tuck : g + h; };
      return (y(i, j) * (1 - fx) + y(i + 1, j) * fx) * (1 - fz) + (y(i, j + 1) * (1 - fx) + y(i + 1, j + 1) * fx) * fz;
    },
  };
}
