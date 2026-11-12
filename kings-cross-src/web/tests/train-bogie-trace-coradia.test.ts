// The Class 180's bogie frame as its photograph traces it (round 7, "the Class 180 cab-end bogie": the round-5 score held the KX trains at a minimum of 5.5 for want of evidence on exactly this). Round 7
// traces `class180-gc-york-side-arthur-2026-11-11.png` (a Grand Central Class 180's leading cab car side on at York, supplied by Arthur; a private modelling reference of unknown source and licence,
// never copied, committed or shipped): the outline of the side beam with its window and pockets, at each end the axle box with its housing and cap, the primary spring, the vertical damper, the brake
// calliper and the boss on the neck, along the middle the car's bracket, the yaw damper with its label and clevises, the window's yellow edges and the bar under the bogie, and over the middle the air
// spring, each measured in the photograph's own pixels beside the two caps that calibrate it. (`train-bogie-trace-electrostar.test.ts` does the same for the Electrostar.)
//
// The numbers below are an independent copy of `CORADIA_TRACE` (web/src/train-bogie-trace.ts) and of the depths `CORADIA_DEPTH` (train-parts.ts), and the calibration is restated from the two caps and the
// wheelbase, so a number changed in either place fails here. Two things the photograph cannot give are ASSUMED and pinned as such: the depth of each part across the bogie (a side-on photograph shows none),
// and the wheelbase, 2.7 m (no page read publishes it for the Class 180; `EMU_FIGURES.adelante` says so), which is the scale of every length here. The photograph is of a trailer bogie (the cab end's), so a
// motor bogie is the same frame with the diesel's final drive added (a GAP: nothing in the photograph shows what a driven bogie carries between its wheels).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMU_FIGURES, FIGURES } from '../../core/train.ts';
import { CORADIA_TRACE } from '../src/train-bogie-trace.ts';
import { BOGIE_HALF_WIDTH, BOGIE_TOP, bogieFarSoup, bogieParts, bogieSoup } from '../src/train-parts.ts';
import type { BogieSpec } from '../src/train-parts.ts';
import { col } from '../src/train-geom.ts';
import type { Soup } from '../src/train-geom.ts';

type V3 = [number, number, number];
type Px = readonly [number, number];
type Rect = readonly [number, number, number, number];

// --- the calibration, restated: the caps are a wheelbase apart and their row is the axle line --------------------------------------------------------------------------------------------
const SPEC: BogieSpec = { radius: 0.42, wheelbase: 2.7, track: FIGURES.gauge.value, motor: false, style: 'coradia' };
const SCALE = (501.1 - 168.5) / 2.7;
const MID = (168.5 + 501.1) / 2;
const ROW = (506.3 + 506.3) / 2;
const Z = (px: number): number => -(px - MID) / SCALE;
const Y = (py: number): number => 0.42 + (ROW - py) / SCALE;
const LEN = (p: number): number => p / SCALE;

// --- the numbers read off the (turned) photograph ---------------------------------------------------------------------------------------------------------------------------------------
const BEAM: Px[] = [
  [141.5, 447.5], [225, 448.5], [251, 452], [268, 457], [276, 466], [294, 470.5], [376, 470.5], [385, 467], [430, 449], [524, 447.5], [524.5, 471.6], [470, 471], [447, 479], [446, 491],
  [484, 489], [484, 509], [190, 509], [190, 489], [222, 491], [222, 482], [214, 474], [200, 470.8], [141.5, 471.4],
];
interface End {
  name: string;
  /** The axle-end cap's centre column (the axle). */
  cap: number;
  box: Rect;
  housing: number;
  capRadius: number;
  core: Rect;
  drum: Rect;
  damper: Rect;
  calliper: Rect;
  boss: { c: Px; r: number };
}
const ENDS: End[] = [
  {
    name: 'left',
    cap: 168.5,
    box: [147.5, 489.5, 190, 526],
    housing: 20,
    capRadius: 12,
    core: [151, 471, 183, 479],
    drum: [146.5, 479, 184.5, 490],
    damper: [121.5, 462, 132, 505],
    calliper: [119, 497, 150, 517],
    boss: { c: [232, 462], r: 10 },
  },
  {
    name: 'right',
    cap: 501.1,
    box: [482, 489, 520, 527],
    housing: 19,
    capRadius: 9,
    core: [487, 471, 515, 480],
    drum: [483.5, 480, 513.5, 489],
    damper: [526.5, 481, 537, 508],
    calliper: [513, 500, 541, 525],
    boss: { c: [434.5, 464], r: 8 },
  },
];
const WINDOW_LEFT: Rect = [291, 442, 297, 471];
const WINDOW_FLOOR: Rect = [296, 468, 376, 473];
const WINDOW_RIGHT: Px[] = [[372.5, 473], [377.5, 473], [384.8, 442], [379.8, 442]];
const BRACKET: Px[] = [[263.5, 442], [291, 442], [291, 478], [281, 480], [275, 470], [268, 452]];
const YAW = { from: [299, 485.7] as Px, to: [378, 495.9] as Px, radius: 7.3, label: [313, 348] as readonly [number, number], clevisLeft: [282, 476, 299, 497] as Rect, clevisRight: [378, 486, 397, 504] as Rect };
const BAR: Rect = [303, 512.5, 378, 519];
const AIR = { left: 305, right: 367, base: 470.5 };

