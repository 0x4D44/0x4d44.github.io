// The inside of an intercity car (the Azuma family and the Class 180): vestibules round the doors near each end, and between them saloons of
// airline seats and table bays. Shared by train-interior-at300.ts and train-interior-adelante.ts, which give it their colours.
//
// What is drawn on the shell (train-interior-kit.ts `drawShell`): the luggage stacks or the café bar, the toilets, the racks over the seats, the
// class's band over the windows with its reservation displays, the seats (2+2 standard, 2+1 first), the wheelchair spaces and the tables.
import * as THREE from 'three';
import { col } from './train-geom.ts';
import type { Car, TrainKind } from '../../core/train.ts';
import { layoutCar } from './train-interior-layout.ts';
import { drawSeat, drawShell, InteriorDraw } from './train-interior-kit.ts';
import type { BasePalette, InteriorBuild, Shell } from './train-interior-kit.ts';

/** An intercity interior's colours by operator, read off the photographs (approximate). */
export interface Palette extends BasePalette {
  /** a seat's upholstery (cushion, the face of its back, the headrest) and the moulded shell behind it, by class */
  standardSeat: number; standardHead: number; standardShell: number; firstSeat: number; firstHead: number; firstShell: number;
  /** the band along the wall over the windows (it carries the reservation displays), by class */
  standardBand: number; firstBand: number;
  table: number;
}

/** Build the inside of car `car` of a train of `kind`, on `shell`, in `pal`. */
export function buildIntercity(kind: TrainKind, car: Car, shell: Shell, pal: Palette): InteriorBuild {
  const lay = layoutCar(kind, car);
  const d = new InteriorDraw(car);
  const { box, quad } = d;
  const C = (hex: number): THREE.Color => col(hex);
  const { XI, FL, YC } = shell;
  const wy1 = shell.windowY[1];
  const { openings, ends } = drawShell(d, shell, lay, pal);

  // --- the saloons' fittings ---
  const stackC = C(0x9aa0a6);
  for (const st of lay.stacks) {
    const x0 = st.side * XI, x1 = st.side * (XI - 0.62);
    if (st.kiosk) {
      box(d.fit, x0, x1, FL, FL + 1.0, st.s0, st.s1, C(0x4a4f57));
      box(d.fit, x0, x1 - st.side * 0.04, FL + 1.0, FL + 1.04, st.s0 - 0.02, st.s1 + 0.02, C(0x2a2c30));
    } else {
      // three shelves in a frame
      for (const y of [FL + 0.02, FL + 0.62, FL + 1.22]) box(d.fit, x0, x1, y, y + 0.03, st.s0, st.s1, stackC);
      for (const s of [st.s0, st.s1]) box(d.fit, x0, x1, FL, FL + 1.7, s - 0.015, s + 0.015, stackC);
    }
  }
  for (const t of lay.toilets) {
    // the toilet's enclosure: a box from the side wall to the gangway's edge, its door on the gangway side
    const x0 = t.side * XI, x1 = t.side * (t.accessible ? 0.05 : 0.55);
    box(d.fit, x0, x1, FL, YC, t.s0, t.s1, C(0xd7d9da));
    box(d.fit, x1 + t.side * 0.0, x1 - t.side * 0.01, FL + 0.02, FL + 1.98, (t.s0 + t.s1) / 2 - 0.4, (t.s0 + t.s1) / 2 + 0.4, C(0xa3a8ad));
    box(d.screens, x1 - t.side * 0.01, x1 - t.side * 0.015, FL + 1.5, FL + 1.58, (t.s0 + t.s1) / 2 + 0.42, (t.s0 + t.s1) / 2 + 0.5, C(0x2bb3e6));
  }
  // the luggage racks: a shelf over each side of every saloon, on brackets at each window pier
  for (const z of lay.zones.filter((q) => q.kind === 'saloon')) {
    for (const side of [1, -1] as const) {
      const x0 = side * XI, x1 = side * (XI - 0.42);
      box(d.fit, x0, x1, YC - 0.12, YC - 0.1, z.s0 + 0.1, z.s1 - 0.1, C(0xb5b9be));
      box(d.fit, x1, x1 + side * 0.02, YC - 0.12, YC - 0.05, z.s0 + 0.1, z.s1 - 0.1, C(0x6a6e74));
      for (let s = z.s0 + 0.3; s < z.s1 - 0.2; s += 2.0) box(d.fit, x0, x1, YC - 0.1, YC - 0.02, s - 0.015, s + 0.015, C(0x6a6e74));
    }
  }
  // the band over the windows, the class's colour, with a reservation display over each pair of seats' window
  for (const z of lay.zones.filter((q) => q.kind === 'saloon')) {
    const band = C(z.cls === 'first' ? pal.firstBand : pal.standardBand);
    for (const side of [1, -1] as const) {
      box(d.fit, side * XI, side * (XI - 0.006), wy1 + 0.05, YC - 0.13, z.s0 + 0.05, z.s1 - 0.05, band);
      for (let s = z.s0 + 0.9; s < z.s1 - 0.5; s += 1.6) box(d.screens, side * (XI - 0.006), side * (XI - 0.012), wy1 + 0.07, wy1 + 0.15, s - 0.07, s + 0.07, C(0x1d2a22));
    }
  }
  const standard = { body: pal.standardSeat, head: pal.standardHead, shell: pal.standardShell };
  const first = { body: pal.firstSeat, head: pal.firstHead, shell: pal.firstShell };
  for (const seat of lay.seats) drawSeat(d, FL, seat, seat.cls === 'first' ? first : standard, seat.cls === 'first' ? 0.78 : 0.72);
  // the wheelchair spaces: a blue patch of floor with a tip-up perch against the wall
  for (const w of lay.wheelchair) {
    quad(d.fit, [[w.side * 0.25, FL + 0.004, w.s0], [w.side * XI, FL + 0.004, w.s0], [w.side * XI, FL + 0.004, w.s1], [w.side * 0.25, FL + 0.004, w.s1]], [0, 1, 0], C(0x2457a6));
    box(d.fit, w.side * XI, w.side * (XI - 0.12), FL + 0.62, FL + 0.68, w.s0 + 0.15, w.s1 - 0.15, C(0x55595f));
  }
  for (const t of lay.tables) {
    box(d.fit, t.x0, t.x1, FL + 0.7, FL + 0.73, t.s - 0.36, t.s + 0.36, C(pal.table));
    // its leg, to the wall side
    const wallX = Math.abs(t.x1) > Math.abs(t.x0) ? t.x1 : t.x0;
    box(d.fit, wallX - Math.sign(wallX) * 0.2, wallX - Math.sign(wallX) * 0.26, FL, FL + 0.7, t.s - 0.03, t.s + 0.03, C(0x55595f));
  }

  const { group, triangles } = d.finish(`interior-${car.index}`, { kind, car: car.index, seats: lay.seats.length });
  return { group, openings, ends, skin: shell.SKIN, layout: lay, seats: lay.seats.length, triangles };
}
