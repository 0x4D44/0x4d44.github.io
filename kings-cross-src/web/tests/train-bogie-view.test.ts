// The bogies as the round-4 score faulted them and round 5 redrew them (T6, every kind): "make motor and trailer bogies differ visibly at V07, through motor/gearbox mass and frame or
// brake detail, rather than only a small end bell". V07 is the track-side camera of the evidence pack (the capture planner's `bogie-motor` and `bogie-trailer` views, 4.4 m off the
// centre line at 0.65 m up, 1600 x 1000), and what it sees of a bogie is what hangs under the side beam between the wheels. This reads each pose from the planner, draws the bogie's
// own triangles from that eye with a depth buffer, and counts the pixels each part fills. Pure geometry: no WebGL and no DOM.
//
// What the counts leave out: the car's own skirts and underfloor boxes (they stand above the bogie's beam, and they hide none of what is counted here), the paint's light and the
// camera's lens. The drive, the trailer's brake units and their sizes are ASSUMED (no photograph shows them: see the note over `BRAKE_UNIT` in train-parts.ts), so the floors below pin
// the picture the model draws and not a measurement of a real bogie.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { EMU_FIGURES, FIGURES, trainLayout } from '../../core/train.ts';
import type { Car, EmuFamily, TrainKind } from '../../core/train.ts';
import { BOGIE_STYLE, buildTrain } from '../src/train.ts';
import { bogieParts, bogieSoup } from '../src/train-parts.ts';
import type { BogiePart, BogieSpec } from '../src/train-parts.ts';

type V3 = [number, number, number];
type Pose = { suffix: string; status: string; eye: V3; target: V3; fov: number; car: { index: number }; notes: { bogie: number; motor: boolean; z: number } };
/** The capture tool's own planner is the source of the camera: the test reads V07 from it and does not copy the numbers (the tools are plain .mjs, so they are loaded by URL). */
const tool = async <T>(name: string): Promise<T> => (await import(new URL(`../../tools/${name}`, import.meta.url).href)) as T;
const framing = await tool<{ CATALOGUE: { viewport: { width: number; height: number } }; planCatalogueViews: (formation: unknown) => Pose[] }>('train-framing.mjs');
const capture = await tool<{ describeFormation: (kind: string) => unknown }>('train-capture.mjs');

const PARTS: BogiePart[] = ['wheels', 'axles', 'brakes', 'frame', 'springs', 'drive'];
/** The depth buffer is sampled every second pixel each way, and each sample stands for the four pixels round it. */
const STRIDE = 2;

/**
 * How many pixels of the frame each part of the bogie fills, from `eye` looking at `target`, the nearest triangle taking each sample (a bogie's own parts hide one another: the wheel
 * in front hides what is behind it, so a part tucked behind a wheel counts for what shows). The caller moves the bogie to the origin.
 */
function pixelsOf(spec: BogieSpec, eye: V3, target: V3, fov: number, width: number, height: number): Record<BogiePart, number> {
  const focal = height / 2 / Math.tan((fov * Math.PI) / 360);
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a: V3): V3 => {
    const length = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / length, a[1] / length, a[2] / length];
  };
  const forward = unit(sub(target, eye));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const gw = Math.ceil(width / STRIDE);
  const gh = Math.ceil(height / STRIDE);
  const depth = new Float64Array(gw * gh).fill(Infinity);
  const owner = new Int8Array(gw * gh).fill(-1);
  const parts = bogieParts(spec);
  PARTS.forEach((name, id) => {
    const pos = parts[name].pos;
    for (let t = 0; t + 8 < pos.length; t += 9) {
      const p = [0, 1, 2].map((k) => {
        const d = sub([pos[t + 3 * k] as number, pos[t + 3 * k + 1] as number, pos[t + 3 * k + 2] as number], eye);
        const z = dot(d, forward);
        return { x: width / 2 + (focal * dot(d, right)) / z, y: height / 2 - (focal * dot(d, up)) / z, z };
      }) as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }];
      const [a, b, c] = p;
      const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x) / STRIDE));
      const x1 = Math.min(gw - 1, Math.ceil(Math.max(a.x, b.x, c.x) / STRIDE));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y) / STRIDE));
      const y1 = Math.min(gh - 1, Math.ceil(Math.max(a.y, b.y, c.y) / STRIDE));
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const px = (gx + 0.5) * STRIDE;
          const py = (gy + 0.5) * STRIDE;
          const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
          const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = 1 / (w0 / a.z + w1 / b.z + w2 / c.z);
          const i = gy * gw + gx;
          if (z < (depth[i] as number)) {
            depth[i] = z;
            owner[i] = id;
          }
        }
      }
    }
  });
  const counts = Object.fromEntries(PARTS.map((name) => [name, 0])) as Record<BogiePart, number>;
  for (const id of owner) if (id >= 0) counts[PARTS[id] as BogiePart] += STRIDE * STRIDE;
  return counts;
}

