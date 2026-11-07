// Named rectangles in the local metric frame (x east, z south, metres from ORIGIN).
// The OSM extract also covers St Pancras and Underground platforms that reuse the same
// platform numbers, so "platform 3" only means anything inside a zone.
import type { Pt } from './geo.ts';

export interface Zone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** King's Cross mainline station: platforms 0-10 sit about x 4..73, z -200..-265 on the 2026 OSM extract. */
export const KINGS_CROSS: Zone = { minX: -40, maxX: 110, minZ: -320, maxZ: -170 };

export const inZone = (z: Zone, p: Pt): boolean => p[0] >= z.minX && p[0] <= z.maxX && p[1] >= z.minZ && p[1] <= z.maxZ;

export const centroid = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
