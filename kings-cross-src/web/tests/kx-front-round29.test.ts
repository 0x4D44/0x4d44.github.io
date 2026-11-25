// Round F9 (front-round-8 score, A7): the x-ray roof mode changes opacity only, keeping every roof layer in the transparent pass; the three glazings draw in a
// fixed order; in x-ray the crown's bars keep their strength outside and the end glass dims with the roof's.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const S = shed as Record<string, unknown>;
type Mode = 'auto' | 'solid' | 'xray';
const build = (roof: Mode): THREE.Group => { const g = shed.buildShed(layout, { range: false, roof }); g.updateMatrixWorld(true); return g; };
const cams: [string, [number, number, number]][] = [['far', [-300, 200, 150]], ['near', [-20, 25, 30]], ['edge', [-3, 10, -50]], ['inside', [layout.spine, 8, -layout.length / 2]], ['above', [layout.width / 2, layout.crown + 60, 40]]];
const camera = (g: THREE.Group, at: [number, number, number]): THREE.PerspectiveCamera => { const c = new THREE.PerspectiveCamera(); c.position.copy(g.localToWorld(new THREE.Vector3(...at))); return c; };
const before = (m: THREE.Mesh, c: THREE.Camera): THREE.Material => { const mat = m.material as THREE.Material; m.onBeforeRender(undefined as never, undefined as never, c, m.geometry, mat, null as never); return mat; };
const after = (m: THREE.Mesh, c: THREE.Camera): void => m.onAfterRender(undefined as never, undefined as never, c, m.geometry, m.material as THREE.Material, null as never);
const byName = (g: THREE.Group, n: string): THREE.Mesh => g.getObjectByName(n) as THREE.Mesh;

test('A7 (F9): the roof\'s three layers stay in the transparent pass in every mode, their depth writes as documented', () => {
  for (const mode of ['auto', 'solid', 'xray'] as const) {
    const g = build(mode);
    for (const [where, at] of cams) {
      const c = camera(g, at), o = shed.roofOpacity(at, layout, mode);
      for (const n of ['shed-roof-cladding', 'shed-roof-glass', 'shed-roof-bars']) {
        const mat = before(byName(g, n), c);
        assert.equal(mat.transparent, true, `${mode} ${where}: ${n} transparent`);
        // re-pinned round A5-1: the glass writes depth from outside by day in auto and solid (crownDepth; the far slope's caps hid behind it), none in x-ray or inside
        const dw = n === 'shed-roof-cladding' ? o > 0.98 : n === 'shed-roof-glass' ? shed.crownDepth(at, layout, 0, mode) : shed.roofBarsOpacity(at, layout, mode) > 0;
        assert.equal(mat.depthWrite, dw, `${mode} ${where}: ${n} depth write`);
      }
    }
  }
});

test('A7 (F9): the gables\', roof\'s and front\'s glass draw in a fixed order, back to front from the south and the overview: gables, roof, front; after the slate, before the bars', () => {
  const O = S.GLASS_ORDER as { gable: number; roof: number; front: number } | undefined;
  assert.ok(O, 'GLASS_ORDER exported');
  const g = build('auto'), r = (n: string): number => byName(g, n).renderOrder;
  assert.deepEqual([r('shed-gable-glass'), r('shed-roof-glass'), r('shed-front-glass')], [O.gable, O.roof, O.front]);
  assert.ok(r('shed-roof-cladding') < O.gable && O.gable < O.roof && O.roof < O.front && O.front < r('shed-roof-bars'), 'slate < gables < roof < front < bars');
  // from the south (a raised camera off the south front's south-west, looking north-east over it), the order the depths give is this one
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 5000);
  cam.position.copy(g.localToWorld(new THREE.Vector3(-60, 80, 120))); cam.lookAt(g.localToWorld(new THREE.Vector3(layout.width / 2, 10, -layout.length / 2))); cam.updateMatrixWorld(true);
  const pm = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const z = (n: string): number => { const m = byName(g, n); m.geometry.computeBoundingSphere(); return new THREE.Vector4(...m.geometry.boundingSphere!.center.toArray(), 1).applyMatrix4(m.matrixWorld).applyMatrix4(pm).z; };
  assert.ok(z('shed-gable-glass') > z('shed-roof-glass') && z('shed-roof-glass') > z('shed-front-glass'), 'farthest first');
});

test('A7 (F9): in x-ray the crown\'s outside bars keep their full strength outside (still none inside); auto and solid as before', () => {
  for (const [where, at] of cams) {
    const out = shed.crownOutside(at, layout);
    assert.equal(shed.roofBarsOpacity(at, layout, 'xray'), out, `${where}: x-ray`);
    for (const mode of ['auto', 'solid'] as const) assert.equal(shed.roofBarsOpacity(at, layout, mode), shed.roofOpacity(at, layout, mode) * out, `${where}: ${mode}`);
    const g = build('xray');
    assert.equal(before(byName(g, 'shed-roof-bars'), camera(g, at)).opacity, out, `${where}: the built mesh`);
  }
  assert.equal(shed.roofBarsOpacity([layout.width / 2, layout.crown + 60, 40], layout, 'xray'), 1, 'from over the roof, as solid as the ribs');
  assert.equal(shed.roofBarsOpacity([layout.spine, 8, -layout.length / 2], layout, 'xray'), 0, 'inside, none');
});

