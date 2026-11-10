// Booked-diagram fleet evidence for Edinburgh Waverley (TD area EB).
//
// ScotRail publishes its unit diagrams as a "Vehicle Diagram Detail Report": per diagram and day
// pattern, the working it covers, a train (headcode) on each leg, and the diagrams coupled for that
// leg. This module decodes that text into a small table of the workings that call at Edinburgh and
// answers "which units (class and vehicles each, in Vehicle-column order) does headcode H have at time T?".
// One unit per coupled diagram: 3+3, 3+4 and a 158 pair are lists of units, never a summed car count.
//
// A booked diagram is a PLAN: units are swapped and sets cut or strengthened on the day. So the
// answer is labelled 'booked diagram', never 'PTAC allocation'. A second source (the PTAC
// allocation feed, core/edinburgh-ptac.ts) feeds the same EdinburghServiceEvidence through an EvidenceSource; matching is
// kept apart from the table format so either can change alone.
//
// Pure string and number code: no node: imports, no three.js. The published text and the table built
// from it are private data; only synthetic text belongs in tests and source.
import type { EdinburghServiceEvidence, EvidenceUnit } from './train-neutral.ts';

export const BOOKED_OPERATOR = 'SR';
/** The exact Waverley location name. "Edinburgh Park" and "Edinburgh Gateway" are different places. */
export const EDINBURGH_LOCATION = 'Edinburgh';

/** One source of fleet evidence for a TD description at a time: a booked table now, an actual-allocation feed later. */
export type EvidenceSource = (description: string, atMs: number) => EdinburghServiceEvidence | undefined;
/** The first source that has an answer wins; put the most trustworthy source first. */
export function firstEvidence(...sources: readonly (EvidenceSource | undefined)[]): EvidenceSource {
  return (description, atMs) => {
    for (const source of sources) {
      const evidence = source?.(description, atMs);
      if (evidence) return evidence;
    }
    return undefined;
  };
}

// ---------------------------------------------------------------------------------------------------
// Header wording: "Class 385 - 3 Car EMU" -> { class: '385', vehicles: 3 }
// ---------------------------------------------------------------------------------------------------

export interface DiagramHeader {
  /** TOPS class (an HST is class 43). */
  readonly class: string;
  /** Vehicles drawn, power cars included: a 385 3-car is 3; an HST of 5 coaches is 7. */
  readonly vehicles: number;
}

const HEADER = /^\s*Class\s+(HST|\d{3})(?:\/\d+)?\s*(?:-\s*)?(\d{1,2})\s+(Cars?|Coach(?:es)?)\b/i;
const HST_POWER_CARS = 2;

/**
 * Decode a diagram's "Class ..." line. Anything it cannot read exactly ("Class Diesel Q Path", an unknown
 * unit of measure, a coach count for a class that is not an HST) is undefined: the working stays neutral.
 */
export function parseHeader(text: string): DiagramHeader | undefined {
  const m = HEADER.exec(text);
  if (!m) return undefined;
  const hst = m[1]!.toUpperCase() === 'HST', n = Number(m[2]);
  if (hst !== m[3]!.toLowerCase().startsWith('coach') || !(n >= 1 && n <= 12)) return undefined;
  return { class: hst ? '43' : m[1]!, vehicles: hst ? n + HST_POWER_CARS : n };
}

// ---------------------------------------------------------------------------------------------------
// Days codes: SX, SO, Sun, FSX, TWThO ...
// ---------------------------------------------------------------------------------------------------

const DAY_BIT = { M: 1, T: 2, W: 4, Th: 8, F: 16, S: 32, Sun: 64 } as const;
const MON_FRI = 31;
const DAYS_CODE = /^(?:(Sun)|((?:Th|M|T|W|F|S)+)(O|X))$/;
const masks = new Map<string, number | undefined>();

/**
 * Weekday set for a published days code, Monday = bit 0 ... Sunday = bit 6; undefined if the code is not
 * understood. "xO" is "only on those days". "xX" is "excepted": Monday to Friday less those days. Sunday is
 * its own code ("Sun"), so SX is Monday to Friday. (Checked against the published set: each diagram's
 * Sun + SX + SO blocks, and FO + FSX + SO + Sun, cover the week exactly once.)
 */
