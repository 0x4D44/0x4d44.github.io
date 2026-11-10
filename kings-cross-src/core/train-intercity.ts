// The regular intercity diesels at Edinburgh Waverley: the CrossCountry Voyagers (Class 220, four cars; Class 221, five cars) and the
// ScotRail Inter7City HST (two Class 43 power cars and four or five Mk3 coaches). Pure data and arithmetic, no three.js.
//
// These kinds stand apart from the King's Cross TrainKind list (core/train.ts), as the EMR kinds do (core/train-emr.ts): the Waverley layer
// picks them by evidence (web/src/edinburgh-fleet.ts), never by length, and no King's Cross test or allocation sees them.
//
// Every figure carries a basis, as core/train.ts's do:
//   published: printed by the manufacturer, the owner or the operator;
//   drawn:     read off a manufacturer's general-arrangement drawing (proportions measured, not a printed dimension);
//   assumed:   no source found; chosen so the model has a value. ASSUMED in the source text too.
// A fleet appearance is never proof of an individual service's allocation.
import type { Car, Figure } from './train.ts';

export type IntercityKind = 'xc220x4' | 'xc221x5' | 'srhstx4' | 'srhstx5';
export const INTERCITY_KINDS: readonly IntercityKind[] = ['xc220x4', 'xc221x5', 'srhstx4', 'srhstx5'];
/** The body a car is drawn with: a Voyager car (220 and 221 share the body), a Class 43 power car or a Mk3 HST coach. */
export type IntercityBody = 'voyager' | 'class43' | 'mk3';
export type IntercityFamily = 'voyager220' | 'voyager221' | 'hst';

const published = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'published', source });
const drawn = (value: number, source: string): Figure => ({ value, unit: 'm', basis: 'drawn', source });
const assumed = (value: number, reason: string): Figure => ({ value, unit: 'm', basis: 'assumed', source: `ASSUMED: ${reason}` });

const BOMBARDIER_220 = 'Bombardier, Voyager United Kingdom project page (archived 2017-12-27), https://web.archive.org/web/20171227121933id_/http://www.bombardier.com:80/en/transportation/projects/project.voyager-uk.html';
const BOMBARDIER_220_GA = 'Bombardier driving-car general arrangement, "voyager-diesel-electric multiple unit-techdraw.gif" (archived 2015-09-12), https://web.archive.org/web/20150912040211id_/http://www.bombardier.com/content/dam/Websites/bombardiercom/Projects/technical-drawings/voyager-diesel-electric%20multiple%20unit-techdraw.gif';
const BOMBARDIER_221 = 'Bombardier, Super Voyager United Kingdom project page (archived 2017-12-27), https://web.archive.org/web/20171227121917id_/http://www.bombardier.com:80/en/transportation/projects/project.super-voyager-united-kingdom.html';
const ANGEL_HST = 'Angel Trains, HST fleet page, https://angeltrains.co.uk/fleet/hst/ (read 2026-11-09)';
const ROMIC_43 = 'ROMIC Group, Class 43 specification, https://www.romicgroup.com/train-charter-hire/class-43-locomotives/ (read 2026-11-09; its own 43094/43122, not a ScotRail unit)';
const ROMIC_MK3 = 'ROMIC Group, HST Mk3 coach specification, https://www.romicgroup.com/train-charter-hire/mk3-coaches/ (read 2026-11-09)';

/**
 * The Voyager figures. The 220's are the manufacturer's (the project page and its driving-car drawing); the 221's own drawing was not reached
 * (HTTP 429), so its car lengths, height and bogie places are the 220's, ASSUMED transfers that the 221's published unit lengths do not contradict
 * (116.700 m five-car = 2 x 23.85 + 3 x 23.00 exactly).
 */
