// The intercity diesels' own bogies, their frames traced from photographs as the London families' are (web/src/train-bogie-trace.ts): each frame is read
// off a photograph in ITS OWN PIXELS beside the two axle-end covers that calibrate it, so a reader with the photograph can lay the one over the other.
// The photographs are review assets with receipts in the round packs; they are not shipped.
//
//   - the Class 221's (VOYAGER221_TRACE): voyager-bogie-01, "CrossCountry 60389 front bogie (221134).JPG" by Geof Sheppard, CC BY-SA 4.0 (Wikimedia Commons);
//     the plate in it reads 221 139. 1280 x 768 as reviewed. Side on and close.
//   - the Class 43's BP10 (BP10_TRACE): hst-bogie-02, "43039 rear bogie.jpg" by Oxyman, CC BY 2.5 (Wikimedia Commons), 1280 x 960 as reviewed. Taken from above
//     the rail and tilted (the axle line falls 58 px to the left over 675 px): calibrated against the wheels at both ends (see `BP10_TRACE.rail`), the bogie stands at
//     one depth, so the tracer takes out the tilt and the camera's elevation, not a perspective along the bogie. The near end is mostly hidden behind its step, so the
//     far end is traced and mirrored for it. hst-bogie-01 ("GWR 43027 leading bogie.JPG", Geof Sheppard, CC BY-SA 4.0) shows the same frame at a sharper angle and was
//     used to check, not to take numbers.
//   - the Mk3's BT10 (BT10_TRACE): mk3-bogie-01, "BT10 bogie (Mark 3 TSO 12142, left side).JPG" by Geof Sheppard, CC BY-SA 4.0 (Wikimedia Commons), 1280 x 384
//     as reviewed. Side on.
//
// The Class 220 has no photograph of its bogie close enough to trace: it keeps the inside frame its distant photographs agree with (xc220-05: the wheels' faces show).
//
// How pixels become metres: the two covers are the centres of the bogie's two axles, so their distance is the wheelbase and their row the axle line, a wheel's radius
// over the rail head. Lengths across the bogie (how far out each part stands) cannot be read from a side view and are ASSUMED (the `x` of each part), inside the
// shared bogie envelope (1.15 m). The photograph's right is the bogie's -z on the +x side; the far side beam carries the same parts turned half a turn (z -> -z).
import * as THREE from 'three';
import { col, Soup } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import type { Px, PxCircle, PxRect } from './train-bogie-trace.ts';

/** The Class 221's bogie: both ends traced (they differ: a grilled box stands by the right axle, and the bosses are not alike), nothing mirrored. */
export const VOYAGER221_TRACE = {
  /** The centres of the two round axle-end covers: the axle line and the wheelbase (the frame's stencil reads "2.70m", `VOYAGER.wheelbase221`). */
  caps: [[237, 524], [981, 521]] as readonly [Px, Px],
  capRadius: [33, 36] as readonly [number, number],
  /**
   * The side beam as one outline, clockwise from the left top plate's outer end: the left plate, the swan neck down into the middle, the middle's top, the swan neck up
   * to the right plate, the right plate and its rounded end, under it back to the right casting, down the casting and along the middle's lower edge, and up the left
   * casting to the left plate's underside.
   */
  beam: [
    [105, 433], [112, 426], [395, 426], [420, 438], [455, 468], [492, 503], [790, 503], [828, 460], [850, 426], [1118, 426], [1128, 436], [1118, 447], [935, 447],
    [935, 560], [870, 574], [800, 560], [770, 578], [520, 578], [490, 566], [440, 566], [330, 548], [300, 520], [300, 447], [112, 447],
  ] as readonly Px[],
  /** The arm under each spring, from the axle box out past the wheel. */
  arms: [[105, 500, 245, 545], [1010, 495, 1135, 545]] as readonly PxRect[],
  /** The coil spring at each end, under the top plate's end. */
  springs: [[115, 452, 185, 500], [1040, 440, 1115, 500]] as readonly PxRect[],
  /** The axle box round each cover. */
  boxes: [[200, 480, 275, 560], [940, 478, 1020, 562]] as readonly PxRect[],
  /** The long tube along the upper middle, end to end, and its radius. */
  tube: { from: [570, 436] as Px, to: [785, 458] as Px, radius: 11 },
  /** The dark grilled box by the right axle. */
  grille: [850, 440, 932, 558] as PxRect,
  /** The round bosses on the beam: the left one on the swan neck, the right one at the tube's end. */
  bosses: [{ c: [420, 503], r: 22 }, { c: [782, 513], r: 24 }] as readonly PxCircle[],
} as const;

