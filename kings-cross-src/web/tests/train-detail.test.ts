// The detail of the trains: the lofted nose and its glass, the gangways and couplers, the bogies, the liveries and
// the Great Northern commuter units. Pure geometry: no WebGL and no DOM (the canvas textures are only made in a
// browser, so their sharpness is pinned here by the numbers that size them).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ALL_KINDS, EMU_FIGURES, EMU_KINDS, FIGURES, TRAIN_KINDS, trainLayout } from '../../core/train.ts';
import type { Car, EmuFamily, Family, TrainKind } from '../../core/train.ts';
import { LIVERIES, ROW_H, atlasRect, texelsPerMetre, textEms } from '../src/livery.ts';
import { bodySpec, buildTrain, carPlan, carSection, END_GAP, NOSE_RECESS } from '../src/train.ts';
import { eggSection, filletFactor, halfAt, loopFromHalf, normalised, planProfile, ringAt, ringStations, sideProfile, xAtY, yAtX } from '../src/train-nose.ts';
import { DISC_RADIUS, FLANGE_HEIGHT, bogieSoup, buildBogie } from '../src/train-parts.ts';

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const FAMILIES: Family[] = ['at300', 'electrostar', 'desiro'];
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
const triCount = (g: THREE.Object3D): number => {
  let n = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += m.geometry.getAttribute('position').count / 3;
  });
  return n;
};

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
  for (const kind of ['lner5', 'lumo5', 'hull5', 'gn387x4', 'gn717x6'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const sec = carSection(spec);
    const norm = normalised(sec);
    const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
    const stations = ringStations(spec.nose);
    const key = (x: number, y: number, z: number): string => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    for (const car of layout.cars.filter((c) => c.cab)) {
      // the vertices the loft has: every point of every ring of the nose, at its place in the train
      const loft = new Set<string>();
      for (const s of stations) {
        for (const [x, y] of loopFromHalf(halfAt(sec, norm, egg, ringAt(spec.nose, s)))) loft.add(key(x, y, car.cab === 'front' ? car.start + NOSE_RECESS + s : car.end - NOSE_RECESS - s));
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
            const e = edges.get(id) ?? { normals: [], s: car.cab === 'front' ? a.z - car.start - NOSE_RECESS : car.end - NOSE_RECESS - a.z };
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

test('nose: the face stands NOSE_RECESS behind the end of the train and the nose reaches full section where the spec says', () => {
  for (const kind of ['lner5', 'gn387x4', 'gn717x6'] as TrainKind[]) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const spec = bodySpec(layout.spec.family);
    const front = layout.cars[0] as Car;
    const rear = layout.cars[layout.cars.length - 1] as Car;
    const frontBody = [named(named(g, 'car-0'), 'body-detail'), named(named(g, 'car-0'), 'body-shell')].map(boxOf).reduce((a, b) => a.union(b));
    near(frontBody.min.z, front.start + NOSE_RECESS - 0.006, 0.0061, `${kind} front face`);
    const rearBody = [named(named(g, `car-${rear.index}`), 'body-detail'), named(named(g, `car-${rear.index}`), 'body-shell')].map(boxOf).reduce((a, b) => a.union(b));
    near(rearBody.max.z, rear.end - NOSE_RECESS + 0.006, 0.0061, `${kind} rear face`);
    // at full section: the wall stands at half the body width minus the door relief, over the whole of the car behind the nose
    const shell = named(named(g, 'car-0'), 'body-shell') as THREE.Mesh;
    const behind = triangles(shell).flatMap((t) => t).filter((v) => v.z > front.start + spec.nose.length + 0.5);
    near(Math.max(...behind.map((v) => v.x)), spec.half - 0.02, 1e-6, `${kind} wall half-width behind the nose`);
  }
});

// --- the cab glass --------------------------------------------------------------------------------

test('glass: the windscreen is a raked, curved, wide pane that stands on the outside of the nose, over the bonnet', () => {
  for (const kind of ['lner5', 'lumo5', 'gn387x4', 'gn717x6'] as TrainKind[]) {
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
      const s = v.z - car.start - NOSE_RECESS;
      const surface = yAtX(halfAt(sec, norm, egg, ringAt(spec.nose, Math.max(0, Math.min(spec.nose.length, s)))), Math.abs(v.x));
      assert.ok(v.y - surface > 0.0002 && v.y - surface < 0.06, `${kind}: glass ${((v.y - surface) * 1000).toFixed(2)} mm over the nose at x=${v.x.toFixed(2)}, s=${s.toFixed(2)}`);
      const n = new THREE.Vector3().fromBufferAttribute(normals, i);
      assert.ok(n.z <= 0.05 && (n.y > 0.05 || n.z < -0.05), `${kind}: a windscreen vertex whose normal (${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}) faces into the cab`);
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
      // where the cover is on, the lamps are above its top
      const cover = all(named(g, `car-${car.index}`), 'coupler-cover')[0];
      if (cover) assert.ok(a.y > (cover.userData.y1 as number), `${kind} car ${car.index}: the lamps are over the cover`);
    }
  }
});

// --- the coupler cover, gangways and couplers -----------------------------------------------------------

test('couplers: the nose coupler is under its cover at the two train ends and out only where two units meet', () => {
  for (const kind of ALL_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const covers = all(g, 'coupler-cover');
    assert.equal(covers.length, 2, `${kind}: a cover at each end of the train`);
    const zs = covers.map((c) => worldPos(c).z).sort((a, b) => a - b);
    near(zs[0] as number, 0, 0.02, `${kind} front cover`);
    near(zs[1] as number, layout.length, 0.02, `${kind} rear cover`);
    for (const c of covers) {
      assert.equal(c.userData.hidesCoupler, true);
      const y = worldPos(c).y;
      assert.ok(y > 0.55 && y < 1.4 && Math.abs(worldPos(c).x) < 1e-9, `${kind} cover at (${worldPos(c).x}, ${y})`);
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
  // air springs under the body: one in each corner of the bogie, outboard of the wheels and standing higher than any wheel reaches
  const springCorners = new Set<string>();
  for (let i = 0; i < trailer.pos.length; i += 3) {
    if ((trailer.pos[i + 1] as number) > 2 * spec.radius + FLANGE_HEIGHT + 0.012 && Math.abs(trailer.pos[i] as number) > spec.track / 2 + 0.05) springCorners.add(`${Math.sign(trailer.pos[i] as number)},${Math.sign(trailer.pos[i + 2] as number)}`);
  }
  assert.equal(springCorners.size, 4, `air springs in ${springCorners.size} corners of the bogie`);
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
        geometries.add((named(bogie, 'bogie-mesh') as THREE.Mesh).geometry);
      });
    }
    // motor and trailer, a longer or shorter wheelbase: never one geometry per bogie
    assert.ok(geometries.size <= 4 && geometries.size < layout.cars.length * 2, `${kind}: ${geometries.size} bogie geometries`);
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
  for (const kind of ['lner9', 'lumo5', 'hull5', 'gn387x4'] as TrainKind[]) {
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
  assert.match(LIVERIES.greatnorthern.basis, /dark cab front and every shade approximate/);
  assert.match(LIVERIES.hulltrains.sources.join(' '), /grey\/black front nose cone/);
});

// --- the Great Northern units ---------------------------------------------------------------------------

test('Great Northern: each car is as long and wide as the figures say, with two sliding doors a side, and the roof at the published height', () => {
  for (const kind of EMU_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const fig = emuFig(kind);
    const top = boxOf(g).max.y;
    near(top, fig.height.value, 0.02, `${kind} highest point (published 3.77 m for the 387, assumed for the 717)`);
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

test('Great Northern: windows sit between and beside the doors without overlapping them, and every window is on its car', () => {
  for (const kind of EMU_KINDS) {
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

test('Great Northern: coupled Class 387 units meet nose to nose, 2 x END_GAP apart, with the couplers out', () => {
  const g = built('gn387x8');
  const layout = trainLayout('gn387x8');
  const a = layout.cars[3] as Car;
  const b = layout.cars[4] as Car;
  assert.ok(a.cab === 'rear' && b.cab === 'front');
  const boxA = boxOf(named(named(g, 'car-3'), 'body-shell'));
  const boxB = boxOf(named(named(g, 'car-4'), 'body-shell'));
  // the two noses stand END_GAP back from the joint each, so their tips are 2 x END_GAP apart
  near(boxB.min.z - boxA.max.z, 2 * END_GAP, 1e-3, 'the noses of two coupled units');
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
    const materials = new Set<THREE.Material>();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshes++;
        materials.add(m.material as THREE.Material);
      }
    });
    assert.ok(meshes <= 80, `${kind} has ${meshes} meshes`);
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
