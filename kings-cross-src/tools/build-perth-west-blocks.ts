// node tools/build-perth-west-blocks.ts   (no network: reads web/src/data/perth-scene-west.json, writes web/src/data/perth-west-blocks.json)
// The page's copy of the west blocks (web/src/perth-west-blocks.ts says what changes and why). Rerun whenever perth-scene-west.json is rebuilt
// (tools/build-perth-west.ts) or PERTH_WEST_DETAIL changes: web/tests/perth-west-blocks.test.ts fails until the two agree.
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {unpackWaverleyScene} from '../core/waverley-data.ts';
import type {WaverleyArea, WaverleyScene} from '../core/waverley-data.ts';
import {addPerthWestBlock, perthWestDetail, perthWestHeight, rectOf, rectRing, westBatches} from '../web/src/perth-west-buildings.ts';
import type {Pt} from '../core/geo.ts';
import {encodeRing, PERTH_WEST_BLOCKS_FORMAT} from '../web/src/perth-west-blocks.ts';
import type {PerthWestBlocksFile} from '../web/src/perth-west-blocks.ts';

const quantised = (r: readonly Pt[], q: number): Pt[] => r.map(([x, z]) => [Math.round(Math.round(x / q) * q * 1e6) / 1e6, Math.round(Math.round(z / q) * q * 1e6) / 1e6]);
const sameHeight = (a: {height: number; basis: string}, b: {height: number; basis: string}) => a.basis === b.basis && Math.abs(a.height - b.height) < 1e-9;
/** Whether two forms of a block draw alike on flat ground at their own detail: as many vertices in each batch, each within `tol` m of one
 *  in the other (a rectangle may start at another corner). web/tests/perth-west-blocks.test.ts checks every block so. */
export function sameDraw(a: WaverleyArea, b: WaverleyArea, tol = .2): boolean {
  const h = perthWestHeight(a).height, x = westBatches(), y = westBatches();
  addPerthWestBlock(x, a, 0, h, perthWestDetail(a)); addPerthWestBlock(y, b, 0, h, perthWestDetail(b));
  return (['walls', 'plain', 'tops'] as const).every(k => {
    const p = x[k].positions, o = y[k].positions; if (p.length !== o.length) return false;
    const has = (u: number[], w: number[]) => { for (let i = 0; i < u.length; i += 3) { let near = false; for (let j = 0; j < w.length && !near; j += 3) near = Math.hypot(u[i]! - w[j]!, u[i + 1]! - w[j + 1]!, u[i + 2]! - w[j + 2]!) < tol; if (!near) return false; } return true; };
    return has(p, o) && has(o, p);
  });
}
/** The block order the file keeps: way ids ascending, then relations in the source's order. */
const wayId = (b: WaverleyArea) => b.id.startsWith('way/') ? Number(b.id.slice(4)) : Infinity;

export function packPerthWestBlocks(scene: WaverleyScene, q = .1): PerthWestBlocksFile {
  const blocks = [...scene.buildings].sort((a, b) => wayId(a) - wayId(b));
  const bad = blocks.filter(b => !/^(way\/\d+|relation\/\d+)$/.test(b.id)); if (bad.length) throw new Error(`unexpected ids: ${bad.slice(0, 3).map(b => b.id)}`);
  const kinds: PerthWestBlocksFile['kinds'] = [], kindOf = new Map<string, number>();
  const file: PerthWestBlocksFile = {format: PERTH_WEST_BLOCKS_FORMAT, q, origin: scene.origin, bbox: scene.bbox, attribution: scene.attribution, source: scene.source,
    kinds, way: [], relation: [], k: [], tags: [], outer: [], holes: [], roofs: scene.roofs};
  let lastWay = 0, prev: [number, number] = [0, 0];
  blocks.forEach((b, i) => {
    if (b.id.startsWith('way/')) { const n = wayId(b); file.way.push(n - lastWay); lastWay = n; } else file.relation.push(b.id.slice('relation/'.length));
    const key = JSON.stringify([b.kind, b.height, b.minHeight, b.heightBasis]);
    if (!kindOf.has(key)) { kindOf.set(key, kinds.length); kinds.push([b.kind, b.height, b.minHeight, b.heightBasis]); }
    file.k.push(kindOf.get(key)!); file.tags.push(b.tags);
    // a 'box' block is drawn from the rectangle of its own area (perth-west-buildings.ts addPerthWestBlock): keep only that rectangle, unless
    // the rectangle's quantised area or corners would change which height rule the block takes (perthWestHeight: a LiDAR height needs a
    // footprint of LIDAR_MIN_AREA inside the terrain), when the outline is kept
    const rect = perthWestDetail(b) === 'box' ? quantised(rectRing(rectOf(b.outer, true)), q) : undefined;
    // or would draw otherwise (a near-square plan whose quantised rectangle swaps its long and short sides, so its roof turns)
    const outer = rect && sameHeight(perthWestHeight(b), perthWestHeight({...b, outer: rect})) && sameDraw(b, {...b, outer: rect}) ? rect : b.outer;
    const {d, first} = encodeRing(outer, q, prev); file.outer.push(d); prev = first;
    if (b.holes.length) file.holes.push([i, b.holes.map(h => encodeRing(h, q, first).d)]);
  });
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dataDir = fileURLToPath(new URL('../web/src/data/', import.meta.url));
  const scene = unpackWaverleyScene(JSON.parse(await readFile(path.join(dataDir, 'perth-scene-west.json'), 'utf8')));
  const file = packPerthWestBlocks(scene), out = path.join(dataDir, 'perth-west-blocks.json');
  await writeFile(out, JSON.stringify(file));
  console.error(`${out}: ${scene.buildings.length} blocks, ${file.kinds.length} kinds`);
}
