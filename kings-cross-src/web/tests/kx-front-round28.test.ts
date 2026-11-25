// Round F8 (front A7, "the x-ray roof mode legible and consistent with the physical roof"): every scorer held A7 for want of a check that switching modes
// changes opacity only. Build the shed in each RoofMode, and switch one at run time (the group's userData.roofMode, which tools/evidence.mjs's x-ray shots
// set), then hold every mesh the same but for its opacity and depth write, and the x-ray opacities to the documented products.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
// tools/evidence.mjs carries no types, so it is loaded by URL
const evidence: Record<string, any> = await import(new URL('../../tools/evidence.mjs', import.meta.url).href);

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
type Mode = 'auto' | 'solid' | 'xray';
const build = (roof: Mode): THREE.Group => { const g = shed.buildShed(layout, { range: false, roof }); g.updateMatrixWorld(true); return g; };
const meshes = (g: THREE.Group): THREE.Mesh[] => { const out: THREE.Mesh[] = []; g.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); }); return out; };
const mats = (m: THREE.Mesh): THREE.Material[] => (Array.isArray(m.material) ? m.material : [m.material]);
// cameras in the shed's local frame: far out over the roof, close outside, under the crown, and high over the south front
const cams: [string, [number, number, number]][] = [['far', [-300, 200, 150]], ['near', [-20, 25, 30]], ['inside', [layout.spine, 8, -layout.length / 2]], ['above', [layout.width / 2, layout.crown + 60, 40]]];
const draw = (g: THREE.Group, at: [number, number, number]): void => {
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(g.localToWorld(new THREE.Vector3(...at)));
  for (const m of meshes(g)) m.onBeforeRender(undefined as never, undefined as never, camera, m.geometry, m.material as THREE.Material, null as never);
};
// what a mode switch may change on a material
const FREE = new Set(['opacity', 'depthWrite', 'transparent', 'uuid', 'version', 'id', '_listeners']);
// a texture by what it draws (each build paints its own, so not by uuid)
const tex = (t: THREE.Texture): string => { const im = t.image as { width?: number; height?: number } | undefined; return `${t.name}|${im?.width}x${im?.height}|${t.repeat.toArray()}|${t.offset.toArray()}|${t.wrapS},${t.wrapT}|${t.anisotropy}|${t.colorSpace}`; };
const fixed = (mat: THREE.Material): string => {
  const out: string[] = [];
  for (const [k, v] of Object.entries(mat)) {
    if (FREE.has(k) || typeof v === 'function') continue;
    out.push(`${k}=${v instanceof THREE.Color ? v.getHex() : v instanceof THREE.Texture ? tex(v) : v && typeof v === 'object' && 'isVector2' in (v as object) ? (v as THREE.Vector2).toArray() : typeof v === 'object' && v !== null ? JSON.stringify(v, (_k, x) => (x instanceof THREE.Texture ? tex(x) : x)) : v}`);
  }
  return out.join(' ');
};
const diff = (a: string, b: string): string => { const B = new Set(b.split(' ')); return a.split(' ').filter(x => !B.has(x)).join(' '); };
const shape = (m: THREE.Mesh): unknown => {
  const g = m.geometry; g.computeBoundingBox();
  return { name: m.name, verts: g.getAttribute('position').count, index: g.index?.count ?? null, box: [...g.boundingBox!.min.toArray(), ...g.boundingBox!.max.toArray()].map(x => Math.round(x * 1e4) / 1e4),
    visible: m.visible, renderOrder: m.renderOrder, castShadow: m.castShadow, receiveShadow: m.receiveShadow, count: (m as THREE.InstancedMesh).count ?? null, frustumCulled: m.frustumCulled };
};

test('A7: a roof mode, built or switched at run time, changes the roof\'s opacities and depth writes only: every mesh\'s geometry, bounds, colour, map, visibility, draw order and shadow the same', () => {
  const groups: [string, THREE.Group][] = [['auto', build('auto')], ['solid', build('solid')], ['xray', build('xray')]];
  const switched = build('auto'); switched.userData.roofMode = 'xray';
  groups.push(['auto switched to xray', switched]);
  for (const [, at] of cams) {
    for (const [, g] of groups) draw(g, at);
    const [ref, ...rest] = groups.map(([n, g]) => [n, meshes(g)] as const);
    for (const [name, ms] of rest) {
      assert.equal(ms.length, ref[1].length, `${name}: as many meshes`);
      ms.forEach((m, i) => {
        const r = ref[1][i]!;
        assert.deepEqual(shape(m), shape(r), `${name}: ${m.name} the same mesh`);
        mats(m).forEach((mt, j) => { const a = fixed(mt), b = fixed(mats(r)[j]!); assert.ok(a === b, `${name}: ${m.name}'s material the same but its opacity and depth write: ${diff(a, b)} against ${diff(b, a)}`); });
      });
    }
  }
  // which meshes the mode reaches at all: the slate flanks, the glazing and the outside structure (rib caps, crown bars, gutters, the lip's rail); no other
  const differs = new Set<string>();
  for (const [, at] of cams) {
    for (const [, g] of groups) draw(g, at);
    const a = meshes(groups[0]![1]), x = meshes(groups[2]![1]);
    a.forEach((m, i) => { if (mats(m).some((mt, j) => mt.opacity !== mats(x[i]!)[j]!.opacity || mt.depthWrite !== mats(x[i]!)[j]!.depthWrite)) differs.add(m.name); });
  }
  assert.deepEqual([...differs].sort(), ['shed-roof-bars', 'shed-roof-cladding', 'shed-roof-glass']);
});

