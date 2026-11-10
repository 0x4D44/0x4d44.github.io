// The Desiro City's roof ends (round 6, T5, "AC fairings/vents/insulators/pan arrangement are generic"). The round-5 score found the 717's and the 700's roofs the Electrostar's run of plain raised
// covers with the same kit beside the pantograph. Round 6 reads the Class 700's roofs from a footbridge and from in front (`700116 Shepreth Branch Junction 210619.jpg`, `700155 Shepreth Branch
// JUnc 210619.jpg`, `700019 Shepreth Branch Junc 210619.jpg`, kitmasterbloke, 2019-06-21, CC BY 2.0; private review assets, not shipped): a smooth roof between its two ends, and at each end of a car, at
// every joint and behind the nose of each cab car, a dark pocket at one edge of the roof with a louvre grille on a raised pad, amber studs at the pad's ends, and along the other edge a dark casing with
// three grey posts and an amber label, the middle of the roof between them left pale.
//
// The ARRANGEMENT is read off the photographs. EVERY SIZE, the place along the car, the side of each part and the colours are ASSUMED (the pictures are oblique and small; 700019 looks at the train's
// left side and 700155 at its right, and each shows the pocket on the side nearer its camera, so the module may be symmetric or turned about at each end); the equipment boxes in the pocket and the
// arched rim of the casing are a GAP; the pocket is a dark slab on the roof, not cut into it (the shell has no step); the 717 shares the body: family evidence, no 717 roof photograph.
//
// The numbers below are written out here, not read from `ROOF_ENDS` (web/src/train-parts.ts), so a number changed there fails here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import type { Car, TrainKind, TrainLayout } from '../../core/train.ts';
import { bodySpec, buildTrain, END_GAP, faceSetback } from '../src/train.ts';
import { col, Soup } from '../src/train-geom.ts';
import { roofEnd, ROOF_ENDS, roofKitSpan } from '../src/train-parts.ts';

type V3 = [number, number, number];
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

const POCKET = 0x2b3034;
const PAD = 0x4a5258;
const OPENING = 0x14171a;
const AMBER = 0xd9972b;
const CASING = 0x3f4a4f;
const POST = 0x8d9298;
const PALE = 0xb4b8be;
/** The Desiro City's roof crown (the published 3.77 m less the 0.14 m the covers stood): the same as the Electrostar's. */
const CROWN = 3.63;
const EPS = 1e-9;

// --- helpers: the triangles of a colour, in a Soup or in a built car -------------------------------------------------------------------------------------------------------------------------
const same = (a: number, b: number): boolean => Math.abs(a - b) < 1e-5;
function soupTris(s: Soup, hex: number): V3[][] {
  const want = col(hex);
  const out: V3[][] = [];
  for (let t = 0; t < s.pos.length / 9; t++) {
    if (!same(s.clr[9 * t] as number, want.r) || !same(s.clr[9 * t + 1] as number, want.g) || !same(s.clr[9 * t + 2] as number, want.b)) continue;
    out.push([0, 1, 2].map((k) => [s.pos[9 * t + 3 * k], s.pos[9 * t + 3 * k + 1], s.pos[9 * t + 3 * k + 2]] as V3));
  }
  return out;
}
function meshTris(mesh: THREE.Mesh, hex: number): V3[][] {
  const want = col(hex);
  const c = mesh.geometry.getAttribute('color');
  const p = mesh.geometry.getAttribute('position');
  const out: V3[][] = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    if (![i, i + 1, i + 2].every((k) => same(c.getX(k), want.r) && same(c.getY(k), want.g) && same(c.getZ(k), want.b))) continue;
    out.push([0, 1, 2].map((k) => {
      const v = new THREE.Vector3().fromBufferAttribute(p, i + k).applyMatrix4(mesh.matrixWorld);
      return [v.x, v.y, v.z] as V3;
    }));
  }
  return out;
}
interface Ext {
  x: [number, number];
  y: [number, number];
  z: [number, number];
}
function ext(ts: V3[][]): Ext {
  const vs = ts.flat();
  const r = (i: number): [number, number] => [Math.min(...vs.map((v) => v[i] as number)), Math.max(...vs.map((v) => v[i] as number))];
  return { x: r(0), y: r(1), z: r(2) };
}
function quadBoxes(ts: V3[][]): Ext[] {
  assert.equal(ts.length % 2, 0, 'quads come in pairs of triangles');
  const out: Ext[] = [];
  for (let i = 0; i < ts.length; i += 2) out.push(ext([ts[i] as V3[], ts[i + 1] as V3[]]));
  return out;
}
const centreOf = (b: Ext): V3 => [(b.x[0] + b.x[1]) / 2, (b.y[0] + b.y[1]) / 2, (b.z[0] + b.z[1]) / 2];
/** The summed area of some triangles. */
function areaOf(ts: V3[][]): number {
  let a = 0;
  for (const [p, q, r] of ts as [V3, V3, V3][]) {
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]] as V3;
    const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]] as V3;
    a += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return a;
}
const built = (kind: TrainKind): THREE.Group => {
  const g = buildTrain(kind);
  g.updateMatrixWorld(true);
  return g;
};
const detailOf = (g: THREE.Object3D, car: Car): THREE.Mesh => {
  const m = g.getObjectByName(`car-${car.index}`)?.getObjectByName('body-detail');
  assert.ok(m, `car ${car.index} has no body-detail`);
  return m as THREE.Mesh;
};
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

