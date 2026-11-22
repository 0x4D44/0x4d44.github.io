// The Hitachi AT300 bodyshell, once for every operator that runs it (LNER 800/801, Hull Trains 802, Lumo 803): the section's shoulder, the blunt round-fronted nose, and the
// colour masks laid on it. The figures are the readings off the photographs that web/src/train.ts AT300_NOSE_KNOTS, AT300_CANT_RADIUS, LNER_MASK and HULL_MASK cite, each held to
// about the precision those readings have. Pure geometry: no WebGL and no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import type { TrainKind } from '../../core/train.ts';
import { bodySpec, buildTrain, carSection } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { HULL_BEAK, LNER_YELLOW } from '../src/train-livery.ts';
import { eggSection, halfAt, normalised, ringAt, xAtY } from '../src/train-nose.ts';

const spec = bodySpec('at300');
const sec = carSection(spec);
const norm = normalised(sec);
const egg = eggSection(norm, spec.nose.widest, spec.nose.boxiness);
const ringHalf = (s: number): [number, number][] => halfAt(sec, norm, egg, ringAt(spec.nose, s));
/** the roof line on the centre line at distance s from the tip: the ring's highest point */
const topAt = (s: number): number => Math.max(...ringHalf(s).map((p) => p[1]));

test('the AT300 roof turns over a broader shoulder: flat only within 0.71 m of the middle (0.78 m before), still over the covers and the roof kit; the other families keep theirs', () => {
  // where the shoulder meets the near-flat crown: the outermost point within 13 mm of the crown (the shoulder's quarter-ellipse ends 12 mm under it)
  const flatFrom = (half: readonly [number, number][], crown: number): number => Math.max(...half.filter(([, y]) => y >= crown - 0.013).map(([x]) => x));
  const at300 = flatFrom(sec.half, sec.crown);
  // lner-800-113-newcastle-2025 shows a shoulder about 0.8 m across; the gangway's opening (2.3 m wide, 3.15 m up at its top corners) holds this one to 0.6 m
  assert.ok(at300 > 0.68 && at300 < 0.74, `the AT300's roof is flat out to ${at300.toFixed(3)} m`);
  // the covers (0.425 m either side) and the roof kit's outermost insulator (0.52 m) stand on the flat
  assert.ok(spec.coverBw / 2 < at300, `the covers' foot, ${spec.coverBw / 2} m out, is on the flat`);
  assert.ok(0.52 < at300, 'the roof kit stands on the flat');
  // the wall is unchanged: upright from the floor's corner to WALL_TOP, at the body's half-width less the door relief, so the doors and windows still lie on it
  const wall = sec.half.slice(2, 6);
  assert.ok(wall.every(([x]) => Math.abs(x - sec.width) < 1e-9), 'the wall stands upright');
  assert.equal(sec.width, spec.half - 0.02);
  // a section built without a cant radius (the 385's, the EMR units', the DMUs' are built that way) keeps the 0.55 m shoulder
  const other = carSection({ half: spec.half, floor: spec.floor, wallTop: spec.wallTop, crown: spec.crown });
  const otherFlat = flatFrom(other.half, other.crown);
  assert.ok(Math.abs(otherFlat - (other.width - 0.55)) < 1e-9, `the default shoulder ends ${otherFlat} m out`);
  for (const family of ['electrostar', 'desiro', 'desiro700', 'adelante'] as const) assert.equal(bodySpec(family).cantRadius, undefined, `${family} keeps the default shoulder`);
});

test('the AT300 nose is a blunt round front, as lner-800-108-offord-cluny-2023 shows it side on: tall at the tip, then lying back at about 30 degrees to the roof', () => {
  // the front: the centre line stands over 1.5 m within 0.1 m of the tip (the old beak's face stopped at 1.3 m, 0.7 m tall), and the profile's readings, side on, scaled by the crew
  // door: 1.62 m at 0.24 m back, 1.78 m at 0.48 m, 1.92 m at 0.79 m, each to 0.08 m; at 1.09 m, where the glass's foot meets it, between the side-on reading (2.03 m) and the head-on one (2.2 m)
  assert.ok(topAt(0.1) > 1.5, `the front stands ${topAt(0.1).toFixed(2)} m tall 0.1 m back`);
  for (const [s, y] of [[0.24, 1.62], [0.48, 1.78], [0.79, 1.92]] as const) {
    assert.ok(Math.abs(topAt(s) - y) <= 0.08, `${s} m back the centre line stands ${topAt(s).toFixed(3)} m up, the photograph ${y} m`);
  }
  assert.ok(topAt(1.09) >= 2.03 && topAt(1.09) <= 2.2, `1.09 m back the centre line stands ${topAt(1.09).toFixed(3)} m up`);
  // the glass lies back at about 31 degrees: the roof line's rise over the screen, foot to top
  const screen = spec.glass.screen!;
  const rake = (Math.atan2(topAt(screen.s1) - topAt(screen.s0), screen.s1 - screen.s0) * 180) / Math.PI;
  assert.ok(rake > 26 && rake < 36, `the glass lies ${rake.toFixed(1)} degrees off level`);
  // the screen's foot is 2.0 to 2.2 m up (side on 2.0, head on 2.2) and its top 2.9 to 3.15 m (side on 2.93, head on 3.15)
  assert.ok(topAt(screen.s0) >= 2.0 && topAt(screen.s0) <= 2.2, `the glass's foot stands ${topAt(screen.s0).toFixed(2)} m up`);
  assert.ok(topAt(screen.s1) >= 2.9 && topAt(screen.s1) <= 3.15, `the glass's top stands ${topAt(screen.s1).toFixed(2)} m up`);
  // the underside stays low behind the tip, about 0.5 m up (side on: 0.54 m, 0.36 m back)
  assert.ok(Math.abs((ringHalf(0.36)[0] as [number, number])[1] - 0.5) <= 0.08, 'the chin stays about 0.5 m up');
});

