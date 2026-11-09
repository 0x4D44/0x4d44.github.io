import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import { buildShed, buildWesternRange, WESTERN_RANGE } from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')));
// Independent expected layout: southern five bays, approximately 40m from the plan scale.
// Alignment/clearances ASSUMED; see source citations in shed.ts. Never infer them from returned metadata.
const gates = [12.1, 20.1, 28.1, 36.1, 44.1];
const facade = () => { const g = buildShed(layout); g.updateMatrixWorld(true); return g; };
function hits(g: THREE.Group, v: number, y: number, x = -13, distance = 14): THREE.Intersection[] {
  const start = g.localToWorld(new THREE.Vector3(x, y, -v));
  return new THREE.Raycaster(start, new THREE.Vector3(1, 0, 0).transformDirection(g.matrixWorld), 0, distance).intersectObject(g, true);
}

test('five southern bays give broad actual passages through Range and shed flank', () => {
  const g = facade();
  for (const v of gates) for (const offset of [-2.7, -1.3, 1.3, 2.7]) {
    assert.equal(hits(g, v + offset, 1.2).length, 0, `blocked through-passage v=${v + offset}`);
  }
});

test('the five gateline plinth cuts reach ground while adjoining lower walls remain solid', () => {
  const g = facade();
  for (const v of gates) assert.equal(hits(g, v + 1.3, GROUND_Y + 0.1).length, 0, 'plinth blocks a gateline');
  for (const v of [8.3, 16.1, 24.1, 32.1, 40.1, 48, 70, 130]) assert.ok(hits(g, v, 1.2).length, `missing retained wall at ${v}`);
  assert.ok(hits(g, gates[0]! + 1.3, 1.2, layout.width - 1, 3).length, 'east shed wall retained');
});

test('gateline bays retain full-depth headers and internal Y supports under the upper floors', () => {
  const g = facade();
  assert.equal(hits(g, gates[0]! + 1.3, 1.2).length, 0, 'a supported opening must first be open');
  for (const v of gates) {
    assert.ok(hits(g, v, 1.2, -7, 2).some(h => h.object.name === 'range-stone'), `missing central support at ${v}`);
    assert.ok(hits(g, v, 3.3, -7.4, 3).some(h => h.object.name === 'range-stone'), `missing flared support head at ${v}`);
    assert.ok(hits(g, v + 1.3, 3.9).some(h => h.object.name === 'range-brick'), 'header missing');
  }
});

test('adjoining public frontage is recessed and glazed with upper sash floors and northern frontage retained', () => {
  const g = buildWesternRange(); g.updateMatrixWorld(true);
  for (const v of [52.1, 56.1]) {
    const h = hits(g, v + 0.5, 1.2, -13, 2);
    assert.equal(h[0]?.object.name, 'range-public-glazing', 'public interface remains a flat brick/sash wall');
    assert.ok(h[0]!.point.x > -11.8, 'glazing must sit in a reveal');
    assert.ok(hits(g, v, 1.2).some(i => i.object.name === 'range-brick'), 'shop must retain backing building mass');
  }
  for (const v of gates) assert.ok(hits(g, v + 1.3, 6.5).some(h => h.object.name === 'range-brick'), 'upper floor missing');
  const sash = g.getObjectByName('range-windows') as THREE.Mesh;
  const p = sash.geometry.getAttribute('position');
  const ys = Array.from({ length: p.count }, (_, i) => p.getY(i));
  assert.ok(Math.abs(Math.min(...ys) - 4.75) < 1e-4, `the lowest sash stands on the first floor, 4.75 m up: ${Math.min(...ys)}`); // round 5: the first-floor lights start at 4.75 m (they were 5.0)
  assert.ok(Math.max(...ys) > 11, 'top-storey sash retained');
  assert.ok(hits(g, 130, 1.2).some(h => h.object.name === 'range-brick'), 'unsupported northern removal');
  const brick = g.getObjectByName('range-brick') as THREE.Mesh;
  brick.geometry.computeBoundingBox();
  assert.ok(Math.abs(brick.geometry.boundingBox!.min.x - (-0.01 - WESTERN_RANGE.depth)) < 1e-5, 'footprint retained');
});