/** The depths across the bogie (metres from the centre line): ASSUMED, a side-on photograph shows none. */
const DEPTH = {
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
/** The yaw damper's yellow label is a band this much bigger in radius than its body: ASSUMED. */
const LABEL = 0.003;

// --- helpers --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const key = (v: readonly number[]): string => v.map((c) => Math.round(c * 1e6)).join(',');
const vertsOf = (s: Soup): V3[] => Array.from({ length: s.pos.length / 3 }, (_, i): V3 => [s.pos[3 * i] as number, s.pos[3 * i + 1] as number, s.pos[3 * i + 2] as number]);
const trisOf = (s: Soup): number => s.pos.length / 9;
/** The bogie under test, built on first use inside a test (a builder that throws is then a failing test, not a dead file). */
let built: { parts: ReturnType<typeof bogieParts>; frame: V3[]; frameKeys: Set<string>; springVerts: V3[]; springKeys: Set<string> } | undefined;
function bogie(): NonNullable<typeof built> {
  if (!built) {
    const parts = bogieParts(SPEC);
    const frame = vertsOf(parts.frame);
    const springVerts = vertsOf(parts.springs);
    built = { parts, frame, frameKeys: new Set(frame.map(key)), springVerts, springKeys: new Set(springVerts.map(key)) };
  }
  return built;
}
/** The metres a rectangle of the photograph spans along z (low, high) and up (low, high). */
const span = (q: Rect): { z0: number; z1: number; y0: number; y1: number } => ({ z0: Math.min(Z(q[0]), Z(q[2])), z1: Math.max(Z(q[0]), Z(q[2])), y0: Y(q[3]), y1: Y(q[1]) });
/** The eight corners of a box over a rectangle of the photograph, across x from `xr[0]` to `xr[1]` on the side `sx`; the far side is the near side turned half a turn about the vertical (z -> -z). */
function boxCorners(q: Rect, xr: readonly [number, number], sx: 1 | -1): V3[] {
  const s = span(q);
  const zs = sx < 0 ? [-s.z1, -s.z0] : [s.z0, s.z1];
  const out: V3[] = [];
  for (const x of xr) for (const y of [s.y0, s.y1]) for (const z of zs) out.push([sx * x, y, z]);
  return out;
}
function expectCorners(label: string, corners: V3[], have: Set<string>): void {
  for (const c of corners) assert.ok(have.has(key(c)), `${label}: no vertex at (${c.map((v) => v.toFixed(5)).join(', ')})`);
}
/** The distinct vertices of `verts` on the plane `axis` = `at` that lie `r` from `c` in the other two coordinates (a ring of a tube or a lathe). */
function ringOf(verts: V3[], axis: 0 | 1 | 2, at: number, c: readonly [number, number], r: number): V3[] {
  const [i, j] = ([0, 1, 2] as const).filter((k) => k !== axis);
  const seen = new Map<string, V3>();
  for (const v of verts) if (Math.abs(v[axis] - at) < 1e-6 && Math.abs(Math.hypot(v[i as number] - c[0], v[j as number] - c[1]) - r) < 1e-6) seen.set(key(v), v);
  return [...seen.values()];
}
/** The distinct vertices of `verts` that lie `r` from the point `c` in the plane through it perpendicular to the unit `dir` (the ring of a tube along that line). */
function ringAbout(verts: V3[], c: V3, dir: V3, r: number): V3[] {
  const seen = new Map<string, V3>();
  for (const v of verts) {
    const d: V3 = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
    if (Math.abs(d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) < 1e-6 && Math.abs(Math.hypot(d[0], d[1], d[2]) - r) < 1e-6) seen.set(key(v), v);
  }
  return [...seen.values()];
}
/** The (z, y) corners of the flat faces on the plane x whose normals all face along `face`, with their triangle count and area. */
function capCorners(s: Soup, x: number, face: 1 | -1): { corners: Set<string>; tris: number; area: number } {
  const corners = new Set<string>();
  let tris = 0;
  let area = 0;
  for (let t = 0; t < s.pos.length / 9; t++) {
    const flat = [0, 1, 2].every((k) => Math.abs((s.pos[9 * t + 3 * k] as number) - x) < 1e-9 && s.nrm[9 * t + 3 * k] === face && s.nrm[9 * t + 3 * k + 1] === 0 && s.nrm[9 * t + 3 * k + 2] === 0);
    if (!flat) continue;
    tris++;
    const p = [0, 1, 2].map((k) => [s.pos[9 * t + 3 * k + 2] as number, s.pos[9 * t + 3 * k + 1] as number]) as [number, number][];
    for (const [z, y] of p) corners.add(key([z, y]));
    area += Math.abs((p[1]![0] - p[0]![0]) * (p[2]![1] - p[0]![1]) - (p[1]![1] - p[0]![1]) * (p[2]![0] - p[0]![0])) / 2;
  }
  return { corners, tris, area };
}
const shoelace = (poly: readonly (readonly [number, number])[]): number => Math.abs(poly.reduce((a, p, i) => a + (p[0] * (poly[(i + 1) % poly.length] as readonly [number, number])[1] - (poly[(i + 1) % poly.length] as readonly [number, number])[0] * p[1]), 0)) / 2;
/** A point of the photograph as metres (z, y), the far side's z turned. */
const metres = (p: Px, sx: 1 | -1 = 1): [number, number] => [sx * Z(p[0]), Y(p[1])];

// --- the tests ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('Class 180 frame: the calibration is the two axle-end caps a wheelbase apart on the axle line, the picture was turned to level them, and the wheelbase is the one the family is given', () => {
  const { parts } = bogie();
  // the trace records the caps in the turned picture, the caps as the picture has them and the turn between
  assert.deepEqual(CORADIA_TRACE.caps, [[168.5, 506.3], [501.1, 506.3]]);
  assert.deepEqual(CORADIA_TRACE.level, { caps: [[168.5, 506.3], [501, 498.3]], degrees: 1.3783 });
  // the caps as the photograph has them, 8 px apart in height over 332.6 px: the turn that levels them (clockwise, about the left cap, the right cap being the higher)
  const turn = (Math.atan2(506.3 - 498.3, 501 - 168.5) * 180) / Math.PI;
  assert.ok(Math.abs(turn - 1.3783) < 5e-5, `the caps need a turn of ${turn} degrees, not 1.3783`);
  // and in the turned picture they stand level, 332.6 px from each other, within a pixel of the distance they had before the turn
  assert.ok(Math.abs(Math.hypot(501 - 168.5, 498.3 - 506.3) - (501.1 - 168.5)) < 0.01, 'the turn keeps the caps\' distance');
  // the caps are the axle ends: a wheelbase apart (ASSUMED 2.7 m for the Class 180) and a wheel's radius over the rail head
  near(Z(168.5), 1.35, 1e-12, 'the left cap is half a wheelbase forward');
  near(Z(501.1), -1.35, 1e-12, 'the right cap is half a wheelbase aft');
  near(Y(506.3), 0.42, 1e-12, 'the caps stand on the axle line');
  near(SCALE, 123.1852, 1e-3, 'the photograph is 123.19 px to the metre');
  // the figures the build gives a Class 180 bogie are the ones the trace is calibrated to: a change there rescales every length here
  const fig = EMU_FIGURES.adelante;
  assert.equal(fig.wheelDiameter.value / 2, SPEC.radius);
  assert.equal(fig.wheelbaseMotor.value, SPEC.wheelbase);
  assert.equal(fig.wheelbaseTrailer.value, SPEC.wheelbase);
  // the axles of the built bogie are on those lines
  const axles = vertsOf(parts.axles);
  for (const az of [-1.35, 1.35]) {
    const mine = axles.filter((v) => Math.abs(v[2] - az) < 0.2);
    assert.ok(mine.length >= 16, `an axle at z ${az}`);
    for (const v of mine) assert.ok(Math.abs(Math.hypot(v[1] - 0.42, v[2] - az) - Math.hypot(mine[0]![1] - 0.42, mine[0]![2] - az)) < 1e-9, `the axle at z ${az} is round about the axle line`);
  }
});

