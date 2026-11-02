// INTERIORS containers under Node (no browser): the closed fronts are real triangles of the building's merged mesh, opening swaps them for a moving copy and shows
// what is inside, every slot is a target of the REAL interaction kernel, nothing exists until the player is near, everything closes when the player leaves.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-containers.test.mjs
//   A3_N=42 buildings (synthetic plans)    A3_PLANS=real  A2's real plans    A3_LIST=12    A3_TARGET_BUILDINGS=16 (buildings aimed at one slot after the other)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { furnishedBatch, physicsFor } from './interiors-lib.mjs';
import { Interact } from '../js/core/interact.js';
import { buildInterior } from '../js/interiors/build.js';
import { frontSpots, floorLead, ACTIVATE, DUR, DOOR_ANGLE, trayOf, PAD, SLAB_OUT } from '../js/interiors/containers.js';
import { makeContents } from '../js/interiors/contents.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { layoutOf, TF, EYE_AT, EYE_Y } from '../js/interiors/carcass.js';

const N = +(process.env.A3_N || 42), LIST = +(process.env.A3_LIST || 12);
const report = (problems, what, lim = LIST) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const stub = new Map();
const matStub = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };

async function world() {
  const w = await furnishedBatch({ n: N });
  w.ctx.mat = matStub;
  for (const bp of w.bps) buildInterior(w.ctx, bp);
  return w;
}
const { ctx, bps } = await world();
const C = ctx.containers;
const IDENTITY = new THREE.Quaternion();

/** The ONE kernel of a building: its own physics (walls, furniture), its own Interact; the containers register their targets into it. `stories`: the building's story objects (stories.js: "Mirar el
 *  mostrador", "Ver la tele", "Abrir la llave", the lamp's switch ...) are registered beside them, as they are in the game. */
function withKernel(bp, fn, stories = false) {
  const real = ctx.interact, ph = physicsFor(bp), ictx = { physics: ph, player: null }, inter = new Interact(ictx);
  if (stories) for (const x of real.items.values()) if (x.building === bp.id && x.kind === 'object' && x.id.startsWith('int:')) inter.register({ ...x });
  ctx.interact = inter;
  try { return fn(inter, ictx, ph); } finally { ctx.interact = real; }
}
const meshesOf = (bp) => ctx.batch.groups.get(`${bp.id}.int`).meshes;
const indexOf = (bp, key) => meshesOf(bp).find((m) => m.userData.matKey === key)?.geometry.index;
/** Every closed front's index ranges as plain data (a copy of the numbers), to compare before and after. */
const snapshotRanges = (bp) => (ctx.batch.groups.get(`${bp.id}.int`).builder.fronts ?? []).map((f) => f.ranges.map((r) => Array.from(indexOf(bp, r.key).array.slice(r.from, r.to))));

/** Does the segment a -> b (building frame, [x, y, z]) cross a piece that hangs on a wall with a body of its own - a wall cupboard, a shelf, a pot rack? The physics does not carry them (they hang
 *  above the body sweep), but a person's eye at 1.6 m looks through the very spot where one hangs, and the kernel offers the cupboard in front of the thing behind it. */
function crossesHung(bp, rec, a, b) {
  for (const r of bp.furniture) {
    if (r.kind !== 'wall' || r.name.startsWith('decal:') || r.d < 0.15 || r.id === rec.id) continue;
    const cs = Math.cos(r.ry), sn = Math.sin(r.ry);
    const loc = (p) => { const dx = p[0] - r.x, dz = p[2] - r.z; return [dx * cs - dz * sn, p[1], dx * sn + dz * cs]; };       // the piece's own frame (the inverse of `bl` below)
    const p = loc(a), q = loc(b), lo = [-r.w / 2, r.y, -r.d / 2], hi = [r.w / 2, r.y + r.h, r.d / 2];
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3 && t0 <= t1; k++) {                                                                               // slab test
      const d = q[k] - p[k];
      if (Math.abs(d) < 1e-9) { if (p[k] < lo[k] || p[k] > hi[k]) t0 = 2; continue; }
      let ta = (lo[k] - p[k]) / d, tb = (hi[k] - p[k]) / d; if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 <= t1) return true;
  }
  return false;
}

/** A free spot a person could stand on, 0.85 to 1.3 m in front of a slot, that SEES the slot (the kernel's own sight line: a body sweep to `lead` short of the box, and no wall cupboard or shelf
 *  in the way of the eye), and the aim at the middle of its front. `{ cut: true }` when there are free spots but a bed, a desk row, a counter or a cupboard hides the slot from every one of them. */
function aimAt(S, ph) {
  const { bp, rec, slot } = S, room = bp.rooms.find((r) => r.id === rec.room);
  const r = slot.rect, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  let cut = false;
  for (const [bx, bz] of frontSpots(S)) {
    const e = bp.frame.toWorld(bx, (room.y ?? 0) + 1.6, bz), [fx, fz] = S.loc.bl(cx, slot.zf + 0.02), t = bp.frame.toWorld(fx, S.loc.y0 + cy, fz);
    if (crossesHung(bp, rec, [bx, (room.y ?? 0) + 1.6, bz], [fx, S.loc.y0 + cy, fz])) { cut = true; continue; }
    const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2], l = Math.hypot(dx, dy, dz), eye = { x: e[0], y: e[1], z: e[2] }, dir = { x: dx / l, y: dy / l, z: dz / l };
    const hit = S.target.hit(null, S.target, eye, dir), end = hit > S.target.lead ? hit - S.target.lead : 0;
    if (!(hit >= 0) || ph.segmentBlocked(eye.x, eye.z, eye.x + dir.x * end, eye.z + dir.z * end, eye.y - 1.4, 1.2)) { cut = true; continue; }
    return { eye, dir };
  }
  return { cut };
}
const firstSlot = (pred) => { for (const bp of bps) { C.activate(bp.id); for (const S of C.byBuilding.get(bp.id) ?? []) if (pred(S)) return S; C.deactivate(bp.id); } return null; };

