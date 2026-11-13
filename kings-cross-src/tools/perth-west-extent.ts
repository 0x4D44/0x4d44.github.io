import type { Extent } from '../core/terrain.ts';

/** West extension (Perth frame, x east, z south, metres): from the context extent's west edge (x -1200) out past the
 *  A9 western bypass (OSM: the A9 runs at x -3150..-2770 from z -1600 to 200; Broxden roundabout centre about x -2995, z 360), in whole 16 m steps. */
export const PERTH_WEST_EXTENT: Extent = { x0: -3232, z0: -1600, x1: -1200, z1: 1232 };
