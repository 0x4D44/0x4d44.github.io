// What every family's interior shares (train-interior-at300.ts and the others, each loaded on first use; this module rides along with whichever
// loads first): the car's shell seen from inside, and the means of drawing it.
//
//   the shell      `shellFor`: the floor, the liner's face, the cantrail and the ceiling for a family's body, from train.ts `bodySpec` (ASSUMED where
//                  no source publishes them, as train-interior-layout.ts `FIT` is for the Azuma);
//   the liner      the side walls' inner faces from the floor to the cantrail, with the window and door openings cut through, the reveals that join
//                  each opening to the outer skin, a coved ceiling and the floor (carpet in the saloons, vinyl in the vestibules);
//   the glass      each window and door light as a pane seen from both faces: tinted like the car's own panes from outside, nearly clear from inside;
//   the ends       the cross walls (train-interior-layout.ts `CrossWall`): the cab's back wall, an end wall with its gangway door, a glazed partition,
//                  or a wide open gangway into the next car;
//   the seats      `drawSeat`, one transverse seat.
//
// Light: the interior is lit by its own lamps, day and night, so its surfaces are unlit materials whose colours carry a fixed shading (lit from
// the ceiling) times the lamps' level; the scene's sun and sky do not reach in. After dark (train-geom.ts `trainNight`, as the lit windows of
// every other car) the lamps are warmer and a little brighter.
import * as THREE from 'three';
import { bodySpec } from './train.ts';
import { col, Soup, trainNight } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import type { Car, Family } from '../../core/train.ts';
import { FIT, seatHalf } from './train-interior-layout.ts';
import type { CarInterior, Seat } from './train-interior-layout.ts';
import type { EndOpening, Opening } from './train-interior-cut.ts';

/** A family's body seen from inside, metres in the car's frame (x across, y above the rail head). */
export interface Shell {
  family: Family;
  /** the body's half-width and the outer skin's face (train.ts carSection: the half-width less the door relief) */
  half: number;
  SKIN: number;
  /** the floor, the liner's face across, the cantrail and the ceiling's centre */
  FL: number; XI: number; YC: number; YT: number;
  windowY: readonly [number, number];
  doorY: readonly [number, number];
  doorWidth: number;
  doorLeaves: 1 | 2;
  /** the car's passenger windows, from train.ts's own plan (the same spans it lays its panes on) */
  windows: (car: Car) => [number, number][];
  /** the wide open gangway's clear opening (a walk-through unit), half its width and its head over the floor */
  gangway: { half: number; head: number };
}

/**
 * The shell of a family's body. The Azuma's figures are train-interior-layout.ts `FIT`. The others are worked out the same way (ASSUMED: no
 * source gives an inside dimension): the floor at the door sill, a 90 mm wall, the cantrail at the door head or 0.14 m over the windows, whichever is
 * higher, and the ceiling 0.31 m over it, as on the Azuma.
 */
export function shellFor(family: Family): Shell {
  const spec = bodySpec(family);
  const at300 = family === 'at300';
  const FL = at300 ? FIT.floor : spec.doorY[0];
  const YC = at300 ? FIT.cantrail : Math.max(spec.doorY[1], spec.windowY[1] + 0.14);
  return {
    family,
    half: spec.half,
    SKIN: spec.half - 0.02,
    FL,
    XI: at300 ? FIT.wall : spec.half - 0.09,
    YC,
    YT: at300 ? FIT.ceiling : YC + 0.31,
    windowY: spec.windowY,
    doorY: spec.doorY,
    doorWidth: spec.doorWidth,
    doorLeaves: spec.doorLeaves,
    windows: (car) => spec.plan(car, false).windows,
    // the bellows' own opening less a 0.25 m frame each side, to 2.05 m over the floor (ASSUMED)
    gangway: { half: spec.gangway.width / 2 - 0.25, head: FL + 2.05 },
  };
}

