// The small parts of a train: bogies (wheels with flanges, axles, brake discs, side frames, springs,
// traction motors), the pantograph, the couplers and the gangway bellows. Each is built once, merged into
// one mesh, and shared; nothing here is instanced per wheel.
//
// A bogie is drawn at two levels of detail (THREE.LOD): the full bogie near the camera, and beyond
// BOGIE_LOD_DISTANCE a bare one (wheels, side frames and a transom) of about a tenth of the triangles.
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
  /** A driven bogie of a diesel-hydraulic unit has a final-drive gearbox on each axle and a cardan shaft, not traction motors. */
  diesel?: boolean;
}

const bogieCache = new Map<string, THREE.BufferGeometry>();
const farCache = new Map<string, THREE.BufferGeometry>();

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
  if (motor && spec.diesel) {
    // a diesel-hydraulic unit's driven bogie: a final-drive gearbox on each axle, joined by a cardan shaft along the bogie
    for (const az of [-wb / 2, wb / 2]) {
      soup.box(-0.3, 0.3, r - 0.2, r + 0.2, az - 0.22, az + 0.22, motorC);
      cylinder(soup, 'x', [0, r, az], 0.15, 0.7, 12, dark);
    }
    cylinder(soup, 'z', [0, r + 0.08, 0], 0.045, wb - 0.44, 8, dark, false);
  } else if (motor) {
    // a traction motor across the bogie behind each axle, with its gear case on the axle
    for (const az of [-wb / 2, wb / 2]) {
      const dz = az < 0 ? 0.52 : -0.52;
      cylinder(soup, 'x', [0, r + 0.08, az + dz], 0.2, 0.62, 14, motorC);
      soup.box(0.2, 0.46, r - 0.15, r + 0.2, az - 0.2, az + 0.2, dark);
    }
  }
  return soup;
}

/**
 * The bogie seen from far off: eight-sided wheels, a side frame on each side and one transom, and nothing else (no
 * flanges, axles, discs, springs or motors). The wheels stand where the full bogie's do, so the swap does not move
 * the silhouette; about a tenth of the triangles.
 */
export function bogieFarSoup(spec: Pick<BogieSpec, 'radius' | 'wheelbase' | 'track'>): Soup {
  const { radius: r, wheelbase: wb, track } = spec;
  const soup = new Soup();
  const half = track / 2;
  const steel = col(0x70757d);
  const frame = col(0x30343a);
  for (const az of [-wb / 2, wb / 2]) {
    for (const sx of [-1, 1]) cylinder(soup, 'x', [sx * half, r, az], r, WHEEL_WIDTH, 8, steel);
  }
  const zEnd = wb / 2 + 0.12;
  for (const sx of [-1, 1]) soup.box(sx > 0 ? half + 0.1 : -half - 0.25, sx > 0 ? half + 0.25 : -half - 0.1, r + 0.08, r + 0.34, -zEnd, zEnd, frame);
  soup.box(-half - 0.22, half + 0.22, r + 0.2, r + 0.36, -0.6, 0.6, frame);
  return soup;
}

/** Beyond this distance from the camera (metres) a bogie is drawn bare. `globalThis.__kxBogieLodDistance` overrides it at build time (Infinity: never), for measuring the saving on one build. */
export const BOGIE_LOD_DISTANCE = 150;
function lodDistance(): number {
  const o = (globalThis as { __kxBogieLodDistance?: unknown }).__kxBogieLodDistance;
  return typeof o === 'number' && o >= 0 ? o : BOGIE_LOD_DISTANCE;
}

/**
 * One bogie: four `wheel` markers (the source of the wheel geometry) and a THREE.LOD (`bogie-lod`) of two shared meshes,
 * both named `bogie-mesh` (so a caller that spares the shared bogie geometry when it disposes a train spares both): the
 * full bogie (`userData.lod` 'near') and, beyond BOGIE_LOD_DISTANCE, the bare one ('far'). The renderer picks the level.
 */
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
  const key = `${radius}/${wb}/${track}/${spec.motor}/${spec.diesel === true}`;
  let geometry = bogieCache.get(key);
  if (!geometry) {
    geometry = bogieSoup(spec).build();
    bogieCache.set(key, geometry);
  }
  const farKey = `${radius}/${wb}/${track}`;
  let farGeometry = farCache.get(farKey);
  if (!farGeometry) {
    farGeometry = bogieFarSoup(spec).build();
    farCache.set(farKey, farGeometry);
  }
  const near = new THREE.Mesh(geometry, plain());
  near.name = 'bogie-mesh';
  near.userData = { lod: 'near' };
  const far = new THREE.Mesh(farGeometry, plain());
  far.name = 'bogie-mesh';
  far.userData = { lod: 'far' };
  far.visible = false;
  const lod = new THREE.LOD();
  lod.name = 'bogie-lod';
  lod.addLevel(near, 0);
  lod.addLevel(far, lodDistance());
  group.add(lod);
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

