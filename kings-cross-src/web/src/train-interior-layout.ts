// What is inside each Azuma-family car (Class 800, 801, 802, 803): its saloons, their class, seat count and table bays, and what stands in its
// vestibules. Pure data and arithmetic, no three.js: train-interior-at300.ts draws from it, and the tests hold the counts to the seat maps.
//
// Places along a car are `s`, metres from its cab end (a driving car) or from its start (any other), as in train.ts.
import { ASSUMED, at300Plan, bodySpec, END_GAP } from './train.ts';
import type { CarPlan } from './train.ts';
import { TRAIN_SPECS } from '../../core/train.ts';
import type { Car, TrainKind } from '../../core/train.ts';

export type SeatClass = 'standard' | 'first';

/** One saloon's seats, as the seat map gives them. */
export interface SaloonSpec {
  cls: SeatClass;
  seats: number;
  /** facing bays with a table between them (each holds two rows: 8 seats at 2+2, 6 at 2+1). The maps draw tables but nobody tallies them: ASSUMED counts. */
  tables: number;
}

/** One car's fit-out, for one operator's train. */
export interface CarFit {
  /** the coach letter on the seat map */
  coach: string;
  /** the saloons in order of s (a composite car has two, the class divide between them; its first class toward the train's first-class end) */
  saloons: SaloonSpec[];
  /** toilets in this car (each stands in a vestibule; the first is the universal-access one where `accessible`) */
  toilets: number;
  accessible?: boolean;
  /** wheelchair spaces, beside the luggage stack at the start of the first saloon */
  wheelchair?: number;
  /** a catering counter (LNER's café bar) in place of the luggage stack */
  kiosk?: boolean;
  /** no luggage stack in the saloon (Lumo keeps its luggage stores in coaches B and D) */
  noStack?: boolean;
}

/** Layout figures that no source publishes, read off the reference photographs (.scratch/interiors/refs, not shipped). ASSUMED. */
export const FIT = {
  /** the floor, metres above the rail head (the door sill, train.ts doorY[0]) */
  floor: 1.15,
  /** the inside face of the side wall, metres from the centre line (the 2.7 m body less a 70 mm wall) */
  wall: 1.26,
  /** where the side wall meets the ceiling's cove, and the ceiling's centre, metres above the rail head */
  cantrail: 2.86,
  ceiling: 3.17,
  /** the cab's back wall on a driving car: s, metres from the nose tip (behind the crew door, train.ts crewDoorFromNose) */
  cabWall: ASSUMED.noseLength + 1.05,
  /** a vestibule ends this far beyond its door's centre, where the saloon's glazed partition stands (the leaf's half-width and a little) */
  vestibuleBeyondDoor: 0.65,
  /** the end wall stands this far inside the body's end */
  endWall: 0.1,
  /** a luggage stack's length along the car, and the café bar's */
  stack: 0.9,
  kiosk: 2.6,
  /** a facing bay with a table, back to back of its two seats */
  bay: 1.85,
  /** the airline pitch a saloon's rows may not go under (no pitch is published for the AT300; 0.8 m is quoted for its successors) */
  minPitch: 0.74,
  /** and at most (a short saloon's rows spread no further: the rest is open floor) */
  maxPitch: 1.0,
} as const;

/** Seats across a row: 2+2 in standard, 2+1 in first. */
export const perRow = (cls: SeatClass): number => (cls === 'first' ? 3 : 4);

/** A kind's seat map: seats by class in each car, in the layout's car order (coach A first), and the train's totals, with where they were read. */
export interface SeatMap { cars: { standard: number; first: number }[]; standard: number; first: number; source: string }

const LNER_MAP = 'LNER, "Azuma seat maps" V3, https://assets.ctfassets.net/mxack5k9p2sw/7HuIBVepZXsWC8P2rSKNF/ac45bb6586732893c4a0df2e9c2809d0/LNER2710_Azuma_Seat_Maps_Update_V3.pdf (read 2026-11-10): seat symbols counted per coach';
/**
 * The seat maps, seat symbols counted per coach (2026-11-10). The 9-car's map numbers its seats to 596 (102 first, 494 standard, the figure LNER quotes) but draws 590:
 * coach A's numbers skip 19-22 and coach L's skip 1, 32 and 33. The drawn seats are modelled. (Wikipedia's 611 and the 5-car's 45/257 are older figures.) Lumo's map draws 386;
 * Lumo's fleet page says 390 and Wikipedia 402, unexplained: the map is modelled.
 */
