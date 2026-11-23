// The Hitachi AT300 bodyshell, once for every operator that runs it (LNER 800/801, Hull Trains 802, Lumo 803): the section's shoulder, the blunt round-fronted nose, and the
// colour masks laid on it. The figures are the readings off the photographs that web/src/train.ts AT300_NOSE_KNOTS, AT300_CANT_RADIUS, LNER_MASK and HULL_MASK cite, each held to
// about the precision those readings have. Pure geometry: no WebGL and no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { bodySpec, buildTrain, carSection, CLUSTER_ARRAY, CLUSTER_EDGE, CLUSTER_LIFT, CLUSTER_ROW, faceSetback, frontOf, LENS } from '../src/train.ts';
import { LIVERIES } from '../src/livery.ts';
import { col } from '../src/train-geom.ts';
import { HULL_BEAK, LNER_YELLOW } from '../src/train-livery.ts';
import { eggSection, halfAt, normalised, ringAt, ringStations, xAtY } from '../src/train-nose.ts';

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
    // RE-PINNED (round B7; was 1.3 to 1.5, the 1.35 m reading): the yellow's top is flush with the frame's foot in lner-800-113-newcastle-2025 and lner-801-214-2025 (the B6 score: the frame's
    // corners stood 0.15 m past it), so it now flares out to the frame's edge, 1.58 m across; the same 0.1 m either side
    assert.ok(sill > 1.48 && sill < 1.68, `${kind}: ${sill.toFixed(2)} m across at the glass`);
  }
  const hull = coloured('hull5', HULL_BEAK);
  const lner = coloured('lner5', LNER_YELLOW);
  assert.ok(hull.area > lner.area + 0.1, `the Hull Trains beak (${hull.area.toFixed(2)} m2) is wider than the LNER's yellow (${lner.area.toFixed(2)} m2)`);
  assert.ok(2 * hull.box.max.x > 1.5 && 2 * hull.box.max.x < 1.7, `the Hull Trains beak is ${(2 * hull.box.max.x).toFixed(2)} m across at the glass`);
});

type P3 = [number, number, number];
/** The distance from p to the triangle abc's nearest point, signed by the triangle's winding (outward on the loft's right half): Ericson's closest point on a triangle. */
function signedToTriangle(p: P3, a: P3, b: P3, c: P3): { d: number; sign: number } {
  const sub = (u: P3, v: P3): P3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u: P3, v: P3): number => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (o: P3, u: P3, k: number, v: P3 = [0, 0, 0], m = 0): P3 => [o[0] + u[0] * k + v[0] * m, o[1] + u[1] * k + v[1] * m, o[2] + u[2] * k + v[2] * m];
  const ab = sub(b, a);
  const ac = sub(c, a);
  const q = ((): P3 => {
    const ap = sub(p, a);
    const d1 = dot(ab, ap);
    const d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b);
    const d3 = dot(ab, bp);
    const d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(a, ab, d1 / (d1 - d3));
    const cp = sub(p, c);
    const d5 = dot(ab, cp);
    const d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(a, ac, d2 / (d2 - d6));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return at(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
    const den = 1 / (va + vb + vc);
    return at(a, ab, vb * den, ac, vc * den);
  })();
  const n: P3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const off = sub(p, q);
  return { d: Math.hypot(...off), sign: Math.sign(dot(off, n)) || 1 };
}

test('the AT300 lamp housing lies flush on the nose: its outline comes down onto the loft at both ends of all four kinds, its middle keeps its lift (round B3)', () => {
  // The fresh score of round B3: the housing was a plate laid CLUSTER_LIFT off the loft with an open edge, 14 mm proud at the rim and 26 mm at a window without one, so side on
  // (cab-side-3m) its top edge stood out of the nose's outline and 3/4 on (rear-nose-34) its foot showed a step with daylight under it; lner-800-108-offord-cluny-2023 and LUMO-04 show
  // the glazing flush with the curve. The loft here is the nose's own: the rings at ringStations, quads between them, in the nose's frame (x across, y up, s back from the tip).
  const tip = faceSetback('at300');
  const stations = ringStations(spec.nose).filter((s) => s < 3);
  const rings = stations.map(ringHalf);
  const loft: P3[][] = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j + 1 < (rings[i] as [number, number][]).length; j++) {
      const v = (a: number, b: number): P3 => [...((rings[a] as [number, number][])[b] as [number, number]), stations[a] as number];
      loft.push([v(i, j), v(i, j + 1), v(i + 1, j + 1)], [v(i, j), v(i + 1, j + 1), v(i + 1, j)]);
    }
  }
  const offLoft = (p: P3): number => {
    let best = { d: Infinity, sign: 1 };
    for (const [a, b, c] of loft) {
      const r = signedToTriangle(p, a as P3, b as P3, c as P3);
      if (r.d < best.d) best = r;
    }
    return best.d * best.sign;
  };
  for (const kind of ['lner5', 'lner9', 'hull5', 'lumo5'] as const) {
    const cluster = frontOf(kind).cluster!;
    // the lowest layer, whose outline meets the nose: the rim where the kind has one, else the window
    const lowest = cluster.rim?.colour ?? cluster.window.colour;
    const g = buildTrain(kind);
    for (const car of trainLayout(kind).cars.filter((c) => c.cab)) {
      const face = car.cab === 'front' ? car.start : car.end;
      const mesh = g.getObjectByName(`car-${car.index}`)!.getObjectByName('body-detail') as THREE.Mesh;
      const p = mesh.geometry.getAttribute('position');
      const c = mesh.geometry.getAttribute('color');
      // nose frame: the right half, s back from the tip
      const nose = (k: number): P3 => [Math.abs(p.getX(k)), p.getY(k), (car.cab === 'front' ? p.getZ(k) - face : face - p.getZ(k)) - tip];
      const isColour = (k: number, hex: number): boolean => {
        const rgb = col(hex);
        return Math.abs(c.getX(k) - rgb.r) < 1e-4 && Math.abs(c.getY(k) - rgb.g) < 1e-4 && Math.abs(c.getZ(k) - rgb.b) < 1e-4;
      };
      for (const sign of [-1, 1]) {
        const here = `${kind} car ${car.index} ${sign > 0 ? 'right' : 'left'}`;
        // the layer's triangles on this side, on the nose (the colours are the housing's own there), and the edges only one of them uses: the outline
        const uses = new Map<string, { n: number; a: number; b: number }>();
        const key = (k: number): string => `${p.getX(k)},${p.getY(k)},${p.getZ(k)}`;
        let windowLift = -Infinity;
        for (let t = 0; t < p.count; t += 3) {
          if ([t, t + 1, t + 2].some((k) => p.getX(k) * sign <= 0 || (nose(k)[2] as number) > 3)) continue;
          if (isColour(t, cluster.window.colour)) windowLift = Math.max(windowLift, offLoft(nose(t)));
          if (!isColour(t, lowest)) continue;
          for (const [a, b] of [[t, t + 1], [t + 1, t + 2], [t + 2, t]] as const) {
            const e = [key(a), key(b)].sort().join('|');
            const u = uses.get(e) ?? { n: 0, a, b };
            u.n++;
            uses.set(e, u);
          }
        }
        const outline = [...uses.values()].filter((u) => u.n === 1).flatMap((u) => [u.a, u.b]);
        assert.ok(outline.length >= 80, `${here}: only ${outline.length} outline points`);
        // every point of the outline on the loft or just under it (CLUSTER_EDGE.foot), none standing out of it: the edge leaves no step and no gap
        const offs = outline.map((k) => offLoft(nose(k)));
        const worst = Math.max(...offs);
        assert.ok(worst <= 0.002, `${here}: the housing's outline stands ${(worst * 1000).toFixed(1)} mm off the nose`);
        assert.ok(Math.min(...offs) >= CLUSTER_EDGE.foot - 0.003, `${here}: the housing's outline sinks ${(-Math.min(...offs) * 1000).toFixed(1)} mm into the nose`);
        // and the window's middle still stands its lift over the loft, over the rim and the colour mask's band
        // RE-PINNED for the LNER (round B11; was CLUSTER_LIFT.window, 26 mm, as the others): side on the back of its housing lies on the nose's own outline, so its lift was the
        // outline pushed out (cab-side-3m, cab-car-side: the squared-off rear end proud of the nose with a pale spur), where lner-801-214-2025 shows the unit flush with the nose; the
        // LNER's window stands 8 mm (LNER_CLUSTER.lift), the same 2 mm either way
        const wantLift = kind === 'lner5' || kind === 'lner9' ? 0.008 : CLUSTER_LIFT.window;
        assert.ok(Math.abs(windowLift - wantLift) <= 0.002, `${here}: the window's middle stands ${(windowLift * 1000).toFixed(1)} mm off the nose`);
      }
    }
  }
});

