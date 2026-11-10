// Parts of the Waverley EMUs that no King's Cross kind has: a livery cut into the shell along its own edges (so a painted boundary is a straight cut
// across each triangle, not a staircase of whole quads), and the CAF inside-frame bogie of the Class 397, read off tpe397-03.
import * as THREE from 'three';
import { col, plain, roundedRect, Soup, unit } from './train-geom.ts';
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

// --- the gangway bellows -------------------------------------------------------------------------------------

export interface BellowsSpec {
  /** the body's right-hand half outline (x, y), bottom to top: the bellows is kept inside it */
  half: readonly [number, number][];
  /** the bellows' foot and its widest half-width; how far inside the body outline it keeps; the height it stops below the crown */
  bottom: number;
  halfWidth: number;
  inset: number;
  topGap: number;
  /** ribs across the half of the gap this car draws, and how far each stands proud at its crest */
  ribs: number;
  depth: number;
}

/** x of the body's right-hand outline at height y, scanning from the top down (so the roof shoulder, not the floor, answers near the crown). */
function outlineX(half: readonly [number, number][], y: number): number {
  for (let k = half.length - 1; k > 0; k--) {
    const a = half[k] as [number, number];
    const b = half[k - 1] as [number, number];
    if ((y <= a[1] && y >= b[1]) || (y >= a[1] && y <= b[1])) {
      const t = a[1] === b[1] ? 0 : (y - a[1]) / (b[1] - a[1]);
      return a[0] + (b[0] - a[0]) * Math.min(1, Math.max(0, t));
    }
  }
  return 0;
}

/**
 * The bellows' closed outline (x, y), anticlockwise from the bottom middle: a flat foot with rounded corners, sides that follow the body's outline `inset` inside
 * it (so the crown never stands above the roof line), and a flat top `topGap` under the crown. 32 points.
 */
export function bellowsOutline(s: BellowsSpec): [number, number][] {
  const crown = Math.max(...s.half.map((p) => p[1]));
  const top = crown - s.topGap;
  const w = (y: number): number => Math.max(0.2, Math.min(s.halfWidth, outlineX(s.half, y) - s.inset));
  const right: [number, number][] = [];
  const foot = 0.12;
  // the rounded foot corner
  for (let k = 0; k <= 3; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 6;
    const wx = w(s.bottom + foot);
    right.push([wx - foot + foot * Math.cos(a), s.bottom + foot + foot * Math.sin(a)]);
  }
  // the side, up to the top, following the body
  const n = 10;
  for (let k = 1; k <= n; k++) {
    const y = s.bottom + foot + ((top - s.bottom - foot) * k) / n;
    right.push([w(y), y]);
  }
  const loop: [number, number][] = [[0, s.bottom], ...right, [0, top]];
  const left = right.slice().reverse().map(([x, y]): [number, number] => [-x, y]);
  return [...loop, ...left];
}

/**
 * A ribbed bellows from the end wall (`zWall`) to the middle of the gap (`zMid`), its outline scaled out at each rib's crest along a half-sine, so the edge is
 * a row of rounded ribs and never a sawtooth; a dark face frame closes it where it meets the neighbour's half.
 *
 * Two tones, so the ribs read from the side as tpe397-02's do: each rib's crest (`colours.crest`, catching the light) and the fold between ribs
 * (`colours.valley`, in shadow). The flanks are shaded by their own lean (their normals tilt along the gap), not as a smooth tube.
 */
export function ribbedBellows(soup: Soup, s: BellowsSpec, zWall: number, zMid: number, colours: { crest: THREE.Color; valley: THREE.Color; frame: THREE.Color }): void {
  const frame = colours.frame;
  const base = bellowsOutline(s);
  const cy = (s.bottom + Math.max(...base.map((p) => p[1]))) / 2;
  // six samples a rib, the crest a rounded tube (sin^0.6) and the valley narrow, as the ribs of tpe397-02's bellows
  const per = 6;
  const rings = s.ribs * per + 1;
  const pts: V3[][] = [];
  const grows: number[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const crest = Math.sin(Math.PI * ((i % per) / per)) ** 0.6;
    const grow = s.depth * crest;
    grows.push(grow);
    pts.push(base.map(([x, y]): V3 => {
      const r = Math.hypot(x, y - cy) || 1;
      return [x + (x / r) * grow, y + ((y - cy) / r) * grow, zWall + (zMid - zWall) * t];
    }));
  }
  const dzRing = (zMid - zWall) / (rings - 1);
  for (let i = 0; i + 1 < rings; i++) {
    const a = pts[i] as V3[];
    const b = pts[i + 1] as V3[];
    // the segment's place in its rib: the middle four of six samples are the crest, the outer two the fold
    const phase = ((i % per) + 0.5) / per;
    const colour = phase > 0.2 && phase < 0.8 ? colours.crest : colours.valley;
    // the flank's lean: how fast it grows outward along the gap, so a rising flank faces back toward the wall and a falling one away from it
    const slope = ((grows[i + 1] as number) - (grows[i] as number)) / dzRing;
    for (let j = 0; j < a.length; j++) {
      const j1 = (j + 1) % a.length;
      const nrm = (p: V3): V3 => {
        const r = unit([p[0], p[1] - cy, 0]);
        return unit([r[0], r[1], -slope]);
      };
      soup.quad([a[j] as V3, a[j1] as V3, b[j1] as V3, b[j] as V3], [nrm(a[j] as V3), nrm(a[j1] as V3), nrm(b[j1] as V3), nrm(b[j] as V3)], colour);
    }
  }
  // the face frame where the two halves meet: a dark band just proud of the last rib, and the dark passage inside it
  const last = pts[rings - 1] as V3[];
  const dz = Math.sign(zMid - zWall) || 1;
  const band = base.map(([x, y]): V3 => {
    const r = Math.hypot(x, y - cy) || 1;
    return [x + (x / r) * (s.depth + 0.015), y + ((y - cy) / r) * (s.depth + 0.015), zMid - dz * 0.03];
  });
  for (let j = 0; j < band.length; j++) {
    const j1 = (j + 1) % band.length;
    const l0 = last[j] as V3;
    const l1 = last[j1] as V3;
    const b0 = band[j] as V3;
    const b1 = band[j1] as V3;
    const nrm = (p: V3): V3 => unit([p[0], p[1] - cy, 0]);
    soup.quad([b0, b1, [b1[0], b1[1], zMid], [b0[0], b0[1], zMid]], [nrm(b0), nrm(b1), nrm(b1), nrm(b0)], frame);
    soup.quad([[b0[0], b0[1], zMid], [b1[0], b1[1], zMid], [l1[0], l1[1], zMid], [l0[0], l0[1], zMid]], [[0, 0, dz], [0, 0, dz], [0, 0, dz], [0, 0, dz]], frame);
  }
}