test('Class 180 frame: the side beam is the photograph\'s outline, 23 corners, on both faces of both sides, and the plate fills it exactly', () => {
  const { parts } = bogie();
  assert.equal(BEAM.length, 23);
  assert.equal(new Set(BEAM.map((p) => p.join(','))).size, 23, 'every corner is its own');
  assert.deepEqual(CORADIA_TRACE.beam, BEAM, 'the trace holds these corners');
  const area = shoelace(BEAM.map((p) => metres(p)));
  for (const sx of [-1, 1] as const) {
    const want = new Set(BEAM.map((p) => key(metres(p, sx))));
    // the outer face of a side (facing away from the centre line) and its inner face, at the plate's two depths
    for (const [x, face] of [[sx * DEPTH.beam[1], sx], [sx * DEPTH.beam[0], -sx]] as const) {
      const cap = capCorners(parts.frame, x, face as 1 | -1);
      assert.equal(cap.tris, 21, `side ${sx}, face at ${x}: a 23-cornered plate is 21 triangles on a face`);
      assert.deepEqual([...cap.corners].sort(), [...want].sort(), `side ${sx}, face at ${x}: the corners are the outline's`);
      assert.ok(Math.abs(cap.area - area) < 1e-9, `side ${sx}, face at ${x}: the triangles cover ${cap.area} m2, the outline ${area} m2`);
    }
  }
  // its size, in metres: the two ends are not each other's mirror (the left end block reaches 1.569 m forward of the middle, the right 1.540 m aft), the end blocks stand 0.897 m over the rail head and the
  // lower edge 0.398 m, which is the arms' and the middle's: a deep side plate with a window in it
  const zs = BEAM.map((p) => Z(p[0]));
  near(Math.max(...zs), 1.5691, 1e-3, 'the beam reaches 1.569 m forward of the middle');
  near(Math.min(...zs), -1.5399, 1e-3, 'and 1.540 m aft of it');
  const ys = BEAM.map((p) => Y(p[1]));
  near(Math.max(...ys), 0.8973, 1e-3, 'the end blocks\' tops stand 0.897 m over the rail head');
  near(Math.min(...ys), 0.3981, 1e-3, 'and the lower edge 0.398 m');
  near(area, 1.0348, 1e-3, 'the beam\'s side covers 1.035 m2');
  // the window is a notch open at the top: its floor is 0.711 m over the rail head and runs 0.666 m along the bogie, about the middle of it (within 1 cm)
  near(Y(470.5), 0.7106, 1e-3, 'the window\'s floor stands 0.711 m over the rail head');
  near(Z(294) - Z(376), 0.6657, 1e-3, 'and is 0.666 m long');
  near(Z(294) + Z(376), 0.0, 0.01, 'about the middle of the bogie');
});

