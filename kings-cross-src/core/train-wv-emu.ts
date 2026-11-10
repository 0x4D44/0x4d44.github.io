// The Edinburgh Waverley electric units: ScotRail's Class 334 Juniper (3 cars) and TransPennine Express's Class 397 Nova 2 (CAF Civity, 5 cars).
// Pure data and arithmetic, no three.js. Kept apart from core/train.ts on purpose (the EMR pattern): these kinds are not TrainKinds, so they never
// join ALL_KINDS, the King's Cross tests that loop over it, or King's Cross allocation. Waverley draws them through its own fleet table.
//
// Every figure names its basis as core/train.ts does: `published` (an owner or maker printed it), `drawn` (read off a named photograph against a
// stated scale; good to the stated tolerance, not an engineering figure) or `assumed` (nobody has published it and no photograph settles it).
// Photograph names are the private review set's (train-rubric/refs/scotrail334, refs/tpe397); they are never shipped.
import type { Car, Figure } from './train.ts';

export type WvEmuKind = 'sr334x3' | 'tpe397x5';
export const WV_EMU_KINDS: readonly WvEmuKind[] = ['sr334x3', 'tpe397x5'];
export const isWvEmuKind = (kind: string): kind is WvEmuKind => (WV_EMU_KINDS as readonly string[]).includes(kind);
export type WvEmuFamily = 'juniper' | 'civity';

const EVERSHOLT_334 = 'Eversholt Rail fleet page https://eversholtrail.co.uk/fleet/class-334/ ("Dimensions of unit": DMS 21.01m, PTOS 19.94m; saved with SHA256 receipt in edinburgh-primary/electrics/eversholt-class334.html, read 2026-11-09). The owner does not say what the lengths are measured between (body or over couplers): the model reads them as allocated car pitches, which is an inference';
const EVERSHOLT_397 = 'Eversholt Rail fleet page https://eversholtrail.co.uk/fleet/class-397/ (driving 24.030 m, intermediate 23.350 m; read 2026-11-09). Endpoints unspecified by the owner; read as allocated car pitches (an inference). CAF\'s project page rounds the unit to 118.000 m; the role sum 2 x 24.030 + 3 x 23.350 = 118.110 m is derived, not published';

const published = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'published', source });
const drawn = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'drawn', source: `DRAWN: ${source}` });
const assumed = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'assumed', source: `ASSUMED: ${source}` });

/** The figures one family is built from. Same keys for both, so the builder reads one table. */
export interface WvEmuFigures {
  readonly drivingCarLength: Figure;
  readonly carLength: Figure;
  readonly bodyWidth: Figure;
  /** Highest point of the body (roof equipment included), pantograph folded. */
  readonly height: Figure;
  readonly floorHeight: Figure;
  readonly wheelDiameter: Figure;
  readonly wheelbase: Figure;
  /** Car end (allocated pitch end) to the centre of the nearer bogie. */
  readonly bogieFromEnd: Figure;
  /** Car end to the centre of the pantograph's base, on the pantograph car's end nearer the middle of the unit. */
  readonly pantographFromEnd: Figure;
  readonly pantographLength: Figure;
}

export const JUNIPER: WvEmuFigures = {
  drivingCarLength: published(21.01, `${EVERSHOLT_334}: DMS`),
  carLength: published(19.94, `${EVERSHOLT_334}: PTOS`),
  bodyWidth: assumed(2.8, 'no primary width recovered (the electric research pass found a secondary 2.80 m but did not adopt it: its endpoint is unverified). 2.80 m is the UK EMU gauge width the photographs agree with; to be replaced by an owner or Alstom figure'),
  height: assumed(3.77, 'no primary height recovered (secondary 3.77 m seen, not adopted). Rail to the top of the roof equipment, pantograph folded; to be replaced'),
  floorHeight: assumed(1.1, 'not published in any source read; a UK suburban EMU floor, consistent with the door sills in scotrail334_01 and _06 standing about one third of the body height up'),
  wheelDiameter: assumed(0.84, 'not published in any source read; a typical new UK EMU wheel'),
  wheelbase: assumed(2.6, 'not published in any source read; no close bogie photograph of a Class 334 in the review set'),
  bogieFromEnd: assumed(3.0, 'not published; scotrail334_02 shows the leading bogie under the crew door, about 3 m behind the face, and the same inset is used at every car end'),
  pantographFromEnd: drawn(3.0, 'scotrail334_01 (334014 leading) shows the raised pantograph at the leading end of the middle car, a little behind the first coupling; scotrail334_02 the same at a car end; about 3 m (+-1 m) from the car end, read against the car length'),
  pantographLength: assumed(2.0, 'not published; the same footprint as the other EMU kinds'),
};

