// The raked face of a cab (web/src/train-nose.ts `NoseRake`, the Class 180's): the loft is sheared along z so that the whole front of the cab leans back, the face a plane tilted
// about 20 degrees off the vertical and the windscreen over it steeper than it was. The shear keeps every ring's x and y (the front view, the plan and the roof line are the knots'
// own), adds no triangle, and everything laid on the nose (the face's shapes, the coupler, the lamps, the glass, the post, the wipers, the roof fittings) follows it.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import type { Car } from '../../core/train.ts';
import { ASSUMED, bodySpec, buildTrain, carSection, END_GAP } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { liveryFor } from '../src/train-livery.ts';
import { eggSection, halfAt, loopFromHalf, normalised, rakeEase, rakeLean, rakeLeanSlope, rakeSet, ringAt, yAtX } from '../src/train-nose.ts';
import type { NoseRake } from '../src/train-nose.ts';

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const FAMILIES = ['at300', 'electrostar', 'desiro', 'desiro700', 'adelante'] as const;
const nose = bodySpec('adelante').nose;
const rake = nose.rake as NoseRake;

/** The triangles of a mesh in train coordinates (the cars are not moved). */
function triangles(mesh: THREE.Mesh): [THREE.Vector3, THREE.Vector3, THREE.Vector3][] {
  const p = mesh.geometry.getAttribute('position');
  const v = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
  const out: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i + 2 < p.count; i += 3) out.push([v(i), v(i + 1), v(i + 2)]);
  return out;
}
const faceNormal = (t: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 => new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0])).normalize();
const areaOf = (t: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): number => new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0])).length() / 2;
const part = (g: THREE.Object3D, car: Car, name: string): THREE.Mesh => {
  const mesh = g.getObjectByName(`car-${car.index}`)?.getObjectByName(name);
  assert.ok(mesh, `car ${car.index} has no ${name}`);
  return mesh as THREE.Mesh;
};
const endCabs = (layout: ReturnType<typeof trainLayout>): Car[] => layout.cars.filter((c) => c.cab && (c.index === 0 || c.index === layout.cars.length - 1));
/** Which way along z a cab's face looks: -1 at the front of a train (it runs along +z), +1 at its rear. */
const outwards = (car: Car): number => (car.cab === 'front' ? -1 : 1);
/** The train, built with the 180's rake and (lazily, once) without it: the same spec with its rake taken off for the one build and put back. */
const raked = buildTrain('gc180x5');
raked.updateMatrixWorld(true);
let plainTrain: THREE.Group | undefined;
function plain(): THREE.Group {
  if (!plainTrain) {
    const spec = bodySpec('adelante').nose as { rake?: NoseRake };
    const had = spec.rake;
    delete spec.rake;
    try {
      plainTrain = buildTrain('gc180x5');
      plainTrain.updateMatrixWorld(true);
    } finally {
      spec.rake = had;
    }
  }
  return plainTrain;
}

