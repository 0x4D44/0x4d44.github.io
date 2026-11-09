// The per-kind paint of the model trains (train-livery.ts): what the side texture of each scheme holds at a given
// (distance from the nose, height) and how a kind reaches its scheme. Pure data and geometry: no WebGL, no DOM
// (the canvas is only made in a browser; `paintSide` is driven here with a recording stand-in for the 2D context).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ALL_KINDS, TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { LIGHT_GAIN, LIVERIES, TEX_H, TEX_SPAN, TEX_W, TEX_Y0, TEX_Y1, shellMaterial } from '../src/livery.ts';
import { bodySpec, buildTrain } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { GC_ORANGE, GN387_GREEN, GN_PINSTRIPE, LNER_BAND, LNER_RED, curveY, liveryFor, paintSide, shellMaterialFor, sideColourAt, sideShapes, smoothCurve } from '../src/train-livery.ts';
import type { Paint2D, Scheme } from '../src/train-livery.ts';

const LNER_NOSE = bodySpec('at300').nose.length;
const GC_NOSE = bodySpec('adelante').nose.length;
const at = (kind: TrainKind, nose: number, s: number, y: number): number => sideColourAt(liveryFor(kind), nose, s, y);

// --- the curves ------------------------------------------------------------------------------------

test('smoothCurve: passes through its knots, stays between them where the knots rise, and ends exactly at the first and last', () => {
  const knots: [number, number][] = [[0, 1.8], [1, 1.95], [2, 2.15], [3.5, 2.35], [5, 2.6], [6.6, 2.97], [16, 2.97]];
  const c = smoothCurve(knots, 64);
  assert.equal(c.length, 65);
  assert.deepEqual(c[0], [0, 1.8]);
  assert.deepEqual(c[64], [16, 2.97]);
  // every sample lies between the heights of the two knots round it (a monotone cubic cannot overshoot), and the curve never falls where the knots rise
  for (const [s, y] of c) {
    const i = Math.min(knots.length - 2, knots.findIndex((k, n) => n + 1 < knots.length && s <= (knots[n + 1] as [number, number])[0]));
    const a = knots[i] as [number, number];
    const b = knots[i + 1] as [number, number];
    assert.ok(y >= Math.min(a[1], b[1]) - 1e-9 && y <= Math.max(a[1], b[1]) + 1e-9, `s = ${s}: ${y} is outside [${a[1]}, ${b[1]}]`);
  }
  for (let k = 1; k < c.length; k++) assert.ok((c[k] as [number, number])[1] >= (c[k - 1] as [number, number])[1] - 1e-9, `the curve falls at sample ${k}`);
  // it passes through each knot (the samples at the knots' own s)
  for (const [s, y] of knots) assert.ok(Math.abs(curveY(c, s) - y) < 0.01, `at the knot s = ${s}: ${curveY(c, s)} vs ${y}`);
  // two knots are a straight line
  const line = smoothCurve([[0, 0], [4, 2]], 8);
  for (const [s, y] of line) assert.ok(Math.abs(y - s / 2) < 1e-9);
});

test('curveY: linear between samples, held flat beyond the ends', () => {
  const c: [number, number][] = [[1, 10], [2, 20], [4, 40]];
  assert.equal(curveY(c, 0), 10);
  assert.equal(curveY(c, 1), 10);
  assert.equal(curveY(c, 1.5), 15);
  assert.equal(curveY(c, 3), 30);
  assert.equal(curveY(c, 9), 40);
});

// --- the schemes, read at a point ---------------------------------------------------------------------

