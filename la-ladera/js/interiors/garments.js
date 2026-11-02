// INTERIORS (A3): untidy rooms. Some bedrooms and bathrooms have clothes on the bed, over a chair, hung on a wall, or scattered on the floor; others are neat.
//
//   * tidinessOf   the state of one room: 'neat' (nothing out, the bed made), 'lived' (a shirt over a chair, socks by the bed) or 'messy' (an unmade bed with clothes on it,
//                  more on the floor). A pure function of the building id, the room id and the household, so a house looks the same on every load. The household sets how
//                  messy it tends to be (`hh.tidy`, shifted by who lives there: students more, the elders much less); the room's own hash draws the rest. Shops, the clinic, the
//                  school, the chapel and the hall are always neat; a kitchen or a living room is at most lived-in; an elder's own room is never worse than lived-in; a child's room
//                  (a role of kids, child or teen, or a bedroom with a bunk or a baby's crib) is not touched by this pass.
//   * dressRooms   the pass that places the clothes (after every room of the building is furnished): garments go on the bed, on a seat, on a wall hook or on the floor, never
//                  inside a piece of furniture and never on the lanes people walk (walkLanes). Its own random streams (forks of the building's), so no other piece moves.
//   * mixOf        what a household leaves about: the adult staples (MIX), and from EXTRAS the teen cuts of the young (jeans, joggers, hoodies, dresses, the school's uniform where a
//                  teenager lives) and the child cuts where children do. A child's room stays untouched, but the family's things lie about the rest of the house.
//   * the assets   the garment GLBs are loaded through the interiors' catalogue path (build.js: `registerGarmentAssets` points each `garment_<id>_<state>` key at the LOD model);
//                  without them a record draws as a flat cloth patch in its own colour (standins.js).
// Pure data (no THREE, no DOM), so node and the page share the file.
import { GARMENTS, GARMENT_FILES, VARIANTS, STATES, ASSORTMENTS } from './garments_data.js';
import { mkObb, obbOverlap, obbCorners } from './layout.js';
import { usePoint } from './reach.js';
import { hashStr } from '../core/rng.js';

const PI = Math.PI;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const r3 = (v) => Math.round(v * 1000) / 1000;
/** A deterministic number in [0, 1) from a few strings (the tidiness of a room, whether a bed is made ...). */
export const uOf = (...parts) => (hashStr(parts.join('|')) >>> 0) / 4294967296;

// ------------------------------------------------------------------ the models
export const garmentKey = (id, state) => `garment_${id}_${state}`;
const DEFAULT_GARMENT_SIZES = Object.freeze(['adult', 'child']);
/** Keys for explicitly selected size libraries. Teen packs are available before their placements are wired into the page. */
export function garmentKeysFor(sizeTags = DEFAULT_GARMENT_SIZES) {
  if (!Array.isArray(sizeTags) || sizeTags.some((tag) => !Object.hasOwn(GARMENT_FILES, tag))) throw new TypeError('garment sizeTags must name known libraries');
  const selected = new Set(sizeTags);
  return Object.entries(GARMENTS).filter(([, g]) => selected.has(g.sizeTag))
    .flatMap(([id, g]) => STATES.filter((s) => g[s]).map((s) => garmentKey(id, s)));
}
/** What a load of the clothes asks for unless it names the libraries: the adult and the child ones. */
export const GARMENT_KEYS = garmentKeysFor();
/** Every applicable key, including both teen size classes. */
export const ALL_GARMENT_KEYS = garmentKeysFor(Object.keys(GARMENT_FILES));
/** The libraries the page loads (index.js): all three, for the loose clothes of a house are drawn from each (EXTRAS: the child cuts where children live, the teen cuts where the young do). */
export const PAGE_GARMENT_SIZES = Object.freeze(['adult', 'child', 'teen']);
/** The generated manifest paths keep adult, child and teen packs separate. One-argument calls retain the adult path. */
export const lodFile = (state, sizeTag = 'adult') => GARMENT_FILES[sizeTag]?.[state];
/** Each size's `garments_<state>_lod.glb` holds its garments in that state, as nodes `<key>_lod` (the garment manifests' `lod`). Interiors are merged per building: no per-object
 *  switching, so every garment is drawn from its LOD (<= 240 triangles; the detailed models stay unloaded). */
