// The small parts of a train: bogies (wheels with flanges, axles, brake discs, side frames, springs,
// dampers, traction motors), the pantograph, the couplers and the gangway bellows. Each is built once, merged into
// one mesh, and shared; nothing here is instanced per wheel.
//
// A bogie is drawn at two levels of detail (THREE.LOD): the full bogie near the camera, and beyond
// BOGIE_LOD_DISTANCE a bare one (round wheels, a side frame each side and a transom) of about a tenth of the triangles.
//
// Local frame of a bogie: centred on the rail head (y = 0), x across, z along the train.
//
// What the bogies are drawn from. The reference photographs are private review photos and are not shipped; the file
// names below are the ones in the review folder (refs/<kind>/...):
//   lner-gwr800-bogie-detail-2017.jpg   a Hitachi AT300 leading bogie, outer side, hardware only: OUTSIDE axle boxes with
//       round end caps, a big coil primary spring on each, a deep side beam that is thick in the middle and sweeps up over
//       the axle boxes, a long yaw damper low across the middle with a clevis at each end, a yellow step plate under it, wheels
//       with a dark web and a lighter rim.
//   tl700_03_gatwick_bogie_28898326470.jpg   a Siemens SF7000 (Class 700) bogie: INSIDE frame (the wheels stand outside it),
//       plain light-grey wheel webs with a hub cover and a rust-brown rim band, the frame, a grey yaw damper and the air spring
//       in a cluster between the wheels.
//   tl700_02_gatwick_side_28563922734.jpg   the same bogie from the platform: the same plain wheels, the cluster between them.
//   GC180-01-180-101-Kings-Cross-8077814883-.jpg   the Class 180's leading bogie from the cab end: a boxy dusty frame, axle
//       boxes with a spring pot above, a long gold-ended damper low across the middle.
//   gn387_03_387123_cambridge.jpg   the Electrostar's cab bogie, about a hundred pixels across: a dark frame with a damper
//       across the middle and nothing that tells it from the generic outside-frame bogie; so it is drawn as that.
// What no photograph shows is not drawn: no pipework, no cable runs, no bolt patterns, and nothing inside the frames.
import * as THREE from 'three';
import { add, col, plain, Soup, unit } from './train-geom.ts';
import type { V3 } from './train-geom.ts';

/** Wheel tread width. Assumed. */
export const WHEEL_WIDTH = 0.13;
/** Flange height below the tread, and width. A UK profile's flange stands about 28 mm proud of the tread. Typical value, not a figure from a source. */
export const FLANGE_HEIGHT = 0.028;
export const FLANGE_WIDTH = 0.028;
/** Brake discs: radius and thickness, two on each axle. ASSUMED. */
export const DISC_RADIUS = 0.29;
export const DISC_THICKNESS = 0.024;
/** Sides to the tread, the flange and the face of a wheel, and to the far level's wheel. 40 reads round at three metres (a wheel is about 250 px across there). */
export const WHEEL_SEGMENTS = 40;
export const FAR_WHEEL_SEGMENTS = 12;
/** No part of a bogie is further from the centre line than this, and none reaches above this, under the body floor (the lowest floor is 0.98 m: the electric units' and the Class 180's). */
export const BOGIE_HALF_WIDTH = 1.15;
export const BOGIE_TOP = 0.95;

/** Whose bogie is drawn: the Hitachi AT300 (Class 800/801), the Bombardier Electrostar (Class 387), the Siemens SF7000 (Class 700/717) or the Alstom Coradia 1000's (Class 180). */
export type BogieStyle = 'hitachi' | 'electrostar' | 'siemens' | 'alstom';

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
  /** Which maker's bogie to draw. Absent: the Alstom's for a diesel unit, the Hitachi's otherwise. */
  style?: BogieStyle;
}

/** The style a spec draws: its own, or the one its other flags imply. */
export function bogieStyle(spec: Pick<BogieSpec, 'diesel' | 'style'>): BogieStyle {
  return spec.style ?? (spec.diesel === true ? 'alstom' : 'hitachi');
}

const bogieCache = new Map<string, THREE.BufferGeometry>();
const farCache = new Map<string, THREE.BufferGeometry>();

// --- the toolbox: solids of revolution, extruded outlines ---------------------------------------------------------------

type P2 = readonly [number, number];
const circles = new Map<number, { c: number[]; s: number[] }>();
/** cos and sin of the n angles round a ring, exact at every quarter turn (so a ring of 4k sides has a vertex exactly at the top, the bottom and both ends). Angle 0 is up (+e1). */
function circle(n: number): { c: number[]; s: number[] } {
  let t = circles.get(n);
  if (!t) {
    const c: number[] = [];
    const s: number[] = [];
    for (let i = 0; i < n; i++) {
      const q = (4 * i) / n;
      if (Number.isInteger(q)) {
        c.push([1, 0, -1, 0][q] as number);
        s.push([0, 1, 0, -1][q] as number);
      } else {
        c.push(Math.cos((2 * Math.PI * i) / n));
        s.push(Math.sin((2 * Math.PI * i) / n));
      }
    }
    t = { c, s };
    circles.set(n, t);
  }
  return t;
}

/** An axis for `lathe`: the point at u = 0, the direction u grows in, and the two directions the angle sweeps (up, then along z for an axis along x). */
interface Axis {
  o: V3;
  a: V3;
  e1: V3;
  e2: V3;
}
/** u runs along x (positive away from the centre line when `dir` is the side), the ring starts upward. */
const axisX = (x: number, y: number, z: number, dir: 1 | -1 = 1): Axis => ({ o: [x, y, z], a: [dir, 0, 0], e1: [0, 1, 0], e2: [0, 0, 1] });
const axisY = (x: number, y: number, z: number): Axis => ({ o: [x, y, z], a: [0, 1, 0], e1: [0, 0, 1], e2: [1, 0, 0] });
const axisZ = (x: number, y: number, z: number): Axis => ({ o: [x, y, z], a: [0, 0, 1], e1: [0, 1, 0], e2: [1, 0, 0] });

/**
 * A solid of revolution as one piece: `prof` is a polyline of (u, radius) pairs, `n` sides round. The surface faces to the LEFT of the
 * direction of travel along the profile (u to the right, radius up): a closed solid is walked from its first end cap up to its radius, along
 * its side and down its last end cap. A segment that starts or ends on the axis becomes a fan. Normals are smooth round the ring and flat along
 * the profile, so a tread reads round and a rim keeps its edge. `colours` is one colour or one per segment.
 * A profile point may carry its own ring size as a third number (the default is `n`): a ring may have half the sides of the one next to it,
 * and the band between them is three triangles for every two of the bigger ring's, so a wheel's web needs no more sides than it shows.
 */
function lathe(soup: Soup, ax: Axis, prof: readonly (readonly [number, number] | readonly [number, number, number])[], n: number, colours: THREE.Color | readonly THREE.Color[]): void {
  const at = (u: number, rho: number, i: number, sides: number): V3 => {
    const { c, s } = circle(sides);
    const ci = c[i % sides] as number;
    const si = s[i % sides] as number;
    return [
      ax.o[0] + ax.a[0] * u + rho * (ci * ax.e1[0] + si * ax.e2[0]),
      ax.o[1] + ax.a[1] * u + rho * (ci * ax.e1[1] + si * ax.e2[1]),
      ax.o[2] + ax.a[2] * u + rho * (ci * ax.e1[2] + si * ax.e2[2]),
    ];
  };
  for (let k = 0; k + 1 < prof.length; k++) {
    const [u0, r0] = prof[k] as readonly [number, number];
    const [u1, r1] = prof[k + 1] as readonly [number, number];
    if (r0 === 0 && r1 === 0) continue;
    const n0 = (prof[k] as readonly number[])[2] ?? n;
    const n1 = (prof[k + 1] as readonly number[])[2] ?? n;
    const colour = colours instanceof THREE.Color ? colours : (colours[Math.min(k, colours.length - 1)] as THREE.Color);
    const len = Math.hypot(u1 - u0, r1 - r0);
    const nu = -(r1 - r0) / len;
    const nr = (u1 - u0) / len;
    const nrm = (i: number, sides: number): V3 => {
      const { c, s } = circle(sides);
      const ci = c[i % sides] as number;
      const si = s[i % sides] as number;
      return [
        ax.a[0] * nu + nr * (ci * ax.e1[0] + si * ax.e2[0]),
        ax.a[1] * nu + nr * (ci * ax.e1[1] + si * ax.e2[1]),
        ax.a[2] * nu + nr * (ci * ax.e1[2] + si * ax.e2[2]),
      ];
    };
    if (r0 === 0) {
      for (let i = 0; i < n1; i++) {
        const na = nrm(i, n1);
        const nb = nrm(i + 1, n1);
        soup.tri([at(u0, 0, i, n1), at(u1, r1, i, n1), at(u1, r1, i + 1, n1)], [unit(add(na, nb)), na, nb], colour);
      }
    } else if (r1 === 0) {
      for (let i = 0; i < n0; i++) {
        const na = nrm(i, n0);
        const nb = nrm(i + 1, n0);
        soup.tri([at(u0, r0, i, n0), at(u0, r0, i + 1, n0), at(u1, 0, i, n0)], [na, nb, unit(add(na, nb))], colour);
      }
    } else if (n0 === n1) {
      for (let i = 0; i < n0; i++) {
        const na = nrm(i, n0);
        const nb = nrm(i + 1, n0);
        soup.tri([at(u0, r0, i, n0), at(u1, r1, i, n0), at(u1, r1, i + 1, n0)], [na, na, nb], colour);
        soup.tri([at(u0, r0, i, n0), at(u1, r1, i + 1, n0), at(u0, r0, i + 1, n0)], [na, nb, nb], colour);
      }
    } else if (n0 === 2 * n1 || n1 === 2 * n0) {
      // the band between a ring and one of half its sides: for each side of the small ring, the three triangles that join it to the big ring's two
      const big = n0 > n1 ? { u: u0, r: r0, sides: n0 } : { u: u1, r: r1, sides: n1 };
      const small = n0 > n1 ? { u: u1, r: r1, sides: n1 } : { u: u0, r: r0, sides: n0 };
      for (let j = 0; j < small.sides; j++) {
        const a0 = at(big.u, big.r, 2 * j, big.sides);
        const a1 = at(big.u, big.r, 2 * j + 1, big.sides);
        const a2 = at(big.u, big.r, 2 * j + 2, big.sides);
        const b0 = at(small.u, small.r, j, small.sides);
        const b1 = at(small.u, small.r, j + 1, small.sides);
        const na0 = nrm(2 * j, big.sides);
        const na1 = nrm(2 * j + 1, big.sides);
        const na2 = nrm(2 * j + 2, big.sides);
        const nb0 = nrm(j, small.sides);
        const nb1 = nrm(j + 1, small.sides);
        soup.tri([a0, a1, b0], [na0, na1, nb0], colour);
        soup.tri([a1, a2, b1], [na1, na2, nb1], colour);
        soup.tri([a1, b1, b0], [na1, nb1, nb0], colour);
      }
    } else {
      throw new Error(`lathe: a ring of ${n0} sides cannot join one of ${n1}`);
    }
  }
}

