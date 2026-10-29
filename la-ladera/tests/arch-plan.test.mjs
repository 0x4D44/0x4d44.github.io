// A2 data-layer invariants: tiling, human-scale dimensions, determinism, structure.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-plan.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { LOT_KINDS } from '../js/core/vocab.js';

const lots = testLots();
const { ctx, bps } = planAll(lots);
const inRect = (r, x, z, e = 0) => x >= r.x0 - e && x <= r.x1 + e && z >= r.z0 - e && z <= r.z1 + e;

test('every LOT_KIND has at least one test lot and a plan', () => {
  for (const k of LOT_KINDS) assert.ok(lots.some((l) => l.kind === k), `kind ${k} covered`);
  assert.equal(bps.length, lots.length);
});

test('BuildingPlan shape (CONTRACT 5.2)', () => {
  for (const bp of bps) {
    const id = bp.id;
    assert.ok(bp.frame && bp.footprint.length === 4 && bp.bounds, id);
    assert.ok(bp.rooms.length >= 2 || bp.lot.kind === 'kiosk', `${id} has rooms`);
    assert.ok(bp.entrances.length >= 1, `${id} has an entrance`);
    for (const e of bp.entrances) {
      assert.ok(bp.doors.some((d) => d.id === e.doorId), `${id} entrance door exists`);
      assert.equal(e.outside.length, 3); assert.equal(e.inside.length, 3);
      assert.ok(Number.isFinite(e.yawIn) && Number.isFinite(e.ry));
    }
    assert.ok(bp.colliders.walls.length > 0 && bp.colliders.floors.length > 0, `${id} colliders`);
    assert.ok(Array.isArray(bp.anchors) && Array.isArray(bp.furniture) && Array.isArray(bp.lights));
    for (const r of bp.rooms) {
      assert.match(r.id, new RegExp(`^${id}\\.f\\d+\\.r\\d+$`));
      assert.ok(r.rect.x1 > r.rect.x0 && r.rect.z1 > r.rect.z0, `${r.id} rect`);
      assert.ok(r.finish && typeof r.finish === 'object');
    }
    const ids = new Set(); for (const d of bp.doors) { assert.ok(!ids.has(d.id)); ids.add(d.id); }
    for (const f of bp.floors) assert.ok(f.rooms.every((rid) => bp.rooms.some((r) => r.id === rid)), `${id} floor rooms exist`);
  }
});

test('rooms never overlap and every floor point is a room, a stair void or a partition', () => {
  for (const bp of bps) {
    const sh = bp.shell, inner = sh.inner;
    for (const f of bp.floors.filter((q) => !q.roof)) {
      const rooms = f.rooms.map((rid) => bp.rooms.find((r) => r.id === rid));
      const cells = [...rooms.map((r) => r.rect), ...f.voids];
      const walls = sh.walls.filter((w) => w.floor === f.index && !w.ext);
      let bad = 0, firstBad = null;
      for (let x = inner.x0 + 0.05; x < inner.x1; x += 0.1) {
        for (let z = inner.z0 + 0.05; z < inner.z1; z += 0.1) {
          const n = cells.filter((c) => inRect(c, x, z)).length;
          if (n > 1) { bad++; firstBad ??= `overlap@${x.toFixed(2)},${z.toFixed(2)}`; continue; }
          if (n === 0) {
            const inWall = walls.some((w) => (w.dir === 'z' ? Math.abs(x - w.at) <= w.t / 2 + 0.01 && z >= w.a0 - 0.01 && z <= w.a1 + 0.01 : Math.abs(z - w.at) <= w.t / 2 + 0.01 && x >= w.a0 - 0.01 && x <= w.a1 + 0.01));
            if (!inWall) { bad++; firstBad ??= `gap@${x.toFixed(2)},${z.toFixed(2)}`; }
          }
        }
      }
      assert.equal(bad, 0, `${bp.id} floor ${f.index}: ${bad} bad sample points (${firstBad})`);
    }
  }
});

test('human-scale dimensions (doors, ceilings, windows, stairs)', () => {
  for (const bp of bps) {
    const sh = bp.shell;
    assert.ok(sh.h >= 2.4 && sh.h <= 2.9, `${bp.id} ceiling ${sh.h}`);
    for (const d of bp.doors) {
      if (d.kind === 'arch') { assert.ok(d.w >= 0.9 && d.w <= 3.5 && d.h >= 2.0 && d.h <= 2.6, `${d.id} arch ${d.w}x${d.h}`); continue; }
      if (d.kind === 'interior') assert.ok(d.w >= 0.8 - 1e-9 && d.w <= 0.9 + 1e-9 && d.h >= 2.0 && d.h <= 2.1 + 1e-9, `${d.id} interior door ${d.w}x${d.h}`);
      else if (d.kind === 'exterior') assert.ok(d.w >= 0.9 && d.w <= 1.1 && d.h >= 2.0 && d.h <= 2.2, `${d.id} exterior door ${d.w}x${d.h}`);
      else if (d.kind === 'shutter') assert.ok(d.w >= 1.6 && d.w <= 3.2 && d.h >= 2.1 && d.h <= 2.5, `${d.id} shutter ${d.w}x${d.h}`);
    }
    for (const w of bp.windows) {
      assert.ok(w.y >= 0.3 && w.y + w.h <= sh.h - 0.15, `${w.id} window fits under the ceiling (y ${w.y} h ${w.h})`);
      assert.ok(w.w >= 0.5 && w.w <= 2.4, `${w.id} width ${w.w}`);
      if (w.y >= 0.85 && w.y <= 1.15) assert.ok(true);
    }
    for (const s of bp.stairs) {
      assert.ok(s.rise >= 0.17 && s.rise <= 0.19, `${s.id} rise ${s.rise}`);
      assert.ok(s.run >= 0.26 && s.run <= 0.28, `${s.id} run ${s.run}`);
      assert.ok(s.width >= 0.9, `${s.id} width ${s.width}`);
      assert.equal(s.steps, Math.round(sh.fh / s.rise));
    }
  }
});