// ---------------------------------------------------------------- nothing exists until the player is near
test('lazy: after the whole barrio is built nothing is registered; the scan activates the buildings near the player and drops the ones left behind', () => {
  assert.ok(C && C.pending.size >= 10, `${C?.pending.size} buildings with openable fronts`);
  assert.equal(C.slots.size, 0, 'slots exist before anyone came near');
  assert.equal(ctx.contentPlan, undefined, 'the barrio-wide content plan was made at build time');
  assert.equal([...ctx.interact.groups.keys()].filter((k) => k.startsWith('cont:')).length, 0, 'container targets exist before anyone came near');
  [...C.pending.values()].forEach((e, i) => { e.cx = i * 60; e.cz = 0; });                    // the synthetic plans stand on one spot: spread the buildings 60 m apart (only the scan reads this)
  const e0 = [...C.pending.values()][5], here = { x: e0.cx, y: 0, z: e0.cz };
  ctx.player = { s: here };
  try {
    C.scan();
    const want = [...C.pending.values()].filter((e) => Math.hypot(here.x - e.cx, here.z - e.cz) - e.r < ACTIVATE).map((e) => e.bp.id).sort();
    const got = [...C.byBuilding.keys()].sort();
    assert.deepEqual(got, want, 'the active buildings are exactly those within ACTIVATE metres of a front');
    assert.ok(got.length >= 1 && got.length < C.pending.size, `${got.length} active of ${C.pending.size}`);
    assert.ok(C.slots.size > 0 && ctx.contentPlan, 'activation made no slots / no plan');
    const kernel = [...ctx.interact.groups.keys()].filter((k) => k.startsWith('cont:'));
    assert.equal(kernel.length, got.length, 'one static target group per active building');
    here.x += 400;                                                                           // a teleport far away
    C.scan();
    assert.equal(C.byBuilding.size, 0, 'buildings left behind stay active');
    assert.equal(C.slots.size, 0);
    assert.equal(C.targets, 0, 'targets are still counted after deactivation');
    assert.equal([...ctx.interact.groups.keys()].filter((k) => k.startsWith('cont:')).length, 0, 'targets are still registered after deactivation');
  } finally { ctx.player = undefined; for (const id of [...C.byBuilding.keys()]) C.deactivate(id); }
});

// ---------------------------------------------------------------- the fronts are real triangles
test('fronts: every closed front logs the index ranges of its own triangles, inside its leaf, none shared', () => {
  const problems = [];
  let fronts = 0, tris = 0;
  for (const bp of bps) {
    const g = ctx.batch.groups.get(`${bp.id}.int`), log = g.builder.fronts ?? [];
    const recs = new Map(bp.furniture.map((r) => [r.id, r]));
    const used = new Map();
    for (const f of log) {
      fronts++;
      const rec = recs.get(f.rec), c = CATALOG[rec?.name], lay = layoutOf(c), slot = lay?.slots[f.slot], lf = slot?.leaves[f.leaf];
      if (!lf) { problems.push(`${bp.id} ${f.rec}: front of slot ${f.slot}.${f.leaf} has no leaf in the layout`); continue; }
      const cs = Math.cos(rec.ry ?? 0), sn = Math.sin(rec.ry ?? 0), y0 = rec.kind === 'ceil' ? rec.y - c.size[1] : rec.y, lid = slot.kind === 'lid';
      const bx0 = lf.x0 - 0.04, bx1 = lf.x1 + 0.04, by0 = lf.y0 - 0.04, by1 = lf.y1 + 0.06, bz0 = (lid ? lf.z0 : slot.zf - 0.06) - 0.04, bz1 = (lid ? lf.z1 : slot.zf) + 0.06;   // the leaf's own box (handles and a lid's strap stand proud a little)
      let n = 0;
      for (const r of f.ranges) {
        const mesh = meshesOf(bp).find((m) => m.userData.matKey === r.key), idx = mesh?.geometry.index, pos = mesh?.geometry.attributes.position;
        if (!idx || r.to > idx.count || r.from < 0 || (r.to - r.from) % 3) { problems.push(`${bp.id} ${f.rec}: range ${r.key} ${r.from}..${r.to} is not triangles of its mesh`); continue; }
        for (let k = r.from; k < r.to; k++) {
          const key = r.key + ':' + k; if (used.has(key)) problems.push(`${bp.id}: index ${key} is in two fronts (${used.get(key)} and ${f.rec}.${f.slot}.${f.leaf})`); used.set(key, `${f.rec}.${f.slot}.${f.leaf}`);
          const v = idx.array[k], [lx, ly, lz] = bp.frame.toLocal(pos.getX(v), pos.getY(v), pos.getZ(v)), dx = lx - rec.x, dz = lz - rec.z;
          const ix = dx * cs - dz * sn, iy = ly - y0, iz = dx * sn + dz * cs;                // item frame (the inverse of rel())
          if (ix < bx0 || ix > bx1 || iy < by0 || iy > by1 || iz < bz0 || iz > bz1) { problems.push(`${bp.id} ${rec.name}#${f.slot}.${f.leaf}: vertex (${ix.toFixed(2)}, ${iy.toFixed(2)}, ${iz.toFixed(2)}) is outside its leaf`); break; }
        }
        n += (r.to - r.from) / 3;
      }
      if (!n) problems.push(`${bp.id} ${rec.name}#${f.slot}.${f.leaf}: an empty front`);
      tris += n;
    }
  }
  assert.ok(fronts >= 60, `${fronts} fronts in ${bps.length} buildings`);
  console.log(`# fronts: ${fronts} closed fronts, ${tris} triangles (${(tris / fronts).toFixed(0)} each)`);
  report(problems, 'front log problems');
});

