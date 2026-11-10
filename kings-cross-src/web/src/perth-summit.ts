// P3 round 3, C2: the summit's foreground. pt-kinnoull-panorama stands in the summit clearing, and its lower 40% was the land-use
// drape's paint at about 1.8 m a pixel (a 2048 px canvas over the 3.7 km cut): a smooth grey-brown smear. England_and_Scotland_152 shows
// grass, a worn path, gorse and stones from the same place. So the clearing gets its own ground: a disc of SUMMIT.patch m round the
// eye on a SUMMIT.step m lattice, at SUMMIT.lift m over the drawn ground and seated so no facet dips under it, with its own canvas at SUMMIT.px over the disc (about 0.35 m a
// pixel). The main drape leaves a hole of SUMMIT.hole m on gentle ground (buildWaverleyCityGround's `uncovered`), inside the patch, so the two never lie
// on each other except in the patch's outer ring, where the drape stands over it.
// Close detail (round 3, after the 9e565a39 pack): at 0.35 m a pixel the paint is a blur within 10 m of the eye. A tiling detail canvas
// (SUMMIT.detail: blades, tufts and grit about a mid grey) multiplies the paint at `tile` m, fading out where it would shimmer (more than
// `fade` tiles a pixel), so the near ground has grain without a finer canvas (summitDetail).
// Painted: rough grass in blotches of two greens and straw, tufts as short strokes, gorse clumps, worn earth round the eye, the
// mapped paths (OSM, PERTH_LANDUSE.paths) as trodden earth with grass edges, and scattered stones. All tones, sizes and counts ASSUMED,
// by eye against 152.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {KINNOULL_EYE} from './perth-woodland.ts';
import {seatDrape, slopeOf} from './waverley-city-ground.ts';

export const SUMMIT = {
  hole: 150, patch: 175, step: 6, lift: .12, px: 1024, maxSlope: 40, margin: 9,
  grass: ['#5b7431', '#4f6a2a', '#6d7a3a', '#7a7444'] as const, tuft: ['rgba(40,58,22,0.55)', 'rgba(150,150,90,0.45)'] as const, tufts: 9000,
  gorse: {count: 70, r: [1.2, 3] as const, tone: '#3a4a1c', bloom: 'rgba(200,170,40,0.35)'},
  // the path and the worn ground in grey-green worn earth, as 152 (round 3's #8a6a48 rendered salmon; round 4's #76755d read beige)
  worn: {r: 14, tone: 'rgba(106,116,92,0.55)'}, path: {tone: '#6b745c', edge: 'rgba(92,104,70,0.6)'},
  stones: {count: 60, tone: '#9a968c'},
  detail: {tile: 3, px: 256, blades: 3400, grit: 500, fade: [.15, .6] as const},
  // round 4: low gorse bushes near the eye, as 152 shows either side of the path: `count` tried in a ring `ring` m from the eye, kept off
  // the mapped paths by `pathClear` m, `height` m tall and `radius` m round, a share `bloom` in flower
  // round 6 (round-5 score: the gorse went black): a mid olive `rgb` (152, sRGB about [.30, .36, .14]), the flowering lobe as large as
  // the rest (`flower` of a lobe) and a brighter yellow; drawn on perth-canopy.ts softLobe
  // round 5 (round-4 score: "mounds or boulders"): each bush is `lobes` overlapping lobes `lobe` of its radius, scattered over it and
  // varied in height, so its outline is uneven and shrubby; dark olive `rgb`, and a share `bloom` carry one smaller lobe in yellow flower
  bush: {count: 30, ring: [6, 42] as const, pathClear: 1.2, height: [.5, 1.1] as const, radius: [.7, 1.5] as const, bloom: .45,
    lobes: [3, 5] as const, lobe: [.42, .7] as const, rgb: [.30, .36, .14] as const, bloomRgb: [.66, .56, .12] as const, flower: 1},
} as const;

