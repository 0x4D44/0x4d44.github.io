// Surface roles that material names cannot express: custom Scottish paving and
// land-use draws, glazed roofs and traffic-cleared carriageways. All numbers are
// assumed retention under the page's forced snowfall, not measured snow depths.
import * as THREE from 'three';
import { ROOF_MESHES } from './cover.ts';
import type { Pt } from '../../core/geo.ts';
import type { Extent } from '../../core/terrain.ts';

export interface SurfaceWeather { dark: number; sheen: number; snow: number; traffic?: number; roof?: boolean; snowOnly?: boolean }
export interface SnowMask { texture: THREE.Texture; rect: THREE.Vector4 }
const open: SurfaceWeather = {dark: .35, sheen: .1, snow: 1, snowOnly: true};
const roof: SurfaceWeather = {dark: 0, sheen: 0, snow: 1.15, roof: true};
const road: SurfaceWeather = {dark: .42, sheen: 1, snow: .08, traffic: 1};
const roofs = new Set([...ROOF_MESHES, 'city-roof', 'perth-west-roofs', 'waverley-central-block-top',
  'perth-island-building-top', 'waverley-roof-strips', 'perth-roof-strips', 'waverley-steps-canopy']);
const paving = new Set(['waverley-platform-surfaces', 'perth-platform-ramps', 'perth-forecourt',
  'perth-forecourt-setts', 'perth-forecourt-markings', 'waverley-ground-cover', 'perth-west-ground-cover', 'perth-west-ground', 'perth-summit-ground',
  'perth-kinnoull-crag', 'perth-kinnoull-canopy', 'perth-summit-gorse', 'city-trees', 'kxcentral-trees',
  'waverley-tree-crowns', 'waverley-wood-crowns', 'perth-west-wood-crowns']);
const mixedRoofs = new Set(['perth-hotel-roofs-and-stone', 'perth-station-front', 'waverley-frontage-structure']);
const roads = new Set(['waverley-bridge-decks', 'perth-bridge-roads']);

/** A mesh role takes precedence over a reused material name (concourseFloor is
 * also Waverley's outdoor platform). The shader still tests normal and cover. */
export function snowSurface(mesh: string, material: string): SurfaceWeather | undefined {
  if (material === 'city-asphalt' || roads.has(mesh)) return road;
  if (roofs.has(mesh) || mixedRoofs.has(mesh) || material === 'city-roof' || (mesh.startsWith('kxcentral-') && mesh !== 'kxcentral-trees')) return roof;
  if (material === 'train-body') return {dark: 0, sheen: 0, snow: .75};
  if (mesh === 'waverley-platform-surfaces') return {dark: .22, sheen: .7, snow: 1};
  if (paving.has(mesh) || material === 'waverley-tree-crowns') return open;
  return undefined;
}

export interface SnowLanduse {
  extent: Extent;
  roads: readonly {width: number; line: readonly Pt[]}[];
  paths?: readonly {width: number; line: readonly Pt[]}[];
  water?: readonly (readonly (readonly Pt[])[])[];
}
/** Retention matches the land-use widths: pedestrian streets (<=4 m) keep snow,
 * lanes hold compacted slush, main carriageways are cleared by traffic. */
export const roadSnow = (width: number): number => width <= 4 ? .95 : width < 7 ? .35 : .08;

/** Coarsest spacing that keeps a 2 m footpath a full texel wide. Four samples
 * per axis antialias narrow/diagonal edges without retaining a larger image. */
export const SNOW_MASK_TEXEL_M = 2;
const MASK_SAMPLES = 4;

/** One byte per texel in RAM and on the GPU, without a canvas/RGBA backing.
 * Uses the colour map's same strokes, widths, round caps/joins and even-odd water
 * rings. The shader keeps its (u, 1-v) lookup, so bytes are stored south first. */
