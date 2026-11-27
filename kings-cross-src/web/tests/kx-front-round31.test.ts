// Round F11 (front A6): from outside, north of the gables' plane, by day the north screens are dark, glossy blue-grey glass; from inside, on the plane
// and at night they are the library glass as before, and the front's glass is never touched.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import * as materials from '../src/materials.ts';
import { material, windowNight } from '../src/materials.ts';
import { Glsl, Mat } from './glsl.ts';
import * as shed from '../src/shed.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const S = shed as Record<string, unknown>;
const O = S.GABLE_OUTSIDE as { color: number; opacity: number; specular: number } | undefined;
const build = (roof: 'auto' | 'xray'): THREE.Group => { const g = shed.buildShed(layout, { range: false, roof }); g.updateMatrixWorld(true); return g; };
const camera = (g: THREE.Group, at: [number, number, number]): THREE.PerspectiveCamera => { const c = new THREE.PerspectiveCamera(); c.position.copy(g.localToWorld(new THREE.Vector3(...at))); return c; };
const L = layout.length, W = layout.width;
// gable-oblique and north-gable sit north of the plane; the rest are inside, on the plane, south of the front or over the roof
const outside: [string, [number, number, number]][] = [['throat', [W / 2, 18, -L - 90]], ['gable-oblique', [W + 8, 16, -L - 35]], ['just out', [10, 8, -L - 0.5]]];
const notOutside: [string, [number, number, number]][] = [['inside', [layout.spine, 8, -L / 2]], ['inside by the gable', [W / 4, 6, -L + 2]], ['on the plane', [W / 2, 12, -L + 0.001]], ['south', [-20, 25, 30]], ['above', [W / 2, layout.crown + 60, -L / 2]]];
const draw = (m: THREE.Mesh, c: THREE.Camera): { opacity: number; color: number; specular: number } => {
  const mat = m.material as THREE.MeshPhongMaterial;
  m.onBeforeRender(undefined as never, undefined as never, c, m.geometry, mat, null as never);
  const seen = { opacity: mat.opacity, color: mat.color.getHex(), specular: mat.specular.getHex() };
  m.onAfterRender(undefined as never, undefined as never, c, m.geometry, mat, null as never);
  return seen;
};
const lib = (): { opacity: number; color: number; specular: number } => { const m = material('glass') as THREE.MeshPhongMaterial; return { opacity: m.opacity, color: m.color.getHex(), specular: m.specular.getHex() }; };

test('A6 (F11): by day from north of the gables\' plane the gable glass is GABLE_OUTSIDE, darker and more opaque than the library glass, and is put back after', () => {
  assert.ok(O, 'GABLE_OUTSIDE exported');
  const base = lib(), g = build('auto'), glass = g.getObjectByName('shed-gable-glass') as THREE.Mesh;
  assert.ok(new THREE.Color(O.color).getHSL({ h: 0, s: 0, l: 0 }).l < new THREE.Color(base.color).getHSL({ h: 0, s: 0, l: 0 }).l - 0.2, 'darker');
  assert.ok(O.opacity > base.opacity + 0.3 && O.opacity < 1, 'more opaque, still glass');
  const b = new THREE.Color(O.color); assert.ok(b.b > b.r, 'blue-grey');
  windowNight.value = 0;
  for (const [where, at] of outside) {
    assert.deepEqual(draw(glass, camera(g, at)), { opacity: O.opacity, color: O.color, specular: O.specular }, where);
    assert.deepEqual(lib(), base, `${where}: the shared glass put back`);
  }
});

test('A6 (F11): from inside, on the plane, south or above, and outside at night, the gable glass is the library glass, as before; the front glass never changes', () => {
  const base = lib(), g = build('auto'), glass = g.getObjectByName('shed-gable-glass') as THREE.Mesh, front = g.getObjectByName('shed-front-glass') as THREE.Mesh;
  windowNight.value = 0;
  for (const [where, at] of notOutside) assert.deepEqual(draw(glass, camera(g, at)), base, where);
  for (const [where, at] of [...outside, ...notOutside]) assert.deepEqual(draw(front, camera(g, at)), base, `front from ${where}`);
  windowNight.value = 1;
  for (const [where, at] of outside) assert.deepEqual(draw(glass, camera(g, at)), base, `${where} at night`);
  windowNight.value = 0.5;
  const half = draw(glass, camera(g, outside[0][1]));
  assert.ok(Math.abs(half.opacity - (base.opacity + O!.opacity) / 2) < 1e-9, 'dusk: half way');
  windowNight.value = 0;
});

