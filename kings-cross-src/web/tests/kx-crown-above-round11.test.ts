// Round 11 (the end-rib-round-2 score, A5): the crown's glass seen from outside reads as pale glazing with fine bars (R-kx-front-e), not a grid of the
// shedGlass tile's dark astragal lines; every view from inside draws it exactly as before. A namespace import, so a missing export fails an assertion
// here and not the whole file's link.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import * as lighting from '../src/lighting.ts';
import * as shedModule from '../src/shed.ts';
import { material } from '../src/materials.ts';
import { Glsl } from './glsl.ts';

const L = lighting as unknown as Record<string, unknown>;
const S = shedModule as unknown as Record<string, unknown>;
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
const luma = (c: number[]): number => 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
const compile = (m: THREE.Material): { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> } => {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader;
};

test('crownOutside is 0 anywhere under the roof, rises over ROOF_EXTERIOR.fade metres out, and is 1 beyond; it takes no roof mode', () => {
  const out = S.crownOutside as ((cam: [number, number, number], l: typeof layout) => number) | undefined;
  assert.ok(out, 'crownOutside is exported');
  assert.equal(out.length, 2, 'no roof mode: the roof modes change opacity only');
  const W = layout.width, Lg = layout.length;
  for (const p of [[W / 2, 2.5, -Lg / 2], [1, layout.crown, -1], [W - 0.5, 1, -Lg + 0.5], [W / 2, layout.crown + 1, -100]] as [number, number, number][]) assert.equal(out(p, layout), 0, `inside at ${p}`);
  const fade = (shedModule.ROOF_EXTERIOR as { fade: number }).fade;
  const half = out([W + fade / 2, 10, -100], layout);
  assert.ok(half > 0.2 && half < 0.8, `half way out ${half}`);
  for (const p of [[W + fade, 10, -100], [W / 2, 10, fade + 1], [W / 2, layout.crown + 1 + fade / 4, -100]] as [number, number, number][]) assert.equal(out(p, layout), 1, `outside at ${p}`);
});

test('crownAbove: nothing at level 0; at full the pane is lifted about 1.3 times and a bar to within about 10% of it, read off the texel; nothing pushed past the cap', () => {
  const src = L.CROWN_ABOVE_GLSL as string | undefined, A = L.CROWN_ABOVE as { pane: number; share: number; paneLuma: number; barLuma: number; max: number } | undefined;
  assert.ok(src && A, 'CROWN_ABOVE and its GLSL are exported');
  // the tile's own colours (materials.ts paintShedGlass), decoded as the GPU decodes the sRGB texture
  const lin = (v: number): number => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const paneRgb = [178, 208, 230].map(lin), barRgb = [66, 74, 82].map(lin);
  assert.ok(Math.abs(luma(paneRgb) - A.paneLuma) < 0.002 && Math.abs(luma(barRgb) - A.barLuma) < 0.002, `the pane ${luma(paneRgb).toFixed(4)} and the bar ${luma(barRgb).toFixed(4)} as painted`);
  const glsl = new Glsl(src), env = { vars: {}, fns: {} };
  const above = (c: number[], w: number, texel: number[]): number[] => glsl.call('crownAbove', [c, w, luma(texel)], env) as number[];
  const lit = (rgb: number[], k: number): number[] => rgb.map((x) => x * k); // the texel under a light: what outgoingLight is
  for (const t of [paneRgb, barRgb]) assert.deepEqual(above(lit(t, 0.6), 0, t), lit(t, 0.6), 'level 0: the colour as it was');
  const pane = above(lit(paneRgb, 0.6), 1, paneRgb), bar = above(lit(barRgb, 0.6), 1, barRgb);
  const lift = luma(pane) / luma(lit(paneRgb, 0.6)), was = luma(barRgb) / luma(paneRgb), now = luma(bar) / luma(pane);
  assert.ok(lift >= 1.25 && lift <= 1.35, `a pane lifted ${lift.toFixed(2)} times`);
  assert.ok(was < 0.15 && now >= 0.85 && now <= 0.95, `a bar against the pane ${now.toFixed(3)}, from ${was.toFixed(3)}`);
  const half = paneRgb.map((x, i) => (x + (barRgb[i] as number)) / 2), mid = luma(above(lit(half, 0.6), 1, half)) / luma(pane);
  assert.ok(mid > now - 0.1 && mid < 1.05, `a texel half bar (a filtered edge) comes out with the rest, not as a bright line: ${mid.toFixed(3)}`);
  const bright = [0.8, 0.86, 0.95], capped = above(bright, 1, paneRgb);
  capped.forEach((x, i) => assert.ok(x <= Math.max(bright[i] as number, A.max) + 1e-9 && x >= (bright[i] as number) - 1e-9, `channel ${i}: ${x.toFixed(3)} capped at ${A.max}, never darker`));
  const sheen = above(lit(paneRgb, 0.6), 1, paneRgb.map((x) => x * 1.15));
  assert.ok(Math.abs(luma(sheen) / luma(pane) - 1) < 1e-6, 'the lighter sheen band counts as pane');
});

