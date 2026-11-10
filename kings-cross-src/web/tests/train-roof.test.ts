// The roofs of the Electrostar and the Desiro as their photographs show them (round 6, T5, "AC fairings/vents/insulators/pan arrangement are generic"). The round-5 score found the 387's, 717's and
// 700's roofs a run of plain raised covers with the same kit beside the pantograph. Round 6 reads the roof of a Class 377 car from above (`377208 roof 5Y63 Blackfriars to Grove Park CSD.jpg` and its
// sisters, train_photos, 2015-03-12, CC BY-SA 2.0; the 377 is the 387's body) and the Great Northern 387's roof from a footbridge (`387115 Shepreth Branch Junc 210619.jpg`, `387118 on Shepreth Branch
// Junction 210619.jpg`, kitmasterbloke, 2019-06-21, CC BY 2.0): a smooth roof with a hatch row let into it every so often. The photographs are private review assets, not shipped.
//
// What the photographs give is the arrangement of one hatch row (two rows of five louvre openings at one end, a round-cornered plate in the middle, an oval mesh grille at the other), that a row stands
// a few centimetres proud and spans the flat of the roof, that a middle car carries two (a cab car three), and that the pantograph car's roof is a dirty cream deck in a pocket with a high casing at
// its car-end side. HOW MANY to a car and where along it (the photographs are oblique: good to about a tenth of a car), every size (proportions of one row, scaled so its foot is the roof's width),
// which side the louvres are on (the two 387 photographs show opposite sides: it varies with which way a unit faces) and the colours are ASSUMED. That the 387's pantograph car is built like the 377's
// is family evidence, not a 387 photograph.
//
// The numbers below are written out here, not read from `ROOF_HATCHES` (web/src/train-parts.ts), so a number changed there fails here.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import type { Car, TrainKind, TrainLayout } from '../../core/train.ts';
import { bodySpec, buildTrain, END_GAP, faceSetback } from '../src/train.ts';
import { col, Soup } from '../src/train-geom.ts';
import { pantographDeck, roofCasing, roofHatch, roofHatchCentres, roofKeepOut, roofPlan, ROOF_HATCHES, roofKitSpan } from '../src/train-parts.ts';

type V3 = [number, number, number];
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

/** The Electrostar's roof crown (the published 3.77 m is the casing's top, 0.14 m over it). */
const CROWN = 3.63;
const PANEL = 0xb4b8be;
const PLATE = 0xc4c8cd;
const SLOT = 0x2b2e33;
const OVAL = 0x4a4e54;
const DECK = 0x98927a;
const EPS = 1e-9;

// --- helpers: the triangles of a colour, in a Soup or in a built car ---------------------------------------------------------------------------------------------------------------------
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
const meanZ = (t: V3[]): number => (t[0]![2] + t[1]![2] + t[2]![2]) / 3;
/** The pairs of triangles a quad is made of (Soup.quad pushes the two of a quad one after the other), as the box of each pair. */
function quadBoxes(ts: V3[][]): Ext[] {
  assert.equal(ts.length % 2, 0, 'quads come in pairs of triangles');
  const out: Ext[] = [];
  for (let i = 0; i < ts.length; i += 2) out.push(ext([ts[i] as V3[], ts[i + 1] as V3[]]));
  return out;
}
const centreOf = (b: Ext): V3 => [(b.x[0] + b.x[1]) / 2, (b.y[0] + b.y[1]) / 2, (b.z[0] + b.z[1]) / 2];
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

// --- the table ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('roof hatches: the Electrostar table holds the numbers measured and assumed, nothing else', () => {
  assert.deepEqual(Object.keys(ROOF_HATCHES), ['electrostar']);
  assert.deepEqual(ROOF_HATCHES.electrostar, {
    length: 0.5,
    height: 0.025,
    bw: 0.85,
    tw: 0.74,
    run: 0.08,
    at: [0.3, 0.7],
    clear: 0.1,
    louvre: { cols: 5, rows: 2, w: 0.075, l: 0.09, pitchX: 0.105, pitchZ: 0.12, cx: 0.44 },
    plate: { hx: 0.16, hz: 0.18, lift: 0.004 },
    oval: { cx: -0.47, rx: 0.23, rz: 0.11, sides: 12 },
    lift: 0.003,
    colours: { panel: PANEL, plate: PLATE, slot: SLOT, oval: OVAL },
    deck: { half: 0.74, colour: DECK, top: 0.004 },
    hump: { length: 1.6, gap: 0.1 },
  });
});