// --- the table -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('roof ends: the Desiro table holds the numbers read and assumed, nothing else', () => {
  assert.deepEqual(Object.keys(ROOF_ENDS), ['desiro']);
  assert.deepEqual(ROOF_ENDS.desiro, {
    pocket: { u0: 0.1, u1: 2.5, x0: -0.7, x1: -0.05, lift: 0.008, colour: POCKET },
    pad: { x0: -0.62, x1: -0.1, u0: 0.35, u1: 1.45, height: 0.03, colour: PAD },
    slots: { cols: 6, rows: 2, w: 0.055, l: 0.08, pitchX: 0.08, pitchU: 0.14, cx: -0.36, cu: 0.9, lift: 0.003, colour: OPENING },
    studs: { xs: [-0.52, -0.36, -0.2], us: [0.28, 1.52], sx: 0.04, su: 0.04, height: 0.045, colour: AMBER },
    trough: { x0: 0.46, x1: 0.72, u0: 0.3, u1: 2.5, height: 0.06, colour: CASING },
    posts: { us: [0.85, 1.4, 1.95], side: 0.035, height: 0.075, colour: POST },
    label: { u0: 1.1, u1: 1.3, y0: 0.015, y1: 0.05, colour: AMBER },
  });
});

// --- one module ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The parts of one module at `zEnd` with the body toward +z (inward +1) on a front car (side +1): name, colour, triangles, then the x, y and z extents. */
function parts(zEnd: number): [string, number, number, [number, number], [number, number], [number, number]][] {
  const y = (v: number): number => CROWN + v;
  return [
    // the pocket: a slab on the louvres' side of the roof (from 0.7 to 0.05 m to the left of the middle), from 0.1 to 2.5 m in, from 12 mm under the crown to 8 mm over it, no underside
    ['pocket', POCKET, 10, [-0.7, -0.05], [y(-0.012), y(0.008)], [zEnd + 0.1, zEnd + 2.5]],
    // the pad: 0.52 across at -0.62..-0.1, 1.1 m long from 0.35 m in, from 4 mm over the crown to 30 mm over the pocket (38 mm over the crown), no underside
    ['pad', PAD, 10, [-0.62, -0.1], [y(0.004), y(0.038)], [zEnd + 0.35, zEnd + 1.45]],
    // twelve openings, two triangles each: six across from -0.56 to -0.16 on a pitch of 0.08 (0.055 each), two rows 0.14 apart about 0.9 m in (0.08 each), 3 mm over the pad
    ['openings', OPENING, 24, [-0.56 - 0.0275, -0.16 + 0.0275], [y(0.041), y(0.041)], [zEnd + 0.83 - 0.04, zEnd + 0.97 + 0.04]],
    // the casing: 0.26 across at 0.46..0.72, from 0.3 to 2.5 m in, from 12 mm under the crown to 60 mm over it
    ['casing', CASING, 10, [0.46, 0.72], [y(-0.012), y(0.06)], [zEnd + 0.3, zEnd + 2.5]],
    // three posts, ten triangles each, 35 mm square, on the casing's middle (0.59) at 0.85, 1.4 and 1.95 m in, from 4 mm under the casing's top to 75 mm over it
    ['posts', POST, 30, [0.59 - 0.0175, 0.59 + 0.0175], [y(0.056), y(0.135)], [zEnd + 0.85 - 0.0175, zEnd + 1.95 + 0.0175]],
  ];
}

