// The detail of the trains: the lofted nose and its glass, the gangways and couplers, the bogies, the liveries and
// the Great Northern commuter units. Pure geometry: no WebGL and no DOM (the canvas textures are only made in a
// browser, so their sharpness is pinned here by the numbers that size them).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ALL_KINDS, EMU_FIGURES, EMU_KINDS, FIGURES, GC_KINDS, TL_KINDS, TRAIN_KINDS, trainLayout } from '../../core/train.ts';
import type { Car, EmuFamily, Family, TrainKind } from '../../core/train.ts';
import { LIVERIES, ROW_H, TEX_SPAN, TEX_W, atlasRect, atlasTexts, shellMaterial, texelsPerMetre, textEms } from '../src/livery.ts';
import { ASSUMED, BOGIE_STYLE, bodySpec, buildTrain, CAB_SWOOSH, carPlan, carSection, END_GAP, faceSetback, LENS, NOSE_RECESS, underfloorBlocks } from '../src/train.ts';
import { eggSection, filletFactor, halfAt, loopFromHalf, normalised, planProfile, ringAt, ringStations, sideProfile, xAtY, yAtX } from '../src/train-nose.ts';
import { BOGIE_HALF_WIDTH, BOGIE_LOD_DISTANCE, BOGIE_TOP, DISC_RADIUS, DISC_THICKNESS, FAR_WHEEL_SEGMENTS, FLANGE_HEIGHT, WHEEL_SEGMENTS, WHEEL_WIDTH, bogieFarSoup, bogieParts, bogieSoup, bogieStyle, buildBogie, couplerHalf } from '../src/train-parts.ts';
import type { BogieSpec, BogieStyle } from '../src/train-parts.ts';
import { col, ellipse, Soup } from '../src/train-geom.ts';
import { COUPLING_CLEARANCE } from '../src/trains-live.ts';

const WHEEL_HALF = WHEEL_WIDTH / 2;
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const FAMILIES: Family[] = ['at300', 'electrostar', 'desiro', 'desiro700', 'adelante'];
/** The sharpest turn, in degrees, the loft may make across a ring edge: in the fillet round the face, and everywhere else. Set from the measured worst cases (see the nose test). */
const LOFT_FACE_LIMIT = 32;
const LOFT_BODY_LIMIT = 24;
const built = (kind: TrainKind): THREE.Group => {
  const g = buildTrain(kind);
  g.updateMatrixWorld(true);
  return g;
};
const named = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const o = root.getObjectByName(name);
  assert.ok(o, `${root.name} has no ${name}`);
  return o;
};
const all = (root: THREE.Object3D, name: string): THREE.Object3D[] => {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name === name) out.push(o);
  });
  return out;
};
const boxOf = (o: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(o);
const worldPos = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());
const familyOf = (kind: TrainKind): Family => trainLayout(kind).spec.family;
const emuFig = (kind: TrainKind) => EMU_FIGURES[familyOf(kind) as EmuFamily];

/** The triangles of a mesh in train coordinates (the group is at the origin and the cars are not moved). */
function triangles(mesh: THREE.Mesh): [THREE.Vector3, THREE.Vector3, THREE.Vector3][] {
  const p = mesh.geometry.getAttribute('position');
  const v = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
  const out: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i + 2 < p.count; i += 3) out.push([v(i), v(i + 1), v(i + 2)]);
  return out;
}
const faceNormal = (t: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 => new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0])).normalize();
/** A mesh that is a far level of detail: the renderer draws it instead of the near level, never as well, so it adds no draw call and no triangles beside it. */
const isFar = (o: THREE.Object3D): boolean => o.userData.lod === 'far';
/** Triangles in the tree as it is drawn with every bogie near the camera (the far level of detail is counted by its own tests). */
const triCount = (g: THREE.Object3D): number => {
  let n = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !isFar(m)) n += m.geometry.getAttribute('position').count / 3;
  });
  return n;
};

type Tri = [THREE.Vector3, THREE.Vector3, THREE.Vector3];
/** The geometry holds float32s: a place 130 m down a train is only good to about 1.5e-5 m. */
const ZTOL = 3e-5;
/** The triangles of a mesh whose three vertices all carry the vertex colour `hex` (as a train wears it: see `col`), in train coordinates. */
function trisOfColour(mesh: THREE.Mesh, hex: number): Tri[] {
  const want = col(hex);
  const c = mesh.geometry.getAttribute('color');
  const hit = (i: number): boolean => Math.abs(c.getX(i) - want.r) < 1e-5 && Math.abs(c.getY(i) - want.g) < 1e-5 && Math.abs(c.getZ(i) - want.b) < 1e-5;
  return triangles(mesh).filter((_, k) => hit(3 * k) && hit(3 * k + 1) && hit(3 * k + 2));
}
const detailOf = (g: THREE.Object3D, car: Car): THREE.Mesh => named(named(g, `car-${car.index}`), 'body-detail') as THREE.Mesh;
const boxOfTris = (ts: Tri[]): THREE.Box3 => new THREE.Box3().setFromPoints(ts.flat());
const areaOf = (t: Tri): number => new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0])).length() / 2;
/**
 * The plane of a cab's front face, in train coordinates. The face stands NOSE_RECESS behind the end of the car where a cover hides the
 * coupler, END_GAP behind it where the coupler stands out of the face (so the coupler's head reaches the end of the car), and END_GAP
 * behind the joint where two units are coupled. (The rule from the docs of `faceSetback`, written out so a test of the face does not
 * ask the code under test for where it is.)
 */
const facePlane = (car: Car, covered: boolean, interior: boolean): number => {
  const back = interior || !covered ? END_GAP : NOSE_RECESS;
  return car.cab === 'front' ? car.start + back : car.end - back;
};
/** Which way along z a cab's face looks: -1 at the front of a train (it runs along +z), +1 at its rear. */
const outwards = (car: Car): number => (car.cab === 'front' ? -1 : 1);
/** The cab cars at the two ends of a train, not the ones inside a coupled set. */
const endCabs = (layout: ReturnType<typeof trainLayout>): Car[] => layout.cars.filter((c) => c.cab && (c.index === 0 || c.index === layout.cars.length - 1));

// --- the nose --------------------------------------------------------------------------------------

test('nose: the roof line and the plan of every nose rise without a kink: no sample turns the line by more than a few degrees', () => {
  for (const family of FAMILIES) {
    const nose = bodySpec(family).nose;
    const from = nose.fillet + 0.05;
    for (const [label, pts] of [['roof line', sideProfile(nose, 600)], ['plan', planProfile(nose, 1.3, 600)]] as const) {
      const run = pts.filter(([s]) => s >= from);
      let worst = 0;
      for (let i = 1; i < run.length; i++) assert.ok((run[i] as [number, number])[1] >= (run[i - 1] as [number, number])[1] - 1e-9, `${family} ${label} goes back at s = ${(run[i] as [number, number])[0]}`);
      for (let i = 2; i < run.length; i++) {
        const [s0, y0] = run[i - 2] as [number, number];
        const [s1, y1] = run[i - 1] as [number, number];
        const [s2, y2] = run[i] as [number, number];
        worst = Math.max(worst, Math.abs(Math.atan2(y2 - y1, s2 - s1) - Math.atan2(y1 - y0, s1 - s0)));
      }
      // a wedge of three flat facets turns 0.3 rad or more at a knot; a smooth curve sampled 600 times turns about 0.01
      assert.ok(worst < 0.03, `${family} ${label} turns ${worst.toFixed(4)} rad in one step`);
    }
  }
});

test('nose: the front edge is rounded by a quarter circle that leaves the face square-on and joins the sides without a step', () => {
  for (const family of FAMILIES) {
    const nose = bodySpec(family).nose;
    near(filletFactor(nose, nose.fillet), 1, 1e-12, `${family} full size at the end of the fillet`);
    near(filletFactor(nose, nose.fillet + 1), 1, 1e-12, `${family} full size beyond it`);
    near(filletFactor(nose, 0), 1 - nose.filletLoss, 1e-12, `${family} the face is smaller than the ring behind by the fillet's loss`);
    // zero slope where it meets the sides, vertical slope at the face
    const h = 1e-4;
    assert.ok(Math.abs(filletFactor(nose, nose.fillet) - filletFactor(nose, nose.fillet - h)) < 1e-5, `${family}: the fillet meets the sides at a slope`);
    assert.ok(filletFactor(nose, h) - filletFactor(nose, 0) > 0.002, `${family}: the fillet leaves the face too gently`);
    const tip = ringAt(nose, 0);
    const behind = ringAt(nose, nose.fillet);
    assert.ok(tip.ws < behind.ws && tip.top < behind.top && tip.bottom > behind.bottom, `${family}: the face is smaller than the ring behind it`);
  }
});

test('nose: the section morphs from an egg at the tip to the car section, and the bonnet is lower than the roof', () => {
  for (const family of FAMILIES) {
    const spec = bodySpec(family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    assert.equal(egg.length, norm.length);
    const tip = halfAt(sec, norm, egg, ringAt(spec.nose, 0));
    const end = halfAt(sec, norm, egg, ringAt(spec.nose, spec.nose.length));
    // at the end of the nose the points are the car section's
    sec.half.forEach(([x, y], k) => {
      near((end[k] as [number, number])[0], x, 1e-9, `${family} section point ${k} x at the end of the nose`);
      near((end[k] as [number, number])[1], y, 1e-9, `${family} section point ${k} y at the end of the nose`);
    });
    // the tip is rounded: narrower than the body, and lower
    assert.ok(Math.max(...tip.map((p) => p[0])) < sec.width * 0.9, `${family} tip is as wide as the body`);
    assert.ok(Math.max(...tip.map((p) => p[1])) < sec.crown - 1.0, `${family} tip is not below the roof by a metre`);
    // an egg is wider in the middle than at its two ends
    const widest = Math.max(...tip.map((p) => p[0]));
    assert.ok((tip[0] as [number, number])[0] < widest && (tip[tip.length - 1] as [number, number])[0] < widest, `${family}: the tip section is not egg-shaped`);
  }
});

test('nose: the built nose is smooth: no ring edge of the loft (the surface the cab is lofted on) turns the surface by more than a few degrees', () => {
  for (const kind of ['lner5', 'lumo5', 'hull5', 'gn387x4', 'gn717x6', 'gc180x5', 'tl700x8'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    // the face stands NOSE_RECESS behind the end where a cover hides the coupler, END_GAP where the coupler stands out of it
    const setback = faceSetback(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const stations = ringStations(spec.nose);
    const key = (x: number, y: number, z: number): string => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    for (const car of layout.cars.filter((c) => c.cab)) {
      // the vertices the loft has: every point of every ring of the nose, at its place in the train
      const loft = new Set<string>();
      for (const s of stations) {
        for (const [x, y] of loopFromHalf(halfAt(sec, norm, egg, ringAt(spec.nose, s)))) loft.add(key(x, y, car.cab === 'front' ? car.start + setback + s : car.end - setback - s));
      }
      // every undirected edge in a plane z = const (a ring edge) whose two ends are loft vertices (so not a box or a lamp lying on the nose),
      // with the normals of the triangles on its two sides
      const edges = new Map<string, { normals: THREE.Vector3[]; s: number }>();
      let degenerate = 0;
      for (const part of ['body-shell', 'body-detail']) {
        for (const t of triangles(named(named(g, `car-${car.index}`), part) as THREE.Mesh)) {
          if (new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0])).length() < 1e-9) degenerate++;
          for (let k = 0; k < 3; k++) {
            const a = t[k] as THREE.Vector3;
            const b = t[(k + 1) % 3] as THREE.Vector3;
            if (Math.abs(a.z - b.z) > 1e-6) continue;
            const ka = key(a.x, a.y, a.z);
            const kb = key(b.x, b.y, b.z);
            if (!loft.has(ka) || !loft.has(kb)) continue;
            const id = [ka, kb].sort().join('|');
            const e = edges.get(id) ?? { normals: [], s: car.cab === 'front' ? a.z - car.start - setback : car.end - setback - a.z };
            e.normals.push(faceNormal(t));
            edges.set(id, e);
          }
        }
      }
      assert.equal(degenerate, 0, `${kind} car ${car.index}: ${degenerate} zero-area triangles`);
      let worstFace = 0;
      let worstBody = 0;
      let counted = 0;
      for (const { normals, s } of edges.values()) {
        if (normals.length !== 2) continue;
        counted++;
        const deg = (Math.acos(Math.min(1, Math.max(-1, (normals[0] as THREE.Vector3).dot(normals[1] as THREE.Vector3)))) * 180) / Math.PI;
        if (s < spec.nose.fillet - 1e-3) worstFace = Math.max(worstFace, deg);
        else worstBody = Math.max(worstBody, deg);
      }
      assert.ok(counted > 250, `${kind} car ${car.index}: only ${counted} shared ring edges: is the nose lofted?`);
      // Measured worst cases: 29 degrees in the fillet round the face (six rings turn it through a quarter circle, and the first ring
      // stands 9 mm from the face), 21 degrees past it, where the face turns into the bonnet. A faceted wedge turns 40 or more at every knot.
      assert.ok(worstFace < LOFT_FACE_LIMIT, `${kind} car ${car.index}: a ${worstFace.toFixed(1)} degree edge in the fillet of the face`);
      assert.ok(worstBody < LOFT_BODY_LIMIT, `${kind} car ${car.index}: a ${worstBody.toFixed(1)} degree edge across a ring of the nose`);
    }
  }
});

test('nose: the face stands NOSE_RECESS behind the end of the train (where a cover hides the coupler) and the nose reaches full section where the spec says', () => {
  for (const kind of ['lner5', 'gn387x4', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const front = layout.cars[0] as Car;
    const rear = layout.cars[layout.cars.length - 1] as Car;
    const frontBody = [named(named(g, 'car-0'), 'body-detail'), named(named(g, 'car-0'), 'body-shell')].map(boxOf).reduce((a, b) => a.union(b));
    near(frontBody.min.z, front.start + NOSE_RECESS - 0.006, 0.0061, `${kind} front face`);
    const rearBody = [named(named(g, `car-${rear.index}`), 'body-detail'), named(named(g, `car-${rear.index}`), 'body-shell')].map(boxOf).reduce((a, b) => a.union(b));
    near(rearBody.max.z, rear.end - NOSE_RECESS + 0.006, 0.0061, `${kind} rear face`);
    // The face itself, measured on the drawn nose. The two boxes above cannot tell a cover's face (NOSE_RECESS in, its lenses 1 mm short of the
    // end) from an open recess (the face END_GAP in, but with a coupler drawn out of it that reaches the end): both end within 6 mm of the end
    // plane. The face is the plane that holds most of the flat area facing out of the end of the train, within 0.4 m of that end (the lamps'
    // lenses, their bezels and the cover's seam lie in planes a few millimetres in front of it, with a small part of its area; further back
    // the nose has walls of its own that face out too, and on the narrow Azuma nose they are larger than the face).
    const covered = spec.front.coupler.covered;
    const faceOf = (car: Car): number => {
      const out = outwards(car);
      const end = car.cab === 'front' ? car.start : car.end;
      const planes = new Map<number, { z: number; area: number }>();
      for (const t of triangles(detailOf(g, car))) {
        const inset = (t[0].z - end) * -out;
        if (faceNormal(t).z * out < 0.999 || inset < -0.001 || inset > 0.4 || t.some((v) => Math.abs(v.z - t[0].z) > 1e-4)) continue;
        const plane = planes.get(Math.round(inset * 1000)) ?? { z: t[0].z, area: 0 };
        plane.area += areaOf(t);
        planes.set(Math.round(inset * 1000), plane);
      }
      return [...planes.values()].sort((a, b) => b.area - a.area)[0]?.z ?? Number.NaN;
    };
    near(faceOf(front), facePlane(front, covered, false), ZTOL, `${kind} front face stands ${covered ? 'NOSE_RECESS' : 'END_GAP'} behind the end of the train`);
    near(faceOf(rear), facePlane(rear, covered, false), ZTOL, `${kind} rear face stands ${covered ? 'NOSE_RECESS' : 'END_GAP'} behind the end of the train`);
    // and each end of the train has a cover where the family has one, else the coupler standing out of the face
    for (const car of [front, rear]) {
      assert.equal(all(named(g, `car-${car.index}`), 'coupler-cover').length, covered ? 1 : 0, `${kind} car ${car.index} (${car.cab}): coupler-cover markers`);
      assert.equal(all(named(g, `car-${car.index}`), 'nose-coupler').length, covered ? 0 : 1, `${kind} car ${car.index} (${car.cab}): nose-coupler markers`);
    }
    // at full section: the wall stands at half the body width minus the door relief, over the whole of the car behind the nose
    const shell = named(named(g, 'car-0'), 'body-shell') as THREE.Mesh;
    const behind = triangles(shell).flatMap((t) => t).filter((v) => v.z > front.start + spec.nose.length + 0.5);
    near(Math.max(...behind.map((v) => v.x)), spec.half - 0.02, 1e-6, `${kind} wall half-width behind the nose`);
  }
});

// --- the cab glass --------------------------------------------------------------------------------

test('glass: the windscreen is a raked, curved, wide pane that stands on the outside of the nose, over the bonnet', () => {
  for (const kind of ['lner5', 'lumo5', 'gn387x4', 'gn717x6', 'gc180x5', 'tl700x8'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const car = layout.cars[0] as Car;
    const glass = named(named(g, 'car-0'), 'cab-glass') as THREE.Mesh;
    // the windscreen is the part within a metre of the centre line; the cab side windows are out by the wall
    const screen = triangles(glass).filter((t) => t.every((v) => Math.abs(v.x) < 1.15));
    assert.ok(screen.length > 100, `${kind}: ${screen.length} windscreen triangles: a flat pane has fewer than a curved one`);
    const xs = screen.flatMap((t) => t.map((v) => v.x));
    const ys = screen.flatMap((t) => t.map((v) => v.y));
    const zs = screen.flatMap((t) => t.map((v) => v.z - car.start));
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 1.6 && Math.max(...xs) - Math.min(...xs) < sec.width * 2, `${kind} windscreen width ${Math.max(...xs) - Math.min(...xs)}`);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= 0.7, `${kind} windscreen height`);
    assert.ok(Math.max(...zs) - Math.min(...zs) >= 1.0, `${kind} windscreen reach ${Math.max(...zs) - Math.min(...zs)} m back from the bonnet`);
    assert.ok(Math.min(...zs) >= 0.1, `${kind}: the glass starts on the nose face`);
    assert.ok(Math.min(...ys) > 1.9, `${kind}: the windscreen starts ${Math.min(...ys)} m up, in the bonnet`);
    // raked: it faces forward (the front is -z) and up, area-weighted
    const mean = new THREE.Vector3();
    for (const t of screen) {
      const area = new THREE.Vector3().subVectors(t[1], t[0]).cross(new THREE.Vector3().subVectors(t[2], t[0])).length();
      mean.add(faceNormal(t).multiplyScalar(area));
    }
    mean.normalize();
    assert.ok(mean.z < -0.3 && mean.y > 0.3, `${kind} windscreen normal (${mean.x.toFixed(2)}, ${mean.y.toFixed(2)}, ${mean.z.toFixed(2)}) is not raked`);
    // curved: the two edges of the pane tilt apart (a flat pane has one normal)
    const left = screen.filter((t) => t.every((v) => v.x < -0.5)).map(faceNormal);
    const right = screen.filter((t) => t.every((v) => v.x > 0.5)).map(faceNormal);
    assert.ok(left.length > 10 && right.length > 10);
    const l = left.reduce((a, n) => a.add(n), new THREE.Vector3()).normalize();
    const r = right.reduce((a, n) => a.add(n), new THREE.Vector3()).normalize();
    assert.ok((Math.acos(Math.min(1, l.dot(r))) * 180) / Math.PI > 8, `${kind}: the windscreen is flat across its width`);
    // on the outside: every glass vertex stands above the nose's surface at its own place along it (where the surface is steep, a lift of
    // 16 mm along the normal is a good deal more than 16 mm straight up, so the ceiling is generous), and its normal faces out: up or
    // forward (the front is -z) and never back into the cab (the nose only rises going back, so an outward normal has no +z)
    const normals = glass.geometry.getAttribute('normal');
    const pos = glass.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (Math.abs(v.x) >= 1.15) continue;
      const s = v.z - car.start - faceSetback(layout.spec.family);
      const surface = yAtX(halfAt(sec, norm, egg, ringAt(spec.nose, Math.max(0, Math.min(spec.nose.length, s)))), Math.abs(v.x));
      assert.ok(v.y - surface > 0.0002 && v.y - surface < 0.06, `${kind}: glass ${((v.y - surface) * 1000).toFixed(2)} mm over the nose at x=${v.x.toFixed(2)}, s=${s.toFixed(2)}`);
      const n = new THREE.Vector3().fromBufferAttribute(normals, i);
      assert.ok(n.z <= 0.05 && (n.y > 0.05 || n.z < -0.05), `${kind}: a windscreen vertex whose normal (${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}) faces into the cab`);
    }
  }
});

