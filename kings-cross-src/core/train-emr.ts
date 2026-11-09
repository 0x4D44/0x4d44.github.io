// EMR reference models. A fleet appearance is never proof of an individual service's allocation.
import type { Car, Figure, TrainSpec } from './train.ts';

export type EmrKind = 'emr222x5' | 'emr810x5' | 'emr360x4';
export const EMR_KINDS: readonly EmrKind[] = ['emr222x5', 'emr810x5', 'emr360x4'];
export interface EmrSpec extends Omit<TrainSpec, 'kind' | 'family' | 'livery' | 'cars'> {
  readonly kind: EmrKind;
  readonly family: 'meridian' | 'aurora' | 'desiro360';
  readonly livery: 'emr';
  readonly cars: readonly string[];
  readonly label: string;
  readonly dimensionsProvisional: boolean;
}
const OPERATOR = 'https://www.eastmidlandsrailway.co.uk/our-fleet/';
const assumed = (value: number, reason: string): Figure => ({ value, unit: 'm', basis: 'assumed', source: `ASSUMED: ${reason}; no verified primary dimension in the 2026-11-09 St Pancras evidence review.` });
const published = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'published', source });
export const EMR_FIGURES = {
  meridian: {
    drivingLength: published(23.85, 'Eversholt Rail https://eversholtrail.co.uk/fleet/class-222/; driving car; endpoints unspecified.'),
    intermediateLength: published(23, 'Eversholt Rail https://eversholtrail.co.uk/fleet/class-222/; non-driving car; endpoints unspecified.'),
    width: published(2.73, 'Bombardier Meridian/Pioneer project technical page https://web.archive.org/web/20140812232051/http://www.bombardier.com/en/transportation/projects/project.meridian-pioneer-uk.html (redirected archive 2015-02-16); 2730 mm; generic body width.'),
    roof: assumed(3.77, 'rail-to-roof model envelope, not a published Class 222 height'),
  },
  aurora: {
    drivingLength: assumed(24, 'provisional driving-car pitch; repeated 24 m claim is unverified, not an adopted Hitachi dimension'),
    intermediateLength: assumed(24, 'provisional intermediate-car pitch; not the 26 m Class 800 body'),
    width: assumed(2.7, 'provisional model width, not a published Class 810 dimension'),
    roof: assumed(3.9, 'provisional rail-to-roof envelope, not a published Class 810 dimension'),
  },
  desiro360: {
    drivingLength: assumed(20.35, 'one quarter of Siemens 81.4 m unit overall allocated evenly; this is not Angel Trains 20.34 m vehicle endpoint'),
    intermediateLength: assumed(20.35, 'one quarter of Siemens 81.4 m unit overall allocated evenly; per-car pitch/endpoints unresolved'),
    width: published(2.8, 'Angel Trains https://angeltrains.co.uk/fleet/class-360/; 2.800 m generic width.'),
    roof: assumed(3.79, 'rail-to-roof model envelope; no recovered dimensioned Siemens GA'),
    unitLength: published(81.4, 'Siemens Class 360 Technical Information (2003) https://web.archive.org/web/20031218073322id_/http://www.siemenstransportation.co.uk:80/pdfs/360.pdf ; overall 81400 mm, four cars; coupler faces not explicitly defined.'),
  },
} as const;
export const EMR_ASSUMED = {
  endGap: assumed(0.25, 'half inter-car visual gap, deducted within allocated pitches'),
  bogieInset: assumed(3.8, 'bogie centre inset from allocated vehicle ends; not axle wheelbase'),
  wheelDiameter: assumed(0.84, 'generic wheel diameter'),
  wheelbase: assumed(2.6, 'generic axle spacing, not bogie-centre spacing'),
  pantographLength: assumed(2, 'generic pantograph footprint'),
} as const;
export const EMR_SPECS: Readonly<Record<EmrKind, EmrSpec>> = {
  emr222x5: { kind: 'emr222x5', family: 'meridian', classes: '222', operator: 'East Midlands Railway', livery: 'emr', cars: ['DMF', 'MC', 'MS', 'MS', 'DMS'], label: 'EMR 222 Meridian — assumed fleet', dimensionsProvisional: false, source: `${OPERATOR}intercity; five cars. Eversholt owner formation DMF–MC–MS–MS–DMS. Sum 116.70 m is DERIVED; not a published exact coupled length. Model allocates these endpoints as pitches: ASSUMED.` },
  emr810x5: { kind: 'emr810x5', family: 'aurora', classes: '810', operator: 'East Midlands Railway', livery: 'emr', cars: ['driving', 'intermediate', 'intermediate', 'intermediate', 'driving'], label: 'EMR 810 Aurora — assumed fleet; dimensions provisional', dimensionsProvisional: true, source: `${OPERATOR}intercity; Rock Rail https://rock-group.co.uk/rock-rail/east-midlands/ confirms five cars. Vehicle codes, dimensions and equipment positions ASSUMED; no numerical primary dimensions recovered. Illustrative preview only.` },
  emr360x4: { kind: 'emr360x4', family: 'desiro360', classes: '360/1', operator: 'East Midlands Railway', livery: 'emr', cars: ['DMCO', 'PTSO', 'TSO', 'DMCO'], label: 'EMR 360 Connect — assumed fleet', dimensionsProvisional: false, source: `${OPERATOR}connect; four cars. Angel Trains owner formation DMCO–PTSO–TSO–DMCO; Siemens 2003 opposite-orientation codes differ. ASSUMED orientation has pantograph on second vehicle.` },
};
export interface EmrCar extends Omit<Car, 'type'> { readonly type: string }
export interface EmrLayout { readonly spec: EmrSpec; readonly length: number; readonly cars: readonly EmrCar[] }
export function emrTrainLayout(kind: EmrKind): EmrLayout {
  const spec = EMR_SPECS[kind];
  const figures = EMR_FIGURES[spec.family];
  let at = 0;
  const cars = spec.cars.map((type, index): EmrCar => {
    const cab = index === 0 ? 'front' : index === spec.cars.length - 1 ? 'rear' : null;
    const length = cab ? figures.drivingLength.value : figures.intermediateLength.value;
    const start = at;
    at += length;
    const panto = spec.family === 'desiro360' ? index === 1 : spec.family === 'aurora' && (index === 0 || index === 4);
    const centre = cab === 'rear' ? start + 4 : at - 4;
    return { type, index, length, start, end: at, cab, bogies: [start + EMR_ASSUMED.bogieInset.value, at - EMR_ASSUMED.bogieInset.value], pantograph: panto ? [centre - 1, centre + 1] : null, motor: spec.family === 'desiro360' ? [cab !== null, cab !== null] : [true, true] };
  });
  return { spec, length: at, cars };
}
