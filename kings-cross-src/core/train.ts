// Hitachi AT300 trains (Class 800 and 801 LNER Azuma, 802 Hull Trains, 803 Lumo): the numbers
// the 3D model is built from, with where each came from. Pure data and arithmetic, no three.js,
// so a test can pin every figure.
//
// Every figure carries a `basis`, because they are not equally good:
//   published: printed by the manufacturer or in a reference work that cites it;
//   drawn:     read off a drawing or photographs by a third party (gbtrains.uk, a modeller's
//              reference built from LNER livery drawings and photographs). Usable, but not
//              an engineering figure, and its own sources disagree where noted;
//   assumed:   nobody has published it; chosen here so the model has a value, to be replaced.
// The dimension test fails if a figure has no source, so a guess cannot pass as a fact.

export type Basis = 'published' | 'drawn' | 'assumed';
export interface Figure {
  readonly value: number;
  /** metres, unless `unit` says otherwise */
  readonly unit: 'm' | 'ratio';
  readonly basis: Basis;
  readonly source: string;
}

const HITACHI = 'Hitachi Review vol. 63 no. 10 (2014), as quoted in the Wikipedia infoboxes for Class 800 and 801';
const GBTRAINS = 'gbtrains.uk/stock/800 (an independent modeller\'s reference; figures measured from LNER livery drawing ADPL-12-01-02 and photographs, read 2026-11-07)';

export const FIGURES = {
  /** Driving vehicles (the cab cars). 2 x 25.85 + 3 x 26.00 = 129.7 m, the published 5-car length. */
  drivingCarLength: { value: 25.85, unit: 'm', basis: 'published', source: `${HITACHI}: "Driving vehicles: 25.850 m". gbtrains.uk and an older Hitachi table give other values (25.35 to 26.06 m); the unit lengths below only add up with this one.` },
  /** Intermediate vehicles. */
  intermediateCarLength: { value: 26.0, unit: 'm', basis: 'published', source: `${HITACHI}: "Intermediate vehicles: 26.000 m"` },
  /** Body width. The same on 800, 801, 802 and 803 (one bodyshell). */
  bodyWidth: { value: 2.7, unit: 'm', basis: 'published', source: 'Wikipedia infoboxes for Class 800 and 801: "Width 2.7 m (8 ft 10 in)"; Angel Trains gives the 802 as 8 ft 10 in' },
  /**
   * Height of the body's roof edge above the rail head. No printed height exists.
   * The top of the roof covers (the highest point of the body) is this plus roofCoverHeight.
   */
  roofEdgeHeight: { value: 3.35, unit: 'm', basis: 'assumed', source: `Not published. ${GBTRAINS} reads 3.62 m (attributed to Hitachi, with no definition), 12 ft 3 in (3.725 m) "to the body's roof edge", and about 3.85 m from photographs. Reading 3.725 m as the roof edge put the top of the covers at 3.995 m, nearly 4 m, which is too tall for a UK train (Arthur, 2026-11-08: "3.725m seems high"). Taken here: Hitachi's 3.62 m is the top of the roof covers, so the roof edge is 3.62 - 0.27 = 3.35 m. To be replaced by a printed figure.` },
  /** The grey roof covers stand this far above the roof edge. */
  roofCoverHeight: { value: 0.27, unit: 'm', basis: 'drawn', source: `${GBTRAINS}: "the roof covers stand about 11 in (0.27 m) higher" (0.27 to 0.3 m)` },
  /** Axle spacing inside one bogie. */
  bogieWheelbase: { value: 2.6, unit: 'm', basis: 'drawn', source: `${GBTRAINS}: 8 ft 6 in (2,600 mm), Beacon Rail's figure for the 803, which shares the bogie` },
  /** Distance from the cab nose to the centre of the cab-end bogie. */
  cabBogieFromNose: { value: 4.455, unit: 'm', basis: 'drawn', source: `${GBTRAINS}: 14 ft 7 in (4,455 mm) from three side-on photographs, not a dimensioned drawing` },
  /** Distance from the cab nose to the centre of the inner bogie of a driving car. */
  innerBogieFromNose: { value: 21.45, unit: 'm', basis: 'drawn', source: `${GBTRAINS}: drawn at 70 ft 4 in (21,450 mm); photographs give 21,510 and Beacon's diagram 21,590, so unsettled` },
  /** Distance between the two bogie centres of an intermediate car. */
  intermediateBogieSpan: { value: 16.7, unit: 'm', basis: 'drawn', source: `${GBTRAINS} (via its Class 803 page): 16,700 mm for the 800, against Beacon's 17,000 mm for the 803` },
  /** Wheel diameter. Nobody has published it; the wheels are mostly hidden behind skirts. */
  wheelDiameter: { value: 0.86, unit: 'm', basis: 'assumed', source: 'not published; gbtrains.uk: "no source gives the real wheel size". A typical value for a UK EMU, to be replaced.' },
  /** Centre of the pantograph base, measured from the cab nose of its driving car (measured on a first-class car; the other car is assumed the same). */
  pantographFromNose: { value: 20.88, unit: 'm', basis: 'drawn', source: `${GBTRAINS}: folded pantograph spans 19,870 to 21,890 mm from the nose on 802111 (19,700 to 21,750 on 815020); this is the middle` },
  /** Folded pantograph height above the roof edge (a lower bound). */
  pantographFoldedHeight: { value: 0.24, unit: 'm', basis: 'drawn', source: `${GBTRAINS}: "the folded pantograph standing about 240 mm above the roof edge", a lower bound` },
  /** Pantograph footprint along the car (the base frame). */
  pantographLength: { value: 2.02, unit: 'm', basis: 'drawn', source: `${GBTRAINS}: 19,870 to 21,890 mm from the nose, so 2.02 m long` },
  /** Standard gauge. */
  gauge: { value: 1.435, unit: 'm', basis: 'published', source: 'Wikipedia infoboxes: "1,435 mm (4 ft 8+1/2 in) standard gauge"' },
} as const satisfies Record<string, Figure>;