test('Class 180 frame: each end carries its axle box, housing, cap, spring core and drum, vertical damper, calliper and boss at the numbers the photograph gives, and the two ends are not each other\'s mirror', () => {
  const { frame, frameKeys, springVerts, springKeys } = bogie();
  // the two ends are two different outlines of the same parts: the cap and the damper stand different distances apart
  assert.notEqual(ENDS[0]!.capRadius, ENDS[1]!.capRadius, 'the right cap is the smaller');
  assert.ok(Math.abs((501.1 - 531.75) - (126.75 - 168.5)) > 10, 'the right damper stands nearer its cap than the left');
  for (const sx of [-1, 1] as const) {
    for (const end of ENDS) {
      const where = `side ${sx}, ${end.name} end`;
      expectCorners(`${where}: the axle box`, boxCorners(end.box, DEPTH.box, sx), frameKeys);
      expectCorners(`${where}: the calliper`, boxCorners(end.calliper, DEPTH.calliper, sx), frameKeys);
      // the housing and the cap on the axle's end: tubes along x on the axle line, a fan at their outer end only; the housing is 14 sided and the cap 12
      const az = sx * Z(end.cap);
      assert.ok(Math.abs(Math.abs(az) - 1.35) < 1e-12, `${where}: the cap stands on an axle`);
      for (const [name, x0, x1, radius, sides] of [['housing', DEPTH.housing[0], DEPTH.housing[1], LEN(end.housing), 14], ['cap', DEPTH.cap[0], DEPTH.cap[1], LEN(end.capRadius), 12]] as const) {
        assert.equal(ringOf(frame, 0, sx * x0, [0.42, az], radius).length, sides, `${where}: the ${name}'s foot is a ring of ${sides}`);
        assert.equal(ringOf(frame, 0, sx * x1, [0.42, az], radius).length, sides, `${where}: the ${name}'s face is a ring of ${sides}`);
        assert.equal(ringOf(frame, 0, sx * x1, [0.42, az], 0).length, 1, `${where}: the ${name} is closed by a fan at its outer end`);
      }
      assert.equal(ringOf(frame, 0, sx * DEPTH.housing[0], [0.42, az], 0).length, 0, `${where}: and the housing is open at its foot`);
      // the boss on the neck: a twelve-sided tube along x at the boss's centre, a fan at its outer end only
      const bc: [number, number] = [Y(end.boss.c[1]), sx * Z(end.boss.c[0])];
      assert.equal(ringOf(frame, 0, sx * DEPTH.boss[0], bc, LEN(end.boss.r)).length, 12, `${where}: the boss's foot is a ring of twelve`);
      assert.equal(ringOf(frame, 0, sx * DEPTH.boss[1], bc, LEN(end.boss.r)).length, 12, `${where}: and its face`);
      assert.equal(ringOf(frame, 0, sx * DEPTH.boss[1], bc, 0).length, 1, `${where}: closed by a fan at its face`);
      assert.equal(ringOf(frame, 0, sx * DEPTH.boss[0], bc, 0).length, 0, `${where}: and open at its foot`);
      // the primary spring, in the springs: the dark core (ten sided) under the end block and the drum (twelve sided) on the axle box, each closed at both ends, standing on the one below it
      for (const [name, q, sides] of [['core', end.core, 10], ['drum', end.drum, 12]] as const) {
        const s = span(q);
        const zc = sx * ((Z(q[0]) + Z(q[2])) / 2);
        const radius = LEN((q[2] - q[0]) / 2);
        for (const y of [s.y0, s.y1]) {
          assert.equal(ringOf(springVerts, 1, y, [sx * DEPTH.spring, zc], radius).length, sides, `${where}: the ${name}'s ring at ${y.toFixed(4)} m is ${sides} corners`);
          assert.equal(ringOf(springVerts, 1, y, [sx * DEPTH.spring, zc], 0).length, 1, `${where}: the ${name} is closed by a fan at ${y.toFixed(4)} m`);
        }
        assert.ok(DEPTH.spring + radius < BOGIE_HALF_WIDTH, `${where}: the ${name} is inside the 1.15 m envelope`);
      }
      // the core's head is the row of the beam's underside, the drum's head is the core's foot, and the drum's foot is the axle box's head (give or take the half row the box's top is drawn above it)
      near(span(end.core).y1, Y(471), 1e-12, `${where}: the core stands against the beam's underside`);
      near(span(end.core).y0 - span(end.drum).y1, 0, 1e-12, `${where}: and the drum stands under the core`);
      near(span(end.drum).y0 - span(end.box).y1, 0, 0.5 / SCALE + 1e-9, `${where}: on the axle box`);
      // the damper: an eight-sided tube from the foot's level up to the head's, closed at its foot only
      const dm = span(end.damper);
      const dz = sx * ((Z(end.damper[0]) + Z(end.damper[2])) / 2);
      const dr = LEN((end.damper[2] - end.damper[0]) / 2);
      assert.equal(ringOf(frame, 1, dm.y0, [sx * DEPTH.damper, dz], dr).length, 8, `${where}: the damper's foot is a ring of eight`);
      assert.equal(ringOf(frame, 1, dm.y1, [sx * DEPTH.damper, dz], dr).length, 8, `${where}: and its head`);
      assert.equal(ringOf(frame, 1, dm.y0, [sx * DEPTH.damper, dz], 0).length, 1, `${where}: closed by a fan at its foot`);
      assert.equal(ringOf(frame, 1, dm.y1, [sx * DEPTH.damper, dz], 0).length, 0, `${where}: and open at its head`);
    }
  }
});

