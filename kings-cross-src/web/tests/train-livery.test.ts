// The per-kind paint of the model trains (train-livery.ts): what the side texture of each scheme holds at a given
// (distance from the nose, height) and how a kind reaches its scheme. Pure data and geometry: no WebGL, no DOM
// (the canvas is only made in a browser; `paintSide` is driven here with a recording stand-in for the 2D context).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { ALL_KINDS, TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { LIGHT_GAIN, LIVERIES, TEX_H, TEX_SPAN, TEX_W, TEX_Y0, TEX_Y1, shellMaterial } from '../src/livery.ts';
import { NOSE_RECESS, bodySpec, buildTrain, carSection, frontOf } from '../src/train.ts';
import { eggSection, halfAt, normalised, ringAt, ringStations } from '../src/train-nose.ts';
import { col } from '../src/train-geom.ts';
import { MASK_700, MASK_717 } from '../src/train-face.ts';
import { GC_ORANGE, GN387_GREEN, GN_PINSTRIPE, HULL_BAND, HULL_BAND_STEPS, HULL_BAND_STOPS, HULL_BEAK, HULL_BLUE, HULL_CYAN, HULL_DOOR, LNER_BAND, LNER_RED, curveY, hullBandColour, liveryFor, paintSide, shellMaterialFor, sideColourAt, sideShapes, smoothCurve } from '../src/train-livery.ts';
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