// --- where the casing goes ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('roof casing: 1.6 m long, a tenth of a metre clear of the well, on the kit\'s side of it', () => {
  const low = roofCasing('electrostar', 10, 14.45, -1);
  near(low[0], 8.3, EPS, 'kit toward lower z: casing start');
  near(low[1], 9.9, EPS, 'kit toward lower z: casing end');
  const high = roofCasing('electrostar', 10, 14.45, 1);
  near(high[0], 14.55, EPS, 'kit toward higher z: casing start');
  near(high[1], 16.15, EPS, 'kit toward higher z: casing end');
});

test('roof keep-out: the well and its casing together, whichever side the casing is on', () => {
  assert.deepEqual(roofKeepOut([10, 14], [8, 9.9]), [8, 14], 'casing on the low side');
  assert.deepEqual(roofKeepOut([10, 14], [14.1, 15.7]), [10, 15.7], 'casing on the high side');
  assert.deepEqual(roofKeepOut([10, 14], [11, 12]), [10, 14], 'casing inside the well');
});

test('roof plan: without a well, the rows alone; with one, the deck over it, the casing on the kit\'s side and only the rows clear of both', () => {
  const bare = roofPlan('electrostar', 0, 10, null, -1);
  assert.deepEqual(bare, { deck: null, casing: null, rows: [3, 7] });
  // a well [4.5, 6] with the kit toward lower z: casing [2.8, 4.4]; the first row (panel 2.75..3.25) is on the casing, the second (6.75..7.25) is 0.75 m past the well and stays
  const low = roofPlan('electrostar', 0, 10, [4.5, 6], -1);
  assert.deepEqual(low.deck, [4.5, 6]);
  near((low.casing as [number, number])[0], 2.8, EPS, 'casing start');
  near((low.casing as [number, number])[1], 4.4, EPS, 'casing end');
  assert.deepEqual(low.rows, [7]);
  // the same well with the kit toward higher z: casing [6.1, 7.7]; now the second row is on the casing and the first stays
  const high = roofPlan('electrostar', 0, 10, [4.5, 6], 1);
  assert.deepEqual(high.deck, [4.5, 6]);
  near((high.casing as [number, number])[0], 6.1, EPS, 'casing start');
  near((high.casing as [number, number])[1], 7.7, EPS, 'casing end');
  assert.deepEqual(high.rows, [3]);
  // a row on the well itself, clear of the casing, is left out too: a well [2.5, 3.5] puts its casing at [0.8, 2.4] and the first row (2.75..3.25) inside the well
  const inside = roofPlan('electrostar', 0, 10, [2.5, 3.5], -1);
  assert.deepEqual(inside.rows, [7]);
  // and a row clear of the casing but not of a long well, the other side
  const longer = roofPlan('electrostar', 0, 10, [2.5, 6.8], 1);
  assert.deepEqual(longer.rows, [], 'a long well with a casing beyond it takes both rows');
});

// --- where the rows go ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('roof hatch rows: one at 0.3 and one at 0.7 of a stretch of roof; a row within a tenth of a metre of the well and its casing, or on them, is left out', () => {
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, null), [3, 7]);
  const far = roofHatchCentres('electrostar', 100, 120, null);
  assert.equal(far.length, 2);
  near(far[0] as number, 106, 1e-9, 'first row of a stretch 100..120');
  near(far[1] as number, 114, 1e-9, 'second row of a stretch 100..120');
  // a row's panel is 0.5 m long, 0.25 m either side of its centre
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [3.34, 4]), [7], 'a well 0.09 m past the first row\'s end: the row is left out');
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [3.36, 4]), [3, 7], 'a well 0.11 m past the first row\'s end: the row stays');
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [2, 2.66]), [7], 'a well 0.09 m short of the first row\'s start: the row is left out');
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [2, 2.64]), [3, 7], 'a well 0.11 m short of the first row\'s start: the row stays');
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [6, 8]), [3], 'a well under the second row');
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [6.7, 7.3]), [3], 'a well narrower than the row, on it');
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [-5, 15]), [], 'a well over both');
  assert.deepEqual(roofHatchCentres('electrostar', 0, 10, [8, 9]), [3, 7], 'a well past both rows');
});