/** The bogie a car runs on, as the maker's style and the sizes its family gives it (core/train.ts: wheel diameter, motor and trailer wheelbase); the same derivation the build makes. */
function specOf(kind: TrainKind, car: Car, k: number): BogieSpec {
  const family = trainLayout(kind).spec.family;
  const fig = family === 'at300' ? null : EMU_FIGURES[family as EmuFamily];
  const motor = (car.motor as readonly boolean[])[k] as boolean;
  return {
    radius: fig ? fig.wheelDiameter.value / 2 : FIGURES.wheelDiameter.value / 2,
    wheelbase: fig ? (motor ? fig.wheelbaseMotor.value : fig.wheelbaseTrailer.value) : FIGURES.bogieWheelbase.value,
    track: FIGURES.gauge.value,
    motor,
    diesel: family === 'adelante',
    style: BOGIE_STYLE[family],
  };
}

const seen = new Map<string, { pose: Pose; spec: BogieSpec; pixels: Record<BogiePart, number> }>();
/** What V07 shows of the bogie the planner picked: the planner's pose, the bogie it looks at, and the pixels each part fills (each is worked out once). */
function v07(kind: TrainKind, motor: boolean): { pose: Pose; spec: BogieSpec; pixels: Record<BogiePart, number> } {
  const key = `${kind}/${motor}`;
  const done = seen.get(key);
  if (done) return done;
  const suffix = motor ? 'bogie-motor' : 'bogie-trailer';
  const pose = framing.planCatalogueViews(capture.describeFormation(kind)).find((v) => v.suffix === suffix);
  assert.ok(pose && pose.status === 'OK', `${kind} has a ${suffix} view`);
  const { width, height } = framing.CATALOGUE.viewport;
  assert.ok(width === 1600 && height === 1000, `the frame is ${width} x ${height}`);
  const layout = trainLayout(kind);
  const car = layout.cars[pose.car.index] as Car;
  const k = pose.notes.bogie;
  const spec = specOf(kind, car, k);
  assert.equal(spec.motor, motor, `${kind}: the ${suffix} view looks at a ${motor ? 'motor' : 'trailer'} bogie`);
  assert.equal(spec.motor, pose.notes.motor);
  // the bogie in question is the one the train builds there, at the planner's z, and it is the geometry drawn here: the same triangles, to the float
  const g = buildTrain(kind);
  g.updateMatrixWorld(true);
  const bogie = (g.getObjectByName(`car-${car.index}`) as THREE.Object3D).getObjectByName(`bogie-${car.index}-${k}`) as THREE.Object3D;
  assert.ok(bogie, `${kind}: car ${car.index} has bogie ${k}`);
  assert.ok(Math.abs(new THREE.Vector3().setFromMatrixPosition(bogie.matrixWorld).z - pose.notes.z) < 1e-6, `${kind}: the bogie stands at the z the planner looks at`);
  const near = ((bogie.getObjectByName('bogie-lod') as THREE.LOD).levels[0] as unknown as { object: THREE.Mesh }).object.geometry.getAttribute('position').array;
  const drawn = bogieSoup(spec).pos;
  assert.equal(near.length, drawn.length, `${kind}: the built bogie has the triangles drawn here`);
  assert.ok(
    drawn.every((v, i) => near[i] === Math.fround(v)),
    `${kind}: the built ${suffix} geometry is not what this test draws`,
  );
  const eye = [pose.eye[0], pose.eye[1], pose.eye[2] - pose.notes.z] as V3;
  const target = [pose.target[0], pose.target[1], pose.target[2] - pose.notes.z] as V3;
  const result = { pose, spec, pixels: pixelsOf(spec, eye, target, pose.fov, width, height) };
  seen.set(key, result);
  return result;
}