export function registerGarmentAssets(ctx, { sizeTags = DEFAULT_GARMENT_SIZES } = {}) {
  const a = ctx?.assets;
  if (!a?.entries) return 0;
  const selected = new Set(garmentKeysFor(sizeTags));
  let n = 0;
  for (const [id, g] of Object.entries(GARMENTS)) for (const state of STATES) {
    if (!g[state]) continue;
    const key = garmentKey(id, state);
    if (!selected.has(key)) continue;
    a.entries.set(key, { ...a.entries.get(key), name: key, glb: lodFile(state, g.sizeTag), node: key + '_lod', sizeTag: g.sizeTag,
      ...(g.sizeClass ? { styleId: g.styleId, sizeClass: g.sizeClass } : {}), tags: ['garment', g.sizeTag, ...(g.sizeClass ? [g.sizeClass] : [])] });
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ which rooms, and how untidy
/** The kinds of room that can be untidy, with the cut-offs of the messiness score (a room at or above `lived` has something out, at or above `messy` is messy) and the most clothes it can hold. */
export const CLASS = {
  bedroom: { lived: 0.40, messy: 0.62, cap: 12 },
  bathroom: { lived: 0.50, messy: 0.78, cap: 5 },
  living: { lived: 0.58, messy: Infinity, cap: 3 },
  kitchen: { lived: 0.64, messy: Infinity, cap: 2 },
};
const HOME_CLASS = { bedroom: 'bedroom', bathroom: 'bathroom', living: 'living', dining: 'living', kitchen: 'kitchen' };
/** Buildings that are never homes: always neat, no clothes (the shops' own stock is placed by shops.js). */
export const NEAT_LOTS = new Set(['chapel', 'school', 'clinic', 'hall']);
export const CHILD_ROLES = new Set(['kids', 'child', 'teen']);
const CHILD_ITEM = /^(bed_crib|bed_bunk)$/;                                             // a child's bed (not bed_cot: that is a camp bed of adult length, a guest's)
/** Who lives in the household tilts the score: students leave things about, the elders do not. */
export const KIND_SHIFT = { students: 0.30, couple: 0.06, family: 0, shopkeeper: -0.04, elder: -0.45 };
/** So does the building: a workshop's back room, a half-built house and a one-room cuarto are lived in harder than a family house. */
export const LOT_SHIFT = { workshop: 0.14, unfinished: 0.14, tenement: 0.08 };

/** The class of untidiness a room can have, or null when it is always neat (a shop, a stair, a yard, a school ...). */
export function classOf(bp, room, L) {
  const lk = bp.lot?.kind;
  if (NEAT_LOTS.has(lk) || room.noFurnish || room.outdoor || L?.circulation) return null;
  if (lk === 'unfinished' && room.floor > 0) return null;
  if (lk === 'tenement' && room.type === 'living') return 'bedroom';                  // a cuarto: the bed stands in the one room
  return HOME_CLASS[room.type] ?? null;
}
/**
 * A child's room: a role of the household (kids, child, teen), or a bedroom that holds a child's bed (a bunk, a baby's crib). This pass uses adult assortments, so such a room is
 * left alone: no loose clothes, and its beds keep whatever the room furnisher drew. Child assets are registered separately for explicit size-aware placements. (A toy pile or a school bag alone does not make a parents' room a child's: the family's things lie
 * about the whole house.)
 */
export const isChildRoom = (L, cls = 'bedroom') => CHILD_ROLES.has(L.role) || (cls === 'bedroom' && L.items.some((i) => CHILD_ITEM.test(i.name)));

/** The state of one room. `m` is the messiness score in [0, 1]: half the household's tendency, half the room's own draw. An elder's own room is never worse than lived-in. */
export function tidinessOf(bp, room, hh, cls, role = null) {
  const th = CLASS[cls];
  const tendency = clamp01((1 - (hh.tidy ?? 0.6)) / 0.75 + (KIND_SHIFT[hh.kind] ?? 0) + (LOT_SHIFT[bp.lot?.kind] ?? 0));
  const m = 0.5 * uOf('tidy', bp.id, room.id, hh.id) + 0.5 * tendency;
  const level = m >= th.messy && role !== 'elder' ? 'messy' : m >= th.lived ? 'lived' : 'neat';
  return { cls, m, level };
}

// ------------------------------------------------------------------ what lies where
/** The staples every house leaves about (the adult library): [id, weight] by place. The weights are draws, not shares of what ends up lying there: a garment is drawn first and then looks for a gap
 *  (onFloor), so a shirt finds one less often than a sock; and a gap too small for anything else is filled from what fits it (a sock, a cap, a pair of shoes) whatever their weights. The socks and
 *  underwear weigh little here, for they were 42% of what lay about (R4-211) and are still about 18% of it. interiors-rails holds the result: tops, shorts and leggings 45% or more, socks and
 *  underwear 45% or less, 400 garments in the barrio. */
export const MIX = {
  bed: [['tshirt', 6], ['leggings', 3.2], ['nightdress', 4.2], ['shorts', 0.9], ['crop_top', 0.7], ['socks_pair', 0.14], ['sock_single', 0.1], ['cap', 0.06]],
  seat: [['tshirt', 6], ['shorts', 0.9], ['crop_top', 0.7], ['leggings', 1.1], ['socks_pair', 0.1], ['cap', 0.08]],
  hung: [['tshirt', 6], ['nightdress', 3.2], ['crop_top', 0.7], ['shorts', 0.7], ['leggings', 1.1]],
  floor: [['tshirt', 6], ['shorts', 1.4], ['leggings', 3.2], ['crop_top', 0.9], ['nightdress', 2.1], ['socks_pair', 0.16], ['sock_single', 0.08], ['underwear', 0.06], ['briefs', 0.06], ['boxers', 0.04],
    ['panties', 0.04], ['knickers', 0.04], ['bra', 0.06], ['tights', 0.22], ['cap', 0.1], ['sun_hat', 0.06], ['straw_hat', 0.04]],
  bath: [['socks_pair', 0.16], ['sock_single', 0.07], ['underwear', 0.16], ['briefs', 0.11], ['boxers', 0.11], ['panties', 0.11], ['knickers', 0.11], ['bra', 0.08], ['tshirt', 3], ['shorts', 1.2], ['leggings', 1.1], ['crop_top', 0.55]],
};
/**
 * What the rest of the family's wash adds to the staples: [id, weight, places]. A teen cut is named by its style, for the size class goes on at the end (`teen_denim_jeans` is `_big` in a house of
 * grown-ups, whose clothes are the library's larger size, and `_small` or `_big` where a teenager lives); a child's cut is named whole. Places: b = on a bed, s = over a seat, h = on a wall hook,
 * f = on the bare floor, w = on a bathroom floor. No shorts, crop tops, socks or underwear here (the staples have them: 72% of the clothes of the barrio were those four, R4-309), and no swimwear
 * (a hillside at 2 000 m: the dressmaker's window has none either).
 */
export const EXTRAS = {
  everyday: [                                                                           // a house of any kind: jeans, joggers and hoodies, a jacket, dresses, a plain top, a pair of sandals
    ['teen_denim_jeans', 4.5, 'bsfw'], ['teen_joggers', 3, 'bsfw'], ['teen_hoodie', 3, 'bshf'], ['teen_light_jacket', 2.5, 'bsh'], ['teen_lycra_trousers', 1, 'bf'],
    ['teen_dress_knee', 2, 'bsh'], ['teen_dress_midi', 1.5, 'bsh'], ['teen_dress_short', 1, 'bsh'], ['teen_dress_maxi', 0.8, 'bh'],
    ['teen_tshirt_cream', 1.2, 'bshfw'], ['teen_tshirt_teal', 1.2, 'bshfw'], ['teen_tshirt_sun', 1.2, 'bshfw'], ['teen_sandals_pair', 0.13, 'f'],
  ],
  school: [                                                                             // where a teenager lives: the school's uniform
    ['teen_school_jumper', 2.5, 'bshf'], ['teen_school_polo', 2, 'bshfw'], ['teen_school_trousers', 2, 'bsf'], ['teen_school_skirt', 1, 'bshf'], ['teen_school_shoes_pair', 0.13, 'f'],
  ],
  children: [                                                                           // where children live: theirs (the child library; no swimwear)
    ['child_tshirt', 2, 'bshfw'], ['child_hoodie', 1.5, 'bshf'], ['child_jeans', 1.5, 'bsf'], ['child_dress', 1, 'bsh'], ['child_skirt', 0.6, 'bshf'], ['child_cardigan', 1, 'bsh'],
    ['child_pyjama_top', 1, 'bsf'], ['child_pyjama_bottoms', 1, 'bsf'], ['child_school_shirt', 1.5, 'bshf'], ['child_school_polo', 1.5, 'bsh'], ['child_school_trousers', 1.5, 'bsf'],
    ['child_school_shorts', 0.8, 'bf'], ['child_pinafore', 0.8, 'bshf'], ['child_shoes', 0.1, 'f'], ['child_backpack', 0.8, 's'],
  ],
};
/** How much of what lies about is drawn from EXTRAS rather than the staples: a house of grown-ups, more where a teenager lives, more where there are children, less in an elder's. */
export const EXTRA_SHARE = { base: 0.14, teen: 0.10, kids: 0.08, elder: 0.6 };
const PLACE_LETTER = { bed: 'b', seat: 's', hung: 'h', floor: 'f', bath: 'w' };
/** Who lives in the house, as far as its wash goes: `teen` = a teenager (hh.teen), `kids` = children, `elder` = a household of elders. */
export const wardrobeOf = (hh) => ({ teen: !!hh?.teen, kids: (hh?.kids ?? 0) > 0, elder: hh?.kind === 'elder' });
/** The ids of an EXTRAS row in a house: a child's cut is itself, a teen cut one id per size class the house has. */
export const extraIds = (id, w) => (GARMENTS[id] ? [id] : (w.teen ? ['small', 'big'] : ['big']).map((s) => `${id}_${s}`));
/** The weighted list a house draws from at one place ('bed', 'seat', 'hung', 'floor', 'bath'): the staples, and the extras scaled to their share of the draws. */
export function mixOf(place, hh) {
  const w = wardrobeOf(hh), base = MIX[place], letter = PLACE_LETTER[place], extra = [];
  for (const [id, weight, at] of [...EXTRAS.everyday, ...(w.teen ? EXTRAS.school : []), ...(w.kids ? EXTRAS.children : [])]) {
    if (!at.includes(letter)) continue;
    const ids = extraIds(id, w);
    for (const g of ids) extra.push([g, weight / ids.length]);
  }
  const share = (EXTRA_SHARE.base + (w.teen ? EXTRA_SHARE.teen : 0) + (w.kids ? EXTRA_SHARE.kids : 0)) * (w.elder ? EXTRA_SHARE.elder : 1);
  const total = (list) => list.reduce((n, m) => n + m[1], 0), scale = (share / (1 - share)) * (total(base) / total(extra));
  return [...base, ...extra.map(([id, weight]) => [id, weight * scale])];
}
const ARCH_BED = new Set(['bed', 'mattress']);
const ARCH_SEAT = new Set(['chair', 'sofa', 'armchair']);

/** How many things go on each kind of place, by room class and state (the caps are applied after; places the room lacks are given to the floor). */
function plan(cls, level, rng) {
  if (cls === 'bedroom') {
    if (level === 'lived') return { bed: 0, seat: rng.chance(0.6) ? 1 : 0, hung: rng.chance(0.3) ? 1 : 0, floor: rng.int(1, 2) };
    return { bed: rng.int(4, 6), seat: rng.int(1, 3), hung: rng.int(0, 2), floor: rng.int(2, 5) };       // (the beds, the chairs and the wall hooks take the shirts: most floors have no room for one; a bed takes
    // four to six asked, about two thirds laid: the cuts of the wider mix are large)
  }
  if (cls === 'bathroom') return { bed: 0, seat: 0, hung: 0, floor: level === 'lived' ? rng.int(1, 2) : rng.int(3, 5) };
  const seat = rng.chance(0.6) ? 1 : 0;
  return { bed: 0, seat, hung: 0, floor: seat ? (rng.chance(0.3) ? 1 : 0) : 1 };                    // a living room or a kitchen: a shirt over a chair, or a pair of socks
}

// ------------------------------------------------------------------ the lanes
/** Half the width of a walking lane: a body's shoulders, not its whole clearance. */
export const LANE_HALF = 0.2;
/** Pieces nobody walks up to (a plant, a bin, a lamp, a shelf of things, a standing fan): no lane leads to them. */
const NO_LANE = new Set(['plant', 'cylinder', 'lamp', 'smallbox', 'fans', 'shelf', 'rack', 'vitrine', 'wallunit', 'altar', 'crib']);
/**
 * The floor people walk on: the shortest ways from the room's doors (and stair landings) to the place beside every piece of furniture that is used, each widened by `half`. Built on the
 * room's own connectivity grid (cells of ~0.1 m that a body can stand on), so a garment kept off it never makes a walk longer. `hits(ob)` says whether an oriented box touches a lane.
 */
export function walkLanes(L, half = LANE_HALF) {
  const conn = L.connectivity(0.3), { nx, nz, blk, cellOf, srcs } = conn, N = nx * nz;
  const parent = new Int32Array(N).fill(-2), queue = new Int32Array(N);
  let qh = 0, qt = 0;
  for (const s of srcs) if (s.cell) { const k = s.cell[1] * nx + s.cell[0]; if (parent[k] === -2) { parent[k] = -1; queue[qt++] = k; } }
  while (qh < qt) {                                                                     // every free cell's way back to the nearest door
    const k = queue[qh++], x = k % nx, z = (k - x) / nx;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz) continue;
      const j = Z * nx + X; if (blk[j] || parent[j] !== -2) continue;
      parent[j] = k; queue[qt++] = j;
    }
  }
  const lane = new Uint8Array(N), seen = new Uint8Array(N), cw = L.W / nx, rad = Math.ceil(half / cw);
  const stamp = (k) => {
    const x = k % nx, z = (k - x) / nx;
    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= nx || Z >= nz || dx * dx + dz * dz > rad * rad) continue;
      lane[Z * nx + X] = 1;
    }
  };
  const walk = (k) => { for (; k >= 0 && !seen[k]; k = parent[k]) { seen[k] = 1; stamp(k); } };
  for (const s of srcs) if (s.cell) walk(s.cell[1] * nx + s.cell[0]);
  const dests = [];
  for (const it of L.blockers()) {
    if ((it.h < 0.3 && !it.c.seat) || NO_LANE.has(it.c.arch)) continue;
    const p = usePoint(L, it, conn, 0.3);
    if (p) dests.push(p);
  }
  for (const p of dests) {                                                              // from the nearest reachable cell to the place beside the piece
    const [ix, iz] = cellOf(p[0], p[1]);
    let found = -1;
    for (let r = 0; r <= 4 && found < 0; r++) for (let dz = -r; dz <= r && found < 0; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const X = ix + dx, Z = iz + dz;
      if (X >= 0 && Z >= 0 && X < nx && Z < nz && parent[Z * nx + X] !== -2) { found = Z * nx + X; break; }
    }
    if (found >= 0) walk(found);
  }
  const at = (x, z) => { const [ix, iz] = cellOf(x, z); return lane[iz * nx + ix] === 1; };
  return {
    nx, nz, lane, at,
    hits(ob) { return at(ob.cx, ob.cz) || obbCorners(ob).some(([x, z]) => at(ob.cx + (x - ob.cx) * 0.8, ob.cz + (z - ob.cz) * 0.8)); },
  };
}

