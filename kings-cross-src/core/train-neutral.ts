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
 * not an observation of the unit on the day. A later source (an actual allocation feed)
 * feeds the same rows with its own basis. */
export type EvidenceBasis = 'service evidence' | 'booked diagram' | 'actual allocation';
export interface EdinburghServiceEvidence {
  /** ATOC code: SR ScotRail, GR LNER, LD Lumo, TP TransPennine, XC CrossCountry, CS Caledonian Sleeper. */
  readonly operator?: string;
  readonly class?: string;
  readonly cars?: number;
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
/** The row this evidence selects: operator, class and car count must all be present and all match. */
export function rowForEvidence(rows: readonly EdinburghKindRow[], evidence: EdinburghServiceEvidence | undefined): EdinburghKindRow | undefined {
  const { operator, class: cls, cars } = evidence ?? {};
  if (!operator || !cls || cars === undefined) return undefined;
  return rows.find(r => r.operator === operator && r.cars === cars && r.classes.includes(cls));
}
export type EdinburghKind = string;
export interface EdinburghChoice {
  readonly kind: EdinburghKind;
  readonly layout: EdinburghLayout;
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
  const fallback: EdinburghChoice = Object.freeze({ kind: 'neutral', layout: neutral, lengthM: neutral.length, allocation: 'assumed fleet', label: neutral.spec.label, note: 'assumed fleet; operator, class or supported formation unavailable' });
  const formationFor = (view: { readonly id: number }): EdinburghChoice | undefined => born.get(view.id);
  const kindFor = (view: { readonly id: number }): EdinburghKind => (born.get(view.id) ?? fallback).kind;
  const layoutFor = (view: { readonly id: number }): EdinburghLayout => (born.get(view.id) ?? fallback).layout;
  return {
    lengthM(description: string, birth: MotionBirth): number {
      const previous = born.get(birth.id);
      if (previous) return previous.lengthM;
      const evidence = serviceFor?.(description, birth.timeMs);
      const row = rowForEvidence(rows, evidence);
      let choice = fallback;
      if (row) {
        const layout = layouts.get(row.kind) ?? row.layout();
        layouts.set(row.kind, layout);
        const basis = evidence!.basis ?? 'service evidence';
        choice = Object.freeze({ kind: row.kind, layout, lengthM: layout.length, allocation: basis, label: `${row.operatorName} Class ${evidence!.class} · ${evidence!.cars} cars · ${basis}`, note: `operator, class and car count from ${basis}; model dimensional assumptions still apply` });
      }
      born.set(birth.id, choice);
      return choice.lengthM;
    },
    kindFor, layoutFor, formationFor,
  };
}