export const VOYAGER = {
  drivingCarLength: published(23.85, `${BOMBARDIER_220_GA}: 23,850 mm overall, which includes the projected front coupler and the rear gangway; read here as the driving car's allocated pitch (an inference: the drawing does not define a pitch). The 221 takes it as an ASSUMED transfer.`),
  intermediateCarLength: drawn(23.0, `DERIVED, not printed: ${BOMBARDIER_220} gives the four-car unit as 93,700 mm; less two driving cars of 23,850 mm leaves 46,000 mm for two intermediate positions, 23.000 m each. This is a pitch, not a body length (a secondary 22.82 m body figure is neither confirmed nor refuted). The 221's 116,700 mm five-car unit (${BOMBARDIER_221}) leaves the same 23.000 m for three, with its driving cars ASSUMED 23.85 m.`),
  bodyWidth: published(2.73, `${BOMBARDIER_220}: width 2,730 mm; ${BOMBARDIER_221}: width 2,730 mm`),
  height: drawn(3.77, `${BOMBARDIER_220_GA}: 3,770 mm rail to roofline (not a maximum equipment envelope). The 221's is an ASSUMED transfer (its drawing was not reached).`),
  bogieCentres: drawn(16.0, `${BOMBARDIER_220_GA}: 16,000 mm between the driving car's bogie centres. The intermediate cars and the whole 221 take it as an ASSUMED transfer.`),
  cabBogieFromNose: drawn(4.77, `Read off ${BOMBARDIER_220_GA} by proportion, not printed: the 7.85 m the car's 23.85 m leaves beyond the 16.0 m bogie centres splits about 340 : 220 px between the nose overhang and the inner end, so 4.77 m from the nose tip and 3.08 m from the inner end (about +-0.15 m).`),
  floorHeight: assumed(1.15, 'not legible on the reached drawing; a UK intercity DMU floor, to be replaced'),
  wheelDiameter: assumed(0.86, 'not published in any page read'),
  wheelbase: assumed(2.6, 'not legible on the reached drawing; a typical intercity bogie'),
  doorWidth: drawn(1.05, `${BOMBARDIER_220_GA}: the side elevation's single-leaf doors are about 1,050 mm wide by their labels (legibility poor); ASSUMED to +-0.1 m`),
  windowWidth: drawn(1.53, `${BOMBARDIER_220_GA}: the saloon windows are labelled 1530 (mm); five on the driving car's side`),
} as const satisfies Record<string, Figure>;

/** The HST figures: owner and hirer pages for the Class 43 and the Mk3; everything they do not give is ASSUMED. */
export const HST = {
  powerCarLength: published(17.79, `${ANGEL_HST}: 17.79 m; ${ROMIC_43}: "length over buffers 17,790 mm". Read as the power car's allocated pitch (it has no buffers at the cab end).`),
  coachLength: published(23.0, `${ROMIC_MK3}: length 23,000 mm (HST non-buffer stock); endpoints not defined, read as the coach's allocated pitch`),
  bodyWidth: published(2.74, `${ANGEL_HST}: 2.74 m; ${ROMIC_43} and ${ROMIC_MK3}: width 2,740 mm`),
  height: published(3.9, `${ROMIC_43} and ${ROMIC_MK3}: height 3,900 mm, datum unstated; read here as rail to roof top`),
  powerCarBogieCentres: assumed(10.25, 'Class 43 bogie centres not published in any page read; to be replaced by a drawing'),
  coachBogieCentres: assumed(16.0, 'Mk3 bogie centres not published in any page read; to be replaced by a drawing'),
  powerCarCabBogieFromNose: assumed(3.95, 'read off scotrail-hst-03 by eye (the leading bogie under the cab door); not a drawing'),
  floorHeight: assumed(1.2, 'not published in any page read'),
  powerWheelDiameter: assumed(1.02, 'Class 43 (BP10 bogie) wheel not published in any page read'),
  coachWheelDiameter: assumed(0.914, 'Mk3 (BT10 bogie) wheel not published in any page read'),
  wheelbase: assumed(2.6, 'BP10 and BT10 wheelbases not published in any page read'),
  coachDoorWidth: assumed(0.8, 'Mk3 end door leaf, read off scotrail-hst-06 by eye'),
} as const satisfies Record<string, Figure>;

/** Half the visual gap between two bodies, the same 0.35 m the King's Cross bodies keep (core/train.ts END_GAP). ASSUMED. */
export const INTERCITY_END_GAP = 0.35;

export interface IntercitySpec {
  readonly kind: IntercityKind;
  readonly family: IntercityFamily;
  readonly classes: string;
  readonly operator: string;
  readonly livery: 'crosscountry' | 'scotrail-inter7city';
  readonly cars: readonly string[];
  readonly label: string;
  readonly source: string;
}

const ALSTOM_2026 = 'Alstom, 10 February 2026: 70 CrossCountry Voyagers under refurbishment, 136 Class 220 and 176 Class 221 cars, https://www.alstom.com/press-releases-news/2026/2/alstom-reveals-first-refurbished-crosscountry-voyager-train-uk';
const SCOTRAIL_HST = 'ScotRail accessibility guide (April 2022): HST "2 power cars + 4 coaches"; ScotRail board minutes (2024 meetings) and the May 2026 diagrams: four- and five-coach HST sets both worked';

