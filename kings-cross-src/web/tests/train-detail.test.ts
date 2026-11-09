// The detail of the trains: the lofted nose and its glass, the gangways and couplers, the bogies, the liveries and
// the Great Northern commuter units. Pure geometry: no WebGL and no DOM (the canvas textures are only made in a
// browser, so their sharpness is pinned here by the numbers that size them).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ALL_KINDS, EMU_FIGURES, EMU_KINDS, FIGURES, GC_KINDS, TL_KINDS, TRAIN_KINDS, trainLayout } from '../../core/train.ts';
import type { Car, EmuFamily, Family, TrainKind } from '../../core/train.ts';
import { LIVERIES, ROW_H, TEX_SPAN, TEX_W, atlasRect, atlasTexts, shellMaterial, texelsPerMetre, textEms } from '../src/livery.ts';
import { ASSUMED, BOGIE_STYLE, bodySpec, buildTrain, CAB_SWOOSH, carPlan, carSection, COVER_RELIEF, END_GAP, FACE_CLEAR, faceSetback, frontOf, HULL_POD, LENS, NOSE_RECESS, PANE_COLS, PANE_LIFT, PANE_ROWS, PANE_SEAL, PANE_SKY_HI, PANE_SKY_MID, POD, SKIRT_PALE, skirtColours, underfloorBlocks } from '../src/train.ts';
import { GN_PINSTRIPE, HULL_BEAK, LNER_YELLOW, liveryFor } from '../src/train-livery.ts';
import { eggSection, filletFactor, halfAt, loopFromHalf, normalised, planProfile, ringAt, ringStations, sideProfile, xAtY, yAtX } from '../src/train-nose.ts';
import { BOGIE_HALF_WIDTH, BOGIE_LOD_DISTANCE, BOGIE_TOP, DISC_RADIUS, DISC_THICKNESS, FAR_WHEEL_SEGMENTS, FLANGE_HEIGHT, KIT_BIG_RADIUS, KIT_CABLE_WIDTH, KIT_COLOURS, KIT_HALF_WIDTH, KIT_PLATE_HALF, KIT_PLATE_TOP, KIT_SMALL_RADIUS, PANTOGRAPH_STRIP, PANTOGRAPH_STRIP_THICKNESS, PANTOGRAPH_STRIPS, ROOF_KITS, SKIRT_BOX_PATTERN, SKIRT_RAKE, SKIRT_TUCK, WHEEL_SEGMENTS, WHEEL_WIDTH, bogieFarSoup, bogieParts, bogieSoup, bogieStyle, buildBogie, couplerHalf, roofKitReach, roofKitSpan, skirtHalfAt, skirtPanel, skirtSplit } from '../src/train-parts.ts';
import type { BogieSpec, BogieStyle } from '../src/train-parts.ts';
import { clipConvex, col, ellipse, Soup } from '../src/train-geom.ts';
import { ADELANTE_FACE, AMBER, AMBER_DOOR, BUMPER, DESIRO_700_FACE, DESIRO_717_FACE, ELECTROSTAR_FACE, RECESS_LIFT, YELLOW, boxOutline } from '../src/train-face.ts';
import type { FaceShape, FaceSpec } from '../src/train-face.ts';
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
 * How far a flat face (the 387's, ELECTROSTAR_FACE) stands behind the end of the train, written out as NOSE_RECESS is for the other covered fronts: its shapes stand in
 * front of its plane, the highest a millimetre short of the end, so the layers need more room than the 10 mm of the others.
 */
const FLAT_SETBACK = 0.02;
/**
 * The plane of a cab's front face, in train coordinates. The face stands NOSE_RECESS behind the end of the car where a cover hides the
 * coupler (FLAT_SETBACK for a flat face), END_GAP behind it where the coupler stands out of the face, and END_GAP
 * behind the joint where two units are coupled. (The rule from the docs of `faceSetback`, written out so a test of the face does not
 * ask the code under test for where it is.)
 */
const facePlane = (car: Car, covered: boolean, interior: boolean, flat = false): number => {
  const back = interior || !covered ? END_GAP : flat ? FLAT_SETBACK : NOSE_RECESS;
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
    // CHANGED (it wanted a rise of 0.002 in 0.1 mm, which a tight fillet such as the 387's, 0.06 of the size lost over 0.2 m, does not make): a quarter circle's rise from the face is
    // the loss times sqrt(2 h / fillet) for a step h, whatever the loss and the fillet are, so each family is held to its own
    const rise = nose.filletLoss * Math.sqrt((2 * h) / nose.fillet);
    near(filletFactor(nose, h) - filletFactor(nose, 0), rise, 0.02 * rise, `${family}: the fillet leaves the face as a quarter circle does`);
    const tip = ringAt(nose, 0);
    const behind = ringAt(nose, nose.fillet);
    assert.ok(tip.ws < behind.ws && tip.top < behind.top && tip.bottom > behind.bottom, `${family}: the face is smaller than the ring behind it`);
  }
});

test('nose: the rings cut the fillet into filletSteps gaps (six unless the spec says) on a quarter circle, the first at the face and the last where the fillet ends, then run to the nose\'s end 0.14 m or less apart', () => {
  for (const family of FAMILIES) {
    const nose = bodySpec(family).nose;
    const steps = nose.filletSteps ?? 6;
    const at = ringStations(nose);
    assert.equal(at.length, steps + 1 + Math.ceil((nose.length - nose.fillet) / 0.14), `${family}: the number of rings`);
    for (let k = 0; k <= steps; k++) near(at[k] as number, nose.fillet * (1 - Math.cos((k / steps) * (Math.PI / 2))), 1e-12, `${family}: ring ${k} of the fillet`);
    near(at[0] as number, 0, 1e-12, `${family}: the first ring is the face`);
    near(at[steps] as number, nose.fillet, 1e-12, `${family}: the fillet's last ring`);
    near(at[at.length - 1] as number, nose.length, 1e-12, `${family}: the last ring is the nose's end`);
    for (let k = steps + 1; k < at.length; k++) assert.ok((at[k] as number) - (at[k - 1] as number) > 0 && (at[k] as number) - (at[k - 1] as number) <= 0.14 + 1e-9, `${family}: ring ${k} is ${(at[k] as number) - (at[k - 1] as number)} m after the one before`);
  }
  // CHANGED (six rings for every nose): the 387's corner is tight (0.06 of the size lost over 0.2 m) on a face 2.9 m tall, and six rings left a 36 degree edge in it: it has nine
  assert.equal(bodySpec('electrostar').nose.filletSteps, 9);
  assert.equal(bodySpec('at300').nose.filletSteps, undefined, 'the others keep the default');
  const three = ringStations({ ...bodySpec('at300').nose, filletSteps: 3 });
  near(three[3] as number, bodySpec('at300').nose.fillet, 1e-12, 'three steps end the fillet at its third ring');
  assert.deepEqual(ringStations({ ...bodySpec('at300').nose, filletSteps: undefined }), ringStations({ ...bodySpec('at300').nose, filletSteps: 6 }), 'and six is the default');
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
    const top = Math.max(...tip.map((p) => p[1]));
    const foot = Math.min(...tip.map((p) => p[1]));
    if (spec.front.face === undefined) {
      assert.ok(top < sec.crown - 1.0, `${family} tip is not below the roof by a metre`);
    } else if (spec.glass.screen !== undefined) {
      // CHANGED (the 180's face was lofted to a wall that reached nearly to the roof, as the others' are): the 180's face is the yellow panel and the pods under a windscreen that is
      // a patch on the nose's roof, so its top edge is the glass's foot, 1.4 m or so under the roof's crown, and the face is about a metre and a half tall (GC180-01, GC180-05)
      assert.ok(top < sec.crown - 1.0 && top > sec.crown - 1.8, `${family}: the face under the screen has its top ${(sec.crown - top).toFixed(3)} m under the roof`);
      assert.ok(foot < 0.8 && top - foot > 1.3 && top - foot < 2.0, `${family}: the face under the screen runs from ${foot.toFixed(3)} to ${top.toFixed(3)} m`);
    } else {
      // CHANGED (every nose was a bullet, its tip a metre or more below the roof): a flat face is a tall, nearly upright wall (gn387_03_387123_cambridge), its top just under the roof's
      // front and its foot at the bumper's, 0.6 m up; its tip is almost the car's whole height, with only the rounded edge lost
      // CHANGED again (0.25 m under the roof): a Desiro City's brow is a third of a metre under its crown, the roof's front rising behind it (GN717-01-717013-HDW, tl700_01_gatwick_front)
      assert.ok(top < sec.crown && top > sec.crown - 0.4, `${family}: the flat face's top is ${(sec.crown - top).toFixed(3)} m under the roof`);
      assert.ok(foot < 0.8 && top - foot > 2.5, `${family}: the flat face runs from ${foot.toFixed(3)} to ${top.toFixed(3)} m`);
    }
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
      // Measured worst cases: 29.7 degrees in the fillet round the face (six rings turn it through a quarter circle, and the first ring
      // stands 9 mm from the face; the 387's tight fillet takes nine rings, 25 degrees where six turned it 36), 19 degrees past it, where the face turns into
      // the bonnet. A faceted wedge turns 40 or more at every knot.
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
    // plane. The face is the deepest plane that holds most of the flat area facing out of the end of the train, within 0.4 m of that end (the lamps'
    // lenses, their bezels and the cover's seam lie in planes a few millimetres in front of it, with a small part of its area; further back
    // the nose has walls of its own that face out too, and on the narrow Azuma nose they are larger than the face).
    // CHANGED (the plane with the most area): a flat face's panels tile it a millimetre and a half in front of its plane, so two planes hold all its area, and the face is the deeper
    const covered = spec.front.coupler.covered;
    const flat = spec.front.face !== undefined;
    const faceOf = (car: Car): number => {
      const out = outwards(car);
      const end = car.cab === 'front' ? car.start : car.end;
      const planes = new Map<number, { z: number; inset: number; area: number }>();
      for (const t of triangles(detailOf(g, car))) {
        const inset = (t[0].z - end) * -out;
        if (faceNormal(t).z * out < 0.999 || inset < -0.001 || inset > 0.4 || t.some((v) => Math.abs(v.z - t[0].z) > 1e-4)) continue;
        const plane = planes.get(Math.round(inset * 1000)) ?? { z: t[0].z, inset, area: 0 };
        plane.area += areaOf(t);
        planes.set(Math.round(inset * 1000), plane);
      }
      const biggest = Math.max(...[...planes.values()].map((p) => p.area));
      return [...planes.values()].filter((p) => p.area >= 0.8 * biggest).sort((a, b) => b.inset - a.inset)[0]?.z ?? Number.NaN;
    };
    near(faceOf(front), facePlane(front, covered, false, flat), ZTOL, `${kind} front face stands ${covered ? 'NOSE_RECESS' : 'END_GAP'} behind the end of the train`);
    near(faceOf(rear), facePlane(rear, covered, false, flat), ZTOL, `${kind} rear face stands ${covered ? 'NOSE_RECESS' : 'END_GAP'} behind the end of the train`);
    // a flat face's top layer (the lenses) stands a millimetre inside the end of the car, on both ends
    // CHANGED (the 180 is a flat face whose coupler stands out of it): there the front-most thing is the coupler's head, whose front is exactly at the end of the car
    if (flat) {
      const reach = covered ? 0.001 : 0;
      near(frontBody.min.z, front.start + reach, ZTOL, `${kind}: the front-most layer of the flat face`);
      near(rearBody.max.z, rear.end - reach, ZTOL, `${kind}: the rear-most layer of the flat face`);
    }
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
  // CHANGED (the 387, the 717 and the 700 were of these): their windscreens are panes on their flat faces, with their own tests (the flat faces)
  for (const kind of ['lner5', 'lumo5', 'gc180x5'] as TrainKind[]) {
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
    // CHANGED (it wanted 1.6 m of every windscreen): the AT300's pane is about 1.4 m across, 0.53 of the body's width (lner-800-113-newcastle-2025, head on: the glass spans
    // 425 px of the body's 800), so its floor is 1.3 m; every other family keeps the 1.6 m
    const minWidth = layout.spec.family === 'at300' ? 1.3 : 1.6;
    assert.ok(Math.max(...xs) - Math.min(...xs) >= minWidth && Math.max(...xs) - Math.min(...xs) < sec.width * 2, `${kind} windscreen width ${Math.max(...xs) - Math.min(...xs)}`);
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
  // CHANGED (the 387 had a post of 0.8 m between its two panes, the 717 one of 0.7 m): their two screens are shapes on their flat faces with a door between them, and no roof glass to have a post
  const pillar = Object.fromEntries(FAMILIES.map((f) => [f, bodySpec(f).glass.screen?.pillar]));
  assert.deepEqual(pillar, { at300: undefined, electrostar: undefined, desiro: undefined, desiro700: undefined, adelante: 0.1 });
  for (const f of ['electrostar', 'desiro', 'desiro700'] as Family[]) assert.equal(bodySpec(f).glass.screen, undefined, `the ${f} has no windscreen patch on its roof`);
  for (const kind of ['lner5', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const post = bodySpec(trainLayout(kind).spec.family).glass.screen?.pillar ?? 0;
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
  // CHANGED (the 387, the 717 and the 700 were of these): their screens' black frames are shapes on their flat faces, clipped to the faces' outlines (the flat faces)
  for (const kind of ['lner5', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const screen = spec.glass.screen;
    assert.ok(screen, `${kind}: a windscreen on the roof`);
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
      assert.ok(screen.fraction <= FRAME_REACH, `${kind}: a glass ${screen.fraction} of the half-width wide would be cut by the frame's cap`);
      // and the cap is what holds the frame: on the EMUs it runs right out to it, where the frame's own width would take it past (the Azuma's,
      // round a narrow glass, stops at 0.875 of the half-width, short of the cap)
      if (kind !== 'lner5') assert.ok(widest > FRAME_REACH - 0.01, `${kind} car ${car.index}: the frame stops at ${widest.toFixed(3)} of the half-width, short of its cap`);
    }
  }
});

test('glass: the cab glass is a dark, tinted, reflective material of its own, and each cab has a side window on both sides', () => {
  for (const kind of ['lner5', 'gn387x8', 'gn717x6', 'tl700x8'] as TrainKind[]) {
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
      if (bodySpec(layout.spec.family).glass.side) {
        assert.ok(side(-1) > 40 && side(1) > 40, `${kind} car ${car.index}: cab side windows ${side(-1)} / ${side(1)} triangles`);
      } else {
        // CHANGED (the 387 had a side window each side): its cab's flank is a plain panel (gn387_03_387123_cambridge); the glass it has is the two screens on its face, within 1.3 m of
        // the middle (the body's wall stands at 1.4 m)
        assert.equal(triangles(glass).filter((t) => t.some((v) => Math.abs(v.x) > 1.3)).length, 0, `${kind} car ${car.index}: glass out by the wall of a cab with no side window`);
        assert.ok(triangles(glass).length >= 8, `${kind} car ${car.index}: the screens on the face`);
      }
    }
  }
});

// --- the flat faces: the Class 387's, 717's, 700's and 180's ----------------------------------------------------------
//
// A face is data (ELECTROSTAR_FACE, DESIRO_717_FACE, DESIRO_700_FACE, ADELANTE_FACE: shapes in the cab's own frame, each on a layer a few millimetres in front of the face's plane, clipped to the face's
// outline); these tests hold the drawn train to it, shape by shape, on every kind of cab: the front and the rear of a train, and (a gn387x8's) the two noses coupled in the middle of it.

type Pt = readonly [number, number];
const signedArea = (poly: readonly Pt[]): number => poly.reduce((a, p, i) => a + p[0] * (poly[(i + 1) % poly.length] as Pt)[1] - (poly[(i + 1) % poly.length] as Pt)[0] * p[1], 0) / 2;
const polyArea = (poly: readonly Pt[]): number => Math.abs(signedArea(poly));
/** Whether (x, y) is inside the convex polygon `poly` (wound either way) and at least `margin` metres inside every edge (a negative margin lets it stand that far outside). */
function insideConvex(poly: readonly Pt[], x: number, y: number, margin = 0): boolean {
  const sign = signedArea(poly) >= 0 ? 1 : -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Pt;
    const b = poly[(i + 1) % poly.length] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-12) continue;
    if ((sign * ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]))) / len < margin) return false;
  }
  return true;
}
/** The cab's own right is the train's right at a front cab and the train's left at a rear cab. */
const cabSign = (car: Car): 1 | -1 => (car.cab === 'front' ? 1 : -1);
/** A shape's outlines for a cab, in train coordinates: the shape, and its mirror where it has one. */
const placedOutlines = (shape: FaceShape, car: Car): [number, number][][] => {
  const s = cabSign(car);
  const out: [number, number][][] = [shape.outline.map(([x, y]): [number, number] => [x * s, y])];
  if (shape.mirror) out.push(shape.outline.map(([x, y]): [number, number] => [-x * s, y]));
  return out;
};
/** A flat face's outline in train coordinates: the loft's tip ring of its family, which the face's flat cap closes. */
function flatFaceOutline(family: Family = 'electrostar'): [number, number][] {
  const spec = bodySpec(family);
  const sec = carSection(spec);
  const norm = normalised(sec);
  return loopFromHalf(halfAt(sec, norm, eggSection(norm, spec.nose.widest, spec.nose.boxiness), ringAt(spec.nose, 0)));
}
/** The triangles of one of a cab's face layers: every corner `lift` metres in front of the face's plane, and (given a colour) in that colour. */
function faceLayer(mesh: THREE.Mesh, car: Car, interior: boolean, lift: number, hex?: number, covered = true): Tri[] {
  const plane = facePlane(car, covered, interior, true) + outwards(car) * lift;
  return (hex === undefined ? triangles(mesh) : trisOfColour(mesh, hex)).filter((t) => t.every((v) => Math.abs(v.z - plane) < ZTOL));
}
const isInterior = (car: Car, layout: ReturnType<typeof trainLayout>): boolean => car.index > 0 && car.index < layout.cars.length - 1;
/** The colour a lens of the 387's face wears in service: lit headlights and dark tail lenses at the leading end, the other way round at the trailing end, all dark where two units couple. */
const lensColour = (role: 'head' | 'tail', car: Car, interior: boolean): number => {
  if (interior) return role === 'head' ? LENS.headOff : LENS.tailOff;
  if (car.cab === 'front') return role === 'head' ? LENS.headOn : LENS.tailOff;
  return role === 'head' ? LENS.headOff : LENS.tailOn;
};
const shapesOf = (face: FaceSpec): Record<string, FaceShape> => Object.fromEntries(face.shapes.map((sh) => [sh.name, sh])) as Record<string, FaceShape>;
const SHAPES = shapesOf(ELECTROSTAR_FACE);
/**
 * The four flat faces: the kind that wears each, its family, whether its coupler is under a cover (the 387's is; the Desiro City's and the 180's stand out of the face, END_GAP
 * back), and whether the face carries the cab's screens (the 387's, 717's and 700's do; the 180's windscreen is a patch on the nose's roof over its face, which is panels and pods).
 */
const FACE_CASES: { label: string; kind: TrainKind; family: Family; face: FaceSpec; covered: boolean; screens: boolean }[] = [
  { label: 'Class 387', kind: 'gn387x8', family: 'electrostar', face: ELECTROSTAR_FACE, covered: true, screens: true },
  { label: 'Class 717', kind: 'gn717x6', family: 'desiro', face: DESIRO_717_FACE, covered: false, screens: true },
  { label: 'Class 700', kind: 'tl700x8', family: 'desiro700', face: DESIRO_700_FACE, covered: false, screens: true },
  { label: 'Class 180', kind: 'gc180x5', family: 'adelante', face: ADELANTE_FACE, covered: false, screens: false },
];
/** The area of the part of `outlines` that is inside the convex `face` and `inset` metres clear of its edges, by counting the points of a 1 cm grid (so it does not lean on the clipper it checks). */
function gridArea(outlines: readonly (readonly Pt[])[], face: readonly Pt[], inset: number): number {
  const step = 0.01;
  let n = 0;
  for (const o of outlines) {
    const xs = o.map((p) => p[0]);
    const ys = o.map((p) => p[1]);
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (insideConvex(o, x, y) && insideConvex(face, x, y, inset)) n++;
    }
  }
  return n * step * step;
}
const boxOfOutline = (poly: readonly Pt[]): { x0: number; x1: number; y0: number; y1: number } => ({ x0: Math.min(...poly.map((p) => p[0])), x1: Math.max(...poly.map((p) => p[0])), y0: Math.min(...poly.map((p) => p[1])), y1: Math.max(...poly.map((p) => p[1])) });