export function snowLanduseMask(land: SnowLanduse, texelM = SNOW_MASK_TEXEL_M): SnowMask {
  const {x0, x1, z0, z1} = land.extent;
  const width = Math.max(1, Math.ceil((x1 - x0) / texelM)), height = Math.max(1, Math.ceil((z1 - z0) / texelM));
  const dx = (x1 - x0) / width, dz = (z1 - z0) / height;
  const data = new Uint8Array(width * height).fill(255);
  const index = (i: number, j: number): number => (height - 1 - j) * width + i;
  const rows = (low: number, high: number): [number, number] => [Math.max(0, Math.floor((low - z0) / dz)), Math.min(height - 1, Math.floor((high - z0) / dz))];
  const cols = (low: number, high: number): [number, number] => [Math.max(0, Math.floor((low - x0) / dx)), Math.min(width - 1, Math.floor((high - x0) / dx))];

  // Scanline coverage of each even-odd polygon, including islands. Only one
  // floating-point row is temporary; overlapping water polygons form a union.
  const coverage = new Float32Array(width);
  for (const rings of land.water ?? []) {
    let low = Infinity, high = -Infinity;
    for (const ring of rings) for (const p of ring) {low = Math.min(low, p[1]); high = Math.max(high, p[1]);}
    const [j0, j1] = rows(low, high);
    for (let j = j0; j <= j1; j++) {
      coverage.fill(0);
      for (let sample = 0; sample < MASK_SAMPLES; sample++) {
        const z = z0 + (j + (sample + .5) / MASK_SAMPLES) * dz, crossings: number[] = [];
        for (const ring of rings) for (let a = ring.length - 1, b = 0; b < ring.length; a = b++) {
          const p = ring[a]!, q = ring[b]!;
          if ((p[1] > z) !== (q[1] > z)) crossings.push(p[0] + (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]));
        }
        crossings.sort((a,b) => a-b);
        for (let c = 0; c + 1 < crossings.length; c += 2) {
          const left = (crossings[c]! - x0) / dx, right = (crossings[c+1]! - x0) / dx;
          for (let i = Math.max(0, Math.floor(left)); i <= Math.min(width-1, Math.floor(right)); i++)
            coverage[i]! += Math.max(0, Math.min(i+1, right) - Math.max(i, left)) / MASK_SAMPLES;
        }
      }
      for (let i = 0; i < width; i++) data[index(i,j)] = Math.min(data[index(i,j)]!, Math.round(255 * (1 - coverage[i]!)));
    }
  }

  // Sixteen coverage bits per texel, reused between strokes. Union segments
  // before blending, so a bend or repeated node never darkens its own edge.
  const bits = new Uint16Array(data.length), touched: number[] = [];
  const stroke = (line: readonly Pt[], metres: number, retention: number): void => {
    const radius = metres / 2, radius2 = radius * radius;
    for (let a = 0; a + 1 < line.length; a++) {
      const p = line[a]!, q = line[a+1]!, vx = q[0] - p[0], vz = q[1] - p[1], length2 = vx*vx + vz*vz;
      const [i0,i1] = cols(Math.min(p[0],q[0])-radius, Math.max(p[0],q[0])+radius);
      const [j0,j1] = rows(Math.min(p[1],q[1])-radius, Math.max(p[1],q[1])+radius);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = index(i,j); let hit = bits[k]!;
        for (let sj = 0; sj < MASK_SAMPLES; sj++) for (let si = 0; si < MASK_SAMPLES; si++) {
          const flag = 1 << (sj * MASK_SAMPLES + si); if (hit & flag) continue;
          const x = x0 + (i + (si+.5)/MASK_SAMPLES)*dx - p[0], z = z0 + (j + (sj+.5)/MASK_SAMPLES)*dz - p[1];
          const t = length2 > 0 ? Math.max(0, Math.min(1, (x*vx + z*vz)/length2)) : 0;
          if ((x-t*vx)**2 + (z-t*vz)**2 <= radius2) hit |= flag;
        }
        if (hit && !bits[k]) touched.push(k);
        bits[k] = hit;
      }
    }
    const tone = Math.round(retention * 255);
    for (const k of touched) {
      let b = bits[k]!, count = 0; while (b) {b &= b-1; count++;}
      data[k] = Math.round(data[k]! + (tone - data[k]!) * count / (MASK_SAMPLES * MASK_SAMPLES));
      bits[k] = 0;
    }
    touched.length = 0;
  };
  for (const p of land.paths ?? []) stroke(p.line, p.width, .95);
  for (const r of [...land.roads].sort((a,b) => a.width - b.width)) stroke(r.line, r.width, roadSnow(r.width));
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.unpackAlignment = 1; texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return {texture, rect: new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0))};
}