export const CIVITY: WvEmuFigures = {
  drivingCarLength: published(24.03, `${EVERSHOLT_397}: DMFLW and DMSL`),
  carLength: published(23.35, `${EVERSHOLT_397}: PTS, MSL, PTSL`),
  bodyWidth: assumed(2.75, 'no primary width recovered for the Class 397 (the intercity research pass lists width as unknown); a UK gauge intercity body, to be replaced'),
  height: assumed(3.8, 'no primary height recovered (unknown in the research pass); to be replaced. The window band below is read off tpe397-02 against this height, so it carries the same assumption'),
  floorHeight: assumed(1.15, 'not published; tpe397-02 puts the sill about 1.0 m up against the assumed 3.8 m height, and the floor a little over it'),
  wheelDiameter: drawn(0.85, 'tpe397-03 (a trailer bogie side on, Velim 2019): the wheel outline is 435 px against an 85 px rail of 172 mm (UIC60 assumed at the Velim test ring), so 0.88 m over the flange and about 0.85 m on the tread, +-5%'),
  wheelbase: drawn(2.5, 'tpe397-03: axle centres 1230 px apart against the same 85 px / 172 mm rail, so 2.49 m, +-5%. The rail\'s section at Velim is an assumption, so is the scale'),
  bogieFromEnd: drawn(4.2, 'tpe397-02 (an intermediate car side on): the near bogie\'s centre about 3.8 m inside the body end, scaled by that bogie\'s own wheelbase; +-0.4 m'),
  pantographFromEnd: drawn(2.9, 'tpe397-02 (the folded pantograph and its insulators at one end of a pantograph car), tpe397-05 (raised, at the end of car 2 toward the middle car) and tpe397-06 (folded, the same end): about 2.9 m (+-0.5 m) from the car end'),
  pantographLength: assumed(2.0, 'not published; the same footprint as the other EMU kinds'),
};

export const WV_EMU_FIGURES: Readonly<Record<WvEmuFamily, WvEmuFigures>> = { juniper: JUNIPER, civity: CIVITY };

export interface WvEmuSpec {
  readonly kind: WvEmuKind;
  readonly family: WvEmuFamily;
  readonly classes: string;
  readonly operator: string;
  /** ATOC code the Waverley evidence carries. */
  readonly operatorCode: 'SR' | 'TP';
  readonly label: string;
  /** Front to back. */
  readonly cars: readonly string[];
  /** Per car, train order: which of its two bogies (nearer the front, the other) carry traction motors. */
  readonly motors: readonly (readonly [boolean, boolean])[];
  readonly pantographCars: readonly number[];
  readonly source: string;
}

export const WV_EMU_SPECS: Readonly<Record<WvEmuKind, WvEmuSpec>> = {
  sr334x3: {
    kind: 'sr334x3', family: 'juniper', classes: '334', operator: 'ScotRail', operatorCode: 'SR', label: 'ScotRail 334 Juniper',
    cars: ['DMS', 'PTOS', 'DMS'],
    // ASSUMED: no wheel arrangement was recovered; one motor bogie under each driving car, at its inner end (as the other EMUs are drawn), none under the trailer
    motors: [[false, true], [false, false], [true, false]],
    pantographCars: [1],
    source: `ScotRail May 2026 unit diagrams ("Class 334 - 3 Car EMU HAGF"; 107 of 154 diagram blocks call at Edinburgh) and ${EVERSHOLT_334}: DMS-PTOS-DMS. The motor bogies are ASSUMED (no wheel arrangement recovered).`,
  },
  tpe397x5: {
    kind: 'tpe397x5', family: 'civity', classes: '397', operator: 'TransPennine Express', operatorCode: 'TP', label: 'TransPennine Express 397 Nova 2',
    cars: ['DMFLW', 'PTS', 'MSL', 'PTSL', 'DMSL'],
    // CAF names the five cars Mc-T-M-T-Mc (motor cab, trailer, motor). Which bogies of a motor car are powered is not published: ASSUMED both
    motors: [[true, true], [false, false], [true, true], [false, false], [true, true]],
    pantographCars: [1, 3],
    source: `TransPennine Express Nova 2 page (twelve five-car CAF units, Liverpool / Manchester Airport - Glasgow / Edinburgh) and ${EVERSHOLT_397}: DMFLW-PTS-MSL-PTSL-DMSL; CAF Mc-T-M-T-Mc. Two pantograph cars (PTS, PTSL) by code; tpe397-05 shows one raised at the end of car 2 nearer the middle car.`,
  },
};

/** One car of a Waverley EMU, as the shared car record (core/train.ts `Car`) with its own car code. */
export interface WvEmuCar extends Omit<Car, 'type'> { readonly type: string }
export interface WvEmuLayout { readonly spec: WvEmuSpec; readonly length: number; readonly cars: readonly WvEmuCar[] }

/**
 * The cars laid end to end, the published lengths read as allocated pitches, so the cars abut. A pantograph stands at the end of its car nearer the
 * middle of the unit (tpe397-05, -06); on the unit's own middle car (the 334's PTOS) at its front end (scotrail334_01).
 */
export function wvEmuLayout(kind: WvEmuKind): WvEmuLayout {
  const spec = WV_EMU_SPECS[kind];
  const f = WV_EMU_FIGURES[spec.family];
  const last = spec.cars.length - 1;
  const lengths = spec.cars.map((_, i) => (i === 0 || i === last ? f.drivingCarLength.value : f.carLength.value));
  const total = lengths.reduce((a, b) => a + b, 0);
  let at = 0;
  const cars = spec.cars.map((type, index): WvEmuCar => {
    const length = lengths[index] as number;
    const start = at;
    const end = at + length;
    at = end;
    const cab: Car['cab'] = index === 0 ? 'front' : index === last ? 'rear' : null;
    let pantograph: [number, number] | null = null;
    if (spec.pantographCars.includes(index)) {
      const centre = (start + end) / 2 < total / 2 - 1e-6 ? end - f.pantographFromEnd.value : start + f.pantographFromEnd.value;
      pantograph = [centre - f.pantographLength.value / 2, centre + f.pantographLength.value / 2];
    }
    const motor = spec.motors[index] as readonly [boolean, boolean];
    return { type, index, length, start, end, cab, pantograph, motor, bogies: [start + f.bogieFromEnd.value, end - f.bogieFromEnd.value] };
  });
  return { spec, length: total, cars };
}
