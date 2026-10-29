// INTERIORS data invariants on a batch of synthetic buildings (all kinds, every shop type).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-data.test.mjs
//   A3_SABOTAGE=<overlap|outside|doorclear|count|anchors|random|nobed|nostove> makes the matching test fail (proof the test can fail).
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch, sabotage, obbOf, corners, penetration, rectOb, roomOf, catalogOf, landing, SLEEP_ARCH } from './interiors-lib.mjs';
import { genBatch } from './interiors-plans.mjs';
import { ALL_DEFS } from '../js/core/matlib.js';

const N = +(process.env.A3_N || 42);
const { ctx, bps } = await furnishedBatch({ n: N });
sabotage(bps);

const report = (problems, what) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, 12).join('\n  '));
const CIRC = new Set(['hall', 'corridor', 'stairwell', 'landing', 'entry']);

test('furnishing raises no errors and every building gets furniture', () => {
  report(ctx.errors.map((e) => `${e.room}: ${e.message}`), 'furnish errors');
  const empty = bps.filter((b) => b.furniture.length < 8).map((b) => b.id);
  report(empty, 'buildings with fewer than 8 furniture records');
});

test('furniture lies inside its room and never overlaps other furniture', () => {
  const problems = [];
  for (const bp of bps) {
    const byRoom = new Map();
    for (const f of bp.furniture) { if (!byRoom.has(f.room)) byRoom.set(f.room, []); byRoom.get(f.room).push(f); }
    for (const [rid, list] of byRoom) {
      const r = roomOf(bp, rid);
      if (!r) { problems.push(`${bp.id}: record in unknown room ${rid}`); continue; }
      const floorItems = list.filter((f) => f.kind === 'floor' && (catalogOf(f)?.size[1] ?? 1) >= 0.05);
      for (const f of floorItems) {
        for (const [x, z] of corners(obbOf(f))) {
          if (x < r.rect.x0 - 0.01 || x > r.rect.x1 + 0.01 || z < r.rect.z0 - 0.01 || z > r.rect.z1 + 0.01) { problems.push(`${bp.id} ${f.name} (${f.id}) leaves room ${rid}`); break; }
        }
      }
      for (let i = 0; i < floorItems.length; i++) for (let j = i + 1; j < floorItems.length; j++) {
        const a = floorItems[i], b = floorItems[j];
        const p = penetration(obbOf(a), obbOf(b));
        if (p > 0.01) problems.push(`${bp.id} ${rid}: ${a.name} overlaps ${b.name} by ${(p * 100).toFixed(1)} cm`);
      }
      for (const f of list.filter((x) => x.kind === 'top')) {
        const par = list.find((x) => x.id === f.parent);
        if (!par) { problems.push(`${bp.id}: top item ${f.name} has no parent`); continue; }
        const pc = catalogOf(par);
        if (Math.hypot(f.x - par.x, f.z - par.z) > Math.hypot(par.w, par.d) / 2 + 0.05) problems.push(`${bp.id}: ${f.name} off its parent ${par.name}`);
        if (Math.abs(f.y - (par.y + pc.size[1] + (pc.topAdd ?? 0))) > 0.02) problems.push(`${bp.id}: ${f.name} floats/sinks on ${par.name}`);
      }
    }
  }
  report(problems, 'placement problems');
});