/** A closed cylinder (or an open tube) of radius `rho` from u0 to u1. */
function tube(soup: Soup, ax: Axis, u0: number, u1: number, rho: number, n: number, colour: THREE.Color, caps: '' | 'start' | 'end' | 'both' = ''): void {
  const prof: P2[] = [];
  if (caps === 'start' || caps === 'both') prof.push([u0, 0]);
  prof.push([u0, rho], [u1, rho]);
  if (caps === 'end' || caps === 'both') prof.push([u1, 0]);
  lathe(soup, ax, prof, n, colour);
}

const cross2 = (a: P2, b: P2, c: P2): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area2 = (p: readonly P2[]): number => p.reduce((s, a, i) => s + cross2([0, 0], a, p[(i + 1) % p.length] as P2), 0);

/** Triangles (as index triples, counter-clockwise) of a simple polygon given counter-clockwise, by ear clipping. */
function earClip(poly: readonly P2[]): [number, number, number][] {
  const idx = poly.map((_, i) => i);
  const out: [number, number, number][] = [];
  const inside = (p: P2, a: P2, b: P2, c: P2): boolean => cross2(a, b, p) > 1e-9 && cross2(b, c, p) > 1e-9 && cross2(c, a, p) > 1e-9;
  while (idx.length > 3) {
    let clipped = false;
    for (let k = 0; k < idx.length && !clipped; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length] as number;
      const i1 = idx[k] as number;
      const i2 = idx[(k + 1) % idx.length] as number;
      const a = poly[i0] as P2;
      const b = poly[i1] as P2;
      const c = poly[i2] as P2;
      if (cross2(a, b, c) <= 1e-12) continue;
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inside(poly[j] as P2, a, b, c))) continue;
      out.push([i0, i1, i2]);
      idx.splice(k, 1);
      clipped = true;
    }
    if (!clipped) throw new Error('bogie outline is not a simple polygon');
  }
  out.push([idx[0] as number, idx[1] as number, idx[2] as number]);
  return out;
}

/**
 * A plate: the outline (z, y) extruded along x from `x0` to `x1` (x0 < x1): a cap facing +x, a cap facing -x and the rim between them. The
 * face looking away from the centre line (+x for `side` 1, -x for -1) is `outer`'s colour, as is the rim, the face looking in is `inner`'s.
 * The outline may be concave but must not cross itself; either winding.
 */
function plate(soup: Soup, outline: readonly P2[], x0: number, x1: number, outer: THREE.Color, inner: THREE.Color = outer, side: 1 | -1 = 1): void {
  const poly = area2(outline) < 0 ? [...outline].reverse() : [...outline];
  const v = (p: P2, x: number): V3 => [x, p[1], p[0]];
  for (const [i, j, k] of earClip(poly)) {
    const a = poly[i] as P2;
    const b = poly[j] as P2;
    const d = poly[k] as P2;
    soup.tri([v(a, x1), v(b, x1), v(d, x1)], [[1, 0, 0], [1, 0, 0], [1, 0, 0]], side > 0 ? outer : inner);
    soup.tri([v(a, x0), v(b, x0), v(d, x0)], [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0]], side > 0 ? inner : outer);
  }
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as P2;
    const b = poly[(i + 1) % poly.length] as P2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nrm: V3 = [0, -(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    soup.quad([v(a, x0), v(a, x1), v(b, x1), v(b, x0)], [nrm, nrm, nrm, nrm], outer);
  }
}

/** The x range of a part standing `a` to `b` out from the centre line on side `sx`, lowest first. */
const xs = (sx: number, a: number, b: number): [number, number] => (sx > 0 ? [a, b] : [-b, -a]);
/** Append every triangle of `from` to `into`. */
function append(into: Soup, from: Soup): void {
  for (let i = 0; i < from.pos.length; i++) into.pos.push(from.pos[i] as number);
  for (let i = 0; i < from.nrm.length; i++) into.nrm.push(from.nrm[i] as number);
  for (let i = 0; i < from.clr.length; i++) into.clr.push(from.clr[i] as number);
}

// --- colours ------------------------------------------------------------------------------------------------------------

interface Palette {
  frame: THREE.Color;
  box: THREE.Color;
  cap: THREE.Color;
  spring: THREE.Color;
  coil: THREE.Color;
  tread: THREE.Color;
  rim: THREE.Color;
  web: THREE.Color;
  hub: THREE.Color;
  inner: THREE.Color;
  disc: THREE.Color;
  discRim: THREE.Color;
  damper: THREE.Color;
  clevis: THREE.Color;
  motor: THREE.Color;
  gear: THREE.Color;
  axle: THREE.Color;
  rubber: THREE.Color;
  accent: THREE.Color;
}
const PALETTES: Record<BogieStyle, Palette> = {
  // the AT300's: near-black frame and boxes with a lighter steel cap and rim (lner-gwr800-bogie-detail-2017.jpg), a yellow step
  hitachi: {
    frame: col(0x474c54), box: col(0x363a41), cap: col(0x4f545b), spring: col(0x5f646b), coil: col(0x2b2d31),
    tread: col(0x9a9fa6), rim: col(0x6b7078), web: col(0x484c53), hub: col(0x80858c), inner: col(0x2f3238),
    disc: col(0x70757c), discRim: col(0x868b92), damper: col(0x1d1f23), clevis: col(0x5c6168),
    motor: col(0x4a4e55), gear: col(0x3b3f45), axle: col(0x34373c), rubber: col(0x1f2125), accent: col(0xd9b11a),
  },
  // the Electrostar's: the same outside-frame kit in a slightly bluer dark grey (no photograph of its bogie is usable)
  electrostar: {
    frame: col(0x494e57), box: col(0x383c44), cap: col(0x51565f), spring: col(0x60656d), coil: col(0x2c2e33),
    tread: col(0x9a9fa6), rim: col(0x6d727a), web: col(0x4a4f57), hub: col(0x80858c), inner: col(0x30343a),
    disc: col(0x70757c), discRim: col(0x868b92), damper: col(0x1d1f23), clevis: col(0x5e636b),
    motor: col(0x4a4e55), gear: col(0x3b3f45), axle: col(0x34373c), rubber: col(0x1f2125), accent: col(0xd9b11a),
  },
  // the SF7000's: light-grey frame, webs and covers, a rust-brown rim, black rubber (tl700_03_gatwick_bogie_28898326470.jpg)
  siemens: {
    frame: col(0x8d939a), box: col(0x7d838a), cap: col(0xa4a9af), spring: col(0x5d6168), coil: col(0x2f3135),
    tread: col(0x8f949b), rim: col(0x9b5b36), web: col(0xa7acb2), hub: col(0xb3b8be), inner: col(0x6f747a),
    disc: col(0x62676e), discRim: col(0x7d8289), damper: col(0x959ba1), clevis: col(0x7a8087),
    motor: col(0x4d5259), gear: col(0x73787f), axle: col(0x575b61), rubber: col(0x25272a), accent: col(0xb0262c),
  },
  // the Class 180's: dusty brown-grey frame, gold-ended dampers (GC180-01-180-101-Kings-Cross-8077814883-.jpg)
  alstom: {
    frame: col(0x66625a), box: col(0x55514a), cap: col(0x7d796f), spring: col(0x5f5b53), coil: col(0x32302c),
    tread: col(0x9a9fa6), rim: col(0x6d7077), web: col(0x45474c), hub: col(0x80848a), inner: col(0x303236),
    disc: col(0x70757c), discRim: col(0x868b92), damper: col(0xb8923a), clevis: col(0x6f6a60),
    motor: col(0x4a4e55), gear: col(0x504d46), axle: col(0x36373a), rubber: col(0x1f2125), accent: col(0xb8923a),
  },
};

