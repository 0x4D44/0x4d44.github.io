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
//       with a dark web and a lighter rim. (Round 6: the AT300's frame is traced from `GWR 802003 835003 leading bogie revised fittings.jpg` instead, point by point, in
//       `train-bogie-trace.ts`; the wheels, discs and the palette are still read from this one.)
//   tl700_03_gatwick_bogie_28898326470.jpg   a Siemens SF7000 (Class 700) bogie: INSIDE frame (the wheels stand outside it),
//       plain light-grey wheel webs with a hub cover and a rust-brown rim band, the frame, a grey yaw damper and the air spring
//       in a cluster between the wheels. (Round 6: the Desiro City's frame is traced from `Class 700 Thameslink at Gatwick station - 28898326470.jpg` (Elsie esq., CC BY 2.0), the same picture
//       in its Commons form, point by point, in `train-bogie-trace.ts`: the 'sf7000' style. The 'siemens' style is the frame first drawn from it by eye, which the Voyager (train-intercity.ts) wears.)
//   tl700_02_gatwick_side_28563922734.jpg   the same bogie from the platform: the same plain wheels, the cluster between them.
//   GC180-01-180-101-Kings-Cross-8077814883-.jpg   the Class 180's leading bogie from the cab end: a boxy dusty frame, axle
//       boxes with a spring pot above, a long gold-ended damper low across the middle.
//   class180-gc-york-side-arthur-2026-11-11.png   a Grand Central Class 180's leading cab car side on at York (supplied by Arthur, 2026-11-11; original source and licence unknown): the whole side of the
//       cab-end bogie, an OUTSIDE frame, a deep side beam with a window in it, an axle box with a round cap and a coil spring above it at each end, a vertical damper and a brake calliper
//       beside each, a slanting yaw damper with a yellow label and a clevis at each end, the car's bracket, an air spring over the middle and a bar under it. (Round 7: the Class 180's frame is traced
//       from it, point by point, in `train-bogie-trace.ts`: the 'coradia' style. The 'alstom' style is the frame first drawn by eye from the picture above; a diesel bogie given no style, the
//       Voyager 221 and the ScotRail DMUs still use its wheels, discs and drive.)
//   gn387_03_387123_cambridge.jpg   the Electrostar's cab bogie, about a hundred pixels across: a dark frame with a damper
//       across the middle (round 5: drawn as the generic outside-frame bogie from this one). Round 6: the Electrostar's frame is traced from
//       `Bogie and traction equipment beneath Door A1 of Class 375 Electrostar .jpg` (OathOn, CC0), point by point, in `train-bogie-trace.ts`.
// What no photograph shows is not drawn: no pipework, no cable runs, no bolt patterns, and nothing inside the frames. The one exception is what tells a motor bogie from a
// trailer bogie, which a bogie must show and no photograph here does: a motor bogie's traction motors with their gear cases (a diesel's final drives and cardan shaft), a trailer bogie's
// brake units, each hung low where it stands in view under the side beam; their sizes and places are ASSUMED (see `MOTOR_*`, `BRAKE_UNIT`, `GEARBOX_REACH`). Not the AT300's nor the Electrostar's: round 6 traced
// their frames from photographs, the AT300's of a trailer bogie and the Electrostar's of a powered one, which show nothing hung between the wheels, and no photograph shows what a motor bogie of the
// AT300 carries, so a motor bogie and a trailer bogie of each are the same bogie, and neither draws a drive or a brake unit (a GAP: what a motor bogie carries is not observable here). Nor the Desiro City's
// ('sf7000'): its frame is traced from a photograph of a bogie under a car numbered 403102, and the castings it shows between the wheels are the whole of what is drawn there, on either kind of bogie.
// Nor the Class 180's ('coradia', round 7): its frame is traced from a photograph of the cab-end bogie (a trailer bogie in this model's layout, `EMU_BOGIES` in core/train.ts: ASSUMED), which shows no
// brake unit or motor between the wheels, so none is drawn on either kind of bogie, the discs and callipers being its brake; a motor bogie of it keeps the diesel's final drive (the 'alstom' kit's), a GAP:
// no photograph here shows what a driven bogie carries.
import * as THREE from 'three';
import { add, col, plain, Soup, unit } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { AT300_TRACE, CORADIA_TRACE, ELECTROSTAR_TRACE, SIEMENS_TRACE } from './train-bogie-trace.ts';
import type { Px, PxCircle, PxRect } from './train-bogie-trace.ts';

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

/**
 * Whose bogie is drawn: the Hitachi AT300 (Class 800/801), the Bombardier Electrostar (Class 387), the Siemens SF7000 traced from a photograph (Class 700/717: 'sf7000'), an inside-frame bogie drawn by eye
 * from the same photograph before it was traced ('siemens': the Voyagers wear it, train-intercity.ts), the Alstom Coradia 1000's drawn by eye ('alstom': what a diesel bogie wears by default, and the
 * Voyager 221's kit) or the Class 180's own, traced from a photograph of its cab-end bogie ('coradia', round 7: the Class 180 wears it, `BOGIE_STYLE` in train.ts).
 */