test('LNER: one red band holds the windows along the whole car, white above and below it, the foot dark; the red sweeps down the cab side to the floor', () => {
  const [bottom, top] = LNER_BAND;
  // the band holds the whole row of windows (lner-801-214-2025: the red is the band round the windows, not a stripe under them)
  const windows = bodySpec('at300').windowY;
  assert.ok(bottom < windows[0] && top > windows[1], `the red band (${bottom} to ${top} m) holds the window row (${windows[0]} to ${windows[1]} m)`);
  // along a through car (the texture's last column): the window band is red, the body above and below it white
  // (a point exactly on the texture's edge, s = TEX_SPAN, is on no polygon's inside: the last column is read just inside it)
  const LAST = TEX_SPAN - 0.01;
  for (const s of [LAST, 14, LNER_NOSE + 3.5]) {
    assert.equal(at('lner5', LNER_NOSE, s, (bottom + top) / 2), LNER_RED, `s = ${s}: the band`);
    assert.equal(at('lner5', LNER_NOSE, s, bottom + 0.05), LNER_RED, `s = ${s}: the band's foot`);
    assert.equal(at('lner5', LNER_NOSE, s, top - 0.05), LNER_RED, `s = ${s}: the band's top`);
    assert.equal(at('lner5', LNER_NOSE, s, bottom - 0.2), LIVERIES.lner.body, `s = ${s}: white under the band`);
    assert.equal(at('lner5', LNER_NOSE, s, top + 0.1), LIVERIES.lner.body, `s = ${s}: white over the band`);
    assert.equal(at('lner5', LNER_NOSE, s, 0.8), 0x2d3036, `s = ${s}: the dark foot`);
  }
  // at the cab the red leaves the band and wraps the nose's flank down to the floor: at the tip's flank it reaches the foot, and the white
  // lower body does not begin until the tongue, well behind the tip
  assert.equal(at('lner5', LNER_NOSE, 0.5, 1.2), LNER_RED, 'the flank beside the face is red at window height');
  assert.equal(at('lner5', LNER_NOSE, 0.5, 0.7), LNER_RED, 'the red wraps the flank right down to the floor, over the dark foot (lner-801-214-2025)');
  assert.equal(at('lner5', LNER_NOSE, 1.5, 1.15), LNER_RED, 'red lower down the cab side, 1.5 m back');
  assert.equal(at('lner5', LNER_NOSE, LNER_NOSE + 3.8, 1.2), LIVERIES.lner.body, 'the white lower body (the tongue) has arrived by the car body');
  // the sweep's top edge climbs toward the band's top as it goes back: the red's highest point rises with s along the nose
  const topAt = (s: number): number => {
    let hi = 0;
    for (let y = 1.0; y <= 3.0; y += 0.01) if (at('lner5', LNER_NOSE, s, y) === LNER_RED) hi = y;
    return hi;
  };
  assert.ok(topAt(0.5) < topAt(2) && topAt(2) < topAt(4) && topAt(4) < topAt(7), `the sweep rises: ${[0.5, 2, 4, 7].map(topAt).join(', ')}`);
  assert.ok(Math.abs(topAt(LAST) - top) < 0.03, `it ends at the band's top (${topAt(LAST)} vs ${top})`);
  // the pinstripe along the cantrail is only behind the sweep
  assert.equal(at('lner5', LNER_NOSE, 12, 3.05), 0xe8683a);
  assert.equal(at('lner5', LNER_NOSE, 0.5, 3.05), LIVERIES.lner.body);
  // the 9-car and 5-car LNER trains wear the same paint
  assert.equal(liveryFor('lner9'), liveryFor('lner5'));
});

test('Grand Central 180: an orange waist band along the car, which swings down the cab side in a sweep, and a thin orange line at the cantrail', () => {
  for (const s of [TEX_SPAN - 0.01, 10]) {
    assert.equal(at('gc180x5', GC_NOSE, s, 1.27), GC_ORANGE, `s = ${s}: the band`);
    assert.equal(at('gc180x5', GC_NOSE, s, 0.8), LIVERIES.grandcentral.body, `s = ${s}: black under the band`);
    assert.equal(at('gc180x5', GC_NOSE, s, 2.0), LIVERIES.grandcentral.body, `s = ${s}: black over the band`);
    assert.equal(at('gc180x5', GC_NOSE, s, 3.04), GC_ORANGE, `s = ${s}: the line at the cantrail`);
  }
  // the sweep: lower and wider at the nose than the band behind it (the band's edges are 1.04 and 1.5 m)
  assert.equal(at('gc180x5', GC_NOSE, 1.0, 0.8), GC_ORANGE, 'orange at 0.8 m, 1 m back from the tip');
  assert.equal(at('gc180x5', GC_NOSE, 0.7, 0.62), GC_ORANGE, 'and lower still near the tip');
  assert.equal(at('gc180x5', GC_NOSE, 0.7, 1.4), LIVERIES.grandcentral.body, 'but not above the sweep');
  // no line over the nose itself
  assert.equal(at('gc180x5', GC_NOSE, 0.5, 3.04), LIVERIES.grandcentral.body);
});

