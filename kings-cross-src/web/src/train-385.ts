// ScotRail Class 385 exterior, in the 2018-on ScotRail saltire "express" livery, from the reference photographs
// scotrail385-01..05 (2019-2024). Dimensions are core/train-385.ts's, each with its basis; every shape and colour
// placed here by eye from the photographs is ASSUMED: an illustrative exterior, not an engineering reconstruction.
import * as THREE from 'three';
import { SR385_FIGURES, SR385_KINDS, SR385_SPECS, bodySpan, sr385Layout } from '../../core/train-385.ts';
import type { Sr385Car, Sr385Kind, Sr385Layout } from '../../core/train-385.ts';
import { Soup, col, ellipse, plain, roundedRect } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, ringAt, ringStations, xAtY, yAtX } from './train-nose.ts';
import type { NoseSpec } from './train-nose.ts';
import { carSection } from './train.ts';
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
const WIN = { y0: 1.95, y1: 2.86, width: 1.5, r: 0.16 } as const;
const HOOD = { half: 0.53, y0: 0.98, y1: 3.62, depth: 1.25 } as const;

/**
 * The cab's side profile, metres from the hood face (ASSUMED from scotrail385-01, -02 and -05): a near-upright lower
 * front up to the screen's foot at about 2.05 m, the screen raked back to about 3.25 m, then the cab roof easing up
 * into the body's crown about 2.4 m behind the face.
 */
export const SR385_NOSE: NoseSpec = {
  length: 2.4, fillet: 0.16, filletLoss: 0.1, roundLen: 2.4, widest: 0.42, boxiness: 4.5,
  knots: [
    { s: 0, top: 2.04, ws: 0.86, bottom: 0.52 },
    { s: 0.16, top: 2.12, ws: 0.92, bottom: 0.5 },
    { s: 0.62, top: 3.2, ws: 0.975, bottom: 0.58 },
    { s: 1.25, top: 3.46, ws: 0.997, bottom: 0.85 },
    { s: 2.4, top: CROWN, ws: 1, bottom: FLOOR },
  ],
};
/** The windscreen on the loft, metres from the hood face, and its glass's inner edge beside the hood. */
const SCREEN = { s0: 0.17, s1: 0.66, xIn: HOOD.half + 0.05 } as const;

