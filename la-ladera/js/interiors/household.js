// Households (who lives here) and room finishes. Pure data. Everything is derived from the lot seed, so a house is stable
// across loads and every neighbour differs.

import { PAL } from './catalog.js';
import { makeRng, hashStr } from '../core/rng.js';
import { WOMEN, MEN, BOYS, GIRLS, SURNAMES } from './names.js';

export const WALL_PAINTS = [
  { n: 'menta', c: 0x93d3b2, d: 0x3f8a6c }, { n: 'cielo', c: 0x93c4ea, d: 0x3a6f9c }, { n: 'durazno', c: 0xf5bd96, d: 0xb85f3a },
  { n: 'lila', c: 0xc2aadc, d: 0x6a4f94 }, { n: 'ocre', c: 0xe3b65c, d: 0x8a5a1c }, { n: 'salmon', c: 0xefaa9b, d: 0xa8473a },
  { n: 'mantequilla', c: 0xf5e08a, d: 0xa88a2c }, { n: 'turquesa', c: 0x6cc4bf, d: 0x1f6f73 }, { n: 'pistacho', c: 0xbbdf98, d: 0x5a8a38 },
  { n: 'rosa', c: 0xeca5ba, d: 0xa63e63 }, { n: 'blanco', c: 0xf2ede2, d: 0x8a8272 }, { n: 'verde-agua', c: 0xa6dccd, d: 0x3f8a7a },
  { n: 'azul', c: 0x78a6d6, d: 0x2b4f86 }, { n: 'crema', c: 0xecdcb8, d: 0x8a6a3c },
];
const CERAMIC_TINTS = [0xf1ead8, 0xd7dcd9, 0xe8d3c0, 0xe4c9a8, 0xdfe6dc];
const BATH_TINTS = [0xcfe3ea, 0xdbe8d4, 0xf2e4e6, 0xe9f0f0, 0xf1ead8];
const TRIM_TINTS = [0xf6f3ea, 0xf6f3ea, 0xf6f3ea, 0x6b4a32, 0x2f3a45];

/** The pools (names.js). `kids` alternates a boy and a girl, so the parity of a name's place tells its gender. */
export const NAMES = { women: WOMEN, men: MEN, kids: BOYS.flatMap((b, i) => (GIRLS[i] ? [b, GIRLS[i]] : [])), surnames: SURNAMES };
const GIRL = new Set(GIRLS);

const books = new Map();
/** The pools shuffled once per world seed. A household takes the name at its own place in the barrio, so no name comes round again before the pool is used up. */
function nameBook(seed) {
  const s = seed >>> 0;
  let b = books.get(s);
  if (!b) {
    const r = makeRng((hashStr('first-names') ^ s) >>> 0);
    b = { women: r.shuffle([...WOMEN]), men: r.shuffle([...MEN]), boys: r.shuffle([...BOYS]), girls: r.shuffle([...GIRLS]), sur: r.shuffle([...SURNAMES]), young: r.shuffle([...NAMES.kids]) };   // (`young` last: the shuffles above stay where they were)
    books.set(s, b);
  }
  return b;
}
// generic football colours: no crests, no real clubs
export const TEAMS = [
  { a: 0xc8302a, b: 0xf2f2ee, n: 'rojiblancos' }, { a: 0x2c7a3f, b: 0xf2f2ee, n: 'verdiblancos' }, { a: 0xe8c332, b: 0x2a4f9a, n: 'amarillo y azul' },
  { a: 0x2a4f9a, b: 0xc8302a, n: 'azul y rojo' }, { a: 0x2a4f9a, b: 0xf2f2ee, n: 'azul y blanco' }, { a: 0x6a1f2e, b: 0xe8c332, n: 'vinotinto' },
];

const pickW = (rng, table) => rng.weighted(table, (t) => t[1])[0];
/** The two children's names: two draws from the stream whatever happens next (so every later draw of the household is where it always was) decide each child's gender; with a
 *  `book` the names themselves are the household's place in the barrio in that gender's shuffled list (two girls take places half a list apart: never the same name). */
