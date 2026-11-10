// The Desiro City's bogie frame as its photograph traces it (round 6, T6, "frame/axlebox/suspension/brake/cable and visible underfloor equipment masses match detailed refs"). The round-5 score found
// the Siemens' bogie "generic": a grey inside frame drawn by eye. Round 6 traces `Class 700 Thameslink at Gatwick station - 28898326470.jpg` (Elsie esq., 2016-08-23, CC BY 2.0; a private review
// asset, not shipped): the four castings between the wheels, the vertical rod and the big damper in front of them, the black air spring on the centre casting, and the long yaw damper with its two
// eyes and the Y bracket in front of the right wheel, each measured in the photograph's own pixels beside the two wheel faces that calibrate it. (`train-bogie-trace.test.ts` does the same for the
// AT300 and `train-bogie-trace-electrostar.test.ts` for the Electrostar.)
//
// The numbers below are an independent copy of `SIEMENS_TRACE` (web/src/train-bogie-trace.ts), of the depths `SF7000_DEPTH` and the paint `SF7000_PAINT` (train-parts.ts), and the calibration is restated
// from the two wheel faces, the wheelbase and the camera's elevation, so a number changed in either place fails here. Three things the photograph cannot give are ASSUMED and pinned as such: the depth
// of each part across the bogie (a photograph shows none), the camera's elevation over the bogie (20 degrees: this picture looks down on it, and the evidence runs from 15 to 36), and that the far
// side beam is the near one turned half a turn about the vertical. What a trailer bogie carries is a GAP: the photographs show a bogie under a car numbered 403102 (probably a motor car: an inference
// from the number), so a motor bogie and a trailer bogie are the one bogie, and the trailer's 2.1 m wheelbase only moves its wheels.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMU_FIGURES, FIGURES } from '../../core/train.ts';
import { SIEMENS_TRACE } from '../src/train-bogie-trace.ts';
import { BOGIE_STYLE } from '../src/train.ts';
import { BOGIE_TOP, bogieFarSoup, bogieParts, bogieSoup } from '../src/train-parts.ts';
import type { BogieSpec } from '../src/train-parts.ts';
import { col } from '../src/train-geom.ts';
import type { Soup } from '../src/train-geom.ts';

type V3 = [number, number, number];
type Px = readonly [number, number];
type Rect = readonly [number, number, number, number];

// --- the calibration, restated: the wheels' outer faces are a wheelbase apart on the axle line, and the camera looks down at 20 degrees -------------------------------------------------------
const SPEC: BogieSpec = { radius: 0.41, wheelbase: 2.2, track: FIGURES.gauge.value, motor: true, style: 'sf7000' };
const SCALE = (1685.6 - 491) / 2.2;
const MID = (491 + 1685.6) / 2;
const ROW = (733.5 + 733.5) / 2;
/** The plane of the calibration points: the wheel's outer face, 0.7825 m out (half the gauge and half the tread's width). */
const REF = FIGURES.gauge.value / 2 + 0.065;
const ELEVATION = (20 * Math.PI) / 180;
const Z = (px: number): number => -(px - MID) / SCALE;
/** The height over the rail head of the photograph's row `py` for a part standing `x` from the centre line: the camera looks down, so a part further in appears higher, and every height is foreshortened. */
const Y = (py: number, x: number = REF): number => 0.41 + ((ROW - py) / SCALE - (REF - x) * Math.sin(ELEVATION)) / Math.cos(ELEVATION);
const LEN = (p: number): number => p / SCALE;

// --- the numbers read off the (turned) photograph -------------------------------------------------------------------------------------------------------------------------------------------
const LEFT: Rect = [681, 515, 832, 784];
const LABEL: Rect = [826, 585, 926, 768];
const CENTRE: Rect = [958, 619, 1180, 801];
const RIGHT: Rect = [1234, 529, 1491, 689];
const ROD: Rect = [912, 561, 951, 779];
const DAMPER: Rect = [1177, 517, 1236, 717];
const BAG_EDGE = 955;
const YAW_FROM: Px = [1151, 744];
const YAW_TO: Px = [1534, 699];
const YAW_STEP = 1305;
const YAW_THIN = 27;
const YAW_THICK = 30;
const EYE_LEFT: Rect = [1063, 710, 1142, 798];
const EYE_RIGHT: Rect = [1540, 674, 1602, 718];
const BRACKET: Px[] = [[1539, 531], [1568, 531], [1603, 649], [1662, 536], [1695, 538], [1648, 644], [1630, 733], [1583, 734], [1574, 654]];