/**
 * The BP10 (Class 43 power car). Its far (right) end is traced in the photograph's pixels and mirrored for the near end; the step stands at the near end only and
 * is traced there.
 *
 * Calibration (round 6, after the round-5 score asked for one against a known vertical at both ends): the rail head under each wheel (`rail`) stands 82 px under
 * the near axle and 83 px under the far one (read at 4x where each wheel meets it). The gap between two parallel lines shrinks with distance, so the two ends stand at one depth within the reading
 * (round 5's 0.71 far-to-near scale, read off the covers, was wrong: the near box's cover is simply the bigger casting). The axle line's fall is the camera's tilt,
 * and the gap being smaller than a wheel's radius at the covers' scale (0.508 m is 132 px) is the camera looking down: 82-83 px over the 0.35 m between the
 * covers' plane and the rail head's is an elevation of 25 degrees (ASSUMED: it rests on the depths of the cover and the rail contact, both ASSUMED).
 */
export const BP10_TRACE = {
  caps: [[345, 530], [1020, 472]] as readonly [Px, Px],
  capRadius: 27,
  /** The rail head's row under each axle, read where the wheel meets it. */
  rail: [[345, 612], [1020, 555]] as readonly [Px, Px],
  /** The camera's elevation over the bogie, degrees, and the depth of the covers' plane, metres (see above). */
  view: { elevation: 25, ref: 1.1 },
  /** The side beam's far half, from the middle out over the end and back underneath: the end block's rounded end, the pocket over the spring. */
  beamTop: [[760, 352], [900, 347], [990, 352], [1090, 357], [1145, 360], [1162, 370], [1166, 390], [1155, 402]] as readonly Px[],
  beamBottom: [[1090, 402], [990, 402], [975, 418], [905, 418], [880, 402], [760, 402]] as readonly Px[],
  /** The axle box casting round the cover, the coil spring inboard of it (its fellow outboard is hidden by the damper and taken as its mirror about the axle), and the vertical damper outboard. */
  box: [985, 440, 1060, 525] as PxRect,
  spring: [920, 420, 970, 465] as PxRect,
  damper: [1065, 407, 1095, 505] as PxRect,
  /**
   * The step at the near end (the photograph's left): the chequered top plate, which alone overhangs the axle box (px 293-507), and under it the ladder, hanging wholly
   * inboard of the box: its two stiles (px 393 and 505, down to row 590), its two treads' rows and the mesh panel between them.
   */
  step: { plate: [293, 385, 507, 405] as PxRect, stiles: [393, 505] as readonly number[], foot: 590, treads: [478, 578] as readonly number[], mesh: [398, 495, 500, 565] as PxRect },
  /** The air cylinder and the brake cylinder along the middle (their ends and radii, both following the axle line's fall), below the beam. */
  cylinders: [{ from: [605, 425] as Px, to: [740, 412] as Px, radius: 16 }, { from: [608, 505] as Px, to: [790, 495] as Px, radius: 19 }] as const,
} as const;

/**
 * The BT10 (Mk3 coach): a straight box beam end to end, a yellow coil spring outboard of each axle box, and in the middle a rounded tank hung under the beam over a
 * separate lower beam, open between them (round 6: round 5 drew the middle as one slab that swallowed the tank).
 */
export const BT10_TRACE = {
  caps: [[340, 212], [1032, 212]] as readonly [Px, Px],
  capRadius: 38,
  beam: [[168, 108], [180, 100], [1190, 100], [1200, 110], [1198, 158], [1188, 162], [178, 162], [166, 156]] as readonly Px[],
  springs: [[235, 160, 300, 248], [1065, 165, 1130, 245]] as readonly PxRect[],
  seats: [[228, 240, 305, 256], [1058, 240, 1137, 256]] as readonly PxRect[],
  boxes: [[290, 170, 400, 275], [980, 170, 1090, 275]] as readonly PxRect[],
  /** The tank under the beam: its outline (rows 168-236, px 605-800) and the radius of its rounded corners, in pixels. */
  tank: { rect: [605, 168, 800, 236] as PxRect, corner: 16 },
  /** The lower beam under the tank, a shallow U: its two raised ends and the low middle between them. */
  lowerBeam: [[545, 232], [575, 232], [582, 243], [793, 243], [800, 232], [830, 232], [830, 262], [545, 262]] as readonly Px[],
  /** The hangers down from the beam to the lower beam's ends: their columns, and their rows top and foot. */
  hangers: { cols: [592, 812] as readonly number[], rows: [160, 240] as readonly [number, number] },
  rod: { from: [760, 213] as Px, to: [940, 213] as Px, radius: 8 },
  brake: [900, 190, 980, 235] as PxRect,
} as const;

