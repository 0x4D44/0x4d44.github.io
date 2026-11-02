// INTERIORS (A3, round 6 R4-306): what stands on a wall shelf. The 442 `shelf_wall` of the barrio were a bare board over two brackets; every one now carries one to three small things of the
// furniture library, chosen by the room it hangs in and the household that lives there (a kitchen's jars and bottles, a living room's photographs, a plant in a tin, a statue of the Virgin in a
// home with an altar, the cup of a football fan, a doll in a home with children). Pure data, like the clothes (garments.js): it runs after every room is furnished and the garments are out, from its
// own streams, so nothing that was placed before moves.
import { CATALOG } from './catalog.js';
import { obbOverlap } from './layout.js';
import { estimateTris, LIMITS } from './garments.js';

/** The geometry of the library model, measured on it (tests/interiors-shelves.test.mjs): the board's top is 25 mm over the shelf's bottom (catalog.js `topAdd`), and a bracket 25 mm square rises
 *  at each end of its back, its inner edge 0.3025 m from the middle of a 0.9 m shelf (the model is stretched with the shelf: a bathroom's 0.5 m one has them at 0.168 m). The board is clear
 *  between them: `bay` is that clear half-width as a share of the shelf's width. `margin`: kept off a bracket; `gap`: between two things. */
export const SHELF = { bay: 0.3025 / 0.9, margin: 0.015, gap: 0.03 };

/** [catalogue key, weight, depth (-1: against the wall, the thin ones)]. Small `top` pieces of the furniture library, none of them a light (a candle or a lamp is a record of its own: index.js emitLights). */
const KIND = {
  kitchen: [['bottles_group', 5], ['plant_tin', 3], ['knickknacks', 1], ['photo_frames', 1, -1]],
  bathroom: [['bottles_group', 5], ['plant_tin', 2], ['vase_flowers', 1]],
  utility: [['bottles_group', 4], ['plant_tin', 2], ['knickknacks', 1]],
  study: [['books_stack', 5], ['photo_frames', 2, -1], ['plant_tin', 1], ['knickknacks', 1]],
  chapel: [['statue_virgin', 4], ['vase_flowers', 3], ['photo_frames', 1, -1]],
  bedroom: [['photo_frames', 4, -1], ['books_stack', 2], ['plant_tin', 2], ['vase_flowers', 1], ['knickknacks', 1]],
  living: [['photo_frames', 4, -1], ['books_stack', 2], ['plant_tin', 3], ['vase_flowers', 3], ['knickknacks', 3]],
};
const KIND_OF = {
  kitchen: 'kitchen', bathroom: 'bathroom', laundry: 'utility', garage: 'utility', workshop: 'utility', patio: 'utility', terrace: 'utility', balcony: 'utility', backroom: 'utility',
  office: 'study', classroom: 'study', chapel: 'chapel', bedroom: 'bedroom',
};
/** What the room's shelf may carry: the kind of room's list, and what this household adds (an altar, a football team, children, a hobby), in the rooms where people keep their keepsakes. */
export function shelfPool(type, hh) {
  const kind = KIND_OF[type] ?? 'living', pool = [...KIND[kind]];
  if (kind === 'living' || kind === 'bedroom') {
    if (hh?.altar) pool.push(['statue_virgin', 3]);
    if (hh?.hobby === 'football') pool.push(['trophy_football', 3]);
    if (hh?.kids) pool.push(['doll', 2]);
    if (hh?.hobby === 'reading') pool.push(['books_stack', 3]);
    if (hh?.hobby === 'plants') pool.push(['plant_tin', 3]);
  }
  return pool;
}

const trisOf = (E, key) => E.ctx?.assets?.meta?.(key)?.triangles ?? 260;
/** The thing stands under the ceiling, and clear of what hangs over its shelf and of any window over it (a picture hung right over the shelf, a thing 0.4 m tall in front of it). */
function headroom(L, shelf, key) {
  const slot = shelf.h ?? CATALOG.shelf_wall.size[1], y = shelf.y - (L.room.y ?? 0), top = y + CATALOG.shelf_wall.size[1] + CATALOG.shelf_wall.topAdd + CATALOG[key].size[1];
  if (top > L.h - 0.05) return false;
  const u0 = shelf.u - shelf.w / 2, u1 = shelf.u + shelf.w / 2;
  if ((L.decor[shelf.wallSide] ?? []).some((s) => s !== shelf.wallSlot && u1 > s.u0 && u0 < s.u1 && s.y1 > y + slot - 0.001 && s.y0 < top + 0.01)) return false;
  const plan = L._slab(shelf.wallSide, u0, u1, shelf.d ?? CATALOG.shelf_wall.size[2]);                                     // a piece on the next wall that reaches out over this corner, above the shelf's own height (a cabinet's side)
  for (const [wall, list] of Object.entries(L.decor)) {
    if (wall !== shelf.wallSide && list.some((s) => s.d > 0 && s.y1 > y + slot - 0.001 && s.y0 < top + 0.01 && obbOverlap(plan, L._slab(wall, s.u0, s.u1, s.d), 0.01))) return false;
  }
  return !(L.obs[shelf.wallSide] ?? []).some((ob) => ob.kind !== 'door' && u1 > ob.u0 - 0.02 && u0 < ob.u1 + 0.02 && top > ob.sill - 0.02 && y < ob.top + 0.02);
}

