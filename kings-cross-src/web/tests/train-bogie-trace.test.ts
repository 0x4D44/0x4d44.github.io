// The AT300's bogie frame as its photograph traces it (round 6, T6, "frame/axlebox/suspension/brake/cable and visible underfloor equipment masses match detailed refs"). The round-5 score
// found the AT300's frame "generic": a beam of ten guessed corners with lugs, ribs and cables from an earlier picture. Round 6 traces `GWR 802003 835003 leading bogie revised fittings.jpg`
// (CC BY-SA 4.0, Geof Sheppard; a private review asset, not shipped): the outline of the side beam, the axle boxes with their caps and sensor housings, the spring stacks, the dampers, the
// car's cast bracket, the yaw damper, the anti-roll rod and lever, the step and the air spring, each measured in the photograph's own pixels beside the two caps that calibrate it.
//
// The numbers below are an independent copy of `AT300_TRACE` (web/src/train-bogie-trace.ts) and of the depths `AT300_DEPTH` (train-parts.ts), and the calibration is restated from the two
// caps and the published wheelbase, so a number changed in either place fails here. What the photograph cannot show, the depth of each part across the bogie, is ASSUMED, and is pinned
// as such. Each test checks the drawn corners against the corners the numbers say, by membership (every expected corner is a vertex of the part) and by count.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIGURES } from '../../core/train.ts';
import { BOGIE_TOP, bogieParts } from '../src/train-parts.ts';
import type { BogieSpec } from '../src/train-parts.ts';
import type { Soup } from '../src/train-geom.ts';

type V3 = [number, number, number];
type Px = readonly [number, number];
type Rect = readonly [number, number, number, number];

// --- the calibration, restated: the caps are a wheelbase apart and their row is the axle line -------------------------------------------------------------------------------------
const SPEC: BogieSpec = { radius: 0.43, wheelbase: 2.6, track: FIGURES.gauge.value, motor: false, style: 'hitachi' };
const SCALE = (1594 - 347) / 2.6;
const MID = (347 + 1594) / 2;
const ROW = (860 + 856) / 2;
const Z = (px: number): number => -(px - MID) / SCALE;
const Y = (py: number): number => 0.43 + (ROW - py) / SCALE;
const LEN = (p: number): number => p / SCALE;
const MIRROR = (px: number): number => 2 * MID - px;

// --- the numbers read off the photograph ----------------------------------------------------------------------------------------------------------------------------------------
const TOP: Px[] = [[175, 647], [200, 640], [230, 631], [262, 626], [282, 616], [300, 610], [330, 607], [360, 606], [410, 607], [440, 611], [470, 615], [520, 617], [560, 624], [600, 632], [630, 642], [660, 656], [700, 674], [740, 692], [770, 700], [800, 708], [850, 716]];
const END_EDGE: Px[] = [[176, 695], [183, 709]];
const ROOF: Px[] = [[262, 709], [376, 711], [440, 710], [476, 706], [500, 706], [516, 708], [524, 711], [540, 718], [556, 727], [564, 736], [572, 748], [578, 765]];
const FLOOR = 798;
const ARCH_FOOT = 580;
const BOTTOM: Px[] = [[262, 905], [400, 900], [500, 872], [560, 863], [580, 878], [640, 882], [668, 852], [800, 862], [840, 866]];
const BRACKET: Px[] = [[725, 600], [908, 600], [908, 622], [882, 628], [884, 660], [893, 698], [906, 738], [919, 776], [922, 800], [922, 852], [886, 852], [874, 790], [862, 760], [842, 738], [820, 716], [780, 676], [742, 632], [725, 630]];
const LEVER: Px[] = [[692, 888], [730, 880], [782, 888], [798, 906], [786, 935], [730, 922], [698, 916]];

/** The depths across the bogie (metres from the centre line): ASSUMED, a side-on photograph shows none. */
const DEPTH = {
  beam: [0.975, 1.065], box: [0.955, 1.085], cap: [1.085, 1.12], sensor: [1.085, 1.11], spring: 0.985, damper: 1.0, lug: [1.065, 1.085], pedestal: [1.0, 1.145], window: [1.145, 1.147],
  bracket: [1.072, 1.117], yaw: 1.095, clevis: [1.07, 1.125], rod: 1.09, clamp: [1.065, 1.115], lever: [1.082, 1.106], ball: [1.07, 1.12], boss: [1.065, 1.071], step: [0.98, 1.14], wall: [1.065, 1.1],
  air: 0.91,
} as const;
const AIR = { pedestal: 0.2, bag: 0.23 } as const;