/** The frames' colours. The 221's dusty brown-grey and the BT10's black and yellow are read off their photographs; the BP10's charcoal off ScotRail's power cars (scotrail-hst-03), not the grey of 43039. */
export const BOGIE_COLOURS = {
  v221: { frame: 0x5e544a, box: 0x4c443c, cover: 0x6c6258, coil: 0x3a332d, spring: 0x544a41, tube: 0x6e6152, grille: 0x26221f },
  bp10: { frame: 0x34373c, box: 0x2b2d31, cover: 0x474a50, spring: 0x3d4045, coil: 0x222427, damper: 0x1d1f22, step: 0x585c62, mesh: 0x2a2c30, cylinder: 0x2f3236 },
  bt10: { frame: 0x1d1e20, box: 0x2a2b2e, cover: 0x3c3d40, spring: 0xe0b020, coil: 0xb58a12, bolster: 0x232426, tank: 0x2c2d30, rod: 0x4a4c50, hanger: 0x3a3b3e },
} as const;

/** A photograph's pixel as the bogie's (z, y) in metres. */
export interface Tracer {
  /** along the bogie, of the pixel (px, py) (py absent: on the axle line) */
  z(px: number, py?: number): number;
  /** the height over the rail head of the pixel (px, py), for a part standing `x` out from the centre line (absent: in the covers' plane) */
  y(py: number, px: number, x?: number): number;
  /** a length in pixels, in metres */
  len(p: number): number;
}
/** A photograph taken looking down on the bogie: the camera's elevation in degrees, and how far out from the centre line the covers' plane stands. */
export interface TracerView {
  elevation: number;
  ref: number;
}

/**
 * The tracer of a photograph: the London one (train-parts.ts `tracer`, with its `view` for a camera looking down), and a tilt: the axle line runs straight from cover
 * to cover however the picture is turned, and pixels are read square to it. The covers stand a wheelbase apart.
 */
export function tracer(caps: readonly [Px, Px], radius: number, wheelbase: number, view?: TracerView): Tracer {
  const [[xL, yL], [xR, yR]] = caps;
  const D = Math.hypot(xR - xL, yR - yL);
  const c = (xR - xL) / D;
  const s = (yR - yL) / D;
  const scale = D / wheelbase;
  const sin = view ? Math.sin((view.elevation * Math.PI) / 180) : 0;
  const cos = view ? Math.cos((view.elevation * Math.PI) / 180) : 1;
  const ref = view ? view.ref : 0;
  // along the axle line from the left cover, and down from it, in pixels
  const u = (px: number, py: number): number => (px - xL) * c + (py - yL) * s;
  const v = (px: number, py: number): number => -(px - xL) * s + (py - yL) * c;
  const row = (px: number): number => yL + ((yR - yL) * (px - xL)) / (xR - xL);
  return {
    z: (px, py = row(px)) => wheelbase / 2 - u(px, py) / scale,
    y: (py, px, x = ref) => radius + (-v(px, py) / scale - (ref - x) * sin) / cos,
    len: (p) => p / scale,
  };
}

/** Triangles of a simple polygon (either winding), by ear clipping: index triples into it. */
function earClip(poly: readonly [number, number][]): [number, number, number][] {
  const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length] as [number, number]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  const idx = poly.map((_, i) => i);
  if (area < 0) idx.reverse();
  const out: [number, number, number][] = [];
  const cross = (a: [number, number], b: [number, number], c: [number, number]): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]): boolean => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length] as number;
      const ib = idx[i] as number;
      const ic = idx[(i + 1) % idx.length] as number;
      const a = poly[ia] as [number, number];
      const b = poly[ib] as [number, number];
      const c = poly[ic] as [number, number];
      if (cross(a, b, c) <= 1e-12) continue;
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inside(poly[j] as [number, number], a, b, c))) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0] as number, idx[1] as number, idx[2] as number]);
  return out;
}

