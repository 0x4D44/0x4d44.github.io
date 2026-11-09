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

/**
 * The vehicle families the model draws: Hitachi AT300 (Azuma and its cousins), Bombardier Electrostar (Class 387),
 * Siemens Desiro City as the Great Northern 717 and as the Thameslink 700 (two families, because the cars differ in
 * length and the fronts differ), and the Alstom Coradia 1000 diesel Class 180 "Adelante".
 */
export type Family = 'at300' | 'electrostar' | 'desiro' | 'desiro700' | 'adelante';
export type CarType = 'DPTS' | 'MS' | 'MC' | 'TS' | 'MF' | 'DPTF' | 'DMSO' | 'MSO' | 'PTSO' | 'DMOS' | 'TOS' | 'TOSLW' | 'MOS' | 'PTOS'
  | 'DMSL' | 'MFL' | 'MSL' | 'MSLRB' | 'DMCO' | 'TSO' | 'TSOW' | 'TSOLW';
/** Driving cars have a cab. DPTS and DPTF differ inside (standard or first class), not in length. */
export const DRIVING: ReadonlySet<CarType> = new Set(['DPTS', 'DPTF', 'DMSO', 'DMOS', 'DMSL', 'DMCO']);

export type Livery = 'lner' | 'hulltrains' | 'lumo' | 'greatnorthern' | 'grandcentral' | 'thameslink';
/**
 * The trains the model can draw. The first four are Hitachi AT300 (Azuma family). The Great Northern
 * kinds are Class 387 Electrostars (one 4-car unit, or two or three coupled: 8 and 12 cars) and the
 * 6-car Class 717 Desiro City. `gc180x5` is Grand Central's 5-car Class 180 Adelante diesel unit; `tl700x8`
 * and `tl700x12` are the Thameslink Class 700/0 (8 cars) and 700/1 (12 cars) Desiro City.
 */
export type TrainKind = 'lner5' | 'lner9' | 'hull5' | 'lumo5' | 'gn387x4' | 'gn387x8' | 'gn387x12' | 'gn717x6' | 'gc180x5' | 'tl700x8' | 'tl700x12';

export interface TrainSpec {
  readonly kind: TrainKind;
  readonly family: Family;
  /** Classes this kind stands for, for the label. */
  readonly classes: string;
  readonly operator: string;
  readonly livery: Livery;
  /** Front to back. */
  readonly cars: readonly CarType[];
  readonly source: string;
}