test('roof end: one module is a pocket, a louvre pad with twelve openings, six amber studs, a casing, three posts and a label: 146 triangles', () => {
  const s = new Soup();
  roofEnd(s, { style: 'desiro', zEnd: 100, inward: 1, crown: CROWN, side: 1 });
  assert.equal(s.pos.length / 9, 146);
  for (const [name, hex, count, x, y, z] of parts(100)) {
    const ts = soupTris(s, hex);
    assert.equal(ts.length, count, `${name}: triangles`);
    const e = ext(ts);
    near(e.x[0], x[0], EPS, `${name}: x from`);
    near(e.x[1], x[1], EPS, `${name}: x to`);
    near(e.y[0], y[0], EPS, `${name}: y from`);
    near(e.y[1], y[1], EPS, `${name}: y to`);
    near(e.z[0], z[0], EPS, `${name}: z from`);
    near(e.z[1], z[1], EPS, `${name}: z to`);
  }
  // the amber: six studs (ten triangles each, 0.04 square, at -0.52, -0.36 and -0.2 across, 0.28 and 1.52 m in, from 4 mm over the crown to 53 mm) and the label (two triangles)
  const amber = soupTris(s, AMBER);
  assert.equal(amber.length, 62);
  const studs = amber.filter((t) => t.some((v) => v[0] < 0));
  assert.equal(studs.length, 60);
  const se = ext(studs);
  near(se.x[0], -0.54, EPS, 'studs: x from');
  near(se.x[1], -0.18, EPS, 'studs: x to');
  near(se.y[0], CROWN + 0.004, EPS, 'studs: foot');
  near(se.y[1], CROWN + 0.053, EPS, 'studs: top');
  near(se.z[0], 100.26, EPS, 'studs: z from');
  near(se.z[1], 101.54, EPS, 'studs: z to');
  // the label: a quad 1 mm in front of the casing's inner face, facing the middle of the roof, 0.2 m long between 1.1 and 1.3 m in, from 15 to 50 mm over the crown
  const label = amber.filter((t) => t.every((v) => v[0] > 0));
  assert.equal(label.length, 2);
  const le = ext(label);
  near(le.x[0], 0.459, EPS, 'label x');
  near(le.x[1], 0.459, EPS, 'label x (flat)');
  near(le.y[0], CROWN + 0.015, EPS, 'label foot');
  near(le.y[1], CROWN + 0.05, EPS, 'label top');
  near(le.z[0], 101.1, EPS, 'label start');
  near(le.z[1], 101.3, EPS, 'label end');
  // the whole rectangle, not a sheared one: 0.2 m along by 35 mm up
  near(areaOf(label), 0.2 * 0.035, 1e-9, 'label area');
  for (let t = 0; t < s.pos.length / 9; t++) {
    if (!same(s.clr[9 * t] as number, col(AMBER).r) || !same(s.clr[9 * t + 1] as number, col(AMBER).g) || (s.pos[9 * t] as number) < 0) continue;
    near(s.nrm[9 * t] as number, -1, EPS, 'the label faces the middle of the roof');
  }
  // the openings: twelve quads, 0.055 across and 0.08 along, at the pitch, facing up
  const quads = quadBoxes(soupTris(s, OPENING));
  assert.equal(quads.length, 12);
  assert.deepEqual([...new Set(quads.map((b) => round6(centreOf(b)[0])))].sort((a, b) => a - b), [-0.56, -0.48, -0.4, -0.32, -0.24, -0.16]);
  assert.deepEqual([...new Set(quads.map((b) => round6(centreOf(b)[2])))].sort((a, b) => a - b), [100.83, 100.97]);
  for (const b of quads) {
    near(b.x[1] - b.x[0], 0.055, EPS, 'opening across');
    near(b.z[1] - b.z[0], 0.08, EPS, 'opening along');
  }
  for (let t = 0; t < s.pos.length / 9; t++) {
    if (!same(s.clr[9 * t] as number, col(OPENING).r) || !same(s.clr[9 * t + 1] as number, col(OPENING).g)) continue;
    for (let k = 0; k < 3; k++) near(s.nrm[9 * t + 3 * k + 1] as number, 1, EPS, 'an opening faces up');
  }
  // the pad, the pocket and the casing have no underside
  for (const hex of [POCKET, PAD, CASING, POST]) {
    for (let t = 0; t < s.pos.length / 9; t++) {
      if (!same(s.clr[9 * t] as number, col(hex).r) || !same(s.clr[9 * t + 1] as number, col(hex).g) || !same(s.clr[9 * t + 2] as number, col(hex).b)) continue;
      assert.ok((s.nrm[9 * t + 1] as number) > -0.5, `${hex.toString(16)}: no underside`);
    }
  }
});

