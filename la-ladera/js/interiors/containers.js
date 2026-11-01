// INTERIORS (A3): the container runtime. Wardrobes, dressers, nightstands, cupboards, cash drawers ... OPEN (a hinged door swings ~100 degrees, a drawer slides
// out, a lid lifts, 0.3 s) and what is inside is a set of small things, each its own target ('Examinar', 'Leer el diario', a special find).
//
// How it stays cheap:
//  * The closed front of every openable piece is part of the building's merged interior mesh like any other furniture (no extra draw call, no boot cost);
//    carcass.js logged its index range on the builder. Opening hides that range (the triangles become degenerate) and shows a COPY of the front (a ghost
//    group: <= 3 meshes) that turns / slides about its hinge. Closing puts the range back and drops the ghost from the scene (the geometry is kept).
//  * Contents are lazy and deterministic (contents.js): nothing exists before the first open, and the same drawer shows the same things after a reload.
//  * Nothing is made at boot. build.js only hands over each building's front log (deferContainers); a 4 Hz scan activates a building when the player comes
//    within ACTIVATE metres of its fronts (slot objects, the barrio-wide content plan, one STATIC target per slot) and drops all of it again beyond DEACTIVATE.
//  * Every slot is a STATIC shaped target of the interaction kernel (core/interact.js: a ray test against its own box, nearest hit wins, 4 m grid, so thousands
//    cost nothing per frame); the things inside an open slot are registered while it is open and dropped with it (one group per slot).
//    Everything closes by itself when the player leaves the building. Colliders never change (visual only).
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { rayBox } from '../core/interact.js';
import { CATALOG } from './catalog.js';
import { layoutOf, TRAY } from './carcass.js';
import { foldMaterials } from './fold.js';
import { standSpots } from './reach.js';
import { Pen, tintFor } from './standins.js';
import { makeContents, drawContent, examineLine, readDoc, findInfo, planBuilding, householdOf, TOTALS } from './contents.js';
import { inspectParts } from './inspect.js';

export const DUR = 0.3, DOOR_ANGLE = (100 * Math.PI) / 180, LID_ANGLE = (82 * Math.PI) / 180;   // a chest stands against a wall and its lid hinges at the back: past 90 degrees the lid is IN the wall (R4-112: at 105 it was 12 cm in)
export const ACTIVATE = 10, DEACTIVATE = 16, SCAN = 0.25;       // metres from a building's nearest front; seconds between scans
const RADIUS = 2.8;
/** A slot's target is its front inflated by PAD on every side and reaching SLAB_OUT in front of the front plane (tests/interiors-containers.test.mjs reads both: what stands behind a neighbour's slab is offered as the neighbour). */
export const PAD = 0.025, SLAB_OUT = 0.04;
const Y = new THREE.Vector3(0, 1, 0);
const ease = (t) => 1 - (1 - t) * (1 - t);
const say = (ctx, who, [es, en], ms = 6400) => ctx.ui?.subtitle?.({ who, es, en, ms });
const mulc = (hex, k) => (hex == null ? undefined : ((Math.min(255, ((hex >> 16) & 255) * k) | 0) << 16) | ((Math.min(255, ((hex >> 8) & 255) * k) | 0) << 8) | (Math.min(255, (hex & 255) * k) | 0));

/** The registry of the page / test: ctx.containers (slots by id, by building) and ctx.collection (what the player has read and found). */
export function installContainers(ctx) {
  if (ctx.containers) return ctx.containers;
  const C = ctx.containers = {
    ctx, slots: new Map(), byBuilding: new Map(), pending: new Map(), anim: new Set(), opened: 0, targets: 0, acc: 0, activations: 0,
    open: (id) => openSlot(C, C.slots.get(id)), close: (id, instant) => closeSlot(C, C.slots.get(id), instant), toggle: (id) => toggleSlot(C, C.slots.get(id)),
    closeBuilding: (bid, instant = true) => closeBuilding(C, bid, instant), step: (dt) => step(C, dt),
    activate: (bid) => activate(C, C.pending.get(bid)), deactivate: (bid) => deactivate(C, C.pending.get(bid)), scan: () => scan(C),
    openSlots: () => [...C.slots.values()].filter((s) => s.state !== 'closed'),
  };
  ctx.collection ??= makeCollection();
  ctx.addSystem?.('interiors-containers', (dt) => step(C, dt), 36);
  ctx.events?.on?.('player:exit', (e) => closeBuilding(C, e?.buildingId, true));
  return C;
}

