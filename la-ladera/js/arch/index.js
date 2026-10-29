// STUB - owner: ARCHITECTURE agent (A2). Replace entirely; keep the two exports and the BuildingPlan shape in dev/CONTRACT.md.
import { makeFrame } from '../core/frame.js';
import { wallsRect, floorRect } from '../core/physics.js';

/** PURE DATA. lot -> BuildingPlan (rooms, doors, stairs, colliders...). No meshes here. */
export function planBuilding(ctx, lot) {
  const frame = makeFrame(lot.x, lot.y, lot.z, lot.rotY), H = lot.floors * lot.fh;
  const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), hw = lot.w / 2, hd = lot.d / 2;
  const footprint = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [lot.x + x * c + z * s, lot.z - x * s + z * c]);
  const xs = footprint.map((p) => p[0]), zs = footprint.map((p) => p[1]);
  return {
    id: lot.id, lot, frame, footprint,
    bounds: { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: lot.y, y1: lot.y + H },
    floors: [], rooms: [], doors: [], windows: [], stairs: [], anchors: [], entrances: [],
    colliders: { walls: wallsRect(lot.x, lot.z, lot.w, lot.d, lot.rotY, lot.y, lot.y + H, 0.11), floors: [floorRect(lot.x, lot.z, lot.w, lot.d, lot.rotY, lot.y)] },
  };
}

/** MESHES. Exterior + shell into ctx.batch groups `${bp.id}.ext` / `${bp.id}.int`, doors as live objects + interactables. */
export function buildBuilding(ctx, bp) {
  const { lot } = bp, b = ctx.batch.builder(bp.id + '.ext');
  const tint = [0xd9a441, 0xc8573c, 0xe08aa0, 0x3a7ca5, 0x6fae8f][lot.seed % 5].toString(16).padStart(6, '0');
  b.setBasePose(lot.x, lot.y, lot.z, lot.rotY);
  b.box('plaster_a#' + tint, 0, (lot.floors * lot.fh) / 2, 0, lot.w, lot.floors * lot.fh, lot.d);
  ctx.batch.flush(bp.id + '.ext');
}