/** The depths across the bogie (metres from the centre line): ASSUMED, a photograph shows none. */
const DEPTH = {
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
/** What each part is painted: the median of its pixels in the photograph. */
const PAINT = {
  endLeft: 0x423d36,
  endRight: 0x272829,
  label: 0x414141,
  centre: 0x3b3e3f,
  eyeLeft: 0x636366,
  eyeRight: 0x53555c,
  rod: 0x5b5a5a,
  damper: 0x5c5e5e,
  bag: 0x20201c,
  yaw: 0x747a85,
  bracket: 0x6e7683,
} as const;

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
/** The metres a rectangle of the photograph spans along z (low, high) and up (low, high), for a part whose outer face stands `x` out. */
const span = (q: Rect, x: number): { z0: number; z1: number; y0: number; y1: number } => ({ z0: Math.min(Z(q[0]), Z(q[2])), z1: Math.max(Z(q[0]), Z(q[2])), y0: Y(q[3], x), y1: Y(q[1], x) });
/** The eight corners of a box over a rectangle of the photograph, across x from `xr[0]` to `xr[1]` on the side `sx` (heights from the outer face); the far side is the near side turned half a turn about the vertical (z -> -z). */
function boxCorners(q: Rect, xr: readonly [number, number], sx: 1 | -1): V3[] {
  const s = span(q, xr[1]);
  const zs = sx < 0 ? [-s.z1, -s.z0] : [s.z0, s.z1];
  const out: V3[] = [];
  for (const x of xr) for (const y of [s.y0, s.y1]) for (const z of zs) out.push([sx * x, y, z]);
  return out;
}
function expectCorners(label: string, corners: V3[], have: Set<string>): void {
  for (const c of corners) assert.ok(have.has(key(c)), `${label}: no vertex at (${c.map((v) => v.toFixed(5)).join(', ')})`);
}
/** The distinct vertices of `verts` on the plane `axis` = `at` that lie `r` from `c` in the other two coordinates (a ring of a tube standing along that axis). */
function ringOf(verts: V3[], axis: 0 | 1 | 2, at: number, c: readonly [number, number], r: number): V3[] {
  const [i, j] = ([0, 1, 2] as const).filter((k) => k !== axis);
  const seen = new Map<string, V3>();
  for (const v of verts) if (Math.abs(v[axis] - at) < 1e-6 && Math.abs(Math.hypot(v[i as number] - c[0], v[j as number] - c[1]) - r) < 1e-6) seen.set(key(v), v);
  return [...seen.values()];
}
/** The distinct vertices `r` from the point `c` in the plane through it across the direction `d` (the ring of a tube along `d`, of any slope). */
function ringAround(verts: V3[], c: V3, d: V3, r: number): V3[] {
  const seen = new Map<string, V3>();
  for (const v of verts) {
    const o: V3 = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
    if (Math.abs(o[0] * d[0] + o[1] * d[1] + o[2] * d[2]) < 1e-6 && Math.abs(Math.hypot(o[0], o[1], o[2]) - r) < 1e-6) seen.set(key(v), v);
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
/** The colours (as 'r,g,b' to six places) of every triangle of `s` with a vertex among `verts`, all three corners of each: a part's own triangles are one colour all over. */
function coloursAt(s: Soup, verts: V3[]): Set<string> {
  const at = new Set(verts.map(key));
  const out = new Set<string>();
  for (let t = 0; t < s.pos.length / 9; t++) {
    if (![0, 1, 2].some((k) => at.has(key([s.pos[9 * t + 3 * k] as number, s.pos[9 * t + 3 * k + 1] as number, s.pos[9 * t + 3 * k + 2] as number])))) continue;
    for (let k = 0; k < 3; k++) out.add([0, 1, 2].map((c) => (s.clr[9 * t + 3 * k + c] as number).toFixed(6)).join(','));
  }
  return out;
}
const colourKey = (hex: number): string => {
  const c = col(hex);
  return [c.r, c.g, c.b].map((v) => v.toFixed(6)).join(',');
};
/** Every normal the soup stores at the vertex `v` (one for each triangle corner there), as unit-length triples. */
function normalsAt(s: Soup, v: V3): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < s.pos.length / 3; i++) if (key([s.pos[3 * i] as number, s.pos[3 * i + 1] as number, s.pos[3 * i + 2] as number]) === key(v)) out.push([s.nrm[3 * i] as number, s.nrm[3 * i + 1] as number, s.nrm[3 * i + 2] as number]);
  return out;
}
const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
/** The colours of the triangles lying wholly on the plane x with their normals along `face`. */
function planeColours(s: Soup, x: number, face: 1 | -1): Set<string> {
  const out = new Set<string>();
  for (let t = 0; t < s.pos.length / 9; t++) {
    const flat = [0, 1, 2].every((k) => Math.abs((s.pos[9 * t + 3 * k] as number) - x) < 1e-9 && s.nrm[9 * t + 3 * k] === face);
    if (flat) out.add([0, 1, 2].map((c) => (s.clr[9 * t + c] as number).toFixed(6)).join(','));
  }
  return out;
}
/** Every triangle touching `verts` is the one colour `hex`. */
function onlyColour(s: Soup, verts: V3[], hex: number, label: string): void {
  assert.deepEqual([...coloursAt(s, verts)], [colourKey(hex)], `${label} is 0x${hex.toString(16)}`);
}
/** Every normal stored at the vertex `v` (a fan's centre) is along `want`. */
function expectFacing(s: Soup, v: V3, want: V3, label: string): void {
  const ns = normalsAt(s, v);
  assert.ok(ns.length > 0 && ns.every((n) => dot3(n, want) > 0.999999), `${label}: the normals at (${v.map((c) => c.toFixed(4)).join(', ')}) are not all along (${want.join(', ')})`);
}
/**
 * A tube about the axis through `c` along `d`: at every vertex of its ring `ring`, no stored normal points in toward the axis and one points straight out (the side's normal; a closed end's rim has the
 * cap's normal as well, along the axis).
 */
function expectOutward(s: Soup, ring: V3[], c: V3, d: V3, label: string): void {
  assert.ok(ring.length > 0, `${label}: a ring to look at`);
  for (const v of ring) {
    const radial = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
    const along = dot3(radial, d);
    const out = radial.map((r, i) => r - along * d[i]!);
    const len = Math.hypot(out[0]!, out[1]!, out[2]!);
    const unit = out.map((r) => r / len);
    const ns = normalsAt(s, v);
    assert.ok(ns.length > 0, `${label}: normals at the ring`);
    assert.ok(ns.every((n) => dot3(n, unit) > -1e-6), `${label}: a normal on the ring points in to the axis`);
    assert.ok(ns.some((n) => dot3(n, unit) > 0.99), `${label}: no normal on the ring points straight out`);
  }
}

// --- the tests ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('Desiro City frame: the calibration is the two wheels\' outer faces a wheelbase apart on the axle line, the camera looks down at an ASSUMED 20 degrees, and the figures are the ones the family is given', () => {
  const { parts } = bogie();
  // the trace records the faces' centres in the turned picture, the wheelbase, the elevation, and the two turns that levelled the picture
  assert.deepEqual(SIEMENS_TRACE.caps, [[491, 733.5], [1685.6, 733.5]]);
  assert.equal(SIEMENS_TRACE.wheelbase, 2.2);
  assert.equal(SIEMENS_TRACE.elevation, 20);
  assert.deepEqual(SIEMENS_TRACE.level, { first: { degrees: -4.8763, about: [497, 762] }, second: { degrees: 1.7749, about: [491, 733.5] } });
  // the faces are the axles' ends: a wheelbase apart (the label on the centre casting reads "2.20m") and a wheel's radius over the rail head, in the plane of the tyre's outer face
  near(Z(491), 1.1, 1e-12, 'the left wheel is half a wheelbase forward');
  near(Z(1685.6), -1.1, 1e-12, 'the right wheel is half a wheelbase aft');
  near(Y(733.5), 0.41, 1e-12, 'the wheel faces stand on the axle line');
  near(Y(733.5, 0.6), 0.41 - (REF - 0.6) * Math.sin(ELEVATION) / Math.cos(ELEVATION), 1e-12, 'and a part 0.18 m further in is drawn lower than it appears');
  assert.ok(Y(700, 0.6) < Y(700), 'a part further in than the wheel face appears higher in the picture than it stands, so its real height is less');
  near(SCALE, 543, 1e-9, 'the photograph is 543 px to the metre');
  near(REF, 0.7825, 1e-12, 'the wheel face stands 0.7825 m out');
  // the figures the build gives a Desiro City bogie are the ones the trace is calibrated to: a change there rescales every length here
  for (const fig of [EMU_FIGURES.desiro, EMU_FIGURES.desiro700]) {
    assert.equal(fig.wheelDiameter.value / 2, SPEC.radius);
    assert.equal(fig.wheelbaseMotor.value, SPEC.wheelbase);
    assert.equal(fig.wheelbaseTrailer.value, 2.1);
  }
  assert.equal(BOGIE_STYLE.desiro, 'sf7000');
  assert.equal(BOGIE_STYLE.desiro700, 'sf7000');
  // the tyre's outer face is the plane the picture is calibrated in
  assert.ok(vertsOf(parts.wheels).some((v) => Math.abs(Math.abs(v[0]) - REF) < 1e-9), 'the wheel has a face 0.7825 m out');
  // the axles of the built bogie are on those lines
  const axles = vertsOf(parts.axles);
  for (const az of [-1.1, 1.1]) {
    const mine = axles.filter((v) => Math.abs(v[2] - az) < 0.2);
    assert.ok(mine.length >= 16, `an axle at z ${az}`);
    for (const v of mine) assert.ok(Math.abs(Math.hypot(v[1] - 0.41, v[2] - az) - Math.hypot(mine[0]![1] - 0.41, mine[0]![2] - az)) < 1e-9, `the axle at z ${az} is round about the axle line`);
  }
  // the axle ends inside the wheel's hub, 0.7675 m out (half the gauge and 5 cm), short of the hub cover's outer face at 0.8155 m: nothing of the inside frame's picture shows an axle end beyond it
  near(Math.max(...axles.map((v) => Math.abs(v[0]))), SPEC.track / 2 + 0.05, 1e-9, 'the axle ends inside the hubs');
});