test('the AT300 lamp housing\'s outline is the one drawn: inside it the layer that meets the nose stands clear of the nose\'s skin, its chords short enough not to dip into it, at both ends of all four kinds (round B5)', () => {
  // The fresh score of round B4 (hull5 T8 6.0 -> 5.5): the Hull Trains housing's grey rim had a jagged outline, a spike beside the white cluster, a notch at the lower corner and a
  // sawtooth inner edge (front-3m, rear-3m, nose-34-left, rear-nose-34-right), LUMO's the same more mildly, the LNER's a pale tail under each lamp unit; hull-802-doncaster-2024, LUMO-04
  // and LUMO-05 show a smooth outline flush with the body. The cause: the layer fell from its lift to the nose over 6 cm, so most of the 25 mm rim stood within 2 mm of the skin, and
  // its rows were 72 mm apart, so its chords across the shoulder dipped millimetres under the surface: the skin cut through it wherever the two crossed. So, more than 8 mm inside the
  // outline (the steep edge's fall), no point of the layer stands under 2 mm over the loft, and no edge of its grid that comes within 2 mm of the skin dips more than 1.5 mm under the line between its ends' heights.
  const tip = faceSetback('at300');
  const stations = ringStations(spec.nose).filter((s) => s < 3);
  const rings = stations.map(ringHalf);
  const loft: { t: THREE.Triangle; n: THREE.Vector3; box: THREE.Box3 }[] = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j + 1 < (rings[i] as [number, number][]).length; j++) {
      const v = (a: number, b: number): THREE.Vector3 => new THREE.Vector3(...((rings[a] as [number, number][])[b] as [number, number]), stations[a] as number);
      for (const [a, b, c] of [[v(i, j), v(i, j + 1), v(i + 1, j + 1)], [v(i, j), v(i + 1, j + 1), v(i + 1, j)]] as const) {
        const t = new THREE.Triangle(a, b, c);
        loft.push({ t, n: t.getNormal(new THREE.Vector3()), box: new THREE.Box3().setFromPoints([a, b, c]) });
      }
    }
  }
  const near = new THREE.Vector3();
  // signed distance over the loft (outward on the right half, as the rings wind)
  const offLoft = (q: THREE.Vector3): number => {
    let best = Infinity;
    let sign = 1;
    for (const f of loft) {
      if (f.box.distanceToPoint(q) > Math.min(best, 0.05)) continue;
      f.t.closestPointToPoint(q, near);
      const d = near.distanceTo(q);
      if (d < best) {
        best = d;
        sign = Math.sign(q.clone().sub(near).dot(f.n)) || 1;
      }
    }
    return best * sign;
  };
  for (const kind of ['lner5', 'lner9', 'hull5', 'lumo5'] as const) {
    const cluster = frontOf(kind).cluster!;
    const rgb = col(cluster.rim?.colour ?? cluster.window.colour);
    const g = buildTrain(kind);
    for (const car of trainLayout(kind).cars.filter((c) => c.cab)) {
      const face = car.cab === 'front' ? car.start : car.end;
      const mesh = g.getObjectByName(`car-${car.index}`)!.getObjectByName('body-detail') as THREE.Mesh;
      const p = mesh.geometry.getAttribute('position');
      const c = mesh.geometry.getAttribute('color');
      const nose = (k: number): THREE.Vector3 => new THREE.Vector3(Math.abs(p.getX(k)), p.getY(k), (car.cab === 'front' ? p.getZ(k) - face : face - p.getZ(k)) - tip);
      for (const sign of [-1, 1]) {
        const here = `${kind} car ${car.index} ${sign > 0 ? 'right' : 'left'}`;
        const tris: THREE.Vector3[][] = [];
        const uses = new Map<string, { n: number; a: THREE.Vector3; b: THREE.Vector3 }>();
        for (let t = 0; t < p.count; t += 3) {
          if ([t, t + 1, t + 2].some((k) => p.getX(k) * sign <= 0 || nose(k).z > 3)) continue;
          if (!(Math.abs(c.getX(t) - rgb.r) < 1e-4 && Math.abs(c.getY(t) - rgb.g) < 1e-4 && Math.abs(c.getZ(t) - rgb.b) < 1e-4)) continue;
          const v = [t, t + 1, t + 2].map(nose);
          tris.push(v);
          for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
            const ka = v[a]!.toArray().map((x) => x.toFixed(5)).join();
            const kb = v[b]!.toArray().map((x) => x.toFixed(5)).join();
            if (ka === kb) continue;
            const e = [ka, kb].sort().join('|');
            const u = uses.get(e) ?? { n: 0, a: v[a]!, b: v[b]! };
            u.n++;
            uses.set(e, u);
          }
        }
        const outline = [...uses.values()].filter((u) => u.n === 1).map((u) => new THREE.Line3(u.a, u.b));
        const onLine = new THREE.Vector3();
        const toOutline = (q: THREE.Vector3): number => Math.min(...outline.map((l) => l.closestPointToPoint(q, true, onLine).distanceTo(q)));
        let samples = 0;
        let low = 0;
        let dip = 0;
        for (const v of tris) {
          const off = v.map(offLoft);
          for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
            if (v[a]!.distanceTo(v[b]!) < 1e-6) continue;
            const mid = v[a]!.clone().add(v[b]!).multiplyScalar(0.5);
            // (only where the chord comes within 2 mm of the skin: at the full lift a sag of a few millimetres shows nothing)
            const m = offLoft(mid);
            if (m < 0.002) dip = Math.max(dip, (off[a]! + off[b]!) / 2 - m);
          }
          for (const [u, w] of [[1 / 3, 1 / 3], [0.5, 0], [0, 0.5], [0.5, 0.5]] as const) {
            const q = v[0]!.clone().multiplyScalar(1 - u - w).addScaledVector(v[1]!, u).addScaledVector(v[2]!, w);
            if (toOutline(q) < 0.008) continue;
            samples++;
            if (offLoft(q) < 0.002) low++;
          }
        }
        assert.ok(samples > 400, `${here}: only ${samples} points inside the outline`);
        assert.ok(low / samples < 0.01, `${here}: ${low} of ${samples} points more than 8 mm inside the housing's outline stand under 2 mm over the nose`);
        assert.ok(dip <= 0.0015, `${here}: an edge of the housing's grid dips ${(dip * 1000).toFixed(1)} mm into the nose's curve`);
      }
    }
  }
  assert.ok(CLUSTER_ROW <= 0.02, 'the housing\'s rows stay close enough for their chords to follow the shoulder');
});

/** The four AT300 kinds' cab cars, each with its geometry in the nose's frame (x across, y up, s back from the tip): `at` maps a vertex of a mesh of that car to it. */
function at300Cabs(): { here: string; kind: TrainKind; glass: THREE.Mesh; detail: THREE.Mesh; at: (p: THREE.BufferAttribute, k: number) => THREE.Vector3 }[] {
  const tip = faceSetback('at300');
  return (['lner5', 'lner9', 'hull5', 'lumo5'] as const).flatMap((kind) => {
    const g = buildTrain(kind);
    return trainLayout(kind).cars.filter((c) => c.cab).map((car) => {
      const face = car.cab === 'front' ? car.start : car.end;
      const group = g.getObjectByName(`car-${car.index}`)!;
      return {
        here: `${kind} car ${car.index}`,
        kind,
        glass: group.getObjectByName('cab-glass') as THREE.Mesh,
        detail: group.getObjectByName('body-detail') as THREE.Mesh,
        at: (p: THREE.BufferAttribute, k: number) => new THREE.Vector3(p.getX(k), p.getY(k), (car.cab === 'front' ? p.getZ(k) - face : face - p.getZ(k)) - tip),
      };
    });
  });
}

