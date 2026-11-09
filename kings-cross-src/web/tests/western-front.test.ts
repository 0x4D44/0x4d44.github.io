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