test('doors and stairs keep >= 0.7 m clear in front of them', () => {
  const problems = [];
  for (const bp of bps) {
    for (const d of bp.doors) {
      for (const rid of d.rooms) {
        if (!rid) continue;
        const r = roomOf(bp, rid); if (!r) continue;
        const L = landing(bp, d, rid, 0.4);                     // a point well inside this room (walls are up to ~0.3 thick)
        assert.ok(L, `${bp.id} door ${d.id} has no inside point in ${rid}`);
        const inward = [Math.sign(L.local[0] - d.x) * Math.abs(d.nx), Math.sign(L.local[1] - d.z) * Math.abs(d.nz)];
        // rectangle from the room edge 0.7 m into the room, door-width wide
        const zone = Math.abs(d.nx) > 0.5
          ? rectOb(inward[0] > 0 ? r.rect.x0 : r.rect.x1 - 0.7, d.z - d.w / 2, inward[0] > 0 ? r.rect.x0 + 0.7 : r.rect.x1, d.z + d.w / 2)
          : rectOb(d.x - d.w / 2, inward[1] > 0 ? r.rect.z0 : r.rect.z1 - 0.7, d.x + d.w / 2, inward[1] > 0 ? r.rect.z0 + 0.7 : r.rect.z1);
        for (const f of bp.furniture) {
          if (f.room !== rid || f.kind !== 'floor') continue;
          const c = catalogOf(f);
          if (!(f.block || (c?.size[1] ?? 0) > 0.25)) continue;
          const p = penetration(obbOf(f), zone);
          if (p > 0.01) problems.push(`${bp.id} door ${d.id} (${rid}): ${f.name} intrudes ${(p * 100).toFixed(0)} cm into the 0.7 m door zone`);
        }
      }
    }
    for (const st of bp.stairs) {
      if (st.landing && st.flights?.length) {                         // A2's dogleg core: flights + half landing (the "hole") and the landing are plain rectangles
        const xs = st.hole.map((p) => p[0]), zs = st.hole.map((p) => p[1]);
        const zones = [rectOb(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)), rectOb(st.landing.x0, st.landing.z0, st.landing.x1, st.landing.z1)];
        for (const f of bp.furniture) {
          if (f.kind !== 'floor') continue;
          const fl = roomOf(bp, f.room).floor, cat = catalogOf(f);
          if (!(f.block || (cat?.size[1] ?? 0) > 0.25) || (fl !== st.floors[0] && fl !== st.floors[1])) continue;
          if (zones.some((z) => penetration(obbOf(f), z) > 0.02)) problems.push(`${bp.id} stair ${st.id}: ${f.name} (${f.room}) stands on the flight/landing`);
        }
        continue;
      }
      const dx = st.to[0] - st.from[0], dz = st.to[1] - st.from[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, ry = Math.atan2(ux, uz);
      const c = Math.cos(ry), s = Math.sin(ry), mid = (a, b, k) => (a + b) / 2 + k;
      const foot = { cx: mid(st.from[0], st.to[0], -ux * 0.35), cz: mid(st.from[1], st.to[1], -uz * 0.35), hx: st.width / 2, hz: (len + 0.7) / 2, ux: [c, -s], uz: [s, c] };
      const head = { cx: mid(st.from[0], st.to[0], ux * 0.35), cz: mid(st.from[1], st.to[1], uz * 0.35), hx: st.width / 2, hz: (len + 0.7) / 2, ux: [c, -s], uz: [s, c] };
      for (const f of bp.furniture) {
        if (f.kind !== 'floor') continue;
        const fl = roomOf(bp, f.room).floor, cat = catalogOf(f);
        if (!(f.block || (cat?.size[1] ?? 0) > 0.25)) continue;
        const z = fl === st.floors[0] ? foot : fl === st.floors[1] ? head : null;
        if (z && penetration(obbOf(f), z) > 0.02) problems.push(`${bp.id} stair ${st.id}: ${f.name} (${f.room}) stands on the flight/landing`);
      }
    }
  }
  report(problems, 'door/stair clearance violations');
});

test('the first 3 m inside every street door stay free of furniture', () => {
  const problems = [];
  for (const bp of bps) for (const e of bp.entrances ?? []) {
    const d = bp.doors.find((x) => x.id === e.doorId); if (!d) continue;
    const [ox, , oz] = bp.frame.toLocal(...e.outside), [ix, , iz] = bp.frame.toLocal(...e.inside), l = Math.hypot(ix - ox, iz - oz) || 1;
    const entry = d.rooms.filter(Boolean).map((id) => roomOf(bp, id)).find((r) => ix >= r.rect.x0 - 0.15 && ix <= r.rect.x1 + 0.15 && iz >= r.rect.z0 - 0.15 && iz <= r.rect.z1 + 0.15);
    if (!entry) { problems.push(`${bp.id} entrance ${e.id}: its inside point is in no room`); continue; }
    const ux = (ix - ox) / l, uz = (iz - oz) / l, hw = 0.5;
    const zone = Math.abs(ux) > Math.abs(uz)
      ? rectOb(Math.min(d.x, d.x + Math.sign(ux) * 3), d.z - hw, Math.max(d.x, d.x + Math.sign(ux) * 3), d.z + hw)
      : rectOb(d.x - hw, Math.min(d.z, d.z + Math.sign(uz) * 3), d.x + hw, Math.max(d.z, d.z + Math.sign(uz) * 3));
    for (const f of bp.furniture) {
      if (f.kind !== 'floor' || f.room !== entry.id) continue;
      const c = catalogOf(f);
      if (!(f.block || (c?.size[1] ?? 0) > 0.25)) continue;
      const p = penetration(obbOf(f), zone);
      if (p > 0.01) problems.push(`${bp.id} entrance ${e.id}: ${f.name} (${f.room}) stands ${(p * 100).toFixed(0)} cm inside the 3 m corridor straight in from the street door`);
    }
  }
  report(problems, 'street-door corridor violations');
});