test('roof end: turned about (side -1) it has the pad on the +x side and the casing on the -x side; at a car\'s far end (inward -1) it runs toward -z and keeps its side', () => {
  const a = new Soup();
  const b = new Soup();
  const c = new Soup();
  roofEnd(a, { style: 'desiro', zEnd: 100, inward: 1, crown: CROWN, side: 1 });
  roofEnd(b, { style: 'desiro', zEnd: 100, inward: 1, crown: CROWN, side: -1 });
  roofEnd(c, { style: 'desiro', zEnd: 100, inward: -1, crown: CROWN, side: 1 });
  assert.equal(b.pos.length / 9, 146);
  assert.equal(c.pos.length / 9, 146);
  for (const [name, hex] of [['pocket', POCKET], ['pad', PAD], ['casing', CASING], ['posts', POST], ['openings', OPENING]] as [string, number][]) {
    const ea = ext(soupTris(a, hex));
    const eb = ext(soupTris(b, hex));
    const ec = ext(soupTris(c, hex));
    near(eb.x[0], -ea.x[1], EPS, `${name}: mirrored across`);
    near(eb.x[1], -ea.x[0], EPS, `${name}: mirrored across (other edge)`);
    near(eb.z[0], ea.z[0], EPS, `${name}: the same along when turned about`);
    near(eb.z[1], ea.z[1], EPS, `${name}: the same along when turned about (other edge)`);
    near(ec.z[0], 200 - ea.z[1], EPS, `${name}: the far end runs the other way`);
    near(ec.z[1], 200 - ea.z[0], EPS, `${name}: the far end runs the other way (other edge)`);
    near(ec.x[0], ea.x[0], EPS, `${name}: the far end keeps its side`);
    near(ec.x[1], ea.x[1], EPS, `${name}: the far end keeps its side (other edge)`);
  }
  // the label goes with the casing: on its inner face, facing the middle of the roof from the -x side
  const label = soupTris(b, AMBER).filter((t) => t.every((v) => v[0] < 0 && v[0] > -0.5));
  assert.equal(label.length, 2);
  near(ext(label).x[0], -0.459, EPS, 'turned about, the label');
  for (let t = 0; t < b.pos.length / 9; t++) {
    if (!same(b.clr[9 * t] as number, col(AMBER).r) || !same(b.clr[9 * t + 1] as number, col(AMBER).g) || (b.pos[9 * t] as number) > 0) continue;
    if ((b.pos[9 * t] as number) < -0.5) continue;
    near(b.nrm[9 * t] as number, 1, EPS, 'turned about, the label faces +x, the middle of the roof');
  }
});

// --- the cars --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** Where a Desiro car's two modules begin their run (the rule of buildCar, written out): at a nose, where its nose and a margin leave off (the covers' old start); at a joint, the car's end gap. */
function moduleEnds(car: Car, layout: TrainLayout): [number, number] {
  const interior = (car.cab === 'front' && car.start > 1e-9) || (car.cab === 'rear' && car.end < layout.length - 1e-9);
  assert.equal(interior, false, 'no Desiro layout has a cab inside the train');
  const tip = faceSetback('desiro');
  const nose = bodySpec('desiro').nose.length;
  return [car.cab === 'front' ? car.start + tip + nose + 0.4 : car.start + END_GAP, car.cab === 'rear' ? car.end - tip - nose - 0.4 : car.end - END_GAP];
}

