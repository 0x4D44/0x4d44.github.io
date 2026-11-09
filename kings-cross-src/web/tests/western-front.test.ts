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
  assert.equal(Math.min(...ys).toFixed(1), '5.0');
  assert.ok(Math.max(...ys) > 11, 'top-storey sash retained');
  assert.ok(hits(g, 130, 1.2).some(h => h.object.name === 'range-brick'), 'unsupported northern removal');
  const brick = g.getObjectByName('range-brick') as THREE.Mesh;
  brick.geometry.computeBoundingBox();
  assert.ok(Math.abs(brick.geometry.boundingBox!.min.x - (-0.01 - WESTERN_RANGE.depth)) < 1e-5, 'footprint retained');
});

// The concourse face (R-a, R-ab, R-b). Independent of shed.ts: the Range's 39 bays are 3.4 m apart from v 10.2; the gateline and the two shops take the first fifteen
// ground-floor bays' openings, so a tall opening stands in bays 15 to 38 (v 61.2 to 139.4); the brick centre is bays 14 to 23 (v 56.1 to 90.1, 0.25 m off the funnel's axis).
const FACE = -WESTERN_RANGE.depth - 0.01;
const range = (): THREE.Group => { const g = buildWesternRange(); g.updateMatrixWorld(true); return g; };
const arches = Array.from({ length: 24 }, (_, i) => 61.2 + 3.4 * i);
const block = Array.from({ length: 10 }, (_, i) => 57.8 + 3.4 * i);
/** What a sight line going east at v and y meets first, from 1 m in front of the Range's face. */
const first = (g: THREE.Group, v: number, y: number): { name: string; x: number } | undefined => { const h = hits(g, v, y, -13, 3)[0]; return h && { name: h.object.name, x: h.point.x }; };
const meets = (g: THREE.Group, v: number, y: number, name: string, x: number): void => {
  const h = first(g, v, y);
  assert.ok(h?.name === name && Math.abs(h.x - x) < 1e-3, `at v ${v.toFixed(2)}, ${y} m: ${h ? `${h.name} at x ${h.x.toFixed(3)}` : 'nothing'}, not ${name} at ${x.toFixed(3)}`);
};

test('ground floor: a tall round-headed opening in every bay the gateline and the shops leave, a dark pane under a stone ring and key, the plinth broken at each', () => {
  const g = range();
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

test('brick centre: the first floor\'s windows are dressed in stone, a jamb each side, a sill and a hood with a shallow pediment; the top storey is plain, and so is all beside the centre above its openings', () => {
  const stone = range().getObjectByName('range-stone') as THREE.Mesh, p = stone.geometry.getAttribute('position');
  const all = Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))), near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4; // single precision
  for (const v of block) {
    const mine = all.filter(q => Math.abs(-q.z - v) < 1.01), offsets = (u: number, y: number): number[] => [...new Set(mine.filter(q => near(q.x, u) && near(q.y, y)).map(q => +(-q.z - v).toFixed(3)))].sort((a, b) => a - b);
    const at = `bay v ${v.toFixed(1)}`;
    assert.deepEqual(offsets(FACE - 0.12, 5), [-0.9, -0.7, 0.7, 0.9], `${at}: a jamb 0.2 m wide each side of the window, 0.12 m proud`);
    const jamb = mine.filter(q => near(q.x, FACE - 0.12) && q.y > 4.5 && Math.abs(-q.z - v) > 0.69 && Math.abs(-q.z - v) < 0.91);
    assert.ok(near(Math.min(...jamb.map(q => q.y)), 5) && near(Math.max(...jamb.map(q => q.y)), 7.6), `${at}: the jambs run the window's height, 5.0 to 7.6 m`);
    assert.deepEqual(offsets(FACE - 0.2, 4.88), [-1, 1], `${at}: a sill 2 m wide and 0.2 m proud under the window`);
    assert.deepEqual(offsets(FACE - 0.2, 7.8), [-1, 1], `${at}: a hood 2 m wide over the head`);
    const pediment = mine.filter(q => near(q.x, FACE - 0.14)), rise = pediment.map(q => q.y - 7.8);
    assert.equal(pediment.length, 5, `${at}: a pediment of five corners`);
    assert.ok(near(Math.max(...rise), 0.22) && rise.filter(r => near(r, 0)).length === 2, `${at}: it rises 0.22 m from a 1.9 m base`);
    assert.equal(mine.filter(q => q.y > 8.4 && q.y < 12.2).length, 0, `${at}: nothing is dressed over the second course, up to the cornice`);
  }
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