test('Class 180 rake: the lean is the spec\'s at the tip, falls as (1 - s / reach) squared to nothing at the reach, and sets back only what stands over its foot', () => {
  assert.deepEqual(rake, { lean: 0.36, from: 0.64, reach: 1.6 });
  // the foot is at or under the lowest point of the loft at the chin, so nothing is drawn forward of the tip
  assert.ok(rake.from <= ringAt(nose, 0).bottom + 1e-9 + 0.05, `the foot ${rake.from} m is under the chin ${ringAt(nose, 0).bottom} m`);
  near(rakeLean(nose, 0), 0.36, 1e-12, 'the lean at the tip');
  near(rakeLean(nose, -0.2), 0.36, 1e-12, 'no more than the tip\'s in front of it');
  near(rakeLean(nose, 0.8), 0.36 * 0.25, 1e-12, 'a quarter of it half way to the reach');
  near(rakeLean(nose, 0.4), 0.36 * 0.5625, 1e-12, 'and (3/4) squared of it a quarter of the way');
  assert.equal(rakeLean(nose, 1.6), 0, 'gone at the reach');
  assert.equal(rakeLean(nose, 2.5), 0, 'and past it');
  assert.equal(rakeEase({ lean: 1, from: 0, reach: 2 }, 1), 0.25);
  let last = Infinity;
  for (let s = 0; s <= 1.6; s += 0.05) {
    const k = rakeLean(nose, s);
    assert.ok(k < last, `the lean falls with s at ${s.toFixed(2)}`);
    last = k;
  }
  // what stands under the foot is not set back, and what stands over it is by the lean times how far over
  assert.equal(rakeSet(nose, 0, 0.64), 0);
  assert.equal(rakeSet(nose, 0, 0.3), 0, 'nothing under the foot');
  near(rakeSet(nose, 0, 2.64), 0.72, 1e-12, 'the face, 2 m over the foot, is set back 0.72 m');
  near(rakeSet(nose, 0.8, 2.64), 0.18, 1e-12, 'a quarter of that half way to the reach');
  assert.equal(rakeSet(nose, 1.7, 3), 0, 'and none past it');
  // the slope is the lean's derivative, never positive, and gone with it
  for (let s = 0.1; s < 1.5; s += 0.1) {
    const h = 1e-6;
    const slope = rakeLeanSlope(nose, s);
    near(slope, (rakeLean(nose, s + h) - rakeLean(nose, s - h)) / (2 * h), 1e-6, `the lean's slope at ${s.toFixed(1)}`);
    assert.ok(slope < 0, `falling at ${s.toFixed(1)}`);
  }
  near(rakeLeanSlope(nose, 0), -2 * 0.36 / 1.6, 1e-12, 'the slope at the tip');
  assert.equal(rakeLeanSlope(nose, 1.6), 0);
  assert.equal(rakeLeanSlope(nose, 3), 0);
  // no other family has a rake: the same functions give 0 for them
  for (const f of FAMILIES.filter((fam) => fam !== 'adelante')) {
    const other = bodySpec(f).nose;
    assert.equal(other.rake, undefined, `${f}: a rake`);
    for (const s of [0, 0.5, 1.2]) assert.deepEqual([rakeLean(other, s), rakeLeanSlope(other, s), rakeSet(other, s, 3)], [0, 0, 0], `${f}: set back at ${s}`);
  }
});

test('Class 180 rake: the shear never folds the loft: every line of the nose at one x goes back as it goes along, by at least a fifth of its length', () => {
  const spec = bodySpec('adelante');
  const sec = carSection(spec);
  const norm = normalised(sec);
  const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
  const zAt = (x: number, s: number): number => {
    const y = yAtX(halfAt(sec, norm, egg, ringAt(spec.nose, s)), x);
    return s + rakeSet(spec.nose, s, y);
  };
  const step = 0.01;
  for (const x of [0, 0.3, 0.6, 0.9]) {
    let worst = Infinity;
    for (let s = 0; s + step <= spec.nose.length; s += step) worst = Math.min(worst, (zAt(x, s + step) - zAt(x, s)) / step);
    assert.ok(worst > 0.2, `the line at x = ${x} goes back only ${worst.toFixed(3)} m a metre of its length at the worst`);
  }
});