test('glass: the windscreen is two panes round a post where the cab has one (the 180\'s 10 cm post, the 387\'s and the 717\'s centre doors), one pane across the middle on every other cab', () => {
  // CHANGED (it said only the 180 had a post): gn387_02_387121_ely and GN717-03-717005-Potters-Bar show a full-height door between two
  // windscreens on the 387 and the 717; the Azuma and the 700 (tl700_01_gatwick_front, lner-800-113-newcastle-2025) have one broad pane
  const pillar = Object.fromEntries(FAMILIES.map((f) => [f, bodySpec(f).glass.screen.pillar]));
  assert.deepEqual(pillar, { at300: undefined, electrostar: 0.8, desiro: 0.7, desiro700: undefined, adelante: 0.1 });
  for (const kind of ['lner5', 'gn387x4', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const post = bodySpec(trainLayout(kind).spec.family).glass.screen.pillar ?? 0;
    for (const car of endCabs(trainLayout(kind))) {
      const glass = named(named(g, `car-${car.index}`), 'cab-glass') as THREE.Mesh;
      // the windscreen is the part within 1.15 m of the centre line; the cab side windows are out by the wall
      const xs = triangles(glass).filter((t) => t.every((v) => Math.abs(v.x) < 1.15)).flatMap((t) => t.map((v) => v.x));
      assert.ok(xs.length > 300, `${kind} car ${car.index}: ${xs.length} windscreen vertices`);
      const inner = Math.min(...xs.map(Math.abs));
      if (post > 0) {
        assert.ok(xs.some((x) => x < -post / 2) && xs.some((x) => x > post / 2), `${kind} car ${car.index}: a pane each side of the post`);
        // (the glass stands 2 cm off the nose along its normal, which leans a little out here: a millimetre or two)
        near(inner, post / 2, 0.002, `${kind} car ${car.index}: the glass stops half a post's width from the middle`);
      } else {
        assert.ok(inner < 1e-6, `${kind} car ${car.index}: one pane runs across the middle (the glass comes to ${inner.toFixed(3)} m of it)`);
      }
    }
  }
});

test('glass: the black frame round the windscreen reaches no further out than 0.91 of the nose\'s half-width where it stands, so no wedge of it hangs down the cheek', () => {
  // Out past that the nose falls away so steeply that a frame a few centimetres wider than the glass hung 0.3 m down the cheek of a 700, a black wedge under the pane's corner.
  const FRAME_REACH = 0.91;
  const LIFT = 0.014;
  for (const kind of ['lner5', 'gn387x4', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const want = col(LIVERIES[layout.spec.livery].glass);
    for (const car of endCabs(layout)) {
      const mesh = detailOf(g, car);
      const face = facePlane(car, spec.front.coupler.covered, false);
      const pos = mesh.geometry.getAttribute('position');
      const normal = mesh.geometry.getAttribute('normal');
      const colour = mesh.geometry.getAttribute('color');
      let counted = 0;
      let widest = 0;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(colour.getX(i) - want.r) > 1e-5 || Math.abs(colour.getY(i) - want.g) > 1e-5 || Math.abs(colour.getZ(i) - want.b) > 1e-5) continue;
        // a frame vertex stands LIFT off the nose along its normal: take that off for the point on the nose
        const x = pos.getX(i) - normal.getX(i) * LIFT;
        const z = pos.getZ(i) - normal.getZ(i) * LIFT;
        const s = car.cab === 'front' ? z - face : face - z;
        // (the 717's front door has a window of this colour, flat on the face)
        if (s < 0.05) continue;
        counted++;
        const half = ringAt(spec.nose, s).ws * sec.width;
        const reach = FRAME_REACH * half;
        widest = Math.max(widest, Math.abs(x) / half);
        assert.ok(Math.abs(x) <= reach + 1e-4, `${kind} car ${car.index}: the frame stands ${(Math.abs(x) / half).toFixed(3)} of the nose's half-width out at ${s.toFixed(2)} m back, past ${FRAME_REACH}`);
      }
      assert.ok(counted > 100, `${kind} car ${car.index}: ${counted} frame vertices`);
      // the glass itself is narrower than the cap, so the cap only ever trims the frame, never the pane
      assert.ok(spec.glass.screen.fraction <= FRAME_REACH, `${kind}: a glass ${spec.glass.screen.fraction} of the half-width wide would be cut by the frame's cap`);
      // and the cap is what holds the frame: on the EMUs it runs right out to it, where the frame's own width would take it past (the Azuma's,
      // round a narrow glass, stops at 0.875 of the half-width, short of the cap)
      if (kind !== 'lner5') assert.ok(widest > FRAME_REACH - 0.01, `${kind} car ${car.index}: the frame stops at ${widest.toFixed(3)} of the half-width, short of its cap`);
    }
  }
});

test('glass: the cab glass is a dark, tinted, reflective material of its own, and each cab has a side window on both sides', () => {
  for (const kind of ['lner5', 'gn387x8'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of layout.cars.filter((c) => c.cab)) {
      const group = named(g, `car-${car.index}`);
      const glass = named(group, 'cab-glass') as THREE.Mesh;
      const m = glass.material as THREE.MeshStandardMaterial;
      assert.ok(m.isMeshStandardMaterial, 'a physically lit material, so it reflects');
      assert.ok(m.metalness >= 0.5 && m.roughness <= 0.3, `reflective: metalness ${m.metalness}, roughness ${m.roughness}`);
      const c = m.color;
      assert.ok(c.r + c.g + c.b < 0.2, 'dark tint');
      assert.notEqual(m, (named(group, 'body-detail') as THREE.Mesh).material, 'not the body material');
      const side = (sign: number): number => triangles(glass).filter((t) => t.every((v) => v.x * sign > 1.1)).length;
      assert.ok(side(-1) > 40 && side(1) > 40, `${kind} car ${car.index}: cab side windows ${side(-1)} / ${side(1)} triangles`);
    }
  }
});

test('glass: the 387\'s gangway door stands in the gap between its two windscreens, a leaf narrower than the post, from the face\'s cover up to the top of the glass', () => {
  const door = bodySpec('electrostar').front.centreDoor;
  assert.ok(door, 'the 387 has a centre door');
  const screen = bodySpec('electrostar').glass.screen;
  assert.ok(screen.pillar !== undefined && door.width < screen.pillar, `the leaf (${door.width}) is narrower than the post (${screen.pillar}), so the frame outlines it`);
  for (const kind of ['gn387x4', 'gn387x8'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of layout.cars.filter((c) => c.cab)) {
      const here = `${kind} car ${car.index} (${car.cab})`;
      const leaf = trisOfColour(detailOf(g, car), door.leaf);
      assert.ok(leaf.length >= 20, `${here}: ${leaf.length} leaf triangles`);
      const box = boxOfTris(leaf);
      // (the leaf stands 27 mm off the nose along its normal, which leans a little outward: up to a millimetre or two each side)
      assert.ok(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) <= door.width / 2 + 0.005, `${here}: the leaf is ${box.max.x - box.min.x} m wide, wider than ${door.width}`);
      // it runs from the face, along the nose, to the top of the glass: how far along (out from the face plane) is the extent in z
      const interior = car.cab === 'front' ? car.start > 1e-9 : car.end < layout.length - 1e-9;
      const face = facePlane(car, true, interior);
      const along = Math.max(...leaf.flat().map((v) => Math.abs(v.z - face)));
      assert.ok(along >= screen.s1 - 0.15 && along <= screen.s1 + bodySpec('electrostar').front.frame + 0.1, `${here}: the leaf runs ${along.toFixed(2)} m back along the nose; the glass's top is at ${screen.s1}`);
      // and up the face from above the coupler cover: no leaf below the cover's top
      const cover = all(named(g, `car-${car.index}`), 'coupler-cover')[0];
      if (cover) assert.ok(box.min.y > (cover.userData.y1 as number), `${here}: the leaf starts at ${box.min.y.toFixed(3)}, under the cover's top ${cover.userData.y1}`);
    }
  }
  // no other family has one: no 717, 700, 180 or Azuma carries the leaf's colour on its front
  for (const kind of ['gn717x6', 'tl700x8', 'gc180x5', 'lner5', 'hull5', 'lumo5'] as TrainKind[]) {
    const g = built(kind);
    for (const car of trainLayout(kind).cars.filter((c) => c.cab)) assert.equal(trisOfColour(detailOf(g, car), door.leaf).length, 0, `${kind} car ${car.index}: a 387's door leaf`);
  }
});

test('lamps: two headlight clusters on the face of every cab, one each side, level, inside the face and above the coupler cover', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const r0 = ringAt(spec.nose, 0);
    const tipHalf = halfAt(sec, norm, egg, r0);
    const lamps = all(g, 'headlight');
    assert.equal(lamps.length, 2 * layout.cars.filter((c) => c.cab).length, `${kind}: two per cab`);
    for (const car of layout.cars.filter((c) => c.cab)) {
      const mine = lamps.filter((l) => l.parent?.name === `car-${car.index}`);
      assert.equal(mine.length, 2, `${kind} car ${car.index} lamps`);
      const [a, b] = mine.map(worldPos) as [THREE.Vector3, THREE.Vector3];
      near(a.x, -b.x, 1e-9, `${kind} car ${car.index} lamps are symmetric`);
      near(a.y, b.y, 1e-9, `${kind} car ${car.index} lamps are level`);
      // a lamp is 0.26 m wide: all of it stands inside the face's outline at its height, and clear of the middle
      assert.ok(Math.abs(a.x) > 0.2 && Math.abs(a.x) + 0.15 < xAtY(tipHalf, a.y), `${kind} lamp at x = ${a.x}, face half-width ${xAtY(tipHalf, a.y)} there`);
      assert.ok(a.y > r0.bottom + 0.4 * (r0.top - r0.bottom) && a.y < r0.bottom + 0.8 * (r0.top - r0.bottom), `${kind} lamp height ${a.y}`);
      const face = car.cab === 'front' ? car.start : car.end;
      assert.ok(Math.abs(a.z - face) < 0.4, `${kind} car ${car.index} lamps ${a.z} are at the face, ${face}`);
      assert.deepEqual(mine.map((l) => l.userData.side).sort(), ['left', 'right']);
      // and each tag names its own lamp's side: +x is the right of the train (it travels toward -z), as the door markers have it, at either end of the train
      for (const l of mine) assert.equal(l.userData.side, worldPos(l).x > 0 ? 'right' : 'left', `${kind} car ${car.index}: the headlight at x = ${worldPos(l).x.toFixed(3)} is tagged '${l.userData.side}'`);
      // where the cover is on, the lamps are above its top
      const cover = all(named(g, `car-${car.index}`), 'coupler-cover')[0];
      if (cover) assert.ok(a.y > (cover.userData.y1 as number), `${kind} car ${car.index}: the lamps are over the cover`);
    }
  }
});

test('lamps: the leading end shows lit headlights and dark tail lenses, the trailing end lit tail lamps and dark headlight lenses, a coupled cab end none lit', () => {
  const lens = (g: THREE.Object3D, car: Car): Record<keyof typeof LENS, number> => {
    const mesh = detailOf(g, car);
    const n = (hex: number): number => trisOfColour(mesh, hex).length;
    return { headOn: n(LENS.headOn), headOff: n(LENS.headOff), tailOn: n(LENS.tailOn), tailOff: n(LENS.tailOff) };
  };
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of layout.cars.filter((c) => c.cab)) {
      const here = `${kind} car ${car.index} (${car.cab} cab)`;
      const l = lens(g, car);
      const interior = car.cab === 'front' ? car.start > 1e-9 : car.end < layout.length - 1e-9;
      // two clusters a cab, each with a headlight lens and a tail lens: the same number of triangles lit or dark
      assert.ok(l.headOn + l.headOff > 0 && l.tailOn + l.tailOff > 0, `${here}: lenses`);
      if (interior) {
        assert.deepEqual([l.headOn, l.tailOn], [0, 0], `${here}: a coupled cab end shows no lit lamp`);
        assert.ok(l.headOff > 0 && l.tailOff > 0, `${here}: dark lenses`);
      } else if (car.cab === 'front') {
        assert.ok(l.headOn > 0 && l.tailOff > 0, `${here}: the leading end shows its headlights lit, tail lenses dark`);
        assert.deepEqual([l.headOff, l.tailOn], [0, 0], `${here}: and neither a dark headlight nor a lit tail lamp`);
      } else {
        assert.ok(l.tailOn > 0 && l.headOff > 0, `${here}: the trailing end shows its tail lamps lit, headlight lenses dark`);
        assert.deepEqual([l.headOn, l.tailOff], [0, 0], `${here}: and neither a lit headlight nor a dark tail lens`);
      }
    }
  }
  // the four lens colours differ, and a lit one is lighter or redder than its dark one
  const lum = (h: number): number => lumaOf(h);
  assert.ok(lum(LENS.headOn) > lum(LENS.headOff) + 0.2 && lum(LENS.tailOn) > lum(LENS.tailOff) + 0.1, 'a lit lens is brighter than a dark one');
  assert.equal(new Set(Object.values(LENS)).size, 4);
});

// --- the finish of a cab front -----------------------------------------------------------------------

