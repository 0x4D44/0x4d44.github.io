// Unknown Edinburgh services have no earned fleet identity. Every neutral-model
// dimension is ASSUMED; its length is an illustrative motion footprint, not a
// published vehicle or coupled formation dimension.
import type { MotionBirth } from './motion.ts';
import { trainLayout } from './train.ts';
import type { Car, Figure } from './train.ts';

const assumed = (value: number, reason: string): Figure => ({ value, unit: 'm', basis: 'assumed', source: `ASSUMED generic illustrative body: ${reason}; no actual fleet or service dimension claimed.` });
export const NEUTRAL_ASSUMED = {
  length: assumed(130, 'default five-car motion footprint'),
  width: assumed(2.7, 'body width'),
  roof: assumed(3.7, 'rail-to-roof height'),
  floor: assumed(1.05, 'body underside above rail'),
  endGap: assumed(0.25, 'body setback within allocated car pitch'),
  bogieInset: assumed(3.8, 'bogie centre inset from allocated car end'),
  wheelDiameter: assumed(0.84, 'wheel diameter'),
  wheelbase: assumed(2.6, 'bogie axle spacing'),
} as const;
export interface NeutralCar extends Omit<Car, 'type'> { readonly type: 'generic' }
export interface NeutralLayout {
  readonly spec: { readonly kind: 'neutral'; readonly family: 'neutral'; readonly operator: 'unknown'; readonly label: string; readonly source: string };
  readonly length: number;
  readonly cars: readonly NeutralCar[];
}
export function neutralTrainLayout(lengthM = NEUTRAL_ASSUMED.length.value, carCount = 5): NeutralLayout {
  if (!Number.isFinite(lengthM) || !Number.isInteger(carCount) || carCount < 2 || lengthM / carCount < 6) throw new RangeError('Neutral layout needs at least two cars with finite allocated pitches of at least 6 m');
  const pitch = lengthM / carCount;
  const inset = Math.min(NEUTRAL_ASSUMED.bogieInset.value, pitch * 0.35);
  const cars = Array.from({ length: carCount }, (_, index): NeutralCar => {
    const start = index * pitch; const end = (index + 1) * pitch;
    return { type: 'generic', index, start, end, length: pitch, bogies: [start + inset, end - inset], cab: index === 0 ? 'front' : index === carCount - 1 ? 'rear' : null, pantograph: null, motor: [false, false] };
  });
  return { spec: { kind: 'neutral', family: 'neutral', operator: 'unknown', label: 'Unknown train · assumed fleet', source: 'ASSUMED generic appearance, car count and allocated length; no operator, class, coupled endpoints or actual formation established.' }, length: lengthM, cars };
}

/** Only explicit service evidence earns a specific operator livery. Headcodes,
 * origins and a near-enough train length cannot establish a class or formation.
 * `basis` says what kind of evidence it is and becomes the train's allocation label:
 * a booked diagram (the operator's published unit diagram for that working) is a plan,
 * not an observation of the unit on the day. 'PTAC allocation' is Network Rail's planned unit
 * allocation for the train on the day (core/edinburgh-ptac.ts): also a plan, not a sighting. */
export type EvidenceBasis = 'service evidence' | 'booked diagram' | 'PTAC allocation';
/** One unit of a train: its class and its own vehicle count (power cars included). */
export interface EvidenceUnit { readonly class: string; readonly cars: number }
export interface EdinburghServiceEvidence {
  /** ATOC code: SR ScotRail, GR LNER, LD Lumo, TP TransPennine, XC CrossCountry, CS Caledonian Sleeper. */
  readonly operator?: string;
  /** A single unit's class and vehicle count; ignored when `units` is given. */
  readonly class?: string;
  readonly cars?: number;
  /** The train's units in formation order, front first. Each must match a row of its own, or the whole train stays neutral. */
  readonly units?: readonly EvidenceUnit[];
  /** The units' order is not known from the source (e.g. a 3+4 from two coupled diagrams): it is drawn as given and labelled ASSUMED. */
  readonly orderAssumed?: boolean;
  readonly basis?: EvidenceBasis;
}
/** The car fields the Waverley layer reads (carPoses and the builders' car-<index> groups). */
export type EdinburghCar = Pick<Car, 'index' | 'start' | 'end' | 'length' | 'bogies' | 'cab'>;
export interface EdinburghLayout { readonly length: number; readonly cars: readonly EdinburghCar[] }
/**
 * One drawable Edinburgh kind and the evidence that selects it: one row per kind. A row is
 * picked only when the evidence's operator, class and car count all match it exactly; anything
 * else stays neutral. The web table (web/src/edinburgh-fleet.ts) adds each row's builder.
 */