export type BogieStyle = 'hitachi' | 'electrostar' | 'siemens' | 'sf7000' | 'alstom' | 'coradia';

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
const axisZ = (x: number, y: number, z: number, dir: 1 | -1 = 1): Axis => ({ o: [x, y, z], a: [0, 0, dir], e1: [0, 1, 0], e2: [1, 0, 0] });

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
/** The SF7000's: light-grey frame, webs and covers, a rust-brown rim, black rubber (tl700_03_gatwick_bogie_28898326470.jpg). The traced frame ('sf7000') takes its wheels, discs and axles from it and paints its own parts (`SF7000_PAINT`). */
const SIEMENS_PALETTE: Palette = {
  frame: col(0x8d939a), box: col(0x7d838a), cap: col(0xa4a9af), spring: col(0x5d6168), coil: col(0x2f3135),
  tread: col(0x8f949b), rim: col(0x9b5b36), web: col(0xa7acb2), hub: col(0xb3b8be), inner: col(0x6f747a),
  disc: col(0x62676e), discRim: col(0x7d8289), damper: col(0x959ba1), clevis: col(0x7a8087),
  motor: col(0x4d5259), gear: col(0x73787f), axle: col(0x575b61), rubber: col(0x25272a), accent: col(0xb0262c),
};
const PALETTES: Record<BogieStyle, Palette> = {
  // the AT300's: near-black frame and boxes with a lighter steel cap and rim (lner-gwr800-bogie-detail-2017.jpg), a yellow step
  hitachi: {
    frame: col(0x474c54), box: col(0x363a41), cap: col(0x4f545b), spring: col(0x5f646b), coil: col(0x2b2d31),
    tread: col(0x9a9fa6), rim: col(0x6b7078), web: col(0x484c53), hub: col(0x80858c), inner: col(0x2f3238),
    disc: col(0x70757c), discRim: col(0x868b92), damper: col(0x1d1f23), clevis: col(0x5c6168),
    motor: col(0x5b6068), gear: col(0x6a6f77), axle: col(0x34373c), rubber: col(0x1f2125), accent: col(0xd9b11a),
  },
  // the Electrostar's: the neutral dark grey of the bogie in OathOn's photograph (brake dust and dirt over cast grey: the beam body 0x373635 in shade, the pack black, the cap 0x525152, the shoe beam 0x454341, the bag 0x67645e lit); the wheels' are as they were
  electrostar: {
    frame: col(0x4a4947), box: col(0x2f2e2c), cap: col(0x555453), spring: col(0x67645e), coil: col(0x2c2b29),
    tread: col(0x9a9fa6), rim: col(0x6d727a), web: col(0x4a4f57), hub: col(0x80858c), inner: col(0x30343a),
    disc: col(0x70757c), discRim: col(0x868b92), damper: col(0x302f2e), clevis: col(0x4f4e4b),
    motor: col(0x5b6068), gear: col(0x6a6f77), axle: col(0x34373c), rubber: col(0x1f2125), accent: col(0xd9b11a),
  },
  siemens: SIEMENS_PALETTE,
  sf7000: SIEMENS_PALETTE,
  // the Class 180's: dusty brown-grey frame, gold-ended dampers (GC180-01-180-101-Kings-Cross-8077814883-.jpg)
  alstom: {
    frame: col(0x66625a), box: col(0x55514a), cap: col(0x7d796f), spring: col(0x5f5b53), coil: col(0x32302c),
    tread: col(0x9a9fa6), rim: col(0x6d7077), web: col(0x45474c), hub: col(0x80848a), inner: col(0x303236),
    disc: col(0x70757c), discRim: col(0x868b92), damper: col(0xb8923a), clevis: col(0x6f6a60),
    motor: col(0x5f646b), gear: col(0x777c83), axle: col(0x36373a), rubber: col(0x1f2125), accent: col(0xb8923a),
  },
  // the Class 180's own, round 7: the medians of the parts' pixels in the cab-end bogie's photograph (`class180-gc-york-side-arthur-2026-11-11.png`; the bogie stands in the body's shade, so the beam is a warm
  // dark grey, 0x535351 on the left and 0x625f58 on the right, the arm and neck 0x454547 to 0x5e5b53, the caps 0x535556 and 0x5a5c5e, the spring drums 0x454747 and 0x585757 and their dark cores 0x1f1e22), the
  // yaw damper's body 0x8e8b80 and its label 0xe6d979 (the accent, which paints the window's edges too); the tyre is 0x262628 and the light ring of the brake disc on each wheel's outer face 0x4d4947, so the
  // wheel's web (the ring) and its rim band (the tyre) take those; the rest of the wheel is as it was
  coradia: {
    frame: col(0x5b5954), box: col(0x504e4d), cap: col(0x565859), spring: col(0x505252), coil: col(0x1f1e22),
    tread: col(0x9a9fa6), rim: col(0x232224), web: col(0x4d4947), hub: col(0x80848a), inner: col(0x303236),
    disc: col(0x70757c), discRim: col(0x868b92), damper: col(0x8e8b80), clevis: col(0x4a4a4c),
    motor: col(0x5f646b), gear: col(0x777c83), axle: col(0x36373a), rubber: col(0x1f2125), accent: col(0xe6d979),
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

/**
 * A trailer bogie's brake units: each disc's calliper is carried down on a strap to a brake cylinder that lies along the bogie, low between the wheel and the middle, where a motor bogie
 * hangs its motor (round 5: the round-4 score found a motor bogie and a trailer bogie "the same frame, only a small end bell", because the discs and callipers stand behind the wheels
 * and the side beam and nothing of the brakes was in view). The cylinder's axis is `y` over the rail head (its flange's lowest point stands `MOTOR_FLOOR` over it, as a motor's does), it is
 * `radius` round and stands from `z0` to `z1` along the bogie from its axle, and its far end carries a flange `flange` round and `flangeLength` long; the strap is `strap` across. No photograph
 * shows these bogies' brake units, so the shapes and sizes are ASSUMED (a calliper's cylinder of this kind is about this big), and so is that the motor bogie, whose axles carry the same
 * discs, has no unit hanging below them (its motor is there).
 */
export const BRAKE_UNIT = { y: 0.18, radius: 0.065, z0: 0.3, z1: 0.74, flange: 0.08, flangeLength: 0.03, strap: 0.05, sides: 8 } as const;

/**
 * Two brake discs a side of the middle on each axle, each with a calliper on its rim toward the middle of the bogie (axle-mounted discs: ASSUMED), and on a trailer bogie its brake unit (`BRAKE_UNIT`)
 * (not the AT300's: its photograph, of a trailer bogie, shows nothing hung between the wheels, so none is drawn there, on a trailer or on a motor bogie; nor the Electrostar's, nor the Desiro City's,
 * whose frames are traced from photographs that show no brake unit hung under the beam; nor the Class 180's ('coradia', round 7), whose photograph, of a trailer bogie too, shows a calliper at each
 * end of the frame, traced with it, and no brake unit in the dark between the wheels).
 */
function brakes(soup: Soup, spec: BogieSpec, pal: Palette): void {
  const r = spec.radius;
  const style = bogieStyle(spec);
  const t = DISC_THICKNESS / 2;
  const unit = BRAKE_UNIT;
  for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) {
    const inward = az < 0 ? 1 : -1;
    for (const sx of [-1, 1]) {
      lathe(soup, axisX(sx * 0.3, r, az), [[-t, 0], [-t, DISC_RADIUS], [t, DISC_RADIUS], [t, 0]], DISC_SIDES, [pal.disc, pal.discRim, pal.disc]);
      const [x0, x1] = xs(sx, 0.3 - 0.05, 0.3 + 0.05);
      const z0 = az + inward * 0.2;
      const z1 = az + inward * 0.34;
      soup.box(x0, x1, r - 0.07, r + 0.07, Math.min(z0, z1), Math.max(z0, z1), pal.clevis);
      if (spec.motor || style === 'hitachi' || style === 'electrostar' || style === 'sf7000' || style === 'coradia') continue;
      // the strap down from the calliper, and the cylinder it carries, with its flange on the end toward the middle of the bogie
      const [sx0, sx1] = xs(sx, 0.3 - unit.strap / 2, 0.3 + unit.strap / 2);
      const strapZ0 = az + inward * unit.z0;
      const strapZ1 = az + inward * (unit.z0 + unit.strap);
      soup.box(sx0, sx1, unit.y - unit.radius, r - 0.07, Math.min(strapZ0, strapZ1), Math.max(strapZ0, strapZ1), pal.clevis);
      const cyl = axisZ(sx * 0.3, unit.y, az + inward * unit.z0, inward);
      const length = unit.z1 - unit.z0;
      // (the cylinder is open at the flange's end: the flange's own cap closes it, and the two never share a plane)
      tube(soup, cyl, 0, length, unit.radius, unit.sides, pal.disc, 'start');
      tube(soup, cyl, length - unit.flangeLength, length, unit.flange, unit.sides, pal.discRim, 'both');
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

/**
 * How far out from the centre line each part of the AT300's frame stands, as [from, to] or one centre line (metres). ASSUMED: a side-on photograph shows no depth. The beam, the axle
 * box, the cap, the spring and the step keep the depths round 4 gave them, so the wheel zone and the 1.15 m envelope are as they were; the parts new in round 6 stand just outboard of the
 * beam's face (1.065 m) or, for the damper and the springs, under the end block. The pedestal strap is the outermost thing at an axle box: in the photograph it hides the middle of the spring
 * stack, which is 0.31 m across and so stands out to 1.14 m, so the strap's face stands at 1.145 m and its window at 1.147 m (the envelope is 1.15 m).
 */
const AT300_DEPTH = {
  beam: [0.975, 1.065],
  box: [0.955, 1.085],
  cap: [1.085, 1.12],
  sensor: [1.085, 1.11],
  spring: 0.985,
  damper: 1.0,
  lug: [1.065, 1.085],
  pedestal: [1.0, 1.145],
  window: 1.147,
  bracket: [1.072, 1.117],
  yaw: 1.095,
  clevis: [1.07, 1.125],
  rod: 1.09,
  clamp: [1.065, 1.115],
  lever: [1.082, 1.106],
  ball: [1.07, 1.12],
  boss: [1.065, 1.071],
  step: [0.98, 1.14],
  wall: [1.065, 1.1],
} as const;
/**
 * The AT300's air spring: a pedestal on the middle of each beam and the rubber bag on it (centre x, radius of each). ASSUMED, as the depths are: the photograph shows the bag 0.49 m across and the
 * pedestal's band as wide, but not how far out they stand; the bag is drawn 0.46 m across, centred 0.91 m out, so that it stays inside the 1.15 m envelope.
 */
const AT300_AIR = { x: 0.91, pedestal: 0.2, bag: 0.23 } as const;

/**
 * A photograph's pixels as the bogie's metres, from the trace's two calibration points (`train-bogie-trace.ts`): the two axle-end caps stand a wheelbase apart, and their row is the
 * axle line, a wheel's radius over the rail head. `z` is along the bogie (the photograph's right is -z on the +x side), `y` over the rail head, `len` a length, and `mirror` the
 * column an end feature has at the other end.
 */
interface Tracer {
  z(px: number): number;
  /** The height over the rail head of the photograph's row `py`. A photograph that looks down on the bogie (a `view`) lifts a part that stands further in than the plane of its calibration points: `x` is how far out from the centre line the part stands (absent: in that plane). */
  y(py: number, x?: number): number;
  len(p: number): number;
  mirror(px: number): number;
}
/** A photograph taken looking down on the bogie from outside: the camera's elevation in degrees, and how far out from the centre line the plane of the calibration points stands. */
interface TracerView {
  elevation: number;
  ref: number;
}
function tracer(caps: readonly [Px, Px], spec: Pick<BogieSpec, 'radius' | 'wheelbase'>, view?: TracerView): Tracer {
  const scale = (caps[1][0] - caps[0][0]) / spec.wheelbase;
  const centre = (caps[0][0] + caps[1][0]) / 2;
  const axleRow = (caps[0][1] + caps[1][1]) / 2;
  // a point `d` nearer the camera than the reference plane appears d * sin(elevation) lower, and every height is foreshortened by cos(elevation): a part's height over the axle line
  // is its apparent height, less the lift its depth gives it, over that cosine (a photograph taken level has neither: sin 0, cos 1)
  const sin = view ? Math.sin((view.elevation * Math.PI) / 180) : 0;
  const cos = view ? Math.cos((view.elevation * Math.PI) / 180) : 1;
  const ref = view ? view.ref : 0;
  return {
    z: (px) => -(px - centre) / scale,
    y: (py, x = ref) => spec.radius + ((axleRow - py) / scale - (ref - x) * sin) / cos,
    len: (p) => p / scale,
    mirror: (px) => 2 * centre - px,
  };
}

/** The AT300's side beam as one outline in the photograph's pixels, clockwise from the left end block's top corner: over the top, down the right end block, the slot's roof, arch and floor and the arm's lower edge on the right, the deep middle's lower edge, and the same on the left. */
function at300BeamPx(): Px[] {
  const b = AT300_TRACE.beam;
  const centre = (AT300_TRACE.caps[0][0] + AT300_TRACE.caps[1][0]) / 2;
  const flip = (p: Px): Px => [2 * centre - p[0], p[1]];
  const mouth = (b.slotRoof[0] as Px)[0];
  return [
    ...b.top,
    ...[...b.top].reverse().map(flip),
    ...b.end.map(flip),
    ...b.slotRoof.map(flip),
    flip([b.archFoot, b.slotFloor]),
    flip([mouth, b.slotFloor]),
    ...b.bottom.map(flip),
    ...[...b.bottom].reverse(),
    [mouth, b.slotFloor],
    [b.archFoot, b.slotFloor],
    ...[...b.slotRoof].reverse(),
    ...[...b.end].reverse(),
  ];
}

/** The profile (height, radius) of the AT300's primary spring stack of height `h` and radius `rho`: a band at each end and a waist between them. */
function springStack(h: number, rho: number): [number, number][] {
  return [[0, 0], [0, 0.92 * rho], [0.1 * h, rho], [0.42 * h, rho], [0.5 * h, 0.8 * rho], [0.58 * h, rho], [0.9 * h, rho], [h, 0.92 * rho], [h, 0]];
}

/**
 * The AT300's side frame, traced from `AT300_TRACE`'s photograph: what is drawn is what the photograph shows, in the plane of the side beam, and the depths across the bogie
 * (`AT300_DEPTH`) are ASSUMED. The beam is one plate of the traced outline on each side; at each end stand the axle box with its cap and sensor housing, the spring stack, the
 * vertical damper, the lug and the pedestal strap; along the middle the car's cast bracket, the yaw damper, the anti-roll rod and its lever, the round bosses and the step; and
 * over the middle the air spring on its pedestal. The far side beam carries the middle's one-sided parts turned half a turn about the vertical (z -> -z). A trailer bogie and a
 * motor bogie are the same here: no photograph shows what a motor bogie carries between its wheels, and the photograph of a trailer bogie shows nothing hanging there.
 */
function at300Frame(F: Soup, S: Soup, spec: BogieSpec, pal: Palette): void {
  const t = AT300_TRACE;
  const T = tracer(t.caps, spec);
  const D = AT300_DEPTH;
  const r = spec.radius;
  const metres = (p: Px): P2 => [T.z(p[0]), T.y(p[1])];
  /** A rectangle of the photograph as the metres it spans: along the bogie (z0 < z1) and up (y0 < y1). */
  const span = (q: PxRect): { z0: number; z1: number; y0: number; y1: number } => ({ z0: Math.min(T.z(q[0]), T.z(q[2])), z1: Math.max(T.z(q[0]), T.z(q[2])), y0: T.y(q[3]), y1: T.y(q[1]) });
  const mirrored = (q: PxRect): PxRect => [T.mirror(q[2]), q[1], T.mirror(q[0]), q[3]];
  const circle = (c: PxCircle, flip: boolean): { z: number; y: number; r: number } => ({ z: T.z(flip ? T.mirror(c.c[0]) : c.c[0]), y: T.y(c.c[1]), r: T.len(c.r) });
  const beam = at300BeamPx().map(metres);
  const bracket = t.bracket.map(metres);
  const lever = t.lever.map(metres);
  const topMid = T.y((t.beam.top[t.beam.top.length - 1] as Px)[1]);
  const pedestalTop = T.y(t.air.base);
  for (const sx of [-1, 1] as const) {
    /** The far side beam turns the middle's parts half a turn about the vertical. */
    const zs = (s: { z0: number; z1: number }): [number, number] => (sx > 0 ? [s.z0, s.z1] : [-s.z1, -s.z0]);
    const [bx0, bx1] = xs(sx, D.beam[0], D.beam[1]);
    plate(F, beam, bx0, bx1, pal.frame, pal.box, sx);
    // the two ends: each is the left end's mirror
    for (const flip of [false, true]) {
      const at = (q: PxRect): { z0: number; z1: number; y0: number; y1: number } => span(flip ? mirrored(q) : q);
      const az = (flip ? -1 : 1) * (spec.wheelbase / 2);
      const [ax0, ax1] = xs(sx, D.box[0], D.box[1]);
      const box = at(t.end.box);
      F.box(ax0, ax1, box.y0, box.y1, box.z0, box.z1, pal.box);
      tube(F, axisX(sx * D.cap[0], r, az, sx), 0, D.cap[1] - D.cap[0], T.len(t.end.capRadius), 10, pal.cap, 'end');
      const [sx0, sx1] = xs(sx, D.sensor[0], D.sensor[1]);
      const sensor = at(t.end.sensor);
      F.box(sx0, sx1, sensor.y0, sensor.y1, sensor.z0, sensor.z1, pal.damper);
      const spring = at(t.end.spring);
      lathe(S, axisY(sx * D.spring, spring.y0, (spring.z0 + spring.z1) / 2), springStack(spring.y1 - spring.y0, (spring.z1 - spring.z0) / 2), 10, [pal.coil, pal.spring, pal.spring, pal.coil, pal.coil, pal.spring, pal.spring, pal.coil]);
      const damper = at(t.end.damper);
      tube(F, axisY(sx * D.damper, damper.y0, (damper.z0 + damper.z1) / 2), 0, damper.y1 - damper.y0, (damper.z1 - damper.z0) / 2, 8, pal.damper, 'start');
      const [lx0, lx1] = xs(sx, D.lug[0], D.lug[1]);
      const lug = at(t.end.lug);
      F.box(lx0, lx1, lug.y0, lug.y1, lug.z0, lug.z1, pal.cap);
      const [px0, px1] = xs(sx, D.pedestal[0], D.pedestal[1]);
      const pedestal = at(t.end.pedestal);
      F.box(px0, px1, pedestal.y0, pedestal.y1, pedestal.z0, pedestal.z1, pal.frame);
      const [wx0, wx1] = xs(sx, D.pedestal[1], D.window);
      const window = at(t.end.pedestalWindow);
      F.box(wx0, wx1, window.y0, window.y1, window.z0, window.z1, pal.rubber);
      const boss = circle(t.boss, flip);
      tube(F, axisX(sx * D.boss[0], boss.y, boss.z, sx), 0, D.boss[1] - D.boss[0], boss.r, 12, pal.spring, 'end');
    }
    // the car's cast bracket that hangs the yaw damper, and the damper between its foot and the beam
    const [kx0, kx1] = xs(sx, D.bracket[0], D.bracket[1]);
    plate(F, bracket.map((p): P2 => [sx * p[0], p[1]]), kx0, kx1, pal.box, pal.box, sx);
    const body = span(t.yaw.body);
    tube(F, axisZ(sx * D.yaw, (body.y0 + body.y1) / 2, sx * body.z1, -sx as 1 | -1), 0, body.z1 - body.z0, (body.y1 - body.y0) / 2, 10, pal.damper, 'both');
    const [cx0, cx1] = xs(sx, D.clevis[0], D.clevis[1]);
    for (const q of [t.yaw.clevisNear, t.yaw.clevisFar]) {
      const c = span(q);
      const [z0, z1] = zs(c);
      F.box(cx0, cx1, c.y0, c.y1, z0, z1, pal.clevis);
    }
    // the anti-roll rod down from the body to its ball joint, its clamps and collar, the lever it turns, and the boss on the lever's end
    const rodZ = sx * T.z(t.rod.x);
    tube(F, axisY(sx * D.rod, T.y(t.rod.bottom), rodZ), 0, T.y(t.rod.top) - T.y(t.rod.bottom), T.len(t.rod.radius), 8, pal.clevis, 'start');
    const [mx0, mx1] = xs(sx, D.clamp[0], D.clamp[1]);
    for (const q of [...t.rod.clamps, t.rod.collar]) {
      const c = span(q);
      const [z0, z1] = zs(c);
      F.box(mx0, mx1, c.y0, c.y1, z0, z1, pal.box);
    }
    const ball = circle(t.ball, false);
    tube(F, axisX(sx * D.ball[0], ball.y, sx * ball.z, sx), 0, D.ball[1] - D.ball[0], ball.r, 12, pal.cap, 'both');
    const [vx0, vx1] = xs(sx, D.lever[0], D.lever[1]);
    plate(F, lever.map((p): P2 => [sx * p[0], p[1]]), vx0, vx1, pal.clevis, pal.clevis, sx);
    const end = circle(t.leverBoss, false);
    tube(F, axisX(sx * D.ball[0], end.y, sx * end.z, sx), 0, D.ball[1] - D.ball[0], end.r, 12, pal.cap, 'both');
    // the yellow maintenance step: a tread with a wing at each end and a wall behind it hung from the beam's lower edge
    const [tx0, tx1] = xs(sx, D.step[0], D.step[1]);
    // (the photograph's right is -z: the step's right end, its second column, is its low z)
    const [stepZ0, stepZ1] = zs({ z0: T.z(t.step.z[1]), z1: T.z(t.step.z[0]) });
    const treadBottom = T.y(t.step.treadBottom);
    F.box(tx0, tx1, treadBottom, T.y(t.step.treadTop), stepZ0, stepZ1, pal.accent);
    for (const [wz0, wz1] of [[stepZ0, stepZ0 + 0.012], [stepZ1 - 0.012, stepZ1]] as const) F.box(tx0, tx1, T.y(t.step.treadTop), T.y(t.step.wingTop), wz0, wz1, pal.frame);
    const [ex0, ex1] = xs(sx, D.wall[0], D.wall[1]);
    F.box(ex0, ex1, T.y(t.step.treadTop), T.y(t.step.wallTop), stepZ0 + 0.03, stepZ1 - 0.03, pal.frame);
    // the air spring over the middle of the beam: a pedestal and the rubber bag on it, up to the underside of the body
    tube(S, axisY(sx * AT300_AIR.x, topMid, 0), 0, pedestalTop - topMid, AT300_AIR.pedestal, 12, pal.box);
    tube(S, axisY(sx * AT300_AIR.x, pedestalTop, 0), 0, BOGIE_TOP - pedestalTop - 0.005, AT300_AIR.bag, 12, pal.rubber, 'end');
  }
  // the cross beam between the side beams, under the beam's top
  F.box(-0.98, 0.98, r + 0.07, r + 0.27, -0.08, 0.08, pal.box);
}

/**
 * How far out from the centre line each part of the Electrostar's frame stands, as [from, to] or one centre line (metres). ASSUMED: a side-on photograph shows no depth. The beam keeps the
 * depths the AT300's gives its own (0.975 to 1.065 m), so the wheel zone and the 1.15 m envelope are as they were; the seat and the pack stand under the end block, the arm beside the axle
 * box, the housing and the cap on the axle box's end (the outermost, 1.13 m), the shelf under the beam, the shoe beam outboard of the arms, and the air spring on the beam's middle, its bag
 * standing 0.77 m out so that its outer edge is inside the envelope (1.145 m). No two parts of the frame share a plane of the same facing, so a face is told from its neighbour's by its plane.
 */
const ES_DEPTH = {
  beam: [0.975, 1.065],
  seat: [0.985, 1.07],
  pack: [0.99, 1.06],
  damper: 1.02,
  arm: [1.0, 1.05],
  housing: [1.065, 1.095],
  cap: [1.095, 1.13],
  bracket: [1.06, 1.1],
  shelf: [0.995, 1.055],
  shoe: [1.035, 1.105],
  air: 0.77,
} as const;
/** The Electrostar's air spring: the radius of the dark pedestal between the beam and the bag (ASSUMED: the photograph shows the pedestal's height, not its width). */
const ES_AIR_PEDESTAL = 0.3;

/** The profile (height, radius) of a pancake air spring of height `h` and radius `rho`: a flat bottom, a rolled edge of radius `h` / 2 in six steps, and a flat top. */
function pancake(h: number, rho: number): [number, number][] {
  const roll = h / 2;
  const out: [number, number][] = [[0, 0]];
  for (let k = -3; k <= 3; k++) {
    const phi = (k * Math.PI) / 6;
    out.push([roll + roll * Math.sin(phi), rho - roll + roll * Math.cos(phi)]);
  }
  out.push([h, 0]);
  return out;
}

/**
 * The Electrostar's side frame, traced from `ELECTROSTAR_TRACE`'s photograph: what is drawn is what the photograph shows, in the plane of the side beam, and the depths across the bogie
 * (`ES_DEPTH`) are ASSUMED. The beam is one plate of the traced outline on each side; at each end stand the spring seat and the dark pack of the primary springs under the end block, the
 * vertical damper, the axle-box arm, the round housing with its cap on the axle, and the cast lug; along the middle the bolted shelf under the beam, the shoe beam low along the bogie, and
 * over the middle the air spring (a pancake bag on a pedestal). The two ends are not each other's mirror, so each is traced; the far side beam is the near one turned half a turn about the
 * vertical (z -> -z), ASSUMED. A trailer bogie and a motor bogie are the same here: the photograph of a P3-25 (a powered bogie) shows nothing hung between its wheels, and none shows a trailer bogie's.
 */
function electrostarFrame(F: Soup, S: Soup, spec: BogieSpec, pal: Palette): void {
  const t = ELECTROSTAR_TRACE;
  const T = tracer(t.caps, spec);
  const D = ES_DEPTH;
  const r = spec.radius;
  const metres = (p: Px): P2 => [T.z(p[0]), T.y(p[1])];
  /** A rectangle of the photograph as the metres it spans: along the bogie (z0 < z1) and up (y0 < y1). */
  const span = (q: PxRect): { z0: number; z1: number; y0: number; y1: number } => ({ z0: Math.min(T.z(q[0]), T.z(q[2])), z1: Math.max(T.z(q[0]), T.z(q[2])), y0: T.y(q[3]), y1: T.y(q[1]) });
  const beam = t.beam.map(metres);
  const bag = span(t.air.bag);
  const beamTop = T.y(t.air.base);
  for (const sx of [-1, 1] as const) {
    /** The far side beam turns everything half a turn about the vertical. */
    const turn = (p: P2): P2 => [sx * p[0], p[1]];
    const zs = (s: { z0: number; z1: number }): [number, number] => (sx > 0 ? [s.z0, s.z1] : [-s.z1, -s.z0]);
    const [bx0, bx1] = xs(sx, D.beam[0], D.beam[1]);
    plate(F, beam.map(turn), bx0, bx1, pal.frame, pal.box, sx);
    for (const [end, cap] of [[t.left, t.caps[0]], [t.right, t.caps[1]]] as const) {
      const seat = span(end.plate);
      const [sz0, sz1] = zs(seat);
      const [qx0, qx1] = xs(sx, D.seat[0], D.seat[1]);
      F.box(qx0, qx1, seat.y0, seat.y1, sz0, sz1, pal.frame);
      const pack = span(end.pack);
      const [kz0, kz1] = zs(pack);
      const [kx0, kx1] = xs(sx, D.pack[0], D.pack[1]);
      S.box(kx0, kx1, pack.y0, pack.y1, kz0, kz1, pal.box);
      const damper = span(end.damper);
      const [dz0, dz1] = zs(damper);
      tube(F, axisY(sx * D.damper, damper.y0, (dz0 + dz1) / 2), 0, damper.y1 - damper.y0, (damper.z1 - damper.z0) / 2, 10, pal.frame, 'start');
      const [ax0, ax1] = xs(sx, D.arm[0], D.arm[1]);
      plate(F, end.arm.map(metres).map(turn), ax0, ax1, pal.frame, pal.box, sx);
      const az = sx * T.z(cap[0]);
      tube(F, axisX(sx * D.housing[0], r, az, sx), 0, D.housing[1] - D.housing[0], T.len(end.housing), 14, pal.box, 'end');
      tube(F, axisX(sx * D.cap[0], r, az, sx), 0, D.cap[1] - D.cap[0], T.len(end.cap), 12, pal.cap, 'end');
      const lug = span(end.bracket);
      const [lz0, lz1] = zs(lug);
      const [lx0, lx1] = xs(sx, D.bracket[0], D.bracket[1]);
      F.box(lx0, lx1, lug.y0, lug.y1, lz0, lz1, pal.clevis);
    }
    // the bolted shelf under the middle of the beam, and the shoe beam along the bottom of the bogie
    const shelf = span(t.shelf);
    const [hz0, hz1] = zs(shelf);
    const [hx0, hx1] = xs(sx, D.shelf[0], D.shelf[1]);
    F.box(hx0, hx1, shelf.y0, shelf.y1, hz0, hz1, pal.frame);
    const shoe = span(t.shoe);
    const [oz0, oz1] = zs(shoe);
    const [ox0, ox1] = xs(sx, D.shoe[0], D.shoe[1]);
    F.box(ox0, ox1, shoe.y0, shoe.y1, oz0, oz1, pal.box);
    // the air spring over the middle of the beam: a pedestal and the pancake bag on it, up to the underside of the body
    tube(S, axisY(sx * D.air, beamTop, 0), 0, bag.y0 - beamTop, ES_AIR_PEDESTAL, 14, pal.box);
    lathe(S, axisY(sx * D.air, bag.y0, 0), pancake(bag.y1 - bag.y0, (bag.z1 - bag.z0) / 2), 16, pal.spring);
  }
  // the cross beam between the side beams, under the beam's top
  F.box(-0.98, 0.98, r + 0.07, r + 0.27, -0.08, 0.08, pal.box);
}

/**
 * How far out from the centre line each part of the Class 180's frame stands, as [from, to] or one centre line (metres). ASSUMED: a side-on photograph shows no depth. The beam keeps the depths the AT300's
 * and the Electrostar's give theirs (0.975 to 1.065 m), so the wheel zone and the 1.15 m envelope are as they were; the axle box stands under the end block with its housing and cap on its end (the cap the outermost
 * thing, 1.13 m), the primary spring on the box's axis 0.985 m out (its drum, 0.154 m in radius at most, stands inside the envelope), the vertical damper outboard of the box along the bogie, the calliper beyond that in
 * front of the wheel (0.84 to 0.95 m: clear of the wheel's hub cover, 0.8155 m, and inboard of the box), the bracket, the window's yellow edges and the boss on the beam's outer face, the yaw damper's axis 1.08 m out
 * (its yellow label reaches 1.145 m) between two clevises, the bar under the beam, and the air spring centred 0.78 m out, so that its 0.252 m radius leaves it inside the beam's outer face (1.032 m).
 */
const CORADIA_DEPTH = {
  beam: [0.975, 1.065],
  box: [0.955, 1.07],
  housing: [1.07, 1.1],
  cap: [1.1, 1.13],
  spring: 0.985,
  damper: 1.025,
  calliper: [0.84, 0.95],
  boss: [1.065, 1.085],
  window: [1.065, 1.085],
  bracket: [1.07, 1.11],
  yaw: 1.08,
  clevis: [1.06, 1.12],
  bar: [0.995, 1.055],
  air: 0.78,
} as const;
/** How much bigger than the yaw damper's body its yellow label's band is (metres in radius). */
const CORADIA_LABEL = 0.003;

/**
 * The Class 180's side frame, traced from `CORADIA_TRACE`'s photograph: what is drawn is what the photograph shows, in the plane of the side beam, and the depths across the bogie (`CORADIA_DEPTH`) are ASSUMED. The
 * beam is one plate of the traced outline on each side (end blocks on the springs, swan necks, a window cut in the middle with its yellow edges, pockets under the blocks, the arms and the lower edge); at each end stand the
 * axle box with its round housing and cap, the primary spring (a dark core and a drum), the vertical damper, the brake calliper and the round boss on the neck; along the middle the car's bracket that hangs the yaw
 * damper, the damper (a long cylinder with its yellow label) between its two clevises, and the bar hung under the bogie; and over the middle the air spring up to the body. The two ends are not each other's mirror,
 * so each is traced; the far side beam is the near one turned half a turn about the vertical (z -> -z), ASSUMED. A trailer bogie and a motor bogie are the same here (the photograph is of a trailer bogie, the
 * cab end's, and shows no brake unit or drive between the wheels): a motor bogie keeps the diesel's final drive (`finalDrive`), as it had.
 */
function coradiaFrame(F: Soup, S: Soup, spec: BogieSpec, pal: Palette): void {
  const t = CORADIA_TRACE;
  const T = tracer(t.caps, spec);
  const D = CORADIA_DEPTH;
  const r = spec.radius;
  const metres = (p: Px): P2 => [T.z(p[0]), T.y(p[1])];
  /** A rectangle of the photograph as the metres it spans: along the bogie (z0 < z1) and up (y0 < y1). */
  const span = (q: PxRect): { z0: number; z1: number; y0: number; y1: number } => ({ z0: Math.min(T.z(q[0]), T.z(q[2])), z1: Math.max(T.z(q[0]), T.z(q[2])), y0: T.y(q[3]), y1: T.y(q[1]) });
  const beam = t.beam.map(metres);
  const bracket = t.bracket.map(metres);
  const sill = t.window.right.map(metres);
  const baseY = T.y(t.air.base);
  const bag = T.len((t.air.right - t.air.left) / 2);
  const yaw = t.yaw;
  for (const sx of [-1, 1] as const) {
    /** The far side beam turns everything half a turn about the vertical. */
    const turn = (p: P2): P2 => [sx * p[0], p[1]];
    const zs = (s: { z0: number; z1: number }): [number, number] => (sx > 0 ? [s.z0, s.z1] : [-s.z1, -s.z0]);
    /** A box over a rectangle of the photograph, from depth `d[0]` to `d[1]`. */
    const block = (q: PxRect, d: readonly [number, number], colour: THREE.Color): void => {
      const s = span(q);
      const [z0, z1] = zs(s);
      const [x0, x1] = xs(sx, d[0], d[1]);
      F.box(x0, x1, s.y0, s.y1, z0, z1, colour);
    };
    const [bx0, bx1] = xs(sx, D.beam[0], D.beam[1]);
    plate(F, beam.map(turn), bx0, bx1, pal.frame, pal.box, sx);
    for (const [end, cap] of [[t.left, t.caps[0]], [t.right, t.caps[1]]] as const) {
      // the axle box, and the round housing and the cap on its end, both on the axle (a calibration point)
      block(end.box, D.box, pal.box);
      const az = sx * T.z(cap[0]);
      tube(F, axisX(sx * D.housing[0], r, az, sx), 0, D.housing[1] - D.housing[0], T.len(end.housing), 14, pal.box, 'end');
      tube(F, axisX(sx * D.cap[0], r, az, sx), 0, D.cap[1] - D.cap[0], T.len(end.cap), 12, pal.cap, 'end');
      // the primary spring: the dark core under the end block and the drum on the axle box, each a cylinder standing on the one below
      for (const [q, sides, colour] of [[end.core, 10, pal.coil], [end.drum, 12, pal.spring]] as const) {
        const s = span(q);
        const [z0, z1] = zs(s);
        tube(S, axisY(sx * D.spring, s.y0, (z0 + z1) / 2), 0, s.y1 - s.y0, (s.z1 - s.z0) / 2, sides, colour, 'both');
      }
      // the vertical damper beside the box, closed at its foot only (its head is under the end block's pocket)
      const damper = span(end.damper);
      const [dz0, dz1] = zs(damper);
      tube(F, axisY(sx * D.damper, damper.y0, (dz0 + dz1) / 2), 0, damper.y1 - damper.y0, (damper.z1 - damper.z0) / 2, 8, pal.frame, 'start');
      block(end.calliper, D.calliper, pal.clevis);
      tube(F, axisX(sx * D.boss[0], T.y(end.boss.c[1]), sx * T.z(end.boss.c[0]), sx), 0, D.boss[1] - D.boss[0], T.len(end.boss.r), 12, pal.cap, 'end');
    }
    // the window's yellow edges: the left one and the floor are bars, the right one slants (a plate of its outline)
    block(t.window.left, D.window, pal.accent);
    block(t.window.floor, D.window, pal.accent);
    const [wx0, wx1] = xs(sx, D.window[0], D.window[1]);
    plate(F, sill.map(turn), wx0, wx1, pal.accent, pal.accent, sx);
    // the car's bracket that hangs the yaw damper, and the damper between its clevises: a cylinder along the line between the ends' centres, its yellow label a band round it
    const [kx0, kx1] = xs(sx, D.bracket[0], D.bracket[1]);
    plate(F, bracket.map(turn), kx0, kx1, pal.box, pal.box, sx);
    const { axis, length } = axisBetween([sx * D.yaw, T.y(yaw.from[1]), sx * T.z(yaw.from[0])], [sx * D.yaw, T.y(yaw.to[1]), sx * T.z(yaw.to[0])]);
    const along = (col: number): number => ((col - yaw.from[0]) / (yaw.to[0] - yaw.from[0])) * length;
    tube(F, axis, 0, length, T.len(yaw.radius), 10, pal.damper, 'both');
    tube(F, axis, along(yaw.label[0]), along(yaw.label[1]), T.len(yaw.radius) + CORADIA_LABEL, 10, pal.accent, 'both');
    block(yaw.clevisLeft, D.clevis, pal.clevis);
    block(yaw.clevisRight, D.clevis, pal.clevis);
    block(t.bar, D.bar, pal.frame);
    // the air spring over the middle: a fourteen-sided drum standing on the window's floor up to the underside of the body
    tube(S, axisY(sx * D.air, baseY, 0), 0, BOGIE_TOP - baseY - 0.005, bag, 14, pal.rubber, 'end');
  }
  // the cross beam between the side beams, under the beam's top
  F.box(-0.98, 0.98, r + 0.07, r + 0.27, -0.08, 0.08, pal.box);
}

/**
 * An outside-frame bogie of the Class 180's maker: an axle box and a coil spring on each journal, a side beam resting on the springs,
 * an air spring on the middle of each beam, a yaw damper low across the middle, and a cross beam between the beams. (The AT300's is `at300Frame` and the Electrostar's
 * `electrostarFrame`, each traced from a photograph; round 7 traces the Class 180's own from a photograph of its cab-end bogie, `coradiaFrame`, the 'coradia' style. This one, drawn by eye, stays
 * for what still wears the 'alstom' kit: a diesel bogie given no style, and the kit's wheels, discs and bare far level that the Voyager 221 (whose frame is its own trace) and the ScotRail DMUs borrow.)
 */
function outsideFrame(F: Soup, S: Soup, spec: BogieSpec, pal: Palette): void {
  const r = spec.radius;
  const w = spec.wheelbase / 2;
  // a boxy straight beam with shallow ends (GC180-01: a squarer frame than the Hitachi's)
  const beam = beamOutline([[0, r + 0.02], [0.5, r + 0.02], [0.9, r + 0.2], [w + 0.32, r + 0.2], [w + 0.32, r + 0.46], [0.7, r + 0.46], [0, r + 0.4]]);
  const springTop = r + 0.26;
  for (const sx of [-1, 1]) {
    const [bx0, bx1] = xs(sx, 0.975, 1.065);
    plate(F, beam, bx0, bx1, pal.frame, pal.box, sx as 1 | -1);
    // the air spring on the middle of the beam, a rubber drum standing up to the underside of the body
    const topMid = r + 0.4;
    tube(S, axisY(sx * OUT_JOURNAL, topMid, 0), 0, BOGIE_TOP - topMid - 0.005, 0.12, 10, pal.rubber, 'end');
    for (const az of [-w, w]) {
      // the axle box, its round end cap, and the spring on top of it
      const [ax0, ax1] = xs(sx, 0.955, 1.085);
      F.box(ax0, ax1, r - 0.13, r + 0.11, az - 0.125, az + 0.125, pal.box);
      tube(F, axisX(sx * 1.085, r, az, sx as 1 | -1), 0, 0.035, 0.07, 10, pal.cap, 'end');
      coilSpring(S, sx * OUT_JOURNAL, r + 0.11, az, springTop - (r + 0.11), 0.062, pal);
    }
    // the yaw damper: a black cylinder along the bogie with a clevis at each end, on the outside of the beam
    const yD = r - 0.03;
    tube(F, axisZ(sx * 1.095, yD, -0.42), 0, 0.84, 0.032, 8, pal.damper);
    for (const z of [-0.47, 0.4]) {
      const [cx0, cx1] = xs(sx, 1.07, 1.125);
      F.box(cx0, cx1, yD - 0.045, yD + 0.045, z, z + 0.07, pal.clevis);
    }
  }
  // the cross beam between the side beams
  F.box(-0.98, 0.98, r + 0.2, r + 0.4, -0.08, 0.08, pal.box);
}

/**
 * An inside-frame bogie, drawn by eye (the 'siemens' style): the frame lies between the wheels with the axle boxes inboard of them, so from the side one sees
 * the plain wheels and, between them, the frame, a coil spring at each axle box, the air spring over the middle and a yaw damper
 * (tl700_03_gatwick_bogie_28898326470.jpg). Round 6 traces the Desiro City's own from that photograph (`sf7000Frame`); this one stays for the Voyagers (train-intercity.ts), which
 * wear it with a traction motor on their inner axle.
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

/**
 * How far out from the centre line each part of the Desiro City's bogie stands, as [from, to] or one centre line (metres). ASSUMED: a photograph shows no depth, and this one looks down on the
 * bogie, so each part's height follows from its depth too (`tracer`). The castings stand between the wheels, inboard of their inner faces (0.6525 m): the end castings reach 0.60 m, which keeps them
 * out of the wheels' discs, the grey casing and the centre casting stand where they do, the rod and the big vertical damper in front of them (rod 0.62 m, damper 0.70 m out), and the black air
 * spring is centred 0.42 m out (its outer edge 0.665 m). The yaw damper and the Y bracket hang from the body outboard of the wheels (the wheel's face is 0.7825 m out and its hub cover 0.8155 m): the
 * bracket's plate 0.83 to 0.87 m, the damper's axis 0.88 m, its two eyes out to 0.93 m, so the bogie reaches 0.935 m (the envelope is 1.15 m). No part of the frame shares a plane of the same
 * facing with another, except where one part stands against the next (the eyes overlap what they stand on by a centimetre), so a face is told from its neighbour's by its plane.
 */
const SF7000_DEPTH = {
  end: [0.44, 0.6],
  label: [0.46, 0.58],
  centre: [0.44, 0.62],
  rod: 0.62,
  damper: 0.7,
  bag: 0.42,
  yaw: 0.88,
  eyeLeft: [0.61, 0.93],
  eyeRight: [0.86, 0.93],
  bracket: [0.83, 0.87],
} as const;

/**
 * What each part of the Desiro City's bogie is painted: the median of its pixels in the photograph (`SIEMENS_TRACE`'s picture), as the Electrostar's palette is. The castings stand in the shade of the
 * body, so they are dark (the near end casting brown with brake dust); the yaw damper and the bracket stand outboard of the wheel, in the light.
 */
const SF7000_PAINT = {
  endLeft: col(0x423d36),
  endRight: col(0x272829),
  label: col(0x414141),
  centre: col(0x3b3e3f),
  eyeLeft: col(0x636366),
  eyeRight: col(0x53555c),
  rod: col(0x5b5a5a),
  damper: col(0x5c5e5e),
  bag: col(0x20201c),
  yaw: col(0x747a85),
  bracket: col(0x6e7683),
} as const;

/** The tracer of the Desiro City's photograph for a bogie: calibrated to the photograph's own wheelbase (the frame is the traced one whatever the wheelbase), looking down at the picture's elevation. */
function sf7000Tracer(spec: Pick<BogieSpec, 'radius' | 'track'>): Tracer {
  const t = SIEMENS_TRACE;
  return tracer(t.caps, { radius: spec.radius, wheelbase: t.wheelbase }, { elevation: t.elevation, ref: spec.track / 2 + WHEEL_WIDTH / 2 });
}

/** An axis along the line from `a` to `b`, with its length: the rings start upward, so a tube along a line near the horizontal has its first corner on top. */
function axisBetween(a: V3, b: V3): { axis: Axis; length: number } {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  const dir: V3 = [d[0] / length, d[1] / length, d[2] / length];
  // e2 is horizontal and across the line (up x dir), e1 the other way round the ring (dir x e2), which stands up
  const e2 = unit([dir[2], 0, -dir[0]]);
  const e1: V3 = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
  return { axis: { o: a, a: dir, e1, e2 }, length };
}

/**
 * The Desiro City's bogie frame (the Class 700 and 717), traced from `SIEMENS_TRACE`'s photograph: what is drawn is what the photograph shows between the wheels, each part at its depth
 * (`SF7000_DEPTH`, ASSUMED), with its height corrected for the camera looking down. At each end a casting (a box: the near one carries the brake block beside the wheel), then the grey casing with
 * its label, the centre casting that carries the wheelbase's mark, the vertical rod in front of the casing and the big vertical damper in front of the centre casting, the black air spring on the
 * centre casting, and outboard of the wheels the yaw damper (a thin cylinder and a thick one rising toward the right) between its two eyes, hung from the body's Y bracket. The two ends are not each
 * other's mirror, so each is traced; the far side beam is the near one turned half a turn about the vertical (z -> -z), ASSUMED. A trailer bogie and a motor bogie are the same here (the
 * photographs show one bogie, and what a bogie of the other kind carries is a GAP).
 */
function sf7000Frame(F: Soup, S: Soup, spec: BogieSpec): void {
  const t = SIEMENS_TRACE;
  const D = SF7000_DEPTH;
  const C = SF7000_PAINT;
  const T = sf7000Tracer(spec);
  /** A rectangle of the photograph as the metres it spans at depth `x`: along the bogie (z0 < z1) and up (y0 < y1). */
  const span = (q: PxRect, x: number): { z0: number; z1: number; y0: number; y1: number } => ({ z0: Math.min(T.z(q[0]), T.z(q[2])), z1: Math.max(T.z(q[0]), T.z(q[2])), y0: T.y(q[3], x), y1: T.y(q[1], x) });
  for (const sx of [-1, 1] as const) {
    /** The far side turns everything half a turn about the vertical. */
    const zs = (s: { z0: number; z1: number }): [number, number] => (sx > 0 ? [s.z0, s.z1] : [-s.z1, -s.z0]);
    /** A box over a rectangle of the photograph, from depth `d[0]` to `d[1]`; its outer face sets the heights. */
    const block = (q: PxRect, d: readonly [number, number], colour: THREE.Color): void => {
      const s = span(q, d[1]);
      const [z0, z1] = zs(s);
      const [x0, x1] = xs(sx, d[0], d[1]);
      F.box(x0, x1, s.y0, s.y1, z0, z1, colour);
    };
    block(t.casting.left, D.end, C.endLeft);
    block(t.casting.label, D.label, C.label);
    block(t.casting.centre, D.centre, C.centre);
    block(t.casting.right, D.end, C.endRight);
    // the vertical rod and the big vertical damper: ten-sided cylinders standing on their feet, closed at both ends
    for (const [q, depth, colour] of [[t.rod, D.rod, C.rod], [t.damper, D.damper, C.damper]] as const) {
      const s = span(q, depth);
      const [z0, z1] = zs(s);
      tube(F, axisY(sx * depth, s.y0, (z0 + z1) / 2), 0, s.y1 - s.y0, (s.z1 - s.z0) / 2, 10, colour, 'both');
    }
    // the air spring: a fourteen-sided drum on the centre casting's top, up to the underside of the body, centred on the middle of the bogie
    const foot = T.y(t.casting.centre[1], D.centre[1]);
    tube(S, axisY(sx * D.bag, foot, 0), 0, BOGIE_TOP - 0.005 - foot, Math.abs(T.z(t.bag.edge)), 14, C.bag, 'end');
    // the yaw damper: one straight line from the eye on the centre casting to the eye on the Y bracket, a thin ten-sided cylinder and, from the step on, a thick one, each closed where it
    // starts; the thick one is closed at its far end too
    const y = t.yaw;
    const a: V3 = [sx * D.yaw, T.y(y.from[1], D.yaw), sx * T.z(y.from[0])];
    const b: V3 = [sx * D.yaw, T.y(y.to[1], D.yaw), sx * T.z(y.to[0])];
    const { axis, length } = axisBetween(a, b);
    const step = ((y.step - y.from[0]) / (y.to[0] - y.from[0])) * length;
    tube(F, axis, 0, step, T.len(y.rodRadius), 10, C.yaw, 'start');
    tube(F, axis, step, length, T.len(y.bodyRadius), 10, C.yaw, 'both');
    block(y.eyeLeft, D.eyeLeft, C.eyeLeft);
    block(y.eyeRight, D.eyeRight, C.eyeRight);
    // the Y bracket in front of the wheel: one plate of the traced outline
    const [bx0, bx1] = xs(sx, D.bracket[0], D.bracket[1]);
    plate(F, t.bracket.map((p): P2 => [sx * T.z(p[0]), T.y(p[1], D.bracket[1])]), bx0, bx1, C.bracket, C.bracket, sx);
  }
  // the transom between the two sides' centre castings, which no photograph shows (it stands between them): 0.16 m along the bogie and 0.2 m deep, at the centre casting's mid height
  const mid = (T.y(t.casting.centre[1], D.centre[1]) + T.y(t.casting.centre[3], D.centre[1])) / 2;
  F.box(-(D.centre[0] + 0.01), D.centre[0] + 0.01, mid - 0.1, mid + 0.1, -0.08, 0.08, C.centre);
}

// --- the drive ----------------------------------------------------------------------------------------------------------

/**
 * Where the drive hangs. A bogie seen from the track side shows its side beam and, below the beam, whatever hangs lower between the wheels: a trailer bogie has its brake units
 * there (`BRAKE_UNIT`), so a motor bogie's drive hangs low enough for its lower part to stand in plain sight under the beam (no photograph shows it, so the heights are ASSUMED).
 * A traction motor's lowest point is this far over the rail head, in every style (its axis stands `MOTOR_FLOOR` + `MOTOR_RADIUS` up, whatever the wheel's size): a UK motor or gearbox
 * clears the rail head by about a tenth of a metre. (Round 4 had the axis 0.1 m under the axle line, the barrel 0.2 m in radius: its lowest point stood 0.12 m up, and little of it
 * showed under the beam.)
 */
export const MOTOR_FLOOR = 0.1;
/** A traction motor: its barrel's radius (a UK EMU's is about 0.5 m across: ASSUMED, no photograph shows one), its length across the bogie, and how far its rim stands clear of the wheel's rim beside it (along the bogie), so the whole of it is in view between the wheels. */
export const MOTOR_RADIUS = 0.25;
export const MOTOR_LENGTH = 0.62;
export const MOTOR_CLEAR = 0.02;
/** The boss of a motor's shaft end, standing out of each end shield: its radius and how far it stands out (its end is 0.325 m from the middle, short of the 0.33 m at which a gear case's face begins). ASSUMED. */
export const MOTOR_BOSS = { radius: 0.07, length: 0.015 } as const;
/** A diesel unit's cardan shaft hangs this far from the axle line (below it), and a gearbox casing reaches this far inboard of its axle. */
export const CARDAN_AXIS = -0.17;
export const GEARBOX_REACH = 0.62;
/** The shaft's radius and its yokes', in the diesel's final drive. ASSUMED, as the rest of it. */
export const CARDAN_RADIUS = 0.075;
export const YOKE_RADIUS = 0.11;

/**
 * A motor bogie's drive: a traction motor across the bogie on each axle's inboard side of the middle, its gear case on one end of it reaching
 * to the axle. (Frame-mounted motors with a gear case on the axle are the UK EMU arrangement; no photograph shows them, so the sizes are ASSUMED.)
 * The motor hangs low (`MOTOR_FLOOR` over the rail head) so its end stands in view under the side beam. The barrel is 16 sided: it is seen end on, and a 16-gon reads round at three
 * metres where a 14-gon showed its corners. Each end shield is the light steel of a hub, with the dark boss of the shaft's end standing out of it, so an end reads as a motor's and not as a plain disc.
 */
function tractionMotors(D: Soup, spec: BogieSpec, pal: Palette, caseX: [number, number]): void {
  const r = spec.radius;
  const y = MOTOR_FLOOR + MOTOR_RADIUS;
  const { radius: boss, length: stand } = MOTOR_BOSS;
  for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) {
    const dz = (az < 0 ? 1 : -1) * (r + MOTOR_RADIUS + MOTOR_CLEAR);
    const side = az < 0 ? 1 : -1;
    const L = MOTOR_LENGTH;
    lathe(
      D,
      axisX(-L / 2, y, az + dz),
      [[-stand, 0, 8], [-stand, boss, 8], [0, boss, 8], [0, MOTOR_RADIUS], [L, MOTOR_RADIUS], [L, boss, 8], [L + stand, boss, 8], [L + stand, 0, 8]],
      16,
      [pal.axle, pal.axle, pal.hub, pal.motor, pal.hub, pal.axle, pal.axle],
    );
    const [x0, x1] = xs(side, caseX[0], caseX[1]);
    D.box(x0, x1, y - MOTOR_RADIUS + 0.04, y + MOTOR_RADIUS, Math.min(az - 0.17, az + dz - 0.17), Math.max(az + 0.17, az + dz + 0.17), pal.gear);
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
  tube(D, axisZ(0, r + CARDAN_AXIS, z0), 0, span, CARDAN_RADIUS, 8, pal.motor);
  for (const zs of [z0, z0 + span - 0.04]) lathe(D, axisZ(0, r + CARDAN_AXIS, zs), [[0, 0], [0, YOKE_RADIUS], [0.04, YOKE_RADIUS], [0.04, 0]], 8, pal.hub);
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
  if (style === 'sf7000') {
    axles(parts.axles, spec, pal, spec.track / 2 + 0.05);
    sf7000Frame(parts.frame, parts.springs, spec);
  } else if (style === 'siemens') {
    axles(parts.axles, spec, pal, spec.track / 2 + 0.05);
    insideFrame(parts.frame, parts.springs, spec, pal);
  } else {
    axles(parts.axles, spec, pal, 0.96);
    if (style === 'hitachi') at300Frame(parts.frame, parts.springs, spec, pal);
    else if (style === 'electrostar') electrostarFrame(parts.frame, parts.springs, spec, pal);
    else if (style === 'coradia') coradiaFrame(parts.frame, parts.springs, spec, pal);
    else outsideFrame(parts.frame, parts.springs, spec, pal);
  }
  if (spec.motor && spec.diesel) finalDrive(parts.drive, spec, pal);
  else if (spec.motor && style !== 'hitachi' && style !== 'electrostar' && style !== 'sf7000' && style !== 'coradia') tractionMotors(parts.drive, spec, pal, style === 'siemens' ? [0.34, 0.45] : [0.34, 0.56]);
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
  if (style === 'sf7000') {
    // the Desiro City's bogie from far off: the castings between the wheels as one box a side (as high and as long as the traced four together), the air spring as a square drum up to the body, and the
    // yaw damper outboard of the wheel as a bar (the eyes' width), each in the colour of what it stands for, and the transom
    const t = SIEMENS_TRACE;
    const D = SF7000_DEPTH;
    const C = SF7000_PAINT;
    const T = sf7000Tracer(spec);
    const castings = [[t.casting.left, D.end], [t.casting.label, D.label], [t.casting.centre, D.centre], [t.casting.right, D.end]] as const;
    const zFirst = Math.max(...castings.map(([q]) => T.z(q[0])));
    const zLast = Math.min(...castings.map(([q]) => T.z(q[2])));
    const yLow = Math.min(...castings.map(([q, d]) => T.y(q[3], d[1])));
    const yHigh = Math.max(...castings.map(([q, d]) => T.y(q[1], d[1])));
    const foot = T.y(t.casting.centre[1], D.centre[1]);
    const bag = Math.abs(T.z(t.bag.edge)) * 0.8;
    const reach = T.len(t.yaw.bodyRadius);
    const barLow = Math.min(T.y(t.yaw.from[1], D.yaw), T.y(t.yaw.to[1], D.yaw)) - reach;
    const barHigh = Math.max(T.y(t.yaw.from[1], D.yaw), T.y(t.yaw.to[1], D.yaw)) + reach;
    for (const sx of [-1, 1] as const) {
      const [z0, z1] = sx > 0 ? [zLast, zFirst] : [-zFirst, -zLast];
      const [x0, x1] = xs(sx, D.centre[0], D.end[1]);
      soup.box(x0, x1, yLow, yHigh, z0, z1, C.centre);
      const [bx0, bx1] = xs(sx, D.bag - bag, D.bag + bag);
      soup.box(bx0, bx1, foot, BOGIE_TOP - 0.005, -bag, bag, C.bag);
      const zEnds = [T.z(t.yaw.to[0]), T.z(t.yaw.from[0])];
      const [yz0, yz1] = sx > 0 ? [zEnds[0] as number, zEnds[1] as number] : [-(zEnds[1] as number), -(zEnds[0] as number)];
      const [yx0, yx1] = xs(sx, D.eyeRight[0], D.eyeRight[1]);
      soup.box(yx0, yx1, barLow, barHigh, yz0, yz1, C.yaw);
    }
    const mid = (foot + T.y(t.casting.centre[3], D.centre[1])) / 2;
    soup.box(-(D.centre[0] + 0.01), D.centre[0] + 0.01, mid - 0.1, mid + 0.1, -0.08, 0.08, C.centre);
    return soup;
  }
  if (style === 'siemens') {
    for (const sx of [-1, 1]) {
      const [x0, x1] = xs(sx, 0.46, 0.58);
      soup.box(x0, x1, r - 0.16, r + 0.24, -(w + 0.12), w + 0.12, pal.frame);
    }
    soup.box(-0.5, 0.5, r + 0.1, r + 0.24, -0.08, 0.08, pal.frame);
    return soup;
  }
  if (style === 'coradia') {
    // the Class 180's bogie from far off: a slab a side as long as the traced beam and as high as the beam's area over its length, hung from the beam's top (so it keeps the beam's mass and its reach), and the
    // transom
    const t = CORADIA_TRACE;
    const T = tracer(t.caps, spec);
    const outline = t.beam.map((p): P2 => [T.z(p[0]), T.y(p[1])]);
    const zLow = Math.min(...outline.map((p) => p[0]));
    const zHigh = Math.max(...outline.map((p) => p[0]));
    const top = Math.max(...outline.map((p) => p[1]));
    const area = Math.abs(outline.reduce((sum, p, i) => sum + p[0] * (outline[(i + 1) % outline.length] as P2)[1] - (outline[(i + 1) % outline.length] as P2)[0] * p[1], 0)) / 2;
    for (const sx of [-1, 1] as const) {
      const [x0, x1] = xs(sx, CORADIA_DEPTH.beam[0], CORADIA_DEPTH.beam[1]);
      const [z0, z1] = sx > 0 ? [zLow, zHigh] : [-zHigh, -zLow];
      soup.box(x0, x1, top - area / (zHigh - zLow), top, z0, z1, pal.frame);
    }
    soup.box(-0.98, 0.98, r + 0.07, r + 0.27, -0.08, 0.08, pal.box);
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

// --- the roof hatches and the pantograph deck of the Electrostar ---------------------------------------------------------------
//
// An Electrostar's roof is a smooth silver deck with a hatch row let into it every so often, not a run of raised covers (the round-5 score: "AC fairings/vents/insulators/pan
// arrangement are generic"). Read off the roof of a Class 377 car from above, the same Electrostar body the 387 is (`377208 roof 5Y63 Blackfriars to Grove Park CSD.jpg` and its
// four sisters, train_photos, 2015-03-12, CC BY-SA 2.0; private review assets, not shipped): a panel across the whole flat of the roof, standing a few centimetres proud, with two
// rows of five rectangular louvre openings at one end of it, a round-cornered plate in the middle and an oval mesh grille at the other (and slotted tabs along both outer edges, not
// drawn). The Great Northern 387's footbridge photographs (`387115 Shepreth Branch Junc 210619.jpg` and `387118 on Shepreth Branch Junction 210619.jpg`, kitmasterbloke, 2019-06-21,
// CC BY 2.0) show the same rows on a 387, two to a car on a middle car (three on a cab car), the louvres on the near side of every row in both pictures: the train's left in the
// first (a unit with its left side in view), its right in the second, so the side varies with which way a unit faces (the 377's neighbouring cars differ too). The model draws the
// louvres on the right of a front car and of the cars behind it, on the left of a rear cab car (the same car turned about). The pantograph car's roof (the 377's, from the same
// photographs) is a dirty cream deck in a pocket: a high end casing at the car-end side, the hatch row on the other, the pantograph and its insulators standing on the deck
// between them. HOW MANY to a car and where along it (the photographs are oblique, so a place along a car is good to about a tenth of its length), every size (measured in the
// proportions of one hatch row, scaled so that the row's foot is the roof's width: a 1.7 m foot is itself an assumption) and the colours are ASSUMED; that the 387's pantograph
// car is built like the 377's is family evidence, not a 387 photograph.

export type RoofHatchStyle = 'electrostar';
export interface RoofHatchDef {
  /** metres along the car; the top's height over the crown; the half-width at the foot (which stands below the crown, in the roof) and at the top (the flat of the roof); the run of each sloping end */
  length: number;
  height: number;
  bw: number;
  tw: number;
  run: number;
  /** where on a car's stretch of roof the hatches' centres stand, as fractions of it, and how far a row keeps clear of the well and its casing */
  at: readonly number[];
  clear: number;
  /** the louvre cage: openings across by along, one opening's width across and length along, the pitch across and along, the cage's centre across (+ is the louvre side) */
  louvre: { cols: number; rows: number; w: number; l: number; pitchX: number; pitchZ: number; cx: number };
  /** the plate in the middle: half-sides across and along, and how far it stands over the top */
  plate: { hx: number; hz: number; lift: number };
  /** the oval grille on the side without the cage: its centre across, half-axes (across, along), and sides */
  oval: { cx: number; rx: number; rz: number; sides: number };
  /** how far the louvre openings and the oval stand over the top */
  lift: number;
  colours: { panel: number; plate: number; slot: number; oval: number };
  /** the pantograph car's deck under the kit and the pantograph: its half-width, its colour, and its top over the crown */
  deck: { half: number; colour: number; top: number };
  /** the high casing at the kit's end of the well: its length, and its clear gap from the kit's stretch */
  hump: { length: number; gap: number };
}
export const ROOF_HATCHES: Readonly<Record<RoofHatchStyle, RoofHatchDef>> = {
  electrostar: {
    length: 0.5,
    height: 0.025,
    bw: 0.85,
    tw: 0.74,
    run: 0.08,
    at: [0.3, 0.7],
    clear: 0.1,
    louvre: { cols: 5, rows: 2, w: 0.075, l: 0.09, pitchX: 0.105, pitchZ: 0.12, cx: 0.44 },
    plate: { hx: 0.16, hz: 0.18, lift: 0.004 },
    oval: { cx: -0.47, rx: 0.23, rz: 0.11, sides: 12 },
    lift: 0.003,
    colours: { panel: 0xb4b8be, plate: 0xc4c8cd, slot: 0x2b2e33, oval: 0x4a4e54 },
    deck: { half: 0.74, colour: 0x98927a, top: 0.004 },
    hump: { length: 1.6, gap: 0.1 },
  },
};

/**
 * The stretch of the high casing at the kit's end of a pantograph car's well [k0, k1] (see above), for the kit on the side `dir` of the pantograph (-1: toward lower z): it stands `gap` clear of
 * the well, `length` long, on the kit's own side of it.
 */
export function roofCasing(style: RoofHatchStyle, k0: number, k1: number, dir: 1 | -1): [number, number] {
  const c = ROOF_HATCHES[style].hump;
  return dir < 0 ? [k0 - c.gap - c.length, k0 - c.gap] : [k1 + c.gap, k1 + c.gap + c.length];
}

/** The stretch of a pantograph car's roof the hatch rows keep off: its well and its casing together. */
export function roofKeepOut(well: readonly [number, number], casing: readonly [number, number]): [number, number] {
  return [Math.min(well[0], casing[0]), Math.max(well[1], casing[1])];
}

/**
 * The z of each hatch row on the stretch [from, to] of a car's roof: one at each fraction of it (ROOF_HATCHES.at), less any whose panel comes within `clear` of `keep` (a pantograph car's well
 * and its casing, [start, end]) or lies on it.
 */
export function roofHatchCentres(style: RoofHatchStyle, from: number, to: number, keep: readonly [number, number] | null): number[] {
  const h = ROOF_HATCHES[style];
  return h.at.map((f) => from + f * (to - from)).filter((zc) => keep === null || !(zc + h.length / 2 + h.clear > keep[0] && zc - h.length / 2 - h.clear < keep[1]));
}

/** What a car's roof carries between its nose or end gap and its other end: the pantograph deck (null on a car without a well), the casing (null likewise) and the z of each hatch row. */
export interface RoofPlan {
  deck: [number, number] | null;
  casing: [number, number] | null;
  rows: number[];
}

/**
 * The plan of one car's roof over the stretch [from, to]: with no well, the hatch rows alone; with the well [k0, k1] of a pantograph car (its kit toward `dir`), the deck over the well, the casing
 * on the kit's side of it and only those rows that keep clear of both.
 */
export function roofPlan(style: RoofHatchStyle, from: number, to: number, well: readonly [number, number] | null, dir: 1 | -1): RoofPlan {
  if (well === null) return { deck: null, casing: null, rows: roofHatchCentres(style, from, to, null) };
  const casing = roofCasing(style, well[0], well[1], dir);
  return { deck: [well[0], well[1]], casing, rows: roofHatchCentres(style, from, to, roofKeepOut(well, casing)) };
}

/**
 * One hatch row of a roof (see above), centred on `zc` along a car whose crown is at `crown`; `side` is +1 for a car whose louvre cage is on the +x side (a front cab car's, the
 * train's right) and -1 for one turned about (a rear cab car's).
 */
export function roofHatch(soup: Soup, o: { style: RoofHatchStyle; zc: number; crown: number; side: 1 | -1 }): void {
  const h = ROOF_HATCHES[o.style];
  const z0 = o.zc - h.length / 2;
  const z1 = o.zc + h.length / 2;
  const yb = o.crown - 0.04;
  const yt = o.crown + h.height;
  const panel = col(h.colours.panel);
  // the panel: a flat-topped frustum, the covers' shape: it slopes from its foot to the top at each side and over `run` at each end
  const lo: V3[] = [[-h.bw, yb, z0], [h.bw, yb, z0], [h.bw, yb, z1], [-h.bw, yb, z1]];
  const hi: V3[] = [[-h.tw, yt, z0 + h.run], [h.tw, yt, z0 + h.run], [h.tw, yt, z1 - h.run], [-h.tw, yt, z1 - h.run]];
  const mid: V3 = [0, (yb + yt) / 2, o.zc];
  const f = (a: V3, b: V3, c: V3, d: V3): void => soup.face([a, b, c, d], mid, panel);
  f(hi[0] as V3, hi[1] as V3, hi[2] as V3, hi[3] as V3);
  for (let k = 0; k < 4; k++) f(lo[k] as V3, lo[(k + 1) % 4] as V3, hi[(k + 1) % 4] as V3, hi[k] as V3);
  const up: V3 = [0, 1, 0];
  // the louvre cage: a grid of dark openings on the top
  const L = h.louvre;
  const slot = col(h.colours.slot);
  const ys = yt + h.lift;
  for (let i = 0; i < L.cols; i++) {
    for (let j = 0; j < L.rows; j++) {
      const xc = o.side * (L.cx + (i - (L.cols - 1) / 2) * L.pitchX);
      const zc = o.zc + (j - (L.rows - 1) / 2) * L.pitchZ;
      soup.quad([[xc - L.w / 2, ys, zc - L.l / 2], [xc + L.w / 2, ys, zc - L.l / 2], [xc + L.w / 2, ys, zc + L.l / 2], [xc - L.w / 2, ys, zc + L.l / 2]], [up, up, up, up], slot);
    }
  }
  // the plate in the middle, a little proud of the top
  soup.box(-h.plate.hx, h.plate.hx, yt, yt + h.plate.lift, o.zc - h.plate.hz, o.zc + h.plate.hz, col(h.colours.plate), '-y');
  // the oval grille on the other side
  const poly: V3[] = [];
  for (let k = 0; k < h.oval.sides; k++) {
    const a = (2 * Math.PI * k) / h.oval.sides;
    poly.push([o.side * h.oval.cx + h.oval.rx * Math.cos(a), ys, o.zc + h.oval.rz * Math.sin(a)]);
  }
  soup.fan(poly, up, col(h.colours.oval));
}

/** The deck of a pantograph car's well: a flat slab on the roof's flat, over the stretch [k0, k1] the kit and the pantograph take, under everything that stands on it. */
export function pantographDeck(soup: Soup, o: { style: RoofHatchStyle; k0: number; k1: number; crown: number }): void {
  const d = ROOF_HATCHES[o.style].deck;
  soup.box(-d.half, d.half, o.crown - 0.012, o.crown + d.top, o.k0, o.k1, col(d.colour), '-y');
}

// --- the roof ends of the Desiro City ---------------------------------------------------------------------------------------------------------------------------------
//
// A Desiro City's roof is smooth between its car ends, with no raised covers along it (the round-5 score: "AC fairings/vents/insulators/pan arrangement are generic": the model laid the
// Electrostar's run of pale covers on it). What the Class 700's roofs show from a footbridge (`700116 Shepreth Branch Junction 210619.jpg`, `700155 Shepreth Branch JUnc 210619.jpg`,
// `700019 Shepreth Branch Junc 210619.jpg`, kitmasterbloke, 2019-06-21, CC BY 2.0; private review assets, not shipped) is at the car ends, at every joint and behind the nose of each cab car (700019
// and 700155 look at the lead car's roof from the front, from its left side and its right): a dark pocket at the roof's near edge holding a louvre grille on a raised pad, amber studs at the pad's
// ends and some equipment boxes, and along the far edge a dark casing carrying three grey posts and an amber label, the middle of the roof between them left pale. That arrangement is read off the
// photographs; EVERY SIZE, the place along the car, which side each part is on and the colours are ASSUMED, from pictures that are oblique and small. (Both pictures show the pocket on the side
// nearer the camera, and they look at opposite sides of the train: the module may be symmetric, or turned about at each end; the model draws the pocket on the train's left of a front car and
// of its far end, the casing on its right, and turns a rear cab car about.) The pocket is drawn as a dark slab on the roof, not cut into it (the shell has no step); the equipment boxes and the arched
// rim of the casing are not drawn (GAP). The 717 shares the body: family evidence, no 717 roof photograph.

export type RoofEndStyle = 'desiro';
export interface RoofEndDef {
  /** `u` is the distance along the roof from the car's end gap inward; `x` is across (the module's own side: the louvres at -x, the casing at +x for a front car; turned about for a rear cab car) */
  pocket: { u0: number; u1: number; x0: number; x1: number; lift: number; colour: number };
  pad: { x0: number; x1: number; u0: number; u1: number; height: number; colour: number };
  /** the louvre openings on the pad: across by along, one opening's width across and length along, the pitch across and along, the grid's centre; they stand `lift` over the pad's top */
  slots: { cols: number; rows: number; w: number; l: number; pitchX: number; pitchU: number; cx: number; cu: number; lift: number; colour: number };
  /** the amber studs: across positions, along positions, the box's sides across and along and its height over the pocket */
  studs: { xs: readonly number[]; us: readonly number[]; sx: number; su: number; height: number; colour: number };
  /** the casing: across and along, its height over the crown, its colour; the posts on it (along positions, section, height over the casing's top, colour) and the label (along extent, height extent over the crown, colour) on its inner face */
  trough: { x0: number; x1: number; u0: number; u1: number; height: number; colour: number };
  posts: { us: readonly number[]; side: number; height: number; colour: number };
  label: { u0: number; u1: number; y0: number; y1: number; colour: number };
}
export const ROOF_ENDS: Readonly<Record<RoofEndStyle, RoofEndDef>> = {
  desiro: {
    pocket: { u0: 0.1, u1: 2.5, x0: -0.7, x1: -0.05, lift: 0.008, colour: 0x2b3034 },
    pad: { x0: -0.62, x1: -0.1, u0: 0.35, u1: 1.45, height: 0.03, colour: 0x4a5258 },
    slots: { cols: 6, rows: 2, w: 0.055, l: 0.08, pitchX: 0.08, pitchU: 0.14, cx: -0.36, cu: 0.9, lift: 0.003, colour: 0x14171a },
    studs: { xs: [-0.52, -0.36, -0.2], us: [0.28, 1.52], sx: 0.04, su: 0.04, height: 0.045, colour: 0xd9972b },
    trough: { x0: 0.46, x1: 0.72, u0: 0.3, u1: 2.5, height: 0.06, colour: 0x3f4a4f },
    posts: { us: [0.85, 1.4, 1.95], side: 0.035, height: 0.075, colour: 0x8d9298 },
    label: { u0: 1.1, u1: 1.3, y0: 0.015, y1: 0.05, colour: 0xd9972b },
  },
};

/**
 * One roof end of a car (see above): the module that stands at a joint, on a roof whose crown is at `crown`. `zEnd` is the z of the car's end gap, `inward` is +1 where the car's body lies toward
 * +z of it (the car's start end) and -1 where it lies toward -z (its far end); `side` is +1 for a front car and -1 for a rear cab car, which is turned about (its x mirrored).
 */
export function roofEnd(soup: Soup, o: { style: RoofEndStyle; zEnd: number; inward: 1 | -1; crown: number; side: 1 | -1 }): void {
  const d = ROOF_ENDS[o.style];
  const X = (x: number): number => o.side * x;
  const Z = (u: number): number => o.zEnd + o.inward * u;
  const box = (x0: number, x1: number, y0: number, y1: number, u0: number, u1: number, hex: number, skip = '-y'): void =>
    soup.box(Math.min(X(x0), X(x1)), Math.max(X(x0), X(x1)), y0, y1, Math.min(Z(u0), Z(u1)), Math.max(Z(u0), Z(u1)), col(hex), skip);
  const y = o.crown;
  // the pocket: a low dark slab on the louvres' side of the roof's flat, the middle of the roof left pale (700019, 700155: the dark pocket is a notch at the near side, not across the roof)
  box(d.pocket.x0, d.pocket.x1, y - 0.012, y + d.pocket.lift, d.pocket.u0, d.pocket.u1, d.pocket.colour);
  const top = y + d.pocket.lift;
  // the louvre pad and its openings
  box(d.pad.x0, d.pad.x1, top - 0.004, top + d.pad.height, d.pad.u0, d.pad.u1, d.pad.colour);
  const S = d.slots;
  const ys = top + d.pad.height + S.lift;
  const up: V3 = [0, 1, 0];
  for (let i = 0; i < S.cols; i++) {
    for (let j = 0; j < S.rows; j++) {
      const xc = X(S.cx + (i - (S.cols - 1) / 2) * S.pitchX);
      const zc = Z(S.cu + (j - (S.rows - 1) / 2) * S.pitchU);
      soup.quad([[xc - S.w / 2, ys, zc - S.l / 2], [xc + S.w / 2, ys, zc - S.l / 2], [xc + S.w / 2, ys, zc + S.l / 2], [xc - S.w / 2, ys, zc + S.l / 2]], [up, up, up, up], col(S.colour));
    }
  }
  // the amber studs at the pad's two ends
  for (const x of d.studs.xs) for (const u of d.studs.us) box(x - d.studs.sx / 2, x + d.studs.sx / 2, top - 0.004, top + d.studs.height, u - d.studs.su / 2, u + d.studs.su / 2, d.studs.colour);
  // the casing along the far side, its three posts and its amber label
  box(d.trough.x0, d.trough.x1, y - 0.012, y + d.trough.height, d.trough.u0, d.trough.u1, d.trough.colour);
  const postX = (d.trough.x0 + d.trough.x1) / 2;
  for (const u of d.posts.us) box(postX - d.posts.side / 2, postX + d.posts.side / 2, y + d.trough.height - 0.004, y + d.trough.height + d.posts.height, u - d.posts.side / 2, u + d.posts.side / 2, d.posts.colour);
  const L = d.label;
  const nx = -o.side;
  soup.quad([[X(d.trough.x0) + nx * 0.001, y + L.y0, Z(L.u0)], [X(d.trough.x0) + nx * 0.001, y + L.y0, Z(L.u1)], [X(d.trough.x0) + nx * 0.001, y + L.y1, Z(L.u1)], [X(d.trough.x0) + nx * 0.001, y + L.y1, Z(L.u0)]], [[nx, 0, 0], [nx, 0, 0], [nx, 0, 0], [nx, 0, 0]], col(L.colour));
}

/** The coupler heads the model draws: a plain barrel and head (between cars), a Dellner 12 (Electrostar, Desiro City), a Scharfenberg (Class 180) and a BSI (the Sprinters' and Turbostars'). */
export type CouplerStyle = 'plain' | 'dellner' | 'scharfenberg' | 'bsi';

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
  if (style === 'bsi') {
    // BSI (the Sprinters' and Turbostars'; web/src/train-scotrail-dmu.ts): a squarer head on its barrel, its flat face carrying a
    // guide cone on one side and the matching funnel's dark mouth on the other, a pneumatic port each side, and the electrical
    // head in its box hung under the coupler (scotrail158-01: the box with the warning label). From the general look of the type: ASSUMED.
    const [c0, c1] = zr(reach - headLen, reach - 0.012);
    soup.box(-0.18, 0.18, y - 0.14, y + 0.14, c0, c1, casing);
    const [f0, f1] = zr(reach - 0.012, reach - 0.003);
    soup.box(-0.16, 0.16, y - 0.12, y + 0.12, f0, f1, dark);
    soup.box(-0.13, -0.03, y - 0.05, y + 0.05, ...zr(reach - 0.006, reach), face); // the funnel's mouth, the head's front
    const cone = new THREE.CylinderGeometry(dir > 0 ? 0.015 : 0.05, dir > 0 ? 0.05 : 0.015, 0.09, 12, 1, false);
    soup.geometry(cone, new THREE.Matrix4().makeTranslation(0.08, y, z0 + dir * (reach - 0.045)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), pin);
    cone.dispose();
    for (const sx of [-1, 1]) {
      const [p0, p1] = zr(reach - 0.12, reach - 0.03);
      soup.box(sx * 0.2 - 0.02, sx * 0.2 + 0.02, y - 0.04, y + 0.04, p0, p1, pin);
    }
    const [e0, e1] = zr(reach - 0.26, reach - 0.04);
    soup.box(-0.15, 0.15, y - 0.32, y - 0.17, e0, e1, casing);
    soup.box(-0.035, 0.035, y - 0.27, y - 0.21, ...zr(reach - 0.04, reach - 0.035), col(0xf2c21c)); // the warning label
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
 * The access hatch on an equipment box (the Electrostar's underfloor, gn387_03_387123_cambridge.jpg: most of the grey boxes carry a lighter rectangular panel set into the face
 * with a dark seam round it, a small tag beside it). A box carries one where it is this long and its face this tall: a rectangle no longer than `maxLength` (a long box's hatch does
 * not grow with it), centred on the box, kept `margin` inside its raked ends, from `below` over the foot to `above` under the floor; a dark frame `rim` wide round a face a shade
 * lighter than the box. ASSUMED sizes, read off the photograph by eye; they stand the same `SKIRT_SLIT_LIFT` off the face as the louvres do.
 */
export const SKIRT_HATCH = {
  minLength: 0.8,
  minHeight: 0.3,
  maxLength: 0.9,
  margin: 0.15,
  below: 0.09,
  above: 0.1,
  rim: 0.02,
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
  /** the colours of an access hatch (`SKIRT_HATCH`) set into the face: the dark frame round it and the lighter face in it; null/absent for a panel without one */
  hatch?: { rim: THREE.Color; face: THREE.Color } | null;
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
  if (o.hatch && z1 - z0 >= SKIRT_HATCH.minLength && floor - bottom >= SKIRT_HATCH.minHeight) {
    const H = SKIRT_HATCH;
    // one hatch, centred on the box between its raked ends, as long as the box allows up to `maxLength`: a dark frame (four strips) round a lighter face
    const length = Math.min(H.maxLength, z1 - z0 - 2 * (rake + H.margin));
    const za = (z0 + z1) / 2 - length / 2;
    const zb = za + length;
    const ya = bottom + H.below;
    const yb = floor - H.above;
    strip(ya, ya + H.rim, za, zb, o.hatch.rim);
    strip(yb - H.rim, yb, za, zb, o.hatch.rim);
    strip(ya + H.rim, yb - H.rim, za, za + H.rim, o.hatch.rim);
    strip(ya + H.rim, yb - H.rim, zb - H.rim, zb, o.hatch.rim);
    strip(ya + H.rim, yb - H.rim, za + H.rim, zb - H.rim, o.hatch.face);
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
