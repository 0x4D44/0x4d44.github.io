// The Electrostar's bogie frame as its photograph traces it (round 6, T6, "frame/axlebox/suspension/brake/cable and visible underfloor equipment masses match detailed refs"). The round-5
// score found the Electrostar's frame "generic": the outside-frame bogie of the Class 180's maker with other colours. Round 6 traces `Bogie and traction equipment beneath Door A1 of Class 375
// Electrostar .jpg` (OathOn, 2025-06-25, CC0; a private review asset, not shipped): the outline of the side beam, the spring seats and packs, the vertical dampers, the axle-box arms, the housings
// and caps on the axle ends, the cast lugs, the shelf and the shoe beam under the beam, and the air spring over its middle, each measured in the photograph's own pixels beside the two caps that
// calibrate it. (`train-bogie-trace.test.ts` does the same for the AT300.)
//
// The numbers below are an independent copy of `ELECTROSTAR_TRACE` (web/src/train-bogie-trace.ts) and of the depths `ES_DEPTH` (train-parts.ts), and the calibration is restated from the two caps
// and the wheelbase, so a number changed in either place fails here. Two things the photograph cannot give are ASSUMED and pinned as such: the depth of each part across the bogie (a side-on photograph
// shows none), and the wheelbase, 2.7 m (no page read publishes it for the Electrostar; `EMU_FIGURES.electrostar` says so), which is the scale of every length here. What a motor bogie carries between its
// wheels is a GAP: the photograph is of a powered bogie (P3-25) and shows nothing there, so a motor bogie and a trailer bogie are the one bogie.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMU_FIGURES, FIGURES } from '../../core/train.ts';
import { ELECTROSTAR_TRACE } from '../src/train-bogie-trace.ts';
import { bogieParts, bogieSoup } from '../src/train-parts.ts';
import type { BogieSpec } from '../src/train-parts.ts';
import type { Soup } from '../src/train-geom.ts';

type V3 = [number, number, number];
type Px = readonly [number, number];
type Rect = readonly [number, number, number, number];

// --- the calibration, restated: the caps are a wheelbase apart and their row is the axle line --------------------------------------------------------------------------------------------
const SPEC: BogieSpec = { radius: 0.42, wheelbase: 2.7, track: FIGURES.gauge.value, motor: false, style: 'electrostar' };
const SCALE = (1664 - 215) / 2.7;
const MID = (215 + 1664) / 2;
const ROW = (890 + 890) / 2;
const Z = (px: number): number => -(px - MID) / SCALE;
const Y = (py: number): number => 0.42 + (ROW - py) / SCALE;
const LEN = (p: number): number => p / SCALE;

// --- the numbers read off the (turned) photograph ---------------------------------------------------------------------------------------------------------------------------------------
const BEAM: Px[] = [
  [142, 662], [320, 661], [340, 667], [360, 681], [380, 687], [400, 694], [420, 705], [440, 715], [460, 724], [480, 733], [500, 738], [520, 741], [1360, 740], [1380, 739], [1400, 734],
  [1420, 725], [1440, 716], [1460, 704], [1480, 699], [1500, 682], [1520, 670], [1540, 659], [1560, 651], [1580, 649], [1600, 648], [1760, 646], [1790, 655], [1795, 665], [1878, 665],
  [1880, 691], [1808, 692], [1806, 714], [1548, 718], [1548, 722], [1545, 735], [1535, 752], [1520, 772], [1495, 797], [1470, 818], [1440, 835], [1410, 848], [1380, 855], [1340, 858],
  [1300, 860], [1100, 852], [900, 854], [700, 854], [500, 859], [480, 856], [460, 852], [440, 846], [425, 838], [410, 828], [395, 815], [380, 800], [365, 785], [352, 770], [340, 755],
  [320, 740], [300, 730], [285, 724], [140, 724], [117, 727], [118, 710], [122, 690], [128, 673], [135, 665],
];
interface End {
  name: string;
  /** The axle-end cap's centre column (the axle). */
  cap: number;
  plate: Rect;
  pack: Rect;
  damper: Rect;
  bracket: Rect;
  arm: Px[];
  housing: number;
  capRadius: number;
}
const ENDS: End[] = [
  {
    name: 'left',
    cap: 215,
    plate: [142, 722, 285, 745],
    pack: [160, 745, 300, 828],
    damper: [93, 728, 133, 957],
    bracket: [285, 860, 345, 945],
    arm: [[12, 949], [40, 942], [62, 938], [62, 927], [120, 905], [170, 884], [200, 884], [200, 967], [62, 963], [35, 964], [12, 960]],
    housing: 55,
    capRadius: 36,
  },
  {
    name: 'right',
    cap: 1664,
    plate: [1590, 718, 1730, 742],
    pack: [1572, 742, 1762, 810],
    damper: [1806, 693, 1862, 930],
    bracket: [1520, 850, 1585, 945],
    arm: [[1700, 880], [1745, 872], [1800, 898], [1850, 922], [1900, 934], [1900, 975], [1790, 968], [1700, 964]],
    housing: 75,
    capRadius: 46,
  },
];
const BAG: Rect = [738, 597, 1141, 715];
const SHELF: Rect = [890, 868, 1295, 885];
const SHOE: Rect = [300, 960, 1560, 1005];