const WIKI = 'Wikipedia infoboxes (British Rail Class 800, 801, 802, 803)';
const WIKI_387 = 'Wikipedia infobox for British Rail Class 387 (read 2026-11-08)';
const WIKI_717 = 'Wikipedia infobox for British Rail Class 717 (read 2026-11-08)';
const WIKI_180 = 'Wikipedia infobox for British Rail Class 180 (read 2026-11-08)';
const WIKI_700 = 'Wikipedia infobox for British Rail Class 700 (read 2026-11-08)';
const SIEMENS_700 = 'Siemens datasheet "Desiro City Electrical Multiple Unit for Thameslink" (order no. A19100-V800-B824-V1-7600, Siemens AG 2014; read 2026-11-08)';
/** The 4-car Electrostar unit, and the Desiro City 6-car, as the infoboxes give them. */
const UNIT_387: readonly CarType[] = ['DMSO', 'MSO', 'PTSO', 'DMSO'];
export const TRAIN_SPECS: Readonly<Record<TrainKind, TrainSpec>> = {
  lner5: { kind: 'lner5', family: 'at300', classes: '800/2, 801/1', operator: 'LNER', livery: 'lner', cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-MC-DPTF` },
  lner9: { kind: 'lner9', family: 'at300', classes: '800/1, 801/2', operator: 'LNER', livery: 'lner', cars: ['DPTS', 'MS', 'MS', 'TS', 'MS', 'TS', 'MC', 'MF', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-TS-MS-TS-MC-MF-DPTF` },
  hull5: { kind: 'hull5', family: 'at300', classes: '802/3', operator: 'Hull Trains', livery: 'hulltrains', cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: "5 cars per 802/0 and 802/3 unit: DPTS-MS-MS-MC-DPTF". Cab length ASSUMED from Class 800/801 (25.85 m): https://angeltrains.co.uk/fleet/class-802/ gives only nominal 26 m, not a separate cab length; A Class 802-specific primary cab dimension was not found in the sources reviewed; Wikipedia gives 25.7 m. Retained pending a Class 802 engineering drawing (reviewed 2026-11-09).` },
  lumo5: { kind: 'lumo5', family: 'at300', classes: '803', operator: 'Lumo', livery: 'lumo', cars: ['DPTS', 'MS', 'MS', 'MS', 'DPTS'], source: `${WIKI}: "5 cars per unit: DPTS-MS-MS-MS-DPTS"` },
  gn387x4: { kind: 'gn387x4', family: 'electrostar', classes: '387', operator: 'Great Northern', livery: 'greatnorthern', cars: [...UNIT_387], source: `${WIKI_387}: "4 cars per unit", DMSO-MSO-PTSO-DMSO` },
  gn387x8: { kind: 'gn387x8', family: 'electrostar', classes: '387 x2', operator: 'Great Northern', livery: 'greatnorthern', cars: [...UNIT_387, ...UNIT_387], source: `${WIKI_387}: two 4-car units coupled (the units work in multiple)` },
  gn387x12: { kind: 'gn387x12', family: 'electrostar', classes: '387 x3', operator: 'Great Northern', livery: 'greatnorthern', cars: [...UNIT_387, ...UNIT_387, ...UNIT_387], source: `${WIKI_387}: three 4-car units coupled; the page says c2c ran 387s as 12-car sets` },
  gn717x6: { kind: 'gn717x6', family: 'desiro', classes: '717', operator: 'Great Northern', livery: 'greatnorthern', cars: ['DMOS', 'TOS', 'TOSLW', 'MOS', 'PTOS', 'DMOS'], source: `${WIKI_717}: "DMOS-TOS-TOS(L)W-MOS-PTOS-DMOS" (6 cars)` },
  gc180x5: { kind: 'gc180x5', family: 'adelante', classes: '180', operator: 'Grand Central', livery: 'grandcentral', cars: ['DMSL', 'MFL', 'MSL', 'MSLRB', 'DMSL'], source: `${WIKI_180}: 5 cars per set, "DMSL(A)-MFL-MSL-MSLRB-DMSL(B)"; Angel Trains: "Operate as 5-car units (DMSL[A], MFL, MSL, MSLRB, DMSL[B])"; Wikipedia, Grand Central: Class 180 Adelante, 10 units, 5 carriages each` },
  tl700x8: { kind: 'tl700x8', family: 'desiro700', classes: '700/0', operator: 'Thameslink', livery: 'thameslink', cars: ['DMCO', 'PTSO', 'MSO', 'TSOW', 'TSOLW', 'MSO', 'PTSO', 'DMCO'], source: `${WIKI_700}: 700/0 (8 cars) "DMCO-PTSO-MSO-TSOW-TSOLW-MSO-PTSO-DMCO"` },
  tl700x12: { kind: 'tl700x12', family: 'desiro700', classes: '700/1', operator: 'Thameslink', livery: 'thameslink', cars: ['DMCO', 'PTSO', 'MSO', 'MSO', 'TSO', 'TSOW', 'TSOLW', 'TSO', 'MSO', 'MSO', 'PTSO', 'DMCO'], source: `${WIKI_700}: 700/1 (12 cars) "DMCO-PTSO-MSO-MSO-TSO-TSOW-TSOLW-TSO-MSO-MSO-PTSO-DMCO"` },
};

/** The four Azuma-family kinds (Class 800, 801, 802, 803). The Great Northern kinds are in EMU_KINDS. */
export const TRAIN_KINDS: TrainKind[] = ['lner5', 'lner9', 'hull5', 'lumo5'];
/** The Great Northern commuter kinds: Class 387 (4, 8 and 12 cars) and Class 717. */
export const EMU_KINDS: TrainKind[] = ['gn387x4', 'gn387x8', 'gn387x12', 'gn717x6'];
/** Grand Central's Class 180 Adelante (diesel, 5 cars). */
export const GC_KINDS: TrainKind[] = ['gc180x5'];
/** The Thameslink Class 700 Desiro City: 700/0 (8 cars) and 700/1 (12 cars). */
export const TL_KINDS: TrainKind[] = ['tl700x8', 'tl700x12'];
/** Every kind the model can draw. */
export const ALL_KINDS = Object.keys(TRAIN_SPECS) as TrainKind[];

/**
 * The length of one car. A car code is not enough on its own where two families share it (a PTSO is 20.39 m on a
 * Class 387 and 20.15 m on a Class 700), so name the family; with none, the family the code first belongs to is used.
 */
export function carLength(type: CarType, family?: Family): number {
  const f = family ?? FAMILY_OF_CAR[type];
  if (f === undefined || f === 'at300') return DRIVING.has(type) ? FIGURES.drivingCarLength.value : FIGURES.intermediateCarLength.value;
  const fig = EMU_FIGURES[f];
  return DRIVING.has(type) && fig.drivingCarLength ? fig.drivingCarLength.value : fig.carLength.value;
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
  /**
   * Which of the two bogies carry traction motors: [the one nearer the train's front, the other].
   * The Azuma model gives every bogie motors (an assumption); the commuter EMUs follow the published
   * wheel arrangement, so a trailer bogie is drawn without them.
   */
  readonly motor: readonly [boolean, boolean];
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
  if (spec.family !== 'at300') return emuLayout(spec);
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
    cars.push({ type, index, length, start, end, bogies, pantograph, cab, motor: [true, true] });
    at = end;
  });
  return { spec, length: at, cars };
}