// --- one hatch row ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('roof hatch: a row is a sloped panel, two rows of five louvre openings, a plate and an oval grille: 52 triangles', () => {
  const s = new Soup();
  roofHatch(s, { style: 'electrostar', zc: 10, crown: CROWN, side: 1 });
  assert.equal(s.pos.length / 9, 52);
  assert.equal(soupTris(s, PANEL).length + soupTris(s, SLOT).length + soupTris(s, PLATE).length + soupTris(s, OVAL).length, 52, 'every triangle is one of the four parts');

  // the panel: a frustum of five faces (ten triangles): its foot 0.85 either side and 0.04 under the crown, 0.5 m long; its top 0.74 either side and 0.025 over the crown, 0.08 in from each end
  const panel = soupTris(s, PANEL);
  assert.equal(panel.length, 10);
  const pe = ext(panel);
  near(pe.x[0], -0.85, EPS, 'panel foot, left');
  near(pe.x[1], 0.85, EPS, 'panel foot, right');
  near(pe.y[0], CROWN - 0.04, EPS, 'panel foot height');
  near(pe.y[1], CROWN + 0.025, EPS, 'panel top height');
  near(pe.z[0], 9.75, EPS, 'panel foot, start');
  near(pe.z[1], 10.25, EPS, 'panel foot, end');
  const top = panel.filter((t) => t.every((v) => Math.abs(v[1] - (CROWN + 0.025)) < EPS));
  assert.equal(top.length, 2, 'the top is one quad');
  const te = ext(top);
  near(te.x[0], -0.74, EPS, 'panel top, left');
  near(te.x[1], 0.74, EPS, 'panel top, right');
  near(te.z[0], 9.83, EPS, 'panel top, start');
  near(te.z[1], 10.17, EPS, 'panel top, end');

  // the louvre openings: ten quads 0.075 across by 0.09 along, on a pitch of 0.105 across and 0.12 along, five across centred 0.44 to the +x side, two along centred on the row, 3 mm over the top, facing up
  const slots = soupTris(s, SLOT);
  assert.equal(slots.length, 20);
  const centres = quadBoxes(slots).map((b) => {
    near(b.x[1] - b.x[0], 0.075, EPS, 'slot width across');
    near(b.z[1] - b.z[0], 0.09, EPS, 'slot length along');
    near(b.y[0], CROWN + 0.028, EPS, 'slot stands 3 mm over the top');
    near(b.y[1], CROWN + 0.028, EPS, 'slot is flat');
    return centreOf(b);
  });
  const xs = [...new Set(centres.map((c) => Math.round(c[0] * 1e6) / 1e6))].sort((a, b) => a - b);
  const zs = [...new Set(centres.map((c) => Math.round(c[2] * 1e6) / 1e6))].sort((a, b) => a - b);
  assert.deepEqual(xs, [0.23, 0.335, 0.44, 0.545, 0.65]);
  assert.deepEqual(zs, [9.94, 10.06]);
  for (const x of xs) for (const z of zs) assert.equal(centres.filter((c) => Math.abs(c[0] - x) < 1e-6 && Math.abs(c[2] - z) < 1e-6).length, 1, `one slot at ${x}, ${z}`);
  for (let t = 0; t < s.pos.length / 9; t++) {
    if (!same(s.clr[9 * t] as number, col(SLOT).r)) continue;
    for (let k = 0; k < 3; k++) near(s.nrm[9 * t + 3 * k + 1] as number, 1, EPS, 'a slot faces up');
  }

  // the plate: a box 0.32 across and 0.36 along, standing 4 mm over the top, with no underside
  const plate = soupTris(s, PLATE);
  assert.equal(plate.length, 10, 'five faces');
  const le = ext(plate);
  near(le.x[0], -0.16, EPS, 'plate, left');
  near(le.x[1], 0.16, EPS, 'plate, right');
  near(le.y[0], CROWN + 0.025, EPS, 'plate foot');
  near(le.y[1], CROWN + 0.029, EPS, 'plate top');
  near(le.z[0], 9.82, EPS, 'plate start');
  near(le.z[1], 10.18, EPS, 'plate end');
  for (let t = 0; t < s.pos.length / 9; t++) {
    if (!same(s.clr[9 * t] as number, col(PLATE).r) || !same(s.clr[9 * t + 1] as number, col(PLATE).g)) continue;
    assert.ok((s.nrm[9 * t + 1] as number) > -0.5, 'the plate has no underside');
  }

  // the oval: a twelve-sided fan, centred 0.47 to the -x side, 0.23 across either way and 0.11 along, flat and facing up, 3 mm over the top
  const oval = soupTris(s, OVAL);
  assert.equal(oval.length, 12);
  const oe = ext(oval);
  near(oe.x[0], -0.7, EPS, 'oval, outer');
  near(oe.x[1], -0.24, EPS, 'oval, inner');
  near(oe.z[0], 9.89, EPS, 'oval start');
  near(oe.z[1], 10.11, EPS, 'oval end');
  near(oe.y[0], CROWN + 0.028, EPS, 'oval height');
  near(oe.y[1], CROWN + 0.028, EPS, 'oval is flat');
  const rim = new Set<string>();
  for (const t of oval) {
    for (const v of t) {
      const e = ((v[0] + 0.47) / 0.23) ** 2 + ((v[2] - 10) / 0.11) ** 2;
      if (Math.abs(e) > 1e-9) {
        near(e, 1, 1e-9, 'a rim vertex stands on the ellipse');
        rim.add(`${v[0].toFixed(6)},${v[2].toFixed(6)}`);
      }
    }
  }
  assert.equal(rim.size, 12, 'twelve rim vertices');
  for (let t = 0; t < s.pos.length / 9; t++) {
    if (!same(s.clr[9 * t] as number, col(OVAL).r) || !same(s.clr[9 * t + 1] as number, col(OVAL).g)) continue;
    for (let k = 0; k < 3; k++) near(s.nrm[9 * t + 3 * k + 1] as number, 1, EPS, 'the oval faces up');
  }
});

