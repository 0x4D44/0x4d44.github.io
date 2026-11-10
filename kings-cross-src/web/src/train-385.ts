// ScotRail Class 385 exterior, in the 2018-on ScotRail saltire "express" livery, from the reference photographs
// scotrail385-01..05 (2019-2024). Dimensions are core/train-385.ts's, each with its basis; every shape and colour
// placed here by eye from the photographs is ASSUMED: an illustrative exterior, not an engineering reconstruction.
import * as THREE from 'three';
import { SR385_FIGURES, SR385_KINDS, SR385_SPECS, bodySpan, sr385Layout } from '../../core/train-385.ts';
import type { Sr385Car, Sr385Kind, Sr385Layout } from '../../core/train-385.ts';
import { Soup, col, ellipse, plain, roundedRect, trainNight } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, ringAt, ringStations, xAtY, yAtX } from './train-nose.ts';
import type { NoseSpec, Section } from './train-nose.ts';
import { LENS, carSection, lensLook } from './train.ts';
import { buildBogie, buildPantograph, couplerHalf } from './train-parts.ts';
import type { CaptureFormation, EdinburghFleetRow } from './edinburgh-fleet.ts';

/** Livery colours, matched by eye to scotrail385-01..05 under daylight (ASSUMED, not paint references). */
export const SR385_COLOURS = {
  body: 0x24338a, roof: 0x55585d, roofKit: 0x8f9092, grille: 0x3a3c40, cabRoof: 0x2b2d33, underframe: 0x2c2e31,
  glass: 0x1b2530, frame: 0x16171a, door: 0xb7babd, doorSeal: 0x2a2c30, cantrail: 0xd8742c,
  saltireDot: 0xe7ddc3, lowerDot: 0x2f9be3, hood: 0x232428, yellow: 0xf1bf1c, headLens: 0xfff2d2, tailLens: 0xe2302c,
} as const;
const C = SR385_COLOURS;

const F = SR385_FIGURES;
const HALF = F.bodyWidth.value / 2;
const FLOOR = F.floorHeight.value;
const CROWN = F.crown.value;
const WALL_TOP = CROWN - 0.42;
const TIP = F.hoodFromCoupler.value;
/** Window band of the passenger saloons, metres over the rail (ASSUMED from scotrail385-03/-04). */
const WIN = { y0: 1.95, y1: 2.86, width: 1.3, small: 0.85, large: 1.85, r: 0.16 } as const;
const HOOD = { half: 0.53, y0: 0.98, y1: 3.62, depth: 1.25 } as const;

/**
 * The cab's side profile, metres from the hood face (ASSUMED from scotrail385-01, -02 and -05): a near-upright front up
 * to the screen's foot at about 2.0 m, a near-upright screen to about 3.25 m within a quarter metre, then the dark cab
 * roof carried forward at almost full height, so the hood's top stands about level with it.
 */
export const SR385_NOSE: NoseSpec = {
  length: 2.0, fillet: 0.16, filletLoss: 0.1, roundLen: 2.0, widest: 0.42, boxiness: 4.5,
  knots: [
    { s: 0, top: 2.0, ws: 0.9, bottom: 0.5 },
    { s: 0.24, top: 3.26, ws: 0.95, bottom: 0.5 },
    { s: 0.55, top: 3.47, ws: 0.98, bottom: 0.56 },
    { s: 1.05, top: 3.535, ws: 0.995, bottom: 0.8 },
    { s: 2.0, top: CROWN, ws: 1, bottom: FLOOR },
  ],
};
/** The windscreen on the loft, metres from the hood face; its glass's inner edge beside the hood, and its outer edge short of the cab's corner (blue between). */
const SCREEN = { s0: 0.02, s1: 0.22, xIn: HOOD.half + 0.06, xOut: HALF * 0.8 } as const;
/** The lamp housing at each front corner: inner edge across, foot and head over the rail (ASSUMED from scotrail385-01, -02). */
const LAMP = { xIn: HALF * 0.64, y0: 1.18, y1: 1.98, head: { y: 1.78, r: 0.085 }, tail: { y: 1.46, r: 0.075 } } as const;
/** The glow round a lit lens after dark: its radius by role, and how strong it is at full night (ASSUMED, for the dusk views). */
const HALO = { radius: { head: 0.34, tail: 0.24 }, strength: 0.75 } as const;

/**
 * The 385's body section: carSection's lower body and wall (DOOR_RELIEF 0.02 inside the half-width), with the roof one
 * elliptical arc from the wall's top across the whole half-width to the crown, so it reads rounded from the side and
 * from above (scotrail385-01, -04; ASSUMED shape, no section is published).
 */
function sr385Section(): Section {
  const base = carSection({ half: HALF, floor: FLOOR, crown: CROWN, wallTop: WALL_TOP });
  const W = base.width, ry = CROWN - WALL_TOP;
  const half = base.half.filter(([, y]) => y <= WALL_TOP + 1e-9);
  for (let j = 1; j <= 9; j++) {
    const phi = (j / 9) * (Math.PI / 2);
    half.push([j === 9 ? 0 : W * Math.cos(phi), WALL_TOP + ry * Math.sin(phi)]);
  }
  return { ...base, half };
}
const section = sr385Section();
const norm = normalised(section);
const egg = eggSection(norm, SR385_NOSE.widest, SR385_NOSE.boxiness);
/** The body's half-section at distance `u` behind the hood face (the full section from the nose's length back). */
const halfBehindFace = (u: number): [number, number][] => (u >= SR385_NOSE.length ? section.half.map(p => [p[0], p[1]] as [number, number]) : halfAt(section, norm, egg, ringAt(SR385_NOSE, Math.max(0, u))));