/** The triangles of a mesh, in the nose's frame, that `keep` passes (it sees the three vertex indices). */
function trianglesOf(mesh: THREE.Mesh, at: (p: THREE.BufferAttribute, k: number) => THREE.Vector3, keep: (ids: number[]) => boolean): THREE.Vector3[][] {
  const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = mesh.geometry.index;
  const n = index ? index.count : p.count;
  const out: THREE.Vector3[][] = [];
  for (let t = 0; t < n; t += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
    if (keep(ids)) out.push(ids.map((k) => at(p, k)));
  }
  return out;
}

/** The windscreen's glass (the cab-glass mesh, less the side windows, which face sideways) and its black frame (the livery's glass colour in the detail mesh, on the nose's roof). */
function screenParts(cab: ReturnType<typeof at300Cabs>[number]): { glass: THREE.Vector3[][]; frame: THREE.Vector3[][] } {
  const gn = cab.glass.geometry.getAttribute('normal');
  const glass = trianglesOf(cab.glass, cab.at, (ids) => ids.every((k) => Math.abs(gn.getX(k)) < 0.7 && (cab.glass.geometry.getAttribute('position') as THREE.BufferAttribute).getY(k) > 1.9));
  const rgb = col(LIVERIES[trainLayout(cab.kind).spec.livery].glass);
  const c = cab.detail.geometry.getAttribute('color');
  const p = cab.detail.geometry.getAttribute('position') as THREE.BufferAttribute;
  const frame = trianglesOf(cab.detail, cab.at, (ids) =>
    ids.every((k) => Math.abs(c.getX(k) - rgb.r) < 1e-5 && Math.abs(c.getY(k) - rgb.g) < 1e-5 && Math.abs(c.getZ(k) - rgb.b) < 1e-5 && p.getY(k) > 1.9 && Math.abs(p.getX(k)) < 1.1 && cab.at(p, k).z < 3));
  return { glass, frame };
}

/** How far across (2 |x|) the triangles reach where they cross the height y: the widest crossing of that level by a triangle's edge. */
function acrossAt(tris: THREE.Vector3[][], y: number): number {
  let m = 0;
  for (const t of tris) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const p = t[a]!;
      const q = t[b]!;
      if ((p.y - y) * (q.y - y) > 0 || p.y === q.y) continue;
      m = Math.max(m, Math.abs(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x)));
    }
  }
  return 2 * m;
}

test('head on, the AT300 windscreen spans most of the cab: the glass about 0.58 of the body\'s width from its foot to its top, in a black frame about 0.65, at both ends of all four kinds (round B6)', () => {
  // The fresh score of round B5 (T2 held, all four kinds): head on (front-3m, rear-3m) the glass spanned about 55% of the face with its frame (0.47 of the body's width, the glass alone), where
  // lner-800-113-newcastle-2025, hull-802-doncaster-2024 and LUMO-06-803005-FPK show it across most of the cab. Read off lner-800-113-newcastle-2025, head on (a 1.74x crop of the face,
  // 2.7 m of body, its widest at the glass's middle height, about 520 px across): the glass 300 px across 0.15 m over its foot (0.58), 300 px at its middle (0.58), 290 px 0.15 m under its
  // top (0.56), the black frame round it 340 px (0.65); the glass 200 px tall head on (1.04 m). LUMO-06-803005-FPK, a little off the axis, reads 0.6 to 0.7: the band allows for those readings' spread (about 20 px).
  const body = 2 * spec.half;
  for (const cab of at300Cabs()) {
    const { glass, frame } = screenParts(cab);
    assert.ok(glass.length > 500 && frame.length > 500, `${cab.here}: ${glass.length} glass and ${frame.length} frame triangles`);
    const ys = glass.flat().map((v) => v.y);
    const foot = Math.min(...ys);
    const top = Math.max(...ys);
    const mid = (foot + top) / 2;
    const ratio = (tris: THREE.Vector3[][], y: number): number => acrossAt(tris, y) / body;
    for (const [what, y, lo, hi] of [['0.15 m over its foot', foot + 0.15, 0.54, 0.62], ['at its middle', mid, 0.55, 0.62], ['0.15 m under its top', top - 0.15, 0.52, 0.6]] as const) {
      const r = ratio(glass, y);
      assert.ok(r >= lo && r <= hi, `${cab.here}: the glass ${what} spans ${r.toFixed(3)} of the body's width, the photograph ${lo} to ${hi}`);
    }
    const f = ratio(frame, mid);
    assert.ok(f >= 0.6 && f <= 0.7, `${cab.here}: the frame spans ${f.toFixed(3)} of the body's width at the glass's middle`);
    // c522cb3d's rake and set-back stay: the glass's height head on (the photograph's 1.04 m) and its foot's height (2.0 to 2.2 m, the nose test above)
    assert.ok(top - foot >= 0.9 && top - foot <= 1.1, `${cab.here}: the glass stands ${(top - foot).toFixed(2)} m tall head on`);
    assert.ok(foot >= 2.0 && foot <= 2.2, `${cab.here}: the glass's foot is ${foot.toFixed(2)} m up`);
  }
});