test('fronts: each family\'s headlight and tail lamp are the size, shape and place its spec gives: level, inside the face, standing proud of a dark bezel where it has one', () => {
  // CHANGED (the lenses used to be one colour at both ends of a train): the leading end has its headlights lit and its tail lamps dark, the
  // trailing end the other way round (see LENS); each end's lenses are found by the colour they have there
  const HEAD_ON = LENS.headOn;
  const TAIL_ON = LENS.tailOn;
  for (const kind of ['lner5', 'gn387x4', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const lamps = spec.front.lamps;
    // near black, except where the family lights its lamp pods in a lighter grey (the 180's, on a black front)
    const BEZEL = lamps.bezelColour ?? 0x15171a;
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const r0 = ringAt(spec.nose, 0);
    const tipHalf = halfAt(sec, norm, egg, r0);
    // a front door's outline is the bezel's colour too: it is in the middle, so a triangle wholly within its width is not a bezel
    const doorHalf = spec.front.door ? spec.front.door.width / 2 + 0.02 + 1e-6 : 0;
    // the headlight's centre: a fraction (y) of the face's height above its underside, and a fraction (x) of its half-width at that height
    const yh = r0.bottom + lamps.y * (r0.top - r0.bottom);
    const xh = xAtY(tipHalf, yh) * lamps.x;
    for (const car of endCabs(layout)) {
      const mesh = detailOf(g, car);
      const face = facePlane(car, spec.front.coupler.covered, false);
      const out = outwards(car);
      const boxes: THREE.Box3[] = [];
      for (const side of [-1, 1]) {
        const here = `${kind} car ${car.index} ${side < 0 ? 'left' : 'right'}`;
        const onSide = (ts: Tri[]): Tri[] => ts.filter((t) => t.every((v) => v.x * side > 0));
        const headTris = onSide(trisOfColour(mesh, car.cab === 'front' ? HEAD_ON : LENS.headOff));
        const tailTris = onSide(trisOfColour(mesh, car.cab === 'rear' ? TAIL_ON : LENS.tailOff));
        const head = boxOfTris(headTris);
        const tail = boxOfTris(tailTris);
        boxes.push(head);
        // the size: a rounded rectangle is exactly its box, a circle sampled at 14 points reaches sin(77 degrees) = 0.975 of its height
        const slack = lamps.shape === 'round' ? Math.sin((2 * Math.PI * 3) / 14) : 1;
        near(head.max.x - head.min.x, lamps.head[0], 1e-6, `${here} headlight width`);
        assert.ok(head.max.y - head.min.y >= lamps.head[1] * slack - 1e-6 && head.max.y - head.min.y <= lamps.head[1] + 1e-6, `${here} headlight height ${head.max.y - head.min.y}`);
        near(tail.max.x - tail.min.x, lamps.tail[0], 1e-6, `${here} tail lamp width`);
        assert.ok(tail.max.y - tail.min.y >= lamps.tail[1] * slack - 1e-6 && tail.max.y - tail.min.y <= lamps.tail[1] + 1e-6, `${here} tail lamp height`);
        // the place: the tail lamp is outboard of the headlight's centre, and up, as `tailAt` says
        near((head.min.x + head.max.x) / 2, side * xh, 1e-6, `${here} headlight x`);
        near((head.min.y + head.max.y) / 2, yh, 1e-6, `${here} headlight y`);
        near((tail.min.x + tail.max.x) / 2, side * (xh + lamps.tailAt[0]), 1e-6, `${here} tail lamp x`);
        near((tail.min.y + tail.max.y) / 2, yh + lamps.tailAt[1], 1e-6, `${here} tail lamp y`);
        // 9 mm in front of the face, the lens proud of the bezel, which is 5 mm proud of the face
        for (const b of [head, tail]) {
          near(b.min.z, face + out * 0.009, ZTOL, `${here} lens depth`);
          near(b.max.z, face + out * 0.009, ZTOL, `${here} lens flat`);
        }
        // the shape: the headlight is an ellipse (every vertex on it, or at its centre) or a rounded rectangle (no vertex in a corner of its box)
        const cx = side * xh;
        for (const t of headTris) {
          for (const v of t) {
            const dx = (v.x - cx) / (lamps.head[0] / 2);
            const dy = (v.y - yh) / (lamps.head[1] / 2);
            if (lamps.shape === 'round') assert.ok(Math.abs(Math.hypot(dx, dy) - 1) < 1e-6 || Math.hypot(dx, dy) < 1e-6, `${here}: a round headlight has a vertex off its circle, at (${dx.toFixed(3)}, ${dy.toFixed(3)})`);
            else assert.ok(!(Math.abs(dx) > 1 - 1e-6 && Math.abs(dy) > 1 - 1e-6), `${here}: a rounded rectangle has a square corner`);
          }
        }
        // inside the face's outline at the lens's own height
        for (const v of [...headTris.flat(), ...tailTris.flat()]) assert.ok(Math.abs(v.x) < xAtY(tipHalf, v.y), `${here} lamp vertex at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) is outside the face`);
        // the bezel: the lamps' two boxes, grown by the bezel's margin, 5 mm proud of the face; none where the family has none
        const bezelTris = onSide(trisOfColour(mesh, BEZEL)).filter((t) => !t.every((v) => Math.abs(v.x) <= doorHalf));
        if (lamps.bezel === 0) {
          assert.equal(bezelTris.length, 0, `${here}: a bezel on a family that has none`);
          continue;
        }
        const xs = [xh - lamps.head[0] / 2, xh + lamps.head[0] / 2, xh + lamps.tailAt[0] - lamps.tail[0] / 2, xh + lamps.tailAt[0] + lamps.tail[0] / 2];
        const ys = [yh - lamps.head[1] / 2, yh + lamps.head[1] / 2, yh + lamps.tailAt[1] - lamps.tail[1] / 2, yh + lamps.tailAt[1] + lamps.tail[1] / 2];
        const bezel = boxOfTris(bezelTris);
        near(Math.min(Math.abs(bezel.min.x), Math.abs(bezel.max.x)), Math.min(...xs) - lamps.bezel, 1e-6, `${here} bezel inner edge`);
        near(Math.max(Math.abs(bezel.min.x), Math.abs(bezel.max.x)), Math.max(...xs) + lamps.bezel, 1e-6, `${here} bezel outer edge`);
        near(bezel.min.y, Math.min(...ys) - lamps.bezel, 1e-6, `${here} bezel foot`);
        near(bezel.max.y, Math.max(...ys) + lamps.bezel, 1e-6, `${here} bezel top`);
        near(bezel.min.z, face + out * 0.005, ZTOL, `${here} bezel depth`);
        for (const v of bezelTris.flat()) assert.ok(Math.abs(v.x) < xAtY(tipHalf, v.y), `${here} bezel vertex at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) is outside the face`);
      }
      // level and mirrored
      near((boxes[0] as THREE.Box3).min.y, (boxes[1] as THREE.Box3).min.y, 1e-9, `${kind} car ${car.index} lamps are level`);
      near((boxes[0] as THREE.Box3).min.x, -(boxes[1] as THREE.Box3).max.x, 1e-9, `${kind} car ${car.index} lamps are mirrored`);
    }
  }
  // the families differ: round lamps on the 717 and the 180, strips on the 700 and the 387, a tail lamp outboard only on the 700
  for (const f of ['desiro', 'adelante'] as Family[]) assert.equal(bodySpec(f).front.lamps.shape, 'round');
  for (const f of ['electrostar', 'desiro700', 'at300'] as Family[]) assert.equal(bodySpec(f).front.lamps.shape, 'rect');
  assert.ok(bodySpec('desiro700').front.lamps.tailAt[0] > 0.1 && bodySpec('electrostar').front.lamps.tailAt[0] === 0, 'the 700 has its tail lamp outboard of the headlight strip; the 387 has it under');
  assert.ok(bodySpec('desiro700').front.lamps.head[1] < 0.08 && bodySpec('adelante').front.lamps.head[1] > 0.1, 'the 700 has a slim strip, the 180 a big round lamp');
  // the 180's lamp pods are a lighter grey than any other family's near-black bezel, so they read against its black front
  const pod = bodySpec('adelante').front.lamps.bezelColour;
  assert.ok(pod !== undefined && lumaOf(pod) > 0.2 && lumaOf(0x15171a) < 0.1, 'the 180 has grey lamp pods');
  for (const f of ['desiro', 'electrostar', 'desiro700', 'at300'] as Family[]) assert.equal(bodySpec(f).front.lamps.bezelColour, undefined, `${f}: the near-black bezel`);
  // the lamps stand toward the corners of the face, not in its middle (in photographs of every one of these fronts)
  for (const f of FAMILIES) assert.ok(bodySpec(f).front.lamps.x >= 0.6, `${f}: lamps only ${bodySpec(f).front.lamps.x} of the way out to the face's edge`);
});

test('fronts: a yellow warning panel covers the face above the cover of a 387, a 700 and a 180, as far back along the nose and as far across the face as its spec says, and nothing is yellow on a 717 or on a through car', () => {
  const YELLOW = 0xf2c100;
  // which families have one: the 387 (ASSUMED), the 700 (forum posts: "still have a yellow panel"; photographs) and the 180 (photographs); not the 717 or the Azuma
  const warning = Object.fromEntries(FAMILIES.map((f) => [f, bodySpec(f).front.warning]));
  assert.deepEqual(warning, { at300: null, electrostar: YELLOW, desiro: null, desiro700: YELLOW, adelante: YELLOW });
  // how far back and how far across: a 387's covers the face and the first half metre; a 180's the face and only the bonnet; a 700's is a patch
  // under the glass, 0.7 of the face's width and a fifth of a metre deep, with the livery's colour to each side of it
  const reach = Object.fromEntries(FAMILIES.map((f) => [f, [bodySpec(f).front.warningWrap, bodySpec(f).front.warningWidth]]));
  assert.deepEqual(reach, { at300: [undefined, undefined], electrostar: [undefined, undefined], desiro: [undefined, undefined], desiro700: [0.2, 0.7], adelante: [0.3, undefined] });
  for (const kind of ['gn387x8', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const r0 = ringAt(spec.nose, 0);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const tipHalf = halfAt(sec, norm, eggSection(norm, spec.nose.widest, spec.nose.boxiness), r0);
    // the panel ends at the first ring station at or beyond its wrap (the colour boundary runs along a ring)
    const wrap = spec.front.warningWrap ?? 0.5;
    const panelEnd = ringStations(spec.nose).find((s) => s >= wrap - 1e-9) as number;
    const width = spec.front.warningWidth ?? 1;
    for (const car of layout.cars) {
      const yellow = trisOfColour(detailOf(g, car), YELLOW);
      if (!car.cab || spec.front.warning === null) {
        assert.equal(yellow.length, 0, `${kind} car ${car.index}: yellow on a car with no warning panel`);
        continue;
      }
      const interior = car.index > 0 && car.index < layout.cars.length - 1;
      const face = facePlane(car, spec.front.coupler.covered, interior);
      const back = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - face : face - v.z);
      const onFace = yellow.filter((t) => t.every((v) => Math.abs(back(v)) < ZTOL));
      const area = onFace.reduce((a, t) => a + areaOf(t), 0);
      assert.ok(area > 0.3, `${kind} car ${car.index}: ${area.toFixed(2)} m2 of yellow on the face`);
      // above the cover (or the valance), not below it
      const cut = Math.min(...onFace.flatMap((t) => t.map((v) => v.y)));
      assert.ok(cut >= r0.bottom + 0.3 * (r0.top - r0.bottom), `${kind} car ${car.index}: yellow down to the foot of the face`);
      // and no lower on the nose behind it: the panel's lower edge is the cover's top, all the way back
      const lowest = Math.min(...yellow.flatMap((t) => t.map((v) => v.y)));
      assert.ok(lowest >= cut - 0.1, `${kind} car ${car.index}: yellow down to ${lowest.toFixed(2)} m on the nose, its edge on the face at ${cut.toFixed(2)} m`);
      // and wrapped back along the nose, to the ring the panel's wrap ends at
      near(Math.max(...yellow.flatMap((t) => t.map(back))), panelEnd, ZTOL, `${kind} car ${car.index}: how far back the yellow runs`);
      // across: the whole face at the cut (the face's own half-width there), or only the spec's fraction of it, with cheeks in the livery's front colour either side
      const widest = xAtY(tipHalf, cut);
      const edge = Math.max(...onFace.flatMap((t) => t.map((v) => Math.abs(v.x))));
      const cheeks = trisOfColour(detailOf(g, car), LIVERIES[layout.spec.livery].noseFront).filter((t) => t.every((v) => Math.abs(back(v)) < ZTOL && v.y > cut - 1e-6 && Math.abs(v.x) > edge - 1e-6));
      if (width === 1) {
        near(edge, widest, ZTOL, `${kind} car ${car.index}: the panel runs to the face's edge`);
        assert.equal(cheeks.length, 0, `${kind} car ${car.index}: livery-coloured cheeks beside a panel that covers the face`);
      } else {
        assert.ok(edge <= width * widest + ZTOL && edge > 0.4 * widest, `${kind} car ${car.index}: a panel ${edge.toFixed(3)} m out on a face ${widest.toFixed(3)} m out, asked ${width}`);
        assert.ok(cheeks.reduce((a, t) => a + areaOf(t), 0) > 0.1, `${kind} car ${car.index}: no cheeks of the livery's colour beside the panel`);
      }
    }
  }
});

test('fronts: dark parked wipers lie right along the foot of the windscreen and a lit display runs across its top, both lifted a little off the nose\'s own surface', () => {
  // a dark grey, close to the glass's black: pale arms standing higher up the glass read as eyebrows
  const WIPER = 0x3b4048;
  assert.ok((0.2126 * ((WIPER >> 16) & 255) + 0.7152 * ((WIPER >> 8) & 255) + 0.0722 * (WIPER & 255)) / 255 < 0.3, 'dark wiper arms');
  const DISPLAY = 0xffa000;
  for (const kind of ['lner5', 'gn387x4', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const screen = spec.glass.screen;
    for (const car of endCabs(layout)) {
      const mesh = detailOf(g, car);
      const face = facePlane(car, spec.front.coupler.covered, false);
      const sOf = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - face : face - v.z);
      const wipers = trisOfColour(mesh, WIPER);
      const display = trisOfColour(mesh, DISPLAY);
      assert.equal(wipers.length > 0, spec.front.wipers, `${kind} car ${car.index}: wipers`);
      assert.equal(display.length > 0, spec.front.display, `${kind} car ${car.index}: display`);
      const cases: [Tri[], string, number, number, number][] = [
        // an arm lies within 12 cm of the glass's lower edge, and no further out than 0.85 m: it never stands up the glass, where it would read as an eyebrow
        [wipers, 'wiper', screen.s0 - 0.02, screen.s0 + 0.12, 0.85],
        [display, 'display', screen.s1 - 0.5, screen.s1, 0.56],
      ];
      for (const [tris, label, sMin, sMax, xMax] of cases) {
        for (const v of tris.flat()) {
          const s = sOf(v);
          assert.ok(s >= sMin && s <= sMax, `${kind} car ${car.index}: a ${label} vertex at ${s.toFixed(2)} m back, not within ${sMin.toFixed(2)}..${sMax.toFixed(2)} (the glass runs ${screen.s0}..${screen.s1})`);
          assert.ok(Math.abs(v.x) <= xMax, `${kind} car ${car.index}: a ${label} vertex ${v.x.toFixed(2)} m out`);
          // an arm's pivot stands 10 cm outboard of the middle, or of the 180's centre post, never in it
          if (label === 'wiper') assert.ok(Math.abs(v.x) >= (screen.pillar ?? 0) / 2 + 0.08, `${kind} car ${car.index}: a wiper vertex ${v.x.toFixed(3)} m out, in or beside the centre post`);
          // over the surface, not in it and not floating: the offset along the normal is 3 cm; straight up it is more where the nose is steep
          const surface = yAtX(halfAt(sec, norm, egg, ringAt(spec.nose, Math.max(0, Math.min(spec.nose.length, s)))), Math.abs(v.x));
          assert.ok(v.y - surface > 0.01 && v.y - surface < 0.12, `${kind} car ${car.index}: a ${label} vertex ${((v.y - surface) * 1000).toFixed(0)} mm over the nose`);
        }
      }
      if (wipers.length && display.length) {
        const meanS = (tris: Tri[]): number => tris.flat().reduce((a, v) => a + sOf(v), 0) / (tris.length * 3);
        assert.ok(meanS(display) - meanS(wipers) > 0.5, `${kind}: the display is above the wipers`);
      }
    }
  }
});

test('fronts: the Azuma keeps the front it had: rectangular lamps, a covered plain coupler, no wipers, display, door or warning panel (the lamps now sit up in the face\'s outer corners in a dark housing)', () => {
  // CHANGED (the lamps were low and bare, at 0.56 of the face's height and 0.6 of its half-width, with no housing): lner-800-113-newcastle-2025 and
  // hull-802-doncaster-2024 show the headlamp pod in the face's upper outer corner, a dark housing round the lamp with the tail lamp beneath it
  assert.deepEqual(bodySpec('at300').front, {
    lamps: { shape: 'rect', y: 0.6, x: 0.6, head: [0.26, 0.12], tail: [0.12, 0.06], tailAt: [0, -0.15], bezel: 0.04 },
    frame: 0.07,
    wipers: false,
    display: false,
    door: null,
    warning: null,
    coupler: { style: 'plain', covered: true },
  });
});

test('fronts: only the Class 717 has a front door, outlined on the upper face between the lamps and wholly inside the face', () => {
  const BEZEL = 0x15171a;
  assert.deepEqual(FAMILIES.filter((f) => bodySpec(f).front.door), ['desiro'], 'the families with a front door');
  for (const kind of ['lner5', 'gn387x4', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const r0 = ringAt(spec.nose, 0);
    const tipHalf = halfAt(sec, norm, egg, r0);
    const doors = all(g, 'front-door');
    assert.equal(doors.length, spec.front.door ? 2 : 0, `${kind}: front doors`);
    if (!spec.front.door) continue;
    for (const car of endCabs(layout)) {
      const marker = doors.find((d) => d.parent?.name === `car-${car.index}`) as THREE.Object3D;
      assert.ok(marker, `${kind} car ${car.index} has a front door`);
      const face = facePlane(car, spec.front.coupler.covered, false);
      near(worldPos(marker).x, 0, 1e-9, 'the door is in the middle');
      near(worldPos(marker).z, face, ZTOL, 'the door is on the face');
      near(marker.userData.width as number, spec.front.door.width, 1e-9, 'door width');
      const height = marker.userData.height as number;
      assert.ok(height > 0.3 && height <= spec.front.door.height + 1e-9, `${kind} front door height ${height}`);
      // its outline (frame colour), 2 cm round the leaf, in the middle of the face, above the cover
      const outline = boxOfTris(trisOfColour(detailOf(g, car), BEZEL).filter((t) => t.every((v) => Math.abs(v.x) <= spec.front.door!.width / 2 + 0.02 + 1e-6)));
      near(outline.max.x, spec.front.door.width / 2 + 0.02, 1e-6, 'door outline half-width');
      near(outline.min.y, worldPos(marker).y - height / 2 - 0.02, 1e-6, 'door outline foot');
      near(outline.max.y, worldPos(marker).y + height / 2 + 0.02, 1e-6, 'door outline top');
      assert.ok(outline.min.y > r0.bottom + 0.3 * (r0.top - r0.bottom), `${kind}: the front door starts ${outline.min.y} m up, in the coupler cover's zone`);
      for (const y of [outline.min.y, outline.max.y]) assert.ok(outline.max.x < xAtY(tipHalf, y) - 0.03, `${kind}: the door's outline runs out of the face at y = ${y.toFixed(2)}`);
      // clear of the lamps: the bezels begin outboard of the door's outline
      const bezelEdge = Math.min(...trisOfColour(detailOf(g, car), BEZEL).filter((t) => !t.every((v) => Math.abs(v.x) <= spec.front.door!.width / 2 + 0.02 + 1e-6)).flatMap((t) => t.map((v) => Math.abs(v.x))));
      assert.ok(bezelEdge > outline.max.x + 0.01, `${kind}: the door's outline reaches ${outline.max.x.toFixed(3)} and the lamps begin at ${bezelEdge.toFixed(3)}`);
    }
  }
});

// --- the coupler cover, gangways and couplers -----------------------------------------------------------

test('couplers: the nose coupler is under its cover at the two train ends where the family has a cover, stands out of the face where it has none, and is out only where two units meet', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const front = bodySpec(layout.spec.family).front;
    const covers = all(g, 'coupler-cover');
    const outs = all(g, 'nose-coupler');
    if (front.coupler.covered) {
      assert.equal(covers.length, 2, `${kind}: a cover at each end of the train`);
      assert.equal(outs.length, 0, `${kind}: a covered coupler is not drawn out`);
      const zs = covers.map((c) => worldPos(c).z).sort((a, b) => a - b);
      near(zs[0] as number, 0, 0.02, `${kind} front cover`);
      near(zs[1] as number, layout.length, 0.02, `${kind} rear cover`);
      for (const c of covers) {
        assert.equal(c.userData.hidesCoupler, true);
        const y = worldPos(c).y;
        assert.ok(y > 0.55 && y < 1.4 && Math.abs(worldPos(c).x) < 1e-9, `${kind} cover at (${worldPos(c).x}, ${y})`);
      }
    } else {
      // no cover: the coupler stands out of the face, its marker half way along it, to the end of the car (a head of 0.35 m at each end of the train)
      assert.equal(covers.length, 0, `${kind}: no cover where the coupler is out`);
      assert.equal(outs.length, 2, `${kind}: a coupler out of each end of the train`);
      const zs = outs.map((c) => worldPos(c).z).sort((a, b) => a - b);
      near(zs[0] as number, END_GAP / 2, 1e-9, `${kind} front coupler`);
      near(zs[1] as number, layout.length - END_GAP / 2, 1e-9, `${kind} rear coupler`);
      for (const c of outs) {
        near(c.userData.reach as number, END_GAP, 1e-9, `${kind} coupler reach`);
        assert.equal(c.userData.style, front.coupler.style);
        near(worldPos(c).y, 0.85, 1e-9, `${kind} coupler height`);
      }
    }
    // a coupler marker at each end of each joint, nothing at the ends of the train, and noses only where units meet
    const couplers = all(g, 'coupler');
    assert.equal(couplers.length, 2 * (layout.cars.length - 1), `${kind} couplers`);
    for (const c of couplers) {
      const z = worldPos(c).z;
      assert.ok(z > END_GAP && z < layout.length - END_GAP, `${kind}: a coupler at the end of the train, z = ${z}`);
      const joint = layout.cars.find((car) => Math.abs(car.end - z) <= END_GAP + 1e-9);
      assert.ok(joint, `${kind}: a coupler at z = ${z} is not within ${END_GAP} m of a joint`);
      near(worldPos(c).y, 0.85, 1e-9, `${kind} coupler height`);
    }
    const noses = couplers.filter((c) => c.userData.nose === true).length;
    assert.equal(noses, layout.cars.filter((c) => c.cab && c.index > 0 && c.index < layout.cars.length - 1).length, `${kind}: nose couplers are at interior cabs only`);
  }
});

test('couplers: every coupler style\'s head front is exactly `reach` from the wall, nothing is behind the wall, the two halves of a gap touch, and the styles are what they say', () => {
  const FACE = 0x17191c;
  const y = 0.85;
  for (const style of ['plain', 'dellner', 'scharfenberg'] as const) {
    for (const dir of [1, -1] as const) {
      for (const reach of [0.35, 0.7]) {
        const soup = new Soup();
        couplerHalf(soup, 10, dir, reach, y, style);
        const at = (k: number): number[] => soup.pos.filter((_, i) => i % 3 === k);
        const out = at(2).map((z) => (z - 10) * dir);
        const label = `${style} dir ${dir} reach ${reach}`;
        near(Math.max(...out), reach, 1e-6, `${label}: the head's front`);
        near(Math.min(...out), 0, 1e-6, `${label}: the barrel starts at the wall`);
        near(Math.min(...at(0)), -Math.max(...at(0)), 1e-6, `${label}: symmetrical across the train`);
        assert.ok(Math.max(...at(0)) > 0.12 && Math.max(...at(0)) < 0.27, `${label}: ${Math.max(...at(0))} m out to the side`);
        assert.ok(Math.min(...at(1)) >= y - 0.32 && Math.max(...at(1)) <= y + 0.25 && Math.min(...at(1)) < y - 0.05, `${label}: y from ${Math.min(...at(1))} to ${Math.max(...at(1))}`);
        assert.ok(soup.pos.length / 9 >= 20 && soup.pos.length / 9 < 200, `${label}: ${soup.pos.length / 9} triangles`);
        // the front plane: the head's very front, the thing that touches the other unit's
        const front = triangles(new THREE.Mesh(soup.build())).filter((t) => t.every((v) => Math.abs((v.z - 10) * dir - reach) < 1e-5));
        assert.ok(front.length >= 2, `${label}: a head with no front`);
        const frontWidth = Math.max(...front.flatMap((t) => t.map((v) => Math.abs(v.x))));
        if (style === 'dellner') {
          // a squat casing, its front a broad dark coupling face
          assert.ok(frontWidth > 0.15 && frontWidth < 0.19, `${label}: face ${frontWidth} m half-width`);
          const dark = trisOfColour(new THREE.Mesh(soup.build()), FACE).filter((t) => t.every((v) => Math.abs((v.z - 10) * dir - reach) < 1e-5));
          assert.equal(dark.length, front.length, `${label}: the whole front plane is the dark coupling face`);
        } else if (style === 'scharfenberg') {
          // the narrow end of a cone leads (the other end of the cone is wider, behind it)
          assert.ok(frontWidth <= 0.091, `${label}: the cone's tip is ${frontWidth} m out, not narrow`);
          const behind = triangles(new THREE.Mesh(soup.build())).flatMap((t) => t.filter((v) => Math.abs((v.z - 10) * dir - (reach - 0.12)) < 1e-5));
          assert.ok(behind.length > 8 && Math.max(...behind.map((v) => Math.abs(v.x))) > 0.14, `${label}: the cone's base is not wider`);
        } else assert.ok(frontWidth > 0.12 && frontWidth < 0.14, `${label}: a plain head is ${frontWidth} m out`);
      }
    }
    // two halves, one from each side of a gap, meet in the middle and no further
    const a = new Soup();
    const b = new Soup();
    couplerHalf(a, 0, 1, END_GAP, y, style);
    couplerHalf(b, 2 * END_GAP, -1, END_GAP, y, style);
    near(Math.max(...a.pos.filter((_, i) => i % 3 === 2)), END_GAP, 1e-6, `${style}: the first half's head`);
    near(Math.min(...b.pos.filter((_, i) => i % 3 === 2)), END_GAP, 1e-6, `${style}: the second half's head`);
  }
  // the styles differ: a Dellner head is wider than a plain one and a Scharfenberg's has a conical nose; each has its own triangle count
  const size = (style: 'plain' | 'dellner' | 'scharfenberg'): number => {
    const s = new Soup();
    couplerHalf(s, 0, 1, 0.7, y, style);
    return s.pos.length / 9;
  };
  assert.ok(new Set([size('plain'), size('dellner'), size('scharfenberg')]).size === 3, 'three styles, three shapes');
  // and the default is the plain one (the gaps between cars)
  const dflt = new Soup();
  const plain = new Soup();
  couplerHalf(dflt, 0, 1, 0.35, y);
  couplerHalf(plain, 0, 1, 0.35, y, 'plain');
  assert.deepEqual(dflt.pos, plain.pos);
});

