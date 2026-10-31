// A2: the shop shutters (shutters.js; review R1-003 "the same flat grey shutter with one dot", R4-010 "from inside it is one flat grey panel").
// Six looks that neighbours do not share, real relief on both faces of a roll-up curtain, a way of opening for each, a shell that stays closed behind every one,
// and the housing that goes with it.   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-shopfront.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeCtx } from './arch-lib.mjs';
import { planBuilding, buildBuilding } from '../js/arch/index.js';
import { SHUTTER_STYLES, assignShopfronts, shopfrontOf, isShopLot } from '../js/arch/shutters.js';

const styles = Object.keys(SHUTTER_STYLES);
const mkLot = (id, kind, x, w, extra = {}) => ({
  id, name: id, kind, x, y: 0, z: 0, rotY: 0, w, d: 11, floors: 2, fh: 2.8, front: 'S0', entrance: { side: 'front', u: 0 }, party: { left: true, right: true, back: false },
  style: {}, seed: 7000 + x, roofAccess: false, shop: kind === 'house' ? undefined : 'tienda', ...extra,
});

/** A street of lots shoulder to shoulder (0.4 m apart): shops of every kind with a few houses between them. */
function street() {
  const kinds = ['shophouse', 'shophouse', 'house', 'cornerstore', 'shophouse', 'workshop', 'shophouse', 'house', 'kiosk', 'shophouse', 'cornerstore', 'shophouse', 'shophouse', 'workshop', 'shophouse', 'shophouse'];
  let x = 0;
  return kinds.map((k, i) => { const w = k === 'kiosk' ? 3.5 : 5 + (i % 4); x += w / 2; const l = mkLot('S' + String(i).padStart(2, '0'), k, x, w); x += w / 2 + 0.4; return l; });
}
/** Two shops are neighbours when the clear space between their footprints is under 6 m: the same street, or across a lane. */
const gapOf = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - (a.w + b.w) / 2;
const sameLook = (a, b) => ({ key: a.key === b.key, style: a.style === b.style });

test('neighbouring shopfronts never share a look or a style; every plan with a roll-up door gets one; the pick is stable', () => {
  const lots = street(), looks = assignShopfronts(lots), shops = lots.filter(isShopLot);
  assert.equal(shops.length, lots.filter((l) => l.kind !== 'house').length);
  assert.equal(looks.size, shops.length, 'a look for every shop lot and for nothing else');
  const clash = [];
  for (let i = 0; i < shops.length; i++) for (let j = i + 1; j < shops.length; j++) {
    if (gapOf(shops[i], shops[j]) >= 6) continue;
    const s = sameLook(looks.get(shops[i].id), looks.get(shops[j].id));
    if (s.key || s.style) clash.push(`${shops[i].id}/${shops[j].id} ${looks.get(shops[i].id).key} ${looks.get(shops[j].id).key}`);
  }
  assert.deepEqual(clash, []);
  assert.ok(new Set([...looks.values()].map((l) => l.style)).size >= 5, 'five or more of the six styles on one street');
  // stable: the same plan in any order gives the same looks
  const again = assignShopfronts([...lots].reverse());
  for (const [id, l] of looks) assert.deepEqual(again.get(id), l, `${id} keeps its look`);
  for (const l of looks.values()) { assert.ok(SHUTTER_STYLES[l.style], l.style); assert.ok(l.tone >= 0 && l.tone < SHUTTER_STYLES[l.style].tones); assert.ok(l.gap >= 0.34 && l.gap <= 0.48); }
});

test('a lot can pin its own shutter in the plan and the rest of the street steers around it', () => {
  const lots = street();
  lots[0].style = { shutter: 'fold', shutterTone: 2 };
  lots[2] = { ...lots[2], kind: 'house', style: { shutter: 'wood', shutterTone: 4 } };            // a house that pins a look still counts as a shop for the colouring
  const looks = assignShopfronts(lots);
  assert.equal(looks.get('S00').key, 'fold:2');
  assert.equal(looks.get('S02').key, 'wood:4');
  for (const l of lots) {
    if (l.id === 'S00' || !looks.has(l.id) || gapOf(lots[0], l) >= 6) continue;
    assert.notEqual(looks.get(l.id).key, 'fold:2');
    assert.notEqual(looks.get(l.id).style, 'fold', `${l.id} is a neighbour of the pinned fold gate`);
  }
});