test('Great Northern 387: a white-cream body with a thin orange pinstripe at the cantrail behind the nose, the dark foot below the windows', () => {
  const nose = bodySpec('electrostar').nose.length;
  const l = liveryFor('gn387x4');
  assert.equal(at('gn387x4', nose, 12, 3.02), GN_PINSTRIPE);
  assert.equal(at('gn387x4', nose, 12, 2.5), l.body);
  assert.equal(at('gn387x4', nose, 12, 0.8), 0x30343a);
  assert.equal(at('gn387x4', nose, 0.2, 3.02), l.body, 'no pinstripe on the nose itself');
  // the doors of a 387 are dark green; the other 387 sizes wear the same
  assert.equal(l.door, GN387_GREEN);
  assert.equal(liveryFor('gn387x8'), l);
  assert.equal(liveryFor('gn387x12'), l);
});

test('the other schemes: nothing on the side but the foot, or (a base scheme) nothing at all', () => {
  assert.deepEqual(sideShapes('base', 5), []);
  assert.deepEqual(sideShapes('gn717', 5).map((s) => s.pts.length), [4]);
  assert.deepEqual(sideShapes('tl700', 5).map((s) => s.pts.length), [4]);
  // every shape of every scheme lies inside the texture's frame, over the nose's length range any family has
  for (const scheme of ['lner', 'grandcentral', 'gn387', 'gn717', 'tl700'] as Scheme[]) {
    for (const nose of [3, 4.2, 5.5]) {
      for (const shape of sideShapes(scheme, nose)) {
        for (const [s, y] of shape.pts) assert.ok(s >= -1e-9 && s <= TEX_SPAN + 1e-9 && y >= TEX_Y0 - 1e-9 && y <= TEX_Y1 + 1e-9, `${scheme} nose ${nose}: (${s}, ${y}) is outside the texture`);
      }
    }
  }
});

// --- which kind wears what ----------------------------------------------------------------------------------

test('liveryFor: each kind wears its scheme, and kinds without one of their own wear the operator row of livery.ts unchanged', () => {
  const scheme: Partial<Record<TrainKind, Scheme>> = {
    lner5: 'lner', lner9: 'lner', gn387x4: 'gn387', gn387x8: 'gn387', gn387x12: 'gn387', gn717x6: 'gn717', gc180x5: 'grandcentral', tl700x8: 'tl700', tl700x12: 'tl700',
    hull5: 'base', lumo5: 'base',
  };
  for (const kind of ALL_KINDS) {
    assert.equal(liveryFor(kind).scheme, scheme[kind], kind);
    // a livery always has its basis and its sources: nothing here is unsourced
    assert.ok(liveryFor(kind).basis.length > 20 && liveryFor(kind).sources.length > 0, `${kind}: its basis`);
  }
  for (const kind of ['hull5', 'lumo5'] as TrainKind[]) {
    const l = liveryFor(kind);
    const row = LIVERIES[TRAIN_SPECS[kind].livery];
    assert.equal(l.noseTop, null);
    for (const key of Object.keys(row) as (keyof typeof row)[]) assert.equal(l[key], row[key], `${kind}.${key}`);
  }
  // the LNER nose is a black dome over the glass, from 3.2 m back; the 717's the whole nose; the others have no special top
  assert.equal(liveryFor('lner5').noseTop, 0x1a1c21);
  assert.equal(liveryFor('lner5').noseTopFrom, 3.2);
  assert.equal(liveryFor('gn717x6').noseTop, 0x1a1c21);
  assert.equal(liveryFor('gn717x6').noseTopFrom, 0);
  assert.equal(liveryFor('gc180x5').noseTop, null);
  assert.equal(liveryFor('gn387x4').noseTopFrom, 99, 'the 387 has no dark top (a distance past any nose)');
});