export function daysMask(code: string): number | undefined {
  if (masks.has(code)) return masks.get(code);
  let mask: number | undefined;
  const m = DAYS_CODE.exec(code);
  if (m) {
    if (m[1]) mask = DAY_BIT.Sun;
    else {
      let listed = 0;
      for (const token of m[2]!.matchAll(/Th|M|T|W|F|S/g)) listed |= DAY_BIT[token[0] as keyof typeof DAY_BIT];
      mask = m[3] === 'O' ? listed : MON_FRI & ~listed;
    }
    if (mask === 0) mask = undefined;
  }
  masks.set(code, mask);
  return mask;
}

// ---------------------------------------------------------------------------------------------------
// Date notes: "Operates until 27th September", "Operates 4th to 18th October" ...
// ---------------------------------------------------------------------------------------------------

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH = `(${MONTHS.join('|')})`;
const UNTIL = new RegExp(`^operates until (\\d{1,2}) ${MONTH}$`);
const FROM = new RegExp(`^operates from (\\d{1,2}) ${MONTH}$`);
const SPAN = new RegExp(`^operates (?:from )?(\\d{1,2})(?: ${MONTH})? (?:to|until|-) (\\d{1,2}) ${MONTH}$`);

const isoDay = (year: number, month: number, day: number): string | undefined => {
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCMonth() === month && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : undefined;
};

export interface DateRange { readonly from?: string; readonly until?: string }

/**
 * First and last service day (inclusive, ISO) a "Date Notes" line allows, in the given timetable year.
 * Undefined if the wording is not understood (for example a school-holiday condition): the caller
 * must not guess a date range.
 */
export function parseDateNote(note: string, year: number): DateRange | undefined {
  const text = note.toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g, '$1').replace(/\s+/g, ' ').trim();
  let m = UNTIL.exec(text);
  if (m) { const until = isoDay(year, MONTHS.indexOf(m[2]!), Number(m[1])); return until ? { until } : undefined; }
  m = FROM.exec(text);
  if (m) { const from = isoDay(year, MONTHS.indexOf(m[2]!), Number(m[1])); return from ? { from } : undefined; }
  m = SPAN.exec(text);
  if (m) {
    const endMonth = MONTHS.indexOf(m[4]!), startMonth = m[2] ? MONTHS.indexOf(m[2]) : endMonth;
    const from = isoDay(year, startMonth, Number(m[1]));
    let until = isoDay(year, endMonth, Number(m[3]));
    if (!from || !until) return undefined;
    if (until < from) until = isoDay(year + 1, endMonth, Number(m[3]));
    return until ? { from, until } : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------------------------------

export interface BookedWorking {
  /** The four TD characters of the published train: "1A02" for "1A02LA" (the last two letters are a suffix). */
  readonly headcode: string;
  /** The published days code, e.g. 'SX'. See daysMask. */
  readonly days: string;
  /** First and last service day (ISO, inclusive) the diagram operates, when the diagram says. */
  readonly from?: string;
  readonly until?: string;
  /**
   * When the train is at Edinburgh (arrival or departure), in minutes after midnight of the service day
   * (the day the diagram's days code names); 1440 and over is after midnight. Half minutes are kept.
   */
  readonly edinburghMinutes: readonly number[];
  /**
   * The units coupled for this working, in the order the Vehicle column prints them (taken as front first; the
   * publication does not prove it). One entry per diagram, each with its own class and vehicle count.
   */
  readonly units: readonly BookedUnit[];
}
export interface BookedUnit {
  /** The unit diagram's id: two letters and three digits. */
  readonly diagram: string;
  /** TOPS class from the diagram's header; null when the header names none (a Q path). */
  readonly class: string | null;
  /** Vehicles drawn for this diagram (an HST's power cars included); null exactly when class is null. */
  readonly cars: number | null;
}
export interface FleetTable {
  /** A label for the text this was built from (a file name, never rows). */
  readonly source: string;
  readonly builtAt: string;
  readonly workings: readonly BookedWorking[];
}

const HEADCODE = /^\d[A-Z]\d{2}$/;
const DIAGRAM_ID = /^[A-Z]{2}\d{3}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WORKINGS = 100_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const validIsoDay = (v: unknown): v is string => typeof v === 'string' && ISO_DAY.test(v) && isoDay(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8))) === v;

function onlyKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[], what: string): void {
  for (const key of required) if (!(key in value)) throw new Error(`${what}: missing ${key}`);
  for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) throw new Error(`${what}: unexpected ${key}`);
}

/** Strict shape check for a table read from disk or the relay. Throws on anything unexpected; returns the same value, typed. */
export function validateFleetTable(value: unknown): FleetTable {
  if (!isRecord(value)) throw new Error('fleet table: object required');
  onlyKeys(value, ['source', 'builtAt', 'workings'], [], 'fleet table');
  if (typeof value.source !== 'string' || value.source.length > 200) throw new Error('fleet table: invalid source');
  if (typeof value.builtAt !== 'string' || !Number.isFinite(Date.parse(value.builtAt))) throw new Error('fleet table: invalid builtAt');
  if (!Array.isArray(value.workings) || value.workings.length > MAX_WORKINGS) throw new Error('fleet table: invalid workings');
  value.workings.forEach((w: unknown, i: number) => {
    const at = `fleet table: working ${i}`;
    if (!isRecord(w)) throw new Error(`${at}: object required`);
    onlyKeys(w, ['headcode', 'days', 'edinburghMinutes', 'units'], ['from', 'until'], at);
    if (typeof w.headcode !== 'string' || !HEADCODE.test(w.headcode)) throw new Error(`${at}: invalid headcode`);
    if (typeof w.days !== 'string' || daysMask(w.days) === undefined) throw new Error(`${at}: invalid days`);
    if (w.from !== undefined && !validIsoDay(w.from)) throw new Error(`${at}: invalid from`);
    if (w.until !== undefined && !validIsoDay(w.until)) throw new Error(`${at}: invalid until`);
    if (typeof w.from === 'string' && typeof w.until === 'string' && w.from > w.until) throw new Error(`${at}: from after until`);
    if (!Array.isArray(w.edinburghMinutes) || !w.edinburghMinutes.length || w.edinburghMinutes.length > 64 ||
      w.edinburghMinutes.some((t: unknown) => typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t >= 2880)) throw new Error(`${at}: invalid edinburghMinutes`);
    if (!Array.isArray(w.units) || !w.units.length || w.units.length > 8) throw new Error(`${at}: invalid units`);
    w.units.forEach((u: unknown, k: number) => {
      const unit = `${at} unit ${k}`;
      if (!isRecord(u)) throw new Error(`${unit}: object required`);
      onlyKeys(u, ['diagram', 'class', 'cars'], [], unit);
      if (typeof u.diagram !== 'string' || !DIAGRAM_ID.test(u.diagram)) throw new Error(`${unit}: invalid diagram`);
      if (u.class !== null && (typeof u.class !== 'string' || !/^[0-9A-Za-z]{1,8}$/.test(u.class))) throw new Error(`${unit}: invalid class`);
      if (u.cars !== null && (!Number.isInteger(u.cars) || (u.cars as number) < 1 || (u.cars as number) > 12)) throw new Error(`${unit}: invalid cars`);
      if ((u.class === null) !== (u.cars === null)) throw new Error(`${unit}: class and cars are known together or not at all`);
    });
  });
  return value as unknown as FleetTable;
}

// ---------------------------------------------------------------------------------------------------
// Matching: headcode + weekday + date + nearest Edinburgh time
// ---------------------------------------------------------------------------------------------------

const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** London wall-clock date and minutes after local midnight (fractional) for an instant. */
function londonLocal(ms: number): { year: number; month: number; day: number; minutes: number } {
  const parts = new Map(LONDON.formatToParts(new Date(ms)).map((p): [string, number] => [p.type, Number(p.value)]));
  return { year: parts.get('year')!, month: parts.get('month')! - 1, day: parts.get('day')!,
    minutes: (parts.get('hour')! % 24) * 60 + parts.get('minute')! + parts.get('second')! / 60 };
}

const indexes = new WeakMap<FleetTable, Map<string, BookedWorking[]>>();
function indexOf(table: FleetTable): Map<string, BookedWorking[]> {
  let index = indexes.get(table);
  if (!index) {
    index = new Map();
    for (const w of table.workings) { const list = index.get(w.headcode); if (list) list.push(w); else index.set(w.headcode, [w]); }
    indexes.set(table, index);
  }
  return index;
}