// ------------------------------------------------------------------ placing
/** The per-room state of the pass: the room's stream, the garments placed so far (as boxes), the lanes and the floor grid (made once, when the first floor garment needs them), and the
 *  triangles the room may still spend on clothes (`allow`: a garment that would take it over is not put down). */
export function roomState(L, rng, allow = Infinity) {
  return { L, rng, taken: [], lanes: null, grid: null, lanesOf() { return (this.lanes ??= walkLanes(L)); }, n: 0, tris: 0, allow, shoesLeft: 1 };
}
/** A garment of the mix with a colour from the library's palette; after a few draws the first one of a footprint under `maxArea` (m2) when asked for a small thing. */
function pickGarment(S, mix, maxArea = Infinity) {
  let id, g;
  for (let k = 0; k < 8; k++) { id = S.rng.weighted(mix, (m) => m[1])[0]; g = GARMENTS[id]; if (g.flat[0] * g.flat[2] <= maxArea) break; }
  const variant = S.rng.pick(g.v);
  return { id, g, variant, tint: VARIANTS[variant] };
}
const to2 = (L, it, x, z) => { const c = Math.cos(it.ry), s = Math.sin(it.ry), dx = x - it.x, dz = z - it.z; return [dx * c - dz * s, dx * s + dz * c]; };    // the inverse of Layout.rel
const free = (S, ob, m = 0.01) => S.taken.every((t) => !obbOverlap(ob, t, m));
/** The extent across and along a frame of a w x d box turned by `a` in it. */
const extent = (w, d, a) => { const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return [c * w + s * d, s * w + c * d]; };