/** What the player has read and found: Maps keyed by id (papers by `id@building`, since two homes can hold the same paper and the resolved texts differ). */
function makeCollection() {
  const col = { papers: new Map(), finds: new Map(), totalPapers: TOTALS.papers, totalFinds: TOTALS.finds, counts: null };
  col.counts = () => {
    const byCollection = { 'Monedas de oro': 0, Relojes: 0, Joyas: 0, Rarezas: 0 };
    for (const f of col.finds.values()) byCollection[f.collection] = (byCollection[f.collection] ?? 0) + 1;
    return { papers: new Set([...col.papers.values()].map((d) => d.id)).size, finds: col.finds.size, byCollection, total: { finds: col.totalFinds, papers: col.totalPapers } };
  };
  return col;
}

// ------------------------------------------------------------------ deferral (build.js, once a building's interior is flushed) and activation (near the player)
/** build.js: remember a building's front log. Costs a circle (the fronts' pivots) and one Map entry: nothing else exists until the player is near. */
export function deferContainers(ctx, bp, group, log) {
  if (!log?.length) return 0;
  const C = installContainers(ctx);
  let cx = 0, cz = 0; for (const f of log) { cx += f.piv[0]; cz += f.piv[2]; } cx /= log.length; cz /= log.length;
  let r = 0; for (const f of log) r = Math.max(r, Math.hypot(f.piv[0] - cx, f.piv[2] - cz));
  const [wx, , wz] = bp.frame.toWorld(cx, 0, cz);                       // the pivots are building-local, the player is in the world: scan() compares the two (a turn keeps r)
  C.pending.set(bp.id, { bp, group, log, cx: wx, cz: wz, r, active: false, failed: false });
  return log.length;
}

/** Make a building's slots, plan its contents and register its static targets. */
function activate(C, e) {
  if (!e || e.active || e.failed) return false;
  try { e.active = registerFronts(C.ctx, e.bp, e.group, e.log) > 0; C.activations++; }
  catch (err) { e.failed = true; (C.ctx.errors ??= []).push({ stage: 'interiors', building: e.bp.id, message: 'containers ' + String(err?.message ?? err), stack: err?.stack }); }
  return e.active;
}
/** Close everything of the building at once, drop its targets, its ghosts and its slot objects. The closed fronts stay in the merged mesh. */
function deactivate(C, e) {
  if (!e?.active) return false;
  const list = C.byBuilding.get(e.bp.id) ?? [];
  closeBuilding(C, e.bp.id, true);
  C.ctx.interact?.unregisterGroup?.(`cont:${e.bp.id}`);
  for (const S of list) {
    if (S.target) C.targets--;
    for (const lf of S.leaves) if (lf.ghost) { lf.ghost.group.removeFromParent(); lf.ghost.group.traverse((o) => o.geometry?.dispose?.()); }
    if (S.contentGroup && S.slot.kind !== 'drawer') { S.contentGroup.removeFromParent(); S.contentGroup.traverse((o) => o.geometry?.dispose?.()); }
    C.slots.delete(S.id); C.anim.delete(S);
  }
  C.byBuilding.delete(e.bp.id); e.active = false;
  return true;
}
/** The 4 Hz scan: activate the buildings the player is near (and whose interior is shown), deactivate the ones left behind. */
function scan(C) {
  const p = C.ctx.player?.s; if (!p) return;
  for (const e of C.pending.values()) {
    const d = Math.hypot(p.x - e.cx, p.z - e.cz) - e.r, shown = e.group.obj.visible !== false;
    if (e.active) { if (!shown || d > DEACTIVATE) deactivate(C, e); }
    else if (shown && d < ACTIVATE) activate(C, e);
  }
}

