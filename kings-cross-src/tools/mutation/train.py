"""Mutation check for core/train.ts and its tests.
usage: python3 -I -u tools/mutation/train.py <kings-cross-src> <scratch dir>
The tests run in a copy with the real node_modules linked in; the unmodified copy must pass first and a
load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve(); scratch = Path(sys.argv[2]).resolve()
F = "core/train.ts"
# More test files can be named here; each is run for every mutation.
TESTS = ["core/tests/train.test.ts"]
M = [
    ("driving car 25.35 m", "drivingCarLength: { value: 25.85,", "drivingCarLength: { value: 25.35,"),
    ("intermediate car 25 m", "intermediateCarLength: { value: 26.0,", "intermediateCarLength: { value: 25.0,"),
    ("width 2.6 m", "bodyWidth: { value: 2.7,", "bodyWidth: { value: 2.6,"),
    ("roof edge back at 3.725 m (top of the covers 3.995 m, nearly 4 m)", "roofEdgeHeight: { value: 3.35,", "roofEdgeHeight: { value: 3.725,"),
    ("roof edge at 3.0 m (too low for an express)", "roofEdgeHeight: { value: 3.35,", "roofEdgeHeight: { value: 3.0,"),
    ("roof edge claims to be drawn", "roofEdgeHeight: { value: 3.35, unit: 'm', basis: 'assumed',", "roofEdgeHeight: { value: 3.35, unit: 'm', basis: 'drawn',"),
    ("roof covers 0.3 m", "roofCoverHeight: { value: 0.27,", "roofCoverHeight: { value: 0.3,"),
    ("roofHeight ignores the covers", "return FIGURES.roofEdgeHeight.value + FIGURES.roofCoverHeight.value;", "return FIGURES.roofEdgeHeight.value;"),
    ("gauge 1.4 m", "gauge: { value: 1.435,", "gauge: { value: 1.4,"),
    ("cab bogie 5 m from the nose", "cabBogieFromNose: { value: 4.455,", "cabBogieFromNose: { value: 5,"),
    ("inner bogie at the middle of the car", "innerBogieFromNose: { value: 21.45,", "innerBogieFromNose: { value: 13,"),
    ("intermediate bogie span 20 m", "intermediateBogieSpan: { value: 16.7,", "intermediateBogieSpan: { value: 20,"),
    ("bogie wheelbase 9 m", "bogieWheelbase: { value: 2.6,", "bogieWheelbase: { value: 9,"),
    ("front cab car: bogies measured from the rear", "bogies = [start + FIGURES.cabBogieFromNose.value, start + FIGURES.innerBogieFromNose.value];", "bogies = [end - FIGURES.innerBogieFromNose.value, end - FIGURES.cabBogieFromNose.value];"),
    ("rear cab car: bogies in the wrong order", "bogies = [end - FIGURES.innerBogieFromNose.value, end - FIGURES.cabBogieFromNose.value];", "bogies = [end - FIGURES.cabBogieFromNose.value, end - FIGURES.innerBogieFromNose.value];"),
    ("rear cab car: bogies measured from the front", "bogies = [end - FIGURES.innerBogieFromNose.value, end - FIGURES.cabBogieFromNose.value];", "bogies = [start + FIGURES.cabBogieFromNose.value, start + FIGURES.innerBogieFromNose.value];"),
    ("intermediate bogies off centre", "bogies = [mid - FIGURES.intermediateBogieSpan.value / 2, mid + FIGURES.intermediateBogieSpan.value / 2];", "bogies = [mid - FIGURES.intermediateBogieSpan.value, mid];"),
    ("cars separated by a gap", "at = end;", "at = end + 0.5;"),
    ("cab at the wrong end of the front car", "cab = 'front';", "cab = 'rear';"),
    ("pantograph on the rear cab car only", "const pantograph = cab !== null ?", "const pantograph = cab === 'rear' ?"),
    ("pantograph on the front cab car only", "const pantograph = cab !== null ?", "const pantograph = cab === 'front' ?"),
    ("pantograph on every car", "const pantograph = cab !== null ?", "const pantograph = true ?"),
    ("front car pantograph measured from the rear", "cab === 'front' ? start + FIGURES.pantographFromNose.value : end - FIGURES.pantographFromNose.value;", "end - FIGURES.pantographFromNose.value;"),
    ("rear car pantograph measured from the front", ": end - FIGURES.pantographFromNose.value;", ": start + FIGURES.pantographFromNose.value;"),
    ("pantograph base not centred", "([centre - half, centre + half] as const)", "([centre, centre + 2 * half] as const)"),
    ("5-car LNER formation loses a motor car", "cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-MC-DPTF` }", "cars: ['DPTS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-MC-DPTF` }"),
    ("9-car formation loses a trailer", "'MS', 'TS', 'MC', 'MF', 'DPTF']", "'MS', 'MC', 'MF', 'DPTF']"),
    ("803 formation as an 800", "cars: ['DPTS', 'MS', 'MS', 'MS', 'DPTS']", "cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF']"),
    ("wheel diameter called published", "wheelDiameter: { value: 0.86, unit: 'm', basis: 'assumed'", "wheelDiameter: { value: 0.86, unit: 'm', basis: 'published'"),
    ("a drawn figure called published", "bogieWheelbase: { value: 2.6, unit: 'm', basis: 'drawn'", "bogieWheelbase: { value: 2.6, unit: 'm', basis: 'published'"),
    ("a figure with no source", "source: `${GBTRAINS}: 8 ft 6 in (2,600 mm), Beacon Rail's figure for the 803, which shares the bogie`", "source: 'x'"),
    ("a guess that does not say so", "source: 'not published; gbtrains.uk: \"no source gives the real wheel size\". A typical value for a UK EMU, to be replaced.'", "source: 'this is the wheel diameter used for the drawing of the bogie'"),
    ("driving cars counted as intermediate", "return DRIVING.has(type) ? FIGURES.drivingCarLength.value : FIGURES.intermediateCarLength.value;", "return FIGURES.intermediateCarLength.value;"),
    # --- the Great Northern commuter units (Class 387 Electrostar, Class 717 Desiro City) --------------------------------
    ("Electrostar car 20.0 m", "carLength: { value: 20.39,", "carLength: { value: 20.0,"),
    ("Electrostar width 2.7 m", "bodyWidth: { value: 2.8, unit: 'm', basis: 'published', source: `${WIKI_387}", "bodyWidth: { value: 2.7, unit: 'm', basis: 'published', source: `${WIKI_387}"),
    ("Electrostar height 3.9 m", "height: { value: 3.77, unit: 'm', basis: 'published',", "height: { value: 3.9, unit: 'm', basis: 'published',"),
    ("Electrostar floor height called published", "floorHeight: { value: 1.1, unit: 'm', basis: 'assumed', source: 'Not published for the 387", "floorHeight: { value: 1.1, unit: 'm', basis: 'published', source: 'Not published for the 387"),
    ("Electrostar bogies 4 m from the car end", "bogieFromEnd: { value: 3.15,", "bogieFromEnd: { value: 4.0,"),
    ("Electrostar door width called published", "doorWidth: { value: 1.3, unit: 'm', basis: 'assumed',", "doorWidth: { value: 1.3, unit: 'm', basis: 'published',"),
    ("a guess that does not say so (door width)", "source: 'Not published in any page read; a typical twin-leaf commuter opening, to be replaced.'", "source: 'a twin-leaf commuter opening'"),
    ("Electrostar car length with no source", "carLength: { value: 20.39, unit: 'm', basis: 'published', source: `${WIKI_387}: \"Car length 20.39 metres (66 ft 11 in)\". ${LOCO_INFO}: unit length 81.56 m, which is exactly four times this.` }", "carLength: { value: 20.39, unit: 'm', basis: 'published', source: 'x' }"),
    ("Desiro unit as 5 equal cars", "carLength: { value: 121.674 / 6,", "carLength: { value: 121.674 / 5,"),
    ("Desiro car length called published", "carLength: { value: 121.674 / 6, unit: 'm', basis: 'assumed',", "carLength: { value: 121.674 / 6, unit: 'm', basis: 'published',"),
    ("Desiro door 1.3 m", "doorWidth: { value: 1.5, unit: 'm', basis: 'published',", "doorWidth: { value: 1.3, unit: 'm', basis: 'published',"),
    ("Desiro wheels 0.9 m", "wheelDiameter: { value: 0.82,", "wheelDiameter: { value: 0.9,"),
    ("Desiro motor bogie wheelbase 2.6 m", "wheelbaseMotor: { value: 2.2,", "wheelbaseMotor: { value: 2.6,"),
    ("Desiro trailer bogie wheelbase as the motor's", "wheelbaseTrailer: { value: 2.1,", "wheelbaseTrailer: { value: 2.2,"),
    ("Desiro height called published", "height: { value: 3.77, unit: 'm', basis: 'assumed', source: 'UNVERIFIABLE: not published (the Siemens", "height: { value: 3.77, unit: 'm', basis: 'published', source: 'UNVERIFIABLE: not published (the Siemens"),
    ("Desiro bogies 4 m from the car end", "bogieFromEnd: { value: 3.1,", "bogieFromEnd: { value: 4.0,"),
    ("a commuter car counted as an Azuma car", "if (f === undefined || f === 'at300') return DRIVING.has(type)", "if (true) return DRIVING.has(type)"),
    ("DMOS not a driving car", "'DMSO', 'DMOS', 'DMSL', 'DMCO'])", "'DMSO', 'DMSL', 'DMCO'])"),
    ("DMSO not a driving car", "'DPTF', 'DMSO', 'DMOS'", "'DPTF', 'DMOS'"),
    ("387 formation loses a car", "const UNIT_387: readonly CarType[] = ['DMSO', 'MSO', 'PTSO', 'DMSO'];", "const UNIT_387: readonly CarType[] = ['DMSO', 'PTSO', 'DMSO'];"),
    ("387 formation with the pantograph car swapped for a motor car", "const UNIT_387: readonly CarType[] = ['DMSO', 'MSO', 'PTSO', 'DMSO'];", "const UNIT_387: readonly CarType[] = ['DMSO', 'PTSO', 'MSO', 'DMSO'];"),
    ("717 formation loses the wheelchair car", "cars: ['DMOS', 'TOS', 'TOSLW', 'MOS', 'PTOS', 'DMOS']", "cars: ['DMOS', 'TOS', 'MOS', 'PTOS', 'DMOS']"),
    ("717 formation with the cabs not at the ends", "cars: ['DMOS', 'TOS', 'TOSLW', 'MOS', 'PTOS', 'DMOS']", "cars: ['DMOS', 'DMOS', 'TOSLW', 'MOS', 'PTOS', 'TOS']"),
    ("387 a single unit when coupled (no cabs inside)", "const unitSize = spec.family === 'electrostar' ? UNIT_387.length : spec.cars.length;", "const unitSize = spec.cars.length;"),
    ("only the front cab of a 387 unit", "DRIVING.has(type) ? (inUnit === 0 ? 'front' : 'rear') : null;", "DRIVING.has(type) ? (inUnit === 0 ? 'front' : null) : null;"),
    ("a cab at the wrong end of a unit", "(inUnit === 0 ? 'front' : 'rear')", "(inUnit === 0 ? 'rear' : 'front')"),
    ("EMU bogies 3.15 m from the front end only", "const bogies: [number, number] = [start + f.bogieFromEnd.value, end - f.bogieFromEnd.value];", "const bogies: [number, number] = [start + f.bogieFromEnd.value, end - 2 * f.bogieFromEnd.value];"),
    ("MSO motors on both bogies", "MSO: 'TM'", "MSO: 'MM'"),
    ("PTSO with motors", "PTSO: 'TT'", "PTSO: 'MM'"),
    ("DMOS with no motors", "DMOS: 'MM'", "DMOS: 'TT'"),
    ("DMSO motor bogie at the nose end", "(cab === 'front' ? 'TM' : 'MT')", "(cab === 'front' ? 'MT' : 'TM')"),
    ("pantograph on the 387's motor car too", "new Set(['PTSO', 'PTOS'])", "new Set(['PTSO', 'PTOS', 'MSO'])"),
    ("no pantograph on a 717", "new Set(['PTSO', 'PTOS'])", "new Set(['PTSO'])"),
    ("EMU pantograph base off centre", "EMU_PANTOGRAPH_CARS.has(type) && f.pantographLength ? ([centre - half, centre + half] as const)", "EMU_PANTOGRAPH_CARS.has(type) && f.pantographLength ? ([centre, centre + 2 * half] as const)"),
    ("EMU pantograph 2.5 m long", "pantographLength: { value: 2.0, unit: 'm', basis: 'assumed', source: 'Not published in any page read; the Azuma\\'s drawn 2.02 m is used, to be replaced.' },\n} as const satisfies Record<string, Figure>;", "pantographLength: { value: 2.5, unit: 'm', basis: 'assumed', source: 'Not published in any page read; the Azuma\\'s drawn 2.02 m is used, to be replaced.' },\n} as const satisfies Record<string, Figure>;"),
    # --- the Grand Central Class 180 (Alstom Coradia 1000 diesel multiple unit) -------------------------------------------
    ("Class 180 intermediate car 24 m", "carLength: { value: 23.02,", "carLength: { value: 24.0,"),
    ("Class 180 driving car as the others", "drivingCarLength: { value: 23.71, unit: 'm', basis: 'published', source: `${WIKI_180}", "drivingCarLength: { value: 23.03, unit: 'm', basis: 'published', source: `${WIKI_180}"),
    ("Class 180 width 2.8 m", "bodyWidth: { value: 2.73,", "bodyWidth: { value: 2.8,"),
    ("Class 180 height called published", "height: { value: 3.77, unit: 'm', basis: 'assumed', source: 'UNVERIFIABLE: not published in any page read (Wikipedia, loco-info.com", "height: { value: 3.77, unit: 'm', basis: 'published', source: 'UNVERIFIABLE: not published in any page read (Wikipedia, loco-info.com"),
    ("Class 180 door width called published", "doorWidth: { value: 0.9, unit: 'm', basis: 'assumed',", "doorWidth: { value: 0.9, unit: 'm', basis: 'published',"),
    ("Class 180 formation loses the buffet car", "cars: ['DMSL', 'MFL', 'MSL', 'MSLRB', 'DMSL']", "cars: ['DMSL', 'MFL', 'MSL', 'DMSL']"),
    ("Class 180 formation loses the first-class car", "cars: ['DMSL', 'MFL', 'MSL', 'MSLRB', 'DMSL']", "cars: ['DMSL', 'MSL', 'MSL', 'MSLRB', 'DMSL']"),
    ("Class 180 DMSL not a driving car", "'DMOS', 'DMSL', 'DMCO'])", "'DMOS', 'DMCO'])"),
    ("Class 180 with a motor on both bogies of a car", "adelante: { MFL: 'MT', MSL: 'MT', MSLRB: 'MT' },", "adelante: { MFL: 'MM', MSL: 'MT', MSLRB: 'MT' },"),
    ("Class 180 intermediate car with the motor at the other end", "adelante: { MFL: 'MT', MSL: 'MT', MSLRB: 'MT' },", "adelante: { MFL: 'TM', MSL: 'MT', MSLRB: 'MT' },"),
    ("Class 180 bogies 5 m from the car end", "bogieFromEnd: { value: 3.5,", "bogieFromEnd: { value: 5.0,"),
    ("Class 180 wheels called published", "wheelDiameter: { value: 0.84, unit: 'm', basis: 'assumed', source: 'Not published in any page read (a forum", "wheelDiameter: { value: 0.84, unit: 'm', basis: 'published', source: 'Not published in any page read (a forum"),
    ("Grand Central operator renamed", "operator: 'Grand Central'", "operator: 'GC'"),
    ("Class 180 classes renamed", "classes: '180',", "classes: '181',"),
    ("the Class 180 given a pantograph length (and so a pantograph car)", "bogieFromEnd: { value: 3.5, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken about 16 m apart under a 23 m car, to be replaced.' },", "bogieFromEnd: { value: 3.5, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken about 16 m apart under a 23 m car, to be replaced.' },\n  pantographLength: { value: 2.0, unit: 'm', basis: 'assumed', source: 'x' },"),
    # --- the Thameslink Class 700 (Siemens Desiro City) ------------------------------------------------------------------
    ("Class 700 intermediate car 20.5 m", "carLength: { value: 20.15,", "carLength: { value: 20.5,"),
    ("Class 700 end car as the others", "drivingCarLength: { value: 20.55,", "drivingCarLength: { value: 20.15,"),
    ("Class 700 end car called published", "drivingCarLength: { value: 20.55, unit: 'm', basis: 'assumed',", "drivingCarLength: { value: 20.55, unit: 'm', basis: 'published',"),
    ("Class 700 car length called published", "carLength: { value: 20.15, unit: 'm', basis: 'assumed',", "carLength: { value: 20.15, unit: 'm', basis: 'published',"),
    ("Class 700 door width called published", "doorWidth: { value: 1.5, unit: 'm', basis: 'assumed', source: `Not published for the Class 700", "doorWidth: { value: 1.5, unit: 'm', basis: 'published', source: `Not published for the Class 700"),
    ("Class 700 width 2.7 m", "bodyWidth: { value: 2.8, unit: 'm', basis: 'published', source: `${SIEMENS_700}", "bodyWidth: { value: 2.7, unit: 'm', basis: 'published', source: `${SIEMENS_700}"),
    ("Class 700 8-car unit loses a car", "cars: ['DMCO', 'PTSO', 'MSO', 'TSOW', 'TSOLW', 'MSO', 'PTSO', 'DMCO']", "cars: ['DMCO', 'PTSO', 'MSO', 'TSOLW', 'MSO', 'PTSO', 'DMCO']"),
    ("Class 700 12-car unit loses a car", "'MSO', 'MSO', 'TSO', 'TSOW', 'TSOLW', 'TSO', 'MSO', 'MSO'", "'MSO', 'MSO', 'TSO', 'TSOW', 'TSOLW', 'MSO', 'MSO'"),
    ("Class 700 12-car unit with the wheelchair cars swapped", "'MSO', 'MSO', 'TSO', 'TSOW', 'TSOLW', 'TSO', 'MSO', 'MSO'", "'MSO', 'MSO', 'TSO', 'TSOLW', 'TSOW', 'TSO', 'MSO', 'MSO'"),
    ("Class 700 DMCO not a driving car", "'DMSL', 'DMCO'])", "'DMSL'])"),
    ("Class 700 PTSO with motors", "desiro700: { DMCO: 'MM', PTSO: 'TT',", "desiro700: { DMCO: 'MM', PTSO: 'MM',"),
    ("Class 700 DMCO with no motors", "desiro700: { DMCO: 'MM',", "desiro700: { DMCO: 'TT',"),
    ("Class 700 MSO with no motors", "MSO: 'MM', TSO: 'TT'", "MSO: 'TT', TSO: 'TT'"),
    ("Class 700 bogies 4 m from the car end", "bogieFromEnd: { value: 3.1, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken about 14 m", "bogieFromEnd: { value: 4.0, unit: 'm', basis: 'assumed', source: 'Not published in any page read: bogie centres taken about 14 m"),
    ("Thameslink classes renamed", "classes: '700/0',", "classes: '700',"),
    ("Thameslink 12-car classes renamed", "classes: '700/1',", "classes: '700/0',"),
    ("Thameslink operator renamed", "operator: 'Thameslink'", "operator: 'TL'"),
    ("a car's length ignores its family (a PTSO of a 700 as a 387's)", "const f = family ?? FAMILY_OF_CAR[type];", "const f = FAMILY_OF_CAR[type];"),
    ("a Class 700 pantograph base 2.5 m long", "pantographLength: { value: 2.0, unit: 'm', basis: 'assumed', source: 'Not published in any page read; the Azuma\\'s drawn 2.02 m is used, to be replaced.' },\n} as const satisfies Record<keyof typeof ELECTROSTAR | 'drivingCarLength', Figure>;", "pantographLength: { value: 2.5, unit: 'm', basis: 'assumed', source: 'Not published in any page read; the Azuma\\'s drawn 2.02 m is used, to be replaced.' },\n} as const satisfies Record<keyof typeof ELECTROSTAR | 'drivingCarLength', Figure>;"),
    # --- the Hull Trains 802's own cab cars, and what no source prints marked UNVERIFIABLE -----------------------------------
    ("Hull 802 cab car the 800's 25.85 m", "export const HULL_802_DRIVING_CAR = { value: 25.7,", "export const HULL_802_DRIVING_CAR = { value: 25.85,"),
    ("Hull 802 cab length given to every Azuma-family kind", "if (kind === 'hull5' && DRIVING.has(type)) return HULL_802_DRIVING_CAR.value;", "if (DRIVING.has(type)) return HULL_802_DRIVING_CAR.value;"),
    ("Hull 802 cab length given to its intermediates too", "if (kind === 'hull5' && DRIVING.has(type)) return HULL_802_DRIVING_CAR.value;", "if (kind === 'hull5') return HULL_802_DRIVING_CAR.value;"),
    ("Hull 802 cab length given to the Lumo 803 too", "if (kind === 'hull5' && DRIVING.has(type)) return HULL_802_DRIVING_CAR.value;", "if ((kind === 'hull5' || kind === 'lumo5') && DRIVING.has(type)) return HULL_802_DRIVING_CAR.value;"),
    ("Hull 802 layout ignores its own cab cars", "const length = carLengthOf(kind, type);", "const length = carLength(type);"),
    ("Hull 802 cab car called assumed", "export const HULL_802_DRIVING_CAR = { value: 25.7, unit: 'm', basis: 'published',", "export const HULL_802_DRIVING_CAR = { value: 25.7, unit: 'm', basis: 'assumed',"),
    ("Hull 802 cab car's endpoints no longer marked UNVERIFIABLE", "What the length is measured between is UNVERIFIABLE: neither source says;", "What the length is measured between is known: neither source says;"),
    ("Hull 802 formation's endpoints no longer marked UNVERIFIABLE", "is UNVERIFIABLE: neither source says (over couplers, over the body or between pivots)", "is known: neither source says (over couplers, over the body or between pivots)"),
    ("Hull 802 five-car sum called published", "is derived, not published (reviewed 2026-11-09).`", "is published (reviewed 2026-11-09).`"),
    ("Hull 802 formation cites no owner page", "Cab cars 25.7 m and intermediates 26 m, as printed for the Class 802 by Eversholt Rail https://eversholtrail.co.uk/fleet/class-802/", "Cab cars 25.7 m and intermediates 26 m, as printed for the Class 802 by Eversholt Rail"),
    ("Lumo 803 dimensions no longer UNVERIFIABLE", "Class 803 length, width and height are UNVERIFIABLE from any source found, and remain ASSUMED transfers", "Class 803 length, width and height are known from the 800, and remain ASSUMED transfers"),
    ("Lumo 803 cites an infobox that prints dimensions", "Wikipedia's Class 803 infobox (read 2026-11-09) prints no car length, width or height.", "Wikipedia's Class 803 infobox (read 2026-11-09) prints the car length and width."),
    ("Azuma roof edge no longer UNVERIFIABLE", "source: `UNVERIFIABLE: No verified primary roof height found for the Class 800, 801, 802 or 803", "source: `No verified primary roof height found for the Class 800, 801, 802 or 803"),
    ("Class 717 height no longer UNVERIFIABLE", "source: 'UNVERIFIABLE: not published (the Siemens datasheet and Wikipedia give no height; read 2026-11-08). Taken equal to the Class 387", "source: 'Not published (the Siemens datasheet and Wikipedia give no height; read 2026-11-08). Taken equal to the Class 387"),
    ("Class 700 height no longer UNVERIFIABLE", "source: 'UNVERIFIABLE: not published (the Siemens datasheet and Wikipedia give no height; read 2026-11-08). Taken equal to the Class 717", "source: 'Not published (the Siemens datasheet and Wikipedia give no height; read 2026-11-08). Taken equal to the Class 717"),
    ("Class 180 height no longer UNVERIFIABLE", "source: 'UNVERIFIABLE: not published in any page read (Wikipedia, loco-info.com and Angel Trains give no height; read 2026-11-08).", "source: 'Not published in any page read (Wikipedia, loco-info.com and Angel Trains give no height; read 2026-11-08)."),
    ("Class 387 height called UNVERIFIABLE", "height: { value: 3.77, unit: 'm', basis: 'published', source: `${WIKI_387}: \"Height 3.77 metres", "height: { value: 3.77, unit: 'm', basis: 'published', source: `UNVERIFIABLE ${WIKI_387}: \"Height 3.77 metres"),
    ("Class 180 height not the Electrostar's", "height: { value: 3.77, unit: 'm', basis: 'assumed', source: 'UNVERIFIABLE: not published in any page read", "height: { value: 3.9, unit: 'm', basis: 'assumed', source: 'UNVERIFIABLE: not published in any page read"),
]
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, "train") as work:
    def run():
        return kxmut.run_tests(work, TESTS, test_timeout_ms=8000, timeout=60)

    # every test, from an unmutated run of the copy, so that at the end we can say which tests no mutation ever turned red
    baseline = kxmut.require_green(run(), " ".join(TESTS))
    for label, old, new in M:
        try:
            with kxmut.mutated(work / F, [(old, new)]):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
print(f"{len(tally.red & baseline.passed)}/{len(baseline.passed)} tests turned red by at least one mutation")
for t in sorted(baseline.passed - tally.red): print("  NEVER RED:", t)
sys.exit(status)