/** Commit a garment of state `flat` / `folded` (an item that rests on a surface or the floor). `parent` = the piece it lies on (its top is `parent.y + size[1] + topAdd`), or null for the floor. */
function lay(S, parent, key, x, z, ry, pick, state = 'flat') {
  if (S.tris + pick.g[state][3] > S.allow) return null;                                  // over the room's share of the interior's triangle budget
  const L = S.L, it = L._make(key, x, z, ry, { tint: pick.tint });
  it.block = false;
  if (parent) {
    it.floor = false; it.top = true; it.parent = parent; it.zones = [];
    [it.px, it.pz] = to2(L, parent, it.x, it.z);
    it.y = r3(parent.y + parent.c.size[1] + (parent.c.topAdd ?? 0));
    (parent.tops ??= []).push({ px: it.px, pz: it.pz, w: it.w, d: it.d });
  }
  it.flags = { variant: pick.variant };
  L._commit(it);
  S.taken.push(it.ob); S.n++; S.tris += pick.g[state][3];
  return it;
}

/** On a bed: inside the sheet (a hand's width of cloth over its edge), clear of the pillows at the head. A bed too crowded for another shirt laid out takes a small thing, and then one folded
 *  (the wash brought in and left on the bed: the cuts of the wider mix are large, and four of them laid flat do not fit one sheet). */