export interface BushLobe {x: number; z: number; y: number; r: number; h: number; rgb: readonly [number, number, number]}
export interface SummitBush {x: number; z: number; y: number; height: number; radius: number; lobes: BushLobe[]}
/** The low gorse bushes near the panorama's eye (SUMMIT.bush): in the ring round the eye, off the paths, seated on the ground. */
export function summitBushes(ground: Pick<Terrain, 'heightAt'>, paths: readonly {width: number; line: readonly Pt[]}[]): SummitBush[] {
  const B = SUMMIT.bush, [cx, cz] = SUMMIT_CENTRE, out: SummitBush[] = [];
  const pathDist = (x: number, z: number) => Math.min(Infinity, ...paths.flatMap(p => p.line.slice(1).map((b, i) => { const a = p.line[i]!, dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, u = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0; return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) - p.width / 2; })));
  // a little more than half in the panorama's frame (towards its target), the rest round about
  const axis = Math.atan2(KINNOULL_EYE.target[2] - cz, KINNOULL_EYE.target[0] - cx);
  for (let i = 0; i < B.count; i++) {
    const inFrame = i % 5 < 3, a = inFrame ? axis + (hash(i, 1, 101) - .5) * 1.1 : hash(i, 1, 101) * Math.PI * 2, d = B.ring[0] + (B.ring[1] - B.ring[0]) * hash(i, 2, 102);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, radius = B.radius[0] + (B.radius[1] - B.radius[0]) * hash(i, 3, 103);
    if (pathDist(x, z) < B.pathClear + radius) continue;
    const height = B.height[0] + (B.height[1] - B.height[0]) * hash(i, 4, 104), bloom = hash(i, 6, 106) < B.bloom, lobes: BushLobe[] = [];
    const n = B.lobes[0] + Math.floor((B.lobes[1] - B.lobes[0] + 1) * hash(i, 7, 107));
    for (let l = 0; l < n; l++) {
      const a2 = (l / n + .3 * hash(i, l, 108)) * Math.PI * 2, off = radius * (l === 0 ? .1 : .45 + .25 * hash(i, l, 109)), lx = x + Math.cos(a2) * off, lz = z + Math.sin(a2) * off;
      const flower = bloom && l === n - 1, r = radius * (l === 0 ? B.lobe[1] : B.lobe[0] + (B.lobe[1] * .85 - B.lobe[0]) * hash(i, l, 110)) * (flower ? B.flower : 1), k = .85 + .3 * hash(i, l, 111), c = flower ? B.bloomRgb : B.rgb;
      lobes.push({x: lx, z: lz, y: ground.heightAt(lx, lz), r, h: height * (.6 + .4 * hash(i, l, 112)) * (flower ? .9 : 1), rgb: [c[0] * k, c[1] * k, c[2] * k]});
    }
    out.push({x, z, y: ground.heightAt(x, z), height, radius, lobes});
  }
  return out;
}

/** Multiply the summit material's paint by the tiling detail canvas (browser only: in Node the patch still compiles, with no texture). */
export function summitDetail(material: THREE.MeshLambertMaterial): THREE.CanvasTexture | null {
  const D = SUMMIT.detail, texture = detailCanvas(), repeat = 2 * SUMMIT.patch / D.tile;
  const prior = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    shader.uniforms.uDetail = {value: texture}; shader.uniforms.uDetailRepeat = {value: repeat};
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform float uDetailRepeat;')
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
{
  vec2 detailUv = vMapUv * uDetailRepeat;
  float detailFade = smoothstep( ${D.fade[0].toFixed(2)}, ${D.fade[1].toFixed(2)}, length( fwidth( detailUv ) ) );
  diffuseColor.rgb *= mix( texture2D( uDetail, detailUv ).rgb * 2.0, vec3( 1.0 ), detailFade );
}
#endif`);
  };
  material.customProgramCacheKey = () => 'perth-summit-detail';
  return texture;
}