test('Class 180 frame: along the middle stand the window\'s yellow edges, the car\'s bracket, the yaw damper with its label and clevises and the bar, and over it the air spring, each at its numbers and on both sides', () => {
  const { parts, frame, frameKeys, springVerts } = bogie();
  const bag = LEN((AIR.right - AIR.left) / 2);
  const baseY = Y(AIR.base);
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    expectCorners(`${where}: the window's left edge`, boxCorners(WINDOW_LEFT, DEPTH.window, sx), frameKeys);
    expectCorners(`${where}: the window's floor`, boxCorners(WINDOW_FLOOR, DEPTH.window, sx), frameKeys);
    expectCorners(`${where}: the clevis at the damper's left end`, boxCorners(YAW.clevisLeft, DEPTH.clevis, sx), frameKeys);
    expectCorners(`${where}: the clevis at its right end`, boxCorners(YAW.clevisRight, DEPTH.clevis, sx), frameKeys);
    expectCorners(`${where}: the bar under the bogie`, boxCorners(BAR, DEPTH.bar, sx), frameKeys);
    // the window's right edge slants: a plate of four corners, on both faces, the bracket a plate of six, each at its depths
    for (const [name, outline, depth] of [['the window\'s right edge', WINDOW_RIGHT, DEPTH.window], ['the bracket', BRACKET, DEPTH.bracket]] as const) {
      const want = new Set(outline.map((p) => key(metres(p, sx))));
      for (const [x, face] of [[sx * depth[1], sx], [sx * depth[0], -sx]] as const) {
        const cap = capCorners(parts.frame, x, face as 1 | -1);
        // (the window's edges share their plane with the bars of the left edge and the floor: those are boxes, so a face of four corners or six is told by its corners)
        for (const c of want) assert.ok(cap.corners.has(c), `${where}: ${name}: the face at ${x} lacks the corner ${c}`);
      }
    }
    // the yaw damper: a ten-sided cylinder on the line between the ends' centres, closed at both ends, and its label a band 3 mm bigger in radius between the label's two columns
    const a: V3 = [sx * DEPTH.yaw, Y(YAW.from[1]), sx * Z(YAW.from[0])];
    const b: V3 = [sx * DEPTH.yaw, Y(YAW.to[1]), sx * Z(YAW.to[0])];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const dir: V3 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length];
    const radius = LEN(YAW.radius);
    const at = (col: number): V3 => {
      const u = ((col - YAW.from[0]) / (YAW.to[0] - YAW.from[0])) * length;
      return [a[0] + dir[0] * u, a[1] + dir[1] * u, a[2] + dir[2] * u];
    };
    for (const [name, c, r] of [['start', a, radius], ['end', b, radius], ['label start', at(YAW.label[0]), radius + LABEL], ['label end', at(YAW.label[1]), radius + LABEL]] as const) {
      assert.equal(ringAbout(frame, c, dir, r).length, 10, `${where}: the yaw damper's ${name} is a ring of ten`);
    }
    for (const [name, c] of [['start', a], ['end', b], ['label start', at(YAW.label[0])], ['label end', at(YAW.label[1])]] as const) {
      assert.ok(frame.some((v) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]) < 1e-6), `${where}: the yaw damper's ${name} is closed by a fan`);
    }
    near(Math.abs(dir[1]) / Math.hypot(dir[0], dir[2]), Math.tan((7.36 * Math.PI) / 180), 2e-3, `${where}: the damper falls 7.4 degrees toward the right (-z on the near side)`);
    assert.ok(DEPTH.yaw + radius + LABEL < BOGIE_HALF_WIDTH, `${where}: the label stays inside the 1.15 m envelope`);
    // the air spring: a fourteen-sided drum standing on the window's floor, closed at its top only, up to the underside of the body
    assert.equal(ringOf(springVerts, 1, baseY, [sx * DEPTH.air, 0], bag).length, 14, `${where}: the air spring's foot is a ring of fourteen`);
    assert.equal(ringOf(springVerts, 1, BOGIE_TOP - 0.005, [sx * DEPTH.air, 0], bag).length, 14, `${where}: and its head`);
    assert.equal(ringOf(springVerts, 1, BOGIE_TOP - 0.005, [sx * DEPTH.air, 0], 0).length, 1, `${where}: closed by a fan at its head`);
    assert.equal(ringOf(springVerts, 1, baseY, [sx * DEPTH.air, 0], 0).length, 0, `${where}: and open at its foot`);
    near(bag, 0.2516, 1e-3, `${where}: the air spring is 0.503 m across`);
    assert.ok(DEPTH.air + bag < DEPTH.beam[1], `${where}: its outer edge is inside the beam's outer face`);
    assert.ok(bag < (Z(294) - Z(376)) / 2, `${where}: it stands inside the window's width`);
  }
  // the yaw damper's body stands at 0.0593 m: 7.3 px over 123.19 px to the metre
  near(LEN(YAW.radius), 0.0593, 1e-4, 'the damper is 0.119 m across');
  // the cross beam: one box from side beam to side beam (it reaches 0.98 m out, 5 mm into each plate, whose inner face is at 0.975), 0.16 m long, between 0.07 and 0.27 m over the axle line
  const cross: V3[] = [-0.98, 0.98].flatMap((x) => [0.42 + 0.07, 0.42 + 0.27].flatMap((y) => [-0.08, 0.08].map((z): V3 => [x, y, z])));
  expectCorners('the cross beam', cross, frameKeys);
});

