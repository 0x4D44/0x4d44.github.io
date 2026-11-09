// Unknown Edinburgh services have no earned fleet identity. Every neutral-model
// dimension is ASSUMED; its length is an illustrative motion footprint, not a
// published vehicle or coupled formation dimension.
import type { MotionBirth } from './motion.ts';
import { trainLayout } from './train.ts';
import type { Car, Figure, TrainLayout } from './train.ts';

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
 * origins and a near-enough train length cannot establish a class or formation. */
export interface EdinburghServiceEvidence {
  readonly operator?: string;
  readonly class?: string;
  readonly cars?: number;
}
export type EdinburghKind = 'neutral' | 'lner5' | 'lner9' | 'lumo5';
export interface EdinburghChoice {
  readonly kind: EdinburghKind;
  readonly layout: NeutralLayout | TrainLayout;
  readonly lengthM: number;
  readonly allocation: 'assumed fleet' | 'service evidence';
  readonly label: string;
  readonly note: string;
}
export interface EdinburghKindOptions { readonly lengthM?: number; readonly carCount?: number }
export function createEdinburghKinds(serviceFor?: (description: string, atTime: number) => EdinburghServiceEvidence | undefined, options: EdinburghKindOptions = {}) {
  const neutral = neutralTrainLayout(options.lengthM, options.carCount);
  const born = new Map<number, EdinburghChoice>();
  const fallback: EdinburghChoice = Object.freeze({ kind: 'neutral', layout: neutral, lengthM: neutral.length, allocation: 'assumed fleet', label: neutral.spec.label, note: 'assumed fleet; operator, class or supported formation unavailable' });
  const formationFor = (view: { readonly id: number }): EdinburghChoice | undefined => born.get(view.id);
  const kindFor = (view: { readonly id: number }): EdinburghKind => (born.get(view.id) ?? fallback).kind;
  const layoutFor = (view: { readonly id: number }): NeutralLayout | TrainLayout => (born.get(view.id) ?? fallback).layout;
  return {
    lengthM(description: string, birth: MotionBirth): number {
      const previous = born.get(birth.id);
      if (previous) return previous.lengthM;
      const evidence = serviceFor?.(description, birth.timeMs);
      let kind: EdinburghKind = 'neutral';
      if (evidence?.operator === 'GR' && (evidence.class === '800' || evidence.class === '801')) {
        if (evidence.cars === 5) kind = 'lner5';
        if (evidence.cars === 9) kind = 'lner9';
      }
      if (evidence?.operator === 'LD' && evidence.class === '803' && evidence.cars === 5) kind = 'lumo5';
      // TransPennine 802 cannot borrow hull5: its livery belongs to Hull Trains.
      const layout = kind === 'neutral' ? neutral : trainLayout(kind);
      const choice: EdinburghChoice = kind === 'neutral' ? fallback : Object.freeze({ kind, layout, lengthM: layout.length, allocation: 'service evidence', label: `${layout.spec.operator} Class ${evidence!.class} · ${evidence!.cars} cars`, note: 'operator, class and car count supplied as explicit service evidence; model dimensional assumptions still apply' });
      born.set(birth.id, choice);
      return choice.lengthM;
    },
    kindFor, layoutFor, formationFor,
  };
}
