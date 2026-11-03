// INTERIORS (A3, round 5): a curtain does not hang through the furniture that stands under it (R4-207: a floor-length curtain ran through a dresser; on the real plans 4013 of the 9616 folds
// of cloth crossed a bed, a sofa, a nightstand, a plant or a cupboard standing against the window wall).
// Round 7 (R4-708): the height of a piece is the height of its MODEL, not its catalogue entry's: the catalogue keeps the mattress (0.65 m) and the model has a headboard (1.0 m), so 86 double beds had
// the cloth through their heads. The tests below read the heights off the shipped GLBs and hold windows.js's MODEL_TOP to them.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-curtains.test.mjs        A2's real plans
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dressWindows, MODEL_TOP } from '../js/interiors/windows.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { mkObb, segObb } from '../js/interiors/layout.js';
import { describe } from '../tools/blender/glb_info.mjs';
import { furnishedBatch } from './interiors-lib.mjs';

const w = await furnishedBatch({ real: true });
const LOW = 0.3;                                   // clutter lower than this (a box, a pair of shoes) is passed over by the hem, not hung above
const MODELS = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/models');

/** The top of every shipped furniture model in its own frame (standing on y = 0), as the runtime draws it: the hero GLB where there is one, else the library's (manifest.heroes.json overrides manifest.furniture.json). */
const modelTop = new Map();
for (const file of ['manifest.furniture.json', 'manifest.heroes.json']) {
  const manifest = JSON.parse(readFileSync(join(MODELS, file), 'utf8'));
  for (const f of manifest.files) {
    const info = describe(join(MODELS, f.glb));
    for (const [key, meta] of Object.entries(f.assets)) { const a = info.assets.get(meta.node ?? key); if (a) modelTop.set(key, a.max[1]); }
  }
}
/** How high a piece stands: its model's top, else (no model) its catalogue height. Read off the GLB, not off windows.js's table. */
const heightOf = (name) => modelTop.get(name) ?? CATALOG[name].size[1];

/** Every curtain quad of one building, as the builder is asked for it: [p0, p1, p2, p3] with p0-p1 the hem and p2-p3 the head, building-local points. */
const dress = (bp) => { const quads = [], rec = { quad: (key, ...p) => { if (key === 'curtain_fabric') quads.push(p.slice(0, 4)); }, box() {} }; const n = dressWindows(rec, bp); return { quads, n }; };
const pieces = (bp) => (bp.furniture ?? []).filter((f) => { const c = CATALOG[f.name]; return c && !f.decal && !f.parent && f.kind !== 'wall' && f.kind !== 'ceil' && heightOf(f.name) >= LOW; })
  .map((f) => { const c = CATALOG[f.name]; return { f, ob: mkObb(f.x, f.z, f.w ?? c.size[0], f.d ?? c.size[2], f.ry ?? 0), top: f.y + heightOf(f.name) }; });

test('no fold of any curtain, blind or café curtain passes through a piece of furniture whose model stands 0.3 m or taller, and the barrio keeps its curtains', () => {
  let quads = 0, windows = 0, long = 0; const bad = [];
  for (const bp of w.bps) {
    const { quads: qs, n } = dress(bp), ps = pieces(bp);
    windows += n; quads += qs.length;
    for (const [p0, p1, , p3] of qs) {
      if (p3[1] - p0[1] > 1.7) long++;
      for (const k of ps) if (segObb(k.ob, p0[0], p0[2], p1[0], p1[2], 0) && p0[1] < k.top - 0.01 && p3[1] > k.f.y + 0.01) bad.push(`${bp.id} ${k.f.name} (${k.f.room.split('.').slice(1).join('.')}, top ${(k.top - (bp.rooms.find((r) => r.id === k.f.room)?.y ?? 0)).toFixed(2)} m) is in a curtain hanging ${(p0[1] - k.f.y).toFixed(2)} to ${(p3[1] - k.f.y).toFixed(2)} m over its floor`);
    }
  }
  console.log(`# curtains: ${windows} windows dressed, ${quads} folds of cloth, ${long} of them floor-length (taller than 1.7 m)`);
  assert.ok(windows >= 500 && quads >= 6000, `${windows} windows, ${quads} folds: the barrio lost its curtains`);
  assert.ok(long >= 0.5 * quads, `only ${long} of ${quads} folds are floor-length: the fix made every curtain short`);
  assert.equal(bad.length, 0, `${bad.length} folds hang through furniture:\n  ` + bad.slice(0, 10).join('\n  '));
});

