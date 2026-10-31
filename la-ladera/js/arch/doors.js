// Live door leaves: one Object3D per leaf (hinge pivot), a 0.35 s swing that follows the physics collider (`ctx.physics.doorOpen`),
// 'Abrir puerta' / 'Cerrar puerta' interactables, and the `door:request` listener NPCs use (CONTRACT 5.5, REQUESTS A4 -> A2).
// Shop shutters (kind 'shutter') roll up instead of swinging. Interior leaves hang under the building's `.int` group so the engine's
// visibility budget hides them with the rest of the interior; exterior leaves are part of `.ext`.
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { lin, mulc, mixc, hash01 } from './mb.js';
import { angDiff, smooth } from '../core/util.js';
import { makeShutterRig } from './shutters.js';
import { bakeLeaves, hideBaked, showBaked } from './leafbake.js';

export const SWING_T = 0.35;
const INTERIOR_COLS = [0xe9e1cf, 0xa9794b, 0x6f9a86, 0xd7a85a, 0x8aa0b4, 0xf2efe6, 0x8b6b4a, 0xc9b79a];

const STILE = 0.1, RAIL = 0.12;
/** The looks of a door leaf: how the street doors and the room doors are drawn (by seed; a double door is always panelled). */
export const LEAF_STYLES = ['panels', 'glazed', 'planks', 'flush', 'metal'];

/** Which look a door leaf has: metal doors are pressed steel, street doors are glazed-topped, panelled or plank doors, room doors flush or panelled. */
export function leafStyle(d) {
  const r = hash01(d.id, 2);
  if (d.mat === 'door_metal') return 'metal';
  if (d.double) return 'panels';
  return d.ext ? (r < 0.35 ? 'glazed' : r < 0.7 ? 'panels' : 'planks') : r < 0.3 ? 'flush' : 'panels';
}

/** The leaf of a swing door (shop shutters are built by shutters.js); `w` = this leaf's width (a double door has two, each half the opening). */
function leafMesh(ctx, G, d, w = d.w) {
  const mb = new MeshBuilder();
  const h = d.h, th = 0.045, hv = (n) => hash01(d.id, n), fs = G.fs, style = leafStyle(d);
  let col;
  if (d.mat === 'door_metal') col = mixc(fs.metal, [0.75, 0.8, 0.84], 0.55);
  else if (d.ext) col = fs.door;
  else col = lin(INTERIOR_COLS[Math.floor(hv(1) * INTERIOR_COLS.length)]);
  const mat = d.mat === 'door_metal' ? 'door_metal' : 'door_wood', pc = mulc(col, 0.84), pi = mulc(col, 0.94), dark = mulc(col, 0.5);
  const slab = (x0, y0, x1, y1) => mb.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, 0, x1 - x0, y1 - y0, th, { col });
  /** A bevelled raised panel on both faces: a shallow box with a smaller, lighter one on top (the step catches the light). */
  const panel = (x0, y0, x1, y1, depth = 0.014) => {
    if (x1 - x0 < 0.08 || y1 - y0 < 0.08) return;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ins = Math.min(0.04, (x1 - x0) / 4, (y1 - y0) / 4);
    for (const side of [1, -1]) {
      const skip = [side > 0 ? 'nz' : 'pz'];
      mb.box(mat, cx, cy, side * (th / 2 + depth / 2), x1 - x0, y1 - y0, depth, { col: pc, skip });
      mb.box(mat, cx, cy, side * (th / 2 + depth + 0.004), x1 - x0 - 2 * ins, y1 - y0 - 2 * ins, 0.008, { col: pi, skip });
    }
  };
  if (style === 'glazed') {                                                    // stiles and rails round a glass light over a panelled lower half
    const yg0 = h * 0.5 + 0.06, yg1 = h - RAIL;
    slab(0, 0, STILE, h); slab(w - STILE, 0, w, h); slab(STILE, 0, w - STILE, yg0); slab(STILE, yg1, w - STILE, h);
    mb.quad('glass', [STILE, yg0, 0], [w - STILE, yg0, 0], [w - STILE, yg1, 0], [STILE, yg1, 0], { col: [1, 1, 1] });
    mb.box(mat, w / 2, (yg0 + yg1) / 2, 0, 0.03, yg1 - yg0, th + 0.012, { col: dark });                       // the muntins: one upright, one cross bar
    mb.box(mat, w / 2, (yg0 + yg1) / 2, 0, w - 2 * STILE, 0.03, th + 0.012, { col: dark });
    panel(STILE + 0.03, 0.14, w - STILE - 0.03, yg0 - 0.08);
  } else {
    slab(0, 0, w, h);
    if (style === 'panels') {                                                  // two panels, three on a tall door (the chapel's)
      const x0 = STILE + 0.02, x1 = w - STILE - 0.02;
      if (h > 2.3) { panel(x0, 0.2, x1, h * 0.38); panel(x0, h * 0.43, x1, h * 0.68); panel(x0, h * 0.73, x1, h - 0.15); }
      else { panel(x0, 0.2, x1, h * 0.42); panel(x0, h * 0.5, x1, h - 0.15); }
    } else if (style === 'flush') panel(0.1, 0.1, w - 0.1, h - 0.1, 0.007);   // a room door: one routed rectangle
    else if (style === 'metal') panel(0.1, 0.1, w - 0.1, h - 0.1);
    else {                                                                     // planks: the V-grooves between the boards, on both faces
      const n = Math.max(3, Math.round(w / 0.14));
      for (let i = 1; i < n; i++) for (const side of [1, -1]) mb.box(mat, (w * i) / n, h / 2, side * (th / 2 + 0.002), 0.008, h - 0.04, 0.004, { col: dark, skip: [side > 0 ? 'nz' : 'pz'] });
    }
  }
  if (d.ext) {
    for (const side of [1, -1]) {                                              // street doors: hinge knuckles on the hinge edge and a kick plate
      for (const y of [0.25, h / 2, h - 0.25]) mb.box(mat, 0.015, y, side * (th / 2 + 0.006), 0.03, 0.09, 0.012, { col: [0.1, 0.1, 0.11] });
      if (style !== 'planks' && style !== 'metal') mb.box(mat, w / 2, 0.11, side * (th / 2 + 0.005), w - 0.16, 0.2, 0.006, { col: [0.33, 0.22, 0.07] });
    }
  }
  // handle + escutcheon on both faces, near the free end
  for (const side of [1, -1]) {
    mb.box(mat, w - 0.1, 0.98, side * (th / 2 + 0.03), 0.13, 0.025, 0.03, { col: [0.78, 0.66, 0.35] });
    mb.box(mat, w - 0.1, 0.98, side * (th / 2 + 0.005), 0.05, 0.14, 0.01, { col: [0.3, 0.26, 0.2] });
  }
  const grp = new THREE.Group();
  mb.flush(grp, ctx, { name: 'leaf:' + d.id, cast: false });
  return grp;
}