test('couplers: a nose that stands out of its face (717, 700, 180) has its coupler head reach the end of the car, a covered one (387, Azuma) leaves the face at the end', () => {
  assert.equal(faceSetback('electrostar'), NOSE_RECESS);
  assert.equal(faceSetback('adelante'), END_GAP);
  assert.equal(faceSetback('at300'), NOSE_RECESS);
  assert.equal(faceSetback('desiro'), END_GAP);
  assert.equal(faceSetback('desiro700'), END_GAP);
  for (const kind of ['lner5', 'gn387x4', 'gc180x5', 'gn717x6', 'tl700x8'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const covered = bodySpec(layout.spec.family).front.coupler.covered;
    const first = layout.cars[0] as Car;
    const last = layout.cars[layout.cars.length - 1] as Car;
    const frontMin = boxOf(detailOf(g, first)).min.z;
    const rearMax = boxOf(detailOf(g, last)).max.z;
    if (covered) {
      // the front is the nose's face, 1 cm in (6 mm of lens and bezel stand out of it)
      assert.ok(frontMin > 0 && frontMin < 0.01, `${kind}: the face at ${frontMin}`);
      assert.ok(rearMax < last.end && rearMax > last.end - 0.01, `${kind}: the rear face at ${rearMax}, the end ${last.end}`);
    } else {
      // the coupler's head is the furthest-forward thing, at the end of the car and the train
      near(frontMin, first.start, ZTOL, `${kind}: front coupler head`);
      near(rearMax, last.end, ZTOL, `${kind}: rear coupler head`);
    }
  }
});

test('couplers: where two 387 units meet, each nose has an open recess, a jumper cable slung to the other unit, and a coupler head that touches the other\'s; at the train\'s ends there is a cover with its seam', () => {
  const RECESS = 0x0d0e10;
  const CABLE = 0x111214;
  const HEAD_FACE = 0x17191c;
  const g = built('gn387x8');
  const layout = trainLayout('gn387x8');
  const spec = bodySpec('electrostar');
  const r0 = ringAt(spec.nose, 0);
  const coverTop = (all(named(g, 'car-0'), 'coupler-cover')[0] as THREE.Object3D).userData.y1 as number;
  for (const car of layout.cars.filter((c) => c.cab)) {
    const interior = car.index > 0 && car.index < layout.cars.length - 1;
    const mesh = detailOf(g, car);
    const out = outwards(car);
    const face = facePlane(car, true, interior);
    const recess = trisOfColour(mesh, RECESS).filter((t) => t.every((v) => Math.abs(v.z - (face + out * 0.004)) < ZTOL));
    const cables = trisOfColour(mesh, CABLE);
    const seams = trisOfColour(mesh, 0x1b1d21).filter((t) => t.every((v) => Math.abs(v.z - (face + out * 0.004)) < ZTOL));
    const here = `gn387x8 car ${car.index}`;
    if (!interior) {
      assert.equal(recess.length, 0, `${here}: an open recess at the end of the train`);
      assert.equal(cables.length, 0, `${here}: a jumper cable at the end of the train`);
      // the cover's seam and its latches: just over the cover's top
      assert.ok(seams.length > 0, `${here}: the cover's seam`);
      const box = boxOfTris(seams);
      near(box.max.y, coverTop + 0.012, 1e-6, `${here} seam top`);
      assert.ok(box.min.y > coverTop - 0.11, `${here} latches stand ${coverTop - box.min.y} m under the seam`);
      continue;
    }
    // the open recess where the cover was: a dark patch on the face, between the foot of the face and the cover's top
    assert.ok(recess.length > 8, `${here}: no recess`);
    const rb = boxOfTris(recess);
    near(rb.min.y, r0.bottom + 0.08, 1e-6, `${here} recess foot`);
    near(rb.max.y, coverTop - 0.05, 1e-6, `${here} recess top`);
    near(rb.min.x, -rb.max.x, 1e-6, `${here} recess symmetric`);
    assert.equal(seams.length, 0, `${here}: a cover's seam where the cover is open`);
    // two cables, one each side, from a socket on the face down and out to the middle of the gap
    const cb = boxOfTris(cables);
    assert.ok(cb.min.x < -0.2 && cb.max.x > 0.2 && cb.max.y - cb.min.y > 0.14, `${here} cables span x ${cb.min.x}..${cb.max.x}, y ${cb.min.y}..${cb.max.y}`);
    const reachOut = Math.max(...cables.flat().map((v) => (car.cab === 'front' ? face - v.z : v.z - face)));
    assert.ok(reachOut > 0.3 && reachOut <= END_GAP, `${here}: the cable reaches ${reachOut} m from the face`);
    // the head of the coupler, a dark face, at the joint: where the other unit's head is
    const joint = car.cab === 'front' ? car.start : car.end;
    const headFace = trisOfColour(mesh, HEAD_FACE).filter((t) => t.every((v) => Math.abs(v.z - joint) < ZTOL));
    assert.ok(headFace.length >= 2, `${here}: no coupler head face at the joint`);
  }
});

test('couplers: the seam of a cover is near black on a light front and lighter on a dark one (the Hull Trains cone), where black on black would not show; a front with no cover has no seam', () => {
  const SEAM_DARK = 0x1b1d21;
  const SEAM_LIGHT = 0x484c53;
  for (const [kind, want, other] of [['gn387x4', SEAM_DARK, SEAM_LIGHT], ['lner5', SEAM_DARK, SEAM_LIGHT], ['hull5', SEAM_LIGHT, SEAM_DARK]] as const) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of endCabs(layout)) {
      const plane = facePlane(car, true, false) + outwards(car) * 0.004;
      const onPlane = (hex: number): Tri[] => trisOfColour(detailOf(g, car), hex).filter((t) => t.every((v) => Math.abs(v.z - plane) < ZTOL));
      assert.ok(onPlane(want).length > 0, `${kind} car ${car.index}: no seam in ${want.toString(16)}`);
      assert.equal(onPlane(other).length, 0, `${kind} car ${car.index}: a seam in ${other.toString(16)}`);
    }
  }
  // the 180's Scharfenberg stands in the open: no cover, so no seam of either colour on its face
  const g = built('gc180x5');
  for (const car of endCabs(trainLayout('gc180x5'))) {
    const plane = facePlane(car, false, false) + outwards(car) * 0.004;
    for (const hex of [SEAM_DARK, SEAM_LIGHT]) assert.equal(trisOfColour(detailOf(g, car), hex).filter((t) => t.every((v) => Math.abs(v.z - plane) < ZTOL)).length, 0, `gc180x5 car ${car.index}: a seam in ${hex.toString(16)} on a front with no cover`);
  }
});

test('gangways: a bellows at each end of each joint, of a believable size, with a coupler beside it, and the cars stand 2 x END_GAP apart', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const ways = all(g, 'gangway');
    // a joint is two ends, one from each car, but a cab end that is a train end has no gangway
    assert.equal(ways.length, 2 * (layout.cars.length - 1) - layout.cars.filter((c) => c.cab && c.index > 0 && c.index < layout.cars.length - 1).length, `${kind} gangways`);
    for (const w of ways) {
      const z = worldPos(w).z;
      const car = layout.cars.find((c) => z > c.start && z < c.end) as Car;
      assert.ok(car, `${kind}: gangway at z = ${z}`);
      const boundary = Math.abs(z - car.start) < Math.abs(z - car.end) ? car.start : car.end;
      near(Math.abs(z - boundary), END_GAP / 2, 1e-9, `${kind}: the bellows centre is half a gap from the car boundary`);
      assert.equal(w.userData.depth, END_GAP);
      assert.ok(w.userData.width > 1.6 && w.userData.width < FIGURES.bodyWidth.value && w.userData.height >= 1.8 && w.userData.height <= 2.4, `${kind} gangway ${w.userData.width} x ${w.userData.height}`);
      // the opening lies inside the car's section: above the floor, and under the roof at its own edges
      const y = worldPos(w).y;
      const sec = carSection(bodySpec(layout.spec.family));
      assert.ok(y - w.userData.height / 2 >= sec.floor + 0.05, `${kind} gangway starts ${y - w.userData.height / 2}, under the floor ${sec.floor}`);
      assert.ok(yAtX(sec.half as [number, number][], w.userData.width / 2) > y + w.userData.height / 2 + 0.05, `${kind} gangway opening reaches the roof`);
      assert.ok(w.userData.width / 2 < sec.width - 0.1, `${kind} gangway is as wide as the body`);
    }
  }
  // the bodies of two through cars stand 2 x END_GAP apart, and the bellows and couplers fill the gap to the car boundary
  for (const kind of ['lner9', 'gn387x4', 'gn717x6'] as TrainKind[]) {
    const g = built(kind);
    const cars = trainLayout(kind).cars.filter((c) => c.cab === null);
    for (let i = 0; i + 1 < cars.length; i++) {
      const a = cars[i] as Car;
      const b = cars[i + 1] as Car;
      if (b.index !== a.index + 1) continue;
      const shellA = boxOf(named(named(g, `car-${a.index}`), 'body-shell'));
      const shellB = boxOf(named(named(g, `car-${b.index}`), 'body-shell'));
      near(shellB.min.z - shellA.max.z, 2 * END_GAP, 1e-4, `${kind} gap between car ${a.index} and ${b.index}`);
      near(boxOf(named(named(g, `car-${a.index}`), 'body-detail')).max.z, a.end, 1e-4, `${kind} car ${a.index} bellows reach the boundary`);
      near(boxOf(named(named(g, `car-${b.index}`), 'body-detail')).min.z, b.start, 1e-4, `${kind} car ${b.index} bellows reach the boundary`);
    }
  }
});

test('gap: each body stands 0.35 m inside its car end, the clearance the live layer was written for (COUPLING_CLEARANCE in trains-live.ts)', () => {
  assert.equal(END_GAP, 0.35);
  // the live layer's constant is that same gap (it lays the cars' outlines by it: see its tests), so the two must not drift apart
  assert.equal(COUPLING_CLEARANCE, END_GAP, `COUPLING_CLEARANCE in trains-live.ts is ${COUPLING_CLEARANCE} m, but train.ts stands each body END_GAP = ${END_GAP} m inside its car end`);
  assert.equal(COUPLING_CLEARANCE, 0.35, `COUPLING_CLEARANCE is ${COUPLING_CLEARANCE} m, not the 0.35 m the live layer was written for`);
  // and the bodies really are that far in: every through car of a train
  for (const kind of ['lner9', 'gn717x6'] as TrainKind[]) {
    const g = built(kind);
    for (const car of trainLayout(kind).cars.filter((c) => c.cab === null)) {
      const shell = boxOf(named(named(g, `car-${car.index}`), 'body-shell'));
      near(shell.min.z, car.start + END_GAP, 1e-4, `${kind} car ${car.index} body start`);
      near(shell.max.z, car.end - END_GAP, 1e-4, `${kind} car ${car.index} body end`);
    }
  }
});

// --- the bogies -----------------------------------------------------------------------------------

test('bogies: wheels have flanges and the bogie has brake discs and springs, motors only on a motor bogie, in a bounded triangle count', () => {
  const spec = { radius: 0.43, wheelbase: 2.6, track: FIGURES.gauge.value };
  const motor = bogieSoup({ ...spec, motor: true });
  const trailer = bogieSoup({ ...spec, motor: false });
  const count = (s: { pos: number[] }): number => s.pos.length / 9;
  assert.ok(count(motor) > count(trailer) + 100, `a motor bogie has its traction motors: ${count(motor)} vs ${count(trailer)} triangles`);
  for (const s of [motor, trailer]) assert.ok(count(s) > 1200 && count(s) < 2600, `bogie triangles ${count(s)}`);
  // the flange: the lowest point is FLANGE_HEIGHT under the tread, which touches the rail head at 0. A wheel flange stands about 28 mm
  // proud of the tread (a typical UK profile; not looked up, so a range, not a pin).
  assert.ok(FLANGE_HEIGHT >= 0.022 && FLANGE_HEIGHT <= 0.034, `flange ${FLANGE_HEIGHT} m is not a wheel flange`);
  const ys = trailer.pos.filter((_, i) => i % 3 === 1);
  near(Math.min(...ys), -FLANGE_HEIGHT, 1e-6, 'flange depth');
  assert.ok(ys.filter((y) => Math.abs(y) < 1e-6).length > 0, 'the tread touches the rail head');
  // and the top of the wheel is a flange high above the tread's top (the axle is at the wheel's radius). Look only at the flange's own
  // place, inboard of the tread, where nothing else of the bogie rises as high (the air springs stand outboard and higher).
  const flangeBand = trailer.pos.filter((_, i) => i % 3 === 1 && Math.abs(trailer.pos[i - 1] as number) > spec.track / 2 - 0.1 && Math.abs(trailer.pos[i - 1] as number) < spec.track / 2 - 0.017);
  near(Math.max(...flangeBand), 2 * spec.radius + FLANGE_HEIGHT, 1e-6, 'flange top');
  // air springs under the body: outboard of the wheels and standing higher than any wheel reaches
  // CHANGED (the bogie rebuild): the old bogie drew four air springs, one in each corner, each higher than the rest of the bogie. The photographs
  // (lner-gwr800-bogie-detail-2017.jpg, tl700_03_gatwick_bogie_28898326470.jpg) show one air spring over the middle of each side beam, and the new
  // side beam is itself taller than the wheel (it carries the springs), so the air springs are found as the very top of the bogie: two, one each side,
  // outboard of the wheels and centred on the middle of the bogie.
  const topY = Math.max(...ys);
  assert.ok(topY > 2 * spec.radius + FLANGE_HEIGHT + 0.012, `the air springs stand ${topY} m high, no higher than a wheel`);
  const springSides = new Set<number>();
  let springReach = 0;
  for (let i = 0; i < trailer.pos.length; i += 3) {
    if ((trailer.pos[i + 1] as number) < topY - 0.01) continue;
    assert.ok(Math.abs(trailer.pos[i] as number) > spec.track / 2 + 0.05, 'the top of the bogie is outboard of the wheels');
    springSides.add(Math.sign(trailer.pos[i] as number));
    springReach = Math.max(springReach, Math.abs(trailer.pos[i + 2] as number));
  }
  assert.deepEqual([...springSides].sort(), [-1, 1], 'an air spring on each side of the bogie');
  assert.ok(springReach < 0.2, `the air springs are ${springReach} m from the middle of the bogie`);
  // brake discs: two a side of the middle on each axle, between the wheels, smaller than the wheel but not a hub (ASSUMED 0.29 m radius:
  // an axle-mounted disc is about 0.6 m across on a UK EMU; not looked up). Measure the vertices lying in the disc's plane, from the axles.
  assert.ok(DISC_RADIUS >= 0.25 && DISC_RADIUS <= 0.35, `brake disc radius ${DISC_RADIUS}`);
  const inDisc: number[] = [];
  for (let i = 0; i < trailer.pos.length; i += 3) {
    if (Math.abs(Math.abs(trailer.pos[i] as number) - 0.3) > 0.0135) continue;
    const dz = Math.min(...[-spec.wheelbase / 2, spec.wheelbase / 2].map((az) => Math.abs((trailer.pos[i + 2] as number) - az)));
    inDisc.push(Math.hypot((trailer.pos[i + 1] as number) - spec.radius, dz));
  }
  assert.ok(inDisc.length >= 4 * 16, `${inDisc.length} vertices of brake discs`);
  near(Math.max(...inDisc), DISC_RADIUS, 0.002, 'brake disc radius in the geometry');
  // the geometry is built once per spec and shared
  const a = buildBogie({ ...spec, motor: true });
  const b = buildBogie({ ...spec, motor: true });
  assert.equal((named(a, 'bogie-mesh') as THREE.Mesh).geometry, (named(b, 'bogie-mesh') as THREE.Mesh).geometry);
  assert.notEqual((named(a, 'bogie-mesh') as THREE.Mesh).geometry, (named(buildBogie({ ...spec, motor: false }), 'bogie-mesh') as THREE.Mesh).geometry);
});

test('bogies: every wheel is the size and spacing its family and bogie type give, and the geometry is shared', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const fig = layout.spec.family === 'at300' ? null : emuFig(kind);
    const geometries = new Set<THREE.BufferGeometry>();
    // the bogie geometry is shared, so the wheels of each (geometry, marker) pair are measured once
    const treadsMeasured = new Set<string>();
    for (const car of layout.cars) {
      car.bogies.forEach((z, k) => {
        const bogie = named(g, `bogie-${car.index}-${k}`);
        near(worldPos(bogie).z, z, 1e-9, `${kind} bogie ${car.index}-${k}`);
        const radius = fig ? fig.wheelDiameter.value / 2 : FIGURES.wheelDiameter.value / 2;
        const wheelbase = fig ? (car.motor[k] ? fig.wheelbaseMotor.value : fig.wheelbaseTrailer.value) : FIGURES.bogieWheelbase.value;
        const wheels = bogie.children.filter((c) => c.name === 'wheel');
        assert.equal(wheels.length, 4);
        for (const w of wheels) {
          near(w.userData.radius as number, radius, 1e-9, `${kind} wheel radius`);
          near(Math.abs(w.position.z), wheelbase / 2, 1e-9, `${kind} axle spacing`);
          assert.equal(w.userData.flange, FLANGE_HEIGHT);
        }
        // the markers are what the tests and the live layer read, the mesh is what is drawn: each level of the bogie mesh has its wheel tread
        // where the marker says. On each edge of the tread there is a ring of vertices at the marker's radius about its axle, and the ring
        // reaches the rail head, the top of the wheel, and a radius fore and aft of the axle
        for (const mesh of all(bogie, 'bogie-mesh') as THREE.Mesh[]) {
          const lod = mesh.userData.lod as string;
          const pos = mesh.geometry.getAttribute('position');
          for (const w of wheels) {
            const key = `${mesh.geometry.uuid}/${w.position.x}/${w.position.y}/${w.position.z}`;
            if (treadsMeasured.has(key)) continue;
            treadsMeasured.add(key);
            for (const edge of [-1, 1]) {
              const ring: [number, number][] = [];
              for (let i = 0; i < pos.count; i++) {
                if (Math.abs(pos.getX(i) - (w.position.x + edge * WHEEL_HALF)) > 1e-4) continue;
                const up = pos.getY(i) - w.position.y;
                const along = pos.getZ(i) - w.position.z;
                if (Math.abs(Math.hypot(up, along) - radius) < 1e-4) ring.push([up, along]);
              }
              const where = `${kind} ${lod} bogie mesh, wheel marked at x ${w.position.x}, z ${w.position.z}, tread edge x ${w.position.x + edge * WHEEL_HALF}`;
              assert.ok(ring.length > 0, `${where}: no vertex at the marker's radius ${radius} from its axle, so the mesh has no wheel where the marker is`);
              near(Math.max(...ring.map((v) => v[1])), radius, 1e-4, `${where}: the tread reaches a radius fore of the axle`);
              near(Math.min(...ring.map((v) => v[1])), -radius, 1e-4, `${where}: the tread reaches a radius aft of the axle`);
              near(Math.max(...ring.map((v) => v[0])), radius, 1e-4, `${where}: the top of the wheel is a radius above the axle`);
              near(Math.min(...ring.map((v) => v[0])), -radius, 1e-4, `${where}: the tread touches the rail head, a radius under the axle`);
            }
          }
        }
        geometries.add((named(bogie, 'bogie-mesh') as THREE.Mesh).geometry);
      });
    }
    // motor and trailer, a longer or shorter wheelbase: never one geometry per bogie
    assert.ok(geometries.size <= 4 && geometries.size < layout.cars.length * 2, `${kind}: ${geometries.size} bogie geometries`);
  }
});