function carModel(car: Sr385Car, layout: Sr385Layout): THREE.Group {
  const group = new THREE.Group();
  group.name = `car-${car.index}`;
  group.userData = { ...car, kind: layout.spec.kind, allocation: 'model', geometryBasis: 'see core/train-385.ts figures; shapes ASSUMED from photographs', source: layout.spec.source };
  const [b0, b1] = bodySpan(car);
  const cab = car.cab;
  // s: metres from the car's cab-end pitch start (a cab car) or its front pitch start; z: along the train
  const zAt = (s: number): number => (cab === 'rear' ? car.end - s : car.start + s);
  const world = (p: V3): V3 => [p[0], p[1], zAt(p[2])];
  const out = cab === 'rear' ? 1 : -1; // the z direction a cab faces (out of the train)
  const shell = new Soup();
  const detail = new Soup();
  // body stations along s (from the car's own reference end)
  const sBody0 = cab ? TIP : b0 - car.start, sBody1 = cab ? car.length - (F.interCarInterval.value / 2) : b1 - car.start;
  const stations = cab ? [...ringStations(SR385_NOSE).map(u => TIP + u), sBody1] : [sBody0, sBody1];
  const loops = stations.map(s => loopFromHalf(cab ? halfBehindFace(s - TIP) : section.half).map(([x, y]): V3 => [x, y, s]));
  const paint = (y: number, s: number, x: number): number => {
    if (y < FLOOR + 0.04 && !(cab && s < TIP + 1.6)) return C.underframe;
    if (cab && s < TIP + 2.0 && y > 3.12) return C.cabRoof;
    if (y > WALL_TOP + 0.12) return C.roof;
    return C.body;
  };
  for (let i = 0; i + 1 < loops.length; i++) {
    const a = loops[i]!, b = loops[i + 1]!;
    for (let j = 0; j < a.length; j++) {
      const j1 = (j + 1) % a.length;
      const pts = [a[j]!, a[j1]!, b[j1]!, b[j]!] as [V3, V3, V3, V3];
      const y = pts.reduce((t, p) => t + p[1], 0) / 4, x = pts.reduce((t, p) => t + p[0], 0) / 4;
      const s = (stations[i]! + stations[i + 1]!) / 2;
      shell.face(pts.map(world) as [V3, V3, V3, V3], world([0, (FLOOR + CROWN) / 2, s]), col(paint(y, s, x)));
    }
  }
  // the end caps: the cab's lower front (blue; the yellow cheeks are laid on it below) and the inner body ends (dark: the gangway end wall)
  const capDir = (first: boolean): V3 => [0, 0, (first ? -1 : 1) * (cab === 'rear' ? -1 : 1)];
  shell.fan(loops[0]!.map(world), capDir(true), col(cab ? C.body : C.underframe));
  shell.fan(loops.at(-1)!.map(world), capDir(false), col(C.underframe));

  const box = (x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, colour: number, soup = detail): void => {
    const a = zAt(s0), b = zAt(s1);
    soup.box(x0, x1, y0, y1, Math.min(a, b), Math.max(a, b), col(colour));
  };
  const marker = (name: string, x: number, y: number, s: number, data: Record<string, unknown> = {}): void => {
    const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, zAt(s)); o.userData = data; group.add(o);
  };
  const sOf = (zTrain: number): number => (cab === 'rear' ? car.end - zTrain : zTrain - car.start);
  const sideX = section.width;
  /** A flat outline laid on the body side (both sides), `proud` metres off the skin. */
  const onSide = (outline: [number, number][], proud: number, colour: number, emit = 0): void => {
    detail.emit = emit;
    for (const side of [-1, 1]) {
      const x = side * (sideX + proud);
      detail.prismX(outline.map(([s, y]) => [zAt(s), y] as [number, number]), x - side * 0.006, x, col(colour));
    }
    detail.emit = 0;
  };
  const dots = (pts: { s: number; y: number; r: number }[], colour: number, proud = 0.004): void => {
    for (const side of [-1, 1]) for (const d of pts) {
      // on a cab car the body is still easing out of the nose's section just behind the cab: follow it
      const x = side * ((cab && d.s - TIP < SR385_NOSE.length ? xAtY(halfBehindFace(d.s - TIP), d.y) : sideX) + proud);
      detail.fan(ellipse(zAt(d.s), d.y, d.r, d.r, 8).map(([z, y]): V3 => [x, y, z]), [side, 0, 0], col(colour));
    }
  };

  // passenger doors: silver double-leaf plug doors, two tall narrow lights and a dark centre seal
  const doorW = F.doorWidth.value;
  for (const zd of car.doors) {
    const s = sOf(zd);
    onSide(roundedRect(s - doorW / 2 - 0.06, s + doorW / 2 + 0.06, FLOOR + 0.02, 3.08, 0.05, 2), 0.008, C.doorSeal);
    onSide(roundedRect(s - doorW / 2, s + doorW / 2, FLOOR + 0.05, 3.03, 0.04, 2), 0.014, C.door);
    onSide(roundedRect(s - 0.012, s + 0.012, FLOOR + 0.05, 3.03, 0.005, 1), 0.019, C.doorSeal);
    for (const k of [-1, 1]) onSide(roundedRect(s + k * 0.33 - 0.15, s + k * 0.33 + 0.15, 1.98, 2.86, 0.06, 2), 0.02, C.glass, 1);
    for (const side of [-1, 1]) marker('door', side * HALF, 2.08, s, { side: side < 0 ? 'left' : 'right', width: doorW });
    // the light-blue dot fields either side of the door, larger dots nearest it (scotrail385-03, -04, -05)
    const field: { s: number; y: number; r: number }[] = [];
    for (const dir of [-1, 1]) for (let i = 0; i < 16; i++) {
      const u = doorW / 2 + 0.45 + i * 0.16, sd = s + dir * u;
      if (sd < sBody0 + (cab ? 3.6 : 0.6) || sd > sBody1 - 0.6) continue;
      if (car.doors.some(o => sOf(o) !== s && Math.abs(sOf(o) - sd) < doorW / 2 + 0.3)) continue;
      const r = 0.062 * (1 - i / 19);
      // below the window frames' foot (scotrail385-04: the field runs under the windows, not into them)
      for (let row = 0; row < 6; row++) field.push({ s: sd + (row % 2) * 0.08 * dir, y: 1.16 + row * 0.12, r: r * (1 - Math.abs(row - 2.5) / 9) });
    }
    dots(field, C.lowerDot, 0.012);
  }

  // saloon windows, by span (scotrail385-04, -05): two small windows between a body end and its nearest door; one
  // window between the crew door and the first passenger door; large windows between the doors. A cab car's inner end
  // keeps an ASSUMED windowless toilet bay (Fig. 2 places both toilets there) and two small windows short of it.
  const doorS = car.doors.map(sOf).sort((p, q) => p - q);
  const spans: { a: number; b: number; width: number; count?: number }[] = [];
  const lo = cab ? F.crewDoorFromNose.value + 0.6 : sBody0 + 0.45; // clear of the crew door and its saltire dots
  const hi = cab ? sBody1 - 2.2 : sBody1 - 0.45;
  let from = lo;
  doorS.forEach((d, k) => {
    spans.push(k === 0 ? { a: from, b: d - doorW / 2 - 0.2, width: cab ? WIN.width : WIN.small, count: cab ? 1 : 2 } : { a: from, b: d - doorW / 2 - 0.2, width: WIN.large });
    from = d + doorW / 2 + 0.2;
  });
  spans.push({ a: from, b: hi, width: WIN.small, count: 2 });
  for (const { a, b, width, count } of spans) {
    const n = count ?? Math.floor((b - a + 0.5) / (width + 0.5));
    if (n < 1 || b - a < n * width + 0.2) continue;
    const pitch = (b - a) / n;
    for (let i = 0; i < n; i++) {
      const c = a + pitch * (i + 0.5);
      onSide(roundedRect(c - width / 2 - 0.04, c + width / 2 + 0.04, WIN.y0 - 0.04, WIN.y1 + 0.04, WIN.r, 3), 0.006, C.frame);
      onSide(roundedRect(c - width / 2, c + width / 2, WIN.y0, WIN.y1, WIN.r, 3), 0.01, C.glass, 1);
      for (const side of [-1, 1]) marker('window', side * HALF, (WIN.y0 + WIN.y1) / 2, c, { side: side < 0 ? 'left' : 'right', width });
    }
  }
  // the orange cantrail line along the top of each side, over the door tops (scotrail385-01, -04)
  const cantS0 = cab ? TIP + 2.0 : sBody0, cantS1 = sBody1;
  onSide([[cantS0, WALL_TOP - 0.04], [cantS1, WALL_TOP - 0.04], [cantS1, WALL_TOP - 0.015], [cantS0, WALL_TOP - 0.015]], 0.005, C.cantrail);

  const lampLenses: { role: 'head' | 'tail'; v0: number; v1: number }[] = [];
  const lampHalos: Record<'head' | 'tail', V3[]> = { head: [], tail: [] };
  if (cab) {
    const crew = F.crewDoorFromNose.value;
    /** A patch of the body side laid over the loft's own surface (both sides), `lift` metres off it: a grid fine enough that no part of the loft shows through. */
    const skin = (s0: number, s1: number, y0: number, y1: number, lift: number, colour: number, emit = 0, ds = 0.08): void => {
      detail.emit = emit;
      const ni = Math.max(2, Math.ceil((s1 - s0) / ds)), nj = Math.max(2, Math.ceil((y1 - y0) / Math.min(0.1, ds * 1.25)));
      for (const side of [-1, 1]) {
        const at = (i: number, j: number): V3 => {
          const s = s0 + (s1 - s0) * i / ni, y = y0 + (y1 - y0) * j / nj;
          return [side * (xAtY(halfBehindFace(s - TIP), y) + lift), y, zAt(s)];
        };
        for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
          detail.face([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)], [0, (y0 + y1) / 2, zAt((s0 + s1) / 2)], col(colour));
        }
      }
      detail.emit = 0;
    };
    // the crew door: a dark-edged outline with one tall narrow light (scotrail385-01, -05)
    onSide(roundedRect(crew - 0.36, crew + 0.36, FLOOR + 0.1, 3.05, 0.05, 2), 0.006, C.frame);
    onSide(roundedRect(crew - 0.33, crew + 0.33, FLOOR + 0.13, 3.02, 0.04, 2), 0.009, C.body);
    onSide(roundedRect(crew - 0.17, crew + 0.13, 2.05, 2.9, 0.04, 2), 0.016, C.glass);
    // the cream saltire dots: a chevron pointing at the cab, over the crew door and forward of it
    const chev = (y: number): number => crew - 0.95 + Math.abs(y - 2.25) * 1.05;
    const sal: { s: number; y: number; r: number }[] = [];
    for (let row = 0; row < 17; row++) {
      const y = 1.22 + row * 0.11;
      for (let c = 0; c < 9; c++) {
        const s = chev(y) + c * 0.11 + (row % 2) * 0.055;
        if (s > crew + 0.55 || s < TIP + 1.0) continue;
        sal.push({ s, y, r: 0.047 * (1 - c / 13) });
      }
    }
    dots(sal, C.saltireDot, 0.011); // over the crew door's skin, under its light
    // the windscreen: two near-upright panes either side of the hood in a black surround, blue between the pane and the cab's corner
    const pane = (xa: number, xb: number, s0: number, s1: number, lift: number, colour: number, name: string, emit = 0): void => {
      const soup = new Soup();
      soup.emit = emit;
      const at = (i: number, j: number): V3 => {
        const u = s0 + (s1 - s0) * i / 10, h = halfBehindFace(u);
        const x = Math.sign(xa) * (Math.abs(xa) + (Math.abs(xb) - Math.abs(xa)) * j / 8);
        return world([x, yAtX(h, Math.abs(x)) + lift, TIP + u]);
      };
      for (let i = 0; i < 10; i++) for (let j = 0; j < 8; j++) {
        const p = [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)] as [V3, V3, V3, V3];
        soup.face(p, [0, 0, zAt(TIP + 3)], col(colour));
      }
      const mesh = new THREE.Mesh(soup.build(), plain()); mesh.name = name; group.add(mesh);
    };
    for (const sx of [-1, 1]) {
      pane(sx * (SCREEN.xIn - 0.05), sx * (SCREEN.xOut + 0.06), 0, SCREEN.s1 + 0.07, 0.012, C.frame, 'windscreen-frame');
      pane(sx * SCREEN.xIn, sx * SCREEN.xOut, SCREEN.s0, SCREEN.s1, 0.024, C.glass, 'cab-glass');
      // one wiper parked along the pane's foot, rising toward the outer pillar (scotrail385-01, -02)
      pane(sx * (SCREEN.xIn + 0.1), sx * (SCREEN.xOut - 0.08), SCREEN.s0 + 0.008, SCREEN.s0 + 0.022, 0.034, C.frame, 'wiper');
    }
    // the surround carries on round the corner to meet the cab side window's, with no blue between them: from below the
    // lamp housings' top up to the screen frame's outer edge, on the side surface (scotrail385-01, -05)
    const frameEdge = Math.max(...[0, 0.1, 0.2, SCREEN.s1 + 0.07].map(u => yAtX(halfBehindFace(u), SCREEN.xOut + 0.06)));
    skin(TIP, TIP + 0.3, LAMP.y1 - 0.06, Math.min(3.12, frameEdge + 0.02), 0.016, C.frame, 0, 0.015);
    // the destination display behind the glass across the top of one pane: one level amber band on black, laid on the
    // glass at fixed heights so it reads as a horizontal strip, not a slant (scotrail385-01, -02; characters not drawn)
    const dsx = cab === 'rear' ? -1 : 1;
    /** The screen's depth (s from the nose) where its surface at |x| reaches height y: the face leans back, so y rises with s. */
    const sAtY = (x: number, y: number): number => {
      let lo: number = SCREEN.s0, hi: number = SCREEN.s1;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (yAtX(halfBehindFace(m), Math.abs(x)) < y) lo = m; else hi = m; }
      return (lo + hi) / 2;
    };
    // the band's top sits just under the glass's top edge where that edge is lowest (at the outer pillar)
    const bandTop = Math.min(yAtX(halfBehindFace(SCREEN.s1), SCREEN.xIn + 0.05), yAtX(halfBehindFace(SCREEN.s1), SCREEN.xOut - 0.05)) - 0.03;
    const band = (xa: number, xb: number, y0: number, y1: number, lift: number, colour: number, name: string, emit = 0): void => {
      const soup = new Soup();
      soup.emit = emit;
      const at = (i: number, j: number): V3 => {
        const x = xa + (xb - xa) * i / 8, y = y0 + (y1 - y0) * j;
        return world([x, y, TIP + sAtY(x, y) - lift]);
      };
      for (let i = 0; i < 8; i++) soup.face([at(i, 0), at(i + 1, 0), at(i + 1, 1), at(i, 1)], [0, 0, zAt(TIP + 3)], col(colour));
      const mesh = new THREE.Mesh(soup.build(), plain()); mesh.name = name; group.add(mesh);
    };
    band(dsx * (SCREEN.xIn + 0.06), dsx * (SCREEN.xOut - 0.06), bandTop - 0.13, bandTop, 0.03, C.frame, 'destination-surround');
    band(dsx * (SCREEN.xIn + 0.1), dsx * (SCREEN.xOut - 0.1), bandTop - 0.11, bandTop - 0.02, 0.036, 0xf09a2a, 'destination-display', 2);
    // the cab side window wraps round from the screen in the same black surround (scotrail385-01, -05), laid on the loft's own surface
    skin(TIP + 0.24, TIP + 1.0, 2.08, 3.12, 0.01, C.frame);
    skin(TIP + 0.3, TIP + 0.94, 2.14, 3.06, 0.018, C.glass, 1);
    // the gangway hood: a tall dark box standing proud at the centre, its top level with the cab roof, its door with the yellow warning panel (scotrail385-02, -05)
    box(-HOOD.half, HOOD.half, HOOD.y0, HOOD.y1, TIP, TIP + HOOD.depth, C.hood);
    box(-HOOD.half + 0.06, HOOD.half - 0.06, 1.12, 3.32, TIP - 0.012, TIP, C.frame);
    box(-HOOD.half + 0.08, HOOD.half - 0.08, 1.2, 1.98, TIP - 0.02, TIP - 0.012, C.yellow);
    for (const k of [-1, 0, 1]) box(k * 0.13 - 0.008, k * 0.13 + 0.008, 1.2, 1.98, TIP - 0.024, TIP - 0.019, C.frame);
    // the bellows down each side of the hood: close folds, alternately proud and set in (scotrail385-02, -05)
    for (const sx of [-1, 1]) for (let f = 0; f < 14; f++) {
      const proud = f % 2 ? 0.035 : 0.01;
      box(sx * HOOD.half - proud, sx * HOOD.half + proud, HOOD.y0 + 0.2, HOOD.y1 - 0.12, TIP + 0.1 + f * 0.075, TIP + 0.15 + f * 0.075, f % 2 ? C.hood : C.frame);
    }
    detail.fan(ellipse(0, 3.47, 0.075, 0.075, 12).map(([x, y]): V3 => [x, y, zAt(TIP - 0.03)]), [0, 0, out], col(0xcfd2d4)); // the marker lamp atop the hood
    box(-0.11, 0.11, 3.38, 3.56, TIP - 0.025, TIP, C.frame);
    marker('gangway-hood', 0, 2.3, TIP, { width: 2 * HOOD.half });
    // the yellow panels between the hood and each lamp housing, from the screen's foot down to the chin (scotrail385-01, -02, -05)
    for (const sx of [-1, 1]) {
      const xa = sx * (HOOD.half + 0.02), xb = sx * (LAMP.xIn - 0.02);
      box(Math.min(xa, xb), Math.max(xa, xb), 1.0, 1.99, TIP - 0.01, TIP + 0.02, C.yellow);
    }
    // the lamp housings: a dark recess at each front corner, angled round onto the cab side, the headlight over the tail lamp (scotrail385-01, -02)
    const faceHalf = xAtY(halfBehindFace(0), (LAMP.y0 + LAMP.y1) / 2);
    const lx = (LAMP.xIn + faceHalf) / 2;
    // in plan, flat across the lenses, then angled back to the corner and wrapped round onto the cab side (scotrail385-01:
    // the housing's outer face turns the corner); a prism from LAMP.y0 to LAMP.y1, each level following the body's width
    const plan = (y: number): [number, number][] => {
      const side = (u: number): number => xAtY(halfBehindFace(u), y);
      // the wrap follows the curved side closely (every 3 cm of depth), so the loft cannot bulge through between points
      const wrap = Array.from({ length: 9 }, (_, i): [number, number] => { const u = 0.06 + i * 0.03; return [side(u) + 0.03, u]; });
      return [[LAMP.xIn, -0.014], [lx + LAMP.head.r + 0.06, -0.014], ...wrap, [side(0.3) - 0.06, 0.3], [LAMP.xIn, 0.08]];
    };
    for (const sx of [-1, 1]) {
      // five levels, so the wrap follows the side's bulge between the housing's foot and top
      const ys = Array.from({ length: 5 }, (_, k) => LAMP.y0 + (LAMP.y1 - LAMP.y0) * k / 4), rings = ys.map(plan);
      const at = ([x, u]: [number, number], y: number): V3 => [sx * x, y, zAt(TIP + u)];
      const core: V3 = [sx * (LAMP.xIn + 0.15), (LAMP.y0 + LAMP.y1) / 2, zAt(TIP + 0.12)];
      for (let k = 0; k + 1 < ys.length; k++) {
        const lo = rings[k]!, hi = rings[k + 1]!;
        for (let i = 0; i < lo.length; i++) {
          const j = (i + 1) % lo.length;
          detail.face([at(lo[i]!, ys[k]!), at(lo[j]!, ys[k]!), at(hi[j]!, ys[k + 1]!), at(hi[i]!, ys[k + 1]!)], core, col(C.frame));
        }
      }
      detail.fan(rings.at(-1)!.map(p => at(p, LAMP.y1)), [0, 1, 0], col(C.frame));
      detail.fan(rings[0]!.map(p => at(p, LAMP.y0)), [0, -1, 0], col(C.frame));
    }
    for (const sx of [-1, 1]) {
      const x = sx * lx;
      for (const [r, y] of [[LAMP.head.r + 0.03, LAMP.head.y], [LAMP.tail.r + 0.03, LAMP.tail.y]] as const) {
        detail.fan(ellipse(x, y, r, r, 16).map(([xx, yy]): V3 => [xx, yy, zAt(TIP - 0.02)]), [0, 0, out], col(0x0b0c0e)); // the recessed rim
      }
      const mode = cab === 'front' ? 'head' : 'tail';
      for (const role of ['head', 'tail'] as const) {
        const spec = LAMP[role], look = lensLook(role, mode);
        detail.emit = look.glow;
        const v0 = detail.pos.length / 3;
        detail.fan(ellipse(x, spec.y, spec.r, spec.r, 16).map(([xx, yy]): V3 => [xx, yy, zAt(TIP - 0.026)]), [0, 0, out], col(look.hex));
        lampLenses.push({ role, v0, v1: detail.pos.length / 3 });
        detail.emit = 0;
        lampHalos[role].push([x, spec.y, zAt(TIP - 0.06)]);
      }
      marker('headlight', x, LAMP.head.y, TIP, { rear: cab === 'rear' });
      marker('tail-lamp', x, LAMP.tail.y, TIP, { rear: cab === 'rear' });
    }
    // the chin: one blue apron swept forward under the yellow panels from corner to corner, bulging at mid-height and
    // tucking back at its top, dropped to a low lip across the middle where the coupler's pocket is (scotrail385-02, -05)
    const chinHalf = xAtY(halfBehindFace(0), 0.75) - 0.01, pocketHalf = 0.32, chinBack = TIP + 0.3, reach0 = 0.22;
    const across = (a: number, b: number, n: number): number[] => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
    const xs = [...across(-chinHalf, -pocketHalf, 10), ...across(-pocketHalf, pocketHalf, 6), ...across(pocketHalf, chinHalf, 10)];
    // columns 11..17 are the lip under the pocket; 10 and 18 stand at the pocket's edges at full height, so the
    // zero-width steps between them and the lip close the pocket's sides
    const topOf = (k: number): number => (k >= 11 && k <= 17 ? 0.6 : 1.0);
    const reachOf = (x: number): number => { const t = Math.max(0, (Math.abs(x) - pocketHalf) / (chinHalf - pocketHalf)); return reach0 * Math.sqrt(Math.max(0, 1 - t ** 4)); };
    const rowF = [0, 0.3, 0.65, 1], rowG = [0.95, 1.05, 1.0, 0.72];
    const P = (k: number, r: number): V3 => { const top = topOf(k); return world([xs[k]!, 0.5 + (top - 0.5) * rowF[r]!, TIP - reachOf(xs[k]!) * rowG[r]!]); };
    const back = (k: number, y: number): V3 => world([xs[k]!, y, chinBack]);
    const inside = world([0, 0.7, chinBack + 0.5]);
    for (let k = 0; k + 1 < xs.length; k++) {
      // the two steps (10-11, 17-18) are the pocket's side walls: they face into the pocket, away from their own side
      const step = k === 10 || k === 17 ? world([xs[k]! * 3, 0.8, TIP]) : null;
      for (let r = 0; r + 1 < rowF.length; r++) detail.face([P(k, r), P(k + 1, r), P(k + 1, r + 1), P(k, r + 1)], step ?? inside, col(C.body));
      detail.face([P(k, 3), P(k + 1, 3), back(k + 1, topOf(k + 1)), back(k, topOf(k))], step ?? world([0, 0, chinBack]), col(C.body)); // top
      detail.face([P(k, 0), P(k + 1, 0), back(k + 1, 0.5), back(k, 0.5)], world([0, 2, chinBack]), col(C.body)); // underside
    }
    box(-pocketHalf, pocketHalf, 0.6, 1.0, TIP + 0.02, chinBack, C.frame); // the pocket's back
    // the coupler: a round Dellner head standing forward of the pocket, its face at the drawing's zero, the dark gathering
    // cone in it and the guide pin beside, on a shank; the electrical box over it (scotrail385-02)
    const cy = 0.8, cr = 0.15, ring = ellipse(0, cy, cr, cr, 16);
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i]!, [x1, y1] = ring[(i + 1) % ring.length]!;
      detail.face([world([x0, y0, 0.006]), world([x1, y1, 0.006]), world([x1, y1, 0.14]), world([x0, y0, 0.14])], world([0, cy, 0.07]), col(0x2b2d31));
    }
    detail.fan(ring.map(([x, y]): V3 => world([x, y, 0.006])), [0, 0, out], col(0x3a3d42)); // the face
    detail.fan(ellipse(0, cy, 0.075, 0.075, 12).map(([x, y]): V3 => world([x, y, 0.002])), [0, 0, out], col(0x0d0e10)); // the gathering cone's mouth
    box(0.075, 0.115, cy + 0.03, cy + 0.07, 0, 0.006, 0x8c8f93); // the guide pin
    box(-0.06, 0.06, cy - 0.06, cy + 0.06, 0.14, TIP + 0.05, 0x3c3f44); // the shank
    box(-0.22, 0.22, 0.95, 1.06, TIP - 0.12, TIP + 0.02, 0x9a9d9f); // the electrical box
    marker('coupler', 0, cy, 0, { nose: true });
  }

  // underframe: equipment cases between the bogies (shapes ASSUMED; the photographs show dark boxes, no detail)
  const bz = car.bogies.map(sOf).sort((p, q) => p - q);
  const u0 = bz[0]! + 1.7, u1 = bz[1]! - 1.7;
  box(-HALF * 0.86, HALF * 0.86, FLOOR - 0.12, FLOOR + 0.02, Math.max(sBody0, cab ? TIP + 1.6 : sBody0), sBody1, C.underframe);
  for (let s = u0; s + 1.4 < u1; s += 2.6) box(-0.9, 0.9, 0.55, FLOOR - 0.12, s, s + 1.9, 0x2f3134);
  // roof: the body's own rounded roof, with separate raised pods on it: a low fairing behind the cab dome and an
  // air-conditioning pod with two fan grilles on each car (scotrail385-01, -04, -05; positions and sizes ASSUMED)
  const pod =(a: number, b: number, w: number, h: number, fans: number): void => {
    const outline = roundedRect(a, b, CROWN - 0.22, CROWN + h, Math.min(0.14, h * 0.6), 3).map(([s, y]) => [zAt(s), y] as [number, number]);
    detail.prismX(outline, -w, w, col(C.roofKit)); // the walls and the +x side
    detail.prismX(outline, w, -w, col(C.roofKit), false); // prismX caps only its xOut side: this closes the -x side
    marker('roof-pod', 0, CROWN + h / 2, (a + b) / 2, { halfWidth: w, top: CROWN + h, s0: a, s1: b });
    // slatted grilles down each side of the pod
    for (const sx of [-1, 1]) for (let s = a + 0.35; s + 0.05 < b - 0.35; s += 0.12) box(sx * w - 0.006, sx * w + 0.006, CROWN - 0.06, CROWN + h - 0.05, s, s + 0.05, C.grille);
    // fan grilles on top: dark discs with a lighter hub
    for (let k = 0; k < fans; k++) {
      const s = a + (b - a) * (k + 0.5) / fans, z = zAt(s);
      detail.fan(ellipse(0, z, Math.min(0.5, w * 0.7), Math.min(0.5, w * 0.7), 18).map(([x, zz]): V3 => [x, CROWN + h + 0.006, zz]), [0, 1, 0], col(C.grille));
      detail.fan(ellipse(0, z, 0.1, 0.1, 10).map(([x, zz]): V3 => [x, CROWN + h + 0.01, zz]), [0, 1, 0], col(C.roofKit));
    }
  };
  const panto = car.pantograph ? car.pantograph.map(sOf).sort((p, q) => p - q) as [number, number] : null;
  if (cab) {
    pod(TIP + 1.75, TIP + 3.5, 0.82, 0.2, 0);
    pod(TIP + 4.1, TIP + 7.9, 0.72, F.roofCoverHeight.value, 2);
  } else {
    pod(sBody0 + 1.4, sBody0 + 5.2, 0.72, F.roofCoverHeight.value, 2);
  }
  if (panto) {
    box(-0.7, 0.7, CROWN - 0.06, CROWN + 0.05, panto[0] - 0.6, panto[1] + 0.6, C.roof);
    const p = buildPantograph(F.pantographLength.value, 0.3);
    p.position.set(0, CROWN + 0.05, (car.pantograph![0] + car.pantograph![1]) / 2); group.add(p);
  }
  // inner ends: the gangway bellows reaching to the middle of the 920 mm interval, so two cars' halves meet
  const ends: number[] = [];
  if (cab !== 'front' && !(cab === 'rear')) ends.push(sBody0);
  ends.push(sBody1);
  for (const s of ends) {
    const dir = s === sBody1 ? 1 : -1, reach = F.interCarInterval.value / 2;
    box(-0.6, 0.6, FLOOR + 0.05, 3.05, Math.min(s, s + dir * reach), Math.max(s, s + dir * reach), C.frame);
    marker('gangway', 0, 2.1, s);
    couplerHalf(detail, zAt(s), (dir * (cab === 'rear' ? -1 : 1)) as 1 | -1, reach, 0.86, 'plain');
  }
  for (const [index, z] of car.bogies.entries()) {
    const bogie = buildBogie({ radius: F.wheelDiameter.value / 2, wheelbase: F.wheelbase.value, track: 1.435, motor: car.motor[index]!, style: 'hitachi' });
    bogie.name = `bogie-${car.index}-${index}`; bogie.position.z = z; group.add(bogie);
  }
  const shellMesh = new THREE.Mesh(shell.build(), plain()); shellMesh.name = 'body-shell';
  const details = new THREE.Mesh(detail.build(), plain()); details.name = 'body-detail';
  // setTrainLampState (train.ts) switches these lenses; a coupled unit's inner cab is marked interior by buildEdinburghTrain
  if (cab) {
    details.userData.lamps = { end: cab, interior: false, lenses: lampLenses };
    // the halo round each lit lens after dark: children of the detail mesh, so setTrainLampState shows only the lit role's
    for (const role of ['head', 'tail'] as const) details.add(lampHalo(role, lampHalos[role], lensLook(role, cab === 'front' ? 'head' : 'tail').glow === 2));
  }
  group.add(shellMesh, details);
  return group;
}

