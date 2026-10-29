// Households (who lives here) and room finishes. Pure data. Everything is derived from the lot seed, so a house is stable
// across loads and every neighbour differs.

import { PAL } from './catalog.js';

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

export const NAMES = {
  women: ['Rosalba', 'Gilma', 'Amparo', 'Luz Marina', 'Nubia', 'Marleny', 'Esperanza', 'Consuelo', 'Ligia', 'Carmenza', 'Edilma', 'Fanny'],
  men: ['Hernán', 'Alirio', 'Ramiro', 'Gonzalo', 'Libardo', 'Aníbal', 'Evelio', 'Jairo', 'Octavio', 'Wilson', 'Néstor', 'Duván'],
  kids: ['Santiago', 'Valentina', 'Mateo', 'Sofía', 'Juan David', 'Camila', 'Sebastián', 'Isabella', 'Samuel', 'Luciana', 'Andrés', 'Mariana'],
  surnames: ['Restrepo', 'Gómez', 'Ramírez', 'Moreno', 'Quintero', 'Cárdenas', 'Mosquera', 'Chará', 'Cuéllar', 'Tovar', 'Palacios', 'Ochoa', 'Valencia', 'Pineda', 'Cano', 'Arboleda'],
};
// generic football colours: no crests, no real clubs
export const TEAMS = [
  { a: 0xc8302a, b: 0xf2f2ee, n: 'rojiblancos' }, { a: 0x2c7a3f, b: 0xf2f2ee, n: 'verdiblancos' }, { a: 0xe8c332, b: 0x2a4f9a, n: 'amarillo y azul' },
  { a: 0x2a4f9a, b: 0xc8302a, n: 'azul y rojo' }, { a: 0x2a4f9a, b: 0xf2f2ee, n: 'azul y blanco' }, { a: 0x6a1f2e, b: 0xe8c332, n: 'vinotinto' },
];

const pickW = (rng, table) => rng.weighted(table, (t) => t[1])[0];

/**
 * One household. key = what makes it unique (building id + flat/room). o: { kind?: forced persona, shop?: bool }
 */
export function makeHousehold(rng, lot, key, o = {}) {
  const hrng = rng.fork('hh:' + key);
  let kind = o.kind;
  if (!kind) {
    const lk = lot.kind;
    if (o.shop || lk === 'shophouse' || lk === 'cornerstore' || lk === 'kiosk') kind = 'shopkeeper';
    else if (lk === 'apartments') kind = pickW(hrng, [['family', 4], ['couple', 3], ['students', 2], ['elder', 3]]);
    else if (lk === 'tenement') kind = pickW(hrng, [['family', 3], ['elder', 3], ['students', 3], ['couple', 2]]);
    else kind = pickW(hrng, [['family', 6], ['elder', 2], ['couple', 2], ['students', 1]]);
  }
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
  const w = hrng.pick(NAMES.women), m = hrng.pick(NAMES.men), sur = hrng.pick(NAMES.surnames);
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
    names: { woman: w, man: m, sur, don: 'don ' + m, dona: 'doña ' + w, kid: hrng.pick(NAMES.kids), kid2: hrng.pick(NAMES.kids) },
    seed: hrng.int(1, 1e9),
  };
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
