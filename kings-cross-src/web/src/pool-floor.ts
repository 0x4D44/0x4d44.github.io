// The floor a raised platform's lamp pools are clipped to. The map holds the signed distance to the
// platform outlines, not an in/out bit: a bilinear read of a distance field is exact along a straight
// edge, so the light stops on the coping along a diagonal platform edge instead of in 0.5 m stair steps
// that overhang the track bed (a binary mask at 0.5 m cells did, by up to half a cell).
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { pointInPolygon } from '../../core/station.ts';

/** Distances beyond this many metres either side of an edge are stored clamped. */
export const POOL_FLOOR_RANGE = 2;
/** Half-width of the edge's ramp, metres: the light is full 5 cm inside the outline and gone 5 cm outside it. */
export const POOL_FLOOR_EDGE = .05;

/** The shader's clip factor (0 off the floor, 1 on it) from a GLSL expression reading the map's red channel. */
export function poolFloorClip(sample: string): string {
  const e = (POOL_FLOOR_EDGE / (2 * POOL_FLOOR_RANGE)).toFixed(5);
  return `smoothstep( -${e}, ${e}, ${sample} - 0.5 )`;
}

export interface PoolFloor { map: THREE.DataTexture; rect: THREE.Vector4 }

/** Rasterise the signed distance to the union of `rings` (positive inside) at `cell` metres, over
 * `bounds` [x0, z0, x1, z1] when given (the pools' own extent), else over the rings. */
export function poolFloorMap(rings: readonly (readonly Pt[])[], bounds?: readonly [number, number, number, number], cell = .5): PoolFloor | undefined {
  const points = rings.flat();
  if (!points.length) return;
  const [bx0, bz0, bx1, bz1] = bounds ?? [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
  const x0 = Math.floor(bx0) - 1, z0 = Math.floor(bz0) - 1;
  const nx = Math.ceil((bx1 - x0 + 1) / cell), nz = Math.ceil((bz1 - z0 + 1) / cell);
  const range = POOL_FLOOR_RANGE;
  const distance = new Float32Array(nx * nz).fill(-range);
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - range - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) + range - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - range - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((Math.max(...zs) + range - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + .5) * cell, z = z0 + (j + .5) * cell;
      let d = Infinity;
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k]!, b = ring[(k + 1) % ring.length]!;
        const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)) : 0;
        d = Math.min(d, Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz));
      }
      if (d >= range) { if (!pointInPolygon([x, z], ring as Pt[])) continue; d = range; }
      else if (!pointInPolygon([x, z], ring as Pt[])) d = -d;
      const n = j * nx + i;
      if (d > distance[n]!) distance[n] = d;
    }
  }
  const bytes = Uint8Array.from(distance, d => Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, d / range))));
  const map = new THREE.DataTexture(bytes, nx, nz, THREE.RedFormat);
  map.unpackAlignment = 1; // rows of bytes, not of four
  map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true;
  return { map, rect: new THREE.Vector4(x0, z0, 1 / (nx * cell), 1 / (nz * cell)) };
}
