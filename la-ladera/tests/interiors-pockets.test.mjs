// Furniture is a wall, not a step (R2-001 / R2-002): the player's jump must never carry them onto, into or over a piece of furniture, because the outlines are
// thin walls and a body that landed between two of them was shut in (trapcheck STUCK: a bed's headboard, a shower stall next to a toilet).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-pockets.test.mjs
//   A3_SABOTAGE=lowwalls  re-lowers the furniture walls to 0.6 m (the old minimum): the test must FAIL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch, physicsFor, BODY_R, BODY_H } from './interiors-lib.mjs';
import { BLOCK_MIN_H } from '../js/interiors/index.js';
import { obbDist } from '../js/interiors/layout.js';

const SAB = process.env.A3_SABOTAGE;
const worlds = [['synthetic', await furnishedBatch({ n: +(process.env.A3_N || 42) })], ['A2 plans', await furnishedBatch({ real: true })]];
if (SAB === 'lowwalls') for (const [, w] of worlds) for (const bp of w.bps) for (const wl of bp.colliders.walls) if (wl.furniture) wl.y1 = wl.y0 + 0.6;
const JUMP = 3.6, SPEEDS = [2.3, 5.0];                                    // CONFIG.PLAYER: jump velocity, walk and sprint speed
const FACES = [['x', 1], ['x', -1], ['z', 1], ['z', -1]];
const mainRegion = new Map();                                              // layout -> the floor a person can walk to from the doors (0.33 m: the body's radius and a finger)

/** Run at `it` from 0.9 m away holding W, jumping at once. The body may slide round a small piece (a stool), but it may not end up on it, inside its outline
 *  zone (a pocket) or straight across it. Returns one verdict string (or null) per speed. A run-up spot that no door reaches (a sliver sealed by a wheelbarrow,
 *  a mattress and a pile of sacks on a building site) is no spot anybody stands on: the kernel's rescue lifts a body that was put there out across the wall. */
function probe(ph, bp, L, it, [axis, sgn]) {
  const fy = bp.lot.y + (L.room.y ?? 0), half = axis === 'x' ? it.ob.hx : it.ob.hz, side = axis === 'x' ? it.ob.hz : it.ob.hx, ax = axis === 'x' ? it.ob.ux : it.ob.uz;
  const d = half + 0.9, sx = it.ob.cx + ax[0] * sgn * d, sz = it.ob.cz + ax[1] * sgn * d;
  if (!mainRegion.has(L)) mainRegion.set(L, L.connectivity(0.33));
  if (!L.inMainRegion(sx, sz, mainRegion.get(L), 1)) return null;
  const [wx, , wz] = bp.frame.toWorld(sx, 0, sz), [cx, , cz] = bp.frame.toWorld(it.ob.cx, 0, it.ob.cz);
  const len = Math.hypot(cx - wx, cz - wz), hx = (cx - wx) / len, hz = (cz - wz) / len;
  if (ph._overlaps(wx, wz, fy, BODY_R, BODY_H)) return null;                  // the run-up spot is itself inside something
  const f = ph._surf(wx, wz, fy, 0.5, BODY_H); if (f.blocked || Math.abs(f.best - fy) > 0.03) return null;
  const out = [];
  for (const speed of SPEEDS) {
    const s = { x: wx, y: fy, z: wz, vy: 0, onGround: true }, dt = 1 / 60;
    for (let k = 0; k < 60; k++) ph.move(s, hx * speed * dt, hz * speed * dt, dt, { radius: BODY_R, height: BODY_H, jump: k === 0 ? JUMP : undefined });
    const along = (s.x - cx) * hx + (s.z - cz) * hz, lateral = Math.abs(-(s.x - cx) * hz + (s.z - cz) * hx);      // along < 0 in front of the centre line, > 0 past it
    const [lx, , lz] = bp.frame.toLocal(s.x, s.y, s.z), near = obbDist(it.ob, lx, lz), up = s.y - fy;
    let bad = null;
    if (up > 0.15 && near < 0.6) bad = `stands ${up.toFixed(2)} m above the floor, ${near.toFixed(2)} m from it`;       // (a stair flight further on is no concern of the furniture)
    else if (near < 0.2) bad = `ends ${near.toFixed(2)} m from the outline (inside its wall zone)`;
    else if (along > half && lateral < side + 0.05) bad = `crossed it (${along.toFixed(2)} m past the centre line, ${lateral.toFixed(2)} m off axis)`;
    out.push(bad && `${speed} m/s: ${bad}`);
  }
  return out;
}

test('a running jump never carries the player onto, into or over furniture', () => {
  const problems = []; let probes = 0;
  for (const [name, w] of worlds) {
    for (const bp of w.bps) {
      const ph = physicsFor(bp), all = [];
      for (const [, L] of bp.interior?.layouts ?? []) for (const it of L.blockers()) all.push([L, it]);
      all.sort((p, q) => (p[1].bh ?? p[1].h) - (q[1].bh ?? q[1].h));          // the lowest outlines are the risky ones: a bed, a toilet, a chair, a counter
      for (const [L, it] of all.slice(0, 6)) for (const face of FACES) {
        const r = probe(ph, bp, L, it, face); if (!r) continue;
        for (const v of r) { probes++; if (v) problems.push(`${name} ${bp.id} ${it.name} (${it.id}) from ${face.join('')}, ${v}`); }
      }
    }
  }
  assert.ok(probes >= 400, `only ${probes} jump probes ran`);
  assert.equal(problems.length, 0, `${problems.length} of ${probes} jumps got onto or past furniture:\n  ` + problems.slice(0, 10).join('\n  '));
});

test('every furniture outline is a wall the jump cannot clear (>= 1.06 m, still crossable by the rescue: < 2 m)', () => {
  assert.ok(BLOCK_MIN_H >= 1.06, `BLOCK_MIN_H ${BLOCK_MIN_H}: the jump apex (0.66 m) plus the kernel's 0.4 m wall clearance is 1.06 m`);
  const bad = [];
  for (const [name, w] of worlds) for (const bp of w.bps) for (const wl of bp.colliders.walls) {
    if (!wl.furniture) continue;
    const h = wl.y1 - wl.y0;
    if (h < 1.06 - 1e-6 || h >= 2.0) bad.push(`${name} ${bp.id} ${wl.id}: ${h.toFixed(2)} m`);
  }
  assert.equal(bad.length, 0, `${bad.length} furniture walls outside [1.06, 2.0):\n  ` + bad.slice(0, 8).join('\n  '));
});