// --- helpers ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const key = (v: readonly number[]): string => v.map((c) => Math.round(c * 1e6)).join(',');
const vertsOf = (s: Soup): V3[] => Array.from({ length: s.pos.length / 3 }, (_, i): V3 => [s.pos[3 * i] as number, s.pos[3 * i + 1] as number, s.pos[3 * i + 2] as number]);
const trisOf = (s: Soup): number => s.pos.length / 9;
const parts = bogieParts(SPEC);
const frame = vertsOf(parts.frame);
const frameKeys = new Set(frame.map(key));
const springKeys = new Set(vertsOf(parts.springs).map(key));
/** The metres a rectangle of the photograph spans along z (low, high) and up (low, high); `mirror` takes the other end's. */
const span = (q: Rect, mirror = false): { z0: number; z1: number; y0: number; y1: number } => {
  const [a, b] = mirror ? [MIRROR(q[2]), MIRROR(q[0])] : [q[0], q[2]];
  return { z0: Math.min(Z(a), Z(b)), z1: Math.max(Z(a), Z(b)), y0: Y(q[3]), y1: Y(q[1]) };
};
/** The eight corners of a box over a rectangle of the photograph, across x from `xr[0]` to `xr[1]` on the side `sx`; `turn` is the far side's half turn about the vertical (z -> -z). */
function boxCorners(q: Rect, xr: readonly [number, number], sx: 1 | -1, o: { mirror?: boolean; turn?: boolean } = {}): V3[] {
  const s = span(q, o.mirror === true);
  const zs = o.turn === true && sx < 0 ? [-s.z1, -s.z0] : [s.z0, s.z1];
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
/** The (z, y) corners of the plate's cap on `x`: the triangles whose three corners all lie at x and whose normals all face along `face`. */
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
const metres = (p: Px): [number, number] => [Z(p[0]), Y(p[1])];

// --- the tests ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('AT300 frame: the side beam is the photograph\'s outline, 92 corners, on both faces of both sides, and the plate fills it exactly', () => {
  // clockwise from the left end block's top corner: over the top, down the right end block, the right slot's roof, arch and floor, the right arm's lower edge, the deep middle's, and the left's
  const mirror = (p: Px): Px => [MIRROR(p[0]), p[1]];
  const outline: Px[] = [
    ...TOP,
    ...[...TOP].reverse().map(mirror),
    ...END_EDGE.map(mirror),
    ...ROOF.map(mirror),
    mirror([ARCH_FOOT, FLOOR]),
    mirror([262, FLOOR]),
    ...BOTTOM.map(mirror),
    ...[...BOTTOM].reverse(),
    [262, FLOOR],
    [ARCH_FOOT, FLOOR],
    ...[...ROOF].reverse(),
    ...[...END_EDGE].reverse(),
  ];
  assert.equal(outline.length, 92);
  assert.equal(new Set(outline.map((p) => p.join(','))).size, 92, 'every corner is its own');
  const want = new Set(outline.map((p) => key(metres(p))));
  const area = shoelace(outline.map(metres));
  for (const sx of [-1, 1] as const) {
    // the outer face of a side (facing away from the centre line) and its inner face, at the plate's two depths
    for (const [x, face] of [[sx * DEPTH.beam[1], sx], [sx * DEPTH.beam[0], -sx]] as const) {
      const cap = capCorners(parts.frame, x, face as 1 | -1);
      assert.equal(cap.tris, 90, `side ${sx}, face at ${x}: a 92-cornered plate is 90 triangles on a face`);
      assert.deepEqual([...cap.corners].sort(), [...want].sort(), `side ${sx}, face at ${x}: the corners are the outline's`);
      assert.ok(Math.abs(cap.area - area) < 1e-9, `side ${sx}, face at ${x}: the triangles cover ${cap.area} m2, the outline ${area} m2`);
    }
  }
  // its size, in metres: the end blocks stand 0.36 m beyond the axles (the wheelbase is 2.6 m), and the deep middle's top is lower than the ends'
  const zs = [...want].map((k) => Number(k.split(',')[0]) / 1e6);
  assert.ok(Math.abs(Math.max(...zs) - 1.6586) < 1e-3 && Math.abs(Math.min(...zs) + 1.6586) < 1e-3, 'the beam reaches 1.659 m from the middle at each end');
  const ys = [...want].map((k) => Number(k.split(',')[1]) / 1e6);
  assert.ok(Math.abs(Math.max(...ys) - 0.9552) < 1e-3, 'the end blocks\' tops stand 0.955 m over the rail head');
  assert.ok(Math.abs(Math.min(...ys) - 0.3321) < 1e-3, 'and the arms\' feet 0.332 m');
});