test('A7: in x-ray mode, built or switched, the opacities are the documented products (roofOpacity, glazingOpacity, roofBarsOpacity, crownAlpha), and a switch back draws auto again', () => {
  const built = build('xray'), switched = build('auto');
  const glassAlpha = (g: THREE.Group): number => {
    const glass = g.getObjectByName('shed-roof-glass') as THREE.Mesh, mat = glass.material as THREE.Material;
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    mat.onBeforeCompile(shader as never, undefined as never);
    return (shader.uniforms.uCrownAlpha as THREE.IUniform<number>).value;
  };
  for (const [where, at] of cams) {
    for (const [g, mode] of [[built, 'xray'], [switched, 'xray'], [switched, 'auto']] as const) {
      g.userData.roofMode = mode; draw(g, at);
      const op = (n: string): THREE.Material => (g.getObjectByName(n) as THREE.Mesh).material as THREE.Material;
      const o = shed.roofOpacity(at, layout, mode);
      assert.equal(op('shed-roof-cladding').opacity, o, `${where} ${mode}: the cladding`);
      if (mode === 'xray') assert.equal(o, shed.XRAY_OPACITY);
      assert.equal(op('shed-roof-cladding').depthWrite, o > 0.98, `${where} ${mode}: the cladding writes depth only when near solid`);
      assert.equal(op('shed-roof-glass').opacity, shed.glazingOpacity(o), `${where} ${mode}: the glass`);
      assert.equal(op('shed-roof-bars').opacity, shed.roofBarsOpacity(at, layout, mode), `${where} ${mode}: the bars`);
      assert.equal(op('shed-roof-bars').opacity, o * shed.crownOutside(at, layout));
      assert.equal(glassAlpha(g), shed.crownAlpha(at, layout, mode), `${where} ${mode}: the crown's alpha`);
      if (mode === 'xray') assert.equal(glassAlpha(g), shed.crownOutside(at, layout) * shed.crownAlpha([layout.width / 2, layout.crown + 500, 0], layout, 'auto') * shed.XRAY_OPACITY / shed.crownOutside([layout.width / 2, layout.crown + 500, 0], layout));
    }
  }
  assert.equal((evidence as Record<string, unknown>).XRAY_EVIDENCE_OPACITY, shed.XRAY_OPACITY, 'the evidence page check expects the same x-ray opacity');
});

test('A7 evidence: roof-above and front-oblique each get an x-ray shot on the same camera, listed for kx-front', async () => {
  const E = evidence as Record<string, unknown> & typeof evidence;
  assert.equal(E.ROOF_MATERIAL_XRAY, 'xray roof mode (evidence override)');
  const cameras = evidence.stationCameras(data);
  const names = evidence.stationViewNames(cameras);
  assert.deepEqual(names.filter((n: string) => n.endsWith('-xray')).sort(), ['front-oblique-xray', 'roof-above-xray']);
  for (const n of ['front-oblique-xray', 'roof-above-xray']) assert.ok(evidence.ELEMENT_VIEWS['kx-front'].includes(n), `kx-front lists ${n}`);
  const shots: { name: string; camera: unknown; extra: Record<string, unknown> }[] = [];
  await evidence.runStationEvidenceShots(cameras, async (_axis: string, name: string, camera: unknown, extra: Record<string, unknown>) => { shots.push({ name, camera, extra }); }, async (_a: string, _n: string, work: () => Promise<unknown>) => work());
  for (const c of ['roof-above', 'front-oblique']) {
    const ctx = shots.find(s => s.name === c)!, x = shots.find(s => s.name === `${c}-xray`);
    assert.ok(x, `${c}-xray shot`);
    assert.equal(x.camera, ctx.camera, 'the same camera');
    assert.equal(x.extra.roofMaterialEvidence, E.ROOF_MATERIAL_XRAY);
    const { roofMaterialEvidence: _a, ...xr } = x.extra, { roofMaterialEvidence: _b, label: _l, role: _r, ...cr } = ctx.extra;
    assert.deepEqual(xr, cr, 'everything else as the context shot');
  }
  const order: string[] = [];
  assert.equal(await evidence.captureEvidencePng(E.ROOF_MATERIAL_XRAY as string, { prepare: async () => { order.push('prepare'); }, capture: async () => { order.push('capture'); return 'png'; }, restore: async () => { order.push('restore'); } }), 'png');
  assert.deepEqual(order, ['prepare', 'capture', 'restore'], 'the x-ray shot is taken inside its override and restored after');
});