/** A flat plate of the outline (z, y) between x0 and x1 (x1 the outer face): both faces and the rim. */
function plate(soup: Soup, outline: readonly [number, number][], x0: number, x1: number, c: THREE.Color): void {
  const v = (p: [number, number], x: number): V3 => [x, p[1], p[0]];
  const out = Math.sign(x1 - x0) || 1;
  for (const [i, j, k] of earClip(outline)) {
    const a = outline[i] as [number, number];
    const b = outline[j] as [number, number];
    const d = outline[k] as [number, number];
    soup.tri([v(a, x1), v(b, x1), v(d, x1)], [[out, 0, 0], [out, 0, 0], [out, 0, 0]], c);
    soup.tri([v(a, x0), v(b, x0), v(d, x0)], [[-out, 0, 0], [-out, 0, 0], [-out, 0, 0]], c);
  }
  const cz = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i] as [number, number];
    const b = outline[(i + 1) % outline.length] as [number, number];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let n: V3 = [0, -(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // the rim faces away from the outline's middle (good enough for these outlines, whose edges all face outward from it)
    if (n[1] * ((a[1] + b[1]) / 2 - cy) + n[2] * ((a[0] + b[0]) / 2 - cz) < 0) n = [0, -n[1], -n[2]];
    soup.quad([v(a, x0), v(a, x1), v(b, x1), v(b, x0)], [n, n, n, n], c);
  }
}

/** A closed cylinder from `a` to `b`, `n` sided: side quads with outward normals and a fan on each end. */
export function cylinder(soup: Soup, a: V3, b: V3, rho: number, n: number, colour: number): void {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  const axis: V3 = [d[0] / L, d[1] / L, d[2] / L];
  const h: V3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u0: V3 = [axis[1] * h[2] - axis[2] * h[1], axis[2] * h[0] - axis[0] * h[2], axis[0] * h[1] - axis[1] * h[0]];
  const ul = Math.hypot(u0[0], u0[1], u0[2]);
  const u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const v: V3 = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
  const c = col(colour);
  const dirs = Array.from({ length: n }, (_, k): V3 => {
    const th = (2 * Math.PI * k) / n;
    return [u[0] * Math.cos(th) + v[0] * Math.sin(th), u[1] * Math.cos(th) + v[1] * Math.sin(th), u[2] * Math.cos(th) + v[2] * Math.sin(th)];
  });
  const at = (o: V3, q: V3): V3 => [o[0] + rho * q[0], o[1] + rho * q[1], o[2] + rho * q[2]];
  for (let k = 0; k < n; k++) {
    const p = dirs[k] as V3;
    const q = dirs[(k + 1) % n] as V3;
    soup.quad([at(a, p), at(a, q), at(b, q), at(b, p)], [p, q, q, p], c);
  }
  soup.fan(dirs.map((p) => at(a, p)), [-axis[0], -axis[1], -axis[2]], c);
  soup.fan(dirs.map((p) => at(b, p)), axis, c);
}

/** A part of a traced frame, in metres, on the +x side: the far side carries it turned half a turn (z -> -z, x -> -x). */
type Part =
  | { kind: 'plate'; outline: [number, number][]; x: [number, number]; colour: number }
  | { kind: 'box'; z: [number, number]; y: [number, number]; x: [number, number]; colour: number }
  | { kind: 'cyl'; a: V3; b: V3; rho: number; sides: number; colour: number };

/** Draw the parts on both sides. */
function drawParts(soup: Soup, parts: readonly Part[]): void {
  for (const sx of [1, -1] as const) {
    for (const p of parts) {
      if (p.kind === 'plate') {
        plate(soup, sx > 0 ? p.outline : p.outline.map(([z, y]): [number, number] => [-z, y]), sx * p.x[0], sx * p.x[1], col(p.colour));
      } else if (p.kind === 'box') {
        const [x0, x1] = sx > 0 ? p.x : [-p.x[1], -p.x[0]];
        const [z0, z1] = sx > 0 ? p.z : [-p.z[1], -p.z[0]];
        soup.box(x0, x1, p.y[0], p.y[1], z0, z1, col(p.colour));
      } else {
        const t = (q: V3): V3 => (sx > 0 ? q : [-q[0], q[1], -q[2]]);
        cylinder(soup, t(p.a), t(p.b), p.rho, p.sides, p.colour);
      }
    }
  }
}

