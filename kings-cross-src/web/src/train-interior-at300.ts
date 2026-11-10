// The inside of one Azuma-family car (Hitachi AT300: LNER 800/801, Hull Trains 802, Lumo 803), built only for the car the camera is in or
// beside (train-interior.ts loads this module on first use, so the page's first bundle does not carry it).
//
// What is drawn, all in the car's own frame (x across, y above the rail head, z along the train, as train.ts builds the car):
//   the liner      the side walls' inner faces from the floor to the cantrail, with the window and door openings cut through, the reveals that join
//                  each opening to the outer skin, a coved ceiling and the floor (carpet in the saloons, vinyl in the vestibules);
//   the glass      each window and door light as a pane seen from both faces: dark and glossy from outside, nearly clear from inside;
//   the saloons    the seats (2+2 standard, 2+1 first), the tables of the bays, the luggage racks over the seats, the stacks, two lines of
//                  ceiling light and a passenger information panel over each end;
//   the ends       the glazed partition with its sliding door between saloon and vestibule, the end wall with its gangway opening, the cab's
//                  back wall with its door on a driving car, the inner faces of the doors, and a toilet where the car has one.
// Sizes no source publishes are in train-interior-layout.ts `FIT` (ASSUMED). The colours are read off the photographs in the receipts
// (.scratch/interiors/refs/receipts.json, outside the repository) and are approximate.
//
// Light: the interior is lit by its own lamps, day and night, so its surfaces are unlit materials whose colours carry a fixed shading (lit from
// the ceiling) times the lamps' level; the scene's sun and sky do not reach in. After dark (train-geom.ts `trainNight`, as the lit windows of
// every other car) the lamps are warmer and a little brighter.
import * as THREE from 'three';
import { ASSUMED, bodySpec, END_GAP } from './train.ts';
import { col, Soup, trainNight } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import type { Car, TrainKind } from '../../core/train.ts';
import { FIT, layoutCar, seatHalf } from './train-interior-layout.ts';
import type { CarInterior, Seat, SeatClass } from './train-interior-layout.ts';
import type { Opening } from './train-interior-cut.ts';

const SPEC = bodySpec('at300');
/** The outer skin's face (train.ts carSection: the body's half-width less the door relief). */
export const SKIN = SPEC.half - 0.02;

/** The interior's colours by operator, read off the photographs (approximate). */
export interface Palette {
  /** a seat's upholstery (cushion, the face of its back, the headrest) and the moulded shell behind it, by class */
  standardSeat: number; standardHead: number; standardShell: number; firstSeat: number; firstHead: number; firstShell: number;
  /** the band along the wall over the windows (it carries the reservation displays), by class */
  standardBand: number; firstBand: number;
  carpet: number; firstCarpet: number; vinyl: number; wall: number; ceiling: number; trim: number; table: number; partition: number; door: number;
}
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

/** The lamps' colour and level by day and after dark. */
export const LAMP = { day: [1.0, 0.98, 0.94], night: [1.0, 0.9, 0.74], dayLevel: 0.8, nightLevel: 0.88 } as const;

// One set of materials, shared by every interior; their colour is the lamp level, set each frame (`setInteriorLight`).
let mats: { fit: THREE.MeshBasicMaterial; lamps: THREE.MeshBasicMaterial; screens: THREE.MeshBasicMaterial; glassOut: THREE.MeshStandardMaterial; glassIn: THREE.MeshBasicMaterial } | null = null;
export function interiorMaterials(): NonNullable<typeof mats> {
  if (!mats) {
    mats = {
      fit: new THREE.MeshBasicMaterial({ vertexColors: true }),
      lamps: new THREE.MeshBasicMaterial({ color: 0xfff6e8 }),
      screens: new THREE.MeshBasicMaterial({ vertexColors: true }),
      // the outer face: the cab glass's dark, coated look (train-geom.ts glassMaterial), but see-through
      glassOut: new THREE.MeshStandardMaterial({ color: 0x1a2430, metalness: 0.6, roughness: 0.12, transparent: true, opacity: 0.55, depthWrite: false }),
      glassIn: new THREE.MeshBasicMaterial({ color: 0x9fb2bf, transparent: true, opacity: 0.1, depthWrite: false }),
    };
  }
  return mats;
}

