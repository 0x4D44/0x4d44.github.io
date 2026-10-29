// Live door leaves: one Object3D per leaf (hinge pivot), a 0.35 s swing that follows the physics collider (`ctx.physics.doorOpen`),
// 'Abrir puerta' / 'Cerrar puerta' interactables, and the `door:request` listener NPCs use (CONTRACT 5.5, REQUESTS A4 -> A2).
// Shop shutters (kind 'shutter') roll up instead of swinging. Interior leaves hang under the building's `.int` group so the engine's
// visibility budget hides them with the rest of the interior; exterior leaves are part of `.ext`.
import * as THREE from 'three';
import { MeshBuilder } from '../core/mesh.js';
import { lin, mulc, mixc, hash01 } from './mb.js';
import { angDiff, smooth } from '../core/util.js';

export const SWING_T = 0.35;
const INTERIOR_COLS = [0xe9e1cf, 0xa9794b, 0x6f9a86, 0xd7a85a, 0x8aa0b4, 0xf2efe6, 0x8b6b4a, 0xc9b79a];

function leafMesh(ctx, G, d, kind) {
  const mb = new MeshBuilder();
  const w = d.w, h = d.h, th = kind === 'shutter' ? 0.04 : 0.045;
  const hv = (n) => hash01(d.id, n);
  const fs = G.fs;
  let col;
  if (kind === 'shutter') col = [0.85, 0.87, 0.88];
  else if (d.mat === 'door_metal') col = mixc(fs.metal, [0.75, 0.8, 0.84], 0.55);
  else if (d.ext) col = fs.door;
  else col = lin(INTERIOR_COLS[Math.floor(hv(1) * INTERIOR_COLS.length)]);
  const mat = kind === 'shutter' ? 'shutter_steel' : d.mat === 'door_metal' ? 'door_metal' : 'door_wood';
  if (kind === 'shutter') {
    mb.box(mat, 0, -h / 2, 0, w, h, th, { col });
    mb.box(mat, 0, -h + 0.04, th * 0.7, w, 0.08, 0.04, { col: mulc(col, 0.55) });         // bottom bar
    mb.box(mat, w * 0.25, -h * 0.5, th * 0.9, 0.05, 0.05, 0.05, { col: [0.1, 0.1, 0.1] }); // lock
  } else {
    mb.box(mat, w / 2, h / 2, 0, w, h, th, { col });
    const pc = mulc(col, 0.86), pd = 0.011;
    const panels = d.mat === 'door_metal' ? [[0.1, 0.1, w - 0.1, h - 0.1]] : [[0.13, 0.13, w - 0.13, h * 0.42], [0.13, h * 0.5, w - 0.13, h - 0.17]];
    for (const [x0, y0, x1, y1] of panels) for (const side of [1, -1]) {
      mb.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, side * (th / 2 + pd / 2), x1 - x0, y1 - y0, pd, { col: pc, skip: [side > 0 ? 'nz' : 'pz'] });
    }
    // handle + escutcheon on both faces, near the free end
    for (const side of [1, -1]) {
      mb.box(mat, w - 0.1, 0.98, side * (th / 2 + 0.03), 0.13, 0.025, 0.03, { col: [0.78, 0.66, 0.35] });
      mb.box(mat, w - 0.1, 0.98, side * (th / 2 + 0.005), 0.05, 0.14, 0.01, { col: [0.3, 0.26, 0.2] });
    }
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
    const dir = d.wall.dir, at = d.wall.at, t = d.wall.t, yk = d.floor * S.fh;
    const leaf = leafMesh(ctx, G, d, kind);
    const pivot = new THREE.Group(); pivot.name = 'door:' + d.id;
    pivot.add(leaf);
    const c = dir === 'x' ? d.x : d.z;
    let phi0, dphi = 0, px, pz, py = yk;
    if (kind === 'shutter') {
      const s = d.side === 'front' || d.side === 'right' ? 1 : -1;
      const pl = at + s * (t / 2 - 0.07);
      py = yk + d.h;
      px = dir === 'x' ? c : pl; pz = dir === 'x' ? pl : c;
      phi0 = dir === 'x' ? 0 : -Math.PI / 2;
    } else {
      const left = d.hinge === 'left';
      const uh = left ? c - d.w / 2 : c + d.w / 2;
      const off = d.ext ? 0.04 : 0;
      px = dir === 'x' ? uh : at + off * d.nx; pz = dir === 'x' ? at + off * d.nz : uh;
      const ax = dir === 'x' ? [1, 0] : [0, 1], sg = left ? 1 : -1;
      const dx = ax[0] * sg, dz = ax[1] * sg;
      phi0 = Math.atan2(-dz, dx);
      const sn = d.swing === 1 ? [d.nx, d.nz] : [-d.nx, -d.nz];
      dphi = angDiff(phi0, Math.atan2(-sn[1], sn[0]));
    }
    pivot.position.set(px, py, pz);
    pivot.rotation.y = phi0;
    let pose;
    if (d.ext || d.roof) pose = poseExt ??= mkPose(bp.id + '.leaves.ext');
    else pose = poseInt ??= mkPose(bp.id + '.leaves.int');
    pose.add(pivot);
    const st = { id: d.id, d, kind, pivot, phi0, dphi, t: 0, target: 0, open: false, bid: bp.id, emit: null, geo: worldGeo(bp, d, yk) };
    ctx.archDoors.set(d.id, st);
    // one target on each side of the leaf, 0.45 m off the wall plane: whoever stands there is closer to it than to anything behind the door
    for (const sd of [1, -1]) {
      const wp = bp.frame.toWorld(d.x + sd * d.nx * 0.45, yk + 1.05, d.z + sd * d.nz * 0.45);
      ctx.interact.register({
        id: 'door:' + d.id + (sd > 0 ? ':in' : ':out'), kind: 'door', x: wp[0], y: wp[1], z: wp[2], radius: 2.4, aim: 0.5, ignoreDoor: d.id, building: bp.id,
        prompt: () => (st.open ? (kind === 'shutter' ? 'Cerrar persiana' : 'Cerrar puerta') : (kind === 'shutter' ? 'Abrir persiana' : 'Abrir puerta')),
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
 * Push to open: a player who keeps walking into a closed swing door (centred in the opening, held by it) opens it after a beat.
 * Aiming and E still work; this is for the player who never finds the prompt, or whose aim is on the neighbour standing by the door.
 * Shop shutters never open this way. The physics clips the move at a wall instead of flagging `blocked`, so "pushing" is read from the
 * player's own numbers: the velocity that follows the held keys stays high while the distance actually covered drops to nothing.
 */
function pushOpen(ctx, dt) {
  const P = ctx.player, s = P?.s, ps = ctx.archPush ??= { id: null, t: 0 };
  const v = P ? Math.hypot(P.vx ?? 0, P.vz ?? 0) : 0;
  if (!s || P.locked || v < 1.0 || (P.speed ?? 0) > 0.35) { ps.id = null; ps.t = 0; return; }
  const wx = P.vx / v, wz = P.vz / v;
  let hit = null;
  for (const st of ctx.archDoors.values()) {
    if (st.kind !== 'swing' || st.open) continue;
    const g = st.geo, rx = s.x - g.cx, rz = s.z - g.cz;
    if (rx * rx + rz * rz > 1.0 || Math.abs(s.y - g.y) > 0.8) continue;
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
  ctx.archDoorsActive.add(st);
  ctx.events.emit('door:toggle', { doorId: st.id, open, by });
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
    ctx.archDoorsActive.add(st);
  });
  ctx.addSystem('arch-doors', (dt) => {
    const ph = ctx.physics;
    pushOpen(ctx, dt);
    // follow the physics state (a collider flipped by anyone else still swings the leaf)
    for (const st of ctx.archDoors.values()) {
      const open = ph.doorOpen(st.id);
      if (open !== st.open) { st.open = open; st.target = open ? 1 : 0; st.emit = { by: 'sim' }; ctx.archDoorsActive.add(st); }
    }
    for (const st of ctx.archDoorsActive) {
      const step = dt / SWING_T;
      st.t = st.target > st.t ? Math.min(st.target, st.t + step) : Math.max(st.target, st.t - step);
      const e = smooth(st.t);
      if (st.kind === 'shutter') { st.pivot.scale.y = 1 - 0.88 * e; }
      else st.pivot.rotation.y = st.phi0 + st.dphi * e;
      if (st.t === st.target) {
        ctx.archDoorsActive.delete(st);
        if (st.emit) { ctx.events.emit('door:toggle', { doorId: st.id, open: st.open, by: st.emit.by }); st.emit = null; }
      }
    }
  }, 12);
}