// --- the parts ----------------------------------------------------------------------------------------------------------

/** The radius of a wheel's hub cover, of an axle, and the sides of a brake disc. */
const HUB_RADIUS = 0.115;
const AXLE_RADIUS = 0.07;
const DISC_SIDES = 12;

/**
 * One wheel as a solid of revolution about its axle, `dir` the way out (+1 on the +x side). Inner face dished a little, the flange standing
 * FLANGE_HEIGHT proud of the tread on the inner side, the tread, a bevelled rim on the outer face, a nearly flat web and a hub boss with its cover.
 * The tread's two edges lie exactly at the marker's radius, and a vertex lies exactly at the bottom of the tread (y = 0) and at the bottom of
 * the flange (y = -FLANGE_HEIGHT).
 */
function wheel(soup: Soup, dir: 1 | -1, x: number, r: number, z: number, pal: Palette): void {
  const ax = axisX(x, r, z, dir);
  const tip = r + FLANGE_HEIGHT;
  const uTip = -WHEEL_WIDTH / 2 - FLANGE_WIDTH * 0.6;
  const n = WHEEL_SEGMENTS;
  lathe(soup, ax, [[-0.046, 0], [uTip, tip]], n, pal.inner);
  lathe(soup, ax, [[uTip, tip], [-WHEEL_WIDTH / 2, r]], n, pal.tread);
  lathe(soup, ax, [[-WHEEL_WIDTH / 2, r], [WHEEL_WIDTH / 2, r]], n, pal.tread);
  // the rim's bevel and the web: the web has half the sides (it is flat and inside the round of the tread, where nothing shows a corner)
  lathe(soup, ax, [[WHEEL_WIDTH / 2, r], [0.04, r - 0.06, n / 2], [0.054, 0, n / 2]], n, [pal.rim, pal.web]);
  lathe(soup, ax, [[0.048, HUB_RADIUS], [0.098, HUB_RADIUS], [0.098, 0]], 12, pal.hub);
}

/** The four wheels of a bogie. */
function wheelsets(soup: Soup, spec: BogieSpec, pal: Palette): void {
  const half = spec.track / 2;
  for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) for (const sx of [-1, 1] as const) wheel(soup, sx, sx * half, spec.radius, az, pal);
}

/** The two axles: out to the axle boxes on an outside-frame bogie, to the hubs on an inside-frame one. */
function axles(soup: Soup, spec: BogieSpec, pal: Palette, reach: number): void {
  for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) tube(soup, axisX(-reach, spec.radius, az), 0, 2 * reach, AXLE_RADIUS, 10, pal.axle);
}

/** Two brake discs a side of the middle on each axle, each with a calliper on its rim toward the middle of the bogie (axle-mounted discs: ASSUMED). */
function brakes(soup: Soup, spec: BogieSpec, pal: Palette): void {
  const r = spec.radius;
  const t = DISC_THICKNESS / 2;
  for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) {
    const inward = az < 0 ? 1 : -1;
    for (const sx of [-1, 1]) {
      lathe(soup, axisX(sx * 0.3, r, az), [[-t, 0], [-t, DISC_RADIUS], [t, DISC_RADIUS], [t, 0]], DISC_SIDES, [pal.disc, pal.discRim, pal.disc]);
      const [x0, x1] = xs(sx, 0.3 - 0.05, 0.3 + 0.05);
      const z0 = az + inward * 0.2;
      const z1 = az + inward * 0.34;
      soup.box(x0, x1, r - 0.07, r + 0.07, Math.min(z0, z1), Math.max(z0, z1), pal.clevis);
    }
  }
}

// --- the frames ---------------------------------------------------------------------------------------------------------

/** Distance out from the centre line of the journals of an outside-frame bogie, and the box, beam and damper on them. */
const OUT_JOURNAL = 1.02;

/** A coil spring standing on y = `y0`, `h` tall, at (x, z): a drum with two wraps on it. */
function coilSpring(soup: Soup, x: number, y0: number, z: number, h: number, rho: number, pal: Palette): void {
  tube(soup, axisY(x, y0, z), 0, h, rho, 8, pal.coil);
  for (const f of [0.28, 0.64]) tube(soup, axisY(x, y0, z), h * f, h * (f + 0.17), rho * 1.2, 8, pal.spring);
}

/** The outline (z, y) of an outside side beam, mirrored about z = 0: bottom edge from one end to the other, then the top edge back. */
function beamOutline(half: readonly P2[]): P2[] {
  // `half` runs from the centre of the bottom edge out to the end, up the end and back along the top to the centre
  const right = half;
  const left = [...half].reverse().map((p): P2 => [-p[0], p[1]]);
  const out: P2[] = [];
  for (const p of [...left, ...right]) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
  }
  if (out.length > 1 && Math.abs((out[0] as P2)[0] - (out[out.length - 1] as P2)[0]) < 1e-9 && Math.abs((out[0] as P2)[1] - (out[out.length - 1] as P2)[1]) < 1e-9) out.pop();
  return out;
}

/** The AT300's primary spring stack (centre x, radius) and air spring (centre x, radius): broad drums, set inboard of the beam's face so nothing outboard of 1.14 m. */
const AT300_SPRING = { x: 0.985, radius: 0.08 } as const;
const AT300_AIR_SPRING = { x: 0.97, radius: 0.17 } as const;

/**
 * What the AT300 photograph shows on an outside frame beyond the beam, boxes, springs, damper and step (lner-gwr800-bogie-detail-2017.jpg, a leading
 * bogie in GWR green; hardware only, so no paint is taken from it). A leading bogie shows its sensor cabling and end furniture; the plain
 * shapes below stand for what is plainly there, and the routing of the cable is ASSUMED (the photograph shows it looping from the axle-box end to the frame):
 *  - a narrow lug standing up the outside of each axle box to the beam end (the vertical strap with its eye over the box, in front of the spring stack);
 *  - the axle-box arm: a bar from each box inboard under the beam to where the beam deepens (the long trailing arm each box carries);
 *  - two ribs on the outer face of each beam, rising outward from the deep middle (the diagonal webs either side of the step's plate);
 *  - a cable along the beam's outer face from each lug toward the middle (a dark strip a few millimetres proud).
 * Every part is attached to the box or the beam it stands on, and nothing is wider than the 1.15 m envelope.
 */
function at300Detail(F: Soup, sx: 1 | -1, r: number, w: number, pal: Palette): void {
  for (const az of [-w, w]) {
    const inward = az < 0 ? 1 : -1;
    const [lx0, lx1] = xs(sx, 1.085, 1.105);
    F.box(lx0, lx1, r + 0.09, r + 0.27, az - 0.055, az + 0.055, pal.cap);
    F.bar([r + 0.055, az + inward * 0.1], [r + 0.055, az + inward * 0.7], 0.07, 0.1, pal.frame, sx * 1.02);
    const x = sx * 1.072;
    const path: [number, number][] = [[az + inward * 0.09, r + 0.31], [az + inward * 0.42, r + 0.37], [az + inward * 0.72, r + 0.34]];
    for (let k = 0; k + 1 < path.length; k++) {
      const [za, ya] = path[k] as [number, number];
      const [zb, yb] = path[k + 1] as [number, number];
      F.face([[x, ya - 0.015, za], [x, ya + 0.015, za], [x, yb + 0.015, zb], [x, yb - 0.015, zb]], [0, (ya + yb) / 2, (za + zb) / 2], pal.rubber);
    }
  }
  for (const zs of [-1, 1]) F.bar([r - 0.04, zs * 0.52], [r + 0.38, zs * 0.8], 0.02, 0.055, pal.cap, sx * 1.075);
}

/**
 * An outside-frame bogie (Hitachi AT300, Electrostar, Class 180): an axle box and a coil spring on each journal, a side beam resting on the springs,
 * an air spring on the middle of each beam, a yaw damper low across the middle, and a cross beam between the beams.
 */