// The concourse face (R-a, R-ab, R-b). Independent of shed.ts: the Range's 39 bays are 3.4 m apart from v 10.2; the gateline and the two shops take the first fifteen
// ground-floor bays' openings; the brick centre is bays 14 to 23 (v 56.1 to 90.1, 0.25 m off the funnel's axis) and carries SIX windows, a sixth of it each (round 5, C4: fewer,
// larger windows than one to a bay), each over a tall opening; north of it a tall opening stands in each of bays 24 to 38 (v 91.8 to 139.4).
const FACE = -WESTERN_RANGE.depth - 0.01;
const range = (): THREE.Group => { const g = buildWesternRange(); g.updateMatrixWorld(true); return g; };
const windows = Array.from({ length: 6 }, (_, i) => 56.1 + (34 * (i + 0.5)) / 6);
const arches = [...windows, ...Array.from({ length: 15 }, (_, i) => 91.8 + 3.4 * i)];
/** What a sight line going east at v and y meets first, from 1 m in front of the Range's face. */
const first = (g: THREE.Group, v: number, y: number): { name: string; x: number } | undefined => { const h = hits(g, v, y, -13, 3)[0]; return h && { name: h.object.name, x: h.point.x }; };
const meets = (g: THREE.Group, v: number, y: number, name: string, x: number): void => {
  const h = first(g, v, y);
  assert.ok(h?.name === name && Math.abs(h.x - x) < 1e-3, `at v ${v.toFixed(2)}, ${y} m: ${h ? `${h.name} at x ${h.x.toFixed(3)}` : 'nothing'}, not ${name} at ${x.toFixed(3)}`);
};

test('ground floor: a tall round-headed opening under each window and in every bay north of the brick centre, a dark pane under a stone ring and key, the plinth broken at each', () => {
  const g = range();
  assert.equal(arches.length, 21);
  for (let i = 0; i + 1 < windows.length; i++) { // between two windows the pier is wide, brick over the plinth: no opening where there is no window
    const mid = (windows[i]! + windows[i + 1]!) / 2;
    meets(g, mid, 0.5, 'range-stone', FACE - 0.25);
    for (const y of [1.5, 2.5, 3.5]) meets(g, mid, y, 'range-brick', FACE);
  }
  for (const v of arches) {
    // dark glass 4 cm in front of the brick, from the floor to a round head 4 m up
    for (const [dv, y] of [[0, 0.1], [0, 2], [0.95, 0.5], [-0.95, 2.9], [0.5, 3.7], [-0.5, 3.7], [0, 3.9]] as const) meets(g, v + dv, y, 'range-public-glazing', FACE - 0.04);
    // a stone ring 0.2 m wide round it, 0.12 m proud, the sides and an arch over the head; the plinth stops short of it
    for (const [dv, y] of [[1.1, 0.5], [-1.1, 2.5], [0.5, 3.95], [-0.5, 3.95]] as const) meets(g, v + dv, y, 'range-stone', FACE - 0.12);
    meets(g, v, 4.15, 'range-stone', FACE - 0.2); // a key 0.3 m wide at the crown, 0.2 m proud
    for (const dv of [0, 0.5]) meets(g, v + dv, 4.5, 'range-brick', FACE); // and brick over it
    // between two the pier keeps the plinth, 1 m tall and 0.25 m proud, and is brick over it
    meets(g, v + 1.7, 0.5, 'range-stone', FACE - 0.25);
    meets(g, v + 1.7, 1.5, 'range-brick', FACE);
  }
});