test('bogies: a driven bogie of the diesel Class 180 has a final-drive gearbox on each axle and a cardan shaft between them, not traction motors, on the same wheels', () => {
  const spec = { radius: 0.42, wheelbase: 2.7, track: FIGURES.gauge.value };
  // CHANGED (the bogie rebuild): a bogie is drawn in its maker's style and a diesel bogie defaults to the Alstom's, so the electric and trailer bogies it is
  // compared with are given that style too: the three differ in their drive and in nothing else.
  const diesel = bogieSoup({ ...spec, motor: true, diesel: true });
  const electric = bogieSoup({ ...spec, motor: true, style: 'alstom' });
  const trailer = bogieSoup({ ...spec, motor: false, style: 'alstom' });
  const count = (s: Soup): number => s.pos.length / 9;
  assert.ok(count(diesel) > count(trailer) + 40 && count(diesel) < 2600, `a diesel driven bogie: ${count(diesel)} triangles against a trailer's ${count(trailer)}`);
  // a trailer bogie is a trailer bogie, whatever the unit drives it with
  assert.deepEqual(bogieSoup({ ...spec, motor: false, diesel: true }).pos, trailer.pos);
  type V = [number, number, number];
  const verts = (s: Soup): V[] => Array.from({ length: s.pos.length / 3 }, (_, i): V => [s.pos[3 * i] as number, s.pos[3 * i + 1] as number, s.pos[3 * i + 2] as number]);
  // traction motors (electric): a motor across the bogie behind each axle, its ring of vertices 0.31 m either side of the middle
  assert.ok(verts(electric).some((v) => Math.abs(Math.abs(v[0]) - 0.31) < 1e-5), 'the electric bogie has its traction motors');
  assert.ok(!verts(diesel).some((v) => Math.abs(Math.abs(v[0]) - 0.31) < 1e-5), 'the diesel bogie has no traction motor');
  // the gearboxes: a box on each axle, 0.6 m across and 0.44 m long, hanging 0.2 m below the axle line to 0.2 above it
  const gearbox = verts(diesel).filter((v) => Math.abs(Math.abs(v[0]) - 0.3) < 1e-9 && Math.abs(v[1] - (spec.radius - 0.2)) < 1e-9);
  assert.deepEqual([...new Set(gearbox.map((v) => Math.round(v[2] * 1000) / 1000))].sort((a, b) => a - b), [-1.57, -1.13, 1.13, 1.57], 'a gearbox 0.44 m long on each axle');
  // the cardan shaft: a thin cylinder along the middle of the bogie, from the one gearbox to the other
  const shaft = verts(diesel).filter((v) => Math.abs(v[0]) < 0.05);
  assert.ok(shaft.length >= 8, 'a cardan shaft along the middle');
  near(Math.min(...shaft.map((v) => v[2])), -(spec.wheelbase - 0.44) / 2, 1e-6, 'the shaft starts at the one gearbox');
  near(Math.max(...shaft.map((v) => v[2])), (spec.wheelbase - 0.44) / 2, 1e-6, 'and ends at the other');
  assert.ok(!verts(electric).some((v) => Math.abs(v[0]) < 0.05 && Math.abs(v[2]) > 0.5 && Math.abs(v[2]) < 1.0 && Math.abs(v[1] - (spec.radius + 0.08)) < 0.05), 'the electric bogie has no cardan shaft');
  // the same wheels: the tread, the flange and the web are untouched
  for (const s of [diesel, trailer]) {
    const ys = verts(s).map((v) => v[1]);
    near(Math.min(...ys), -FLANGE_HEIGHT, 1e-6, 'flange depth');
  }
  // the unit's own cache: a diesel bogie is its own geometry, a trailer's does not depend on it, and the far one is the same bare bogie
  const near1 = buildBogie({ ...spec, motor: true, diesel: true });
  // CHANGED (the bogie rebuild): the same style, or the far bogies would differ by their colours
  const near2 = buildBogie({ ...spec, motor: true, diesel: false, style: 'alstom' });
  const meshes = (g: THREE.Object3D, lod: string): THREE.Mesh => all(g, 'bogie-mesh').find((m) => m.userData.lod === lod) as THREE.Mesh;
  assert.notEqual(meshes(near1, 'near').geometry, meshes(near2, 'near').geometry);
  assert.equal(meshes(near1, 'far').geometry, meshes(near2, 'far').geometry);
  // and the Class 180 car draws it on its driven bogie only: the geometry of bogie k follows the car's motor flag
  const g = built('gc180x5');
  const layout = trainLayout('gc180x5');
  for (const car of layout.cars) {
    const geo = car.bogies.map((_, k) => meshes(named(g, `bogie-${car.index}-${k}`), 'near').geometry);
    assert.equal(car.motor.filter(Boolean).length, 1, `car ${car.index}: one driven bogie`);
    assert.notEqual(geo[0], geo[1], `car ${car.index}: the driven bogie is not the trailer's geometry`);
  }
  // as built: the 180's driven bogie has no traction motors and has the shaft; its trailer bogie has neither
  const xs = (geo: THREE.BufferGeometry): number[] => Array.from({ length: geo.getAttribute('position').count }, (_, i) => (geo.getAttribute('position') as THREE.BufferAttribute).getX(i));
  for (const car of layout.cars) {
    const driven = meshes(named(g, `bogie-${car.index}-${car.motor.findIndex(Boolean)}`), 'near').geometry;
    assert.ok(!xs(driven).some((x) => Math.abs(Math.abs(x) - 0.31) < 1e-5), `car ${car.index}: the driven bogie has traction motors`);
    assert.ok(xs(driven).filter((x) => Math.abs(x) < 0.05).length >= 8, `car ${car.index}: the driven bogie has no cardan shaft`);
  }
  // an electric unit has no diesel bogie: the 387's motor bogie is the one with traction motors
  const e = built('gn387x4');
  const motorCar = trainLayout('gn387x4').cars.find((c) => c.type === 'MSO') as Car;
  const bogieGeo = (k: number): THREE.BufferGeometry => meshes(named(e, `bogie-${motorCar.index}-${k}`), 'near').geometry;
  const motorK = motorCar.motor.findIndex(Boolean);
  const pos = (geo: THREE.BufferGeometry): THREE.BufferAttribute => geo.getAttribute('position') as THREE.BufferAttribute;
  assert.ok(Array.from({ length: pos(bogieGeo(motorK)).count }, (_, i) => Math.abs(Math.abs(pos(bogieGeo(motorK)).getX(i)) - 0.31) < 1e-5).some(Boolean), 'the electric motor bogie has traction motors');
});

test('bogies: far off, a bogie is drawn bare: wheels, side frames and a transom, a tenth of the triangles, on the same wheels', () => {
  for (const spec of [{ radius: 0.43, wheelbase: 2.6 }, { radius: 0.41, wheelbase: 2.2 }, { radius: 0.42, wheelbase: 2.7 }]) {
    const full = { ...spec, track: FIGURES.gauge.value };
    const far = bogieFarSoup(full);
    const nearSoup = bogieSoup({ ...full, motor: true });
    const nFar = far.pos.length / 9;
    const nNear = nearSoup.pos.length / 9;
    assert.ok(nFar >= 100 && nFar <= 300, `${nFar} triangles in a far bogie`);
    assert.ok(nFar * 8 < nNear, `${nFar} triangles far against ${nNear} near: not a saving of 8 to 1`);
    // the same wheels: the tread touches the rail head, and the wheel stands where the full bogie's does
    const verts = Array.from({ length: far.pos.length / 3 }, (_, i) => [far.pos[3 * i] as number, far.pos[3 * i + 1] as number, far.pos[3 * i + 2] as number]);
    near(Math.min(...verts.map((v) => v[1])), 0, 1e-6, 'the far wheels touch the rail head');
    const wheel = verts.filter((v) => Math.abs(Math.abs(v[0]) - (full.track / 2 + WHEEL_HALF)) < 1e-6 || Math.abs(Math.abs(v[0]) - (full.track / 2 - WHEEL_HALF)) < 1e-6);
    near(Math.max(...wheel.map((v) => v[1])), 2 * spec.radius, 1e-6, 'the far wheel is as tall as the near one');
    for (const az of [-spec.wheelbase / 2, spec.wheelbase / 2]) {
      const mine = wheel.filter((v) => Math.abs(v[2] - az) <= spec.radius + 1e-6);
      assert.ok(mine.length > 0, `a far wheel at the axle ${az}`);
      near(Math.max(...mine.map((v) => v[2])) - az, spec.radius, 1e-6, 'the far wheel reaches a radius to the front');
      near(az - Math.min(...mine.map((v) => v[2])), spec.radius, 1e-6, 'and a radius to the back');
    }
    // nothing beyond the near bogie's outline: not wider, not longer, not taller
    const nearVerts = Array.from({ length: nearSoup.pos.length / 3 }, (_, i) => [nearSoup.pos[3 * i] as number, nearSoup.pos[3 * i + 1] as number, nearSoup.pos[3 * i + 2] as number]);
    for (const k of [0, 1, 2]) {
      assert.ok(Math.max(...verts.map((v) => Math.abs(v[k] as number))) <= Math.max(...nearVerts.map((v) => Math.abs(v[k] as number))) + 1e-6, `the far bogie is bigger than the near one along axis ${k}`);
    }
    // it carries no flange, motor, axle, disc or spring: only its own wheel tread depth under the rail head
    assert.ok(Math.min(...verts.map((v) => v[1])) >= -1e-6, 'no flange');
  }
});

test('bogies: the level of detail swaps the full bogie for the bare one beyond BOGIE_LOD_DISTANCE, and a build-time override moves or removes the swap', () => {
  const spec = { radius: 0.43, wheelbase: 2.6, track: FIGURES.gauge.value, motor: true };
  assert.equal(BOGIE_LOD_DISTANCE, 150);
  const b = buildBogie(spec);
  const lod = named(b, 'bogie-lod') as THREE.LOD;
  assert.ok(lod.isLOD, 'a THREE.LOD, so the renderer picks the level');
  assert.equal(lod.levels.length, 2);
  assert.equal(lod.levels[0]?.distance, 0);
  assert.equal(lod.levels[1]?.distance, BOGIE_LOD_DISTANCE);
  assert.equal(lod.levels[0]?.object.userData.lod, 'near');
  assert.equal(lod.levels[1]?.object.userData.lod, 'far');
  // both levels are meshes called `bogie-mesh` (a caller that spares the bogie geometry when it disposes a train spares both), the near one first
  const meshes = all(b, 'bogie-mesh') as THREE.Mesh[];
  assert.equal(meshes.length, 2);
  assert.equal(meshes.filter((m) => m.userData.lod === 'near').length, 1);
  assert.ok(lod.levels[0]?.object.visible && !lod.levels[1]?.object.visible, 'before the first frame: near drawn, far hidden');
  // the four wheel markers are beside the LOD, in the bogie's own group, not under a level (a level is hidden half the time)
  assert.equal(b.children.filter((c) => c.name === 'wheel').length, 4);
  assert.ok(!all(lod, 'wheel').length);
  // the renderer calls update(camera): at 100 m the full bogie, at 200 m the bare one
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 9000);
  for (const [distance, wantFar] of [[10, false], [149, false], [151, true], [500, true]] as const) {
    camera.position.set(0, 2, distance);
    camera.updateMatrixWorld(true);
    b.updateMatrixWorld(true);
    lod.update(camera);
    assert.equal(lod.levels[0]?.object.visible, !wantFar, `${distance} m: near level`);
    assert.equal(lod.levels[1]?.object.visible, wantFar, `${distance} m: far level`);
  }
  // a clone keeps the markers and the levels (the live layer may clone a bogie or a car)
  const copy = b.clone(true);
  assert.equal(copy.children.filter((c) => c.name === 'wheel').length, 4);
  const lod2 = named(copy, 'bogie-lod') as THREE.LOD;
  assert.equal(lod2.levels.length, 2);
  assert.equal((lod2.levels[0]?.object as THREE.Mesh).geometry, (lod.levels[0]?.object as THREE.Mesh).geometry);
  assert.equal((lod2.levels[1]?.object as THREE.Mesh).geometry, (lod.levels[1]?.object as THREE.Mesh).geometry);
  // the override: built into the next bogie, read from globalThis (so a page can A/B the saving on one build)
  const g = globalThis as { __kxBogieLodDistance?: unknown };
  try {
    g.__kxBogieLodDistance = Infinity;
    assert.equal((named(buildBogie(spec), 'bogie-lod') as THREE.LOD).levels[1]?.distance, Infinity);
    g.__kxBogieLodDistance = 40;
    assert.equal((named(buildBogie(spec), 'bogie-lod') as THREE.LOD).levels[1]?.distance, 40);
    for (const junk of [-5, Number.NaN, 'near', null, undefined]) {
      g.__kxBogieLodDistance = junk;
      assert.equal((named(buildBogie(spec), 'bogie-lod') as THREE.LOD).levels[1]?.distance, BOGIE_LOD_DISTANCE, `override ${String(junk)} is ignored`);
    }
  } finally {
    delete g.__kxBogieLodDistance;
  }
  assert.equal((named(buildBogie(spec), 'bogie-lod') as THREE.LOD).levels[1]?.distance, BOGIE_LOD_DISTANCE);
});

test('bogies: a train far from the camera draws the same calls and far fewer triangles, a train beside it is unchanged, and the swap is per bogie', () => {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 9000);
  const settle = (g: THREE.Object3D, z: number): void => {
    camera.position.set(0, 2, z);
    camera.updateMatrixWorld(true);
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if ((o as THREE.LOD).isLOD) (o as THREE.LOD).update(camera);
    });
  };
  const drawn = (g: THREE.Object3D): { calls: number; triangles: number } => {
    let calls = 0;
    let triangles = 0;
    g.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      calls++;
      triangles += m.geometry.getAttribute('position').count / 3;
    });
    return { calls, triangles };
  };
  for (const kind of ['lner9', 'gn387x4', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    // all near: the camera in the middle of the train, which is under 150 m long
    settle(g, layout.length / 2);
    const closeBy = drawn(g);
    assert.equal(closeBy.triangles, triCount(g), `${kind}: beside the camera, every near level is drawn`);
    // all far: 400 m off
    settle(g, -400);
    const faraway = drawn(g);
    assert.equal(faraway.calls, closeBy.calls, `${kind}: far off the same number of draw calls`);
    assert.ok(faraway.triangles < closeBy.triangles * 0.75, `${kind}: ${faraway.triangles} triangles far off, ${closeBy.triangles} near: under a quarter saved`);
    // the saving is the bogies' alone: what the bodies draw does not change
    let bogies = 0;
    let farBogies = 0;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.name === 'bogie-mesh') {
        const n = m.geometry.getAttribute('position').count / 3;
        if (isFar(m)) farBogies += n;
        else bogies += n;
      }
    });
    near(closeBy.triangles - faraway.triangles, bogies - farBogies, 1e-9, `${kind}: the saving is the near bogies less the far ones`);
  }
  // a long train swaps bogie by bogie: the ones past 150 m of the camera are bare, the near ones are full
  const long = built('tl700x12');
  settle(long, 0);
  let nearOnes = 0;
  let farOnes = 0;
  const layout = trainLayout('tl700x12');
  for (const car of layout.cars) {
    car.bogies.forEach((z, k) => {
      const lod = named(named(long, `bogie-${car.index}-${k}`), 'bogie-lod') as THREE.LOD;
      const dist = Math.hypot(z, 2);
      const isFarNow = lod.levels[1]?.object.visible === true;
      assert.equal(isFarNow, dist >= BOGIE_LOD_DISTANCE, `bogie ${car.index}-${k} at ${dist.toFixed(0)} m is ${isFarNow ? 'far' : 'near'}`);
      assert.equal(lod.levels[0]?.object.visible, !isFarNow);
      if (isFarNow) farOnes++;
      else nearOnes++;
    });
  }
  assert.ok(nearOnes > 5 && farOnes > 5, `${nearOnes} near and ${farOnes} far bogies on a 242 m train`);
});

// --- the rebuilt bogies: wheels, axles, drives, budgets, envelope, clearance -------------------------------------------------------

/**
 * Every bogie the model draws, as its maker's style and the sizes its family gives it (core/train.ts: wheel diameter, motor and trailer wheelbase):
 * the Hitachi AT300 (Class 800/801), the Electrostar (387), the Siemens SF7000 (700 and 717) and the Class 180's. Each as a motor and a trailer bogie.
 */
const BOGIE_CASES: { label: string; spec: BogieSpec }[] = [];
for (const [label, style, radius, wheelbase, diesel] of [
  ['Hitachi AT300', 'hitachi', 0.43, 2.6, false],
  ['Electrostar', 'electrostar', 0.42, 2.7, false],
  ['Siemens motor', 'siemens', 0.41, 2.2, false],
  ['Siemens trailer', 'siemens', 0.41, 2.1, false],
  ['Class 180', 'alstom', 0.42, 2.7, true],
] as const) {
  for (const motor of [true, false]) BOGIE_CASES.push({ label: `${label} ${motor ? 'motor' : 'trailer'}`, spec: { radius, wheelbase, track: FIGURES.gauge.value, motor, style, ...(diesel ? { diesel } : {}) } });
}
type V3t = [number, number, number];
const vertsOf = (s: Soup): V3t[] => Array.from({ length: s.pos.length / 3 }, (_, i): V3t => [s.pos[3 * i] as number, s.pos[3 * i + 1] as number, s.pos[3 * i + 2] as number]);
const trisOf = (s: Soup): number => s.pos.length / 9;
const axleZs = (spec: BogieSpec): number[] => [-spec.wheelbase / 2, spec.wheelbase / 2];