test('the widened AT300 windscreen lies on the nose: its frame runs at least 3 cm past the glass all round, neither stands proud of the shell nor sinks into it, and the lamp housings stay clear of both (round B6)', () => {
  // the nose's loft, as the housing tests above build it, for the signed distance of a point off the skin (outward on the right half; the left half is mirrored onto it)
  const stations = ringStations(spec.nose).filter((s) => s < 3);
  const rings = stations.map(ringHalf);
  const loft: { t: THREE.Triangle; n: THREE.Vector3; box: THREE.Box3 }[] = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j + 1 < (rings[i] as [number, number][]).length; j++) {
      const v = (a: number, b: number): THREE.Vector3 => new THREE.Vector3(...((rings[a] as [number, number][])[b] as [number, number]), stations[a] as number);
      for (const [a, b, c] of [[v(i, j), v(i, j + 1), v(i + 1, j + 1)], [v(i, j), v(i + 1, j + 1), v(i + 1, j)]] as const) {
        const t = new THREE.Triangle(a, b, c);
        loft.push({ t, n: t.getNormal(new THREE.Vector3()), box: new THREE.Box3().setFromPoints([a, b, c]) });
      }
    }
  }
  const near = new THREE.Vector3();
  const offLoft = (q0: THREE.Vector3): number => {
    const q = new THREE.Vector3(Math.abs(q0.x), q0.y, q0.z);
    let best = Infinity;
    let sign = 1;
    for (const f of loft) {
      if (f.box.distanceToPoint(q) > Math.min(best, 0.05)) continue;
      f.t.closestPointToPoint(q, near);
      const d = near.distanceTo(q);
      if (d < best) {
        best = d;
        sign = Math.sign(q.clone().sub(near).dot(f.n)) || 1;
      }
    }
    return best * sign;
  };
  // (x, s) inside one of the triangles, projected on the nose's plan (x across, s back)
  const inPlan = (tris: THREE.Vector3[][], x: number, s: number): boolean => tris.some(([a, b, c]) => {
    const d = (p: THREE.Vector3, q: THREE.Vector3): number => (q.x - p.x) * (s - p.z) - (q.z - p.z) * (x - p.x);
    const d1 = d(a!, b!);
    const d2 = d(b!, c!);
    const d3 = d(c!, a!);
    return (d1 >= -1e-9 && d2 >= -1e-9 && d3 >= -1e-9) || (d1 <= 1e-9 && d2 <= 1e-9 && d3 <= 1e-9);
  });
  for (const cab of at300Cabs()) {
    const { glass, frame } = screenParts(cab);
    // no see-through edge: every point of the glass, moved 3 cm out, back or forward, still lies over the frame's black (the frame is 7 cm wider all round, FrontSpec.frame)
    const gaps = glass.flat().filter((v) => !inPlan(frame, Math.sign(v.x) * (Math.abs(v.x) + 0.03), v.z) || !inPlan(frame, v.x, v.z - 0.03) || !inPlan(frame, v.x, v.z + 0.03));
    assert.equal(gaps.length, 0, `${cab.here}: ${gaps.length} points of the glass's edge lie within 3 cm of the frame's, e.g. ${gaps[0]?.toArray().map((x) => x.toFixed(3))}`);
    // nothing proud of the shell, nothing under it: the frame lies 14 mm off the nose and the glass 20 mm (their lifts), each to within the facets' sag (about 6 mm on the steep shoulder)
    for (const [what, tris, lift] of [['frame', frame, 0.014], ['glass', glass, 0.02]] as const) {
      const offs = tris.flat().filter((_, k) => k % 3 === 0).map(offLoft);
      const lo = Math.min(...offs);
      const hi = Math.max(...offs);
      assert.ok(lo >= lift - 0.006, `${cab.here}: the ${what} sinks to ${(lo * 1000).toFixed(1)} mm off the nose (its lift ${lift * 1000} mm)`);
      assert.ok(hi <= lift + 0.006, `${cab.here}: the ${what} stands ${(hi * 1000).toFixed(1)} mm off the nose (its lift ${lift * 1000} mm)`);
    }
    // the housings (their window and rim) do not reach onto the frame: no vertex of them lies over the frame's plan or within 2 cm of its edge there (built: 57 mm clear at the frame's
    // lower outer corner; lner-800-113-newcastle-2025 shows each housing tucked under the screen's outer corner, its inboard edge in line with the glass's, its top at the frame's foot)
    const cluster = frontOf(cab.kind).cluster!;
    const colours = [cluster.window.colour, ...(cluster.rim ? [cluster.rim.colour] : [])].map(col);
    const c = cab.detail.geometry.getAttribute('color');
    const housing = trianglesOf(cab.detail, cab.at, (ids) => ids.every((k) => colours.some((rgb) => Math.abs(c.getX(k) - rgb.r) < 1e-4 && Math.abs(c.getY(k) - rgb.g) < 1e-4 && Math.abs(c.getZ(k) - rgb.b) < 1e-4)))
      .filter((t) => t.every((v) => v.z < 3 && v.z > 0.2));
    assert.ok(housing.length > 200, `${cab.here}: ${housing.length} housing triangles`);
    const over = housing.flat().filter((v) => inPlan(frame, v.x, v.z));
    assert.equal(over.length, 0, `${cab.here}: ${over.length} points of the lamp housings lie over the windscreen's frame, e.g. ${over[0]?.toArray().map((x) => x.toFixed(3))}`);
    const toSegment = (x: number, s: number, p: THREE.Vector3, q: THREE.Vector3): number => {
      const dx = q.x - p.x;
      const ds = q.z - p.z;
      const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (s - p.z) * ds) / (dx * dx + ds * ds || 1)));
      return Math.hypot(x - p.x - t * dx, s - p.z - t * ds);
    };
    const clear = Math.min(...housing.flat().map((v) => Math.min(...frame.map((t) => Math.min(toSegment(v.x, v.z, t[0]!, t[1]!), toSegment(v.x, v.z, t[1]!, t[2]!), toSegment(v.x, v.z, t[2]!, t[0]!))))));
    assert.ok(clear >= 0.02, `${cab.here}: the lamp housings come within ${(clear * 1000).toFixed(0)} mm of the windscreen's frame, in plan`);
  }
});

test('the LNER yellow\'s top meets the windscreen frame\'s foot: at the yellow\'s upper corner the frame reaches no further out than the yellow, and no yellow lies on the glass; the Hull Trains beak the same (round B7)', () => {
  // The B6 score (lner5/lner9 front-3m, rear-3m, nose-34-right): the frame's lower corners stood about 25 px (0.15 m) past the yellow each side, black "ears" over the white, where
  // lner-800-113-newcastle-2025 and lner-801-214-2025 show the yellow's top edge flush with the frame's foot. Built: within 1 cm (LNER_MASK). hull5's grey beak had the same overhang; B7's narrower glass foot leaves it flush too
  // at its own 0.8 m (HULL_MASK, unchanged), so it is held the same way.
  for (const cab of at300Cabs().filter((c) => c.kind !== 'lumo5')) {
    const { glass, frame } = screenParts(cab);
    const rgb = col(cab.kind === 'hull5' ? HULL_BEAK : LNER_YELLOW);
    const c = cab.detail.geometry.getAttribute('color');
    const mask = trianglesOf(cab.detail, cab.at, (ids) => ids.every((k) => Math.abs(c.getX(k) - rgb.r) < 1e-5 && Math.abs(c.getY(k) - rgb.g) < 1e-5 && Math.abs(c.getZ(k) - rgb.b) < 1e-5));
    const pts = mask.flat();
    const half = Math.max(...pts.map((v) => Math.abs(v.x)));
    // the top of the mask's outer corner, head on: its highest point within 1 cm of its widest
    const top = Math.max(...pts.filter((v) => Math.abs(v.x) > half - 0.01).map((v) => v.y));
    const frameHalf = acrossAt(frame, top) / 2;
    assert.ok(Math.abs(frameHalf - half) <= 0.02, `${cab.here}: at the mask's upper corner (${top.toFixed(3)} m up) the frame is ${frameHalf.toFixed(3)} m out and the mask ${half.toFixed(3)} m`);
    const above = acrossAt(frame, top + 0.02) / 2;
    assert.ok(above <= half + 0.03, `${cab.here}: 2 cm over the mask's corner the frame is ${above.toFixed(3)} m out, past the mask's ${half.toFixed(3)} m: a black ear`);
    // and the mask does not climb onto the glass: no point of it lies over the glass's plan (x across, s back)
    const onGlass = pts.filter((v) => glass.some(([a, b, d]) => {
      const e = (p: THREE.Vector3, q: THREE.Vector3): number => (q.x - p.x) * (v.z - p.z) - (q.z - p.z) * (v.x - p.x);
      const [e1, e2, e3] = [e(a!, b!), e(b!, d!), e(d!, a!)];
      return (e1 > 1e-9 && e2 > 1e-9 && e3 > 1e-9) || (e1 < -1e-9 && e2 < -1e-9 && e3 < -1e-9);
    }));
    assert.equal(onGlass.length, 0, `${cab.here}: ${onGlass.length} points of the mask lie over the glass, e.g. ${onGlass[0]?.toArray().map((x) => x.toFixed(3))}`);
  }
});

