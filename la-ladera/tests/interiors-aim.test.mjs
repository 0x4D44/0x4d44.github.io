// INTERIORS aim, over the whole real barrio: what E offers when the crosshair is ON a thing. Every building furnished, its containers (the fronts), its story objects (TV, tap, phone, computer ...)
// and its seats registered together in the building's own kernel and physics, as they are in the game, and aimed at from every free spot that sees the thing (R2b's review of round 7).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-aim.test.mjs
//   R2b-201 "Ver la tele" lost in 14 of 22 living rooms   R2b-202 "Abrir la llave" reachable at 0 of 9 sinks   R2b-203 the upper quarter of a drawer opened the drawer above
//   R2b-208 a chair tucked under a desk took the aim from its drawers; the counter's phone and computer were never offered
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch, physicsFor } from './interiors-lib.mjs';
import { Interact } from '../js/core/interact.js';
import { buildInterior } from '../js/interiors/build.js';
import { frontSpots } from '../js/interiors/containers.js';

const stub = new Map();
const matStub = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
const w = await furnishedBatch({ real: true });
w.ctx.mat = matStub;
for (const bp of w.bps) buildInterior(w.ctx, bp);
const { ctx, bps } = w, C = ctx.containers, EYE = 1.6;
const LIST = 10;
const report = (problems, what) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, LIST).join('\n  '));
const pct = (a, b) => (b ? 100 * a / b : 0);
const norm = (dx, dy, dz) => { const l = Math.hypot(dx, dy, dz); return { x: dx / l, y: dy / l, z: dz / l }; };

/** The ONE kernel of a building as the game has it: its own physics, every `int:` item of the building (story objects AND seats), and the containers' targets once `C.activate(bp.id)` registers them. */
function withKernel(bp, fn) {
  const real = ctx.interact, ph = physicsFor(bp), ictx = { physics: ph, player: null }, inter = new Interact(ictx);
  for (const x of real.items.values()) if (x.building === bp.id && x.id.startsWith('int:')) inter.register({ ...x });
  ctx.interact = inter;
  try { return fn(inter, ictx, ph); } finally { ctx.interact = real; }
}
const ask = (inter, ictx, eye, dir) => { ictx.player = { eye, _dir: dir, pitch: Math.asin(dir.y) }; return inter.update(eye, dir); };

/** The pieces' REAL heights: their colliders are never under 1.1 m (physics.js), but an eye at 1.6 m looks OVER a 0.5 m stand. */
function realTop(bp) {
  const m = new Map();
  for (const [, L] of bp.interior.layouts) for (const it of L.items) if (it.floor && it.block) m.set(it.id, { y0: bp.lot.y + (it.y ?? 0), y1: bp.lot.y + (it.y ?? 0) + (it.h ?? 1) });
  return m;
}
/** 3D line of sight from the eye E to the point Q (world): the pieces at their real height, the walls as they are, open doors not counted. `skip`: the pieces that hold the aim point. */
function sees(bp, tops, E, Q, skip) {
  for (const wl of bp.colliders.walls) {
    if (wl.door) continue;
    let y0 = wl.y0, y1 = wl.y1;
    if (wl.furniture) { if (skip.has(wl.id)) continue; const t = tops.get(wl.id); if (t) { y0 = t.y0; y1 = t.y1; } }
    const d1x = Q.x - E.x, d1z = Q.z - E.z, d2x = wl.x2 - wl.x1, d2z = wl.z2 - wl.z1, den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) continue;
    const s = ((wl.x1 - E.x) * d2z - (wl.z1 - E.z) * d2x) / den, u = ((wl.x1 - E.x) * d1z - (wl.z1 - E.z) * d1x) / den;
    if (s < 0 || s > 1 || u < 0 || u > 1) continue;
    const h = E.y + (Q.y - E.y) * s;
    if (h >= y0 - 0.01 && h <= y1 + 0.01) return false;
  }
  return true;
}

