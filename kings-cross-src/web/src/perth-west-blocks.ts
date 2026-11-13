// The west blocks as the page loads them: data/perth-west-blocks.json, written by tools/build-perth-west-blocks.ts from the lane's
// data/perth-scene-west.json (the Waverley packed format the tools and the LiDAR heights builder read; the page no longer bundles it). The
// same blocks, ids, tags and heights, for under two thirds of the gzip bytes (W4 review 2026-11-13, payload over the cap):
// - ids: the way ids ascending as deltas, then the relation ids (the blocks are stored in that order, not the source's);
// - one table of the few distinct (kind, height, minHeight, heightBasis) a block has, and an index into it per block;
// - outlines as plain integer deltas at q (0.1 m, the source's own quantum), each block's first point a delta from the previous block's
//   first point, so gzip sees small repeated integers rather than base64;
// - a block the scene draws as a 'box' (perth-west-buildings.ts perthWestDetail: past PERTH_WEST_DETAIL.lean m, small, no holes) is
//   drawn from the rectangle of its own area, never from its outline, so the file holds that rectangle's four corners. Drawn the same,
//   within 0.2 m, the corners being stored at 0.1 m (web/tests/perth-west-blocks.test.ts); rebuild this file if PERTH_WEST_DETAIL changes (the test says so).
// Pure: no DOM, no three.
import type {Pt} from '../../core/geo.ts';
import type {WaverleyArea, WaverleyScene} from '../../core/waverley-data.ts';

export const PERTH_WEST_BLOCKS_FORMAT = 'perth-west-blocks-v1';
export interface PerthWestBlocksFile {
  format: typeof PERTH_WEST_BLOCKS_FORMAT;
  /** Metres a unit of `outer` and `holes`. */
  q: number;
  origin: WaverleyScene['origin']; bbox: WaverleyScene['bbox']; attribution: string; source: WaverleyScene['source'];
  /** [kind, height, minHeight, heightBasis], each distinct one once. */
  kinds: [WaverleyArea['kind'], number, number, string][];
  /** The blocks' way ids, ascending, as deltas; then the relation ids. The blocks are in this order. */
  way: number[]; relation: string[];
  /** Per block: its index into `kinds`, its tags, its outline (x, z deltas at q; the first point a delta from the previous block's first point). */
  k: number[]; tags: Record<string, string>[]; outer: number[][];
  /** [block index, rings]: each ring as deltas at q, its first point a delta from its block's first outline point. */
  holes: [number, number[][]][];
  /** The mapped roofs, as the scene holds them (five). */
  roofs: WaverleyArea[];
}

/** Integer deltas at q from `from` (in units), and the units of the ring's first point. */
export function encodeRing(ring: readonly Pt[], q: number, from: readonly [number, number] = [0, 0]): {d: number[]; first: [number, number]} {
  const d: number[] = []; let x = from[0], z = from[1], first: [number, number] = [0, 0];
  ring.forEach(([a, b], i) => { const X = Math.round(a / q), Z = Math.round(b / q); if (!i) first = [X, Z]; d.push(X - x, Z - z); x = X; z = Z; });
  return {d, first};
}
function decodeRing(d: readonly number[], q: number, from: readonly [number, number]): {ring: Pt[]; first: [number, number]} {
  const ring: Pt[] = []; let x = from[0], z = from[1], first: [number, number] = [0, 0];
  for (let i = 0; i < d.length; i += 2) { x += d[i]!; z += d[i + 1]!; if (!i) first = [x, z]; ring.push([Math.round(x * q * 1e6) / 1e6, Math.round(z * q * 1e6) / 1e6]); }
  return {ring, first};
}

/** The scene (buildings and roofs; no rails or platforms) the file holds. */
export function decodePerthWestBlocks(f: PerthWestBlocksFile): WaverleyScene {
  if (f.format !== PERTH_WEST_BLOCKS_FORMAT) throw new Error(`not a ${PERTH_WEST_BLOCKS_FORMAT} file`);
  const ids: string[] = []; let id = 0;
  for (const d of f.way) { id += d; ids.push(`way/${id}`); }
  for (const r of f.relation) ids.push(`relation/${r}`);
  if (ids.length !== f.outer.length || f.k.length !== ids.length || f.tags.length !== ids.length) throw new Error('perth-west-blocks: the per-block arrays differ in length');
  const holes = new Map(f.holes);
  let prev: [number, number] = [0, 0];
  const buildings = ids.map((bid, i): WaverleyArea => {
    const {ring: outer, first} = decodeRing(f.outer[i]!, f.q, prev); prev = first;
    const [kind, height, minHeight, heightBasis] = f.kinds[f.k[i]!]!;
    return {id: bid, outer, holes: (holes.get(i) ?? []).map(h => decodeRing(h, f.q, first).ring), height, minHeight, heightBasis, tags: f.tags[i]!, kind};
  });
  return {origin: f.origin, bbox: f.bbox, attribution: f.attribution, source: f.source, rails: [], platforms: [], roofs: f.roofs, buildings, warnings: []};
}