test('bogie wheels: the tread and the flange of every wheel are 40 or more sides round in the near level, 12 or more in the far one, in every style', () => {
  assert.ok(WHEEL_SEGMENTS >= 40, `${WHEEL_SEGMENTS} sides to a wheel`);
  assert.ok(FAR_WHEEL_SEGMENTS >= 12, `${FAR_WHEEL_SEGMENTS} sides to a far wheel`);
  // the distinct places round the axle that carry a vertex at `radius` from it, in the plane at `x` (or anywhere within 0.1 m of the wheel's own plane when x is null)
  const sides = (verts: V3t[], cx: number, az: number, r: number, x: number | null, radius: number): number => {
    const angles = new Set<number>();
    for (const [vx, vy, vz] of verts) {
      if (x === null ? Math.abs(vx - cx) > 0.1 : Math.abs(vx - x) > 1e-9) continue;
      if (Math.abs(Math.hypot(vy - r, vz - az) - radius) > 1e-9) continue;
      angles.add(Math.round(Math.atan2(vz - az, vy - r) * 1e6));
    }
    return angles.size;
  };
  for (const { label, spec } of BOGIE_CASES) {
    const nearVerts = vertsOf(bogieParts(spec).wheels);
    const farVerts = vertsOf(bogieFarSoup(spec));
    for (const az of axleZs(spec)) {
      for (const sx of [-1, 1]) {
        const cx = (sx * spec.track) / 2;
        for (const edge of [-1, 1]) {
          assert.ok(sides(nearVerts, cx, az, spec.radius, cx + edge * WHEEL_HALF, spec.radius) >= 40, `${label}: the near tread's edge at ${edge} of the wheel at x ${cx}, z ${az} is under 40 sides round`);
          assert.ok(sides(farVerts, cx, az, spec.radius, cx + edge * WHEEL_HALF, spec.radius) >= 12, `${label}: the far tread's edge at ${edge} of the wheel at x ${cx}, z ${az} is under 12 sides round`);
        }
        assert.ok(sides(nearVerts, cx, az, spec.radius, null, spec.radius + FLANGE_HEIGHT) >= 40, `${label}: the flange of the wheel at x ${cx}, z ${az} is under 40 sides round`);
      }
    }
  }
});

test('bogie wheels and axles: each wheel stands on its axle with its tread bottom on the rail head and its flange a flange-height under it, and the axle runs through the pair', () => {
  for (const { label, spec } of BOGIE_CASES) {
    const parts = bogieParts(spec);
    const wheels = vertsOf(parts.wheels);
    near(Math.min(...wheels.map((v) => v[1])), -FLANGE_HEIGHT, 1e-9, `${label}: the flange dips below the rail head`);
    near(Math.max(...wheels.map((v) => v[1])), 2 * spec.radius + FLANGE_HEIGHT, 1e-9, `${label}: the top of the flange`);
    for (const az of axleZs(spec)) {
      for (const sx of [-1, 1]) {
        const cx = (sx * spec.track) / 2;
        // this wheel's vertices: its own plane and the length of its axle either side of it, not the neighbours'
        const mine = wheels.filter((v) => Math.abs(v[0] - cx) < 0.12 && Math.abs(v[2] - az) < spec.radius + FLANGE_HEIGHT + 1e-6);
        assert.ok(mine.length >= 4 * 40, `${label}: ${mine.length} vertices in the wheel at x ${cx}, z ${az}`);
        near(Math.min(...mine.map((v) => v[2])), az - spec.radius - FLANGE_HEIGHT, 1e-9, `${label}: the flange reaches a radius aft of the axle`);
        near(Math.max(...mine.map((v) => v[2])), az + spec.radius + FLANGE_HEIGHT, 1e-9, `${label}: and a radius forward`);
        assert.ok(mine.some((v) => Math.abs(v[1]) < 1e-9 && Math.abs(v[0] - cx) <= WHEEL_HALF + 1e-9), `${label}: the tread of the wheel at x ${cx}, z ${az} has a vertex on the rail head`);
        // the whole wheel is within the tread width and the flange, hub and web either side of it, centred on the rail
        assert.ok(mine.every((v) => v[0] - cx > -0.1 && v[0] - cx < 0.1), `${label}: the wheel at x ${cx} is thicker than 0.2 m`);
      }
      // the axle: a bare cylinder about the axle line from one wheel to the other
      const axle = vertsOf(parts.axles).filter((v) => Math.abs(v[2] - az) < 0.2);
      assert.ok(axle.length >= 16, `${label}: no axle at z ${az}`);
      const radii = axle.map((v) => Math.hypot(v[1] - spec.radius, v[2] - az));
      near(Math.max(...radii), Math.min(...radii), 1e-9, `${label}: the axle at z ${az} is round about the wheels' centre line`);
      assert.ok(radii[0]! > 0.04 && radii[0]! < 0.12, `${label}: an axle of radius ${radii[0]} m`);
      assert.ok(Math.min(...axle.map((v) => v[0])) <= -spec.track / 2 && Math.max(...axle.map((v) => v[0])) >= spec.track / 2, `${label}: the axle at z ${az} does not reach both wheels`);
    }
  }
});

test('bogie drives: a motor bogie has traction motors a trailer bogie lacks, and the same wheels, axles, discs and frame', () => {
  for (const { label, spec } of BOGIE_CASES) {
    const parts = bogieParts(spec);
    const twin = bogieParts({ ...spec, motor: !spec.motor });
    const [motor, trailer] = spec.motor ? [parts, twin] : [twin, parts];
    assert.ok(trisOf(motor.drive) >= 100, `${label}: a motor bogie's drive is ${trisOf(motor.drive)} triangles`);
    assert.equal(trisOf(trailer.drive), 0, `${label}: a trailer bogie carries no traction motor or gearbox`);
    for (const part of ['wheels', 'axles', 'brakes', 'frame', 'springs'] as const) assert.deepEqual(motor[part].pos, trailer[part].pos, `${label}: a motor bogie's ${part} are a trailer's`);
    // brake discs on both: two a side of the middle on each axle, in the plane |x| = 0.3, the callipers on them
    const discs = vertsOf(trailer.brakes).filter((v) => Math.abs(Math.abs(v[0]) - 0.3) <= DISC_THICKNESS / 2 + 1e-9);
    assert.ok(discs.length >= 4 * 12 * 2, `${label}: ${discs.length} vertices in the brake discs of a trailer bogie`);
  }
});

test('bogie budgets: a near bogie is at most 2,600 triangles (a motor bogie) or 2,400 (a trailer), a far one at most 300, in every style', () => {
  for (const { label, spec } of BOGIE_CASES) {
    const nearN = trisOf(bogieSoup(spec));
    const farN = trisOf(bogieFarSoup(spec));
    assert.ok(nearN <= (spec.motor ? 2600 : 2400), `${label}: ${nearN} triangles in the near bogie`);
    assert.ok(nearN >= 1800, `${label}: ${nearN} triangles is too bare for a bogie that reads as one at three metres`);
    assert.ok(farN <= 300 && farN >= 100, `${label}: ${farN} triangles in the far bogie`);
    // the wheels are the bulk of it, and the rest is the frame, springs, discs and the drive
    assert.ok(trisOf(bogieParts(spec).wheels) >= 1000, `${label}: the wheels are ${trisOf(bogieParts(spec).wheels)} triangles`);
  }
});

test('bogie levels of detail: the far bogie has the near bogie\'s footprint, within it and reaching most of it, in every style', () => {
  for (const { label, spec } of BOGIE_CASES) {
    const nearV = vertsOf(bogieSoup(spec));
    const farV = vertsOf(bogieFarSoup(spec));
    for (const [axis, name] of [[0, 'width'], [2, 'length']] as const) {
      const nearReach = Math.max(...nearV.map((v) => Math.abs(v[axis])));
      const farReach = Math.max(...farV.map((v) => Math.abs(v[axis])));
      assert.ok(farReach <= nearReach + 1e-6, `${label}: the far bogie's ${name} ${farReach} is more than the near one's ${nearReach}`);
      assert.ok(farReach >= 0.9 * nearReach, `${label}: the far bogie's ${name} ${farReach} is under 90% of the near one's ${nearReach}: the silhouette would jump at the swap`);
    }
    const nearTop = Math.max(...nearV.map((v) => v[1]));
    const farTop = Math.max(...farV.map((v) => v[1]));
    assert.ok(farTop <= nearTop + 1e-6 && farTop >= 0.85 * nearTop, `${label}: the far bogie's top ${farTop} against the near one's ${nearTop}`);
    near(Math.min(...farV.map((v) => v[1])), 0, 1e-9, `${label}: the far wheels stand on the rail head`);
  }
});

test('bogie envelope: nothing is wider than 1.15 m from the centre line or reaches the body floor, nothing but a flange is under the rail head, and no part is longer than its wheels', () => {
  assert.ok(BOGIE_HALF_WIDTH <= 1.15 && BOGIE_TOP < 0.98, `the envelope constants ${BOGIE_HALF_WIDTH} and ${BOGIE_TOP}`);
  for (const { label, spec } of BOGIE_CASES) {
    for (const [level, soup] of [['near', bogieSoup(spec)], ['far', bogieFarSoup(spec)]] as const) {
      const verts = vertsOf(soup);
      assert.ok(Math.max(...verts.map((v) => Math.abs(v[0]))) <= 1.15, `${label} ${level}: wider than 1.15 m`);
      // the lowest body floor of any family is 0.98 m (the electric multiple units and the Class 180); the AT300's is 1.0 m
      assert.ok(Math.max(...verts.map((v) => v[1])) < 0.98, `${label} ${level}: ${Math.max(...verts.map((v) => v[1]))} m reaches the body floor`);
      assert.ok(Math.max(...verts.map((v) => Math.abs(v[2]))) <= spec.wheelbase / 2 + spec.radius + FLANGE_HEIGHT + 1e-9, `${label} ${level}: a part is longer than the wheels reach`);
    }
    // nothing but the wheels' own flanges is under the rail head
    for (const part of ['axles', 'brakes', 'frame', 'springs', 'drive'] as const) {
      const verts = vertsOf(bogieParts(spec)[part]);
      if (verts.length) assert.ok(Math.min(...verts.map((v) => v[1])) >= 0, `${label}: the ${part} reach under the rail head`);
    }
  }
});

test('bogie clearance: nothing but the axles passes through a wheel: not the discs, the frame, the springs nor the drive, in every style', () => {
  const inside = (spec: BogieSpec, p: V3t): boolean => {
    for (const az of axleZs(spec)) {
      for (const sx of [-1, 1]) {
        const cx = (sx * spec.track) / 2;
        if (Math.abs(p[0] - cx) < 0.1 - 1e-6 && Math.hypot(p[1] - spec.radius, p[2] - az) < spec.radius + FLANGE_HEIGHT - 1e-6) return true;
      }
    }
    return false;
  };
  for (const { label, spec } of BOGIE_CASES) {
    const parts = bogieParts(spec);
    for (const part of ['brakes', 'frame', 'springs', 'drive'] as const) {
      const v = vertsOf(parts[part]);
      // every triangle's corners, middles of edges and centroid: a box straddling a wheel has no corner inside it
      for (let t = 0; t + 2 < v.length; t += 3) {
        const [a, b, c] = [v[t], v[t + 1], v[t + 2]] as [V3t, V3t, V3t];
        const pts: V3t[] = [a, b, c, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2], [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2], [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]];
        for (const p of pts) assert.ok(!inside(spec, p), `${label}: the ${part} pass through a wheel at (${p.map((x) => x.toFixed(3)).join(', ')})`);
      }
    }
  }
});

test('bogie styles: absent a style a bogie is the Hitachi\'s, or the Alstom\'s if it is diesel; each style is its own geometry, shared by every bogie of it, and its far level too', () => {
  assert.equal(bogieStyle({}), 'hitachi');
  assert.equal(bogieStyle({ diesel: false }), 'hitachi');
  assert.equal(bogieStyle({ diesel: true }), 'alstom');
  for (const style of ['hitachi', 'electrostar', 'siemens', 'alstom'] as const) assert.equal(bogieStyle({ style }), style);
  assert.equal(bogieStyle({ style: 'siemens', diesel: true }), 'siemens', 'an explicit style wins');
  const spec = { radius: 0.42, wheelbase: 2.7, track: FIGURES.gauge.value, motor: true };
  const meshOf = (b: THREE.Object3D, lod: string): THREE.Mesh => all(b, 'bogie-mesh').find((m) => m.userData.lod === lod) as THREE.Mesh;
  const styles = ['hitachi', 'electrostar', 'siemens', 'alstom'] as const;
  for (const lod of ['near', 'far']) {
    const geos = styles.map((style) => meshOf(buildBogie({ ...spec, style }), lod).geometry);
    assert.equal(new Set(geos).size, 4, `${lod}: one geometry for each of the four styles`);
    styles.forEach((style, k) => assert.equal(meshOf(buildBogie({ ...spec, style }), lod).geometry, geos[k], `${lod}: two ${style} bogies share a geometry`));
  }
  // the styles differ where the photographs differ: the Siemens' inside frame keeps everything within the wheels' hubs, the others carry axle boxes and beams outboard of the wheels
  const reach = (style: BogieStyle): number => Math.max(...vertsOf(bogieSoup({ ...spec, style })).map((v) => Math.abs(v[0])));
  assert.ok(reach('siemens') <= spec.track / 2 + 0.12, `the Siemens bogie is ${reach('siemens')} m out`);
  for (const style of ['hitachi', 'electrostar', 'alstom'] as const) assert.ok(reach(style) >= 1.05, `the ${style} bogie is ${reach(style)} m out: no outside frame`);
  // and only the AT300 carries the yellow maintenance step the photograph shows
  const yellow = col(0xd9b11a);
  const hasYellow = (style: BogieStyle): boolean => {
    const s = bogieSoup({ ...spec, style });
    for (let i = 0; i < s.clr.length; i += 3) if (Math.abs((s.clr[i] as number) - yellow.r) < 1e-6 && Math.abs((s.clr[i + 1] as number) - yellow.g) < 1e-6 && Math.abs((s.clr[i + 2] as number) - yellow.b) < 1e-6) return true;
    return false;
  };
  assert.deepEqual(styles.map(hasYellow), [true, false, false, false]);
});

// --- liveries -------------------------------------------------------------------------------------

test('liveries: the side texture and the lettering atlas are sharp at three metres, by the numbers that size them', () => {
  const t = texelsPerMetre();
  // at 3 m, 50 degrees field of view and 800 px tall the screen shows about 290 px a metre: the texture must not be far under that
  assert.ok(t.along >= 150 && t.up >= 220, `side texture ${t.along} x ${t.up} texels a metre`);
  let texts = 0;
  for (const [name, def] of Object.entries(LIVERIES)) {
    for (const cab of [true, false]) {
      for (const item of def.decals({ index: 1, count: 6, cab, length: 25.85, nose: cab ? 5.4 : 0, doors: [3, 22.85] })) {
        if (!item.text) continue;
        texts++;
        const em = item.rect[3] - item.rect[1];
        assert.ok(ROW_H / em >= 180, `${name} "${item.text}": ${(ROW_H / em).toFixed(0)} texels a metre`);
        // the atlas gives the text the room its advance widths need
        const r = atlasRect(item.text);
        near((r.u1 - r.u0) * 2048, textEms(item.text) * ROW_H, 9, `${name} "${item.text}" atlas width`);
      }
    }
  }
  assert.ok(texts >= 8, `${texts} lettering decals seen`);
});

test('liveries: lettering reads left to right from outside on both sides, and stands just off the shell', () => {
  for (const kind of ['lner9', 'lumo5', 'hull5', 'gn387x4', 'gc180x5', 'tl700x8'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const solid = atlasRect(null);
    let lettered = 0;
    for (const car of layout.cars) {
      const mesh = all(named(g, `car-${car.index}`), 'livery-decals')[0] as THREE.Mesh | undefined;
      if (!mesh) continue;
      const p = mesh.geometry.getAttribute('position');
      const uv = mesh.geometry.getAttribute('uv');
      const n = mesh.geometry.getAttribute('normal');
      let sides = [0, 0];
      for (let i = 0; i + 2 < p.count; i += 3) {
        const side = p.getX(i) < 0 ? -1 : 1;
        // a solid patch (a flash, a band) takes its colour from one corner of the atlas, so the way its u runs means nothing; lettering does
        const flat = [0, 1, 2].every((k) => uv.getX(i + k) >= solid.u0 - 1e-6 && uv.getX(i + k) <= solid.u1 + 1e-6 && uv.getY(i + k) >= solid.v0 - 1e-6 && uv.getY(i + k) <= solid.v1 + 1e-6);
        if (!flat) {
          const du = [1, 2].map((k) => uv.getX(i + k) - uv.getX(i));
          const dz = [1, 2].map((k) => p.getZ(i + k) - p.getZ(i));
          const slope = (du[0] as number) * (dz[0] as number) + (du[1] as number) * (dz[1] as number);
          // viewed from outside, on the left (x < 0) the viewer's right is +z, on the right (x > 0) it is -z
          assert.ok(slope * side * -1 > 1e-12, `${kind} car ${car.index}: lettering on the ${side < 0 ? 'left' : 'right'} reads backwards (or not at all)`);
          lettered++;
        }
        sides[side < 0 ? 0 : 1]++;
        assert.ok(n.getX(i) * side > 0.99, `${kind} car ${car.index}: a decal faces away from its side`);
        const wall = carSection(bodySpec(layout.spec.family)).width;
        assert.ok(Math.abs(p.getX(i)) - wall > 0.001 && Math.abs(p.getX(i)) - wall < 0.012, `${kind} car ${car.index}: a decal ${Math.abs(p.getX(i))} m out, the wall at ${wall}`);
      }
      assert.ok(sides[0] > 0 && sides[0] === sides[1], `${kind} car ${car.index}: the same lettering on both sides (${sides})`);
    }
    assert.ok(lettered >= 8, `${kind}: only ${lettered} lettering triangles seen`);
  }
});

test('liveries: every livery names its sources and grades its colours, and the Great Northern guesses are flagged', () => {
  for (const [name, def] of Object.entries(LIVERIES)) {
    assert.ok(def.sources.length >= 1, `${name} cites at least one source`);
    assert.match(def.basis, /approximate|placeholder/i, `${name} says its shades are approximate`);
  }
  assert.ok(LIVERIES.greatnorthern.sources.length >= 2);
  // what the sources agree on: a light grey (or white) body with blue doors (Class 717 article; Wikipedia for the 387: "white, coloured doors")
  const luma = (c: number): number => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
  assert.ok(luma(LIVERIES.greatnorthern.body) > 0.7, `Great Northern body ${LIVERIES.greatnorthern.body.toString(16)} is not light`);
  assert.ok((LIVERIES.greatnorthern.door & 255) > ((LIVERIES.greatnorthern.door >> 16) & 255) + 0x20, `Great Northern doors ${LIVERIES.greatnorthern.door.toString(16)} are not blue`);
  // blue is a hue, not just "more blue than red": a sea-green or a teal door beats its red on blue too (the 387's original Southern green is
  // what the 717 article's pastel blue replaces). A blue door has its blue channel ahead of the green one as well
  const doorGreen = (LIVERIES.greatnorthern.door >> 8) & 255;
  assert.ok((LIVERIES.greatnorthern.door & 255) > doorGreen + 0x10, `Great Northern doors ${LIVERIES.greatnorthern.door.toString(16)} are not blue: green ${doorGreen} is not behind blue ${LIVERIES.greatnorthern.door & 255}`);
  // the cab front: pale like the body (the first version drew it dark all over, a guess no source backed; photographs show a white face), with a dark top and glass surround
  assert.match(LIVERIES.greatnorthern.basis, /pale cab front with a dark top and glass surround from two photographs; every shade approximate/);
  assert.equal(LIVERIES.greatnorthern.noseCone, null, 'no cone: the face and the cheeks are the body\'s colour');
  assert.ok(luma(LIVERIES.greatnorthern.noseFront) > 0.7, `Great Northern front ${LIVERIES.greatnorthern.noseFront.toString(16)} is not pale`);
  assert.ok(luma(LIVERIES.greatnorthern.noseBand) < 0.3, `Great Northern glass surround ${LIVERIES.greatnorthern.noseBand.toString(16)} is not dark`);
  assert.match(LIVERIES.greatnorthern.sources.join(' '), /Palmers Green.*Luton/);
  assert.match(LIVERIES.hulltrains.sources.join(' '), /grey\/black front nose cone/);
});

test('liveries: the Hull Trains cone is painted on the beak only, 1.6 m (ASSUMED) back from the tip, or the whole nose where that is shorter', () => {
  assert.equal(LIVERIES.hulltrains.noseConeLength, 1.6);
  // The texture is painted only in a browser. Give paint() a canvas that records its rectangles, ask for a nose length no other test builds (the material is cached by it).
  const rects: { style: string; x: number; y: number; w: number; h: number }[] = [];
  const ctx = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number): void {
      rects.push({ style: this.fillStyle, x, y, w, h });
    },
    beginPath(): void {},
    moveTo(): void {},
    lineTo(): void {},
    closePath(): void {},
    fill(): void {},
  };
  const host = globalThis as { document?: unknown };
  host.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  try {
    const cone = `#${LIVERIES.hulltrains.noseCone!.toString(16).padStart(6, '0')}`;
    const lastCone = (): { x: number; w: number } => {
      const r = rects.filter((q) => q.style === cone).at(-1);
      assert.ok(r, 'a cone rectangle was painted');
      return r;
    };
    const perMetre = TEX_W / TEX_SPAN;
    shellMaterial('hulltrains', 3.37);
    near(lastCone().x, 0, 1e-9, 'the cone starts at the tip');
    near(lastCone().w, 1.6 * perMetre, 1e-6, 'a 3.37 m nose wears the cone over its first 1.6 m only');
    rects.length = 0;
    shellMaterial('hulltrains', 1.07);
    near(lastCone().w, 1.07 * perMetre, 1e-6, 'a nose shorter than that wears it all over');
  } finally {
    delete host.document;
  }
});