/**
 * Per kind: the motor bogie's drive (motors, gear cases, cardan shafts and final drives) and the trailer bogie's brake units, each as the pixels it fills at V07. The floors sit about
 * 12% under what the model draws; round 4's bogies, measured the same way, drew 11,244 (the AT300), 19,672 (Electrostar), 5,372 (Siemens) and 13,368 (Class 180) pixels of drive and
 * no brake units at all (the trailer's brakes were its discs, which a wheel hides from the side). The drive floors stand over those, so a bogie drawn back to round 4's fails them.
 * The Siemens' beam is an inside frame plate hanging to 0.25 m, which hides most of a motor, and the AT300's deep beam hides the top of one; the lower Siemens floor is for that.
 * CHANGED (round 6; the AT300's (lner5) floors were 13,200 pixels of drive and 10,000 of brake units): the AT300's bogie is traced from the photograph of a trailer bogie and draws no drive and no
 * brake unit, on a motor car or a trailer car (`train-bogie-trace.test.ts`), so it has its own test below, and these are the other makers'.
 * CHANGED (round 6, the second frame traced; the 387's floors were 20,800 pixels of drive and 11,800 of brake units): the Electrostar's frame is traced from its photographs, of a powered bogie among them,
 * which show nothing hung between the wheels, so the 387's motor bogie and trailer bogie are the one bogie too (`train-bogie-trace-electrostar.test.ts`), with a test of its own below.
 * CHANGED (round 6, the third frame traced; the 717's and the 700's floors were 5,900 pixels of drive and 5,900 of brake units): the Desiro City's frame is traced from the photograph of a bogie under a motor
 * car's number, which shows castings, an air spring, a rod, dampers and a yaw damper and no motor, gearbox or brake unit between the wheels, so the 717's and the 700's motor bogie and trailer bogie are the one
 * bogie too (`train-bogie-trace-siemens.test.ts`), with a test of its own below. The Class 180's was the one kind left that drew a drive and brake units.
 * CHANGED (round 7, the fourth frame traced; the Class 180's floors were 17,600 pixels of drive and 13,000 of brake units): the Class 180's frame is traced from a photograph of its cab-end bogie
 * (`train-bogie-trace-coradia.test.ts`). It shows no brake unit hung between the wheels (so the trailer bogie draws none: the test below that held it to 13,000 pixels of them now holds it to none, and
 * the Class 180 has a test of its own like the other three), and its deep side plate hangs to 0.398 m, which hides the upper part of the diesel's final drive from the side: the motor bogie's drive (an
 * ASSUMED shape, the diesel kit's) fills 13,472 pixels now, not the 20,000 or so it filled behind the old frame. The floor is not 12% under what the model draws, as the others' are, but 13,400: over
 * the 13,368 pixels that round 4's bogie drew, as every drive floor here is, so a drive drawn back to round 4's size fails it, and so does one that the plate has swallowed.
 */
const CASES: { kind: TrainKind; drive: number }[] = [{ kind: 'gc180x5', drive: 13_400 }];

