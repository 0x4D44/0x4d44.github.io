import type { Extent } from '../core/terrain.ts';

/** ASSUMED west extension (Perth frame, x east, z south, metres): from the context extent's west edge (x -1200) out past the
 *  A9 western bypass (Broxden roundabout about x -2450, z 890; the A9 at Burghmuir about x -2250, z -840), in whole 16 m steps. */
export const PERTH_WEST_EXTENT: Extent = { x0: -2800, z0: -1600, x1: -1200, z1: 1232 };