function onBed(S, bed, mix) {
  const L = S.L, w = bed.w, d = bed.d, over = 0.07;
  for (let k = 0; k < 16; k++) {
    const pick = pickGarment(S, mix, k < 8 || k >= 12 ? Infinity : 0.3), state = k < 12 ? 'flat' : 'folded', pose = pick.g[state];
    if (!pose) continue;                                                                               // (a pair of shoes has no folded pose, and none is left on a bed)
    const [gw, , gd] = pose;
    const dry = (S.rng.chance(0.5) ? PI / 2 : 0) + (S.rng.next() - 0.5) * 0.5, [ex, ez] = extent(gw, gd, dry);
    const xr = (w + 2 * over - ex) / 2, lo = -d / 2 + 0.45 + ez / 2, hi = d / 2 + over - ez / 2;      // where its centre may be, in the bed's frame
    if (xr < 0 || lo > hi) continue;
    const [x, z] = L.rel(bed, (S.rng.next() * 2 - 1) * xr, lo + S.rng.next() * (hi - lo)), ob = mkObb(x, z, gw, gd, bed.ry + dry);
    if (!free(S, ob)) continue;
    return lay(S, bed, garmentKey(pick.id, state), x, z, bed.ry + dry, pick, state);
  }
  return null;
}

/** On a seat (a chair, a sofa, an armchair): the cloth lies on the cushion, flat when it fits and folded when it does not, and may hang a hand over the front and the sides. */
function onSeat(S, seat, mix) {
  const L = S.L, over = 0.08, arms = seat.c.arch !== 'chair';
  const x0 = -seat.w / 2 + (arms ? 0.12 : 0), x1 = seat.w / 2 - (arms ? 0.12 : 0), z0 = -seat.d / 2 + (arms ? 0.28 : 0.08), z1 = seat.d / 2;       // the cushion, in the seat's frame
  for (let k = 0; k < 14; k++) {
    const pick = pickGarment(S, mix, k < 6 ? Infinity : 0.3), dry = (S.rng.chance(0.5) ? PI / 2 : 0) + (S.rng.next() - 0.5) * 0.6;
    const state = ['flat', 'folded'].find((st) => { const g = pick.g[st]; if (!g) return false; const [ex, ez] = extent(g[0], g[2], dry); return ex <= x1 - x0 + 2 * over && ez <= z1 - z0 + over; });
    if (!state) continue;
    const [gw, , gd] = pick.g[state], [ex, ez] = extent(gw, gd, dry);
    const px = (x0 + x1) / 2 + (S.rng.next() * 2 - 1) * Math.max(0, (x1 - x0 + 2 * over - ex) / 2), pz = z0 + ez / 2 + S.rng.next() * Math.max(0, z1 + over - z0 - ez);
    const [x, z] = L.rel(seat, px, pz), ob = mkObb(x, z, gw, gd, seat.ry + dry);
    if (!L.inside(ob, -0.02) || !free(S, ob)) continue;
    if (L.items.some((b) => b !== seat && b.floor && b.block && obbOverlap(ob, b.ob, -0.04))) continue;
    return lay(S, seat, garmentKey(pick.id, state), x, z, seat.ry + dry, pick, state);
  }
  return null;
}

/**
 * The bare floor of a room as a grid of ~0.1 m cells (made once, when the first floor garment needs it): a cell is blocked by the walls, the furniture, the doors' sweeps, the lanes and
 * the garments already down; `clr` is how far the free floor reaches around a free cell (a distance transform), so a garment can be chosen to fit the gap it goes in.
 */
