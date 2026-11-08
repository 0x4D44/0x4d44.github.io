// The small parts of a train: bogies (wheels with flanges, axles, brake discs, side frames, springs,
// traction motors), the pantograph, the coupler and the gangway bellows. Each is built once, merged into
// one mesh, and shared; nothing here is instanced per wheel.
//
// Local frame of a bogie: centred on the rail head (y = 0), x across, z along the train.
import * as THREE from 'three';
import { col, plain, Soup } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { unit } from './train-geom.ts';

/** Wheel tread width. Assumed. */
export const WHEEL_WIDTH = 0.13;
/** Flange height below the tread, and width. A UK profile's flange stands about 28 mm proud of the tread. Typical value, not a figure from a source. */
export const FLANGE_HEIGHT = 0.028;
export const FLANGE_WIDTH = 0.028;
/** Brake discs: radius and thickness, two on each axle. ASSUMED. */
export const DISC_RADIUS = 0.29;
export const DISC_THICKNESS = 0.024;

export interface BogieSpec {
  /** Wheel radius, metres. */
  radius: number;
  /** Axle spacing. */
  wheelbase: number;
  /** Gauge: the rails are this far apart (centre to centre of the treads). */
  track: number;
  /** Carries traction motors (a motor bogie) or only brake discs (a trailer bogie). */
  motor: boolean;
}

const bogieCache = new Map<string, THREE.BufferGeometry>();

/** A cylinder along x, y or z, as a transform for `Soup.geometry`. */
function along(axis: 'x' | 'y' | 'z', x: number, y: number, z: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeTranslation(x, y, z);
  if (axis === 'y') return m;
  return m.multiply(axis === 'x' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2) : new THREE.Matrix4().makeRotationX(Math.PI / 2));
}

function cylinder(soup: Soup, axis: 'x' | 'y' | 'z', c: V3, radius: number, length: number, segs: number, colour: THREE.Color, caps = true): void {
  const g = new THREE.CylinderGeometry(radius, radius, length, segs, 1, !caps);
  soup.geometry(g, along(axis, c[0], c[1], c[2]), colour);
  g.dispose();
}

export function bogieSoup(spec: BogieSpec): Soup {
  const { radius: r, wheelbase: wb, track, motor } = spec;
  const soup = new Soup();
  const steel = col(0x70757d);
  const dark = col(0x2a2d32);
  const motorC = col(0x3d4147);
  const hub = col(0x9aa0a8);
  const disc = col(0x555a61);
  const spring = col(0x7a6a3a);
  const rubber = col(0x1d1f23);
  const frame = col(0x30343a);
  const half = track / 2;
  for (const az of [-wb / 2, wb / 2]) {
    for (const sx of [-1, 1]) {
      // 20 segments: a multiple of four puts a vertex at the bottom, so the tread touches y = 0 exactly. The tread and the flange are
      // open tubes (the web and the flange close their ends); only the outer face of the web and the hub cap show.
      cylinder(soup, 'x', [sx * half, r, az], r, WHEEL_WIDTH, 20, steel, false);
      // the flange: a ring on the inner side of the tread, standing FLANGE_HEIGHT proud of it (so it dips that far below the rail head, into the gap)
      cylinder(soup, 'x', [sx * (half - WHEEL_WIDTH / 2 - FLANGE_WIDTH / 2), r, az], r + FLANGE_HEIGHT, FLANGE_WIDTH, 20, steel);
      // the web, dished a little on the outer face, and the hub cap
      cylinder(soup, 'x', [sx * (half + WHEEL_WIDTH / 2 + 0.006), r, az], r - 0.05, 0.012, 16, dark);
      cylinder(soup, 'x', [sx * (half + WHEEL_WIDTH / 2 + 0.02), r, az], 0.12, 0.03, 8, hub);
      // outboard axle box, with the primary spring on it
      soup.box(sx > 0 ? half + 0.09 : -half - 0.25, sx > 0 ? half + 0.25 : -half - 0.09, r - 0.1, r + 0.11, az - 0.11, az + 0.11, dark);
      cylinder(soup, 'y', [sx * (half + 0.17), r + 0.2, az], 0.06, 0.2, 10, spring, false);
    }
    // the axle, and a brake disc each side of the middle
    cylinder(soup, 'x', [0, r, az], 0.065, track, 10, dark, false);
    for (const sx of [-1, 1]) cylinder(soup, 'x', [sx * 0.3, r, az], DISC_RADIUS, DISC_THICKNESS, 16, disc);
  }
  // side frames: a bar over each axle box and across, higher in the middle
  const zEnd = wb / 2 + 0.12;
  for (const sx of [-1, 1]) {
    const x = sx * (half + 0.17);
    soup.bar([r + 0.12, -zEnd], [r + 0.28, -0.7], 0.1, 0.1, frame, x);
    soup.bar([r + 0.28, -0.7], [r + 0.3, 0.7], 0.1, 0.12, frame, x);
    soup.bar([r + 0.3, 0.7], [r + 0.12, zEnd], 0.1, 0.1, frame, x);
  }
  // two transoms joining the side frames, and the bolster between them with the brake cylinders
  for (const z of [-0.55, 0.55]) soup.box(-half - 0.22, half + 0.22, r + 0.2, r + 0.34, z - 0.09, z + 0.09, frame);
  soup.box(-0.34, 0.34, r + 0.18, r + 0.36, -0.46, 0.46, dark);
  for (const sx of [-1, 1]) cylinder(soup, 'z', [sx * 0.5, r + 0.3, 0.0], 0.07, 0.4, 8, motorC);
  // air springs under the body
  for (const sx of [-1, 1]) for (const z of [-0.45, 0.45]) {
    const g = new THREE.CylinderGeometry(0.14, 0.15, 0.2, 8, 1, true);
    soup.geometry(g, new THREE.Matrix4().makeTranslation(sx * 0.92, 0.82, z), rubber);
    g.dispose();
  }
  if (motor) {
    // a traction motor across the bogie behind each axle, with its gear case on the axle
    for (const az of [-wb / 2, wb / 2]) {
      const dz = az < 0 ? 0.52 : -0.52;
      cylinder(soup, 'x', [0, r + 0.08, az + dz], 0.2, 0.62, 14, motorC);
      soup.box(0.2, 0.46, r - 0.15, r + 0.2, az - 0.2, az + 0.2, dark);
    }
  }
  return soup;
}

