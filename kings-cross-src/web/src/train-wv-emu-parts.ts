// Parts of the Waverley EMUs that no King's Cross kind has: a livery cut into the shell along its own edges (so a painted boundary is a straight cut
// across each triangle, not a staircase of whole quads), and the CAF inside-frame bogie of the Class 397, read off tpe397-03.
import * as THREE from 'three';
import { col, plain, Soup, unit } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { BOGIE_LOD_DISTANCE, FLANGE_HEIGHT, WHEEL_WIDTH } from './train-parts.ts';

// --- the livery, cut along its edges ---------------------------------------------------------------------

/** A colour (hex), or the cab glass (drawn in the glass mesh). */
export type Look = number | 'glass';

const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const nmix = (a: V3, b: V3, t: number): V3 => unit(mix(a, b, t));

/** How deep a triangle may be quartered to find a corner of the livery inside it (each level halves its sides). */
export const SPLIT_DEPTH = 5;
/** Steps of the search for where an edge crosses from one colour to the next: the crossing is found to 1/2^n of the edge. */
export const SPLIT_STEPS = 12;
/**
 * How far either side of a cut its straightness is checked, as a fraction of the way to the corner (or the far edge): a boundary that bows less than this
 * inside the triangle is drawn as the straight cut; one that bends more (a region's corner) has the triangle quartered.
 */
export const SPLIT_SLACK = 0.03;

/**
 * Draw the triangle (p, n) in the colours `look` gives its points, cut where the colour changes. Seven samples (corners, edge midpoints, middle) decide:
 *   all one colour            one triangle;
 *   two colours, one corner   the lone corner's triangle and the rest, cut along the line through the two edge crossings (each found by bisection);
 *   anything else             quarter it and try again, down to SPLIT_DEPTH, then one triangle in the middle's colour.
 * So a boundary is exact where it crosses the shell's edges and straight between them; a corner of a region (a window's) is found by quartering.
 */
