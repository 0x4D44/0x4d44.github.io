// The inside of one Azuma-family car (Hitachi AT300: LNER 800/801, Hull Trains 802, Lumo 803), built only for the car the camera is in or
// beside (train-interior.ts loads this module on first use, so the page's first bundle does not carry it).
//
// The car is an intercity one (train-interior-intercity.ts): the shell from train-interior-kit.ts, the vestibules, saloons and fittings as
// train-interior-layout.ts lays them out. This module gives it the operators' colours. Sizes no source publishes are in train-interior-layout.ts
// `FIT` (ASSUMED). The colours are read off the photographs in the receipts (.scratch/interiors/refs/receipts.json, outside the repository) and
// are approximate.
import type { Car, TrainKind } from '../../core/train.ts';
import { buildIntercity } from './train-interior-intercity.ts';
import type { Palette } from './train-interior-intercity.ts';
import { shellFor } from './train-interior-kit.ts';
import type { InteriorBuild } from './train-interior-kit.ts';

export { setInteriorLight } from './train-interior-kit.ts';
export type { Palette };

const SHELL = shellFor('at300');
/** The outer skin's face (train.ts carSection: the body's half-width less the door relief). */
export const SKIN = SHELL.SKIN;

// lner-800-standard-saloon (Bananaman28, CC BY-SA 4.0): orange-red moquette, warm grey shells, a red band over the windows, a navy carpet striped red, white walls and
// ceiling with two long light lines; lner-800-first-saloon (the same, coach K): burgundy velvet seats on grey shells, a burgundy band, grey tables.
const LNER: Palette = {
  standardSeat: 0xa52c1b, standardHead: 0xa52c1b, standardShell: 0x7a736d, firstSeat: 0x5b1d20, firstHead: 0x5b1d20, firstShell: 0x6a6f75,
  standardBand: 0xc63a22, firstBand: 0x5a1d1f,
  carpet: 0x282c3c, firstCarpet: 0x34363f, vinyl: 0x6e7074, wall: 0xd2d0cc, ceiling: 0xd8d7d4, trim: 0xb9bbbd, table: 0x45474b, partition: 0xc9cbca, door: 0xb9bcbf,
};
const PALETTES: Readonly<Record<string, Palette>> = {
  lner5: LNER, lner9: LNER,
  // no photograph of a Hull Trains interior was found (receipts): its colours are its livery's blues, ASSUMED
  hull5: { ...LNER, standardSeat: 0x1f3557, standardHead: 0x1f3557, firstSeat: 0x3a2b4f, firstHead: 0x3a2b4f, standardBand: 0x1f3557, firstBand: 0x3a2b4f, carpet: 0x30343c },
  // lumo-803-standard-saloon (Superalbs, CC BY-SA 4.0), lumo-803-coach-c (TheFrog001, CC0): dark blue seats, the bright blue of the livery on the headrests
  lumo5: { ...LNER, standardSeat: 0x24305c, standardHead: 0x2fb8e0, standardShell: 0x3a3f4a, standardBand: 0x24305c, firstSeat: 0x24305c, firstHead: 0x2fb8e0, carpet: 0x2b2f3a },
};
export const paletteFor = (kind: TrainKind): Palette => PALETTES[kind] ?? LNER;

/** Build the inside of car `car` of a train of `kind`. */
export function buildInterior(kind: TrainKind, car: Car): InteriorBuild {
  return buildIntercity(kind, car, SHELL, paletteFor(kind));
}
