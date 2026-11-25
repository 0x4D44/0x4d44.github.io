// Round F15c (front-round-15b capture: the room behind the outside gables no fainter for any glass alpha): from outside the gables by day everything in the
// shed behind their glass draws before it or is opaque, so the glass is blended over it; at night, in x-ray, inside and from over the roof the order is as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import { windowNight } from '../src/materials.ts';
import * as shed from '../src/shed.ts';

const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const cams = { // evidence.mjs, world
  'north-gable': [52.08991869333342, 18, -335.38920349896534], 'gable-oblique': [94.9207, 16, -289.4115],
  'roof-above': [91.07758124184501, 131.6408, -120.37174427994427], 'south-front': [41.04926345892175, 26, 58.29601279953229],
} as const;
const frame = (roof: shed.RoofMode, night: number, at: readonly number[] | 'inside') => {
  const g = shed.buildShed(layout, { range: false, roof }), scene = new THREE.Scene();
  scene.add(g); scene.updateMatrixWorld(true); windowNight.value = night;
  const cam = new THREE.PerspectiveCamera();
  cam.position.copy(at === 'inside' ? g.localToWorld(new THREE.Vector3(layout.spine, 8, -layout.length / 2)) : new THREE.Vector3(...at)); cam.updateMatrixWorld();
  scene.onBeforeRender(undefined as never, scene, cam, undefined as never, undefined as never, undefined as never);
  const meshes: { name: string; order: number; transparent: boolean; behind: boolean }[] = [];
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    m.onBeforeRender(undefined as never, scene, cam, m.geometry, m.material as THREE.Material, null as never); // the per-view opacity and depth writes
    const box = new THREE.Box3().setFromObject(m), zMax = Math.max(g.worldToLocal(box.min.clone()).z, g.worldToLocal(box.max.clone()).z);
    for (const mt of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[]) meshes.push({ name: m.name, order: m.renderOrder, transparent: mt.transparent, behind: zMax > -layout.length + 0.5 });
    m.onAfterRender(undefined as never, scene, cam, m.geometry, m.material as THREE.Material, null as never);
  });
  windowNight.value = 0;
  return meshes;
};

test('A6 (F15c): from outside the gables by day everything in the shed behind their glass is opaque or draws before it, so the glass dims it', () => {
  for (const name of ['north-gable', 'gable-oblique'] as const) for (const roof of ['auto', 'solid'] as const) for (const night of [0, 0.5]) {
    const all = frame(roof, night, cams[name]), gable = all.find(m => m.name === 'shed-gable-glass')!;
    const late = all.filter(m => m.behind && m.transparent && m.name !== 'shed-gable-glass' && m.order >= gable.order).map(m => `${m.name} (${m.order})`);
    assert.deepEqual(late, [], `${name}, ${roof}, night ${night}: drawn over the gable glass (${gable.order}): ${late}`);
  }
});

test('A6 (F15c): the roof bars still draw after the roof\'s glazing from outside the gables, and after every glazing at night, in x-ray, inside and from over the roof', () => {
  const bars = (roof: shed.RoofMode, night: number, at: readonly number[] | 'inside') => { const all = frame(roof, night, at); return [all.find(m => m.name === 'shed-roof-bars')!.order, all.find(m => m.name === 'shed-roof-glass')!.order]; };
  const [b, r] = bars('auto', 0, cams['north-gable']);
  assert.ok(b > r, `after the roof's glazing (${b} > ${r})`);
  for (const [label, roof, night, at] of [['night', 'auto', 1, cams['north-gable']], ['x-ray', 'xray', 0, cams['north-gable']], ['inside', 'auto', 0, 'inside'], ['roof-above', 'auto', 0, cams['roof-above']], ['south-front', 'auto', 0, cams['south-front']]] as const)
    assert.equal(bars(roof, night, at)[0], 4, `${label}: after every glazing, as before`);
});