function outsideFrame(F: Soup, S: Soup, spec: BogieSpec, pal: Palette, style: BogieStyle): void {
  const r = spec.radius;
  const w = spec.wheelbase / 2;
  // what the AT300 photograph shows and the other makers' photographs do not: see `at300Detail`
  const hitachi = style === 'hitachi';
  const beam =
    style === 'alstom'
      ? // a boxy straight beam with shallow ends (GC180-01: a squarer frame than the Hitachi's)
        beamOutline([[0, r + 0.02], [0.5, r + 0.02], [0.9, r + 0.2], [w + 0.32, r + 0.2], [w + 0.32, r + 0.46], [0.7, r + 0.46], [0, r + 0.4]])
      : style === 'electrostar'
        ? // a flatter, lower beam
          beamOutline([[0, r + 0.04], [0.5, r + 0.04], [0.85, r + 0.2], [w + 0.34, r + 0.2], [w + 0.34, r + 0.44], [0.8, r + 0.44], [0, r + 0.4]])
        : // the AT300's: deep in the middle, swept up and out over the axle boxes (lner-gwr800-bogie-detail-2017.jpg)
          beamOutline([[0, r - 0.08], [0.5, r - 0.08], [0.82, r + 0.1], [w - 0.28, r + 0.26], [w + 0.33, r + 0.26], [w + 0.35, r + 0.36], [w + 0.3, r + 0.5], [w - 0.3, r + 0.5], [0.75, r + 0.44], [0, r + 0.4]]);
  const springTop = r + 0.26;
  for (const sx of [-1, 1]) {
    const [bx0, bx1] = xs(sx, 0.975, 1.065);
    plate(F, beam, bx0, bx1, pal.frame, pal.box, sx as 1 | -1);
    // the air spring on the middle of the beam, a rubber drum standing up to the underside of the body (the AT300's is the broad bag the photograph shows behind the step's plate, inboard of the beam's face)
    const topMid = r + 0.4;
    if (hitachi) tube(S, axisY(sx * AT300_AIR_SPRING.x, topMid, 0), 0, BOGIE_TOP - topMid - 0.005, AT300_AIR_SPRING.radius, 12, pal.rubber, 'end');
    else tube(S, axisY(sx * OUT_JOURNAL, topMid, 0), 0, BOGIE_TOP - topMid - 0.005, 0.12, 10, pal.rubber, 'end');
    for (const az of [-w, w]) {
      // the axle box, its round end cap, and the spring on top of it (the AT300's stack is the broad one the photograph shows, set a little inboard so the lug below stands clear of it)
      const [ax0, ax1] = xs(sx, 0.955, 1.085);
      F.box(ax0, ax1, r - 0.13, r + 0.11, az - 0.125, az + 0.125, pal.box);
      tube(F, axisX(sx * 1.085, r, az, sx as 1 | -1), 0, 0.035, 0.07, 10, pal.cap, 'end');
      if (hitachi) coilSpring(S, sx * AT300_SPRING.x, r + 0.11, az, springTop - (r + 0.11), AT300_SPRING.radius, pal);
      else coilSpring(S, sx * OUT_JOURNAL, r + 0.11, az, springTop - (r + 0.11), 0.062, pal);
    }
    if (hitachi) at300Detail(F, sx as 1 | -1, r, w, pal);
    // the yaw damper: a black cylinder along the bogie with a clevis at each end, on the outside of the beam
    const yD = r - 0.03;
    tube(F, axisZ(sx * 1.095, yD, -0.42), 0, 0.84, 0.032, 8, pal.damper);
    for (const z of [-0.47, 0.4]) {
      const [cx0, cx1] = xs(sx, 1.07, 1.125);
      F.box(cx0, cx1, yD - 0.045, yD + 0.045, z, z + 0.07, pal.clevis);
    }
    if (style === 'hitachi') {
      // the yellow maintenance step under the middle of the bogie, hung from the beam on a plate (lner-gwr800-bogie-detail-2017.jpg)
      const [px0, px1] = xs(sx, 0.98, 1.14);
      F.box(px0, px1, 0.19, 0.21, -0.25, 0.25, pal.accent);
      const [hx0, hx1] = xs(sx, 1.065, 1.1);
      F.box(hx0, hx1, 0.21, r - 0.06, -0.17, 0.17, pal.frame);
      // the two round bosses on the deep middle of the beam (the same photograph: a circle each side of the step's plate)
      for (const z of [-0.36, 0.36]) lathe(F, axisX(sx * 1.071, r + 0.09, z, sx as 1 | -1), [[0, 0.1], [0, 0]], 12, pal.spring);
    }
  }
  // the cross beam between the side beams
  F.box(-0.98, 0.98, r + 0.2, r + 0.4, -0.08, 0.08, pal.box);
}

/**
 * An inside-frame bogie (Siemens SF7000): the frame lies between the wheels with the axle boxes inboard of them, so from the side one sees
 * the plain wheels and, between them, the frame, a coil spring at each axle box, the air spring over the middle and a yaw damper
 * (tl700_03_gatwick_bogie_28898326470.jpg).
 */
function insideFrame(F: Soup, S: Soup, spec: BogieSpec, pal: Palette): void {
  const r = spec.radius;
  const w = spec.wheelbase / 2;
  const beam = beamOutline([[0, r - 0.16], [0.5, r - 0.16], [w - 0.2, r - 0.1], [w + 0.12, r - 0.1], [w + 0.12, r + 0.27], [w - 0.25, r + 0.27], [0.55, r + 0.24], [0, r + 0.24]]);
  for (const sx of [-1, 1]) {
    const [bx0, bx1] = xs(sx, 0.46, 0.58);
    plate(F, beam, bx0, bx1, pal.frame, pal.box, sx as 1 | -1);
    // the big coil spring beside each axle box, between the frame and the wheel
    for (const az of [-w, w]) {
      const [ax0, ax1] = xs(sx, 0.47, 0.6);
      F.box(ax0, ax1, r - 0.11, r + 0.11, az - 0.11, az + 0.11, pal.box);
      coilSpring(S, sx * 0.53, r + 0.11, az, 0.16, 0.07, pal);
    }
    // the air spring over the middle of the beam
    tube(S, axisY(sx * 0.52, r + 0.24, 0), 0, BOGIE_TOP - (r + 0.24) - 0.005, 0.13, 10, pal.rubber, 'end');
    // the yaw damper: a grey cylinder between two clevises, outside the beam
    const yD = r - 0.02;
    tube(F, axisZ(sx * 0.61, yD, -0.4), 0, 0.8, 0.03, 8, pal.damper);
    for (const z of [-0.45, 0.4]) {
      const [cx0, cx1] = xs(sx, 0.585, 0.64);
      F.box(cx0, cx1, yD - 0.04, yD + 0.04, z, z + 0.05, pal.clevis);
    }
    // the vertical damper beside the air spring, standing on the yaw damper and reaching the top of the beam (the same photograph: a grey cylinder beside the air spring)
    tube(F, axisY(sx * 0.62, yD + 0.03, 0.2), 0, r + 0.24 - (yD + 0.03), 0.026, 8, pal.damper);
    // and the boxy housing on the beam beyond the yaw damper's far end (the same photograph shows a plain grey box there)
    const [hx0, hx1] = xs(sx, 0.58, 0.61);
    F.box(hx0, hx1, r - 0.1, r + 0.12, -0.62, -0.46, pal.box);
  }
  F.box(-0.5, 0.5, r + 0.1, r + 0.24, -0.08, 0.08, pal.box);
}

// --- the drive ----------------------------------------------------------------------------------------------------------

/**
 * Where the drive hangs. A bogie seen from the track side shows its side beam and, below the beam, whatever hangs lower between the wheels: a trailer bogie's
 * underside is bare there, so a motor bogie's drive hangs low enough for its lower part to stand in plain sight under the beam (no photograph shows it, so the heights
 * are ASSUMED; each stays well above the rail head: the lowest hangs 0.12 m above it). A traction motor's axis lies this far from the axle line (it was 0.08 above it,
 * wholly behind the beam, so a motor bogie and a trailer bogie looked the same from outside).
 */
export const MOTOR_AXIS = -0.1;
/** A traction motor: its barrel's radius, its length across the bogie, and how far its rim stands clear of the wheel's rim beside it (along the bogie), so the whole of it is in view between the wheels. */
export const MOTOR_RADIUS = 0.2;
export const MOTOR_LENGTH = 0.62;
export const MOTOR_CLEAR = 0.02;
/** A diesel unit's cardan shaft hangs this far from the axle line (below it), and a gearbox casing reaches this far inboard of its axle. */
export const CARDAN_AXIS = -0.1;
export const GEARBOX_REACH = 0.5;

/**
 * A motor bogie's drive: a traction motor across the bogie on each axle's inboard side of the middle, its gear case on one end of it reaching
 * to the axle. (Frame-mounted motors with a gear case on the axle are the UK EMU arrangement; no photograph shows them, so the sizes are ASSUMED.)
 * The motor hangs low (`MOTOR_AXIS`) so its end stands in view under the side beam; its end bells are the light steel of a hub, so they read as ends of a drum.
 */
function tractionMotors(D: Soup, spec: BogieSpec, pal: Palette, caseX: [number, number]): void {
  const r = spec.radius;
  for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) {
    const dz = (az < 0 ? 1 : -1) * (r + MOTOR_RADIUS + MOTOR_CLEAR);
    const side = az < 0 ? 1 : -1;
    lathe(D, axisX(-MOTOR_LENGTH / 2, r + MOTOR_AXIS, az + dz), [[0, 0], [0, MOTOR_RADIUS], [MOTOR_LENGTH, MOTOR_RADIUS], [MOTOR_LENGTH, 0]], 14, [pal.hub, pal.motor, pal.hub]);
    const [x0, x1] = xs(side, caseX[0], caseX[1]);
    D.box(x0, x1, r + MOTOR_AXIS - MOTOR_RADIUS + 0.04, r + MOTOR_AXIS + MOTOR_RADIUS, Math.min(az - 0.17, az + dz - 0.17), Math.max(az + 0.17, az + dz + 0.17), pal.gear);
  }
}