test('roof hatch: a row turned about (side -1) has its louvres on the -x side and its oval on the +x side; the rest stays', () => {
  const a = new Soup();
  const b = new Soup();
  roofHatch(a, { style: 'electrostar', zc: 10, crown: CROWN, side: 1 });
  roofHatch(b, { style: 'electrostar', zc: 10, crown: CROWN, side: -1 });
  assert.equal(b.pos.length / 9, 52);
  const sx = (s: Soup, hex: number): [number, number] => ext(soupTris(s, hex)).x;
  assert.deepEqual(sx(a, SLOT).map((v) => Math.round(v * 1e6) / 1e6), [0.1925, 0.6875]);
  assert.deepEqual(sx(b, SLOT).map((v) => Math.round(v * 1e6) / 1e6), [-0.6875, -0.1925]);
  assert.deepEqual(sx(a, OVAL).map((v) => Math.round(v * 1e6) / 1e6), [-0.7, -0.24]);
  assert.deepEqual(sx(b, OVAL).map((v) => Math.round(v * 1e6) / 1e6), [0.24, 0.7]);
  assert.deepEqual(sx(a, PLATE), sx(b, PLATE), 'the plate is in the middle either way');
  assert.deepEqual(sx(a, PANEL), sx(b, PANEL), 'the panel spans the roof either way');
});

test('roof hatch: the row stays inside the roof and a few centimetres proud of it', () => {
  const s = new Soup();
  roofHatch(s, { style: 'electrostar', zc: 0, crown: CROWN, side: 1 });
  const e = ext([...soupTris(s, PANEL), ...soupTris(s, SLOT), ...soupTris(s, PLATE), ...soupTris(s, OVAL)]);
  assert.ok(e.y[1] - CROWN <= 0.03 + EPS, `the row stands ${e.y[1] - CROWN} m over the crown, no more than 3 cm`);
  assert.ok(e.y[1] - CROWN >= 0.025 - EPS, 'and at least the panel height');
  // everything but the panel's sloped foot lies within the flat of the roof (0.74 either side)
  const onTop = ext([...soupTris(s, SLOT), ...soupTris(s, PLATE), ...soupTris(s, OVAL)]);
  assert.ok(onTop.x[0] >= -0.74 && onTop.x[1] <= 0.74, `louvres, plate and oval span ${onTop.x} within the flat of the roof`);
});