/** `log` = builder.fronts: one entry per closed front the carcass drawer wrote. Makes one slot object per (piece, slot), plans its papers and finds, registers its target. */
export function registerFronts(ctx, bp, group, log) {
  if (!log?.length) return 0;
  const C = installContainers(ctx), recs = new Map(bp.furniture.map((r) => [r.id, r]));
  const meshes = new Map(); for (const m of group.meshes) meshes.set(m.userData.matKey, m);
  const byId = new Map(), list = [];
  list.group = group; list.bid = bp.id;
  for (const f of log) {
    const rec = recs.get(f.rec), c = rec && CATALOG[rec.name], lay = layoutOf(c), slot = lay?.slots[f.slot];
    if (!slot) continue;
    const key = `${rec.id}#${slot.i}`;
    let S = byId.get(key);
    if (!S) {
      const cs = Math.cos(rec.ry ?? 0), sn = Math.sin(rec.ry ?? 0), y0 = rec.kind === 'ceil' ? rec.y - c.size[1] : rec.y;
      S = { id: key, bid: bp.id, bp, group, rec, c, lay, slot, leaves: [], meshes, state: 'closed', t: 0, want: 0, objs: null, targets: [], ghostsReady: false,
        loc: { cs, sn, y0, bl: (lx, lz) => [rec.x + lx * cs + lz * sn, rec.z - lx * sn + lz * cs], u: [cs, -sn], v: [sn, cs] } };
      byId.set(key, S); list.push(S); C.slots.set(key, S);
    }
    S.leaves.push({ front: f, ranges: f.ranges, saved: null, ghost: null });
  }
  const conns = new Map();
  for (const S of list) {
    const r = S.slot.rect; S.pos = worldPoint(S, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, S.slot.zf + 0.1);
    const L = bp.interior?.layouts?.get(S.rec.room);
    S.reachable = !L || frontSpots(S, conns.get(L) ?? conns.set(L, L.connectivity()).get(L)).length > 0;       // a paper in a nightstand wedged behind a bed would never be read
  }
  // R4-118: a front nobody can stand in front of (a nightstand between the bed and the wall, a dresser behind a bed) is a decoration: no prompt, no contents, no paper or find is planned into it,
  // so a visitor is never offered what cannot be opened and never has to look for a find that cannot be reached
  const made = list.length;
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].reachable) { C.slots.delete(list[i].id); list.splice(i, 1); }
  list.decor = made - list.length;
  C.byBuilding.set(bp.id, list);
  planBuilding(ctx, bp, list);                                                       // which paper and which find sit in which slot (pinned now, drawn on the first open)
  for (const S of list) registerSlotTarget(C, S, list);
  return made;
}

/** Where a person can stand to use a slot: building-frame points 0.55 to 1.3 m in front of it, clear of furniture and connected to the doors, nearest to 1 m first. */
export const frontSpots = (S, conn) => standSpots(S.bp, S.rec, S.slot, conn);

const worldPoint = (S, lx, ly, lz) => { const [bx, bz] = S.loc.bl(lx, lz); return S.bp.frame.toWorld(bx, S.loc.y0 + ly, bz); };
const worldDir = (S, d) => { const p = S.bp.frame.toWorld(0, 0, 0), q = S.bp.frame.toWorld(d[0], 0, d[1]); const v = new THREE.Vector3(q[0] - p[0], 0, q[2] - p[2]); return v.normalize(); };

// ------------------------------------------------------------------ the ghost of a front: its own triangles copied out of the merged mesh, about its pivot
function extract(geo, from, to, o) {
  const idx = geo.index.array, pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, col = geo.attributes.color;
  const map = new Map(), P = [], N = [], U = [], Cc = [], I = [];
  for (let k = from; k < to; k++) {
    const v = idx[k]; let n = map.get(v);
    if (n === undefined) {
      n = P.length / 3; map.set(v, n);
      P.push(pos.getX(v) - o.x, pos.getY(v) - o.y, pos.getZ(v) - o.z); N.push(nor.getX(v), nor.getY(v), nor.getZ(v)); U.push(uv.getX(v), uv.getY(v)); Cc.push(col.getX(v), col.getY(v), col.getZ(v));
    }
    I.push(n);
  }
  return geometryOf(P, N, U, Cc, I);
}
function geometryOf(P, N, U, Cc, I) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
  g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
/** Every material accumulator of a MeshBuilder as a geometry relative to `o` (world metres). */
function builderGeometries(mb, o) {
  const out = [];
  for (const [key, a] of mb.accs) {
    if (!a.idx.length) continue;
    const P = new Array(a.pos.length);
    for (let i = 0; i < a.pos.length; i += 3) { P[i] = a.pos[i] - o.x; P[i + 1] = a.pos[i + 1] - o.y; P[i + 2] = a.pos[i + 2] - o.z; }
    out.push({ key, geometry: geometryOf(P, a.nor, a.uv, a.col, a.idx) });
  }
  return out;
}
const meshOf = (ctx, key, geometry) => { const m = new THREE.Mesh(geometry, ctx.mat(key)); m.castShadow = false; m.receiveShadow = true; m.userData.matKey = key; return m; };
const newBuilder = (bp) => { const b = new MeshBuilder(), lot = bp.lot ?? {}; b.setBasePose(lot.x ?? 0, lot.y ?? 0, lot.z ?? 0, lot.rotY ?? 0); return b; };