export function splitTri(p: [V3, V3, V3], n: [V3, V3, V3], look: (q: V3) => Look, emit: (p: [V3, V3, V3], n: [V3, V3, V3], l: Look) => void, depth = 0): void {
  const l = p.map(look) as [Look, Look, Look];
  const m: [V3, V3, V3] = [mix(p[0], p[1], 0.5), mix(p[1], p[2], 0.5), mix(p[2], p[0], 0.5)];
  const lm = m.map(look);
  const c: V3 = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3, (p[0][2] + p[1][2] + p[2][2]) / 3];
  const lc = look(c);
  const all = [...l, ...lm, lc];
  const kinds = [...new Set(all)];
  if (kinds.length === 1) {
    emit(p, n, l[0]);
    return;
  }
  // a clean two-colour split: one corner differs from the other two, each edge changes colour at most once (its midpoint agrees with one end)
  const edgeOk = (i: number): boolean => lm[i] === l[i] || lm[i] === l[(i + 1) % 3];
  const lone: number = l[0] !== l[1] && l[1] === l[2] ? 0 : l[1] !== l[0] && l[0] === l[2] ? 1 : l[2] !== l[0] && l[0] === l[1] ? 2 : -1;
  if (kinds.length === 2 && lone >= 0 && [0, 1, 2].every(edgeOk) && lm[(lone + 1) % 3] === l[(lone + 1) % 3]) {
    const pa = p[lone] as V3;
    const pB = p[(lone + 1) % 3] as V3;
    const pD = p[(lone + 2) % 3] as V3;
    const na = n[lone] as V3;
    const nB = n[(lone + 1) % 3] as V3;
    const nD = n[(lone + 2) % 3] as V3;
    const la = l[lone] as Look;
    const lb = l[(lone + 1) % 3] as Look;
    const crossing = (to: V3): number => {
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < SPLIT_STEPS; k++) {
        const t = (lo + hi) / 2;
        if (look(mix(pa, to, t)) === la) lo = t;
        else hi = t;
      }
      return (lo + hi) / 2;
    };
    const tb = crossing(pB);
    const td = crossing(pD);
    // the lone corner lies on the boundary itself (a section point at a band's edge): the triangle is the others' colour
    const eps = 2 ** -SPLIT_STEPS * 2;
    if (tb < eps && td < eps) {
      emit(p, n, lb);
      return;
    }
    // the other two corners lie on the boundary (a section point at a band's edge): the triangle is the lone corner's colour
    if (tb > 1 - eps && td > 1 - eps) {
      emit(p, n, la);
      return;
    }
    const pb = mix(pa, pB, tb);
    const pd = mix(pa, pD, td);
    // the cut is straight: check it against the livery just either side of it, at three places along it. A boundary that bends inside the triangle (a
    // region's corner) fails this, and the triangle is quartered instead
    const far = mix(pB, pD, 0.5);
    const straight = depth >= SPLIT_DEPTH || [0.25, 0.5, 0.75].every((t) => {
      const q = mix(pb, pd, t);
      return look(mix(q, pa, SPLIT_SLACK)) === la && look(mix(q, far, SPLIT_SLACK)) === lb;
    });
    if (straight) {
      const nb = nmix(na, nB, tb);
      const nd = nmix(na, nD, td);
      emit([pa, pb, pd], [na, nb, nd], la);
      emit([pb, pB, pD], [nb, nB, nD], lb);
      emit([pb, pD, pd], [nb, nD, nd], lb);
      return;
    }
  }
  if (depth >= SPLIT_DEPTH) {
    emit(p, n, lc);
    return;
  }
  const mn: [V3, V3, V3] = [nmix(n[0], n[1], 0.5), nmix(n[1], n[2], 0.5), nmix(n[2], n[0], 0.5)];
  splitTri([p[0], m[0], m[2]], [n[0], mn[0], mn[2]], look, emit, depth + 1);
  splitTri([m[0], p[1], m[1]], [mn[0], n[1], mn[1]], look, emit, depth + 1);
  splitTri([m[2], m[1], p[2]], [mn[2], mn[1], n[2]], look, emit, depth + 1);
  splitTri([m[0], m[1], m[2]], [mn[0], mn[1], mn[2]], look, emit, depth + 1);
}

/** A five-pointed star, flat, in (x, y): the points `r` out, the notches `r * inner` (TPE's star badge, tpe397-01). */
export function starOutline(cx: number, cy: number, r: number, inner = 0.42): [number, number][] {
  return Array.from({ length: 10 }, (_, k): [number, number] => {
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r : r * inner;
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  });
}

// --- the CAF bogie (tpe397-03) ---------------------------------------------------------------------------

export interface CafBogieSpec {
  radius: number;
  wheelbase: number;
  track: number;
  motor: boolean;
}

// colours read off tpe397-03 (Velim, 2019; a trailer bogie in sun)
const STEEL = 0x8b9095;
const FRAME = 0x4f5459;
const RUBBER = 0x26272a;
const TYRE = 0x3b3c3f;
const WEB = 0x9a6a45;
const HUB = 0x575a5e;
const BOLT = 0x2f3134;

/**
 * Where the parts stand, in metres from the bogie's centre along the track (z) and above the rail head (y), read off tpe397-03 at about 500 px to the metre
 * (the 0.85 m wheel is 425 px across). All ASSUMED beyond that photograph's side view: depths across the track are not seen and are drawn to fit the gauge.
 */