test('at 3/4 the AT300 windscreen keeps its frame and a body margin on the far side: over the glass\'s lower 40% the frame stands inside the nose\'s outline and the glass inside the frame, at both ends of all four kinds (round B7)', () => {
  // The B6 score (nose-34-left/right, rear-nose-34-left/right, all four kinds): the glass's lower outer corner reached the outline, the frame and the body-coloured margin on that edge gone,
  // where LUMO-06-803005-FPK and lner-801-214-2025 keep a thin body margin beyond the frame. The camera is the close-up pack's nose-34 (ASSUMED to stand for the scorer's): 6 m out and
  // 6 m ahead of the tip, 2.5 m up, a 45 degree lens, looking at 1.9 m up 1.2 m back; distances on its screen in pixels of a 700 px frame. Built (lner5): the frame at least 1.0 px inside
  // the outline over that part of the glass, the glass 1.4 px inside the frame; B6's stood 0.6 px past the outline.
  const stations = [...ringStations(spec.nose).filter((s) => s < 3.5), 4, 5, 6];
  const rings = stations.map(ringHalf);
  for (const side of [1, -1]) {
    const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    cam.position.set(6 * side, 2.5, -6);
    cam.lookAt(0, 1.9, 1.2);
    cam.updateMatrixWorld();
    // (on the screen, x measured toward the far side: the side the camera is not on)
    const toScreen = (tris: THREE.Vector3[][]): THREE.Vector3[][] => tris.map((t) => t.map((v) => {
      const q = v.clone().project(cam);
      q.x *= side;
      return q;
    }));
    const loft: THREE.Vector3[][] = [];
    for (let i = 0; i + 1 < rings.length; i++) {
      for (let j = 0; j + 1 < (rings[i] as [number, number][]).length; j++) {
        for (const sx of [-1, 1]) {
          const v = (a: number, b: number): THREE.Vector3 => new THREE.Vector3(sx * ((rings[a] as [number, number][])[b] as [number, number])[0], ((rings[a] as [number, number][])[b] as [number, number])[1], stations[a] as number);
          loft.push([v(i, j), v(i, j + 1), v(i + 1, j + 1)], [v(i, j), v(i + 1, j + 1), v(i + 1, j)]);
        }
      }
    }
    const outline = toScreen(loft);
    // the furthest a set of triangles reaches toward the far side where it crosses the screen height y
    const farAt = (tris: THREE.Vector3[][], y: number): number => {
      let m = -Infinity;
      for (const t of tris) {
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
          const p = t[a]!;
          const q = t[b]!;
          if ((p.y - y) * (q.y - y) > 0 || p.y === q.y) continue;
          m = Math.max(m, p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x));
        }
      }
      return m;
    };
    const px = 350;
    for (const cab of at300Cabs()) {
      const { glass, frame } = screenParts(cab);
      const g = toScreen(glass);
      const f = toScreen(frame);
      const ys = g.flat().map((v) => v.y);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      for (let k = 1; k <= 16; k++) {
        const y = y0 + ((y1 - y0) * k) / 40;
        const body = (farAt(outline, y) - farAt(f, y)) * px;
        const rim = (farAt(f, y) - farAt(g, y)) * px;
        assert.ok(body >= 0.8, `${cab.here}, camera on the ${side > 0 ? 'right' : 'left'}: ${k}/40 up the glass the frame stands ${body.toFixed(2)} px inside the outline`);
        assert.ok(rim >= 1.2, `${cab.here}, camera on the ${side > 0 ? 'right' : 'left'}: ${k}/40 up the glass the glass stands ${rim.toFixed(2)} px inside the frame`);
      }
    }
  }
});

test('head on, the AT300 windscreen\'s sides are near parallel: the glass 1.04 to 1.14 times as wide 0.15 m under its top as 0.15 m over its foot, at both ends of all four kinds (round B7)', () => {
  // The B6 score (front-3m, all four kinds): the glass read 0.82 as wide at its top as at its foot, lner-800-113-newcastle-2025 about 0.96 (a long lens from the platform end; near-parallel
  // sides, a rounded top). The 3 m camera's perspective shrinks the top against the foot: B5's glass, built 1.08 here, read 0.91 and B6's, built 0.95, read 0.82 (about 0.85 of the built
  // ratio, an inference from those two scores). The band is the photograph's 0.96 over that factor, 1.13, less the room B6's width bands leave (the top no wider than 0.6 of the body, the
  // foot no narrower than 0.54): about 0.89 to 0.97 at 3 m. Built 1.09.
  for (const cab of at300Cabs()) {
    const { glass } = screenParts(cab);
    const ys = glass.flat().map((v) => v.y);
    const foot = Math.min(...ys);
    const top = Math.max(...ys);
    const r = acrossAt(glass, top - 0.15) / acrossAt(glass, foot + 0.15);
    assert.ok(r >= 1.04 && r <= 1.14, `${cab.here}: the glass is ${r.toFixed(3)} times as wide 0.15 m under its top as 0.15 m over its foot`);
  }
});

test('in front-3m the LNER yellow has no waist: its edge never steps in by more than 2 px (about 1 cm) above a wider part below, from the chin up to the frame\'s foot, at both ends (round B7b)', () => {
  // The B7 score (lner5/lner9 front-3m, rear-3m, the lights views): B7's flared band read as a bottle, frame-foot wide at the top, a waist about 10% narrower under it (347 px against
  // 393 to 407 at the top and 379 lower down), wider again on the face. lner-800-113-newcastle-2025 shows the yellow about the same width from the screen's foot down past the lamps,
  // narrowing smoothly into the beak below. The camera is the rubric's V02 (rubric-FROZEN-v1: 3 m ahead of the tip, 1.7 m up, looking straight back, a 50 degree lens); widths on its
  // screen in pixels of a 700 px frame (1 cm of yellow 4 m off is about 2 px). B7's band narrowed 11.7 px under the frame; built, 0.4 px (the face's own facets).
  const tip = faceSetback('at300');
  const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  cam.position.set(0, 1.7, -3 - tip);
  cam.lookAt(0, 1.7, -tip);
  cam.updateMatrixWorld();
  for (const cab of at300Cabs().filter((c) => c.kind === 'lner5' || c.kind === 'lner9')) {
    const rgb = col(LNER_YELLOW);
    const c = cab.detail.geometry.getAttribute('color');
    const toScreen = (tris: THREE.Vector3[][]): THREE.Vector3[][] => tris.map((t) => t.map((v) => v.clone().project(cam)));
    const yellow = toScreen(trianglesOf(cab.detail, cab.at, (ids) => ids.every((k) => Math.abs(c.getX(k) - rgb.r) < 1e-5 && Math.abs(c.getY(k) - rgb.g) < 1e-5 && Math.abs(c.getZ(k) - rgb.b) < 1e-5)));
    const frame = toScreen(screenParts(cab).frame);
    const y0 = Math.min(...yellow.flat().map((v) => v.y));
    const y1 = Math.min(...frame.flat().map((v) => v.y));
    let widest = 0;
    let waist = 0;
    let at = 0;
    for (let k = 2; k < 120; k++) {
      const y = y0 + ((y1 - y0) * k) / 120;
      const w = (acrossAt(yellow, y) / 2) * 350;
      if (widest - w > waist) {
        waist = widest - w;
        at = k;
      }
      widest = Math.max(widest, w);
    }
    assert.ok(widest > 100, `${cab.here}: the yellow is ${widest.toFixed(0)} px across at its widest`);
    assert.ok(waist <= 2, `${cab.here}: ${at}/120 of the way up from the chin to the frame's foot the yellow's edge stands ${waist.toFixed(1)} px inside a wider part below it`);
  }
});

/** How far in (the least |x|) the triangles reach where they cross the height y. */
function innerAt(tris: THREE.Vector3[][], y: number): number {
  let m = Infinity;
  for (const t of tris) {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) {
      const p = t[a]!;
      const q = t[b]!;
      if ((p.y - y) * (q.y - y) > 0 || p.y === q.y) continue;
      m = Math.min(m, Math.abs(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x)));
    }
  }
  return m;
}