test('A7 (F9): in x-ray the end glass (the front\'s lunettes, the gables) dims by the roof glazing\'s own factor for its draw, and is put back after; auto and solid untouched', () => {
  const f = (S.endGlassFactor as ((m: Mode) => number) | undefined);
  assert.equal(typeof f, 'function', 'endGlassFactor exported');
  assert.equal(f!('xray'), shed.glazingOpacity(shed.XRAY_OPACITY) / shed.glazingOpacity(1));
  assert.ok(f!('xray') < 0.5, 'a real dimming, as the roof glass\'s');
  assert.equal(f!('auto'), 1); assert.equal(f!('solid'), 1);
  for (const mode of ['auto', 'solid', 'xray'] as const) {
    const g = build(mode), c = camera(g, [-300, 200, 150]);
    for (const n of ['shed-front-glass', 'shed-gable-glass']) {
      const m = byName(g, n), base = (m.material as THREE.Material).opacity;
      assert.equal(before(m, c).opacity, base * f!(mode), `${mode}: ${n} in its draw`);
      after(m, c);
      assert.equal((m.material as THREE.Material).opacity, base, `${mode}: ${n} put back`);
    }
  }
  const g = build('auto'), c = camera(g, [-300, 200, 150]), m = byName(g, 'shed-gable-glass'), base = (m.material as THREE.Material).opacity;
  g.userData.roofMode = 'xray';
  assert.equal(before(m, c).opacity, base * f!('xray'), 'switched at run time');
  after(m, c);
});

test('A7/A6 (F9b): the glazings\' order is the view\'s, set before each frame\'s sort: over every station camera, where a ray meets two glazings the nearer draws after the farther', async () => {
  const order = S.glassOrder as ((cam: [number, number, number], l: typeof layout) => { gable: number; roof: number; front: number }) | undefined;
  assert.equal(typeof order, 'function', 'glassOrder exported');
  const evidence: Record<string, any> = await import(new URL('../../tools/evidence.mjs', import.meta.url).href);
  const g = build('auto'), scene = new THREE.Scene();
  scene.add(g); g.updateMatrixWorld(true);
  const names = { gable: 'shed-gable-glass', roof: 'shed-roof-glass', front: 'shed-front-glass' } as const;
  const glass = Object.values(names).map(n => byName(g, n));
  const ray = new THREE.Raycaster();
  let checked = 0, cameras = 0;
  const bad: string[] = [];
  for (const [name, c] of Object.entries(evidence.stationCameras(data)) as [string, { pos?: number[]; target?: number[]; fov?: number }][]) {
    if (!c?.pos || !c?.target) continue;
    cameras++;
    const cam = new THREE.PerspectiveCamera(c.fov ?? 50, 16 / 9, 0.5, 5000);
    cam.position.set(c.pos[0]!, c.pos[1]!, c.pos[2]!); cam.lookAt(c.target[0]!, c.target[1]!, c.target[2]!); cam.updateMatrixWorld(true);
    // the scene's own hook sets the order, as the renderer calls it before the sort
    scene.onBeforeRender(undefined as never, scene, cam, undefined as never, undefined as never, undefined as never);
    const local = g.worldToLocal(cam.position.clone());
    const want = order!([local.x, local.y, local.z], layout);
    assert.deepEqual([byName(g, names.gable).renderOrder, byName(g, names.roof).renderOrder, byName(g, names.front).renderOrder], [want.gable, want.roof, want.front], `${name}: the hook set the view's order`);
    assert.equal(new Set(Object.values(want)).size, 3, `${name}: distinct`);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 20; j++) {
      ray.setFromCamera(new THREE.Vector2(-1 + (2 * i + 1) / 32, -1 + (2 * j + 1) / 20), cam);
      const hits = ray.intersectObjects(glass, false);
      const seen: THREE.Mesh[] = [];
      for (const h of hits) if (!seen.includes(h.object as THREE.Mesh)) seen.push(h.object as THREE.Mesh);
      for (let k = 1; k < seen.length; k++) {
        checked++;
        if (seen[k - 1]!.renderOrder <= seen[k]!.renderOrder) bad.push(`${name}: ${seen[k - 1]!.name} (nearer) draws before ${seen[k]!.name}`);
      }
    }
  }
  assert.ok(cameras >= 40, `${cameras} station cameras`);
  assert.ok(checked > 100, `${checked} rays through two glazings`);
  assert.deepEqual([...new Set(bad)], [], 'the nearer glazing drawn after the farther');
  const W = layout.length;
  assert.deepEqual(order!([10, 20, 50], layout), { gable: 2.5, roof: 3, front: 3.5 }, 'south of the front');
  assert.deepEqual(order!([10, 20, -W - 50], layout), { front: 2.5, roof: 3, gable: 3.5 }, 'north of the gables');
  assert.equal(Math.max(...Object.values(order!([10, 60, -W / 3], layout))), order!([10, 60, -W / 3], layout).roof, 'between, the roof last');
});
