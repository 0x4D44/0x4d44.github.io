// The Hitachi AT300 bodyshell, once for every operator that runs it (LNER 800/801, Hull Trains 802, Lumo 803): the section's shoulder, the blunt round-fronted nose, and the
// colour masks laid on it. The figures are the readings off the photographs that web/src/train.ts AT300_NOSE_KNOTS, AT300_CANT_RADIUS, LNER_MASK and HULL_MASK cite, each held to
// about the precision those readings have. Pure geometry: no WebGL and no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { bodySpec, buildTrain, carSection, CLUSTER_EDGE, CLUSTER_LIFT, CLUSTER_ROW, faceSetback, frontOf } from '../src/train.ts';
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
    assert.ok(sill > 1.3 && sill < 1.5, `${kind}: ${sill.toFixed(2)} m across at the glass`);
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
        assert.ok(Math.abs(windowLift - CLUSTER_LIFT.window) <= 0.002, `${here}: the window's middle stands ${(windowLift * 1000).toFixed(1)} mm off the nose`);
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