test('Class 180 rake: the raked cab is the unraked cab sheared along z: the same triangles, every vertex at the same x and y, set back by rakeSet at its place along the nose', () => {
  const layout = trainLayout('gc180x5');
  const front = layout.cars[0] as Car;
  for (const name of ['body-shell', 'body-detail', 'cab-glass']) {
    for (const car of endCabs(layout)) {
      const a = (part(raked, car, name).geometry.getAttribute('position') as THREE.BufferAttribute).count;
      const b = (part(plain(), car, name).geometry.getAttribute('position') as THREE.BufferAttribute).count;
      assert.ok(a === b, `car ${car.index}'s ${name}: ${a} vertices raked, ${b} not: the rake adds no triangle`);
    }
  }
  // the loft's own vertices that the shell holds (the nose's first half metre is in the detail mesh, with the face): along the front cab, each is set back by the rake at its own place
  // (the plain loft's distance from the tip, with the face END_GAP back)
  const pr = part(raked, front, 'body-shell').geometry.getAttribute('position') as THREE.BufferAttribute;
  const pp = part(plain(), front, 'body-shell').geometry.getAttribute('position') as THREE.BufferAttribute;
  let moved = 0;
  let most = 0;
  for (let i = 0; i < pr.count; i++) {
    near(pr.getX(i), pp.getX(i), 2e-5, `vertex ${i}: across`);
    near(pr.getY(i), pp.getY(i), 2e-5, `vertex ${i}: up`);
    const want = rakeSet(nose, pp.getZ(i) - END_GAP, pp.getY(i));
    near(pr.getZ(i) - pp.getZ(i), want, 3e-5, `vertex ${i} (y = ${pp.getY(i).toFixed(3)}, ${(pp.getZ(i) - END_GAP).toFixed(3)} m from the tip): set back`);
    if (want > 1e-4) moved++;
    most = Math.max(most, pr.getZ(i) - pp.getZ(i));
  }
  assert.ok(moved > 100, `${moved} vertices of the shell were set back`);
  assert.ok(most > 0.2 && most < 0.4, `the shell\'s vertices are set back by up to ${most.toFixed(3)} m`);
  // and the rear cab leans the other way: toward the front of the train, by the same
  const rear = layout.cars[layout.cars.length - 1] as Car;
  const rr = part(raked, rear, 'body-shell').geometry.getAttribute('position') as THREE.BufferAttribute;
  const rp = part(plain(), rear, 'body-shell').geometry.getAttribute('position') as THREE.BufferAttribute;
  let back = 0;
  for (let i = 0; i < rr.count; i++) back = Math.max(back, rp.getZ(i) - rr.getZ(i));
  near(back, most, 1e-4, 'the rear cab is set back as far, toward the front of the train');
});

test('Class 180 rake: the cars between the cabs are not raked: their shell and detail are the unraked build\'s, vertex for vertex', () => {
  const layout = trainLayout('gc180x5');
  for (const car of layout.cars.filter((c) => !c.cab)) {
    for (const name of ['body-shell', 'body-detail']) {
      const a = part(raked, car, name).geometry.getAttribute('position') as THREE.BufferAttribute;
      const b = part(plain(), car, name).geometry.getAttribute('position') as THREE.BufferAttribute;
      assert.ok(a.count === b.count, `car ${car.index}'s ${name}: ${a.count} vertices raked, ${b.count} not`);
      let moved = 0;
      for (let i = 0; i < a.count; i++) if (a.getX(i) !== b.getX(i) || a.getY(i) !== b.getY(i) || a.getZ(i) !== b.getZ(i)) moved++;
      assert.ok(moved === 0, `car ${car.index}'s ${name}: ${moved} vertices moved by a rake that is for the cabs`);
    }
  }
});

test('Class 180 rake: every shading normal of a cab agrees with its triangle\'s winding: none points into the car (the loft\'s normals are turned out from the sheared rings\' centres)', () => {
  const layout = trainLayout('gc180x5');
  for (const car of endCabs(layout)) {
    for (const name of ['body-shell', 'body-detail', 'cab-glass']) {
      const mesh = part(raked, car, name);
      const normals = mesh.geometry.getAttribute('normal');
      let against = 0;
      let first = '';
      triangles(mesh).forEach((t, k) => {
        if (areaOf(t) < 1e-10) return;
        const n = faceNormal(t);
        for (let j = 0; j < 3; j++) {
          if (n.dot(new THREE.Vector3().fromBufferAttribute(normals, 3 * k + j)) < 0) {
            against++;
            if (!first) first = `(${(t[j] as THREE.Vector3).x.toFixed(2)}, ${(t[j] as THREE.Vector3).y.toFixed(2)}, ${(t[j] as THREE.Vector3).z.toFixed(2)})`;
          }
        }
      });
      assert.ok(against === 0, `car ${car.index}'s ${name}: ${against} vertex normals point against their triangle's winding, the first at ${first}`);
    }
  }
});