export interface EdinburghKindRow {
  /** Unique kind id, e.g. 'sr385x3'. */
  readonly kind: string;
  /** ATOC code the evidence carries. */
  readonly operator: string;
  /** Label text for the operator, e.g. 'ScotRail'. */
  readonly operatorName: string;
  /** evidence.class values that pick this row. */
  readonly classes: readonly string[];
  /** Must equal evidence.cars exactly. */
  readonly cars: number;
  /** Pure layout: car extents from the front nose, bogie centres and cab ends. */
  readonly layout: () => EdinburghLayout;
}
/** The King's Cross kinds Waverley reuses unchanged. TransPennine 802 cannot borrow hull5: its livery belongs to Hull Trains. */
export const KX_REUSED_ROWS: readonly EdinburghKindRow[] = [
  { kind: 'lner5', operator: 'GR', operatorName: 'LNER', classes: ['800', '801'], cars: 5, layout: () => trainLayout('lner5') },
  { kind: 'lner9', operator: 'GR', operatorName: 'LNER', classes: ['800', '801'], cars: 9, layout: () => trainLayout('lner9') },
  { kind: 'lumo5', operator: 'LD', operatorName: 'Lumo', classes: ['803'], cars: 5, layout: () => trainLayout('lumo5') },
];
/** Throws if two rows share a kind id or would match the same (operator, class, cars). */
export function checkEdinburghRows(rows: readonly EdinburghKindRow[]): void {
  const kinds = new Set<string>(), keys = new Set<string>();
  for (const row of rows) {
    if (row.kind === 'neutral' || kinds.has(row.kind)) throw new Error(`duplicate Edinburgh kind ${row.kind}`);
    kinds.add(row.kind);
    if (!Number.isInteger(row.cars) || row.cars < 1 || !row.classes.length) throw new Error(`Edinburgh kind ${row.kind} needs a car count and a class`);
    for (const c of row.classes) {
      const key = `${row.operator}/${c}/${row.cars}`;
      if (keys.has(key)) throw new Error(`Edinburgh evidence ${key} matches two kinds`);
      keys.add(key);
    }
  }
}
const rowFor = (rows: readonly EdinburghKindRow[], operator: string, cls: string, cars: number): EdinburghKindRow | undefined =>
  rows.find(r => r.operator === operator && r.cars === cars && r.classes.includes(cls));
/** The row a single unit's evidence selects: operator, class and car count must all be present and all match. */
export function rowForEvidence(rows: readonly EdinburghKindRow[], evidence: EdinburghServiceEvidence | undefined): EdinburghKindRow | undefined {
  const { operator, class: cls, cars } = evidence ?? {};
  if (!operator || !cls || cars === undefined) return undefined;
  return rowFor(rows, operator, cls, cars);
}
/**
 * The rows of every unit of the train, front first: from `units` when given (each unit matched on its own operator,
 * class and vehicle count), else the single unit of `class` and `cars`. Undefined if any unit has no row: a train is
 * drawn whole or not at all, never as a partial mix.
 */
export function rowsForEvidence(rows: readonly EdinburghKindRow[], evidence: EdinburghServiceEvidence | undefined): EdinburghKindRow[] | undefined {
  if (!evidence?.operator) return undefined;
  if (evidence.units === undefined) { const row = rowForEvidence(rows, evidence); return row ? [row] : undefined; }
  if (!evidence.units.length) return undefined;
  const out: EdinburghKindRow[] = [];
  for (const u of evidence.units) {
    const row = typeof u?.class === 'string' && Number.isInteger(u.cars) ? rowFor(rows, evidence.operator, u.class, u.cars) : undefined;
    if (!row) return undefined;
    out.push(row);
  }
  return out;
}
/** One unit of a drawn train: its row's kind and where its front stands, metres behind the train's front. */
export interface EdinburghUnit { readonly kind: string; readonly offset: number; readonly cars: number }
/**
 * Units end to end, nose to nose with the gap their own layouts give (each layout's length already runs to its coupler
 * face), cars renumbered along the whole train so car-<index> is unique.
 */