test('a piece under the window shortens the cloth over it, and the same window without the piece keeps it floor-length', () => {
  // L08.f2.r1: the dresser (0.9 x 1.1 m, against the east wall) stands in the cloth of the window above it
  const bp = w.bps.find((b) => b.id === 'L08'), room = bp.rooms.find((r) => r.id === 'L08.f2.r1'), r = room.rect;
  const inRoom = (p) => p[0] > r.x0 - 0.3 && p[0] < r.x1 + 0.3 && p[2] > r.z0 - 0.3 && p[2] < r.z1 + 0.3 && p[1] > room.y - 0.1 && p[1] < room.y + room.h;
  const hang = (b) => dress(b).quads.filter((q) => inRoom(q[0])).map((q) => [q[0][1] - room.y, q[3][1] - room.y]);
  const withIt = hang(bp), without = hang({ ...bp, furniture: bp.furniture.filter((f) => f.room !== 'L08.f2.r1' || f.kind === 'wall' || f.kind === 'ceil' || f.decal) });
  assert.ok(without.length > 0 && Math.max(...without.map((q) => q[0])) < 0.1, `with the furniture cleared the curtains of the room hang to the floor: hems at ${[...new Set(without.map((q) => q[0].toFixed(2)))]}`);
  const shorter = withIt.filter((q) => q[0] > 0.5).length;
  assert.ok(shorter > 0, 'nothing in L08.f2.r1 stands in the way of its curtains any more: the test no longer tests anything');
  assert.ok(withIt.length > 0 && withIt.length <= without.length, `${withIt.length} folds with the furniture, ${without.length} without`);
});

test('the cloth beside the bed of L24.f1.r3 hangs above its headboard (1.0 m), not through it (R4-708: the model has a headboard the catalogue does not count)', () => {
  const bp = w.bps.find((b) => b.id === 'L24'), room = bp.rooms.find((r) => r.id === 'L24.f1.r3');
  const beds = pieces(bp).filter((k) => k.f.room === room.id && /^bed_/.test(k.f.name));
  assert.ok(beds.length === 1 && heightOf(beds[0].f.name) >= 0.95, `the room has its bed: ${beds.map((k) => k.f.name)}`);
  const bed = beds[0], hems = [];
  for (const [p0, p1] of dress(bp).quads) if (p0[1] > room.y - 0.05 && p0[1] < room.y + room.h && segObb(bed.ob, p0[0], p0[2], p1[0], p1[2], 0)) hems.push(p0[1] - room.y);   // (the hem is the lower edge, p0-p1; only this storey's cloth)
  assert.ok(hems.length >= 5, `${hems.length} folds hang in front of the bed: the test no longer tests anything`);
  assert.ok(Math.min(...hems) >= heightOf(bed.f.name) - 1e-6, `a fold hangs down to ${Math.min(...hems).toFixed(2)} m over the bed whose headboard stands to ${heightOf(bed.f.name).toFixed(2)} m`);
});

test('MODEL_TOP is the height the shipped models stand to, and no model that stands 3 cm over its catalogue height is missing from it (windows.js reads it, nothing reads the GLBs at runtime)', () => {
  const wrong = Object.entries(MODEL_TOP).filter(([k, v]) => !modelTop.has(k) || Math.abs(modelTop.get(k) - v) > 0.015).map(([k, v]) => `${k}: table ${v}, model ${modelTop.get(k)?.toFixed(3)}`);
  assert.deepEqual(wrong, [], 'entries that are not their model\'s top');
  const missing = [...modelTop].filter(([k, top]) => CATALOG[k] && top > CATALOG[k].size[1] + 0.03 && !(k in MODEL_TOP)).map(([k, top]) => `${k}: model ${top.toFixed(3)} over catalogue ${CATALOG[k].size[1]}`);
  assert.deepEqual(missing, [], 'models taller than the catalogue says that MODEL_TOP does not know');
  for (const k of ['bed_double', 'bed_single', 'sink_kitchen']) assert.ok(MODEL_TOP[k] > CATALOG[k].size[1] + 0.15, `${k} is in the table with its model's height, not the catalogue's`);
});