// ---------------------------------------------------------------- the fronts
// A closed front is aimed at on the lowest and the highest quarter of its face (3 columns), 5 mm in front of it (R2b's own aim points), from every spot `frontSpots` gives that sees it.
const fronts = (() => {
  const R = { slots: 0, aims: 0, leak: [], never: [], weak: [], chairPad: 0, byName: new Map() };
  for (const bp of bps) {
    if (!C.pending.has(bp.id)) continue;
    withKernel(bp, (inter, ictx, ph) => {
      C.activate(bp.id);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        const { rec, slot } = S, room = bp.rooms.find((r) => r.id === rec.room), r = slot.rect, tag = `${bp.id} ${rec.name}#${slot.i}`;
        let n = 0, own = 0;
        for (const [bx, bz] of frontSpots(S)) {
          const e = bp.frame.toWorld(bx, (room.y ?? 0) + EYE, bz), eye = { x: e[0], y: e[1], z: e[2] };
          for (const ci of [0, 1, 2]) for (const row of ['low', 'high']) {
            const px = r.x0 + (r.x1 - r.x0) * (0.25 + 0.25 * ci), py = row === 'low' ? r.y0 + (r.y1 - r.y0) * 0.125 : r.y0 + (r.y1 - r.y0) * 0.875;
            const [fx, fz] = S.loc.bl(px, slot.zf + 0.005), t = bp.frame.toWorld(fx, S.loc.y0 + py, fz), dir = norm(t[0] - eye.x, t[1] - eye.y, t[2] - eye.z);
            const hit = S.target.hit(null, S.target, eye, dir), end = hit > S.target.lead ? hit - S.target.lead : 0;
            if (!(hit >= 0) || ph.segmentBlocked(eye.x, eye.z, eye.x + dir.x * end, eye.z + dir.z * end, eye.y - 1.4, 1.2)) continue;          // not seen from here: not a fair aim
            const got = ask(inter, ictx, eye, dir);
            n++; R.aims++;
            if (got?.id === `cont:${S.id}`) { own++; continue; }
            const other = got?.id.startsWith('cont:') ? C.slots.get(got.id.slice(5)) : null;
            if (other && other.rec.id === rec.id) R.leak.push(`${tag} ${row} quarter: E offers ${other.rec.name}#${other.slot.i}, the ${(other.slot.rect.y0 + other.slot.rect.y1) / 2 > (r.y0 + r.y1) / 2 ? 'one above' : 'one below'}`);
            else if (got?.kind === 'sit') R.chairPad++;
          }
        }
        R.slots++;
        if (n && !own) R.never.push(`${tag}: E offers it from none of its ${n} aims`);
        else if (n && own / n < 0.5) R.weak.push(`${tag}: E offers it on ${own} of ${n} aims`);
        const nm = R.byName.get(rec.name) ?? { n: 0, own: 0 }; nm.n += n; nm.own += own; R.byName.set(rec.name, nm);
      }
      for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
    });
  }
  return R;
})();

test('fronts (R2b-203): aimed at on the top quarter of its face, a drawer or a door is what E offers - never the one above it on the same piece', () => {
  console.log(`# fronts: ${fronts.slots} closed slots, ${fronts.aims} aims at the lowest and the highest quarter of their faces, ${fronts.leak.length} went to a neighbour of the same piece`);
  assert.ok(fronts.slots >= 1200 && fronts.aims >= 100000, `only ${fronts.slots} slots and ${fronts.aims} aims: the barrio no longer shows the leak`);
  report(fronts.leak, 'aims on a front went to the front above or below it');
});

test('fronts (R2b-208): the chair tucked in at a desk or a sewing table does not take its drawers - every closed front is offered from some spot, and on at least half its aims', () => {
  console.log(`# fronts: ${fronts.chairPad} aims on a front went to a seat; ${fronts.never.length} fronts never offered, ${fronts.weak.length} offered on under half their aims`);
  const desks = [...fronts.byName].filter(([k]) => /^(desk_|sewing_table)/.test(k)), won = desks.reduce((a, [, v]) => a + v.own, 0), all = desks.reduce((a, [, v]) => a + v.n, 0);
  assert.ok(all >= 500, `only ${all} aims at desk drawers`);
  assert.ok(pct(won, all) >= 98, `the desks' drawers are offered on ${pct(won, all).toFixed(1)}% of their aims`);
  report(fronts.never, 'closed fronts that E offers from no spot at all');
  report(fronts.weak, 'closed fronts that E offers on under half their aims');
});