const rgb =(c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const lumaOf = (c: number): number => (0.2126 * rgb(c)[0] + 0.7152 * rgb(c)[1] + 0.0722 * rgb(c)[2]) / 255;

test('liveries: Grand Central is black with a broad orange band and Thameslink light grey with cyan doors and a thin pink stripe, as their sources say', () => {
  const car = { index: 1, count: 5, cab: false, length: 23.03, nose: 0, doors: [3.8, 19.23] };
  // Grand Central: "an all black livery with doors painted gold (first class) and silver (standard class)" and "an orange band"
  const gc = LIVERIES.grandcentral;
  assert.ok(lumaOf(gc.body) < 0.15 && lumaOf(gc.noseFront) < 0.15 && lumaOf(gc.skirt) < 0.15, 'all black');
  const [r, gr, b] = rgb(gc.stripe as number);
  assert.ok(r > 0xd0 && gr > 0x50 && gr < 0xa0 && b < 0x40, `the band ${(gc.stripe as number).toString(16)} is not orange`);
  const [y0, y1] = gc.stripeY as [number, number];
  assert.ok(y1 - y0 >= 0.4 && y0 >= 0.9 && y1 <= 1.6, `the band ${y0}..${y1} m is not a broad one at the waist, under the windows`);
  const gold = rgb(gc.doorFor?.({ ...car, type: 'MFL' }) as number);
  assert.ok(gold[0] > 0xb0 && gold[0] > gold[1] && gold[1] > gold[2] + 0x40, `first-class doors ${gold} are not gold`);
  for (const type of ['DMSL', 'MSL', 'MSLRB']) {
    const silver = rgb(gc.doorFor?.({ ...car, type }) as number);
    assert.ok(Math.max(...silver) - Math.min(...silver) < 0x14 && Math.min(...silver) > 0x90, `${type} doors ${silver} are not silver`);
  }
  assert.match(gc.sources.join(' '), /all black livery with doors painted gold \(first class\) and silver \(standard class\)/);
  assert.match(gc.sources.join(' '), /orange band/);
  assert.match(gc.basis, /approximate/);
  const gcText = gc.decals(car).filter((d) => d.text);
  assert.deepEqual(gcText.map((d) => d.text), ['Grand Central']);
  assert.ok(lumaOf((gcText[0] as { colour: number }).colour) < 0.15, 'black lettering on the orange band');
  // Thameslink: "light grey with pastel blue doors and a white diagonal flash at the carriage ends"; cyan doors and a pink stripe from forum snippets
  const tl = LIVERIES.thameslink;
  assert.ok(lumaOf(tl.body) > 0.8, 'light grey');
  const door = rgb(tl.door);
  assert.ok(door[0] < 0x60 && door[1] > 0x80 && door[2] > 0xc0, `doors ${door} are not cyan`);
  const pink = rgb(tl.stripe as number);
  assert.ok(pink[0] > 0xc0 && pink[1] < 0x60 && pink[2] > 0x60, `the stripe ${pink} is not pink`);
  const [t0, t1] = tl.stripeY as [number, number];
  assert.ok(t1 - t0 > 0.05 && t1 - t0 < 0.2 && t1 <= 1.62, `the stripe ${t0}..${t1} m is not a thin one under the windows`);
  assert.match(tl.sources.join(' '), /light grey with pastel blue doors and a white diagonal flash at the carriage ends/);
  assert.match(tl.sources.join(' '), /yellow panel/);
  assert.match(tl.basis, /approximate/);
  // a white diagonal flash across the inner end of a cab car, across both ends of a through car, in opposite slants
  const flashes = (cab: boolean): { rect: number[]; skew?: number }[] => tl.decals({ ...car, cab, nose: cab ? 2.2 : 0 }).filter((d) => !d.text);
  assert.equal(flashes(true).length, 1);
  assert.equal(flashes(false).length, 2);
  assert.ok((flashes(false)[0]?.skew as number) * (flashes(false)[1]?.skew as number) < 0, 'the two flashes lean opposite ways');
  assert.deepEqual(tl.decals(car).filter((d) => d.text).map((d) => d.text), ['Thameslink']);
});

test('liveries: the Grand Central doors are gold on the first-class car and silver on the others, the Thameslink doors cyan on every car, as the leaves in the geometry', () => {
  const GOLD = 0xc9a227;
  const SILVER = 0xb9bec6;
  const CYAN = 0x34a9e1;
  const gcSpec = bodySpec('adelante');
  const g = built('gc180x5');
  const layout = trainLayout('gc180x5');
  for (const car of layout.cars) {
    const mesh = detailOf(g, car);
    // four doors a car, one leaf each, six faces of two triangles
    const per = 4 * gcSpec.doorLeaves * 12;
    assert.equal(trisOfColour(mesh, GOLD).length, car.type === 'MFL' ? per : 0, `${car.type} car ${car.index}: gold door leaves`);
    assert.equal(trisOfColour(mesh, SILVER).length, car.type === 'MFL' ? 0 : per, `${car.type} car ${car.index}: silver door leaves`);
  }
  assert.deepEqual(layout.cars.filter((c) => c.type === 'MFL').map((c) => c.index), [1], 'one first-class car');
  const t = built('tl700x8');
  const tlSpec = bodySpec('desiro700');
  for (const car of trainLayout('tl700x8').cars) assert.equal(trisOfColour(detailOf(t, car), CYAN).length, 4 * tlSpec.doorLeaves * 12, `Thameslink car ${car.index}: cyan door leaves`);
});

test('liveries: the lettering atlas has a row for every text any livery uses, rows within the sheet and apart, and the solid patch clear of them', () => {
  const texts = atlasTexts();
  for (const t of ['LNER', 'Great Northern', 'Grand Central', 'Thameslink']) assert.ok(texts.includes(t), `the atlas has no row for "${t}"`);
  // every decal text of every livery has its row (a missing one would read as row -1: off the sheet)
  for (const [name, def] of Object.entries(LIVERIES)) {
    for (const cab of [true, false]) {
      for (const index of [0, 1, 4]) {
        for (const item of def.decals({ index, count: 5, cab, length: 25, nose: cab ? 5 : 0, doors: [3, 22] })) if (item.text) assert.ok(texts.includes(item.text), `${name}: "${item.text}" is not in the atlas`);
      }
    }
  }
  // ... and for every car of the longest train the model builds, not a sample of them. A livery that names its cars (the Hull Trains towns, one a
  // car) asks for a different text on each; the sixth town is on a car that no five-car Hull set has but a coupled pair would
  const longest = Math.max(...ALL_KINDS.map((k) => trainLayout(k).cars.length));
  for (const [name, def] of Object.entries(LIVERIES)) {
    for (const cab of [true, false]) {
      for (let index = 0; index < longest; index++) {
        for (const item of def.decals({ index, count: longest, cab, length: 25, nose: cab ? 5 : 0, doors: [3, 22] })) if (item.text) assert.ok(texts.includes(item.text), `${name}: car ${index} of ${longest} (${cab ? 'cab' : 'through'}): "${item.text}" is not in the atlas`);
      }
    }
  }
  const rects = texts.map((t) => atlasRect(t));
  const solid = atlasRect(null);
  // the sheet is a row tall for every text, and one more for the solid patch: its height, from the patch's place in the bottom row
  const height = Math.round(24 / solid.v1);
  assert.equal(height, (texts.length + 1) * ROW_H, 'the sheet is a row for every text and one for the patch');
  assert.ok(height <= 4096, `the sheet is ${height} px tall: more than a phone's texture limit`);
  rects.forEach((r, i) => {
    assert.ok(r.u0 >= 0 && r.u1 <= 1 && r.v0 >= 0 && r.v1 <= 1 && r.u1 > r.u0 && r.v1 > r.v0, `"${texts[i]}" is off the sheet: ${JSON.stringify(r)}`);
    near((r.v1 - r.v0) * height, ROW_H, 1e-6, `"${texts[i]}" row height`);
    if (i > 0) assert.ok((rects[i - 1] as typeof r).v0 >= r.v1 - 1e-12, `"${texts[i]}" overlaps the row above it`);
    assert.ok(r.v0 >= solid.v1 + 0.0001, `"${texts[i]}" runs into the solid patch`);
  });
  // the sheet is big enough for the longest text
  for (const t of texts) assert.ok(textEms(t) * ROW_H + 8 <= 2048, `"${t}" is wider than the sheet`);
});

// --- the Great Northern units ---------------------------------------------------------------------------

/** Every commuter and regional unit: the Great Northern 387 and 717, the Grand Central 180 and the Thameslink 700 (they share one body recipe and one table of figures). */
const UNIT_KINDS: readonly TrainKind[] = [...EMU_KINDS, ...GC_KINDS, ...TL_KINDS];

test('commuter and regional units: each car is as long and wide as the figures say, with two doors a side, and the roof at the highest figure', () => {
  for (const kind of UNIT_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const fig = emuFig(kind);
    const top = boxOf(g).max.y;
    near(top, fig.height.value, 0.02, `${kind} highest point (published 3.77 m for the 387, assumed for the 717, 700 and 180)`);
    near(boxOf(g).min.z, 0, 0.02, `${kind} nose at z = 0`);
    near(boxOf(g).max.z, layout.length, 0.02, `${kind} length`);
    for (const car of layout.cars) {
      const group = named(g, `car-${car.index}`);
      const b = boxOf(group);
      near(b.min.z, car.start, 0.012, `${kind} car ${car.index} start`);
      near(b.max.z, car.end, 0.012, `${kind} car ${car.index} end`);
      const body = new THREE.Box3().union(boxOf(named(group, 'body-shell'))).union(boxOf(named(group, 'body-detail')));
      near(body.max.x - body.min.x, fig.bodyWidth.value, 0.02, `${kind} car ${car.index} body width`);
      const doors = all(group, 'door');
      assert.equal(doors.length, 4, `${kind} car ${car.index}: two doors a side`);
      for (const d of doors) {
        near(d.userData.width as number, fig.doorWidth.value, 1e-9, 'door width');
        near(Math.abs(worldPos(d).x), fig.bodyWidth.value / 2, 1e-9, 'door on the side of the body');
      }
      const pans = all(group, 'pantograph');
      assert.equal(pans.length, car.pantograph ? 1 : 0, `${kind} car ${car.index} pantograph`);
      for (const p of pans) assert.ok(boxOf(p).max.y <= fig.height.value + 0.01, `${kind}: the folded pantograph stays under the published height`);
    }
  }
});

test('commuter and regional units: windows sit between and beside the doors without overlapping them, and every window is on its car', () => {
  for (const kind of UNIT_KINDS) {
    const layout = trainLayout(kind);
    const fig = emuFig(kind);
    for (const car of layout.cars) {
      const plan = carPlan(car, layout.spec.family);
      assert.equal(plan.doors.length, 2);
      assert.ok(plan.windows.length >= (car.cab ? 3 : 6), `${kind} car ${car.index} has ${plan.windows.length} windows`);
      for (const [a, b] of plan.windows) {
        assert.ok(b > a + 0.8, `${kind} car ${car.index} window ${a}-${b} is too short`);
        assert.ok(a > END_GAP && b < car.length - END_GAP, `${kind} car ${car.index} window ${a}-${b} is off the car`);
        for (const d of plan.doors) assert.ok(b <= d - fig.doorWidth.value / 2 || a >= d + fig.doorWidth.value / 2, `${kind} car ${car.index} window ${a}-${b} overlaps the door at ${d}`);
      }
    }
  }
});

test('Class 700: eight or twelve cars of 20.55 and 20.15 m, a pantograph on each PTSO and none elsewhere, and the 717\'s body and bogies under a front of its own', () => {
  for (const kind of TL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    assert.equal(layout.cars.length, kind === 'tl700x8' ? 8 : 12);
    near(layout.length, kind === 'tl700x8' ? 162.0 : 242.6, 0.05, `${kind} unit length (the Siemens datasheet's 162.0 and 242.6 m)`);
    // the end cars are 20.55 m, every other car 20.15 m (worked out from the two datasheet lengths: ASSUMED)
    layout.cars.forEach((car, i) => near(car.length, i === 0 || i === layout.cars.length - 1 ? 20.55 : 20.15, 1e-9, `${kind} car ${i} length`));
    const pans = all(g, 'pantograph');
    assert.deepEqual(pans.map((p) => (p.parent as THREE.Object3D).name), layout.cars.filter((c) => c.type === 'PTSO').map((c) => `car-${c.index}`), `${kind}: a pantograph on each PTSO`);
    assert.equal(pans.length, 2);
    // two cabs, no front door, a warning panel and exposed couplers: the front is its own, the body is the 717's
    assert.equal(all(g, 'front-door').length, 0);
    assert.equal(all(g, 'nose-coupler').length, 2);
    for (const car of layout.cars) {
      const b = boxOf(named(g, `car-${car.index}`));
      near(b.max.x - b.min.x, EMU_FIGURES.desiro700.bodyWidth.value, 0.02, `${kind} car ${car.index} width`);
    }
  }
  // the 700's body is the 717's: the same section, nose, glass and bogies, from the same spec
  const a = bodySpec('desiro700');
  const b = bodySpec('desiro');
  // CHANGED (it compared the whole glass spec): the 717 now has a centre post for its emergency door, which the 700 has not; the rest of the screen and the side windows are alike
  const { pillar: _post, ...screen717 } = b.glass.screen;
  void _post;
  assert.deepEqual([a.half, a.floor, a.wallTop, a.crown, a.nose, a.glass.screen, a.glass.side, a.gangway], [b.half, b.floor, b.wallTop, b.crown, b.nose, screen717, b.glass.side, b.gangway]);
  assert.notDeepEqual(a.front, b.front, 'a front of its own');
  assert.equal(EMU_FIGURES.desiro700.wheelDiameter.value, EMU_FIGURES.desiro.wheelDiameter.value);
});

test('Class 180: five cars of the fleet owner’s 23.71 and 23.02 m, single-leaf doors, no pantograph, a driven bogie and a trailer bogie on every car, and an uncovered Scharfenberg at each end', () => {
  const g = built('gc180x5');
  const layout = trainLayout('gc180x5');
  assert.deepEqual(layout.cars.map((c) => c.type), ['DMSL', 'MFL', 'MSL', 'MSLRB', 'DMSL']);
  // Primary source: Angel Trains, https://angeltrains.co.uk/fleet/class-180/ (reviewed 2026-11-09):
  // DMSL 23.71 m, MFL/MSL/MSLRB 23.02 m; formation DMSL(A)-MFL-MSL-MSLRB-DMSL(B).
  // 116.48 m is the calculated sum of those rounded car dimensions, NOT a published whole-unit length.
  // Wikipedia https://en.wikipedia.org/wiki/British_Rail_Class_180 gives 116.52 m and 23.03 m
  // intermediates; their source disagreement remains explicit in the dimension report.
  const summedPrimaryCarLengths = 2 * 23.71 + 3 * 23.02;
  near(layout.length, summedPrimaryCarLengths, 1e-9, 'model formation: sum of Angel Trains’ car lengths');
  layout.cars.forEach((car, i) => near(car.length, i === 0 || i === 4 ? 23.71 : 23.02, 1e-9, `car ${i} length`));
  assert.equal(all(g, 'pantograph').length, 0, 'a diesel unit has no pantograph');
  assert.equal(bodySpec('adelante').doorLeaves, 1);
  for (const car of layout.cars) {
    const group = named(g, `car-${car.index}`);
    assert.equal(all(group, 'door').length, 4, `car ${car.index}: two doors a side`);
    near(boxOf(group).max.x - boxOf(group).min.x, EMU_FIGURES.adelante.bodyWidth.value, 0.02, `car ${car.index} width (published 2.73 m)`);
    // one driven bogie a car (Wikipedia's wheel arrangement), the cab-end bogie of a driving car the trailing one
    assert.equal(car.motor.filter(Boolean).length, 1);
    if (car.cab === 'front') assert.deepEqual(car.motor, [false, true]);
    if (car.cab === 'rear') assert.deepEqual(car.motor, [true, false]);
  }
  // the coupler stands out of the face (in photographs the head is in the open): no cover, a coupler marker at each end
  assert.equal(all(g, 'coupler-cover').length, 0);
  assert.equal(all(g, 'nose-coupler').length, 2);
  assert.equal(bodySpec('adelante').front.coupler.covered, false);
  assert.equal(bodySpec('adelante').front.coupler.style, 'scharfenberg');
  assert.equal(bodySpec('adelante').front.warning, 0xf2c100);
  // the Class 180's cab is blunter and taller in the face than a Desiro's: the face stands higher and is wider
  const sec = (f: Family) => ringAt(bodySpec(f).nose, 0);
  assert.ok(sec('adelante').top - sec('adelante').bottom > sec('desiro').top - sec('desiro').bottom + 0.1, 'a taller face than the 717\'s');
});

test('Class 180: a nose of its own, longer and shallower than the Desiro\'s, under a windscreen that is raked less and reaches further back, not the 700\'s nose with another face', () => {
  // Measured on the built glass: the area-weighted mean normal of the pane within 1.15 m of the centre line, tilted forward of the vertical by the
  // rake (0 is a pane lying flat, 90 one standing upright). The 180's reads 31 degrees and reaches 1.7 m back over the bonnet; the 700's 50 and 1.2 m.
  const measure = (kind: TrainKind): { rake: number; reach: number } => {
    const g = built(kind);
    const car = trainLayout(kind).cars[0] as Car;
    const pane = triangles(named(named(g, 'car-0'), 'cab-glass') as THREE.Mesh).filter((t) => t.every((v) => Math.abs(v.x) < 1.15));
    const mean = new THREE.Vector3();
    for (const t of pane) mean.add(faceNormal(t).multiplyScalar(areaOf(t)));
    const zs = pane.flatMap((t) => t.map((v) => v.z - car.start));
    return { rake: (Math.atan2(-mean.z, mean.y) * 180) / Math.PI, reach: Math.max(...zs) - Math.min(...zs) };
  };
  const a = measure('gc180x5');
  const d = measure('tl700x8');
  assert.ok(a.rake < d.rake - 10, `the 180's glass is raked ${a.rake.toFixed(0)} degrees, the 700's ${d.rake.toFixed(0)}`);
  assert.ok(a.reach > d.reach + 0.4, `the 180's glass reaches ${a.reach.toFixed(2)} m back, the 700's ${d.reach.toFixed(2)} m`);
  assert.ok(bodySpec('adelante').nose.length >= bodySpec('desiro700').nose.length + 0.7, 'the 180\'s nose is the longer by most of a metre');
  // and the shape of the whole: at 0.9 m back the roof line stands lower than the 700's (a shallower sweep up to the roof)
  const at = (f: Family): number => ringAt(bodySpec(f).nose, 0.9).top;
  assert.ok(at('adelante') < at('desiro700') - 0.15, `the 180's nose stands ${at('adelante').toFixed(2)} m high 0.9 m back, the 700's ${at('desiro700').toFixed(2)} m`);
});

test('fronts: the face of a 387, a 717, a 700 and a 180 is broad, at least 0.7 of the body\'s width, as in photographs (the first version drew an egg 0.65 wide)', () => {
  for (const f of ['electrostar', 'desiro', 'desiro700', 'adelante'] as Family[]) {
    const spec = bodySpec(f);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const tip = halfAt(sec, norm, eggSection(norm, spec.nose.widest, spec.nose.boxiness), ringAt(spec.nose, 0));
    const width = 2 * Math.max(...tip.map((p) => p[0]));
    assert.ok(width >= 0.7 * 2 * sec.width, `${f}: a face ${width.toFixed(2)} m wide on a body ${(2 * sec.width).toFixed(2)} m wide`);
  }
});

test('underfloor: a diesel car has its cooler, engine, tank and batteries evenly between its bogies, inside the body, clear of every wheel and hanging from the floor; an electric one has none', () => {
  for (const kind of ['lner9', 'gn387x4', 'gn717x6', 'tl700x8'] as TrainKind[]) {
    const layout = trainLayout(kind);
    assert.equal(bodySpec(layout.spec.family).underfloor, null, `${kind}: no underfloor equipment on an electric unit`);
    for (const car of layout.cars) assert.deepEqual(underfloorBlocks(car, bodySpec(layout.spec.family)), []);
  }
  const spec = bodySpec('adelante');
  const items = spec.underfloor!.items;
  const fig = EMU_FIGURES.adelante;
  const layout = trainLayout('gc180x5');
  const g = built('gc180x5');
  for (const car of layout.cars) {
    const blocks = underfloorBlocks(car, spec);
    assert.deepEqual(blocks.map((b) => b.name), ['cooler', 'engine', 'fuel-tank', 'battery-box'], `car ${car.index}: the order of the equipment`);
    assert.equal(items.find((i) => i.name === 'engine')?.length, Math.max(...items.map((i) => i.length)), 'the engine is the longest pod');
    // clear of the wheels: every pod lies between the wheels of the two bogies (the wheel envelope, a radius past the outer axle), with the spec's clearance
    const wheelsReach = Math.max(fig.wheelbaseMotor.value, fig.wheelbaseTrailer.value) / 2 + fig.wheelDiameter.value / 2;
    const from = car.bogies[0] + wheelsReach + spec.underfloor!.clearance;
    const to = car.bogies[1] - wheelsReach - spec.underfloor!.clearance;
    const gaps: number[] = [];
    let at = from;
    blocks.forEach((b, i) => {
      gaps.push(b.z0 - at);
      at = b.z1;
      near(b.z1 - b.z0, items[i]?.length as number, 1e-9, `car ${car.index} ${b.name} length`);
      assert.ok(b.z0 >= from && b.z1 <= to, `car ${car.index} ${b.name} ${b.z0.toFixed(2)}..${b.z1.toFixed(2)} is outside the clear stretch ${from.toFixed(2)}..${to.toFixed(2)}`);
      for (const z of car.bogies) assert.ok(b.z1 <= z - wheelsReach || b.z0 >= z + wheelsReach, `car ${car.index} ${b.name} reaches the wheels of the bogie at ${z}`);
      // inside the body's width, hanging from the floor, with a real depth, above the rail and above the ballast
      assert.ok(b.x0 === -b.x1 && b.x1 <= spec.half - 0.2, `${b.name} half-width ${b.x1}`);
      assert.ok(b.y1 > spec.floor && b.y1 < spec.floor + 0.05, `${b.name} hangs from ${b.y1}, the floor at ${spec.floor}`);
      assert.ok(b.y0 >= 0.3 && b.y1 - b.y0 >= 0.3 && b.y0 < spec.skirtBottom, `${b.name} from ${b.y0} to ${b.y1}: in plain sight under the valance (the foot of it at ${spec.skirtBottom})`);
    });
    gaps.push(to - at);
    // evenly spaced: the same gap either side of every pod
    for (const gap of gaps) near(gap, gaps[0] as number, 1e-9, `car ${car.index} spacing`);
    assert.ok((gaps[0] as number) >= 0.12 - 1e-9, `car ${car.index}: gaps of ${gaps[0]}`);
    // and drawn: the pods are in the car's detail mesh, each exactly its box (its top is the floor's, hidden: no face there)
    for (const b of blocks) {
      const tris = trisOfColour(detailOf(g, car), b.colour);
      assert.equal(tris.length, 10, `car ${car.index} ${b.name}: a box of five faces`);
      const box = boxOfTris(tris);
      near(box.min.x, b.x0, 1e-6, `${b.name} x0`);
      near(box.max.x, b.x1, 1e-6, `${b.name} x1`);
      near(box.min.y, b.y0, 1e-6, `${b.name} y0`);
      near(box.max.y, b.y1, 1e-6, `${b.name} y1`);
      near(box.min.z, b.z0, ZTOL, `${b.name} z0`);
      near(box.max.z, b.z1, ZTOL, `${b.name} z1`);
    }
  }
  // too little room: the pods shrink together instead of reaching a wheel
  const car = layout.cars[1] as Car;
  const tight = { ...car, bogies: [car.start + 3.5, car.start + 3.5 + 8] as [number, number] };
  const blocks = underfloorBlocks(tight, spec);
  const wheelsReach = Math.max(fig.wheelbaseMotor.value, fig.wheelbaseTrailer.value) / 2 + fig.wheelDiameter.value / 2;
  assert.ok(blocks.reduce((a, b) => a + (b.z1 - b.z0), 0) < items.reduce((a, i) => a + i.length, 0) - 1, 'the pods are shorter than they are where there is room');
  for (const b of blocks) {
    assert.ok(b.z1 - b.z0 > 0.1, `${b.name} shrank to nothing`);
    assert.ok(b.z0 >= tight.bogies[0] + wheelsReach && b.z1 <= tight.bogies[1] - wheelsReach, `${b.name} reaches a wheel`);
  }
  for (let i = 1; i < blocks.length; i++) assert.ok((blocks[i] as { z0: number }).z0 - (blocks[i - 1] as { z1: number }).z1 >= 0.12 - 1e-9, 'pods run into each other');
});

test('geometry: an ellipse is n distinct points, counter-clockwise, on the ellipse, reaching its radii (the rounded rectangle it replaced doubled points and made zero-area triangles)', () => {
  for (const [ra, rb, n] of [[0.085, 0.085, 14], [0.3, 0.1, 14], [1, 0.5, 32]] as const) {
    const pts = ellipse(1, 2, ra, rb, n);
    assert.equal(pts.length, n);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i] as [number, number];
      const [x2, y2] = pts[(i + 1) % n] as [number, number];
      assert.ok(Math.abs(((x - 1) / ra) ** 2 + ((y - 2) / rb) ** 2 - 1) < 1e-9, 'on the ellipse');
      assert.ok(Math.hypot(x2 - x, y2 - y) > 0.05 * Math.min(ra, rb), `points ${i} and ${i + 1} are the same point`);
      area += x * y2 - x2 * y;
    }
    area /= 2;
    assert.ok(area > 0, 'counter-clockwise');
    assert.ok(area < Math.PI * ra * rb && area > 0.9 * Math.PI * ra * rb, `area ${area} of an ellipse of ${Math.PI * ra * rb}`);
    near(Math.max(...pts.map((p) => p[0])), 1 + ra, 1e-12, 'reaches the right');
    near(Math.min(...pts.map((p) => p[0])), 1 - ra, 1e-12, 'and the left');
  }
});