/** A pixel rectangle as a box at depth x, through the tracer (z from its columns, y from its rows at its middle column). */
function rectBox(T: Tracer, r: PxRect, x: [number, number], colour: number): Part {
  const mid = (r[0] + r[2]) / 2;
  const midY = (r[1] + r[3]) / 2;
  const za = T.z(r[0], midY);
  const zb = T.z(r[2], midY);
  return { kind: 'box', z: [Math.min(za, zb), Math.max(za, zb)], y: [T.y(r[3], mid, x[1]), T.y(r[1], mid, x[1])], x, colour };
}
/** A coil spring standing in a pixel rectangle at depth x: five rings, alternately the spring's colour and the darker coil's, narrower. */
function springParts(T: Tracer, r: PxRect, x: number, spring: number, coil: number): Part[] {
  const mid = (r[0] + r[2]) / 2;
  const z = T.z(mid, (r[1] + r[3]) / 2);
  const rho = T.len((r[2] - r[0]) / 2);
  const y0 = T.y(r[3], mid, x);
  const y1 = T.y(r[1], mid, x);
  const n = 5;
  return Array.from({ length: n }, (_, k): Part => ({
    kind: 'cyl', a: [x, y0 + ((y1 - y0) * k) / n, z], b: [x, y0 + ((y1 - y0) * (k + 1)) / n, z], rho: k % 2 ? 0.86 * rho : rho, sides: 12, colour: k % 2 ? coil : spring,
  }));
}

/**
 * A closed annular sector standing on a wheel's outer face: radii rho0..rho1 about the axle at (y, z), angles a0..a1 in the (z, y) plane (0 toward +z, pi/2 up),
 * from u0 to u1 out from the wheel's centre plane at x = sx * half.
 */
function annulusSector(soup: Soup, sx: 1 | -1, half: number, y: number, z: number, u: [number, number], rho: [number, number], a: [number, number], segs: number, colour: number): void {
  const c = col(colour);
  const P = (uu: number, rr: number, aa: number): V3 => [sx * (half + uu), y + rr * Math.sin(aa), z + rr * Math.cos(aa)];
  const R = (aa: number): V3 => [0, Math.sin(aa), Math.cos(aa)];
  const full = Math.abs(a[1] - a[0]) >= 2 * Math.PI - 1e-9;
  for (let k = 0; k < segs; k++) {
    const t0 = a[0] + ((a[1] - a[0]) * k) / segs;
    const t1 = a[0] + ((a[1] - a[0]) * (k + 1)) / segs;
    for (const [uu, s] of [[u[1], 1], [u[0], -1]] as const) {
      const n: V3 = [sx * s, 0, 0];
      soup.quad([P(uu, rho[0], t0), P(uu, rho[1], t0), P(uu, rho[1], t1), P(uu, rho[0], t1)], [n, n, n, n], c);
    }
    const o0 = R(t0);
    const o1 = R(t1);
    const i0: V3 = [0, -o0[1], -o0[2]];
    const i1: V3 = [0, -o1[1], -o1[2]];
    soup.quad([P(u[0], rho[1], t0), P(u[1], rho[1], t0), P(u[1], rho[1], t1), P(u[0], rho[1], t1)], [o0, o0, o1, o1], c);
    soup.quad([P(u[0], rho[0], t0), P(u[1], rho[0], t0), P(u[1], rho[0], t1), P(u[0], rho[0], t1)], [i0, i0, i1, i1], c);
  }
  if (full) return;
  for (const [aa, s] of [[a[0], -1], [a[1], 1]] as const) {
    const n: V3 = [0, s * Math.cos(aa), -s * Math.sin(aa)];
    soup.quad([P(u[0], rho[0], aa), P(u[1], rho[0], aa), P(u[1], rho[1], aa), P(u[0], rho[1], aa)], [n, n, n, n], c);
  }
}

/**
 * The 220's wheel-mounted brake discs, after xc220-05 (enlarged): a bright perforated ring on each wheel's outer face, broken on the side toward the bogie's middle
 * where a calliper grips it. The photograph is too distant to measure: the ring's radii, its holes and the calliper's size are ASSUMED (a wheel-mounted disc of
 * this kind spans about the outer third of the web). In place of the kit's axle-mounted discs, which the 220 then does not need.
 */
export const V220_DISC = { u: [0.058, 0.066], rho: [0.6, 0.9], holes: 20, hole: 0.03, caliper: { span: 0.75, u: [0.05, 0.13], rho: [0.5, 0.97] } } as const;
export const V220_DISC_COLOURS = { ring: 0xaeb3b9, hole: 0x1b1c1e, caliper: 0x26282b } as const;