test('LNER: one red band holds the windows along the whole car, white above and below it, the foot dark; at the cab it swings forward and down in a red wing round the cab side window, white below its crescent, with a red cheek by the face', () => {
  // CHANGED (the red was a band 1.45 m tall that swept down the whole cab flank to the floor, so the train read two thirds red): lner-801-214-2025 (a close crop of its first
  // car) and lner-800-doncaster-2026 show a white-silver train with a red band about 1.1 m tall round the windows, a red wing round the cab side window whose lower edge is a pale
  // crescent, the nose's lower flank white-silver, and the red coming back only as a cheek strip beside the face
  const [bottom, top] = LNER_BAND;
  // the band holds the whole row of windows (lner-801-214-2025: the red is the band round the windows, not a stripe under them)
  const windows = bodySpec('at300').windowY;
  assert.ok(bottom < windows[0] && top > windows[1], `the red band (${bottom} to ${top} m) holds the window row (${windows[0]} to ${windows[1]} m)`);
  // a low row, as the photographs show it (lner-801-214-2025: 0.62 m; lner-800-doncaster-2026: 0.68 m), with a hand's breadth of red above the glass and under it
  const glass = windows[1] - windows[0];
  assert.ok(glass > 0.55 && glass < 0.72, `the window row is ${glass.toFixed(2)} m tall`);
  assert.ok(top - windows[1] >= 0.08 && windows[0] - bottom >= 0.08, `a hand's breadth of red over the glass (${(top - windows[1]).toFixed(2)} m) and under it (${(windows[0] - bottom).toFixed(2)} m)`);
  // and is not most of the side: between the underframe's top (1.0 m) and the roof edge (3.35 m) it is 33% to 45% of the height (lner-801-214-2025 measured again against the cantrail's
  // pinstripe: 37%; lner-800-doncaster-2026: 44%). It was 48%, reaching the top of the wall, and a side view read red above and white below: the round 3 score's "inverted".
  const share = (top - bottom) / (3.35 - 1.0);
  assert.ok(share > 0.33 && share < 0.45, `the red band is ${(share * 100).toFixed(0)}% of the side's height`);
  // white-silver over it, a good third of a metre of wall and roof shoulder, so the side reads as a white car with a red band and not a red car over a white skirt
  assert.ok(3.35 - top >= 0.5, `white over the band: the roof edge is ${(3.35 - top).toFixed(2)} m over its top`);
  assert.ok(bottom - 1.0 >= 0.8, `and white under it: the equipment cover is ${(bottom - 1.0).toFixed(2)} m under its foot`);
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
  // the cheek: a red strip beside the face from the nose's foot up under the lamp window
  assert.equal(at('lner5', LNER_NOSE, 0.4, 0.7), LNER_RED, 'the cheek reaches the nose\'s foot');
  assert.equal(at('lner5', LNER_NOSE, 0.4, 1.2), LNER_RED, 'the cheek beside the lamp window');
  // behind it the whole lower flank is white-silver, down to the floor (lner-801-214-2025), and so is the shoulder in front of and above the wing
  assert.equal(at('lner5', LNER_NOSE, 1.5, 0.7), LIVERIES.lner.body, 'white at the foot of the flank, 1.5 m back');
  assert.equal(at('lner5', LNER_NOSE, 1.5, 1.15), LIVERIES.lner.body, 'white lower down the cab side, 1.5 m back');
  assert.equal(at('lner5', LNER_NOSE, 2.5, 1.2), LIVERIES.lner.body, 'white under the crescent, 2.5 m back');
  assert.equal(at('lner5', LNER_NOSE, 1.5, 2.6), LIVERIES.lner.body, 'white in front of and above the wing: the shoulder');
  // the wing: red over the cab side window, its upper edge climbing as it goes back and a little over the band's top at the crew door, its lower edge (the crescent) falling to the cheek
  assert.equal(at('lner5', LNER_NOSE, 2.5, 2.2), LNER_RED, 'the wing, over the cab side window');
  assert.equal(at('lner5', LNER_NOSE, LNER_NOSE + 0.2, 3.05), LNER_RED, 'the wing is over the band\'s top at the crew door');
  assert.equal(at('lner5', LNER_NOSE, LNER_NOSE + 0.2, 1.9), LNER_RED, 'and the band\'s foot is 1.8 m at the crew door');
  // the pale crescent under the wing's lower edge (a broad one, 12 cm, at the cab), and a thin line (4 cm) under the band's foot behind it (lner-801-214-2025)
  const CRESCENT = 0xb5bbc2;
  assert.equal(at('lner5', LNER_NOSE, 2.3, 1.64), CRESCENT, 'the crescent under the wing');
  assert.equal(at('lner5', LNER_NOSE, LAST, bottom - 0.02), CRESCENT, 'the thin pale line under the band\'s foot');
  assert.equal(at('lner5', LNER_NOSE, LAST, bottom - 0.08), LIVERIES.lner.body, 'and white below it');
  const topAt = (s: number): number => {
    let hi = 0;
    for (let y = 1.0; y <= 3.3; y += 0.01) if (at('lner5', LNER_NOSE, s, y) === LNER_RED) hi = y;
    return hi;
  };
  const footAt = (s: number): number => {
    let lo = 9;
    for (let y = 1.0; y <= 3.3; y += 0.01) if (at('lner5', LNER_NOSE, s, y) === LNER_RED) { lo = y; break; }
    return lo;
  };
  assert.ok(topAt(1.5) < topAt(2.5) && topAt(2.5) < topAt(3.5), `the wing's upper edge rises: ${[1.5, 2.5, 3.5].map(topAt).join(', ')}`);
  assert.ok(footAt(1.5) < footAt(2.5) && footAt(2.5) < footAt(LNER_NOSE + 0.4), `the crescent climbs to the band's foot: ${[1.5, 2.5, LNER_NOSE + 0.4].map(footAt).join(', ')}`);
  assert.ok(Math.abs(topAt(LAST) - top) < 0.03 && Math.abs(footAt(LAST) - bottom) < 0.03, `the red ends as the band (${footAt(LAST)} to ${topAt(LAST)} vs ${bottom} to ${top})`);
  // the pinstripe along the cantrail is only behind the wing
  assert.equal(at('lner5', LNER_NOSE, 12, 3.05), 0xe8683a);
  assert.equal(at('lner5', LNER_NOSE, 0.5, 3.05), LIVERIES.lner.body);
  // the 9-car and 5-car LNER trains wear the same paint
  assert.equal(liveryFor('lner9'), liveryFor('lner5'));
});