/** The least a lengthened rake may set the cab side windows back by, somewhere, for the test below to tell a set-back from none: five times its tolerance (20 mm). */
const SET_BACK_MIN = 0.1;

test('Class 180 rake: whatever the rake\'s reach, the cab side windows are set back with the nose they lie on', () => {
  // The 180's rake (1.6 m) has gone before its side windows begin (about 2.9 m back), so on it the windows could not tell a set-back from none: lengthen it for one build, as for a nose
  // whose windows the rake reaches. Each vertex of a side window then stands where the unraked build had it, set back by the rake at its own place (a pane stands 16 mm off the nose
  // along a normal that the shear tilts a little, so a couple of centimetres either way). How far to lengthen it is worked out from where the windows are, not a figure to go stale
  // when they move (round 6 moved them 1.1 m back: the 3 m reach that had set them back 11 cm set them back 1.7 mm, under the tolerance, and the test passed with the set-back taken
  // out): the reach grows until the rake sets some vertex of the windows back by SET_BACK_MIN. (The windscreen's outer corners are as wide as the side window, and the 180's own rake
  // already sets them back by 40 cm: a vertex is the side window's only if it is that wide and lies at or past the window's front edge, which the screen's back edge is well clear of.)
  const car = trainLayout('gc180x5').cars[0] as Car;
  const b = part(plain(), car, 'cab-glass').geometry.getAttribute('position') as THREE.BufferAttribute;
  const side = bodySpec('adelante').glass.side as { sFront0: number; sFront1: number };
  const sideAt = (i: number): boolean => Math.abs(b.getX(i)) >= 1.15 && b.getZ(i) - END_GAP >= Math.min(side.sFront0, side.sFront1) - 0.05;
  const windows: [number, number][] = []; // each side-window vertex's distance from the tip and its height: what a set-back depends on
  for (let i = 0; i < b.count; i++) if (sideAt(i)) windows.push([b.getZ(i) - END_GAP, b.getY(i)]);
  assert.ok(windows.length > 500, `${windows.length} vertices of the side windows`);
  const setBackMost = (reach: number): number => Math.max(0, ...windows.map(([s, y]) => rakeSet({ ...nose, rake: { ...rake, reach } }, s, y)));
  let lengthened = rake.reach;
  while (setBackMost(lengthened) < SET_BACK_MIN) {
    lengthened += 0.25;
    assert.ok(lengthened <= 30, 'no reach of up to 30 m sets the side windows back by SET_BACK_MIN');
  }
  const had = rake.reach;
  const longer = nose.rake as { reach: number };
  longer.reach = lengthened;
  try {
    const g = buildTrain('gc180x5');
    g.updateMatrixWorld(true);
    const a = part(g, car, 'cab-glass').geometry.getAttribute('position') as THREE.BufferAttribute;
    assert.ok(a.count === b.count, `${a.count} vertices raked, ${b.count} not`);
    let checked = 0;
    let most = 0;
    for (let i = 0; i < b.count; i++) {
      if (!sideAt(i)) continue;
      const want = rakeSet(nose, b.getZ(i) - END_GAP, b.getY(i));
      near(a.getZ(i) - b.getZ(i), want, 0.02, `a side window vertex at (${b.getX(i).toFixed(2)}, ${b.getY(i).toFixed(2)}, ${b.getZ(i).toFixed(2)}) with the rake lengthened to ${lengthened} m`);
      checked++;
      most = Math.max(most, want);
    }
    assert.ok(checked > 500, `${checked} vertices of the side windows`);
    assert.ok(most >= SET_BACK_MIN - 1e-9, `the longer rake (${lengthened} m) sets the windows back as much as ${most.toFixed(3)} m: not enough to tell`);
  } finally {
    longer.reach = had;
  }
});