const kidNames = (r, book, at, student = null) => {
  const kid = r.pick(NAMES.kids), kid2 = r.pick(NAMES.kids.filter((k) => k !== kid));
  if (!book) return { kid, kid2 };
  // The two grown-ups of a student flat are named from the children's lists too (born in the 2000s), and unlike a child's name theirs are counted among the barrio's ADULTS: so a student
  // flat takes the next two names of the one shuffled list of all the children's names by its place among the STUDENT flats (80 flats before a name comes round, and the pool has 160).
  if (student != null) return { kid: book.young[(2 * student) % book.young.length], kid2: book.young[(2 * student + 1) % book.young.length] };
  const list = (n) => (GIRL.has(n) ? book.girls : book.boys), a = list(kid), b = list(kid2);
  return { kid: a[at % a.length], kid2: b[(at + (a === b ? b.length >> 1 : 0)) % b.length] };
};

/** The kind of household a lot's own people are (the household's first draw, from `hrng` = rng.fork('hh:' + key); a shop home when `shop`). */
function lotKind(hrng, lot, shop) {
  const lk = lot.kind;
  if (shop || lk === 'shophouse' || lk === 'cornerstore' || lk === 'kiosk') return 'shopkeeper';
  if (lk === 'apartments') return pickW(hrng, [['family', 4], ['couple', 3], ['students', 2], ['elder', 3]]);
  if (lk === 'tenement') return pickW(hrng, [['family', 3], ['elder', 3], ['students', 3], ['couple', 2]]);
  return pickW(hrng, [['family', 6], ['elder', 2], ['couple', 2], ['students', 1]]);
}

/**
 * One household. key = what makes it unique (building id + flat/room). o: { kind?: forced persona, shop?: bool, at?: the household's place among all the barrio's (positionOf), student?:
 * a student flat's place among the student flats (studentOf), seed?: the world seed }. With `at` the names are handed out without replacement; without it (a test's own household) they
 * are drawn at random from the pools.
 */
export function makeHousehold(rng, lot, key, o = {}) {
  const hrng = rng.fork('hh:' + key);
  const kind = o.kind || lotKind(hrng, lot, o.shop);
  const income = hrng.chance(kind === 'shopkeeper' ? 0.6 : lot.kind === 'apartments' ? 0.55 : lot.kind === 'tenement' ? 0.12 : 0.4) ? 1 : 0;
  const kids = kind === 'family' || kind === 'shopkeeper' ? hrng.int(1, 3) : 0;
  const babies = kids > 0 && hrng.chance(0.22);
  const teen = kids > 1 && hrng.chance(0.5);
  const religious = kind === 'elder' ? hrng.range(0.65, 1) : hrng.range(0, 1);
  const pets = [];
  if (hrng.chance(0.28)) pets.push('cat');
  if (hrng.chance(0.18)) pets.push('dog');
  if (hrng.chance(kind === 'elder' ? 0.4 : 0.14)) pets.push('canary');
  const hobby = hrng.pick(kind === 'students' ? ['football', 'music', 'reading'] : kind === 'elder' ? ['plants', 'sewing', 'radio', 'pigeons'] : ['football', 'music', 'plants', 'reading', 'cooking', 'sewing']);
  const team = hrng.pick(TEAMS);
  const paints = hrng.shuffle([...WALL_PAINTS]);
  const book = o.at == null ? null : nameBook(o.seed ?? 0), at = o.at ?? 0;
  let w = hrng.pick(NAMES.women), m = hrng.pick(NAMES.men), sur = hrng.pick(NAMES.surnames);        // (drawn either way: the rest of the household does not depend on how the names are given)
  if (book) { w = book.women[at % book.women.length]; m = book.men[at % book.men.length]; sur = book.sur[at % book.sur.length]; }
  const tints = {};                                   // one colour per upholstery/plastic family so a home looks coordinated
  for (const k of Object.keys(PAL)) if (k !== 'none') tints[k] = hrng.pick(PAL[k]);
  tints.white = 0xf2f0ea;
  const floorPub = income
    ? pickW(hrng, [['floor_tile_checker', 3], ['floor_tile_ceramic', 3], ['floor_tile_terracotta', 2], ['floor_laminate', 2], ['floor_pine', 1]])
    : pickW(hrng, [['floor_cement_red', 3], ['floor_cement', 3], ['floor_tile_ceramic', 3], ['floor_vinyl', 1], ['floor_laminate', 1]]);
  const floorBed = income
    ? pickW(hrng, [['floor_laminate', 4], ['floor_pine', 3], ['floor_tile_ceramic', 3], ['floor_tile_terracotta', 1]])
    : pickW(hrng, [['floor_cement', 4], ['floor_tile_ceramic', 3], ['floor_laminate', 2], ['floor_pine', 1], ['floor_cement_red', 2]]);
  return {
    id: key, kind, income, kids, babies, teen, elder: kind === 'elder' || (kind === 'family' && hrng.chance(0.3)),
    religious, altar: religious > 0.45, pets, hobby, team,
    tidy: hrng.range(0.25, 1), dado: hrng.chance(0.65), vinyl: hrng.chance(income ? 0.35 : 0.6), plastic: hrng.chance(income ? 0.45 : 0.7),
    crochet: kind === 'elder' || hrng.chance(0.3), tvBig: income === 1 && hrng.chance(0.7), rustic: hrng.chance(0.2),
    paint: { pub: paints[0], bed: paints[1], bed2: paints[2], kit: paints[3] }, tints,
    floorPub, floorBed, ceramicTint: hrng.pick(CERAMIC_TINTS), bathTint: hrng.pick(BATH_TINTS), trimTint: hrng.pick(TRIM_TINTS),
    names: { woman: w, man: m, sur, don: 'don ' + m, dona: 'doña ' + w, ...kidNames(hrng, book, at, kind === 'students' ? o.student : null) },
    seed: hrng.int(1, 1e9),
  };
}

