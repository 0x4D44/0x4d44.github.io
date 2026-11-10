// The inside of one car of Great Northern's Class 717 Desiro City (Siemens), built only for the car the camera is in or beside
// (train-interior.ts loads this module on first use). The car is a commuter one (train-interior-commuter.ts), open to its neighbours through wide
// gangways, its seats in train-interior-commuter-layout.ts. This module gives it its colours, read off the photographs in the receipts
// (.scratch/interiors/refs/receipts.json, outside the repository): approximate.
import type { Car, TrainKind } from '../../core/train.ts';
import { buildCommuter } from './train-interior-commuter.ts';
import type { CommuterPalette } from './train-interior-commuter.ts';
import { shellFor } from './train-interior-kit.ts';
import type { InteriorBuild } from './train-interior-kit.ts';

export { setInteriorLight } from './train-interior-kit.ts';

const SHELL = shellFor('desiro');

// gn717-saloon (Superalbs, CC BY-SA 4.0), gn717-saloon-moorgate (Elshad, CC BY-SA 4.0): navy speckled moquette on light grey shells, no armrests, azure
// grab handles, poles and rails, a light grey floor with a darker blue-grey patch at each doorway, white-grey walls and ceiling
export const PALETTE: CommuterPalette = {
  seat: 0x292e40, seatHead: 0x292e40, seatShell: 0xb4b5b2, firstSeat: 0x292e40, firstHead: 0x292e40, firstShell: 0xb4b5b2,
  pole: 0x2a6fdb, table: 0x45474b, seatBack: 0.68, arms: false,
  carpet: 0x8e8d8b, firstCarpet: 0x8e8d8b, vinyl: 0x5c6475, wall: 0xdcdddc, ceiling: 0xd8d9da, trim: 0xc8c9c8, partition: 0xd0d1d0, door: 0xb9c7da,
};

/** Build the inside of car `car` of a train of `kind`. */
export function buildInterior(kind: TrainKind, car: Car): InteriorBuild {
  return buildCommuter(kind, car, SHELL, PALETTE);
}
