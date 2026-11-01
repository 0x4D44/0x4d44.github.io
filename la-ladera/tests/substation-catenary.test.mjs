import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.core.min.js';
import { solveCatenary, catenarySegments, createSpanInstances, SPAN_PRESETS } from '../tools/substation_catenary.mjs';

const mutation = process.env.SUBSTATION_TEST_MUTATION || '';
const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
const pointClose = (a, b, epsilon = 1e-8) => a.forEach((value, index) => close(value, b[index], epsilon));

test('C01 exact symmetric catenary matches an independent analytic curve', () => {
  const a = 10, length = 20, height = 10 * Math.cosh(1), sag = height - 10;
  const curve = solveCatenary([0, height, 0], [length, height, 0], { sag: mutation === 'C01' ? sag * 1.2 : sag });
  close(curve.a, a); close(curve.b, 10); close(curve.arcLength, 20 * Math.sinh(1));
  for (let i = 0; i <= 20; i++) pointClose(curve.point(i / 20), [i, 10 * Math.cosh((i - 10) / 10), 0]);
});

test('C02 unequal endpoint heights match known cosh parameters and arc length', () => {
  const a = 20, b = 12, length = 60, y = (s) => a * Math.cosh((s - b) / a);
  const sag = (y(0) + y(length)) / 2 - y(length / 2);
  const curve = solveCatenary([0, y(0), 0], [length, y(length) + (mutation === 'C02' ? 1 : 0), 0], { sag });
  close(curve.a, a); close(curve.b, b);
  close(curve.arcLength, a * (Math.sinh((length - b) / a) - Math.sinh(-b / a)));
  for (let i = 0; i <= 20; i++) pointClose(curve.point(i / 20), [length * i / 20, y(length * i / 20), 0]);
});

test('C03 arbitrary 3D span preserves endpoints and specified midpoint sag', () => {
  const start = [-4, 12, 7], end = [21, 16, -9];
  const curve = solveCatenary(start, end, { sag: mutation === 'C03' ? 2 : 1.75 });
  assert.deepEqual(curve.point(0), start); assert.deepEqual(curve.point(1), end);
  pointClose(curve.point(0.5), [8.5, 12.25, -1]);
  close(curve.horizontal, Math.hypot(25, 16));
  start[0] = 300;
  // The solution snapshots its inputs; later caller edits must not move the span.
  pointClose(curve.point(0.5), [8.5, 12.25, -1]);
  assert.deepEqual(curve.point(0), [-4, 12, 7]);
  assert.ok(curve.arcLength > curve.horizontal);
});

test('C04 shallow and steep spans remain finite with equal arc samples', () => {
  for (const [rise, sag] of [[0, 1e-5], [500, 3], [-500, 3], [0.01, 50]]) {
    const c = solveCatenary([0, 20, 0], [100, 20 + rise, 0], { sag: mutation === 'C04' ? -sag : sag });
    assert.ok(c.arcLength >= Math.hypot(100, rise));
    let previousX = -1;
    for (let i = 0; i <= 100; i++) {
      const p = c.atArcFraction(i / 100);
      assert.ok(p.every(Number.isFinite)); assert.ok(p[0] >= previousX); previousX = p[0];
    }
    close(c.point(0.5)[1], 20 + rise / 2 - sag, 2e-6);
  }
});

test('C05 instances are bounded short segments without gaps or disconnected endpoints', () => {
  const start = [0, 25, 0], end = [90, 27, 0];
  const result = catenarySegments(start, end, { sag: 3.6, maxSegmentLength: mutation === 'C05' ? 3 : 0.6 });
  assert.deepEqual(result.segments[0].start, start); assert.deepEqual(result.segments.at(-1).end, end);
  let chordSum = 0;
  for (const [i, segment] of result.segments.entries()) {
    assert.ok(segment.length <= 0.600000001 && segment.length > 0);
    close(Math.hypot(...segment.direction), 1);
    pointClose(segment.midpoint, segment.start.map((v, j) => (v + segment.end[j]) / 2));
    if (i) assert.deepEqual(segment.start, result.segments[i - 1].end);
    chordSum += segment.length;
  }
  assert.ok(result.arcLength - chordSum >= -1e-8 && result.arcLength - chordSum < 0.01);
});