test('flat faces: every shape lies on its own layer in front of the face, inside its outline and the face\'s, with the area its outline holds, on every cab of a 387, a 717, a 700 and a 180', () => {
  for (const c of FACE_CASES) {
    const g = built(c.kind);
    const layout = trainLayout(c.kind);
    const face = flatFaceOutline(c.family);
    const cabs = layout.cars.filter((car) => car.cab);
    // (a gn387x8 has four cab ends: the two of the train and the two coupled in the middle; a 717, a 700 and a 180 have two)
    assert.deepEqual(cabs.map((car) => [car.index, car.cab]), c.kind === 'gn387x8' ? [[0, 'front'], [3, 'rear'], [4, 'front'], [7, 'rear']] : [[0, 'front'], [layout.cars.length - 1, 'rear']], `${c.label}: its cab ends`);
    // shapes that share a layer and a colour (the screens' and the door's frames, one black on one layer) are one set of triangles: they are checked together
    const groups = new Map<string, FaceShape[]>();
    for (const shape of c.face.shapes) {
      // (the glass has its own test)
      if (shape.glass) continue;
      const key = `${shape.lift}|${shape.lens ?? shape.colour}`;
      groups.set(key, [...(groups.get(key) ?? []), shape]);
    }
    const trainEndGroups = [...groups.values()].filter((shapes) => shapes.every((sh) => sh.trainEnd)).length;
    let checked = 0;
    for (const car of cabs) {
      const interior = isInterior(car, layout);
      const mesh = detailOf(g, car);
      for (const shapes of groups.values()) {
        const first = shapes[0] as FaceShape;
        const here = `${c.label}, car ${car.index} (${car.cab} cab${interior ? ', coupled' : ''}), ${shapes.map((sh) => sh.name).join(' + ')}`;
        assert.ok(shapes.every((sh) => !!sh.trainEnd === !!first.trainEnd), `${here}: the shapes of a layer are all drawn at a train's end, or none`);
        const tris = faceLayer(mesh, car, interior, first.lift, first.lens ? lensColour(first.lens, car, interior) : (first.colour as number), c.covered);
        // a coupler's head and ports are drawn where the train ends; where two units couple, the coupler is the 3D one out in the gap
        if (first.trainEnd && interior) {
          assert.equal(tris.length, 0, `${here}: drawn where the coupler stands out in the gap`);
          continue;
        }
        assert.ok(tris.length > 0, `${here}: not drawn`);
        const outlines = shapes.flatMap((sh) => placedOutlines(sh, car));
        const inset = Math.min(...shapes.map((sh) => sh.inset ?? 0));
        for (const v of tris.flat()) {
          assert.ok(outlines.some((o) => insideConvex(o, v.x, v.y, -1e-6)), `${here}: a corner at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) is outside its outline`);
          assert.ok(insideConvex(face, v.x, v.y, inset - 1e-6), `${here}: a corner at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) is outside the face's outline less ${inset} m`);
        }
        const declared = outlines.reduce((a, o) => a + polyArea(o), 0);
        const area = tris.reduce((a, t) => a + areaOf(t), 0);
        const whole = shapes.every((sh) => placedOutlines(sh, car).every((o) => o.every(([x, y]) => insideConvex(face, x, y, sh.inset ?? 0))));
        if (whole) near(area, declared, 1e-5, `${here}: the area it holds`);
        else {
          // the part of the outline the face holds, counted on a grid: the drawn area is that, to a percent
          assert.ok(area < declared - 1e-4, `${here}: ${area.toFixed(3)} m2 drawn of an outline of ${declared.toFixed(3)} m2 that the face's edge cuts`);
          near(area, gridArea(outlines, face, inset), 0.01 * area + 0.002, `${here}: the part of the outline the face holds`);
        }
        checked++;
      }
    }
    assert.equal(checked, cabs.reduce((n, car) => n + groups.size - (isInterior(car, layout) ? trainEndGroups : 0), 0), `${c.label}: layers checked`);
  }
});

test('Class 387 face: the base of the face is a flat cap closing the loft, and the panel and the bumper between them cover all of it, so none of the cap shows', () => {
  const g = built('gn387x8');
  const layout = trainLayout('gn387x8');
  const whole = polyArea(flatFaceOutline());
  const panel = SHAPES['panel'] as FaceShape;
  const bumper = SHAPES['bumper'] as FaceShape;
  assert.equal(panel.lift, bumper.lift, 'the two tile one layer');
  for (const car of layout.cars.filter((c) => c.cab)) {
    const interior = isInterior(car, layout);
    const here = `car ${car.index} (${car.cab} cab${interior ? ', coupled' : ''})`;
    const mesh = detailOf(g, car);
    const sum = (ts: Tri[]): number => ts.reduce((a, t) => a + areaOf(t), 0);
    // (the cap is the livery's front colour and the amber of the brow; where two units couple, the jumper cables' sockets also stand on the plane)
    const capColours = [liveryFor('gn387x8').noseFront, AMBER];
    near(capColours.reduce((a, hex) => a + sum(faceLayer(mesh, car, interior, 0, hex)), 0), whole, 1e-4, `${here}: the cap`);
    near(sum(faceLayer(mesh, car, interior, panel.lift, AMBER)) + sum(faceLayer(mesh, car, interior, bumper.lift, BUMPER)), whole, 1e-4, `${here}: the panel and the bumper`);
    // the amber above the bumper's top edge, the pale grey under it
    const amber = boxOfTris(faceLayer(mesh, car, interior, panel.lift, AMBER));
    const grey = boxOfTris(faceLayer(mesh, car, interior, bumper.lift, BUMPER));
    near(amber.min.y, boxOfOutline(panel.outline).y0, 1e-6, `${here}: the amber's foot`);
    near(grey.max.y, boxOfOutline(bumper.outline).y1, 1e-6, `${here}: the bumper's top`);
    near(amber.min.y, grey.max.y, 1e-6, `${here}: the amber starts where the bumper ends`);
  }
});

test('flat faces: the screens are glass on the face, a layer in front of their frames, shaded to reflect the ground: one each side of the door on a 387 and a 717, one broad pane across a 700', () => {
  // (a 180's face carries no glass: its windscreen is a patch on the nose's roof, checked with the nose)
  for (const c of FACE_CASES.filter((k) => k.screens)) {
    const g = built(c.kind);
    const layout = trainLayout(c.kind);
    const face = flatFaceOutline(c.family);
    const shapes = shapesOf(c.face);
    const pane = shapes['pane'] as FaceShape;
    const frame = shapes['screen-frame'] as FaceShape;
    assert.equal(c.face.shapes.filter((sh) => sh.glass).length, 1, `${c.label}: one glass shape`);
    assert.ok(pane.glass && frame.lift < pane.lift, `${c.label}: glass over its frame`);
    assert.equal(!!pane.mirror, c.kind !== 'tl700x8', `${c.label}: a pane each side of a door, or (the 700) one across`);
    // CHANGED (red-check: a lean of 0, or one tilted up, passed: the normals below are checked against the lean the table gives, the table the code reads): the lean is a tilt down of about
    // 6 to 19 degrees (ASSUMED, chosen by eye in look-dev), so that the pane reflects the dark ground and not the sky's glow
    assert.ok(c.face.glassLean <= -0.1 && c.face.glassLean >= -0.35, `${c.label}: a glass lean of ${c.face.glassLean}`);
    for (const car of layout.cars.filter((k) => k.cab)) {
      const interior = isInterior(car, layout);
      const here = `${c.label}, car ${car.index} (${car.cab} cab${interior ? ', coupled' : ''})`;
      const mesh = named(named(g, `car-${car.index}`), 'cab-glass') as THREE.Mesh;
      const tris = faceLayer(mesh, car, interior, pane.lift, undefined, c.covered);
      // (a 717 and a 700 have cab side windows on the flank besides, out by the wall: not on the face)
      assert.equal(tris.length, triangles(mesh).filter((t) => t.every((v) => Math.abs(v.x) < 1.3)).length, `${here}: nothing on the face's glass but the screens`);
      const outlines = placedOutlines(pane, car);
      for (const v of tris.flat()) {
        assert.ok(outlines.some((o) => insideConvex(o, v.x, v.y, -1e-6)), `${here}: glass at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) is outside its screen`);
        assert.ok(insideConvex(face, v.x, v.y, (pane.inset ?? 0) - 1e-6), `${here}: glass at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) is over the face's edge`);
      }
      const total = tris.reduce((a, t) => a + areaOf(t), 0);
      if (pane.mirror) {
        // a screen each side of the middle, the same size, each over half a square metre or so
        const area = (sign: number): number => tris.filter((t) => t.every((v) => v.x * sign > 0)).reduce((a, t) => a + areaOf(t), 0);
        near(area(-1), area(1), 1e-5, `${here}: the screens are the same size`);
        assert.ok(area(1) > 0.4 && area(1) < 0.8, `${here}: a screen of ${area(1).toFixed(3)} m2`);
        near(area(-1) + area(1), total, 1e-9, `${here}: no glass across the middle`);
      } else {
        // one pane across the middle, symmetric about it
        const box = boxOfTris(tris);
        near(box.min.x, -box.max.x, 1e-5, `${here}: the pane is centred`);
        assert.ok(box.min.x < -0.9 && box.max.x > 0.9 && total > 1.5 && total < 3, `${here}: one pane ${(box.max.x - box.min.x).toFixed(2)} m across, ${total.toFixed(2)} m2`);
      }
      // facing out of the end of the train: the winding, and the one shading normal tilted down a little, so the glass reflects the dark ground and not the sky's glow
      const out = outwards(car);
      for (const t of tris) assert.ok(faceNormal(t).z * out > 0.99, `${here}: a pane turned away from the end of the train`);
      const want = new THREE.Vector3(0, c.face.glassLean, out).normalize();
      const normals = mesh.geometry.getAttribute('normal');
      const plane = facePlane(car, c.covered, interior, true) + out * pane.lift;
      let seen = 0;
      triangles(mesh).forEach((t, k) => {
        if (!t.every((v) => Math.abs(v.z - plane) < ZTOL)) return;
        seen++;
        for (let j = 0; j < 3; j++) {
          const n = new THREE.Vector3().fromBufferAttribute(normals, 3 * k + j);
          assert.ok(n.distanceTo(want) < 1e-5, `${here}: a glass normal (${n.x.toFixed(3)}, ${n.y.toFixed(3)}, ${n.z.toFixed(3)}) where (${want.x.toFixed(3)}, ${want.y.toFixed(3)}, ${want.z.toFixed(3)}) is wanted`);
        }
      });
      assert.equal(seen, tris.length, `${here}: glass triangles checked`);
    }
  }
});

test('Class 387 face: the spec puts the door between the screens, the lamp housings under them in the panels, the display in the cab\'s right screen and the coupler in its recess, as the photographs have them', () => {
  const box = (name: string): ReturnType<typeof boxOfOutline> => boxOfOutline((SHAPES[name] as FaceShape).outline);
  const [pane, screenFrame, doorFrame, rim, leaf] = ['pane', 'screen-frame', 'door-frame', 'door-rim', 'door-leaf'].map(box) as ReturnType<typeof boxOfOutline>[];
  // the door: a leaf in a rim in a frame, all centred; the frame ends where the screens' frames begin, and the glass stands clear of it; full height, from under the screens to their top
  for (const b of [doorFrame, rim, leaf] as const) near(b.x0, -b.x1, 1e-12, 'the door is centred');
  assert.ok((leaf as { x1: number }).x1 < (rim as { x1: number }).x1 && (rim as { x1: number }).x1 < (doorFrame as { x1: number }).x1, 'leaf in rim in frame');
  near((doorFrame as { x1: number }).x1, (screenFrame as { x0: number }).x0, 1e-12, 'the door frame ends where the screen frames begin');
  assert.ok((pane as { x0: number }).x0 > (doorFrame as { x1: number }).x1 + 0.03, 'the glass stands clear of the door frame');
  assert.ok((leaf as { y0: number }).y0 < (pane as { y0: number }).y0 - 0.5 && (leaf as { y1: number }).y1 >= (pane as { y1: number }).y1, 'a full-height door');
  assert.ok((screenFrame as { x0: number }).x0 < (pane as { x0: number }).x0 && (screenFrame as { y0: number }).y0 < (pane as { y0: number }).y0 && (screenFrame as { y1: number }).y1 > (pane as { y1: number }).y1, 'a frame round the glass');
  // the lamp housing, in the amber panel under the screens and over the bumper, with both lenses inside it: the headlight outboard of the smaller tail lamp, level with it
  const [housing, head, tail, bumper, panel] = ['lamp-housing', 'headlight', 'tail-lamp', 'bumper', 'panel'].map(box) as ReturnType<typeof boxOfOutline>[];
  assert.ok((housing as { y1: number }).y1 < (pane as { y0: number }).y0 && (housing as { y0: number }).y0 >= (bumper as { y1: number }).y1, 'the housing is on the amber panel, under the screen');
  for (const lens of [head, tail] as const) assert.ok(lens.x0 >= (housing as { x0: number }).x0 && lens.x1 <= (housing as { x1: number }).x1 && lens.y0 >= (housing as { y0: number }).y0 && lens.y1 <= (housing as { y1: number }).y1, 'a lens inside the housing');
  const [h, t] = [head as { x0: number; x1: number; y0: number; y1: number }, tail as { x0: number; x1: number; y0: number; y1: number }];
  assert.ok((h.x0 + h.x1) / 2 > (t.x0 + t.x1) / 2 + 0.1, 'the headlight is outboard of the tail lamp');
  assert.ok(h.x1 - h.x0 > t.x1 - t.x0, 'and larger');
  near((h.y0 + h.y1) / 2, (t.y0 + t.y1) / 2, 0.01, 'the two lamps are level');
  assert.ok((panel as { y0: number }).y0 === (bumper as { y1: number }).y1, 'the panel begins where the bumper ends');
  // the display, behind the glass of the cab's right-hand screen only, in its upper half, its lit text inside it; the roof lamp on the middle, under the brow
  const [display, text, roofLamp] = ['display', 'display-text', 'roof-lamp'].map(box) as ReturnType<typeof boxOfOutline>[];
  assert.deepEqual(['display', 'display-text', 'roof-lamp'].map((n) => (SHAPES[n] as FaceShape).mirror), [undefined, undefined, undefined], 'one display, one roof lamp');
  const p = pane as { x0: number; x1: number; y0: number; y1: number };
  const d = display as { x0: number; x1: number; y0: number; y1: number };
  const x = text as { x0: number; x1: number; y0: number; y1: number };
  assert.ok(d.x0 >= p.x0 && d.x1 <= p.x1 && d.y0 >= (p.y0 + p.y1) / 2 && d.y1 <= p.y1, 'the display is in the upper half of the screen');
  assert.ok(x.x0 >= d.x0 && x.x1 <= d.x1 && x.y0 >= d.y0 && x.y1 <= d.y1, 'its text is inside it');
  near((roofLamp as { x0: number }).x0, -(roofLamp as { x1: number }).x1, 1e-12, 'the roof lamp is on the middle');
  assert.ok((roofLamp as { y0: number }).y0 > p.y1, 'and above the screens');
  // the wipers lie along the screens' feet from the inner corner; they are the dark grey of the others' arms
  const wiper = box('wiper') as { x0: number; x1: number; y0: number; y1: number };
  assert.ok(wiper.x0 >= p.x0 - 0.05 && wiper.x1 <= p.x1 && wiper.y0 >= p.y0 - 0.05 && wiper.y1 < (p.y0 + p.y1) / 2, 'a wiper along the foot of the screen');
  assert.equal((SHAPES['wiper'] as FaceShape).colour, 0x3b4048);
  // the coupler's head and its ports are in the recess in the bumper, which ends under the cover line and the amber
  const r = ELECTROSTAR_FACE.recess;
  const head2 = box('coupler-head') as { x0: number; x1: number; y0: number; y1: number };
  assert.ok(head2.x0 >= -r.half && head2.x1 <= r.half && head2.y0 >= r.y0 && head2.y1 <= r.y1, 'the coupler head is in the recess');
  assert.ok(r.y1 < ELECTROSTAR_FACE.coverTop && ELECTROSTAR_FACE.coverTop <= (bumper as { y1: number }).y1, 'the recess ends under the bumper\'s top');
  const port = box('coupler-port') as { x0: number; x1: number; y0: number; y1: number };
  assert.ok(port.x0 >= 0 && port.x1 <= head2.x1 && port.y0 >= head2.y0 && port.y1 <= head2.y1, 'a port in the head');
  // the shapes drawn on both sides, and the ones on one
  assert.deepEqual(ELECTROSTAR_FACE.shapes.filter((s) => s.mirror).map((s) => s.name), ['screen-frame', 'door-handle', 'pane', 'pane-sky-high', 'pane-sky-mid', 'wiper', 'lamp-housing', 'headlight', 'tail-lamp', 'coupler-port']);
  assert.deepEqual(ELECTROSTAR_FACE.shapes.filter((s) => s.trainEnd).map((s) => s.name), ['coupler-head', 'coupler-port']);
});

test('flat faces: shapes that overlap stand 1.5 mm or more apart (6 mm over the glass), the highest is a lens a millimetre inside the end of the car, every outline is convex', () => {
  for (const c of FACE_CASES) {
    const r = c.face.recess;
    type Item = { name: string; outline: [number, number][]; lift: number; glass: boolean; lens: boolean };
    const items: Item[] = [];
    const add = (name: string, outline: readonly Pt[], lift: number, glass: boolean, lens: boolean): void => {
      const pts = outline.map((p): [number, number] => [p[0], p[1]]);
      items.push({ name, outline: signedArea(pts) >= 0 ? pts : pts.reverse(), lift, glass, lens });
    };
    add('coupler-recess', boxOutline(-r.half, r.half, r.y0, r.y1, 0.03), RECESS_LIFT, false, false);
    for (const s of c.face.shapes) {
      add(s.name, s.outline, s.lift, s.glass === true, s.lens !== undefined);
      if (s.mirror) add(`${s.name} (mirrored)`, s.outline.map(([x, y]): [number, number] => [-x, y]), s.lift, s.glass === true, s.lens !== undefined);
    }
    for (const it of items) {
      // convex: every turn the same way, and no point doubled (a fan from the middle needs both)
      let turns = 0;
      for (let i = 0; i < it.outline.length; i++) {
        const p0 = it.outline[i] as [number, number];
        const p1 = it.outline[(i + 1) % it.outline.length] as [number, number];
        const p2 = it.outline[(i + 2) % it.outline.length] as [number, number];
        assert.ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1e-9, `${c.label}, ${it.name}: a doubled point`);
        const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
        assert.ok(cross > -1e-12, `${c.label}, ${it.name}: a turn the wrong way at point ${i + 1}`);
        if (cross > 1e-12) turns++;
      }
      assert.ok(turns >= 3, `${c.label}, ${it.name}: ${turns} corners`);
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i] as Item;
        const b = items[j] as Item;
        if (polyArea(clipConvex(a.outline, b.outline)) < 1e-9) continue;
        assert.ok(Math.abs(a.lift - b.lift) >= 0.0015 - 1e-9, `${c.label}: ${a.name} and ${b.name} overlap and stand ${(Math.abs(a.lift - b.lift) * 1000).toFixed(2)} mm apart`);
        // glass pulls toward the eye (its polygon offset): what lies over it stands 6 mm up, what lies under it simply below
        if (a.glass !== b.glass) {
          const [glass, other] = a.glass ? [a, b] : [b, a];
          assert.ok(other.lift < glass.lift || other.lift - glass.lift >= 0.006 - 1e-9, `${c.label}: ${other.name} lies ${((other.lift - glass.lift) * 1000).toFixed(2)} mm over the glass`);
        }
      }
    }
    const top = Math.max(...items.map((it) => it.lift));
    near(c.face.setback - top, 0.001, 1e-12, `${c.label}: the highest layer stands a millimetre inside the end of the car`);
    assert.ok(items.filter((it) => it.lift === top).every((it) => it.lens), `${c.label}: and it is a lens`);
  }
});

