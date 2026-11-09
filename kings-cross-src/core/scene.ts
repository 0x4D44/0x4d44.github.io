// Pure scene data: turns the compact OSM model into the numbers the renderer draws.
// No three.js here, so the rules are testable without a browser.
import type { Pt } from './geo.ts';
import type { KxData } from './osm.ts';
import { isSurfacePlatform, railPair } from './station.ts';

/**
 * Tunnel railhead level, matching surface rails and train wheels. The original scaffold put
 * these at -4 m beneath flat ground; terrain and portal covers now provide actual occlusion.
 * Keep the exported name for geometry readers; a tunnel tag is not elevation evidence.
 */
export const TUNNEL_DEPTH = 0;
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

/** `exclude`: OSM ids drawn some other way (the station building is a roof, not a solid block). */
export function buildingPrisms(data: Pick<KxData, 'buildings'>, exclude: ReadonlySet<number> = new Set()): Prism[] {
  return data.buildings
    .filter((b) => b.pts.length >= 3 && !exclude.has(b.id))
    .map((b) => {
      const p: Prism = { outline: b.pts, height: buildingHeight(b) };
      if (b.name) p.label = b.name;
      return p;
    });
}

/** Surface platforms only: the Underground ones are far below and would cut through the shed floor. */
export function platformPrisms(data: Pick<KxData, 'platforms'>): Prism[] {
  return data.platforms
    .filter((p) => p.pts.length >= 3 && isSurfacePlatform(p))
    .map((p) => {
      const prism: Prism = { outline: p.pts, height: PLATFORM_HEIGHT };
      if (p.ref !== undefined) prism.label = p.ref;
      return prism;
    });
}

/**
 * Twin running rails for flat xyz centre-line segments: two lines per segment, set one gauge
 * (plus a rail head) apart. Same flat layout in and out, so it feeds a LineSegments directly.
 */
export function twinRails(segments: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 5 < segments.length; i += 6) {
    const pair = railPair([segments[i] as number, segments[i + 2] as number], [segments[i + 3] as number, segments[i + 5] as number]);
    if (!pair) continue;
    const y1 = segments[i + 1] as number;
    const y2 = segments[i + 4] as number;
    for (const [x1, z1, x2, z2] of pair) out.push(x1, y1, z1, x2, y2, z2);
  }
  return out;
}

/**
 * A flat strip `width` metres wide under each centre-line segment, as triangles (two per
 * segment, flat xyz), lifted by `lift` so it sits just above the ground plane. Used for the
 * ballast under the track.
 */
export function ribbonTriangles(segments: number[], width: number, lift = 0): number[] {
  const out: number[] = [];
  const h = width / 2;
  for (let i = 0; i + 5 < segments.length; i += 6) {
    const x1 = segments[i] as number;
    const z1 = segments[i + 2] as number;
    const x2 = segments[i + 3] as number;
    const z2 = segments[i + 5] as number;
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l === 0) continue;
    const nx = (-(z2 - z1) / l) * h;
    const nz = ((x2 - x1) / l) * h;
    const y1 = (segments[i + 1] as number) + lift;
    const y2 = (segments[i + 4] as number) + lift;
    out.push(x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz, x2 + nx, y2, z2 + nz);
    out.push(x1 - nx, y1, z1 - nz, x2 - nx, y2, z2 - nz, x2 + nx, y2, z2 + nz);
  }
  return out;
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