test('AT300 frame: each end carries its axle box, cap, sensor housing, spring stack, damper, lug and pedestal strap with its window, at the numbers the photograph gives, and the other end is the mirror', () => {
  const BOX: Rect = [298, 797, 394, 905];
  const SENSOR: Rect = [386, 808, 468, 898];
  const SPRING: Rect = [285, 710, 435, 797];
  const DAMPER: Rect = [222, 709, 262, 852];
  const LUG: Rect = [172, 688, 215, 790];
  const PEDESTAL: Rect = [307, 668, 385, 797];
  const WINDOW: Rect = [325, 689, 372, 735];
  const CAP_R = LEN(36);
  const BOSS: { c: Px; r: number } = { c: [793, 797], r: 53 };
  const stackProfile = [[0, 0.92], [0.1, 1], [0.42, 1], [0.5, 0.8], [0.58, 1], [0.9, 1], [1, 0.92]] as const;
  for (const sx of [-1, 1] as const) {
    for (const flip of [false, true]) {
      const where = `side ${sx}, ${flip ? 'right' : 'left'} end`;
      const az = (flip ? -1 : 1) * 1.3;
      expectCorners(`${where}: the axle box`, boxCorners(BOX, DEPTH.box, sx, { mirror: flip }), frameKeys);
      expectCorners(`${where}: the sensor housing`, boxCorners(SENSOR, DEPTH.sensor, sx, { mirror: flip }), frameKeys);
      expectCorners(`${where}: the lug`, boxCorners(LUG, DEPTH.lug, sx, { mirror: flip }), frameKeys);
      expectCorners(`${where}: the pedestal strap`, boxCorners(PEDESTAL, DEPTH.pedestal, sx, { mirror: flip }), frameKeys);
      expectCorners(`${where}: the strap's window`, boxCorners(WINDOW, DEPTH.window, sx, { mirror: flip }), frameKeys);
      // the cap: a ten-sided tube of 36 pixels' radius on the axle, from the box's face to 1.12 m, closed at its outer end by a fan
      const x0 = sx * DEPTH.cap[0];
      const x1 = sx * DEPTH.cap[1];
      assert.equal(ringOf(frame, 0, x0, [0.43, az], CAP_R).length, 10, `${where}: the cap's foot is a ring of ten`);
      assert.equal(ringOf(frame, 0, x1, [0.43, az], CAP_R).length, 10, `${where}: the cap's face is a ring of ten`);
      assert.equal(ringOf(frame, 0, x1, [0.43, az], 0).length, 1, `${where}: closed by a fan at its outer end`);
      assert.equal(ringOf(frame, 0, x0, [0.43, az], 0).length, 0, `${where}: and open at its foot`);
      // the damper: an eight-sided tube of 20 pixels' radius at 1.0 m, from the axle box's level up to the beam end's foot, closed at its foot only
      const dm = span(DAMPER, flip);
      const dz = (dm.z0 + dm.z1) / 2;
      const dr = LEN(20);
      assert.equal(ringOf(frame, 1, dm.y0, [sx * DEPTH.damper, dz], dr).length, 8, `${where}: the damper's foot is a ring of eight`);
      assert.equal(ringOf(frame, 1, dm.y1, [sx * DEPTH.damper, dz], dr).length, 8, `${where}: and its head`);
      assert.equal(ringOf(frame, 1, dm.y0, [sx * DEPTH.damper, dz], 0).length, 1, `${where}: closed by a fan at its foot`);
      assert.equal(ringOf(frame, 1, dm.y1, [sx * DEPTH.damper, dz], 0).length, 0, `${where}: and open at its head`);
      // the round boss on the deep middle: a twelve-sided disc 6 mm proud of the beam's face
      const bz = Z(flip ? MIRROR(BOSS.c[0]) : BOSS.c[0]);
      assert.equal(ringOf(frame, 0, sx * DEPTH.boss[1], [Y(BOSS.c[1]), bz], LEN(BOSS.r)).length, 12, `${where}: the boss's face is a ring of twelve`);
      assert.equal(ringOf(frame, 0, sx * DEPTH.boss[0], [Y(BOSS.c[1]), bz], LEN(BOSS.r)).length, 12, `${where}: and its foot`);
      assert.equal(ringOf(frame, 0, sx * DEPTH.boss[1], [Y(BOSS.c[1]), bz], 0).length, 1, `${where}: the boss is closed by a fan`);
      // the spring stack: ten sides, a band at each end and a waist between, standing on the box under the beam's foot
      const sp = span(SPRING, flip);
      const h = sp.y1 - sp.y0;
      const rho = (sp.z1 - sp.z0) / 2;
      const zc = (sp.z0 + sp.z1) / 2;
      for (const [f, k] of stackProfile) {
        const ring = ringOf(vertsOf(parts.springs), 1, sp.y0 + f * h, [sx * DEPTH.spring, zc], k * rho);
        assert.equal(ring.length, 10, `${where}: the stack's ring at ${f} of its height, ${k} of its radius, has ${ring.length} corners`);
      }
      assert.equal(ringOf(vertsOf(parts.springs), 1, sp.y0, [sx * DEPTH.spring, zc], 0).length, 1, `${where}: the stack is closed at its foot`);
      assert.equal(ringOf(vertsOf(parts.springs), 1, sp.y1, [sx * DEPTH.spring, zc], 0).length, 1, `${where}: and at its head`);
    }
  }
});