export const CAF = {
  /** the link arm from each axle toward the middle: its inner and outer ends (fraction of the half wheelbase) and its height */
  arm: { inner: 0.46, outer: 0.83, y0: 0.23, y1: 0.52 },
  /** the inside frame's side members: the height of their foot and top, and how far in from the wheel's back face */
  frame: { y0: 0.45, y1: 0.8, inset: 0.06 },
  /** the air spring on the frame's middle */
  airSpring: { y0: 0.79, y1: 0.93, radius: 0.31 },
  /** the long horizontal damper, from just behind the middle toward one wheel */
  damper: { z0: -0.16, z1: 0.76, y: 0.62, radius: 0.065 },
  /** the anti-roll link and its bar; the vertical damper */
  rollLink: { z: -0.53, y0: 0.28, y1: 0.91 },
  verticalDamper: { z: -0.4, y0: 0.49, y1: 0.81, radius: 0.045 },
  /** the triangular bracket hung from the body over the damper's far end */
  bracket: { z0: 0.63, z1: 0.95, y0: 0.57, y1: 0.94 },
  /** the wheel's face: the tyre band, the web disc and its ring of twelve bolts, the hub and its cap of six */
  wheel: { tyre: 0.84, boltRing: 0.68, bolts: 12, hub: 0.45, cap: 0.22, capBolts: 6 },
} as const;

const SEG = 40;

function disc(soup: Soup, cx: number, cy: number, cz: number, r: number, nx: 1 | -1, colour: THREE.Color, seg = SEG): void {
  const poly: V3[] = Array.from({ length: seg }, (_, k): V3 => {
    const a = (2 * Math.PI * k) / seg;
    return [cx, cy + r * Math.sin(a), cz + r * Math.cos(a)];
  });
  soup.fan(poly, [nx, 0, 0], colour);
}

function ring(soup: Soup, cx: number, cy: number, cz: number, r0: number, r1: number, nx: 1 | -1, colour: THREE.Color): void {
  for (let k = 0; k < SEG; k++) {
    const a0 = (2 * Math.PI * k) / SEG;
    const a1 = (2 * Math.PI * (k + 1)) / SEG;
    const at = (r: number, a: number): V3 => [cx, cy + r * Math.sin(a), cz + r * Math.cos(a)];
    soup.quad([at(r0, a0), at(r1, a0), at(r1, a1), at(r0, a1)], [[nx, 0, 0], [nx, 0, 0], [nx, 0, 0], [nx, 0, 0]], colour);
  }
}

/** A cylinder along x (a wheel's tread), from x0 to x1. */
function tread(soup: Soup, x0: number, x1: number, cy: number, cz: number, r: number, colour: THREE.Color): void {
  for (let k = 0; k < SEG; k++) {
    const a0 = (2 * Math.PI * k) / SEG;
    const a1 = (2 * Math.PI * (k + 1)) / SEG;
    const pt = (x: number, a: number): V3 => [x, cy + r * Math.sin(a), cz + r * Math.cos(a)];
    const nn = (a: number): V3 => [0, Math.sin(a), Math.cos(a)];
    soup.quad([pt(x0, a0), pt(x1, a0), pt(x1, a1), pt(x0, a1)], [nn(a0), nn(a0), nn(a1), nn(a1)], colour);
  }
}