test('every non-circulation room has >= 3 pieces of furniture or decor', () => {
  const problems = [];
  for (const bp of bps) for (const r of bp.rooms) {
    if (CIRC.has(r.type)) continue;
    const n = bp.furniture.filter((f) => f.room === r.id && f.kind !== 'ceil').length;
    if (n < 3) problems.push(`${bp.id} ${r.id} (${r.type}, ${(r.rect.x1 - r.rect.x0).toFixed(1)}x${(r.rect.z1 - r.rect.z0).toFixed(1)}): ${n} items`);
  }
  report(problems, 'under-furnished rooms');
});

test('homes are equipped: every kitchen has a stove, every bedroom but a study somewhere to sleep (synthetic and A2 plans)', async () => {
  const problems = [];
  const check = (label, list) => {
    for (const bp of list) for (const r of bp.rooms) {
      const rec = bp.interior?.rooms?.[r.id]; if (!rec || rec.skipped) continue;
      const items = bp.furniture.filter((f) => f.room === r.id);
      if (r.type === 'kitchen' && !items.some((f) => catalogOf(f)?.arch === 'stove')) problems.push(`${label} ${bp.id} ${r.id}: a kitchen without a stove (${items.length} items)`);
      if (r.type === 'bedroom' && rec.role && rec.role !== 'study' && !items.some((f) => SLEEP_ARCH.has(catalogOf(f)?.arch))) problems.push(`${label} ${bp.id} ${r.id}: a ${rec.role} bedroom with nowhere to sleep (${items.length} items)`);
    }
  };
  check('synthetic', bps);
  check('real', (await furnishedBatch({ real: true })).bps);
  report(problems, 'rooms missing their core furniture');
});

test('anchors: every seat, bed, stove and shop counter has one; anchors stand in free space', () => {
  const problems = [];
  const SEAT_KINDS = new Set(['sit', 'tv', 'work', 'read', 'bench']);
  for (const bp of bps) {
    for (const f of bp.furniture) {
      if (f.kind !== 'floor') continue;
      const c = catalogOf(f); if (!c) continue;
      const here = bp.anchors.filter((a) => a.room === f.room);
      const near = (kinds, rad) => here.some((a) => { if (!kinds.has(a.kind)) return false; const [lx, , lz] = bp.frame.toLocal(a.x, a.y, a.z); return Math.hypot(lx - f.x, lz - f.z) <= rad; });
      if (c.seat) { if (!near(SEAT_KINDS, Math.max(f.w, f.d) / 2 + 0.3)) problems.push(`${bp.id}: no sit anchor for ${f.name} in ${f.room}`); }
      if (c.arch === 'bed' || c.arch === 'cot' || c.arch === 'mattress' || c.arch === 'bunk') { if (!near(new Set(['sleep']), 0.6)) problems.push(`${bp.id}: no sleep anchor for ${f.name}`); }
      if (c.arch === 'stove') { if (!near(new Set(['cook']), 1.2)) problems.push(`${bp.id}: no cook anchor for ${f.name}`); }
    }
    // anchors well-formed, in their room, on the right floor level, and not inside furniture (except seats and beds)
    for (const a of bp.anchors) {
      const r = roomOf(bp, a.room);
      if (!r) { problems.push(`${bp.id}: anchor ${a.id} in unknown room`); continue; }
      if (!Number.isFinite(a.x + a.y + a.z + a.ry)) { problems.push(`${bp.id}: anchor ${a.id} has a NaN`); continue; }
      if (Math.abs(a.y - (bp.lot.y + r.y)) > 0.35) problems.push(`${bp.id}: anchor ${a.id} (${a.kind}) at y=${a.y.toFixed(2)} but its floor is ${(bp.lot.y + r.y).toFixed(2)}`);
      const [lx, , lz] = bp.frame.toLocal(a.x, a.y, a.z);
      if (lx < r.rect.x0 - 0.3 || lx > r.rect.x1 + 0.3 || lz < r.rect.z0 - 0.3 || lz > r.rect.z1 + 0.3) problems.push(`${bp.id}: anchor ${a.id} (${a.kind}) is outside ${a.room}`);
      if (['sit', 'tv', 'work', 'read', 'sleep', 'bench', 'pray'].includes(a.kind)) continue;
      for (const f of bp.furniture) {
        if (f.room !== a.room || f.kind !== 'floor' || !f.block) continue;
        const o = obbOf(f), dx = lx - o.cx, dz = lz - o.cz;
        const px = Math.abs(dx * o.ux[0] + dz * o.ux[1]) - o.hx, pz = Math.abs(dx * o.uz[0] + dz * o.uz[1]) - o.hz;
        if (px < 0.1 && pz < 0.1) { problems.push(`${bp.id}: ${a.kind} anchor ${a.id} stands inside ${f.name}`); break; }
      }
    }
  }
  report(problems, 'anchor problems');
});

