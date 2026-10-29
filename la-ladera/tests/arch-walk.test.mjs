// A2: reachability by ACTUALLY WALKING with the physics kernel (flood fill over the real colliders).
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-walk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll, explore, reached, openAllDoors, roofJumpEscapes } from './arch-lib.mjs';

const lots = testLots();
const only = process.env.ARCH_LOTS ? process.env.ARCH_LOTS.split(',') : null;
const { ctx, bps } = planAll(lots);

test('every room, upper floor and walkable roof is reachable from the entrance by walking (doors open)', { timeout: 600000 }, () => {
  const problems = [];
  for (const bp of bps) {
    if (only && !only.includes(bp.id)) continue;
    openAllDoors(ctx, bp, true);
    const { visited, drops, exhausted } = explore(ctx, bp, { step: 0.25 });
    if (exhausted) problems.push(`${bp.id}: exploration did not finish`);
    for (const r of bp.rooms) {
      const cx = (r.rect.x0 + r.rect.x1) / 2, cz = (r.rect.z0 + r.rect.z1) / 2;
      let ok = reached(bp, visited, cx, cz, r.y, 0.6);
      if (!ok && (r.type === 'stairwell' || r.type === 'landing')) {
        // the centre of a core sits on the divider wall: any reached point inside the room counts
        ok = visited.some((s) => { const l = bp.frame.toLocal(s.x, s.y, s.z); return l[0] >= r.rect.x0 - 0.05 && l[0] <= r.rect.x1 + 0.05 && l[2] >= r.rect.z0 - 0.05 && l[2] <= r.rect.z1 + 0.05 && Math.abs(l[1] - r.y) < 0.35; });
      }
      if (!ok) problems.push(`${bp.id} room ${r.id} (${r.type}) not reachable`);
    }
    if (drops.length) problems.push(`${bp.id}: ${drops.length} unguarded drops, e.g. ${JSON.stringify(drops[0].from.map((v) => +v.toFixed(2)))} -> y ${drops[0].to[1].toFixed(2)}`);
    openAllDoors(ctx, bp, false);
  }
  assert.deepEqual(problems, []);
});

test('closed doors block: nothing inside is reachable until the doors open', { timeout: 300000 }, () => {
  for (const bp of bps.slice(0, 6)) {
    openAllDoors(ctx, bp, false);
    const { visited } = explore(ctx, bp, { step: 0.25 });
    const inside = bp.rooms.filter((r) => !r.outdoor && r.floor === 0);
    for (const r of inside) {
      const cx = (r.rect.x0 + r.rect.x1) / 2, cz = (r.rect.z0 + r.rect.z1) / 2;
      assert.ok(!reached(bp, visited, cx, cz, r.y, 0.6), `${bp.id} ${r.id} reachable through closed doors`);
    }
    for (const e of bp.entrances.filter((q) => q.kind !== 'roof').slice(0, 1)) ctx.physics.setDoor(e.doorId, true);
    const opened = explore(ctx, bp, { step: 0.25 });
    const room = bp.rooms.find((r) => r.doors.includes(bp.entrances[0].doorId));
    assert.ok(room, 'entrance room');
    assert.ok(reached(bp, opened.visited, (room.rect.x0 + room.rect.x1) / 2, (room.rect.z0 + room.rect.z1) / 2, room.y, 0.7), `${bp.id} entry room reachable once the entrance door is open`);
    openAllDoors(ctx, bp, false);
  }
});

test('entry steps carry the player over a sill 0.52 m above the street (more than one step-up), with human-scale risers', { timeout: 300000 }, () => {
  const { ctx: c2, bps: b2 } = planAll(lots, undefined, true, 0.52, 0);      // no plinth margin: the street meets the wall 0.52 m below the sill
  const problems = [];
  let checked = 0;
  for (const bp of b2) {
    if (only && !only.includes(bp.id)) continue;
    const planned = new Set(bp.shell.steps.map((s) => s.door));
    openAllDoors(c2, bp, true);
    const { visited } = explore(c2, bp, { step: 0.25 });
    for (const e of bp.entrances) {
      const d = bp.doors.find((q) => q.id === e.doorId);
      if (d.roof || d.floor !== 0 || d.kind === 'shutter') continue;      // roof casetas have their own stair; shop shutters open onto the pavement
      checked++;
      if (!planned.has(d.id)) problems.push(`${bp.id} ${d.id}: no entry step planned`);
      const l = bp.frame.toLocal(...e.inside);
      if (!reached(bp, visited, l[0], l[2], l[1], 0.5)) problems.push(`${bp.id} ${e.id}: cannot climb to the door`);
    }
    const byDoor = new Map();
    for (const s of bp.shell.steps) (byDoor.get(s.door) ?? byDoor.set(s.door, []).get(s.door)).push(s);
    for (const [id, list] of byDoor) {
      const tops = list.map((s) => s.y1).sort((a, b) => b - a);
      if (tops[0] > 0 || tops[0] < -0.05) problems.push(`${bp.id} ${id}: top tread ${tops[0]} is not just below the sill`);
      for (let i = 1; i < tops.length; i++) if (tops[i - 1] - tops[i] > 0.21) problems.push(`${bp.id} ${id}: riser ${(tops[i - 1] - tops[i]).toFixed(2)} m`);
      if (tops.at(-1) - list[0].y0 < 0.05) problems.push(`${bp.id} ${id}: bottom tread does not reach the ground`);
    }
    openAllDoors(c2, bp, false);
  }
  assert.ok(checked >= 20, `only ${checked} ground-floor doors checked`);
  assert.deepEqual(problems, []);
});

