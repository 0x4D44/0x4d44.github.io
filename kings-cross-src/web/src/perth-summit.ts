// P3 round 3, C2: the summit's foreground. pt-kinnoull-panorama stands in the summit clearing, and its lower 40% was the land-use
// drape's paint at about 1.8 m a pixel (a 2048 px canvas over the 3.7 km cut): a smooth grey-brown smear. England_and_Scotland_152 shows
// grass, a worn path, gorse and stones from the same place. So the clearing gets its own ground: a disc of SUMMIT.patch m round the
// eye on a SUMMIT.step m lattice, at SUMMIT.lift m over the drawn ground, with its own canvas at SUMMIT.px over the disc (about 0.35 m a
// pixel). The main drape leaves a hole of SUMMIT.hole m (buildWaverleyCityGround's `uncovered`), inside the patch, so the two never lie
// on each other except in the patch's outer ring, where the drape stands over it.
// Painted: rough grass in blotches of two greens and straw, tufts as short strokes, gorse clumps, worn earth round the eye, the
// mapped paths (OSM, PERTH_LANDUSE.paths) as trodden earth with grass edges, and scattered stones. All tones, sizes and counts ASSUMED,
// by eye against 152.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {KINNOULL_EYE} from './perth-woodland.ts';

export const SUMMIT = {
  hole: 150, patch: 175, step: 6, lift: .12, px: 1024,
  grass: ['#5b7431', '#4f6a2a', '#6d7a3a', '#7a7444'] as const, tuft: ['rgba(40,58,22,0.55)', 'rgba(150,150,90,0.45)'] as const, tufts: 9000,
  gorse: {count: 70, r: [1.2, 3] as const, tone: '#3a4a1c', bloom: 'rgba(200,170,40,0.35)'},
  worn: {r: 14, tone: 'rgba(120,104,80,0.55)'}, path: {tone: '#8a6a48', edge: 'rgba(90,100,60,0.6)'},
  stones: {count: 60, tone: '#9a968c'},
} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
/** The summit patch's centre: the panorama's eye in plan. */
export const SUMMIT_CENTRE: Pt = [KINNOULL_EYE.pos[0], KINNOULL_EYE.pos[2]];
/** Is (x, z) in the hole the main drape leaves for the summit patch? */
export const inSummitHole = (x: number, z: number): boolean => Math.hypot(x - SUMMIT_CENTRE[0], z - SUMMIT_CENTRE[1]) < SUMMIT.hole;

/** The summit patch's mesh data and its painter (the paint is browser only). */
export function summitGround(ground: Pick<Terrain, 'heightAt'>, paths: readonly {width: number; line: readonly Pt[]}[]): {geometry: THREE.BufferGeometry; texture: THREE.CanvasTexture | null} {
  const S = SUMMIT, [cx, cz] = SUMMIT_CENTRE, R = S.patch, n = Math.ceil(2 * R / S.step) + 1, x0 = cx - R, z0 = cz - R;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], id = new Int32Array(n * n).fill(-1);
  const inside = (i: number, j: number) => Math.hypot(x0 + i * S.step - cx, z0 + j * S.step - cz) <= R;
  const v = (i: number, j: number) => {
    const k = j * n + i; if (id[k]! >= 0) return id[k]!;
    const x = x0 + i * S.step, z = z0 + j * S.step;
    pos.push(x, ground.heightAt(x, z) + S.lift, z); uv.push((x - x0) / (2 * R), 1 - (z - z0) / (2 * R));
    return (id[k] = pos.length / 3 - 1);
  };
  for (let j = 0; j + 1 < n; j++) for (let i = 0; i + 1 < n; i++) {
    if (!(inside(i, j) && inside(i + 1, j) && inside(i, j + 1) && inside(i + 1, j + 1))) continue;
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    idx.push(a, d, c, a, c, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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