test('Class 180 frame: the part counts are the plates, boxes and tubes above and no more, and a motor bogie is the trailer bogie\'s frame with the diesel\'s final drive hung on it', () => {
  const { parts, frame, springVerts } = bogie();
  // each side: the beam's plate (23 corners: 4 x 23 - 4 = 88 triangles); at each end an axle box (12), a fourteen-sided housing with one fan (42), a twelve-sided cap with one fan (36), an eight-sided damper with one
  // fan (24), a calliper (12) and a twelve-sided boss with one fan (36); the window's left edge (12), floor (12) and right edge (4 x 4 - 4 = 12); the bracket (4 x 6 - 4 = 20); the yaw damper's body (a ten-sided
  // tube with a fan at each end, 40), its label (40) and two clevises (24); the bar (12); and one box across the bogie
  const end = 12 + 42 + 36 + 24 + 12 + 36;
  const side = 88 + 2 * end + (12 + 12 + 12) + 20 + (40 + 40 + 24) + 12;
  assert.equal(trisOf(parts.frame), 2 * side + 12);
  // the springs: at each end the core (ten sided, a fan at each end: 40) and the drum (twelve sided: 48), and a side's air spring (a fourteen-sided tube with one fan: 42)
  assert.equal(trisOf(parts.springs), 2 * (2 * (40 + 48) + 42));
  assert.equal(trisOf(parts.drive), 0, 'a trailer bogie has no drive');
  // a motor bogie of the diesel unit is the same frame with the unit's final drive on it: a gearbox on each axle and a cardan shaft (no traction motors)
  const motor = bogieParts({ ...SPEC, motor: true, diesel: true });
  assert.ok(trisOf(motor.drive) > 0, 'a driven bogie carries the final drive');
  for (const part of ['wheels', 'axles', 'brakes', 'frame', 'springs'] as const) assert.deepEqual(motor[part].pos, parts[part].pos, `a motor bogie's ${part} are a trailer's`);
  const electric = bogieParts({ ...SPEC, motor: true });
  assert.equal(trisOf(electric.drive), 0, 'a motor bogie that is not a diesel draws no traction motor: the photograph shows none');
  assert.deepEqual(bogieSoup({ ...SPEC, motor: false, diesel: true }).pos, bogieSoup(SPEC).pos, 'a trailer bogie is a trailer bogie, whatever the unit drives it with');
  // the discs and callipers are the only brake: no unit hangs between the wheels
  assert.equal(trisOf(parts.brakes), trisOf(bogieParts({ ...SPEC, style: 'siemens', motor: true }).brakes), 'the brakes are the discs and callipers alone');
  const between = (v: V3): boolean => Math.abs(v[2]) <= 1.35 - 0.42;
  assert.equal(vertsOf(parts.brakes).filter(between).length, 0, 'no brake unit hangs in the clear between the wheels');
  // the lowest of the frame in the clear between the wheels is the bar's foot (0.317 m over the rail head); the lowest of all is the right axle box's (0.252 m), above the 0.1 m a bogie clears the rail by
  near(Math.min(...frame.filter(between).map((v) => v[1])), Y(519), 1e-9, 'the bar is the lowest part of the frame at the vertices in the clear between the wheels');
  near(Math.min(...frame.map((v) => v[1])), Y(527), 1e-9, 'the right axle box\'s foot is the lowest of the frame');
  assert.ok(Math.min(...frame.map((v) => v[1])) > 0.1, 'and 0.1 m or more over the rail head');
  // and the highest: the bracket's and the window's edges' tops (row 442) and the air spring's head stand below 0.95 m, the body floor being at 0.98 m
  near(Math.max(...frame.map((v) => v[1])), Y(442), 1e-9, 'the bracket and the window\'s edges are cut at 0.942 m');
  near(Math.max(...springVerts.map((v) => v[1])), BOGIE_TOP - 0.005, 1e-9, 'the air spring reaches up to the body, 5 mm under the top a bogie may reach');
  assert.ok(Math.max(...frame.map((v) => v[1])) < BOGIE_TOP, 'the frame is under the 0.95 m a bogie may reach');
  // nothing longer than the wheels reach, and nothing wider than the bogie may be: the housing and cap are the outermost at 1.13 m
  const reach = 1.35 + 0.42 + 0.028;
  assert.ok(Math.max(...frame.map((v) => Math.abs(v[2]))) <= reach + 1e-9, 'no part of the frame is longer than the wheels reach');
  const wide = Math.max(...frame.map((v) => Math.abs(v[0])));
  near(wide, 1.1392, 5e-4, 'the yaw damper\'s label is the outermost part of the frame, 1.139 m out (its ten-sided ring reaches 0.951 of its radius across)');
  assert.ok(wide < BOGIE_HALF_WIDTH, 'inside the 1.15 m the bogie may reach');
  near(Math.max(...frame.filter((v) => Math.abs(Math.abs(v[2]) - 1.35) < 0.2 && Math.abs(v[1] - 0.42) < 0.2).map((v) => Math.abs(v[0]))), 1.13, 1e-9, 'and the caps, on the axles, reach 1.13 m');
  // it is the Class 180's own frame: the same wheels as the Alstom kit's, a different frame
  const alstom = bogieParts({ ...SPEC, style: 'alstom' });
  assert.notEqual(trisOf(alstom.frame), trisOf(parts.frame), 'the Alstom kit\'s frame is its own');
  assert.deepEqual(alstom.axles.pos, parts.axles.pos, 'the axles are the kit\'s');
});