// ---------------------------------------------------------------- opening and closing, with the kernel's own targets
function lifecycle(S) {
  const { bp } = S, before = snapshotRanges(bp), log = [], off = ['container:open', 'container:close'].map((t) => ctx.events.on(t, (p) => log.push(t + ':' + p.id)));
  const kernel = ctx.interact, inKernel = () => [...(kernel.groups.get(`cont:${S.id}`) ?? [])];
  const problems = [], tag = `${S.rec.name}#${S.slot.i} (${S.slot.kind})`;
  try {
    assert.equal(S.state, 'closed');
    assert.ok(C.open(S.id), `${tag}: open() refused`);
    if (S.state !== 'opening') problems.push(`${tag}: state ${S.state} right after open()`);
    for (const lf of S.leaves) for (const r of lf.ranges) { const a = indexOf(bp, r.key).array; for (let k = r.from; k < r.to; k++) if (a[k] !== 0) { problems.push(`${tag}: closed front still drawn while open (${r.key}[${k}] = ${a[k]})`); break; } }
    for (const lf of S.leaves) {
      const g = lf.ghost?.group;
      if (!g || !g.visible || !g.children.length) problems.push(`${tag}: no visible ghost`);
      else { const tri = g.children.filter((m) => m.isMesh).reduce((n, m) => n + m.geometry.index.count / 3, 0), was = lf.ranges.reduce((n, r) => n + (r.to - r.from) / 3, 0); if (tri < was) problems.push(`${tag}: the ghost has ${tri} triangles, the front ${was}`); }
    }
    C.step(DUR / 2);
    const mid = S.t;
    C.step(DUR);
    if (S.state !== 'open' || S.t !== 1) problems.push(`${tag}: ${S.state} after ${(1.5 * DUR).toFixed(2)} s (t=${S.t}, was ${mid.toFixed(2)} at half time)`);
    if (!(mid > 0.3 && mid < 0.99)) problems.push(`${tag}: no animation (t=${mid} at half time)`);
    const pose = S.leaves.map((lf) => ({ q: lf.ghost.group.quaternion.angleTo(IDENTITY), p: lf.ghost.group.position.distanceTo(lf.ghost.pivot) }));
    for (const p of pose) {
      if (S.slot.kind === 'doors' && Math.abs(p.q - DOOR_ANGLE) > 0.02) problems.push(`${tag}: a door leaf turned ${(p.q * 180 / Math.PI).toFixed(0)} degrees`);
      if (S.slot.kind === 'lid' && p.q < 1.2) problems.push(`${tag}: the lid turned only ${(p.q * 180 / Math.PI).toFixed(0)} degrees`);
      if (S.slot.kind === 'lid' && p.q > 1.5) problems.push(`${tag}: the lid turned ${(p.q * 180 / Math.PI).toFixed(0)} degrees, past the upright (a chest stands against a wall)`);
      if (S.slot.kind === 'drawer' && Math.abs(p.p - S.slot.travel) > 0.01) problems.push(`${tag}: the drawer slid ${p.p.toFixed(2)} m of ${S.slot.travel.toFixed(2)}`);
    }
    if (S.slot.kind === 'lid') {                                                                           // R4-112: every vertex of the open lid stays in front of the back of the chest (the wall behind it)
      const D = S.c.size[2], v = new THREE.Vector3();
      for (const lf of S.leaves) {
        const g = lf.ghost.group; let back = Infinity;
        for (const m of g.children) {
          if (!m.isMesh) continue;
          const pos = m.geometry.attributes.position;
          for (let k = 0; k < pos.count; k++) {
            v.fromBufferAttribute(pos, k).applyQuaternion(g.quaternion).add(g.position);                  // the ghost is built about its pivot
            const [lx, , lz] = S.bp.frame.toLocal(v.x, v.y, v.z), dx = lx - S.rec.x, dz = lz - S.rec.z;
            back = Math.min(back, dx * S.loc.sn + dz * S.loc.cs);                                            // the piece's own z: -D/2 is its back
          }
        }
        // (the closed lid itself overhangs the back by 1 cm and its straps stand 4 mm over it: 1.4 cm behind the box is its own)
        if (!(back >= -D / 2 - 0.02)) problems.push(`${tag}: the open lid reaches ${(((-D / 2) - back) * 100).toFixed(0)} cm behind the back of the chest, into the wall`);
      }
    }
    const ids = inKernel();
    if (ids.length !== S.objs.length || !S.objs.length) problems.push(`${tag}: ${ids.length} content targets for ${S.objs.length} objects`);
    if (!S.contentGroup?.visible) problems.push(`${tag}: no contents shown`);
    // close
    C.close(S.id); C.step(DUR / 2); C.step(DUR);
    if (S.state !== 'closed') problems.push(`${tag}: ${S.state} after closing`);
    if (inKernel().length) problems.push(`${tag}: ${inKernel().length} content targets left after closing`);
    if (kernel.items.has(`cont:${S.id}:0`)) problems.push(`${tag}: content target 0 is still in the kernel`);
    if (!kernel.items.has(`cont:${S.id}`) && kernel.items.size) problems.push(`${tag}: the slot's own target is gone`);
    const after = snapshotRanges(bp);
    if (JSON.stringify(after) !== JSON.stringify(before)) problems.push(`${tag}: the closed fronts are not back after closing`);
    for (const lf of S.leaves) if (lf.ghost.group.visible) problems.push(`${tag}: a ghost is still visible after closing`);
    if (!log.includes(`container:open:${S.id}`) || !log.includes(`container:close:${S.id}`)) problems.push(`${tag}: events ${log.join(',')}`);
  } finally { off.forEach((f) => f()); }
  return problems;
}

for (const [kind, label] of [['doors', 'a hinged door'], ['drawer', 'a drawer'], ['lid', 'a chest lid']]) {
  test(`open and close ${label}: the closed front goes, a moving copy and the contents appear, the contents are targets, closing undoes it all`, () => {
    const S = firstSlot((s) => s.slot.kind === kind && s.leaves.length >= (kind === 'doors' ? 2 : 1));
    assert.ok(S, `no ${kind} slot in ${bps.length} buildings`);
    try { report(lifecycle(S), `${kind} lifecycle problems`); } finally { for (const id of [...C.byBuilding.keys()]) C.deactivate(id); }
  });
}

// ---------------------------------------------------------------- what opening costs the page
const OPEN_CALLS = 5;
test(`draw calls: opening any slot adds at most ${OPEN_CALLS} meshes (the moving fronts and the contents), a door leaf is one mesh per material of its own (a chrome pull made a three-door wardrobe 8)`, () => {
  const problems = [], kinds = new Map(), meshes = (g) => g.children.filter((m) => m.isMesh);
  let slots = 0, leaves = 0, worst = { n: 0, tag: '' };
  for (const bp of bps) {
    C.activate(bp.id);
    try {
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        const tag = `${bp.id} ${S.rec.name}#${S.slot.i} (${S.slot.kind})`;
        assert.ok(C.open(S.id), `${tag}: open() refused`);
        let calls = S.contentGroup ? meshes(S.contentGroup).length : 0;
        for (const lf of S.leaves) {
          const keys = meshes(lf.ghost.group).map((m) => m.userData.matKey), own = S.slot.leaves[lf.front.leaf];
          calls += keys.length; leaves++;
          if (S.slot.kind !== 'doors') continue;
          const mine = 1 + (own.glass ? 1 : 0) + (own.deco === 'mirror' ? 1 : 0);                           // the leaf's own material, its pane of glass, the mirror on a wardrobe's first door
          if (keys.length > mine) problems.push(`${tag}: a door leaf is ${keys.length} meshes (${keys.join(' + ')}), its own materials are ${mine}`);
          if (keys.includes('metal_chrome')) problems.push(`${tag}: a door leaf has a chrome mesh (${keys.join(' + ')}): the pull must be the door's own material`);
        }
        slots++; kinds.set(S.slot.kind, Math.max(kinds.get(S.slot.kind) ?? 0, calls));
        if (calls > OPEN_CALLS) problems.push(`${tag}: opening adds ${calls} meshes (${S.leaves.map((lf) => meshes(lf.ghost.group).map((m) => m.userData.matKey).join('+')).join(' | ')} / contents ${calls - S.leaves.reduce((n, lf) => n + meshes(lf.ghost.group).length, 0)})`);
        if (calls > worst.n) worst = { n: calls, tag };
        C.close(S.id, true);
      }
    } finally { C.deactivate(bp.id); }
  }
  assert.ok(slots >= 20 && leaves >= slots, `${slots} slots, ${leaves} leaves in ${bps.length} buildings`);
  console.log(`# draw calls: ${slots} slots opened, the most one adds ${worst.n} (${worst.tag}); by kind ${[...kinds].map(([k, n]) => k + ' ' + n).join(', ')}`);
  report(problems, 'slots that cost too many draw calls when they open');
});

