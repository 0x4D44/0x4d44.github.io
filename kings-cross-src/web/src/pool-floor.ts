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
  const span = (xs: readonly number[], zs: readonly number[], pad: number): [number, number, number, number] => [
    Math.max(0, Math.floor((Math.min(...xs) - pad - x0) / cell)), Math.min(nx - 1, Math.ceil((Math.max(...xs) + pad - x0) / cell)),
    Math.max(0, Math.floor((Math.min(...zs) - pad - z0) / cell)), Math.min(nz - 1, Math.ceil((Math.max(...zs) + pad - z0) / cell))];
  const range = POOL_FLOOR_RANGE;
  // Inside or outside the union of the outlines.
  const inside = new Uint8Array(nx * nz);
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const [i0, i1, j0, j1] = span(ring.map(p => p[0]), ring.map(p => p[1]), 0);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!inside[j * nx + i] && pointInPolygon([x0 + (i + .5) * cell, z0 + (j + .5) * cell], ring as Pt[])) inside[j * nx + i] = 1;
    }
  }
  // Distance to the union's boundary only: a stretch of edge with another outline on its far side is an interior
  // seam (one platform drawn as two polygons, KX P4/P5), not a coping, and must not darken a line across the floor.
  const unsigned = new Float32Array(nx * nz).fill(range);
  for (const [a, b] of boundary(rings)) {
    const [i0, i1, j0, j1] = span([a[0], b[0]], [a[1], b[1]], range);
    const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + .5) * cell, z = z0 + (j + .5) * cell;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)) : 0;
      const d = Math.hypot(x - a[0] - t * vx, z - a[1] - t * vz), n = j * nx + i;
      if (d < unsigned[n]!) unsigned[n] = d;
    }
  }
  const distance = unsigned.map((d, n) => inside[n] ? d : -d);
  const bytes = Uint8Array.from(distance, d => Math.round(127.5 + 127.5 * Math.max(-1, Math.min(1, d / range))));
  const map = new THREE.DataTexture(bytes, nx, nz, THREE.RedFormat);
  map.unpackAlignment = 1; // rows of bytes, not of four
  map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true;
  return { map, rect: new THREE.Vector4(x0, z0, 1 / (nx * cell), 1 / (nz * cell)) };
}

/** The stretches of the outlines' edges that bound their union: each edge is walked in 0.1 m steps and a step is
 * dropped where the point 5 cm beyond it, on the edge's outer side, lies inside another outline. */
function boundary(rings: readonly (readonly Pt[])[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [], step = .1, probe = .05;
  rings.forEach((ring, r) => {
    if (ring.length < 3) return;
    const ccw = ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) > 0;
    const others = rings.filter((o, k) => k !== r && o.length >= 3).map(o => ({ o, box: [Math.min(...o.map(q => q[0])), Math.min(...o.map(q => q[1])),
      Math.max(...o.map(q => q[0])), Math.max(...o.map(q => q[1]))] }));
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]!, b = ring[(k + 1) % ring.length]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length === 0) continue;
      const dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length, ox = ccw ? dz : -dz, oz = ccw ? -dx : dx; // outward
      const steps = Math.max(1, Math.ceil(length / step));
      let start = -1;
      for (let s = 0; s <= steps; s++) {
        let keep = false;
        if (s < steps) {
          const t = (s + .5) * length / steps, p: Pt = [a[0] + dx * t + ox * probe, a[1] + dz * t + oz * probe];
          keep = !others.some(({ o, box }) => p[0] >= box[0]! && p[1] >= box[1]! && p[0] <= box[2]! && p[1] <= box[3]! && pointInPolygon(p, o as Pt[]));
        }
        if (keep && start < 0) start = s;
        if (!keep && start >= 0) {
          out.push([[a[0] + dx * start * length / steps, a[1] + dz * start * length / steps], [a[0] + dx * s * length / steps, a[1] + dz * s * length / steps]]);
          start = -1;
        }
      }
    }
  });
  return out;
}