export const SEAT_MAPS: Readonly<Partial<Record<TrainKind, SeatMap>>> = {
  lner5: { cars: [{ standard: 56, first: 0 }, { standard: 72, first: 0 }, { standard: 88, first: 0 }, { standard: 38, first: 30 }, { standard: 0, first: 18 }], standard: 254, first: 48, source: `${LNER_MAP}; coaches A-E, 302 seats, as the map's numbering` },
  lner9: { cars: [{ standard: 48, first: 0 }, { standard: 84, first: 0 }, { standard: 84, first: 0 }, { standard: 70, first: 0 }, { standard: 84, first: 0 }, { standard: 84, first: 0 }, { standard: 36, first: 30 }, { standard: 0, first: 55 }, { standard: 0, first: 15 }], standard: 490, first: 100, source: `${LNER_MAP}; coaches A, B, C, G, H, J, K, L, M` },
  hull5: { cars: [{ standard: 50, first: 0 }, { standard: 88, first: 0 }, { standard: 88, first: 0 }, { standard: 58, first: 18 }, { standard: 0, first: 25 }], standard: 284, first: 43, source: 'Hull Trains seating plan 2025 v2, https://www.hulltrains.co.uk/-/media/pdf-files/seating-plan-pdfs/hull-trains-seating-plan-2025-v2.pdf (read 2026-11-10): coaches A-E, 327 seats' },
  lumo5: { cars: [{ standard: 52, first: 0 }, { standard: 90, first: 0 }, { standard: 94, first: 0 }, { standard: 90, first: 0 }, { standard: 60, first: 0 }], standard: 386, first: 0, source: 'Lumo East Coast seat plan V11, https://www.lumo.co.uk/-/media/Lumo-East-Coast-seat-plan-V11.pdf (read 2026-11-10): coaches A-E, all standard' },
  // Grand Central's plan: coach F is the DMSL(A), E the MFL, D the MSL, C the MSLRB, B the DMSL(B) at the London end. It adds up to 268; GC's own page says 256
  // and Wikipedia 287 (before GC's refit), unexplained: the plan is modelled.
  gc180x5: { cars: [{ standard: 46, first: 0 }, { standard: 0, first: 42 }, { standard: 68, first: 0 }, { standard: 56, first: 0 }, { standard: 56, first: 0 }], standard: 226, first: 42, source: 'Grand Central, "GC Seating Plans 2020" (typical 5-car), https://web.archive.org/web/2022im_/https://www.grandcentralrail.com/sites/grandcentralrail.com/files/inline-images/GC%20Seating%20Plans%202020%20-%20Social%20Distanced_3.png (read 2026-11-10): coaches F, E, D, C, B' },
};

/**
 * What else each car holds, from the same maps: toilets (the universal-access one in each driving car), wheelchair spaces, the café bar, Lumo's luggage stores. Where a map
 * shows nothing for a car it has none here. The table bays are ASSUMED (the maps draw them but were not tallied): a few in each saloon, as the photographs show. The seats
 * are not repeated here: each saloon takes its class's count from SEAT_MAPS (`fitFor`).
 */
interface FitRow extends Omit<CarFit, 'saloons'> { tables: number[] }
const FIT_ROWS: Readonly<Partial<Record<TrainKind, readonly FitRow[]>>> = {
  lner5: [
    { coach: 'A', tables: [1], toilets: 1, accessible: true },
    { coach: 'B', tables: [2], toilets: 0, kiosk: true },
    { coach: 'C', tables: [2], toilets: 2 },
    { coach: 'D', tables: [1, 2], toilets: 1 },
    { coach: 'E', tables: [2], toilets: 1, accessible: true, wheelchair: 2 },
  ],
  lner9: [
    { coach: 'A', tables: [1], toilets: 1, accessible: true, wheelchair: 2 },
    { coach: 'B', tables: [2], toilets: 1 },
    { coach: 'C', tables: [2], toilets: 2 },
    { coach: 'G', tables: [2], toilets: 0, kiosk: true },
    { coach: 'H', tables: [2], toilets: 2 },
    { coach: 'J', tables: [2], toilets: 2 },
    { coach: 'K', tables: [1, 2], toilets: 0 },
    { coach: 'L', tables: [3], toilets: 1 },
    { coach: 'M', tables: [1], toilets: 1, accessible: true, wheelchair: 2 },
  ],
  hull5: [
    { coach: 'A', tables: [1], toilets: 1, accessible: true, wheelchair: 1 },
    { coach: 'B', tables: [2], toilets: 0 },
    { coach: 'C', tables: [2], toilets: 2 },
    { coach: 'D', tables: [1, 1], toilets: 1 },
    { coach: 'E', tables: [2], toilets: 1, accessible: true, wheelchair: 1 },
  ],
  lumo5: [
    { coach: 'A', tables: [1], toilets: 1, accessible: true, wheelchair: 2 },
    { coach: 'B', tables: [0], toilets: 1 },
    { coach: 'C', tables: [1], toilets: 0, noStack: true },
    { coach: 'D', tables: [0], toilets: 1 },
    { coach: 'E', tables: [1], toilets: 1, accessible: true },
  ],
  // the plan: a toilet in every car, the accessible one (and two wheelchair spaces) in F, one space in E, the buffet counter in C, D's luggage space in
  // a vestibule (so no stack in its saloon); the tables a few bays a car, as the plan draws them (ASSUMED counts, fewer where the pitch would not allow)
  gc180x5: [
    { coach: 'F', tables: [4], toilets: 1, accessible: true, wheelchair: 2 },
    { coach: 'E', tables: [3], toilets: 1, wheelchair: 1 },
    { coach: 'D', tables: [2], toilets: 1, noStack: true },
    { coach: 'C', tables: [1], toilets: 1, kiosk: true },
    { coach: 'B', tables: [4], toilets: 1 },
  ],
};