test('Desiro City frame: the four castings are boxes over the photograph\'s rectangles, each at its depth, on both sides, the far side turned half a turn', () => {
  const { frameKeys } = bogie();
  // the records in the trace are the rectangles read off the picture
  assert.deepEqual(SIEMENS_TRACE.casting, { left: LEFT, label: LABEL, centre: CENTRE, right: RIGHT });
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    expectCorners(`${where}: the dark casting by the near wheel`, boxCorners(LEFT, DEPTH.end, sx), frameKeys);
    expectCorners(`${where}: the casing with the label`, boxCorners(LABEL, DEPTH.label, sx), frameKeys);
    expectCorners(`${where}: the centre casting`, boxCorners(CENTRE, DEPTH.centre, sx), frameKeys);
    expectCorners(`${where}: the dark casting at the far end`, boxCorners(RIGHT, DEPTH.end, sx), frameKeys);
  }
  // their sizes in metres: the four stand between z = +0.750 (the near end casting's forward edge) and z = -0.742 (the far end's aft edge); the centre casting's foot, 0.219 m over the rail head, is the lowest
  // of the frame, and the near end casting's top, 0.772 m, the highest of the four
  near(Z(681), 0.7501, 1e-3, 'the near end casting starts 0.750 m forward of the middle');
  near(Z(1491), -0.7416, 1e-3, 'and the far end casting ends 0.742 m aft of it');
  near(Z(958) - Z(1180), 0.4089, 1e-3, 'the centre casting is 0.409 m long');
  near(Y(801, DEPTH.centre[1]), 0.2186, 1e-3, 'and its foot stands 0.219 m over the rail head');
  near(Y(515, DEPTH.end[1]), 0.7718, 1e-3, 'the near end casting reaches 0.772 m');
  near(Y(619, DEPTH.centre[1]), 0.5753, 1e-3, 'the centre casting\'s top, which the air spring stands on, is 0.575 m up');
  // the boxes stand in the clear between the wheels: no part of one is nearer the middle than 0.44 m, and the outermost of the four stands 0.60 m out, short of the wheel's inner face at 0.6525 m
  assert.equal(DEPTH.end[1] < 0.6525 && DEPTH.centre[1] < 0.6525 && DEPTH.label[1] < 0.6525, true, 'the castings stand inboard of the wheels\' inner faces');
});

