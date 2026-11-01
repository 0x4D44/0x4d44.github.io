// INTERIORS (A3, round 5): a curtain does not hang through the furniture that stands under it (R4-207: a floor-length curtain ran through a dresser; on the real plans 4013 of the 9616 folds
// of cloth crossed a bed, a sofa, a nightstand, a plant or a cupboard standing against the window wall).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-curtains.test.mjs        A2's real plans
import test from 'node:test';
import assert from 'node:assert/strict';
import { dressWindows } from '../js/interiors/windows.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { mkObb, segObb } from '../js/interiors/layout.js';
import { furnishedBatch } from './interiors-lib.mjs';

const w = await furnishedBatch({ real: true });
const LOW = 0.3;                                   // clutter lower than this (a box, a pair of shoes) is passed over by the hem, not hung above

/** Every curtain quad of one building, as the builder is asked for it: [p0, p1, p2, p3] with p0-p1 the hem and p2-p3 the head, building-local points. */
const dress = (bp) => { const quads = [], rec = { quad: (key, ...p) => { if (key === 'curtain_fabric') quads.push(p.slice(0, 4)); }, box() {} }; const n = dressWindows(rec, bp); return { quads, n }; };
const pieces = (bp) => (bp.furniture ?? []).filter((f) => { const c = CATALOG[f.name]; return c && !f.decal && !f.parent && f.kind !== 'wall' && f.kind !== 'ceil' && c.size[1] >= LOW; })
  .map((f) => { const c = CATALOG[f.name]; return { f, ob: mkObb(f.x, f.z, f.w ?? c.size[0], f.d ?? c.size[2], f.ry ?? 0), top: f.y + c.size[1] }; });

test('no fold of any curtain, blind or café curtain passes through a piece of furniture 0.3 m or taller, and the barrio keeps its curtains', () => {
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