test('leaving the building closes everything that is open, at once', () => {
  const bp = bps.find((b) => (ctx.batch.groups.get(`${b.id}.int`).builder.fronts ?? []).length >= 6);
  C.activate(bp.id);
  const list = C.byBuilding.get(bp.id), kinds = new Set(), pick = [];
  for (const S of list) if (!kinds.has(S.slot.kind)) { kinds.add(S.slot.kind); pick.push(S); }
  for (const S of list) if (pick.length < 4 && !pick.includes(S)) pick.push(S);
  const before = snapshotRanges(bp);
  for (const S of pick) C.open(S.id);
  C.step(DUR * 2);
  assert.ok(pick.length >= 2 && C.openSlots().length === pick.length, `${C.openSlots().length} open of ${pick.length}`);
  ctx.events.emit('player:exit', { buildingId: bp.id });
  assert.equal(C.openSlots().length, 0, 'slots still open after player:exit');
  assert.equal(JSON.stringify(snapshotRanges(bp)), JSON.stringify(before), 'the closed fronts did not come back');
  assert.equal([...ctx.interact.groups.keys()].filter((k) => k.startsWith('cont:' + pick[0].id)).length, 0, 'contents targets are still registered');
  for (const S of pick) assert.equal(S.leaves.some((lf) => lf.ghost?.group.visible), false, 'a ghost is still shown');
  C.deactivate(bp.id);
});

// ---------------------------------------------------------------- the real kernel
test('targeting: from a free spot in front of a slot, aiming at it, E offers it (and a thing inside an open slot is offered instead of its frame)', () => {
  const problems = [];
  let tried = 0, blocked = 0, walled = 0, content = 0;
  const noSpot = new Map();
  for (const bp of bps.slice(0, Math.min(bps.length, +(process.env.A3_TARGET_BUILDINGS || 42)))) {
    if (!C.pending.has(bp.id)) continue;
    withKernel(bp, (inter, ictx, ph) => {
      C.activate(bp.id);
      const list = C.byBuilding.get(bp.id) ?? [];
      for (const S of list) {
        const a = aimAt(S, ph);
        if (a.cut) { walled++; continue; }
        if (!a.eye) { blocked++; noSpot.set(S.rec.name, (noSpot.get(S.rec.name) ?? 0) + 1); continue; }
        ictx.player = { eye: a.eye, _dir: a.dir, pitch: Math.asin(a.dir.y) };
        const got = inter.update(a.eye, a.dir);
        tried++;
        if (got?.id !== `cont:${S.id}`) { problems.push(`${bp.id} ${S.rec.name}#${S.slot.i}: E offers ${got ? got.id + ' ' + JSON.stringify(typeof got.prompt === 'function' ? got.prompt() : got.prompt) : 'nothing'}`); continue; }
        const want = S.slot.prompt[0], saw = typeof got.prompt === 'function' ? got.prompt() : got.prompt;
        if (saw !== want) problems.push(`${bp.id} ${S.rec.name}#${S.slot.i}: the prompt is ${JSON.stringify(saw)}, not ${JSON.stringify(want)}`);
        if (content < 40 && S.slot.kind !== 'lid') {                                      // open it, look at its first object from the same spot: the thing, not the frame
          C.open(S.id); C.step(DUR * 2);
          const o = S.objs[0], r = S.slot, dz = r.kind === 'drawer' ? r.travel : 0;
          const [fx, fz] = S.loc.bl(o.x, o.z + dz), p = bp.frame.toWorld(fx, S.loc.y0 + o.y + o.h / 2, fz);
          const eye = a.eye, dx = p[0] - eye.x, dy = p[1] - eye.y, dzz = p[2] - eye.z, l = Math.hypot(dx, dy, dzz), dir = { x: dx / l, y: dy / l, z: dzz / l };
          ictx.player = { eye, _dir: dir, pitch: Math.asin(dir.y) };
          const g2 = inter.update(eye, dir);
          content++;                                                                       // some thing of THIS slot (a neighbour on the shelf may stand in front of the first one), never its frame, never its neighbour
          if (!g2?.id.startsWith(`cont:${S.id}:`)) problems.push(`${bp.id} ${S.rec.name}#${S.slot.i}: with it open, aimed at its first object, E offers ${g2 ? g2.id : 'nothing'}`);
          C.close(S.id, true);
        }
      }
      for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
    });
  }
  console.log(`# targeting: ${tried} slots aimed at from a free spot that sees them, ${walled} hidden from every free spot (bed, desks, counter), ${blocked} with no free spot in front (${[...noSpot].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => k + ' x' + n).join(', ')}), ${content} open ones checked`);
  assert.ok(tried >= 40, `only ${tried} slots could be aimed at`);
  assert.ok(walled <= 0.1 * (tried + walled), `${walled} of ${tried + walled} slots cannot be seen from any free spot in front`);
  report(problems, `of ${tried} slots are not what E offers when aimed at from a spot that sees them`);
});

