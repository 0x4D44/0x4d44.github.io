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

test('crownAbove: nothing at level 0; at full a bar is lifted about twice and a pane a little, so the bars stay finer and darker than the glass, not a grid', () => {
  const src = L.CROWN_ABOVE_GLSL as string | undefined;
  assert.ok(src, 'CROWN_ABOVE_GLSL is exported');
  const glsl = new Glsl(src), env = { vars: {}, fns: {} }, c = [0.3, 0.45, 0.62];
  const above = (w: number, pane: number): number[] => glsl.call('crownAbove', [c, w, pane], env) as number[];
  assert.deepEqual(above(0, 0), c, 'level 0: the colour as it was, on a bar');
  assert.deepEqual(above(0, 1), c, 'level 0: on a pane');
  const bar = luma(above(1, 0)) / luma(c), pane = luma(above(1, 1)) / luma(c);
  assert.ok(bar >= 1.8 && bar <= 2.2, `a bar lifted ${bar.toFixed(2)} times`);
  assert.ok(pane >= 1.05 && pane <= 1.25, `a pane lifted ${pane.toFixed(2)} times`);
  assert.ok(bar > pane, 'the bars lifted more than the panes: their contrast falls');
  const far = luma(above(1, 0.72)) / luma(c);
  assert.ok(far > pane && far < bar, `far off, where the mask is the pane's share of the tile, between: ${far.toFixed(2)}`);
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
  assert.ok(line.startsWith('if ( uCrownAbove * uCrownBelow > 0.0 )') && line.includes('clamp( dot( normal, viewMatrix[ 1 ].xyz ), 0.0, 1.0 )'), 'skipped at level 0 or by night; by how far the face looks up');
  assert.ok(f.indexOf('float crownPaneK =') < f.indexOf(line) && f.indexOf(line) < f.indexOf('#include <opaque_fragment>'), 'after the pane mask, before the output');
  // the program before round 11: the same glass, given only the look from below
  const was = (material('shedGlass') as THREE.MeshLambertMaterial).clone();
  lighting.addCrownBelow(was);
  const old = compile(was);
  assert.equal(f.replace(`\nuniform float uCrownAbove;\n${src}`, '').replace(`${line}\n`, ''), old.fragmentShader, 'the fragment shader otherwise byte for byte');
  assert.equal(now.vertexShader, old.vertexShader, 'the vertex shader untouched');
  assert.deepEqual(Object.keys(now.uniforms).filter((k) => k !== 'uCrownAbove'), Object.keys(old.uniforms), 'the same uniforms but its own level');
  for (const k of Object.keys(old.uniforms)) assert.ok(now.uniforms[k] === old.uniforms[k], `${k} the shared one`);
  // the level follows the camera: 0 for a platform eye and under the crown, 1 from the overview's distance
  const level = now.uniforms.uCrownAbove as THREE.IUniform<number>;
  const eye = (x: number, y: number, z: number): number => { // a point in the shed's own frame (x from its west side, z north, negative)
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(x, y, z).applyMatrix4(group.matrixWorld);
    level.value = -1;
    mesh.onBeforeRender(undefined as never, undefined as never, cam, mesh.geometry, glass, null as never);
    return level.value;
  };
  assert.equal(eye(layout.spine - 10, 2.5, -100), 0, 'a platform eye');
  assert.equal(eye(layout.spine + 10, layout.crown - 1, -200), 0, 'just under the crown');
  assert.equal(eye(layout.spine, 60, 200), 1, 'from far off, outside');
  assert.ok(!((group.getObjectByName('shed-roof-cladding') as THREE.Mesh).material as THREE.Material).customProgramCacheKey().includes('crownAbove'), 'the glass only');
});