test('C06 reversing endpoints yields the same geometric cable', () => {
  const start = [-12, 11, 5], end = [39, 18, -10];
  const forward = solveCatenary(start, end, { sag: 2.2 });
  const reverse = solveCatenary(end, start, { sag: mutation === 'C06' ? 2.8 : 2.2 });
  close(forward.arcLength, reverse.arcLength);
  for (let i = 0; i <= 30; i++) pointClose(forward.point(i / 30), reverse.point(1 - i / 30));
});

test('C07 malformed points and invalid sag parameters are rejected', () => {
  const invalid = mutation === 'C07' ? [0, 10, 0] : [NaN, 10, 0];
  assert.throws(() => solveCatenary(invalid, [20, 10, 0]), /finite 3D/);
  for (const sag of [0, -1, NaN, Infinity, 1e-15, 1000]) assert.throws(() => solveCatenary([0, 10, 0], [20, 10, 0], { sag }));
  assert.throws(() => solveCatenary([0, 1, 0], [0, 20, 0]), /horizontal span/);
  const c = solveCatenary([0, 10, 0], [20, 10, 0]);
  for (const t of [-0.1, 1.1, NaN]) { assert.throws(() => c.point(t)); assert.throws(() => c.atArcFraction(t)); }
});

test('C08 short-segment instance limits prevent unbounded allocation', () => {
  assert.throws(() => catenarySegments([0, 20, 0], [90, 20, 0], { sag: 3, maxSegments: mutation === 'C08' ? 1000 : 4 }), /exceeding maxSegments/);
  for (const maxSegments of [0, 1.5, -1, 65537, Infinity]) assert.throws(() => catenarySegments([0, 20, 0], [90, 20, 0], { maxSegments }));
  for (const maxSegmentLength of [0, -1, Infinity]) assert.throws(() => catenarySegments([0, 20, 0], [90, 20, 0], { maxSegmentLength }));
});

test('C09 Three adapter uses one reusable cylinder with correct instance transforms', () => {
  const material = new THREE.MeshStandardMaterial(), start = [0, 12, 0], end = [12, 14, 3];
  const radius = mutation === 'C09' ? 0.2 : 0.018;
  const mesh = createSpanInstances(THREE, start, end, { sag: 0.8, radius, material });
  assert.equal(mesh.isInstancedMesh, true); assert.equal(mesh.material, material);
  assert.ok(mesh.count > 20); assert.ok(mesh.geometry.attributes.position.count < 100);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3();
  mesh.getMatrixAt(0, m); m.decompose(p, r, s);
  close(s.x, 0.018, 1e-6); close(s.z, 0.018, 1e-6); assert.ok(s.y <= 0.600001);
  pointClose(new THREE.Vector3(0, -0.5, 0).applyMatrix4(m).toArray(), start, 2e-6);
  mesh.getMatrixAt(mesh.count - 1, m);
  pointClose(new THREE.Vector3(0, 0.5, 0).applyMatrix4(m).toArray(), end, 2e-6);
  assert.ok(mesh.boundingBox && mesh.boundingSphere);
  mesh.geometry.dispose(); material.dispose();
  assert.throws(() => createSpanInstances(null, start, end, { material }), /THREE/);
  assert.throws(() => createSpanInstances(THREE, start, end, { material, radius: 0 }), /radius/);
});

test('C10 variant recipes preserve voltage levels and frozen span data', () => {
  const recipes = JSON.parse(JSON.stringify(SPAN_PRESETS));
  if (mutation === 'C10') recipes.co.mv.voltageKV = 33;
  assert.deepEqual(Object.values(recipes.uk).map((r) => r.voltageKV), [132, 33, 11]);
  assert.deepEqual(Object.values(recipes.co).map((r) => r.voltageKV), [115, 34.5, 13.2]);
  for (const variant of Object.values(SPAN_PRESETS)) for (const r of Object.values(variant)) {
    assert.ok(Object.isFrozen(r)); assert.ok(r.sagM < r.spanM / 10); assert.ok(r.phaseSpacingM > r.conductorRadiusM * 20);
    assert.ok(catenarySegments([0, 20, 0], [r.spanM, 20, 0], { sag: r.sagM }).segments.length < 200);
  }
});