test('Class 180 rake: the face is a plane leaning back at the spec\'s lean, its shading normal tilted up by it, at both ends of the train', () => {
  const layout = trainLayout('gc180x5');
  const lean = rake.lean;
  near(Math.atan(lean) * 180 / Math.PI, 19.8, 0.1, 'about 20 degrees off the vertical');
  const tilt = new THREE.Vector3(0, lean, 1).normalize();
  for (const car of endCabs(layout)) {
    const out = outwards(car);
    const end = car.cab === 'front' ? car.start : car.end;
    const mesh = part(raked, car, 'body-detail');
    const normals = mesh.geometry.getAttribute('normal');
    const colours = mesh.geometry.getAttribute('color');
    const c = col(liveryFor('gc180x5').noseFront);
    // the face\'s cap: the triangles in the livery's front colour that lie on the leaning plane, END_GAP behind the end of the car at the foot and leaning back with height (the loft\'s
    // first band round the face is in the same colour, nearly facing out too, but it is not on the plane; the 3D coupler\'s base faces the other way)
    const onPlane = (v: THREE.Vector3): boolean => Math.abs((v.z - end) * -out - (END_GAP + lean * Math.max(0, v.y - rake.from))) < 3e-5;
    let cap = 0;
    let flat = 0;
    triangles(mesh).forEach((t, k) => {
      const hit = (i: number): boolean => Math.abs(colours.getX(i) - c.r) < 1e-5 && Math.abs(colours.getY(i) - c.g) < 1e-5 && Math.abs(colours.getZ(i) - c.b) < 1e-5;
      if (!(hit(3 * k) && hit(3 * k + 1) && hit(3 * k + 2)) || !t.every(onPlane)) return;
      const n = faceNormal(t);
      cap++;
      flat += areaOf(t) * Math.abs(n.z);
      // the face\'s own normal: up by the lean, out of the end of the train
      near(n.y, tilt.y, 1e-3, `car ${car.index}: the face tilts up`);
      near(n.z * out, tilt.z, 1e-3, `car ${car.index}: and out`);
      // the shading normals are that same one
      for (let j = 0; j < 3; j++) {
        const sn = new THREE.Vector3().fromBufferAttribute(normals, 3 * k + j);
        assert.ok(sn.distanceTo(new THREE.Vector3(0, tilt.y, tilt.z * out)) < 1e-5, `car ${car.index}: the cap is shaded with (${sn.x.toFixed(3)}, ${sn.y.toFixed(3)}, ${sn.z.toFixed(3)})`);
      }
    });
    // all of the tip ring\'s outline, seen from the front
    const spec = bodySpec('adelante');
    const sec = carSection(spec);
    const norm = normalised(sec);
    const ring = loopFromHalf(halfAt(sec, norm, eggSection(norm, spec.nose.widest, spec.nose.boxiness), ringAt(spec.nose, 0)));
    let whole = 0;
    ring.forEach(([x, y], i) => {
      const [u, w] = ring[(i + 1) % ring.length] as [number, number];
      whole += (x * w - u * y) / 2;
    });
    assert.ok(cap >= 20, `car ${car.index}: ${cap} triangles of cap`);
    near(flat, Math.abs(whole), 1e-4, `car ${car.index}: the cap fills the face\'s outline, seen from the front`);
  }
});