test('targeting beside the stories (R2b-007): with the building\'s story objects in the kernel too, a front aimed at from a spot that sees it is what E offers, never its own counter\'s, TV\'s or tap\'s line', () => {
  const problems = [], lost = new Map();
  let tried = 0, contested = 0;
  for (const bp of bps.slice(0, Math.min(bps.length, +(process.env.A3_TARGET_BUILDINGS || 42)))) {
    if (!C.pending.has(bp.id)) continue;
    withKernel(bp, (inter, ictx, ph) => {
      const alone = new Interact(ictx);                                                         // the same story objects WITHOUT the containers: would a story object take this aim?
      for (const x of inter.items.values()) alone.register({ ...x });
      C.activate(bp.id);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        const a = aimAt(S, ph); if (!a.eye) continue;
        ictx.player = { eye: a.eye, _dir: a.dir, pitch: Math.asin(a.dir.y) };
        tried++;
        if (alone.update(a.eye, a.dir)) contested++;
        const got = inter.update(a.eye, a.dir);
        if (got?.id === `cont:${S.id}`) continue;
        const what = got ? `${got.id} ${JSON.stringify(typeof got.prompt === 'function' ? got.prompt() : got.prompt)}` : 'nothing';
        problems.push(`${bp.id} ${S.rec.name}#${S.slot.i}: E offers ${what}`);
        lost.set(S.rec.name, (lost.get(S.rec.name) ?? 0) + 1);
      }
      for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
    }, true);
  }
  console.log(`# targeting beside the stories: ${tried} fronts aimed at, ${contested} of them in the line of a story object of their building, ${problems.length} lost${problems.length ? ' (' + [...lost].map(([k, n]) => k + ' x' + n).join(', ') + ')' : ''}`);
  assert.ok(tried >= 40, `only ${tried} slots could be aimed at`);
  assert.ok(contested >= 8, `only ${contested} of ${tried} aims were in the line of a story object: this world no longer shows that the front wins`);
  report(problems, `of ${tried} fronts are not what E offers when aimed at, with the stories in the kernel`);
});

const DESK = /^(desk_|sewing_table)/;
test('desks: the chair at a desk does not take its drawers (every desk with a place to stand offers its front, and every thing in an open drawer, to the kernel from some spot)', () => {
  const problems = [];
  let slots = 0, chaired = 0, things = 0;
  for (const bp of bps) {
    if (!C.pending.has(bp.id) || !bp.furniture.some((r) => DESK.test(r.name))) continue;
    withKernel(bp, (inter, ictx, ph) => {
      C.activate(bp.id);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        if (!DESK.test(S.rec.name)) continue;
        slots++;
        const L = bp.interior.layouts.get(S.rec.room), r = S.rec, cs = Math.cos(r.ry ?? 0), sn = Math.sin(r.ry ?? 0), tag = `${bp.id} ${r.name}#${S.slot.i}`;
        if (L.items.some((i) => i.floor && /chair|stool/.test(i.name) && (() => { const dx = i.x - r.x, dz = i.z - r.z, lz = dx * sn + dz * cs; return lz > r.d / 2 && lz < r.d / 2 + 0.9 && Math.abs(dx * cs - dz * sn) < r.w / 2 + 0.3; })())) chaired++;
        if (!aimAt(S, ph).eye) { problems.push(`${tag}: no spot sees the closed drawer`); continue; }
        const room = bp.rooms.find((q) => q.id === r.room), dz = S.slot.travel ?? 0, spots = frontSpots(S);
        C.open(S.id); C.step(DUR * 2);
        S.objs.forEach((o, k) => {
          things++;
          const [fx, fz] = S.loc.bl(o.x, o.z + dz), p = bp.frame.toWorld(fx, S.loc.y0 + o.y + o.h / 2, fz);
          const seen = spots.some(([bx, bz]) => {
            const e = bp.frame.toWorld(bx, (room.y ?? 0) + 1.6, bz), eye = { x: e[0], y: e[1], z: e[2] }, dx = p[0] - eye.x, dy = p[1] - eye.y, dzz = p[2] - eye.z, l = Math.hypot(dx, dy, dzz), dir = { x: dx / l, y: dy / l, z: dzz / l };
            ictx.player = { eye, _dir: dir, pitch: Math.asin(dir.y) };
            return !!inter.update(eye, dir)?.id.startsWith(`cont:${S.id}:`);
          });
          if (!seen) problems.push(`${tag}: thing ${k} (${o.name ?? o.id}) is offered from none of the ${spots.length} spots in front`);
        });
        C.close(S.id, true);
      }
      for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
    });
  }
  console.log(`# desks: ${slots} drawers (${chaired} with a chair at the desk), ${things} things in them, all offered`);
  assert.ok(slots >= 3, `only ${slots} desk drawers in the world`);
  report(problems, 'desk drawers that cannot be used');
});

// the kernel's sight line to a thing inside a piece stops `lead` short of it ALONG THE RAY; a ray that looks down covers only cos(pitch) of that on the floor, so a paper on the floor of a low
// cupboard, seen from the spot nearest to it, was swept to a point inside the cupboard's own outline and offered from no spot at all (R4: the papers of the tv stand of L03)
test('floorLead: the lead is a length on the floor: the carcass depth for a level look, longer as the look goes down, and never infinite', () => {
  const dir = (pitch, yaw = 0) => { const c = Math.cos(pitch * Math.PI / 180), s = Math.sin(pitch * Math.PI / 180); return { x: Math.sin(yaw) * c, y: -s, z: Math.cos(yaw) * c }; };
  assert.ok(Math.abs(floorLead(0.4, dir(0)) - 0.4) < 1e-9, 'a level look keeps the depth');
  assert.ok(Math.abs(floorLead(0.4, dir(60)) - 0.8) < 1e-9, `a look 60 degrees down needs twice the depth: ${floorLead(0.4, dir(60))}`);
  assert.ok(Math.abs(floorLead(0.4, dir(60, 1)) - 0.8) < 1e-9, 'whichever way the person faces');
  assert.ok(floorLead(0.4, dir(30)) > floorLead(0.4, dir(0)) && floorLead(0.4, dir(60)) > floorLead(0.4, dir(30)), 'the steeper, the longer');
  assert.ok(Number.isFinite(floorLead(0.4, dir(90))) && floorLead(0.4, dir(90)) <= 0.4 / 0.3, `straight down is a finite lead: ${floorLead(0.4, dir(90))}`);
  assert.ok(floorLead(0.4, dir(-30)) > 0.4 && floorLead(0.4, dir(-30)) === floorLead(0.4, dir(30)), 'a look up (a high cupboard) is foreshortened the same way');
});

