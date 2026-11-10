// What is inside each commuter car (Great Northern's Class 387 and 717, Thameslink's Class 700): two pairs of doors a side, a vestibule at
// each, and three saloons: one each side of the doors and one between them. Pure data and arithmetic, no three.js:
// train-interior-commuter.ts draws from it, and the tests hold the counts to the published ones.
//
// Places along a car are `s`, metres from its cab end (a driving car) or from its start (any other), as in train.ts.
import { bodySpec, END_GAP } from './train.ts';
import { TRAIN_SPECS } from '../../core/train.ts';
import type { Car, TrainKind } from '../../core/train.ts';
import { FIT } from './train-interior-layout.ts';
import type { CarInterior, CrossWall, Seat, SeatClass, Table, Zone } from './train-interior-layout.ts';

/** One saloon's seats: facing bays and airline rows, 2+2 (the photographs show no longitudinal seats but the tip-ups by the doors, which are neither counted nor drawn). */
export interface CommuterSaloon {
  /** facing pairs of rows (eight seats) */
  bays: number;
  /** airline rows (four seats), facing the saloon's middle */
  rows?: number;
  /** of the bays, those with a table between the rows */
  tables?: number;
  /** seats left out of the last airline row (or the last bay, if there are no rows), for a count that is not a whole number of rows */
  less?: number;
  cls?: SeatClass;
}

/** One car's fit-out: its three saloons (before the first door, between the doors, after the second), and what else stands in it. */
export interface CommuterCar {
  coach: string;
  saloons: readonly [CommuterSaloon, CommuterSaloon, CommuterSaloon];
  /** a toilet at the start of the last saloon, against the right side: the universal-access one where `accessible` */
  toilet?: 'accessible' | 'standard';
  /** wheelchair spaces, on the left at the start of the last saloon, opposite the toilet */
  wheelchair?: number;
  /** a glazed partition between the first class (saloons before it) and standard (at it and after) */
  classDivide?: 1 | 2;
}

/** Layout figures no source publishes, read off the reference photographs (.scratch/interiors/refs, not shipped). ASSUMED. */
export const COMMUTER_FIT = {
  /** a vestibule runs this far beyond each edge of its doorway */
  vestibule: 0.25,
  /** a facing bay, back to back of its two seats */
  bay: 1.7,
  /** back to back of two bays */
  bayGap: 0.08,
  /** the airline pitch */
  pitch: 0.78,
  /** a toilet's length along the car, and a wheelchair space's */
  toilet: { accessible: 2.2, standard: 1.4 },
  wheelchair: 0.85,
} as const;

export interface CommuterInterior extends CarInterior {
  /** the vestibules' doorways, for the draught screens and the poles */
  vestibules: { s0: number; s1: number; door: number }[];
}

/** Seats in one saloon as specified. */
export const saloonSeats = (sp: CommuterSaloon): number => sp.bays * 8 + (sp.rows ?? 0) * 4 - (sp.less ?? 0);

/** 2+2 columns, whatever the class (a commuter's first class is 2+2 too, in wider seats: ASSUMED narrower aisle). */
const COLUMNS: readonly { x: number; side: 1 | -1 }[] = [{ x: 0.52, side: 1 }, { x: 0.99, side: 1 }, { x: -0.52, side: -1 }, { x: -0.99, side: -1 }];

/** A kind's published seats by car, and where they were read. */
export interface CommuterMap { cars: { standard: number; first: number }[]; source: string }

// --- the fits: how each car's seats stand in its three saloons (ASSUMED arrangements that add up to the counts below) ---
const S = (bays: number, rows = 0, extra: Partial<CommuterSaloon> = {}): CommuterSaloon => ({ bays, rows, ...extra });

/**
 * Great Northern's 387/1, 2+2 throughout, table bays and airline rows (gn387-standard-saloon, gn387-thameslink-era-standard). Per car 56, 62, 45 and
 * 60 seats (Platform 5, 2021, as quoted at https://www.railforums.co.uk/goto/post?id=5898698, read 2026-11-10: a secondary source; which driving car
 * has 56 and which 60 is ASSUMED). The first-class area some units keep behind one cab is not modelled (no source says GN still sells it): its seats
 * are drawn as standard. The toilet in the MSO, and the accessible one with two wheelchair spaces in the PTSO, are ESTIMATES from forum reports.
 */