const OCC = { family: 'family', elder: 'elder', shopkeeper: 'shopkeeper' };
/** The stream every household and finish of a building is drawn from: stable per world seed and lot. Furnishing only forks it (it never draws from it), so a
 *  household can be re-derived without furnishing the building (contents.js plans the whole barrio that way, whatever has been furnished so far). */
export const furnishRng = (ctx, bp) => makeRng((hashStr('furnish:' + bp.id) ^ (ctx.seed >>> 0) ^ (((bp.lot ?? {}).seed ?? 0) >>> 0)) >>> 0);
/** The rooms of a building in the order they are furnished. */
export const roomsInOrder = (bp) => [...(bp.rooms ?? [])].sort((a, b) => (a.floor - b.floor) || (a.id < b.id ? -1 : 1));

/** The household a room belongs to: one per house, per flat of an apartment block, per cuarto of a tenement ... (a string; the households of a building are its distinct keys). */
export function householdKey(bp, room) {
  const lot = bp.lot ?? {};
  let flat = 'all';
  if (lot.kind === 'apartments') flat = `f${room.floor}${room.flat ?? room.unit ?? ''}`;
  else if (lot.kind === 'tenement') flat = room.type === 'bedroom' || room.type === 'living' ? room.id : 'shared';
  return `${bp.id}.${flat}.${room.occupant ?? ''}`;
}
const rosters = new WeakMap();
/** What the occupant of a room makes the household (undefined: the household draws its own kind from its lot, `lotKind`). */
const occupantKind = (rng, room, key) => OCC[room.occupant] ?? (room.occupant === 'young' ? (rng.fork(key).chance(0.5) ? 'couple' : 'students') : undefined);
/** Every household of the barrio in its place: `at` (0, 1, 2 ... over all of them) and `young` (0, 1, 2 ... over the student flats alone). Built once per ctx.buildings. */
function rosterOf(ctx) {
  const B = ctx.buildings;
  let r = rosters.get(B);
  if (!r || r.size !== B.size) {
    const at = new Map(), young = new Map();
    for (const b of [...B.values()].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
      try {
        const rng = furnishRng(ctx, b);
        for (const room of roomsInOrder(b)) {
          const k = householdKey(b, room);
          if (at.has(k)) continue;
          at.set(k, at.size);
          // (asked of the very streams furnishing asks, so the roster and the households agree on who is a student)
          if ((occupantKind(rng, room, k) ?? lotKind(rng.fork('hh:' + k), b.lot ?? {}, false)) === 'students') young.set(k, young.size);
        }
      } catch { /* reported where the building is furnished */ }
    }
    rosters.set(B, r = { size: B.size, at, young });
  }
  return r;
}
/**
 * Where a household stands among every household of the barrio: the buildings of `ctx.buildings` in id order, their households in the order furnishing meets them (0, 1, 2 ...).
 * household.js gives each its names by this place, so a first name is used again only after the pool is used up. null for a building that is not one of ctx.buildings (a test's own
 * plan): its names are drawn at random. A building whose rooms cannot be read (a broken plan) takes no place and costs the others none.
 */