const LOW_OPEN = /^(tv_stand|chest_trunk)$/;                                       // one cavity with nothing over its opening: the aim at its floor crosses no other front (a nightstand's drawer, or the glass cabinet over a display cabinet's doors, is crossed by the steepest look at the compartment under it: that is the piece, not the lead)
test('contents: everything in an open tv stand or trunk is offered from the spot nearest to it, however steep the look down', () => {
  const problems = [];
  let slots = 0, things = 0, steep = 0;
  for (const bp of bps) {
    if (!C.pending.has(bp.id) || !bp.furniture.some((r) => LOW_OPEN.test(r.name))) continue;
    withKernel(bp, (inter, ictx) => {
      C.activate(bp.id);
      for (const S of C.byBuilding.get(bp.id) ?? []) {
        if (!LOW_OPEN.test(S.rec.name)) continue;
        const spots = frontSpots(S); if (!spots.length) continue;
        const room = bp.rooms.find((q) => q.id === S.rec.room), r = S.slot.rect, [px, pz] = S.loc.bl((r.x0 + r.x1) / 2, S.slot.zf), dist = ([x, z]) => Math.hypot(x - px, z - pz);
        const [bx, bz] = spots.reduce((a, b) => (dist(a) <= dist(b) ? a : b)), dz = S.slot.kind === 'drawer' ? S.slot.travel : 0, tag = `${bp.id} ${S.rec.name}#${S.slot.i}`;
        C.open(S.id); C.step(DUR * 2);
        slots++;
        S.objs.forEach((o, k) => {
          const e = bp.frame.toWorld(bx, (room.y ?? 0) + 1.6, bz), [fx, fz] = S.loc.bl(o.x, o.z + dz), p = bp.frame.toWorld(fx, S.loc.y0 + o.y + o.h / 2, fz);
          const eye = { x: e[0], y: e[1], z: e[2] }, dx = p[0] - eye.x, dy = p[1] - eye.y, dzz = p[2] - eye.z, l = Math.hypot(dx, dy, dzz), dir = { x: dx / l, y: dy / l, z: dzz / l };
          ictx.player = { eye, _dir: dir, pitch: Math.asin(dir.y) };
          things++; if (dir.y < -Math.sin(55 * Math.PI / 180)) steep++;
          if (!inter.update(eye, dir)?.id.startsWith(`cont:${S.id}:`)) problems.push(`${tag}: thing ${k} (${o.name ?? o.id}, ${o.y.toFixed(2)} m up) is not offered from the nearest spot ${dist([bx, bz]).toFixed(2)} m from its front`);
        });
        C.close(S.id, true);
      }
      for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
    });
  }
  console.log(`# low cupboards: ${slots} open, ${things} things in them (${steep} seen from a look steeper than 55 degrees), all offered from the nearest spot`);
  assert.ok(slots >= 10 && things >= 40 && steep >= 20, `only ${slots} cupboards, ${things} things, ${steep} steep looks to check`);
  report(problems, 'things in a low cupboard that the nearest spot does not offer');
});

// ---------------------------------------------------------------- what is inside
test('contents: every slot holds something, inside its cavity, nothing overlapping, the same after a reload (deterministic)', async () => {
  const problems = [];
  let slots = 0, objects = 0, under = 0;
  for (const bp of bps) C.activate(bp.id);
  const digest = (cx) => [...cx.containers.slots.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((S) => S.id + JSON.stringify(makeContents(cx, S))).join('\n');
  const first = digest(ctx);
  for (const S of C.slots.values()) {
    const objs = makeContents(ctx, S), cav = S.slot.cav, [cmin] = S.slot.cap ?? [3, 5], tag = `${S.bid} ${S.rec.name}#${S.slot.i}`;
    slots++; objects += objs.length;
    if (!objs.length) problems.push(`${tag}: empty`);
    if (objs.length < cmin) under++;
    objs.forEach((o, k) => {
      const e = 0.004;
      if (o.x - o.w / 2 < cav.x0 - e || o.x + o.w / 2 > cav.x1 + e || o.y < cav.y0 - e || o.y + o.h > cav.y1 + e || o.z - o.d / 2 < cav.z0 - e || o.z + o.d / 2 > cav.z1 + e) problems.push(`${tag}: object ${k} (${o.item ?? o.sh}) ${o.x.toFixed(2)},${o.y.toFixed(2)},${o.z.toFixed(2)} ${o.w.toFixed(2)}x${o.h.toFixed(2)}x${o.d.toFixed(2)} sticks out of the cavity`);
      for (let j = 0; j < k; j++) {
        const p = objs[j], ox = Math.min(o.x + o.w / 2, p.x + p.w / 2) - Math.max(o.x - o.w / 2, p.x - p.w / 2), oy = Math.min(o.y + o.h, p.y + p.h) - Math.max(o.y, p.y), oz = Math.min(o.z + o.d / 2, p.z + p.d / 2) - Math.max(o.z - o.d / 2, p.z - p.d / 2);
        if (ox > 0.01 && oy > 0.01 && oz > 0.01) problems.push(`${tag}: objects ${j} and ${k} overlap by ${(ox * 100).toFixed(0)} x ${(oy * 100).toFixed(0)} x ${(oz * 100).toFixed(0)} cm`);
      }
    });
  }
  assert.ok(slots >= 100, `${slots} slots`);
  assert.ok(under <= 0.2 * slots, `${under} of ${slots} slots hold fewer things than their minimum`);
  console.log(`# contents: ${slots} slots, ${objects} objects (${(objects / slots).toFixed(1)} each)`);
  report(problems, 'content problems');
  // a reload: a second world from the same plans shows the same drawers
  const again = await world(), C2 = again.ctx.containers;
  for (const bp of again.bps) C2.activate(bp.id);
  assert.equal(digest(again.ctx), first, 'the second build shows different drawers');
  for (const id of [...C.byBuilding.keys()]) C.deactivate(id);
});

// ---------------------------------------------------------------- an open drawer is not empty (R4-101)
/** Does the segment a -> b cross the box [lo, hi]? (slab test, all in the piece's frame) */
function segBox(a, b, lo, hi) {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) { if (a[k] < lo[k] || a[k] > hi[k]) return false; continue; }
    let u = (lo[k] - a[k]) / d, v = (hi[k] - a[k]) / d; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false;
  }
  return true;
}
test('drawers: every thing rests on the TOP of the tray floor, inside the tray, and shows over the drawer front from where a person stands', () => {
  const problems = [], seen = new Map();
  let objs = 0, shown = 0;
  for (const bp of bps) C.activate(bp.id);
  try {
    for (const S of C.slots.values()) {
      if (S.slot.kind !== 'drawer') continue;
      const tr = trayOf(S.slot.cav), { travel, zf } = S.slot, lf = S.slot.leaves[0], tag = `${S.bid} ${S.rec.name}#${S.slot.i}`;
      const eye = [(lf.x0 + lf.x1) / 2, EYE_Y, zf + EYE_AT];                                              // a person in front of the drawer, in the piece's frame
      const front = [[lf.x0, lf.y0, zf - TF + travel], [lf.x1, lf.y1, zf + travel]];                       // the drawer's own front, out at its open pose
      for (const o of makeContents(ctx, S)) {
        const what = `${tag}: ${o.item ?? o.sh ?? o.find ?? 'a paper'}`;
        objs++;
        if (o.y < tr.floorTop - 1e-6) problems.push(`${what} sinks ${((tr.floorTop - o.y) * 100).toFixed(1)} cm into the floor of the tray`);
        if (o.y + o.h > tr.rim + 1e-6) problems.push(`${what} stands ${((o.y + o.h - tr.rim) * 100).toFixed(1)} cm over the rim`);
        if (o.x - o.w / 2 < tr.in.x0 - 1e-3 || o.x + o.w / 2 > tr.in.x1 + 1e-3 || o.z + o.d / 2 > tr.in.z1 + 1e-3 || o.z - o.d / 2 < tr.in.z0 - 1e-3) problems.push(`${what} reaches through a wall of the tray`);
        const top = [o.x, o.y + o.h, o.z + travel];                                                        // the middle of its top face, open
        const vis = top[2] > zf - TF + 0.01 && !segBox(eye, top, ...front);                                // out from under the carcass, and not behind the drawer's front
        const e = seen.get(S.rec.name) ?? seen.set(S.rec.name, { n: 0, ok: 0 }).get(S.rec.name); e.n++; if (vis) { e.ok++; shown++; }
        if (!vis && (o.paper || o.find)) problems.push(`${what} (a paper or a find) is hidden from where a person stands`);
      }
    }
    const list = [...seen].map(([k, e]) => `${k} ${e.ok}/${e.n}`).join(', ');
    console.log(`# drawers: ${shown} of ${objs} things show from a person's eye (${list})`);
    assert.ok(objs >= 300, `only ${objs} things in drawers`);
    assert.ok(shown >= 0.9 * objs, `only ${shown} of ${objs} things in drawers show over the front (${list})`);
    for (const [k, e] of seen) if (e.n >= 8) assert.ok(e.ok >= 0.75 * e.n, `${k}: only ${e.ok} of ${e.n} things show over the drawer front`);
    report(problems, 'drawer content problems');
  } finally { for (const id of [...C.byBuilding.keys()]) C.deactivate(id); }
});