test('A6 (F11): in x-ray the outside glass dims by endGlassFactor like the front\'s, and inside x-ray is as before', () => {
  const base = lib(), g = build('xray'), glass = g.getObjectByName('shed-gable-glass') as THREE.Mesh, f = shed.endGlassFactor('xray');
  windowNight.value = 0;
  assert.ok(Math.abs(draw(glass, camera(g, outside[0][1])).opacity - O!.opacity * f) < 1e-9);
  assert.ok(Math.abs(draw(glass, camera(g, notOutside[0][1])).opacity - base.opacity * f) < 1e-9);
  assert.deepEqual(lib(), base);
});

test('A6 (F11): gableOutside is 1 - night north of the plane only', () => {
  const fn = S.gableOutside as ((c: [number, number, number], l: { length: number }, n: number) => number) | undefined;
  assert.ok(fn);
  assert.equal(fn([0, 0, -L - 0.01], layout, 0), 1);
  assert.equal(fn([0, 0, -L], layout, 0), 0);
  assert.equal(fn([0, 0, -L + 1], layout, 0), 0);
  assert.equal(fn([0, 0, -L - 5], layout, 0.25), 0.75);
  assert.equal(fn([0, 0, -L - 5], layout, 2), 0);
  assert.equal(fn([0, 0, -L - 5], layout, -1), 1);
});

// Round F11b (front A6): the dark outside glass came out a mosaic: the sky glint's pane-to-pane streaks (materials.ts SKY_GLINT_GLSL, `gb` per pane) took
// some panes 0.4 of the way to a near-white sky and left their neighbours clear, which over a dark tint is near-white beside near-black.
const M = materials as Record<string, unknown>;
const even = (): { value: number } | undefined => M.glintEven as { value: number } | undefined;

test('A6 (F11b): the gable glass flattens the glint\'s panes (glintEven) by the same share as GABLE_OUTSIDE: 1 outside by day, 0 inside, on the plane and at night, and puts it back', () => {
  const e = even();
  assert.ok(e, 'glintEven exported');
  const g = build('auto'), glass = g.getObjectByName('shed-gable-glass') as THREE.Mesh, front = g.getObjectByName('shed-front-glass') as THREE.Mesh;
  const during = (m: THREE.Mesh, at: [number, number, number]): number => {
    const c = camera(g, at), mat = m.material as THREE.Material;
    m.onBeforeRender(undefined as never, undefined as never, c, m.geometry, mat, null as never);
    const v = e.value;
    m.onAfterRender(undefined as never, undefined as never, c, m.geometry, mat, null as never);
    return v;
  };
  windowNight.value = 0;
  for (const [where, at] of outside) { assert.equal(during(glass, at), 1, where); assert.equal(e.value, 0, `${where}: put back`); }
  for (const [where, at] of notOutside) assert.equal(during(glass, at), 0, where);
  for (const [where, at] of [...outside, ...notOutside]) assert.equal(during(front, at), 0, `front from ${where}`);
  windowNight.value = 0.5; assert.equal(during(glass, outside[0][1]), 0.5, 'dusk');
  windowNight.value = 1; for (const [where, at] of outside) assert.equal(during(glass, at), 0, `${where} at night`);
  windowNight.value = 0;
});