/**
 * A diesel-hydraulic unit's driven bogie: a final-drive gearbox on each axle, reaching inboard of the wheel so that part of it stands in the clear between the wheels, joined
 * by a cardan shaft hanging low along the bogie with a yoke at each end (a trailer bogie has nothing there).
 */
function finalDrive(D: Soup, spec: BogieSpec, pal: Palette): void {
  const r = spec.radius;
  const w = spec.wheelbase / 2;
  for (const az of [-w, w]) {
    // the gearbox on the axle: a casing 0.6 m across, from 0.2 m under the axle line to 0.2 above it, 0.22 m aft of the axle and `GEARBOX_REACH` inboard of it, round the axle's housing (ASSUMED sizes)
    const inward = az < 0 ? 1 : -1;
    D.box(-0.3, 0.3, r - 0.2, r + 0.2, Math.min(az - inward * 0.22, az + inward * GEARBOX_REACH), Math.max(az - inward * 0.22, az + inward * GEARBOX_REACH), pal.gear);
    lathe(D, axisX(-0.35, r, az), [[0, 0], [0, 0.15], [0.7, 0.15], [0.7, 0]], 12, pal.motor);
  }
  // the cardan shaft from the one gearbox's inboard face to the other's, low, with a lighter yoke on each end
  const z0 = -(w - GEARBOX_REACH);
  const span = 2 * (w - GEARBOX_REACH);
  tube(D, axisZ(0, r + CARDAN_AXIS, z0), 0, span, 0.055, 8, pal.motor);
  for (const zs of [z0, z0 + span - 0.04]) lathe(D, axisZ(0, r + CARDAN_AXIS, zs), [[0, 0], [0, 0.09], [0.04, 0.09], [0.04, 0]], 8, pal.hub);
}

// --- the bogie ----------------------------------------------------------------------------------------------------------

export type BogiePart = 'wheels' | 'axles' | 'brakes' | 'frame' | 'springs' | 'drive';

/** The bogie's parts, each its own soup: the wheels with their hubs, the axles, the discs and callipers, the frames with their boxes and dampers, the springs, and the motors or final drives. */
export function bogieParts(spec: BogieSpec): Record<BogiePart, Soup> {
  const style = bogieStyle(spec);
  const pal = PALETTES[style];
  const parts: Record<BogiePart, Soup> = { wheels: new Soup(), axles: new Soup(), brakes: new Soup(), frame: new Soup(), springs: new Soup(), drive: new Soup() };
  wheelsets(parts.wheels, spec, pal);
  brakes(parts.brakes, spec, pal);
  if (style === 'siemens') {
    axles(parts.axles, spec, pal, spec.track / 2 + 0.05);
    insideFrame(parts.frame, parts.springs, spec, pal);
  } else {
    axles(parts.axles, spec, pal, 0.96);
    outsideFrame(parts.frame, parts.springs, spec, pal, style);
  }
  if (spec.motor && spec.diesel) finalDrive(parts.drive, spec, pal);
  else if (spec.motor) tractionMotors(parts.drive, spec, pal, style === 'siemens' ? [0.34, 0.45] : [0.34, 0.56]);
  return parts;
}

export function bogieSoup(spec: BogieSpec): Soup {
  const soup = new Soup();
  for (const part of Object.values(bogieParts(spec))) append(soup, part);
  return soup;
}

/**
 * The bogie seen from far off: twelve-sided wheels, a side frame on each side and one transom, and nothing else (no
 * flanges, axles, discs, springs or motors). The wheels stand where the full bogie's do and the frames fill the
 * place of its beams, in their colours, so the swap does not move or recolour the silhouette; about a tenth of the triangles.
 */
export function bogieFarSoup(spec: Pick<BogieSpec, 'radius' | 'wheelbase' | 'track' | 'diesel' | 'style'>): Soup {
  const { radius: r, wheelbase: wb, track } = spec;
  const style = bogieStyle(spec);
  const pal = PALETTES[style];
  const soup = new Soup();
  const half = track / 2;
  const w = wb / 2;
  const n = FAR_WHEEL_SEGMENTS;
  for (const az of [-w, w]) {
    for (const sx of [-1, 1] as const) {
      const ax = axisX(sx * half, r, az, sx);
      lathe(soup, ax, [[-WHEEL_WIDTH / 2, 0], [-WHEEL_WIDTH / 2, r]], n, pal.inner);
      lathe(soup, ax, [[-WHEEL_WIDTH / 2, r], [WHEEL_WIDTH / 2, r]], n, pal.tread);
      lathe(soup, ax, [[WHEEL_WIDTH / 2, r], [WHEEL_WIDTH / 2, 0]], n, pal.web);
    }
  }
  if (style === 'siemens') {
    for (const sx of [-1, 1]) {
      const [x0, x1] = xs(sx, 0.46, 0.58);
      soup.box(x0, x1, r - 0.16, r + 0.24, -(w + 0.12), w + 0.12, pal.frame);
    }
    soup.box(-0.5, 0.5, r + 0.1, r + 0.24, -0.08, 0.08, pal.frame);
    return soup;
  }
  for (const sx of [-1, 1]) {
    const [x0, x1] = xs(sx, 0.975, 1.065);
    soup.box(x0, x1, r + 0.12, r + 0.5, -(w + 0.33), w + 0.33, pal.frame);
  }
  soup.box(-0.98, 0.98, r + 0.2, r + 0.4, -0.08, 0.08, pal.box);
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
  const style = bogieStyle(spec);
  const key = `${radius}/${wb}/${track}/${spec.motor}/${spec.diesel === true}/${style}`;
  let geometry = bogieCache.get(key);
  if (!geometry) {
    geometry = bogieSoup(spec).build();
    bogieCache.set(key, geometry);
  }
  const farKey = `${radius}/${wb}/${track}/${style}`;
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
  // the collector head: the bow, and two carbon strips along its top (dark against the pale aluminium; ASSUMED: the Leeds photograph's pantograph is on a pantograph car
  // seen from far above and shows the base and the arm frame, not the head); the strips stand inside the head's top, so the folded height is the bow's
  soup.box(-0.8, 0.8, top - 0.07, top - PANTOGRAPH_STRIP_THICKNESS, 0.64, 0.82, head);
  for (const [z0, z1] of PANTOGRAPH_STRIPS) soup.box(-0.78, 0.78, top - PANTOGRAPH_STRIP_THICKNESS, top, z0, z1, col(PANTOGRAPH_STRIP));
  const mesh = new THREE.Mesh(soup.build(), plain());
  mesh.name = 'pantograph-mesh';
  group.add(mesh);
  return group;
}

/** The pantograph head's carbon strips: their colour, their thickness, and where they lie along the head (z from the pantograph's centre). ASSUMED. */
export const PANTOGRAPH_STRIP = 0x1b1c1f;
export const PANTOGRAPH_STRIP_THICKNESS = 0.014;
export const PANTOGRAPH_STRIPS: readonly (readonly [number, number])[] = [[0.67, 0.71], [0.75, 0.79]];

// --- the roof equipment beside a pantograph --------------------------------------------------------------------------------
//
// What a pantograph car carries on its roof besides the pantograph: ribbed insulators on grey plates, and the cable runs between them. The Azuma's is read off
// lner-800-pantograph-leeds-2019.jpg (a GWR 800's pantograph-car roof from a footbridge: three big black ribbed insulators on grey plates, smaller ones on blocks,
// thin black cables looping between them, the pantograph's frame at one end, the roof a flat grey deck): that there are three big and a few small ones, and the order
// along the roof, are read off it (the photograph has more small ones than the model draws: the cost cap on triangles leaves room for these); the places, the sizes (scaled into the roof envelope: the covers stand 0.27 m over the roof edge, and nothing here stands higher)
// and which side of the pantograph they lie on are ASSUMED. The electric multiple units' (Class 387, 717, 700) is ASSUMED whole: every one of them has insulators and a
// cable beside its pantograph, no photograph shows the roof, so there is one big insulator and two small ones with a cable, at the size the cover's height allows.

/** The colours of a roof kit: the insulators' sheds, their caps, the plates and blocks they stand on, and the cables. */
export const KIT_COLOURS = { shed: 0x25272b, cap: 0x8e9297, plate: 0x7c8086, cable: 0x181a23 } as const;