/** The fit-out of car `car` of a train of `kind`; undefined where none is known (the model then draws an empty saloon of the car's class). */
export function fitFor(kind: TrainKind, car: Pick<Car, 'index'>): CarFit | undefined {
  const row = FIT_ROWS[kind]?.[car.index], map = SEAT_MAPS[kind]?.cars[car.index];
  if (!row || !map) return undefined;
  // a composite's standard saloon first, its first class toward the train's first-class (rear) end
  const saloons: SaloonSpec[] = [];
  if (map.standard) saloons.push({ cls: 'standard', seats: map.standard, tables: row.tables[0] ?? 0 });
  if (map.first) saloons.push({ cls: 'first', seats: map.first, tables: row.tables[saloons.length] ?? 0 });
  const { tables: _tables, ...rest } = row;
  return { ...rest, saloons };
}

/** One seat: where it is (x across, s along), which way it faces (+1 toward larger s), its class and whether a table stands before it. */
export interface Seat { x: number; s: number; facing: 1 | -1; cls: SeatClass; table: boolean }
/** A table between two facing rows, across one side's seats. */
export interface Table { x0: number; x1: number; s: number }
/** One zone along the car, from s0 to s1. */
export interface Zone { kind: 'cab' | 'vestibule' | 'saloon'; s0: number; s1: number; cls?: SeatClass }
/** A wall across the car at s, and what opening it has. */
export interface CrossWall { s: number; kind: 'cab' | 'end' | 'partition' | 'class' | 'gangway' }

export interface CarInterior {
  zones: Zone[];
  walls: CrossWall[];
  seats: Seat[];
  tables: Table[];
  /** luggage stacks and kiosks: [s0, s1] at side x (+1 right, -1 left) */
  stacks: { s0: number; s1: number; side: 1 | -1; kiosk: boolean }[];
  toilets: { s0: number; s1: number; side: 1 | -1; accessible: boolean }[];
  /** wheelchair spaces: clear floor on the left at the first saloon's start, opposite the stack */
  wheelchair: { s0: number; s1: number; side: -1 }[];
  coach: string;
  /** the airline pitch each saloon came to */
  pitch: number[];
  doors: number[];
  /** [from, to] of each passenger window, as the car's plan has them for the train it stands in (train.ts `CarPlan`): the openings the shell cuts, where a first-class driving car's blank bays have none */
  windows: [number, number][];
}

/** Seat centres across the car for a class, right (+x) side first, as [x, side]. */
export function seatColumns(cls: SeatClass): { x: number; side: 1 | -1 }[] {
  // 2+2: two 0.465 m seats each side of a 0.58 m aisle; 2+1: one 0.6 m seat on the right, two 0.58 m on the left, a 0.68 m aisle (ASSUMED widths)
  return cls === 'first'
    ? [{ x: 0.92, side: 1 }, { x: -0.35, side: -1 }, { x: -0.93, side: -1 }]
    : [{ x: 0.52, side: 1 }, { x: 0.99, side: 1 }, { x: -0.52, side: -1 }, { x: -0.99, side: -1 }];
}

/** Half the width of one seat of a class. */
export const seatHalf = (cls: SeatClass): number => (cls === 'first' ? 0.29 : 0.232);