test('brick centre: six first-floor windows dressed in stone, a round-headed light at each end and a three-light window with mullions, a sill and a hood with a shallow pediment between; the top storey is plain, and so is all beside the centre above its openings', () => {
  const g = range(), stone = g.getObjectByName('range-stone') as THREE.Mesh, p = stone.geometry.getAttribute('position');
  const all = Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))), near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4; // single precision
  windows.forEach((v, i) => {
    const mine = all.filter(q => Math.abs(-q.z - v) < 2.5 && q.y > 4.5), offsets = (u: number, y: number): number[] => [...new Set(mine.filter(q => near(q.x, u) && near(q.y, y)).map(q => +(-q.z - v).toFixed(3)))].sort((a, b) => a - b);
    const at = `window ${i} at v ${v.toFixed(1)}`;
    if (i === 0 || i === windows.length - 1) {
      // an arched light: dark glass 4 cm in front of the brick from the sill 4.75 m up to a round head 7.75 m up, a stone ring round it, a key at the crown, brick over that
      for (const [dv, y] of [[0, 4.9], [0, 6], [0.95, 5], [-0.95, 6.5], [0.5, 7.4], [-0.5, 7.4], [0, 7.7]] as const) meets(g, v + dv, y, 'range-public-glazing', FACE - 0.04);
      for (const [dv, y] of [[1.1, 5.5], [-1.1, 6], [0.5, 7.7], [-0.5, 7.7]] as const) meets(g, v + dv, y, 'range-stone', FACE - 0.12);
      meets(g, v, 7.9, 'range-stone', FACE - 0.2);
      for (const dv of [0, 0.5]) meets(g, v + dv, 8.6, 'range-brick', FACE);
      assert.equal(mine.filter(q => near(q.x, FACE - 0.14)).length, 0, `${at}: no pediment on an arched light`);
    } else {
      // three lights, a mullion 0.2 m wide between them and at each side, a sill 4 m wide under, a hood 4 m wide over and a pediment on the hood
      for (const k of [-1.2, 0, 1.2]) meets(g, v + k, 6, 'range-windows', FACE - 0.02);
      for (const k of [-1.8, -0.6, 0.6, 1.8]) meets(g, v + k, 6, 'range-stone', FACE - 0.12);
      assert.deepEqual(offsets(FACE - 0.12, 4.75), [-1.9, -1.7, -0.7, -0.5, 0.5, 0.7, 1.7, 1.9], `${at}: four mullions 0.2 m wide, 0.12 m proud`);
      const mullion = mine.filter(q => near(q.x, FACE - 0.12) && Math.abs(-q.z - v) < 2);
      assert.ok(near(Math.min(...mullion.map(q => q.y)), 4.75) && near(Math.max(...mullion.map(q => q.y)), 7.55), `${at}: the mullions run the lights' height, 4.75 to 7.55 m`);
      assert.deepEqual(offsets(FACE - 0.2, 4.63), [-2, 2], `${at}: a sill 4 m wide and 0.2 m proud under the lights`);
      assert.deepEqual(offsets(FACE - 0.2, 7.75), [-2, 2], `${at}: a hood 4 m wide over the head`);
      const pediment = mine.filter(q => near(q.x, FACE - 0.14)), rise = pediment.map(q => q.y - 7.75);
      assert.equal(pediment.length, 5, `${at}: a pediment of five corners`);
      assert.ok(near(Math.max(...rise), 0.28) && rise.filter(r => near(r, 0)).length === 2, `${at}: it rises 0.28 m from a 4 m base`);
      assert.deepEqual(offsets(FACE - 0.14, 7.75), [-2, 2], `${at}: it stands on the hood`);
    }
    assert.equal(mine.filter(q => q.y > 8.4 && q.y < 12.2).length, 0, `${at}: nothing is dressed over the second course, up to the cornice`);
    // the top storey: one large sash 1.9 m wide, plain brick either side
    for (const dv of [-0.9, 0, 0.9]) meets(g, v + dv, 10, 'range-windows', FACE - 0.02);
    for (const dv of [-1.1, 1.1]) meets(g, v + dv, 10, 'range-brick', FACE);
  });
  const beside = all.filter(q => -q.z < 55.6 || -q.z > 90.6);
  assert.ok(beside.every(q => q.y < 4.4), `the stone beside the brick centre stands to ${Math.max(...beside.map(q => q.y)).toFixed(2)} m: the openings' keys (4.3 m) are the highest`);
});

