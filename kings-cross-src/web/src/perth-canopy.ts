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
import {KINNOULL_EYE, KINNOULL_PEAK, SIGHT, WOODLAND, onCliff, sightHeight, woodNoise} from './perth-woodland.ts';

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
export const CANOPY = {step: 13, base: 7, swell: 9, crown: 3.5, min: 3, tuck: 1.2, patch: 40, light: .22, mute: .55, eyeClear: 260, eyeFrame: 6} as const;
/** Round 5 (round-4 score, C2 and C6). A small wood 150 to 180 m below the panorama's eye, on its left, stood as a hard green tent above
 *  the far town's line (the summit sightline only guards ground within WOODLAND.sight.reach). No canopy stands within `eyeClear` m of the
 *  eye inside its frame (widened `eyeFrame` deg), and the massed fill gives way there too (inEyeClear): the slope shows open, as in 152.
 *  The town woods read garish in pt-overview: the canopy's tones are muted `mute` of the way towards their own grey (46028's muted
 *  greens). The lattice is `step` 13 m (12 in round 4), paying for round 5's other work (costs.json). */
export function inEyeClear(x: number, z: number): boolean {
  const [ex, , ez] = KINNOULL_EYE.pos, [tx, , tz] = KINNOULL_EYE.target, d = Math.hypot(x - ex, z - ez);
  if (d >= CANOPY.eyeClear) return false;
  const a = Math.atan2(z - ez, x - ex) - Math.atan2(tz - ez, tx - ex);
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180 / Math.PI < KINNOULL_EYE.halfWidthDeg + CANOPY.eyeFrame;
}
/** ASSUMED: a wood under `maxArea` m2 with at least `share` of its outline in the mapped water is a small island's tree belt (round 4, C3).
 *  It is drawn as single trees, not canopy (islandBeltTrees): pt-tay-from-bridgend stands 35 m from one and looks across it to the town,
 *  and a draped belt there was a 10 m wall; 46028 shows riverside trees as single round crowns with light between. Trees on a `step` m
 *  grid jittered `jitter` of it, `height` m tall, crowns `crown` of the height deep and `width` of it wide, on `trunk` m trunks, capped
 *  by the summit's view with SIGHT.island (trees standing in the river may hide more of the channel behind them). Moncreiffe Island's
 *  long 54,000 m2 wood stays canopy: it lies along the river in the panorama. */
export const ISLAND_CANOPY = {share: .9, maxArea: 10_000, step: 14, jitter: .6, height: [9, 15] as const, crown: .6, width: .36, trunk: .3, min: 5,
  cluster: {lobes: 3, main: .8, side: .66, spread: .55, drop: .2, mute: .3, floor: .15, blue: .26, red: .55, tilt: .4, squash: [.8, 1.2] as const, sides: 7}} as const;
/** Round 10 (round-9 score, C3: still faceted crowns at Bridgend). Each lobe has `sides` 7 (from 6): a rounder outline, which the tilt
 *  and squash break further; +4 triangles a lobe, 1,248 in all, the most the cost cap leaves. */
/** Round 5 (round-4 score, C3: "lollipops"): each island tree's crown is a cluster of `cluster.lobes` overlapping lobes, the top one
 *  `main` of the crown's radius and the others `side` of it, set out `spread` of it and `drop` of the crown's depth lower, each turned and
 *  toned a little apart, muted `mute` towards grey and lifted so its brightest channel is at least `floor` (linear; round 6: 0.07 let
 *  a crown go near-black), so no crown goes near-black: a soft, massed outline, as 46028's riverside trees. Drawn on softLobe. */
/** Round 6 (round-5 score: the lobes read as faceted dice and black rocks). A low sphere (`w` x `h` segments, so no triangles are added)
 *  whose normals are bent `soft` of the way towards straight up: the lobe is shaded as a soft, sky-lit mass, not by its few facets, and a
 *  backlit lobe still takes the sky's light on its face. */
/** Round 7 (round-6 score: one crown teal; hexagon outlines): each lobe's blue is capped at `blue` of its green and its red lifted to
 *  `red` of it (linear), an olive, not teal; and each lobe turns about a tilted axis (up to `tilt` rad off upright) and is scaled
 *  `squash` across x and z apart, so the 6-sided outline breaks. No triangles. */
/** Round 8 (round-7 score: the centre Bridgend crown still teal): `blue` 0.26 of green in linear light, under 0.55 of it in sRGB. */
export const SOFT_LOBE = {soft: .45} as const;
export function softLobe(w: number, h: number): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(1, w, h), n = g.getAttribute('normal'), v = new THREE.Vector3();
  // the bottom pole has no sideways part to keep, so it takes straight up (it faces the ground, under the lobe)
  for (let i = 0; i < n.count; i++) { v.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(new THREE.Vector3(0, 1, 0), SOFT_LOBE.soft); if (Math.hypot(v.x, v.z) < 1e-6) v.set(0, 1, 0); v.normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  n.needsUpdate = true; return g;
}