/**
 * Lay a car out: its zones (cab, vestibules, saloons), cross walls, and every seat. The saloons lie between the vestibules round the doors; a composite car's
 * two saloons split its length in proportion to their seats' floor. Rows of airline seats face the saloon's middle, where the table bays stand.
 */
export function layoutCar(kind: TrainKind, car: Car): CarInterior {
  const body = intercityBody(kind, car);
  const plan = body.plan;
  const L = car.length;
  const tip = car.cab ? body.nose : END_GAP;
  const end = L - END_GAP - FIT.endWall;
  const zones: Zone[] = [];
  const walls: CrossWall[] = [];
  const front = car.cab ? body.cabWall : END_GAP + FIT.endWall;
  if (car.cab) { zones.push({ kind: 'cab', s0: tip, s1: front }); walls.push({ s: front, kind: 'cab' }); }
  else walls.push({ s: front, kind: 'end' });
  walls.push({ s: end, kind: 'end' });
  const [d0, d1] = plan.doors as [number, number];
  const fit = fitFor(kind, car);
  // the toilets stand in the vestibules between an end wall (or the cab's back wall) and the door: the accessible one at the cab end of a driving car,
  // the others at the far end first, then the near one, on alternate sides. Where a door stands too near its end for a toilet to fit behind it (the Class 180's, beside
  // its gangway: round 8), the toilet stands on the saloon's side of the door instead, behind the blank panel between the door and its nearest window (no deeper than that panel), and
  // the vestibule's partition moves in past it (ASSUMED: no seat map read shows where)
  const doorEdge = body.doorWidth / 2 + 0.05;
  const firstWindow = Math.min(...plan.windows.map((w) => w[0]));
  const lastWindow = Math.max(...plan.windows.map((w) => w[1]));
  const toiletPlan: { s0: number; s1: number; side: 1 | -1; accessible: boolean }[] = [];
  let sA = d0 + FIT.vestibuleBeyondDoor, sB = d1 - FIT.vestibuleBeyondDoor;
  for (let t = 0; t < (fit?.toilets ?? 0); t++) {
    const accessible = Boolean(fit?.accessible && t === 0);
    const atEnd = !(accessible && car.cab) && t % 2 === 0;
    const depth = accessible ? 2.0 : 1.5;
    const side = t % 2 === 0 ? 1 : -1;
    if (atEnd) {
      if (end - (d1 + doorEdge) >= 0.5) toiletPlan.push({ s0: Math.max(d1 + doorEdge, end - depth), s1: end, side, accessible });
      else { const s1 = Math.min(sB, d1 - doorEdge); const s0 = Math.max(s1 - depth, lastWindow + 0.05); toiletPlan.push({ s0, s1, side, accessible }); sB = s0; }
    } else {
      if (d0 - doorEdge - front >= 0.5) toiletPlan.push({ s0: front, s1: Math.min(d0 - doorEdge, front + depth), side, accessible });
      else { const s0 = Math.max(sA, d0 + doorEdge); const s1 = Math.min(s0 + depth, firstWindow - 0.05); toiletPlan.push({ s0, s1, side, accessible }); sA = s1; }
    }
  }
  zones.push({ kind: 'vestibule', s0: front, s1: sA });
  walls.push({ s: sA, kind: 'partition' }, { s: sB, kind: 'partition' });
  const saloons: SaloonSpec[] = fit?.saloons ?? [{ cls: car.type === 'MF' || car.type === 'DPTF' ? 'first' : 'standard', seats: 0, tables: 0 }];
  // the first saloon has the luggage stack (or the café bar) at its start; a composite's second starts at the class divide
  const lead = (i: number): number => (i > 0 || fit?.noStack ? 0 : fit?.kiosk ? FIT.kiosk : FIT.stack) + 0.15;
  // a composite's saloons share the floor in proportion to what their seats need at the least pitch
  const need = (sp: SaloonSpec, i: number): number => sp.tables * FIT.bay + Math.max(0, Math.ceil(sp.seats / perRow(sp.cls)) - 2 * sp.tables) * FIT.minPitch + lead(i) + 0.3;
  const total = saloons.reduce((a, sp, i) => a + need(sp, i), 0);
  const seats: Seat[] = [];
  const tables: Table[] = [];
  const stacks: CarInterior['stacks'] = [];
  const toilets: CarInterior['toilets'] = [];
  const pitch: number[] = [];
  let at = sA;
  saloons.forEach((sp, i) => {
    const s0 = at, s1 = i === saloons.length - 1 ? sB : sA + (sB - sA) * (saloons.slice(0, i + 1).reduce((a, x, k) => a + need(x, k), 0) / total);
    at = s1;
    if (i > 0) walls.push({ s: s0, kind: 'class' });
    zones.push({ kind: 'saloon', s0, s1, cls: sp.cls });
    pitch.push(laySaloon(sp, s0 + lead(i), s1, seats, tables));
    if (i === 0 && !fit?.noStack) stacks.push({ s0: s0 + 0.05, s1: s0 + 0.05 + (fit?.kiosk ? FIT.kiosk : FIT.stack), side: 1, kiosk: Boolean(fit?.kiosk) });
  });
  zones.push({ kind: 'vestibule', s0: sB, s1: end });
  toilets.push(...toiletPlan);
  const first = zones.find((z) => z.kind === 'saloon') as Zone;
  const wheelchair = fit?.wheelchair ? [{ s0: first.s0 + 0.05, s1: first.s0 + 0.05 + 0.75 * fit.wheelchair, side: -1 as const }] : [];
  return { zones, walls: walls.sort((a, b) => a.s - b.s), seats, tables, stacks, toilets, wheelchair, pitch, doors: plan.doors, windows: plan.windows, coach: fit?.coach ?? '' };
}