let haloMaterial: THREE.MeshBasicMaterial | null = null;
/**
 * The soft glow round a lens: a disc in the lens's lit colour fading to black at its rim, drawn additively, so black adds
 * nothing. Its strength follows trainNight (0 by day, so it does not show; up to HALO.strength after dark).
 */
function lampHalo(role: 'head' | 'tail', centres: V3[], lit: boolean): THREE.Mesh {
  const pos: number[] = [], rgb: number[] = [];
  const c = col(role === 'head' ? LENS.headOn : LENS.tailOn), r = HALO.radius[role], n = 32;
  // rings out from the centre with the strength falling off roughly as a gaussian, so the rim is black and no edge shows
  const rings: [number, number][] = [[0, 1], [0.2, 0.8], [0.42, 0.42], [0.66, 0.14], [1, 0]];
  for (const [x, y, z] of centres) {
    const p = (k: number, i: number): [number, number, number] => {
      const a = (i / n) * Math.PI * 2, rr = r * rings[k]![0];
      return [x + rr * Math.cos(a), y + rr * Math.sin(a), z];
    };
    const w = (k: number): number[] => { const g = rings[k]![1]; return [c.r * g, c.g * g, c.b * g]; };
    for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < n; i++) {
      pos.push(...p(k, i), ...p(k + 1, i), ...p(k + 1, i + 1)); rgb.push(...w(k), ...w(k + 1), ...w(k + 1));
      if (k > 0) { pos.push(...p(k, i), ...p(k + 1, i + 1), ...p(k, i + 1)); rgb.push(...w(k), ...w(k + 1), ...w(k)); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  if (!haloMaterial) {
    haloMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: HALO.strength, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    // scaled by the shared night uniform in the shader, so every clone of a train follows it with no per-mesh hook
    haloMaterial.onBeforeCompile = (shader): void => {
      shader.uniforms.uNight = trainNight;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;')
        .replace('#include <opaque_fragment>', 'outgoingLight *= uNight;\n#include <opaque_fragment>');
    };
  }
  const mesh = new THREE.Mesh(geometry, haloMaterial);
  mesh.name = 'lamp-halo'; mesh.userData.role = role; mesh.visible = lit; mesh.renderOrder = 2;
  return mesh;
}

/** One ScotRail Class 385 unit, front nose at z = 0, extending to +z. */
export function build385(kind: Sr385Kind): THREE.Group {
  const layout = sr385Layout(kind);
  const root = new THREE.Group();
  root.name = `train-${kind}`;
  root.userData = { kind, length: layout.length, cars: layout.cars.length, family: 'at200', operator: 'ScotRail', classes: layout.spec.classes, source: layout.spec.source,
    assumptions: 'ASSUMED width, roof and floor heights, bogie positions, wheel and wheelbase, door width and crew door, nose shape, livery placement and colours, underframe and roof equipment; see core/train-385.ts' };
  for (const car of layout.cars) root.add(carModel(car, layout));
  return root;
}

/** Release this builder's geometry, keeping the shared bogie geometry and plain() material alive. */
export function dispose385(root: THREE.Group): void {
  const owned = new Set<THREE.BufferGeometry>();
  root.traverse(o => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') owned.add(o.geometry); });
  for (const g of owned) g.dispose();
}

/** The capture tool's description of a 385 kind (tools/train-capture.mjs describeFormation's shape). */
export function formation385(kind: Sr385Kind): CaptureFormation {
  const layout = sr385Layout(kind), roofTop = CROWN + F.roofCoverHeight.value;
  return {
    family: 'at200', classes: layout.spec.classes, classNote: null, length: layout.length,
    half: HALF, crown: CROWN, coverHeight: F.roofCoverHeight.value, roofTop, doorWidth: F.doorWidth.value,
    cars: layout.cars.map(c => ({ index: c.index, type: c.type, length: c.length, start: c.start, end: c.end, cab: c.cab, bogies: [...c.bogies], motor: [...c.motor], pantograph: c.pantograph ? [...c.pantograph] : null, doors: [...c.doors] })),
    dimensions: {
      lengthM: { value: layout.length, basis: 'published', figures: ['SR385_FIGURES.drivingCarPitch', 'SR385_FIGURES.intermediateCarPitch'] },
      widthM: { value: 2 * HALF, basis: F.bodyWidth.basis, figures: ['SR385_FIGURES.bodyWidth'], figureM: F.bodyWidth.value },
      roofTopM: { value: roofTop, basis: 'assumed', figures: ['SR385_FIGURES.crown', 'SR385_FIGURES.roofCoverHeight'], figureM: roofTop },
    },
  };
}

/** The Waverley table's rows for the 385 (web/src/edinburgh-fleet.ts). */
export const SR385_ROWS: readonly EdinburghFleetRow[] = SR385_KINDS.map((kind): EdinburghFleetRow => ({
  kind, operator: 'SR', operatorName: 'ScotRail', classes: ['385'], cars: SR385_SPECS[kind].cars.length,
  layout: () => sr385Layout(kind), build: () => build385(kind), dispose: dispose385, formation: () => formation385(kind),
}));
