// planBuilding: lot -> BuildingPlan (PURE DATA, see dev/CONTRACT.md 5.2 / 5.3).
import { PALETTE } from '../core/config.js';
import { PlanState } from './state.js';
import { LAYOUTS, layoutHouse } from './layouts.js';
import { resolveRoof, planRoof } from './roof.js';
import { genWindows } from './openings.js';
import { deriveWalls } from './walls.js';
import { buildColliders } from './colliders.js';
import { planSteps } from './steps.js';
import { clamp, round2 } from './geom.js';

const hex = (n) => n.toString(16).padStart(6, '0');

/** Facade look chosen once per building (deterministic from lot.seed). */
function chooseLook(S) {
  const rng = S.rng.fork('look'), st = S.lot.style ?? {};
  const wall = st.palette ?? rng.pick(PALETTE.facade);
  let trim = rng.pick(PALETTE.trim);
  if (trim === wall) trim = 0xf2efe6;
  const roof = rng.pick(PALETTE.roof);
  const kind = S.kind;
  const base = kind === 'unfinished' ? 'brick' : rng.weighted([['plaster', 6], ['brick', 1.2], ['rough', 1.4], ['peeling', 1.2]], (e) => e[1])[0];
  return {
    wall: hex(wall), trim: hex(trim), roof: hex(roof), base,
    door: hex(rng.pick([0x3b7a9a, 0x8a5a34, 0x23858a, 0xb23a36, 0x4a8a56, 0x6b4a32, 0x2f62a8, 0xc9923a, 0x7a3b6b, 0xd9d2c0])),
    metal: hex(rng.pick([0x1d1d1f, 0x1f3a2a, 0x3b2a1a, 0x20323f])),
    stainy: rng.range(0.6, 1.0), seed: (S.lot.seed ?? 1) >>> 0,
  };
}

function footprintOf(S) {
  const { W, D } = S, fr = S.frame;
  return [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]].map(([x, z]) => { const p = fr.toWorld(x, 0, z); return [p[0], p[2]]; });
}

function foundationDepth(S) {
  const ph = S.ctx.plan?.heightAt, lot = S.lot;
  if (!ph) return -0.5;
  let lo = lot.y - 0.3;
  const m = 0.5, o = S.outer, fr = S.frame;
  const pts = [];
  for (let x = o.x0 - m; x <= o.x1 + m + 1e-6; x += 1.0) { pts.push([x, o.z0 - m], [x, o.z1 + m]); }
  for (let z = o.z0 - m; z <= o.z1 + m + 1e-6; z += 1.0) { pts.push([o.x0 - m, z], [o.x1 + m, z]); }
  for (const [x, z] of pts) { const p = fr.toWorld(x, 0, z), h = ph(p[0], p[2]); if (Number.isFinite(h) && h < lo) lo = h; }
  return clamp(lo - 0.2 - lot.y, -9, -0.35);
}

function makeEntrances(S, ctx) {
  const fr = S.frame, ph = S.ctx.plan?.heightAt, out = [];
  const order = { shop: 0, main: 1, alley: 2, service: 3, roof: 4 };
  const doors = S.doors.filter((d) => d.ext || d.roof).sort((a, b) => (order[a.entrance] ?? 5) - (order[b.entrance] ?? 5));
  const shopFirst = S.kind === 'shophouse' || S.kind === 'cornerstore';
  if (!shopFirst) doors.sort((a, b) => (a.entrance === 'main' ? 0 : 1) - (b.entrance === 'main' ? 0 : 1) || (order[a.entrance] ?? 5) - (order[b.entrance] ?? 5));
  doors.forEach((d, i) => {
    const t = S.te / 2 + 1.2;
    const o = fr.toWorld(d.x - d.nx * t, d.y, d.z - d.nz * t), n = fr.toWorld(d.x + d.nx * 1.0, d.y, d.z + d.nz * 1.0);
    const dir = fr.dir(-d.nx, -d.nz), ry = Math.atan2(dir[0], dir[1]);
    const yOut = ph ? ph(o[0], o[2]) : S.lot.y;
    out.push({ id: `${S.lot.id}.e${i}`, doorId: d.id, kind: d.entrance ?? 'main', outside: [round2(o[0]), round2(Number.isFinite(yOut) ? yOut : S.lot.y), round2(o[2])], inside: [round2(n[0]), round2(n[1]), round2(n[2])], yawIn: ry, ry });
  });
  return out;
}

export function planBuilding(ctx, lot) {
  const S = new PlanState(ctx, lot);
  resolveRoof(S);
  (LAYOUTS[S.kind] ?? layoutHouse)(S);
  S.foundY = foundationDepth(S);
  if (S.core?.guards) S.guards.push(...S.core.guards);
  genWindows(S);
  deriveWalls(S);
  planRoof(S);
  planSteps(S);
  const colliders = buildColliders(S);
  const fr = S.frame, fp = footprintOf(S);
  const xs = fp.map((p) => p[0]), zs = fp.map((p) => p[1]);
  const topExtra = S.roofStyle === 'terrace' ? 3.2 : S.roofStyle === 'unfinished' ? 2.5 : S.fh * 0.7;
  const floors = S.floorsData.slice(0, S.F).map((f) => ({ index: f.index, y: f.y, h: f.h, rooms: f.rooms.slice(), voids: f.voids.map((v) => ({ ...v.rect, owner: v.owner })), open: !!f.open }));
  if (S.roofLayer?.walkable && !S.openTop) floors.push({ index: S.F, y: S.F * S.fh, h: 3.0, rooms: S.floorsData[S.F].rooms.slice(), voids: S.floorsData[S.F].voids.map((v) => ({ ...v.rect, owner: v.owner })), roof: true });
  const stairs = (S.core?.stairs ?? []).map((s, i) => ({ id: `${lot.id}.s${i}`, ...s }));
  const roofY = S.openTop ? (S.F - 1) * S.fh : S.F * S.fh;
  const bp = {
    id: lot.id, lot, frame: fr, footprint: fp,
    bounds: { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: lot.y + S.foundY, y1: lot.y + S.F * S.fh + topExtra },
    floors, rooms: S.rooms, doors: S.doors, windows: S.windows, stairs, entrances: makeEntrances(S, ctx),
    colliders, anchors: [], furniture: [], lights: [],
    roof: { walkable: !!S.roofWalkable, poly: fp, y: lot.y + roofY, style: S.roofStyle, rooms: S.roofLayer?.terraceRooms ?? [] },
    look: chooseLook(S),
    shell: {
      kind: S.kind, F: S.F, fh: S.fh, h: S.h, slab: S.slab, W: S.W, D: S.D, te: S.te, ti: S.ti, outer: S.outer, inner: S.inner, party: S.party,
      walls: S.walls, core: S.core, roofLayer: S.roofLayer, roofStyle: S.roofStyle, roofWalkable: S.roofWalkable, openTop: S.openTop,
      guards: S.guards, foundY: S.foundY, floorsData: S.floorsData, notes: S.notes, steps: S.steps,
    },
  };
  return bp;
}