test('V07 motor bogie: the drive fills the pixels the floor asks of it, on every kind, and a trailer bogie draws none', () => {
  for (const { kind, drive } of CASES) {
    const motor = v07(kind, true);
    const trailer = v07(kind, false);
    assert.ok(motor.pixels.drive >= drive, `${kind}: ${motor.pixels.drive} pixels of motors and gear cases at V07 (the floor is ${drive})`);
    assert.equal(trailer.pixels.drive, 0, `${kind}: a trailer bogie carries no drive (${trailer.pixels.drive} pixels)`);
  }
});

// CHANGED (round 7; this held the Class 180's trailer bogie to 13,000 pixels of brake units hung between its wheels, ASSUMED shapes): the Class 180's frame is traced from a photograph of its cab-end bogie,
// which shows no brake unit between the wheels, so the trailer bogie draws none, as the AT300's, the Electrostar's and the Desiro City's trailer bogies draw none (their tests, below). What it is held to
// now is that: the trailer's brakes are the motor bogie's, the discs and callipers on the axles, which a wheel hides from the side.
test('V07 trailer bogie: the Class 180\'s trailer bogie draws no brake unit between its wheels (its photograph shows none), only the discs and callipers a motor bogie has', () => {
  for (const { kind } of CASES) {
    const motor = v07(kind, true);
    const trailer = v07(kind, false);
    assert.equal(bogieParts(trailer.spec).brakes.pos.length, bogieParts(motor.spec).brakes.pos.length, `${kind}: the trailer bogie's brakes are the motor bogie's triangles, with no brake unit besides`);
    for (const [role, one] of [['motor', motor], ['trailer', trailer]] as const) {
      assert.ok(one.pixels.brakes < 300, `${kind}: ${one.pixels.brakes} pixels of brakes on the ${role} bogie at V07: a brake unit hangs there`);
    }
  }
});

test('V07 Class 180 bogie: the traced frame and the springs fill the pixels the floor asks of them, on a motor bogie and a trailer bogie, which differ by the drive alone', () => {
  const motor = v07('gc180x5', true);
  const trailer = v07('gc180x5', false);
  // (the frame, the springs, the wheels, the axles and the brakes are the one bogie's: the motor bogie has the diesel's final drive besides)
  for (const part of ['wheels', 'axles', 'brakes', 'frame', 'springs'] as const) assert.deepEqual(bogieParts(motor.spec)[part].pos, bogieParts(trailer.spec)[part].pos, `a motor bogie's ${part} are a trailer's`);
  // the floors sit about 12% under what the model draws (154,296 pixels of frame and 18,672 of spring on each bogie, in a 1600 x 1000 frame): the deep side plate with its window, the axle boxes with their
  // housings and caps, the dampers, the calliper blocks, the bracket, the yaw damper, the bar under it, and the primary springs and the air spring
  for (const [role, one] of [['motor', motor], ['trailer', trailer]] as const) {
    assert.ok(one.pixels.frame >= 135_000, `${one.pixels.frame} pixels of frame on the ${role} bogie at V07 (the floor is 135,000)`);
    assert.ok(one.pixels.springs >= 16_400, `${one.pixels.springs} pixels of springs on the ${role} bogie at V07 (the floor is 16,400)`);
  }
});

test('V07 AT300 bogie: a motor car\'s bogie and a trailer car\'s are the one bogie the photograph shows, with no drive and no brake unit, and its frame fills the pixels the floor asks of it', () => {
  const motor = v07('lner5', true);
  const trailer = v07('lner5', false);
  assert.equal(motor.pixels.drive, 0, `a motor car's AT300 bogie draws no drive (${motor.pixels.drive} pixels)`);
  assert.equal(trailer.pixels.drive, 0, `a trailer car's AT300 bogie draws no drive (${trailer.pixels.drive} pixels)`);
  assert.deepEqual(trailer.pixels, motor.pixels, 'and no brake unit: every part fills the same pixels on both');
  // the floors sit about 12% under what the model draws (162,296 pixels of frame and 14,796 of spring, in a 1600 x 1000 frame): the side beam with its bracket, step and boxes, and the springs and the air spring
  assert.ok(motor.pixels.frame >= 142_000, `${motor.pixels.frame} pixels of frame at V07 (the floor is 142,000)`);
  assert.ok(motor.pixels.springs >= 13_000, `${motor.pixels.springs} pixels of springs at V07 (the floor is 13,000)`);
});