/** Two candidates this close in time are the same moment as far as the published minutes tell. */
const TIE_MINUTES = 1;

/**
 * The booked fleet for a TD description at an instant, or undefined. A working matches when its headcode is the
 * description, its days code fits the London-local weekday (and its date range the date) of a service day near the
 * instant, and one of its Edinburgh times is within `windowMin` minutes. The nearest time wins; two different
 * answers (different units) at the same distance, or a nearest answer with a unit of no known class, give undefined.
 * Service days D-1, D and D+1 are all tried, so a train booked at 23:50 or 00:10 matches across midnight.
 */
export function matchBooked(table: FleetTable, description: string, atMs: number, windowMin = 30): EdinburghServiceEvidence | undefined {
  if (!HEADCODE.test(description) || !Number.isFinite(atMs) || !(windowMin >= 0)) return undefined;
  const list = indexOf(table).get(description);
  if (!list) return undefined;
  const local = londonLocal(atMs);
  const frames = [-1, 0, 1].map(k => {
    const day = new Date(Date.UTC(local.year, local.month, local.day + k));
    return { iso: day.toISOString().slice(0, 10), bit: 1 << ((day.getUTCDay() + 6) % 7), observed: local.minutes - 1440 * k };
  });
  const hits: { working: BookedWorking; distance: number }[] = [];
  for (const working of list) {
    const mask = daysMask(working.days);
    if (mask === undefined) continue;
    for (const frame of frames) {
      if (!(mask & frame.bit) || (working.from !== undefined && frame.iso < working.from) || (working.until !== undefined && frame.iso > working.until)) continue;
      for (const t of working.edinburghMinutes) {
        const distance = Math.abs(t - frame.observed);
        if (distance <= windowMin) hits.push({ working, distance });
      }
    }
  }
  if (!hits.length) return undefined;
  const nearest = Math.min(...hits.map(h => h.distance));
  const contenders = hits.filter(h => h.distance - nearest < TIE_MINUTES).map(h => h.working);
  // The same units in another order are the same answer; different units are a tie, and no answer.
  if (new Set(contenders.map(w => w.units.map(u => `${u.class}/${u.cars}`).sort().join('+'))).size !== 1) return undefined;
  return evidenceFor(contenders[0]!.units);
}

/**
 * One EdinburghServiceEvidence from a working's coupled units: one unit each, in the Vehicle column's order. A single
 * unit also fills class and cars. The order is unproven, so it is flagged assumed whenever the units differ
 * (a 3+4); identical units (3+3, 2+2) have no order to get wrong. A unit with no class makes the whole train unknown.
 */
function evidenceFor(booked: readonly BookedUnit[]): EdinburghServiceEvidence | undefined {
  const units: EvidenceUnit[] = [];
  for (const u of booked) {
    if (u.class === null || u.cars === null) return undefined;
    units.push({ class: u.class, cars: u.cars });
  }
  const [only] = units;
  if (units.length === 1) return { operator: BOOKED_OPERATOR, class: only!.class, cars: only!.cars, units, basis: 'booked diagram' };
  const alike = units.every(u => u.class === only!.class && u.cars === only!.cars);
  return { operator: BOOKED_OPERATOR, units, ...(alike ? {} : { orderAssumed: true }), basis: 'booked diagram' };
}

/** matchBooked as an EvidenceSource. */
export const bookedSource = (table: FleetTable, windowMin?: number): EvidenceSource => (description, atMs) => matchBooked(table, description, atMs, windowMin);

// ---------------------------------------------------------------------------------------------------
// Decoding the published text
// ---------------------------------------------------------------------------------------------------

interface RawRow {
  /** The location as printed, or '' when the row leaves it out (it repeats the previous row's). */
  readonly loc: string;
  /** Times on the row in order, minutes after service-day midnight; "1&" marks the next day. */
  readonly times: readonly number[];
  readonly activity: string | undefined;
  /** First four characters of the train column. */
  readonly headcode: string | undefined;
  /** Diagram ids in the Vehicle Cover column ("A / B", or "A, B" on an attach or detach). */
  readonly cover: readonly string[] | undefined;
}
interface RawBlock { readonly id: string; days: string | undefined; dateNote: string | undefined; header: DiagramHeader | undefined; readonly rows: RawRow[] }