test('Class 180 frame: the wheels carry the photograph\'s palette (the brake disc\'s light ring on the web, the dark tyre on the rim), the frame its grey, and the yellow label and window edges the accent', () => {
  const { parts } = bogie();
  const count = (s: Soup, hex: number): number => {
    const c = col(hex);
    let n = 0;
    for (let i = 0; i < s.clr.length; i += 3) if (Math.abs((s.clr[i] as number) - c.r) < 1e-6 && Math.abs((s.clr[i + 1] as number) - c.g) < 1e-6 && Math.abs((s.clr[i + 2] as number) - c.b) < 1e-6) n++;
    return n;
  };
  // the wheel's web is the disc's light ring (0x4d4947, the median of the ring's pixels) and its rim band the tyre (0x232224): a vertex of each on every wheel, none of either on the Alstom kit's wheels
  const alstom = bogieParts({ ...SPEC, style: 'alstom' });
  assert.ok(count(parts.wheels, 0x4d4947) > 0 && count(parts.wheels, 0x232224) > 0, 'the wheels carry the ring and the tyre');
  assert.equal(count(alstom.wheels, 0x4d4947) + count(alstom.wheels, 0x232224), 0, 'and the Alstom kit\'s do not');
  // the frame: the beam's grey (0x5b5954) and, in the accent (0xe6d979, the label's median), the yellow label of the yaw damper and the window's three edges; the Alstom kit draws neither
  assert.ok(count(parts.frame, 0x5b5954) > 0, 'the beam is the photograph\'s grey');
  const yellow = count(parts.frame, 0xe6d979);
  // a side: the left edge (12), the floor (12), the slanting edge (12) and the label (a ten-sided tube closed at both ends, 40), twice
  assert.equal(yellow, 2 * (12 + 12 + 12 + 40) * 3, 'the yellow is the label and the window\'s three edges on each side (three vertices to a triangle)');
  assert.equal(count(alstom.frame, 0xe6d979), 0, 'the Alstom kit\'s frame has none');
  // the yaw damper's body is its own grey (0x8e8b80), not the beam's
  assert.ok(count(parts.frame, 0x8e8b80) > 0, 'the damper\'s body is the photograph\'s light grey');
});