export function voyager220Discs(soup: Soup, radius: number, wheelbase: number, track: number): void {
  const d = V220_DISC;
  const C = V220_DISC_COLOURS;
  const half = track / 2;
  for (const az of [-wheelbase / 2, wheelbase / 2]) {
    // the calliper's middle faces the bogie's middle: -z from the +z axle (angle pi), +z from the -z axle (angle 0)
    const mid = az > 0 ? Math.PI : 0;
    const h = d.caliper.span / 2;
    for (const sx of [1, -1] as const) {
      annulusSector(soup, sx, half, radius, az, [...d.u], [d.rho[0] * radius, d.rho[1] * radius], [mid + h, mid + 2 * Math.PI - h], 28, C.ring);
      annulusSector(soup, sx, half, radius, az, [...d.caliper.u], [d.caliper.rho[0] * radius, d.caliper.rho[1] * radius], [mid - h, mid + h], 6, C.caliper);
      const rm = ((d.rho[0] + d.rho[1]) / 2) * radius;
      const n: V3 = [sx, 0, 0];
      for (let k = 0; k < d.holes; k++) {
        const a = mid + h + ((2 * Math.PI - 2 * h) * (k + 0.5)) / d.holes;
        const y = radius + rm * Math.sin(a);
        const z = az + rm * Math.cos(a);
        const x = sx * (half + d.u[1] + 0.001);
        const e = d.hole / 2;
        soup.quad([[x, y - e, z - e], [x, y + e, z - e], [x, y + e, z + e], [x, y - e, z + e]], [n, n, n, n], col(C.hole));
      }
    }
  }
}

/** The depths (how far out from the centre line each part stands) of the traced frames. ASSUMED: a side view shows none. */
export const BOGIE_DEPTHS = {
  v221: { beam: [0.95, 1.05], arm: [0.95, 1.05], box: [0.92, 1.07], cover: [1.07, 1.11], spring: 1.0, tube: 1.09, grille: [1.0, 1.1], boss: [1.05, 1.08] },
  bp10: { beam: [0.97, 1.07], box: [0.93, 1.07], cover: [1.07, 1.1], spring: 1.0, damper: 1.08, step: [1.0, 1.14], cylinder: 0.85 },
  bt10: { beam: [0.97, 1.07], box: [0.94, 1.08], cover: [1.08, 1.11], spring: 1.0, seat: [0.88, 1.12], bolster: [0.55, 1.0], tank: [0.45, 0.9], hanger: [0.95, 1.0], rod: 1.02, brake: [0.95, 1.05] },
} as const;

/** The Class 221's frame from `VOYAGER221_TRACE`. */
export function voyager221Frame(soup: Soup, radius: number, wheelbase: number): void {
  const t = VOYAGER221_TRACE;
  const T = tracer(t.caps, radius, wheelbase);
  const D = BOGIE_DEPTHS.v221;
  const C = BOGIE_COLOURS.v221;
  const parts: Part[] = [{ kind: 'plate', outline: t.beam.map(([px, py]): [number, number] => [T.z(px), T.y(py, px)]), x: [...D.beam], colour: C.frame }];
  for (const r of t.arms) parts.push(rectBox(T, r, [...D.arm], C.frame));
  for (const r of t.boxes) parts.push(rectBox(T, r, [...D.box], C.box));
  t.caps.forEach(([px, py], i) => {
    const z = T.z(px);
    parts.push({ kind: 'cyl', a: [D.cover[0], T.y(py, px), z], b: [D.cover[1], T.y(py, px), z], rho: T.len(t.capRadius[i] as number), sides: 20, colour: C.cover });
  });
  for (const r of t.springs) parts.push(...springParts(T, r, D.spring, C.spring, C.coil));
  const [fx, fy] = t.tube.from;
  const [tx, ty] = t.tube.to;
  parts.push({ kind: 'cyl', a: [D.tube, T.y(fy, fx), T.z(fx)], b: [D.tube, T.y(ty, tx), T.z(tx)], rho: T.len(t.tube.radius), sides: 10, colour: C.tube });
  parts.push(rectBox(T, t.grille, [...D.grille], C.grille));
  for (const b of t.bosses) {
    const [px, py] = b.c;
    parts.push({ kind: 'cyl', a: [D.boss[0], T.y(py, px), T.z(px)], b: [D.boss[1], T.y(py, px), T.z(px)], rho: T.len(b.r), sides: 12, colour: C.cover });
  }
  drawParts(soup, parts);
  // the transom between the side beams (hidden behind them in the photograph; ASSUMED)
  soup.box(-0.95, 0.95, radius + 0.04, radius + 0.2, -0.1, 0.1, col(C.box));
}