export function positionOf(ctx, bp, key) {
  if (!ctx?.buildings?.has?.(bp.id)) return null;
  return rosterOf(ctx).at.get(key) ?? null;
}
/** Where a STUDENT flat stands among the student flats of the barrio (0, 1, 2 ...), or null for any other household: the two names of a student flat are the next two unused ones. */
export function studentOf(ctx, bp, key) {
  if (!ctx?.buildings?.has?.(bp.id)) return null;
  return rosterOf(ctx).young.get(key) ?? null;
}

/** Who lives in `room` (one household per house, per flat of an apartment block, per cuarto of a tenement ...). `hhs` (a Map) caches them by key; `ctx` gives the household its place. */
export function householdForRoom(rng, bp, room, hhs, ctx = null) {
  const lot = bp.lot ?? {}, key = householdKey(bp, room);
  let hh = hhs.get(key);
  if (!hh) {
    hh = makeHousehold(rng, lot, key, { kind: occupantKind(rng, room, key), at: positionOf(ctx, bp, key), student: studentOf(ctx, bp, key), seed: ctx?.seed });
    hhs.set(key, hh);
  }
  return hh;
}
/** Every household of a building WITHOUT furnishing it: what furnishBuilding puts in `bp.interior.hh` (same keys, same order, same values). */
export function householdsOf(ctx, bp) {
  const rng = furnishRng(ctx, bp), hhs = new Map();
  for (const room of roomsInOrder(bp)) householdForRoom(rng, bp, room, hhs, ctx);
  return [...hhs.values()];
}

/** Pick the tint for a floor material (most textures are left untinted; plain ceramic gets a gentle tint). */
function floorTintFor(mat, hh) { return mat === 'floor_tile_ceramic' ? hh.ceramicTint : null; }

