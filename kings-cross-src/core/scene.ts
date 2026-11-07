// Pure scene data: turns the compact OSM model into the numbers the renderer draws.
// No three.js here, so the rules are testable without a browser.
import type { Pt } from './geo.ts';
import type { KxData } from './osm.ts';

/** Height of the rail head above ground, metres. Tunnels are drawn below ground. */
export const TUNNEL_DEPTH = -4;
export const PLATFORM_HEIGHT = 0.9;
export const DEFAULT_BUILDING_HEIGHT = 9;
export const LEVEL_HEIGHT = 3.2;
export const MIN_BUILDING_HEIGHT = 3;
export const MAX_BUILDING_HEIGHT = 120;

export interface RailSegments {
  /** flat [x1,y1,z1, x2,y2,z2, ...] per class, ready for a LineSegments geometry */
  main: number[];
  siding: number[];
  tunnel: number[];
}

export function railSegments(data: Pick<KxData, 'nodes' | 'rails'>): RailSegments {
  const pos = new Map<number, Pt>();
  for (const [id, x, z] of data.nodes) pos.set(id, [x, z]);
  const out: RailSegments = { main: [], siding: [], tunnel: [] };
  for (const r of data.rails) {
    const bucket = r.tunnel ? out.tunnel : r.service === 'main' ? out.main : out.siding;
    const y = r.tunnel ? TUNNEL_DEPTH : 0;
    for (let i = 0; i + 1 < r.nodes.length; i++) {
      const a = pos.get(r.nodes[i] as number);
      const b = pos.get(r.nodes[i + 1] as number);
      if (!a || !b) continue;
      bucket.push(a[0], y, a[1], b[0], y, b[1]);
    }
  }
  return out;
}

export interface Prism {
  outline: Pt[];
  height: number;
  /** for platforms: the platform number, for buildings: the name if any */
  label?: string;
}

export function buildingHeight(b: { height?: number; levels?: number }): number {
  const raw = b.height ?? (b.levels !== undefined ? b.levels * LEVEL_HEIGHT : DEFAULT_BUILDING_HEIGHT);
  return Math.min(MAX_BUILDING_HEIGHT, Math.max(MIN_BUILDING_HEIGHT, raw));
}

export function buildingPrisms(data: Pick<KxData, 'buildings'>): Prism[] {
  return data.buildings
    .filter((b) => b.pts.length >= 3)
    .map((b) => {
      const p: Prism = { outline: b.pts, height: buildingHeight(b) };
      if (b.name) p.label = b.name;
      return p;
    });
}

export function platformPrisms(data: Pick<KxData, 'platforms'>): Prism[] {
  return data.platforms
    .filter((p) => p.pts.length >= 3)
    .map((p) => {
      const prism: Prism = { outline: p.pts, height: PLATFORM_HEIGHT };
      if (p.ref !== undefined) prism.label = p.ref;
      return prism;
    });
}

/** Axis-aligned bounds of a set of flat xyz positions, for framing the camera. */
export function bounds(positions: number[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] as number;
    const z = positions[i + 2] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}