/** The tray of a drawer in the piece's own frame: a floor TRAY thick, two sides and a back to the rim (no front: the drawer's front is the carcass's). The one description of it, so what drawTray
 *  draws and what the contents rest on (carcass.js drawerSurf) and the tests measure cannot drift apart. `floorTop` = where things lie; `in` = the room inside. */
export function trayOf(cv) {
  const x0 = cv.x0 + 0.004, x1 = cv.x1 - 0.004, y0 = cv.y0, y1 = cv.y1 - 0.004, z0 = cv.z0 + 0.01, z1 = cv.z1 - 0.004, t = TRAY;
  return { x0, x1, y0, y1, z0, z1, t, floorTop: y0 + t, rim: y1, in: { x0: x0 + t, x1: x1 - t, z0: z0 + t, z1 } };
}
/** The tray a drawer carries behind its front (drawn only when the drawer is out). */
function drawTray(P, S, tint) {
  const tr = trayOf(S.slot.cav), col = tint == null ? undefined : mulc(tint, 0.88), t = tr.t, m = S.c.mat;
  const box = (x0, x1, y0, y1, z0, z1, mat = m) => P.box(mat, (x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col);
  const { x0, x1, y0, y1, z0, z1 } = tr;
  box(x0, x1, y0, y0 + t, z0, z1, 'plywood');
  box(x0, x0 + t, y0, y1, z0, z1); box(x1 - t, x1, y0, y1, z0, z1);
  box(x0, x1, y0, y1, z0, z0 + t);
}

function ensureGhosts(C, S) {
  if (S.ghostsReady) return;
  const { ctx } = C, tint = S.rec.tint == null ? null : tintFor(S.c, S.rec.tint), kind = S.slot.kind;
  for (const lf of S.leaves) {
    const f = lf.front, pivot = new THREE.Vector3(...S.bp.frame.toWorld(f.piv[0], f.piv[1], f.piv[2]));
    const group = new THREE.Group(); group.name = `${S.id}:ghost${f.leaf}`; group.position.copy(pivot); group.visible = false;
    const parts = [];
    for (const r of f.ranges) { const mesh = S.meshes.get(r.key); if (mesh) parts.push({ key: r.key, geometry: extract(mesh.geometry, r.from, r.to, pivot) }); }
    if (kind === 'drawer') {                                                                 // tray behind the front
      const mb = newBuilder(S.bp), P = new Pen(mb, S.rec, S.c); drawTray(P, S, tint);
      foldMaterials(mb);                                                                 // the same materials as the closed front it slides out of (fold.js)
      parts.push(...builderGeometries(mb, pivot));
    }
    for (const p of parts) group.add(meshOf(ctx, p.key, p.geometry));
    S.group.obj.add(group);
    lf.ghost = { group, pivot: pivot.clone(), fwd: worldDir(S, f.fwd), right: worldDir(S, f.right) };
  }
  S.ghostsReady = true;
}
/** The closed front's triangles go degenerate while its ghost is out (and come back on close). */
function hide(S, lf) {
  if (lf.saved) return;
  lf.saved = [];
  for (const r of lf.ranges) {
    const mesh = S.meshes.get(r.key), a = mesh?.geometry.index; if (!a) continue;
    lf.saved.push({ a, from: r.from, data: a.array.slice(r.from, r.to) });
    a.array.fill(0, r.from, r.to); a.needsUpdate = true;
  }
}
function unhide(lf) {
  if (!lf.saved) return;
  for (const s of lf.saved) { s.a.array.set(s.data, s.from); s.a.needsUpdate = true; }
  lf.saved = null;
}

function apply(S) {
  const e = ease(S.t), kind = S.slot.kind;
  for (const lf of S.leaves) {
    const g = lf.ghost?.group; if (!g) continue;
    if (kind === 'doors') { g.quaternion.setFromAxisAngle(Y, (lf.front.hinge === 'R' ? 1 : -1) * DOOR_ANGLE * e); g.position.copy(lf.ghost.pivot); }
    else if (kind === 'lid') { g.quaternion.setFromAxisAngle(lf.ghost.right, -LID_ANGLE * e); g.position.copy(lf.ghost.pivot); }
    else g.position.copy(lf.ghost.pivot).addScaledVector(lf.ghost.fwd, S.slot.travel * e);
  }
}

// ------------------------------------------------------------------ opening and closing
export function openSlot(C, S) {
  if (!S || S.state === 'open' || S.state === 'opening') return false;
  ensureGhosts(C, S);
  for (const lf of S.leaves) { hide(S, lf); if (lf.ghost) lf.ghost.group.visible = true; }
  S.objs ??= makeContents(C.ctx, S);
  buildContents(C, S);
  S.want = 1; S.state = S.t >= 1 ? 'open' : 'opening';
  apply(S);
  C.opened++;
  emit(C, 'container:open', S);
  if (S.state === 'open') registerContentTargets(C, S); else C.anim.add(S);
  return true;
}
export function closeSlot(C, S, instant = false) {
  if (!S || S.state === 'closed') return false;
  if (S.state === 'closing') { if (!instant) return false; S.t = 0; C.anim.delete(S); finishClose(C, S); return true; }       // already on its way: leaving the building ends it now
  unregisterContentTargets(C, S);
  S.want = 0; S.state = 'closing';
  if (instant) { S.t = 0; C.anim.delete(S); finishClose(C, S); } else { C.anim.add(S); emit(C, 'container:close', S); }
  return true;
}
const toggleSlot = (C, S) => (S?.state === 'open' ? closeSlot(C, S) : S?.state === 'closed' ? openSlot(C, S) : false);
function finishClose(C, S) {
  S.state = 'closed'; S.t = 0; apply(S);
  for (const lf of S.leaves) { unhide(lf); if (lf.ghost) lf.ghost.group.visible = false; }
  if (S.contentGroup) S.contentGroup.visible = false;
}
function closeBuilding(C, bid, instant) {
  const list = C.byBuilding.get(bid); if (!list) return 0;
  let n = 0; for (const S of list) if (S.state !== 'closed') { closeSlot(C, S, instant); n++; }
  return n;
}
function emit(C, type, S) {
  const [x, y, z] = S.pos ?? [0, 0, 0];
  C.ctx.events?.emit?.(type, { id: S.id, building: S.bid, kind: S.slot.kind === 'doors' ? (S.slot.group === 'fridge' ? 'fridge' : 'door') : S.slot.kind, group: S.slot.group, x, y, z });
}
/** Advances the slots that are moving (the set is empty almost all the time). */
function step(C, dt) {
  C.acc += dt; if (C.acc >= SCAN) { C.acc = 0; scan(C); }
  for (const S of C.anim) {
    S.t += (S.want ? 1 : -1) * dt / DUR;
    if (S.want && S.t >= 1) { S.t = 1; S.state = 'open'; C.anim.delete(S); apply(S); registerContentTargets(C, S); }
    else if (!S.want && S.t <= 0) { C.anim.delete(S); finishClose(C, S); }
    else apply(S);
  }
}

// ------------------------------------------------------------------ targets
/** A view test for the box x0..x1, y0..y1, z0..z1 of a piece (item-local metres): (ctx, it, eye, dir) -> metres along the ray to where it enters, or -1. */
function boxHit(S, x0, x1, y0, y1, z0, z1) {
  const fr = S.bp.frame, { loc } = S, [bx, bz] = loc.bl((x0 + x1) / 2, (z0 + z1) / 2);
  const c = fr.toWorld(bx, loc.y0 + (y0 + y1) / 2, bz), p = fr.toWorld(bx, 0, bz), a = fr.toWorld(bx + loc.u[0], 0, bz + loc.u[1]), b = fr.toWorld(bx + loc.v[0], 0, bz + loc.v[1]);
  const ax = a[0] - p[0], az = a[2] - p[2], vx = b[0] - p[0], vz = b[2] - p[2], hx = (x1 - x0) / 2, hy = (y1 - y0) / 2, hz = (z1 - z0) / 2;
  return (ctx, it, eye, dir) => {
    const dx = eye.x - c[0], dz = eye.z - c[2], ox = dx * ax + dz * az, oy = eye.y - c[1], oz = dx * vx + dz * vz;
    if (Math.abs(ox) < hx && Math.abs(oy) < hy && Math.abs(oz) < hz) return -1;                    // an eye INSIDE the box looks at nothing of it
    return rayBox(ox, oy, oz, dir.x * ax + dir.z * az, dir.y, dir.x * vx + dir.z * vz, hx, hy, hz, RADIUS + 1);
  };
}
const readerBusy = (ctx) => !!ctx.reader?.isOpen;
/** The kernel's `lead` for a thing inside a piece, `d` metres ON THE FLOOR (the carcass depth): the sweep stops `lead` short of the thing along the RAY, which covers only cos(pitch) of that
 *  on the floor, so the look down at a paper on a cupboard's floor needs `d / cos(pitch)` (`dir` is the unit view ray; past about 70 degrees down the divisor stops shrinking). */
export const floorLead = (d, dir) => d / Math.max(MIN_FLAT, Math.hypot(dir.x, dir.z));
const MIN_FLAT = 0.35;

function registerSlotTarget(C, S, list) {
  const { ctx } = C, r = S.slot.rect, zf = S.slot.zf, travel = S.slot.kind === 'drawer' ? S.slot.travel : 0;
  if (!ctx.interact?.register) return;
  const [x, y, z] = S.pos;
  // what the view ray is tested against: the front's own slab while it is closed (a drawer's slide path is NOT part of it: a ray aimed at the drawer below
  // would cross the path of the one above), the slab plus the path once it is out (aim at the open drawer's tray to close it)
  const slab = (z1) => boxHit(S, r.x0 - PAD, r.x1 + PAD, r.y0 - PAD, r.y1 + PAD, zf - 0.16, z1);
  const closedHit = slab(zf + SLAB_OUT), openHit = travel ? slab(zf + SLAB_OUT + travel) : closedHit;
  S.target = ctx.interact.register({
    // a wall cupboard hangs over a counter: the kernel's sight line is a body sweep that stops `lead` short of the box, and the counter (inflated by the body's width) would block it
    id: `cont:${S.id}`, kind: 'container', x, y, z, radius: RADIUS, reach: 1.3, static: true, group: `cont:${S.bid}`, building: S.bid, lead: S.rec.kind === 'wall' ? 0.75 : 0.35, pri: 1,
    enabled: (c) => list.group.obj?.visible !== false && !readerBusy(c),
    hit: (c, it, eye, dir) => {
      const t = (S.state === 'closed' ? closedHit : openHit)(c, it, eye, dir);
      if (t < 0) return -1;
      if (S.state !== 'closed' && S.objHits) for (const h of S.objHits) if (h(c, it, eye, dir) >= 0) return -1;      // the thing inside wins over its frame
      return t;
    },
    prompt: () => (S.state === 'open' || S.state === 'opening' ? S.slot.prompt[1] : S.slot.prompt[0]),
    use: () => { if (S.state === 'open' || S.state === 'closed') toggleSlot(C, S); },
  });
  C.targets++;
}
function registerContentTargets(C, S) {
  const { ctx } = C; if (!ctx.interact?.register || S.targets.length) return;
  const hh = S.hh ?? householdOf(S), D = S.rec.kind === 'wall' ? 0.75 : S.c.size[2], dz = S.slot.kind === 'drawer' ? S.slot.travel : 0;      // `lead`: the sight line stops at the front plane (a wall cupboard: before the counter under it)
  S.objs.forEach((o, k) => {
    const [x, y, z] = worldPoint(S, o.x, o.y + o.h / 2, o.z + dz), hit = S.objHits[k];
    let said = null;                                                                       // a find you have already picked up tells you its name on the prompt
    S.targets.push(ctx.interact.register({
      id: `cont:${S.id}:${k}`, kind: 'object', x, y, z, radius: RADIUS, building: S.bid, group: `cont:${S.id}`, lead: D, pri: 2,
      // the kernel's sweep stops `lead` short of the thing ALONG THE RAY, so a steep look down at a paper on a cupboard floor shortens the lead on the floor by cos(pitch) and the sweep
      // ends inside the cupboard's own outline (the stand's flat papers were offered from no spot at all): `lead` is the carcass depth ON THE FLOOR, so the hit sets it for this ray
      enabled: (c) => S.state === 'open' && !readerBusy(c), hit: (c, it, eye, dir) => { const t = hit(c, it, eye, dir); if (t >= 0) it.lead = floorLead(D, dir); return t; },
      prompt: () => (o.paper ? o.paper.prompt : o.find && ctx.discover?.found?.has(`find:${o.find}:${S.bid}`) ? `Examinar · ${(said ??= findInfo(o.find, hh).es)}` : 'Examinar'),
      use: (c) => useObject(C, S, o, hh, c),
    }));
    C.targets++;
  });
}
function unregisterContentTargets(C, S) {
  if (!S.targets.length) return;
  C.ctx.interact?.unregisterGroup?.(`cont:${S.id}`);
  C.targets -= S.targets.length; S.targets = [];
}

/** E on a thing inside: a plain object says one bilingual line; a paper opens the reader; a special find is announced and counted. */
function useObject(C, S, o, hh, ctx = C.ctx) {
  const col = ctx.collection;
  if (o.paper) {
    const doc = readDoc(o.paper, hh, S.bid);
    if (doc) {
      const key = `${doc.id}@${S.bid}`;
      if (!col.papers.has(key)) { col.papers.set(key, doc); ctx.events?.emit?.('paper:read', { id: doc.id, kind: doc.kind, title: doc.title.es, en: doc.title.en, who: doc.who, building: S.bid }); }
      if (ctx.reader?.open) ctx.reader.open(doc); else say(ctx, o.who, [doc.title.es, doc.title.en]);                 // no reader (a test): the title, never a 90-word page as a subtitle
      return;
    }
  }
  say(ctx, o.who, examineLine(o, hh));
  if (!o.find) return;
  const f = findInfo(o.find, hh), [x, y, z] = S.pos;
  if (!col.finds.has(f.id)) col.finds.set(f.id, { ...f, building: S.bid });
  const place = S.bp?.lot?.name;                                                                        // the title says where: eight houses hold a morrocota
  const d = { id: `find:${f.id}:${S.bid}`, name: place ? `${f.es} · ${place}` : f.es, en: f.en, kind: 'hallazgo', collection: f.collection, x, y, z, radius: 0, building: S.bid, rarity: f.rarity };
  const disc = ctx.discover;
  if (disc?.mark) disc.mark(d);
  else if (disc && !disc.found.has(d.id)) { disc.items.set(d.id, d); disc.found.add(d.id); ctx.events?.emit?.('discover', d); }
  if (!S.foundEmitted) { S.foundEmitted = true; ctx.events?.emit?.('find', { id: f.id, name: f.es, en: f.en, kind: f.kind, collection: f.collection, rarity: f.rarity, building: S.bid, x, y, z }); }
}

// ------------------------------------------------------------------ the things inside
function buildContents(C, S) {
  if (S.contentGroup) { S.contentGroup.visible = true; return; }
  const { ctx } = C, mb = newBuilder(S.bp), P = new Pen(mb, S.rec, S.c), kind = S.slot.kind;
  P.parts = (key) => inspectParts(ctx, key);                                             // the library models that have loaded (inspect.js); a thing whose model has not is drawn as its stand-in
  for (const o of S.objs) drawContent(P, o);
  foldMaterials(mb);                                                                     // fewer meshes while open (fold.js)
  const f0 = S.leaves[0].ghost, origin = kind === 'drawer' ? f0.pivot : new THREE.Vector3(...worldPoint(S, 0, 0, 0));
  const g = new THREE.Group(); g.name = `${S.id}:contents`;
  for (const p of builderGeometries(mb, origin)) g.add(meshOf(ctx, p.key, p.geometry));
  if (kind === 'drawer') f0.group.add(g); else { g.position.copy(origin); S.group.obj.add(g); }
  S.contentGroup = g;
  // the view tests of the things inside, at their OPEN pose (a drawer's contents have slid out by `travel`)
  const dz = kind === 'drawer' ? S.slot.travel : 0;
  S.objHits = S.objs.map((o) => boxHit(S, o.x - o.w / 2 - PAD, o.x + o.w / 2 + PAD, o.y - 0.015, o.y + o.h + PAD, o.z - o.d / 2 - PAD + dz, o.z + o.d / 2 + PAD + dz));
}

/** Counts for tests and the debug overlay. */
export function containerStats(ctx) {
  const C = ctx.containers; if (!C) return { slots: 0, open: 0, targets: 0 };
  return { slots: C.slots.size, open: [...C.slots.values()].filter((s) => s.state !== 'closed').length, targets: C.targets, buildings: C.byBuilding.size };
}