/** One bogie: four `wheel` markers (the source of the wheel geometry) and the shared mesh `bogie-mesh`. */
export function buildBogie(spec: BogieSpec): THREE.Group {
  const group = new THREE.Group();
  const { radius, wheelbase: wb, track } = spec;
  for (const az of [-wb / 2, wb / 2]) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Object3D();
      w.name = 'wheel';
      w.position.set((sx * track) / 2, radius, az);
      w.userData = { radius, width: WHEEL_WIDTH, flange: FLANGE_HEIGHT };
      group.add(w);
    }
  }
  const key = `${radius}/${wb}/${track}/${spec.motor}`;
  let geometry = bogieCache.get(key);
  if (!geometry) {
    geometry = bogieSoup(spec).build();
    bogieCache.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, plain());
  mesh.name = 'bogie-mesh';
  group.add(mesh);
  return group;
}

/** A single-arm pantograph, folded: base frame on four insulators, the arms lying down, the collector head on top. */
export function buildPantograph(len: number, top: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pantograph';
  const soup = new Soup();
  const frame = col(0x2d3035);
  const head = col(0x8a8f96);
  for (const sx of [-1, 1]) {
    soup.box(sx * 0.55 - 0.06, sx * 0.55 + 0.06, 0.08, 0.14, -len / 2, len / 2, frame);
    for (const z of [-len / 2 + 0.15, len / 2 - 0.15]) soup.box(sx * 0.55 - 0.05, sx * 0.55 + 0.05, -0.02, 0.08, z - 0.05, z + 0.05, col(0xd8d2c4));
  }
  soup.box(-0.55, 0.55, 0.08, 0.14, -0.06, 0.06, frame);
  // lower arm up from the rear of the base to the knee, upper arm folded back to the head
  const knee = top - 0.045;
  // the arm is 0.07 m thick, so its upper face stands 0.035 above its centre line: start it low enough that no part of it passes `top`
  soup.bar([Math.min(0.14, top - 0.035), 0.9], [knee, -0.1], 0.1, 0.07, frame);
  soup.bar([knee, -0.1], [top - 0.1, 0.72], 0.08, 0.06, frame);
  soup.box(-0.8, 0.8, top - 0.07, top, 0.64, 0.82, head);
  const mesh = new THREE.Mesh(soup.build(), plain());
  mesh.name = 'pantograph-mesh';
  group.add(mesh);
  return group;
}

/**
 * A coupler half: a barrel from the car's end wall toward the middle of the gap, ending in a head with two
 * air hoses. `z0` is the end wall, `dir` points from it into the gap (+1 or -1), `reach` how far it comes out.
 */
export function couplerHalf(soup: Soup, z0: number, dir: 1 | -1, reach: number, y: number): void {
  const steel = col(0x4d5157);
  const dark = col(0x26292d);
  const hose = col(0x1a1b1e);
  const lo = Math.min(z0, z0 + dir * reach);
  const hi = Math.max(z0, z0 + dir * reach);
  // the barrel
  soup.box(-0.07, 0.07, y - 0.07, y + 0.07, lo, hi, steel);
  // the head, a little wider, at the far end
  const hz0 = dir > 0 ? hi - 0.1 : lo;
  soup.box(-0.13, 0.13, y - 0.11, y + 0.11, hz0, hz0 + 0.1, dark);
  // air hoses, hanging either side of the barrel
  for (const sx of [-1, 1]) soup.box(sx * 0.17 - 0.015, sx * 0.17 + 0.015, y - 0.2, y - 0.02, dir > 0 ? hi - 0.18 : lo + 0.12, dir > 0 ? hi - 0.12 : lo + 0.18, hose);
}

/**
 * Rings of a rounded-rectangle tube along z, for a gangway bellows: a concertina of `folds` pleats between
 * z0 and z1 (pleats shrink the ring by `depth`), width x height, centred at y. Returns the rings as points.
 */
export function bellowsRings(outline: (scale: number) => [number, number][], z0: number, z1: number, folds: number, depth: number): { z: number; pts: [number, number][] }[] {
  const rings: { z: number; pts: [number, number][] }[] = [];
  const n = folds * 2 + 1;
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2);
    // pleats: out at the ends and at every second step, in between
    const inward = i % 2 === 1 && i > 0 && i < n * 2;
    rings.push({ z: z0 + (z1 - z0) * t, pts: outline(inward ? 1 - depth : 1) });
  }
  return rings;
}

/** Normal of a ring of 2D points `pts` (x, y), pointing outward from the ring's centroid, as 3D. */
export function ringNormal(p: [number, number], centre: [number, number]): V3 {
  return unit([p[0] - centre[0], p[1] - centre[1], 0]);
}