// --- the pantograph and the roof's high-voltage gear --------------------------------------------------------------

/** A ribbed insulator standing on the roof at (x, y0, z): a core and `sheds` thin discs up it, a metal cap on top. */
function insulator(soup: Soup, x: number, y0: number, z: number, height: number, shedR: number, sheds: number, shed: THREE.Color, cap: THREE.Color): void {
  rod(soup, [x, y0, z], [x, y0 + height - 0.025, z], shedR * 0.45, shed, 10);
  for (let k = 0; k < sheds; k++) {
    const y = y0 + 0.02 + ((height - 0.06) * (k + 0.5)) / sheds;
    rod(soup, [x, y - 0.007, z], [x, y + 0.007, z], shedR, shed, 12);
  }
  rod(soup, [x, y0 + height - 0.025, z], [x, y0 + height, z], shedR * 0.6, cap, 10);
}

/** Pantograph colours: the frame and arms (grey-painted steel tube), the insulators' sheds and caps, the head, the carbon strips. */
export const PAN_COLOURS = { frame: 0x5d6168, arm: 0x7b8087, shed: 0x26282c, cap: 0x9a9ea4, head: 0x8f949b, strip: 0x1b1c1f } as const;

/**
 * A single-arm pantograph, folded, as tpe397-05 (raised, car 2) and scotrail334_02 (folded, PTOS) show it: a base frame of two rails on four ribbed insulators,
 * the lower arm a stout tube from a cross hinge at one end of the base to the knee at the other, a slim push rod beside it, the upper arm two slim tubes
 * folding back from the knee to the head, and the head a bar carrying two carbon strips with horns drooping at each end. Everything stays at or under `top`
 * (metres above the base's foot, the roof). `len` is the base's length. All sizes ASSUMED, drawn to the class's folded-height envelope.
 */
export function buildWvPantograph(len: number, top: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pantograph';
  const soup = new Soup();
  const C = PAN_COLOURS;
  const frame = col(C.frame);
  const arm = col(C.arm);
  const zA = -len / 2;
  const zB = len / 2;
  const insH = Math.min(0.1, top * 0.45);
  const railY = insH;
  // the base: two rails and two cross members, on four insulators
  for (const sx of [-1, 1]) {
    soup.box(sx * 0.42 - 0.035, sx * 0.42 + 0.035, railY, railY + 0.05, zA + 0.05, zB - 0.05, frame);
    for (const z of [zA + 0.2, zB - 0.2]) insulator(soup, sx * 0.42, 0, z, insH, 0.055, 3, col(C.shed), col(C.cap));
  }
  for (const z of [zA + 0.12, zB - 0.12]) soup.box(-0.42, 0.42, railY, railY + 0.045, z - 0.03, z + 0.03, frame);
  // the hinge tube across the base's one end, and the drive (an air cylinder) beside it
  const hingeY = railY + 0.06;
  rod(soup, [-0.36, hingeY, zA + 0.3], [0.36, hingeY, zA + 0.3], 0.035, frame, 10);
  rod(soup, [0.18, railY + 0.045, zA + 0.42], [0.18, railY + 0.045, zA + 0.95], 0.04, frame, 10);
  // the lower arm, stout at the hinge and slimmer toward the knee; it rises only a little, folded
  const knee: V3 = [0, Math.min(top - 0.06, hingeY + 0.12), zB - 0.25];
  rod(soup, [0, hingeY, zA + 0.3], [0, (hingeY + knee[1]) / 2, (zA + 0.3 + knee[2]) / 2], 0.05, arm, 10);
  rod(soup, [0, (hingeY + knee[1]) / 2, (zA + 0.3 + knee[2]) / 2], knee, 0.035, arm, 10);
  // the push rod, slim, from the base below the hinge to the knee
  rod(soup, [0.08, railY + 0.05, zA + 0.5], [0.06, knee[1] - 0.02, knee[2] - 0.08], 0.014, arm, 8);
  // the upper arm: two slim tubes from the knee back toward the hinge end, opening out to the head
  const headZ = zA + 0.55;
  const headY = top - 0.05;
  for (const sx of [-1, 1]) rod(soup, [sx * 0.03, knee[1], knee[2]], [sx * 0.24, headY - 0.02, headZ], 0.02, arm, 8);
  // the head: a cross bar, the two carbon strips on it, and the horns drooping at each end
  rod(soup, [-0.62, headY, headZ], [0.62, headY, headZ], 0.022, col(C.head), 10);
  for (const dz of [-0.075, 0.075]) soup.box(-0.6, 0.6, headY + 0.005, Math.min(top, headY + 0.045), headZ + dz - 0.022, headZ + dz + 0.022, col(C.strip));
  for (const sx of [-1, 1]) {
    for (const dz of [-0.075, 0.075]) {
      // (the horn's tip stays above the roof: the head is folded only `top` over the crown, and the roof falls away little this far out)
      rod(soup, [sx * 0.6, headY + 0.01, headZ + dz], [sx * 0.74, headY - 0.015, headZ + dz], 0.016, col(C.head), 8);
      rod(soup, [sx * 0.74, headY - 0.015, headZ + dz], [sx * 0.8, headY - 0.05, headZ + dz], 0.016, col(C.head), 8);
    }
  }
  const mesh = new THREE.Mesh(soup.build(), plain());
  mesh.name = 'pantograph-mesh';
  group.add(mesh);
  return group;
}