export const INTERCITY_SPECS: Readonly<Record<IntercityKind, IntercitySpec>> = {
  xc220x4: { kind: 'xc220x4', family: 'voyager220', classes: '220', operator: 'CrossCountry', livery: 'crosscountry', cars: ['DMS', 'MS', 'MSRMB', 'DMF'], label: 'CrossCountry 220 Voyager — assumed fleet',
    source: `${BOMBARDIER_220}: "34 x 4 Car non-tilt sets - Voyager, Class 220". Car codes DMS-MS-MSRMB-DMF ASSUMED (owner role naming not independently resolved); all four cars powered (Beacon Rail Cl.220: axle configuration 1A'A1'+1A'A1'+1A'A1'+1A'A1'). ${ALSTOM_2026}.` },
  xc221x5: { kind: 'xc221x5', family: 'voyager221', classes: '221', operator: 'CrossCountry', livery: 'crosscountry', cars: ['DMS', 'MS', 'MS', 'MSRMB', 'DMF'], label: 'CrossCountry 221 Super Voyager — assumed fleet',
    source: `${BOMBARDIER_221}: 116,700 mm five-car unit, 2,730 mm wide, tilting, "a completely new generation of internally supported bogies". Four-car 221s also exist: this five-car kind is not the whole subclass. Car codes DMS-MS-MS-MSRMB-DMF ASSUMED; all cars powered (Beacon Rail Cl.221: 1A'A1'+...+1A'A1'). ${ALSTOM_2026}.` },
  srhstx4: { kind: 'srhstx4', family: 'hst', classes: '43 + Mk3', operator: 'ScotRail', livery: 'scotrail-inter7city', cars: ['PC', 'TF', 'TS', 'TS', 'TGS', 'PC'], label: 'ScotRail Inter7City HST (2+4) — assumed fleet',
    source: `${SCOTRAIL_HST}. ${ANGEL_HST}: one power car at each end of the Mk3 trailers. The coach codes and their order (TF-TS-TS-TGS) are ASSUMED: no ScotRail set formation was found.` },
  srhstx5: { kind: 'srhstx5', family: 'hst', classes: '43 + Mk3', operator: 'ScotRail', livery: 'scotrail-inter7city', cars: ['PC', 'TF', 'TS', 'TS', 'TS', 'TGS', 'PC'], label: 'ScotRail Inter7City HST (2+5) — assumed fleet',
    source: `${SCOTRAIL_HST}. ${ANGEL_HST}: one power car at each end of the Mk3 trailers. The coach codes and their order (TF-TS-TS-TS-TGS) are ASSUMED: no ScotRail set formation was found.` },
};

/** One car of an intercity kind: the King's Cross Car fields (so the Waverley layer and carPoses read it alike), its code and the body it is drawn with. */
export interface IntercityCar extends Omit<Car, 'type' | 'pantograph'> {
  readonly type: string;
  readonly body: IntercityBody;
  readonly pantograph: null;
}
export interface IntercityLayout { readonly spec: IntercitySpec; readonly length: number; readonly cars: readonly IntercityCar[] }

/** The body a car code is drawn with. */
export function bodyOf(spec: Pick<IntercitySpec, 'family'>, type: string): IntercityBody {
  if (spec.family !== 'hst') return 'voyager';
  return type === 'PC' ? 'class43' : 'mk3';
}

/**
 * The cars laid end to end from the front nose (z = 0, growing rearwards). The first car's cab faces forward, the last car's backward.
 * Voyager: every car powered, one driven axle in each bogie (1A'A1'); its bogie centres 16.0 m apart, the driving car's cab bogie 4.77 m from the nose.
 * HST: a power car at each end (both bogies motored: Bo'Bo'), unpowered Mk3 coaches between, their bogies symmetrical on the coach.
 */
export function intercityLayout(kind: IntercityKind): IntercityLayout {
  const spec = INTERCITY_SPECS[kind];
  const last = spec.cars.length - 1;
  let at = 0;
  const cars = spec.cars.map((type, index): IntercityCar => {
    const body = bodyOf(spec, type);
    const cab: IntercityCar['cab'] = index === 0 ? 'front' : index === last ? 'rear' : null;
    let length: number;
    let span: number;
    let fromCab: number;
    if (body === 'voyager') {
      length = cab ? VOYAGER.drivingCarLength.value : VOYAGER.intermediateCarLength.value;
      span = VOYAGER.bogieCentres.value;
      fromCab = cab ? VOYAGER.cabBogieFromNose.value : (length - span) / 2;
    } else if (body === 'class43') {
      length = HST.powerCarLength.value;
      span = HST.powerCarBogieCentres.value;
      fromCab = HST.powerCarCabBogieFromNose.value;
    } else {
      length = HST.coachLength.value;
      span = HST.coachBogieCentres.value;
      fromCab = (length - span) / 2;
    }
    const start = at;
    const end = at + length;
    at = end;
    const bogies: [number, number] = cab === 'rear' ? [end - fromCab - span, end - fromCab] : [start + fromCab, start + fromCab + span];
    const powered = body !== 'mk3';
    return { type, body, index, length, start, end, cab, bogies, pantograph: null, motor: [powered, powered] };
  });
  return { spec, length: at, cars };
}