test('Class 180 rake: the windscreen is about 34 degrees to the road, 8 to 11 degrees steeper than the unraked one was, and its foot stands back half a metre', () => {
  const layout = trainLayout('gc180x5');
  const car = layout.cars[0] as Car;
  const pitch = (g: THREE.Object3D): { degrees: number; foot: number } => {
    const mean = new THREE.Vector3();
    let foot = Infinity;
    for (const t of triangles(part(g, car, 'cab-glass')).filter((tri) => tri.every((v) => Math.abs(v.x) < 1.15))) {
      mean.add(faceNormal(t).multiplyScalar(areaOf(t)));
      for (const v of t) foot = Math.min(foot, v.z);
    }
    mean.normalize();
    // the angle of the pane to the road: 0 for a flat roof, 90 for an upright front
    return { degrees: (Math.acos(mean.y) * 180) / Math.PI, foot };
  };
  const was = pitch(plain());
  const now = pitch(raked);
  // CHANGED (round 6): these were 47 +/- 3 degrees and 12 to 17 steeper than the unraked pane, which came from the knots of the earlier nose (ASSUMED: 33 degrees without the lean).
  // The roof line is now fitted to the side-on photograph 180109 (a Class 180's profile: the glass is a straight line from the roof down to the base of the screen), and its pane is
  // 34 degrees to the road, 24.5 without the rake: 9.5 degrees less from the lean. The lean itself (about 20 degrees, NoseRake) is unchanged, and so is the foot, 0.47 m back.
  // Pinned so that a change of the lean or of the roof line's knots is a decision.
  near(now.degrees, 34, 2, `the pane is ${now.degrees.toFixed(1)} degrees to the road`);
  assert.ok(now.degrees - was.degrees > 8 && now.degrees - was.degrees < 11, `the pane is ${was.degrees.toFixed(1)} degrees to the road without the rake and ${now.degrees.toFixed(1)} with it`);
  assert.ok(now.foot - was.foot > 0.4 && now.foot - was.foot < 0.55, `its foot stands ${(now.foot - was.foot).toFixed(2)} m further back`);
});

test('Class 180 rake: the windscreen\'s shading normals follow the sheared surface: four fifths of them are within 4 degrees of their own triangle\'s, and the mean is 3 or under', () => {
  // The glass is a fine patch whose triangles lie on the surface, so a vertex normal from the surface's own formula agrees with the triangle's to a degree or two (a few in the
  // corners, where the rows crowd); a formula for the unsheared nose would be 14 degrees out over the whole pane.
  const layout = trainLayout('gc180x5');
  for (const car of endCabs(layout)) {
    const mesh = part(raked, car, 'cab-glass');
    const normals = mesh.geometry.getAttribute('normal');
    let within = 0;
    let total = 0;
    let sum = 0;
    triangles(mesh).forEach((t, k) => {
      if (!t.every((v) => Math.abs(v.x) < 1.15) || areaOf(t) < 1e-9) return;
      const n = faceNormal(t);
      for (let j = 0; j < 3; j++) {
        const angle = (n.angleTo(new THREE.Vector3().fromBufferAttribute(normals, 3 * k + j)) * 180) / Math.PI;
        total++;
        sum += angle;
        if (angle < 4) within++;
      }
    });
    assert.ok(total > 1000, `car ${car.index}: ${total} vertex normals`);
    assert.ok(within / total > 0.8, `car ${car.index}: ${((100 * within) / total).toFixed(0)}% of the normals are within 4 degrees of their triangle's`);
    assert.ok(sum / total < 3, `car ${car.index}: the normals are ${(sum / total).toFixed(2)} degrees from their triangles' on average`);
  }
});

test('Class 180 rake: the windscreen\'s shading normals as a whole: the median is under 2 degrees from their triangle\'s and nine in ten are within 8', () => {
  // (round 6) A second guard beside the one above, which counts the normals within 4 degrees against four fifths and stands about a point over that: the car's section is a polyline of 13 points,
  // so a pane's columns chord across corners that turn 13 to 20 degrees a segment on the shoulder, and a change to the nose that moves one of them moves that share by a point (it was 79.8%
  // with the glass rows spaced as a cosine spaces them and is 81.2% now). The median and the share within 8 degrees barely feel those corners (1.05 degrees and 97.1% now; 1.08 and 95.6% with the
  // cosine rows), and a formula wrong over the whole pane fails them by a wide margin (9.3 degrees and 39.7% with the lean's fall left out of it, 8.9 and 40.3% with no lean at all).
  const layout = trainLayout('gc180x5');
  for (const car of endCabs(layout)) {
    const mesh = part(raked, car, 'cab-glass');
    const normals = mesh.geometry.getAttribute('normal');
    const angles: number[] = [];
    triangles(mesh).forEach((t, k) => {
      if (!t.every((v) => Math.abs(v.x) < 1.15) || areaOf(t) < 1e-9) return;
      const n = faceNormal(t);
      for (let j = 0; j < 3; j++) angles.push((n.angleTo(new THREE.Vector3().fromBufferAttribute(normals, 3 * k + j)) * 180) / Math.PI);
    });
    angles.sort((a, b) => a - b);
    assert.ok(angles.length > 1000, `car ${car.index}: ${angles.length} vertex normals`);
    const median = angles[Math.floor(angles.length / 2)] as number;
    assert.ok(median < 2, `car ${car.index}: the median normal is ${median.toFixed(2)} degrees from its triangle's`);
    const within = angles.filter((a) => a < 8).length / angles.length;
    assert.ok(within > 0.9, `car ${car.index}: ${(100 * within).toFixed(1)}% of the normals are within 8 degrees of their triangle's`);
  }
});