/** The BP10's frame from `BP10_TRACE`: the far end traced and mirrored about the bogie's middle for the near end, the step at the near end only. */
export function bp10Frame(soup: Soup, radius: number, wheelbase: number): void {
  const t = BP10_TRACE;
  const T = tracer(t.caps, radius, wheelbase, t.view);
  const D = BOGIE_DEPTHS.bp10;
  const C = BOGIE_COLOURS.bp10;
  const m = (p: Px): [number, number] => [T.z(p[0], p[1]), T.y(p[1], p[0], D.beam[1])];
  // the far half (z < 0), closed at the middle (z = 0) at the heights of its first top and last bottom points, then its mirror (z -> -z) for the near half
  const top = t.beamTop.map(m);
  const bottom = t.beamBottom.map(m);
  const yTop = (top[0] as [number, number])[1];
  const yBot = (bottom[bottom.length - 1] as [number, number])[1];
  const half: [number, number][] = [[0, yTop], ...top, ...bottom, [0, yBot]];
  const back = half.map(([z, y]): [number, number] => [-z, y]).reverse().slice(1, -1);
  const parts: Part[] = [{ kind: 'plate', outline: [...half, ...back], x: [...D.beam], colour: C.frame }];
  // at each end: the axle box and its cover, a spring each side of the box (the visible inboard one and its mirror about the axle), the vertical damper outboard
  const [cx, cy] = t.caps[1];
  const zc = T.z(cx, cy);
  const box = rectBox(T, t.box, [...D.box], C.box);
  const springs = springParts(T, t.spring, D.spring, C.spring, C.coil);
  const springZ = T.z((t.spring[0] + t.spring[2]) / 2, (t.spring[1] + t.spring[3]) / 2);
  const outboard = springParts(T, t.spring, D.spring, C.spring, C.coil).map((p): Part => (p.kind === 'cyl' ? { ...p, a: [p.a[0], p.a[1], 2 * zc - springZ], b: [p.b[0], p.b[1], 2 * zc - springZ] } : p));
  const dm = (t.damper[0] + t.damper[2]) / 2;
  const dz = T.z(dm, (t.damper[1] + t.damper[3]) / 2);
  const damper: Part = { kind: 'cyl', a: [D.damper, T.y(t.damper[3], dm, D.damper), dz], b: [D.damper, T.y(t.damper[1], dm, D.damper), dz], rho: T.len((t.damper[2] - t.damper[0]) / 2), sides: 10, colour: C.damper };
  const cover: Part = { kind: 'cyl', a: [D.cover[0], radius, zc], b: [D.cover[1], radius, zc], rho: T.len(t.capRadius), sides: 20, colour: C.cover };
  const farEnd: Part[] = [box, cover, ...springs, ...outboard, damper];
  const flip = (p: Part): Part => {
    if (p.kind === 'box') return { ...p, z: [-p.z[1], -p.z[0]] };
    if (p.kind === 'cyl') return { ...p, a: [p.a[0], p.a[1], -p.a[2]], b: [p.b[0], p.b[1], -p.b[2]] };
    return { ...p, outline: p.outline.map(([z, y]): [number, number] => [-z, y]) };
  };
  parts.push(...farEnd, ...farEnd.map(flip));
  // the step at the near end: the top plate over the box, and the ladder (two stiles, two treads, the mesh between) hanging inboard of the box
  const s = t.step;
  const x = D.step;
  const pz = (px: number, py: number): number => T.z(px, py);
  const [pa, pb] = [pz(s.plate[0], s.plate[3]), pz(s.plate[2], s.plate[3])];
  const pm = (s.plate[0] + s.plate[2]) / 2;
  parts.push({ kind: 'box', z: [Math.min(pa, pb), Math.max(pa, pb)], y: [T.y(s.plate[3], pm, x[1]), T.y(s.plate[1], pm, x[1])], x: [...x], colour: C.step });
  const top0 = T.y(s.plate[3], pm, x[1]);
  for (const col0 of s.stiles) {
    const z = pz(col0, s.foot);
    parts.push({ kind: 'box', z: [z - 0.015, z + 0.015], y: [T.y(s.foot, col0, x[1]), top0], x: [...x], colour: C.step });
  }
  const [la, lb] = [pz(s.stiles[0] as number, s.foot), pz(s.stiles[1] as number, s.foot)];
  const [lo, hi] = [Math.min(la, lb), Math.max(la, lb)];
  const lm = ((s.stiles[0] as number) + (s.stiles[1] as number)) / 2;
  for (const row of s.treads) {
    const y = T.y(row, lm, x[1]);
    parts.push({ kind: 'box', z: [lo, hi], y: [y - 0.02, y + 0.02], x: [...x], colour: C.step });
  }
  const mm = (s.mesh[0] + s.mesh[2]) / 2;
  const [ma, mb] = [pz(s.mesh[0], s.mesh[3]), pz(s.mesh[2], s.mesh[3])];
  parts.push({ kind: 'box', z: [Math.min(ma, mb), Math.max(ma, mb)], y: [T.y(s.mesh[3], mm, x[0]), T.y(s.mesh[1], mm, x[0])], x: [x[0], x[0] + 0.02], colour: C.mesh });
  // the air and brake cylinders along the middle, under the beam
  for (const c of t.cylinders) {
    const [ax, ay] = c.from;
    const [bx, by] = c.to;
    parts.push({ kind: 'cyl', a: [D.cylinder, T.y(ay, ax, D.cylinder), T.z(ax, ay)], b: [D.cylinder, T.y(by, bx, D.cylinder), T.z(bx, by)], rho: T.len(c.radius), sides: 12, colour: C.cylinder });
  }
  drawParts(soup, parts);
  soup.box(-0.97, 0.97, radius + 0.05, radius + 0.22, -0.12, 0.12, col(C.box));
}