test('brick centre: a stone quoin at each end from the openings\' heads up, the second course and the cornice over its length only, the first course the whole length', () => {
  const g = range();
  for (const edge of [56.1, 90.1]) for (const [dv, y] of [[-0.3, 4.5], [0.3, 6.5], [-0.3, 10.5], [0.3, 12]] as const) meets(g, edge + dv, y, 'range-stone', FACE - 0.2);
  for (const edge of [56.1, 90.1]) for (const dv of [-0.6, 0.6]) meets(g, edge + dv, 6.5, 'range-brick', FACE);
  for (const dv of [-0.3, 0.3]) assert.equal(first(g, 56.1 + dv, 1.5)?.name, 'range-public-glazing', 'the quoin starts at the openings\' heads, so the shop at the brick centre\'s southern end keeps its glazing clear');
  meets(g, 73, 8.2, 'range-stone', FACE - 0.15); // the second course, 0.15 m proud
  meets(g, 73, 12.55, 'range-stone', FACE - 0.45); // the cornice, 0.45 m proud
  for (const v of [30, 45.5, 100, 130]) meets(g, v, 8.2, 'range-brick', FACE);
  for (const v of [45.5, 73, 100, 130]) meets(g, v, 4.1, 'range-stone', FACE - 0.15); // the first course, the curtain wall's sill, runs on either side
  for (const v of [45.5, 100, 130]) assert.notEqual(first(g, v, 12.55)?.name, 'range-stone', 'no cornice beside the brick centre');
});

// Round 7 (C4): above the string course, beside the brick centre, the curtain wall's clear panes show the Range's top storey, and R-a, R-ab show it fenestrated where the brick was blank: a window
// 1.2 m wide and 2.4 m tall, its foot 8.95 m up, in the middle of every bay (the 39 bays are 3.4 m apart from v 10.2: 14 south of the brick centre, 15 north), a little smaller than the centre's 1.9 x 2.9 m sashes.
test('beside the brick centre: a window 1.2 m wide in the top storey of every bay, in plain brick, none over the lower floors or in front of the centre', () => {
  const g = range(), bays = Array.from({ length: 39 }, (_, i) => 10.2 + 3.4 * i), flank = bays.filter(v => v < 56.1 || v > 90.1), block = bays.filter(v => v > 56.1 && v < 90.1);
  assert.equal(flank.length, 29, 'fourteen bays south of the brick centre, fifteen north of it');
  for (const v of flank) {
    // the sash stands 2 cm in front of the brick, from 8.95 to 11.35 m up and 0.6 m either side of the bay's middle
    for (const [dv, y] of [[0, 9.1], [0.5, 10.1], [-0.5, 11.2], [0, 11.3]] as const) meets(g, v + dv, y, 'range-windows', FACE - 0.02);
    for (const [dv, y] of [[0.8, 10], [-0.8, 10], [0, 8.7], [0, 11.6]] as const) meets(g, v + dv, y, 'range-brick', FACE);
    // plain brick on the first floor over the string course: the windows are the top storey's
    for (const y of [5, 6.5, 7.8]) meets(g, v, y, 'range-brick', FACE);
  }
  // in front of the brick centre the top storey keeps its six large sashes: a bay's middle that is clear of one is plain brick
  const clear = block.filter(v => windows.every(w => Math.abs(v - w) > 1.1));
  assert.ok(clear.length >= 6, `${clear.length} bays' middles in the brick centre stand clear of its large sashes`);
  for (const v of clear) meets(g, v, 10, 'range-brick', FACE);
});