/** The coupler heads the model draws: a plain barrel and head (between cars), a Dellner 12 (Electrostar, Desiro City) and a Scharfenberg (Class 180). */
export type CouplerStyle = 'plain' | 'dellner' | 'scharfenberg';

/**
 * A coupler half: a barrel from the car's end wall (or the nose face) toward the middle of the gap, ending in a head.
 * `z0` is the wall, `dir` points from it into the gap (+1 or -1), `reach` how far it comes out; the head's front is
 * exactly `reach` out, so two halves that meet in the middle of a gap touch.
 *
 * 'plain' is a barrel, a head and two air hoses. 'dellner' is the Dellner 12's squat casing with a dark coupling face,
 * the electrical contact box over it and an air cock each side; 'scharfenberg' a taller casing with a conical nose and
 * its air connections under it. Both are drawn from the general look of the type (no drawing was found): ASSUMED.
 */
export function couplerHalf(soup: Soup, z0: number, dir: 1 | -1, reach: number, y: number, style: CouplerStyle = 'plain'): void {
  const steel = col(0x4d5157);
  const dark = col(0x26292d);
  const hose = col(0x1a1b1e);
  if (style === 'plain') {
    const lo = Math.min(z0, z0 + dir * reach);
    const hi = Math.max(z0, z0 + dir * reach);
    // the barrel
    soup.box(-0.07, 0.07, y - 0.07, y + 0.07, lo, hi, steel);
    // the head, a little wider, at the far end
    const hz0 = dir > 0 ? hi - 0.1 : lo;
    soup.box(-0.13, 0.13, y - 0.11, y + 0.11, hz0, hz0 + 0.1, dark);
    // air hoses, hanging either side of the barrel
    for (const sx of [-1, 1]) soup.box(sx * 0.17 - 0.015, sx * 0.17 + 0.015, y - 0.2, y - 0.02, dir > 0 ? hi - 0.18 : lo + 0.12, dir > 0 ? hi - 0.12 : lo + 0.18, hose);
    return;
  }
  // u is the distance out from the wall; zr the z range of a slab from u0 to u1
  const zr = (u0: number, u1: number): [number, number] => (dir > 0 ? [z0 + u0, z0 + u1] : [z0 - u1, z0 - u0]);
  const casing = col(0x5b6068);
  const face = col(0x17191c);
  const pin = col(0x9aa0a8);
  const headLen = style === 'dellner' ? 0.2 : 0.3;
  const [b0, b1] = zr(0, reach - headLen);
  soup.box(-0.1, 0.1, y - 0.1, y + 0.1, b0, b1, steel);
  if (style === 'dellner') {
    // the casing, its dark coupling face (a hair proud of the casing, so the head's front is at `reach`), the contact box over it and an air cock each side
    const [c0, c1] = zr(reach - headLen, reach - 0.012);
    soup.box(-0.21, 0.21, y - 0.15, y + 0.13, c0, c1, casing);
    const [f0, f1] = zr(reach - 0.012, reach);
    soup.box(-0.17, 0.17, y - 0.11, y + 0.09, f0, f1, face);
    const [e0, e1] = zr(reach - 0.17, reach - 0.05);
    soup.box(-0.1, 0.1, y + 0.13, y + 0.2, e0, e1, dark);
    for (const sx of [-1, 1]) {
      const [h0, h1] = zr(reach - 0.14, reach - 0.08);
      soup.box(sx * 0.23 - 0.02, sx * 0.23 + 0.02, y - 0.1, y - 0.02, h0, h1, pin);
      soup.box(sx * 0.13 - 0.015, sx * 0.13 + 0.015, y - 0.3, y - 0.15, h0, h1, hose);
    }
    return;
  }
  // Scharfenberg: the casing, a conical nose (the narrow end out) and a pair of air connections under the head
  const [c0, c1] = zr(reach - headLen, reach - 0.12);
  soup.box(-0.19, 0.19, y - 0.2, y + 0.18, c0, c1, casing);
  const cone = new THREE.CylinderGeometry(dir > 0 ? 0.09 : 0.15, dir > 0 ? 0.15 : 0.09, 0.12, 14, 1, false);
  soup.geometry(cone, new THREE.Matrix4().makeTranslation(0, y, z0 + dir * (reach - 0.06)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), face);
  cone.dispose();
  for (const sx of [-1, 1]) {
    const [h0, h1] = zr(reach - 0.24, reach - 0.14);
    soup.box(sx * 0.1 - 0.025, sx * 0.1 + 0.025, y - 0.3, y - 0.2, h0, h1, hose);
    const [p0, p1] = zr(reach - 0.2, reach - 0.12);
    soup.box(sx * 0.14 - 0.02, sx * 0.14 + 0.02, y + 0.18, y + 0.24, p0, p1, pin);
  }
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