test('counters: the drawers of a counter (L08\'s cash drawer: 13 of 13 aims, R2b-007) are what E offers when aimed at, the counter\'s own story and the phone and computer on it notwithstanding', () => {
  const k = [...fronts.byName].filter(([n]) => /counter/.test(n)), won = k.reduce((a, [, v]) => a + v.own, 0), all = k.reduce((a, [, v]) => a + v.n, 0);
  console.log(`# counters: ${won} of ${all} aims on a counter's drawers`);
  assert.ok(all >= 200, `only ${all} aims at counters`);
  assert.ok(pct(won, all) >= 99.5, `${won} of ${all} aims at a counter's drawers offered them`);
});

// ---------------------------------------------------------------- the story objects
// A story object is aimed at in the middle of its own box (a sink, a basin: at its tap) from every free floor spot within 2.4 m (0.25 m grid) whose eye sees that point.
const TAPS = { sink_kitchen: (W, H, D) => [-W * 0.15, H + 0.11, -D / 2 + 0.1], sink_small: (W, H, D) => [-W * 0.15, H + 0.11, -D / 2 + 0.1], basin_pedestal: (W, H, D) => [0, H + 0.07, -D / 2 + 0.1], basin_vanity: (W, H, D) => [0, H + 0.07, -D / 2 + 0.1], lavadero: (W, H, D) => [-W * 0.2, H + 0.09, -D / 2 + 0.08] };
const roomKey = (id) => id.slice(4).split('.').slice(0, 3).join('.');               // 'int:L103.f1.r1.ia63' -> 'L103.f1.r1': building, floor, room
const NONE = new Set();
const story = (() => {
  const R = { byKind: new Map(), through: [], aims: 0, shaped: 0, entered: 0, hidden: [] };
  for (const bp of bps) {
    const reg = [...ctx.interact.items.values()].filter((x) => x.building === bp.id && x.kind === 'object' && x.id.startsWith('int:'));
    if (!reg.length) continue;
    const byId = new Map(); for (const [, L] of bp.interior.layouts) for (const it of L.items) byId.set(it.id, [L, it]);
    withKernel(bp, (inter, ictx, ph) => {
      if (C.pending.has(bp.id)) C.activate(bp.id);
      const tops = realTop(bp), fr = bp.frame;
      const shapedStory = [...inter.items.values()].filter((i) => i.building === bp.id && i.kind === 'object' && typeof i.hit === 'function');       // the TVs, taps, phones and computers of the building
      R.shaped += shapedStory.length;
      for (const x of reg) {
        const h = byId.get(x.id.slice(4)); if (!h) continue;
        const [L, it] = h, room = L.room, o = it.ob, y0 = it.ceil ? it.y - it.h : it.y;
        let q = fr.toWorld(o.cx, y0 + it.h / 2, o.cz);
        if (TAPS[it.name]) { const [lx, ly, lz] = TAPS[it.name](it.w, it.h, it.d), [px, pz] = L.rel(it, lx, lz); q = fr.toWorld(px, it.y + ly, pz); }
        const Q = { x: q[0], y: q[1], z: q[2] }, skip = new Set([it.id, it.parent?.id].filter(Boolean)), conn = L.connectivity();
        const k = R.byKind.get(it.name) ?? { objs: 0, aims: 0, won: 0, never: 0, bins: { near: [0, 0], mid: [0, 0], far: [0, 0] } }; R.byKind.set(it.name, k);
        k.objs++;
        let won = 0, fair = 0;
        for (let sx = L.r.x0 + 0.3; sx <= L.r.x1 - 0.3 + 1e-6; sx += 0.25) for (let sz = L.r.z0 + 0.3; sz <= L.r.z1 - 0.3 + 1e-6; sz += 0.25) {
          if (Math.hypot(sx - o.cx, sz - o.cz) > 2.4 || !L.standable(sx, sz, conn, 0.3)) continue;
          const e = fr.toWorld(sx, (room.y ?? 0) + EYE, sz), eye = { x: e[0], y: e[1], z: e[2] };
          if (!sees(bp, tops, eye, Q, skip)) continue;
          const dir = norm(Q.x - eye.x, Q.y - eye.y, Q.z - eye.z), hz = Math.hypot(Q.x - eye.x, Q.z - eye.z), bin = hz < 1 ? k.bins.near : hz < 1.6 ? k.bins.mid : k.bins.far;
          const got = ask(inter, ictx, eye, dir);
          fair++; k.aims++; bin[0]++; R.aims++;
          for (const s of shapedStory) {                // the same ray against every shaped story thing of the building: one that enters the box must be one the kernel's own sight-line sweep then keeps
            const t = s.hit(ictx, s, eye, dir); if (!(t >= 0)) continue;
            R.entered++;
            const lead = s.lead ?? 0.08, end = t > lead ? t - lead : 0;
            if (ph.segmentBlocked(eye.x, eye.z, eye.x + dir.x * end, eye.z + dir.z * end, eye.y - 1.4, 1.2, s.ignoreDoor ?? null, s.tall ?? 0)) R.hidden.push(`${s.id} on the ray from (${sx.toFixed(2)}, ${sz.toFixed(2)}) at ${x.id}: its box is entered at ${t.toFixed(2)} m and a wall stands before it`);
          }
          if (got?.id === x.id) { won++; k.won++; bin[1]++; }
          else if (got?.id.startsWith('int:') && roomKey(got.id) !== roomKey(x.id)) {
            const what = typeof got.prompt === 'function' ? got.prompt(ctx, got) : got.prompt;
            // another room's thing is no leak when the eye sees it (through a doorway, an archway); it is one when a wall stands between: the point of a thing is where a person stands to use it
            const hidden = got.kind === 'object' && !sees(bp, tops, eye, { x: got.x, y: got.y, z: got.z }, NONE);
            R.through.push({ sameLevel: roomKey(got.id).split('.')[1] === roomKey(x.id).split('.')[1], hidden, name: it.name, what, text: `${x.id} (${it.name}) from (${sx.toFixed(2)}, ${sz.toFixed(2)}): E offers ${got.id} (${what}), which no line from the eye reaches` });
          }
        }
        if (fair && !won) k.never++;
      }
      for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
    });
  }
  return R;
})();
const kind = (...names) => names.reduce((a, n) => { const k = story.byKind.get(n); if (!k) return a; a.objs += k.objs; a.aims += k.aims; a.won += k.won; a.never += k.never; for (const b of ['near', 'mid', 'far']) { a[b][0] += k.bins[b][0]; a[b][1] += k.bins[b][1]; } return a; }, { objs: 0, aims: 0, won: 0, never: 0, near: [0, 0], mid: [0, 0], far: [0, 0] });
const line = (name, k) => `${name}: ${k.objs} objects, ${k.aims} aims, ${pct(k.won, k.aims).toFixed(1)}% offered (under 1 m ${pct(k.near[1], k.near[0]).toFixed(1)}%, to 1.6 m ${pct(k.mid[1], k.mid[0]).toFixed(1)}%, to 2.4 m ${pct(k.far[1], k.far[0]).toFixed(1)}%), ${k.never} never`;

