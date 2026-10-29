// Room finishes for buildBuilding: A3's `room.finish` (matKeys, optional tints) wins; anything missing falls back to a believable default
// per room type. Tints become vertex colours (see mb.js `splitKey`) so one material = one mesh however many paint colours exist.
import { lin, mulc, splitKey, hash01 } from './mb.js';

// Interior paint: saturated-but-chalky mid-tones of the world bible (cream, peach, mint, sky, lilac, butter, whitewash, salmon).
const WALL_TINTS = [0xf1e4c8, 0xf3d9c4, 0xc9e2d0, 0xcfe0ee, 0xe6d6ea, 0xf4e8a6, 0xf6f1e6, 0xeec0ae, 0xbfd8c6, 0xf0cf9c];

const DEFAULTS = {
  living: { floor: 'tile_terracotta', wall: 'plaster_a', dado: 0.9 },
  dining: { floor: 'tile_terracotta', wall: 'plaster_a', dado: 0.9 },
  bedroom: { floor: 'cement_screed', wall: 'plaster_a', dado: 0 },
  kitchen: { floor: 'tile_ceramic_checker', wall: 'plaster_a', wainscot: 'tile_ceramic_checker', dado: 1.2 },
  bathroom: { floor: 'tile_ceramic_checker', wall: 'plaster_a', wainscot: 'tile_ceramic_checker', dado: 1.6 },
  laundry: { floor: 'cement_screed', wall: 'plaster_rough', dado: 0 },
  hall: { floor: 'cement_screed', wall: 'plaster_a', dado: 0.9 },
  corridor: { floor: 'cement_screed', wall: 'plaster_a', dado: 0.9 },
  entry: { floor: 'tile_terracotta', wall: 'plaster_a', dado: 0.9 },
  stairwell: { floor: 'cement_screed', wall: 'plaster_rough', dado: 1.0, plain: true },
  landing: { floor: 'cement_screed', wall: 'plaster_rough', dado: 1.0, plain: true },
  shop: { floor: 'tile_ceramic_checker', wall: 'plaster_a', dado: 0 },
  backroom: { floor: 'cement_screed', wall: 'plaster_rough', dado: 0 },
  workshop: { floor: 'cement_screed', wall: 'plaster_rough', dado: 0 },
  garage: { floor: 'cement_screed', wall: 'plaster_rough', dado: 0 },
  office: { floor: 'tile_ceramic_checker', wall: 'plaster_a', dado: 0 },
  classroom: { floor: 'tile_ceramic_checker', wall: 'plaster_a', dado: 1.1 },
  chapel: { floor: 'tile_terracotta', wall: 'plaster_a', dado: 0 },
  patio: { floor: 'cement_screed', wall: 'plaster_rough', dado: 0 },
  terrace: { floor: 'roof_terrace', wall: 'plaster_rough', dado: 0 },
  balcony: { floor: 'cement_screed', wall: 'plaster_rough', dado: 0 },
};

const num = (v) => (v == null ? null : typeof v === 'string' ? lin(parseInt(v.replace('#', ''), 16)) : Array.isArray(v) ? v : lin(v));

/**
 * Resolve the finish of a room into plain drawing instructions:
 * { floor:{m,c}, wall:{m,c}, dado:{m,c,h}|null, ceiling:{m,c}, base:{m,c} } where m = material name (no tint) and c = linear rgb multiplier.
 */
export function roomFinish(room, bp) {
  const def = DEFAULTS[room.type] ?? DEFAULTS.hall, f = room.finish ?? {};
  const h = hash01(room.id, 3);
  const out = {};
  // floor
  const fk = splitKey(f.floor ?? def.floor);
  out.floor = { m: fk.name, c: num(f.floorTint) ?? fk.tint ?? [1, 1, 1] };
  // walls: a default paint colour per room unless A3 said otherwise
  const wk = splitKey(f.wall ?? def.wall);
  let wc = num(f.wallTint) ?? wk.tint;
  if (!wc) wc = def.plain ? lin(0xd8d2c4) : lin(WALL_TINTS[Math.floor(h * WALL_TINTS.length) % WALL_TINTS.length]);
  out.wall = { m: wk.name, c: wc };
  // dado / wainscot
  if (f.wainscot !== undefined) {
    if (f.wainscot) { const dk = splitKey(f.wainscot.mat ?? f.wainscot); out.dado = { m: dk.name, c: dk.tint ?? [1, 1, 1], h: f.wainscot.h ?? 1.0 }; } else out.dado = null;
  } else if (def.dado) {
    if (def.wainscot) out.dado = { m: def.wainscot, c: lin(h < 0.5 ? 0xe8e4da : 0xcfe3e8), h: def.dado };
    else out.dado = { m: wk.name, c: mulc(wc, def.plain ? 0.72 : 0.62), h: def.dado };
  } else out.dado = null;
  // ceiling
  const ck = splitKey(f.ceiling ?? 'plaster_a#f4f0e6');
  out.ceiling = { m: ck.name, c: ck.tint ?? lin(0xf4f0e6) };
  // skirting strip at the foot of the wall (dark, hard-wearing)
  const bk = splitKey(f.baseboard ?? 'cement_screed');
  out.base = { m: bk.name, c: bk.tint ?? lin(0x8a847a), h: 0.1 };
  return out;
}

/** Facade colours/materials for the building (exterior faces). */
export function facadeStyle(bp) {
  const L = bp.look;
  const m = L.base === 'brick' ? 'brick_clay_hollow' : L.base === 'rough' ? 'plaster_rough' : L.base === 'peeling' ? 'paint_peeling_soft' : 'plaster_a';
  const wall = L.base === 'brick' ? lin(0xe0d2c8) : lin(parseInt(L.wall, 16));
  return { m, wall, trim: lin(parseInt(L.trim, 16)), roof: lin(parseInt(L.roof, 16)), door: lin(parseInt(L.door, 16)), metal: lin(parseInt(L.metal, 16)), brick: L.base === 'brick' };
}