/** Decide room.finish. Returns the finish object (also assigned). */
export function finishRoom(room, hh, rng, bp) {
  const t = room.type, f = {};
  const unfinished = bp.lot?.kind === 'unfinished' && !(room.floor === 0 && (t === 'bedroom' || t === 'living' || t === 'kitchen' || t === 'bathroom'));
  const frng = rng.fork('finish:' + room.id);
  const paint = t === 'bedroom' ? (frng.chance(0.5) ? hh.paint.bed : hh.paint.bed2) : t === 'kitchen' || t === 'dining' ? hh.paint.kit : hh.paint.pub;
  f.ceiling = 'ceiling_white'; f.ceilingTint = 0xf3efe6;
  f.baseboard = 'trim_paint'; f.baseboardTint = hh.trimTint; f.trim = 'trim_paint'; f.trimTint = hh.trimTint;
  if (unfinished || bp.lot?.kind === 'unfinished' && room.outdoor) {
    f.floor = 'floor_concrete_raw'; f.wall = 'wall_cement_raw'; f.ceiling = 'ceiling_concrete'; delete f.ceilingTint; f.baseboard = null; f.trim = null;
    f.wainscot = null;                                                       // (a raw room has no dado: left unsaid, arch/finish.js gave a bathroom of bare concrete a tiled one 1.6 m high, a living room or a hall a painted one)
    return (room.finish = f);
  }
  const wet = t === 'bathroom';
  switch (t) {
    case 'bathroom':
      f.floor = 'floor_tile_ceramic'; f.floorTint = hh.bathTint;
      f.wall = 'wall_tile'; f.wallTint = hh.bathTint; f.wainscot = null; f.baseboard = null;
      f.wainscot = { mat: 'wall_tile', h: 2.1, tint: hh.bathTint }; f.wall = 'wall_paint'; f.wallTint = paint.c;
      break;
    case 'kitchen':
      f.floor = hh.income ? frng.pick(['floor_tile_ceramic', 'floor_tile_checker', 'floor_tile_terracotta']) : frng.pick(['floor_tile_ceramic', 'floor_cement_red', 'floor_cement']);
      f.floorTint = floorTintFor(f.floor, hh);
      f.wall = 'wall_paint'; f.wallTint = paint.c; f.wainscot = { mat: 'wall_tile', h: hh.income ? 1.5 : 1.2, tint: 0xf4f1e8 };
      break;
    case 'bedroom':
      f.floor = hh.floorBed; f.floorTint = floorTintFor(f.floor, hh); f.wall = 'wall_paint'; f.wallTint = paint.c;
      f.wainscot = hh.dado && frng.chance(0.4) ? { mat: 'wall_gloss', h: 1.0, tint: paint.d } : null;
      break;
    case 'shop':
      f.floor = hh.income ? 'floor_tile_checker' : frng.pick(['floor_cement_red', 'floor_tile_ceramic', 'floor_cement']); f.floorTint = floorTintFor(f.floor, hh);
      f.wall = 'wall_paint'; f.wallTint = frng.pick([0xf2ede2, 0xecdcb8, paint.c]); f.wainscot = { mat: 'wall_gloss', h: 1.1, tint: paint.d };
      break;
    case 'backroom': case 'laundry': case 'garage': case 'workshop':
      f.floor = t === 'workshop' || t === 'garage' ? 'floor_cement' : frng.pick(['floor_cement', 'floor_cement_red', 'floor_tile_ceramic']); f.floorTint = floorTintFor(f.floor, hh);
      f.wall = 'wall_paint_worn'; f.wallTint = t === 'workshop' || t === 'garage' ? 0xcfc8b8 : paint.c; f.wainscot = null;
      break;
    case 'patio': case 'terrace': case 'balcony':
      f.floor = t === 'patio' ? frng.pick(['floor_cement', 'floor_tile_terracotta', 'floor_cement_red']) : frng.pick(['floor_cement', 'floor_tile_terracotta']);
      f.floorTint = null; f.wall = 'wall_paint_worn'; f.wallTint = paint.c; f.wainscot = null; f.ceiling = null; f.baseboard = null;
      break;
    case 'stairwell': case 'landing': case 'corridor': case 'hall': case 'entry':
      f.floor = t === 'stairwell' || t === 'landing' ? frng.pick(['floor_cement', 'floor_tile_ceramic', 'floor_cement_red']) : hh.floorPub;
      f.floorTint = floorTintFor(f.floor, hh); f.wall = 'wall_paint'; f.wallTint = paint.c;
      f.wainscot = hh.dado ? { mat: 'wall_gloss', h: 1.1, tint: paint.d } : null;
      break;
    case 'chapel':
      f.floor = frng.pick(['floor_tile_terracotta', 'floor_tile_checker']); f.wall = 'wall_paint'; f.wallTint = 0xf2ede2;
      f.wainscot = { mat: 'wall_gloss', h: 1.0, tint: 0x2b4f86 }; f.ceiling = frng.chance(0.5) ? 'ceiling_pine' : 'ceiling_white'; if (f.ceiling === 'ceiling_pine') delete f.ceilingTint;
      break;
    case 'classroom':
      f.floor = frng.pick(['floor_tile_ceramic', 'floor_vinyl', 'floor_cement']); f.floorTint = floorTintFor(f.floor, hh); f.wall = 'wall_paint'; f.wallTint = 0xf2ede2;
      f.wainscot = { mat: 'wall_gloss', h: 1.2, tint: frng.pick([0x4a8f6a, 0x3a6f9c, 0xa8473a]) };
      break;
    case 'office':
      f.floor = hh.income ? 'floor_tile_ceramic' : 'floor_cement'; f.floorTint = floorTintFor(f.floor, hh); f.wall = 'wall_paint'; f.wallTint = paint.c; f.wainscot = null;
      break;
    default:                                     // living, dining
      f.floor = hh.floorPub; f.floorTint = floorTintFor(f.floor, hh); f.wall = 'wall_paint'; f.wallTint = paint.c;
      f.wainscot = hh.dado ? { mat: 'wall_gloss', h: frng.pick([0.9, 1.0, 1.2]), tint: paint.d } : null;
      if (hh.rustic && frng.chance(0.5)) { f.ceiling = 'ceiling_pine'; delete f.ceilingTint; }
  }
  if (bp.lot?.kind === 'clinic' && !wet) { f.floor = 'floor_vinyl'; delete f.floorTint; f.wall = 'wall_paint'; f.wallTint = 0xe8f0ec; f.wainscot = { mat: 'wall_tile', h: 1.5, tint: 0xeaf1ee }; }
  if (f.floorTint == null) delete f.floorTint;
  return (room.finish = f);
}