export interface BeltTree {x: number; z: number; y: number; height: number; crown: number; radius: number; rgb: readonly [number, number, number]}
/** The small islands' trees (ISLAND_CANOPY), and whether a point lies in one of their woods. */
export function islandBeltTrees(ground: Pick<Terrain, 'heightAt' | 'extent'>, woods: readonly (readonly (readonly Pt[])[])[], water: readonly (readonly (readonly Pt[])[])[]): {trees: BeltTree[]; inBelt(x: number, z: number): boolean} {
  const I = ISLAND_CANOPY, belts = woods.filter(rs => isIslandBelt(rs, water)), trees: BeltTree[] = [];
  const inBelt = (x: number, z: number) => belts.some(rs => pip(x, z, rs[0]!));
  for (const rs of belts) {
    let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity; for (const [x, z] of rs[0]!) { ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x); bz = Math.max(bz, z); }
    for (let gx = Math.floor(ax / I.step) * I.step; gx <= bx; gx += I.step) for (let gz = Math.floor(az / I.step) * I.step; gz <= bz; gz += I.step) {
      const x = gx + (hash(gx, gz, 81) - .5) * I.jitter * I.step, z = gz + (hash(gx, gz, 82) - .5) * I.jitter * I.step;
      if (!pip(x, z, rs[0]!)) continue;
      const y = ground.heightAt(x, z), cap = sightHeight(ground, x, z, SIGHT.island);
      let height = I.height[0] + (I.height[1] - I.height[0]) * hash(gx, gz, 83);
      if (cap !== undefined) height = Math.min(height, cap - WOODLAND.sight.clear - y);
      if (height < I.min) continue;
      let r = hash(gx, gz, 84), pick = WOODLAND.tones[WOODLAND.tones.length - 1]!;
      for (const t of WOODLAND.tones) { if (r < t.share) { pick = t; break; } r -= t.share; }
      const k = .9 + .25 * hash(gx, gz, 85);
      trees.push({x, z, y, height, crown: height * I.crown, radius: height * I.width * (.85 + .3 * hash(gx, gz, 86)), rgb: [pick.rgb[0] * k, pick.rgb[1] * k, pick.rgb[2] * k]});
    }
  }
  return {trees, inBelt};
}

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

/** Is the wood `rs` a small island's tree belt (ISLAND_CANOPY): under `maxArea`, with `share` of its outline inside a water body's outline
 *  (an island is a hole in the river's multipolygon, so the holes are not subtracted)? */
export function isIslandBelt(rs: readonly (readonly Pt[])[], water: readonly (readonly (readonly Pt[])[])[]): boolean {
  const r = rs[0]!; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]![0] - r[i]![0]) * (r[j]![1] + r[i]![1]);
  return Math.abs(a / 2) < ISLAND_CANOPY.maxArea && r.filter(([x, z]) => water.some(w => pip(x, z, w[0]!))).length >= ISLAND_CANOPY.share * r.length;
}

/** The canopy over Perth's OSM woods (`woods`: rings, outer first), on `ground`, keeping clear of the OSM `cliffs`. Woods lying in the
 *  mapped `water` (islands) are their own lattice (see ISLAND_CANOPY). */