/** Set the lamps for the scene's light: `night` is train-geom.ts `trainNight` (0 by day, 1 after dark). */
export function setInteriorLight(night = trainNight.value): void {
  const m = interiorMaterials();
  const t = Math.min(1, Math.max(0, night));
  const level = LAMP.dayLevel + (LAMP.nightLevel - LAMP.dayLevel) * t;
  const c = LAMP.day.map((d, i) => (d + ((LAMP.night[i] as number) - d) * t) * level) as [number, number, number];
  m.fit.color.setRGB(...c);
  m.screens.color.setRGB(1, 1, 1);
}

/** Shade a colour for a face's normal: lit from the ceiling, the up faces brightest, the undersides darkest. */
function shade(n: V3): number {
  return 0.66 + 0.3 * Math.max(0, n[1]) - 0.22 * Math.max(0, -n[1]) + 0.04 * Math.abs(n[0]);
}
function bake(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.getAttribute('normal'), c = g.getAttribute('color');
  if (!c) return g;
  for (let i = 0; i < c.count; i++) {
    const k = shade([n.getX(i), n.getY(i), n.getZ(i)]);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}

export interface InteriorBuild {
  group: THREE.Group;
  /** the rectangles to cut out of the car's outer skin (train-interior-cut.ts) */
  openings: Opening[];
  /** the layout drawn, for the tests and the status */
  layout: CarInterior;
  triangles: number;
}

/** Build the inside of car `car` of a train of `kind`. */
export function buildInterior(kind: TrainKind, car: Car): InteriorBuild {
  const lay = layoutCar(kind, car);
  const pal = paletteFor(kind);
  const dir = car.cab === 'rear' ? -1 : 1;
  const base = car.cab === 'rear' ? car.end : car.start;
  const Z = (s: number): number => base + dir * s;
  const fit = new Soup(), lamps = new Soup(), screens = new Soup(), glassOut = new Soup(), glassIn = new Soup();
  const C = (hex: number): THREE.Color => col(hex);
  const XI = FIT.wall, FL = FIT.floor, YC = FIT.cantrail, YT = FIT.ceiling;
  const front = lay.walls[0]!.s, back = lay.walls[lay.walls.length - 1]!.s;
  // a box in (x, y, s), whatever way s runs
  const box = (soup: Soup, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, c: THREE.Color, skip = ''): void => {
    const za = Z(s0), zb = Z(s1);
    soup.box(Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(za, zb), Math.max(za, zb), c, skip);
  };
  // a flat quad facing `n`, corners in (x, y, s)
  const quad = (soup: Soup, p: [V3, V3, V3, V3], n: V3, c: THREE.Color | null): void => {
    const w = p.map(([x, y, s]): V3 => [x, y, Z(s)]) as [V3, V3, V3, V3];
    const nn: V3 = [n[0], n[1], n[2] * dir];
    soup.quad(w, [nn, nn, nn, nn], c);
  };

  // --- the openings: every passenger window, and the light in each passenger door's leaf (train.ts draws them at these places) ---
  const [wy0, wy1] = SPEC.windowY;
  const [, dy1] = SPEC.doorY;
  const openings: Opening[] = [];
  const holes: { s0: number; s1: number; y0: number; y1: number; kind: 'window' | 'door' }[] = [];
  const plan = lay.doors;
  for (const [s0, s1] of carWindows(car)) holes.push({ s0, s1, y0: wy0, y1: wy1, kind: 'window' });
  for (const s of plan) holes.push({ s0: s - 0.27, s1: s + 0.27, y0: dy1 - 0.91, y1: dy1 - 0.21, kind: 'door' });
  for (const h of holes) for (const side of [1, -1] as const) {
    const za = Z(h.s0), zb = Z(h.s1);
    openings.push({ side, z0: Math.min(za, zb), z1: Math.max(za, zb), y0: h.y0, y1: h.y1 });
  }

  // --- the side walls: the liner from the floor to the cantrail, open at each window and each doorway ---
  const wallC = C(pal.wall), revealC = C(pal.trim);
  const sMin = Math.min(front, back), sMax = Math.max(front, back);
  for (const side of [1, -1] as const) {
    const x = side * XI;
    const n: V3 = [-side, 0, 0];
    // the doorways are cut full height in the liner: the door's own leaf stands in the skin
    const cuts = [
      ...holes.filter((h) => h.kind === 'window').map((h) => ({ s0: h.s0, s1: h.s1, y0: h.y0, y1: h.y1 })),
      ...plan.map((s) => ({ s0: s - ASSUMED.doorWidth / 2, s1: s + ASSUMED.doorWidth / 2, y0: FL, y1: dy1 })),
    ];
    for (const r of wallCells(sMin, sMax, FL, YC, cuts)) quad(fit, [[x, r.y0, r.s0], [x, r.y1, r.s0], [x, r.y1, r.s1], [x, r.y0, r.s1]], n, wallC);
    // window reveals: four faces joining the liner to the skin round each window, facing into the opening
    for (const h of holes.filter((q) => q.kind === 'window')) {
      const xa = side * XI, xb = side * (SKIN - 0.002);
      quad(fit, [[xa, h.y0, h.s0], [xb, h.y0, h.s0], [xb, h.y0, h.s1], [xa, h.y0, h.s1]], [0, 1, 0], revealC);
      quad(fit, [[xa, h.y1, h.s0], [xb, h.y1, h.s0], [xb, h.y1, h.s1], [xa, h.y1, h.s1]], [0, -1, 0], revealC);
      quad(fit, [[xa, h.y0, h.s0], [xb, h.y0, h.s0], [xb, h.y1, h.s0], [xa, h.y1, h.s0]], [0, 0, 1], revealC);
      quad(fit, [[xa, h.y0, h.s1], [xb, h.y0, h.s1], [xb, h.y1, h.s1], [xa, h.y1, h.s1]], [0, 0, -1], revealC);
      // the sill, a little shelf the width of the reveal
      box(fit, xa, xa - side * 0.05, h.y0 - 0.02, h.y0, h.s0 - 0.02, h.s1 + 0.02, revealC, side > 0 ? '+x' : '-x');
    }
    // the doorways: the jambs and head of the lining, and the inner face of the leaf with its light
    for (const s of plan) {
      const s0 = s - ASSUMED.doorWidth / 2, s1 = s + ASSUMED.doorWidth / 2;
      const xa = side * XI, xb = side * (SKIN - 0.025);
      quad(fit, [[xa, FL, s0], [xb, FL, s0], [xb, dy1, s0], [xa, dy1, s0]], [0, 0, 1], revealC);
      quad(fit, [[xa, FL, s1], [xb, FL, s1], [xb, dy1, s1], [xa, dy1, s1]], [0, 0, -1], revealC);
      quad(fit, [[xa, dy1, s0], [xb, dy1, s0], [xb, dy1, s1], [xa, dy1, s1]], [0, -1, 0], revealC);
      const leaf = { s0: s - 0.27, s1: s + 0.27, y0: dy1 - 0.91, y1: dy1 - 0.21 };
      for (const r of wallCells(s0, s1, FL, dy1, [leaf])) quad(fit, [[xb, r.y0, r.s0], [xb, r.y1, r.s0], [xb, r.y1, r.s1], [xb, r.y0, r.s1]], n, C(pal.door));
      // the open and close buttons beside the light, lit green
      box(screens, xb, xb - side * 0.02, 1.95, 2.03, s + 0.33, s + 0.41, C(0x1fb85a));
    }
  }
  // the glass: a pane in each opening, its outer face a few millimetres inside the old pane's (train.ts: the pane stood 12 mm proud of the skin)
  for (const o of openings) {
    const xo = o.side * (SPEC.half - 0.012), xi = o.side * (SKIN - 0.006);
    const pane = (soup: Soup, x: number, n: V3): void => soup.quad([[x, o.y0, o.z0], [x, o.y1, o.z0], [x, o.y1, o.z1], [x, o.y0, o.z1]], [n, n, n, n], null);
    pane(glassOut, xo, [o.side, 0, 0]);
    pane(glassIn, xi, [-o.side, 0, 0]);
  }

  // --- floor and ceiling ---
  for (const z of lay.zones) {
    if (z.kind === 'cab') continue;
    const c = C(z.kind === 'vestibule' ? pal.vinyl : z.cls === 'first' ? pal.firstCarpet : pal.carpet);
    quad(fit, [[-XI, FL, z.s0], [XI, FL, z.s0], [XI, FL, z.s1], [-XI, FL, z.s1]], [0, 1, 0], c);
  }
  // the cove: from the cantrail up and in to the flat of the ceiling, three facets a side
  const cove: [number, number][] = [[XI, YC], [XI - 0.12, YC + 0.17], [XI - 0.36, YC + 0.27], [0.62, YT - 0.01], [0, YT]];
  const ceilC = C(pal.ceiling);
  for (const side of [1, -1] as const) {
    for (let i = 0; i + 1 < cove.length; i++) {
      const [x0, y0] = cove[i] as [number, number], [x1, y1] = cove[i + 1] as [number, number];
      // facing down and in: the segment's normal (-dy, dx), mirrored across for the left side
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n: V3 = [(side * -(y1 - y0)) / len, (x1 - x0) / len, 0];
      quad(fit, [[side * x0, y0, sMin], [side * x1, y1, sMin], [side * x1, y1, sMax], [side * x0, y0, sMax]], n, ceilC);
    }
  }
  // two lines of light along the ceiling's flat, the length of each saloon and vestibule
  for (const z of lay.zones) {
    if (z.kind === 'cab') continue;
    for (const side of [1, -1] as const) box(lamps, side * 0.5, side * 0.62, YT - 0.03, YT - 0.005, z.s0 + 0.25, z.s1 - 0.25, C(0xffffff), '+y');
  }

  // --- the cross walls ---
  const partC = C(pal.partition);
  // a wall across the car at s, both faces, with a doorway [x0, x1] up to `head` (none when head <= FL)
  const across = (s: number, x0: number, x1: number, head: number, c: THREE.Color): void => {
    const cells = wallCells(-XI, XI, FL, YT, head > FL ? [{ s0: x0, s1: x1, y0: FL, y1: head }] : []);
    for (const r of cells) for (const f of [1, -1] as const) {
      const ss = s + f * 0.03;
      quad(fit, [[r.s0, r.y0, ss], [r.s0, r.y1, ss], [r.s1, r.y1, ss], [r.s1, r.y0, ss]], [0, 0, f], c);
    }
    if (head > FL) {
      // the doorway's jambs and head
      for (const x of [x0, x1]) quad(fit, [[x, FL, s - 0.03], [x, head, s - 0.03], [x, head, s + 0.03], [x, FL, s + 0.03]], [x === x0 ? 1 : -1, 0, 0], revealC);
      quad(fit, [[x0, head, s - 0.03], [x1, head, s - 0.03], [x1, head, s + 0.03], [x0, head, s + 0.03]], [0, -1, 0], revealC);
    }
  };
  for (const w of lay.walls) {
    if (w.kind === 'end') {
      // the gangway: a doorway 1.0 m wide and 2.0 m high, its door open (ASSUMED sizes; the bellows outside it are train.ts's)
      across(w.s, -0.5, 0.5, FL + 1.95, partC);
      // the gangway's passage, out to the car's end, where the next car's half meets it: inner faces only (the bellows are train.ts's, outside)
      const sEnd = w.s > (front + back) / 2 ? car.length : 0;
      const gw = C(0x4b4f55);
      quad(fit, [[0.5, FL, w.s], [0.5, FL + 1.95, w.s], [0.5, FL + 1.95, sEnd], [0.5, FL, sEnd]], [-1, 0, 0], gw);
      quad(fit, [[-0.5, FL, w.s], [-0.5, FL + 1.95, w.s], [-0.5, FL + 1.95, sEnd], [-0.5, FL, sEnd]], [1, 0, 0], gw);
      quad(fit, [[-0.5, FL + 1.95, w.s], [0.5, FL + 1.95, w.s], [0.5, FL + 1.95, sEnd], [-0.5, FL + 1.95, sEnd]], [0, -1, 0], gw);
      quad(fit, [[-0.5, FL, w.s], [0.5, FL, w.s], [0.5, FL, sEnd], [-0.5, FL, sEnd]], [0, 1, 0], C(pal.vinyl));
    } else if (w.kind === 'cab') {
      // the cab's back wall: solid, with the cab door (a darker leaf, a small light, no handle drawn) and a panel over it
      across(w.s, 0, 0, FL, partC);
      const f = Math.sign((back - front) || 1);
      box(fit, -0.35, 0.35, FL, FL + 1.95, w.s + f * 0.03, w.s + f * 0.045, C(0x8c9196));
      box(fit, -0.12, 0.12, FL + 1.35, FL + 1.75, w.s + f * 0.045, w.s + f * 0.05, C(0x3a4048));
      pis(w.s + f * 0.05, f);
    } else {
      // a glazed partition: a sliding door 0.9 m wide in the middle (open), glass beside it above the dado
      across(w.s, -0.45, 0.45, FL + 1.95, partC);
      for (const [x0, x1] of [[-XI + 0.12, -0.55], [0.55, XI - 0.12]] as const) {
        for (const f of [1, -1] as const) {
          const ss = w.s + f * 0.032;
          quad(glassIn, [[x0, FL + 1.05, ss], [x0, FL + 1.9, ss], [x1, FL + 1.9, ss], [x1, FL + 1.05, ss]], [0, 0, f], null);
        }
      }
      if (w.kind === 'partition') for (const f of [1, -1] as const) pis(w.s + f * 0.035, f);
    }
  }
  // a passenger information panel hung over a doorway at s, its screen facing f
  function pis(s: number, f: number): void {
    // hung from the ceiling a little way out from the wall, its lower edge 1.77 m over the floor (ASSUMED), on two rods
    box(fit, -0.45, 0.45, FL + 1.77, FL + 1.92, s + f * 0.35, s + f * 0.41, C(0x1c1e22));
    for (const x of [-0.3, 0.3]) box(fit, x - 0.01, x + 0.01, FL + 1.92, YT, s + f * 0.37, s + f * 0.39, C(0x8a8f96));
    box(screens, -0.41, 0.41, FL + 1.79, FL + 1.9, s + f * 0.41, s + f * 0.415, C(0xf0a020));
  }

  // --- the saloons' fittings ---
  const stackC = C(0x9aa0a6);
  for (const st of lay.stacks) {
    const x0 = st.side * XI, x1 = st.side * (XI - 0.62);
    if (st.kiosk) {
      box(fit, x0, x1, FL, FL + 1.0, st.s0, st.s1, C(0x4a4f57));
      box(fit, x0, x1 - st.side * 0.04, FL + 1.0, FL + 1.04, st.s0 - 0.02, st.s1 + 0.02, C(0x2a2c30));
    } else {
      // three shelves in a frame
      for (const y of [FL + 0.02, FL + 0.62, FL + 1.22]) box(fit, x0, x1, y, y + 0.03, st.s0, st.s1, stackC);
      for (const s of [st.s0, st.s1]) box(fit, x0, x1, FL, FL + 1.7, s - 0.015, s + 0.015, stackC);
    }
  }
  for (const t of lay.toilets) {
    // the toilet's enclosure: a box from the side wall to the gangway's edge, its door on the gangway side
    const x0 = t.side * XI, x1 = t.side * (t.accessible ? 0.05 : 0.55);
    box(fit, x0, x1, FL, YC, t.s0, t.s1, C(0xd7d9da));
    box(fit, x1 + t.side * 0.0, x1 - t.side * 0.01, FL + 0.02, FL + 1.98, (t.s0 + t.s1) / 2 - 0.4, (t.s0 + t.s1) / 2 + 0.4, C(0xa3a8ad));
    box(screens, x1 - t.side * 0.01, x1 - t.side * 0.015, FL + 1.5, FL + 1.58, (t.s0 + t.s1) / 2 + 0.42, (t.s0 + t.s1) / 2 + 0.5, C(0x2bb3e6));
  }
  // the luggage racks: a shelf over each side of every saloon, on brackets at each window pier
  for (const z of lay.zones.filter((q) => q.kind === 'saloon')) {
    for (const side of [1, -1] as const) {
      const x0 = side * XI, x1 = side * (XI - 0.42);
      box(fit, x0, x1, YC - 0.12, YC - 0.1, z.s0 + 0.1, z.s1 - 0.1, C(0xb5b9be));
      box(fit, x1, x1 + side * 0.02, YC - 0.12, YC - 0.05, z.s0 + 0.1, z.s1 - 0.1, C(0x6a6e74));
      for (let s = z.s0 + 0.3; s < z.s1 - 0.2; s += 2.0) box(fit, x0, x1, YC - 0.1, YC - 0.02, s - 0.015, s + 0.015, C(0x6a6e74));
    }
  }
  // the band over the windows, the class's colour, with a reservation display over each pair of seats' window
  for (const z of lay.zones.filter((q) => q.kind === 'saloon')) {
    const band = C(z.cls === 'first' ? pal.firstBand : pal.standardBand);
    for (const side of [1, -1] as const) {
      box(fit, side * XI, side * (XI - 0.006), wy1 + 0.05, YC - 0.13, z.s0 + 0.05, z.s1 - 0.05, band);
      for (let s = z.s0 + 0.9; s < z.s1 - 0.5; s += 1.6) box(screens, side * (XI - 0.006), side * (XI - 0.012), wy1 + 0.07, wy1 + 0.15, s - 0.07, s + 0.07, C(0x1d2a22));
    }
  }
  for (const seat of lay.seats) drawSeat(fit, seat, pal, box, Z);
  // the wheelchair spaces: a blue patch of floor with a tip-up perch against the wall
  for (const w of lay.wheelchair) {
    quad(fit, [[w.side * 0.25, FL + 0.004, w.s0], [w.side * XI, FL + 0.004, w.s0], [w.side * XI, FL + 0.004, w.s1], [w.side * 0.25, FL + 0.004, w.s1]], [0, 1, 0], C(0x2457a6));
    box(fit, w.side * XI, w.side * (XI - 0.12), FL + 0.62, FL + 0.68, w.s0 + 0.15, w.s1 - 0.15, C(0x55595f));
  }
  for (const t of lay.tables) {
    box(fit, t.x0, t.x1, FL + 0.7, FL + 0.73, t.s - 0.36, t.s + 0.36, C(pal.table));
    // its leg, to the wall side
    const wallX = Math.abs(t.x1) > Math.abs(t.x0) ? t.x1 : t.x0;
    box(fit, wallX - Math.sign(wallX) * 0.2, wallX - Math.sign(wallX) * 0.26, FL, FL + 0.7, t.s - 0.03, t.s + 0.03, C(0x55595f));
  }

  const m = interiorMaterials();
  const group = new THREE.Group();
  group.name = `interior-${car.index}`;
  let triangles = 0;
  const add = (soup: Soup, material: THREE.Material, name: string, order = 0): void => {
    if (!soup.pos.length) return;
    const g = name === 'interior-fit' ? bake(soup.build()) : soup.build();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name; mesh.renderOrder = order;
    triangles += soup.pos.length / 9;
    group.add(mesh);
  };
  add(fit, m.fit, 'interior-fit');
  add(lamps, m.lamps, 'interior-lamps');
  add(screens, m.screens, 'interior-screens');
  add(glassIn, m.glassIn, 'interior-glass-in', 1);
  add(glassOut, m.glassOut, 'interior-glass-out', 1);
  group.userData = { kind, car: car.index, seats: lay.seats.length };
  return { group, openings, layout: lay, triangles };
}

/** The car's passenger windows, from train.ts's own plan (the same spans it lays its panes on). */
function carWindows(car: Car): [number, number][] {
  return SPEC.plan(car, false).windows;
}

type BoxFn = (soup: Soup, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, c: THREE.Color, skip?: string) => void;

/** One seat: a pedestal, the cushion, a reclined back, the headrest and an armrest each side. */
function drawSeat(soup: Soup, seat: Seat, pal: Palette, box: BoxFn, Z: (s: number) => number): void {
  const FL = FIT.floor;
  const h = seatHalf(seat.cls) - 0.02;
  const f = seat.facing;
  const body = col(seat.cls === 'first' ? pal.firstSeat : pal.standardSeat);
  const head = col(seat.cls === 'first' ? pal.firstHead : pal.standardHead);
  const back = seat.s - f * 0.3;
  box(soup, seat.x - 0.12, seat.x + 0.12, FL, FL + 0.36, seat.s - 0.15, seat.s + 0.15, col(0x2a2b2e));
  box(soup, seat.x - h, seat.x + h, FL + 0.36, FL + 0.47, back + f * 0.05, seat.s + f * 0.22, body);
  // the back leans 12 degrees: a slab from the cushion's rear up to the headrest
  const lean = Math.tan((12 * Math.PI) / 180);
  const top = seat.cls === 'first' ? 0.78 : 0.72;
  const shell = col(seat.cls === 'first' ? pal.firstShell : pal.standardShell);
  // the upholstered face of the back, the headrest proud of its top, and the moulded shell behind both (a little taller and wider)
  slab(soup, seat.x, h - 0.02, FL + 0.45, FL + 0.45 + top, back + f * 0.08, -f * lean, 0.05, body);
  slab(soup, seat.x, h - 0.05, FL + 0.45 + top, FL + 0.45 + top + 0.2, back + f * 0.08 - f * lean * top, -f * lean, 0.07, head);
  slab(soup, seat.x, h, FL + 0.38, FL + 0.45 + top + 0.24, back + f * 0.03 + f * lean * 0.07, -f * lean, 0.06, shell);
  for (const side of [-1, 1]) box(soup, seat.x + side * h, seat.x + side * (h + 0.04), FL + 0.47, FL + 0.66, back + f * 0.08, seat.s + f * 0.18, col(0xb9bbbd));

  function slab(sp: Soup, x: number, hw: number, y0: number, y1: number, s0: number, k: number, thick: number, c: THREE.Color): void {
    // a box leaning along s: its foot at s0, its top at s0 + k (y1 - y0); `thick` deep behind the face
    const s1 = s0 + k * (y1 - y0);
    const pts = (s: number, y: number): [number, number] => [y, Z(s)];
    sp.bar(pts(s0 - f * thick / 2, y0), pts(s1 - f * thick / 2, y1), hw * 2, thick, c, x);
  }
}

/** A rectangle [a0, a1] x [y0, y1] less some rectangles, as cells (a grid on their edges, the cells not inside any). */
export function wallCells(a0: number, a1: number, y0: number, y1: number, cuts: readonly { s0: number; s1: number; y0: number; y1: number }[]): { s0: number; s1: number; y0: number; y1: number }[] {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const as = [...new Set([lo, hi, ...cuts.flatMap((c) => [c.s0, c.s1]).filter((v) => v > lo && v < hi)])].sort((p, q) => p - q);
  const ys = [...new Set([y0, y1, ...cuts.flatMap((c) => [c.y0, c.y1]).filter((v) => v > y0 && v < y1)])].sort((p, q) => p - q);
  const out: { s0: number; s1: number; y0: number; y1: number }[] = [];
  for (let i = 0; i + 1 < as.length; i++) {
    const sa = as[i] as number, sb = as[i + 1] as number;
    // merge each column's free cells into runs
    let run: [number, number] | null = null;
    for (let j = 0; j + 1 < ys.length; j++) {
      const ya = ys[j] as number, yb = ys[j + 1] as number;
      const sm = (sa + sb) / 2, ym = (ya + yb) / 2;
      const cut = cuts.some((c) => sm > Math.min(c.s0, c.s1) && sm < Math.max(c.s0, c.s1) && ym > c.y0 && ym < c.y1);
      if (!cut) run = run ? [run[0], yb] : [ya, yb];
      if (cut || j + 2 === ys.length) { if (run) out.push({ s0: sa, s1: sb, y0: run[0], y1: run[1] }); run = null; }
    }
  }
  return out;
}

export { END_GAP };