const GN387: readonly CommuterCar[] = [
  { coach: 'DMSO', saloons: [S(0, 1), S(4, 3, { tables: 2 }), S(1, 0)] },
  { coach: 'MSO', saloons: [S(1, 1), S(4, 3, { tables: 2 }), S(1, 0, { less: 2 })], toilet: 'standard' },
  { coach: 'PTSO', saloons: [S(1, 1), S(3, 2, { tables: 1, less: 3 }), S(0, 1)], toilet: 'accessible', wheelchair: 2 },
  { coach: 'DMSO', saloons: [S(0, 1), S(4, 3, { tables: 2 }), S(1, 1)] },
];
const GN387_MAP: CommuterMap = { cars: [56, 62, 45, 60].map((standard) => ({ standard, first: 0 })), source: 'Platform 5 (2021) per car, as quoted at https://www.railforums.co.uk/goto/post?id=5898698 (read 2026-11-10); 223 a unit' };

/**
 * Great Northern's 717: 362 seats, all standard, 2+2 in bays and airline rows, no toilet, two wheelchair spaces in the TOS(L)W (GTR press
 * release https://www.mynewsdesk.com/uk/gtr/pressreleases/passengers-given-first-glimpse-of-new-trains-set-to-transform-great-northern-suburban-service-2728112;
 * Siemens, https://assets.new.siemens.com/siemens/assets/api/uuid:f3fefc372beb2112fe20b2704888468d2157dc27/db-desiro-city-moorgate-en.pdf: "362 excl.
 * tip-ups"; read 2026-11-10). No per-car count is published: 53, 64, 58, 67, 67, 53 is an ESTIMATE that adds up to 362 (a cab or the wheelchair
 * space costs a car seats). The side-facing tip-ups by the doors are not counted, and not drawn.
 */
const GN717: readonly CommuterCar[] = [
  { coach: 'DMOS', saloons: [S(0), S(3, 5), S(1, 1, { less: 3 })] },
  { coach: 'TOS', saloons: [S(1, 1), S(3, 4), S(1, 1)] },
  { coach: 'TOS(L)W', saloons: [S(1, 1), S(3, 5), S(0, 1, { less: 2 })], wheelchair: 2 },
  { coach: 'MOS', saloons: [S(1, 1), S(3, 5), S(1, 1, { less: 1 })] },
  { coach: 'PTOS', saloons: [S(1, 1), S(3, 5), S(1, 1, { less: 1 })] },
  { coach: 'DMOS', saloons: [S(0), S(3, 5), S(1, 1, { less: 3 })] },
];
const GN717_MAP: CommuterMap = { cars: [53, 64, 58, 67, 67, 53].map((standard) => ({ standard, first: 0 })), source: 'GTR and Siemens: 362 a unit, all standard (read 2026-11-10); the split by car is an ESTIMATE' };

/**
 * Thameslink's 700: the 700/0 52 first and 373 standard, the 700/1 52 first and 614 standard (Wikipedia, British Rail Class 700, read 2026-11-10; its
 * 700/0 total of 427 is two more than its split, which is modelled). First class is the DMCO's saloon between its doors, 2+2 with tables, behind a
 * glazed partition (tl700-first-class; Thameslink's train guide). The accessible toilet and the wheelchair spaces are in the middle two cars, the
 * TSOW and TSOLW (the guide); the standard toilets in the PTSOs and, on the 12-car, the TSOs are an ESTIMATE. No per-car count is published: 26
 * first a DMCO, and the standard split below, are ESTIMATES that add up to the totals.
 */