test('Class 180 rake: the coupler still reaches the end of the car, and the lamps stand on the leaning face at their own heights', () => {
  const layout = trainLayout('gc180x5');
  for (const car of endCabs(layout)) {
    const out = outwards(car);
    const end = car.cab === 'front' ? car.start : car.end;
    const g = raked;
    // the coupler\'s head: in the detail mesh, between the lamps and under the face, its front exactly at the end of the car
    let reach = -Infinity;
    for (const t of triangles(part(g, car, 'body-detail'))) for (const v of t) if (Math.abs(v.x) < 0.25 && v.y > 0.6 && v.y < 1.1) reach = Math.max(reach, (v.z - end) * out);
    near(reach, 0, 1e-4, `car ${car.index}: the coupler\'s front stands at the end of the car`);
    // the coupler marker: it stands where its barrel meets the leaning face, which is further back than the chin by the lean over the coupler\'s height
    const marker = g.getObjectByName(`car-${car.index}`)?.getObjectByName('nose-coupler');
    assert.ok(marker, `car ${car.index}: a nose coupler`);
    near(marker.userData.reach as number, END_GAP + rake.lean * (ASSUMED.couplerHeight - rake.from), 1e-9, `car ${car.index}: the coupler\'s reach`);
    // the headlight markers: on the face plane at their own height
    const lamps: THREE.Object3D[] = [];
    g.getObjectByName(`car-${car.index}`)?.traverse((o) => {
      if (o.name === 'headlight') lamps.push(o);
    });
    assert.equal(lamps.length, 2, `car ${car.index}: two headlights`);
    for (const l of lamps) {
      const w = l.getWorldPosition(new THREE.Vector3());
      near((w.z - end) * -out, END_GAP + rake.lean * (w.y - rake.from), 1e-6, `car ${car.index}: the headlight at height ${w.y.toFixed(3)} stands on the leaning plane`);
    }
  }
});

test('Class 180 rake: a lamp cluster, or a cab end coupled to another unit, on a raked nose is refused, not drawn off the surface (both are laid on an upright face)', () => {
  const at300 = bodySpec('at300').nose as { rake?: NoseRake };
  at300.rake = { lean: 0.2, from: 0.6, reach: 1.5 };
  try {
    assert.throws(() => buildTrain('lner5'), /lamp cluster on a raked nose/);
  } finally {
    delete at300.rake;
  }
  assert.doesNotThrow(() => buildTrain('lner5'));
  // a 387 runs coupled in pairs (gn387x8 is two units of four): its inner cab ends are coupled
  const electrostar = bodySpec('electrostar').nose as { rake?: NoseRake };
  electrostar.rake = { lean: 0.2, from: 0.6, reach: 1.5 };
  try {
    assert.throws(() => buildTrain('gn387x8'), /coupled cab end on a raked nose/);
    assert.doesNotThrow(() => buildTrain('gn387x4'), 'a single unit has no coupled cab end');
  } finally {
    delete electrostar.rake;
  }
  assert.doesNotThrow(() => buildTrain('gn387x8'));
});