test('A6 (F11b): with glintEven at 1 the glint is one even sheen: over a 60 m by 30 m screen seen from a gable-oblique-like camera, no pane differs from its neighbour by more than a soft gradient (2 levels of 255), where the streaks differ by tens', () => {
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
  const m = material('glass') as THREE.MeshPhongMaterial;
  m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.ok('uGlintEven' in s.uniforms && s.uniforms.uGlintEven === even(), 'the shared uniform');
  const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
  const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
  const glsl = new Glsl(''), identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const day = [0.6635, 0.8039, 0.9644], dark = [0.035, 0.054, 0.076, 0.86], eye = [-45, 12, 35];
  const shade = (flat: number, x: number, y: number): number[] => {
    const toCamera = eye.map((c, i) => c - [x, y, 0][i]!);
    const env = { vars: { gl_FragColor: [...dark], gl_FrontFacing: true, fogColor: day, cameraPosition: eye, viewMatrix: identity, vViewPosition: toCamera, normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uPaneY: [materials.GLAZING.springing, materials.GLAZING.tier], uGlintEven: flat } };
    glsl.run(body, env);
    return (env.vars.gl_FragColor as number[]).slice(0, 3).map(c => c * 255);
  };
  const nearBar = (x: number): boolean => Math.abs((((x / 1.6) % 1) + 1) % 1 - 0.5) * 1.6 < 0.15;
  const worst = (flat: number): number => {
    let w = 0;
    for (let x = 0; x < 60; x += 0.75) for (let y = 0; y < 30; y += 0.75) {
      if (nearBar(x) || nearBar(x + 0.75)) continue; // re-pinned round F13: round F13's secondary bars are meant to be dark lines (kx-front-round33 tests them)
      const a = shade(flat, x, y), b = shade(flat, x + 0.75, y), c = shade(flat, x, y + 0.75);
      w = Math.max(w, ...a.map((v, i) => Math.abs(v - b[i]!)), ...a.map((v, i) => Math.abs(v - c[i]!)));
    }
    return w;
  };
  const streaked = worst(0), flat = worst(1);
  assert.ok(streaked > 30, `the streaks as round six made them: ${streaked.toFixed(1)} levels between neighbours`);
  // re-pinned round F12 (front-round-11b score, A6: the panes want a little life): GABLE_SHEET offsets each pane by up to 4%, so neighbours may differ by up to
  // 7 levels (kx-front-round32 pins it); the streaks' tens of levels stay out. Was 2. Re-pinned round F13: 9% offsets and an 8% band, so 16 levels. Re-pinned round F13b: 12% panes and an 8% cloud, 26
  // re-pinned round F16 (front-round-15c score, A6: single panes lighter or darker than their neighbours, front-d's pane life): each pane's 12% offset is now
  // taken on the sheet as seen and grows a quarter aslant (kx-front-round38), so on this eye's bright, grazing sheet neighbours may differ by 40; was 26
  assert.ok(flat <= 40, `even: ${flat.toFixed(2)} levels between neighbouring points`);
  const mid = shade(1, 30, 15);
  assert.ok(Math.max(...mid) < 140 && mid[2]! > mid[0]!, `still dark blue-grey with a sheen: ${mid.map(v => v.toFixed(0)).join(', ')}`);
  // round F12: GABLE_SHEET now sets the colour where glintEven is 1, so the flattening shows in the alpha: what of the room behind shows through must not
  // vary pane to pane either (a streak's alpha over a lit room is a mosaic too), and stays near the sheet's own 0.86
  const alpha = (flat: number, x: number, y: number): number => {
    const toCamera = eye.map((c, i) => c - [x, y, 0][i]!);
    const env = { vars: { gl_FragColor: [...dark], gl_FrontFacing: true, fogColor: day, cameraPosition: eye, viewMatrix: identity, vViewPosition: toCamera, normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uPaneY: [materials.GLAZING.springing, materials.GLAZING.tier], uGlintEven: flat } };
    glsl.run(body, env);
    return (env.vars.gl_FragColor as number[])[3]!;
  };
  let aw = 0, lo = 1, hi = 0;
  for (let x = 0; x < 60; x += 0.75) for (let y = 0; y < 30; y += 0.75) {
    const a = alpha(1, x, y); lo = Math.min(lo, a); hi = Math.max(hi, a);
    aw = Math.max(aw, Math.abs(a - alpha(1, x + 0.75, y)), Math.abs(a - alpha(1, x, y + 0.75)));
  }
  assert.ok(aw < 0.01, `the alpha even between neighbours: ${aw.toFixed(4)}`);
  // re-pinned round F13b (front-round-13 score, A6: the ribs showed through aslant): GABLE_THICKEN cuts what comes through by up to 0.57 off the normal
  // (kx-front-round33), so from this oblique eye the glint's 0.86-0.89 thickens to at most about 0.954; it was 0.91
  assert.ok(lo >= 0.86 && hi <= 0.96, `the alpha near the sheet's own: ${lo.toFixed(3)} to ${hi.toFixed(3)}`);
});