function detailCanvas(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const D = SUMMIT.detail, N = D.px, s = N / D.tile, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N);
  // soft light and dark blotches, then blades (dark stems, lit tips) and grit, all wrapped so the tile repeats without a seam
  const wrap = (f: (ox: number, oy: number) => void) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) f(ox, oy); };
  for (let i = 0; i < 60; i++) { const x = hash(i, 1, 91) * N, y = hash(i, 2, 91) * N, r = (.15 + hash(i, 3, 91) * .35) * s, v = hash(i, 4, 91) < .5 ? 'rgba(90,90,90,0.35)' : 'rgba(170,170,170,0.3)'; wrap((ox, oy) => { g.fillStyle = v; g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill(); }); }
  g.lineCap = 'round';
  for (let i = 0; i < D.blades; i++) {
    const x = hash(i, 5, 92) * N, y = hash(i, 6, 92) * N, l = (.04 + hash(i, 7, 92) * .08) * s, a = (hash(i, 8, 92) - .5) * 1.2, lit = hash(i, 9, 92) < .4;
    g.strokeStyle = lit ? 'rgba(200,200,180,0.8)' : 'rgba(58,62,52,0.8)'; g.lineWidth = Math.max(1, .012 * s);
    wrap((ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.sin(a) * l, y + oy - Math.cos(a) * l); g.stroke(); });
  }
  for (let i = 0; i < D.grit; i++) { const x = hash(i, 10, 93) * N, y = hash(i, 11, 93) * N, r = (.006 + hash(i, 12, 93) * .015) * s; g.fillStyle = hash(i, 13, 93) < .5 ? 'rgb(190,186,176)' : 'rgb(80,76,70)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; // a linear factor about 0.5 (no colour space): doubled in the shader
  return t;
}

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
/** The summit patch's centre: the panorama's eye in plan. */
export const SUMMIT_CENTRE: Pt = [KINNOULL_EYE.pos[0], KINNOULL_EYE.pos[2]];
/** Is (x, z) in the hole the main drape leaves for the summit patch? Within SUMMIT.hole m of the eye, where the ground at it and
 *  SUMMIT.margin m round it is no steeper than SUMMIT.maxSlope degrees: the cliff's brink, south of the summit, stays the drape's
 *  (6 m facets cannot follow it), and the margin keeps the hole inside the patch's gentle cells. */
export const inSummitHole = (ground: Pick<Terrain, 'heightAt'>, x: number, z: number): boolean => {
  if (Math.hypot(x - SUMMIT_CENTRE[0], z - SUMMIT_CENTRE[1]) >= SUMMIT.hole) return false;
  const m = SUMMIT.margin;
  for (const [dx, dz] of [[0, 0], [m, 0], [-m, 0], [0, m], [0, -m], [m, m], [m, -m], [-m, m], [-m, -m]] as const) if (slopeOf(ground, x + dx, z + dz) > SUMMIT.maxSlope) return false;
  return true;
};

/** The summit patch's mesh data and its painter (the paint is browser only). */
export function summitGround(ground: Pick<Terrain, 'heightAt' | 'extent'>, paths: readonly {width: number; line: readonly Pt[]}[]): {geometry: THREE.BufferGeometry; texture: THREE.CanvasTexture | null} {
  const S = SUMMIT, [cx, cz] = SUMMIT_CENTRE, R = S.patch, n = Math.ceil(2 * R / S.step) + 1, x0 = cx - R, z0 = cz - R;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], id = new Int32Array(n * n).fill(-1);
  const inside = (i: number, j: number) => Math.hypot(x0 + i * S.step - cx, z0 + j * S.step - cz) <= R;
  // a cell is the patch's if its corners are on the disc and none is steeper than SUMMIT.maxSlope (the hole keeps SUMMIT.margin m
  // inside these, so the patch covers it all)
  const gentle = (i: number, j: number) => [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].every(([a, b]) => slopeOf(ground, x0 + a! * S.step, z0 + b! * S.step) <= S.maxSlope);
  const v = (i: number, j: number) => {
    const k = j * n + i; if (id[k]! >= 0) return id[k]!;
    const x = x0 + i * S.step, z = z0 + j * S.step;
    pos.push(x, ground.heightAt(x, z) + S.lift, z); uv.push((x - x0) / (2 * R), 1 - (z - z0) / (2 * R));
    return (id[k] = pos.length / 3 - 1);
  };
  for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
    if (!(inside(i, j) && inside(i + 1, j) && inside(i, j + 1) && inside(i + 1, j + 1) && gentle(i, j))) continue;
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    idx.push(a, d, c, a, c, b);
  }
  // seated as the drape is (seatDrape): the 6 m facets would cut chords under the convex summit, and the bare ground showed through
  const P = new Float32Array(pos); seatDrape(P, idx, ground);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx); geometry.computeVertexNormals();
  return {geometry, texture: paintSummit(paths)};
}