test('every doorway admits the R=0.3 player with +-0.11 m of lateral error, and the wall beside it still blocks', () => {
  const ph = ctx.physics, P = { radius: 0.3, height: 1.78, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 };
  const run = (bp, d, lat) => {
    const along = d.wall.dir === 'x' ? [1, 0] : [0, 1];
    const a = bp.frame.toWorld(d.x - d.nx * 0.55 + along[0] * lat, d.y, d.z - d.nz * 0.55 + along[1] * lat);
    const b = bp.frame.toWorld(d.x + d.nx * 0.55 + along[0] * lat, d.y, d.z + d.nz * 0.55 + along[1] * lat);
    const s = { x: a[0], z: a[2], y: a[1], vy: 0, onGround: true };
    ph.move(s, 0, 0, 0.016, P);
    const n = 40, dx = (b[0] - a[0]) / n, dz = (b[2] - a[2]) / n;
    for (let i = 0; i < n; i++) ph.move(s, dx, dz, 1 / 60, P);
    return Math.hypot(s.x - b[0], s.z - b[2]);
  };
  const bad = [];
  let count = 0, checkedSides = 0;
  for (const bp of bps) {
    openAllDoors(ctx, bp, true);
    for (const d of bp.doors) {
      if (d.kind === 'shutter') continue;
      count++;
      for (const lat of [-0.11, 0, 0.11]) { const miss = run(bp, d, lat); if (miss > 0.08) bad.push(`${d.id} (${d.kind} w ${d.w}) lat ${lat}: stopped ${miss.toFixed(2)} m short`); }
      // aimed at the solid wall beside the door (only where >= 0.6 m of unbroken wall stands there): must be blocked
      const wl = [...bp.shell.walls, ...(bp.shell.roofLayer?.caseta?.walls ?? [])].find((q) => q.floor === d.floor && q.dir === d.wall.dir && Math.abs(q.at - d.wall.at) < 0.02 && q.openings.some((o) => o.ref === d.id));
      if (!wl) { bad.push(`${d.id} has no wall record`); continue; }
      const u = d.wall.dir === 'z' ? d.z : d.x, u0 = u - d.w / 2, u1 = u + d.w / 2;
      const gaps = wl.openings.filter((o) => ['door', 'arch', 'shutter'].includes(o.kind) && o.ref !== d.id);
      const hi = Math.min(wl.a1, ...gaps.filter((o) => o.u0 >= u1 - 1e-6).map((o) => o.u0)), lo = Math.max(wl.a0, ...gaps.filter((o) => o.u1 <= u0 + 1e-6).map((o) => o.u1));
      const sides = [];
      if (hi - u1 >= 0.6) sides.push(d.w / 2 + 0.25);
      if (u0 - lo >= 0.6) sides.push(-(d.w / 2 + 0.25));
      for (const lat of sides) { const miss = run(bp, d, lat); if (miss < 0.3) bad.push(`${d.id} wall beside the door lets the player through at lat ${lat.toFixed(2)}`); checkedSides++; }
    }
    openAllDoors(ctx, bp, false);
  }
  assert.ok(count > 80 && checkedSides > 60, `doors tested: ${count}, wall sides tested: ${checkedSides}`);
  assert.deepEqual(bad.slice(0, 12), []);
});

test('a walkable roof is a room, not a launch pad: no real jump (walk or sprint, 60 or 20 fps) clears its parapet or pretil', () => {
  let roofs = 0; const problems = [];
  for (const bp of bps) {
    if (!bp.roof.walkable) continue;
    roofs++;
    const esc = roofJumpEscapes(ctx, bp);
    if (esc.length) problems.push(`${bp.id} (${bp.shell.roofStyle}, parapet ${bp.shell.roofLayer?.parapetH}): ${esc.length} jumps clear the fence, e.g. ${JSON.stringify(esc[0])}`);
  }
  assert.ok(roofs >= 6, `only ${roofs} walkable roofs / open decks in the test lots`);
  assert.deepEqual(problems, []);
});

test('walking straight through a door line works (door opens, player passes, wall beside it blocks)', () => {
  const bp = bps[0];
  const e = bp.entrances[0], d = bp.doors.find((q) => q.id === e.doorId);
  const ph = ctx.physics;
  openAllDoors(ctx, bp, false);
  const P = { radius: 0.3, height: 1.78, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 };
  const s = { x: e.outside[0], z: e.outside[2], y: e.outside[1], vy: 0, onGround: true };
  const dx = e.inside[0] - e.outside[0], dz = e.inside[2] - e.outside[2];
  for (let i = 0; i < 30; i++) ph.move(s, dx / 30, dz / 30, 1 / 60, P);
  assert.ok(s.blocked || Math.hypot(s.x - e.inside[0], s.z - e.inside[2]) > 0.3, 'closed door stops the player');
  ph.setDoor(d.id, true);
  const s2 = { x: e.outside[0], z: e.outside[2], y: e.outside[1], vy: 0, onGround: true };
  for (let i = 0; i < 30; i++) ph.move(s2, dx / 30, dz / 30, 1 / 60, P);
  assert.ok(Math.hypot(s2.x - e.inside[0], s2.z - e.inside[2]) < 0.12, 'open door lets the player in');
  assert.ok(Math.abs(s2.y - e.inside[1]) < 0.05, `player ends on the ground floor (y ${s2.y})`);
  ph.setDoor(d.id, false);
});