test('the TV (R2b-201, "Ver la tele"): aimed at on its screen from 1 m, 1.6 m and 2.2 m, E offers it - the stand\'s cabinet and its collider do not take the aim', () => {
  const tv = kind('tv_flat', 'tv_crt', 'tv_wall');
  console.log('# ' + line('tvs', tv));
  assert.ok(tv.objs >= 150 && tv.aims >= 8000, `only ${tv.objs} TVs and ${tv.aims} aims`);
  assert.ok(pct(tv.won, tv.aims) >= 97, `E offers the TV on ${pct(tv.won, tv.aims).toFixed(1)}% of ${tv.aims} aims`);
  for (const [b, name] of [['near', 'under 1 m'], ['mid', '1 to 1.6 m'], ['far', '1.6 to 2.4 m']]) assert.ok(pct(tv[b][1], tv[b][0]) >= 97, `E offers the TV on ${pct(tv[b][1], tv[b][0]).toFixed(1)}% of ${tv[b][0]} aims from ${name}`);
  assert.ok(tv.never <= 1, `${tv.never} TVs are not offered from any spot`);
});

test('the tap (R2b-202, "Abrir la llave"): aimed at on the tap of a sink, a basin or a wash trough from under 1 m up to 2.4 m, E offers it - not the cupboard under it, not a door', () => {
  const sinks = kind('sink_kitchen', 'sink_small', 'lavadero'), basins = kind('basin_pedestal', 'basin_vanity');
  console.log('# ' + line('sinks', sinks) + '\n# ' + line('basins', basins));
  assert.ok(sinks.objs >= 100 && basins.objs >= 100, `only ${sinks.objs} sinks and ${basins.objs} basins`);
  assert.ok(pct(sinks.won, sinks.aims) >= 95, `E offers the sink's tap on ${pct(sinks.won, sinks.aims).toFixed(1)}% of ${sinks.aims} aims`);
  assert.ok(pct(sinks.near[1], sinks.near[0]) >= 97, `E offers the sink's tap on ${pct(sinks.near[1], sinks.near[0]).toFixed(1)}% of ${sinks.near[0]} aims from under 1 m (the cone used to drop it)`);
  assert.ok(pct(basins.won, basins.aims) >= 95, `E offers the basin's tap on ${pct(basins.won, basins.aims).toFixed(1)}% of ${basins.aims} aims`);
  assert.ok(pct(basins.near[1], basins.near[0]) >= 97, `E offers the basin's tap on ${pct(basins.near[1], basins.near[0]).toFixed(1)}% of ${basins.near[0]} aims from under 1 m`);
  assert.ok(sinks.never <= 1 && basins.never <= 1, `${sinks.never} sinks and ${basins.never} basins are not offered from any spot`);
});

