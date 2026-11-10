// ScotRail Class 385 (Hitachi AT200), 3-car (385/0) and 4-car (385/1): the numbers the Waverley model is built
// from, each with its source and basis, as core/train.ts does for the King's Cross kinds. Pure data and arithmetic.
//
// Basis: published = printed by the maker or a reference that cites it; drawn = read off the maker's plan drawing
// (Hitachi Review Fig. 2) by scale, about +-0.15 m; assumed = nobody has published it, chosen so the model has a value.
import type { Car, Figure } from './train.ts';
import type { EdinburghLayout } from './train-neutral.ts';

export type Sr385Kind = 'sr385x3' | 'sr385x4';
export const SR385_KINDS: readonly Sr385Kind[] = ['sr385x3', 'sr385x4'];

const HITACHI = 'Hitachi Review vol. 66 no. 2 (2017), pp. 102-104, "Development of Class 385 Semi-customised/Standard Commuter Rolling Stock for Global Markets", https://www.hitachi.com/content/dam/hitachi/global/en/insights/media/hitachihyoron/2017/r2017_02/18-24_R1-02.pdf';
const FIG2 = `${HITACHI}, Fig. 2 (four-car formation plan, units mm)`;
const WIKI = 'Wikipedia infobox for British Rail Class 385 (read 2026-11-10)';
const published = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'published', source });
const drawn = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'drawn', source });
const assumed = (value: number, reason: string): Figure => ({ value, unit: 'm', basis: 'assumed', source: `ASSUMED: ${reason}. Not printed in ${HITACHI} or the ${WIKI}; to be replaced by a dimensioned drawing.` });

export const SR385_FIGURES = {
  /** Driving car: nose tip to the middle of the inner gap. */
  drivingCarPitch: published(23.6385, `${FIG2}: end-car body 23,178.5 mm plus half the 920 mm inter-car interval = 23.6385 m allocated pitch. ${WIKI}: "DM vehs.: 23.639 m", the same figure. The 3-car unit is read with the same end cars (Table 1 names DMS2+TPS1+DTMS1 but Fig. 2 dimensions only the 4-car): an assumed transfer of the drawing.`),
  /** Intermediate car: middle of one gap to the middle of the next. */
  intermediateCarPitch: published(23.0, `${FIG2}: intermediate body 22,080 mm plus the 920 mm interval = 23.000 m. ${WIKI}: "Trailers: 23.000 m".`),
  /** The body is shorter than its pitch by half the interval at each inner end. */
  interCarInterval: published(0.92, `${FIG2}: "920" between each pair of car bodies. What the 920 mm spans (body ends or gangway faces) is not stated; it is read as body to body.`),
  bodyWidth: assumed(2.75, 'body width over the side skin; UK-gauge commuter EMUs run 2.70-2.80 m (the Class 380 and 387 are 2.80 m published)'),
  /** Roof edge (top of the side wall's shoulder, the crown of the drawn section). */
  crown: assumed(3.55, 'rail to the roof centre line of the body shell, read off side photographs (scotrail385-04, -05) against the 1.1 m floor'),
  /** Roof equipment wells and covers stand this far above the crown. */
  roofCoverHeight: assumed(0.2, 'height of the grey roof equipment covers over the crown, read off scotrail385-01 and -05'),
  floorHeight: assumed(1.1, 'floor above rail, the usual UK platform-height commuter floor (the Class 700/717 publish 1.1 m)'),
  wheelDiameter: assumed(0.84, 'a typical new UK EMU wheel'),
  wheelbase: assumed(2.5, 'axle spacing in one bogie; the bogies are hidden behind skirts in every reference photograph'),
  /** Bogie centre from the body end, every inner end. */
  bogieFromInnerEnd: assumed(3.1, 'bogie centre from an inner body end, about 15.9 m between centres on a 22.08 m body'),
  /** Cab-end bogie centre from the nose tip. */
  cabBogieFromNose: assumed(4.3, 'cab-end bogie centre from the nose tip, read off scotrail385-05 (the leading wheelset sits behind the cab-side door)'),
  doorWidth: assumed(1.3, 'clear opening of a double-leaf sliding plug door, read off scotrail385-04 against the 23 m car'),
  crewDoorFromNose: assumed(2.95, 'centre of the cab-side crew door from the coupler face, read off scotrail385-05 (scaled from the first passenger door at 6.0 m; a slightly oblique photograph, so about +-0.3 m)'),
  /** The coupler face is the drawing's zero; the gangway hood (the front of the body) stands this far behind it. */
  hoodFromCoupler: assumed(0.3, 'the Dellner coupler face stands proud of the gangway hood, scotrail385-02; Fig. 2 starts the 23,178.5 mm at the coupler'),
  pantographLength: assumed(2.0, 'base frame of the pantograph; no roof view of the 385 shows it whole'),
} as const satisfies Record<string, Figure>;

