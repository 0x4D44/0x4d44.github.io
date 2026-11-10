// The inside of one car of Great Northern's Class 387 Electrostar (Bombardier), built only for the car the camera is in or beside
// (train-interior.ts loads this module on first use). The car is a commuter one (train-interior-commuter.ts), its seats in
// train-interior-commuter-layout.ts. This module gives it its colours, read off the photographs in the receipts
// (.scratch/interiors/refs/receipts.json, outside the repository): approximate.
import type { Car, TrainKind } from '../../core/train.ts';
import { buildCommuter } from './train-interior-commuter.ts';
import type { CommuterPalette } from './train-interior-commuter.ts';
import { shellFor } from './train-interior-kit.ts';
import type { InteriorBuild } from './train-interior-kit.ts';

export { setInteriorLight } from './train-interior-kit.ts';

const SHELL = shellFor('electrostar');

// gn387-standard-saloon (Norfolks disused railways, CC BY 4.0), gn387-thameslink-era-standard (PeterSkuce, CC BY-SA 4.0): blue moquette striped teal and
// purple on light grey shells with armrests, apple-green grab handles and poles, a charcoal floor, cream-white walls and ceiling, dark blue-grey tables
export const PALETTE: CommuterPalette = {
  seat: 0x1f6fa8, seatHead: 0x1f6fa8, seatShell: 0xc4c6c4, firstSeat: 0x1f6fa8, firstHead: 0x1f6fa8, firstShell: 0xc4c6c4,
  pole: 0x5dbb4a, table: 0x3a4250, seatBack: 0.7, arms: true,
  carpet: 0x2a2622, firstCarpet: 0x2a2622, vinyl: 0x3a3632, wall: 0xdedcd4, ceiling: 0xdcdad2, trim: 0xc4c6c4, partition: 0xd0d0cc, door: 0xc0c4c8,
};

/** Build the inside of car `car` of a train of `kind`. */
export function buildInterior(kind: TrainKind, car: Car): InteriorBuild {
  return buildCommuter(kind, car, SHELL, PALETTE);
}