export type RoofKitStyle = 'azuma' | 'emu';
export interface RoofKitItem {
  kind: 'big' | 'small';
  /** metres from the pantograph base's near edge, toward the car's own nose */
  u: number;
  /** metres across, + is the train's right for the front car (mirrored for a rear cab car, which is turned about) */
  x: number;
}
export interface RoofKitDef {
  items: readonly RoofKitItem[];
  /** cable runs, each a polyline of (x, u) points */
  cables: readonly (readonly (readonly [number, number])[])[];
}
export const ROOF_KITS: Readonly<Record<RoofKitStyle, RoofKitDef>> = {
  azuma: {
    items: [
      { kind: 'small', u: 0.55, x: 0.52 },
      { kind: 'big', u: 1.05, x: -0.3 },
      { kind: 'small', u: 1.65, x: 0.05 },
      { kind: 'big', u: 2.15, x: 0.38 },
      { kind: 'big', u: 3.05, x: -0.3 },
    ],
    // each run starts at the pantograph's base or at an insulator's axis and ends on another's, and passes no insulator on the way
    cables: [
      [[0.52, 0], [0.52, 0.55]],
      [[0.52, 0.55], [0.52, 2.15], [0.38, 2.15]],
      [[-0.3, 1.05], [-0.3, 3.05]],
      [[-0.3, 1.05], [0.05, 1.05], [0.05, 1.65]],
    ],
  },
  emu: {
    items: [
      { kind: 'big', u: 0.8, x: -0.3 },
      { kind: 'small', u: 1.3, x: 0.35 },
      { kind: 'small', u: 1.8, x: -0.1 },
    ],
    cables: [
      [[0.35, 0], [0.35, 1.3]],
      [[-0.3, 0], [-0.3, 0.8]],
      [[-0.3, 0.8], [-0.1, 0.8], [-0.1, 1.8]],
    ],
  },
};
/** A big insulator's sheds' radius, a small one's, and the half-sides of the plate under a big one and the block under a small one. */
export const KIT_BIG_RADIUS = 0.115;
export const KIT_SMALL_RADIUS = 0.058;
export const KIT_PLATE_HALF = { big: [0.31, 0.28], small: [0.1, 0.1] } as const;
/** A plate's top, above the roof's crown; a cable's width and its top, above the crown. */
export const KIT_PLATE_TOP = 0.02;
export const KIT_CABLE_WIDTH = 0.03;
export const KIT_CABLE_TOP = 0.035;
/** The roof is flat to within 12 mm across this half-width of the crown, and a kit stays inside it. */
export const KIT_HALF_WIDTH = 0.74;
/** Sheds on a big and on a small insulator, and the sides they are drawn with. */
const KIT_SHEDS = { big: 3, small: 2 } as const;
const KIT_SIDES = { big: 8, small: 6 } as const;

/** The length a kit takes beyond the pantograph base's near edge: its furthest plate and a margin. */
export function roofKitReach(style: RoofKitStyle): number {
  return Math.max(...ROOF_KITS[style].items.map((i) => i.u + KIT_PLATE_HALF[i.kind][1])) + 0.2;
}

/** The stretch of the roof a pantograph car's kit and pantograph take together (the covers keep out of it), for a pantograph base over [p0, p1] and the kit on the side `dir` (-1: toward lower z). */
export function roofKitSpan(style: RoofKitStyle, p0: number, p1: number, dir: 1 | -1): [number, number] {
  const reach = roofKitReach(style);
  return dir < 0 ? [p0 - reach, p1 + 0.35] : [p0 - 0.35, p1 + reach];
}

/** One ribbed insulator standing on y = `y0`, `h` tall: sheds one on the next up a core, a flared pale cap on top (3 bands to a shed, 2 to the cap). */
function insulator(soup: Soup, x: number, y0: number, z: number, radius: number, h: number, sheds: number, sides: number): void {
  const shed = col(KIT_COLOURS.shed);
  const cap = col(KIT_COLOURS.cap);
  const core = radius * 0.6;
  const capT = Math.min(0.02, h * 0.12);
  const pitch = (h - capT) / sheds;
  const prof: [number, number][] = [[0, core]];
  const colours: THREE.Color[] = [];
  const push = (u: number, r: number, c: THREE.Color): void => {
    prof.push([u, r]);
    colours.push(c);
  };
  for (let i = 0; i < sheds; i++) {
    const u = i * pitch;
    push(u + pitch * 0.2, radius, shed);
    push(u + pitch * 0.62, radius, shed);
    push(u + pitch, core, shed);
  }
  push(h, radius * 0.85, cap);
  push(h, 0, cap);
  lathe(soup, axisY(x, y0, z), prof, sides, colours);
}

/**
 * A pantograph car's roof equipment (see above), for a pantograph base over [p0, p1] with the kit on the side `dir` of it (-1: toward lower z; a rear cab car, turned about,
 * has it toward higher z and its x mirrored), standing on a roof whose crown is at `crown`; nothing stands more than `height` over the crown.
 */