/** Passenger door centres, metres from the body's own reference end (the nose tip of a cab car, the front body end of a trailer), read off Fig. 2 at its own scale. */
export const SR385_DOORS = {
  DMCL: drawn(6.4, `${FIG2}: DMC1 vestibules at about 6.4 m and 17.9 m from the nose tip (the second figure is DOORS_DMCL_REAR)`),
  DMCL_REAR: drawn(17.9, `${FIG2}: DMC1 second vestibule, about 17.9 m from the nose tip`),
  DMSL: drawn(6.0, `${FIG2}: DMS1 vestibules at about 6.0 m and 17.7 m from the nose tip`),
  DMSL_REAR: drawn(17.7, `${FIG2}: DMS1 second vestibule, about 17.7 m from the nose tip`),
  TRAILER: drawn(5.35, `${FIG2}: TPS1 and TS1 vestibules about 5.35 m in from each body end (5.36/5.27 on TPS1, 5.42/5.48 on TS1)`),
} as const satisfies Record<string, Figure>;

export type Sr385CarType = 'DMCL' | 'DMSL' | 'PTS' | 'TS';
export interface Sr385Spec {
  readonly kind: Sr385Kind;
  readonly classes: string;
  readonly cars: readonly Sr385CarType[];
  /** Traction bogies in train order, one pair per car: M motor, T trailer. */
  readonly bogies: readonly string[];
  readonly source: string;
}
export const SR385_SPECS: Readonly<Record<Sr385Kind, Sr385Spec>> = {
  sr385x3: { kind: 'sr385x3', classes: '385/0', cars: ['DMSL', 'PTS', 'DMSL'], bogies: ['MM', 'TT', 'MT'],
    source: `${WIKI}: "3 cars per 385/0 unit: DMSL-PTS-DMSL", UIC "385/0: Bo'Bo'+2'2'+Bo'2'" (the rear driving car's inner bogie powered, its cab-end bogie a trailer); ${HITACHI}, Table 1: "Three cars (DMS2+TPS1+DTMS1)", 46 three-car sets.` },
  sr385x4: { kind: 'sr385x4', classes: '385/1', cars: ['DMCL', 'PTS', 'TS', 'DMSL'], bogies: ['MM', 'TT', 'TT', 'MM'],
    source: `${WIKI}: "4 cars per 385/1 unit: DMCL-PTS-TS-DMSL", UIC "385/1: Bo'Bo'+2'2'+2'2'+Bo'Bo'"; ${HITACHI}, Table 1 and Fig. 2: "Four cars (DMC1+TPS1+TS1+DMS1)", 24 four-car sets.` },
};

export interface Sr385Car extends Omit<Car, 'type'> {
  readonly type: Sr385CarType;
  /** Passenger door centres along the train (s from the front nose). */
  readonly doors: readonly number[];
  /** The crew door centre on a cab car, else null. */
  readonly crewDoor: number | null;
}
export interface Sr385Layout extends EdinburghLayout { readonly spec: Sr385Spec; readonly cars: readonly Sr385Car[] }

/**
 * The cars end to end. A cab car's pitch runs from its nose tip to the middle of the inner gap; an intermediate's from
 * gap middle to gap middle. Bodies stop half the 920 mm interval short of every inner pitch end (`bodyStart`/`bodyEnd`).
 * The pantograph is on the PTS ("Pantograph Trailer Standard"); where along it is ASSUMED, at the car's middle.
 */
export function sr385Layout(kind: Sr385Kind): Sr385Layout {
  const spec = SR385_SPECS[kind], F = SR385_FIGURES, last = spec.cars.length - 1, half = F.interCarInterval.value / 2;
  let at = 0;
  const cars = spec.cars.map((type, index): Sr385Car => {
    const cab: Car['cab'] = index === 0 ? 'front' : index === last ? 'rear' : null;
    const length = cab ? F.drivingCarPitch.value : F.intermediateCarPitch.value;
    const start = at, end = at + length;
    at = end;
    const fromNose = (s: number): number => cab === 'rear' ? end - s : start + s;
    let bogies: [number, number], doors: number[];
    if (cab) {
      const a = fromNose(F.cabBogieFromNose.value), b = fromNose(F.drivingCarPitch.value - half - F.bogieFromInnerEnd.value);
      bogies = [Math.min(a, b), Math.max(a, b)];
      const [d0, d1] = type === 'DMCL' ? [SR385_DOORS.DMCL.value, SR385_DOORS.DMCL_REAR.value] : [SR385_DOORS.DMSL.value, SR385_DOORS.DMSL_REAR.value];
      doors = [fromNose(d0), fromNose(d1)].sort((p, q) => p - q);
    } else {
      bogies = [start + half + F.bogieFromInnerEnd.value, end - half - F.bogieFromInnerEnd.value];
      doors = [start + half + SR385_DOORS.TRAILER.value, end - half - SR385_DOORS.TRAILER.value];
    }
    const code = spec.bogies[index]!;
    const pantograph = type === 'PTS' ? [(start + end) / 2 - F.pantographLength.value / 2, (start + end) / 2 + F.pantographLength.value / 2] as const : null;
    return { type, index, length, start, end, cab, bogies, motor: [code[0] === 'M', code[1] === 'M'], pantograph, doors, crewDoor: cab ? fromNose(F.crewDoorFromNose.value) : null };
  });
  return { spec, length: at, cars };
}

/** Where the body (not the pitch) of a car starts and ends along the train: the nose tip at a cab, half the interval in from every inner end. */
export function bodySpan(car: Pick<Car, 'start' | 'end' | 'cab'>): [number, number] {
  const half = SR385_FIGURES.interCarInterval.value / 2;
  return [car.cab === 'front' ? car.start : car.start + half, car.cab === 'rear' ? car.end : car.end - half];
}