export function floorGrid(S) {
  const L = S.L, r = L.r, lanes = S.lanesOf();
  const nx = Math.max(2, Math.round((r.x1 - r.x0) / 0.1)), nz = Math.max(2, Math.round((r.z1 - r.z0) / 0.1)), dx = (r.x1 - r.x0) / nx, dz = (r.z1 - r.z0) / nz;
  const furn = L.items.filter((b) => b.floor && (b.block || b.c.size[1] >= 0.04)).map((b) => [b.ob, b.block ? 0.05 : 0.02]);
  const keeps = L.keep.map((q) => q.obb ?? mkObb((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, q.x1 - q.x0, q.z1 - q.z0, 0));
  const G = { nx, nz, dx, dz, blk: new Uint8Array(nx * nz), clr: new Float32Array(nx * nz), at: (i, j) => [r.x0 + (i + 0.5) * dx, r.z0 + (j + 0.5) * dz] };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [x, z] = G.at(i, j), p = mkObb(x, z, 0.02, 0.02, 0);
    G.blk[j * nx + i] = x < r.x0 + 0.06 || x > r.x1 - 0.06 || z < r.z0 + 0.06 || z > r.z1 - 0.06 || lanes.at(x, z) || furn.some(([ob, m]) => obbOverlap(p, ob, m)) || keeps.some((k) => obbOverlap(p, k, 0.08)) ? 1 : 0;
  }
  G.measure = () => {                                                                    // the 3-4 chamfer distance to the nearest blocked cell (the room's edge counts as blocked)
    const d = new Int32Array(nx * nz);
    for (let k = 0; k < d.length; k++) d[k] = G.blk[k] ? 0 : 1e9;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!d[k]) continue;
      let m = Math.min(d[k], 3 * (Math.min(i, j, nx - 1 - i, nz - 1 - j) + 1));
      if (i > 0) m = Math.min(m, d[k - 1] + 3);
      if (j > 0) { m = Math.min(m, d[k - nx] + 3); if (i > 0) m = Math.min(m, d[k - nx - 1] + 4); if (i < nx - 1) m = Math.min(m, d[k - nx + 1] + 4); }
      d[k] = m;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i; if (!d[k]) continue;
      let m = d[k];
      if (i < nx - 1) m = Math.min(m, d[k + 1] + 3);
      if (j < nz - 1) { m = Math.min(m, d[k + nx] + 3); if (i < nx - 1) m = Math.min(m, d[k + nx + 1] + 4); if (i > 0) m = Math.min(m, d[k + nx - 1] + 4); }
      d[k] = m;
    }
    for (let k = 0; k < d.length; k++) G.clr[k] = G.blk[k] ? 0 : Math.max(0, (d[k] / 3 - 0.5) * Math.min(dx, dz));
  };
  G.block = (ob) => {                                                                    // a garment went down: its cells (and a hand around them) are taken
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const [x, z] = G.at(i, j);
      if (Math.abs(x - ob.cx) < ob.hx + ob.hz + 0.1 && Math.abs(z - ob.cz) < ob.hx + ob.hz + 0.1 && obbOverlap(mkObb(x, z, 0.02, 0.02, 0), ob, 0.03)) G.blk[j * nx + i] = 1;
    }
    G.measure();
  };
  G.measure();
  return G;
}

const SMALL = 0.19;                                                                       // m2: the footprint under which a garment is a sock or underwear (a pair of boxers is 0.175)
const TOYS = /^(toy_pile|doll)/;
/** Whether a child's toys lie within a hand's reach (0.3 m) of a spot: the family's clothes lie about the house, but not on top of what a child plays with. */
const nearToys = (L, x, z) => L.items.some((b) => TOYS.test(b.name) && Math.hypot(b.x - x, b.z - z) < 0.3);
const FOOTWEAR = /(^|_)(sandals|shoes)(_|$)/;                                             // (a pair is the smallest thing in the library: it fits every gap, so left alone it would be most of what lies about)
/** On the floor, away from the lanes: mostly beside the pieces people dress and undress at (the bed, the wardrobe, a chair), the rest anywhere; the garment is chosen to fit the gap it lies in.
 *  One room in two leaves a pair of shoes about, and never more than one pair (dressRooms sets `shoesLeft`). */
