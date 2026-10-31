// What hangs on the walls, chosen so that no two rooms of a kind read as copies of one another (the lead's R4 list, 'decor sameness'):
//   art(L, E, pool, walls, o)   one decal of a POOL that no wall of THIS BUILDING shows yet: a house never hangs the same picture twice, and a pool that is used up hangs nothing
//   clock / mirror / notice     things that come in ones (a clock, a mirror, the 'se arrienda' sign) go to a limited share of the rooms of each type
// The share is a hash of the building, the room and the thing (`ration`), not a tally over the barrio: a building furnishes the same whatever else was furnished before it
// (interiors-data.test.mjs), and over a hundred rooms or more the hash lands within a few points of its cap.
import { decalDef, decalIds } from './decals.js';
import { makeRng, hashStr } from '../core/rng.js';

const ids = (prefix) => decalIds.filter((id) => id.startsWith(prefix));
export const POOLS = {
  art: ['picture_landscape', 'picture_coast', 'picture_flowers', ...ids('art_')],
  family: ['photo_family_a', 'photo_family_b', 'photo_wedding', 'photo_grad', 'photo_collage', ...ids('photo_fam_')],
  faithPic: ['picture_virgin', 'picture_heart', 'picture_saint', 'picture_nino', 'picture_chiqui'],
  blessing: ['blessing', ...ids('blessing_')],
  cal: ['calendar_pharma', 'calendar_church', 'calendar_tienda', ...ids('calendar_').filter((id) => !['calendar_pharma', 'calendar_church', 'calendar_tienda'].includes(id))],
  kids: ['kids_drawing_a', 'kids_drawing_b', ...ids('kids_draw_')],
  sport: ids('poster_football_'),
  music: ['poster_music', 'poster_music_2'],
  notice: ['notice_dog', 'notice_agua', 'notice_junta', 'notice_basura'],
};
POOLS.faith = [...POOLS.faithPic, ...POOLS.blessing];

/** May this room take one `key`? About `cap` of all rooms may: the answer is fixed by the building, the room and the key alone. */
export const ration = (E, L, key, cap) => makeRng(hashStr(`${E.bp?.id ?? ''}|${L.room.id ?? ''}|${key}`)).next() < cap;
/** Shops, offices and classrooms keep their clock as a matter of course; a home's room takes one in four. */
const capOf = (L) => (L.room.type === 'shop' || L.room.type === 'office' || L.room.type === 'classroom' || L.room.type === 'backroom' ? 0.6 : 0.25);

/** Does a calendar already hang in this room? */
const hasCalendar = (L) => L.items.some((i) => i.name.startsWith('decal:calendar_'));

/** One decal of `pool` (a POOLS name or a list of ids) that no wall of this building shows yet, on `walls`; null when the pool is used up or nothing fits.
 *  A decal that fits nowhere is not marked as used. `E.used` is the building's set. `o.cap` limits the decal to that share of the rooms of the type (the chore chart, the diploma). */
export function art(L, E, pool, walls = 'any', o = {}) {
  const { cap, ...ho } = o, list = typeof pool === 'string' ? POOLS[pool] : pool, used = (E.used ??= new Set());
  const calendar = hasCalendar(L);                                                                    // a room hangs one calendar: the kitchen's second one, beside the first, was the shop's giveaway twice over (R4-109)
  const order = L.rng.shuffle(list.filter((id) => !used.has(id) && !(calendar && id.startsWith('calendar_')) && (cap == null || ration(E, L, 'art:' + id, cap))));
  for (let k = 0; k < Math.min(order.length, 3); k++) {
    const id = order[k], it = L.hang('decal:' + id, walls, { def: decalDef(id), ...ho });
    if (it) { used.add(id); return it; }
  }
  return null;
}
/** A shop's own decal (its trade's calendar): the one it hands out, unless this building already shows it (the keeper's home upstairs), then any calendar. */
export function own(L, E, id, walls = 'any', o = {}) {
  const used = (E.used ??= new Set());
  if (!used.has(id)) { const it = L.hang('decal:' + id, walls, { def: decalDef(id), ...o }); if (it) { used.add(id); return it; } }
  return art(L, E, 'cal', walls, o);
}
/** The wall clock: one per room, never in a bathroom, and in a limited share of the rooms of a type. */
export function clock(L, E, walls = 'any', o = {}) {
  if (L.room.type === 'bathroom' || L.items.some((i) => i.name === 'clock_wall')) return null;
  if (!ration(E, L, 'clock', capOf(L))) return null;
  return L.hang('clock_wall', walls, o);
}
/** The wall mirror: one per room, in a limited share of the rooms of a type. */
export function mirror(L, E, walls = 'any', o = {}) {
  if (L.items.some((i) => i.name === 'mirror_wall')) return null;
  if (!ration(E, L, 'mirror', 0.25)) return null;
  return L.hang('mirror_wall', walls, o);
}
/** A notice for a stair or a landing: 'se arrienda' for one room in eight, otherwise one of the others (lost dog, no water, the junta's meeting, the rubbish days). */
export function notice(L, E, walls = 'any', o = {}) {
  if (ration(E, L, 'rent', 0.1) && !(E.used ??= new Set()).has('notice_rent')) {
    const it = L.hang('decal:notice_rent', walls, { def: decalDef('notice_rent'), ...o });
    if (it) { E.used.add('notice_rent'); return it; }
  }
  return art(L, E, 'notice', walls, o);
}