test('Desiro roofs: a module at both ends of every car, behind the nose at a nose and from the end gap at a joint; the pad and the casing on their sides; no raised cover anywhere', () => {
  for (const kind of ['tl700x8', 'tl700x12', 'gn717x6'] as TrainKind[]) {
    const layout = trainLayout(kind);
    const g = built(kind);
    for (const car of layout.cars) {
      const m = detailOf(g, car);
      const pockets = meshTris(m, POCKET);
      assert.equal(pockets.length, 20, `${kind} car ${car.index} (${car.type}, cab ${car.cab}): two modules, ten triangles of pocket each`);
      const [from, to] = moduleEnds(car, layout);
      // the module at the start runs 0.1 to 2.5 m on from its end; the one at the far end runs 0.1 to 2.5 m back from its end
      const first = ext(pockets.slice(0, 10));
      const second = ext(pockets.slice(10));
      const [a, b] = first.z[0] < second.z[0] ? [first, second] : [second, first];
      near(a.z[0], from + 0.1, 1e-4, `${kind} car ${car.index}: the first module begins`);
      near(a.z[1], from + 2.5, 1e-4, `${kind} car ${car.index}: the first module ends`);
      near(b.z[0], to - 2.5, 1e-4, `${kind} car ${car.index}: the second module begins`);
      near(b.z[1], to - 0.1, 1e-4, `${kind} car ${car.index}: the second module ends`);
      // the pad is on the -x side of a front car's modules and the casing on the +x side; both turned about on a rear cab car
      const side = car.cab === 'rear' ? -1 : 1;
      const pad = ext(meshTris(m, PAD));
      const casing = ext(meshTris(m, CASING));
      near(side * (pad.x[0] + pad.x[1]) / 2, -0.36, 1e-6, `${kind} car ${car.index}: the pad's side`);
      near(side * (casing.x[0] + casing.x[1]) / 2, 0.59, 1e-6, `${kind} car ${car.index}: the casing's side`);
      assert.equal(meshTris(m, OPENING).length, 48, `${kind} car ${car.index}: twelve openings a module`);
      assert.equal(meshTris(m, POST).length, 60, `${kind} car ${car.index}: three posts a module`);
      // smooth between the modules: no raised cover of the old kind
      assert.equal(meshTris(m, PALE).filter((t) => t.some((v) => v[1] > CROWN + 0.02)).length, 0, `${kind} car ${car.index}: no raised cover`);
    }
  }
});

test('Desiro roofs: a pantograph car\'s modules stand half a metre clear of its kit, and nothing on any car stands over the published 3.77 m', () => {
  for (const kind of ['tl700x8', 'tl700x12', 'gn717x6'] as TrainKind[]) {
    const layout = trainLayout(kind);
    const g = built(kind);
    for (const car of layout.cars) {
      const m = detailOf(g, car);
      if (car.pantograph) {
        const [k0, k1] = roofKitSpan('emu', car.pantograph[0], car.pantograph[1], -1);
        const pockets = meshTris(m, POCKET);
        for (let i = 0; i < pockets.length; i += 10) {
          const e = ext(pockets.slice(i, i + 10));
          assert.ok(e.z[1] < k0 - 0.5 || e.z[0] > k1 + 0.5, `${kind} car ${car.index}: a module at ${e.z} is half a metre clear of the kit's ${k0}..${k1}`);
        }
      }
      for (const hex of [POCKET, PAD, OPENING, AMBER, CASING, POST]) for (const t of meshTris(m, hex)) for (const v of t) assert.ok(v[1] <= 3.77 + 1e-6, `${kind} car ${car.index}: a roof part at ${v[1]}`);
    }
  }
});

test('Desiro roofs: the 717 and the 700 have the module, no other family does, and their crown is the Electrostar\'s', () => {
  assert.deepEqual(bodySpec('desiro').roofEnds, { style: 'desiro' });
  assert.deepEqual(bodySpec('desiro700').roofEnds, { style: 'desiro' });
  for (const fam of ['at300', 'electrostar', 'adelante'] as const) assert.equal(bodySpec(fam).roofEnds, undefined, `${fam}: no roof ends`);
  assert.equal(bodySpec('desiro').crown, CROWN);
  assert.equal(bodySpec('desiro700').crown, CROWN);
  // a family has hatch rows or roof ends, never both
  for (const fam of ['at300', 'electrostar', 'desiro', 'desiro700', 'adelante'] as const) assert.ok(!(bodySpec(fam).roofEnds && bodySpec(fam).roofHatches), `${fam}: one roof style`);
});
