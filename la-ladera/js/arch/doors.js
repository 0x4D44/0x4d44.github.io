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
    const wp = bp.frame.toWorld(d.x, yk + 1.05, d.z);
    const st = { id: d.id, d, kind, pivot, phi0, dphi, t: 0, target: 0, open: false, bid: bp.id, emit: null };
    ctx.archDoors.set(d.id, st);
    ctx.interact.register({
      id: 'door:' + d.id, kind: 'door', x: wp[0], y: wp[1], z: wp[2], radius: 2.4, aim: 0.5, ignoreDoor: d.id, building: bp.id,
      prompt: () => (st.open ? (kind === 'shutter' ? 'Cerrar persiana' : 'Cerrar puerta') : (kind === 'shutter' ? 'Abrir persiana' : 'Abrir puerta')),
      use: () => toggle(ctx, st, 'player'),
    });
  }
  if (poseExt) ctx.batch.object(bp.id + '.ext').add(poseExt);
  if (poseInt) ctx.batch.object(bp.id + '.int').add(poseInt);
  installSystem(ctx);
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