/** Create every leaf of the building, register interactables, and hook the door system (once per ctx). */
export function buildDoorLeaves(G) {
  const { ctx, bp, S, lot } = G;
  ctx.archDoors ??= new Map();
  const mkPose = (name) => {
    const g = new THREE.Group(); g.name = name; g.position.set(lot.x, lot.y, lot.z); g.rotation.y = lot.rotY;
    return g;
  };
  let poseExt = null, poseInt = null;
  for (const d of bp.doors) {
    if (d.kind === 'arch') continue;
    const kind = d.kind === 'shutter' ? 'shutter' : 'swing';
    const dir = d.wall.dir, at = d.wall.at, yk = d.floor * S.fh;
    let pose;
    if (d.ext || d.roof) pose = poseExt ??= mkPose(bp.id + '.leaves.ext');
    else pose = poseInt ??= mkPose(bp.id + '.leaves.int');
    let st;
    if (kind === 'shutter') {                                    // a shop door: one of six looks (shutters.js), each with its own way of opening
      const rig = makeShutterRig(ctx, G, d, G.shopLook());
      for (const pv of rig.pivots) pose.add(pv);
      rig.apply(0);
      st = { id: d.id, d, kind, rig, pivot: rig.pivots[0], noun: rig.noun, phi0: 0, dphi: 0, t: 0, target: 0, open: false, bid: bp.id, emit: null, geo: worldGeo(bp, d, yk) };
    } else {
      const c = dir === 'x' ? d.x : d.z, off = d.ext ? 0.04 : 0, ax = dir === 'x' ? [1, 0] : [0, 1], sn = d.swing === 1 ? [d.nx, d.nz] : [-d.nx, -d.nz];
      /** One hinged leaf: its pivot stands at the jamb `uh` (`left` = the jamb at the low end of the wall), the leaf swings to the side the door opens into. */
      const swingLeaf = (leaf, left, uh) => {
        const pivot = new THREE.Group(); pivot.name = 'door:' + d.id;
        pivot.add(leaf);
        const sg = left ? 1 : -1, phi0 = Math.atan2(-ax[1] * sg, ax[0] * sg), dphi = angDiff(phi0, Math.atan2(-sn[1], sn[0]));
        pivot.position.set(dir === 'x' ? uh : at + off * d.nx, yk, dir === 'x' ? at + off * d.nz : uh);
        pivot.rotation.y = phi0;
        pose.add(pivot);
        return { pivot, phi0, dphi };
      };
      if (d.double) {                                              // two leaves, each half the opening, hinged at the two jambs, opening together
        const hw = d.w / 2, A = swingLeaf(leafMesh(ctx, G, d, hw), true, c - hw), B = swingLeaf(leafMesh(ctx, G, d, hw), false, c + hw), leaves = [A, B];
        const rig = { pivots: [A.pivot, B.pivot], noun: 'puerta', apply: (e) => { for (const l of leaves) l.pivot.rotation.y = l.phi0 + l.dphi * e; } };
        st = { id: d.id, d, kind, rig, pivot: A.pivot, noun: 'puerta', phi0: A.phi0, dphi: A.dphi, t: 0, target: 0, open: false, bid: bp.id, emit: null, geo: worldGeo(bp, d, yk) };
      } else {
        const left = d.hinge === 'left', L = swingLeaf(leafMesh(ctx, G, d), left, left ? c - d.w / 2 : c + d.w / 2);
        st = { id: d.id, d, kind, pivot: L.pivot, noun: 'puerta', phi0: L.phi0, dphi: L.dphi, t: 0, target: 0, open: false, bid: bp.id, emit: null, geo: worldGeo(bp, d, yk) };
      }
    }
    ctx.archDoors.set(d.id, st);
    (ctx.archBakePending ??= new Set()).add(st);                // drawn from a shared static mesh while it stands closed (leafbake.js, at the system's first tick)
    // one target on each side of the leaf, 0.45 m off the wall plane: whoever stands there is closer to it than to anything behind the door
    for (const sd of [1, -1]) {
      const wp = bp.frame.toWorld(d.x + sd * d.nx * 0.45, yk + 1.05, d.z + sd * d.nz * 0.45);
      ctx.interact.register({
        id: 'door:' + d.id + (sd > 0 ? ':in' : ':out'), kind: 'door', x: wp[0], y: wp[1], z: wp[2], radius: 2.4, aim: 0.5, ignoreDoor: d.id, building: bp.id,
        prompt: () => (st.open ? 'Cerrar ' : 'Abrir ') + st.noun,
        use: () => toggle(ctx, st, 'player'),
      });
    }
  }
  if (poseExt) ctx.batch.object(bp.id + '.ext').add(poseExt);
  if (poseInt) ctx.batch.object(bp.id + '.int').add(poseInt);
  installSystem(ctx);
}