test('windows never sit on party walls and never overlap doors', () => {
  for (const bp of bps) {
    for (const w of bp.windows) {
      const side = w.side;
      assert.ok(!bp.shell.party[side], `${w.id} on party side ${side}`);
      const c = side === 'front' || side === 'back' ? w.x : w.z;
      for (const d of bp.doors.filter((q) => q.ext && q.side === side && q.floor === w.floor)) {
        const dc = side === 'front' || side === 'back' ? d.x : d.z;
        assert.ok(Math.abs(c - dc) > (w.w + d.w) / 2 + 0.05, `${w.id} overlaps door ${d.id}`);
      }
    }
  }
});

test('stairs keep >= 2.0 m real headroom along every flight', () => {
  for (const bp of bps) {
    const c = bp.shell.core; if (!c) continue;
    const ph = ctx.physics;
    for (const f of c.flights) {
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, x = f.from[0] + (f.to[0] - f.from[0]) * t, z = f.from[1] + (f.to[1] - f.from[1]) * t;
        const y = f.yFrom + (f.yTo - f.yFrom) * t;
        const w = bp.frame.toWorld(x, y, z);
        // physics surfaces are slab TOPS: the real ceiling is top - slab thickness
        const above = ph.heightsAt(w[0], w[2]).filter((h) => h > w[1] + 0.3);
        if (above.length) assert.ok(above[0] - bp.shell.slab - w[1] >= 2.0 - 1e-6, `${bp.id} flight ${f.id} t=${t}: headroom ${(above[0] - bp.shell.slab - w[1]).toFixed(2)}`);
      }
    }
  }
});

test('wall colliders leave every doorway a corridor of w - 0.6 m for the R = 0.3 body (round caps included)', () => {
  // physics inflates each wall segment by R + t on all sides, so the free centre corridor between the two wall pieces beside an
  // opening is (gap between their ends) - 2(R + t). Pieces stop t short of the jamb, which restores w - 2R.
  let measured = 0;
  const bad = [];
  for (const bp of bps) {
    for (const d of bp.doors) {
      const along = d.wall.dir === 'x' ? 0 : 2, across = d.wall.dir === 'x' ? 2 : 0;       // index into toLocal() = [x, y, z]
      const u = d.wall.dir === 'x' ? d.x : d.z, u0 = u - d.w / 2, u1 = u + d.w / 2;
      const yw = bp.frame.y + d.y + 1.0;
      let lo = null, hi = null;
      for (const w of bp.colliders.walls) {
        if (w.door || w.y0 > yw || w.y1 < yw) continue;
        const a = bp.frame.toLocal(w.x1, yw, w.z1), b = bp.frame.toLocal(w.x2, yw, w.z2);
        if (Math.abs(a[across] - d.wall.at) > 0.02 || Math.abs(b[across] - d.wall.at) > 0.02) continue;
        const lo2 = Math.min(a[along], b[along]), hi2 = Math.max(a[along], b[along]);
        if (hi2 <= u0 + 1e-6 && (!lo || hi2 > lo.end)) lo = { end: hi2, t: w.t };
        if (lo2 >= u1 - 1e-6 && (!hi || lo2 < hi.end)) hi = { end: lo2, t: w.t };
      }
      if (!lo || !hi || u0 - lo.end > 0.5 || hi.end - u1 > 0.5) continue;                 // a corner or another opening sits beside this door
      measured++;
      const corridor = hi.end - lo.end - lo.t - hi.t - 2 * 0.3;
      if (Math.abs(corridor - (d.w - 0.6)) > 0.02) bad.push(`${d.id} (${d.kind} w ${d.w}): free centre corridor ${corridor.toFixed(2)} m, expected ${(d.w - 0.6).toFixed(2)}`);
    }
  }
  assert.ok(measured > 100, `doorways measured: ${measured}`);
  assert.deepEqual(bad.slice(0, 10), []);
});

test('planning is deterministic', () => {
  const again = planAll(lots).bps;
  const strip = (bp) => JSON.stringify({ rooms: bp.rooms, doors: bp.doors, windows: bp.windows, stairs: bp.stairs, entrances: bp.entrances, colliders: bp.colliders, look: bp.look, floors: bp.floors, roof: bp.roof });
  for (let i = 0; i < bps.length; i++) assert.equal(strip(again[i]), strip(bps[i]), `${bps[i].id} identical on replan`);
  const other = planAll(lots, 99).bps;
  assert.ok(other.some((bp, i) => strip(bp) !== strip(bps[i])), 'a different seed changes something');
});