test('AT300 frame: the middle carries the car\'s cast bracket, the yaw damper, the anti-roll rod, its clamps, ball joint and lever, and the step, each at its numbers, and the far side has them turned half a turn', () => {
  const YAW_BODY: Rect = [944, 795, 1238, 845];
  const CLEVIS_NEAR: Rect = [901, 801, 944, 833];
  const CLEVIS_FAR: Rect = [1242, 801, 1300, 852];
  const CLAMPS: Rect[] = [[692, 654, 722, 686], [692, 788, 722, 820]];
  const COLLAR: Rect = [696, 730, 724, 742];
  const ROD = { x: 709.5, radius: 10, top: 604, bottom: 848 };
  const BALL = { c: [711, 868] as Px, r: 20 };
  const LEVER_BOSS = { c: [798, 915] as Px, r: 25 };
  const STEP = { z: [1013, 1207] as const, wallTop: 866, wingTop: 897, treadTop: 912, treadBottom: 937 };
  for (const sx of [-1, 1] as const) {
    const turn = (z: number): number => (sx > 0 ? z : -z);
    const where = `side ${sx}`;
    // the bracket: a plate of eighteen corners 4.5 cm thick, on both of its faces
    const want = new Set(BRACKET.map((p) => key([turn(Z(p[0])), Y(p[1])])));
    for (const [x, face] of [[sx * DEPTH.bracket[1], sx], [sx * DEPTH.bracket[0], -sx]] as const) {
      const cap = capCorners(parts.frame, x, face as 1 | -1);
      assert.equal(cap.tris, 16, `${where}: the bracket's face at ${x} is sixteen triangles`);
      assert.deepEqual([...cap.corners].sort(), [...want].sort(), `${where}: the bracket's face at ${x} has the outline's corners`);
      assert.ok(Math.abs(cap.area - shoelace(BRACKET.map(metres))) < 1e-9, `${where}: and fills it`);
    }
    // the lever's plate: seven corners, 3 cm thick
    const leverWant = new Set(LEVER.map((p) => key([turn(Z(p[0])), Y(p[1])])));
    for (const [x, face] of [[sx * DEPTH.lever[1], sx], [sx * DEPTH.lever[0], -sx]] as const) {
      const cap = capCorners(parts.frame, x, face as 1 | -1);
      assert.equal(cap.tris, 5, `${where}: the lever's face at ${x} is five triangles`);
      assert.deepEqual([...cap.corners].sort(), [...leverWant].sort(), `${where}: the lever's face at ${x} has the outline's corners`);
      assert.ok(Math.abs(cap.area - shoelace(LEVER.map(metres))) < 1e-9, `${where}: and fills it`);
    }
    // the yaw damper: a ten-sided tube along z from its near end toward the middle's far end, a fan at each end, between its two clevises
    const yb = span(YAW_BODY);
    const yc = (yb.y0 + yb.y1) / 2;
    const yr = (yb.y1 - yb.y0) / 2;
    for (const z of [turn(yb.z1), turn(yb.z0)]) {
      assert.equal(ringOf(frame, 2, z, [sx * DEPTH.yaw, yc], yr).length, 10, `${where}: the yaw damper's end at z ${z.toFixed(4)} is a ring of ten`);
      assert.equal(ringOf(frame, 2, z, [sx * DEPTH.yaw, yc], 0).length, 1, `${where}: closed by a fan`);
    }
    expectCorners(`${where}: the near clevis`, boxCorners(CLEVIS_NEAR, DEPTH.clevis, sx, { turn: true }), frameKeys);
    expectCorners(`${where}: the far clevis`, boxCorners(CLEVIS_FAR, DEPTH.clevis, sx, { turn: true }), frameKeys);
    // the anti-roll rod: an eight-sided tube of 10 pixels' radius from its ball joint up to the body, closed at its foot, with two clamps and a collar on it
    const rz = turn(Z(ROD.x));
    assert.equal(ringOf(frame, 1, Y(ROD.bottom), [sx * DEPTH.rod, rz], LEN(ROD.radius)).length, 8, `${where}: the rod's foot is a ring of eight`);
    assert.equal(ringOf(frame, 1, Y(ROD.top), [sx * DEPTH.rod, rz], LEN(ROD.radius)).length, 8, `${where}: and its head`);
    assert.equal(ringOf(frame, 1, Y(ROD.bottom), [sx * DEPTH.rod, rz], 0).length, 1, `${where}: closed by a fan at its foot`);
    assert.equal(ringOf(frame, 1, Y(ROD.top), [sx * DEPTH.rod, rz], 0).length, 0, `${where}: and open at its head, under the body`);
    for (const q of [...CLAMPS, COLLAR]) expectCorners(`${where}: a clamp or collar on the rod`, boxCorners(q, DEPTH.clamp, sx, { turn: true }), frameKeys);
    // the ball joint and the boss on the lever's end: twelve-sided cylinders along x, a fan at each end
    for (const [name, ring] of [['ball joint', BALL], ['lever boss', LEVER_BOSS]] as const) {
      const cz = turn(Z(ring.c[0]));
      for (const x of [sx * DEPTH.ball[0], sx * DEPTH.ball[1]]) {
        assert.equal(ringOf(frame, 0, x, [Y(ring.c[1]), cz], LEN(ring.r)).length, 12, `${where}: the ${name}'s end at x ${x} is a ring of twelve`);
        assert.equal(ringOf(frame, 0, x, [Y(ring.c[1]), cz], 0).length, 1, `${where}: closed by a fan`);
      }
    }
    // the step: a yellow tread, a wing of 1.2 cm at each end and a wall behind, over the same stretch of z
    const z0 = Math.min(turn(Z(STEP.z[0])), turn(Z(STEP.z[1])));
    const z1 = Math.max(turn(Z(STEP.z[0])), turn(Z(STEP.z[1])));
    const box = (xr: readonly [number, number], y0: number, y1: number, za: number, zb: number): V3[] => [xr[0], xr[1]].flatMap((x) => [y0, y1].flatMap((y) => [za, zb].map((z): V3 => [sx * x, y, z])));
    expectCorners(`${where}: the step's tread`, box(DEPTH.step, Y(STEP.treadBottom), Y(STEP.treadTop), z0, z1), frameKeys);
    expectCorners(`${where}: the step's first wing`, box(DEPTH.step, Y(STEP.treadTop), Y(STEP.wingTop), z0, z0 + 0.012), frameKeys);
    expectCorners(`${where}: the step's second wing`, box(DEPTH.step, Y(STEP.treadTop), Y(STEP.wingTop), z1 - 0.012, z1), frameKeys);
    expectCorners(`${where}: the step's wall`, box(DEPTH.wall, Y(STEP.treadTop), Y(STEP.wallTop), z0 + 0.03, z1 - 0.03), frameKeys);
    // the air spring over the middle of the beam: a twelve-sided pedestal from the beam's top to the bag's rim, then the bag up to the underside of the body, closed at its top
    const topMid = Y(716);
    const pedestalTop = Y(688);
    const air = vertsOf(parts.springs);
    assert.equal(ringOf(air, 1, topMid, [sx * DEPTH.air, 0], AIR.pedestal).length, 12, `${where}: the pedestal's foot is a ring of twelve`);
    assert.equal(ringOf(air, 1, pedestalTop, [sx * DEPTH.air, 0], AIR.pedestal).length, 12, `${where}: and its head`);
    assert.equal(ringOf(air, 1, pedestalTop, [sx * DEPTH.air, 0], AIR.bag).length, 12, `${where}: the bag's rim`);
    assert.equal(ringOf(air, 1, BOGIE_TOP - 0.005, [sx * DEPTH.air, 0], AIR.bag).length, 12, `${where}: and its top`);
    assert.equal(ringOf(air, 1, BOGIE_TOP - 0.005, [sx * DEPTH.air, 0], 0).length, 1, `${where}: closed by a fan under the body`);
    assert.ok(springKeys.size > 0);
  }
});