test('Desiro City frame: the vertical rod and the big vertical damper are ten-sided cylinders on their feet, closed at both ends, each in front of the casting beside it', () => {
  const { parts, frame } = bogie();
  assert.deepEqual(SIEMENS_TRACE.rod, ROD);
  assert.deepEqual(SIEMENS_TRACE.damper, DAMPER);
  for (const sx of [-1, 1] as const) {
    for (const [name, q, depth] of [['rod', ROD, DEPTH.rod], ['damper', DAMPER, DEPTH.damper]] as const) {
      const where = `side ${sx}, ${name}`;
      const s = span(q, depth);
      const zc = sx * ((Z(q[0]) + Z(q[2])) / 2);
      const radius = LEN((q[2] - q[0]) / 2);
      for (const y of [s.y0, s.y1]) {
        assert.equal(ringOf(frame, 1, y, [sx * depth, zc], radius).length, 10, `${where}: a ring of ten at ${y.toFixed(4)} m`);
        assert.equal(ringOf(frame, 1, y, [sx * depth, zc], 0).length, 1, `${where}: closed by a fan at ${y.toFixed(4)} m`);
        expectOutward(parts.frame, ringOf(frame, 1, y, [sx * depth, zc], radius), [sx * depth, y, zc], [0, 1, 0], `${where} at ${y.toFixed(4)} m`);
      }
      // the head's fan faces up and the foot's down
      expectFacing(parts.frame, [sx * depth, s.y1, zc], [0, 1, 0], `${where}: the head's fan faces up`);
      expectFacing(parts.frame, [sx * depth, s.y0, zc], [0, -1, 0], `${where}: the foot's fan faces down`);
    }
  }
  near(LEN((ROD[2] - ROD[0]) / 2), 0.0359, 1e-3, 'the rod is 7.2 cm across');
  near(LEN((DAMPER[2] - DAMPER[0]) / 2), 0.0543, 1e-3, 'the damper is 10.9 cm across');
  near(Y(DAMPER[1], DEPTH.damper) - Y(DAMPER[3], DEPTH.damper), 0.392, 1e-3, 'and 0.392 m high');
});

test('Desiro City frame: the black air spring is a fourteen-sided drum on the centre casting, from its top up to the underside of the body, closed at its head, centred on the middle of the bogie\'s length', () => {
  const { springVerts } = bogie();
  assert.equal(SIEMENS_TRACE.bag.edge, BAG_EDGE);
  const rho = Math.abs(Z(BAG_EDGE));
  near(rho, 0.2455, 1e-3, 'the drum is 0.49 m across');
  const foot = Y(CENTRE[1], DEPTH.centre[1]);
  const head = BOGIE_TOP - 0.005;
  near(head, 0.945, 1e-12, 'its head stands 5 mm under the body\'s underside line');
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    assert.equal(ringOf(springVerts, 1, foot, [sx * DEPTH.bag, 0], rho).length, 14, `${where}: the foot is a ring of fourteen`);
    assert.equal(ringOf(springVerts, 1, head, [sx * DEPTH.bag, 0], rho).length, 14, `${where}: and the head`);
    assert.equal(ringOf(springVerts, 1, foot, [sx * DEPTH.bag, 0], 0).length, 0, `${where}: open at its foot, where it stands on the casting`);
    assert.equal(ringOf(springVerts, 1, head, [sx * DEPTH.bag, 0], 0).length, 1, `${where}: closed by a fan at its head`);
    expectFacing(bogie().parts.springs, [sx * DEPTH.bag, head, 0], [0, 1, 0], `${where}: the head's fan faces up`);
    expectOutward(bogie().parts.springs, ringOf(springVerts, 1, foot, [sx * DEPTH.bag, 0], rho), [sx * DEPTH.bag, foot, 0], [0, 1, 0], `${where}: the drum's foot`);
    expectOutward(bogie().parts.springs, ringOf(springVerts, 1, head, [sx * DEPTH.bag, 0], rho), [sx * DEPTH.bag, head, 0], [0, 1, 0], `${where}: the drum's head`);
    // the drum stands on the centre casting's top, 0.49 m across against the casting's 0.41 m, so it overhangs the casting a little along the bogie
    assert.ok(DEPTH.bag + rho < 0.7, `${where}: the drum's outer edge is ${(DEPTH.bag + rho).toFixed(4)} m out, inboard of the wheel's inner face`);
    assert.ok(DEPTH.bag - rho > 0.1, `${where}: and clear of the other side's by ${(2 * (DEPTH.bag - rho)).toFixed(3)} m`);
  }
  assert.equal(trisOf(bogie().parts.springs), 2 * (28 + 14), 'a fourteen-sided drum closed at its head is 42 triangles, two of them');
  near(Math.max(...springVerts.map((v) => v[1])), head, 1e-12, 'the drum\'s head is the highest of the springs');
  assert.ok(head < 0.98, 'and under the lowest body floor');
});