test('rooms get a finish made of known materials', () => {
  const problems = [];
  for (const bp of bps) for (const r of bp.rooms) {
    const fin = r.finish ?? {};
    for (const k of ['floor', 'wall', 'ceiling']) {
      if (k === 'ceiling' && r.outdoor) continue;                                  // open to the sky
      if (!fin[k]) problems.push(`${bp.id} ${r.id}: no finish.${k}`);
      else if (!ALL_DEFS[fin[k]]) problems.push(`${bp.id} ${r.id}: finish.${k} = ${fin[k]} is not a defined material`);
    }
    for (const k of ['baseboard', 'trim']) if (fin[k] && !ALL_DEFS[fin[k]]) problems.push(`${bp.id} ${r.id}: finish.${k} = ${fin[k]} unknown`);
    if (fin.wainscot && !ALL_DEFS[fin.wainscot.mat]) problems.push(`${bp.id} ${r.id}: wainscot ${fin.wainscot.mat} unknown`);
  }
  report(problems, 'finish problems');
});

test('catalogue names used by furniture records all exist; lights carry the contract fields', () => {
  const problems = [];
  for (const bp of bps) {
    for (const f of bp.furniture) if (!catalogOf(f) && !f.name.startsWith('decal:')) problems.push(`${bp.id}: ${f.name} is not in the catalogue`);
    for (const l of bp.lights) for (const k of ['x', 'y', 'z', 'color', 'intensity', 'distance']) if (!Number.isFinite(l[k])) problems.push(`${bp.id}: light ${l.id} lacks ${k}`);
  }
  report(problems, 'record problems');
});

test('furnishing is deterministic for a given seed and differs between seeds', async () => {
  const sig = (set) => JSON.stringify(set.bps.map((b) => [b.furniture, b.anchors.map((a) => [a.kind, a.x, a.z, a.ry]), b.lights.map((l) => [l.x, l.y, l.z, l.intensity]), b.rooms.map((r) => r.finish)]));
  const n = Math.min(N, 24);
  const a = await furnishedBatch({ n, seed: 11 }), b = await furnishedBatch({ n, seed: 11 }), c = await furnishedBatch({ n, seed: 12 });
  if (process.env.A3_SABOTAGE === 'random') a.bps[0].furniture[0].x += Math.random();      // proves this test can fail
  assert.equal(sig(a), sig(b), 'same seed gives identical data');
  assert.notEqual(sig(a), sig(c), 'a different world seed changes the households');
});

test('the same lot seed always yields the same household regardless of other buildings', async () => {
  const only = genBatch(N, 3).slice(5, 6);
  const full = genBatch(N, 3);
  const one = await furnishedBatch({ bps: only, seed: 7 }), many = await furnishedBatch({ bps: full, seed: 7 });
  const bm = many.bps.find((b) => b.id === one.bps[0].id);
  assert.equal(JSON.stringify(one.bps[0].furniture), JSON.stringify(bm.furniture));
});