test('AT300 frame: the part counts are the plates, boxes and tubes above and no more, and a motor bogie is the trailer bogie\'s frame with nothing hung between the wheels', () => {
  // each side: the beam's plate (92 corners: 4 x 92 - 4 = 364 triangles); at each end a box, a ten-sided cap with one fan (30), a box, an eight-sided damper with one fan (24), three boxes and a twelve-sided
  // boss with one fan (36), 150 in all; the middle: the bracket (18 corners: 68), the yaw damper (40), two clevises (24), the rod (24), two clamps and a collar (36), the ball (48), the lever (7 corners: 24), its
  // boss (48), the tread, two wings and a wall (48), 360 in all; and one box across the bogie
  assert.equal(trisOf(parts.frame), 2 * (364 + 2 * 150 + 360) + 12);
  // the springs: four ten-sided stacks of 140 and, a side, a pedestal of 24 and a bag of 36
  assert.equal(trisOf(parts.springs), 4 * 140 + 2 * (24 + 36));
  assert.equal(trisOf(parts.drive), 0, 'a trailer bogie has no drive');
  // the cross beam: one box from side beam to side beam (it reaches 0.98 m out, 5 mm into each plate, whose inner face is at 0.975), 0.16 m long, between 0.07 and 0.27 m over the axle line
  const cross: V3[] = [-0.98, 0.98].flatMap((x) => [0.43 + 0.07, 0.43 + 0.27].flatMap((y) => [-0.08, 0.08].map((z): V3 => [x, y, z])));
  expectCorners('the cross beam', cross, frameKeys);
  assert.ok(0.43 + 0.27 < Y(716), 'the cross beam stands under the top of the beam at the middle');
  const motor = bogieParts({ ...SPEC, motor: true });
  assert.equal(trisOf(motor.drive), 0, 'no photograph shows what a motor bogie carries between its wheels, and the trailer\'s shows nothing hanging there: none is drawn');
  for (const part of ['wheels', 'axles', 'brakes', 'frame', 'springs', 'drive'] as const) assert.deepEqual(motor[part].pos, parts[part].pos, `a motor bogie's ${part} are a trailer's`);
  // between the wheels nothing hangs lower than the photograph's lowest part there, the lever's boss and the step's tread (0.259 and 0.265 m over the rail head)
  const between = (v: V3): boolean => Math.abs(v[2]) <= 1.3 - 0.43;
  for (const part of ['brakes', 'frame', 'springs', 'drive'] as const) {
    const low = Math.min(...vertsOf(parts[part]).filter(between).map((v) => v[1]));
    if (part !== 'drive') assert.ok(low >= Y(915) - LEN(25) - 1e-9, `the ${part} hang to ${low.toFixed(4)} m between the wheels`);
  }
  assert.ok(Math.min(...frame.filter(between).map((v) => v[1])) <= Y(915) - LEN(25) + 1e-9, 'the lever\'s boss is the lowest part of the frame between the wheels');
  // and the highest: the car's bracket (and the beam's end blocks and the rod) stand below the body floor at 0.98 m
  assert.ok(Math.max(...frame.map((v) => v[1])) < 0.98, 'the frame is under the body floor');
});