test('Desiro City frame: the yaw damper is one straight line from the eye on the centre casting to the eye on the Y bracket, a thin cylinder and from the step on a thick one, between two box eyes', () => {
  const { frame, frameKeys } = bogie();
  assert.deepEqual(SIEMENS_TRACE.yaw, { from: YAW_FROM, to: YAW_TO, step: YAW_STEP, rodRadius: YAW_THIN, bodyRadius: YAW_THICK, eyeLeft: EYE_LEFT, eyeRight: EYE_RIGHT });
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    const a: V3 = [sx * DEPTH.yaw, Y(YAW_FROM[1], DEPTH.yaw), sx * Z(YAW_FROM[0])];
    const b: V3 = [sx * DEPTH.yaw, Y(YAW_TO[1], DEPTH.yaw), sx * Z(YAW_TO[0])];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const d: V3 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length, (b[2] - a[2]) / length];
    const at = (u: number): V3 => [a[0] + d[0] * u, a[1] + d[1] * u, a[2] + d[2] * u];
    const step = ((YAW_STEP - YAW_FROM[0]) / (YAW_TO[0] - YAW_FROM[0])) * length;
    const thin = LEN(YAW_THIN);
    const thick = LEN(YAW_THICK);
    // the line rises toward the Y bracket (aft, the right of the picture): 45 px in 383 apparent, 7.9 degrees once the depth's correction is taken out
    assert.ok(d[1] > 0.05 && d[1] < 0.2, `${where}: the damper rises gently toward the bracket (${d[1].toFixed(4)})`);
    assert.equal(ringAround(frame, at(0), d, thin).length, 10, `${where}: the thin cylinder starts in a ring of ten`);
    assert.equal(ringAround(frame, at(0), d, 0).length, 1, `${where}: closed by a fan where it starts`);
    assert.equal(ringAround(frame, at(step), d, thin).length, 10, `${where}: the thin cylinder ends in a ring of ten at the step`);
    assert.equal(ringAround(frame, at(step), d, thick).length, 10, `${where}: the thick one starts in a ring of ten there`);
    assert.equal(ringAround(frame, at(step), d, 0).length, 1, `${where}: closed by a fan where it starts`);
    assert.equal(ringAround(frame, at(length), d, thick).length, 10, `${where}: the thick cylinder ends in a ring of ten`);
    assert.equal(ringAround(frame, at(length), d, 0).length, 1, `${where}: closed by a fan at its far end too`);
    // the fans face away from the cylinders they close: the start's and the step's back along the damper, the far end's forward; and the rims' normals point out
    const faces = (v: V3, want: V3): boolean => normalsAt(bogie().parts.frame, v).some((n) => dot3(n, want) > 0.999999);
    assert.ok(faces(at(0), [-d[0], -d[1], -d[2]]), `${where}: the start's fan faces back along the damper`);
    assert.ok(faces(at(step), [-d[0], -d[1], -d[2]]), `${where}: the thick cylinder's start fan faces back along the damper`);
    assert.ok(faces(at(length), d), `${where}: the far end's fan faces forward`);
    expectOutward(bogie().parts.frame, ringAround(frame, at(0), d, thin), at(0), d, `${where}: the thin cylinder's start`);
    expectOutward(bogie().parts.frame, ringAround(frame, at(length), d, thick), at(length), d, `${where}: the thick cylinder's end`);
    // the eyes: boxes at the two ends, the left on the centre casting's side (a bracket on it), the right a boss on the Y; they overlap what they stand against by a centimetre in depth
    expectCorners(`${where}: the left eye`, boxCorners(EYE_LEFT, DEPTH.eyeLeft, sx), frameKeys);
    expectCorners(`${where}: the right eye`, boxCorners(EYE_RIGHT, DEPTH.eyeRight, sx), frameKeys);
  }
  near(Math.abs(Z(YAW_TO[0]) - Z(YAW_FROM[0])), 0.7053, 1e-3, 'the damper is 0.705 m between its eye centres along the bogie');
  near(LEN(YAW_THIN), 0.0497, 1e-3, 'the thin cylinder is 10 cm across');
  near(LEN(YAW_THICK), 0.0552, 1e-3, 'and the thick one 11 cm');
  near(Y(YAW_FROM[1], DEPTH.yaw), 0.4249, 1e-3, 'it starts 0.425 m over the rail head');
  near(Y(YAW_TO[1], DEPTH.yaw), 0.5131, 1e-3, 'and ends 0.513 m');
});