/** The lights in a passenger door's leaves, as train.ts draws them: one in a single leaf, one in each of two. */
export function doorLights(shell: Shell, s: number): { s0: number; s1: number; y0: number; y1: number }[] {
  const dy1 = shell.doorY[1];
  if (shell.doorLeaves === 1) return [{ s0: s - 0.27, s1: s + 0.27, y0: dy1 - 0.91, y1: dy1 - 0.21 }];
  const leaf = (shell.doorWidth - 0.04) / 2;
  return [-1, 1].map((k) => {
    const c = s + (k * (leaf + 0.04)) / 2;
    return { s0: c - leaf * 0.34, s1: c + leaf * 0.34, y0: dy1 - 0.95, y1: dy1 - 0.18 };
  });
}

/** The colours every interior needs (each family's module adds its own). */
export interface BasePalette { wall: number; ceiling: number; trim: number; partition: number; door: number; vinyl: number; carpet: number; firstCarpet: number }

/** The lamps' colour and level by day and after dark. */
export const LAMP = { day: [1.0, 0.98, 0.94], night: [1.0, 0.9, 0.74], dayLevel: 0.8, nightLevel: 0.88 } as const;

// One set of materials, shared by every interior; their colour is the lamp level, set each frame (`setInteriorLight`). The outer glass is the
// template each car's own copy is made from (train-interior.ts tints that copy toward the car's panes as it nears the edge of the interiors' reach).
let mats: { fit: THREE.MeshBasicMaterial; lamps: THREE.MeshBasicMaterial; screens: THREE.MeshBasicMaterial; glassOut: THREE.MeshLambertMaterial; glassIn: THREE.MeshBasicMaterial } | null = null;
export function interiorMaterials(): NonNullable<typeof mats> {
  if (!mats) {
    mats = {
      fit: new THREE.MeshBasicMaterial({ vertexColors: true }),
      lamps: new THREE.MeshBasicMaterial({ color: 0xfff6e8 }),
      screens: new THREE.MeshBasicMaterial({ vertexColors: true }),
      // the outer face: lit as the car's own panes are (train-geom.ts `plain`), but see-through
      glassOut: new THREE.MeshLambertMaterial({ color: 0x2a3a4c, transparent: true, opacity: 0.55, depthWrite: false }),
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
  /** the rectangles to cut out of the car's outer skin (train-interior-cut.ts), and out of the plates across its ends at an open gangway */
  openings: Opening[];
  ends: EndOpening[];
  /** the skin's face (the cut takes the faces at least this far out, less a little) */
  skin: number;
  /** the layout drawn, for the tests and the status */
  layout: CarInterior;
  /** seats drawn (transverse and on the benches) */
  seats: number;
  triangles: number;
}

export type BoxFn = (soup: Soup, x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, c: THREE.Color, skip?: string) => void;
export type QuadFn = (soup: Soup, p: [V3, V3, V3, V3], n: V3, c: THREE.Color | null) => void;

/** The soups one car's interior is drawn into, and boxes and quads placed by s (metres from the cab end, or the car's start), whatever way s runs. */
export class InteriorDraw {
  readonly fit = new Soup();
  readonly lamps = new Soup();
  readonly screens = new Soup();
  readonly glassOut = new Soup();
  readonly glassIn = new Soup();
  readonly dir: number;
  readonly Z: (s: number) => number;
  readonly box: BoxFn;
  readonly quad: QuadFn;
  readonly car: Car;
  constructor(car: Car) {
    this.car = car;
    const dir = car.cab === 'rear' ? -1 : 1;
    const base = car.cab === 'rear' ? car.end : car.start;
    const Z = (s: number): number => base + dir * s;
    this.dir = dir;
    this.Z = Z;
    this.box = (soup, x0, x1, y0, y1, s0, s1, c, skip = '') => {
      const za = Z(s0), zb = Z(s1);
      soup.box(Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(za, zb), Math.max(za, zb), c, skip);
    };
    this.quad = (soup, p, n, c) => {
      const w = p.map(([x, y, s]): V3 => [x, y, Z(s)]) as [V3, V3, V3, V3];
      const nn: V3 = [n[0], n[1], n[2] * dir];
      soup.quad(w, [nn, nn, nn, nn], c);
    };
  }

  /** The soups as one group of at most five meshes (the fittings, the lamps, the screens, the glass's two faces). */
  finish(name: string, userData: Record<string, unknown>): { group: THREE.Group; triangles: number } {
    const m = interiorMaterials();
    const group = new THREE.Group();
    group.name = name;
    let triangles = 0;
    const add = (soup: Soup, material: THREE.Material, mesh: string, order = 0): void => {
      if (!soup.pos.length) return;
      const g = mesh === 'interior-fit' ? bake(soup.build()) : soup.build();
      const o = new THREE.Mesh(g, material);
      o.name = mesh; o.renderOrder = order;
      triangles += soup.pos.length / 9;
      group.add(o);
    };
    add(this.fit, m.fit, 'interior-fit');
    add(this.lamps, m.lamps, 'interior-lamps');
    add(this.screens, m.screens, 'interior-screens');
    add(this.glassIn, m.glassIn, 'interior-glass-in', 1);
    add(this.glassOut, m.glassOut, 'interior-glass-out', 1);
    group.userData = userData;
    return { group, triangles };
  }
}

/**
 * The shell of one car seen from inside: the openings to cut, the side walls with their reveals and door linings, the glass, the floor, the
 * cove and the lamp lines, and the cross walls. Answers the openings.
 */
export function drawShell(d: InteriorDraw, shell: Shell, lay: CarInterior, pal: BasePalette): { openings: Opening[]; ends: EndOpening[] } {
  const { car, box, quad, Z } = d;
  const C = (hex: number): THREE.Color => col(hex);
  const { XI, FL, YC, YT, SKIN } = shell;
  const front = lay.walls[0]!.s, back = lay.walls[lay.walls.length - 1]!.s;

  // --- the openings: every passenger window, and the lights in each passenger door's leaves (train.ts draws them at these places) ---
  const [wy0, wy1] = shell.windowY;
  const [, dy1] = shell.doorY;
  const openings: Opening[] = [];
  const ends: EndOpening[] = [];
  const holes: { s0: number; s1: number; y0: number; y1: number; kind: 'window' | 'door' }[] = [];
  const plan = lay.doors;
  for (const [s0, s1] of shell.windows(car)) holes.push({ s0, s1, y0: wy0, y1: wy1, kind: 'window' });
  for (const s of plan) for (const l of doorLights(shell, s)) holes.push({ ...l, kind: 'door' });
  for (const h of holes) for (const side of [1, -1] as const) {
    const za = Z(h.s0), zb = Z(h.s1);
    openings.push({ side, z0: Math.min(za, zb), z1: Math.max(za, zb), y0: h.y0, y1: h.y1 });
  }

  // --- the side walls: the liner from the floor to the cantrail, open at each window and each doorway ---
  const wallC = C(pal.wall), revealC = C(pal.trim);
  const sMin = Math.min(front, back), sMax = Math.max(front, back);
  const dw = shell.doorWidth;
  for (const side of [1, -1] as const) {
    const x = side * XI;
    const n: V3 = [-side, 0, 0];
    // the doorways are cut full height in the liner: the door's own leaf stands in the skin
    const cuts = [
      ...holes.filter((h) => h.kind === 'window').map((h) => ({ s0: h.s0, s1: h.s1, y0: h.y0, y1: h.y1 })),
      ...plan.map((s) => ({ s0: s - dw / 2, s1: s + dw / 2, y0: FL, y1: dy1 })),
    ];
    for (const r of wallCells(sMin, sMax, FL, YC, cuts)) quad(d.fit, [[x, r.y0, r.s0], [x, r.y1, r.s0], [x, r.y1, r.s1], [x, r.y0, r.s1]], n, wallC);
    // window reveals: four faces joining the liner to the skin round each window, facing into the opening
    for (const h of holes.filter((q) => q.kind === 'window')) {
      const xa = side * XI, xb = side * (SKIN - 0.002);
      quad(d.fit, [[xa, h.y0, h.s0], [xb, h.y0, h.s0], [xb, h.y0, h.s1], [xa, h.y0, h.s1]], [0, 1, 0], revealC);
      quad(d.fit, [[xa, h.y1, h.s0], [xb, h.y1, h.s0], [xb, h.y1, h.s1], [xa, h.y1, h.s1]], [0, -1, 0], revealC);
      quad(d.fit, [[xa, h.y0, h.s0], [xb, h.y0, h.s0], [xb, h.y1, h.s0], [xa, h.y1, h.s0]], [0, 0, 1], revealC);
      quad(d.fit, [[xa, h.y0, h.s1], [xb, h.y0, h.s1], [xb, h.y1, h.s1], [xa, h.y1, h.s1]], [0, 0, -1], revealC);
      // the sill, a little shelf the width of the reveal
      box(d.fit, xa, xa - side * 0.05, h.y0 - 0.02, h.y0, h.s0 - 0.02, h.s1 + 0.02, revealC, side > 0 ? '+x' : '-x');
    }
    // the doorways: the jambs and head of the lining, and the inner face of the leaves with their lights
    for (const s of plan) {
      const s0 = s - dw / 2, s1 = s + dw / 2;
      const xa = side * XI, xb = side * (SKIN - 0.025);
      quad(d.fit, [[xa, FL, s0], [xb, FL, s0], [xb, dy1, s0], [xa, dy1, s0]], [0, 0, 1], revealC);
      quad(d.fit, [[xa, FL, s1], [xb, FL, s1], [xb, dy1, s1], [xa, dy1, s1]], [0, 0, -1], revealC);
      quad(d.fit, [[xa, dy1, s0], [xb, dy1, s0], [xb, dy1, s1], [xa, dy1, s1]], [0, -1, 0], revealC);
      for (const r of wallCells(s0, s1, FL, dy1, doorLights(shell, s))) quad(d.fit, [[xb, r.y0, r.s0], [xb, r.y1, r.s0], [xb, r.y1, r.s1], [xb, r.y0, r.s1]], n, C(pal.door));
      // the open and close buttons beside the light, lit green
      box(d.screens, xb, xb - side * 0.02, 1.95, 2.03, s + 0.33, s + 0.41, C(0x1fb85a));
    }
  }
  // the glass: a pane in each opening, its outer face a few millimetres inside the old pane's (train.ts: the pane stood 12 mm proud of the skin)
  for (const o of openings) {
    const xo = o.side * (shell.half - 0.012), xi = o.side * (SKIN - 0.006);
    const pane = (soup: Soup, x: number, nn: V3): void => soup.quad([[x, o.y0, o.z0], [x, o.y1, o.z0], [x, o.y1, o.z1], [x, o.y0, o.z1]], [nn, nn, nn, nn], null);
    pane(d.glassOut, xo, [o.side, 0, 0]);
    pane(d.glassIn, xi, [-o.side, 0, 0]);
  }

  // --- floor and ceiling ---
  for (const z of lay.zones) {
    if (z.kind === 'cab') continue;
    const c = C(z.kind === 'vestibule' ? pal.vinyl : z.cls === 'first' ? pal.firstCarpet : pal.carpet);
    quad(d.fit, [[-XI, FL, z.s0], [XI, FL, z.s0], [XI, FL, z.s1], [-XI, FL, z.s1]], [0, 1, 0], c);
  }
  // the cove: from the cantrail up and in to the flat of the ceiling, three facets a side
  const cove: [number, number][] = [[XI, YC], [XI - 0.12, YC + 0.17], [XI - 0.36, YC + 0.27], [0.62, YT - 0.01], [0, YT]];
  const ceilC = C(pal.ceiling);
  for (const side of [1, -1] as const) {
    for (let i = 0; i + 1 < cove.length; i++) {
      const [x0, y0] = cove[i] as [number, number], [x1, y1] = cove[i + 1] as [number, number];
      // facing down and in: the segment's normal (-dy, dx), mirrored across for the left side
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nn: V3 = [(side * -(y1 - y0)) / len, (x1 - x0) / len, 0];
      quad(d.fit, [[side * x0, y0, sMin], [side * x1, y1, sMin], [side * x1, y1, sMax], [side * x0, y0, sMax]], nn, ceilC);
    }
  }
  // two lines of light along the ceiling's flat, the length of each saloon and vestibule
  for (const z of lay.zones) {
    if (z.kind === 'cab') continue;
    for (const side of [1, -1] as const) box(d.lamps, side * 0.5, side * 0.62, YT - 0.03, YT - 0.005, z.s0 + 0.25, z.s1 - 0.25, C(0xffffff), '+y');
  }

  // --- the cross walls ---
  const partC = C(pal.partition);
  // a wall across the car at s, both faces, with a doorway [x0, x1] up to `head` (none when head <= FL)
  const across = (s: number, x0: number, x1: number, head: number, c: THREE.Color): void => {
    const cells = wallCells(-XI, XI, FL, YT, head > FL ? [{ s0: x0, s1: x1, y0: FL, y1: head }] : []);
    for (const r of cells) for (const f of [1, -1] as const) {
      const ss = s + f * 0.03;
      quad(d.fit, [[r.s0, r.y0, ss], [r.s0, r.y1, ss], [r.s1, r.y1, ss], [r.s1, r.y0, ss]], [0, 0, f], c);
    }
    if (head > FL) {
      // the doorway's jambs and head
      for (const xx of [x0, x1]) quad(d.fit, [[xx, FL, s - 0.03], [xx, head, s - 0.03], [xx, head, s + 0.03], [xx, FL, s + 0.03]], [xx === x0 ? 1 : -1, 0, 0], revealC);
      quad(d.fit, [[x0, head, s - 0.03], [x1, head, s - 0.03], [x1, head, s + 0.03], [x0, head, s + 0.03]], [0, -1, 0], revealC);
    }
  };
  // the passage from a doorway at s out to the car's end, where the next car's half meets it: inner faces only (the bellows are train.ts's, outside);
  // the plate across the car's end (train.ts, the gangway's face) is cut open to match, within the last 0.7 m of the car, so a look through the
  // doorway goes on into the next car
  const passage = (s: number, hw: number, head: number): void => {
    const sEnd = s > (front + back) / 2 ? car.length : 0;
    const zEnd = Z(sEnd);
    const inward = zEnd > (car.start + car.end) / 2 ? -1 : 1;
    ends.push({ zMin: Math.min(zEnd - 0.1 * inward, zEnd + 0.7 * inward), zMax: Math.max(zEnd - 0.1 * inward, zEnd + 0.7 * inward), x0: -hw, x1: hw, y0: FL, y1: head });
    const gw = C(0x4b4f55);
    quad(d.fit, [[hw, FL, s], [hw, head, s], [hw, head, sEnd], [hw, FL, sEnd]], [-1, 0, 0], gw);
    quad(d.fit, [[-hw, FL, s], [-hw, head, s], [-hw, head, sEnd], [-hw, FL, sEnd]], [1, 0, 0], gw);
    quad(d.fit, [[-hw, head, s], [hw, head, s], [hw, head, sEnd], [-hw, head, sEnd]], [0, -1, 0], gw);
    quad(d.fit, [[-hw, FL, s], [hw, FL, s], [hw, FL, sEnd], [-hw, FL, sEnd]], [0, 1, 0], C(pal.vinyl));
  };
  for (const w of lay.walls) {
    if (w.kind === 'end') {
      // the gangway: a doorway 1.0 m wide and 1.95 m high, its door open (ASSUMED sizes; the bellows outside it are train.ts's)
      across(w.s, -0.5, 0.5, FL + 1.95, partC);
      passage(w.s, 0.5, FL + 1.95);
    } else if (w.kind === 'gangway') {
      // a walk-through unit's gangway: a wide portal, no door, the next car's saloon straight through it
      across(w.s, -shell.gangway.half, shell.gangway.half, shell.gangway.head, partC);
      passage(w.s, shell.gangway.half, shell.gangway.head);
    } else if (w.kind === 'cab') {
      // the cab's back wall: solid, with the cab door (a darker leaf, a small light, no handle drawn) and a panel over it
      across(w.s, 0, 0, FL, partC);
      const f = Math.sign((back - front) || 1);
      box(d.fit, -0.35, 0.35, FL, FL + 1.95, w.s + f * 0.03, w.s + f * 0.045, C(0x8c9196));
      box(d.fit, -0.12, 0.12, FL + 1.35, FL + 1.75, w.s + f * 0.045, w.s + f * 0.05, C(0x3a4048));
      pis(d, w.s + f * 0.05, f, FL, YT);
    } else {
      // a glazed partition: a sliding door 0.9 m wide in the middle (open), glass beside it above the dado
      across(w.s, -0.45, 0.45, FL + 1.95, partC);
      for (const [x0, x1] of [[-XI + 0.12, -0.55], [0.55, XI - 0.12]] as const) {
        for (const f of [1, -1] as const) {
          const ss = w.s + f * 0.032;
          quad(d.glassIn, [[x0, FL + 1.05, ss], [x0, FL + 1.9, ss], [x1, FL + 1.9, ss], [x1, FL + 1.05, ss]], [0, 0, f], null);
        }
      }
      if (w.kind === 'partition') for (const f of [1, -1] as const) pis(d, w.s + f * 0.035, f, FL, YT);
    }
  }
  return { openings, ends };
}

/** A passenger information panel hung over a doorway at s, its screen facing f. */
export function pis(d: InteriorDraw, s: number, f: number, FL: number, YT: number): void {
  // hung from the ceiling a little way out from the wall, its lower edge 1.77 m over the floor (ASSUMED), on two rods
  d.box(d.fit, -0.45, 0.45, FL + 1.77, FL + 1.92, s + f * 0.35, s + f * 0.41, col(0x1c1e22));
  for (const x of [-0.3, 0.3]) d.box(d.fit, x - 0.01, x + 0.01, FL + 1.92, YT, s + f * 0.37, s + f * 0.39, col(0x8a8f96));
  d.box(d.screens, -0.41, 0.41, FL + 1.79, FL + 1.9, s + f * 0.41, s + f * 0.415, col(0xf0a020));
}

/** A seat's colours: its upholstery (cushion, the face of its back), the headrest and the moulded shell behind them. */
export interface SeatColours { body: number; head: number; shell: number }

/** One seat: a pedestal, the cushion, a reclined back, the headrest and an armrest each side. `top` is the back's height over the cushion. */
export function drawSeat(d: InteriorDraw, FL: number, seat: Seat, c: SeatColours, top: number, arms = true): void {
  const { box, Z } = d;
  const soup = d.fit;
  const h = seatHalf(seat.cls) - 0.02;
  const f = seat.facing;
  const body = col(c.body);
  const head = col(c.head);
  const back = seat.s - f * 0.3;
  box(soup, seat.x - 0.12, seat.x + 0.12, FL, FL + 0.36, seat.s - 0.15, seat.s + 0.15, col(0x2a2b2e));
  box(soup, seat.x - h, seat.x + h, FL + 0.36, FL + 0.47, back + f * 0.05, seat.s + f * 0.22, body);
  // the back leans 12 degrees: a slab from the cushion's rear up to the headrest
  const lean = Math.tan((12 * Math.PI) / 180);
  const shell = col(c.shell);
  // the upholstered face of the back, the headrest proud of its top, and the moulded shell behind both (a little taller and wider)
  slab(h - 0.02, FL + 0.45, FL + 0.45 + top, back + f * 0.08, -f * lean, 0.05, body);
  slab(h - 0.05, FL + 0.45 + top, FL + 0.45 + top + 0.2, back + f * 0.08 - f * lean * top, -f * lean, 0.07, head);
  slab(h, FL + 0.38, FL + 0.45 + top + 0.24, back + f * 0.03 + f * lean * 0.07, -f * lean, 0.06, shell);
  if (arms) for (const side of [-1, 1]) box(soup, seat.x + side * h, seat.x + side * (h + 0.04), FL + 0.47, FL + 0.66, back + f * 0.08, seat.s + f * 0.18, col(0xb9bbbd));

  function slab(hw: number, y0: number, y1: number, s0: number, k: number, thick: number, cc: THREE.Color): void {
    // a box leaning along s: its foot at s0, its top at s0 + k (y1 - y0); `thick` deep behind the face
    const s1 = s0 + k * (y1 - y0);
    const pts = (s: number, y: number): [number, number] => [y, Z(s)];
    soup.bar(pts(s0 - f * thick / 2, y0), pts(s1 - f * thick / 2, y1), hw * 2, thick, cc, seat.x);
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