// --- the pantograph deck ------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('pantograph deck: a flat slab of the well\'s length and the roof\'s flat width, a few millimetres over the crown, with no underside', () => {
  const s = new Soup();
  pantographDeck(s, { style: 'electrostar', k0: 10, k1: 14.45, crown: CROWN });
  const d = soupTris(s, DECK);
  assert.equal(d.length, 10);
  assert.equal(s.pos.length / 9, 10, 'nothing else');
  const e = ext(d);
  near(e.x[0], -0.74, EPS, 'deck, left');
  near(e.x[1], 0.74, EPS, 'deck, right');
  near(e.y[0], CROWN - 0.012, EPS, 'deck foot');
  near(e.y[1], CROWN + 0.004, EPS, 'deck top');
  near(e.z[0], 10, EPS, 'deck start');
  near(e.z[1], 14.45, EPS, 'deck end');
  for (let t = 0; t < 10; t++) assert.ok((s.nrm[9 * t + 1] as number) > -0.5, 'no underside');
});

// --- the cars ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The stretch of a car's roof its hatch rows and covers share (the rule of buildCar, written out): where its nose or its end gap and a margin leave off. */
function roofStretch(car: Car, layout: TrainLayout): [number, number] {
  const interior = (car.cab === 'front' && car.start > 1e-9) || (car.cab === 'rear' && car.end < layout.length - 1e-9);
  const tip = interior ? END_GAP : faceSetback('electrostar');
  const nose = bodySpec('electrostar').nose.length;
  const from = car.cab === 'front' ? car.start + tip + nose + 0.4 : car.start + END_GAP + 0.6;
  const to = car.cab === 'rear' ? car.end - tip - nose - 0.4 : car.end - END_GAP - 0.6;
  return [from, to];
}
/** The z of each hatch row of a car: the plates' triangles, ten to a row, sorted along the car. */
function hatchCentres(g: THREE.Group, car: Car): number[] {
  const plates = meshTris(detailOf(g, car), PLATE).sort((p, q) => meanZ(p) - meanZ(q));
  assert.equal(plates.length % 10, 0, `car ${car.index}: a plate is ten triangles`);
  const out: number[] = [];
  for (let i = 0; i < plates.length; i += 10) {
    const e = ext(plates.slice(i, i + 10));
    near(e.z[1] - e.z[0], 0.36, 1e-4, `car ${car.index}: a plate is 0.36 m long`);
    out.push((e.z[0] + e.z[1]) / 2);
  }
  return out;
}

test('387 roofs: a car without a pantograph has two hatch rows, at 0.3 and 0.7 of the roof between its ends and its nose', () => {
  for (const kind of ['gn387x4', 'gn387x8', 'gn387x12'] as TrainKind[]) {
    const layout = trainLayout(kind);
    const g = built(kind);
    for (const car of layout.cars) {
      if (car.pantograph) continue;
      const [from, to] = roofStretch(car, layout);
      const got = hatchCentres(g, car);
      assert.equal(got.length, 2, `${kind} car ${car.index} (${car.type}) has two rows`);
      near(got[0] as number, from + 0.3 * (to - from), 1e-4, `${kind} car ${car.index}: first row`);
      near(got[1] as number, from + 0.7 * (to - from), 1e-4, `${kind} car ${car.index}: second row`);
      // each row's louvre openings, plate, oval and panel are all there: 20 + 10 + 12 + 10 triangles a row
      const m = detailOf(g, car);
      assert.equal(meshTris(m, SLOT).length, 40, `${kind} car ${car.index}: ten openings a row`);
      assert.equal(meshTris(m, OVAL).length, 24, `${kind} car ${car.index}: an oval a row`);
      assert.equal(meshTris(m, PANEL).length, 20, `${kind} car ${car.index}: a panel a row and no cover`);
    }
  }
});

