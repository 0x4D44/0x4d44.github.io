// The inside of a commuter car (Great Northern's Class 387 and 717, Thameslink's Class 700), as train-interior-commuter-layout.ts lays it out.
// Shared by train-interior-electrostar.ts, train-interior-desiro.ts and train-interior-desiro700.ts, which give it their colours.
//
// What is drawn on the shell (train-interior-kit.ts `drawShell`): the seats (2+2 in bays and airline rows, a grab handle on each aisle seat), the
// racks over the seats, the draught screens and grab poles at each doorway with a grab rail over it, the passenger information
// panels over the vestibules, the toilet, the wheelchair spaces and the tables.
import * as THREE from 'three';
import { col } from './train-geom.ts';
import type { Car, TrainKind } from '../../core/train.ts';
import { layoutCommuter } from './train-interior-commuter-layout.ts';
import { drawSeat, drawShell, InteriorDraw, pis } from './train-interior-kit.ts';
import type { BasePalette, InteriorBuild, Shell } from './train-interior-kit.ts';

/** A commuter interior's colours, read off the photographs (approximate). */
export interface CommuterPalette extends BasePalette {
  seat: number; seatHead: number; seatShell: number;
  firstSeat: number; firstHead: number; firstShell: number;
  /** the grab poles and rails */
  pole: number;
  table: number;
  /** the seats' backs stand this high over the cushion; armrests or none */
  seatBack: number; arms: boolean;
}

export function buildCommuter(kind: TrainKind, car: Car, shell: Shell, pal: CommuterPalette): InteriorBuild {
  const lay = layoutCommuter(kind, car);
  const d = new InteriorDraw(car);
  const { box, quad } = d;
  const C = (hex: number): THREE.Color => col(hex);
  const { XI, FL, YC, YT } = shell;
  const openings = drawShell(d, shell, lay, pal);
  const trimC = C(pal.trim), poleC = C(pal.pole);

  // the racks over the saloons' seats, each side
  for (const z of lay.zones.filter((q) => q.kind === 'saloon' && q.s1 - q.s0 > 1.2)) {
    for (const side of [1, -1] as const) {
      const x0 = side * XI, x1 = side * (XI - 0.4);
      box(d.fit, x0, x1, YC - 0.14, YC - 0.12, z.s0 + 0.1, z.s1 - 0.1, C(0xb5b9be));
      box(d.fit, x1, x1 + side * 0.02, YC - 0.14, YC - 0.07, z.s0 + 0.1, z.s1 - 0.1, C(0x6a6e74));
    }
  }
  // at each doorway: a draught screen each side (a solid dado, glass over it), a pole at its aisle end, a rail over the vestibule, a panel over it
  for (const v of lay.vestibules) {
    for (const s of [v.s0, v.s1]) {
      for (const side of [1, -1] as const) {
        const x0 = side * XI, x1 = side * (XI - 0.55);
        box(d.fit, x0, x1, FL, FL + 0.9, s - 0.02, s + 0.02, trimC);
        for (const f of [1, -1] as const) quad(d.glassIn, [[x0, FL + 0.9, s + f * 0.021], [x0, FL + 1.9, s + f * 0.021], [x1, FL + 1.9, s + f * 0.021], [x1, FL + 0.9, s + f * 0.021]], [0, 0, f], null);
        box(d.fit, x1, x1 + side * 0.03, FL + 0.9, FL + 1.9, s - 0.02, s + 0.02, trimC);
        // the pole, floor to ceiling at the screen's end
        box(d.fit, x1 - side * 0.035, x1, FL, YT - 0.02, s - 0.0175, s + 0.0175, poleC);
      }
    }
    for (const x of [-0.4, 0.4]) box(d.fit, x - 0.0175, x + 0.0175, FL + 1.92, FL + 1.955, v.s0, v.s1, poleC);
    pis(d, v.door, 1, FL, YT);
    pis(d, v.door, -1, FL, YT);
  }
  for (const t of lay.toilets) {
    // the universal-access toilet's curved enclosure, drawn as a box from the side wall to the aisle, its door toward the aisle
    const x0 = t.side * XI, x1 = t.side * (t.accessible ? 0.1 : 0.55);
    box(d.fit, x0, x1, FL, YC, t.s0, t.s1, C(0xd7d9da));
    box(d.fit, x1, x1 - t.side * 0.01, FL + 0.02, FL + 1.98, (t.s0 + t.s1) / 2 - 0.45, (t.s0 + t.s1) / 2 + 0.45, C(0xa3a8ad));
    box(d.screens, x1 - t.side * 0.01, x1 - t.side * 0.015, FL + 1.5, FL + 1.58, (t.s0 + t.s1) / 2 + 0.47, (t.s0 + t.s1) / 2 + 0.55, C(0x2bb3e6));
  }
  for (const w of lay.wheelchair) {
    quad(d.fit, [[w.side * 0.25, FL + 0.004, w.s0], [w.side * XI, FL + 0.004, w.s0], [w.side * XI, FL + 0.004, w.s1], [w.side * 0.25, FL + 0.004, w.s1]], [0, 1, 0], C(0x2457a6));
    box(d.fit, w.side * XI, w.side * (XI - 0.12), FL + 0.62, FL + 0.68, w.s0 + 0.15, w.s1 - 0.15, C(0x55595f));
  }
  const standard = { body: pal.seat, head: pal.seatHead, shell: pal.seatShell };
  const first = { body: pal.firstSeat, head: pal.firstHead, shell: pal.firstShell };
  for (const seat of lay.seats) {
    drawSeat(d, FL, seat, seat.cls === 'first' ? first : standard, pal.seatBack, pal.arms);
    // the grab handle on the back of an aisle seat, in the poles' colour: a loop up from the shell's top, at its aisle edge
    if (Math.abs(seat.x) < 0.7) {
      const x = seat.x - Math.sign(seat.x) * 0.17, top = FL + 0.45 + pal.seatBack + 0.2;
      const sb = seat.s - seat.facing * 0.42;
      box(d.fit, x - 0.02, x + 0.02, top - 0.25, top + 0.06, sb - 0.02, sb + 0.02, poleC);
      box(d.fit, x - 0.02, x + 0.02, top + 0.02, top + 0.06, sb - 0.02, sb + 0.14 * seat.facing, poleC);
    }
  }
  for (const t of lay.tables) {
    box(d.fit, t.x0, t.x1, FL + 0.7, FL + 0.73, t.s - 0.3, t.s + 0.3, C(pal.table));
    const wallX = Math.abs(t.x1) > Math.abs(t.x0) ? t.x1 : t.x0;
    box(d.fit, wallX - Math.sign(wallX) * 0.2, wallX - Math.sign(wallX) * 0.26, FL, FL + 0.7, t.s - 0.03, t.s + 0.03, C(0x55595f));
  }

  const seats = lay.seats.length;
  const { group, triangles } = d.finish(`interior-${car.index}`, { kind, car: car.index, seats });
  return { group, openings, skin: shell.SKIN, layout: lay, seats, triangles };
}