/**
 * An intercity car's body, as the layout needs it: the plan (doors and windows), the nose's length, the door's width and where the cab's back wall
 * stands. The Azuma's are train.ts's own and `FIT.cabWall`; another family's come from its `bodySpec`, its cab wall 1.05 m behind the nose as on
 * the Azuma, or 0.2 m short of the first door's opening where that is nearer (the Class 180's long nose carries its cab: ASSUMED).
 */
function intercityBody(kind: TrainKind, car: Car): { plan: CarPlan; nose: number; doorWidth: number; cabWall: number } {
  const family = TRAIN_SPECS[kind].family;
  if (family === 'at300') return { plan: at300Plan(car, kind), nose: ASSUMED.noseLength, doorWidth: ASSUMED.doorWidth, cabWall: FIT.cabWall };
  const spec = bodySpec(family);
  const plan = spec.plan(car, false);
  const nose = spec.nose.length;
  return { plan, nose, doorWidth: spec.doorWidth, cabWall: Math.min(nose + 1.05, (plan.doors[0] as number) - spec.doorWidth / 2 - 0.2) };
}

/** Lay one saloon's seats from s0 to s1: airline rows facing the middle, the table bays in the middle. Answers the airline pitch used. */
function laySaloon(sp: SaloonSpec, s0: number, s1: number, seats: Seat[], tables: Table[]): number {
  const r = perRow(sp.cls);
  const cols = seatColumns(sp.cls);
  const airlineSeats = Math.max(0, sp.seats - sp.tables * 2 * r);
  const rows = Math.ceil(airlineSeats / r);
  // s0 is already clear of the luggage stack (layoutCar); clear of the partitions
  const a0 = s0 + 0.15, a1 = s1 - 0.15;
  const free = a1 - a0 - sp.tables * FIT.bay;
  const p = rows ? Math.min(FIT.maxPitch, free / rows) : 0;
  // the rows before the bays face +s, those after face -s; the bays sit in the middle of whatever floor is left
  const before = Math.ceil(rows / 2), after = rows - before;
  const used = rows * p + sp.tables * FIT.bay;
  let at = a0 + (a1 - a0 - used) / 2;
  // the seats left out of a full grid (a part row, wheelchair spaces) come off the last row's left side, nearest the aisle first
  let left = airlineSeats;
  const row = (facing: 1 | -1, back: number, table: boolean, count = r): void => {
    // the cushion's centre is 0.3 m in front of the seat's back
    const s = back + facing * 0.3;
    const order = count < r ? cols.filter((c) => c.side === 1).concat(cols.filter((c) => c.side === -1)).slice(0, count) : cols;
    for (const c of order) seats.push({ x: c.x, s, facing, cls: sp.cls, table });
  };
  for (let k = 0; k < before; k++) { const n = Math.min(r, left); row(1, at, false, n); left -= n; at += p; }
  for (let b = 0; b < sp.tables; b++) {
    row(1, at, true); row(-1, at + FIT.bay, true);
    for (const side of [1, -1] as const) {
      const xs = cols.filter((c) => c.side === side).map((c) => c.x);
      const h = seatHalf(sp.cls);
      tables.push({ x0: Math.min(...xs) - h, x1: Math.max(...xs) + h, s: at + FIT.bay / 2 });
    }
    at += FIT.bay;
  }
  for (let k = 0; k < after; k++) { const n = Math.min(r, left); at += p; row(-1, at, false, n); left -= n; }
  return p;
}