test('387 roofs: the louvres are on the +x side of a front car and of the cars behind it, on the -x side of a rear cab car', () => {
  const layout = trainLayout('gn387x8');
  const g = built('gn387x8');
  for (const car of layout.cars) {
    const m = detailOf(g, car);
    const slots = ext(meshTris(m, SLOT));
    const oval = ext(meshTris(m, OVAL));
    const side = car.cab === 'rear' ? -1 : 1;
    near(side * (slots.x[0] + slots.x[1]) / 2, 0.44, 1e-6, `car ${car.index} (${car.type}, cab ${car.cab}): louvre cage centre`);
    near(side * (oval.x[0] + oval.x[1]) / 2, -0.47, 1e-6, `car ${car.index}: oval centre`);
  }
});

test('387 roofs: the pantograph car has a deck under the kit, a casing at its car-end side and one hatch row past the well', () => {
  const layout = trainLayout('gn387x4');
  const g = built('gn387x4');
  const car = layout.cars[2] as Car;
  assert.ok(car.pantograph, 'car 2 is the pantograph car');
  const m = detailOf(g, car);
  const [k0, k1] = roofKitSpan('emu', car.pantograph![0], car.pantograph![1], -1);
  // the deck: the well's stretch
  const deck = meshTris(m, DECK);
  assert.equal(deck.length, 10);
  const de = ext(deck);
  near(de.z[0], k0, 1e-4, 'deck start');
  near(de.z[1], k1, 1e-4, 'deck end');
  near(de.x[0], -0.74, 1e-6, 'deck, left');
  near(de.x[1], 0.74, 1e-6, 'deck, right');
  near(de.y[0], CROWN - 0.012, 1e-6, 'deck foot');
  near(de.y[1], CROWN + 0.004, 1e-6, 'deck top');
  // the casing: the car's one raised cover, 1.6 m long, a tenth of a metre short of the kit's end of the well, 0.14 m over the crown (the published 3.77 m), 0.95 either side at its foot and 0.75 at its top
  const casing = meshTris(m, PANEL).filter((t) => t.some((v) => v[1] > CROWN + 0.1));
  const lowPanels = meshTris(m, PANEL).filter((t) => t.every((v) => v[1] <= CROWN + 0.1));
  assert.equal(casing.length + lowPanels.length, meshTris(m, PANEL).length);
  assert.equal(casing.length + lowPanels.filter((t) => t.every((v) => v[1] < CROWN + 0.03)).length, 10 + 10, 'a casing (ten) and one row\'s panel (ten)');
  const ce = ext(meshTris(m, PANEL).filter((t) => t.every((v) => v[2] < k0)));
  near(ce.z[0], k0 - 0.1 - 1.6, 1e-4, 'casing start');
  near(ce.z[1], k0 - 0.1, 1e-4, 'casing end');
  near(ce.x[0], -0.95, 1e-6, 'casing foot, left');
  near(ce.x[1], 0.95, 1e-6, 'casing foot, right');
  near(ce.y[1], 3.77, 1e-6, 'casing top is the published 3.77 m');
  const caseTop = meshTris(m, PANEL).filter((t) => t.every((v) => Math.abs(v[1] - 3.77) < 1e-6));
  assert.equal(caseTop.length, 2, 'the casing has a flat top');
  const te = ext(caseTop);
  near(te.x[0], -0.75, 1e-6, 'casing top, left');
  near(te.x[1], 0.75, 1e-6, 'casing top, right');
  near(te.z[0], k0 - 0.1 - 1.6 + 0.3, 1e-4, 'casing top, start');
  near(te.z[1], k0 - 0.1 - 0.3, 1e-4, 'casing top, end');
  // the hatch rows: the 0.3 row would stand on the casing, so it is left out; the 0.7 row stands past the well, at 54.673
  const got = hatchCentres(g, car);
  assert.equal(got.length, 1);
  const [from, to] = roofStretch(car, layout);
  near(got[0] as number, from + 0.7 * (to - from), 1e-4, 'the one row, at 0.7');
  near(got[0] as number, 54.673, 1e-3, 'the one row, 54.673 m from the nose');
  assert.ok((got[0] as number) - 0.25 >= k1 + 0.1 - 1e-6, 'a tenth of a metre clear of the well');
  assert.equal(meshTris(m, SLOT).length, 20);
  assert.equal(meshTris(m, OVAL).length, 12);
});