test('LNER: the cheek\'s back edge is one smooth curve through the photographs\' readings, turning no more than 15 degrees in 5 cm, and not five straight sides', () => {
  // CHANGED round 5: the round-4 score found "white spikes" along the red and yellow edges. The cheek was a polygon through five readings (turns of 23 and 37 degrees at its corners, which
  // the nose's flank shows as facets); it is a smooth curve through the same five readings now (s as a function of y), turning 10 degrees at most in 5 cm.
  const edge = (y: number): number => {
    // the back edge of the red at height y: red from the face back to it, then the white (or the pale crescent), so the edge is found by halving
    let lo = 0.02;
    let hi = 1.6;
    assert.equal(at('lner5', LNER_NOSE, lo, y), LNER_RED, `red beside the face at ${y} m`);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (at('lner5', LNER_NOSE, mid, y) === LNER_RED) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  // (above 1.35 m the red is the wing's foot too, whose lower edge is the crescent's: the cheek's own edge is read up to there)
  const rows: number[] = [];
  for (let y = 0.5; y <= 1.3501; y += 0.05) rows.push(Math.round(y * 100) / 100);
  const back = rows.map(edge);
  let sharpest = 0;
  for (let i = 1; i + 1 < rows.length; i++) {
    const before = Math.atan2((back[i] as number) - (back[i - 1] as number), 0.05);
    const after = Math.atan2((back[i + 1] as number) - (back[i] as number), 0.05);
    sharpest = Math.max(sharpest, (Math.abs(after - before) * 180) / Math.PI);
  }
  assert.ok(sharpest < 15, `the cheek's back edge turns ${sharpest.toFixed(1)} degrees in 5 cm`);
  // through the readings of lner-801-214-2025 and lner-800-113-newcastle-2025 (the back edge's s at a height, ASSUMED to 5 mm): 0.80 m at 0.75 m up, 0.92 m at 1.05 m, 0.85 m at 1.3 m
  for (const [y, s] of [[0.75, 0.8], [1.05, 0.92], [1.3, 0.85]] as [number, number][]) assert.ok(Math.abs(edge(y) - s) < 0.005, `the cheek's edge at ${y} m up is ${edge(y).toFixed(3)} m back, the reading ${s} m`);
  // a rounded bulge: out from the nose's foot, widest at about a metre up, in again toward the lamp window
  const widest = Math.max(...back);
  const atFoot = back[0] as number;
  const atTop = back[back.length - 1] as number;
  assert.ok(atFoot < widest - 0.3 && atTop < widest - 0.05, `the edge swells to ${widest.toFixed(2)} m back from ${atFoot.toFixed(2)} at the foot and ${atTop.toFixed(2)} at the top`);
  assert.equal(at('lner5', LNER_NOSE, 0.3, 1.49), LNER_RED, 'the cheek reaches 1.5 m up beside the face');
  assert.notEqual(at('lner5', LNER_NOSE, 0.3, 1.52), LNER_RED, 'and no higher');
});

test('the nose\'s dark cap starts where the windscreen ends: the LNER\'s and Lumo\'s `noseTopFrom` is the glass\'s top edge (glass.screen.s1), whatever the screen\'s size', () => {
  const screen = bodySpec('at300').glass.screen;
  assert.ok(screen, 'the AT300 has a windscreen');
  for (const kind of ['lner5', 'lner9', 'lumo5'] as TrainKind[]) assert.equal(liveryFor(kind).noseTopFrom, screen.s1, `${kind}: the cap begins at the glass's top edge`);
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

test('Hull Trains 802: a blue body with a cyan sweep up the cab side, a spectrum band in steps along each car under the windows, red doors, a grey beak over blue cheeks', () => {
  const nose = bodySpec('at300').nose.length;
  const l = liveryFor('hull5');
  assert.equal(l.body, HULL_BLUE);
  assert.equal(l.door, HULL_DOOR);
  // the doors are red, not the magenta one unopened snippet said (the photographs show red and pink-red): the red channel leads, blue is behind it
  assert.ok(((HULL_DOOR >> 16) & 255) > ((HULL_DOOR & 255) + 0x40) && ((HULL_DOOR >> 8) & 255) < 0x50, 'a red door');
  // the cab sweep: cyan low on the nose's flank, climbing to the band's height by the door; blue body above it; the dark foot below
  assert.equal(at('hull5', nose, 1.5, 0.76), HULL_CYAN, 'the sweep, 1.5 m from the tip');
  assert.equal(at('hull5', nose, 1.5, 1.6), HULL_BLUE, 'blue over the sweep');
  assert.equal(at('hull5', nose, nose + 0.5, (HULL_BAND[0] + HULL_BAND[1]) / 2), HULL_CYAN, 'the sweep arrives at the band by the cab door');
  assert.equal(at('hull5', nose, 12, 0.7), 0x23262b, 'the dark foot');
  assert.equal(at('hull5', nose, 12, 2.0), HULL_BLUE, 'blue body above the band: along the car the band is the decals\' (a texture reads blue there)');
  // the band: every car has steps that run edge to edge without a gap, inside the band's height, each a flat colour from that car's stops
  const layout = trainLayout('hull5');
  for (const car of layout.cars) {
    const items = l.decals({ index: car.index, count: layout.cars.length, type: car.type as string, cab: car.cab !== null, length: car.length, nose: car.cab ? nose : 0, doors: [3, car.length - 3] });
    const steps = items.filter((i) => i.text === null);
    assert.equal(steps.length, HULL_BAND_STEPS, `car ${car.index}: the band's steps`);
    for (let k = 0; k < steps.length; k++) {
      const [s0, y0, s1, y1] = (steps[k] as { rect: [number, number, number, number] }).rect;
      assert.deepEqual([y0, y1], HULL_BAND, `car ${car.index} step ${k}: the band's height`);
      assert.ok(s1 > s0, `car ${car.index} step ${k}: a step has a length`);
      if (k > 0) near2(s0, (steps[k - 1] as { rect: number[] }).rect[2] as number, 1e-9, `car ${car.index} step ${k}: no gap`);
    }
    const first = (steps[0] as { rect: number[] }).rect[0] as number;
    const last = (steps[steps.length - 1] as { rect: number[] }).rect[2] as number;
    assert.ok(first >= (car.cab ? nose : 0) + 0.5 && last <= car.length - 0.5, `car ${car.index}: the band (${first.toFixed(1)} to ${last.toFixed(1)} m) stays inside the car and behind the cab's nose`);
    // the first and last steps are close to the car's first and last stops, and the colours move along the car (the spectrum), not one flat colour
    const colours = steps.map((i) => i.colour);
    assert.ok(new Set(colours).size >= 6, `car ${car.index}: ${new Set(colours).size} distinct colours across the band`);
    const stops = HULL_BAND_STOPS[car.index % HULL_BAND_STOPS.length] as readonly (readonly [number, number])[];
    assert.equal(hullBandColour(car.index, 0), (stops[0] as readonly [number, number])[1]);
    assert.equal(hullBandColour(car.index, 1), (stops[stops.length - 1] as readonly [number, number])[1]);
    // at every stop that is not half of a cut (two stops a hair apart) the colour is the stop's own; between two stops it lies between their channels
    stops.forEach(([t, colour], k) => {
      const cut = (k > 0 && t - (stops[k - 1] as readonly [number, number])[0] < 0.02) || (k + 1 < stops.length && (stops[k + 1] as readonly [number, number])[0] - t < 0.02);
      if (!cut) assert.equal(hullBandColour(car.index, t), colour, `car ${car.index}: the band at stop ${k}`);
    });
    for (let k = 0; k + 1 < stops.length; k++) {
      const [ta, ca] = stops[k] as readonly [number, number];
      const [tb, cb] = stops[k + 1] as readonly [number, number];
      const mid = hullBandColour(car.index, (ta + tb) / 2);
      for (const shift of [16, 8, 0]) {
        const lo = Math.min((ca >> shift) & 255, (cb >> shift) & 255) - 1;
        const hi = Math.max((ca >> shift) & 255, (cb >> shift) & 255) + 1;
        assert.ok(((mid >> shift) & 255) >= lo && ((mid >> shift) & 255) <= hi, `car ${car.index}: the colour between stops ${k} and ${k + 1} leaves their range (channel ${shift})`);
      }
    }
    // the lettering of livery.ts's row stays (the town on the band)
    assert.ok(items.some((i) => i.text !== null), `car ${car.index}: the town's name`);
  }
  // the beak is the grey the front draws over blue cheeks; the cone of livery.ts's row (the whole face dark) is not used
  assert.equal(l.noseCone, null);
  assert.equal(l.swoosh, HULL_BEAK);
  assert.equal(l.noseFront, HULL_BLUE);
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
    // CHANGED (hull5 was a base scheme): the Hull Trains 802 has a cyan cab sweep and a spectrum band of its own now
    hull5: 'hull', lumo5: 'base',
  };
  for (const kind of ALL_KINDS) {
    assert.equal(liveryFor(kind).scheme, scheme[kind], kind);
    // a livery always has its basis and its sources: nothing here is unsourced
    assert.ok(liveryFor(kind).basis.length > 20 && liveryFor(kind).sources.length > 0, `${kind}: its basis`);
  }
  for (const kind of ['lumo5'] as TrainKind[]) {
    const l = liveryFor(kind);
    const row = LIVERIES[TRAIN_SPECS[kind].livery];
    // CHANGED (Lumo wore its operator row with no dome at all): LUMO-03-Lumo-803004-passes-York-301023 and LUMO-05-Lumo-803005-at-King-s-Cross-Platform-10 show a dark grey
    // cap over the windscreen on the 803, from the glass's top edge back; every other part of the row is still livery.ts's
    assert.equal(l.noseTop, 0x2a2d33);
    // CHANGED round 5 (2.0 -> 2.5): the windscreen is taller now (its top edge is 2.5 m from the tip, glass.screen.s1 in train.ts), and the cap starts at the glass's top edge
    assert.equal(l.noseTopFrom, 2.5);
    for (const key of Object.keys(row) as (keyof typeof row)[]) assert.equal(l[key], row[key], `${kind}.${key}`);
  }
  // CHANGED (the LNER dome began 3.2 m back, on a 5.4 m nose): the nose is 3.9 m long now and the black cap starts at the windscreen's top edge, 2.0 m from the tip
  // (lner-801-214-2025: the black cap runs from the top of the glass back over the roof)
  // CHANGED round 5 (2.0 -> 2.5): the glass's top edge moved back to 2.5 m (the screen is taller, clear above the beak), and the cap follows it
  // the LNER nose is a black dome over the glass; the 717's the whole nose; the others have no special top
  assert.equal(liveryFor('lner5').noseTop, 0x1a1c21);
  assert.equal(liveryFor('lner5').noseTopFrom, 2.5);
  // CHANGED (the 717's dome was written out here, and the 700 had none): both Desiro Citys' domes are the black of their flat faces' masks, from the tip (train-face.ts), the 700's a blue-black
  assert.equal(liveryFor('gn717x6').noseTop, 0x1a1c21);
  assert.equal(liveryFor('gn717x6').noseTop, MASK_717);
  assert.equal(liveryFor('gn717x6').noseTopFrom, 0);
  assert.equal(liveryFor('tl700x8').noseTop, MASK_700);
  assert.equal(liveryFor('tl700x12').noseTop, MASK_700);
  assert.equal(liveryFor('tl700x8').noseTopFrom, 0);
  assert.notEqual(MASK_700, MASK_717, 'the 700\'s black is a blue-black, the 717\'s a neutral one');
  // CHANGED (the 180's roof over the nose had no dome of its own, so it took the roof's grey): GC180-01 and GC180-05 show the cab's roof the black of the body, from the face back, with its vents
  assert.equal(liveryFor('gc180x5').noseTop, LIVERIES.grandcentral.body);
  assert.equal(liveryFor('gc180x5').noseTopFrom, 0);
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
  // a base scheme (Lumo) shares livery.ts's material for the row
  // (Lumo is the one base scheme left: Hull Trains has paint of its own now)
  assert.equal(shellMaterialFor('lumo5', nose), shellMaterial(TRAIN_SPECS.lumo5.livery, nose));
  assert.notEqual(shellMaterialFor('hull5', nose), shellMaterial(TRAIN_SPECS.hull5.livery, nose));
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

test('the Hull Trains front: a grey beak between two blue cheeks on the face, its edges the mask\'s two slanted lines, the dome over the glass the body\'s blue, the doors red', () => {
  const g = buildTrain('hull5');
  g.updateMatrixWorld(true);
  const layout = trainLayout('hull5');
  const mask = frontOf('hull5').mask;
  assert.ok(mask, 'the Hull Trains front has a colour mask');
  assert.equal(mask.colour, HULL_BEAK);
  // the lines' numbers, written out (the checks below read them from the spec): 0.4 m out at the face's foot, 0.46 at its top, 0.72 at the windscreen's foot. The face is 0.94 m across at its
  // widest, so the lines cross its outline (the mask needs that: where they never do, the band over the nose's top has no width to start from)
  assert.deepEqual(mask, { colour: HULL_BEAK, hwFoot: 0.4, hwTop: 0.46, hwSill: 0.72 });
  const r0 = ringAt(bodySpec('at300').nose, 0);
  // CHANGED (the beak was cut along the loft's own columns, an upright strip: the cheeks' inner edge one x at every height): the mask is two straight lines from the face's foot
  // (`hwFoot` either side of the middle) to its top (`hwTop`), as hull-802-doncaster-2024 shows a bullet of grey widening up the face; the beak stays inside them at every
  // height and the cheeks outside, so the test now holds every vertex to the line at its own height
  const half = (y: number): number => mask.hwFoot + ((mask.hwTop - mask.hwFoot) * (y - r0.bottom)) / (r0.top - r0.bottom);
  for (const car of layout.cars.filter((c) => c.cab)) {
    // the face stands NOSE_RECESS behind the end of the car (a covered coupler); the flat caps stand in its plane, the lamps and the seam a few millimetres off it
    const face = car.cab === 'front' ? car.start + NOSE_RECESS : car.end - NOSE_RECESS;
    const mesh = detailOf(g, car.index);
    const onFace = (hex: number): Tri[] => trisOfColour(mesh, hex).filter((t) => t.every((v) => Math.abs(v.z - face) < 1e-3));
    const beak = onFace(HULL_BEAK);
    const cheeks = onFace(HULL_BLUE);
    assert.ok(beak.length > 0 && cheeks.length > 0, `car ${car.index}: ${beak.length} beak and ${cheeks.length} cheek triangles on the face`);
    const cheekBox = new THREE.Box3().setFromPoints(cheeks.flat());
    assert.ok(cheekBox.min.x < -0.2 && cheekBox.max.x > 0.2, `car ${car.index}: a cheek each side`);
    for (const v of beak.flat()) assert.ok(Math.abs(v.x) <= half(v.y) + 1e-4, `car ${car.index}: the beak reaches x = ${v.x.toFixed(3)} at y = ${v.y.toFixed(2)}, past the line at ${half(v.y).toFixed(3)}`);
    for (const v of cheeks.flat()) assert.ok(Math.abs(v.x) >= half(v.y) - 1e-4, `car ${car.index}: a cheek vertex at x = ${v.x.toFixed(3)}, y = ${v.y.toFixed(2)} is inside the beak's line at ${half(v.y).toFixed(3)}`);
    // the beak is a bullet: narrow at the foot, wide at the top (the line's own widths, give or take the face's rounded corners)
    // CHANGED (the lines ran 0.44 m out at the foot to 0.6 m at the top, on a face 1.3 m wide, and the beak was 0.08 m wider at its top): the longer nose's face is 0.94 m across, so the lines
    // run 0.4 to 0.46 m out, the face's own outline closes the beak in at its chin and its crown, and the beak is a few centimetres wider a little way up than at its foot
    const foot = Math.max(...beak.flat().filter((v) => v.y < r0.bottom + 0.15).map((v) => Math.abs(v.x)));
    const upper = Math.max(...beak.flat().filter((v) => v.y > r0.top - 0.3).map((v) => Math.abs(v.x)));
    assert.ok(foot < mask.hwFoot + 0.1 && upper > foot + 0.02, `car ${car.index}: the beak is ${foot.toFixed(2)} m either side at its foot and ${upper.toFixed(2)} m near its top`);
  }
  // the doors are the Hull red
  // (the doors are vertex-coloured leaves in each car's body-detail, so the colour is looked for there: a leaf is a pair of quads of the door colour)
  for (const car of layout.cars) assert.ok(trisOfColour(detailOf(g, car.index), HULL_DOOR).length >= 8, `car ${car.index}: red door leaves`);
});

test('the nose\'s top: the LNER has a black dome and Lumo a dark grey one over the glass from its top edge (2.5 m back), the 717 a dark nose roof from the tip, every other kind none', () => {
  const dark = 0x1a1c21;
  const lumoDome = 0x2a2d33;
  const cars = (kind: TrainKind): number[] => trainLayout(kind).cars.filter((c) => c.cab).map((c) => c.index);
  // CHANGED (the LNER's began 3.2 m back, and Lumo had none): the nose is 3.9 m long now, the cap starts at the glass's top edge, and the 803 has one too (LUMO-03, LUMO-05)
  // CHANGED again (the dome was held to y > 2.4, which was the shell's top edge at the ring 2.1 m back, the first at or behind 2.0 m when the rings were 0.14 m apart): the rings are
  // twice as fine now (budget ruling of 2026-11-09), the first at or behind 2.0 m is 2.03 m back, and the dome's lowest edge is the shell's top (column 7 of the section) at that ring
  // CHANGED round 5: the glass's top edge is 2.5 m back now (glass.screen.s1), so the cap starts there: the first ring at or behind 2.5 m is 2.515 m back. The nose's textured
  // columns run up to column 9 (`front.shellTop`, the AT300 front's own, so the livery's cheek and white reach over the shoulder and no vertex-coloured roof wedge shows low down on
  // the flank), so the dome's lowest edge is column 9 of the section at that ring, 3.07 m up, not column 7
  const at300 = bodySpec('at300');
  const sec300 = carSection(at300);
  const norm300 = normalised(sec300);
  const topColumn = at300.front.shellTop ?? 7;
  assert.equal(topColumn, 9, 'the AT300 nose\'s textured columns run to column 9');
  const domeRing = ringStations(at300.nose).find((s) => s >= 2.5 - 1e-9) as number;
  const domeFloor = (halfAt(sec300, norm300, eggSection(norm300, at300.nose.widest, at300.nose.boxiness), ringAt(at300.nose, domeRing))[topColumn] as [number, number])[1];
  assert.ok(domeRing >= 2.5 - 1e-9 && domeRing < 2.6 && domeFloor > 3.0 && domeFloor < 3.15, `the dome's first ring is ${domeRing} m back, its lowest edge ${domeFloor} m up`);
  for (const [kind, colour] of [['lner5', dark], ['lner9', dark], ['lumo5', lumoDome]] as [TrainKind, number][]) {
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    for (const index of cars(kind)) {
      const car = trainLayout(kind).cars[index] as { cab: 'front' | 'rear'; start: number; end: number };
      const tris = trisOfColour(detailOf(g, index), colour);
      assert.ok(tris.length > 20, `${kind} car ${index}: the dome (${tris.length} triangles)`);
      // all of it is more than 2.5 m from the nose's tip (the livery's `noseTopFrom`, CHANGED round 5 from 2.0 m), measured along the car, and on the roof
      const tip = car.cab === 'front' ? car.start : car.end;
      for (const t of tris) for (const v of t) {
        assert.ok(Math.abs(v.z - tip) >= 2.5 - 0.05, `${kind} car ${index}: dark roof only ${Math.abs(v.z - tip).toFixed(2)} m from the tip`);
        // (CHANGED from 2.5 m: the cap runs a little way down the sides of the glass, about a third of the way down its side edge, 2.6 m: lner-801-214-2025's close crop of the cab)
        assert.ok(v.y >= domeFloor - 1e-4, `${kind} car ${index}: dark triangle at y = ${v.y.toFixed(3)}, under the shell's top edge (${domeFloor.toFixed(3)}): not on the roof or the glass's upper shoulder`);
      }
    }
    // a through car has none
    const through = trainLayout(kind).cars.find((c) => !c.cab);
    assert.ok(through);
    assert.equal(trisOfColour(detailOf(g, through.index), colour).length, 0, `${kind}: the dark dome on a through car`);
  }
  // the 717's and the 700's nose roofs are dark from the very tip (CHANGED: the 700's was the body's colour; it wears its own black now, MASK_700, on its flat face's dome)
  for (const [kind, colour] of [['gn717x6', dark], ['tl700x8', MASK_700], ['tl700x12', MASK_700]] as [TrainKind, number][]) {
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    for (const index of cars(kind)) {
      const car = trainLayout(kind).cars[index] as { cab: 'front' | 'rear'; start: number; end: number };
      const tris = trisOfColour(detailOf(g, index), colour);
      assert.ok(tris.length > 20, `${kind} car ${index}: ${tris.length} dark nose roof triangles`);
      // it begins at the nose's front: the roof columns only rise above the shell's top a little way back from the tip, so within the first metre
      const tip = car.cab === 'front' ? car.start : car.end;
      const first = Math.min(...tris.flat().map((v) => Math.abs(v.z - tip)));
      assert.ok(first < 1, `${kind} car ${index}: the dark nose roof begins ${first.toFixed(2)} m from the tip`);
    }
    const through = trainLayout(kind).cars.find((c) => !c.cab);
    assert.ok(through);
    assert.equal(trisOfColour(detailOf(g, through.index), colour).length, 0, `${kind}: the dark dome on a through car`);
  }
  // no dark dome elsewhere: not on the Hull, 387 or 180 cabs, in either of the two domes' colours, nor on the 700 in the LNER's or Lumo's (its own is MASK_700)
  for (const kind of ['hull5', 'gn387x4', 'tl700x8', 'gc180x5'] as TrainKind[]) {
    const g = buildTrain(kind);
    g.updateMatrixWorld(true);
    for (const index of cars(kind)) for (const colour of [dark, lumoDome]) assert.equal(trisOfColour(detailOf(g, index), colour).length, 0, `${kind} car ${index}: a nose roof in ${colour.toString(16)}`);
  }
});