// ---- the built doors: every look in every tone, one shophouse each -----------------------------------------------------------------------------
const combos = styles.flatMap((s) => [...Array(SHUTTER_STYLES[s].tones).keys()].map((t) => [s, t]));
const lots = combos.map(([s, t], i) => mkLot('P' + String(i).padStart(2, '0'), 'shophouse', 0, 7, { x: (i % 8) * 30 - 105, z: Math.floor(i / 8) * 30 - 60, style: { shutter: s, shutterTone: t }, seed: 500 + i }));
const ctx = makeCtx(lots, 11, 0.4, 0);
const bps = lots.map((l) => planBuilding(ctx, l));
for (const bp of bps) ctx.physics.add(bp.colliders);
for (const bp of bps) buildBuilding(ctx, bp);
ctx.scene.updateMatrixWorld(true);
const sys = ctx.systems.find((s) => s.name === 'arch-doors');
const rc = new THREE.Raycaster();
const meshesOf = (objs) => { const out = []; for (const o of objs) o.traverse((q) => { if (q.isMesh) out.push(q); }); for (const m of out) { try { m.material.side = THREE.DoubleSide; } catch { /* plain object */ } } return out; };

/** Everything the probes need about one shop door: its rig, its meshes, and rays across the opening from outside (dir in) or from inside (dir out). */
function probe(bp) {
  const d = bp.doors.find((q) => q.kind === 'shutter'), st = ctx.archDoors.get(d.id), dir = d.wall.dir, yk = d.floor * bp.shell.fh;
  const ax = dir === 'x' ? [1, 0] : [0, 1], n = bp.frame.dir(d.nx, d.nz);                     // d.n points into the building
  const ray = (u, y, from) => {                                                                // from = +1: outside looking in, -1: inside looking out
    const o = bp.frame.toWorld(d.x + ax[0] * u - from * d.nx * 1.2, yk + y, d.z + ax[1] * u - from * d.nz * 1.2);
    rc.set(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(n[0] * from, 0, n[1] * from)); rc.far = 3;
    return rc;
  };
  const meshes = meshesOf(st.rig.pivots);
  const cover = (from = 1) => {                                                                  // fraction of a 8 x 9 grid of rays across the opening that meets the leaf
    ctx.scene.updateMatrixWorld(true);                                                           // the animation moved the leaf since the last ray
    let hit = 0, tot = 0;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 9; j++) {
      const u = -d.w / 2 + 0.03 + (i * (d.w - 0.06)) / 7, y = 0.04 + (j * (d.h - 0.08)) / 8;                // out to 3 cm from each jamb, from 4 cm off the sill to 4 cm under the lintel
      tot++; if (ray(u, y, from).intersectObjects(meshes, false).length) hit++;
    }
    return hit / tot;
  };
  const spread = (from, u = 0.45) => {                                                          // how far apart the first hits of a vertical sweep lie: 0 = a flat panel
    ctx.scene.updateMatrixWorld(true);
    const ds = [];
    for (let y = 0.7; y < d.h - 0.35; y += 0.017) { const h = ray(u, y, from).intersectObjects(meshes, false)[0]; if (h) ds.push(h.distance); }   // from 0.7 m: above the gap under a half-raised curtain
    return ds.length ? Math.max(...ds) - Math.min(...ds) : -1;
  };
  return { d, st, meshes, ray, cover, spread, n };
}
const settle = (open, st) => { ctx.events.emit('door:request', { doorId: st.id, open, by: 'npc' }); for (let i = 0; i < 40; i++) sys.fn(1 / 60); };

test('every look in every tone builds: the door belongs to the lot, the leaf is light, the exterior stays inside its budgets', () => {
  assert.equal(bps.length, combos.length);
  for (const [i, bp] of bps.entries()) {
    const [style, tone] = combos[i], d = bp.doors.find((q) => q.kind === 'shutter'), st = ctx.archDoors.get(d.id);
    assert.equal(bp.shopfront?.key, `${style}:${tone}`, `${bp.id}: the pinned look is the one built`);
    assert.deepEqual(bp.shopfront.doorIds, [d.id]);
    assert.equal(st.kind, 'shutter');
    assert.equal(st.rig.anim, SHUTTER_STYLES[style].roll ? 'roll' : style);
    assert.equal(st.rig.pivots.length, style === 'wood' ? 2 : 1);
    let tris = 0;
    for (const m of meshesOf(st.rig.pivots)) { const pos = m.geometry.attributes.position.array; for (let k = 0; k < pos.length; k++) assert.ok(Number.isFinite(pos[k]), `${bp.id}: NaN in the leaf`); tris += m.geometry.index.count / 3; }
    assert.ok(tris >= 100 && tris <= 700, `${bp.id} ${style}:${tone}: ${tris} leaf triangles`);
    const g = ctx.batch.groups.get(bp.id + '.ext');
    assert.ok(g.meshes.length <= 26, `${bp.id}: ${g.meshes.length} exterior meshes`);
  }
});