/** The door in world axes: centre on the wall plane, unit vectors along the wall (t) and across it (n), floor height, half opening. */
function worldGeo(bp, d, yk) {
  const fr = bp.frame, c = fr.toWorld(d.x, yk, d.z), ex = fr.toWorld(d.x + 1, yk, d.z), ez = fr.toWorld(d.x, yk, d.z + 1);
  const ux = [ex[0] - c[0], ex[2] - c[2]], uz = [ez[0] - c[0], ez[2] - c[2]];
  const [tx, tz] = d.wall.dir === 'x' ? ux : uz, [nx, nz] = d.wall.dir === 'x' ? uz : ux;
  return { cx: c[0], cz: c[2], y: c[1], tx, tz, nx, nz, hw: d.w / 2 };
}

const PUSH_T = 0.25;                                          // seconds of walking into a closed door before it gives way

/**
 * Push to open: a player who keeps walking into a closed door or shop shutter (centred in the opening, held by it) opens it after a beat.
 * Aiming and E still work; this is for the player who never finds the prompt, or whose aim is on the neighbour standing by the door
 * (a shopkeeper on the doorstep wins the aim, and the shutter is the shop's only way in). The physics clips the move at a wall instead
 * of flagging `blocked`, so "pushing" is read from the player's own numbers: the velocity that follows the held keys stays high while
 * the distance actually covered drops to nothing.
 */