/** A cylinder between two points (a damper, a link), `seg` sides. */
function rod(soup: Soup, a: V3, b: V3, r: number, colour: THREE.Color, seg = 10): void {
  const d = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = unit([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  const e2: V3 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];
  const at = (o: V3, k: number): V3 => {
    const t = (2 * Math.PI * k) / seg;
    return [o[0] + r * (e1[0] * Math.cos(t) + e2[0] * Math.sin(t)), o[1] + r * (e1[1] * Math.cos(t) + e2[1] * Math.sin(t)), o[2] + r * (e1[2] * Math.cos(t) + e2[2] * Math.sin(t))];
  };
  const nrm = (k: number): V3 => {
    const t = (2 * Math.PI * k) / seg;
    return [e1[0] * Math.cos(t) + e2[0] * Math.sin(t), e1[1] * Math.cos(t) + e2[1] * Math.sin(t), e1[2] * Math.cos(t) + e2[2] * Math.sin(t)];
  };
  for (let k = 0; k < seg; k++) soup.quad([at(a, k), at(b, k), at(b, k + 1), at(a, k + 1)], [nrm(k), nrm(k), nrm(k + 1), nrm(k + 1)], colour);
  soup.fan(Array.from({ length: seg }, (_, k) => at(b, k)), d, colour);
}

/** A wheelset's two wheels: tread, flange, the outer face (tyre, web with its disc bolts, hub and cap) and a plain inner face. */
function wheels(soup: Soup, s: CafBogieSpec, z: number, full: boolean): void {
  const r = s.radius;
  const w = CAF.wheel;
  for (const sx of [-1, 1] as const) {
    const xc = (sx * s.track) / 2;
    const xo = xc + sx * (WHEEL_WIDTH / 2);
    const xi = xc - sx * (WHEEL_WIDTH / 2);
    tread(soup, Math.min(xo, xi), Math.max(xo, xi), r, z, r, col(TYRE));
    // the flange, on the inner side of the tread
    tread(soup, Math.min(xi, xi + sx * 0.03), Math.max(xi, xi + sx * 0.03), r, z, r + FLANGE_HEIGHT, col(TYRE));
    disc(soup, xi - sx * 0.002, r, z, r + FLANGE_HEIGHT, (-sx) as 1 | -1, col(TYRE));
    if (!full) {
      disc(soup, xo, r, z, r, sx, col(WEB));
      continue;
    }
    ring(soup, xo, r, z, r * w.tyre, r, sx, col(TYRE));
    ring(soup, xo, r, z, r * w.hub, r * w.tyre, sx, col(WEB));
    disc(soup, xo, r, z, r * w.hub, sx, col(HUB));
    disc(soup, xo + sx * 0.03, r, z, r * w.cap, sx, col(HUB), 20);
    for (let k = 0; k < w.bolts; k++) {
      const a = (2 * Math.PI * k) / w.bolts;
      disc(soup, xo + sx * 0.004, r + r * w.boltRing * Math.sin(a), z + r * w.boltRing * Math.cos(a), 0.016, sx, col(BOLT), 6);
    }
    for (let k = 0; k < w.capBolts; k++) {
      const a = (2 * Math.PI * k) / w.capBolts + 0.3;
      disc(soup, xo + sx * 0.034, r + r * w.cap * 0.62 * Math.sin(a), z + r * w.cap * 0.62 * Math.cos(a), 0.015, sx, col(BOLT), 6);
    }
    // the axle between the wheels' inner faces
    if (sx === 1) rod(soup, [-xc + 0.07, r, z], [xc - 0.07, r, z], 0.08, col(FRAME), 10);
  }
}

/** The near bogie: wheels as above, and the inside frame with its links, air spring, dampers and anti-roll link, all on both sides. */
function cafSoup(s: CafBogieSpec): Soup {
  const soup = new Soup();
  const half = s.wheelbase / 2;
  for (const z of [-half, half]) wheels(soup, s, z, true);
  for (const sx of [-1, 1] as const) {
    const back = (s.track / 2 - WHEEL_WIDTH / 2) * sx;
    const face = (s.track / 2 + WHEEL_WIDTH / 2) * sx;
    // the arm stands just outside the wheel's face, as tpe397-03 shows it, over the wheel's inner quarter
    const armX0 = face + sx * 0.035;
    const armX1 = face + sx * 0.085;
    const [ax0, ax1] = [Math.min(armX0, armX1), Math.max(armX0, armX1)];
    for (const zs of [-1, 1] as const) {
      const zi = zs * half * CAF.arm.inner;
      const zo = zs * half * CAF.arm.outer;
      soup.box(ax0, ax1, CAF.arm.y0, CAF.arm.y1, Math.min(zi, zo), Math.max(zi, zo), col(STEEL));
      // the arm's oval hole, a dark slot through its face near the axle end
      const zh = zs * half * (CAF.arm.outer - 0.12);
      soup.box(sx > 0 ? ax1 : ax0 - 0.002, sx > 0 ? ax1 + 0.002 : ax0, 0.3, 0.45, zh - 0.035, zh + 0.035, col(RUBBER));
      // the primary spring and damper pack at the arm's inner end, reaching in from the arm to the frame (clear of the wheel: inboard of its rim)
      const fIn = back - sx * (CAF.frame.inset + 0.09);
      soup.box(Math.min(fIn, ax1), Math.max(fIn, ax1), 0.15, 0.55, zs > 0 ? zi - 0.12 : zi, zs > 0 ? zi : zi + 0.12, col(FRAME));
    }
    // the side member of the frame, inboard of the wheel
    const fx = back - sx * (CAF.frame.inset + 0.09);
    const [fx0, fx1] = [Math.min(fx, fx + sx * 0.09), Math.max(fx, fx + sx * 0.09)];
    soup.box(fx0, fx1, CAF.frame.y0, CAF.frame.y1, -half * 0.86, half * 0.86, col(FRAME));
    // the long damper, the anti-roll link with the bar to it, the vertical damper, the bracket hung from the body: in the plane of the wheel faces, between the
    // wheels (tpe397-03 shows them in front of the frame)
    const dx = face + sx * 0.02;
    rod(soup, [dx, CAF.damper.y, CAF.damper.z0], [dx, CAF.damper.y, CAF.damper.z1], CAF.damper.radius, col(STEEL), 12);
    rod(soup, [dx, CAF.damper.y, CAF.damper.z0 - 0.08], [dx, CAF.damper.y, CAF.damper.z0 + 0.32], CAF.damper.radius * 1.15, col(STEEL), 12);
    rod(soup, [dx, CAF.rollLink.y0, CAF.rollLink.z], [dx, CAF.rollLink.y1, CAF.rollLink.z], 0.03, col(STEEL), 8);
    rod(soup, [dx, CAF.rollLink.y0, CAF.rollLink.z], [dx - sx * 0.25, CAF.rollLink.y0, CAF.rollLink.z + 0.38], 0.045, col(STEEL), 8);
    rod(soup, [dx, CAF.verticalDamper.y0, CAF.verticalDamper.z], [dx, CAF.verticalDamper.y1, CAF.verticalDamper.z], CAF.verticalDamper.radius, col(STEEL), 10);
    soup.box(Math.min(dx, dx - sx * 0.05), Math.max(dx, dx - sx * 0.05), CAF.bracket.y1 - 0.06, CAF.bracket.y1, CAF.bracket.z0, CAF.bracket.z1, col(STEEL));
    soup.box(Math.min(dx, dx - sx * 0.05), Math.max(dx, dx - sx * 0.05), CAF.bracket.y0, CAF.bracket.y1, CAF.bracket.z1 - 0.07, CAF.bracket.z1, col(STEEL));
    soup.box(Math.min(dx, dx - sx * 0.05), Math.max(dx, dx - sx * 0.05), CAF.bracket.y0, CAF.bracket.y1 - 0.06, CAF.bracket.z0 + 0.1, CAF.bracket.z0 + 0.16, col(STEEL));
  }
  // the transom across the middle and the air spring on it (one each side of the middle in the real bogie; tpe397-03 shows the near one)
  soup.box(-0.5, 0.5, CAF.frame.y0 + 0.05, CAF.frame.y1 - 0.05, -0.22, 0.22, col(FRAME));
  for (const sx of [-1, 1]) {
    const x = sx * 0.55;
    const pts = (y: number): V3[] => Array.from({ length: 16 }, (_, k): V3 => {
      const a = (2 * Math.PI * k) / 16;
      return [x + CAF.airSpring.radius * Math.cos(a), y, CAF.airSpring.radius * Math.sin(a)];
    });
    const lo = pts(CAF.airSpring.y0);
    const hi = pts(CAF.airSpring.y1);
    for (let k = 0; k < 16; k++) {
      const k1 = (k + 1) % 16;
      const n0 = unit([lo[k]![0] - x, 0, lo[k]![2]]);
      const n1 = unit([lo[k1]![0] - x, 0, lo[k1]![2]]);
      soup.quad([lo[k]!, lo[k1]!, hi[k1]!, hi[k]!], [n0, n1, n1, n0], col(RUBBER));
    }
    soup.fan(hi, [0, 1, 0], col(RUBBER));
  }
  if (s.motor) {
    // ASSUMED: tpe397-03 is a trailer bogie, and no motor bogie of a 397 is in the review set. A traction motor and gearbox hung on each axle inside the frame
    for (const zs of [-1, 1]) {
      const zc = zs * half * 0.5;
      soup.box(-0.42, 0.3, 0.2, 0.62, zc - 0.22, zc + 0.22, col(RUBBER));
      soup.box(0.3, 0.52, 0.25, 0.6, zs * half - 0.2, zs * half + 0.2, col(FRAME));
    }
  }
  return soup;
}

/** The far bogie: wheels with a plain face, and the frame's side members. */
function cafFarSoup(s: CafBogieSpec): Soup {
  const soup = new Soup();
  const half = s.wheelbase / 2;
  for (const z of [-half, half]) wheels(soup, s, z, false);
  for (const sx of [-1, 1] as const) {
    const back = (s.track / 2 - WHEEL_WIDTH / 2) * sx;
    soup.box(Math.min(back, back - sx * 0.1), Math.max(back, back - sx * 0.1), CAF.arm.y0, CAF.frame.y1, -half * 0.83, half * 0.83, col(FRAME));
  }
  return soup;
}

const cafCache = new Map<string, THREE.BufferGeometry>();
const cafGeometry = (key: string, make: () => Soup): THREE.BufferGeometry => {
  let g = cafCache.get(key);
  if (!g) {
    g = make().build();
    cafCache.set(key, g);
  }
  return g;
};

/**
 * The CAF bogie as the shared builder makes its bogies (train-parts buildBogie): four `wheel` markers, and a THREE.LOD `bogie-lod` of two shared meshes
 * named `bogie-mesh`, the full one near and a bare one beyond BOGIE_LOD_DISTANCE, so a disposer that spares shared bogie geometry spares these too.
 */
export function buildCafBogie(s: CafBogieSpec): THREE.Group {
  const group = new THREE.Group();
  for (const az of [-s.wheelbase / 2, s.wheelbase / 2]) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Object3D();
      w.name = 'wheel';
      w.position.set((sx * s.track) / 2, s.radius, az);
      w.userData = { radius: s.radius, width: WHEEL_WIDTH, flange: FLANGE_HEIGHT };
      group.add(w);
    }
  }
  const key = `${s.radius}/${s.wheelbase}/${s.track}`;
  const near = new THREE.Mesh(cafGeometry(`${key}/${s.motor}`, () => cafSoup(s)), plain());
  near.name = 'bogie-mesh';
  near.userData = { lod: 'near', style: 'caf' };
  const far = new THREE.Mesh(cafGeometry(`${key}/far`, () => cafFarSoup(s)), plain());
  far.name = 'bogie-mesh';
  far.userData = { lod: 'far', style: 'caf' };
  far.visible = false;
  const lod = new THREE.LOD();
  lod.name = 'bogie-lod';
  lod.addLevel(near, 0);
  // (the page may move the switch distance, as train-parts' own lodDistance reads it)
  const o = (globalThis as { __kxBogieLodDistance?: unknown }).__kxBogieLodDistance;
  lod.addLevel(far, typeof o === 'number' && o >= 0 ? o : BOGIE_LOD_DISTANCE);
  group.add(lod);
  return group;
}