// ---------------------------------------------------------------- a closed cabinet shows what is in it from where a person stands (finds visible from standing)
test('cabinets: every thing in a closed cabinet (and every paper and find) shows under its roof from where a person stands, not deep inside where only the dark is seen', () => {
  const problems = [];
  let objs = 0, roofed = 0, finds = 0;
  const kinds = new Map();
  for (const bp of bps) C.activate(bp.id);
  try {
    for (const S of C.slots.values()) {
      if (S.slot.kind === 'drawer' || S.slot.kind === 'lid') continue;
      const room = S.bp.rooms.find((r) => r.id === S.rec.room), elev = Math.max(0, S.loc.y0 - (room?.y ?? 0)), tag = `${S.bid} ${S.rec.name}#${S.slot.i}`;
      const eyeY = EYE_Y - elev, ze = S.slot.zf + EYE_AT;                                                  // a person in front of the cabinet, in the piece's frame (a wall cupboard hangs higher: the eye is lower over it)
      for (const o of makeContents(ctx, S)) {
        objs++;
        const sf = S.slot.surf.find((s) => Math.abs(s.y - o.y) < 1e-6 && o.x >= s.x0 - 1e-6 && o.x <= s.x1 + 1e-6);
        if (!sf || sf.roof === undefined || eyeY - sf.roof < 0.05) continue;                                // a garment on its rail, glass shelves, or the eye is not above the roof (it looks straight in)
        roofed++; if (o.paper || o.find) finds++;
        const yt = o.y + o.h / 2, atRoof = yt + (eyeY - yt) * (sf.z1 - o.z) / (ze - o.z);                  // the height of the sight line to the middle of the thing where it passes the front of the roof
        const e = kinds.get(S.rec.name) ?? kinds.set(S.rec.name, { n: 0, hid: 0 }).get(S.rec.name); e.n++;
        if (atRoof > sf.roof + 1e-6) { e.hid++; problems.push(`${tag}: ${o.find ? 'the find ' + o.find : o.paper ? 'a paper' : o.item ?? o.sh} lies ${((sf.z1 - o.z) * 100).toFixed(0)} cm in, hidden under the roof (the sight line passes the front at ${(atRoof * 100).toFixed(0)} cm, the roof is at ${(sf.roof * 100).toFixed(0)})`); }
      }
    }
    console.log(`# cabinets: ${roofed} of ${objs} things lie in closed cabinets with a roof over them (${finds} papers and finds); ${[...kinds].filter(([, e]) => e.n >= 20).map(([k, e]) => `${k} ${e.n - e.hid}/${e.n}`).join(', ')}`);
    assert.ok(roofed >= 600, `only ${roofed} things in roofed cabinets`);
    assert.ok(finds >= 20, `only ${finds} papers and finds in roofed cabinets`);
    report(problems, 'things hidden under the roof of their cabinet');
  } finally { for (const id of [...C.byBuilding.keys()]) C.deactivate(id); }
});