function pushOpen(ctx, dt) {
  const P = ctx.player, s = P?.s, ps = ctx.archPush ??= { id: null, t: 0 };
  const v = P ? Math.hypot(P.vx ?? 0, P.vz ?? 0) : 0;
  if (!s || P.locked || v < 1.0 || (P.speed ?? 0) > 0.35) { ps.id = null; ps.t = 0; return; }
  const wx = P.vx / v, wz = P.vz / v;
  let hit = null;
  for (const st of ctx.archDoors.values()) {
    if (st.open) continue;
    const g = st.geo, rx = s.x - g.cx, rz = s.z - g.cz;
    if (rx * rx + rz * rz > 6.0 || Math.abs(s.y - g.y) > 0.8) continue;           // cheap reject (a wide shutter's edge is 1.6 m from its centre)
    const across = rx * g.nx + rz * g.nz, along = rx * g.tx + rz * g.tz;
    if (Math.abs(across) > 0.55 || Math.abs(along) > g.hw) continue;
    if (-Math.sign(across) * (wx * g.nx + wz * g.nz) < 0.6) continue;      // not heading into the door
    hit = st; break;
  }
  if (!hit) { ps.id = null; ps.t = 0; return; }
  if (ps.id !== hit.id) { ps.id = hit.id; ps.t = 0; }
  if ((ps.t += dt) >= PUSH_T) { ps.id = null; ps.t = 0; toggle(ctx, hit, 'player'); }
}

/** True when the player stands too close to the door line to close it safely. */
function blockedByPlayer(ctx, st) {
  const p = ctx.player?.s, bp = ctx.buildings.get(st.bid);
  if (!p || !bp) return false;
  const l = bp.frame.toLocal(p.x, p.y, p.z), d = st.d, dir = d.wall.dir;
  const along = dir === 'x' ? l[0] : l[2], across = dir === 'x' ? l[2] : l[0];
  const c = dir === 'x' ? d.x : d.z;
  return Math.abs(along - c) < d.w / 2 + 0.25 && Math.abs(across - d.wall.at) < 0.5 && Math.abs(l[1] - d.floor * bp.shell.fh) < 1.0;
}

function toggle(ctx, st, by) {
  const ph = ctx.physics, open = !ph.doorOpen(st.id);
  if (!open && st.kind !== 'shutter' && blockedByPlayer(ctx, st)) return;
  ph.setDoor(st.id, open);
  st.open = open; st.target = open ? 1 : 0; st.emit = null;
  wake(ctx, st);
  ctx.events.emit('door:toggle', { doorId: st.id, open, by });
}

/** A door starts to move: the system animates it, and its live leaf takes over from the baked copy (leafbake.js). */
function wake(ctx, st) {
  ctx.archDoorsActive.add(st);
  hideBaked(st);
}

function installSystem(ctx) {
  if (ctx.archDoorsActive) return;
  ctx.archDoorsActive = new Set();
  ctx.events.on('door:request', (e) => {
    const st = ctx.archDoors.get(e?.doorId); if (!st) return;
    const open = !!e.open;
    if (st.open === open && ctx.physics.doorOpen(st.id) === open) return;
    ctx.physics.setDoor(st.id, open);                           // idempotent: NPC code sets the collider too
    st.open = open; st.target = open ? 1 : 0; st.emit = { by: e.by ?? 'npc' };
    wake(ctx, st);
  });
  ctx.addSystem('arch-doors', (dt) => {
    const ph = ctx.physics;
    if (ctx.archBakePending?.size) bakeLeaves(ctx);              // once every building is built and merged: closed leaves become a few static meshes
    pushOpen(ctx, dt);
    // follow the physics state (a collider flipped by anyone else still swings the leaf)
    for (const st of ctx.archDoors.values()) {
      const open = ph.doorOpen(st.id);
      if (open !== st.open) { st.open = open; st.target = open ? 1 : 0; st.emit = { by: 'sim' }; wake(ctx, st); }
    }
    for (const st of ctx.archDoorsActive) {
      const step = dt / SWING_T;
      st.t = st.target > st.t ? Math.min(st.target, st.t + step) : Math.max(st.target, st.t - step);
      const e = smooth(st.t);
      if (st.rig) st.rig.apply(e);
      else st.pivot.rotation.y = st.phi0 + st.dphi * e;
      if (st.t === st.target) {
        ctx.archDoorsActive.delete(st);
        if (st.t === 0 && !st.open) showBaked(st);               // settled closed: the baked copy is drawn again
        if (st.emit) { ctx.events.emit('door:toggle', { doorId: st.id, open: st.open, by: st.emit.by }); st.emit = null; }
      }
    }
  }, 12);
}