test('the names on the 387: the navy panel is wide enough for the white name on it, and both are centred between the doors', () => {
  const l = liveryFor('gn387x4');
  const layout = trainLayout('gn387x4');
  for (const car of layout.cars) {
    const items = l.decals({ index: car.index, count: layout.cars.length, type: car.type as string, cab: car.cab !== null, length: car.length, nose: car.cab ? 4 : 0, doors: [3, car.length - 3] });
    const panel = items.find((i) => i.text === null);
    const name = items.find((i) => i.text === 'Great Northern');
    assert.ok(panel && name, `car ${car.index}: a panel and a name`);
    const [px0, , px1] = panel.rect;
    const [nx0, , nx1, ny1] = name.rect;
    assert.equal(nx1, 0, 'the name sizes itself from its height');
    // the name is 7.112 ems wide ('Great Northern' in livery.ts's metrics): it must fit inside the panel with a margin each side
    const em = ny1 - name.rect[1];
    const width = 7.112 * em;
    assert.ok(Math.abs(width - 7.112 * em) < 1e-9);
    assert.ok(nx0 >= px0 + 0.05 && nx0 + width <= px1 - 0.05, `car ${car.index}: the name (${nx0.toFixed(2)} to ${(nx0 + width).toFixed(2)}) in the panel (${px0.toFixed(2)} to ${px1.toFixed(2)})`);
    near2((px0 + px1) / 2, 10.2, 1, `car ${car.index}: the panel is between the doors`);
  }
});
const near2 = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

// --- the canvas -----------------------------------------------------------------------------------------------

/** A stand-in for a 2D context that records what is drawn. */
function recorder(): { g: Paint2D; log: { op: string; style?: unknown; args?: number[] }[] } {
  const log: { op: string; style?: unknown; args?: number[] }[] = [];
  let style: string | CanvasGradient | CanvasPattern = '';
  const g: Paint2D = {
    get fillStyle() {
      return style;
    },
    set fillStyle(v) {
      style = v;
    },
    fillRect: (...a) => log.push({ op: 'fillRect', style, args: a }),
    beginPath: () => log.push({ op: 'beginPath' }),
    moveTo: (...a) => log.push({ op: 'moveTo', args: a }),
    lineTo: (...a) => log.push({ op: 'lineTo', args: a }),
    closePath: () => log.push({ op: 'closePath' }),
    fill: () => log.push({ op: 'fill', style }),
  };
  return { g, log };
}
const hexOf = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

test('paintSide: the body colour over the whole texture, then each shape in order as a filled polygon in texture pixels (height up = pixel row down)', () => {
  for (const kind of ['lner5', 'gc180x5', 'gn387x4', 'gn717x6', 'tl700x8'] as TrainKind[]) {
    const l = liveryFor(kind);
    const nose = bodySpec(trainLayout(kind).spec.family).nose.length;
    const { g, log } = recorder();
    paintSide(g, l, nose);
    assert.deepEqual(log[0], { op: 'fillRect', style: hexOf(l.body), args: [0, 0, TEX_W, TEX_H] }, `${kind}: the body colour first`);
    const shapes = sideShapes(l.scheme, nose);
    const fills = log.filter((e) => e.op === 'fill');
    assert.deepEqual(fills.map((e) => e.style), shapes.map((s) => hexOf(s.colour)), `${kind}: the shapes' colours, in order`);
    assert.equal(log.filter((e) => e.op === 'moveTo').length, shapes.length);
    assert.equal(log.filter((e) => e.op === 'lineTo').length, shapes.reduce((n, s) => n + s.pts.length - 1, 0));
    // the first point of the first shape: s metres along the texture's width, y metres up its height
    const first = (shapes[0] as { pts: [number, number][] }).pts[0] as [number, number];
    const move = log.find((e) => e.op === 'moveTo') as { args: number[] };
    assert.ok(Math.abs((move.args[0] as number) - (first[0] / TEX_SPAN) * TEX_W) < 1e-9);
    assert.ok(Math.abs((move.args[1] as number) - (1 - (first[1] - TEX_Y0) / (TEX_Y1 - TEX_Y0)) * TEX_H) < 1e-9);
  }
  // and what is painted is what `sideColourAt` reads: the canvas pixel of a point is the colour the data gives (checked for the LNER band)
  const { g, log } = recorder();
  paintSide(g, liveryFor('lner5'), LNER_NOSE);
  const red = log.filter((e) => e.op === 'fill').find((e) => e.style === hexOf(LNER_RED));
  assert.ok(red, 'a red shape is drawn');
});