const TIME_AT = /\s*(?:(\d)&)?(\d{2}):(\d{2})(½)?/y;
const TIME_FIRST = /(?:\d&)?\d{2}:\d{2}/;
const ACTIVITY = /^(?:Attach|Detach|Revrse|Clean|Wash|FUEL|CET|Exam|Stabld|NOTE|Spare|CS)\b|^-{3,}/;
const ACTIVITY_ANYWHERE = /\b(?:Attach|Detach|Revrse|Clean|Wash|FUEL|CET|Exam|Stabld|NOTE|Spare|CS)\b|-{3,}/;
const TRAIN = /(?:^|\s)(\d[A-Z]\d{2})[A-Z]{2}(?=\s|$)/;
const VEHICLE = /(?<![A-Z0-9])[A-Z]{2}\d{3}(?![A-Z0-9])/g;

function parseRow(line: string): RawRow | undefined {
  const first = TIME_FIRST.exec(line);
  if (!first) {
    // A servicing or end-of-diagram row with no time. It can still name the location the next row repeats.
    const activity = ACTIVITY_ANYWHERE.exec(line);
    return activity && activity.index > 0 ? { loc: line.slice(0, activity.index).trim(), times: [], activity: undefined, headcode: undefined, cover: undefined } : undefined;
  }
  const times: number[] = [];
  let end = first.index;
  for (;;) {
    TIME_AT.lastIndex = end;
    const m = TIME_AT.exec(line);
    if (!m) break;
    const hours = Number(m[2]), minutes = Number(m[3]);
    if (hours > 23 || minutes > 59) return undefined;
    times.push(Number(m[1] ?? 0) * 1440 + hours * 60 + minutes + (m[4] ? 0.5 : 0));
    end = TIME_AT.lastIndex;
  }
  const rest = line.slice(end).trim();
  const train = TRAIN.exec(rest);
  const cover = [...new Set(rest.match(VEHICLE) ?? [])];
  return { loc: line.slice(0, first.index).trim(), times, activity: ACTIVITY.exec(rest)?.[0].replace(/^-+$/, '--------'), headcode: train?.[1], cover: cover.length ? cover : undefined };
}

function readBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  let block: RawBlock | undefined, inRows = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    // Page furniture ("# Classified as ...", "PAGE 245", the report title) can split a block anywhere, even its
    // header. It matches none of the line shapes below, so it is skipped without being named.
    if (!line) continue;
    const id = /^Diagram ID\s+\S+\s+(\S+)$/.exec(line);
    if (id) { block = { id: id[1]!, days: undefined, dateNote: undefined, header: undefined, rows: [] }; blocks.push(block); inRows = false; continue; }
    if (!block) continue;
    if (!inRows) {
      if (/^Location\s+Arr\b/.test(line)) inRows = true;
      else if (line.startsWith('Days ')) block.days = line.slice(5).trim();
      else if (line.startsWith('Date Notes')) block.dateNote = line.slice(10).trim();
      else if (line.startsWith('Class ')) block.header = parseHeader(line);
      continue;
    }
    if (/^NOTE\b/.test(line)) continue;
    const row = parseRow(line);
    if (row) block.rows.push(row);
  }
  return blocks;
}

interface Presence { readonly headcode: string; readonly ids: readonly string[]; readonly minute: number }

/**
 * When each train is at Edinburgh in one block. In the published layout the Train and Vehicle columns of a row
 * describe the train that LEAVES the location (the next row's Arr time is its arrival), so:
 *   a leg row (a train, no activity) gives that train's departure (its last time), and, when it has an Arr time
 *     too, the arrival of the previous leg's train, whose headcode and formation the previous leg row holds;
 *   a Detach row names the arriving train and its formation before the split;
 *   any other timed row (Attach, Revrse, Clean, Wash, a bare arrival ...) is the arrival of the previous leg's train.
 * A leg row with no Vehicle Cover is the block's own diagram alone.
 */