function paintSummit(paths: readonly {width: number; line: readonly Pt[]}[]): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const S = SUMMIT, N = S.px, R = S.patch, [cx, cz] = SUMMIT_CENTRE, s = N / (2 * R);
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); if (!g) return null;
  const px = (x: number, z: number): [number, number] => [(x - cx + R) * s, (z - cz + R) * s];
  // rough grass in blotches
  g.fillStyle = S.grass[0]; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) { const [x, y] = [hash(i, 1, 1) * N, hash(i, 2, 1) * N], r = (2 + hash(i, 3, 1) * 9) * s; g.globalAlpha = .35; g.fillStyle = S.grass[1 + Math.floor(hash(i, 4, 1) * 3)]!; g.beginPath(); g.ellipse(x, y, r * 1.6, r, hash(i, 5, 1) * 3, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1; g.lineWidth = Math.max(1, .12 * s);
  for (let i = 0; i < S.tufts; i++) { const [x, y] = [hash(i, 6, 2) * N, hash(i, 7, 2) * N], l = (.3 + hash(i, 8, 2) * .5) * s; g.strokeStyle = S.tuft[hash(i, 9, 2) < .7 ? 0 : 1]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(i, 10, 2) - .5) * l, y - l); g.stroke(); }
  // worn earth round the summit and the stone table
  const [ex, ey] = px(cx, cz), wr = S.worn.r * s, wg = g.createRadialGradient(ex, ey, wr * .2, ex, ey, wr); wg.addColorStop(0, S.worn.tone); wg.addColorStop(1, 'rgba(120,104,80,0)'); g.fillStyle = wg; g.fillRect(ex - wr, ey - wr, 2 * wr, 2 * wr);
  // the paths: a grassy edge, then the trodden earth
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [col, extra] of [[S.path.edge, 1.2], [S.path.tone, 0]] as const) for (const p of paths) { g.strokeStyle = col; g.lineWidth = (p.width + extra) * s; g.beginPath(); p.line.forEach(([x, z], i) => { const [a, b] = px(x, z); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); g.stroke(); }
  // gorse clumps, some in flower, and stones
  for (let i = 0; i < S.gorse.count; i++) { const [x, y] = [hash(i, 11, 3) * N, hash(i, 12, 3) * N], r = (S.gorse.r[0] + hash(i, 13, 3) * (S.gorse.r[1] - S.gorse.r[0])) * s; g.fillStyle = S.gorse.tone; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); if (hash(i, 14, 3) < .5) { g.fillStyle = S.gorse.bloom; g.beginPath(); g.arc(x - r * .2, y - r * .2, r * .6, 0, Math.PI * 2); g.fill(); } }
  for (let i = 0; i < S.stones.count; i++) { const [x, y] = [hash(i, 15, 4) * N, hash(i, 16, 4) * N], r = (.2 + hash(i, 17, 4) * .5) * s; g.fillStyle = S.stones.tone; g.beginPath(); g.ellipse(x, y, r * 1.4, r, hash(i, 18, 4) * 3, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
