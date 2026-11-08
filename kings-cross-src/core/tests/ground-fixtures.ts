// Surfaces with known answers, for the tests that stand buildings on the ground (core/terrain.ts): a height function laid on a
// grid over some rings, and the lowest and highest value of the function itself under a ring, found without the terrain.
// Not a test file: the *.test.ts files in core/tests and web/tests import it.
import type { Pt } from '../geo.ts';
import { pointInPolygon } from '../station.ts';
import { terrainFromFunction } from '../terrain.ts';
import type { Terrain } from '../terrain.ts';

export type Surface = (x: number, z: number) => number;

/** A plane tilted 10% east and south: 0.1 m higher for every metre east and every metre south, `h0` high at the origin. */
export const tilted = (h0 = 0): Surface => (x, z) => h0 + 0.1 * (x + z);

/** A step: `low` west of x = `at`, `high` from there east. */
export const stepAt = (at: number, low = 0, high = 3): Surface => (x) => (x < at ? low : high);

/** A terrain over the rings' bounding box and `margin` metres more all round, laid on a grid of `step` metres (heights are good to a millimetre). */
export function terrainOver(rings: readonly (readonly Pt[])[], f: Surface, step = 2, margin = 20): Terrain {
  const xs = rings.flat().map((p) => p[0]);
  const zs = rings.flat().map((p) => p[1]);
  const down = (v: number): number => Math.floor(v / step) * step;
  const up = (v: number): number => Math.ceil(v / step) * step;
  return terrainFromFunction(f, { x0: down(Math.min(...xs) - margin), z0: down(Math.min(...zs) - margin), x1: up(Math.max(...xs) + margin), z1: up(Math.max(...zs) + margin) }, step);
}

/** The x of the middle of some rings' corners, on the 2 m grid: where to put a step so that it cuts the footprint. */
export function middleX(rings: readonly (readonly Pt[])[], step = 2): number {
  const xs = rings.flat().map((p) => p[0]);
  return Math.round(xs.reduce((s, x) => s + x, 0) / xs.length / step) * step;
}

/** The lowest and highest value of a surface under a ring: at its corners and on a 0.5 m lattice inside it. */
export function extremes(f: Surface, ring: readonly Pt[]): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  const take = (x: number, z: number): void => {
    const h = f(x, z);
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  };
  for (const [x, z] of ring) take(x, z);
  const poly = [...ring];
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.5) if (pointInPolygon([x, z], poly)) take(x, z);
  return { lo, hi };
}

/** The same over several rings: the lowest of the lows and the highest of the highs. */
export function extremesOver(f: Surface, rings: readonly (readonly Pt[])[]): { lo: number; hi: number } {
  const all = rings.map((r) => extremes(f, r));
  return { lo: Math.min(...all.map((e) => e.lo)), hi: Math.max(...all.map((e) => e.hi)) };
}