test('Class 387 face: the amber brow runs back over the roof\'s front to the first ring at or beyond its wrap, and no further across than its width asks', () => {
  const g = built('gn387x8');
  const layout = trainLayout('gn387x8');
  const spec = bodySpec('electrostar');
  const sec = carSection(spec);
  const norm = normalised(sec);
  const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
  assert.equal(spec.front.warning, AMBER);
  const wrap = spec.front.warningWrap as number;
  const width = spec.front.warningWidth as number;
  const panelEnd = ringStations(spec.nose).find((s) => s >= wrap - 1e-9) as number;
  for (const car of layout.cars.filter((c) => c.cab)) {
    const here = `car ${car.index} (${car.cab} cab)`;
    const plane = facePlane(car, true, isInterior(car, layout), true);
    const back = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - plane : plane - v.z);
    // the brow is on the nose itself: triangles with a corner behind the face's plane (the face's own caps and panel lie in or just in front of it)
    const brow = trisOfColour(detailOf(g, car), AMBER).filter((t) => t.every((v) => back(v) > -1e-4) && t.some((v) => back(v) > 1e-4));
    assert.ok(brow.length > 20, `${here}: ${brow.length} brow triangles`);
    near(Math.max(...brow.flat().map(back)), panelEnd, ZTOL, `${here}: how far back the brow runs`);
    // across: at the face, no further out than `width` of the ring's widest, and not hardly across at all
    const ring0 = halfAt(sec, norm, egg, ringAt(spec.nose, 0));
    const widest = Math.max(...ring0.map((p) => p[0]));
    const edge = Math.max(...brow.flat().filter((v) => back(v) < 1e-4).map((v) => Math.abs(v.x)));
    assert.ok(edge <= width * widest + ZTOL && edge > 0.4 * widest, `${here}: the brow is ${edge.toFixed(3)} m out at the face, whose widest is ${widest.toFixed(3)} m, asked ${width}`);
    // and it is the body's own white beside it (cheeks of the livery's front colour on the nose, not amber)
    const cheeks = trisOfColour(detailOf(g, car), liveryFor('gn387x8').noseFront).filter((t) => t.every((v) => back(v) > -1e-4 && back(v) < panelEnd + 1e-4 && Math.abs(v.x) > edge - 1e-6 && v.y > 2.0));
    assert.ok(cheeks.length > 0, `${here}: no cheeks of the livery's colour beside the brow`);
  }
});

test('Class 387 face: two units coupled nose to nose do not touch: nothing of either crosses the middle of the gap, and the coupler heads reach it to meet', () => {
  const g = built('gn387x8');
  const layout = trainLayout('gn387x8');
  const a = layout.cars[3] as Car;
  const b = layout.cars[4] as Car;
  assert.ok(a.cab === 'rear' && b.cab === 'front');
  near(a.end, b.start, 1e-9, 'the two cars abut');
  const middle = a.end;
  // every mesh of each car: body, glass, bogies, bellows, cables and couplers
  const boxA = boxOf(named(g, 'car-3'));
  const boxB = boxOf(named(g, 'car-4'));
  assert.ok(boxA.max.z <= middle + ZTOL, `unit 1's cab reaches ${(boxA.max.z - middle).toFixed(5)} m past the middle of the gap`);
  assert.ok(boxB.min.z >= middle - ZTOL, `unit 2's cab reaches ${(middle - boxB.min.z).toFixed(5)} m past the middle of the gap`);
  // the heads of the two couplers are what touch there: they reach it to a millimetre (the gap's other parts stand back from it)
  assert.ok(boxA.max.z >= middle - 1e-3 && boxB.min.z <= middle + 1e-3, 'the coupler heads meet in the middle of the gap');
  // the faces stand END_GAP each side of it, with their flat layers in front
  for (const [car, sign] of [[a, 1], [b, -1]] as const) {
    const plane = facePlane(car, true, true, true);
    near(Math.abs(plane - middle), END_GAP, 1e-9, 'the face stands END_GAP back from the middle');
    const mesh = detailOf(g, car);
    const hit = triangles(mesh).filter((t) => t.every((v) => (v.z - middle) * sign > -1e-4 && (v.z - middle) * sign < ZTOL));
    // what is in the plane of the middle: the coupler's head (its front is a face of triangles lying in it) and nothing else
    assert.ok(hit.every((t) => t.every((v) => Math.abs(v.x) < 0.3 && v.y > 0.5 && v.y < 1.2)), `car ${car.index}: something other than the coupler head reaches the middle of the gap`);
    assert.ok(hit.length >= 2, `car ${car.index}: the coupler head's front`);
  }
});

test('Class 387 face: no other family wears its amber, its door leaf or its pale bumper', () => {
  for (const kind of ['gn717x6', 'tl700x8', 'gc180x5', 'lner5', 'hull5', 'lumo5'] as TrainKind[]) {
    const g = built(kind);
    for (const car of trainLayout(kind).cars.filter((c) => c.cab)) {
      for (const hex of [AMBER, AMBER_DOOR, BUMPER]) assert.equal(trisOfColour(detailOf(g, car), hex).length, 0, `${kind} car ${car.index}: ${hex.toString(16)} on a front that is not a 387's`);
    }
  }
});

test('flat faces: the base of a Desiro City\'s or a 180\'s face is the livery\'s front colour over all of the loft\'s tip ring, and no yellow or orange of the 387\'s stands on it', () => {
  for (const c of FACE_CASES.filter((k) => k.family !== 'electrostar')) {
    const g = built(c.kind);
    const layout = trainLayout(c.kind);
    const whole = polyArea(flatFaceOutline(c.family));
    const front = liveryFor(c.kind).noseFront;
    for (const car of layout.cars.filter((k) => k.cab)) {
      const here = `${c.label} car ${car.index} (${car.cab} cab)`;
      const mesh = detailOf(g, car);
      // the whole ring is one flat cap in the front colour: the 717, the 700 and the 180 have no warning panel in the loft, so no other colour lies on the plane
      // (the 3D coupler\'s base also lies on the plane, turned in toward the car: only what faces out of the end of the train is the cap)
      const cap = faceLayer(mesh, car, false, 0, undefined, c.covered).filter((t) => faceNormal(t).z * outwards(car) > 0.99);
      near(cap.reduce((a, t) => a + areaOf(t), 0), whole, 1e-4, `${here}: the cap`);
      near(faceLayer(mesh, car, false, 0, front, c.covered).filter((t) => faceNormal(t).z * outwards(car) > 0.99).reduce((a, t) => a + areaOf(t), 0), whole, 1e-4, `${here}: all of the cap is the front colour`);
      for (const hex of [AMBER, AMBER_DOOR, BUMPER]) assert.equal(trisOfColour(mesh, hex).length, 0, `${here}: ${hex.toString(16)}, a 387's colour`);
    }
  }
});

test('Class 717 face: a full-height door between two screens, black over white in a black seal; a pod under each screen with a large headlight outboard and up and a small tail lamp inboard and under it; upright wipers; the display on one screen', () => {
  const S = shapesOf(DESIRO_717_FACE);
  const box = (name: string): ReturnType<typeof boxOfOutline> => boxOfOutline((S[name] as FaceShape).outline);
  const pane = box('pane');
  const screenFrame = box('screen-frame');
  const doorFrame = box('door-frame');
  const upper = box('door-leaf-upper');
  const lower = box('door-leaf-lower');
  // the door: centred, its leaves inside its frame, which ends where the screens' frames begin, full height from the frame's foot under the screens to the top of the glass
  for (const b of [doorFrame, upper, lower]) near(b.x0, -b.x1, 1e-12, 'the door is centred');
  assert.ok(upper.x1 < doorFrame.x1 && lower.x1 < doorFrame.x1, 'leaves inside the frame');
  near(doorFrame.x1, screenFrame.x0, 1e-12, 'the door frame ends where the screen frames begin');
  assert.ok(pane.x0 > doorFrame.x1 + 0.03, 'the glass stands clear of the door frame');
  assert.ok(doorFrame.y0 < pane.y0 - 0.5 && doorFrame.y1 >= pane.y1, 'a full-height door');
  // black over white: the dark leaf to the top of the glass, the body\'s white one from the frame\'s foot to a hand\'s width under it, the frame\'s black showing in the seam
  assert.ok(lumaOf((S['door-leaf-upper'] as FaceShape).colour as number) < 0.2, 'a dark upper leaf');
  assert.equal((S['door-leaf-lower'] as FaceShape).colour, liveryFor('gn717x6').noseFront, 'a lower leaf in the body\'s white');
  assert.ok(upper.y1 >= pane.y1 - 1e-9 && lower.y0 > doorFrame.y0 && upper.y0 - lower.y1 > 0.01 && upper.y0 - lower.y1 < 0.06, 'the leaves meet at a seam of the frame\'s black');
  assert.ok(Math.abs(upper.y0 - screenFrame.y0) < 0.05, 'the dark leaf begins at the screens\' sill');
  // the black mask: across the whole front from the screens' sill, so it is continuous with the screens\' frames, over the pods
  const mask = box('mask');
  assert.ok(Math.abs(mask.y0 - screenFrame.y0) < 0.02 && mask.x0 <= -1.4 && mask.x1 >= 1.4, 'the mask runs across from the screens\' sill');
  // the pod: a dark box under the screen\'s outer half, under the mask\'s foot, the headlight and the tail lamp in it
  const pod = box('lamp-pod');
  const head = box('headlight');
  const tail = box('tail-lamp');
  assert.ok(pod.y1 < mask.y0 && (pod.x0 + pod.x1) / 2 >= (pane.x0 + pane.x1) / 2 - 1e-9, 'a pod under the screen\'s outer half');
  for (const lens of [head, tail]) assert.ok(lens.x0 >= pod.x0 && lens.x1 <= pod.x1 && lens.y0 >= pod.y0 && lens.y1 <= pod.y1, 'a lens inside the pod');
  const centre = (b: typeof pod): [number, number] => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  assert.ok(centre(head)[0] > centre(tail)[0] + 0.1 && centre(head)[1] > centre(tail)[1] + 0.05, 'the headlight is outboard of the tail lamp and above it');
  assert.ok(head.x1 - head.x0 > 1.5 * (tail.x1 - tail.x0), 'and much the larger');
  // the wipers: a thin bar standing upright against the door\'s side of each screen
  const wiper = box('wiper');
  assert.ok(S['wiper']?.mirror && wiper.x1 - wiper.x0 < 0.1 * (wiper.y1 - wiper.y0), 'a wiper on each screen, parked upright');
  assert.ok(wiper.x0 >= pane.x0 - 0.05 && wiper.x0 < pane.x0 + 0.15 && wiper.y0 >= pane.y0 - 0.05 && wiper.y1 <= pane.y1, 'against the door\'s edge of the screen');
  // the display: one, in the upper half of the cab\'s right-hand screen, its lit text inside it
  const display = box('display');
  const text = box('display-text');
  assert.equal(S['display']?.mirror, undefined, 'one display');
  assert.ok(display.x0 >= pane.x0 && display.x1 <= pane.x1 && display.y0 >= (pane.y0 + pane.y1) / 2 && display.y1 <= pane.y1, 'in the upper half of the screen');
  assert.ok(text.x0 >= display.x0 && text.x1 <= display.x1 && text.y0 >= display.y0 && text.y1 <= display.y1, 'its text inside it');
  // the marker lamp on the door\'s upper leaf, on the middle
  const lamp = box('roof-lamp');
  near(lamp.x0, -lamp.x1, 1e-12, 'the marker lamp is on the middle');
  assert.ok(lamp.x0 >= upper.x0 && lamp.x1 <= upper.x1 && lamp.y0 >= upper.y0 && lamp.y1 <= upper.y1, 'on the door\'s upper leaf');
  // the recess is the coupler\'s, under the door, and 1.24 m wide
  assert.ok(DESIRO_717_FACE.recess.y1 < doorFrame.y0 && DESIRO_717_FACE.recess.half === 0.62, 'the recess under the door');
  // the brow line is the livery\'s own pinstripe in a band 2.5 cm wide between two layers of the black (the same black as the dome over the roof\'s front)
  const line = S['brow-line'] as FaceShape;
  const browMask = S['brow-mask'] as FaceShape;
  assert.equal(line.colour, GN_PINSTRIPE);
  assert.equal(browMask.colour, (S['mask'] as FaceShape).colour);
  near((browMask.inset ?? 0) - (line.inset ?? 0), 0.025, 1e-12, 'the orange band\'s width');
  assert.ok(line.lift > (S['mask'] as FaceShape).lift && browMask.lift > line.lift, 'orange over the black, the black over the orange');
  assert.equal(liveryFor('gn717x6').noseTop, (S['mask'] as FaceShape).colour, 'the dome over the roof\'s front is the mask\'s black');
});

test('Class 700 face: one broad pane across the whole front in a seal under a blue-black mask, a yellow trapezoid under it between white cheeks, a pod under each outer corner with the headlight inboard and a second lens outboard, one slanted wiper, a grey display strip, a rectangular marker lamp, and no door', () => {
  const S = shapesOf(DESIRO_700_FACE);
  const box = (name: string): ReturnType<typeof boxOfOutline> => boxOfOutline((S[name] as FaceShape).outline);
  assert.deepEqual(DESIRO_700_FACE.shapes.filter((sh) => /door/.test(sh.name)), [], 'no door shapes');
  const pane = box('pane');
  const frame = box('screen-frame');
  near(pane.x0, -pane.x1, 1e-12, 'the pane is centred');
  assert.equal(S['pane']?.mirror, undefined, 'one pane, not a pair');
  assert.ok(frame.y0 < pane.y0 && frame.y1 > pane.y1 && ((S['screen-frame'] as FaceShape).inset ?? 0) < ((S['pane'] as FaceShape).inset ?? 0), 'a seal round the glass, which reaches further to the face\'s edge');
  // the mask: from the screen frame\'s foot up, over the whole width, a blue-black (the 717\'s is neutral)
  const mask = box('mask');
  assert.ok(Math.abs(mask.y0 - frame.y0) < 0.02 && mask.x0 <= -1.4 && mask.x1 >= 1.4, 'the mask runs across from the sill');
  const m700 = (S['mask'] as FaceShape).colour as number;
  assert.ok((m700 & 255) > ((m700 >> 16) & 255) + 8, 'blue-black');
  assert.equal(liveryFor('tl700x8').noseTop, m700, 'the dome over the roof\'s front is the mask\'s black');
  assert.equal((S['brow-mask'] as FaceShape).colour, m700);
  // the panel: a trapezoid symmetric about the middle, widest at its top edge under the glass, narrowing to a foot that bows down, clear of the coupler recess
  const panel = (S['warning-panel'] as FaceShape).outline;
  assert.equal((S['warning-panel'] as FaceShape).colour, YELLOW);
  const top = Math.max(...panel.map((p) => p[1]));
  const foot = Math.min(...panel.map((p) => p[1]));
  for (const [x, y] of panel) assert.ok(panel.some(([u, v]) => Math.abs(u + x) < 1e-12 && Math.abs(v - y) < 1e-12), `the panel is symmetric: (${x}, ${y})`);
  const topWidth = 2 * Math.max(...panel.filter((p) => p[1] === top).map((p) => p[0]));
  assert.ok(topWidth > 1.6 && topWidth < 2.0, `a panel ${topWidth.toFixed(2)} m wide at the glass`);
  assert.ok(Math.abs(top - frame.y0) < 0.05, 'its top edge is the glass\'s sill');
  const right = panel.filter((p) => p[0] >= 0).sort((p, q) => q[1] - p[1]);
  for (let i = 1; i < right.length; i++) assert.ok((right[i] as [number, number])[0] <= (right[i - 1] as [number, number])[0] + 1e-12, 'narrower the lower it goes');
  assert.ok(foot > DESIRO_700_FACE.recess.y1 + 0.03, 'the panel\'s foot stands clear of the recess');
  assert.ok(2 * (right.find((p) => p[1] <= 1.3) as [number, number])[0] < 1.2, 'about a metre wide at its foot, white cheeks either side');
  // the pods: under the glass\'s outer corners, each with two round lenses level and the same size, the headlight inboard
  const pod = box('lamp-pod');
  const head = box('headlight');
  const second = box('tail-lamp');
  assert.ok(pod.y1 < pane.y0 && pod.x0 > 0.6, 'a pod under the glass\'s outer corner');
  for (const lens of [head, second]) assert.ok(lens.x0 >= pod.x0 && lens.x1 <= pod.x1 && lens.y0 >= pod.y0 && lens.y1 <= pod.y1, 'a lens inside the pod');
  near((head.y0 + head.y1) / 2, (second.y0 + second.y1) / 2, 1e-12, 'level');
  near(head.x1 - head.x0, second.x1 - second.x0, 1e-12, 'the same size');
  assert.ok((head.x0 + head.x1) / 2 < (second.x0 + second.x1) / 2, 'the headlight is the inboard lens');
  // the wiper: one, slanted, at the glass\'s left, inside the glass; the display a pale grey-blue strip under the glass\'s top edge (not lit, no text); a rectangular marker lamp on the brow
  const wiper = box('wiper');
  assert.equal(S['wiper']?.mirror, undefined, 'one wiper');
  const lean = (wiper.x1 - wiper.x0) / (wiper.y1 - wiper.y0);
  assert.ok(lean > 0.2 && lean < 1, `a wiper slanted ${lean.toFixed(2)}`);
  assert.ok(wiper.y0 >= pane.y0 - 0.05 && wiper.y1 <= pane.y1 && wiper.x0 >= pane.x0 && wiper.x1 <= pane.x1, 'inside the glass');
  const display = box('display');
  const dc = (S['display'] as FaceShape).colour as number;
  assert.ok((dc & 255) > ((dc >> 16) & 255) && display.x1 - display.x0 > 3 * (display.y1 - display.y0) && display.y0 >= (pane.y0 + pane.y1) / 2 && display.y1 <= pane.y1, 'a grey-blue strip in the upper half of the glass');
  assert.equal(DESIRO_700_FACE.shapes.some((sh) => sh.name === 'display-text'), false, 'unlit, with no text');
  const lamp = box('roof-lamp');
  near(lamp.x0, -lamp.x1, 1e-12, 'the marker lamp is on the middle');
  assert.ok(lamp.y0 >= pane.y1 && lamp.x1 - lamp.x0 > 1.5 * (lamp.y1 - lamp.y0), 'a rectangle on the brow, over the glass');
});

test('Desiro City faces: the colours only a 700 or a 717 wears are on its cabs, on both cab cars, and on no other kind', () => {
  const S717 = shapesOf(DESIRO_717_FACE);
  const S700 = shapesOf(DESIRO_700_FACE);
  const own: [TrainKind, number, string][] = [
    ['gn717x6', S717['door-leaf-upper']?.colour as number, '717 door leaf'],
    ['tl700x8', S700['mask']?.colour as number, '700 mask'],
    ['tl700x8', S700['brow-line']?.colour as number, '700 brow line'],
    ['tl700x8', S700['display']?.colour as number, '700 display'],
  ];
  for (const [kind, hex, what] of own) {
    for (const k of ALL_KINDS) {
      const g = built(k);
      // (a Class 700 is a tl700x8 and a tl700x12 alike)
      const mine = trainLayout(k).spec.family === trainLayout(kind).spec.family;
      for (const car of trainLayout(k).cars) {
        const n = trisOfColour(detailOf(g, car), hex).length;
        if (mine && car.cab) assert.ok(n > 0, `${k} car ${car.index}: the ${what} (${hex.toString(16)}) is not on its cab`);
        else assert.equal(n, 0, `${k} car ${car.index}: the ${what} (${hex.toString(16)}) is on a car that is not a cab of its own family`);
      }
    }
  }
});

