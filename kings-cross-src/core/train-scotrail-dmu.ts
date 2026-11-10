// ScotRail diesel multiple units seen at Edinburgh Waverley: the Class 170/4 Turbostar (three cars) and the Class 158 Express
// Sprinter (two cars). Pure data and arithmetic, no three.js. Kept apart from core/train.ts on purpose: these are Edinburgh
// kinds, not King's Cross ones, so they are not in TrainKind or ALL_KINDS (the EMR pattern, core/train-emr.ts).
//
// Every figure carries a basis, as in core/train.ts. "published" here means an owner's sheet prints the number; none of those
// sheets defines its endpoints, so each length is read as the allocated car pitch (cars abut in the layout), which is an
// inference, not a published definition. Everything else is ASSUMED and says so.
//
// Unit lengths chosen from the research (train-rubric/edinburgh-diesel-research.md, edinburgh-fleets.md):
//   - 170: one THREE-car unit. Porterbrook's 170/4 sheet prints a three-car DMCL-MS-DMSL formation, and the ScotRail accessibility
//     guide (April 2022) lists the 170 as 3 or 6 cars. Six cars is two coupled units, which this kind does not draw.
//   - 158: one TWO-car unit. Angel Trains' Class 158 page prints a two-car DMSLA-DMSLB formation, and the guide lists the 158 as
//     2, 4 or 6 cars (one, two or three units).
import type { Car, Figure } from './train.ts';

export type ScotrailDmuKind = 'sr170x3' | 'sr158x2';
export const SCOTRAIL_DMU_KINDS: readonly ScotrailDmuKind[] = ['sr170x3', 'sr158x2'];
export type ScotrailDmuFamily = 'turbostar' | 'sprinter158';

const PORTERBROOK_170 = 'Porterbrook, "170 & 171 Diesel Multiple Unit" brochure, September 2013, PDF p. 14 (brochure pp. 26-27), archived https://web.archive.org/web/20151123060147id_/http://www.porterbrook.co.uk:80/downloads/brochures/170%20Brochure.pdf (read 2026-11-09, train-rubric/edinburgh-primary/diesels/)';
const ANGEL_158 = 'Angel Trains, Class 158 fleet page (title, heading and table say Class 158; served under the misleading slug https://angeltrains.co.uk/fleet/class-156/ ; saved as edinburgh-primary/diesels/angel158-misnamed-slug.html, read 2026-11-09)';
const PORTERBROOK_159 = 'Porterbrook, "159 Diesel Multiple Unit" brochure, January 2013, PDF p. 8, archived https://web.archive.org/web/20150616073743id_/http://www.porterbrook.co.uk:80/downloads/brochures/159%20Brochure.pdf';
const SCOTRAIL_GUIDE = 'ScotRail accessibility guide (April 2022 footer), https://www.scotrail.co.uk/media/3502/download?inline=';

const published = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'published', source });
const assumed = (value: number, reason: string): Figure => ({ value, unit: 'm', basis: 'assumed', source: `ASSUMED: ${reason}; no primary figure found in the 2026-11-09 Edinburgh diesel research. To be replaced by a dimensioned drawing.` });

export interface ScotrailDmuFigures {
  readonly drivingLength: Figure;
  readonly intermediateLength: Figure;
  readonly width: Figure;
  /** rail head to the highest point of the roof (datum of any published figure unstated) */
  readonly height: Figure;
  /** underside of the body side above the rail head */
  readonly floor: Figure;
  readonly wheelDiameter: Figure;
  readonly wheelbase: Figure;
  /** bogie centre in from the allocated car end (not the axle wheelbase) */
  readonly bogieInset: Figure;
  readonly doorWidth: Figure;
}

export const SCOTRAIL_DMU_FIGURES: Readonly<Record<ScotrailDmuFamily, ScotrailDmuFigures>> = {
  turbostar: {
    drivingLength: published(23.62, `${PORTERBROOK_170}: DMCL(W) and DMSL "Length 23.62 m"; endpoints unspecified, read as the allocated car pitch (an inference). Eversholt's 170/171 page rounds the driving car to 23.6 m.`),
    intermediateLength: published(23.61, `${PORTERBROOK_170}: MS "Length 23.61 m"; endpoints unspecified. The three-car sum 70.85 m is arithmetic, not a certified unit length.`),
    width: published(2.69, `${PORTERBROOK_170}: "Width 2.69 m"; whether over the body or over fittings is unstated.`),
    height: published(3.77, `${PORTERBROOK_170}: "Height 3.77 m"; the datum (rail head to roof, or to the highest fitting) is unstated, and the model reads it as rail head to the roof's crown.`),
    floor: assumed(1.02, 'underside of the body side, read off scotrail170-01 against the 3.77 m height (the sill stands a little above the buffer beam)'),
    wheelDiameter: assumed(0.84, 'a typical new wheel for a UK diesel multiple unit; the Turbostar\'s is not in the sources read'),
    wheelbase: assumed(2.6, 'axle spacing of one bogie, not published in the sources read'),
    bogieInset: assumed(3.8, 'bogie centres about 16 m apart under a 23.6 m car; not published in the sources read, and no photograph is square-on enough to measure'),
    doorWidth: assumed(1.3, 'twin-leaf sliding plug door opening, read off scotrail170-01 and scotrail170-02 against the window bays'),
  },
  sprinter158: {
    drivingLength: published(22.57, `${ANGEL_158}: "Length 22.57 m"; endpoints unspecified, read as the allocated car pitch (an inference). The owner page is for the Class 158 family, not a separately measured ScotRail subfleet. The related Class 159/0 sheet prints 22.16 m (${PORTERBROOK_159}); the 0.41 m difference is not reconciled.`),
    intermediateLength: published(22.57, `${ANGEL_158}: a two-car unit has no intermediate car; the figure is the driving car's, carried only so the table has the same keys.`),
    width: published(2.70, `${ANGEL_158}: "Width 2.70 m".`),
    height: assumed(3.73, `no Class 158 height was recovered. Taken from the related Class 159/0 sheet (${PORTERBROOK_159}: "Height 3.73 m", a converted 158 body, datum unstated) as a comparator only`),
    floor: assumed(1.05, 'underside of the body side, read off scotrail158-01 and scotrail158-05 against the assumed 3.73 m height'),
    wheelDiameter: assumed(0.84, 'a typical new wheel for a UK diesel multiple unit; the 158\'s is not in the sources read'),
    wheelbase: assumed(2.6, 'axle spacing of one bogie, not published in the sources read'),
    bogieInset: assumed(3.55, 'bogie centres about 15.5 m apart under a 22.57 m car; not published in the sources read'),
    doorWidth: assumed(1.1, 'the door is two narrow leaves, each with one tall round-ended window (scotrail158-05, scotrail158-01); the opening is read against the windows beside it'),
  },
};