const section = carSection({ half: HALF, floor: FLOOR, crown: CROWN, wallTop: WALL_TOP });
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
      for (let row = 0; row < 6; row++) field.push({ s: sd + (row % 2) * 0.08 * dir, y: 1.3 + row * 0.13, r: r * (1 - Math.abs(row - 2.5) / 9) });
    }
    dots(field, C.lowerDot);
  }

  // saloon windows: between and beyond the doors, kept off the doors, the cab and a toilet bay at the inner end of a cab car
  const doorS = car.doors.map(sOf).sort((p, q) => p - q);
  const spans: [number, number][] = [];
  const lo = cab ? Math.max(TIP + 3.5, F.crewDoorFromNose.value + 0.75) : sBody0 + 0.45;
  const hi = cab ? sBody1 - 2.2 : sBody1 - 0.45; // ASSUMED windowless toilet bay at a cab car's inner end (Fig. 2 places both toilets there)
  let from = lo;
  for (const d of doorS) { spans.push([from, d - doorW / 2 - 0.2]); from = d + doorW / 2 + 0.2; }
  spans.push([from, hi]);
  for (const [a, b] of spans) {
    const n = Math.floor((b - a + 0.45) / (WIN.width + 0.45));
    if (n < 1) continue;
    const pitch = (b - a) / n;
    for (let i = 0; i < n; i++) {
      const c = a + pitch * (i + 0.5);
      onSide(roundedRect(c - WIN.width / 2 - 0.04, c + WIN.width / 2 + 0.04, WIN.y0 - 0.04, WIN.y1 + 0.04, WIN.r, 3), 0.006, C.frame);
      onSide(roundedRect(c - WIN.width / 2, c + WIN.width / 2, WIN.y0, WIN.y1, WIN.r, 3), 0.01, C.glass, 1);
    }
  }
  // the orange cantrail line along the top of each side, over the door tops (scotrail385-01, -04)
  const cantS0 = cab ? TIP + 2.0 : sBody0, cantS1 = sBody1;
  onSide([[cantS0, WALL_TOP - 0.04], [cantS1, WALL_TOP - 0.04], [cantS1, WALL_TOP - 0.015], [cantS0, WALL_TOP - 0.015]], 0.005, C.cantrail);

  if (cab) {
    const crew = F.crewDoorFromNose.value;
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
        if (s > crew + 0.55) continue;
        sal.push({ s, y, r: 0.047 * (1 - c / 13) });
      }
    }
    dots(sal, C.saltireDot, 0.011); // over the crew door's skin, under its light
    // cab side window, behind the screen
    for (const side of [-1, 1]) {
      const s0 = TIP + 0.78, s1 = TIP + 1.5;
      const pts: [number, number][] = [[s0, 2.15], [s1, 2.15], [s1, 2.98], [s0 + 0.22, 2.98]];
      const at = ([s, y]: [number, number]): V3 => [side * (xAtY(halfBehindFace(s - TIP), y) + 0.008), y, zAt(s)];
      detail.fan(pts.map(at), [side, 0, 0], col(C.glass));
    }
    // the windscreen: two panes either side of the hood, on the loft, with a black frame under each
    const pane = (xa: number, xb: number, s0: number, s1: number, lift: number, colour: number, name: string): void => {
      const soup = new Soup();
      const at = (i: number, j: number): V3 => {
        const u = s0 + (s1 - s0) * i / 10, h = halfBehindFace(u);
        const half = Math.max(...h.map(p => p[0]));
        const x = Math.sign(xa) * Math.min(Math.abs(xa) + (Math.abs(xb) - Math.abs(xa)) * j / 8, half * 0.93);
        return world([x, yAtX(h, Math.abs(x)) + lift, TIP + u]);
      };
      for (let i = 0; i < 10; i++) for (let j = 0; j < 8; j++) {
        const p = [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)] as [V3, V3, V3, V3];
        soup.face(p, [0, 0, zAt(TIP + 3)], col(colour));
      }
      const mesh = new THREE.Mesh(soup.build(), plain()); mesh.name = name; group.add(mesh);
    };
    for (const sx of [-1, 1]) {
      pane(sx * (SCREEN.xIn - 0.04), sx * HALF, SCREEN.s0 - 0.05, SCREEN.s1 + 0.06, 0.01, C.frame, 'windscreen-frame');
      pane(sx * SCREEN.xIn, sx * HALF, SCREEN.s0, SCREEN.s1, 0.02, C.glass, 'cab-glass');
    }
    // the gangway hood: a tall dark box standing proud at the centre, its door with the yellow warning panel (scotrail385-02, -05)
    box(-HOOD.half, HOOD.half, HOOD.y0, HOOD.y1, TIP, TIP + HOOD.depth, C.hood);
    box(-HOOD.half + 0.06, HOOD.half - 0.06, 1.12, 3.32, TIP - 0.012, TIP, C.frame);
    box(-HOOD.half + 0.08, HOOD.half - 0.08, 1.2, 1.98, TIP - 0.02, TIP - 0.012, C.yellow);
    for (const k of [-1, 0, 1]) box(k * 0.13 - 0.008, k * 0.13 + 0.008, 1.2, 1.98, TIP - 0.024, TIP - 0.019, C.frame);
    for (const sx of [-1, 1]) for (let f = 0; f < 6; f++) box(sx * HOOD.half - 0.02, sx * HOOD.half + 0.02, HOOD.y0 + 0.25, HOOD.y1 - 0.25, TIP + 0.12 + f * 0.17, TIP + 0.18 + f * 0.17, C.frame);
    box(-0.09, 0.09, 3.38, 3.52, TIP - 0.03, TIP, 0xcfd2d4); // the marker lamp atop the hood
    marker('gangway-hood', 0, 2.3, TIP, { width: 2 * HOOD.half });
    // the yellow cheek panels under each screen, on the front face
    for (const sx of [-1, 1]) {
      const xa = sx * (HOOD.half + 0.02), xb = sx * HALF * 0.74;
      box(Math.min(xa, xb), Math.max(xa, xb), 1.3, 1.93, TIP - 0.01, TIP + 0.02, C.yellow);
    }
    // lamp pods at the screen's outer foot: a black pod, the headlight over the marker/tail lamp (scotrail385-01, -02)
    for (const sx of [-1, 1]) {
      const x = sx * HALF * 0.74;
      box(x - 0.13, x + 0.13, 1.42, 1.98, TIP - 0.02, TIP + 0.3, C.frame);
      detail.emit = 2;
      detail.fan(ellipse(x, 1.86, 0.075, 0.075, 14).map(([xx, y]): V3 => [xx, y, zAt(TIP - 0.026)]), [0, 0, out], col(C.headLens));
      detail.fan(ellipse(x, 1.6, 0.07, 0.07, 14).map(([xx, y]): V3 => [xx, y, zAt(TIP - 0.026)]), [0, 0, out], col(cab === 'rear' ? C.tailLens : C.headLens));
      detail.emit = 0;
      marker('headlight', x, 1.86, TIP, { rear: cab === 'rear' });
      marker('tail-lamp', x, 1.6, TIP, { rear: cab === 'rear' });
    }
    // the coupler: a Dellner head with its face at the drawing's zero, under the hood
    couplerHalf(detail, zAt(TIP), (cab === 'rear' ? 1 : -1) as 1 | -1, TIP, 0.86, 'dellner');
    marker('coupler', 0, 0.86, 0, { nose: true });
    // the obstacle deflector under the front
    box(-HALF * 0.72, HALF * 0.72, 0.28, 0.6, TIP + 0.1, TIP + 0.5, C.underframe);
  }

  // underframe: equipment cases between the bogies (shapes ASSUMED; the photographs show dark boxes, no detail)
  const bz = car.bogies.map(sOf).sort((p, q) => p - q);
  const u0 = bz[0]! + 1.7, u1 = bz[1]! - 1.7;
  box(-HALF * 0.86, HALF * 0.86, FLOOR - 0.12, FLOOR + 0.02, Math.max(sBody0, cab ? TIP + 1.6 : sBody0), sBody1, C.underframe);
  for (let s = u0; s + 1.4 < u1; s += 2.6) box(-0.9, 0.9, 0.55, FLOOR - 0.12, s, s + 1.9, 0x2f3134);
  // roof: long equipment covers with dark grilles, broken over the pantograph on the PTS (scotrail385-01, -04, -05)
  const r0 = cab ? TIP + 2.6 : sBody0 + 0.8, r1 = sBody1 - 0.8;
  const panto = car.pantograph ? car.pantograph.map(sOf).sort((p, q) => p - q) as [number, number] : null;
  const roofRuns: [number, number][] = panto ? [[r0, panto[0] - 0.8], [panto[1] + 0.8, r1]] : [[r0, r1]];
  for (const [a, b] of roofRuns) {
    if (b - a < 1) continue;
    box(-0.82, 0.82, CROWN - 0.06, CROWN + F.roofCoverHeight.value, a, b, C.roofKit);
    for (let s = a + 0.5; s + 1.2 < b; s += 2.4) box(-0.55, 0.55, CROWN + F.roofCoverHeight.value, CROWN + F.roofCoverHeight.value + 0.01, s, s + 1.2, C.grille);
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
  group.add(shellMesh, details);
  return group;
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
