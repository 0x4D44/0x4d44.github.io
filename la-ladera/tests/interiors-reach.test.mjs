// Reachability with the REAL physics kernel: after furnishing, every room and every door of a building must still be walkable
// from the street with a 0.35 m radius body (0.7 m passages), exactly as without furniture; paths are re-walked with ctx.physics.move().
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-reach.test.mjs
//   A3_SABOTAGE=unreach  (walls off the entrance) must make it fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch, sabotage, physicsFor, reach, replay, landing, walkStair, roomOf } from './interiors-lib.mjs';

const N = +(process.env.A3_N || 28);
const { bps } = await furnishedBatch({ n: N, planSeed: +(process.env.A3_PLAN_SEED || 5), seed: +(process.env.A3_SEED || 21) });
sabotage(bps);

const cache = new Map();
function analyse(bp) {
  if (cache.has(bp.id)) return cache.get(bp.id);
  const free = physicsFor(bp, { furniture: false }), full = physicsFor(bp, { furniture: true });
  const r = { free, full, base: reach(bp, free), now: reach(bp, full) };
  cache.set(bp.id, r); return r;
}

test('the synthetic plans themselves are fully walkable (so a failure below is the furniture)', () => {
  const problems = [];
  for (const bp of bps) {
    const { base } = analyse(bp);
    if (!base.start) { problems.push(`${bp.id}: no free cell outside the entrance`); continue; }
    for (const r of bp.rooms) if (!base.rooms.has(r.id)) problems.push(`${bp.id}: room ${r.id} (${r.type}) unreachable even without furniture`);
    for (const s of base.stairReports) if (!s.ok) problems.push(`${bp.id}: stair ${s.id} cannot be climbed (end ${s.end.map((v) => v.toFixed(2))})`);
  }
  assert.equal(problems.length, 0, problems.slice(0, 10).join('\n'));
});

test('furnished rooms, door landings and stairs stay reachable from the street', () => {
  const problems = [];
  for (const bp of bps) {
    const { base, now } = analyse(bp);
    if (!now.start) { problems.push(`${bp.id}: the entrance is blocked`); continue; }
    for (const r of bp.rooms) if (base.rooms.has(r.id) && !now.rooms.has(r.id)) problems.push(`${bp.id}: room ${r.id} (${r.type}) is cut off by furniture`);
    for (const d of bp.doors) for (const rid of d.rooms) {
      if (!rid) continue;
      const L = landing(bp, d, rid, 0.65); if (!L) continue;
      if (base.visited(L.fl, L.world[0], L.world[2], 0.3) && !now.visited(L.fl, L.world[0], L.world[2], 0.3)) problems.push(`${bp.id}: landing of door ${d.id} in ${rid} cannot be reached`);
    }
    for (const s of now.stairReports) if (!s.ok) problems.push(`${bp.id}: stair ${s.id} cannot be climbed once furnished`);
  }
  assert.equal(problems.length, 0, `${problems.length} problems:\n  ` + problems.slice(0, 12).join('\n  '));
});

test('walking the found paths with physics.move() never gets blocked', () => {
  const problems = [];
  for (const bp of bps.slice(0, Math.min(bps.length, 14))) {
    const { full, now } = analyse(bp);
    let checked = 0;
    for (const d of bp.doors) for (const rid of d.rooms) {
      if (!rid || checked >= 5) continue;
      const L = landing(bp, d, rid, 0.65); if (!L) continue;
      const c = now.visited(L.fl, L.world[0], L.world[2], 0.3); if (!c) continue;
      const res = replay(full, bp, now.path(c));
      checked++;
      if (!res.ok) problems.push(`${bp.id}: walking to the landing of ${d.id} in ${rid} blocked near (${res.at?.map((v) => (+v).toFixed(2))}) got (${res.got?.map((v) => (+v).toFixed(2))})`);
    }
  }
  assert.equal(problems.length, 0, problems.slice(0, 10).join('\n'));
});

test('every standing anchor (cook, counter, sweep, greet...) is connected to a door', () => {
  const problems = [];
  const STAND = new Set(['cook', 'counter', 'customer', 'sweep', 'laundry', 'wash', 'greet', 'chat', 'lean', 'stand', 'vend', 'play']);
  for (const bp of bps) {
    const { base, now } = analyse(bp);
    for (const a of bp.anchors) {
      if (!STAND.has(a.kind)) continue;
      const fl = roomOf(bp, a.room).floor;
      const had = base.visited(fl, a.x, a.z, 0.45), has = now.visited(fl, a.x, a.z, 0.45);
      if (had && !has) problems.push(`${bp.id}: ${a.kind} anchor ${a.id} in ${a.room} is walled in by furniture`);
    }
  }
  assert.equal(problems.length, 0, `${problems.length} problems:\n  ` + problems.slice(0, 12).join('\n  '));
});