test('Desiro City frame: the Y bracket in front of the right wheel is one plate of the photograph\'s outline, nine corners, on both faces of both sides', () => {
  const { parts } = bogie();
  assert.deepEqual(SIEMENS_TRACE.bracket, BRACKET);
  assert.equal(BRACKET.length, 9);
  assert.equal(new Set(BRACKET.map((p) => p.join(','))).size, 9, 'every corner is its own');
  const area = shoelace(BRACKET.map((p) => [Z(p[0]), Y(p[1], DEPTH.bracket[1])] as const));
  for (const sx of [-1, 1] as const) {
    const want = new Set(BRACKET.map((p) => key([sx * Z(p[0]), Y(p[1], DEPTH.bracket[1])])));
    // the outer face of a side (facing away from the centre line) and its inner face, at the plate's two depths
    for (const [x, face] of [[sx * DEPTH.bracket[1], sx], [sx * DEPTH.bracket[0], -sx]] as const) {
      const cap = capCorners(parts.frame, x, face as 1 | -1);
      assert.equal(cap.tris, 7, `side ${sx}, face at ${x}: a 9-cornered plate is 7 triangles on a face`);
      assert.deepEqual([...cap.corners].sort(), [...want].sort(), `side ${sx}, face at ${x}: the corners are the outline's`);
      assert.ok(Math.abs(cap.area - area) < 1e-9, `side ${sx}, face at ${x}: the triangles cover ${cap.area} m2, the outline ${area} m2`);
    }
  }
  // its size, in metres: the plate stands in front of the right wheel and runs up behind the body's skirt
  const zs = BRACKET.map((p) => Z(p[0]));
  near(Math.max(...zs) - Math.min(...zs), 0.2873, 1e-3, 'the Y is 0.287 m across');
  const ys = BRACKET.map((p) => Y(p[1], DEPTH.bracket[1]));
  near(Math.max(...ys) - Math.min(...ys), 0.3978, 1e-3, 'and 0.398 m high');
  near(Math.max(...ys), 0.8387, 1e-3, 'its arm reaches 0.839 m, the highest of the frame, up behind the body\'s skirt');
  near(area, 0.0466, 1e-4, 'the plate covers 0.0466 m2');
});

test('Desiro City frame: every part is the colour of its pixels in the photograph, on both sides', () => {
  const { parts, frame } = bogie();
  const only = (verts: V3[], hex: number, label: string, soup: Soup = parts.frame): void => assert.deepEqual([...coloursAt(soup, verts)], [colourKey(hex)], `${label} is 0x${hex.toString(16)}`);
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    only(boxCorners(LEFT, DEPTH.end, sx), PAINT.endLeft, `${where}: the near end casting`);
    only(boxCorners(LABEL, DEPTH.label, sx), PAINT.label, `${where}: the casing with the label`);
    only(boxCorners(CENTRE, DEPTH.centre, sx), PAINT.centre, `${where}: the centre casting`);
    only(boxCorners(RIGHT, DEPTH.end, sx), PAINT.endRight, `${where}: the far end casting`);
    only(boxCorners(EYE_LEFT, DEPTH.eyeLeft, sx), PAINT.eyeLeft, `${where}: the left eye`);
    only(boxCorners(EYE_RIGHT, DEPTH.eyeRight, sx), PAINT.eyeRight, `${where}: the right eye`);
    for (const [q, depth, hex, name] of [[ROD, DEPTH.rod, PAINT.rod, 'rod'], [DAMPER, DEPTH.damper, PAINT.damper, 'damper']] as const) {
      const s = span(q, depth);
      const zc = sx * ((Z(q[0]) + Z(q[2])) / 2);
      only(ringOf(frame, 1, s.y0, [sx * depth, zc], LEN((q[2] - q[0]) / 2)), hex, `${where}: the ${name}`);
    }
    const a: V3 = [sx * DEPTH.yaw, Y(YAW_FROM[1], DEPTH.yaw), sx * Z(YAW_FROM[0])];
    const b: V3 = [sx * DEPTH.yaw, Y(YAW_TO[1], DEPTH.yaw), sx * Z(YAW_TO[0])];
    only([a, b], PAINT.yaw, `${where}: the yaw damper`);
    only(BRACKET.map((p) => [sx * DEPTH.bracket[1], Y(p[1], DEPTH.bracket[1]), sx * Z(p[0])] as V3), PAINT.bracket, `${where}: the Y bracket`);
    // each of its faces: the outer one and the inner one are the same grey
    for (const [x, face] of [[sx * DEPTH.bracket[1], sx], [sx * DEPTH.bracket[0], -sx]] as const) assert.deepEqual([...planeColours(parts.frame, x, face as 1 | -1)], [colourKey(PAINT.bracket)], `${where}: the bracket's face at ${x} is 0x${PAINT.bracket.toString(16)}`);
    only(ringOf(vertsOf(parts.springs), 1, BOGIE_TOP - 0.005, [sx * DEPTH.bag, 0], Math.abs(Z(BAG_EDGE))), PAINT.bag, `${where}: the air spring`, parts.springs);
  }
});