export function kinnoullCanopy(ground: Pick<Terrain, 'heightAt' | 'extent'>, woods: readonly (readonly (readonly Pt[])[])[], cliffs: readonly (readonly Pt[])[], water: readonly (readonly (readonly Pt[])[])[] = []): KinnoullCanopy {
  const C = CANOPY, [px, pz] = KINNOULL_PEAK, island = (rs: readonly (readonly Pt[])[]) => isIslandBelt(rs, water);
  const pos: number[] = [], col: number[] = [], idx: number[] = [], tone = new THREE.Color();
  const passes = [lattice(woods.filter(rs => !island(rs)), C.step, C.base, C.crown, SIGHT.shadow)].filter(l => l !== undefined);
  // one lattice of `step` m over `subset`, under the summit's view with a top allowed to hide `shadow` m behind it (SIGHT)
  function lattice(subset: readonly (readonly (readonly Pt[])[])[], S: number, base: number, crownAmp: number, shadow: number) {
    const boxes = subset.map(rs => { let ax = Infinity, az = Infinity, bx = -Infinity, bz = -Infinity; for (const [x, z] of rs[0]!) { ax = Math.min(ax, x); az = Math.min(az, z); bx = Math.max(bx, x); bz = Math.max(bz, z); } return {rs, ax, az, bx, bz}; });
    if (!boxes.length) return undefined;
    const inWood = (x: number, z: number) => boxes.some(b => x >= b.ax && x <= b.bx && z >= b.az && z <= b.bz && pip(x, z, b.rs[0]!) && !b.rs.slice(1).some(h => pip(x, z, h)));
    // the crown height at a lattice node, or undefined where the node is open
    const crownAt = (x: number, z: number): number | undefined => {
      if (!inWood(x, z) || Math.hypot(x - px, z - pz) < WOODLAND.gorse.inner || inEyeClear(x, z) || onCliff(ground, cliffs, x, z)) return undefined;
      let h = base + C.swell * woodNoise(x, z) + crownAmp * (hash(x, z, 51) - .5);
      const s = sightHeight(ground, x, z, shadow), y = ground.heightAt(x, z);
      if (s !== undefined) h = Math.min(h, s - WOODLAND.sight.clear - y);
      return h >= C.min ? h : undefined;
    };
    const x0 = Math.floor(Math.min(...boxes.map(b => b.ax)) / S) * S - S, z0 = Math.floor(Math.min(...boxes.map(b => b.az)) / S) * S - S;
    const nx = Math.ceil((Math.max(...boxes.map(b => b.bx)) - x0) / S) + 2, nz = Math.ceil((Math.max(...boxes.map(b => b.bz)) - z0) / S) + 2;
    const crowns = new Float32Array(nx * nz).fill(NaN);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const h = crownAt(x0 + i * S, z0 + j * S); if (h !== undefined) crowns[j * nx + i] = h; }
    const at = (i: number, j: number) => i < 0 || j < 0 || i >= nx || j >= nz ? NaN : crowns[j * nx + i]!;
    const cellLive = (i: number, j: number) => !Number.isNaN(at(i, j)) || !Number.isNaN(at(i + 1, j)) || !Number.isNaN(at(i, j + 1)) || !Number.isNaN(at(i + 1, j + 1));
    // vertices: every node of a live cell; an open node is tucked under the ground
    const vid = new Int32Array(nx * nz).fill(-1);
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
      const grey = (pick.rgb[0] + pick.rgb[1] + pick.rgb[2]) / 3, mute = (v: number) => (v + (grey - v) * C.mute) * k2;
      tone.setRGB(mute(pick.rgb[0]), mute(pick.rgb[1]), mute(pick.rgb[2]), THREE.SRGBColorSpace); col.push(tone.r, tone.g, tone.b);
      vid[k] = pos.length / 3 - 1; return vid[k]!;
    };
    for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
      if (!cellLive(i, j)) continue;
      const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i + 1, j + 1), d = vertex(i, j + 1);
      // counter-clockwise from above (x east, z south: a, d, c then a, c, b faces up)
      idx.push(a, d, c, a, c, b);
    }
    const cell = (x: number, z: number): [number, number] => [Math.floor((x - x0) / S), Math.floor((z - z0) / S)];
    return {
      inCanopy: (x: number, z: number) => { const [i, j] = cell(x, z); return i >= 0 && j >= 0 && i + 1 < nx && j + 1 < nz && cellLive(i, j); },
      topAt: (x: number, z: number) => {
        const [i, j] = cell(x, z); if (i < 0 || j < 0 || i + 1 >= nx || j + 1 >= nz || !cellLive(i, j)) return undefined;
        const fx = (x - x0) / S - i, fz = (z - z0) / S - j, y = (ii: number, jj: number) => { const h = at(ii, jj); const xx = x0 + ii * S, zz = z0 + jj * S, g = ground.heightAt(xx, zz); return Number.isNaN(h) ? g - C.tuck : g + h; };
        return (y(i, j) * (1 - fx) + y(i + 1, j) * fx) * (1 - fz) + (y(i, j + 1) * (1 - fx) + y(i + 1, j + 1) * fx) * fz;
      },
    };
  }
  if (!passes.length) return {geometry: null, inCanopy: () => false, topAt: () => undefined, nodes: 0};
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // UVs in plan metres, for the crown texture (crownTexture)
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, i) => i % 3 === 0 ? [v, pos[i + 2]!] : []), 2));
  geometry.setIndex(idx); geometry.computeVertexNormals();
  return {
    geometry, nodes: pos.length / 3,
    inCanopy: (x, z) => passes.some(l => l.inCanopy(x, z)),
    topAt: (x, z) => { for (const l of passes) { const t = l.topAt(x, z); if (t !== undefined) return t; } return undefined; },
  };
}