test('Great Northern: coupled Class 387 units meet nose to nose, 2 x END_GAP apart, with the couplers out', () => {
  const g = built('gn387x8');
  const layout = trainLayout('gn387x8');
  const a = layout.cars[3] as Car;
  const b = layout.cars[4] as Car;
  assert.ok(a.cab === 'rear' && b.cab === 'front');
  // the two noses stand END_GAP back from the joint each, so their faces are 2 x END_GAP apart. The face is the front of the yellow panel (the front of the
  // nose is vertex-coloured, not in the textured shell, on a livery with no nose cone; the couplers and cables reach past the faces, and are measured below)
  const YELLOW = 0xf2c100;
  const faceA = Math.max(...trisOfColour(detailOf(g, a), YELLOW).flat().map((v) => v.z));
  const faceB = Math.min(...trisOfColour(detailOf(g, b), YELLOW).flat().map((v) => v.z));
  near(faceB - faceA, 2 * END_GAP, ZTOL, 'the noses of two coupled units');
  // and the two Dellner couplers, each from its own nose to the joint, meet there
  const detailA = boxOf(named(named(g, 'car-3'), 'body-detail'));
  const detailB = boxOf(named(named(g, 'car-4'), 'body-detail'));
  near(detailA.max.z, a.end, 1e-3, 'the first unit\'s coupler reaches the joint');
  near(detailB.min.z, b.start, 1e-3, 'the second unit\'s coupler reaches the joint');
  const noseCouplers = all(g, 'coupler').filter((c) => c.userData.nose);
  assert.equal(noseCouplers.length, 2);
  assert.deepEqual(noseCouplers.map((c) => c.parent?.name).sort(), ['car-3', 'car-4']);
});

// --- the whole trains -----------------------------------------------------------------------------------

test('trains: every kind draws in at most 80 calls, four materials and a bounded triangle count, with the groups the live layer finds by name', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    let meshes = 0;
    let far = 0;
    const materials = new Set<THREE.Material>();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        materials.add(m.material as THREE.Material);
        // a far level of detail is drawn instead of its near level, never as well, so it is no draw call of its own: the cap counts the near ones,
        // which is every call there can be at once (a train wholly within the level distance of the camera)
        if (isFar(m)) far++;
        else meshes++;
      }
    });
    assert.ok(meshes <= 80, `${kind} has ${meshes} meshes`);
    assert.equal(far, 2 * layout.cars.length, `${kind}: one far bogie mesh for each of its ${2 * layout.cars.length} bogies`);
    assert.ok(materials.size <= 4, `${kind} has ${materials.size} materials`);
    const perCar = triCount(g) / layout.cars.length;
    assert.ok(perCar > 3000 && perCar < 10000, `${kind}: ${perCar.toFixed(0)} triangles a car`);
    for (const car of layout.cars) {
      const group = named(g, `car-${car.index}`);
      for (const n of ['body-shell', 'body-detail']) assert.ok(group.getObjectByName(n), `${kind} car ${car.index} has ${n}`);
      assert.ok(group.getObjectByName(`bogie-${car.index}-0`) && group.getObjectByName(`bogie-${car.index}-1`));
    }
  }
  // the Azuma kinds are unchanged by the new stock
  assert.deepEqual(TRAIN_KINDS, ['lner5', 'lner9', 'hull5', 'lumo5']);
});

// --- the AT300's cab side: crew door and window ------------------------------------------------------------------

test('doors: an AT300 driving car has a narrow crew door each side just behind its nose, a single leaf narrower than a passenger door; no other car or family has one', () => {
  // photographs lner-800-doncaster-2026, hull-802-paragon-2025, LUMO-04-Lumo-803003-at-Edinburgh-Waverley: between the cab window and the first passenger
  // door, a narrow door with a thin window at its top. The position and width are read from oblique views (ASSUMED, as the passenger doors' are).
  const nose = bodySpec('at300').nose.length;
  assert.ok(ASSUMED.crewDoorWidth < ASSUMED.doorWidth - 0.15, 'narrower than a passenger door');
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of layout.cars) {
      const crew = all(named(g, `car-${car.index}`), 'crew-door');
      const want = layout.spec.family === 'at300' && car.cab !== null ? 2 : 0;
      assert.equal(crew.length, want, `${kind} car ${car.index}: ${crew.length} crew doors`);
      assert.deepEqual(crew.map((d) => d.userData.side).sort(), want ? ['left', 'right'] : [], `${kind} car ${car.index}: one a side`);
      for (const d of crew) {
        const at = worldPos(d);
        const fromEnd = car.cab === 'front' ? at.z - car.start : car.end - at.z;
        near(fromEnd, nose + ASSUMED.crewDoorFromNose, 1e-6, `${kind} car ${car.index}: the crew door's place behind the car's end`);
        assert.equal(d.userData.width, ASSUMED.crewDoorWidth);
        near(Math.abs(at.x), FIGURES.bodyWidth.value / 2, 1e-9, 'the crew door is on the side of the body');
        // clear of the nose (the section is full width there) and of the first passenger door
        assert.ok(fromEnd - ASSUMED.crewDoorWidth / 2 - 0.05 >= nose, 'the frame starts on the full-width body');
        assert.ok(fromEnd + ASSUMED.crewDoorWidth / 2 + 0.05 < nose + ASSUMED.doorFromNose - ASSUMED.doorWidth / 2, 'it stands clear of the first passenger door');
      }
      // the passenger doors are as before: two a side, never the crew door counted among them
      assert.equal(all(named(g, `car-${car.index}`), 'door').length, 4, `${kind} car ${car.index}: the passenger doors`);
    }
  }
  // the leaf is the crew door's own width, whatever the passenger doors have: the Hull Trains red leaf spans 0.7 m of the car's side
  {
    const g = built('hull5');
    const layout = trainLayout('hull5');
    const door = bodySpec('at300').doorY;
    for (const car of endCabs(layout)) {
      const centre = car.cab === 'front' ? car.start + nose + ASSUMED.crewDoorFromNose : car.end - nose - ASSUMED.crewDoorFromNose;
      const leaf = trisOfColour(detailOf(g, car), 0xc41e46).filter((t) => t.every((v) => Math.abs(v.z - centre) < ASSUMED.crewDoorWidth / 2 + 0.01 && Math.abs(v.y - (door[0] + door[1]) / 2) < (door[1] - door[0]) / 2 + 0.01));
      assert.ok(leaf.length >= 8, `car ${car.index}: ${leaf.length} crew door leaf triangles`);
      const box = boxOfTris(leaf);
      near(box.max.z - box.min.z, ASSUMED.crewDoorWidth, 0.01, `car ${car.index}: the leaf's width`);
      near(box.max.y - box.min.y, door[1] - door[0], 0.01, `car ${car.index}: the leaf's height`);
    }
  }
});

test('glass: the AT300 cab side window is a wedge raked back at the top and standing against the nose\'s end, with a dark swoosh round it on the Hull Trains and Lumo cabs, none on the LNER', () => {
  const spec = bodySpec('at300');
  const side = spec.glass.side;
  // the foot of the front edge is well ahead of its top (a point low on the cheek, the top edge climbing back to the door), and the back edge stands
  // against the nose's end (photographs lner-800-doncaster-2026, hull-802-paragon-2025, hull-802-doncaster-2024, LUMO-04-Lumo-803003-at-Edinburgh-Waverley)
  assert.ok(side.sFront1 - side.sFront0 >= 1.0, `the front edge is raked back ${side.sFront1 - side.sFront0} m from foot to top`);
  assert.ok(side.sBack > spec.nose.length - 0.3 && side.sBack < spec.nose.length, `the back edge, ${spec.nose.length - side.sBack} m before the nose's end`);
  for (const kind of ['lner5', 'hull5', 'lumo5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of endCabs(layout)) {
      const face = facePlane(car, spec.front.coupler.covered, false);
      const along = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - face : face - v.z);
      const glass = named(named(g, `car-${car.index}`), 'cab-glass') as THREE.Mesh;
      for (const sign of [-1, 1]) {
        // the window is the glass out by the wall (the windscreen is within 1.15 m of the middle)
        const vs = triangles(glass).filter((t) => t.every((v) => v.x * sign > 1.1)).flat();
        assert.ok(vs.length > 100, `${kind} car ${car.index}: ${vs.length} window vertices`);
        const ymin = Math.min(...vs.map((v) => v.y));
        const ymax = Math.max(...vs.map((v) => v.y));
        const front = (pick: (v: THREE.Vector3) => boolean): number => Math.min(...vs.filter(pick).map(along));
        const foot = front((v) => v.y < ymin + 0.05);
        const top = front((v) => v.y > ymax - 0.05);
        assert.ok(top - foot > 0.8, `${kind} car ${car.index}: the window's top starts ${(top - foot).toFixed(2)} m behind its foot (a wedge, not a slab)`);
        near(Math.max(...vs.map(along)), side.sBack, 0.05, `${kind} car ${car.index}: the window's back edge`);
        // the dark swoosh, round the glass and a little ahead of it, on the two kinds that wear one
        const swoosh = trisOfColour(detailOf(g, car), CAB_SWOOSH).filter((t) => t.every((v) => v.x * sign > 1.1));
        if (kind === 'lner5') {
          assert.equal(swoosh.length, 0, `${kind} car ${car.index}: no swoosh`);
          continue;
        }
        assert.ok(swoosh.length >= 100, `${kind} car ${car.index}: ${swoosh.length} swoosh triangles`);
        const sv = swoosh.flat();
        assert.ok(Math.min(...sv.map(along)) < Math.min(...vs.map(along)) - 0.4, `${kind} car ${car.index}: the swoosh reaches ahead of the glass`);
        assert.ok(Math.min(...sv.map((v) => v.y)) < ymin - 0.03 && Math.max(...sv.map((v) => v.y)) > ymax + 0.03, `${kind} car ${car.index}: the swoosh frames the glass above and below`);
        assert.ok(Math.max(...sv.map(along)) >= Math.max(...vs.map(along)) - 0.02, `${kind} car ${car.index}: the swoosh reaches the glass's back edge`);
      }
    }
  }
  // only the AT300 has the swoosh
  for (const kind of ['gn387x4', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    for (const car of endCabs(trainLayout(kind))) assert.equal(trisOfColour(detailOf(g, car), CAB_SWOOSH).length, 0, `${kind} car ${car.index}: no swoosh`);
  }
});

test('bogies: each family runs on its maker\'s bogie (Hitachi AT300, the Electrostar\'s, the Siemens Desiro City and 700, the Alstom 180), every car on its own family\'s', () => {
  assert.deepEqual(BOGIE_STYLE, { at300: 'hitachi', electrostar: 'electrostar', desiro: 'siemens', desiro700: 'siemens', adelante: 'alstom' });
  const nearOf = (bogie: THREE.Object3D): THREE.BufferGeometry => ((named(bogie, 'bogie-lod') as THREE.LOD).levels[0] as unknown as { object: THREE.Mesh }).object.geometry;
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const family = layout.spec.family;
    const fig = family === 'at300' ? null : EMU_FIGURES[family as EmuFamily];
    for (const car of layout.cars) {
      car.bogies.forEach((_, k) => {
        const motor = (car.motor as readonly boolean[])[k] as boolean;
        const spec = {
          radius: fig ? fig.wheelDiameter.value / 2 : FIGURES.wheelDiameter.value / 2,
          wheelbase: fig ? (motor ? fig.wheelbaseMotor.value : fig.wheelbaseTrailer.value) : FIGURES.bogieWheelbase.value,
          track: FIGURES.gauge.value,
          motor,
          diesel: family === 'adelante',
        };
        // the build shares one geometry per spec and maker, so a bogie of the right maker is the very geometry built here with that maker's style
        const actual = nearOf(named(named(g, `car-${car.index}`), `bogie-${car.index}-${k}`));
        for (const style of ['hitachi', 'electrostar', 'siemens', 'alstom'] as const) {
          assert.equal(actual === nearOf(buildBogie({ ...spec, style })), style === BOGIE_STYLE[family], `${kind} car ${car.index} bogie ${k}: the ${style} geometry`);
        }
      });
    }
  }
});