const TL_DMCO: CommuterCar = { coach: 'DMCO', saloons: [S(0), S(3, 1, { tables: 3, less: 2, cls: 'first' }), S(1, 1)], classDivide: 2 };
const TL_PTSO: CommuterCar = { coach: 'PTSO', saloons: [S(1, 1), S(4, 2), S(0, 2)], toilet: 'standard' };
const TL_MSO: CommuterCar = { coach: 'MSO', saloons: [S(1, 1), S(4, 2), S(1, 1)] };
const TL_TSOW: CommuterCar = { coach: 'TSOW', saloons: [S(1, 1), S(3, 3, { less: 1 }), S(0, 1)], wheelchair: 2 };
const TL_TSOLW: CommuterCar = { coach: 'TSOLW', saloons: [S(1, 1), S(3, 3), S(0, 1, { less: 2 })], toilet: 'accessible' };
const tlTso = (less: number): CommuterCar => ({ coach: 'TSO', saloons: [S(1, 1), S(4, 2), S(0, 2, { less })], toilet: 'standard' });
const TL8: readonly CommuterCar[] = [TL_DMCO, TL_PTSO, TL_MSO, TL_TSOW, TL_TSOLW, TL_MSO, TL_PTSO, TL_DMCO];
const TL12: readonly CommuterCar[] = [TL_DMCO, TL_PTSO, TL_MSO, TL_MSO, tlTso(4), TL_TSOW, TL_TSOLW, tlTso(3), TL_MSO, TL_MSO, TL_PTSO, TL_DMCO];
const TL_SOURCE = 'Wikipedia, British Rail Class 700 (read 2026-11-10): 700/0 52 first and 373 standard, 700/1 52 first and 614 standard; the split by car is an ESTIMATE';

/** The kinds' fits, car by car in the layout's order. */
export const COMMUTER_FITS: Readonly<Partial<Record<TrainKind, readonly CommuterCar[]>>> = {
  gn387x4: GN387, gn387x8: [...GN387, ...GN387], gn387x12: [...GN387, ...GN387, ...GN387],
  gn717x6: GN717,
  tl700x8: TL8, tl700x12: TL12,
};
/** The published (or estimated, as each source says) seats by car, which the fits are held to. */
export const COMMUTER_MAPS: Readonly<Partial<Record<TrainKind, CommuterMap>>> = {
  gn387x4: GN387_MAP,
  gn387x8: { cars: [...GN387_MAP.cars, ...GN387_MAP.cars], source: `${GN387_MAP.source}; two units` },
  gn387x12: { cars: [...GN387_MAP.cars, ...GN387_MAP.cars, ...GN387_MAP.cars], source: `${GN387_MAP.source}; three units` },
  gn717x6: GN717_MAP,
  tl700x8: { cars: [26, 0, 0, 0, 0, 0, 0, 26].map((first, i) => ({ first, standard: [12, 60, 64, 51, 50, 64, 60, 12][i]! })), source: TL_SOURCE },
  tl700x12: { cars: [26, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26].map((first, i) => ({ first, standard: [12, 60, 64, 64, 56, 51, 50, 57, 64, 64, 60, 12][i]! })), source: TL_SOURCE },
};