function onFloor(S, hosts, all) {
  const L = S.L, G = (S.grid ??= floorGrid(S)), mix = S.shoesLeft ? all : all.filter(([id]) => !FOOTWEAR.test(id));
  for (let k = 0; k < 16; k++) {
    // The garment comes first, by the weights of the mix, and then a gap that holds it, tried a few times (a shirt needs 0.9 m of bare floor, a sock 0.4 m, and most gaps are small: choosing the gap
    // first and keeping only what fits it left a floor of socks and underwear, 62% of the clothes of the barrio, R4-211). The last attempts fall back to the old way, so a tight room still gets its sock.
    const first = k < 10;
    const pick0 = first ? pickGarment(S, mix) : null;
    if (pick0 && pick0.g.flat[0] * pick0.g.flat[2] < SMALL && S.rng.chance(0.3)) continue;      // (a sock finds a gap in every room, a shirt in few: they would still be most of the floor)
    const need = pick0 ? Math.max(0.1, Math.min(Math.hypot(pick0.g.flat[0], pick0.g.flat[2]) / 2, 0.46) * 0.6 - 0.02) : 0.1;
    const open = [];
    for (let c = 0; c < G.blk.length; c++) if (!G.blk[c] && G.clr[c] >= need) open.push(c);
    if (!open.length) { if (first) continue; return null; }
    for (let tr = 0; tr < (first ? 8 : 1); tr++) {
      let c = S.rng.pick(open);
      if (hosts.length && S.rng.chance(0.65)) {                                           // the nearest of a few free cells to one of the pieces
        const h = S.rng.pick(hosts), at = (q) => G.at(q % G.nx, Math.floor(q / G.nx)), near = (q) => { const [x, z] = at(q); return Math.hypot(x - h.x, z - h.z) - G.clr[q]; };
        for (let j = 0; j < 6; j++) { const q = S.rng.pick(open); if (near(q) < near(c)) c = q; }
      }
      const [x0, z0] = G.at(c % G.nx, Math.floor(c / G.nx)), x = r3(x0), z = r3(z0), reach = G.clr[c] + 0.04;       // (the record keeps three decimals: the box tested is the box that lies there, not one a hair off a lane's edge)
      let pick = pick0;
      if (!pick) {
        const fit = mix.filter(([id]) => Math.hypot(GARMENTS[id].flat[0], GARMENTS[id].flat[2]) / 2 <= reach);
        if (!fit.length) continue;
        pick = pickGarment(S, fit);
        if (pick.g.flat[0] * pick.g.flat[2] < SMALL && S.rng.chance(0.5)) continue;        // (a sock fits every gap: left alone it would still be most of what lies about; a room that gets none is just tidier)
      }
      const [gw, , gd] = pick.g.flat, ry = r3(S.rng.next() * 2 * PI), ob = mkObb(x, z, gw, gd, ry);
      if (!L.inside(ob, -0.06) || !free(S, ob, 0.02)) continue;
      if (L.items.some((b) => b.floor && (b.block ? obbOverlap(ob, b.ob, 0.04) : b.c.size[1] >= 0.04 && obbOverlap(ob, b.ob, 0.015)))) continue;       // a hand clear of every piece of furniture, and off the shoes, the baskets, the bins (a rug or a mat is fine to lie on)
      if (L.keep.some((q) => obbOverlap(ob, q.obb ?? mkObb((q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, q.x1 - q.x0, q.z1 - q.z0, 0), 0.06))) continue;      // the doors' sweeps, the entrance corridor, the stairs
      if (S.lanesOf().hits(ob) || nearToys(L, x, z)) continue;
      const it = lay(S, null, garmentKey(pick.id, 'flat'), x, z, ry, pick);
      if (!it) return null;
      if (FOOTWEAR.test(pick.id)) S.shoesLeft--;
      G.block(ob);
      return it;
    }
  }
  return null;
}

/** Hung on a wall hook (a shirt on a nail): on the same wall as the wardrobe when there is room, else any free stretch of wall. */
function onWall(S, wardrobe, mix) {
  const L = S.L, pick = pickGarment(S, mix), key = garmentKey(pick.id, 'hung'), keep = L.rng;
  if (S.tris + pick.g.hung[3] > S.allow) return null;
  L.rng = S.rng;                                                                         // hang() draws jitter from the room's stream: use ours
  try {
    const o = { y: r3(1.78 - pick.g.hung[1]), jitter: 0.3, lap: -0.02, tint: pick.tint, ...(wardrobe ? { near: [wardrobe.x, wardrobe.z], nearW: 6 } : {}) };       // (lap: the hem clears a dresser by two fingers)
    const hang = (side) => { const h = L.hang(key, side, o); if (h && nearToys(L, h.x, h.z)) { L.remove(h); return null; } return h; };           // (a hook over a toy pile is not used)
    const it = (wardrobe?.wallSide && hang(wardrobe.wallSide)) || hang('any');
    if (!it) return null;
    it.block = false; it.flags = { variant: pick.variant };
    S.n++; S.tris += pick.g.hung[3];
    return it;
  } finally { L.rng = keep; }
}

// ------------------------------------------------------------------ a dressmaker's stock
/** The tables and counters of a modista's shop: the library's shop recipes (assortments.json `shop_*`) name the same pieces as their hosts. */
export const STOCK_HOSTS = new Set(['cutting_table', 'sewing_table', 'shop_counter_short', 'shop_counter_wood']);
const STOCK = ASSORTMENTS.filter((a) => a.kind === 'shop_shelf' && a.id !== 'shop_flat_swimwear');       // (no bikinis in the window of a seamstress in the Andes)
const ASSET = /^garment_(.+)_(flat|folded|hung)$/;
/** Folded stock on the surfaces of a dressmaker's shop: a few finished things per table or counter, drawn from the library's shop recipes. The only clothes a shop ever shows. */
function stockShop(S) {
  const L = S.L;
  for (const host of L.items.filter((i) => i.floor && STOCK_HOSTS.has(i.name))) {
    const want = host.name === 'cutting_table' ? 4 : 2, shown = new Set();
    for (let k = 0, got = 0; k < 10 && got < want; k++) {
      const [asset, variant] = S.rng.pick(S.rng.pick(STOCK).items), m = ASSET.exec(asset);
      if (!m || m[2] === 'hung' || !GARMENTS[m[1]]?.[m[2]] || shown.has(asset)) continue;           // (one of each kind on a table)
      if (S.tris + GARMENTS[m[1]][m[2]][3] > S.allow) continue;
      shown.add(asset);
      const it = L.top(host, asset, { at: S.rng.next() * 2 - 1, depth: S.rng.next() * 2 - 1, ry: (S.rng.next() - 0.5) * 0.5, tint: VARIANTS[variant] });
      if (!it) continue;
      it.flags = { variant, stock: true }; S.n++; S.tris += GARMENTS[m[1]][m[2]][3]; got++;
    }
  }
}

// ------------------------------------------------------------------ the budget
/** A measuring switch: the page with `?garments=0` (or a node run with globalThis.__noGarments) furnishes exactly as before the clothes existed, beds included. */
export const garmentsOff = () => !!globalThis.__noGarments || (typeof location !== 'undefined' && /[?&]garments=0(&|$)/.test(location.search ?? ''));
/** What a building's interior costs in triangles, estimated while it is furnished (the page's real figure comes from the meshes): the library's own count for a modelled piece. */
export function estimateTris(E, built) {
  const meta = E.ctx?.assets?.meta?.bind(E.ctx.assets);
  let n = 0;
  for (const { L } of built) for (const it of L.items) {
    if (it.c.decal) n += 4;
    else if (it.c.state) n += 150;                                                       // (a garment: counted by the pass)
    else n += (meta?.(it.name)?.triangles ?? (meta?.(it.name)?.glb?.startsWith('heroes/') ? 450 : it.c.arch === 'shopshelf' ? 700 : 260));
  }
  return n;
}
export const LIMITS = { building: 72, tris: 11000, interior: 90000 };

// ------------------------------------------------------------------ the pass
/**
 * Set the tidiness of every room of a building and put out its clothes. `built` = [{ room, hh, L }] of the building, all furnished. Returns what was done:
 * { rooms: { [roomId]: { cls, level, garments, want, by, m } }, garments, tris, est, allow }. The beds of untouched (adult) rooms are made or unmade to match the room.
 */
export function dressRooms(E, built) {
  const { bp } = E, out = { rooms: {}, garments: 0, tris: 0, off: garmentsOff() };
  if (out.off) return out;                                                               // the page measured without them (`?garments=0`, tests/metrics.mjs --query garments=0)
  const est = estimateTris(E, built), allow = Math.min(LIMITS.tris, LIMITS.interior - est);
  out.est = est; out.allow = allow;
  for (const { room, hh, L } of built) {
    const cls = classOf(bp, room, L);
    const rec = bp.interior?.rooms?.[room.id];
    if (!cls) {                                                                          // always neat: no clothes, but a dressmaker's shop shows its stock
      let stock = 0;
      if (bp.lot?.shop === 'modista' && out.tris < allow && L.items.some((i) => STOCK_HOSTS.has(i.name))) {
        const S = roomState(L, E.rng.fork('stock:' + room.id), allow - out.tris); stockShop(S);
        out.garments += S.n; out.tris += S.tris; stock = S.n;
      }
      if (rec) { rec.tidy = 'neat'; rec.garments = stock; }
      out.rooms[room.id] = { cls: null, level: 'neat', garments: stock, stock };
      continue;
    }
    if (isChildRoom(L, cls)) { if (rec) rec.tidy = 'child'; out.rooms[room.id] = { cls, level: 'child', garments: 0 }; continue; }
    const { level, m } = tidinessOf(bp, room, hh, cls, L.role);
    // the beds follow the room: a neat room's is made, a messy room's mostly not
    const beds = L.items.filter((i) => i.floor && ARCH_BED.has(i.c.arch));
    for (const b of beds) b.flags = { ...b.flags, unmade: level === 'neat' ? false : uOf('unmade', bp.id, room.id, b.id) < (level === 'messy' ? 0.9 : 0.25) };
    const S = roomState(L, E.rng.fork('garments:' + room.id), allow - out.tris), by = { bed: 0, seat: 0, hung: 0, floor: 0 };
    let want = 0;
    if (level !== 'neat' && out.garments < LIMITS.building && out.tris < allow) {
      const p = plan(cls, level, S.rng), cap = Math.min(CLASS[cls].cap, LIMITS.building - out.garments);
      const seats = L.items.filter((i) => i.floor && ARCH_SEAT.has(i.c.arch) && i.c.seat);
      const wardrobe = L.items.find((i) => i.floor && i.c.tags.includes('wardrobe')) ?? null;
      S.shoesLeft = S.rng.chance(0.5) ? 1 : 0;
      if (!beds.length) { p.floor += p.bed; p.bed = 0; }                                 // a place the room lacks gives its share to the floor
      if (!seats.length) { p.floor += p.seat; p.seat = 0; }
      const hosts = [...beds, ...(wardrobe ? [wardrobe] : []), ...seats];
      want = Math.min(cap, p.bed + p.seat + p.hung + p.floor);
      const more = () => S.n < want && S.tris < S.allow, mixes = {}, mix = (place) => (mixes[place] ??= mixOf(place, hh));       // (what this household's wash holds, drawn from once a place)
      for (let i = 0; i < p.bed && more(); i++) if (onBed(S, S.rng.pick(beds), mix('bed'))) by.bed++;
      for (let i = 0; i < p.seat && more(); i++) if (onSeat(S, S.rng.pick(seats), mix('seat'))) by.seat++;
      for (let i = 0; i < p.hung && more(); i++) if (onWall(S, wardrobe, mix('hung'))) by.hung++;
      for (let i = 0; i < p.floor && more(); i++) if (onFloor(S, hosts, mix(cls === 'bathroom' ? 'bath' : 'floor'))) by.floor++;
      by.plan = p;
    }
    out.garments += S.n; out.tris += S.tris;
    out.rooms[room.id] = { cls, level, garments: S.n, want, by, m: r3(m) };
    if (rec) { rec.tidy = level; rec.garments = S.n; }
  }
  return out;
}
