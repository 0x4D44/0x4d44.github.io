// PTAC fleet evidence for Edinburgh Waverley (TD area EB).
//
// The relay keeps Network Rail's Passenger Train Allocation and Consist feed for trains with a
// segment starting or ending at Edinburgh (relay/ptac.mjs, store format kx-ptac/1) and serves it as
// the `ptac` section of GET /fleet?area=EB. This module checks that store and answers "which units
// (class and vehicles each) does headcode H have at time T?" as an EvidenceSource, to be placed ahead
// of the booked diagrams in firstEvidence.
//
// PTAC is Network Rail's PLANNED allocation (what the operator has allocated to the train), not an
// observation of the unit passing; its basis is 'PTAC allocation'.
//
// Unit order: the store lists units in PTAC's ResourceGroupPosition order. Whether position 1 is the
// front in the direction of travel is NOT established, so a formation of unlike units (a 3+4, a
// 158+170) is flagged orderAssumed. Identical units have no order to get wrong.
//
// Pure string and number code: no node: imports, no three.js. The store is private data; only
// invented records belong in tests and source.
import type { EvidenceSource } from './edinburgh-diagrams.ts';
import type { EdinburghServiceEvidence, EvidenceUnit } from './train-neutral.ts';

export const PTAC_STORE_FORMAT = 'kx-ptac/1';

/** One train as relay/ptac.mjs stores it (only the fields read here are typed). */
export interface PtacTrain {
  readonly date: string;
  readonly headcode: string;
  /** ATOC code; null when the operator's company code is not mapped. */
  readonly operator: string | null;
  /** Planned London wall-clock times at Edinburgh, 'YYYY-MM-DDTHH:MM:SS' with no zone; null when none. */
  readonly edbArr: string | null;
  readonly edbDep: string | null;
  /** Distinct classes of the units at Edinburgh. */
  readonly classes: readonly string[];
  /** Unit numbers in ResourceGroupPosition order, and per unit its vehicle count and FleetId ('158/7'). */
  readonly units: readonly string[];
  readonly unitVehicles: readonly number[];
  /** Absent in records written before the field existed; then only a one-class train is usable. */
  readonly unitFleets?: readonly (string | null)[];
}
export interface PtacStore {
  readonly format: typeof PTAC_STORE_FORMAT;
  readonly trains: Readonly<Record<string, PtacTrain>>;
}

const HEADCODE = /^\d[A-Z]\d{2}$/;
const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
const CLASS = /^[0-9A-Za-z]{1,8}$/;
const MAX_TRAINS = 20_000;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const wallOrNull = (v: unknown): boolean => v === null || (typeof v === 'string' && WALL.test(v));

function validTrain(t: unknown): t is PtacTrain {
  if (!isRecord(t)) return false;
  const { headcode, operator, edbArr, edbDep, classes, units, unitVehicles, unitFleets } = t;
  if (typeof headcode !== 'string' || !HEADCODE.test(headcode)) return false;
  if (operator !== null && (typeof operator !== 'string' || !/^[A-Z]{2}$/.test(operator))) return false;
  if (!wallOrNull(edbArr) || !wallOrNull(edbDep) || (edbArr === null && edbDep === null)) return false;
  if (!Array.isArray(classes) || classes.some(c => typeof c !== 'string')) return false;
  if (!Array.isArray(units) || !units.length || units.length > 8 || units.some(u => typeof u !== 'string')) return false;
  if (!Array.isArray(unitVehicles) || unitVehicles.length !== units.length || unitVehicles.some(n => !Number.isInteger(n) || n < 1 || n > 20)) return false;
  if (unitFleets !== undefined && (!Array.isArray(unitFleets) || unitFleets.length !== units.length || unitFleets.some(f => f !== null && typeof f !== 'string'))) return false;
  return true;
}

/**
 * Shape check for the store the relay serves. Throws when it is not a kx-ptac/1 store at all; drops (never
 * repairs) a train record that is malformed, so one bad record cannot hide the rest.
 */