test('the phone and the computer (R2b-208): aimed at, E offers them, from some spot every one of them, and on most aims', () => {
  const pc = kind('pc_set'), phone = kind('phone_landline');
  console.log('# ' + line('computers', pc) + '\n# ' + line('phones', phone));
  assert.ok(pc.objs >= 25 && phone.objs >= 12, `only ${pc.objs} computers and ${phone.objs} phones`);
  assert.ok(pct(pc.won, pc.aims) >= 95, `E offers the computer on ${pct(pc.won, pc.aims).toFixed(1)}% of ${pc.aims} aims`);
  assert.ok(pct(phone.won, phone.aims) >= 85, `E offers the phone on ${pct(phone.won, phone.aims).toFixed(1)}% of ${phone.aims} aims (the rest is the computer on the same counter, which is in front of it, and the chair)`);
  assert.equal(pc.never, 0, `${pc.never} computers are offered from no spot`);
  assert.equal(phone.never, 0, `${phone.never} phones are offered from no spot`);
});

test('no wall: aimed at on a thing of its own room, E never offers a thing of the room behind a wall (a computer on a desk that stands against it, a TV on its stand)', () => {
  const level = story.through.filter((t) => t.sameLevel), walled = level.filter((t) => t.hidden), groups = new Map();
  for (const t of story.through) { const k = `${t.sameLevel ? (t.hidden ? 'behind a wall' : 'seen through a doorway') : 'other floor'}: ${t.name} -> ${t.what}`; groups.set(k, (groups.get(k) ?? 0) + 1); }
  console.log(`# ${story.aims} aims at story objects, ${story.through.length} answered by a thing of another room: ${walled.length} behind a wall, ${level.length - walled.length} seen from the eye, ${story.through.length - level.length} on another floor (a ceiling fan looked up at, the seat above it: the kernel's sweep is flat)\n# ` + [...groups].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${n}x ${k}`).join('\n# '));
  assert.ok(story.aims >= 100000, `only ${story.aims} aims`);
  report(walled.map((t) => t.text), 'aims answered through a wall');
});

test('hidden: the box of a thing behind a wall is a MISS, not a hit the kernel then drops - a point target beside the eye keeps its place (L103: a kid\'s drawing 0.5 m away, in line with a computer behind its partition)', () => {
  // core/interact.js update marks the crosshair as ON a shaped item before it sweeps the sight line, and while it is, a point target within 0.7 m of the eye but outside its cone (`st.hit ? st.pn : st.p`) is not offered:
  // a thing the line cannot reach must not be a hit at all (stories.js shapeOf, HIDDEN).
  console.log(`# ${story.shaped} shaped story things, ${story.entered} rays on one, ${story.hidden.length} of them behind a wall`);
  assert.ok(story.shaped >= 300 && story.entered >= 10000, `only ${story.shaped} shaped story things and ${story.entered} rays on one`);
  report(story.hidden, 'rays enter the box of a thing the sight line cannot reach');
});