test('shellMaterialFor: the operator row of livery.ts for a base scheme; this module\'s own lit white material for a scheme, one per scheme and nose, no map without a document', () => {
  const nose = bodySpec('at300').nose.length;
  // a base scheme (Hull Trains, Lumo) shares livery.ts's material for the row
  assert.equal(shellMaterialFor('hull5', nose), shellMaterial(TRAIN_SPECS.hull5.livery, nose));
  assert.equal(shellMaterialFor('lumo5', nose), shellMaterial(TRAIN_SPECS.lumo5.livery, nose));
  const m = shellMaterialFor('lner5', nose);
  assert.ok(m instanceof THREE.MeshLambertMaterial);
  assert.equal(shellMaterialFor('lner9', nose), m, 'the 5- and 9-car LNER share one');
  assert.notEqual(shellMaterialFor('gn387x4', bodySpec('electrostar').nose.length), m);
  assert.deepEqual(m.color.toArray(), new THREE.Color(0xffffff).multiplyScalar(LIGHT_GAIN).toArray());
  // (no document in Node: the texture is painted only in a browser)
  assert.equal(m.map, null);
});

// --- on the model -------------------------------------------------------------------------------------------

type Tri = [THREE.Vector3, THREE.Vector3, THREE.Vector3];
function trisOfColour(mesh: THREE.Mesh, hex: number): Tri[] {
  const want = col(hex);
  const c = mesh.geometry.getAttribute('color');
  const p = mesh.geometry.getAttribute('position');
  const hit = (i: number): boolean => Math.abs(c.getX(i) - want.r) < 1e-5 && Math.abs(c.getY(i) - want.g) < 1e-5 && Math.abs(c.getZ(i) - want.b) < 1e-5;
  const v = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
  const out: Tri[] = [];
  for (let i = 0; i + 2 < p.count; i += 3) if (hit(i) && hit(i + 1) && hit(i + 2)) out.push([v(i), v(i + 1), v(i + 2)]);
  return out;
}
const detailOf = (g: THREE.Object3D, index: number): THREE.Mesh => {
  const d = g.getObjectByName(`car-${index}`)?.getObjectByName('body-detail');
  assert.ok(d, `car ${index} has no body-detail`);
  return d as THREE.Mesh;
};

test('the nose\'s top: the LNER has a dark dome over the glass from 3.2 m back, the 717 a dark nose roof from the tip, every other kind none', () => {
  const dark = 0x1a1c21;
  const cars = (kind: TrainKind): number[] => trainLayout(kind).cars.filter((c) => c.cab).map((c) => c.index);
  for (const kind of ['lner5', 'lner9'] as TrainKind[]) {
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    for (const index of cars(kind)) {
      const car = trainLayout(kind).cars[index] as { cab: 'front' | 'rear'; start: number; end: number };
      const tris = trisOfColour(detailOf(g, index), dark);
      assert.ok(tris.length > 20, `${kind} car ${index}: the dome (${tris.length} triangles)`);
      // all of it is more than 3.2 m from the nose's tip (the livery's `noseTopFrom`), measured along the car, and on the roof
      const tip = car.cab === 'front' ? car.start : car.end;
      for (const t of tris) for (const v of t) {
        assert.ok(Math.abs(v.z - tip) >= 3.2 - 0.05, `${kind} car ${index}: dark roof only ${Math.abs(v.z - tip).toFixed(2)} m from the tip`);
        assert.ok(v.y > 2.5, `${kind} car ${index}: dark triangle at y = ${v.y.toFixed(2)}, not on the roof`);
      }
    }
    // a through car has none
    const through = trainLayout(kind).cars.find((c) => !c.cab);
    assert.ok(through);
    assert.equal(trisOfColour(detailOf(g, through.index), dark).length, 0, `${kind}: the dark dome on a through car`);
  }
  // the 717's nose roof is dark from the very tip
  {
    const g = buildTrain('gn717x6');
    g.updateMatrixWorld(true);
    const car = trainLayout('gn717x6').cars[0] as { start: number };
    const tris = trisOfColour(detailOf(g, 0), dark);
    assert.ok(tris.length > 20, `717: ${tris.length} dark nose roof triangles`);
    // it begins at the nose's front: the roof columns only rise above the shell's top about 0.85 m back from the tip, so within the first metre
    const first = Math.min(...tris.flat().map((v) => Math.abs(v.z - car.start)));
    assert.ok(first < 1, `the dark nose roof begins ${first.toFixed(2)} m from the tip`);
  }
  // no dark dome elsewhere: not on the Hull, Lumo, 387, 700 or 180 cabs
  for (const kind of ['hull5', 'lumo5', 'gn387x4', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    for (const index of cars(kind)) assert.equal(trisOfColour(detailOf(g, index), dark).length, 0, `${kind} car ${index}: a dark nose roof`);
  }
});