test('the leaf closes the opening: every ray across the doorway meets it, from the street and from the shop', () => {
  const problems = [];
  for (const [i, bp] of bps.entries()) {
    const p = probe(bp);
    settle(false, p.st);
    for (const from of [1, -1]) { const c = p.cover(from); if (c < 1) problems.push(`${bp.id} ${combos[i].join(':')} ${from > 0 ? 'outside' : 'inside'}: ${(c * 100).toFixed(0)}% covered`); }
  }
  assert.deepEqual(problems, []);
});

test('a roll-up curtain has slat relief on both faces: the street side deeper, the shop side still not a flat panel', () => {
  const problems = [];
  for (const [i, bp] of bps.entries()) {
    const [style] = combos[i];
    if (!SHUTTER_STYLES[style].roll) continue;
    const p = probe(bp);
    settle(false, p.st);
    const out = p.spread(1);
    if (!(out >= 0.011)) problems.push(`${bp.id} ${combos[i].join(':')} street face spread ${out.toFixed(4)} m`);
    if (style === 'ajar') continue;                                                              // from the shop an ajar curtain is hidden behind its glazed door (tested below)
    const inn = p.spread(-1);
    if (!(inn >= 0.007)) problems.push(`${bp.id} ${combos[i].join(':')} shop face spread ${inn.toFixed(4)} m`);
    if (!(out > inn)) problems.push(`${bp.id}: the street face should carry the deeper relief (${out.toFixed(4)} vs ${inn.toFixed(4)})`);
  }
  assert.deepEqual(problems, []);
});

test('the other looks are not flat either: grille, mullions, lattice, battens stand proud on the street side, and wood has ledges inside', () => {
  const problems = [];
  for (const [i, bp] of bps.entries()) {
    const [style] = combos[i];
    if (SHUTTER_STYLES[style].roll) continue;
    const p = probe(bp);
    settle(false, p.st);
    const [u, need] = style === 'glazed' ? [-0.1, 0.06] : style === 'fold' ? [0.45, 0.03] : [0.45, 0.02];       // glazed: between the mullions, the grille's rails stand 9 cm off the glass
    const out = p.spread(1, u);
    if (!(out >= need)) problems.push(`${bp.id} ${combos[i].join(':')} street face spread ${out.toFixed(4)} m (want ${need})`);
    if (style === 'wood') { const inn = p.spread(-1); if (!(inn >= 0.02)) problems.push(`${bp.id} wood inside spread ${inn.toFixed(4)} m`); }
    if (style === 'glazed' || style === 'fold') {
      const glass = p.meshes.filter((m) => m.userData.matKey === 'window_lit');
      if (!glass.length) problems.push(`${bp.id} ${style}: no glass in the door (it would not glow at night)`);
    }
  }
  assert.deepEqual(problems, []);
});

test('a half-raised curtain shows a lit glazed door in the gap under it', () => {
  const ajar = bps.map((bp, i) => [bp, combos[i]]).filter(([, c]) => c[0] === 'ajar');
  assert.ok(ajar.length >= 3);
  for (const [bp, c] of ajar) {
    const p = probe(bp);
    settle(false, p.st);
    const gap = bp.shopfront ? shopfrontOf(ctx, bp.lot).gap : 0;
    assert.ok(gap >= 0.34 && gap <= 0.48);
    const y = gap * 0.5;                                                                         // low in the gap
    const hit = p.ray(-0.45, y, 1).intersectObjects(p.meshes, false)[0];
    assert.ok(hit, `${bp.id}: a ray under the curtain meets the door behind it`);
    assert.equal(hit.object.userData.matKey, 'window_lit', `${bp.id} ${c.join(':')}: what shows in the gap is glass`);
    const up = p.ray(-0.45, p.d.h * 0.6, 1).intersectObjects(p.meshes, false)[0];
    assert.equal(up.object.userData.matKey, 'shutter_slats', 'higher up it is the curtain');
  }
});