test('head on, the LNER lamp units sit on the yellow\'s upper corners: from 1.65 to 1.95 m up each housing\'s inner edge lies on the yellow\'s edge, and the yellow is fuller under the frame than a straight band, at both ends (round B8)', () => {
  // The B7b score (lner5/lner9 front-3m, rear-3m, lights): head on the yellow stayed about 0.62 of the body and the lamp units sat as slivers on the outline, 0.1 to 0.3 m of white from
  // the yellow. lner-800-113-newcastle-2025 head on (109 px to the metre, from the frame's foot, 86 px either side of the middle = 0.79 m): the yellow's edge 83 px out under the frame,
  // 78 px at the lamp unit's middle and 73 px at its foot (0.94 and 0.88 of its top); the unit's inner edge 85 px out, a 2 px white line off the yellow, from its foot to the frame's foot.
  // Built: the rim's inner edge meets the yellow's at 1.65 m and lies over its corner above, by up to 4 cm at 1.95 m (the unit on the yellow's upper corner). The yellow is held as full as the B7b waist allows: 0.76 of its top at
  // 1.6 m and 0.86 at 1.8 m (straight, 0.745 and 0.84), short of the photograph's because front-3m's perspective makes any fuller band a bottle.
  for (const cab of at300Cabs().filter((c) => c.kind === 'lner5' || c.kind === 'lner9')) {
    const c = cab.detail.geometry.getAttribute('color');
    const p = cab.detail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ofColour = (hex: number): THREE.Vector3[][] => {
      const rgb = col(hex);
      return trianglesOf(cab.detail, cab.at, (ids) => ids.every((k) => Math.abs(c.getX(k) - rgb.r) < 1e-5 && Math.abs(c.getY(k) - rgb.g) < 1e-5 && Math.abs(c.getZ(k) - rgb.b) < 1e-5 && cab.at(p, k).z < 3));
    };
    const yellow = ofColour(LNER_YELLOW);
    const cluster = frontOf(cab.kind).cluster!;
    const rim = ofColour(cluster.rim!.colour);
    const glass = ofColour(cluster.window.colour);
    assert.ok(rim.length > 200 && glass.length > 200, `${cab.here}: ${rim.length} rim and ${glass.length} window triangles`);
    for (let y = 1.65; y <= 1.951; y += 0.05) {
      const edge = acrossAt(yellow, y) / 2;
      const inner = innerAt(rim, y);
      assert.ok(inner - edge <= 0.02 && inner - edge >= -0.05, `${cab.here}: ${y.toFixed(2)} m up the housing's inner edge is ${inner.toFixed(3)} m out, the yellow's ${edge.toFixed(3)} m`);
      // and the unit reads as a lamp unit, not a sliver: its dark glass at least 0.2 m across head on there
      const across = acrossAt(glass, y) / 2 - innerAt(glass, y);
      assert.ok(across >= 0.2, `${cab.here}: ${y.toFixed(2)} m up the housing's glass is ${across.toFixed(3)} m across head on`);
    }
    const top = acrossAt(yellow, 2.1) / 2;
    for (const [y, least] of [[1.6, 0.75], [1.8, 0.85]] as const) {
      const r = acrossAt(yellow, y) / 2 / top;
      assert.ok(r >= least, `${cab.here}: ${y} m up the yellow is ${r.toFixed(3)} of its width at the frame's foot, the photograph's ${y === 1.6 ? 0.88 : 0.94}`);
    }
  }
});

test('head on, the LNER lamp unit meets the yellow all the way down: from its foot to 1.65 m up no more than 2.5 cm of red between the yellow\'s edge and the housing, at both ends (round B10)', () => {
  // The B9b score (front-3m, through V02): below about 1.65 m a strip of the face's red between the yellow's edge and the unit's front edge, widening to 9-11 cm at the unit's foot.
  // Measured on B9b: the yellow's edge 0.577 m out at 1.55 m and 0.608 m at 1.65 m, the rim's inner edge 0.674 and 0.614 m (9.7 cm of red at the foot): the straight front edge from 0.225 m
  // back at the foot leans outboard of the yellow below 1.65 m, where the nose rounds over. lner-800-113-newcastle-2025 head on: the yellow meets the unit closely from its foot to the frame
  // (a 2 px white line at 109 px to the metre). Built (B10): the front edge bends in to 0.175 m back at its foot (LNER_CLUSTER.window.frontFoot), at most 1.5 cm of red.
  for (const cab of at300Cabs().filter((c) => c.kind === 'lner5' || c.kind === 'lner9')) {
    const c = cab.detail.geometry.getAttribute('color');
    const p = cab.detail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const ofColour = (hex: number): THREE.Vector3[][] => {
      const rgb = col(hex);
      return trianglesOf(cab.detail, cab.at, (ids) => ids.every((k) => Math.abs(c.getX(k) - rgb.r) < 1e-5 && Math.abs(c.getY(k) - rgb.g) < 1e-5 && Math.abs(c.getZ(k) - rgb.b) < 1e-5 && cab.at(p, k).z < 3));
    };
    const yellow = ofColour(LNER_YELLOW);
    const cluster = frontOf(cab.kind).cluster!;
    const unit = [...ofColour(cluster.rim!.colour), ...ofColour(cluster.window.colour)];
    for (let y = cluster.window.y0 + 0.005; y <= 1.6501; y += 0.01) {
      const red = innerAt(unit, y) - acrossAt(yellow, y) / 2;
      assert.ok(red <= 0.025 && red >= -0.05, `${cab.here}: ${y.toFixed(3)} m up ${(red * 100).toFixed(1)} cm of red between the yellow's edge and the housing's inner edge`);
    }
  }
});

test('head on through V02, the LNER lamp unit is dark glass with a fine rim: the pale rim no more than 3 cm inboard and 2 cm under the glass, the glass no taller than 0.5 m, at both ends (round B9)', () => {
  // The B8 score (lner5 front-3m, about 225 px to the metre): the dark glass 0.6 m tall, the grey rim 7-10 cm inboard and 4 cm under it, butting onto the yellow. lner-800-113-newcastle-2025,
  // lner-800-doncaster-2026 and lner-801-214-2025 show the glass running almost to the yellow, only a thin light line between. Read off lner-800-113-newcastle-2025 at normal size (about 117 px
  // to the metre over the 2.74 m body): each unit about 45 px across and 55-60 px tall, so 1.2 to 1.3 times as tall as wide; at the 0.38 m the score reads, 0.5 m tall at most.
  // The camera is the rubric's V02 (3 m ahead of the tip, 1.7 m up, a 50 degree lens). A width on its screen is turned to metres at the depth it is seen at. Built (B9): the inboard rim
  // 2.7 cm at most (8/40 up, at the front edge: 2 cm was the aim, not reached), the rim under the glass 1.9 cm, the glass 0.47 m tall; B8's inboard rim 9.6 cm.
  const tip = faceSetback('at300');
  const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  cam.position.set(0, 1.7, -3 - tip);
  cam.lookAt(0, 1.7, -tip);
  cam.updateMatrixWorld();
  const k = Math.tan((25 * Math.PI) / 180);
  for (const cab of at300Cabs().filter((c) => c.kind === 'lner5' || c.kind === 'lner9')) {
    const c = cab.detail.geometry.getAttribute('color');
    const p = cab.detail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cluster = frontOf(cab.kind).cluster!;
    // the right-hand unit's triangles of one colour, on the screen (x, y in NDC) with each vertex's depth in z
    const onScreen = (hex: number): THREE.Vector3[][] => {
      const rgb = col(hex);
      return trianglesOf(cab.detail, cab.at, (ids) => ids.every((i) => Math.abs(c.getX(i) - rgb.r) < 1e-5 && Math.abs(c.getY(i) - rgb.g) < 1e-5 && Math.abs(c.getZ(i) - rgb.b) < 1e-5 && cab.at(p, i).z < 3 && cab.at(p, i).x > 0)).map((t) =>
        t.map((v) => {
          const s = v.clone().project(cam);
          return new THREE.Vector3(s.x, s.y, v.z - cam.position.z);
        }),
      );
    };
    const glass = onScreen(cluster.window.colour);
    const rim = onScreen(cluster.rim!.colour);
    assert.ok(glass.length > 100 && rim.length > 50, `${cab.here}: ${glass.length} window and ${rim.length} rim triangles`);
    const depth = glass.flat().reduce((a, v) => a + v.z, 0) / glass.flat().length;
    const metres = (ndc: number): number => ndc * k * depth;
    const ys = glass.flat().map((v) => v.y);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    // (from a tenth of the way up to a tenth from the top: at the corners a row runs along the slanted foot or the stop, not across the rim)
    let widest = 0;
    let at = 0;
    for (let q = 4; q <= 36; q++) {
      const y = lo + ((hi - lo) * q) / 40;
      const inboard = metres(innerAt(glass, y) - innerAt(rim, y));
      if (inboard > widest) [widest, at] = [inboard, q];
    }
    assert.ok(widest <= 0.03, `${cab.here}: head on, ${at}/40 up the glass, the rim stands ${(widest * 100).toFixed(1)} cm inboard of it`);
    const under = metres(lo - Math.min(...rim.flat().map((v) => v.y)));
    assert.ok(under <= 0.02, `${cab.here}: head on the rim stands ${(under * 100).toFixed(1)} cm under the glass`);
    const tall = metres(hi - lo);
    assert.ok(tall <= 0.5, `${cab.here}: head on the glass is ${tall.toFixed(2)} m tall`);
  }
});