/** The gap between two bodies is twice this; the gangway and couplers fill it. ASSUMED, the value the other kinds use (web/src/train.ts END_GAP). */
export const SCOTRAIL_DMU_END_GAP = assumed(0.35, 'half the gap between two coupled bodies, as for the other kinds');

export interface ScotrailDmuSpec {
  readonly kind: ScotrailDmuKind;
  readonly family: ScotrailDmuFamily;
  readonly classes: string;
  readonly operator: 'SR';
  readonly operatorName: 'ScotRail';
  readonly label: string;
  /** front to back */
  readonly cars: readonly string[];
  /** which bogie of each car is driven ([nearer the train's front, the other]): one engine and one driven bogie a car, ASSUMED placement */
  readonly motor: readonly (readonly [boolean, boolean])[];
  readonly source: string;
}

export const SCOTRAIL_DMU_SPECS: Readonly<Record<ScotrailDmuKind, ScotrailDmuSpec>> = {
  sr170x3: {
    kind: 'sr170x3', family: 'turbostar', classes: '170/4', operator: 'SR', operatorName: 'ScotRail', label: 'ScotRail Class 170 Turbostar · 3 cars',
    cars: ['DMCL', 'MS', 'DMSL'],
    // ASSUMED: one underfloor engine and one driven bogie a car; on a driving car the inner bogie, on the MS the one at its DMSL end. Not published in the sources read.
    motor: [[false, true], [false, true], [true, false]],
    source: `${PORTERBROOK_170}: three-car 170/4, DMCL(W)-MS-DMSL, BSI outer and bar inner couplers. ${SCOTRAIL_GUIDE}: Class 170, 3 or 6 cars, on Edinburgh/Glasgow-Aberdeen/Inverness and the Fife Circle. One unit is drawn; a six-car pair is not.`,
  },
  sr158x2: {
    kind: 'sr158x2', family: 'sprinter158', classes: '158', operator: 'SR', operatorName: 'ScotRail', label: 'ScotRail Class 158 Express Sprinter · 2 cars',
    cars: ['DMSLA', 'DMSLB'],
    // ASSUMED: one underfloor engine and one driven bogie a car, the inner one. Not published in the sources read.
    motor: [[false, true], [true, false]],
    source: `${ANGEL_158}: two-car DMSLA-DMSLB units. ${SCOTRAIL_GUIDE}: Class 158, 2, 4 or 6 cars, Edinburgh local and Edinburgh/Glasgow to Inverness, Aberdeen and Dundee. One unit is drawn; coupled pairs are not.`,
  },
};

export interface ScotrailDmuCar extends Omit<Car, 'type'> { readonly type: string }
export interface ScotrailDmuLayout { readonly spec: ScotrailDmuSpec; readonly length: number; readonly cars: readonly ScotrailDmuCar[] }

/** The cars laid end to end (each length is its allocated pitch, so cars abut), with their bogie centres and cab ends. No pantograph: these are diesel units. */
export function scotrailDmuLayout(kind: ScotrailDmuKind): ScotrailDmuLayout {
  const spec = SCOTRAIL_DMU_SPECS[kind];
  const f = SCOTRAIL_DMU_FIGURES[spec.family];
  const last = spec.cars.length - 1;
  let at = 0;
  const cars = spec.cars.map((type, index): ScotrailDmuCar => {
    const cab: Car['cab'] = index === 0 ? 'front' : index === last ? 'rear' : null;
    const length = cab ? f.drivingLength.value : f.intermediateLength.value;
    const start = at;
    at += length;
    const motor = spec.motor[index] ?? [false, false];
    return { type, index, length, start, end: at, cab, bogies: [start + f.bogieInset.value, at - f.bogieInset.value], pantograph: null, motor: [motor[0], motor[1]] };
  });
  return { spec, length: at, cars };
}
