// The inside of one car of Grand Central's Class 180 Adelante (Alstom Coradia 1000), built only for the car the camera is in or beside
// (train-interior.ts loads this module on first use). The car is an intercity one (train-interior-intercity.ts): vestibules at its ends, saloons
// of 2+2 standard and 2+1 first between them, its seat counts in train-interior-layout.ts `SEAT_MAPS`. This module gives it its colours, read off
// the photographs in the receipts (.scratch/interiors/refs/receipts.json, outside the repository): approximate.
import type { Car, TrainKind } from '../../core/train.ts';
import { buildIntercity } from './train-interior-intercity.ts';
import type { Palette } from './train-interior-intercity.ts';
import { shellFor } from './train-interior-kit.ts';
import type { InteriorBuild } from './train-interior-kit.ts';

export { setInteriorLight } from './train-interior-kit.ts';

const SHELL = shellFor('adelante');

// gc180-standard-saloon (Finn315, CC BY 4.0): after Grand Central's refit, a near-black moquette (an orange hexagon pattern on it) with black leather wings,
// red-orange headrest pads, mid-grey shells, a sand-beige floor, cream-grey walls and a grey ceiling. No photograph of first class was found: its seats are
// the standard's colours (ASSUMED), and there is no coloured band over the windows (the band is the wall's grey).
export const PALETTE: Palette = {
  standardSeat: 0x30211a, standardHead: 0xce2f14, standardShell: 0x8e9092, firstSeat: 0x30211a, firstHead: 0xce2f14, firstShell: 0x8e9092,
  standardBand: 0xb9b3a7, firstBand: 0xb9b3a7,
  carpet: 0xd0bb93, firstCarpet: 0xc4b08a, vinyl: 0x9a9690, wall: 0xc4bfb3, ceiling: 0xb8b8b6, trim: 0xa8a8a6, table: 0x5a5c60, partition: 0xc0bdb4, door: 0xa8aaac,
};

/** Build the inside of car `car` of a train of `kind`. */
export function buildInterior(kind: TrainKind, car: Car): InteriorBuild {
  return buildIntercity(kind, car, SHELL, PALETTE);
}