/** The BT10's frame from `BT10_TRACE`: both ends traced. */
export function bt10Frame(soup: Soup, radius: number, wheelbase: number): void {
  const t = BT10_TRACE;
  const T = tracer(t.caps, radius, wheelbase);
  const D = BOGIE_DEPTHS.bt10;
  const C = BOGIE_COLOURS.bt10;
  const parts: Part[] = [{ kind: 'plate', outline: t.beam.map(([px, py]): [number, number] => [T.z(px), T.y(py, px)]), x: [...D.beam], colour: C.frame }];
  for (const r of t.boxes) parts.push(rectBox(T, r, [...D.box], C.box));
  for (const [px, py] of t.caps) parts.push({ kind: 'cyl', a: [D.cover[0], T.y(py, px), T.z(px)], b: [D.cover[1], T.y(py, px), T.z(px)], rho: T.len(t.capRadius), sides: 20, colour: C.cover });
  for (const r of t.springs) parts.push(...springParts(T, r, D.spring, C.spring, C.coil));
  for (const r of t.seats) parts.push(rectBox(T, r, [...D.seat], C.box));
  // the middle: the rounded tank, the lower beam under it and the hangers, with open space between tank and lower beam
  const [x0, y0, x1, y1] = t.tank.rect;
  const k = t.tank.corner;
  const tank: Px[] = [];
  for (const [cx, cy, a0] of [[x1 - k, y0 + k, -90], [x1 - k, y1 - k, 0], [x0 + k, y1 - k, 90], [x0 + k, y0 + k, 180]] as const) {
    for (let i = 0; i <= 4; i++) {
      const a = ((a0 + (90 * i) / 4) * Math.PI) / 180;
      tank.push([cx + k * Math.cos(a), cy + k * Math.sin(a)]);
    }
  }
  parts.push({ kind: 'plate', outline: tank.map(([px, py]): [number, number] => [T.z(px), T.y(py, px)]), x: [...D.tank], colour: C.tank });
  parts.push({ kind: 'plate', outline: t.lowerBeam.map(([px, py]): [number, number] => [T.z(px), T.y(py, px)]), x: [...D.bolster], colour: C.bolster });
  for (const c of t.hangers.cols) {
    const z = T.z(c);
    parts.push({ kind: 'box', z: [z - 0.012, z + 0.012], y: [T.y(t.hangers.rows[1], c), T.y(t.hangers.rows[0], c)], x: [...D.hanger], colour: C.hanger });
  }
  {
    const [ax, ay] = t.rod.from;
    const [bx, by] = t.rod.to;
    parts.push({ kind: 'cyl', a: [D.rod, T.y(ay, ax), T.z(ax)], b: [D.rod, T.y(by, bx), T.z(bx)], rho: T.len(t.rod.radius), sides: 8, colour: C.rod });
  }
  parts.push(rectBox(T, t.brake, [...D.brake], C.box));
  drawParts(soup, parts);
  soup.box(-0.97, 0.97, radius + 0.05, radius + 0.2, -0.1, 0.1, col(C.frame));
}