/** Lay a commuter car out: the zones, the cross walls, the seats in their bays and rows, the toilet and the wheelchair spaces. */
export function layoutCommuter(kind: TrainKind, car: Car): CommuterInterior {
  const spec = bodySpec(TRAIN_SPECS[kind].family);
  const plan = spec.plan(car, false);
  const dw = spec.doorWidth;
  const L = car.length;
  const walk = TRAIN_SPECS[kind].family !== 'electrostar';
  const end = L - END_GAP - FIT.endWall;
  const front = car.cab ? Math.min(spec.nose.length + 1.05, (plan.doors[0] as number) - dw / 2 - 0.6) : END_GAP + FIT.endWall;
  const walls: CrossWall[] = [{ s: front, kind: car.cab ? 'cab' : walk ? 'gangway' : 'end' }, { s: end, kind: walk ? 'gangway' : 'end' }];
  const [d0, d1] = plan.doors as [number, number];
  const v = COMMUTER_FIT.vestibule;
  const vestibules = [d0, d1].map((door) => ({ s0: door - dw / 2 - v, s1: door + dw / 2 + v, door }));
  const fit = COMMUTER_FITS[kind]?.[car.index];
  const saloons = fit?.saloons ?? [{ bays: 0 }, { bays: 0 }, { bays: 0 }];
  const spans: [number, number][] = [[front, vestibules[0]!.s0], [vestibules[0]!.s1, vestibules[1]!.s0], [vestibules[1]!.s1, end]];
  const zones: Zone[] = [];
  const seats: Seat[] = [];
  const tables: Table[] = [];
  const toilets: CarInterior['toilets'] = [];
  const wheelchair: CarInterior['wheelchair'] = [];
  const pitch: number[] = [];
  const cf = COMMUTER_FIT;
  saloons.forEach((sp, i) => {
    const [z0, z1] = spans[i] as [number, number];
    const cls = sp.cls ?? 'standard';
    zones.push({ kind: 'saloon', s0: z0, s1: z1, cls });
    if (i < 2) zones.push({ kind: 'vestibule', s0: vestibules[i]!.s0, s1: vestibules[i]!.s1 });
    if (fit?.classDivide === i && i > 0) walls.push({ s: z0 + 0.03, kind: 'class' });
    let a0 = z0 + (fit?.classDivide === i && i > 0 ? 0.1 : 0);
    const a1 = z1;
    // the toilet and the wheelchair spaces stand at the start of the last saloon, after the door
    if (i === 2 && fit?.toilet) {
      const len = cf.toilet[fit.toilet];
      toilets.push({ s0: a0, s1: a0 + len, side: 1, accessible: fit.toilet === 'accessible' });
      if (fit.wheelchair) wheelchair.push({ s0: a0, s1: a0 + cf.wheelchair * fit.wheelchair, side: -1 });
      a0 += Math.max(len, fit.wheelchair ? cf.wheelchair * fit.wheelchair : 0) + 0.05;
    } else if (i === 2 && fit?.wheelchair) {
      wheelchair.push({ s0: a0, s1: a0 + cf.wheelchair * fit.wheelchair, side: -1 });
      a0 += cf.wheelchair * fit.wheelchair + 0.05;
    }
    pitch.push(layBays(sp, cls, a0, a1, seats, tables));
  });
  return { zones: zones.sort((p, q) => p.s0 - q.s0), walls: walls.sort((p, q) => p.s - q.s), seats, tables, stacks: [], toilets, wheelchair, pitch, doors: plan.doors, coach: fit?.coach ?? '', vestibules };
}

/** Lay one saloon's bays and rows from a0 to a1: rows facing +s, the bays, rows facing -s, centred. Answers the airline pitch used (0 with none). */
function layBays(sp: CommuterSaloon, cls: SeatClass, a0: number, a1: number, seats: Seat[], tables: Table[]): number {
  const cf = COMMUTER_FIT;
  const rows = sp.rows ?? 0;
  const before = Math.ceil(rows / 2), after = rows - before;
  const used = rows * cf.pitch + sp.bays * cf.bay + Math.max(0, sp.bays - 1) * cf.bayGap;
  let at = a0 + Math.max(0, (a1 - a0 - used) / 2);
  // seats left out come off the last row (or bay), the left side, nearest the aisle first
  let skip = sp.less ?? 0;
  const lastRow = rows > 0 ? rows - 1 : -1;
  const row = (facing: 1 | -1, back: number, table: boolean, drop: number): void => {
    const s = back + facing * 0.3;
    const cols = drop ? COLUMNS.slice(0, COLUMNS.length - drop) : COLUMNS;
    for (const c of cols) seats.push({ x: c.x, s, facing, cls, table });
  };
  let r = 0;
  const airline = (facing: 1 | -1): void => {
    const drop = r === lastRow ? Math.min(skip, 4) : 0;
    if (drop) skip -= drop;
    if (facing === 1) { row(1, at, false, drop); at += cf.pitch; } else { at += cf.pitch; row(-1, at, false, drop); }
    r++;
  };
  for (let k = 0; k < before; k++) airline(1);
  for (let b = 0; b < sp.bays; b++) {
    if (b > 0) at += cf.bayGap;
    const table = b < (sp.tables ?? 0);
    const drop = lastRow < 0 && b === sp.bays - 1 ? Math.min(skip, 4) : 0;
    row(1, at, table, 0); row(-1, at + cf.bay, table, drop);
    if (table) for (const side of [1, -1] as const) {
      const xs = COLUMNS.filter((c) => c.side === side).map((c) => c.x);
      tables.push({ x0: Math.min(...xs) - 0.232, x1: Math.max(...xs) + 0.232, s: at + cf.bay / 2 });
    }
    at += cf.bay;
  }
  for (let k = 0; k < after; k++) airline(-1);
  return rows ? cf.pitch : 0;
}