test('Class 180 frame: the far level is a slab a side as long and as massive as the traced beam, at the beam\'s depths, under the same transom', () => {
  const far = bogieFarSoup(SPEC);
  const v = vertsOf(far);
  const outline = BEAM.map((p) => metres(p));
  const zLow = Math.min(...outline.map((p) => p[0]));
  const zHigh = Math.max(...outline.map((p) => p[0]));
  const top = Math.max(...outline.map((p) => p[1]));
  const height = shoelace(outline) / (zHigh - zLow);
  for (const sx of [-1, 1] as const) {
    // (the slab's vertices: its depths, and further along the bogie than the transom's 0.08 m)
    const slab = v.filter((p) => p[0] * sx > 0.97 && p[0] * sx < 1.07 && Math.abs(p[2]) > 0.5);
    assert.ok(slab.length >= 8, `side ${sx}: a slab`);
    near(Math.max(...slab.map((p) => p[1])), top, 1e-9, `side ${sx}: the slab's top is the beam's top`);
    near(Math.min(...slab.map((p) => p[1])), top - height, 1e-9, `side ${sx}: and it is as high as the beam's area over its length`);
    near(Math.max(...slab.map((p) => p[2])), sx > 0 ? zHigh : -zLow, 1e-9, `side ${sx}: its far end`);
    near(Math.min(...slab.map((p) => p[2])), sx > 0 ? zLow : -zHigh, 1e-9, `side ${sx}: and its near end`);
    near(Math.min(...slab.map((p) => Math.abs(p[0]))), 0.975, 1e-9, `side ${sx}: the slab's inner face is the beam's`);
    near(Math.max(...slab.map((p) => Math.abs(p[0]))), 1.065, 1e-9, `side ${sx}: and its outer face`);
  }
  // the far level is far fewer triangles than the near one, and stands inside the near one's reach
  assert.ok(trisOf(far) < trisOf(bogieSoup(SPEC)) / 5, `the far bogie is ${trisOf(far)} triangles against the near one's ${trisOf(bogieSoup(SPEC))}`);
});

function near(actual: number, expected: number, tol: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} against ${expected} (tolerance ${tol})`);
}