/**
 * A cab car drawn into a 1600x1000 coverage buffer through `project` (a point to its pixel and its depth, or null behind the eye). Per pixel: `near`, what is nearest of all (the index
 * into `housing` of the housing colour, -1 anything else of the car, -2 nothing); `hull`, the nearest housing part alone; and `other`, whether anything but the housing covers it.
 */
function drawCab(group: THREE.Object3D, housing: THREE.Color[], project: (q: THREE.Vector3) => [number, number, number] | null): { near: Int8Array; hull: Int8Array; other: Uint8Array } {
  const W = 1600;
  const H = 1000;
  const other = new Uint8Array(W * H);
  const near = new Int8Array(W * H).fill(-2);
  const hull = new Int8Array(W * H).fill(-2);
  const depth = new Float32Array(W * H).fill(Infinity);
  const hullDepth = new Float32Array(W * H).fill(Infinity);
  const v = new THREE.Vector3();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const p = m.geometry.getAttribute('position');
    const c = m.name === 'body-detail' ? m.geometry.getAttribute('color') : undefined;
    const index = m.geometry.index;
    const n = index ? index.count : p.count;
    for (let t = 0; t < n; t += 3) {
      const ks = [t, t + 1, t + 2].map((k) => (index ? index.getX(k) : k));
      const k0 = ks[0] as number;
      const part = c ? housing.findIndex((h) => Math.abs(c.getX(k0) - h.r) < 1e-4 && Math.abs(c.getY(k0) - h.g) < 1e-4 && Math.abs(c.getZ(k0) - h.b) < 1e-4) : -1;
      const pts = ks.map((k) => project(v.fromBufferAttribute(p, k).applyMatrix4(m.matrixWorld)));
      if (pts.some((q) => !q)) continue;
      const [a, b, e] = pts as [number, number, number][];
      const area = (b[0] - a[0]) * (e[1] - a[1]) - (e[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) < 1e-12) continue;
      for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1], e[1]))); y <= Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], e[1]))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0], e[0]))); x <= Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], e[0]))); x++) {
          const w0 = ((b[0] - x - 0.5) * (e[1] - y - 0.5) - (e[0] - x - 0.5) * (b[1] - y - 0.5)) / area;
          const w1 = ((e[0] - x - 0.5) * (a[1] - y - 0.5) - (a[0] - x - 0.5) * (e[1] - y - 0.5)) / area;
          if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
          const i = y * W + x;
          const z = w0 * a[2] + w1 * b[2] + (1 - w0 - w1) * e[2];
          if (z < depth[i]!) {
            depth[i] = z;
            near[i] = part;
          }
          if (part < 0) other[i] = 1;
          else if (z < hullDepth[i]!) {
            hullDepth[i] = z;
            hull[i] = part;
          }
        }
      }
    }
  });
  return { near, hull, other };
}

test('side on from cab-side-3m, the LNER lamp housing lies flush with the nose: its squared-off rear end adds at most a few pixels to the nose\'s outline and no pale spur, at both ends (round B11)', () => {
  // The B10 score (cab-side-3m and cab-car-side, both ends): the rear end of the housing stood proud of the nose's outline and ended in a pale grey spur, where lner-801-214-2025 shows
  // the unit flush with the nose. The housing's back half lies on the flank's own outline seen from there, so its lift pushed the outline out: 505 px of housing past the nose, up to
  // 14 a row across, 14 of them the pale rim (26 mm of window, 14 mm of rim). Here the cab car is drawn from the cab-side-3m eye (3 m off the body side, 1.85 m up, over the leading
  // bogie; 65 degrees over 1000 px): a pixel is past the outline where the housing (its rim, window, disc or lenses) covers it and nothing else of the car does. Each millimetre of
  // lift there is about half a pixel across a row.
  const W = 1600;
  const f = 500 / Math.tan((32.5 * Math.PI) / 180);
  for (const kind of ['lner5', 'lner9'] as const) {
    const cluster = frontOf(kind).cluster!;
    const housing = [cluster.window.colour, cluster.rim!.colour, CLUSTER_ARRAY, ...Object.values(LENS)].map(col);
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    const cars = trainLayout(kind).cars;
    const bogie = 4.455 - (cars[0] as { start: number }).start;
    for (const car of cars.filter((c) => c.cab)) {
      const eyeZ = car.cab === 'front' ? car.start + bogie : car.end - bogie;
      for (const sx of [-1, 1]) {
        const here = `${kind} car ${car.index} ${sx > 0 ? 'right' : 'left'}`;
        // the camera looks across the train at the body side; screen x runs along the train, y up
        const { hull, other } = drawCab(g.getObjectByName(`car-${car.index}`)!, housing, (q) => {
          const d = (q.x - sx * 4.35) * -sx;
          return d < 0.05 ? null : [W / 2 + (f * (q.z - eyeZ) * -sx) / d, 500 - (f * (q.y - 1.85)) / d, d];
        });
        const rows = new Map<number, number>();
        let past = 0;
        let spur = 0;
        let seen = 0;
        for (let i = 0; i < hull.length; i++) {
          if (hull[i]! < 0) continue;
          seen++;
          if (other[i]) continue;
          past++;
          if (hull[i] === 1) spur++;
          rows.set(Math.floor(i / W), (rows.get(Math.floor(i / W)) ?? 0) + 1);
        }
        const widest = Math.max(0, ...rows.values());
        assert.ok(seen > 1000, `${here}: only ${seen} px of the housing drawn`);
        assert.ok(widest <= 5, `${here}: the housing stands up to ${widest} px a row past the nose's outline`);
        assert.ok(past <= 200, `${here}: ${past} px of the housing stand past the nose's outline`);
        assert.ok(spur <= 10, `${here}: ${spur} px of the pale rim stand past the nose's outline, a spur`);
      }
    }
  }
});