export function validatePtacStore(value: unknown): PtacStore {
  if (!isRecord(value) || value.format !== PTAC_STORE_FORMAT || !isRecord(value.trains)) throw new Error('ptac store: kx-ptac/1 object required');
  const entries = Object.entries(value.trains);
  if (entries.length > MAX_TRAINS) throw new Error('ptac store: too many trains');
  const trains: Record<string, PtacTrain> = {};
  for (const [key, train] of entries) if (validTrain(train)) trains[key] = train;
  return { format: PTAC_STORE_FORMAT, trains };
}

const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function londonOffsetMs(ms: number): number {
  const p = new Map(LONDON.formatToParts(new Date(ms)).map((x): [string, number] => [x.type, Number(x.value)]));
  return Date.UTC(p.get('year')!, p.get('month')! - 1, p.get('day')!, p.get('hour')! % 24, p.get('minute')!, p.get('second')!) - Math.floor(ms / 1000) * 1000;
}
/** A London wall-clock time ('2026-11-10T14:20:00') as an instant. */
export function londonWallMs(wall: string): number {
  const m = WALL.exec(wall);
  if (!m) return NaN;
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
  const first = asUtc - londonOffsetMs(asUtc);
  return asUtc - londonOffsetMs(first);
}

/** The evidence one stored train gives, or undefined when a unit's class cannot be read. */
export function ptacEvidence(train: PtacTrain): EdinburghServiceEvidence | undefined {
  const units: EvidenceUnit[] = [];
  for (let i = 0; i < train.units.length; i++) {
    const fleet = train.unitFleets?.[i];
    const cls = fleet ? fleet.split('/')[0]! : train.unitFleets === undefined && train.classes.length === 1 ? train.classes[0]! : undefined;
    if (cls === undefined || !CLASS.test(cls)) return undefined;
    units.push({ class: cls, cars: train.unitVehicles[i]! });
  }
  const operator = train.operator ? { operator: train.operator } : {};
  const [only] = units;
  if (units.length === 1) return { ...operator, class: only!.class, cars: only!.cars, units, basis: 'PTAC allocation' };
  const alike = units.every(u => u.class === only!.class && u.cars === only!.cars);
  return { ...operator, units, ...(alike ? {} : { orderAssumed: true }), basis: 'PTAC allocation' };
}

const indexes = new WeakMap<PtacStore, Map<string, PtacTrain[]>>();
function indexOf(store: PtacStore): Map<string, PtacTrain[]> {
  let index = indexes.get(store);
  if (!index) {
    index = new Map();
    for (const t of Object.values(store.trains)) { const list = index.get(t.headcode); if (list) list.push(t); else index.set(t.headcode, [t]); }
    indexes.set(store, index);
  }
  return index;
}

const TIE_MINUTES = 1;
const signature = (e: EdinburghServiceEvidence | undefined): string => e ? `${e.operator ?? '-'}:${(e.units ?? []).map(u => `${u.class}/${u.cars}`).join('+')}` : 'none';

/**
 * The PTAC fleet for a TD description at an instant, or undefined. A train matches when its headcode is the
 * description and its planned Edinburgh arrival or departure is within `windowMin` minutes; the nearest wins.
 * Two different answers at the same distance give undefined, as in matchBooked.
 */
export function matchPtac(store: PtacStore, description: string, atMs: number, windowMin = 30): EdinburghServiceEvidence | undefined {
  if (!HEADCODE.test(description) || !Number.isFinite(atMs) || !(windowMin >= 0)) return undefined;
  const list = indexOf(store).get(description);
  if (!list) return undefined;
  const hits: { train: PtacTrain; distance: number }[] = [];
  for (const train of list) {
    for (const wall of [train.edbArr, train.edbDep]) {
      if (wall === null) continue;
      const distance = Math.abs(londonWallMs(wall) - atMs) / 60_000;
      if (distance <= windowMin) hits.push({ train, distance });
    }
  }
  if (!hits.length) return undefined;
  const nearest = Math.min(...hits.map(h => h.distance));
  const answers = [...new Set(hits.filter(h => h.distance - nearest < TIE_MINUTES).map(h => h.train))].map(ptacEvidence);
  if (new Set(answers.map(signature)).size !== 1) return undefined;
  return answers[0];
}

/** matchPtac as an EvidenceSource. */
export const ptacSource = (store: PtacStore, windowMin?: number): EvidenceSource => (description, atMs) => matchPtac(store, description, atMs, windowMin);