test('lamps: two headlight clusters on every cab, one each side, level and mirrored, above the coupler cover: on the face, or (the AT300) in a window on each cheek, behind it', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const r0 = ringAt(spec.nose, 0);
    const tipHalf = halfAt(sec, norm, egg, r0);
    const cluster = frontOf(kind).cluster;
    const lamps = all(g, 'headlight');
    assert.equal(lamps.length, 2 * layout.cars.filter((c) => c.cab).length, `${kind}: two per cab`);
    for (const car of layout.cars.filter((c) => c.cab)) {
      const mine = lamps.filter((l) => l.parent?.name === `car-${car.index}`);
      assert.equal(mine.length, 2, `${kind} car ${car.index} lamps`);
      const [a, b] = mine.map(worldPos) as [THREE.Vector3, THREE.Vector3];
      near(a.x, -b.x, 1e-9, `${kind} car ${car.index} lamps are symmetric`);
      near(a.y, b.y, 1e-9, `${kind} car ${car.index} lamps are level`);
      const face = car.cab === 'front' ? car.start : car.end;
      if (cluster) {
        // CHANGED (the AT300's lamps were on the face, 0.15 m inside its outline): the marker stands at the headlight lens's centre, in the cluster's window on the cheek, so it is
        // as far out as the nose's flank is there (lner-800-113-newcastle-2025: about 0.9 m either side of the middle and 1.65 m up), a little behind the face
        const flank = xAtY(halfAt(sec, norm, egg, ringAt(spec.nose, cluster.head.s)), cluster.head.y);
        near(Math.abs(a.x), flank, 0.03, `${kind} car ${car.index}: the headlight stands on the flank at its own height`);
        assert.ok(Math.abs(a.x) > 0.8, `${kind} car ${car.index}: the headlight is only ${Math.abs(a.x)} m out`);
        near(a.y, cluster.head.y, 0.02, `${kind} car ${car.index}: the headlight's height`);
        near(Math.abs(a.z - face), cluster.head.s, 0.03, `${kind} car ${car.index}: the headlight stands ${cluster.head.s} m behind the face`);
      } else if (spec.front.face) {
        // CHANGED (every lamp stood at 0.4 to 0.8 of its face's height): the 387's are low on the face, in the lower outer corners of its amber panels (gn387_01_387114_ely,
        // gn387_02_387121_ely), the 717's and the 700's in pods under the outer feet of their screens (GN717-03-717005-Potters-Bar, tl700_05_0146_farringdon), where the face's spec puts
        // the headlight lens: the marker stands at that lens's centre
        const lens = boxOfOutline((shapesOf(spec.front.face) ['headlight'] as FaceShape).outline);
        near(Math.abs(a.x), (lens.x0 + lens.x1) / 2, 1e-6, `${kind} car ${car.index}: the headlight's place across`);
        near(a.y, (lens.y0 + lens.y1) / 2, 1e-6, `${kind} car ${car.index}: the headlight's height`);
        assert.ok(Math.abs(a.x) + (lens.x1 - lens.x0) / 2 + 0.02 < xAtY(tipHalf, a.y), `${kind} lamp at x = ${a.x}, face half-width ${xAtY(tipHalf, a.y)} there`);
        assert.ok(Math.abs(a.z - face) < 0.4, `${kind} car ${car.index} lamps ${a.z} are at the face, ${face}`);
      } else {
        // a lamp is 0.26 m wide: all of it stands inside the face's outline at its height, and clear of the middle
        assert.ok(Math.abs(a.x) > 0.2 && Math.abs(a.x) + 0.15 < xAtY(tipHalf, a.y), `${kind} lamp at x = ${a.x}, face half-width ${xAtY(tipHalf, a.y)} there`);
        assert.ok(a.y > r0.bottom + 0.4 * (r0.top - r0.bottom) && a.y < r0.bottom + 0.8 * (r0.top - r0.bottom), `${kind} lamp height ${a.y}`);
        assert.ok(Math.abs(a.z - face) < 0.4, `${kind} car ${car.index} lamps ${a.z} are at the face, ${face}`);
      }
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

test('fronts: the flat faces\' lenses are round and stand toward the corners of the face, each in a dark pod, with each family\'s second lamp where its photographs put it', () => {
  // CHANGED (the lenses used to be one colour at both ends of a train): the leading end has its headlights lit and its tail lamps dark, the
  // trailing end the other way round (see LENS); each end's lenses are found by the colour they have there
  // CHANGED (the AT300 was one of the kinds this test measured): its lenses are in a cluster on each cheek, with their own test (the AT300 kinds' lamp clusters)
  // CHANGED (the 387 was too, and the 717 and the 700): their lamps are shapes on their flat faces, each lens and pod checked with the others (the flat faces)
  // CHANGED (the 180 was the last family measured here, by a lamps spec: a lens size, a place as a fraction of the face, a bezel colour): its lamps are shapes of its flat face now
  // (ADELANTE_FACE), so the spec is gone, and the loop that measured it with it. The flat-face tests hold what that loop held, on the shapes: each lens at its declared size, shape and place,
  // level and mirrored, inside the face's outline, on the highest layer, a millimetre inside the end of the car (the layers test), the lit and dark lenses by end (the lens test above),
  // and below, that each is round, toward the corner of the face and in a pod.
  for (const f of FAMILIES) assert.ok(!('lamps' in bodySpec(f).front), `${f}: a lamps spec`);
  assert.ok(bodySpec('at300').front.cluster, 'the AT300 has a lamp cluster on each cheek');
  for (const f of FAMILIES.filter((fam) => fam !== 'at300')) assert.ok(bodySpec(f).front.face, `${f}: its lamps are shapes of a flat face`);
  assert.deepEqual(FACE_CASES.map((c) => c.family), FAMILIES.filter((f) => f !== 'at300'), 'a case for every flat face');
  // the flat faces' two lenses, as boxes: the 717's tail lamp is inboard of and under its headlight, the 700's outboard of it and level, the 387's inboard and level, the 180's straight above it
  const centre = (face: FaceSpec, name: string): [number, number] => {
    const lens = boxOfOutline((shapesOf(face)[name] as FaceShape).outline);
    return [(lens.x0 + lens.x1) / 2, (lens.y0 + lens.y1) / 2];
  };
  const spread = (face: FaceSpec): [number, number] => {
    const h = centre(face, 'headlight');
    const t = centre(face, 'tail-lamp');
    return [t[0] - h[0], t[1] - h[1]];
  };
  assert.ok(spread(DESIRO_717_FACE)[0] < -0.1 && spread(DESIRO_717_FACE)[1] < -0.05, 'the 717\'s tail lamp is inboard of the headlight and under it');
  assert.ok(spread(DESIRO_700_FACE)[0] > 0.1 && Math.abs(spread(DESIRO_700_FACE)[1]) < 1e-9, 'the 700 has its second lamp outboard of the headlight, level with it');
  assert.ok(spread(ELECTROSTAR_FACE)[0] < -0.1 && Math.abs(spread(ELECTROSTAR_FACE)[1]) < 1e-9, 'the 387\'s smaller lamp is inboard of its headlight, level with it');
  assert.ok(Math.abs(spread(ADELANTE_FACE)[0]) < 1e-9 && spread(ADELANTE_FACE)[1] > 0.2, 'the 180 has its smaller lamp straight above the headlight');
  const width = (face: FaceSpec): number => {
    const lens = boxOfOutline((shapesOf(face)['headlight'] as FaceShape).outline);
    return lens.x1 - lens.x0;
  };
  assert.ok(width(DESIRO_700_FACE) < width(ADELANTE_FACE), 'the 700 has a smaller lens than the 180');
  for (const c of FACE_CASES) {
    // round: every vertex of each lens the same distance from its middle (a polygon of equal radii), and a dozen or more of them (a square has equal radii too)
    for (const name of ['headlight', 'tail-lamp']) {
      const outline = (shapesOf(c.face)[name] as FaceShape).outline;
      assert.ok(outline.length >= 12, `${c.label}: the ${name} is a polygon of ${outline.length} points`);
      const mx = outline.reduce((a, pt) => a + pt[0], 0) / outline.length;
      const my = outline.reduce((a, pt) => a + pt[1], 0) / outline.length;
      const radii = outline.map(([x, y]) => Math.hypot(x - mx, y - my));
      assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-9 && Math.min(...radii) > 0.04, `${c.label}: the ${name} is a circle of at least 4 cm`);
    }
    // the lamps stand toward the corners of the face, not in its middle (in photographs of every one of these fronts)
    const lens = boxOfOutline((shapesOf(c.face)['headlight'] as FaceShape).outline);
    const face = flatFaceOutline(c.family);
    assert.ok(Math.abs(lens.x0 + lens.x1) / 2 >= 0.6 * Math.max(...face.map((pt) => pt[0])), `${c.label}: the headlight stands toward the corner of the face`);
    // each lens is in the pod or housing (the 387's housing, the Desiro Citys' and the 180's pods), the lens's every vertex inside it
    const pod = (shapesOf(c.face)['lamp-pod'] ?? shapesOf(c.face)['lamp-housing']) as FaceShape;
    const podOutline = pod.outline.map((pt): [number, number] => [pt[0], pt[1]]);
    if (signedArea(podOutline) < 0) podOutline.reverse();
    for (const name of ['headlight', 'tail-lamp']) for (const [x, y] of (shapesOf(c.face)[name] as FaceShape).outline) assert.ok(insideConvex(podOutline, x, y, 0.005), `${c.label}: the ${name}'s vertex (${x.toFixed(3)}, ${y.toFixed(3)}) is outside the pod`);
    // the pods or housings are the near-black of the 387's: a dark box in the paint round the lenses; the 180's are a lighter smoked grey, so they read against its black front
    if (c.family === 'adelante') assert.ok(lumaOf(pod.colour as number) > 0.2 && lumaOf(pod.colour as number) < 0.4, `${c.label}: a smoked-grey pod`);
    else assert.ok(lumaOf(pod.colour as number) < 0.15, `${c.label}: a dark pod`);
  }
});

test('fronts: a yellow warning panel is a shape of the 700\'s face and of the 180\'s, on the cab cars and nowhere else; nothing is yellow on a 717, and the 387\'s panel is an amber brow over the roof\'s front', () => {
  assert.equal(YELLOW, 0xf2c100, 'the warning yellow');
  // which families have a panel in the loft: only the 387 (CHANGED: amber now, the photographs' colour, as panels of its flat face and a brow over the roof's front: the Class 387's flat face); the 700's and the 180's yellow panels
  // are shapes of their faces (forum posts: the 700s "still have a yellow panel"; photographs of both); not the 717 or the Azuma
  const warning = Object.fromEntries(FAMILIES.map((f) => [f, bodySpec(f).front.warning]));
  // CHANGED (the 700's was the loft's, wrapped over the nose): the 700's panel is a shape on its flat face, a trapezoid between white cheeks (the Class 700's face)
  // CHANGED (the 180's was too: a yellow cap over the face above the cover and 0.3 m of the nose behind it): the 180's is a shape of its flat face, a trapezoid under the glass between its pods (the
  // Class 180's face); GC180-05 and GC180-01 show it ending at the glass's foot with the black dome behind it
  assert.deepEqual(warning, { at300: null, electrostar: AMBER, desiro: null, desiro700: null, adelante: null });
  // how far back and how far across: a 387's brow is 0.3 m back over the top nine tenths of the face's width (the photographs' cheeks beside the screens are white); no other family has one
  const reach = Object.fromEntries(FAMILIES.map((f) => [f, [bodySpec(f).front.warningWrap, bodySpec(f).front.warningWidth]]));
  assert.deepEqual(reach, { at300: [undefined, undefined], electrostar: [0.3, 0.9], desiro: [undefined, undefined], desiro700: [undefined, undefined], adelante: [undefined, undefined] });
  // the 700's and the 180's own: a shape of its face, in the warning yellow, on the cab cars only and nowhere else on the nose (it does not wrap back over the roof)
  const withPanel = FACE_CASES.filter((k) => shapesOf(k.face)['warning-panel']);
  assert.deepEqual(withPanel.map((k) => k.family), ['desiro700', 'adelante']);
  for (const c of withPanel) {
    const shape = shapesOf(c.face)['warning-panel'] as FaceShape;
    assert.equal(shape.colour, YELLOW);
    const g = built(c.kind);
    for (const car of trainLayout(c.kind).cars) {
      const yellow = trisOfColour(detailOf(g, car), YELLOW);
      if (!car.cab) {
        assert.equal(yellow.length, 0, `${c.kind} car ${car.index}: yellow on a car with no warning panel`);
        continue;
      }
      const onFace = faceLayer(detailOf(g, car), car, false, shape.lift, YELLOW, c.covered);
      // a convex polygon is drawn as a fan from its middle, a triangle to a point: the panel's outline clipped to the face's
      const clipped = clipConvex((placedOutlines(shape, car)[0] as [number, number][]), flatFaceOutline(c.family), shape.inset ?? 0);
      assert.ok(clipped.length >= 4, `${c.kind} car ${car.index}: the panel clipped to the face has ${clipped.length} points`);
      assert.equal(onFace.length, clipped.length, `${c.kind} car ${car.index}: ${onFace.length} triangles of yellow on the face, ${clipped.length} wanted`);
      assert.equal(yellow.length, onFace.length, `${c.kind} car ${car.index}: yellow somewhere but the panel on the face`);
    }
  }
  // (CHANGED: the loft's panel was checked here on the 180, over its face above the cover, back along the nose and across to cheeks: it is only the 387's brow now, checked with its face, in
  // 'Class 387 face: the amber brow runs back over the roof's front...')
  // and a 717 has none: no yellow on any of its cars
  const g717 = built('gn717x6');
  for (const car of trainLayout('gn717x6').cars) assert.equal(trisOfColour(detailOf(g717, car), YELLOW).length, 0, `gn717x6 car ${car.index}: yellow on a 717`);
});

test('fronts: dark parked wipers lie right along the foot of the windscreen and a lit display runs across its top, both lifted a little off the nose\'s own surface', () => {
  // a dark grey, close to the glass's black: pale arms standing higher up the glass read as eyebrows
  const WIPER = 0x3b4048;
  assert.ok((0.2126 * ((WIPER >> 16) & 255) + 0.7152 * ((WIPER >> 8) & 255) + 0.0722 * (WIPER & 255)) / 255 < 0.3, 'dark wiper arms');
  const DISPLAY = 0xffa000;
  // CHANGED (the 387, the 717 and the 700 were of these): their wipers and display are shapes on their flat faces, checked with the rest of them (the flat faces)
  for (const kind of ['lner5', 'gc180x5'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const screen = spec.glass.screen as NonNullable<typeof spec.glass.screen>;
    assert.ok(screen, `${kind}: a windscreen on the roof`);
    for (const car of endCabs(layout)) {
      const mesh = detailOf(g, car);
      const face = facePlane(car, spec.front.coupler.covered, false);
      const sOf = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - face : face - v.z);
      const wipers = trisOfColour(mesh, WIPER);
      const display = trisOfColour(mesh, DISPLAY);
      assert.equal(wipers.length > 0, spec.front.wipers, `${kind} car ${car.index}: wipers`);
      assert.equal(display.length > 0, spec.front.display, `${kind} car ${car.index}: display`);
      // CHANGED (every arm lay along the glass's foot): the 180's arms are parked leaning up the glass, dark on it, about half way up each pane (GC180-05, GC180-01): `wiperRise` metres along the nose
      const rise = spec.front.wiperRise ?? 0.08;
      if (kind === 'gc180x5') assert.ok(rise >= 0.3, `${kind}: the 180's arms park leaning up the glass, not along its foot (rise ${rise})`);
      if (wipers.length) assert.ok(Math.max(...wipers.flat().map(sOf)) >= screen.s0 + rise - 0.05, `${kind} car ${car.index}: the arms rise only ${(Math.max(...wipers.flat().map(sOf)) - screen.s0).toFixed(2)} m up the glass, not ${rise}`);
      const cases: [Tri[], string, number, number, number][] = [
        // an arm lies within 12 cm of the glass's lower edge (a 180's within its rise), and no further out than 0.85 m: it never stands up the glass, where it would read as an eyebrow
        [wipers, 'wiper', screen.s0 - 0.02, screen.s0 + rise + 0.04, 0.85],
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

test('fronts: the Azuma\'s front: a round-lensed lamp cluster on each cheek, parked wipers, a covered plain coupler, no display, door or warning panel', () => {
  // CHANGED (the lamps were low and bare, at 0.56 of the face's height and 0.6 of its half-width, with no housing): lner-800-113-newcastle-2025 and
  // hull-802-doncaster-2024 show the headlamp pod in the face's upper outer corner, a dark housing round the lamp with the tail lamp beneath it
  // CHANGED again (rectangular lamps with no wipers, a pod on the face only): LUMO-04-Lumo-803003-at-Edinburgh-Waverley, hull-802-doncaster-2024 and
  // lner-800-doncaster-2026 show round lenses in a housing that sweeps back and up the cheek, and wiper arms parked on the glass
  // CHANGED a third time (a pod with the lenses on the face): lner-800-113-newcastle-2025 (head on) and lner-801-214-2025 show the headlights about 0.9 m either side of the
  // middle and 1.65 m up, in a slanted smoked-glass window with a pale rim that wraps from the face onto the cheek, a smaller lamp below and nearer the face: the spec is that window
  assert.deepEqual(bodySpec('at300').front, {
    cluster: {
      window: { y0: 1.2, y1: 1.86, sFront0: FACE_CLEAR, sBack0: 0.2, sFront1: 0.32, sBack1: 0.9, colour: POD },
      head: { s: 0.4, y: 1.66, r: 0.11 },
      tail: { s: 0.2, y: 1.42, r: 0.075 },
      rim: { colour: 0xc7ccd3, width: 0.025 },
    },
    frame: 0.07,
    wipers: true,
    display: false,
    warning: null,
    coupler: { style: 'plain', covered: true },
  });
});

test('fronts: only the 387 and the 717 have a door in their faces, full height between two screens; no front has the old outlined door on its lower face, and none carries a door marker', () => {
  // CHANGED (the 717's front door was a small outlined box on its lower face between the lamps, with a window, a handle and a marker): GN717-03-717005-Potters-Bar and GN717-01-717013-HDW show
  // a full-height door at the middle of its face, between the two screens, black over a white lower leaf; it is shapes of its flat face now (the Class 717's face), and nothing has the old door
  // CHANGED (FrontSpec.door is gone: every family had it null, so its block in buildTrain never ran): the check reads the field through a cast, so a spec that sets one again is still caught, since nothing would draw it
  assert.deepEqual(FAMILIES.filter((f) => (bodySpec(f).front as unknown as { door?: unknown }).door), [], 'the families with the old outlined front door');
  assert.deepEqual(FAMILIES.filter((f) => bodySpec(f).front.face?.shapes.some((sh) => sh.name === 'door-frame')), ['electrostar', 'desiro'], 'the families with a door shape in their face');
  for (const kind of ['lner5', 'gn387x4', 'gn717x6', 'tl700x8', 'gc180x5'] as TrainKind[]) assert.equal(all(built(kind), 'front-door').length, 0, `${kind}: front-door markers`);
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
      // CHANGED (within 2 cm of the car's end): a cover stands on the face's plane, the setback behind the end (NOSE_RECESS, or a flat face's, which has more layers to fit in front of it)
      const recess = front.face ? FLAT_SETBACK : NOSE_RECESS;
      near(zs[0] as number, recess, 1e-6, `${kind} front cover`);
      near(zs[1] as number, layout.length - recess, 1e-6, `${kind} rear cover`);
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
  // CHANGED (NOSE_RECESS, 10 mm): the 387's flat face has its layers in front of its plane, the highest a millimetre short of the car's end
  assert.equal(faceSetback('electrostar'), FLAT_SETBACK);
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

test('couplers: where two 387 units meet, each nose has an open recess, a jumper cable slung to the other unit, and a coupler head that touches the other\'s; at the train\'s ends the recess holds the coupler\'s head', () => {
  // CHANGED (a cover with a seam and latches at the train's ends, and the recess only where units meet): a flat bumper has no cover; its recess is in the face at both kinds of end,
  // and holds the Dellner head drawn on the face at the train's ends (the Class 387's flat face)
  const CABLE = 0x111214;
  const HEAD_FACE = 0x17191c;
  const RECESS = 0x0d0e10;
  const g = built('gn387x8');
  const layout = trainLayout('gn387x8');
  const face = flatFaceOutline();
  const foot = Math.min(...face.map((p) => p[1]));
  const r = ELECTROSTAR_FACE.recess;
  const head = SHAPES['coupler-head'] as FaceShape;
  const coverTop = (all(named(g, 'car-0'), 'coupler-cover')[0] as THREE.Object3D).userData.y1 as number;
  near(coverTop, ELECTROSTAR_FACE.coverTop, 1e-9, 'the cover marker says where the bumper ends');
  for (const car of layout.cars.filter((c) => c.cab)) {
    const interior = isInterior(car, layout);
    const mesh = detailOf(g, car);
    const out = outwards(car);
    const plane = facePlane(car, true, interior, true);
    const here = `gn387x8 car ${car.index}`;
    // the recess, a dark patch in the bumper at either kind of end: the spec's box, its foot cut by the face's bottom edge
    const recess = faceLayer(mesh, car, interior, RECESS_LIFT, RECESS);
    assert.ok(recess.length > 8, `${here}: no recess`);
    const rb = boxOfTris(recess);
    near(rb.min.y, Math.max(r.y0, foot), 1e-6, `${here} recess foot`);
    near(rb.max.y, r.y1, 1e-6, `${here} recess top`);
    near(rb.max.x, r.half, 1e-6, `${here} recess edge`);
    near(rb.min.x, -rb.max.x, 1e-6, `${here} recess symmetric`);
    // no cover to seam, so no seam and no latches on the face at either kind of end
    for (const hex of [0x1b1d21, 0x484c53]) assert.equal(trisOfColour(mesh, hex).length, 0, `${here}: a cover's seam in ${hex.toString(16)}`);
    const cables = trisOfColour(mesh, CABLE);
    const onFace = faceLayer(mesh, car, interior, head.lift, head.colour);
    if (!interior) {
      assert.equal(cables.length, 0, `${here}: a jumper cable at the end of the train`);
      // the coupler's head is drawn on the face, in the recess
      const hb = boxOfTris(onFace);
      assert.ok(hb.min.x >= rb.min.x && hb.max.x <= rb.max.x && hb.min.y >= rb.min.y && hb.max.y <= rb.max.y, `${here}: the coupler head is not in the recess`);
      continue;
    }
    // none of the train-end furniture where units meet: the head on the face and its ports are the 3D coupler out in the gap
    assert.equal(onFace.length, 0, `${here}: a coupler head drawn on the face where one stands out in the gap`);
    // two cables, one each side, from a socket on the face just over the recess down and out to the middle of the gap
    const cb = boxOfTris(cables);
    assert.ok(cb.min.x < -0.2 && cb.max.x > 0.2 && cb.max.y - cb.min.y > 0.14, `${here} cables span x ${cb.min.x}..${cb.max.x}, y ${cb.min.y}..${cb.max.y}`);
    assert.ok(cb.max.y < ELECTROSTAR_FACE.coverTop + 0.05 && cb.max.y > r.y1, `${here}: the cables hang from ${cb.max.y.toFixed(3)} m, over the recess's top at ${r.y1} m and under the amber`);
    const reachOut = Math.max(...cables.flat().map((v) => out * (v.z - plane)));
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
  // CHANGED (the 387 was one of these): a flat bumper has no cover, so no seam of either colour (below, with the 180's open coupler)
  for (const [kind, want, other] of [['lner5', SEAM_DARK, SEAM_LIGHT], ['hull5', SEAM_LIGHT, SEAM_DARK]] as const) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of endCabs(layout)) {
      const plane = facePlane(car, true, false) + outwards(car) * COVER_RELIEF;
      const onPlane = (hex: number): Tri[] => trisOfColour(detailOf(g, car), hex).filter((t) => t.every((v) => Math.abs(v.z - plane) < ZTOL));
      assert.ok(onPlane(want).length > 0, `${kind} car ${car.index}: no seam in ${want.toString(16)}`);
      assert.equal(onPlane(other).length, 0, `${kind} car ${car.index}: a seam in ${other.toString(16)}`);
    }
  }
  // the 387's flat bumper has no cover to seam: no seam or latch in either colour anywhere on its cabs
  const flat = built('gn387x4');
  for (const car of endCabs(trainLayout('gn387x4'))) {
    for (const hex of [SEAM_DARK, SEAM_LIGHT]) assert.equal(trisOfColour(detailOf(flat, car), hex).length, 0, `gn387x4 car ${car.index}: a seam in ${hex.toString(16)} on a flat bumper`);
  }
  // the 180's Scharfenberg stands in the open: no cover, so no seam of either colour on its face
  const g = built('gc180x5');
  for (const car of endCabs(trainLayout('gc180x5'))) {
    const plane = facePlane(car, false, false) + outwards(car) * COVER_RELIEF;
    for (const hex of [SEAM_DARK, SEAM_LIGHT]) assert.equal(trisOfColour(detailOf(g, car), hex).filter((t) => t.every((v) => Math.abs(v.z - plane) < ZTOL)).length, 0, `gc180x5 car ${car.index}: a seam in ${hex.toString(16)} on a front with no cover`);
  }
});

test('length: the body a driving car draws reaches both ends of the car to within 2 mm, so the drawn car is as long as its plan (the layer in front of the face is what reaches the end)', () => {
  // tools/axis03-evidence measures the same envelope (body-shell, body-detail, livery-decals, cab-glass) and asks it of the Azuma and the Hull Trains car: a nose face stands NOSE_RECESS
  // behind the end of the car, and the layer in front of it (the lenses where the face has lamps, the cover's seam where it does not) is what brings the drawn car to its length
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of endCabs(layout)) {
      const group = named(g, `car-${car.index}`);
      const box = new THREE.Box3();
      for (const name of ['body-shell', 'body-detail', 'livery-decals', 'cab-glass']) {
        const mesh = all(group, name)[0] as THREE.Mesh | undefined;
        if (mesh) box.union(new THREE.Box3().setFromObject(mesh));
      }
      const drawn = box.max.z - box.min.z;
      assert.ok(Math.abs(drawn - car.length) < 0.002, `${kind} car ${car.index}: draws ${drawn.toFixed(4)} m of a ${car.length} m car`);
    }
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

// The AT300's budget is 100 (motor) and 150 (trailer) above the others': its photograph shows the lugs, arms, ribs and cables of `at300Detail`, about 170 triangles.
// The real limit is the rubric's 1.5 x per kind (see the cost counter), which the AT300 kinds meet with room to spare.
test('bogie budgets: a near bogie is at most 2,600 triangles (a motor bogie) or 2,400 (a trailer), the AT300\'s 2,700 or 2,550, a far one at most 300, in every style', () => {
  for (const { label, spec } of BOGIE_CASES) {
    const nearN = trisOf(bogieSoup(spec));
    const farN = trisOf(bogieFarSoup(spec));
    const cap = spec.style === 'hitachi' ? (spec.motor ? 2700 : 2550) : spec.motor ? 2600 : 2400;
    assert.ok(nearN <= cap, `${label}: ${nearN} triangles in the near bogie (at most ${cap})`);
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

test('bogies: the AT300 frame carries the lugs, arms, ribs and cables its photograph shows, each standing on the box or beam it belongs to, and the springs it shows; no other maker\'s frame carries them', () => {
  // lner-gwr800-bogie-detail-2017.jpg: the vertical lug with its eye over each axle box, the trailing arm from each box inboard, the diagonal webs on
  // the beam's face either side of the step's plate, and the sensor cable looping from the box end to the frame. The routing of the cable is ASSUMED.
  const r = 0.43;
  const w = 1.3;
  const spec: BogieSpec = { radius: r, wheelbase: 2 * w, track: FIGURES.gauge.value, motor: true, style: 'hitachi' };
  const CAP = 0x4f545b;
  const RUBBER = 0x1f2125;
  const colourOf = (soup: Soup, hex: number): V3t[] => {
    const c = col(hex);
    const out: V3t[] = [];
    for (let i = 0; i < soup.pos.length / 3; i++) {
      if (Math.abs((soup.clr[3 * i] as number) - c.r) < 1e-6 && Math.abs((soup.clr[3 * i + 1] as number) - c.g) < 1e-6 && Math.abs((soup.clr[3 * i + 2] as number) - c.b) < 1e-6) out.push([soup.pos[3 * i] as number, soup.pos[3 * i + 1] as number, soup.pos[3 * i + 2] as number]);
    }
    return out;
  };
  const span = (v: V3t[], axis: 0 | 1 | 2): [number, number] => [Math.min(...v.map((p) => p[axis])), Math.max(...v.map((p) => p[axis]))];
  // the beam's lower and upper edge at distance z from the middle: straight between the outline's corners (the same outline the source draws, here by its numbers)
  const along = (pts: [number, number][], z: number): number => {
    const a = Math.abs(z);
    for (let k = 0; k + 1 < pts.length; k++) {
      const [z0, y0] = pts[k] as [number, number];
      const [z1, y1] = pts[k + 1] as [number, number];
      if (a >= z0 && a <= z1) return y0 + ((y1 - y0) * (a - z0)) / (z1 - z0);
    }
    throw new Error(`no beam at ${z}`);
  };
  const bottom = (z: number): number => r + along([[0, -0.08], [0.5, -0.08], [0.82, 0.1], [w - 0.28, 0.26], [w + 0.33, 0.26]], z);
  const top = (z: number): number => r + along([[0, 0.4], [0.75, 0.44], [w - 0.3, 0.5], [w + 0.3, 0.5]], z);
  const parts = bogieParts(spec);
  const frame = vertsOf(parts.frame);
  for (const sx of [-1, 1]) {
    const out = (p: V3t): number => sx * p[0];
    const mine = frame.filter((p) => out(p) > 0);
    for (const az of [-w, w]) {
      const inward = az < 0 ? 1 : -1;
      const where = `side ${sx}, axle at z ${az}`;
      // the lug: one box up the outside of the axle box (whose outer face is at 1.085), reaching the beam end's underside
      const lug = mine.filter((p) => out(p) > 1.0845 && out(p) < 1.1055 && Math.abs(p[2] - az) < 0.0555 && p[1] > r + 0.085);
      assert.equal(lug.length, 36, `${where}: the lug is ${lug.length} vertices, not one box's 36`);
      near(Math.min(...lug.map(out)), 1.085, 1e-9, `${where}: the lug's inner face is the box's outer face`);
      near(Math.max(...lug.map(out)), 1.105, 1e-9, `${where}: the lug's outer face`);
      near(span(lug, 1)[0], r + 0.09, 1e-9, `${where}: the lug's foot, inside the box's top at ${r + 0.11}`);
      near(span(lug, 1)[1], r + 0.27, 1e-9, `${where}: the lug's head, at the beam end's underside ${r + 0.26}`);
      near(span(lug, 2)[0], az - 0.055, 1e-9, `${where}: the lug's near edge`);
      near(span(lug, 2)[1], az + 0.055, 1e-9, `${where}: the lug's far edge`);
      // the arm: one bar from inside the axle box inboard to the beam
      const arm = mine.filter((p) => out(p) > 0.981 && out(p) < 1.06 && p[1] > r - 0.01 && p[1] < r + 0.13 && Math.abs(p[2]) > 0.55 && Math.abs(p[2]) < 1.25 && Math.sign(p[2]) === Math.sign(az));
      assert.equal(arm.length, 36, `${where}: the arm is ${arm.length} vertices, not one bar's 36`);
      near(Math.min(...arm.map(out)), 0.985, 1e-9, `${where}: the arm's inner face, inside the beam's thickness`);
      near(Math.max(...arm.map(out)), 1.055, 1e-9, `${where}: the arm's outer face, inside the beam's thickness`);
      near(span(arm, 1)[0], r + 0.005, 1e-9, `${where}: the arm's underside`);
      near(span(arm, 1)[1], r + 0.105, 1e-9, `${where}: the arm's top, under the axle box's top at ${r + 0.11}`);
      const [a0, a1] = [az + inward * 0.1, az + inward * 0.7].sort((p, q) => p - q) as [number, number];
      near(span(arm, 2)[0], a0, 1e-9, `${where}: the arm's end`);
      near(span(arm, 2)[1], a1, 1e-9, `${where}: the arm's other end`);
      assert.ok(Math.abs(az + inward * 0.1 - az) < 0.125, `${where}: the arm starts inside the axle box (0.125 m either side of the axle)`);
      const inner = Math.abs(az + inward * 0.7);
      assert.ok(bottom(inner) <= span(arm, 1)[1] && top(inner) >= span(arm, 1)[0], `${where}: the arm's inboard end (z ${inner}) meets the beam, which spans ${bottom(inner)} to ${top(inner)}`);
      // the cable: two strips on the face of the beam, standing a few millimetres off it, from beside the lug inboard
      const cable = colourOf(parts.frame, RUBBER).filter((p) => Math.abs(out(p) - 1.072) < 1e-9 && Math.sign(p[2]) === Math.sign(az) && out(p) > 0);
      assert.equal(cable.length, 12, `${where}: the cable is ${cable.length} vertices, not two strips' 12`);
      near(span(cable, 2)[0], Math.min(az + inward * 0.09, az + inward * 0.72), 1e-9, `${where}: the cable's end`);
      near(span(cable, 2)[1], Math.max(az + inward * 0.09, az + inward * 0.72), 1e-9, `${where}: the cable's other end`);
      assert.ok(1.072 - 1.065 > 0.003 && 1.072 - 1.065 < 0.012, 'the cable stands 3 to 12 mm off the beam face (1.065)');
      for (const p of cable) assert.ok(p[1] >= bottom(p[2]) + 0.005 && p[1] <= top(p[2]) - 0.005, `${where}: the cable at z ${p[2]}, y ${p[1]} is off the beam (${bottom(p[2])} to ${top(p[2])})`);
    }
    // the ribs: one bar each side of the middle on the beam's face, rising outward, inside the beam's outline, in the lighter cap colour
    for (const zs of [-1, 1]) {
      const rib = colourOf(parts.frame, CAP).filter((p) => out(p) > 1.06 && Math.abs(p[2]) < 0.9 && Math.sign(p[2]) === zs);
      assert.equal(rib.length, 36, `side ${sx}, ${zs > 0 ? 'forward' : 'aft'}: the rib is ${rib.length} vertices, not one bar's 36`);
      near(Math.min(...rib.map(out)), 1.065, 1e-9, 'a rib stands on the beam face');
      near(Math.max(...rib.map(out)), 1.085, 1e-9, 'a rib stands 2 cm proud');
      const lowest = rib.reduce((a, b) => (b[1] < a[1] ? b : a));
      const highest = rib.reduce((a, b) => (b[1] > a[1] ? b : a));
      assert.ok(Math.abs(highest[2]) > Math.abs(lowest[2]) + 0.2, `side ${sx}: the rib rises outward (low end at z ${lowest[2]}, high end at ${highest[2]})`);
      assert.ok(span(rib, 1)[1] - span(rib, 1)[0] > 0.35, `side ${sx}: the rib is ${span(rib, 1)[1] - span(rib, 1)[0]} m tall, a long web`);
      for (const p of rib) assert.ok(p[1] >= bottom(p[2]) - 0.002 && p[1] <= top(p[2]) + 0.002, `side ${sx}: the rib's corner at z ${p[2]}, y ${p[1]} is off the beam (${bottom(p[2])} to ${top(p[2])})`);
    }
    // the broad springs: the primary stack on each box (a drum of 0.08 m with wraps of 0.096) and the air spring's 0.17 m bag
    const springs = vertsOf(parts.springs).filter((p) => out(p) > 0);
    for (const az of [-w, w]) {
      const stack = springs.filter((p) => Math.abs(p[2] - az) < 0.2 && p[1] < r + 0.3);
      near(Math.max(...stack.map((p) => Math.hypot(out(p) - 0.985, p[2] - az))), 0.096, 1e-9, `side ${sx}, axle at z ${az}: the primary stack's widest wrap`);
    }
    // its top is a fan: the rim (twelve sides, 0.17 m from the axis) and the middle
    const bag = springs.filter((p) => Math.abs(p[1] - (BOGIE_TOP - 0.005)) < 1e-9);
    const rim = bag.filter((p) => Math.hypot(out(p) - 0.97, p[2]) > 1e-9);
    assert.equal(new Set(rim.map((p) => `${p[0].toFixed(6)},${p[2].toFixed(6)}`)).size, 12, `side ${sx}: the air spring's rim is not twelve-sided`);
    for (const p of rim) near(Math.hypot(out(p) - 0.97, p[2]), 0.17, 1e-9, `side ${sx}: the air spring's top edge is a circle of 0.17 m about its axis`);
  }
  // no other maker's frame carries any of it
  for (const style of ['electrostar', 'alstom', 'siemens'] as const) {
    const v = vertsOf(bogieParts({ ...spec, style, diesel: style === 'alstom' }).frame);
    assert.equal(v.filter((p) => Math.abs(p[0]) > 1.0845 && Math.abs(p[0]) < 1.1055 && Math.abs(Math.abs(p[2]) - w) < 0.0555 && p[1] > r + 0.085).length, 0, `${style}: a lug over the axle box`);
    assert.equal(v.filter((p) => Math.abs(p[0]) > 0.981 && Math.abs(p[0]) < 1.06 && p[1] > r - 0.01 && p[1] < r + 0.13 && Math.abs(p[2]) > 0.55 && Math.abs(p[2]) < 1.25).length, 0, `${style}: an axle-box arm`);
    assert.equal(v.filter((p) => Math.abs(Math.abs(p[0]) - 1.085) < 1e-9 && Math.abs(p[2]) > 0.49 && Math.abs(p[2]) < 0.83).length, 0, `${style}: a rib on the beam`);
    assert.equal(v.filter((p) => Math.abs(Math.abs(p[0]) - 1.072) < 1e-9).length, 0, `${style}: a cable on the beam`);
  }
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
  // CHANGED (it compared the roof glass, the 717's with a post for its emergency door): both have a flat face now, so no windscreen on the roof; the side windows are alike
  assert.deepEqual([a.half, a.floor, a.wallTop, a.crown, a.nose, a.glass, a.gangway], [b.half, b.floor, b.wallTop, b.crown, b.nose, b.glass, b.gangway]);
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
  // CHANGED (its yellow warning panel was the loft's, a cap over the face and the nose's first 0.3 m): the 180's yellow is a shape of its face now (the Class 180's face)
  assert.equal(bodySpec('adelante').front.warning, null);
  assert.equal((shapesOf(ADELANTE_FACE)['warning-panel'] as FaceShape).colour, 0xf2c100);
  assert.equal(bodySpec('adelante').front.face, ADELANTE_FACE);
  // CHANGED (the Class 180's face was taller than a Desiro's bullet nose): the Desiro City's face is an upright wall now (GN717-03-717005-Potters-Bar), the 180's still a face under a raked screen
  const sec = (f: Family) => ringAt(bodySpec(f).nose, 0);
  assert.ok(sec('adelante').top < sec('desiro').top - 0.5, 'a lower face than the 717\'s upright wall');
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
  // CHANGED (the 700's glass was a raked windscreen on its nose, 50 degrees and 1.2 m back): it is a flat pane on its upright face now, standing at the end of the nose (no reach back at all)
  assert.ok(a.rake < d.rake - 10, `the 180's glass is raked ${a.rake.toFixed(0)} degrees, the 700's ${d.rake.toFixed(0)}`);
  assert.ok(a.reach > d.reach + 0.4 && d.reach < 0.05, `the 180's glass reaches ${a.reach.toFixed(2)} m back, the 700's ${d.reach.toFixed(2)} m`);
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

test('Class 180 face: a yellow trapezoid under the glass, a smoked-glass pod outboard of each slanting side with a round headlight low in it and a smaller lamp straight above, the recess under the panel, and no glass on the face', () => {
  const S = shapesOf(ADELANTE_FACE);
  const box = (name: string): ReturnType<typeof boxOfOutline> => boxOfOutline((S[name] as FaceShape).outline);
  assert.deepEqual(ADELANTE_FACE.shapes.map((sh) => sh.name), ['warning-panel', 'lamp-pod', 'headlight', 'tail-lamp']);
  assert.deepEqual(ADELANTE_FACE.shapes.filter((sh) => sh.glass), [], 'the glass is on the nose, not on the face');
  assert.ok(bodySpec('adelante').glass.screen, 'a windscreen on the nose');
  // the panel: one trapezoid across the middle, symmetric, narrower the lower it goes, cut off at the top by the face's own top edge (the glass's foot)
  const panelShape = S['warning-panel'] as FaceShape;
  const panel = panelShape.outline.map((pt): [number, number] => [pt[0], pt[1]]);
  assert.equal(panelShape.mirror, undefined, 'one panel across the middle');
  for (const [x, y] of panel) assert.ok(panel.some(([u, v]) => Math.abs(u + x) < 1e-12 && Math.abs(v - y) < 1e-12), `the panel is symmetric: (${x}, ${y})`);
  const right = panel.filter((pt) => pt[0] >= 0).sort((a, b) => b[1] - a[1]);
  for (let i = 1; i < right.length; i++) assert.ok((right[i] as [number, number])[0] <= (right[i - 1] as [number, number])[0] + 1e-12, 'narrower the lower it goes');
  const ring = flatFaceOutline('adelante');
  const faceTop = Math.max(...ring.map((pt) => pt[1]));
  const foot = Math.min(...panel.map((pt) => pt[1]));
  assert.ok(Math.max(...panel.map((pt) => pt[1])) > faceTop, 'the panel runs up past the top of the face, which cuts it off at the glass\'s foot');
  // its half-width at a height, along its right-hand edge
  const half = (y: number): number => {
    const hi = right.findIndex((pt) => pt[1] <= y);
    const a = right[Math.max(0, hi - 1)] as [number, number];
    const b = right[hi] as [number, number];
    return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  };
  const across = 2 * half(faceTop - 0.01);
  assert.ok(across > 1.6 && across < 2.0, `a panel ${across.toFixed(2)} m across at the glass's foot (GC180-05: about 1.8 m)`);
  assert.ok(2 * half(foot + 0.01) > 1.2 && 2 * half(foot + 0.01) < 1.6, 'and about 1.4 m at its foot');
  // the recess under it: centred, and not cutting into the panel
  assert.ok(ADELANTE_FACE.recess.y1 <= foot + 1e-9, 'the coupler recess ends where the panel begins');
  // the pods: outboard of the panel's sides, not touching them, each a quadrilateral with a lens inside it, the headlight in its lower half and the larger
  const podShape = S['lamp-pod'] as FaceShape;
  const pod = podShape.outline.map((pt): [number, number] => [pt[0], pt[1]]);
  if (signedArea(pod) < 0) pod.reverse();
  const panelCcw = signedArea(panel) < 0 ? [...panel].reverse() : panel;
  assert.equal(polyArea(clipConvex(panelCcw, pod)), 0, 'a pod does not overlap the panel');
  assert.ok(podShape.mirror && box('lamp-pod').x0 > 0.6, 'a pod each side, outboard');
  const head = box('headlight');
  const tail = box('tail-lamp');
  const podBox = box('lamp-pod');
  assert.ok((head.y0 + head.y1) / 2 < (podBox.y0 + podBox.y1) / 2, 'the headlight is in the pod\'s lower half');
  assert.ok(head.x1 - head.x0 > 1.5 * (tail.x1 - tail.x0), 'and much the larger');
  // the pods are lighter than the black round them, and darker than the yellow
  assert.ok(lumaOf(podShape.colour as number) > lumaOf(0x17181c) + 0.1 && lumaOf(podShape.colour as number) < 0.4, 'a smoked-grey pod on the black front');
});

test('Class 180 nose: a bright post between the two panes of the glass, and on the roof behind it a louvre, a round vent and a smaller louvre, on both cabs, over the nose\'s surface and clear of the glass', () => {
  const spec = bodySpec('adelante');
  const screen = spec.glass.screen as NonNullable<typeof spec.glass.screen>;
  assert.ok(screen.pillar === 0.1 && screen.pillarColour !== undefined, 'a 10 cm post with a colour of its own');
  assert.ok(lumaOf(screen.pillarColour as number) > 0.5, 'bright, as in GC180-05 and GC180-01');
  assert.deepEqual((spec.noseRoof ?? []).map((f) => f.shape), ['louvre', 'round', 'louvre']);
  // no other family has either: the AT300's and the Desiros' roofs are bare, the Electrostar has no post
  for (const f of FAMILIES.filter((fam) => fam !== 'adelante')) {
    assert.equal(bodySpec(f).noseRoof, undefined, `${f}: roof fittings`);
    assert.equal(bodySpec(f).glass.screen?.pillarColour, undefined, `${f}: a coloured post`);
  }
  const sec = carSection(spec);
  const norm = normalised(sec);
  const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
  const surface = (x: number, s: number): number => yAtX(halfAt(sec, norm, egg, ringAt(spec.nose, Math.max(0, Math.min(spec.nose.length, s)))), Math.abs(x));
  const g = built('gc180x5');
  const layout = trainLayout('gc180x5');
  for (const car of endCabs(layout)) {
    const mesh = detailOf(g, car);
    const face = facePlane(car, false, false);
    const sOf = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - face : face - v.z);
    const here = `car ${car.index} (${car.cab} cab)`;
    // the post: a strip 10 cm wide down the middle of the glass, from its foot to its top, a little over the surface
    const post = trisOfColour(mesh, screen.pillarColour as number);
    assert.ok(post.length >= 40, `${here}: ${post.length} triangles of post`);
    for (const v of post.flat()) {
      // (lifted along the nose's normal, which leans a little across at the crown: a couple of millimetres at most)
      assert.ok(Math.abs(v.x) <= (screen.pillar as number) / 2 + 0.002, `${here}: a post vertex ${v.x.toFixed(4)} m out`);
      assert.ok(sOf(v) >= screen.s0 - 0.03 && sOf(v) <= screen.s1 + 0.03, `${here}: a post vertex ${sOf(v).toFixed(3)} m back, the glass runs ${screen.s0}..${screen.s1}`);
      const over = v.y - surface(v.x, sOf(v));
      assert.ok(over > 0.01 && over < 0.05, `${here}: a post vertex ${(over * 1000).toFixed(0)} mm over the nose`);
    }
    const postBox = boxOfTris(post);
    near(postBox.max.x - postBox.min.x, screen.pillar as number, 0.004, `${here}: the post's width`);
    assert.ok(Math.min(...post.flat().map(sOf)) < screen.s0 + 0.05 && Math.max(...post.flat().map(sOf)) > screen.s1 - 0.05, `${here}: the post runs the length of the glass`);
    // the fittings: each at its place (the cab's own right is the train's left at a rear cab), a pale rim round a dark centre, over the surface, behind the glass's frame
    for (const f of spec.noseRoof ?? []) {
      const cx = f.x * cabSign(car);
      const inBox = (t: Tri, grow: number): boolean => t.every((v) => Math.abs(v.x - cx) <= f.width / 2 + grow && Math.abs(sOf(v) - f.s) <= f.length / 2 + grow);
      const rim = trisOfColour(mesh, f.rim).filter((t) => inBox(t, 0.06));
      const inner = trisOfColour(mesh, f.colour).filter((t) => inBox(t, 0.02));
      assert.ok(rim.length >= 6 && inner.length >= 6, `${here}: the ${f.shape} at ${f.x}: ${rim.length} rim and ${inner.length} centre triangles`);
      const [rb, ib] = [boxOfTris(rim), boxOfTris(inner)];
      assert.ok(rb.max.x - rb.min.x > ib.max.x - ib.min.x + 0.015, `${here}: the ${f.shape}'s rim is wider than its centre`);
      near((rb.min.x + rb.max.x) / 2, cx, 0.02, `${here}: the ${f.shape}'s place across`);
      near((Math.min(...rim.flat().map(sOf)) + Math.max(...rim.flat().map(sOf))) / 2, f.s, 0.03, `${here}: the ${f.shape}'s place along the nose`);
      for (const v of [...rim.flat(), ...inner.flat()]) {
        const over = v.y - surface(v.x, sOf(v));
        assert.ok(over > 0.005 && over < 0.04, `${here}: a ${f.shape} vertex ${(over * 1000).toFixed(0)} mm over the nose`);
        assert.ok(sOf(v) > screen.s1 + spec.front.frame + 0.03, `${here}: a ${f.shape} vertex ${sOf(v).toFixed(2)} m back, over the glass's frame (the glass ends at ${screen.s1})`);
      }
    }
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

// --- the side skirts ------------------------------------------------------------------------------------------
//
// The round-4 scorer's finding on coach-lner9-3m and coach-lumo5-3m: "a large dark box sits proud of the body at bottom-left, below the solebar over the bogie
// area". The skirt was a box flush with the wall (x = W - 0.03) under a lower body edge that tucks in to W - 0.15, so it stood 0.12 m out of the body's lowest
// corner. The photographs lner-801-214-2025, lner-800-doncaster-2026 and hull-802-paragon-2025 show the covers standing well inboard of the body side.

/** Half-width of the body section at height `y`: its outline between the section's own points, from the floor up. */
function bodyHalfAt(spec: ReturnType<typeof bodySpec>, y: number): number {
  const pts = carSection(spec).half;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1] as [number, number];
    const [x1, y1] = pts[i] as [number, number];
    if (y >= y0 && y <= y1 && y1 > y0) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  throw new Error(`the body has no section at ${y}`);
}
/** A car's clear stretches along the train: its body's span less every bogie's cut-out (the same rule the builder follows, written out so a test does not ask it). */
function stretchesOf(car: Car, cutout: number): [number, number][] {
  let spans: [number, number][] = [[car.start + END_GAP + 0.1, car.end - END_GAP - 0.1]];
  for (const b of car.bogies) spans = spans.flatMap(([s, e]): [number, number][] => [[s, Math.min(e, b - cutout)], [Math.max(s, b + cutout), e]]).filter(([s, e]) => e > s);
  return spans;
}
/**
 * The triangles of a car's side skirts: those in the panel colour with a corner on a panel's foot. (A panel is a quad on each of four faces and every triangle of a quad
 * has a corner on the quad's top edge and one on its bottom edge; the foot's are all on the foot. The underframe slab, which wears the same colour as the covers on
 * every kind but the Azuma, stands from `slabBottom`, 0.17 m or more over the foot, so none of its corners is on it.)
 */
function skirtTris(g: THREE.Group, kind: TrainKind, car: Car): Tri[] {
  const spec = bodySpec(familyOf(kind));
  const { panel } = skirtColours(liveryFor(kind), spec);
  return trisOfColour(detailOf(g, car), panel).filter((t) => t.some((v) => Math.abs(v.y - spec.skirtBottom) < 1e-5));
}

test('skirts: every side skirt is a thin panel hanging from just inside the body\'s lowest corner and leaning in, never outboard of the body, with its foot at the family\'s skirt line', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(familyOf(kind));
    // the body's lowest corner: the first point of its section, on the floor
    const edge = (carSection(spec).half[0] as [number, number])[0];
    for (const car of layout.cars) {
      const here = `${kind} car ${car.index}`;
      const tris = skirtTris(g, kind, car);
      assert.ok(tris.length >= 16, `${here}: ${tris.length} skirt triangles`);
      if (car.cab) continue;
      for (const sign of [-1, 1]) {
        const vs = tris.filter((t) => t.every((v) => v.x * sign > 0)).flat();
        // a panel of eight triangles (an outer face, two raked ends and a foot) for each clear stretch: three on a through car, one at each end and one between the bogies
        // (CHANGED: a family with boxes (the Electrostar's) has a panel of eight for each box of its stretch's row; one box to a stretch where the family has none)
        const stretches = stretchesOf(car, spec.cutout);
        assert.equal(stretches.length, 3, `${here}: three clear stretches`);
        const panels = stretches.flatMap(([s, e]) => skirtSplit(s, e, spec.skirt.boxes)).length;
        assert.equal(vs.length / 3, 8 * panels, `${here} side ${sign}: a panel of eight triangles for each clear stretch (a box of its row)`);
        // never outboard of the body: every vertex is inside the body's outline at its height (a skirt below the floor, inside its lowest corner)
        for (const v of vs) assert.ok(Math.abs(v.x) <= (v.y >= spec.floor ? bodyHalfAt(spec, v.y) : edge) - 0.005, `${here}: a skirt vertex at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) stands out of the body`);
        const top = Math.max(...vs.map((v) => v.y));
        const foot = Math.min(...vs.map((v) => v.y));
        // its top edge is inside the body, 2 to 10 cm over the floor, so the body's lower edge hides the seam; its foot is at the family's skirt line
        assert.ok(top > spec.floor + 0.02 && top < spec.floor + 0.1, `${here}: the top edge at ${top.toFixed(3)}, the floor at ${spec.floor}`);
        near(foot, spec.skirtBottom, 1e-5, `${here}: the foot is at the skirt line`);
        const outerAt = (y: number): number => Math.max(...vs.filter((v) => Math.abs(v.y - y) < 1e-5).map((v) => Math.abs(v.x)));
        const innerAt = (y: number): number => Math.min(...vs.filter((v) => Math.abs(v.y - y) < 1e-5).map((v) => Math.abs(v.x)));
        // it hangs from just inside the corner (within 5 cm), leans in as it goes down (by a tenth to six tenths of a metre for each metre it hangs), a panel 2 to 10 cm thick
        assert.ok(edge - outerAt(top) > 0 && edge - outerAt(top) <= 0.05, `${here}: it hangs ${(edge - outerAt(top)).toFixed(3)} m inside the body's lowest corner`);
        const lean = (outerAt(top) - outerAt(foot)) / (top - foot);
        assert.ok(lean >= 0.1 && lean <= 0.6, `${here}: it leans in by ${lean.toFixed(3)} m for each metre`);
        assert.ok(outerAt(foot) - innerAt(foot) >= 0.02 && outerAt(foot) - innerAt(foot) <= 0.1, `${here}: a panel ${(outerAt(foot) - innerAt(foot)).toFixed(3)} m thick`);
        // the Azuma's lower edge is well clear of its skirt's foot: the foot stands a hand's breadth or more inboard
        if (familyOf(kind) === 'at300') assert.ok(edge - outerAt(foot) >= 0.1, `${here}: the foot is ${(edge - outerAt(foot)).toFixed(3)} m inboard of the body's lowest corner`);
        // only the clear stretches: nothing within a bogie's cut-out
        for (const b of car.bogies) assert.ok(vs.every((v) => Math.abs(v.z - b) >= spec.cutout - 1e-3), `${here}: a skirt reaches into the cut-out of the bogie at ${b}`);
      }
    }
  }
});

test('skirts: one panel is a closed shell leaning in, its foot raked at both ends, every face turned out of it', () => {
  for (const side of [-1, 1] as const) {
    const soup = new Soup();
    skirtPanel(soup, { side, z0: 10, z1: 16, edge: 1.2, floor: 1.0, bottom: 0.45, colour: col(0x777777), vent: null });
    const geo = soup.build();
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    // four faces (the top is inside the body and the inner face looks at the underframe), two triangles each
    assert.equal(pos.count / 3, 8);
    const at = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(pos, i);
    const vs = Array.from({ length: pos.count }, (_, i) => at(i));
    // the panel's centre: the mean of its eight distinct corners (the triangles repeat some corners, which would pull the mean toward them)
    const corners = new Map<string, THREE.Vector3>();
    for (const v of vs) corners.set(`${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}`, v);
    assert.equal(corners.size, 8, 'a panel has eight corners');
    const centre = [...corners.values()].reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(corners.size);
    for (let i = 0; i < pos.count; i += 3) {
      const t: Tri = [at(i), at(i + 1), at(i + 2)];
      const geometric = faceNormal(t);
      const stored = new THREE.Vector3().fromBufferAttribute(nrm, i);
      assert.ok(geometric.dot(stored) > 0.99, `triangle ${i / 3}: the winding agrees with the normal it carries`);
      const mid = t[0].clone().add(t[1]).add(t[2]).divideScalar(3);
      assert.ok(geometric.dot(mid.sub(centre)) > 0, `triangle ${i / 3}: faces out of the panel`);
    }
    // every corner is on the side asked for, the outer face leans in as it goes down, and the foot is shorter than the top edge by a rake at each end
    assert.ok(vs.every((v) => v.x * side > 0), 'the panel is on its own side of the centre line');
    const zAt = (y: number): number[] => vs.filter((v) => Math.abs(v.y - y) < 1e-5).map((v) => v.z).sort((a, b) => a - b);
    const footZ = zAt(0.45);
    const topZ = zAt(1.0 + SKIRT_TUCK);
    // the foot is shorter than the top edge by a rake of 5 to 30 cm at each end
    assert.ok((footZ[0] as number) - 10 >= 0.05 && (footZ[0] as number) - 10 <= 0.3, `the foot starts ${(footZ[0] as number) - 10} in`);
    assert.ok(16 - (footZ[footZ.length - 1] as number) >= 0.05 && 16 - (footZ[footZ.length - 1] as number) <= 0.3, `and ends ${16 - (footZ[footZ.length - 1] as number)} short`);
    near(topZ[0] as number, 10, 1e-5, 'the top edge spans the whole stretch');
    near(topZ[topZ.length - 1] as number, 16, 1e-5, 'to its far end');
    near(Math.max(...vs.filter((v) => Math.abs(v.y - 0.45) < 1e-5).map((v) => Math.abs(v.x))), skirtHalfAt(1.2, 1.0, 0.45), 1e-5, 'the foot is where the lean puts it');
    // a very short stretch is raked by no more than a quarter of its length
    const tiny = new Soup();
    skirtPanel(tiny, { side, z0: 0, z1: 0.4, edge: 1.2, floor: 1.0, bottom: 0.45, colour: col(0x777777), vent: null });
    const tz = Array.from({ length: tiny.pos.length / 3 }, (_, i) => tiny.pos[3 * i + 2] as number).filter((_, i) => Math.abs((tiny.pos[3 * i + 1] as number) - 0.45) < 1e-6);
    assert.ok(Math.min(...tz) > 0 && Math.min(...tz) <= 0.1 + 1e-9, `a short stretch is raked by ${Math.min(...tz)}, at most a quarter of its length`);
  }
});

test('skirts: the Azuma\'s covers are paler than its underframe and carry two groups of four louvres on each long stretch, lying on the panel; no other family has louvres', () => {
  // two groups of four louvres on each clear stretch 3.5 m or longer, on each side, where the cover hangs 0.4 m or more
  const expectedSlits = (car: Car, spec: ReturnType<typeof bodySpec>): number =>
    stretchesOf(car, spec.cutout).filter(([s, e]) => e - s >= 3.5 && spec.floor - spec.skirtBottom >= 0.4).length * 2 * 4 * 2;
  for (const kind of ALL_KINDS) {
    const layout = trainLayout(kind);
    const spec = bodySpec(familyOf(kind));
    const def = liveryFor(kind);
    const { panel, vent } = skirtColours(def, spec);
    const g = built(kind);
    if (familyOf(kind) === 'at300') {
      // light grey covers with louvres (lner-801-214-2025, lner-800-doncaster-2026, hull-802-paragon-2025), not a dark slab
      assert.ok(lumaOf(panel) >= lumaOf(def.skirt) + 0.12, `${kind}: covers (${lumaOf(panel).toFixed(2)}) paler than the underframe (${lumaOf(def.skirt).toFixed(2)})`);
      assert.ok(vent !== null && lumaOf(vent) < lumaOf(panel) - 0.1, `${kind}: louvres darker than the covers`);
    } else if (familyOf(kind) === 'electrostar') {
      // CHANGED (the covers as the livery gives them: it was every family but the Azuma): the Electrostar's boxes are mid-grey against the dark underframe (gn387_03_387123_cambridge,
      // gn387_01_387114_ely), no louvres; the other two electric families' and the Class 180's are as the livery gives them
      assert.ok(lumaOf(panel) >= lumaOf(def.skirt) + 0.12 && lumaOf(panel) <= 0.6, `${kind}: grey boxes (${lumaOf(panel).toFixed(2)}) over the underframe (${lumaOf(def.skirt).toFixed(2)})`);
      assert.equal(vent, null, `${kind}: no louvres`);
    } else {
      assert.equal(panel, def.skirt, `${kind}: the covers as the livery gives them`);
      assert.equal(vent, null, `${kind}: no louvres`);
    }
    const edge = (carSection(spec).half[0] as [number, number])[0];
    for (const car of layout.cars.filter((c) => c.cab === null).slice(0, 2)) {
      const slits = vent === null ? [] : trisOfColour(detailOf(g, car), vent);
      assert.equal(slits.length, vent === null ? 0 : 2 * expectedSlits(car, spec), `${kind} car ${car.index}: louvre triangles (two sides)`);
      // on the panel: a few millimetres out of its face, clear of it
      for (const v of slits.flat()) {
        const out = Math.abs(v.x) - skirtHalfAt(edge, spec.floor, v.y);
        assert.ok(out > 0.002 && out < 0.006, `${kind} car ${car.index}: a louvre vertex stands ${out.toFixed(4)} m off the panel`);
      }
    }
  }
});

test('skirts: a panel carries louvres only where the cover is tall enough and the stretch long enough, and only where the kind has them', () => {
  const trianglesOf = (z1: number, bottom: number, vent: boolean): number => {
    const soup = new Soup();
    skirtPanel(soup, { side: 1, z0: 0, z1, edge: 1.2, floor: 1.0, bottom, colour: col(0x777777), vent: vent ? col(0x222222) : null });
    return soup.pos.length / 9;
  };
  // the panel's eight triangles, and sixteen more for two groups of four louvres
  assert.equal(trianglesOf(8, 0.45, true), 8 + 16, 'a long, tall cover');
  assert.equal(trianglesOf(4, 0.5, true), 8 + 16, 'a stretch of 4 m, a cover 0.5 m tall');
  assert.equal(trianglesOf(2, 0.45, true), 8, 'a stretch of 2 m is too short for louvres');
  assert.equal(trianglesOf(8, 0.7, true), 8, 'a cover 0.3 m tall is too shallow for louvres');
  assert.equal(trianglesOf(8, 0.45, false), 8, 'a kind without louvres has none');
});

// --- the cab side window ----------------------------------------------------------------------------------------
//
// The same finding: "the cab side window is a flat black polygon", with a white specular blob where the pane's smoothly turning normals met the sun's glow in the glass's
// sky. The pane is now one flat-shaded surface tilted to reflect the dark ground, in a dark seal, under two matte bands of sky (lner-800-doncaster-2026,
// hull-802-doncaster-2024 and LUMO-04-Lumo-803003-at-Edinburgh-Waverley: glossy dark panes in a thin black seal with a soft pale reflection across the upper part).

/** The triangles of a mesh with the normals stored at their corners, in train coordinates (the cars are not turned, so a normal needs no matrix). */
function trianglesWithNormals(mesh: THREE.Mesh): { p: Tri; n: Tri }[] {
  const pos = mesh.geometry.getAttribute('position');
  const nrm = mesh.geometry.getAttribute('normal');
  const out: { p: Tri; n: Tri }[] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld)) as Tri;
    const n = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(nrm, i + k)) as Tri;
    out.push({ p, n });
  }
  return out;
}

test('glass: the cab side window is one flat-shaded pane tilted down, in a dark seal, under two sky bands; each layer stands clear of the one under it', () => {
  // the layers stand 2 mm or more apart, and the sky 6 mm clear of the pane (whose polygon offset pulls it toward the eye)
  assert.ok(PANE_LIFT.seal - PANE_LIFT.swoosh >= 0.002 - 1e-9 && PANE_LIFT.pane - PANE_LIFT.seal >= 0.002 - 1e-9 && PANE_LIFT.sky - PANE_LIFT.pane >= 0.006 - 1e-9, `lifts ${JSON.stringify(PANE_LIFT)}`);
  assert.equal(new Set([PANE_SEAL, PANE_SKY_HI, PANE_SKY_MID, CAB_SWOOSH]).size, 4, 'each layer\'s colour is its own');
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    // CHANGED (every cab had one): the 387's cab has a plain panel for a flank (gn387_03_387123_cambridge), checked with the glass of its face (the Class 387's flat face)
    if (!bodySpec(layout.spec.family).glass.side) continue;
    for (const car of layout.cars.filter((c) => c.cab)) {
      const group = named(g, `car-${car.index}`);
      const flank = trianglesWithNormals(named(group, 'cab-glass') as THREE.Mesh);
      for (const sign of [-1, 1]) {
        const here = `${kind} car ${car.index} side ${sign}`;
        const onSide = (t: Tri): boolean => t.every((v) => v.x * sign > 1.1);
        // the pane: the flank's triangles whose three corners carry one and the same normal (the windscreen's wings, which wrap round onto the flank of the 387 and the 717, are smooth-shaded)
        const pane = flank.filter((t) => onSide(t.p) && t.n[0].distanceTo(t.n[1]) < 1e-5 && t.n[0].distanceTo(t.n[2]) < 1e-5);
        assert.equal(pane.length, PANE_ROWS * PANE_COLS * 2, `${here}: the pane, every quad of it flat-shaded`);
        // one normal across the whole pane: out of the flank, and tilted down so that it reflects the dark ground and not the pale horizon band or the sun's glow in the glass's sky
        // (a ray arriving level from the side leaves at 2 |nx| ny of a unit below the horizon; the sky's horizon band is a few degrees deep)
        const n0 = pane[0]!.n[0];
        for (const t of pane) assert.ok(t.n[0].distanceTo(n0) < 1e-5, `${here}: the pane is shaded by more than one normal`);
        assert.ok(n0.x * sign > 0.5, `${here}: the pane's normal (${n0.x.toFixed(2)}, ${n0.y.toFixed(2)}, ${n0.z.toFixed(2)}) looks out of the flank`);
        assert.ok(2 * Math.abs(n0.x) * n0.y < -0.3, `${here}: the pane's normal (${n0.x.toFixed(2)}, ${n0.y.toFixed(2)}, ${n0.z.toFixed(2)}) is not tilted down enough to reflect the ground`);
        const paneBox = boxOfTris(pane.map((t) => t.p));
        // the seal: a dark patch round the pane, 2 cm or more bigger than it above and below and at both ends
        const seal = trisOfColour(detailOf(g, car), PANE_SEAL).filter(onSide);
        assert.equal(seal.length, PANE_ROWS * PANE_COLS * 2, `${here}: the seal`);
        const sealBox = boxOfTris(seal);
        assert.ok(sealBox.min.y <= paneBox.min.y - 0.02 && sealBox.max.y >= paneBox.max.y + 0.02, `${here}: the seal frames the pane above and below (${sealBox.min.y.toFixed(3)}..${sealBox.max.y.toFixed(3)} against ${paneBox.min.y.toFixed(3)}..${paneBox.max.y.toFixed(3)})`);
        assert.ok(sealBox.min.z <= paneBox.min.z - 0.02 && sealBox.max.z >= paneBox.max.z + 0.02, `${here}: the seal frames the pane at both ends (${sealBox.min.z.toFixed(3)}..${sealBox.max.z.toFixed(3)} against ${paneBox.min.z.toFixed(3)}..${paneBox.max.z.toFixed(3)})`);
        // the sky: two bands of two rows of quads, the pale one above the fainter, both inside the pane's height
        const hi = trisOfColour(detailOf(g, car), PANE_SKY_HI).filter(onSide);
        const mid = trisOfColour(detailOf(g, car), PANE_SKY_MID).filter(onSide);
        assert.equal(hi.length, 2 * PANE_COLS * 2, `${here}: the pale band`);
        assert.equal(mid.length, 2 * PANE_COLS * 2, `${here}: the fainter band`);
        const meanY = (ts: Tri[]): number => ts.flat().reduce((a, v) => a + v.y, 0) / (ts.length * 3);
        assert.ok(meanY(hi) > meanY(mid) && meanY(mid) > meanY(pane.map((t) => t.p)), `${here}: pale above faint above the pane's middle`);
        for (const v of [...hi, ...mid].flat()) assert.ok(v.y > paneBox.min.y && v.y < paneBox.max.y + 0.03, `${here}: a band vertex at ${v.y.toFixed(3)} is off the pane`);
      }
    }
  }
});

test('geometry: clipConvex keeps the part of a polygon inside a convex one, inset from its edges, in the subject\'s winding, with no doubled point and nothing where they only touch', () => {
  const square = (h: number): [number, number][] => [[h, h], [-h, h], [-h, -h], [h, -h]];
  const clip = square(1);
  // wholly inside: the subject itself, point for point; wholly outside, or only touching the clip at a point or along an edge: nothing
  assert.deepEqual(clipConvex(square(0.5), clip), square(0.5));
  assert.deepEqual(clipConvex([[3, 3], [4, 3], [4, 4], [3, 4]], clip), []);
  assert.deepEqual(clipConvex([[0, 1], [1, 3], [-1, 3]], clip), [], 'a point on the edge');
  assert.deepEqual(clipConvex([[-1, 1], [1, 1], [1, 2], [-1, 2]], clip), [], 'a shared edge');
  // across an edge, across a corner, round the whole clip, and through a diamond whose edges slant
  near(polyArea(clipConvex([[0, -2], [2, -2], [2, 2], [0, 2]], clip)), 2, 1e-12, 'across an edge');
  near(polyArea(clipConvex([[0.5, 0.5], [2, 0.5], [2, 2], [0.5, 2]], clip)), 0.25, 1e-12, 'across a corner');
  near(polyArea(clipConvex(square(2), clip)), 4, 1e-12, 'round the whole clip');
  const diamond: [number, number][] = [[0, 1.5], [-1.5, 0], [0, -1.5], [1.5, 0]];
  const cut = clipConvex(square(1), diamond);
  near(polyArea(cut), 3.5, 1e-12, 'through a diamond');
  assert.equal(cut.length, 8, 'a square with its corners cut');
  // inset: kept this far inside every edge; nothing left once the inset eats the clip
  near(polyArea(clipConvex(square(2), clip, 0.1)), 1.8 * 1.8, 1e-12, 'inset');
  assert.deepEqual(clipConvex(square(2), clip, 1.2), [], 'an inset wider than the clip');
  // a clip edge of no length (a doubled point of the clip) bounds nothing
  near(polyArea(clipConvex(square(2), [[1, 1], [1, 1], [-1, 1], [-1, -1], [1, -1]])), 4, 1e-12, 'a doubled clip point');
  // the subject's winding is kept
  assert.ok(signedArea(clipConvex(square(2), clip)) > 0 && signedArea(clipConvex(square(2).reverse(), clip)) < 0, 'counter-clockwise stays so, clockwise too');
  // every rectangle on a lattice that reaches the clip's edges and corners, with and without an inset: the area is the overlap of the two, nothing is doubled, and nothing leaves the clip
  const lattice = [-2, -1, 0, 1, 2];
  const overlap = (a0: number, a1: number, h: number): number => Math.max(0, Math.min(a1, h) - Math.max(a0, -h));
  for (const inset of [0, 0.5]) {
    for (const x0 of lattice) for (const x1 of lattice) for (const y0 of lattice) for (const y1 of lattice) {
      if (x1 <= x0 || y1 <= y0) continue;
      const got = clipConvex([[x1, y1], [x0, y1], [x0, y0], [x1, y0]], clip, inset);
      const h = 1 - inset;
      const want = overlap(x0, x1, h) * overlap(y0, y1, h);
      const here = `[${x0}, ${x1}] x [${y0}, ${y1}] inset ${inset}`;
      near(polyArea(got), want, 1e-12, `${here}: area`);
      assert.ok(want > 0 ? got.length >= 3 : got.length === 0, `${here}: ${got.length} points for an overlap of ${want}`);
      for (let i = 0; i < got.length; i++) {
        const p = got[i] as [number, number];
        const q = got[(i + 1) % got.length] as [number, number];
        assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9, `${here}: a doubled point`);
        assert.ok(Math.abs(p[0]) <= h + 1e-12 && Math.abs(p[1]) <= h + 1e-12, `${here}: a point outside the clip`);
      }
    }
  }
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
  // the two noses stand END_GAP back from the joint each, so their faces are 2 x END_GAP apart. The face is the plane of the amber panel less its layer (the front of the
  // nose is vertex-coloured, not in the textured shell, on a livery with no nose cone; the couplers and cables reach past the faces, and are measured below)
  // CHANGED (the front of a yellow warning panel): the 387's amber is a shape on its flat face, a layer in front of the plane
  const lift = (SHAPES['panel'] as FaceShape).lift;
  const faceA = Math.max(...trisOfColour(detailOf(g, a), AMBER).flat().map((v) => v.z)) - lift;
  const faceB = Math.min(...trisOfColour(detailOf(g, b), AMBER).flat().map((v) => v.z)) + lift;
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

// --- the Electrostar's underfloor boxes, the roof equipment beside a pantograph, and the pantograph's strips -----------------------------------
//
// Round 3 (T6 underframe, T5 roof). The Electrostar's boxes are read off gn387_03_387123_cambridge and gn387_01_387114_ely; the Azuma's roof kit off
// lner-800-pantograph-leeds-2019; the electric units' roof kit and the strips are ASSUMED (see train-parts.ts).

test('skirts: a stretch is cut into a row of separate boxes, a gap between neighbours, where the family has boxes (the Electrostar\'s only), and is one panel where it has none', () => {
  assert.deepEqual(skirtSplit(10, 20, undefined), [[10, 20]], 'no boxes: the stretch whole');
  for (const family of FAMILIES) assert.equal(bodySpec(family).skirt.boxes !== undefined, family === 'electrostar', `${family}: boxes only on the Electrostar`);
  const boxes = bodySpec('electrostar').skirt.boxes as { length: number; gap: number; rake: number };
  const row = skirtSplit(10, 20, boxes);
  // end to end, in order, the gap between neighbours; none a sliver or a slab; not all one length (the pattern's weights, normalised over the row)
  assert.ok(row.length >= 6 && row.length <= 9, `${row.length} boxes in ten metres`);
  assert.equal((row[0] as [number, number])[0], 10, 'the first box starts with the stretch');
  near((row[row.length - 1] as [number, number])[1], 20, 1e-9, 'the last ends with it');
  row.forEach(([a, b], i) => {
    assert.ok(b - a >= 0.6 * boxes.length && b - a <= 1.9 * boxes.length, `box ${i}: ${(b - a).toFixed(3)} m`);
    if (i > 0) near(a - (row[i - 1] as [number, number])[1], boxes.gap, 1e-9, `the gap before box ${i}`);
  });
  assert.ok(new Set(row.map(([a, b]) => (b - a).toFixed(3))).size >= 4, 'the boxes are not all one length');
  // the lengths follow the pattern's proportions
  const w0 = (row[0] as [number, number])[1] - (row[0] as [number, number])[0];
  const w1 = (row[1] as [number, number])[1] - (row[1] as [number, number])[0];
  near(w1 / w0, (SKIRT_BOX_PATTERN[1] as number) / (SKIRT_BOX_PATTERN[0] as number), 1e-9, 'the second box is the pattern\'s proportion of the first');
  // a stretch too short for two boxes is one panel, still the whole stretch; and the row is in the stretch whatever its length
  assert.deepEqual(skirtSplit(0, 1.4, boxes), [[0, 1.4]]);
  for (const len of [0.5, 2.9, 3.3, 6.1, 10.4, 11.7]) {
    const r = skirtSplit(0, len, boxes);
    assert.equal((r[0] as [number, number])[0], 0);
    near((r[r.length - 1] as [number, number])[1], len, 1e-9, `a ${len} m stretch ends where it ends`);
    for (const [a, b] of r) assert.ok(b > a, `a box of ${(b - a).toFixed(3)} m in a ${len} m stretch`);
  }
  // built: each through car's skirt panels start and end exactly where the row's boxes do, on both sides, and a box's foot is cut back by the family's rake (a box's ends are
  // nearly square: 3 cm; a one-piece cover's are raked 14 cm)
  assert.equal(boxes.rake, 0.03, 'a box is cut back 3 cm at each end of its foot');
  for (const kind of ALL_KINDS) {
    const spec = bodySpec(familyOf(kind));
    const g = built(kind);
    const top = spec.floor + SKIRT_TUCK;
    for (const car of trainLayout(kind).cars.filter((c) => c.cab === null).slice(0, 2)) {
      const panels = stretchesOf(car, spec.cutout).flatMap(([s, e]) => skirtSplit(s, e, spec.skirt.boxes));
      const expected = panels.flat().map((z) => z.toFixed(3));
      const expectedFoot = panels.flatMap(([a, b]) => {
        const rake = Math.min(spec.skirt.boxes?.rake ?? SKIRT_RAKE, 0.25 * (b - a));
        return [a + rake, b - rake];
      }).map((z) => z.toFixed(3));
      for (const sign of [-1, 1]) {
        const tris = skirtTris(g, kind, car).filter((t) => t.every((v) => v.x * sign > 0));
        const got = [...new Set(tris.flat().filter((v) => Math.abs(v.y - top) < 1e-5).map((v) => v.z.toFixed(3)))];
        assert.deepEqual(got.sort(), [...new Set(expected)].sort(), `${kind} car ${car.index} side ${sign}: the panels' ends are the boxes' ends`);
        const foot = [...new Set(tris.flat().filter((v) => Math.abs(v.y - spec.skirtBottom) < 1e-5).map((v) => v.z.toFixed(3)))];
        assert.deepEqual(foot.sort(), [...new Set(expectedFoot)].sort(), `${kind} car ${car.index} side ${sign}: the panels' feet are cut back by the family's rake`);
      }
    }
  }
});

test('roof kit: the tables put every insulator on its own plate, clear of the others, inside the flat of the roof, and every cable run from the pantograph or an insulator to an insulator without passing another', () => {
  for (const style of ['azuma', 'emu'] as const) {
    const def = ROOF_KITS[style];
    const kit = style === 'azuma' ? bodySpec('at300').roofKit : bodySpec('desiro').roofKit;
    assert.equal(kit?.style, style);
    const half = (i: (typeof def.items)[number]): readonly [number, number] => KIT_PLATE_HALF[i.kind];
    const radius = (i: (typeof def.items)[number]): number => (i.kind === 'big' ? KIT_BIG_RADIUS : KIT_SMALL_RADIUS);
    def.items.forEach((a, ia) => {
      const [hx, hz] = half(a);
      assert.ok(Math.abs(a.x) + hx <= KIT_HALF_WIDTH + 1e-9, `${style} item ${ia}: its plate stands ${(Math.abs(a.x) + hx).toFixed(3)} m out, the roof is flat to ${KIT_HALF_WIDTH}`);
      assert.ok(a.u - hz > 0.1, `${style} item ${ia}: a clear 0.1 m or more from the pantograph's edge`);
      assert.ok(a.u + hz <= roofKitReach(style) - 0.2 + 1e-9, `${style} item ${ia}: inside the kit's reach`);
      def.items.forEach((b, ib) => {
        if (ib <= ia) return;
        const [bx, bz] = half(b);
        const apart = Math.abs(a.x - b.x) >= hx + bx || Math.abs(a.u - b.u) >= hz + bz;
        assert.ok(apart, `${style}: plates ${ia} and ${ib} overlap`);
      });
    });
    const atItem = (x: number, u: number): boolean => def.items.some((i) => Math.abs(i.x - x) < 1e-9 && Math.abs(i.u - u) < 1e-9);
    def.cables.forEach((run, ir) => {
      const [x0, u0] = run[0] as readonly [number, number];
      const [x1, u1] = run[run.length - 1] as readonly [number, number];
      assert.ok(u0 === 0 || atItem(x0, u0), `${style} run ${ir}: starts at the pantograph's edge or on an insulator`);
      assert.ok(atItem(x1, u1), `${style} run ${ir}: ends on an insulator`);
      for (let i = 0; i + 1 < run.length; i++) {
        const [xa, ua] = run[i] as readonly [number, number];
        const [xb, ub] = run[i + 1] as readonly [number, number];
        assert.ok(xa === xb || ua === ub, `${style} run ${ir} leg ${i}: along the roof or across it`);
        for (const [ii, item] of def.items.entries()) {
          // CHANGED (red-check: a run whose corner sat on a third insulator passed): a run may touch only the two insulators it starts and ends on, whichever of its legs
          // reaches them, never one in the middle of it
          if ((item.x === x0 && item.u === u0) || (item.x === x1 && item.u === u1)) continue;
          // the distance of the insulator's axis from the leg: more than its sheds' radius and the cable's half width
          const cx = Math.min(Math.max(item.x, Math.min(xa, xb)), Math.max(xa, xb));
          const cu = Math.min(Math.max(item.u, Math.min(ua, ub)), Math.max(ua, ub));
          assert.ok(Math.hypot(item.x - cx, item.u - cu) > radius(item) + KIT_CABLE_WIDTH / 2, `${style} run ${ir} leg ${i} passes through insulator ${ii}`);
        }
      }
    });
  }
});

test('roof kit: a pantograph car carries ribbed insulators on plates with cables between them, on the nose side of its pantograph and clear of it, under the covers\' height, the covers kept off it; no other car, and not the Class 180, has one', () => {
  for (const kind of ALL_KINDS) {
    const spec = bodySpec(familyOf(kind));
    const g = built(kind);
    for (const car of trainLayout(kind).cars) {
      const here = `${kind} car ${car.index}`;
      const mesh = detailOf(g, car);
      const parts = { shed: trisOfColour(mesh, KIT_COLOURS.shed), cap: trisOfColour(mesh, KIT_COLOURS.cap), plate: trisOfColour(mesh, KIT_COLOURS.plate), cable: trisOfColour(mesh, KIT_COLOURS.cable) };
      // CHANGED (red-check: a family whose roofKit was set to null passed, its cars read as "no kit" by the branch below): every car that carries a pantograph has a kit; only the 180, which has no pantograph, has none
      if (car.pantograph) assert.ok(spec.roofKit, `${here}: a pantograph car's family has a roof kit`);
      if (!car.pantograph || !spec.roofKit) {
        for (const [name, ts] of Object.entries(parts)) assert.equal(ts.length, 0, `${here}: no ${name} triangles on a car without a roof kit`);
        continue;
      }
      const kit = spec.roofKit;
      const def = ROOF_KITS[kit.style];
      const dir = car.cab === 'rear' ? 1 : -1;
      const sx = car.cab === 'rear' ? -1 : 1;
      const [p0, p1] = car.pantograph;
      const nearEdge = dir < 0 ? p0 : p1;
      const plateTop = spec.crown + KIT_PLATE_TOP;
      assert.ok(kit.height < spec.coverHeight, `${here}: the kit's ${kit.height} m is under the covers' ${spec.coverHeight} m`);
      // the stretch of roof the covers are cut back from: the pantograph's, and the kit's beyond it
      const [k0, k1] = roofKitSpan(kit.style, p0, p1, dir);
      // standing on the roof's flat, under its height, on the nose side of the pantograph and inside the car well clear of its nose
      const noseClear = spec.nose.length + 1;
      for (const v of Object.values(parts).flat(2)) {
        // CHANGED (red-check: a span cut 1.5 m short passed, the test reading the span from the same function): every vertex of the kit lies inside the stretch the covers are cut back from
        assert.ok(v.z >= k0 - 1e-4 && v.z <= k1 + 1e-4, `${here}: a kit vertex at z ${v.z.toFixed(3)} outside the cut-back stretch ${k0.toFixed(3)} to ${k1.toFixed(3)}`);
        assert.ok(v.y >= spec.crown - 0.0125 && v.y <= spec.crown + kit.height + 1e-5, `${here}: a kit vertex at ${v.y.toFixed(4)}, the crown at ${spec.crown}`);
        assert.ok(Math.abs(v.x) <= KIT_HALF_WIDTH + 1e-5, `${here}: a kit vertex ${v.x.toFixed(3)} m off the centre line`);
        const u = (v.z - nearEdge) * dir;
        assert.ok(u >= -KIT_CABLE_WIDTH / 2 - 1e-5 && u <= roofKitReach(kit.style), `${here}: a kit vertex ${u.toFixed(3)} m beyond the pantograph's near edge`);
        assert.ok(v.z >= car.start + noseClear && v.z <= car.end - noseClear, `${here}: a kit vertex at z ${v.z.toFixed(2)} in a car of ${car.start.toFixed(2)} to ${car.end.toFixed(2)}`);
      }
      // each item's plate (its four top corners) and its stack's cap (the centre vertex at the stack's top) are where the table puts them, the train's right being +x for the front car
      const near3 = (a: THREE.Vector3, x: number, y: number, z: number): boolean => Math.abs(a.x - x) < 1e-4 && Math.abs(a.y - y) < 1e-4 && Math.abs(a.z - z) < 1e-4;
      for (const item of def.items) {
        const x = sx * item.x;
        const z = nearEdge + dir * item.u;
        const [hx, hz] = KIT_PLATE_HALF[item.kind];
        for (const cx of [-1, 1]) {
          for (const cz of [-1, 1]) {
            assert.ok(parts.plate.flat().some((v) => near3(v, x + cx * hx, plateTop, z + cz * hz)), `${here}: the plate of the ${item.kind} insulator at (${item.x}, ${item.u}) lacks its corner (${cx}, ${cz})`);
          }
        }
        const top = item.kind === 'big' ? spec.crown + kit.height : plateTop + (kit.height - KIT_PLATE_TOP) * 0.6;
        assert.ok(parts.cap.flat().some((v) => near3(v, x, top, z)), `${here}: the ${item.kind} insulator at (${item.x}, ${item.u}) has no cap centre at ${top.toFixed(3)}`);
        // its sheds' widest ring is the radius the tables give, and no vertex of its stack is wider
        const r = item.kind === 'big' ? KIT_BIG_RADIUS : KIT_SMALL_RADIUS;
        const mine = [...parts.shed.flat(), ...parts.cap.flat()].filter((v) => Math.hypot(v.x - x, v.z - z) <= r + 1e-4 && v.y > plateTop + 1e-4);
        assert.ok(mine.length > 0, `${here}: no stack vertices over the plate at (${item.x}, ${item.u})`);
        near(Math.max(...mine.map((v) => Math.hypot(v.x - x, v.z - z))), r, 1e-4, `${here}: the widest shed of the ${item.kind} insulator at (${item.x}, ${item.u})`);
      }
      // no cap or shed anywhere that is not on an item: every stack vertex is within its radius of some item's axis
      for (const v of [...parts.shed.flat(), ...parts.cap.flat()]) {
        const onItem = def.items.some((i) => Math.hypot(v.x - sx * i.x, v.z - (nearEdge + dir * i.u)) <= (i.kind === 'big' ? KIT_BIG_RADIUS : KIT_SMALL_RADIUS) + 1e-4);
        assert.ok(onItem, `${here}: a stack vertex at (${v.x.toFixed(3)}, ${v.z.toFixed(3)}) is on no insulator`);
      }
      // the cables: a box of ten triangles for each leg of each run (five faces and no bottom: two triangles each)
      assert.equal(parts.cable.length, 10 * def.cables.reduce((n, run) => n + run.length - 1, 0), `${here}: cable triangles`);
      // the covers keep out of the kit and the pantograph: no vertex of a cover inside the stretch, none of a cover's triangles across it
      for (const t of trisOfColour(mesh, SKIRT_PALE).filter((tr) => tr.some((v) => v.y > spec.crown))) {
        for (const v of t) assert.ok(v.z <= k0 + 1e-4 || v.z >= k1 - 1e-4, `${here}: a roof cover over the kit at z ${v.z.toFixed(3)} (kit and pantograph from ${k0.toFixed(3)} to ${k1.toFixed(3)})`);
        assert.ok(!(Math.min(...t.map((v) => v.z)) < k0 - 1e-4 && Math.max(...t.map((v) => v.z)) > k1 + 1e-4), `${here}: a roof cover triangle across the kit and the pantograph`);
      }
    }
  }
});

test('pantograph: the head carries two dark carbon strips along its top, inside the bow, no higher than the folded pantograph', () => {
  let seen = 0;
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    for (const pan of all(g, 'pantograph')) {
      const mesh = named(pan, 'pantograph-mesh') as THREE.Mesh;
      const strips = trisOfColour(mesh, PANTOGRAPH_STRIP);
      // two boxes of twelve triangles
      assert.equal(strips.length, 2 * 12, `${kind}: strip triangles`);
      const b = boxOfTris(strips);
      // CHANGED (red-check: strips drawn a centimetre too high passed): the folded top is the family's figure above the pantograph's base, not the strips' own maximum
      const top = worldPos(pan).y + bodySpec(familyOf(kind)).pantographTop;
      near(b.max.y, top, 1e-5, `${kind}: the strips' tops are the folded pantograph's top`);
      near(boxOf(pan).max.y, top, 1e-5, `${kind}: nothing of the pantograph stands above the strips`);
      near(b.max.y - b.min.y, PANTOGRAPH_STRIP_THICKNESS, 1e-5, `${kind}: strip thickness`);
      assert.ok(b.min.x >= -0.78 - 1e-5 && b.max.x <= 0.78 + 1e-5, `${kind}: the strips are inside the head's ends`);
      const zc = worldPos(pan).z;
      const zs = [...new Set(strips.flat().map((v) => (v.z - zc).toFixed(3)))].map(Number).sort((a, c) => a - c);
      assert.deepEqual(zs, PANTOGRAPH_STRIPS.flat().map((z) => Number(z.toFixed(3))), `${kind}: where the strips lie along the head`);
      // CHANGED (red-check: a strip a centimetre narrower passed, the test reading its numbers from the table it checks): two strips as wide as each other, within the head (0.64 to 0.82 m
      // along the pantograph, buildPantograph) and mirrored about its middle (0.73 m)
      assert.equal(zs.length, 4, `${kind}: two strips, four edges`);
      near(zs[1] - zs[0], zs[3] - zs[2], 1e-6, `${kind}: the strips are as wide as each other`);
      near(zs[0] + zs[3], 1.46, 1e-6, `${kind}: the strips' outer edges are mirrored about the head's middle`);
      near(zs[1] + zs[2], 1.46, 1e-6, `${kind}: the strips' inner edges are mirrored about the head's middle`);
      assert.ok(zs[0] >= 0.64 && zs[3] <= 0.82 && zs[2] > zs[1], `${kind}: the strips lie on the head, apart`);
      seen++;
    }
  }
  assert.equal(seen, ALL_KINDS.reduce((n, kind) => n + trainLayout(kind).cars.filter((c) => c.pantograph !== null).length, 0), 'a pantograph for each car the layouts give one');
  assert.ok(seen >= 15, `${seen} pantographs checked`);
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
  const side = spec.glass.side as NonNullable<typeof spec.glass.side>;
  // the foot of the front edge is well ahead of its top (a point low on the cheek, the top edge climbing back to the door), and the back edge stands
  // against the nose's end (photographs lner-800-doncaster-2026, hull-802-paragon-2025, hull-802-doncaster-2024, LUMO-04-Lumo-803003-at-Edinburgh-Waverley)
  // CHANGED (a front edge raked back 1.0 m or more, and a back edge within 0.3 m of the nose's end: the window of a 5.4 m nose): the nose is 3.9 m long now (ASSUMED.noseLength), and the
  // wedge shortens with it: raked back 0.6 m or more, its back edge up to half a metre before the nose's end, beside the crew door (lner-801-214-2025, a close crop of its first car)
  assert.ok(side.sFront1 - side.sFront0 >= 0.6, `the front edge is raked back ${side.sFront1 - side.sFront0} m from foot to top`);
  assert.ok(side.sBack > spec.nose.length - 0.5 && side.sBack < spec.nose.length, `the back edge, ${spec.nose.length - side.sBack} m before the nose's end`);
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
        assert.ok(top - foot > 0.6, `${kind} car ${car.index}: the window's top starts ${(top - foot).toFixed(2)} m behind its foot (a wedge, not a slab)`);
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

test('lamps: the AT300 kinds\' lamp clusters are a window on each cheek, behind the face\'s plane, with a round headlight and a smaller tail lamp lower and nearer the face, each kind in its own colours; no other kind has one', () => {
  // photographs lner-800-113-newcastle-2025 (head on: the headlights about 0.9 m either side of the middle and 1.65 m up, in a slanted dark window with a pale rim, a smaller dotted lamp
  // below and nearer the face), lner-801-214-2025, hull-802-doncaster-2024 (a slate window) and LUMO-04-Lumo-803003-at-Edinburgh-Waverley (smoked glass with no rim of its own)
  // CHANGED (a "pod": one housing patch wrapping back from the face onto the cheek, the lenses on the face): the lenses are in the window, on the cheek
  const COLOURS: Partial<Record<TrainKind, number>> = { lner5: POD, lner9: POD, hull5: HULL_POD, lumo5: POD };
  const RIMS: Partial<Record<TrainKind, number | undefined>> = { lner5: 0xc7ccd3, lner9: 0xc7ccd3, hull5: 0x4a5160, lumo5: undefined };
  assert.notEqual(POD, HULL_POD);
  const spec = bodySpec('at300');
  const sec = carSection(spec);
  const norm = normalised(sec);
  const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  /** The distinct vertices of some triangles, and their mean. */
  const ring = (ts: Tri[]): { pts: THREE.Vector3[]; centre: THREE.Vector3 } => {
    const seen = new Map<string, THREE.Vector3>();
    for (const v of ts.flat()) seen.set(`${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`, v);
    const pts = [...seen.values()];
    return { pts, centre: new THREE.Vector3(mean(pts.map((v) => v.x)), mean(pts.map((v) => v.y)), mean(pts.map((v) => v.z))) };
  };
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const cluster = frontOf(kind).cluster;
    assert.equal(cluster !== undefined, kind in COLOURS, `${kind}: has a cluster`);
    for (const car of endCabs(layout)) {
      const mesh = detailOf(g, car);
      if (!cluster) {
        for (const c of [POD, HULL_POD]) assert.equal(trisOfColour(mesh, c).length, 0, `${kind} car ${car.index}: no cluster window`);
        continue;
      }
      assert.equal(cluster.window.colour, COLOURS[kind], `${kind}: the window's colour`);
      assert.equal(cluster.rim?.colour, RIMS[kind], `${kind}: the rim's colour`);
      const face = facePlane(car, true, false);
      const along = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - face : face - v.z);
      // the lenses show what the cab end's service lamps do: white lit at the leading end, red lit at the trailing end, the others dark
      const headHex = car.cab === 'front' ? LENS.headOn : LENS.headOff;
      const tailHex = car.cab === 'rear' ? LENS.tailOn : LENS.tailOff;
      const lensCentres: Record<string, THREE.Vector3[]> = { head: [], tail: [] };
      for (const sign of [-1, 1]) {
        const here = `${kind} car ${car.index} ${sign > 0 ? 'right' : 'left'}`;
        const onSide = (ts: Tri[]): Tri[] => ts.filter((t) => t.every((v) => v.x * sign > 0));
        // the window: behind the face's plane everywhere (nothing stands out in front of the train's end), no nearer the tip than FACE_CLEAR less its lift, reaching back as
        // far as the spec's top edge and up and down as far as its height
        const win: THREE.Vector3[] = onSide(trisOfColour(mesh, cluster.window.colour)).flat();
        assert.ok(win.length >= 300, `${here}: only ${win.length} window vertices`);
        assert.ok(Math.min(...win.map(along)) > FACE_CLEAR - 0.02, `${here}: the window starts ${Math.min(...win.map(along)).toFixed(3)} m behind the face`);
        const reach = Math.max(...win.map(along));
        near(reach, cluster.window.sBack1, 0.1, `${here}: the window's reach`);
        near(Math.min(...win.map((v) => v.y)), cluster.window.y0, 0.03, `${here}: the window's foot`);
        near(Math.max(...win.map((v) => v.y)), cluster.window.y1, 0.03, `${here}: the window's top`);
        // it wraps onto the cheek: its back end stands further out from the middle than its front
        const first = win.filter((v) => along(v) < 0.2 * reach);
        const last = win.filter((v) => along(v) > 0.8 * reach);
        assert.ok(first.length > 0 && last.length > 0);
        assert.ok(mean(last.map((v) => Math.abs(v.x))) - mean(first.map((v) => Math.abs(v.x))) > 0.05, `${here}: the window does not run out along the cheek`);
        // the rim: a pale edge a little bigger than the window all round, only on the kinds that have one
        for (const hex of [0xc7ccd3, 0x4a5160]) {
          const rim = onSide(trisOfColour(mesh, hex));
          if (hex !== cluster.rim?.colour) {
            assert.equal(rim.length, 0, `${here}: a rim in ${hex.toString(16)}`);
            continue;
          }
          const rb = boxOfTris(rim);
          const wb = new THREE.Box3().setFromPoints(win);
          assert.ok(rim.length >= 100 && rb.min.y < wb.min.y - 0.01 && rb.max.y > wb.max.y + 0.01, `${here}: the rim (${rim.length} triangles, y ${rb.min.y.toFixed(3)}..${rb.max.y.toFixed(3)}) does not edge the window (y ${wb.min.y.toFixed(3)}..${wb.max.y.toFixed(3)})`);
        }
        // the lenses: round discs of the spec's radius, at its place on the flank, the headlight bigger and higher and the tail lamp lower and nearer the face
        for (const [role, hex, at] of [['head', headHex, cluster.head], ['tail', tailHex, cluster.tail]] as const) {
          const lens = ring(onSide(trisOfColour(mesh, hex)));
          assert.ok(lens.pts.length >= 14, `${here} ${role} lens: ${lens.pts.length} vertices`);
          const c = lens.centre;
          near(along(c), at.s, 0.03, `${here} ${role} lens: distance behind the face`);
          near(c.y, at.y, 0.02, `${here} ${role} lens: height`);
          near(Math.abs(c.x), xAtY(halfAt(sec, norm, egg, ringAt(spec.nose, at.s)), at.y), 0.03, `${here} ${role} lens: on the flank`);
          // round: every vertex is on the circle (or at its centre), in whatever plane the flank tilts the disc into
          for (const v of lens.pts) {
            const d = v.distanceTo(c);
            assert.ok(Math.abs(d - at.r) < 2e-4 || d < 2e-4, `${here} ${role} lens: a vertex ${d.toFixed(4)} m from its centre, the radius is ${at.r}`);
          }
          lensCentres[role]?.push(c);
        }
      }
      for (const role of ['head', 'tail']) {
        const [l, r] = lensCentres[role] as [THREE.Vector3, THREE.Vector3];
        const here = `${kind} car ${car.index} ${role} lenses`;
        near(l.x, -r.x, 2e-4, `${here} are symmetric`);
        near(l.y, r.y, 2e-4, `${here} are level`);
        near(l.z, r.z, 2e-4, `${here} stand at one place along the train`);
      }
      const [headL] = lensCentres.head as [THREE.Vector3];
      const [tailL] = lensCentres.tail as [THREE.Vector3];
      assert.ok(headL.y > tailL.y + 0.1 && along(headL) > along(tailL) + 0.1, `${kind} car ${car.index}: the tail lamp is lower and nearer the face than the headlight`);
    }
  }
  assert.deepEqual(frontOf('lner5').cluster, frontOf('lner9').cluster, 'both LNER kinds have the same cluster');
  // the head lens is bigger than the tail lens, and the window's top edge is longer than its foot's (a slanted wedge, as the photographs show it)
  const base = bodySpec('at300').front.cluster;
  assert.ok(base && base.head.r > base.tail.r && base.window.sBack1 - base.window.sFront1 > base.window.sBack0 - base.window.sFront0, 'the headlight is bigger than the tail lamp; the window is longer at its top');
});

test('fronts: the AT300\'s colour mask: the LNER\'s yellow and the Hull Trains beak\'s grey over the face between two slanted lines and back over the nose\'s top to the windscreen; none on Lumo or any other kind', () => {
  // lner-800-113-newcastle-2025, lner-801-214-2025 (the yellow: a trapezoid about 1.45 m across under the glass and 0.9 m at the chin, red cheeks beside it) and hull-802-doncaster-2024 (a grey bullet)
  const MASKS: Partial<Record<TrainKind, number>> = { lner5: LNER_YELLOW, lner9: LNER_YELLOW, hull5: HULL_BEAK };
  const r0 = ringAt(bodySpec('at300').nose, 0);
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const mask = frontOf(kind).mask;
    assert.equal(mask?.colour, MASKS[kind], `${kind}: the mask's colour`);
    const family = bodySpec(layout.spec.family);
    const sec = carSection(family);
    const norm = normalised(sec);
    const tipHalf = halfAt(sec, norm, eggSection(norm, family.nose.widest, family.nose.boxiness), ringAt(family.nose, 0));
    for (const car of layout.cars) {
      const mesh = detailOf(g, car);
      // the LNER's yellow is on the LNER's cabs and nowhere else (not on a through car, not on any other kind)
      assert.equal(trisOfColour(mesh, LNER_YELLOW).length > 0, mask?.colour === LNER_YELLOW && car.cab !== null, `${kind} car ${car.index}: the LNER yellow`);
      if (!mask || !endCabs(layout).includes(car)) continue;
      const tris = trisOfColour(mesh, mask.colour);
      const face = facePlane(car, true, false);
      const along = (v: THREE.Vector3): number => (car.cab === 'front' ? v.z - face : face - v.z);
      const half = (y: number): number => mask.hwFoot + ((mask.hwTop - mask.hwFoot) * (y - r0.bottom)) / (r0.top - r0.bottom);
      const onFace = tris.filter((t) => t.every((v) => Math.abs(along(v)) < 1e-3));
      const area = onFace.reduce((a, t) => a + areaOf(t), 0);
      assert.ok(area > 0.5, `${kind} car ${car.index}: only ${area.toFixed(2)} m2 of mask on the face`);
      // between the two lines at every height, and inside the face's own outline
      for (const v of onFace.flat()) {
        assert.ok(Math.abs(v.x) <= half(v.y) + 1e-4, `${kind} car ${car.index}: the mask reaches x = ${v.x.toFixed(3)} at y = ${v.y.toFixed(2)}, past its line at ${half(v.y).toFixed(3)}`);
        assert.ok(Math.abs(v.x) <= xAtY(tipHalf, v.y) + 1e-4, `${kind} car ${car.index}: the mask leaves the face's outline at y = ${v.y.toFixed(2)}`);
      }
      // it runs from the chin to the top of the face, symmetric about the middle
      const box = boxOfTris(onFace);
      assert.ok(box.min.y < r0.bottom + 0.12 && box.max.y > r0.top - 0.1, `${kind} car ${car.index}: the mask covers y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)} of the face ${r0.bottom}..${r0.top}`);
      near(box.min.x, -box.max.x, 1e-4, `${kind} car ${car.index}: the mask is symmetric`);
      // the band over the nose's top: from the face's upper edge back to the windscreen's foot, no wider than the sill line
      const band = tris.filter((t) => t.some((v) => along(v) > 0.03));
      assert.ok(band.length >= 100, `${kind} car ${car.index}: ${band.length} triangles of mask over the nose's top`);
      const sGlass = (family.glass.screen as NonNullable<typeof family.glass.screen>).s0;
      const reach = Math.max(...band.flat().map(along));
      assert.ok(reach > sGlass - 0.15 && reach < sGlass + 0.1, `${kind} car ${car.index}: the band reaches ${reach.toFixed(2)} m back, the windscreen starts at ${sGlass}`);
      const bandOut = Math.max(...band.flat().map((v) => Math.abs(v.x)));
      assert.ok(bandOut <= mask.hwSill + 0.03 && bandOut > mask.hwTop - 0.1, `${kind} car ${car.index}: the band is ${bandOut.toFixed(2)} m out at its widest, the spec says ${mask.hwSill}`);
    }
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