/** The depths across the bogie (metres from the centre line): ASSUMED, a side-on photograph shows none. */
const DEPTH = {
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
/** The air spring's pedestal radius: ASSUMED (the photograph shows its height, not its width). */
const PEDESTAL = 0.3;

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

test('Electrostar frame: the calibration is the two axle-end caps a wheelbase apart on the axle line, the picture was turned to level them, and the wheelbase is the one the family is given', () => {
  const { parts } = bogie();
  // the trace records the caps in the turned picture, the caps as the picture has them and the turn between
  assert.deepEqual(ELECTROSTAR_TRACE.caps, [[215, 890], [1664, 890]]);
  assert.deepEqual(ELECTROSTAR_TRACE.level, { caps: [[215.5, 890.5], [1664.7, 922.2]], degrees: 1.2531 });
  // the caps as the photograph has them, 31.7 px apart in height over 1,449.2 px: the turn that levels them (counter-clockwise, about the left cap)
  const turn = (Math.atan2(922.2 - 890.5, 1664.7 - 215.5) * 180) / Math.PI;
  assert.ok(Math.abs(turn - 1.2531) < 5e-5, `the caps need a turn of ${turn} degrees, not 1.2531`);
  // and in the turned picture they stand a row apart, 1,449 px from each other, within a pixel of the distance they had before the turn
  assert.ok(Math.abs(Math.hypot(1664.7 - 215.5, 922.2 - 890.5) - (1664 - 215)) < 1, 'the turn keeps the caps\' distance');
  // the caps are the axle ends: a wheelbase apart (ASSUMED 2.7 m for the Electrostar) and a wheel's radius over the rail head
  near(Z(215), 1.35, 1e-12, 'the left cap is half a wheelbase forward');
  near(Z(1664), -1.35, 1e-12, 'the right cap is half a wheelbase aft');
  near(Y(890), 0.42, 1e-12, 'the caps stand on the axle line');
  near(SCALE, 536.6667, 1e-3, 'the photograph is 536.7 px to the metre');
  // the figures the build gives an Electrostar bogie are the ones the trace is calibrated to: a change there rescales every length here
  const fig = EMU_FIGURES.electrostar;
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

test('Electrostar frame: the side beam is the photograph\'s outline, 67 corners, on both faces of both sides, and the plate fills it exactly', () => {
  const { parts } = bogie();
  assert.equal(BEAM.length, 67);
  assert.equal(new Set(BEAM.map((p) => p.join(','))).size, 67, 'every corner is its own');
  const area = shoelace(BEAM.map((p) => metres(p)));
  for (const sx of [-1, 1] as const) {
    const want = new Set(BEAM.map((p) => key(metres(p, sx))));
    // the outer face of a side (facing away from the centre line) and its inner face, at the plate's two depths
    for (const [x, face] of [[sx * DEPTH.beam[1], sx], [sx * DEPTH.beam[0], -sx]] as const) {
      const cap = capCorners(parts.frame, x, face as 1 | -1);
      assert.equal(cap.tris, 65, `side ${sx}, face at ${x}: a 67-cornered plate is 65 triangles on a face`);
      assert.deepEqual([...cap.corners].sort(), [...want].sort(), `side ${sx}, face at ${x}: the corners are the outline's`);
      assert.ok(Math.abs(cap.area - area) < 1e-9, `side ${sx}, face at ${x}: the triangles cover ${cap.area} m2, the outline ${area} m2`);
    }
  }
  // its size, in metres: the two ends are not each other's mirror (the right end block reaches 1.752 m aft of the middle, the left 1.533 m forward), the end blocks stand 0.875 m over the rail head
  // and the deep middle's lower edge 0.476 m
  const zs = BEAM.map((p) => Z(p[0]));
  near(Math.min(...zs), -1.7525, 1e-3, 'the beam reaches 1.752 m aft of the middle');
  near(Math.max(...zs), 1.5326, 1e-3, 'and 1.533 m forward of it');
  const ys = BEAM.map((p) => Y(p[1]));
  near(Math.max(...ys), 0.8747, 1e-3, 'the end blocks\' tops stand 0.875 m over the rail head');
  near(Math.min(...ys), 0.4759, 1e-3, 'and the deep middle\'s lower edge 0.476 m');
  near(area, 0.5975, 1e-3, 'the beam\'s side covers 0.5975 m2');
});

test('Electrostar frame: each end carries its seat, spring pack, vertical damper, axle-box arm, housing, cap and lug at the numbers the photograph gives, and the two ends are not each other\'s mirror', () => {
  const { parts, frame, frameKeys, springKeys } = bogie();
  const arms = ENDS.map((e) => e.arm);
  assert.deepEqual(arms.map((a) => a.length), [11, 8], 'the left arm is eleven corners, the right eight');
  for (const sx of [-1, 1] as const) {
    // the arms: plates 5 cm thick, both ends in the one plane, on both faces
    const wantArms = new Set(arms.flatMap((a) => a.map((p) => key(metres(p, sx)))));
    assert.equal(wantArms.size, 19, 'nineteen corners of arm');
    for (const [x, face] of [[sx * DEPTH.arm[1], sx], [sx * DEPTH.arm[0], -sx]] as const) {
      const cap = capCorners(parts.frame, x, face as 1 | -1);
      assert.equal(cap.tris, 9 + 6, `side ${sx}: the arms' face at ${x} is nine triangles and six`);
      assert.deepEqual([...cap.corners].sort(), [...wantArms].sort(), `side ${sx}: the arms' face at ${x} has the outlines' corners`);
      assert.ok(Math.abs(cap.area - arms.reduce((a, p) => a + shoelace(p.map((q) => metres(q))), 0)) < 1e-9, `side ${sx}: and fills them`);
    }
    for (const end of ENDS) {
      const where = `side ${sx}, ${end.name} end`;
      expectCorners(`${where}: the spring seat`, boxCorners(end.plate, DEPTH.seat, sx), frameKeys);
      expectCorners(`${where}: the spring pack`, boxCorners(end.pack, DEPTH.pack, sx), springKeys);
      expectCorners(`${where}: the lug`, boxCorners(end.bracket, DEPTH.bracket, sx), frameKeys);
      // the housing and the cap on the axle's end: tubes along x on the axle line, a fan at their outer end only; the housing is 14 sided and the cap 12
      const az = sx * Z(end.cap);
      assert.ok(Math.abs(Math.abs(az) - 1.35) < 1e-12, `${where}: the cap stands on an axle`);
      for (const [name, x0, x1, radius, sides] of [['housing', DEPTH.housing[0], DEPTH.housing[1], LEN(end.housing), 14], ['cap', DEPTH.cap[0], DEPTH.cap[1], LEN(end.capRadius), 12]] as const) {
        assert.equal(ringOf(frame, 0, sx * x0, [0.42, az], radius).length, sides, `${where}: the ${name}'s foot is a ring of ${sides}`);
        assert.equal(ringOf(frame, 0, sx * x1, [0.42, az], radius).length, sides, `${where}: the ${name}'s face is a ring of ${sides}`);
        assert.equal(ringOf(frame, 0, sx * x1, [0.42, az], 0).length, 1, `${where}: the ${name} is closed by a fan at its outer end`);
      }
      assert.equal(ringOf(frame, 0, sx * DEPTH.housing[0], [0.42, az], 0).length, 0, `${where}: and the housing is open at its foot`);
      // the damper: a ten-sided tube from the axle box's level up to the end block's foot, closed at its foot only
      const dm = span(end.damper);
      const dz = sx * ((Z(end.damper[0]) + Z(end.damper[2])) / 2);
      const dr = LEN((end.damper[2] - end.damper[0]) / 2);
      assert.equal(ringOf(frame, 1, dm.y0, [sx * DEPTH.damper, dz], dr).length, 10, `${where}: the damper's foot is a ring of ten`);
      assert.equal(ringOf(frame, 1, dm.y1, [sx * DEPTH.damper, dz], dr).length, 10, `${where}: and its head`);
      assert.equal(ringOf(frame, 1, dm.y0, [sx * DEPTH.damper, dz], 0).length, 1, `${where}: closed by a fan at its foot`);
      assert.equal(ringOf(frame, 1, dm.y1, [sx * DEPTH.damper, dz], 0).length, 0, `${where}: and open at its head`);
    }
  }
});

test('Electrostar frame: under the middle of the beam hang the shelf and the shoe beam, and over it stands the air spring, a pedestal and a pancake bag up to the body, each at its numbers and on both sides', () => {
  const { frameKeys, springVerts } = bogie();
  const bag = span(BAG);
  const beamTop = Y(741);
  const rho = (bag.z1 - bag.z0) / 2;
  const h = bag.y1 - bag.y0;
  const roll = h / 2;
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    expectCorners(`${where}: the shelf`, boxCorners(SHELF, DEPTH.shelf, sx), frameKeys);
    expectCorners(`${where}: the shoe beam`, boxCorners(SHOE, DEPTH.shoe, sx), frameKeys);
    // the pedestal: a fourteen-sided open tube from the beam's top (the middle's, 0.698 m over the rail head) up to the bag's bottom
    assert.equal(ringOf(springVerts, 1, beamTop, [sx * DEPTH.air, 0], PEDESTAL).length, 14, `${where}: the pedestal's foot is a ring of fourteen`);
    assert.equal(ringOf(springVerts, 1, bag.y0, [sx * DEPTH.air, 0], PEDESTAL).length, 14, `${where}: and its head`);
    assert.equal(ringOf(springVerts, 1, beamTop, [sx * DEPTH.air, 0], 0).length, 0, `${where}: the pedestal is open at its foot`);
    // the bag: a sixteen-sided pancake of the photograph's 0.751 m across and 0.220 m high: a flat bottom, a rim rolled in six steps of a half circle 0.110 m in radius, a flat top, each end a fan
    assert.equal(ringOf(springVerts, 1, bag.y0, [sx * DEPTH.air, 0], 0).length, 1, `${where}: the bag is closed by a fan at its bottom`);
    assert.equal(ringOf(springVerts, 1, bag.y1, [sx * DEPTH.air, 0], 0).length, 1, `${where}: and at its top`);
    for (let k = -3; k <= 3; k++) {
      const phi = (k * Math.PI) / 6;
      const y = bag.y0 + roll + roll * Math.sin(phi);
      const radius = rho - roll + roll * Math.cos(phi);
      assert.equal(ringOf(springVerts, 1, y, [sx * DEPTH.air, 0], radius).length, 16, `${where}: the bag's ring ${k} at ${y.toFixed(4)} m, ${radius.toFixed(4)} m out, has 16 corners`);
    }
    near(rho * 2, 0.7509, 1e-3, `${where}: the bag is 0.751 m across`);
    near(h, 0.2199, 1e-3, `${where}: and 0.220 m high`);
    near(bag.y1, 0.966, 1e-3, `${where}: and its top stands 0.966 m over the rail head, under the body floor`);
    // its outer edge is inside the 1.15 m the bogie may reach
    assert.ok(DEPTH.air + rho < 1.15, `${where}: the bag's outer edge is ${(DEPTH.air + rho).toFixed(4)} m out`);
  }
  const top = Math.max(...springVerts.map((v) => v[1]));
  near(top, bag.y1, 1e-9, 'the bag\'s top is the highest of the springs');
  assert.ok(top < 0.98, 'and under the lowest body floor');
});

test('Electrostar frame: the part counts are the plates, boxes and tubes above and no more, and a motor bogie is the trailer bogie\'s frame with nothing hung between the wheels', () => {
  const { parts, frame, frameKeys, springVerts } = bogie();
  // each side: the beam's plate (67 corners: 4 x 67 - 4 = 264 triangles); at each end a seat box (12), a ten-sided damper with one fan (30), the arm's plate (4 x 11 - 4 = 40 at the left, 4 x 8 - 4 = 28 at the
  // right), a fourteen-sided housing with one fan (42), a twelve-sided cap with one fan (36) and a lug (12); under the beam the shelf (12) and the shoe beam (12); and one box across the bogie
  const left = 12 + 30 + 40 + 42 + 36 + 12;
  const right = 12 + 30 + 28 + 42 + 36 + 12;
  assert.equal(trisOf(parts.frame), 2 * (264 + left + right + 12 + 12) + 12);
  // the springs: the four packs (12 each) and, a side, a fourteen-sided pedestal (28) and a sixteen-sided pancake (a fan at each end, 16 each, and six bands of 32)
  assert.equal(trisOf(parts.springs), 4 * 12 + 2 * (28 + 2 * 16 + 6 * 32));
  assert.equal(trisOf(parts.drive), 0, 'a trailer bogie has no drive');
  // the cross beam: one box from side beam to side beam (it reaches 0.98 m out, 5 mm into each plate, whose inner face is at 0.975), 0.16 m long, between 0.07 and 0.27 m over the axle line
  const cross: V3[] = [-0.98, 0.98].flatMap((x) => [0.42 + 0.07, 0.42 + 0.27].flatMap((y) => [-0.08, 0.08].map((z): V3 => [x, y, z])));
  expectCorners('the cross beam', cross, frameKeys);
  assert.ok(0.42 + 0.27 < Y(741), 'the cross beam stands under the top of the beam at the middle');
  const motor = bogieParts({ ...SPEC, motor: true });
  assert.equal(trisOf(motor.drive), 0, 'the photograph is of a powered bogie and shows no motor between the wheels: none is drawn');
  for (const part of ['wheels', 'axles', 'brakes', 'frame', 'springs', 'drive'] as const) assert.deepEqual(motor[part].pos, parts[part].pos, `a motor bogie's ${part} are a trailer's`);
  assert.deepEqual(bogieSoup({ ...SPEC, motor: true }).pos, bogieSoup(SPEC).pos, 'and the whole bogie');
  // the discs and callipers are the only brake: no unit hangs between the wheels
  assert.equal(trisOf(parts.brakes), trisOf(bogieParts({ ...SPEC, style: 'siemens', motor: true }).brakes), 'the brakes are the discs and callipers alone');
  // in the clear between the wheels (a wheel's rim is a radius off its axle along the bogie) no brake hangs, and nothing of the frame or the springs hangs lower than the shelf's foot (0.429 m over the rail head);
  // the shoe beam runs the length of the bogie, its foot 0.206 m over the rail head the lowest of the frame, and its corners stand over the axle boxes
  const between = (v: V3): boolean => Math.abs(v[2]) <= 1.35 - 0.42;
  assert.equal(vertsOf(parts.brakes).filter(between).length, 0, 'no brake unit hangs in the clear between the wheels');
  near(Math.min(...frame.filter(between).map((v) => v[1])), Y(885), 1e-9, 'the shelf is the lowest part of the frame at the vertices in the clear between the wheels');
  assert.ok(Math.min(...springVerts.filter(between).map((v) => v[1])) >= Y(885) - 1e-9, 'and no spring hangs lower');
  near(Math.min(...frame.map((v) => v[1])), Y(1005), 1e-9, 'the shoe beam\'s foot is the lowest of the frame');
  assert.ok(Math.min(...frame.map((v) => v[1])) > 0.1, 'and 0.1 m or more over the rail head');
  // and the highest: the end blocks' tops and the bag stand below the body floor at 0.98 m
  assert.ok(Math.max(...frame.map((v) => v[1])) < 0.98, 'the frame is under the body floor');
  // nothing longer than the wheels reach, and nothing wider than the bogie may be: the right arm is cut at 1.790 m, the housing and cap are the outermost at 1.13 m
  const reach = 1.35 + 0.42 + 0.028;
  assert.ok(Math.max(...frame.map((v) => Math.abs(v[2]))) <= reach + 1e-9, 'no part of the frame is longer than the wheels reach');
  near(Math.max(...frame.map((v) => Math.abs(v[0]))), 1.13, 1e-9, 'the caps are the outermost part of the frame');
  // the AT300's frame is another bogie: the same wheels, a different frame
  const hitachi = bogieParts({ ...SPEC, radius: 0.42, wheelbase: 2.7, style: 'hitachi' });
  assert.notEqual(trisOf(hitachi.frame), trisOf(parts.frame), 'the AT300\'s frame is its own');
});

function near(actual: number, expected: number, tol: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} against ${expected} (tolerance ${tol})`);
}