test('the shed\'s glass carries it, by day only and on a face that looks up; with that one line and its declarations taken out the program is the one it was', () => {
  const group = shedModule.buildShed(layout, { range: false });
  group.updateMatrixWorld(true);
  const mesh = group.getObjectByName('shed-roof-glass') as THREE.Mesh;
  const glass = mesh.material as THREE.MeshLambertMaterial;
  assert.ok(glass.customProgramCacheKey().endsWith('+crownBelow+crownAbove'), `its own program: ${glass.customProgramCacheKey()}`);
  const line = L.CROWN_ABOVE_LINE as string, src = L.CROWN_ABOVE_GLSL as string;
  const now = compile(glass), f = now.fragmentShader;
  assert.equal(f.split(line).length - 1, 1, 'the line once');
  assert.ok(line.includes('\nif ( uCrownAbove * uCrownBelow > 0.0 )') && line.includes('clamp( dot( normal, viewMatrix[ 1 ].xyz ), 0.0, 1.0 )'), 'skipped at level 0 or by night; by how far the face looks up');
  assert.ok(line.includes('dot( sampledDiffuseColor.rgb,') && f.indexOf('#include <map_fragment>') < f.indexOf(line) && f.indexOf(line) < f.indexOf('#include <opaque_fragment>'), 'read off the texel after the map is sampled, before the output');
  assert.ok(line.includes('), crownTexel );\n'), 'the lift is masked by that texel');
  // the program before round 11: the same glass, given only the look from below
  const was = (material('shedGlass') as THREE.MeshLambertMaterial).clone();
  lighting.addCrownBelow(was);
  const old = compile(was);
  assert.equal(f.replace(`\nuniform float uCrownAbove;\nuniform float uCrownAlpha;\n${src}`, '').replace(`${line}\n`, ''), old.fragmentShader, 'the fragment shader otherwise byte for byte');
  assert.equal(now.vertexShader, old.vertexShader, 'the vertex shader untouched');
  assert.deepEqual(Object.keys(now.uniforms).filter((k) => k !== 'uCrownAbove' && k !== 'uCrownAlpha'), Object.keys(old.uniforms), 'the same uniforms but its own level and alpha');
  for (const k of Object.keys(old.uniforms)) assert.ok(now.uniforms[k] === old.uniforms[k], `${k} the shared one`);
  // the level follows the camera: 0 for a platform eye and under the crown, 1 from the overview's distance
  const level = now.uniforms.uCrownAbove as THREE.IUniform<number>, alpha = now.uniforms.uCrownAlpha as THREE.IUniform<number>;
  assert.ok(line.endsWith('\nif ( uCrownAlpha * uCrownBelow > 0.0 ) diffuseColor.a = max( diffuseColor.a, uCrownAlpha );'), 'by day, the alpha raised to at least uCrownAlpha, never lowered');
  const clad = group.getObjectByName('shed-roof-cladding') as THREE.Mesh;
  const look = (g: THREE.Group, x: number, y: number, z: number): { level: number; alpha: number; opacity: number } => { // a point in the shed's frame
    const m = g.getObjectByName('shed-roof-glass') as THREE.Mesh, c = g.getObjectByName('shed-roof-cladding') as THREE.Mesh, mat = m.material as THREE.MeshLambertMaterial;
    const u = compile(mat).uniforms, cam = new THREE.PerspectiveCamera();
    cam.position.set(x, y, z).applyMatrix4(g.matrixWorld);
    (u.uCrownAbove as THREE.IUniform<number>).value = -1; (u.uCrownAlpha as THREE.IUniform<number>).value = -1;
    c.onBeforeRender(undefined as never, undefined as never, cam, c.geometry, c.material as THREE.Material, null as never);
    m.onBeforeRender(undefined as never, undefined as never, cam, m.geometry, mat, null as never);
    return { level: u.uCrownAbove!.value as number, alpha: u.uCrownAlpha!.value as number, opacity: mat.opacity };
  };
  const eye = (x: number, y: number, z: number): number => look(group, x, y, z).level;
  assert.ok(clad && level && alpha, 'the cladding and both uniforms');
  // inside, the glass's opacity is what the roof gives it (GLASS_OPACITY.near) and its alpha is not raised; outside far off, at least CROWN_ALPHA
  const near = (shedModule.GLASS_OPACITY as { near: number; far: number }), raise = L.CROWN_ALPHA as number;
  for (const p of [[layout.spine - 10, 2.5, -100], [layout.spine + 10, layout.crown - 1, -200]] as [number, number, number][]) {
    const v = look(group, ...p);
    assert.ok(v.alpha === 0 && Math.abs(v.opacity - near.near) < 1e-9, `inside at ${p}: alpha ${v.alpha}, opacity ${v.opacity}`);
  }
  const far = look(group, layout.spine, 300, 600);
  assert.ok(raise >= 0.8 && raise <= 0.9 && Math.abs(far.alpha - raise) < 1e-9 && Math.abs(far.opacity - near.far) < 1e-9, `far off: alpha ${far.alpha}, the material's opacity still ${far.opacity}`);
  // the x-ray roof mode scales it as it scales the roof
  const xray = shedModule.buildShed(layout, { range: false, roof: 'xray' });
  xray.updateMatrixWorld(true);
  const xr = look(xray, layout.spine, 300, 600);
  assert.ok(Math.abs(xr.alpha - raise * (shedModule.XRAY_OPACITY as number)) < 1e-9 && Math.abs(xr.opacity - near.far) < 1e-9, `x-ray: alpha ${xr.alpha}`);
  assert.equal(look(xray, layout.spine - 10, 2.5, -100).alpha, 0, 'x-ray, inside: not raised');
  assert.equal(eye(layout.spine - 10, 2.5, -100), 0, 'a platform eye');
  assert.equal(eye(layout.spine + 10, layout.crown - 1, -200), 0, 'just under the crown');
  assert.equal(eye(layout.spine, 60, 200), 1, 'from far off, outside');
  assert.ok(!((group.getObjectByName('shed-roof-cladding') as THREE.Mesh).material as THREE.Material).customProgramCacheKey().includes('crownAbove'), 'the glass only');
});