export function roofKit(soup: Soup, o: { style: RoofKitStyle; p0: number; p1: number; dir: 1 | -1; crown: number; height: number }): void {
  const def = ROOF_KITS[o.style];
  const near = o.dir < 0 ? o.p0 : o.p1;
  const zAt = (u: number): number => near + o.dir * u;
  const xAt = (x: number): number => -o.dir * x;
  const plateColour = col(KIT_COLOURS.plate);
  const y0 = o.crown - 0.012;
  const plateTop = o.crown + KIT_PLATE_TOP;
  for (const item of def.items) {
    const [hx, hz] = KIT_PLATE_HALF[item.kind];
    const x = xAt(item.x);
    const z = zAt(item.u);
    soup.box(x - hx, x + hx, y0, plateTop, z - hz, z + hz, plateColour, '-y');
    const stack = o.height - KIT_PLATE_TOP;
    insulator(soup, x, plateTop, z, item.kind === 'big' ? KIT_BIG_RADIUS : KIT_SMALL_RADIUS, item.kind === 'big' ? stack : stack * 0.6, KIT_SHEDS[item.kind], KIT_SIDES[item.kind]);
  }
  const cable = col(KIT_COLOURS.cable);
  const w = KIT_CABLE_WIDTH / 2;
  for (const run of def.cables) {
    for (let i = 0; i + 1 < run.length; i++) {
      const [xa, ua] = run[i] as readonly [number, number];
      const [xb, ub] = run[i + 1] as readonly [number, number];
      const x0 = Math.min(xAt(xa), xAt(xb)) - w;
      const x1 = Math.max(xAt(xa), xAt(xb)) + w;
      const z0 = Math.min(zAt(ua), zAt(ub)) - w;
      const z1 = Math.max(zAt(ua), zAt(ub)) + w;
      soup.box(x0, x1, y0, o.crown + KIT_CABLE_TOP, z0, z1, cable, '-y');
    }
  }
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

// --- side skirts -----------------------------------------------------------------------------------
//
// What a skirt is drawn from: lner-801-214-2025, lner-800-doncaster-2026 and hull-802-paragon-2025 show the Azuma's underfloor equipment covers as
// light grey panels with groups of louvres, standing well inboard of the body side (in its shadow, the solebar overhanging them), their ends
// square-ish beside the bogies. They are not a dark slab flush with the wall: a skirt that stood flush with the wall, under a lower body edge that
// tucks in, read as a block standing proud of the body (the round-4 scorer's finding on coach-lner9-3m and coach-lumo5-3m).

/**
 * How far a side skirt leans in toward the centre line for each metre it hangs down. The lean and the set-back below are read off the
 * photographs above, not published.
 */
export const SKIRT_LEAN = 0.3;
/** A skirt's lower corners are cut back this far along the car, so its ends are raked, not square. ASSUMED. */
export const SKIRT_RAKE = 0.14;
/** A skirt is a panel this thick, not a block. */
export const SKIRT_THICKNESS = 0.05;
/** The top edge of a skirt stands this far above the floor, inside the body, so no seam shows under the body's lower edge. */
export const SKIRT_TUCK = 0.04;
/** A skirt's outer face starts this far inside the body's lowest corner. */
export const SKIRT_SETBACK = 0.01;
/**
 * A cover this tall (metres) or taller carries louvres, on a stretch this long (metres) or longer. The photographs (lner-801-214-2025 and lner-800-doncaster-2026, the covers between
 * the bogies, enlarged) show them as grilles: dark panels of fine vertical slats, about half a metre wide and a little over a quarter of the cover's height, standing in two groups
 * along a long cover, four grilles a fifth to a third of the way along (two close pairs) and two just past its middle (CHANGED, round 4: this drew two groups of four thin slits,
 * each group the width of one grille). The sizes are read off the enlargements against the cover's length, which the bogie spacing gives: ASSUMED, to a few centimetres.
 */
export const SKIRT_VENT_MIN_HEIGHT = 0.4;
export const SKIRT_VENT_MIN_LENGTH = 3.5;
export const SKIRT_LOUVRES: readonly { at: number; grilles: number }[] = [{ at: 0.23, grilles: 4 }, { at: 0.57, grilles: 2 }];
export const SKIRT_GRILLE = {
  /** one grille's width, and the distance from its centre to its neighbour's */
  width: 0.48,
  pitch: 0.54,
  /** the slats a grille is cut into, and the width of each (the rest is the gap showing the cover between two) */
  slats: 10,
  slatWidth: 0.036,
} as const;
/** A group of grilles stands this clear (metres) of its stretch's raked ends, or is left off. */
export const SKIRT_VENT_CLEAR = 0.3;
/** A louvre stands this far off the panel's face (clear of it, so neither shows through the other). */
export const SKIRT_SLIT_LIFT = 0.004;

/**
 * The hem of the Azuma's covers (the same photographs): a row of small notches along the foot of the cover, the castellation where the equipment behind shows through, dark. ASSUMED
 * sizes, read off the enlargements as the grilles' are: a notch 0.2 m wide and 0.07 m tall on a 0.5 m pitch. A cover carries them where its stretch is this long and it is this tall;
 * they stand the same `SKIRT_SLIT_LIFT` off its face as the louvres, in a colour of their own (so a louvre count is a count of louvres).
 */
export const SKIRT_HEM = {
  minLength: 1.5,
  minHeight: 0.3,
  notchWidth: 0.2,
  notchHeight: 0.07,
  notchPitch: 0.5,
  /** the row stays this far inside the foot's ends (the foot is raked at each) */
  margin: 0.1,
} as const;

/**
 * Half-width of a skirt's outer face at height `y`: it hangs from just inside the body's lowest corner (`edge` from the centre line, the floor
 * `floor` above the rail head) and leans in as it goes down.
 */
export function skirtHalfAt(edge: number, floor: number, y: number): number {
  return edge - SKIRT_SETBACK - (floor + SKIRT_TUCK - y) * SKIRT_LEAN;
}

/**
 * A cover drawn as a row of separate boxes, as the Electrostar's underfloor is (gn387_03_387123_cambridge.jpg, gn387_01_387114_ely.jpg: grey equipment boxes of about a
 * metre to a metre and a half hung under the sill, dark gaps between them, their ends square, not raked): the length of a typical box, the gap between two, and how far a
 * box's foot is cut back at each end, metres. All ASSUMED from those photographs.
 */
export interface SkirtBoxes {
  length: number;
  gap: number;
  rake: number;
}
/** The boxes of a row are not all one length: each is this fraction (of the average) in turn. */
export const SKIRT_BOX_PATTERN = [1, 1.35, 0.8, 1.2, 0.9, 1.3] as const;

/** The stretch [z0, z1] cut into the boxes of a row (one box, the whole stretch, where it is too short for two): each box's [start, end], the gaps between them as given. */
export function skirtSplit(z0: number, z1: number, boxes: SkirtBoxes | undefined): [number, number][] {
  if (!boxes) return [[z0, z1]];
  const n = Math.max(1, Math.round((z1 - z0 + boxes.gap) / (boxes.length + boxes.gap)));
  if (n === 1) return [[z0, z1]];
  const weights = Array.from({ length: n }, (_, i) => SKIRT_BOX_PATTERN[i % SKIRT_BOX_PATTERN.length] as number);
  const sum = weights.reduce((a, w) => a + w, 0);
  const total = z1 - z0 - boxes.gap * (n - 1);
  const out: [number, number][] = [];
  let z = z0;
  weights.forEach((w, i) => {
    const end = i === n - 1 ? z1 : z + (total * w) / sum;
    out.push([z, end]);
    z = end + boxes.gap;
  });
  return out;
}

export interface SkirtPanel {
  /** +1: the train's right side, -1: its left */
  side: 1 | -1;
  /** the stretch of the train it covers (z0 < z1) */
  z0: number;
  z1: number;
  /** half-width of the body's lowest corner, the floor's height and the height of the panel's foot (all from the rail head) */
  edge: number;
  floor: number;
  bottom: number;
  colour: THREE.Color;
  /** the louvres' colour, or null for a plain panel */
  vent: THREE.Color | null;
  /** the colour of the foot's notches (`SKIRT_HEM`), or null/absent for a panel without them */
  hem?: THREE.Color | null;
  /** how far the foot is cut back at each end (default SKIRT_RAKE; never more than a quarter of the panel's length) */
  rake?: number;
}

/**
 * One side skirt over a clear stretch between two bogie cut-outs: a thin panel leaning in from the body's lower edge, its foot raked at each end,
 * with (on a tall enough, long enough stretch, and where the kind has them) groups of louvre grilles on its face, and (where the kind has them) a notched hem (`SKIRT_HEM`).
 * Its top and inner face are not drawn: the first is inside the body and the second looks at the underframe.
 */
export function skirtPanel(soup: Soup, o: SkirtPanel): void {
  const { side: sx, z0, z1, edge, floor, bottom } = o;
  const top = floor + SKIRT_TUCK;
  const rake = Math.min(o.rake ?? SKIRT_RAKE, 0.25 * (z1 - z0));
  const out = (y: number): number => sx * skirtHalfAt(edge, floor, y);
  const outer: [V3, V3, V3, V3] = [[out(top), top, z0], [out(top), top, z1], [out(bottom), bottom, z1 - rake], [out(bottom), bottom, z0 + rake]];
  const inner = outer.map((p): V3 => [p[0] - sx * SKIRT_THICKNESS, p[1], p[2]]) as [V3, V3, V3, V3];
  const pts = [...outer, ...inner];
  const centre: V3 = [0, 0, 0].map((_, k) => pts.reduce((a, p) => a + p[k]!, 0) / pts.length) as V3;
  soup.face(outer, centre, o.colour);
  soup.face([outer[0], outer[3], inner[3], inner[0]], centre, o.colour);
  soup.face([outer[1], outer[2], inner[2], inner[1]], centre, o.colour);
  soup.face([outer[3], outer[2], inner[2], inner[3]], centre, o.colour);
  // the louvres and the hem lie on the panel: the face's normal leans down as the panel leans in
  const n = unit([sx, -SKIRT_LEAN, 0]);
  const at = (y: number, z: number): V3 => [out(y) + n[0] * SKIRT_SLIT_LIFT, y + n[1] * SKIRT_SLIT_LIFT, z];
  const strip = (ya: number, yb: number, za: number, zb: number, colour: THREE.Color): void => soup.quad([at(ya, za), at(ya, zb), at(yb, zb), at(yb, za)], [n, n, n, n], colour);
  if (o.vent !== null && z1 - z0 >= SKIRT_VENT_MIN_LENGTH && floor - bottom >= SKIRT_VENT_MIN_HEIGHT) {
    const y0 = bottom + 0.12;
    const y1 = floor - 0.1;
    const G = SKIRT_GRILLE;
    for (const { at: f, grilles } of SKIRT_LOUVRES) {
      const centre = z0 + f * (z1 - z0);
      const half = ((grilles - 1) * G.pitch + G.width) / 2;
      if (centre - half < z0 + rake + SKIRT_VENT_CLEAR || centre + half > z1 - rake - SKIRT_VENT_CLEAR) continue;
      for (let g = 0; g < grilles; g++) {
        const zNear = centre + (g - (grilles - 1) / 2) * G.pitch - G.width / 2;
        for (let k = 0; k < G.slats; k++) {
          const za = zNear + (k + 0.5) * (G.width / G.slats) - G.slatWidth / 2;
          strip(y0, y1, za, za + G.slatWidth, o.vent);
        }
      }
    }
  }
  if (o.hem && z1 - z0 >= SKIRT_HEM.minLength && floor - bottom >= SKIRT_HEM.minHeight) {
    const H = SKIRT_HEM;
    // the notches along the foot, centred on it: as many on the pitch as fit between its ends
    const f0 = z0 + rake + H.margin;
    const f1 = z1 - rake - H.margin;
    const count = Math.floor((f1 - f0 - H.notchWidth) / H.notchPitch + 1e-9) + 1;
    for (let k = 0; k < count; k++) {
      const zc = (f0 + f1) / 2 + (k - (count - 1) / 2) * H.notchPitch;
      strip(bottom, bottom + H.notchHeight, zc - H.notchWidth / 2, zc + H.notchWidth / 2, o.hem);
    }
  }
}

// --- the underfloor equipment of a diesel car -------------------------------------------------------------------------------------------------------------------
//
// What the Class 180's underfloor is drawn from: GC180-01-180-101-Kings-Cross-8077814883- is the one photograph that shows it (the others are too far or too foreshortened;
// the review set says so itself: "no usable close ... underframe"). Between the bogies the car's belly is a long, dusty brown-grey enclosure hung straight under the sill, its
// lower edge rounded, with rounded-rectangle access hatches of several sizes let into its side, small louvres and latches. What is inside is not observable, so the masses'
// names (engine, transmission, cooler, tank, battery box: Wikipedia gives one Cummins QSK19 engine and a Voith transmission to each car) and the order they hang in are
// ASSUMED, and what each shows on its side is the photograph's vocabulary (hatches, louvres, straps, latches) laid out as a person would expect of that mass.

/** What a mass hung under a diesel car is, so what its side shows: hatches (engine, transmission), a louvred grille (cooler), straps with a filler and a gauge (tank), a lid and handles (battery box). */
export type PodForm = 'engine' | 'transmission' | 'cooler' | 'tank' | 'battery';

/** One mass under a diesel car's floor: a box with its lower long edges cut back, hung from the floor. x0 = -x1: it is symmetric about the centre line. */
export interface PodBox {
  form: PodForm;
  colour: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** How a pod is shaped and what stands on its side. All ASSUMED sizes, read off the photograph above by eye. */
export const POD_SHAPE = {
  /** each lower long edge is cut back this far across and up: the rounded foot of the belly */
  bevel: 0.1,
  /** a mark on the side stands this far proud of the side: a frame, then what is in it; a louvre slat, a latch or a handle on top of that */
  lift: { frame: 0.008, inset: 0.014, raised: 0.02 },
  /** the border of a hatch's or a grille's frame, and where a hatch stands above the foot of the flat face, metres */
  border: 0.03,
  foot: 0.06,
  /** hatch sizes: its width as a fraction of the pod's length, its height as a fraction of the flat face's height */
  hatchWidth: 0.24,
  hatchHeight: 0.42,
  /** the cooler's grille: slats, the share of the pod's length it spans, its height as a fraction of the flat face's, and how deep a slat is */
  slats: 9,
  grilleLength: 0.8,
  grilleHeight: 0.55,
  slatDepth: 0.024,
  /** the tank's straps (where along it, how wide), its gauge (where, how wide, how tall) and its filler neck (where along it, how high up the flat face, radius, length) */
  straps: [0.2, 0.8] as readonly number[],
  strapWidth: 0.07,
  gauge: { at: 0.38, width: 0.04, height: 0.3 },
  neck: { at: 0.62, up: 0.66, radius: 0.05, length: 0.07 },
  /** the battery box's lid seam (how high up the flat face) and handles (where along it, how high up) */
  seam: 0.62,
  handles: [0.25, 0.75] as readonly number[],
  handleUp: 0.3,
} as const;

/** The colours of what a pod's side carries (the pod's own colour is its item's). */
export const POD_PARTS = {
  frame: 0x77725f,
  recess: 0x1f2023,
  slat: 0x8c8777,
  strap: 0x34322e,
  gauge: 0x1a1b1e,
  seam: 0x242528,
  handle: 0x8f8a7b,
  latch: 0x8f8a7b,
  neck: 0x5d594f,
  cap: 0x8f8a7b,
} as const;

export interface PodMark {
  kind: 'frame' | 'recess' | 'slat' | 'strap' | 'gauge' | 'seam' | 'handle' | 'latch' | 'neck';
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

/** The foot of a pod's flat side (where its bevel ends) and the height of that flat face. */
export const podFace = (p: Pick<PodBox, 'y0' | 'y1'>): { foot: number; height: number } => ({ foot: p.y0 + POD_SHAPE.bevel, height: p.y1 - p.y0 - POD_SHAPE.bevel });

/** What stands on one side of a pod, as rectangles in (z, y) on its flat face (the other side mirrors it). The tank's filler is the one round thing: its box is the square about its axis. */
export function podMarks(p: PodBox): PodMark[] {
  const { foot, height } = podFace(p);
  const L = p.z1 - p.z0;
  const at = (f: number): number => p.z0 + f * L;
  const marks: PodMark[] = [];
  const hatch = (zc: number): void => {
    const w = POD_SHAPE.hatchWidth * L;
    const y = foot + POD_SHAPE.foot;
    const h = POD_SHAPE.hatchHeight * height;
    marks.push({ kind: 'frame', z0: zc - w / 2 - POD_SHAPE.border, z1: zc + w / 2 + POD_SHAPE.border, y0: y - POD_SHAPE.border, y1: y + h + POD_SHAPE.border });
    marks.push({ kind: 'recess', z0: zc - w / 2, z1: zc + w / 2, y0: y, y1: y + h });
    marks.push({ kind: 'latch', z0: zc + w / 2 - 0.2 * w, z1: zc + w / 2 - 0.1 * w, y0: y + 0.35 * h, y1: y + 0.65 * h });
  };
  if (p.form === 'engine') for (const f of [1 / 6, 3 / 6, 5 / 6]) hatch(at(f));
  else if (p.form === 'transmission') hatch(at(0.5));
  else if (p.form === 'cooler') {
    const z0 = at((1 - POD_SHAPE.grilleLength) / 2);
    const z1 = at(1 - (1 - POD_SHAPE.grilleLength) / 2);
    const y0 = foot + POD_SHAPE.foot;
    const y1 = y0 + POD_SHAPE.grilleHeight * height;
    marks.push({ kind: 'frame', z0: z0 - POD_SHAPE.border, z1: z1 + POD_SHAPE.border, y0: y0 - POD_SHAPE.border, y1: y1 + POD_SHAPE.border });
    marks.push({ kind: 'recess', z0, z1, y0, y1 });
    for (let i = 0; i < POD_SHAPE.slats; i++) {
      const yc = y0 + ((y1 - y0) * (i + 1)) / (POD_SHAPE.slats + 1);
      marks.push({ kind: 'slat', z0: z0 + 0.04, z1: z1 - 0.04, y0: yc - POD_SHAPE.slatDepth / 2, y1: yc + POD_SHAPE.slatDepth / 2 });
    }
  } else if (p.form === 'tank') {
    for (const f of POD_SHAPE.straps) marks.push({ kind: 'strap', z0: at(f) - POD_SHAPE.strapWidth / 2, z1: at(f) + POD_SHAPE.strapWidth / 2, y0: foot, y1: p.y1 - 0.02 });
    marks.push({ kind: 'gauge', z0: at(POD_SHAPE.gauge.at) - POD_SHAPE.gauge.width / 2, z1: at(POD_SHAPE.gauge.at) + POD_SHAPE.gauge.width / 2, y0: foot + POD_SHAPE.foot, y1: foot + POD_SHAPE.foot + POD_SHAPE.gauge.height * height });
    const yc = foot + POD_SHAPE.neck.up * height;
    marks.push({ kind: 'neck', z0: at(POD_SHAPE.neck.at) - POD_SHAPE.neck.radius, z1: at(POD_SHAPE.neck.at) + POD_SHAPE.neck.radius, y0: yc - POD_SHAPE.neck.radius, y1: yc + POD_SHAPE.neck.radius });
  } else {
    marks.push({ kind: 'seam', z0: at(0.04), z1: at(0.96), y0: foot + POD_SHAPE.seam * height - 0.006, y1: foot + POD_SHAPE.seam * height + 0.006 });
    for (const f of POD_SHAPE.handles) marks.push({ kind: 'handle', z0: at(f) - 0.06, z1: at(f) + 0.06, y0: foot + POD_SHAPE.handleUp * height - 0.0175, y1: foot + POD_SHAPE.handleUp * height + 0.0175 });
  }
  return marks;
}

/** How far each flat mark stands off the pod's side (the filler neck is no flat mark: it is turned, out of the face itself). */
const MARK_LIFT: Readonly<Record<Exclude<PodMark['kind'], 'neck'>, number>> = {
  frame: POD_SHAPE.lift.frame,
  recess: POD_SHAPE.lift.inset,
  slat: POD_SHAPE.lift.raised,
  strap: POD_SHAPE.lift.inset,
  gauge: POD_SHAPE.lift.raised,
  seam: POD_SHAPE.lift.inset,
  handle: POD_SHAPE.lift.raised,
  latch: POD_SHAPE.lift.raised,
};

/**
 * One mass under a diesel car's floor: its flat sides, the two bevels, the foot and both ends (the top is the car's floor: not drawn), and on each side the marks of its
 * form. The section's lower corners are cut back by `POD_SHAPE.bevel`; the sides are flat (a person sees them nearly square on).
 */
export function underfloorPod(soup: Soup, p: PodBox): void {
  const c = col(p.colour);
  const b = POD_SHAPE.bevel;
  const section: [number, number][] = [[p.x0, p.y1], [p.x0, p.y0 + b], [p.x0 + b, p.y0], [p.x1 - b, p.y0], [p.x1, p.y0 + b], [p.x1, p.y1]];
  const centre: V3 = [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, (p.z0 + p.z1) / 2];
  for (let i = 0; i + 1 < section.length; i++) {
    const a = section[i] as [number, number];
    const d = section[i + 1] as [number, number];
    soup.face([[a[0], a[1], p.z0], [d[0], d[1], p.z0], [d[0], d[1], p.z1], [a[0], a[1], p.z1]], centre, c);
  }
  for (const [z, nz] of [[p.z0, -1], [p.z1, 1]] as const) soup.fan(section.map(([x, y]): V3 => [x, y, z]), [0, 0, nz], c);
  for (const sx of [-1, 1] as const) {
    const n: V3 = [sx, 0, 0];
    for (const m of podMarks(p)) {
      if (m.kind === 'neck') {
        const r = (m.y1 - m.y0) / 2;
        lathe(soup, axisX(sx * p.x1, (m.y0 + m.y1) / 2, (m.z0 + m.z1) / 2, sx), [[0, r], [POD_SHAPE.neck.length, r], [POD_SHAPE.neck.length, 0]], 8, [col(POD_PARTS.neck), col(POD_PARTS.cap)]);
        continue;
      }
      const x = sx * (p.x1 + MARK_LIFT[m.kind]);
      soup.quad([[x, m.y0, m.z0], [x, m.y0, m.z1], [x, m.y1, m.z1], [x, m.y1, m.z0]], [n, n, n, n], col(POD_PARTS[m.kind]));
    }
  }
}

/** The dark plate between two neighbouring masses that joins them to the frame they hang from (the raft's cross-member): it fills the gap in the dark, a little inside both sides. */
export function podHanger(soup: Soup, a: PodBox, b: PodBox): void {
  const half = Math.min(a.x1, b.x1) - 0.04;
  soup.box(-half, half, Math.max(a.y0, b.y0) + 0.05, a.y1, a.z1, b.z0, col(POD_PARTS.recess), '+y');
}