/**
 * The high-voltage gear at a Civity car's end, as tpe397-02 shows it from the end inward along the roof: the cable termination where the roof line crosses to
 * the next car (a dark box, a red band on it), a tall ribbed insulator, smaller ones on blocks, and the cable runs between them. Drawn into `soup` in car
 * coordinates: `zEnd` the roof's end, `dir` +1 or -1 into the car, `crown` the roof's height, `cap` the most it may stand above the crown. Sizes ASSUMED, spaced
 * along the first `CLUSTER_SPAN` metres as the photograph spaces them against the 23.35 m car. `reach` cuts it short: only the parts within that distance of
 * the end are drawn, and the cables stop there (where a pantograph's base begins).
 */
export const CLUSTER_SPAN = 4.4;
/** The red band round the cluster's termination box (tpe397-02). */
export const CLUSTER_BAND = 0xa8302b;
export function roofEndCluster(soup: Soup, zEnd: number, dir: 1 | -1, crown: number, cap: number, reach = CLUSTER_SPAN): void {
  const at = (u: number): number => zEnd + dir * Math.min(u, reach);
  const y = crown - 0.01;
  const dark = col(0x1c1d21);
  const plate = col(0x7c8086);
  const C = PAN_COLOURS;
  // the termination box and its red band
  soup.box(-0.18, 0.18, y, y + Math.min(cap, 0.16), Math.min(at(0.15), at(0.45)), Math.max(at(0.15), at(0.45)), dark);
  soup.box(-0.185, 0.185, y + Math.min(cap, 0.16) - 0.035, y + Math.min(cap, 0.16) - 0.012, Math.min(at(0.15), at(0.45)), Math.max(at(0.15), at(0.45)), col(CLUSTER_BAND));
  // the tall insulator on its plate, and two small ones on blocks
  soup.box(0.05, 0.45, y, y + 0.02, Math.min(at(0.75), at(1.15)), Math.max(at(0.75), at(1.15)), plate);
  insulator(soup, 0.25, y + 0.02, at(0.95), Math.min(cap - 0.02, 0.19), 0.075, 5, col(C.shed), col(C.cap));
  for (const [u, x] of [[2.2, -0.25], [3.6, 0.25]] as const) {
    if (u + 0.1 > reach) continue;
    soup.box(x - 0.1, x + 0.1, y, y + 0.04, Math.min(at(u - 0.1), at(u + 0.1)), Math.max(at(u - 0.1), at(u + 0.1)), plate);
    insulator(soup, x, y + 0.04, at(u), Math.min(cap - 0.04, 0.1), 0.045, 3, col(C.shed), col(C.cap));
  }
  // the cable runs: termination to the tall insulator, then along the roof to the small ones, and the last runs on to the pantograph's base, `reach` + 0.15
  // (round 5: they stopped 0.15 m short of it, with the gear)
  const cy = y + 0.035;
  const base = reach + 0.15;
  const atCable = (u: number): number => zEnd + dir * Math.min(u, base);
  const cable = (pts: [number, number][]): void => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, u0] = pts[k] as [number, number];
      const [x1, u1] = pts[k + 1] as [number, number];
      if (u0 >= base) continue;
      rod(soup, [x0, cy, atCable(u0)], [x1, cy, atCable(u1)], 0.016, dark, 6);
    }
  };
  cable([[0.1, 0.45], [0.25, 0.8]]);
  cable([[0.25, 1.1], [0.25, 3.5]]);
  cable([[-0.05, 0.45], [-0.25, 0.9], [-0.25, 2.1]]);
  cable([[-0.25, 2.3], [-0.25, base]]);
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
/** tpe397-03: the cast arm a mid grey, the spring unit in it dark with two pale plates */
const ARM = 0x6c7176;
export const SPRING_UNIT = 0x2e3033;
const PLATE = 0xaeb2b6;
export const MOTOR = 0x34373b;
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
  arm: { inner: 0.46, outer: 0.83, y0: 0.23, y1: 0.52,
    // (round 5, read off tpe397-03 close to: u from the axle toward the middle) the jaws' inner face, the pivot, the web and the spring unit between them;
    // the top bar's top and the lower bar's foot
    jaw: 0.22, pivot: 0.78, web: [0.27, 0.4], spring: [0.42, 0.67], top: 0.56, foot: 0.25 },
  /** the inside frame's side members: the height of their foot and top, and how far in from the wheel's back face */
  frame: { y0: 0.45, y1: 0.8, inset: 0.06 },
  /** the air spring on the frame's middle */
  airSpring: { y0: 0.79, y1: 0.93, radius: 0.31 },
  /** the long horizontal damper, from just behind the middle toward one wheel */
  damper: { z0: -0.16, z1: 0.76, y: 0.6, radius: 0.065 },
  /** the anti-roll link and its bar; the vertical damper */
  rollLink: { z: -0.53, y0: 0.28, y1: 0.91 },
  verticalDamper: { z: -0.4, y0: 0.49, y1: 0.81, radius: 0.045 },
  /** the triangular bracket hung from the body over the damper's far end */
  // (round 5: its top plate is bolted under the body's underframe, 1.0 m up, as the test measures it; it falls to a point at the damper's end, as -03 shows it)
  bracket: { z0: 0.6, z1: 0.98, y0: 0.55, y1: 1.0 },
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