test('V07 Desiro City bogie: a motor car\'s bogie and a trailer car\'s are the one bogie the photograph shows, with no drive and no brake unit, and its castings and air spring fill the pixels the floor asks of them, on the 717 and the 700', () => {
  for (const kind of ['gn717x6', 'tl700x8'] as const) {
    const motor = v07(kind, true);
    const trailer = v07(kind, false);
    assert.equal(motor.pixels.drive, 0, `${kind}: a motor car's Desiro City bogie draws no drive (${motor.pixels.drive} pixels)`);
    assert.equal(trailer.pixels.drive, 0, `${kind}: a trailer car's Desiro City bogie draws no drive (${trailer.pixels.drive} pixels)`);
    // no brake unit: the trailer's brakes are the motor bogie's, the discs and callipers on the axles (240 triangles), which a wheel hides from the side, so each fills a few dozen pixels and not the
    // thousands a brake unit hung between the wheels does (the 180's floor is 13,000). The two differ by a few pixels because the trailer bogie's wheels stand 5 cm nearer (2.1 m against 2.2 m)
    assert.equal(bogieParts(trailer.spec).brakes.pos.length, bogieParts(motor.spec).brakes.pos.length, `${kind}: the trailer bogie's brakes are the motor bogie's triangles, with no brake unit besides`);
    for (const [role, one] of [['motor', motor], ['trailer', trailer]] as const) {
      assert.ok(one.pixels.brakes < 300, `${kind}: ${one.pixels.brakes} pixels of brakes on the ${role} bogie at V07: a brake unit hangs there`);
    }
    // the floors sit about 12% under what the model draws (54,612 pixels of frame on the motor bogie and 52,196 on the trailer's, and 12,644 of spring on each, in a 1600 x 1000 frame): the castings, the
    // rod, the dampers, the yaw damper and the bracket, and the air spring. The wheels of the shorter trailer bogie hide a little more of the castings.
    for (const [role, one] of [['motor', motor], ['trailer', trailer]] as const) {
      assert.ok(one.pixels.frame >= 45_900, `${kind}: ${one.pixels.frame} pixels of frame on the ${role} bogie at V07 (the floor is 45,900)`);
      assert.ok(one.pixels.springs >= 11_100, `${kind}: ${one.pixels.springs} pixels of springs on the ${role} bogie at V07 (the floor is 11,100)`);
    }
  }
});

test('V07 Electrostar bogie: a motor car\'s bogie and a trailer car\'s are the one bogie the photographs show, with no drive and no brake unit, and its frame and air spring fill the pixels the floor asks of them', () => {
  const motor = v07('gn387x4', true);
  const trailer = v07('gn387x4', false);
  assert.equal(motor.pixels.drive, 0, `a motor car's Electrostar bogie draws no drive (${motor.pixels.drive} pixels)`);
  assert.equal(trailer.pixels.drive, 0, `a trailer car's Electrostar bogie draws no drive (${trailer.pixels.drive} pixels)`);
  assert.deepEqual(trailer.pixels, motor.pixels, 'and no brake unit: every part fills the same pixels on both');
  // the floors sit about 12% under what the model draws (127,544 pixels of frame and 26,360 of spring, in a 1600 x 1000 frame): the side beam with its seats, arms, housings, lug, shelf and shoe beam, and the
  // packs and the air spring
  assert.ok(motor.pixels.frame >= 112_000, `${motor.pixels.frame} pixels of frame at V07 (the floor is 112,000)`);
  assert.ok(motor.pixels.springs >= 23_000, `${motor.pixels.springs} pixels of springs at V07 (the floor is 23,000)`);
});