export function composeUnits(layouts: readonly { readonly kind: string; readonly layout: EdinburghLayout }[]): { layout: EdinburghLayout; units: EdinburghUnit[] } {
  const cars: EdinburghCar[] = [], units: EdinburghUnit[] = [];
  let offset = 0;
  for (const { kind, layout } of layouts) {
    units.push({ kind, offset, cars: layout.cars.length });
    for (const c of layout.cars) cars.push({ index: cars.length, start: c.start + offset, end: c.end + offset, length: c.length, bogies: [c.bogies[0] + offset, c.bogies[1] + offset], cab: c.cab });
    offset += layout.length;
  }
  return { layout: { length: offset, cars }, units };
}
export type EdinburghKind = string;
export interface EdinburghChoice {
  /** A row's kind, or the units' kinds joined with '+' front first ('sr385x3+sr385x4'). */
  readonly kind: EdinburghKind;
  readonly layout: EdinburghLayout;
  /** The units, front first: one for a single unit. Empty for the neutral train. */
  readonly units: readonly EdinburghUnit[];
  readonly lengthM: number;
  readonly allocation: 'assumed fleet' | EvidenceBasis;
  readonly label: string;
  readonly note: string;
}
export interface EdinburghKindOptions { readonly lengthM?: number; readonly carCount?: number; readonly rows?: readonly EdinburghKindRow[] }
export function createEdinburghKinds(serviceFor?: (description: string, atTime: number) => EdinburghServiceEvidence | undefined, options: EdinburghKindOptions = {}) {
  const neutral = neutralTrainLayout(options.lengthM, options.carCount);
  const rows = options.rows ?? KX_REUSED_ROWS;
  checkEdinburghRows(rows);
  const layouts = new Map<string, EdinburghLayout>();
  const born = new Map<number, EdinburghChoice>();
  const fallback: EdinburghChoice = Object.freeze({ kind: 'neutral', layout: neutral, units: [], lengthM: neutral.length, allocation: 'assumed fleet', label: neutral.spec.label, note: 'assumed fleet; operator, class or supported formation unavailable' });
  const formationFor = (view: { readonly id: number }): EdinburghChoice | undefined => born.get(view.id);
  const kindFor = (view: { readonly id: number }): EdinburghKind => (born.get(view.id) ?? fallback).kind;
  const layoutFor = (view: { readonly id: number }): EdinburghLayout => (born.get(view.id) ?? fallback).layout;
  return {
    lengthM(description: string, birth: MotionBirth): number {
      const previous = born.get(birth.id);
      if (previous) return previous.lengthM;
      const evidence = serviceFor?.(description, birth.timeMs);
      const matched = rowsForEvidence(rows, evidence);
      let choice = fallback;
      if (matched) {
        const parts = matched.map(row => {
          const layout = layouts.get(row.kind) ?? row.layout();
          layouts.set(row.kind, layout);
          return { kind: row.kind, layout };
        });
        const { layout, units } = parts.length === 1 ? { layout: parts[0]!.layout, units: [{ kind: parts[0]!.kind, offset: 0, cars: parts[0]!.layout.cars.length }] } : composeUnits(parts);
        const basis = evidence!.basis ?? 'service evidence';
        const given = evidence!.units ?? [{ class: evidence!.class!, cars: evidence!.cars! }];
        const names = [...new Set(matched.map(r => r.operatorName))].join('/'), classes = [...new Set(given.map(u => u.class))].join('+');
        const order = given.length > 1 && evidence!.orderAssumed ? ' · order ASSUMED' : '';
        choice = Object.freeze({ kind: matched.map(r => r.kind).join('+'), layout, units, lengthM: layout.length, allocation: basis,
          label: `${names} Class ${classes} · ${given.map(u => u.cars).join('+')} cars · ${basis}${order}`,
          note: `operator, class and car count${given.length > 1 ? ' of each unit' : ''} from ${basis}${order ? '; the units\' order is ASSUMED' : ''}; model dimensional assumptions still apply` });
      }
      born.set(birth.id, choice);
      return choice.lengthM;
    },
    kindFor, layoutFor, formationFor,
  };
}