test('head on from front-3m, the LNER lamp unit\'s inboard edge keeps its pale line down to the foot and turns the corner into the foot\'s without a nub, at both ends (round B11)', () => {
  // The B10 score (front-3m, rear-3m, lights): below the 1.65 m bend the pale rim on the unit's inboard edge thinned from 3-5 px to 0-1 px, and at the lower inboard corner the foot's
  // rim reached about 2 px past the side edge into the red, a 2x2 px pale nub (lner-800-113-newcastle-2025, lner-800-doncaster-2026: the dark glass edged by a thin light line all
  // round). Drawn from the V02 eye (3 m ahead of the face, 1.7 m up, 50 degrees over 1000 px), each row of the unit's inboard edge from the foot's rim up to 1.75 m: the run of rim
  // between the glass and the paint is 2 to 8 px, its outer edge wanders by no more than a pixel a row, and the foot's rim reaches no further inboard than the side's over it.
  const W = 1600;
  const f = 500 / Math.tan((25 * Math.PI) / 180);
  for (const kind of ['lner5', 'lner9'] as const) {
    const cluster = frontOf(kind).cluster!;
    const housing = [cluster.window.colour, cluster.rim!.colour, CLUSTER_ARRAY, ...Object.values(LENS)].map(col);
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    for (const car of trainLayout(kind).cars.filter((c) => c.cab)) {
      const face = car.cab === 'front' ? car.start : car.end;
      const ahead = car.cab === 'front' ? -1 : 1;
      const { near } = drawCab(g.getObjectByName(`car-${car.index}`)!, housing, (q) => {
        const d = (q.z - (face + 3 * ahead)) * -ahead;
        return d < 0.05 ? null : [W / 2 + (f * (q.x * -ahead)) / d, 500 - (f * (q.y - 1.7)) / d, d];
      });
      for (const side of [-1, 1]) {
        const here = `${kind} car ${car.index}, the unit on the picture's ${side > 0 ? 'right' : 'left'}`;
        // inboard is toward the middle of the picture: walk each row from the unit's outboard side in, to the last pixel of glass, then count the rim beyond it
        const step = side > 0 ? -1 : 1;
        const start = side > 0 ? W - 1 : 0;
        const own = (x: number): boolean => (side > 0 ? x >= W / 2 : x < W / 2);
        const top = Math.round(500 - (f * (1.75 - 1.7)) / 3.3);
        let rows = 0;
        let lastOuter = -1;
        let footSeen = false;
        // the foot's rim at its most inboard, and the side's rim at its most inboard over the six rows of glass over it
        let footInner = -1;
        let cornerOuter = -1;
        for (let y = 999; y >= top; y--) {
          let glass = -1;
          for (let x = start; own(x); x += step) if (near[y * W + x] === 0) glass = x;
          if (glass < 0) {
            // under the glass: the foot's rim, its innermost pixel
            let rim = -1;
            for (let x = start; own(x); x += step) if (near[y * W + x] === 1) rim = x;
            if (rim >= 0) {
              footSeen = true;
              lastOuter = lastOuter < 0 ? rim : step > 0 ? Math.max(lastOuter, rim) : Math.min(lastOuter, rim);
              footInner = lastOuter;
            }
            continue;
          }
          if (!footSeen) continue;
          rows++;
          let run = 0;
          while (near[y * W + glass + step * (run + 1)] === 1) run++;
          assert.ok(run >= 2 && run <= 8, `${here}: row ${y}, ${run} px of pale rim inboard of the glass`);
          const outer = glass + step * run;
          // going up the edge the rim's outer pixel moves outboard or stays; the row below reaching more than a pixel further inboard is the foot's rim poking past the side
          assert.ok((lastOuter - outer) * step <= 1, `${here}: row ${y}, the rim below reaches ${(lastOuter - outer) * step} px further inboard than this row's, ${outer}`);
          lastOuter = outer;
          if (rows <= 6) cornerOuter = cornerOuter < 0 ? outer : step > 0 ? Math.max(cornerOuter, outer) : Math.min(cornerOuter, outer);
        }
        assert.ok(rows >= 20, `${here}: only ${rows} rows of the inboard edge`);
        // the corner: the foot's rim reaches no further inboard than the side's just over it (B10: a pixel or two further, the nub)
        assert.ok((footInner - cornerOuter) * step <= 0, `${here}: the foot's rim reaches ${(footInner - cornerOuter) * step} px past the side's rim at the lower inboard corner, a nub`);
      }
    }
  }
});

/**
 * The pixels of a 1600x1000 picture through `cam` that the triangles of `mesh` (in world space) of the colour `hex` cover, at their centres, counting only those whose three corners
 * `keep` passes. Coverage alone, with no depth: what lies inside what, seen from that eye, not what hides what.
 */
function coverage(mesh: THREE.Mesh, cam: THREE.Camera, hex: number, keep: (v: THREE.Vector3) => boolean): Set<number> {
  const W = 1600;
  const H = 1000;
  const rgb = col(hex);
  const c = mesh.geometry.getAttribute('color');
  const p = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const n = index ? index.count : p.count;
  const out = new Set<number>();
  for (let t = 0; t < n; t += 3) {
    const ks = [t, t + 1, t + 2].map((k) => (index ? index.getX(k) : k));
    if (!ks.every((k) => Math.abs(c.getX(k) - rgb.r) < 1e-5 && Math.abs(c.getY(k) - rgb.g) < 1e-5 && Math.abs(c.getZ(k) - rgb.b) < 1e-5)) continue;
    const world = ks.map((k) => new THREE.Vector3().fromBufferAttribute(p, k).applyMatrix4(mesh.matrixWorld));
    if (!world.every(keep)) continue;
    const [a, b, e] = world.map((v) => {
      const q = v.clone().project(cam);
      return [((q.x + 1) / 2) * W, ((1 - q.y) / 2) * H];
    }) as [number, number][];
    const area = (b[0] - a[0]) * (e[1] - a[1]) - (e[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-12) continue;
    for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1], e[1]))); y <= Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], e[1]))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0], e[0]))); x <= Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], e[0]))); x++) {
        const w0 = ((b[0] - x - 0.5) * (e[1] - y - 0.5) - (e[0] - x - 0.5) * (b[1] - y - 0.5)) / area;
        const w1 = ((e[0] - x - 0.5) * (a[1] - y - 0.5) - (a[0] - x - 0.5) * (e[1] - y - 0.5)) / area;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        out.add(y * W + x);
      }
    }
  }
  return out;
}

test('the LNER headlamp strip\'s lenses all sit inside the unit\'s dark glass, head on through V02 and from the four nose-34 eyes, at both ends (round B12)', () => {
  // The B11 score (lner5/lner9 front-3m and the lights views): head on, the strip's lower lenses overlapped the red cheek at the unit's outboard edge (x 505-555 in front-3m), where
  // lner-800-113-newcastle-2025 shows every lens inside the dark glass; B11 had put the strip inside the glass at 3/4, which must hold. Drawn at 1600x1000 through the catalogue's
  // eyes (train-framing.mjs): V02 3 m ahead of the face, 1.7 m up, looking straight back; V01 4.5 m out to one side and 5 m ahead, looking at 1.5 m back, 1.7 m up; both a 50 degree
  // lens. A lens pixel is outside the glass where no triangle of the window covers it, seen from that eye (head on both units; at 3/4 the unit on the camera's side, the far one
  // being seen edge on behind the nose). B11 (lner5, both ends): 59 of 221 lens pixels outside the glass head on, 5 of 229 from nose-34; built (B12), none.
  const faults: string[] = [];
  for (const kind of ['lner5', 'lner9'] as const) {
    const cluster = frontOf(kind).cluster!;
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    for (const car of trainLayout(kind).cars.filter((c) => c.cab)) {
      const face = car.cab === 'front' ? car.start : car.end;
      const ahead = car.cab === 'front' ? -1 : 1;
      const lens = car.cab === 'front' ? LENS.headOn : LENS.headOff;
      const detail = g.getObjectByName(`car-${car.index}`)!.getObjectByName('body-detail') as THREE.Mesh;
      const views: [string, THREE.Vector3, THREE.Vector3, number[]][] = [
        ['front-3m', new THREE.Vector3(0, 1.7, face + 3 * ahead), new THREE.Vector3(0, 1.7, face), [-1, 1]],
        ...[-1, 1].map((sx): [string, THREE.Vector3, THREE.Vector3, number[]] => [
          `nose-34 with the eye at x ${sx * 4.5 * -ahead}`,
          new THREE.Vector3(sx * 4.5 * -ahead, 1.7, face + 5 * ahead),
          new THREE.Vector3(0, 1.7, face - 1.5 * ahead),
          [sx * -ahead],
        ]),
      ];
      for (const [view, eye, target, units] of views) {
        const cam = new THREE.PerspectiveCamera(50, 1.6, 0.05, 200);
        cam.position.copy(eye);
        cam.lookAt(target);
        cam.updateMatrixWorld();
        for (const unit of units) {
          const here = `${kind} car ${car.index}, ${view}, the unit at x ${unit > 0 ? '+' : '-'}`;
          const keep = (v: THREE.Vector3): boolean => v.x * unit > 0.3 && Math.abs(v.z - face) < 2.5;
          const glass = coverage(detail, cam, cluster.window.colour, keep);
          const lenses = coverage(detail, cam, lens, keep);
          const out = [...lenses].filter((i) => !glass.has(i)).length;
          assert.ok(lenses.size > 30, `${here}: only ${lenses.size} px of headlamp lens drawn`);
          if (out > 0) faults.push(`${here}: ${out} of ${lenses.size} px of headlamp lens lie outside the dark glass`);
        }
      }
    }
  }
  assert.deepEqual(faults, [], faults.join('\n'));
});