test('Desiro City frame: the part counts are the boxes, tubes and plate above and no more, and a motor bogie is the trailer bogie\'s frame with nothing hung between the wheels, on either wheelbase', () => {
  const { parts, frame, frameKeys, springVerts } = bogie();
  // each side: four casting boxes (12 each), the rod and the damper (a ten-sided tube closed at both ends: 20 + 10 + 10 = 40 each), the yaw damper (30 and 40), two eyes (12 each) and the bracket plate (2 x 7
  // + 2 x 9 = 32); and one box across the bogie between the two centre castings
  const side = 4 * 12 + 2 * 40 + (30 + 40) + 2 * 12 + 32;
  assert.equal(trisOf(parts.frame), 2 * side + 12);
  // the springs: a side's drum, fourteen sides of two triangles and a fan at the head
  assert.equal(trisOf(parts.springs), 2 * (28 + 14));
  assert.equal(trisOf(parts.drive), 0, 'a motor bogie has no drive: the photograph shows none between the wheels');
  // the transom between the two sides' centre castings, which no photograph shows (it stands between them): 0.16 m along the bogie and 0.2 m deep, at the centre casting's mid height, 1 cm into each casting
  const mid = (Y(CENTRE[1], DEPTH.centre[1]) + Y(CENTRE[3], DEPTH.centre[1])) / 2;
  const cross: V3[] = [-0.45, 0.45].flatMap((x) => [mid - 0.1, mid + 0.1].flatMap((y) => [-0.08, 0.08].map((z): V3 => [x, y, z])));
  expectCorners('the transom', cross, frameKeys);
  // a trailer bogie, with its 2.1 m wheelbase, has the same frame and springs, the traced ones, with its wheels nearer
  const trailer = bogieParts({ ...SPEC, motor: false, wheelbase: 2.1 });
  for (const part of ['frame', 'springs', 'drive'] as const) assert.deepEqual(trailer[part].pos, parts[part].pos, `a trailer bogie's ${part} are a motor bogie's`);
  assert.notDeepEqual(trailer.wheels.pos, parts.wheels.pos, 'but its wheels stand 5 cm nearer the middle');
  assert.deepEqual(bogieSoup({ ...SPEC, motor: false }).pos, bogieSoup(SPEC).pos, 'a trailer car\'s bogie of the motor bogie\'s wheelbase is the motor bogie, triangle for triangle');
  // the discs and callipers are the only brake: no unit hangs between the wheels, and the brakes are the 'siemens' style's, which draws the discs alone
  assert.equal(trisOf(parts.brakes), trisOf(bogieParts({ ...SPEC, style: 'siemens', motor: true }).brakes), 'the brakes are the discs and callipers alone');
  assert.equal(vertsOf(parts.brakes).filter((v) => Math.abs(v[2]) <= 1.1 - 0.41).length, 0, 'no brake unit hangs in the clear between the wheels');
  // the lowest of the frame is the centre casting's foot, 0.219 m over the rail head (the near end casting's is 0.245 m); the highest, the Y bracket's arm at 0.839 m, up behind the body's skirt, and the air
  // spring's head at 0.945 m under the body
  near(Math.min(...frame.map((v) => v[1])), Y(CENTRE[3], DEPTH.centre[1]), 1e-9, 'the frame\'s foot is the centre casting\'s');
  assert.ok(Math.min(...frame.map((v) => v[1])) > 0.1, 'and 0.1 m or more over the rail head');
  near(Math.max(...frame.map((v) => v[1])), Y(531, DEPTH.bracket[1]), 1e-9, 'the frame\'s top is the bracket\'s');
  assert.ok(Math.max(...frame.map((v) => v[1])) < 0.98 && Math.max(...springVerts.map((v) => v[1])) < 0.98, 'the frame and the springs are under the body floor');
  // nothing longer than the wheels reach (on the trailer bogie's shorter wheelbase too), and nothing wider than the bogie may be: the yaw damper's thick cylinder is the outermost, 0.9325 m out
  for (const [label, b] of [['motor', parts], ['trailer', trailer]] as const) {
    const wb = label === 'motor' ? 2.2 : 2.1;
    for (const part of ['frame', 'springs'] as const) assert.ok(Math.max(...vertsOf(b[part]).map((v) => Math.abs(v[2]))) <= wb / 2 + 0.41 + 0.028, `${label}: no part of the ${part} is longer than the wheels reach`);
  }
  near(Math.max(...frame.map((v) => Math.abs(v[0]))), 0.9325, 5e-4, 'the yaw damper is the outermost part of the frame');
  assert.ok(Math.max(...frame.map((v) => Math.abs(v[0]))) <= 1.15, 'inside the 1.15 m the bogie may reach');
  // the Voyagers' 'siemens' style is another frame: the same wheels, a different frame, left as it was
  const voyager = bogieParts({ ...SPEC, style: 'siemens' });
  assert.notEqual(trisOf(voyager.frame), trisOf(parts.frame), 'the Voyagers\' inside frame is its own');
  assert.deepEqual(voyager.wheels.pos, parts.wheels.pos, 'on the same wheels');
});