/**
 * One to three things on one shelf, side by side between its brackets, spread by a seeded share of the room left over. The first is never refused for the building's triangle allowance (a shelf
 * is not bare because its building is big: in a building over its allowance it is the cheapest the room suits), the second and the third are. Returns the records put down (empty when nothing
 * fits between the brackets or under what hangs over the shelf).
 */
function stock(E, L, shelf, pool, rng, budget) {
  const half = SHELF.bay * shelf.w - SHELF.margin, want = rng.weighted([1, 2, 3], (n) => (n === 1 ? 3 : n === 2 ? 5 : 2));
  const fit = pool.filter(([key]) => CATALOG[key].size[0] <= 2 * half && headroom(L, shelf, key));
  const picked = [], cost = (key) => trisOf(E, key);
  let used = 0, left = budget;
  while (picked.length < want) {
    let rest = fit.filter(([key]) => !picked.some((p) => p[0] === key) && used + (picked.length ? SHELF.gap : 0) + CATALOG[key].size[0] <= 2 * half + 1e-9);
    if (!picked.length && !rest.some(([key]) => cost(key) <= left)) {                       // the first, over the allowance: the cheapest the room suits
      const cheapest = Math.min(...rest.map(([key]) => cost(key)));
      rest = rest.filter(([key]) => cost(key) === cheapest);
    } else rest = rest.filter(([key]) => cost(key) <= left);
    if (!rest.length) break;
    const one = rng.weighted(rest, (p) => p[1]);
    used += (picked.length ? SHELF.gap : 0) + CATALOG[one[0]].size[0]; left -= cost(one[0]); picked.push(one);
  }
  if (!picked.length) return [];
  const slack = 2 * half - used, r = Array.from({ length: picked.length + 1 }, () => 0.3 + rng.next()), rs = r.reduce((a, b) => a + b, 0), out = [];
  let x = -half + slack * r[0] / rs;
  picked.forEach(([key, , depth], i) => {
    const w = CATALOG[key].size[0], it = L.top(shelf, key, { px: x + w / 2, depth: depth ?? 0, id: `${shelf.id}t${i}` });       // (named by its shelf: this pass runs after the clothes, whose count must not number it)
    if (it) out.push(it);
    x += w + SHELF.gap + slack * r[i + 1] / rs;
  });
  return out;
}

/** A measuring switch, like the clothes': the page with `?shelves=0` (or a node run with globalThis.__noShelves) furnishes exactly as before the shelves were dressed. */
export const shelvesOff = () => !!globalThis.__noShelves || (typeof location !== 'undefined' && /[?&]shelves=0(&|$)/.test(location.search ?? ''));

/**
 * Put something on every wall shelf of a building. `built` = [{ room, hh, L }], every room furnished. A shelf keeps what is on it already. Returns { shelves, items, bare, tris }: `bare` the shelves
 * that stayed empty (nothing fits between the brackets, or the wall over the shelf is taken), `tris` the near-LOD triangles added.
 */
export function dressShelves(E, built) {
  const out = { shelves: 0, items: 0, bare: 0, tris: 0 };
  if (shelvesOff()) return { ...out, off: true };
  let budget = LIMITS.interior - estimateTris(E, built);
  for (const { room, hh, L } of built) {
    const shelves = L.items.filter((i) => i.name === 'shelf_wall' && i.wall && !i.tops?.length);
    if (!shelves.length) continue;
    const rng = E.rng.fork('shelves:' + room.id), pool = shelfPool(room.type, hh);
    for (const shelf of shelves) {
      const put = stock(E, L, shelf, pool, rng, budget);
      out.shelves++; out.items += put.length; if (!put.length) out.bare++;
      for (const it of put) { const t = trisOf(E, it.name); out.tris += t; budget -= t; }
    }
  }
  return out;
}