function presences(block: RawBlock): Presence[] {
  const found: Presence[] = [];
  let loc = '';
  let running: { headcode: string; ids: readonly string[]; from: string; arrived: boolean } | undefined;
  for (const row of block.rows) {
    if (row.loc) loc = row.loc;
    if (!row.times.length) continue;
    const here = loc === EDINBURGH_LOCATION, first = row.times[0]!, last = row.times.at(-1)!;
    const arrival = (): void => {
      // A servicing row at the place the leg left from is not that leg arriving.
      if (!running || running.arrived || running.from === loc) return;
      running.arrived = true;
      if (here) found.push({ headcode: running.headcode, ids: running.ids, minute: first });
    };
    if (row.headcode && !row.activity) {
      if (row.times.length > 1) arrival();
      const ids = row.cover ?? [block.id];
      if (here) found.push({ headcode: row.headcode, ids, minute: last });
      running = { headcode: row.headcode, ids, from: loc, arrived: false };
    } else if (row.headcode && row.activity === 'Detach') {
      // The detach list is "A, B" (no front-to-back meaning); the leg row that brought the train in has the printed order.
      const same = running?.headcode === row.headcode ? running : undefined;
      const agrees = same && row.cover && same.ids.length === row.cover.length && row.cover.every(id => same.ids.includes(id));
      if (here) found.push({ headcode: row.headcode, ids: agrees ? same.ids : row.cover ?? same?.ids ?? [block.id], minute: first });
      if (running) running.arrived = true;
    } else arrival();
  }
  return found;
}

export interface DiagramStats {
  /** Diagram blocks found in the text. */
  readonly blocks: number;
  /** Blocks left out because their days code or date note could not be read, and so could not be dated safely. */
  readonly skippedDays: number;
  readonly skippedDateNote: number;
  /** Blocks whose class header names no class (a Q path, say): their workings are kept, with a unit of no class (so no evidence). */
  readonly unclassifiedBlocks: number;
}
export interface ParsedDiagrams { readonly workings: BookedWorking[]; readonly stats: DiagramStats }

/**
 * Decode the published text into the workings that call at Edinburgh. `year` is the timetable year the
 * "Operates until 27th September" date notes belong to.
 */
export function parseDiagramText(text: string, options: { year: number }): ParsedDiagrams {
  const blocks = readBlocks(text);
  const headers = new Map<string, DiagramHeader | null>();
  for (const block of blocks) {
    const seen = headers.get(block.id), mine = block.header ?? null;
    headers.set(block.id, seen === undefined ? mine : seen && mine && seen.class === mine.class && seen.vehicles === mine.vehicles ? seen : null);
  }
  const unitOf = (diagram: string): BookedUnit => {
    const h = headers.get(diagram);
    return { diagram, class: h?.class ?? null, cars: h?.vehicles ?? null };
  };
  const merged = new Map<string, { working: Omit<BookedWorking, 'edinburghMinutes'>; minutes: Set<number> }>();
  let skippedDays = 0, skippedDateNote = 0, unclassifiedBlocks = 0;
  for (const block of blocks) {
    if (!block.header) unclassifiedBlocks++;
    if (!block.days || daysMask(block.days) === undefined) { skippedDays++; continue; }
    let range: DateRange = {};
    if (block.dateNote !== undefined) {
      const parsed = parseDateNote(block.dateNote, options.year);
      if (!parsed) { skippedDateNote++; continue; }
      range = parsed;
    }
    for (const seen of presences(block)) {
      const working = { headcode: seen.headcode, days: block.days, ...range, units: [...new Set(seen.ids)].map(unitOf) };
      const key = JSON.stringify(working);
      const entry = merged.get(key) ?? { working, minutes: new Set<number>() };
      entry.minutes.add(seen.minute);
      merged.set(key, entry);
    }
  }
  const workings = [...merged.values()].map(({ working, minutes }): BookedWorking => ({ ...working, edinburghMinutes: [...minutes].sort((a, b) => a - b) }))
    .sort((a, b) => a.headcode.localeCompare(b.headcode) || a.days.localeCompare(b.days) || (a.from ?? '').localeCompare(b.from ?? '') ||
      (a.until ?? '').localeCompare(b.until ?? '') || a.edinburghMinutes[0]! - b.edinburghMinutes[0]! ||
      a.units.map(u => u.diagram).join().localeCompare(b.units.map(u => u.diagram).join()));
  return { workings, stats: { blocks: blocks.length, skippedDays, skippedDateNote, unclassifiedBlocks } };
}
