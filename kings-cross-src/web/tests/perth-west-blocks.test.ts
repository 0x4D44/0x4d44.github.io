// The page's compact copy of the west blocks (web/src/perth-west-blocks.ts, tools/build-perth-west-blocks.ts): it is the source scene
// repacked (rebuilt whenever that or the detail rule changes), it holds every block with its own id, tags and heights, and every block is
// drawn from it as from the source, to the 0.1 m quantum.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import {packPerthWestBlocks} from '../../tools/build-perth-west-blocks.ts';
import {decodePerthWestBlocks} from '../src/perth-west-blocks.ts';
import type {PerthWestBlocksFile} from '../src/perth-west-blocks.ts';
import {addPerthWestBlock, perthWestDetail, perthWestHeight, westBatches} from '../src/perth-west-buildings.ts';

const read = (name: string) => readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8');
const sourceText = read('perth-scene-west.json'), blocksText = read('perth-west-blocks.json');
const source = unpackWaverleyScene(JSON.parse(sourceText)), file = JSON.parse(blocksText) as PerthWestBlocksFile, blocks = decodePerthWestBlocks(file);
const byId = new Map(blocks.buildings.map(b => [b.id, b]));

/** Where two JSON-able files first differ, in a few words: the key, and for a per-block array the block's index and id. Never a
 *  deepEqual of the files: node's diff of two objects this size ran a test process past the box's memory guard (2026-11-13). */
function firstDifference(a: Record<string, unknown>, b: Record<string, unknown>): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    const x = a[key], y = b[key]; if (JSON.stringify(x) === JSON.stringify(y)) continue;
    if (!Array.isArray(x) || !Array.isArray(y)) return `'${key}' differs`;
    for (let i = 0; i < Math.max(x.length, y.length); i++) if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) {
      const id = key === 'outer' || key === 'k' || key === 'tags' ? ` (block ${i}, ${decodePerthWestBlocks(a as unknown as PerthWestBlocksFile).buildings[i]?.id ?? 'past the end'})` : '';
      return `'${key}' first differs at index ${i}${id}; lengths ${x.length} and ${y.length}`;
    }
  }
  return 'the key order differs';
}

test('the committed blocks file is the source scene packed now (rerun tools/build-perth-west-blocks.ts after the source or PERTH_WEST_DETAIL changes)', () => {
  const diff = firstDifference(file as unknown as Record<string, unknown>, JSON.parse(JSON.stringify(packPerthWestBlocks(source))));
  if (diff) assert.fail(`perth-west-blocks.json is not the source packed now: ${diff}. Rerun tools/build-perth-west-blocks.ts.`);
});

test('every source block is there once, with its own id, tags, kind and heights; the roofs and the credit as the source has them', () => {
  assert.equal(blocks.buildings.length, source.buildings.length); assert.equal(byId.size, source.buildings.length);
  for (const s of source.buildings) {
    const b = byId.get(s.id); assert.ok(b, s.id);
    assert.deepEqual([b!.kind, b!.height, b!.minHeight, b!.heightBasis, b!.tags], [s.kind, s.height, s.minHeight, s.heightBasis, s.tags], s.id);
    assert.equal(b!.holes.length, s.holes.length, s.id);
    assert.deepEqual(perthWestHeight(b!), perthWestHeight(s), `${s.id}: the same height and basis`);
  }
  assert.deepEqual(blocks.roofs, source.roofs); assert.equal(blocks.attribution, source.attribution); assert.deepEqual(blocks.source, source.source);
});

test('every block is drawn from the file as from the source (a box within 0.2 m); only a \'box\' block\'s outline is its rectangle', () => {
  let boxes = 0;
  for (const s of source.buildings) {
    const b = byId.get(s.id)!, d = perthWestDetail(s);
    if (d === 'box' && b.outer.length === 4 && s.outer.length !== 4 || d === 'box' && b.outer.some((p, i) => Math.hypot(p[0] - s.outer[i]![0], p[1] - s.outer[i]![1]) > 1e-6)) boxes++;
    else {
      assert.equal(b.outer.length, s.outer.length, s.id);
      b.outer.forEach((p, i) => assert.ok(Math.hypot(p[0] - s.outer[i]![0], p[1] - s.outer[i]![1]) < 1e-6, `${s.id} vertex ${i}`));
      b.holes.forEach((h, k) => h.forEach((p, i) => assert.ok(Math.hypot(p[0] - s.holes[k]![i]![0], p[1] - s.holes[k]![i]![1]) < 1e-6, `${s.id} hole ${k}`)));
    }
    // drawn on flat ground at its own detail: the same triangles, every vertex within 0.2 m
    const a = westBatches(), c = westBatches(), h = perthWestHeight(s).height;
    addPerthWestBlock(a, s, 0, h, d); addPerthWestBlock(c, b, 0, h, perthWestDetail(b));
    // (a box's rectangle may start at another corner, so its vertices are matched as a set, each to one within 0.2 m: the rectangle is stored at the 0.1 m quantum, so its corners move up to 0.07 m and its sides by as much)
    for (const k of ['walls', 'plain', 'tops'] as const) {
      const pa = a[k].positions, pc = c[k].positions;
      assert.equal(pc.length, pa.length, `${s.id} ${k}: as many vertices`);
      for (const [p, o] of [[pa, pc], [pc, pa]] as const) for (let i = 0; i < p.length; i += 3) {
        let near = false; for (let j = 0; j < o.length && !near; j += 3) near = Math.hypot(p[i]! - o[j]!, p[i + 1]! - o[j + 1]!, p[i + 2]! - o[j + 2]!) < .2;
        assert.ok(near, `${s.id} ${k}: a vertex at ${p.slice(i, i + 3)} has no match within 0.2 m`);
      }
    }
  }
  assert.ok(boxes > 4000, `${boxes} boxes`);
});

test('the page loads under two thirds of the source\'s gzip bytes', () => {
  const g = (t: string) => gzipSync(t, {level: 9}).length, a = g(sourceText), b = g(blocksText);
  assert.ok(b < a * 2 / 3, `${b} B gzip against the source's ${a}`);
});