test('head on, the AT300 nose fills out low down: about 1.6 m across 0.3 m back and over 2 m by 1 m back, the cheeks not closing in under the lamps', () => {
  // lner-800-113-newcastle-2025: the cover's disc is about 1.6 m across at 1.15 m up; by 1 m back the red cheeks reach nearly the full width low down
  const across = (s: number, y: number): number => 2 * xAtY(ringHalf(s), y);
  assert.ok(across(0.3, 1.15) > 1.75 && across(0.3, 1.15) < 2.15, `0.3 m back, 1.15 m up: ${across(0.3, 1.15).toFixed(2)} m across`);
  assert.ok(across(1.0, 0.9) > 2.0, `1 m back, 0.9 m up: ${across(1.0, 0.9).toFixed(2)} m across`);
  // and it narrows upward to the glass: at the screen's foot height, 1 m back, it is no wider than the 1.35 m glass and the two lamp housings beside it (about 1.9 m)
  assert.ok(across(1.0, 2.0) < 1.95, `1 m back, 2.0 m up: ${across(1.0, 2.0).toFixed(2)} m across`);
});

/** The head-on area (projected on the face's plane) and the bounds of the triangles of one colour in the front cab's detail mesh. */
function coloured(kind: TrainKind, hex: number): { area: number; box: THREE.Box3; foot: number } {
  const car = buildTrain(kind).children[0] as THREE.Object3D;
  const mesh = car.getObjectByName('body-detail') as THREE.Mesh;
  const p = mesh.geometry.getAttribute('position');
  const c = mesh.geometry.getAttribute('color');
  const index = mesh.geometry.index;
  const rgb = col(hex);
  const box = new THREE.Box3();
  let area = 0;
  const tris: THREE.Vector3[][] = [];
  const n = index ? index.count : p.count;
  for (let t = 0; t < n; t += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
    if (!ids.every((i) => Math.abs(c.getX(i) - rgb.r) < 1e-6 && Math.abs(c.getY(i) - rgb.g) < 1e-6 && Math.abs(c.getZ(i) - rgb.b) < 1e-6)) continue;
    const v = ids.map((i) => new THREE.Vector3().fromBufferAttribute(p, i));
    for (const q of v) box.expandByPoint(q);
    area += Math.abs(new THREE.Vector3().subVectors(v[1]!, v[0]!).cross(new THREE.Vector3().subVectors(v[2]!, v[0]!)).z) / 2;
    tris.push(v);
  }
  // how wide the colour is 0.15 m over its lowest point (the face's foot is rounded, so the lowest few centimetres are narrower): the widest crossing of that level by a triangle's edge
  const level = box.min.y + 0.15;
  const crossings = tris.flatMap((t) =>
    ([[0, 1], [1, 2], [2, 0]] as const).flatMap(([a, b]) => {
      const p = t[a]!;
      const q = t[b]!;
      if ((p.y - level) * (q.y - level) > 0 || p.y === q.y) return [];
      return [Math.abs(p.x + ((level - p.y) / (q.y - p.y)) * (q.x - p.x))];
    }),
  );
  const foot = 2 * Math.max(0, ...crossings);
  return { area, box, foot };
}

test('the LNER yellow is a trapezoid widening to the glass, about 1.8 m2 head on; the Hull Trains beak is wider, between the lamp housings', () => {
  for (const kind of ['lner5', 'lner9'] as const) {
    const y = coloured(kind, LNER_YELLOW);
    // lner-800-113-newcastle-2025: about 0.96 m across at the chin (0.6 m up; measured here 0.15 m over the yellow's foot), 1.35 m under the glass, 1.55 m tall: about 1.8 m2 (each to about 10 %)
    assert.ok(y.area > 1.45 && y.area < 1.95, `${kind}: the yellow covers ${y.area.toFixed(2)} m2 head on`);
    assert.ok(y.box.max.y >= 2.05 && y.box.max.y <= 2.25, `${kind}: the yellow reaches ${y.box.max.y.toFixed(2)} m up, to the glass`);
    const chin = y.foot;
    assert.ok(y.box.min.y < 0.75, `${kind}: the yellow comes down to ${y.box.min.y.toFixed(2)} m, the chin`);
    const sill = 2 * y.box.max.x;
    assert.ok(chin > 0.8 && chin < 1.0, `${kind}: ${chin.toFixed(2)} m across at the chin`);
    assert.ok(sill > 1.3 && sill < 1.5, `${kind}: ${sill.toFixed(2)} m across at the glass`);
  }
  const hull = coloured('hull5', HULL_BEAK);
  const lner = coloured('lner5', LNER_YELLOW);
  assert.ok(hull.area > lner.area + 0.1, `the Hull Trains beak (${hull.area.toFixed(2)} m2) is wider than the LNER's yellow (${lner.area.toFixed(2)} m2)`);
  assert.ok(2 * hull.box.max.x > 1.5 && 2 * hull.box.max.x < 1.7, `the Hull Trains beak is ${(2 * hull.box.max.x).toFixed(2)} m across at the glass`);
});