test('every look opens and closes on E, on an NPC request and on a collider flip; the prompt names the thing', () => {
  const events = [];
  ctx.events.on('door:toggle', (e) => events.push(e));
  const problems = [];
  for (const [i, bp] of bps.entries()) {
    const [style] = combos[i], p = probe(bp), st = p.st, noun = SHUTTER_STYLES[style].roll ? 'persiana' : 'puerta';
    settle(false, st);
    assert.equal(p.cover(1), 1, `${bp.id}: closed to start with`);
    const out = ctx.interact.items.get(`door:${p.d.id}:out`), inn = ctx.interact.items.get(`door:${p.d.id}:in`);
    if (out.prompt() !== `Abrir ${noun}`) problems.push(`${bp.id} ${style}: prompt "${out.prompt()}"`);
    out.use();
    for (let k = 0; k < 40; k++) sys.fn(1 / 60);
    if (!ctx.physics.doorOpen(p.d.id)) problems.push(`${bp.id}: collider not opened by E`);
    if (inn.prompt() !== `Cerrar ${noun}`) problems.push(`${bp.id} ${style}: prompt "${inn.prompt()}" when open`);
    const c = p.cover(1);
    if (!(c <= 0.2)) problems.push(`${bp.id} ${combos[i].join(':')}: still ${(c * 100).toFixed(0)}% closed after opening`);
    inn.use();
    for (let k = 0; k < 40; k++) sys.fn(1 / 60);
    if (ctx.physics.doorOpen(p.d.id)) problems.push(`${bp.id}: collider still open after closing`);
    if (p.cover(1) < 1) problems.push(`${bp.id} ${combos[i].join(':')}: not shut again after closing`);
    // an NPC's request and a collider flipped by the sim move the leaf too
    ctx.events.emit('door:request', { doorId: st.id, open: true, by: 'npc' });
    for (let k = 0; k < 40; k++) sys.fn(1 / 60);
    if (!(p.cover(1) <= 0.2)) problems.push(`${bp.id}: door:request did not open the leaf`);
    ctx.physics.setDoor(st.id, false);
    for (let k = 0; k < 40; k++) sys.fn(1 / 60);
    if (p.cover(1) < 1) problems.push(`${bp.id}: a collider flipped shut did not close the leaf`);
  }
  assert.deepEqual(problems, []);
  assert.ok(events.length >= bps.length * 2, 'door:toggle reported for every opening and closing');
});

test('each look has its housing: a cassette and guide rails stand off the wall over a roll-up, a lintel or surround over the rest', () => {
  const problems = [];
  const hit = (bp, p, u, y) => {
    const g = ctx.batch.groups.get(bp.id + '.ext'), r = p.ray(u, y, 1);
    r.far = 3;
    const h = r.intersectObjects(g.meshes, false)[0];
    return h ? 1.2 - h.distance : null;                                                           // how far the first thing stands out in front of the wall plane
  };
  for (const [i, bp] of bps.entries()) {
    const [style] = combos[i], p = probe(bp), t = p.d.wall.t;
    const over = hit(bp, p, p.d.w * 0.31, p.d.h + 0.16);                                          // above the opening, clear of the sign board and the casing
    const need = SHUTTER_STYLES[style].roll ? t / 2 + 0.15 : t / 2 + 0.04;
    if (over == null || over < need) problems.push(`${bp.id} ${combos[i].join(':')}: nothing stands ${need.toFixed(2)} m out over the door (${over == null ? 'no hit' : over.toFixed(2)})`);
  }
  assert.deepEqual(problems, []);
});

// Last, and loaded late: the page's own boot code installs browser stand-ins that the door and shell probes above do not need.
test('the real barrio: no two near shopfronts share a look, all six styles appear', { timeout: 300000 }, async () => {
  const { buildData } = await import('./headless.mjs');
  const { ctx: wctx } = await buildData({ world: true });
  const wl = wctx.plan.lots, shops = wl.filter(isShopLot), looks = assignShopfronts(wl);
  assert.ok(shops.length >= 20, `${shops.length} shop lots`);
  const clash = [];
  for (let i = 0; i < shops.length; i++) for (let j = i + 1; j < shops.length; j++) {
    if (gapOf(shops[i], shops[j]) >= 6) continue;
    const s = sameLook(looks.get(shops[i].id), looks.get(shops[j].id));
    if (s.key || s.style) clash.push(`${shops[i].id}/${shops[j].id}`);
  }
  assert.deepEqual(clash, []);
  assert.deepEqual(new Set([...looks.values()].map((l) => l.style)), new Set(styles));
  for (const l of shops) assert.equal(shopfrontOf(wctx, l).key, looks.get(l.id).key, `${l.id}: shopfrontOf agrees with the plan's colouring`);
});
