// The inside of one car of Thameslink's Class 700 Desiro City (Siemens), built only for the car the camera is in or beside
// (train-interior.ts loads this module on first use). The car is a commuter one (train-interior-commuter.ts), open to its neighbours through wide
// gangways, its seats in train-interior-commuter-layout.ts. This module gives it its colours, read off the photographs in the receipts
// (.scratch/interiors/refs/receipts.json, outside the repository): approximate.
import type { Car, TrainKind } from '../../core/train.ts';
import { buildCommuter } from './train-interior-commuter.ts';
import type { CommuterPalette } from './train-interior-commuter.ts';
import { shellFor } from './train-interior-kit.ts';
import type { InteriorBuild } from './train-interior-kit.ts';

export { setInteriorLight } from './train-interior-kit.ts';

const SHELL = shellFor('desiro700');

// tl700-standard-saloon, tl700-first-class (PeterSkuce, CC BY-SA 4.0), tl700-gangway (E235JREMU, CC BY-SA 4.0), tl700-vestibule-door (WFan, CC BY-SA 4.0):
// dark blue-grey speckled moquette, no armrests, blue grab handles and poles, a light grey floor with a darker patch at each doorway, pale blue-grey
// door leaves; first class navy with white headrest covers and grey tables
export const PALETTE: CommuterPalette = {
  seat: 0x383b44, seatHead: 0x383b44, seatShell: 0xb0aeb2, firstSeat: 0x30333d, firstHead: 0xd6d1de, firstShell: 0x8b878d,
  pole: 0x377fc5, table: 0x6a6c70, seatBack: 0.68, arms: false,
  carpet: 0xa4a198, firstCarpet: 0x7c7a76, vinyl: 0x5c6475, wall: 0xdcdcda, ceiling: 0xd8d8d8, trim: 0xc8c8c6, partition: 0xd0d0ce, door: 0xb9c7da,
};

/** Build the inside of car `car` of a train of `kind`. */
export function buildInterior(kind: TrainKind, car: Car): InteriorBuild {
  return buildCommuter(kind, car, SHELL, PALETTE);
}