// ---------------------------------------------------------------- the freezer door is not between a person and the shelf under it
test('fridges: from the nearest place a person stands (0.55 m, eyes at 1.6 m) the line to every thing in the main compartment passes under the freezer door\'s target (L02 had a bottle behind it)', () => {
  const problems = [];
  let objs = 0, fridges = 0, top = 0;
  for (const bp of bps) C.activate(bp.id);
  try {
    for (const S of C.slots.values()) {
      if (!/^fridge/.test(S.rec.name) || S.slot.i !== 0) continue;
      const up = [...C.slots.values()].find((T) => T.rec.id === S.rec.id && T.slot.i === 1);
      if (!up) continue;                                                                                    // (the one-door fridges, the drinks fridge and the cold cabinet have no freezer door)
      fridges++;
      const room = S.bp.rooms.find((r) => r.id === S.rec.room), eyeY = EYE_Y - Math.max(0, S.loc.y0 - (room?.y ?? 0)), ze = S.slot.zf + 0.55, edge = up.slot.rect.y0 - PAD;       // the lowest height of the freezer door's target
      for (const o of makeContents(ctx, S)) {
        objs++;
        const yt = o.y + o.h / 2, atSlab = yt + (eyeY - yt) * (S.slot.zf + SLAB_OUT - o.z) / (ze - o.z);      // the height of the line to the middle of the thing where the freezer door's target begins, in front of the fridge
        if (o.y + o.h > edge - 0.2) top++;
        if (atSlab > edge + 1e-6) problems.push(`${S.bid} ${S.rec.name}: ${o.paper ? 'a paper' : o.item ?? o.sh} (${(o.y * 100).toFixed(0)}..${((o.y + o.h) * 100).toFixed(0)} cm, ${((S.slot.zf - o.z) * 100).toFixed(0)} cm in) is seen through the freezer door's target (the line is at ${(atSlab * 100).toFixed(0)} cm, the target starts at ${(edge * 100).toFixed(0)})`);
      }
    }
  } finally { for (const id of [...C.byBuilding.keys()]) C.deactivate(id); }
  console.log(`# fridges: ${fridges} with a freezer door, ${objs} things in the main compartment, ${top} of them within 20 cm of its roof`);
  assert.ok(fridges >= 5 && top >= 5, `${fridges} fridges, ${top} things near the roof: nothing to look at`);
  report(problems, 'things behind the freezer door');
});

// ---------------------------------------------------------------- a chest holds its things on a tray near the rim (R4-112)
test('chests: what lies in a chest lies on a tray within 20 cm of the rim and shows over the front of the box from where a person stands (every paper and find)', () => {
  const problems = [];
  let objs = 0, shown = 0, chests = 0;
  for (const bp of bps) C.activate(bp.id);
  try {
    for (const S of C.slots.values()) {
      if (S.slot.kind !== 'lid') continue;
      chests++;
      const { cav, zf } = S.slot, tag = `${S.bid} ${S.rec.name}`, ze = zf + EYE_AT;
      for (const o of makeContents(ctx, S)) {
        objs++;
        const what = `${tag}: ${o.find ? 'the find ' + o.find : o.paper ? 'a paper' : o.item ?? o.sh}`, yt = o.y + o.h / 2;
        const atRim = yt + (EYE_Y - yt) * (cav.z1 - o.z) / (ze - o.z);                                      // the height of the sight line to the middle of the thing where it passes the front wall of the box
        const vis = atRim >= cav.y1 - 1e-6; if (vis) shown++;
        if (cav.y1 - (o.y + o.h) > 0.2) problems.push(`${what} lies ${((cav.y1 - (o.y + o.h)) * 100).toFixed(0)} cm under the rim, on the floor of a deep box`);
        if (!vis && (o.paper || o.find)) problems.push(`${what} (a paper or a find) is hidden behind the front of the box (the sight line passes it at ${(atRim * 100).toFixed(0)} cm, the rim is at ${(cav.y1 * 100).toFixed(0)})`);
      }
    }
    console.log(`# chests: ${chests} chests, ${shown} of ${objs} things show over the front from a person's eye`);
    assert.ok(chests >= 1 && objs >= 3, `${chests} chests, ${objs} things`);
    assert.ok(shown >= 0.9 * objs, `only ${shown} of ${objs} things in chests show over the front`);
    report(problems, 'chest content problems');
  } finally { for (const id of [...C.byBuilding.keys()]) C.deactivate(id); }
});

test('drawers: the tray that is drawn has its floor where the things lie (one drawer of each kind, the real ghost geometry)', () => {
  const problems = [], done = new Set();
  for (const bp of bps) C.activate(bp.id);
  try {
    for (const S of [...C.slots.values()]) {
      if (S.slot.kind !== 'drawer' || done.has(S.rec.name)) continue;
      done.add(S.rec.name);
      const tr = trayOf(S.slot.cav), lf = S.slot.leaves[0], mid = (lf.y0 + lf.y1) / 2;                      // the ghost is built about its pivot: the middle of the front
      assert.ok(C.open(S.id), `${S.rec.name}: open() refused`); C.step(DUR * 2);
      const ys = new Set();
      for (const m of S.leaves[0].ghost.group.children) { if (!m.isMesh) continue; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) ys.add(+p.getY(i).toFixed(4)); }       // (the contents ride along as a group of their own)
      for (const [what, y] of [['the floor of the tray', tr.floorTop], ['the rim', tr.rim], ['the underside', tr.y0]]) {
        const want = +(y - mid).toFixed(4);
        if (![...ys].some((v) => Math.abs(v - want) < 2e-4)) problems.push(`${S.rec.name}: no vertex of the drawn drawer at ${what} (${want} about its pivot)`);
      }
      C.close(S.id); C.step(DUR * 2);
    }
  } finally { for (const id of [...C.byBuilding.keys()]) C.deactivate(id); }
  assert.ok(done.size >= 5, `only ${done.size} kinds of drawer`);
  report(problems, 'drawn trays that differ from their description');
});

// ---------------------------------------------------------------- the whole barrio: what opens
test('coverage: at least 90% of the storage furniture of the built buildings opens', () => {
  const STORAGE = new Set(['cabinet', 'dresser', 'wallunit', 'vitrine', 'chest', 'sinkunit', 'upper', 'desk']), SKIP = new Set(['speaker']);
  const by = new Map();
  let all = 0, open = 0;
  for (const bp of bps) for (const r of bp.furniture) {
    const c = CATALOG[r.name]; if (!c || !STORAGE.has(c.arch) || SKIP.has(r.name)) continue;
    all++; if (layoutOf(c)) open++; else by.set(r.name, (by.get(r.name) ?? 0) + 1);
  }
  console.log(`# coverage: ${open} of ${all} storage pieces open (${(100 * open / all).toFixed(0)}%); closed kinds: ${[...by].map(([k, n]) => k + ' x' + n).join(', ') || 'none'}`);
  assert.ok(all >= 100, `${all} storage pieces`);
  assert.ok(open / all >= 0.9, `${(100 * open / all).toFixed(0)}% open; the rest: ${[...by].map(([k, n]) => k + ' x' + n).join(', ')}`);
});