export type CarType = 'DPTS' | 'MS' | 'MC' | 'TS' | 'MF' | 'DPTF';
/** Driving cars have a cab. DPTS and DPTF differ inside (standard or first class), not in length. */
export const DRIVING: ReadonlySet<CarType> = new Set(['DPTS', 'DPTF']);

export type Livery = 'lner' | 'hulltrains' | 'lumo';
export type TrainKind = 'lner5' | 'lner9' | 'hull5' | 'lumo5';

export interface TrainSpec {
  readonly kind: TrainKind;
  /** Classes this kind stands for, for the label. */
  readonly classes: string;
  readonly operator: string;
  readonly livery: Livery;
  /** Front to back. */
  readonly cars: readonly CarType[];
  readonly source: string;
}

const WIKI = 'Wikipedia infoboxes (British Rail Class 800, 801, 802, 803)';
export const TRAIN_SPECS: Readonly<Record<TrainKind, TrainSpec>> = {
  lner5: { kind: 'lner5', classes: '800/2, 801/1', operator: 'LNER', livery: 'lner', cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-MC-DPTF` },
  lner9: { kind: 'lner9', classes: '800/1, 801/2', operator: 'LNER', livery: 'lner', cars: ['DPTS', 'MS', 'MS', 'TS', 'MS', 'TS', 'MC', 'MF', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-TS-MS-TS-MC-MF-DPTF` },
  hull5: { kind: 'hull5', classes: '802/3', operator: 'Hull Trains', livery: 'hulltrains', cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: "5 cars per 802/0 and 802/3 unit: DPTS-MS-MS-MC-DPTF"` },
  lumo5: { kind: 'lumo5', classes: '803', operator: 'Lumo', livery: 'lumo', cars: ['DPTS', 'MS', 'MS', 'MS', 'DPTS'], source: `${WIKI}: "5 cars per unit: DPTS-MS-MS-MS-DPTS"` },
};

export const TRAIN_KINDS = Object.keys(TRAIN_SPECS) as TrainKind[];

export function carLength(type: CarType): number {
  return DRIVING.has(type) ? FIGURES.drivingCarLength.value : FIGURES.intermediateCarLength.value;
}

/** One car, positioned along the train. `s` is metres from the front nose, growing rearwards. */
export interface Car {
  readonly type: CarType;
  readonly index: number;
  readonly length: number;
  readonly start: number;
  readonly end: number;
  /** Where the car's two bogie centres are, as `s` from the front nose. */
  readonly bogies: readonly [number, number];
  /** The pantograph's base, as `s` from the front nose: its two ends (null when this car has none). */
  readonly pantograph: readonly [number, number] | null;
  /** The cab is at this end of the car (null for a car without a cab). 'front' faces the train's front. */
  readonly cab: 'front' | 'rear' | null;
}

export interface TrainLayout {
  readonly spec: TrainSpec;
  readonly length: number;
  readonly cars: readonly Car[];
}

/**
 * The cars of a train laid end to end. Lengths already include the couplings (the unit lengths
 * are the sum of the car lengths), so cars abut.
 *
 * Each driving car carries a pantograph near its inner end: the car codes are DPTS and DPTF,
 * "Driving Pantograph Trailer Standard / First", a Hornby model review of the Class 800 says
 * "one pantograph on each driving car, at the inner ends", and gbtrains.uk draws two per
 * train. Only the first-class car's position was measured (from photographs); the standard-
 * class car, and both cars of the 803, take the same distance from their own nose, which is
 * an assumption.
 */
export function trainLayout(kind: TrainKind): TrainLayout {
  const spec = TRAIN_SPECS[kind];
  const last = spec.cars.length - 1;
  const cars: Car[] = [];
  let at = 0;
  spec.cars.forEach((type, index) => {
    const length = carLength(type);
    const start = at;
    const end = at + length;
    let bogies: [number, number];
    let cab: Car['cab'] = null;
    if (index === 0) {
      bogies = [start + FIGURES.cabBogieFromNose.value, start + FIGURES.innerBogieFromNose.value];
      cab = 'front';
    } else if (index === last) {
      bogies = [end - FIGURES.innerBogieFromNose.value, end - FIGURES.cabBogieFromNose.value];
      cab = 'rear';
    } else {
      const mid = (start + end) / 2;
      bogies = [mid - FIGURES.intermediateBogieSpan.value / 2, mid + FIGURES.intermediateBogieSpan.value / 2];
    }
    // every driving car carries a pantograph at its inner end; "from the nose" counts from the
    // car's own cab nose, so from `start` on the front car and back from `end` on the rear car
    const centre = cab === 'front' ? start + FIGURES.pantographFromNose.value : end - FIGURES.pantographFromNose.value;
    const half = FIGURES.pantographLength.value / 2;
    const pantograph = cab !== null ? ([centre - half, centre + half] as const) : null;
    cars.push({ type, index, length, start, end, bogies, pantograph, cab });
    at = end;
  });
  return { spec, length: at, cars };
}

/** Height of the roof covers and the folded pantograph above the rail head. */
export function roofHeight(): number {
  return FIGURES.roofEdgeHeight.value + FIGURES.roofCoverHeight.value;
}