/** Height of the roof covers and the folded pantograph above the rail head. */
export function roofHeight(): number {
  return FIGURES.roofEdgeHeight.value + FIGURES.roofCoverHeight.value;
}

// --- the Great Northern commuter EMUs -----------------------------------------------------------
//
// Class 387 (Bombardier Electrostar) and Class 717 (Siemens Desiro City). Same rule as the Azuma
// figures above: every number names its source, and a guess says ASSUMED. Each family has the same
// keys, so the model builder reads one table whichever train it draws.

const LOCO_INFO = 'loco-info.com, Class 387 data (read 2026-11-08)';
const SIEMENS_717 = 'Siemens Mobility datasheet "Desiro City Class 717 for Govia Thameslink Railway" (MOML-T10055-00-7600, Aug 2018; read 2026-11-08)';
const WIKI_ELECTROSTAR = 'Wikipedia, "Bombardier Electrostar" (read 2026-11-08)';

export const ELECTROSTAR = {
  /** Every car of the Class 387. Four cars are the 81.56 m unit; the Electrostar page lists no separate intermediate length for the class. */
  carLength: { value: 20.39, unit: 'm', basis: 'published', source: `${WIKI_387}: "Car length 20.39 metres (66 ft 11 in)". ${LOCO_INFO}: unit length 81.56 m, which is exactly four times this.` },
  bodyWidth: { value: 2.8, unit: 'm', basis: 'published', source: `${WIKI_387}: "Width 2.80 metres (9 ft 2 in)"; ${WIKI_ELECTROSTAR} gives 2.80 m for the family` },
  /** Highest point of the body (roof equipment included), pantograph folded. */
  height: { value: 3.77, unit: 'm', basis: 'published', source: `${WIKI_387}: "Height 3.77 metres (12 ft 4 in)"; ${WIKI_ELECTROSTAR} gives 3.78 m for the family` },
  /** Floor level above the rail head. */
  floorHeight: { value: 1.1, unit: 'm', basis: 'assumed', source: 'Not published for the 387 (none of the pages read gives it). Taken from the Class 717\'s published 1,100 mm; to be replaced.' },
  wheelDiameter: { value: 0.84, unit: 'm', basis: 'assumed', source: 'Not published in any page read; a typical Electrostar new-wheel size, to be replaced.' },
  /** Axle spacing in one bogie (the same for motor and trailer bogies in this model). */
  wheelbaseMotor: { value: 2.7, unit: 'm', basis: 'assumed', source: 'Not published in any page read; a typical value for the Electrostar bogie, to be replaced.' },
  wheelbaseTrailer: { value: 2.7, unit: 'm', basis: 'assumed', source: 'Not published in any page read; taken equal to the motor bogie, to be replaced.' },
  /** Distance from a car end to the centre of the nearer bogie (symmetrical on every car). */
  bogieFromEnd: { value: 3.15, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken 14.09 m apart under a 20.39 m car, to be replaced.' },
  /** Width of one passenger door opening. */
  doorWidth: { value: 1.3, unit: 'm', basis: 'assumed', source: 'Not published in any page read; a typical twin-leaf commuter opening, to be replaced.' },
  /** Distance from the car end to the centre of each end door (two doors a side on every car). */
  doorFromEnd: { value: 4.6, unit: 'm', basis: 'assumed', source: 'Not published in any page read; doors near the quarter points, to be replaced.' },
  /** Length of the pantograph base. */
  pantographLength: { value: 2.0, unit: 'm', basis: 'assumed', source: 'Not published in any page read; the Azuma\'s drawn 2.02 m is used, to be replaced.' },
} as const satisfies Record<string, Figure>;

export const DESIRO_CITY = {
  /** The unit length divided by six: the datasheet gives the whole unit, not the cars, so the split into driving and intermediate cars is a guess. */
  carLength: { value: 121.674 / 6, unit: 'm', basis: 'assumed', source: `${SIEMENS_717}: "Unit length 121,674 mm" (also ${WIKI_717}: 121.7 m); six equal cars is ASSUMED, as no per-car length is published (Wikipedia: car length 20.2 m, Siemens: "nominal vehicle length 20 m")` },
  bodyWidth: { value: 2.8, unit: 'm', basis: 'published', source: `${SIEMENS_717}: "Width 2,800 mm"; ${WIKI_717}: "Width 2.80 m (9 ft 2 in)"` },
  /** Neither the datasheet nor the Wikipedia page gives a height; the Electrostar's published 3.77 m is used (both fit the same UK gauge). */
  height: { value: 3.77, unit: 'm', basis: 'assumed', source: 'Not published (the datasheet and Wikipedia give no height). Taken equal to the Class 387\'s published 3.77 m, as both run the same UK routes; to be replaced.' },
  floorHeight: { value: 1.1, unit: 'm', basis: 'published', source: `${SIEMENS_717}: "Floor height (a.r.l.) 1,100 mm"; ${WIKI_717}: "Floor height 1.10 m (3 ft 7 in)"` },
  wheelDiameter: { value: 0.82, unit: 'm', basis: 'published', source: `${WIKI_717}: "Wheel diameter 820 to 760 mm (new to worn)"; the new wheel is drawn` },
  wheelbaseMotor: { value: 2.2, unit: 'm', basis: 'published', source: `${WIKI_717}: Siemens SGP SF7000 bogies, "Wheelbase 2,200 mm (motor bogies)"` },
  wheelbaseTrailer: { value: 2.1, unit: 'm', basis: 'published', source: `${WIKI_717}: "2,100 mm (trailer bogies)"` },
  bogieFromEnd: { value: 3.1, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken 14.08 m apart under a 20.28 m car, to be replaced.' },
  /** The datasheet's passenger door opening. */
  doorWidth: { value: 1.5, unit: 'm', basis: 'published', source: `${SIEMENS_717}: "Passenger door opening of 1,500 mm", "Two sliding entrance doors per car / side"; ${WIKI_717}: double-leaf pocket sliding doors, 1,500 mm` },
  doorFromEnd: { value: 4.5, unit: 'm', basis: 'assumed', source: 'Not published in any page read; doors near the quarter points, to be replaced.' },
  pantographLength: { value: 2.0, unit: 'm', basis: 'assumed', source: 'Not published in any page read; the Azuma\'s drawn 2.02 m is used, to be replaced.' },
} as const satisfies Record<keyof typeof ELECTROSTAR, Figure>;

// --- the Thameslink Class 700 -------------------------------------------------------------------

/**
 * The Class 700 is the same Siemens Desiro City as the Class 717, so its body, doors and bogies are the 717's; what
 * differs is the length of the cars (the 717's equal split of its unit is an assumption, and the Class 700's two
 * published unit lengths let the split be worked out), the cab front (no emergency door; a yellow warning panel),
 * and the livery.
 *
 * The cars, worked out from the datasheet's two unit lengths, which are exact to 0.1 m: the 12-car unit is the 8-car
 * unit plus four intermediate cars, so an intermediate car is (242.6 - 162.0) / 4 = 20.15 m, and the two end cars
 * share what is left of the 8-car unit: (162.0 - 6 x 20.15) / 2 = 20.55 m. The 717's published 121.674 m is then
 * 2 x 20.55 + 4 x 20.15 = 121.7 m, within 0.03 m, which is a check that the split is right. It holds only if every
 * intermediate car and both end cars are alike, which no source states: ASSUMED.
 */
export const DESIRO_700 = {
  carLength: { value: 20.15, unit: 'm', basis: 'assumed', source: `Not published per car (${WIKI_700}: "Car length 20.2 m"; ${SIEMENS_700}: "Nominal vehicle length 20 m"). Worked out, as ASSUMED, from the datasheet's unit lengths "162,000 mm (8-car)" and "242,600 mm (12-car)": the difference is four intermediate cars, (242.6 - 162.0) / 4 = 20.15 m. To be replaced by a printed figure.` },
  drivingCarLength: { value: 20.55, unit: 'm', basis: 'assumed', source: `Not published per car. Worked out, as ASSUMED, from the 8-car unit length of 162.0 m (${SIEMENS_700}) less six intermediate cars of 20.15 m, shared between the two end cars: (162.0 - 6 x 20.15) / 2 = 20.55 m. The Class 717's published 121.674 m agrees: 2 x 20.55 + 4 x 20.15 = 121.7 m. To be replaced.` },
  bodyWidth: { value: 2.8, unit: 'm', basis: 'published', source: `${SIEMENS_700}: "Width 2,800 mm"; ${WIKI_700}: "Width 2.80 m (9 ft 2 in)"` },
  /** Neither the datasheet nor the Wikipedia page gives a height; taken as the Class 717's assumption. */
  height: { value: 3.77, unit: 'm', basis: 'assumed', source: 'Not published (the Siemens datasheet and Wikipedia give no height). Taken equal to the Class 717\'s assumed 3.77 m, which is the Class 387\'s published height, as all three run the same UK routes; to be replaced.' },
  floorHeight: { value: 1.1, unit: 'm', basis: 'published', source: `${SIEMENS_700}: "Floor height (a.r.l.) 1,100 mm"; ${WIKI_700}: "Floor height 1.10 m (43.31 in)"` },
  wheelDiameter: { value: 0.82, unit: 'm', basis: 'published', source: `${SIEMENS_700}: "Wheel diameter 820 mm (new) / 760 mm (worn)"; the new wheel is drawn` },
  wheelbaseMotor: { value: 2.2, unit: 'm', basis: 'published', source: `${WIKI_700}: Siemens SGP SF7000 bogies, "Wheelbase 2,200 mm (motor bogies)"` },
  wheelbaseTrailer: { value: 2.1, unit: 'm', basis: 'published', source: `${WIKI_700}: "2,100 mm (trailer bogies)"` },
  bogieFromEnd: { value: 3.1, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken about 14 m apart under a 20.15 to 20.55 m car, as for the Class 717, to be replaced.' },
  doorWidth: { value: 1.5, unit: 'm', basis: 'assumed', source: `Not published for the Class 700 (${WIKI_700}: "Double-leaf pocket sliding, 2 per side per car", no width). Taken from the Class 717's published 1,500 mm, the same Desiro City door; to be replaced.` },
  doorFromEnd: { value: 4.5, unit: 'm', basis: 'assumed', source: 'Not published in any page read; doors near the quarter points, to be replaced.' },
  pantographLength: { value: 2.0, unit: 'm', basis: 'assumed', source: 'Not published in any page read; the Azuma\'s drawn 2.02 m is used, to be replaced.' },
} as const satisfies Record<keyof typeof ELECTROSTAR | 'drivingCarLength', Figure>;

// --- the Grand Central Class 180 Adelante ---------------------------------------------------------

const ANGEL_180 = 'Angel Trains fleet page for the Class 180, angeltrains.co.uk/fleet/class-180 (read 2026-11-08)';
const LOCO_180 = 'loco-info.com Class 180 data (read 2026-11-08)';
/**
 * The Class 180 is a diesel-hydraulic Alstom Coradia 1000 multiple unit: one Cummins QSK19 engine and Voith transmission
 * under every car (Wikipedia), with power to one bogie of each car. It has no pantograph. Every other published
 * dimension the model needs (height, floor, wheels, bogies, doors) was not in any page read.
 */
export const ADELANTE = {
  carLength: { value: 23.02, unit: 'm', basis: 'published', source: `${ANGEL_180}, https://angeltrains.co.uk/fleet/class-180/ (reviewed 2026-11-09): 23.02 m for MFL, MSL, MSLRB. Prefer the fleet owner's type-specific figure over ${WIKI_180}'s 23.03 m. Calculated sum from the cited 2 DMSL + 3 intermediate formation: 2*23.71 + 3*23.02 = 116.48 m; this is not a published whole-unit length; the secondary whole-unit figure is 116.52 m (${WIKI_180}; ${LOCO_180}). Do not stretch individual cars to force agreement.` },
  drivingCarLength: { value: 23.71, unit: 'm', basis: 'published', source: `${WIKI_180}: "Car length 23.71 or 23.03 m", the driving cars (DMSL); ${ANGEL_180}: "23.71 m (DMSL)"` },
  bodyWidth: { value: 2.73, unit: 'm', basis: 'published', source: `${WIKI_180}: "Width 2.73 m (8 ft 11 1/2 in)"; ${ANGEL_180}: "Width 2.73 m"` },
  height: { value: 3.77, unit: 'm', basis: 'assumed', source: 'Not published in any page read (Wikipedia, loco-info.com and Angel Trains give no height). 3.77 m is what one aggregator (gptkb.org) lists for the class, unverified, and is the Class 387\'s published height; to be replaced.' },
  floorHeight: { value: 1.1, unit: 'm', basis: 'assumed', source: 'Not published in any page read; a typical UK diesel multiple unit, to be replaced.' },
  wheelDiameter: { value: 0.84, unit: 'm', basis: 'assumed', source: 'Not published in any page read (a forum thread asks the same question unanswered); a typical new wheel for a UK DMU, to be replaced.' },
  wheelbaseMotor: { value: 2.7, unit: 'm', basis: 'assumed', source: 'Not published in any page read (Wikipedia names the bogies "Alstom MB2" and gives no wheelbase); a typical value, to be replaced.' },
  wheelbaseTrailer: { value: 2.7, unit: 'm', basis: 'assumed', source: 'Not published in any page read; taken equal to the motor bogie, to be replaced.' },
  bogieFromEnd: { value: 3.5, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken about 16 m apart under a 23 m car, to be replaced.' },
  doorWidth: { value: 0.9, unit: 'm', basis: 'assumed', source: 'Not published in any page read; a typical single-leaf sliding-plug door opening, to be replaced.' },
  doorFromEnd: { value: 3.8, unit: 'm', basis: 'assumed', source: 'Not published in any page read; a door near each end of every car (from the nose tip on a cab car), to be replaced.' },
} as const satisfies Record<Exclude<keyof typeof ELECTROSTAR, 'pantographLength'> | 'drivingCarLength', Figure>;

/** The figures of a commuter or regional unit (not an Azuma): the same keys for every family, so the model builder reads one table. */
export interface UnitFigures {
  /** Every car; or every car but the driving ones where `drivingCarLength` is given. */
  readonly carLength: Figure;
  readonly drivingCarLength?: Figure;
  readonly bodyWidth: Figure;
  /** Highest point of the body (roof equipment included), pantograph folded. */
  readonly height: Figure;
  readonly floorHeight: Figure;
  readonly wheelDiameter: Figure;
  readonly wheelbaseMotor: Figure;
  readonly wheelbaseTrailer: Figure;
  readonly bogieFromEnd: Figure;
  readonly doorWidth: Figure;
  readonly doorFromEnd: Figure;
  /** Only an electric unit has a pantograph. */
  readonly pantographLength?: Figure;
}
export type EmuFamily = 'electrostar' | 'desiro' | 'desiro700' | 'adelante';
export const EMU_FIGURES: Readonly<Record<EmuFamily, UnitFigures>> = { electrostar: ELECTROSTAR, desiro: DESIRO_CITY, desiro700: DESIRO_700, adelante: ADELANTE };

/** The family a car code first belongs to, for `carLength(type)` called without a family (PTSO and MSO are on the 387 and the 700 alike). */
const FAMILY_OF_CAR: Partial<Record<CarType, EmuFamily>> = {
  DMSO: 'electrostar', MSO: 'electrostar', PTSO: 'electrostar',
  DMOS: 'desiro', TOS: 'desiro', TOSLW: 'desiro', MOS: 'desiro', PTOS: 'desiro',
  DMCO: 'desiro700', TSO: 'desiro700', TSOW: 'desiro700', TSOLW: 'desiro700',
  DMSL: 'adelante', MFL: 'adelante', MSL: 'adelante', MSLRB: 'adelante',
};

/**
 * Where the traction (or drive) bogies are, from the published wheel arrangements. Written in train order,
 * first bogie then second, T for a trailer bogie and M for a motor bogie. A cab car with no entry has its motor bogie at
 * the inner end (see `emuLayout`).
 * Class 387, loco-info.com: 2-B + 2-B + 2-2 + B-2, so the motor bogie is the inner one of a driving car.
 * Class 717, Wikipedia: Bo'Bo' + 2'2' + 2'2' + Bo'Bo' + 2'2' + Bo'Bo'.
 * Class 700, Siemens datasheet "Axle arrangement": 8-car Bo'Bo'+2'2'+Bo'Bo'+2'2'+2'2'+Bo'Bo'+2'2'+Bo'Bo' and 12-car
 * Bo'Bo'+2'2'+Bo'Bo'+Bo'Bo'+2'2'+2'2'+2'2'+2'2'+Bo'Bo'+Bo'Bo'+2'2'+Bo'Bo'.
 * Class 180, Wikipedia: 2'B'+B'2'+B'2'+B'2'+B'2' (one driven bogie a car, the cab-end bogie of a driving car is the trailing one).
 */
const EMU_BOGIES: Readonly<Record<EmuFamily, Partial<Record<CarType, string>>>> = {
  electrostar: { MSO: 'TM', PTSO: 'TT' },
  desiro: { TOS: 'TT', TOSLW: 'TT', MOS: 'MM', PTOS: 'TT', DMOS: 'MM' },
  desiro700: { DMCO: 'MM', PTSO: 'TT', MSO: 'MM', TSO: 'TT', TSOW: 'TT', TSOLW: 'TT' },
  adelante: { MFL: 'MT', MSL: 'MT', MSLRB: 'MT' },
};

/** The car that carries the pantograph on a commuter EMU: the "P" in PTSO / PTOS (Pantograph Trailer). */
const EMU_PANTOGRAPH_CARS: ReadonlySet<CarType> = new Set(['PTSO', 'PTOS']);

function emuLayout(spec: TrainSpec): TrainLayout {
  const family = spec.family as EmuFamily;
  const f = EMU_FIGURES[family];
  const cars: Car[] = [];
  let cursor = 0;
  spec.cars.forEach((type, index) => {
    const length = carLength(type, family);
    const start = cursor;
    const end = cursor + length;
    // a cab at the end of a unit: the first car of each unit looks forward, the last backward. On the
    // 387 a unit is four cars, so a coupled set has driving cars in the middle with their noses together.
    const unitSize = spec.family === 'electrostar' ? UNIT_387.length : spec.cars.length;
    const inUnit = index % unitSize;
    const cab: Car['cab'] = DRIVING.has(type) ? (inUnit === 0 ? 'front' : 'rear') : null;
    const bogies: [number, number] = [start + f.bogieFromEnd.value, end - f.bogieFromEnd.value];
    // a driving car (DMSO, DMSL) has its motor bogie at the inner end, so the order depends on which end the cab is
    const code = EMU_BOGIES[family][type] ?? (cab === 'front' ? 'TM' : 'MT');
    const motor: [boolean, boolean] = [code[0] === 'M', code[1] === 'M'];
    const centre = (start + end) / 2;
    const half = (f.pantographLength?.value ?? 0) / 2;
    const pantograph = EMU_PANTOGRAPH_CARS.has(type) && f.pantographLength ? ([centre - half, centre + half] as const) : null;
    cars.push({ type, index, length, start, end, bogies, pantograph, cab, motor });
    cursor = end;
  });
  return { spec, length: cursor, cars };
}