test('Desiro City frame: the far level is the castings as one box a side, the air spring a square drum, the yaw damper a bar outboard of the wheel and the transom, each at the traced numbers', () => {
  const far = vertsOf(bogieFarSoup(SPEC));
  const farKeys = new Set(far.map(key));
  const castings: [Rect, readonly [number, number]][] = [[LEFT, DEPTH.end], [LABEL, DEPTH.label], [CENTRE, DEPTH.centre], [RIGHT, DEPTH.end]];
  const zFirst = Math.max(...castings.map(([q]) => Z(q[0])));
  const zLast = Math.min(...castings.map(([q]) => Z(q[2])));
  const yLow = Math.min(...castings.map(([q, d]) => Y(q[3], d[1])));
  const yHigh = Math.max(...castings.map(([q, d]) => Y(q[1], d[1])));
  const foot = Y(CENTRE[1], DEPTH.centre[1]);
  const bag = Math.abs(Z(BAG_EDGE)) * 0.8;
  const reach = LEN(YAW_THICK);
  const barLow = Math.min(Y(YAW_FROM[1], DEPTH.yaw), Y(YAW_TO[1], DEPTH.yaw)) - reach;
  const barHigh = Math.max(Y(YAW_FROM[1], DEPTH.yaw), Y(YAW_TO[1], DEPTH.yaw)) + reach;
  const boxAt = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): V3[] => [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z): V3 => [x, y, z])));
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    const [z0, z1] = sx > 0 ? [zLast, zFirst] : [-zFirst, -zLast];
    expectCorners(`${where}: the castings' box`, boxAt(sx * DEPTH.centre[0], sx * DEPTH.end[1], yLow, yHigh, z0, z1), farKeys);
    expectCorners(`${where}: the air spring's drum`, boxAt(sx * (DEPTH.bag - bag), sx * (DEPTH.bag + bag), foot, BOGIE_TOP - 0.005, -bag, bag), farKeys);
    const ends = [Z(YAW_TO[0]), Z(YAW_FROM[0])];
    const [yz0, yz1] = sx > 0 ? [ends[0] as number, ends[1] as number] : [-(ends[1] as number), -(ends[0] as number)];
    expectCorners(`${where}: the yaw damper's bar`, boxAt(sx * DEPTH.eyeRight[0], sx * DEPTH.eyeRight[1], barLow, barHigh, yz0, yz1), farKeys);
  }
  expectCorners('the transom', boxAt(-(DEPTH.centre[0] + 0.01), DEPTH.centre[0] + 0.01, (foot + Y(CENTRE[3], DEPTH.centre[1])) / 2 - 0.1, (foot + Y(CENTRE[3], DEPTH.centre[1])) / 2 + 0.1, -0.08, 0.08), farKeys);
  // each box is the colour of the part it stands for
  const farSoup = bogieFarSoup(SPEC);
  for (const sx of [-1, 1] as const) {
    const where = `side ${sx}`;
    const [z0, z1] = sx > 0 ? [zLast, zFirst] : [-zFirst, -zLast];
    onlyColour(farSoup, boxAt(sx * DEPTH.centre[0], sx * DEPTH.end[1], yLow, yHigh, z0, z1), PAINT.centre, `${where}: the castings' box`);
    onlyColour(farSoup, boxAt(sx * (DEPTH.bag - bag), sx * (DEPTH.bag + bag), foot, BOGIE_TOP - 0.005, -bag, bag), PAINT.bag, `${where}: the air spring's drum`);
    const ends = [Z(YAW_TO[0]), Z(YAW_FROM[0])];
    const [yz0, yz1] = sx > 0 ? [ends[0] as number, ends[1] as number] : [-(ends[1] as number), -(ends[0] as number)];
    onlyColour(farSoup, boxAt(sx * DEPTH.eyeRight[0], sx * DEPTH.eyeRight[1], barLow, barHigh, yz0, yz1), PAINT.yaw, `${where}: the yaw damper's bar`);
  }
  const midY = (foot + Y(CENTRE[3], DEPTH.centre[1])) / 2;
  onlyColour(farSoup, boxAt(-(DEPTH.centre[0] + 0.01), DEPTH.centre[0] + 0.01, midY - 0.1, midY + 0.1, -0.08, 0.08), PAINT.centre, 'the transom');
  // seven boxes and the wheels: under 300 triangles, and the far bogie reaches nine tenths of the near one's width
  const farTris = trisOf(bogieFarSoup(SPEC));
  assert.ok(farTris >= 100 && farTris <= 300, `${farTris} triangles in the far bogie`);
  const nearReach = Math.max(...vertsOf(bogieSoup(SPEC)).map((v) => Math.abs(v[0])));
  assert.ok(Math.max(...far.map((v) => Math.abs(v[0]))) >= 0.9 * nearReach, 'the far bogie\'s width is within a tenth of the near one\'s');
});

function near(actual: number, expected: number, tol: number, label: string): void {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} against ${expected} (tolerance ${tol})`);
}