function ring(soup: Soup, cx: number, cy: number, cz: number, r0: number, r1: number, nx: 1 | -1, colour: THREE.Color, seg = SEG): void {
  for (let k = 0; k < seg; k++) {
    const a0 = (2 * Math.PI * k) / seg;
    const a1 = (2 * Math.PI * (k + 1)) / seg;
    const at = (r: number, a: number): V3 => [cx, cy + r * Math.sin(a), cz + r * Math.cos(a)];
    soup.quad([at(r0, a0), at(r1, a0), at(r1, a1), at(r0, a1)], [[nx, 0, 0], [nx, 0, 0], [nx, 0, 0], [nx, 0, 0]], colour);
  }
}

/** A cylinder along x (a wheel's tread), from x0 to x1. */
function tread(soup: Soup, x0: number, x1: number, cy: number, cz: number, r: number, colour: THREE.Color, seg = SEG): void {
  for (let k = 0; k < seg; k++) {
    const a0 = (2 * Math.PI * k) / seg;
    const a1 = (2 * Math.PI * (k + 1)) / seg;
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

/** How a bogie's wheels are coloured and finished: the round 40-sided wheel is shared, its face differs. */
interface WheelLook {
  tyre: number;
  web: number;
  hub: number;
  bolt: number;
  axle: number;
  /** disc-brake bolts on the web (the 397's bolted disc wheel); 0 for a plain web */
  bolts: number;
}
const CAF_WHEEL: WheelLook = { tyre: TYRE, web: WEB, hub: HUB, bolt: BOLT, axle: FRAME, bolts: CAF.wheel.bolts };

/** A wheelset's two wheels: tread, flange, the outer face (tyre, web with any disc bolts, hub and cap) and a plain inner face. */
function wheels(soup: Soup, s: CafBogieSpec, z: number, full: boolean, look: WheelLook = CAF_WHEEL): void {
  const r = s.radius;
  const w = CAF.wheel;
  for (const sx of [-1, 1] as const) {
    const xc = (sx * s.track) / 2;
    const xo = xc + sx * (WHEEL_WIDTH / 2);
    const xi = xc - sx * (WHEEL_WIDTH / 2);
    // (the far wheels, seen only beyond the LOD distance, are 12-sided: a few pixels across there. Near, the tread and the tyre's rim are 40-sided, so
    // the wheel's silhouette is round; the flange behind the tread, its inner face and the web's inner edge are 20 or 24, as nothing outlines them)
    const seg = full ? SEG : 12;
    const inner = full ? 20 : 12;
    tread(soup, Math.min(xo, xi), Math.max(xo, xi), r, z, r, col(look.tyre), seg);
    // the flange, on the inner side of the tread
    tread(soup, Math.min(xi, xi + sx * 0.03), Math.max(xi, xi + sx * 0.03), r, z, r + FLANGE_HEIGHT, col(look.tyre), inner);
    disc(soup, xi - sx * 0.002, r, z, r + FLANGE_HEIGHT, (-sx) as 1 | -1, col(look.tyre), inner);
    if (!full) {
      disc(soup, xo, r, z, r, sx, col(look.web), seg);
      continue;
    }
    ring(soup, xo, r, z, r * w.tyre, r, sx, col(look.tyre));
    // (the web's ring stops short of the tread: its outer edge lies on the tyre ring, so 40 sides there; its inner edge, the hub, is 24)
    ring(soup, xo, r, z, r * w.hub, r * w.tyre, sx, col(look.web));
    disc(soup, xo, r, z, r * w.hub, sx, col(look.hub), 24);
    disc(soup, xo + sx * 0.03, r, z, r * w.cap, sx, col(look.hub), 20);
    for (let k = 0; k < look.bolts; k++) {
      const a = (2 * Math.PI * k) / look.bolts;
      disc(soup, xo + sx * 0.004, r + r * w.boltRing * Math.sin(a), z + r * w.boltRing * Math.cos(a), 0.016, sx, col(look.bolt), 6);
    }
    for (let k = 0; k < w.capBolts; k++) {
      const a = (2 * Math.PI * k) / w.capBolts + 0.3;
      disc(soup, xo + sx * 0.034, r + r * w.cap * 0.62 * Math.sin(a), z + r * w.cap * 0.62 * Math.cos(a), 0.015, sx, col(look.bolt), 6);
    }
    // the axle between the wheels' inner faces
    if (sx === 1) rod(soup, [-xc + 0.07, r, z], [xc - 0.07, r, z], 0.08, col(look.axle), 10);
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
      const axle = zs * half;
      // the cast arm as tpe397-03 shows it close to (round 5): an open link, not a plate. Two bars (a flanged top and a lower bar rising a little toward the
      // pivot) join a pair of jaws round the axlebox at one end and a round pivot boss at the other; between them a web with the oval lightening hole, and
      // the spring unit, a dark block with two pale plates, set in the link (ASSUMED to be the primary spring: it stands where the arm carries the frame).
      // u is the distance from the axle toward the bogie's middle, Zu its z.
      const Zu = (u: number): number => axle - zs * u;
      const xOut = sx > 0 ? ax1 : ax0;
      const xIn = sx > 0 ? ax0 : ax1;
      const proud = (d: number): number => xOut + sx * d;
      const A = CAF.arm;
      const bar = (u0: number, u1: number, y0a: number, y1a: number, y0b: number, y1b: number, c: THREE.Color, out = 0): void =>
        soup.prismX([[Zu(u0), y0a], [Zu(u1), y0b], [Zu(u1), y1b], [Zu(u0), y1a]], xIn, proud(out), c);
      bar(A.jaw, A.pivot, A.top - 0.05, A.top, A.top - 0.05, A.top, col(ARM));
      bar(A.jaw, A.pivot, A.foot, A.foot + 0.05, A.foot + 0.03, A.foot + 0.08, col(ARM));
      // the top flange, a hair proud and lighter so the bar reads as a section, not a plate
      bar(A.jaw, A.pivot, A.top - 0.012, A.top + 0.006, A.top - 0.012, A.top + 0.006, col(STEEL), 0.012);
      // the web with its oval hole
      bar(A.web[0], A.web[1], A.foot + 0.04, A.top - 0.04, A.foot + 0.05, A.top - 0.04, col(ARM));
      const uh = (A.web[0] + A.web[1]) / 2;
      soup.prismX(roundedRect(Math.min(Zu(uh - 0.035), Zu(uh + 0.035)), Math.max(Zu(uh - 0.035), Zu(uh + 0.035)), A.foot + 0.1, A.top - 0.1, 0.035, 3), xOut, proud(0.002), col(RUBBER), false);
      // the spring unit in the link, and its two plates
      bar(A.spring[0], A.spring[1], A.foot + 0.05, A.top - 0.05, A.foot + 0.06, A.top - 0.05, col(SPRING_UNIT), 0.015);
      for (const [y0p, y1p] of [[A.top - 0.13, A.top - 0.07], [A.foot + 0.08, A.foot + 0.14]] as const) {
        const [p0, p1] = [Zu(A.spring[0] + 0.03), Zu(A.spring[1] - 0.03)];
        soup.prismX([[Math.min(p0, p1), y0p], [Math.max(p0, p1), y0p], [Math.max(p0, p1), y1p], [Math.min(p0, p1), y1p]], proud(0.015), proud(0.019), col(PLATE), false);
      }
      // the jaws round the axlebox: an upper and a lower block, bolted, either side of the drum
      for (const [y0j, y1j] of [[s.radius + 0.1, A.top + 0.03], [A.foot - 0.04, s.radius - 0.1]] as const) {
        bar(A.jaw - 0.12, A.jaw + 0.02, y0j, y1j, y0j, y1j, col(ARM), 0.02);
        disc(soup, proud(0.021), (y0j + y1j) / 2, Zu(A.jaw - 0.05), 0.016, sx, col(BOLT), 6);
      }
      // the pivot: a round boss with its bolt, where the arm hangs from the frame
      rod(soup, [xIn, (A.top + A.foot) / 2 + 0.02, Zu(A.pivot - 0.03)], [proud(0.02), (A.top + A.foot) / 2 + 0.02, Zu(A.pivot - 0.03)], 0.065, col(ARM), 12);
      disc(soup, proud(0.022), (A.top + A.foot) / 2 + 0.02, Zu(A.pivot - 0.03), 0.025, sx, col(BOLT), 6);
      // the axlebox drum on the axle end and its dark cover with bolts
      rod(soup, [face + sx * 0.03, s.radius, axle], [face + sx * 0.1, s.radius, axle], 0.12, col(FRAME), 14);
      disc(soup, face + sx * 0.104, s.radius, axle, 0.085, sx, col(RUBBER), 12);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        disc(soup, face + sx * 0.105, s.radius + 0.1 * Math.sin(a), axle + 0.1 * Math.cos(a), 0.012, sx, col(BOLT), 6);
      }
      // on a motor bogie, an earth-return unit on one axle end of each side: a drum on the cover and its cable up to the frame (ASSUMED, as the motor)
      if (s.motor && zs > 0) {
        rod(soup, [face + sx * 0.104, s.radius, axle], [face + sx * 0.17, s.radius, axle], 0.06, col(SPRING_UNIT), 12);
        rod(soup, [face + sx * 0.15, s.radius + 0.05, axle], [face + sx * 0.15, A.top + 0.12, Zu(0.2)], 0.012, col(RUBBER), 6);
      }
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
    // the bracket hung from the body (tpe397-03): a cast triangle, its top a plate under the body and its two legs meeting in a boss at the damper's end,
    // open in the middle; each bar a quad in the (z, y) plane, extruded across
    const B = CAF.bracket;
    const zp = (B.z0 + B.z1) / 2;
    const bxIn = dx - sx * 0.05;
    const bxOut = dx + sx * 0.03;
    const plateY = B.y1 - 0.05;
    // a cast plate (tpe397-03 close to): bolted under the body across its top, its sides falling to a rounded foot at the damper's end; the big triangular
    // opening in its upper part and the small oval one under it are dark through it. One convex outline, and the openings laid on its face.
    soup.prismX([[B.z0, B.y1], [B.z1, B.y1], [B.z1 - 0.04, plateY - 0.06], [zp + 0.05, B.y0], [zp - 0.05, B.y0], [B.z0 + 0.04, plateY - 0.06]], bxIn, bxOut, col(STEEL));
    // (the opening sits low in the plate: the body's side skirt hides the plate's top 0.14 m from the platform)
    soup.prismX([[B.z0 + 0.12, B.y1 - 0.17], [B.z1 - 0.12, B.y1 - 0.17], [zp + 0.025, B.y1 - 0.31], [zp - 0.025, B.y1 - 0.31]], bxOut, bxOut + sx * 0.002, col(RUBBER), false);
    soup.prismX(roundedRect(zp - 0.025, zp + 0.025, B.y0 + 0.08, B.y0 + 0.15, 0.025, 3), bxOut, bxOut + sx * 0.002, col(RUBBER), false);
    for (const zb of [B.z0 + 0.04, B.z1 - 0.04]) disc(soup, bxOut + sx * 0.002, B.y1 - 0.025, zb, 0.016, sx, col(BOLT), 6);
    // the boss at its foot, and the damper's eye on it
    rod(soup, [bxIn, B.y0 + 0.05, zp], [bxOut + sx * 0.012, B.y0 + 0.05, zp], 0.045, col(STEEL), 12);
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
    // ASSUMED: tpe397-03 is a trailer bogie, and no motor bogie of a 397 is in the review set. A traction motor hung across the bogie by each axle, its
    // ribbed body showing under the frame from the side, and a gearbox on the axle beside it; the earth-return units on the axle ends (above)
    for (const zs of [-1, 1]) {
      // (toward the middle, where the side view is open between the arms' pivots and the transom, so the motor's end shows under the damper)
      const zc = zs * 0.36;
      const my = 0.36;
      rod(soup, [-0.62, my, zc], [0.62, my, zc], 0.23, col(MOTOR), 14);
      for (const xr of [-0.4, 0, 0.4]) rod(soup, [xr - 0.02, my, zc], [xr + 0.02, my, zc], 0.245, col(FRAME), 14);
      for (const sx of [-1, 1]) disc(soup, sx * 0.62, my, zc, 0.23, sx as 1 | -1, col(MOTOR), 14);
      soup.box(0.3, 0.52, 0.22, 0.58, zs * half - zs * 0.32 - 0.12, zs * half - zs * 0.32 + 0.12, col(MOTOR));
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
  return assembleBogie(s, 'caf', () => cafSoup(s), () => cafFarSoup(s));
}

// --- the 334's bogie (scotrail334_07: 334015 at Partick, 2023, the leading bogie side-on) -----------------------------

// colours read off scotrail334_07: a working bogie, the frame dark grey under brown brake dust, the wheels near black
const J_FRAME = 0x3a3733;
const J_SPRING = 0x262422;
const J_BOX = 0x4a4642;
// (the damper is as dark as the rest under its dust: round 3's pale rod read as a white stick against _07's all-dark bogie)
const J_DAMPER = 0x4a4743;
export const J_AIR = 0x46433f;
const J_WHEEL: WheelLook = { tyre: 0x2b2927, web: 0x3b3530, hub: 0x34312e, bolt: 0x24221f, axle: J_FRAME, bolts: 0 };

/**
 * Where the 334's bogie parts stand (metres from the bogie's centre along the track, z, and above the rail head, y). The photograph fixes the arrangement
 * (an outside frame over round axlebox housings, coil springs above them, the frame dropping between the wheels, a damper running down from the middle toward
 * one end); every size is ASSUMED, drawn against the 0.84 m ASSUMED wheel.
 */
export const JUNIPER_BOGIE = {
  /** the side frame outside the wheels: its depth across the track (from just outside the wheel face) and the heights of its top beam and dropped middle */
  // (the beam's top sits just under the body's valance, about 0.85 m, so the beam shows as it does in the photograph)
  // (round 4: a shaped side frame, not plates. High over each axlebox, a sloped neck, and a deep middle whose top drops to carry the air spring in view;
  // two lightening holes through the middle, as _07's left-hand frame shows them. `middleTop` is the middle's top, `neck` the slope's length along the track)
  frame: { x0: 0.05, x1: 0.15, top: 0.84, beam: 0.68, drop: 0.36, middleHalf: 0.45, middleTop: 0.6, neck: 0.3 },
  /** the axlebox housing on each axle end, a drum along the axle */
  axlebox: { radius: 0.15, x0: 0.035, x1: 0.16, cover: 0.1 },
  /** the primary coil springs either side of each axlebox, standing on its wings and carrying the beam */
  spring: { offset: 0.2, radius: 0.075, y0: 0.53, y1: 0.68 },
  /** the secondary air spring on the frame's middle, under the body */
  // (it stands on the frame's dropped middle, outboard, between it and the body: a dark rubber drum under a metal plate, its top at the body's underframe)
  airSpring: { radius: 0.17, y0: 0.6, y1: 0.79 },
  /** the damper, from the frame's middle down toward the leading axle */
  damper: { z0: 0.15, y0: 0.52, z1: -1.0, y1: 0.5, radius: 0.055 },
} as const;

function juniperSoup(s: CafBogieSpec): Soup {
  const soup = new Soup();
  const half = s.wheelbase / 2;
  const J = JUNIPER_BOGIE;
  for (const z of [-half, half]) wheels(soup, s, z, true, J_WHEEL);
  for (const sx of [-1, 1] as const) {
    const face = (s.track / 2 + WHEEL_WIDTH / 2) * sx;
    const fx0 = face + sx * J.frame.x0;
    const fx1 = face + sx * J.frame.x1;
    const [x0, x1] = [Math.min(fx0, fx1), Math.max(fx0, fx1)];
    juniperFrame(soup, sx, x0, x1, half, true);
    for (const z of [-half, half]) {
      // the axlebox drum on the axle end, outboard of the wheel, with its cover and bolts
      const bx0 = face + sx * J.axlebox.x0;
      const bx1 = face + sx * J.axlebox.x1;
      rod(soup, [bx0, s.radius, z], [bx1, s.radius, z], J.axlebox.radius, col(J_BOX), 24);
      disc(soup, bx1 + sx * 0.012, s.radius, z, J.axlebox.cover, sx, col(J_FRAME), 24);
      for (let k = 0; k < 6; k++) {
        const a = (2 * Math.PI * k) / 6;
        disc(soup, bx1 + sx * 0.016, s.radius + 0.075 * Math.sin(a), z + 0.075 * Math.cos(a), 0.014, sx, col(J_SPRING), 6);
      }
      // the primary springs, standing on the axlebox's wings and carrying the beam
      const sxm = face + sx * ((J.frame.x0 + J.frame.x1) / 2);
      for (const dz of [-J.spring.offset, J.spring.offset]) {
        rod(soup, [sxm, J.spring.y0, z + dz], [sxm, J.spring.y1, z + dz], J.spring.radius, col(J_SPRING), 12);
        // a coil's turns, as dark rings standing proud of the spring
        for (let t = 1; t < 5; t++) {
          const y = J.spring.y0 + ((J.spring.y1 - J.spring.y0) * t) / 5;
          rod(soup, [sxm, y - 0.008, z + dz], [sxm, y + 0.008, z + dz], J.spring.radius + 0.012, col(J_BOX), 12);
        }
      }
      // the wing under the springs
      soup.box(x0, x1, J.spring.y0 - 0.05, J.spring.y0, z - J.spring.offset - 0.1, z + J.spring.offset + 0.1, col(J_BOX));
    }
    // the damper, down from the frame's middle toward one axle, and its body
    const dx = face + sx * (J.frame.x1 + 0.06);
    const a: V3 = [dx, J.damper.y0, J.damper.z0];
    const b: V3 = [dx, J.damper.y1, J.damper.z1];
    rod(soup, a, b, J.damper.radius * 0.6, col(J_DAMPER), 10);
    rod(soup, a, [a[0], a[1] + (b[1] - a[1]) * 0.55, a[2] + (b[2] - a[2]) * 0.55], J.damper.radius, col(J_DAMPER), 12);
    // its brackets: one on the frame's dropped middle, one on the axlebox wing
    const bx: [number, number] = [Math.min(dx, dx - sx * 0.08), Math.max(dx, dx - sx * 0.08)];
    soup.box(bx[0], bx[1], a[1] - 0.06, a[1] + 0.06, a[2] - 0.05, a[2] + 0.05, col(J_FRAME));
    soup.box(bx[0], bx[1], b[1] - 0.05, b[1] + 0.05, b[2] - 0.05, b[2] + 0.05, col(J_FRAME));
    // the air spring on the frame's dropped middle: a bulging rubber drum (wider at its waist), a metal plate on top under the body
    const ax = face + sx * ((J.frame.x0 + J.frame.x1) / 2);
    const A = J.airSpring;
    const band = (y: number, r: number): V3[] => Array.from({ length: 16 }, (_, k): V3 => {
      const t = (2 * Math.PI * k) / 16;
      return [ax + r * Math.cos(t), y, r * Math.sin(t)];
    });
    const levels: [number, number][] = [[A.y0, A.radius * 0.8], [(A.y0 + A.y1) / 2, A.radius], [A.y1 - 0.03, A.radius * 0.85]];
    for (let l = 0; l + 1 < levels.length; l++) {
      const [ya, ra] = levels[l] as [number, number];
      const [yb, rb] = levels[l + 1] as [number, number];
      const lo = band(ya, ra);
      const hi = band(yb, rb);
      const tilt = (ra - rb) / (yb - ya);
      for (let k = 0; k < 16; k++) {
        const k1 = (k + 1) % 16;
        const nrm = (q: V3): V3 => unit([q[0] - ax, tilt * Math.hypot(q[0] - ax, q[2]), q[2]]);
        soup.quad([lo[k]!, lo[k1]!, hi[k1]!, hi[k]!], [nrm(lo[k]!), nrm(lo[k1]!), nrm(hi[k1]!), nrm(hi[k]!)], col(J_AIR));
      }
    }
    rod(soup, [ax, A.y1 - 0.03, 0], [ax, A.y1, 0], A.radius * 0.95, col(J_BOX), 16);
  }
  // the transom between the side frames
  const inner = s.track / 2 + WHEEL_WIDTH / 2 + J.frame.x0;
  soup.box(-inner, inner, J.frame.drop + 0.04, J.frame.middleTop - 0.04, -0.2, 0.2, col(J_FRAME));
  if (s.motor) {
    // ASSUMED: no motor bogie is seen closely; a traction motor and gearbox hung on each axle inside the frame, as on the 397
    for (const zs of [-1, 1]) {
      const zc = zs * half * 0.5;
      soup.box(-0.42, 0.3, 0.2, 0.62, zc - 0.22, zc + 0.22, col(J_SPRING));
      soup.box(0.3, 0.52, 0.25, 0.6, zs * half - 0.2, zs * half + 0.2, col(J_FRAME));
    }
  }
  return soup;
}

function juniperFarSoup(s: CafBogieSpec): Soup {
  const soup = new Soup();
  const half = s.wheelbase / 2;
  const J = JUNIPER_BOGIE;
  for (const z of [-half, half]) wheels(soup, s, z, false, J_WHEEL);
  for (const sx of [-1, 1] as const) {
    const face = (s.track / 2 + WHEEL_WIDTH / 2) * sx;
    const [x0, x1] = [Math.min(face + sx * J.frame.x0, face + sx * J.frame.x1), Math.max(face + sx * J.frame.x0, face + sx * J.frame.x1)];
    juniperFrame(soup, sx, x0, x1, half, false);
  }
  return soup;
}

/**
 * One side frame of the 334's bogie, in pieces along the track, each a convex outline in the (z, y) plane extruded across the frame's depth and capped on
 * both faces: the end chamfers, the beam over each axlebox, the necks sloping down to the deep middle, and the middle (with its two lightening holes, near
 * only). Its outline is closed: each piece shares its edge with the next.
 */
function juniperFrame(soup: Soup, sx: 1 | -1, x0: number, x1: number, half: number, holes: boolean): void {
  const F = JUNIPER_BOGIE.frame;
  const c = col(J_FRAME);
  const [xOut, xIn] = sx > 0 ? [x1, x0] : [x0, x1];
  const piece = (pts: [number, number][]): void => {
    soup.prismX(pts, xIn, xOut, c);
    soup.prismX(pts.slice().reverse(), xOut, xIn, c, false);
  };
  const m = F.middleHalf;
  const n = m + F.neck;
  const end = half + 0.3;
  piece([[-m, F.drop], [m, F.drop], [m, F.middleTop], [-m, F.middleTop]]);
  for (const zs of [-1, 1]) {
    const Z = (z: number): number => zs * z;
    const quad = (q: [number, number][]): [number, number][] => (zs > 0 ? q : q.map(([z, y]): [number, number] => [z, y]).reverse());
    piece(quad([[Z(m), F.drop], [Z(n), F.beam - 0.02], [Z(n), F.top], [Z(m), F.middleTop]]));
    piece(quad([[Z(n), F.beam - 0.02], [Z(end - 0.12), F.beam], [Z(end - 0.12), F.top], [Z(n), F.top]]));
    piece(quad([[Z(end - 0.12), F.beam], [Z(end), F.beam + 0.06], [Z(end), F.top - 0.04], [Z(end - 0.12), F.top]]));
  }
  if (!holes) return;
  for (const zh of [-0.3, 0.3]) soup.prismX(roundedRect(zh - 0.075, zh + 0.075, F.drop + 0.06, F.middleTop - 0.06, 0.06, 3), xOut, xOut + sx * 0.002, col(0x111111), false);
}

/** The 334's outside-frame bogie, made as buildCafBogie makes its own (`userData.style = 'juniper'`). */
export function buildJuniperBogie(s: CafBogieSpec): THREE.Group {
  return assembleBogie(s, 'juniper', () => juniperSoup(s), () => juniperFarSoup(s));
}

function assembleBogie(s: CafBogieSpec, style: 'caf' | 'juniper', near0: () => Soup, far0: () => Soup): THREE.Group {
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
  const key = `${style}/${s.radius}/${s.wheelbase}/${s.track}`;
  const near = new THREE.Mesh(cafGeometry(`${key}/${s.motor}`, near0), plain());
  near.name = 'bogie-mesh';
  near.userData = { lod: 'near', style };
  const far = new THREE.Mesh(cafGeometry(`${key}/far`, far0), plain());
  far.name = 'bogie-mesh';
  far.userData = { lod: 'far', style };
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

// --- the 334's coupler (scotrail334_05, _07) -----------------------------------------------------------------

/**
 * The 334's automatic coupler as scotrail334_05 and _07 show it standing in the bumper's arched opening: a dark shank, a cast grey head with a square face,
 * the guide cone on one side and the funnel on the other, a yellow release handle over it and the black electrical coupler box hung under it. Drawn from
 * the face (`z0`) out along `dir` to `reach` (the car's end): nothing stands beyond it. `y` is the coupler's height. Sizes ASSUMED, read against the assumed
 * 2.80 m width in _05's head-on view.
 */
export function juniperCoupler(soup: Soup, z0: number, dir: 1 | -1, reach: number, y: number): void {
  const zr = (u0: number, u1: number): [number, number] => (dir > 0 ? [z0 + u0, z0 + u1] : [z0 - u1, z0 - u0]);
  const at = (u: number): number => z0 + dir * u;
  const shank = col(0x2c2e31);
  const cast = col(0x74777b);
  const plate = col(0x878a8e);
  // the shank, from the recess to the head
  rod(soup, [0, y, at(0.02)], [0, y, at(reach - 0.16)], 0.07, shank, 12);
  // the head's body and its face plate, the face set back so the cone's tip stands at the car's end
  const [h0, h1] = zr(reach - 0.17, reach - 0.08);
  soup.box(-0.2, 0.2, y - 0.15, y + 0.14, h0, h1, cast);
  const [p0, p1] = zr(reach - 0.08, reach - 0.06);
  soup.box(-0.21, 0.21, y - 0.16, y + 0.15, p0, p1, plate);
  // the cone on one side of the face (_05: the left seen from ahead; mirrored with the cab, so a coupled pair meets cone to funnel), the funnel on the other
  const cx = 0.085 * dir;
  rod(soup, [cx, y - 0.02, at(reach - 0.06)], [cx, y - 0.02, at(reach - 0.03)], 0.055, cast, 12);
  rod(soup, [cx, y - 0.02, at(reach - 0.03)], [cx, y - 0.02, at(reach - 0.002)], 0.035, plate, 12);
  const fx = -cx;
  rod(soup, [fx, y - 0.02, at(reach - 0.06)], [fx, y - 0.02, at(reach - 0.045)], 0.075, cast, 16);
  const mouth: V3[] = Array.from({ length: 16 }, (_, k): V3 => {
    const t = (2 * Math.PI * k) / 16;
    return [fx + 0.055 * Math.cos(t), y - 0.02 + 0.055 * Math.sin(t), at(reach - 0.044)];
  });
  soup.fan(mouth, [0, 0, dir], col(0x141516));
  // the release handle over the head, yellow
  rod(soup, [-0.05 * dir, y + 0.15, at(reach - 0.12)], [-0.16 * dir, y + 0.27, at(reach - 0.1)], 0.012, col(0xd8b21c), 6);
  // the electrical coupler's box under the head
  const [e0, e1] = zr(reach - 0.24, reach - 0.07);
  soup.box(-0.17, 0.17, y - 0.36, y - 0.19, e0, e1, col(0x1b1c1e));
  soup.box(-0.035, 0.035, y - 0.19, y - 0.15, e0, e1, shank);
}