test('387 roofs: every pantograph car of a coupled train has its casing and deck by its own pantograph, and a hatch row clear of both', () => {
  for (const kind of ['gn387x8', 'gn387x12'] as TrainKind[]) {
    const layout = trainLayout(kind);
    const g = built(kind);
    const pans = layout.cars.filter((c) => c.pantograph);
    assert.equal(pans.length, kind === 'gn387x8' ? 2 : 3, `${kind}: one pantograph car a unit`);
    for (const car of pans) {
      const m = detailOf(g, car);
      const [k0, k1] = roofKitSpan('emu', car.pantograph![0], car.pantograph![1], -1);
      const de = ext(meshTris(m, DECK));
      near(de.z[0], k0, 1e-3, `${kind} car ${car.index} deck start`);
      near(de.z[1], k1, 1e-3, `${kind} car ${car.index} deck end`);
      const casing = ext(meshTris(m, PANEL).filter((t) => t.some((v) => v[1] > CROWN + 0.1)));
      near(casing.z[0], k0 - 1.7, 1e-3, `${kind} car ${car.index} casing start`);
      near(casing.z[1], k0 - 0.1, 1e-3, `${kind} car ${car.index} casing end`);
      for (const zc of hatchCentres(g, car)) assert.ok(zc - 0.25 >= k1 + 0.1 - 1e-6 || zc + 0.25 <= k0 - 1.7 - 0.1 + 1e-6, `${kind} car ${car.index}: a row at ${zc} is clear of the casing and the well`);
    }
  }
});

test('387 roofs: no raised cover stands on a car without a pantograph, and nothing on any car stands over the published 3.77 m', () => {
  for (const kind of ['gn387x4', 'gn387x8', 'gn387x12'] as TrainKind[]) {
    const layout = trainLayout(kind);
    const g = built(kind);
    for (const car of layout.cars) {
      const m = detailOf(g, car);
      const high = meshTris(m, PANEL).filter((t) => t.some((v) => v[1] > CROWN + 0.03));
      assert.equal(high.length, car.pantograph ? 10 : 0, `${kind} car ${car.index} (${car.type}): ${high.length} high cover triangles`);
      // the roof's own detail: the hatch parts, the deck and the casing; the kit's insulators stand lower than the casing (0.13 m over the crown)
      for (const hex of [SLOT, PLATE, OVAL, DECK, PANEL]) for (const t of meshTris(m, hex)) for (const v of t) assert.ok(v[1] <= 3.77 + 1e-6, `${kind} car ${car.index}: a roof part at ${v[1]}`);
    }
  }
});

test('387 roofs: the hatch rows of a car are clear of each other and of the car ends', () => {
  const layout = trainLayout('gn387x4');
  const g = built('gn387x4');
  for (const car of layout.cars) {
    const zs = hatchCentres(g, car);
    for (let i = 0; i < zs.length; i++) {
      assert.ok((zs[i] as number) - 0.25 > car.start + END_GAP && (zs[i] as number) + 0.25 < car.end - END_GAP, `car ${car.index}: a row at ${zs[i]} inside the car`);
      if (i > 0) assert.ok((zs[i] as number) - (zs[i - 1] as number) >= 5, `car ${car.index}: the rows are ${(zs[i] as number) - (zs[i - 1] as number)} m apart`);
    }
  }
});

test('roof hatches: only the Electrostar has them; the other families keep their own roofs', () => {
  assert.notEqual(bodySpec('electrostar').roofHatches, undefined);
  assert.deepEqual(bodySpec('electrostar').roofHatches, { style: 'electrostar' });
  for (const fam of ['at300', 'adelante'] as const) assert.equal(bodySpec(fam).roofHatches, undefined, `${fam} has no hatch rows`);
  // the 387 is the one train of the Electrostar family
  for (const [kind, spec] of Object.entries(TRAIN_SPECS)) assert.equal(spec.family === 'electrostar', kind.startsWith('gn387'), kind);
});
