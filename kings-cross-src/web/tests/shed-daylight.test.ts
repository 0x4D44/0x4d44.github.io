// The sky through the crown (lighting.ts SHED_GLASS): in the shed's two vaults by day the shade under a rib is lifted by the crown's sky, and the sun's
// streaks stay at full strength (shed-b: crisp, near-white streaks; shed-a: the shade about 0.6 of the lit brick on the screen); outside the shed, on the
// roof's shell, in its east aisle, under the moon and in every other scene, the sun's shadow is what it was. And the crown's glass seen from below by day
// (lighting.ts CROWN_BELOW) reads grey-white, in its own program only. A namespace import, so a missing export fails an assertion here and not the whole file's link.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { SHED_SPAN_WIDTH, shedLayout, shedToWorld } from '../../core/station.ts';
import * as lighting from '../src/lighting.ts';
import { buildShed } from '../src/shed.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Env, Value } from './glsl.ts';

const L = lighting as unknown as Record<string, unknown>;
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const at = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, y, z]; };
const shed = buildShed(layout); // tells the shaders where the shed stands
shed.updateMatrixWorld(true);
const uniforms = lighting.roofShadeUniforms as unknown as Record<string, THREE.IUniform>;
const fakeRenderer = (): THREE.WebGLRenderer => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }) as unknown as THREE.WebGLRenderer;

/** The sun's shadow factor the program draws with at world point p for a map answer s (1 lit, 0 in shadow): three's, wrapped as the program wraps it (594f0db0: toward `lit`; now: toward 1). */
function sunFactor(s: number, p: [number, number, number]): number {
  const glass = L.SHED_GLASS as { lit?: number } | undefined;
  const src = L.SHED_GLASS_GLSL as string | undefined;
  if (!glass || !src || !uniforms.uShedDiffuse) return s; // f0745dc4: no softening anywhere
  const k = (uniforms.uShedDiffuse.value as number) * inside(p);
  return s * (1 - k) + (glass.lit ?? 1) * k;
}
function inside(p: [number, number, number]): number {
  const src = L.SHED_GLASS_GLSL as string | undefined;
  if (!src) return 0;
  const env: Env = { vars: Object.fromEntries(Object.entries(uniforms).map(([k, u]) => [k, toValue(u.value)])) as Record<string, Value>, fns: {} };
  return new Glsl(src).call('shedInside', [p], env) as number;
}
/** The wall's own shade light, as a share of the sun's, read off the f0745dc4 capture (p8-south: shade 0.34 of lit on screen, about 0.093 linear on a 2.2 curve). */
const WALL_SHADE = 0.093 / (1 - 0.093);

test('the sky through the crown: in the vaults by day a sunlit point keeps exactly all its sun, and a rib\'s shadow on the wall reads 0.55 to 0.65 of the lit brick on the screen (shed-a, 0.6); it was 0.34, then 0.68 with the sun dimmed to 0.72 (594f0db0)', () => {
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  for (const [u, v, y] of [[layout.spine - R, 100, 1.5], [layout.spine + R, 200, 1.5], [layout.spine - 2 * R + 0.02, 150, 3], [layout.spine + 2 * R - 0.02, 120, 2]] as const) {
    const p = at(u, v, y);
    assert.equal(sunFactor(1, p), 1, `at ${u.toFixed(1)}, ${v}, ${y}: a sunlit point keeps all its sun`);
    const screen = ((WALL_SHADE + sunFactor(0, p)) / (WALL_SHADE + 1)) ** (1 / 2.2);
    assert.ok(screen >= 0.55 && screen <= 0.65, `at ${u.toFixed(1)}, ${v}, ${y}: the shade reads ${screen.toFixed(3)} of the lit on screen`);
  }
});

test('the sky through the crown leaves the roof\'s shell and the walls\' outer faces alone: every vertex of the cladding, glass, lining and outer bars, and the outside of the side walls, is outside it (the roof outside was 6-8% darker in 594f0db0)', () => {
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  const v = new THREE.Vector3();
  for (const name of ['shed-roof-cladding', 'shed-roof-glass', 'shed-roof-lining', 'shed-roof-bars']) {
    const m = shed.getObjectByName(name) as THREE.Mesh | undefined;
    assert.ok(m, `${name} is in the shed`);
    const pos = m.geometry.getAttribute('position');
    let worst = 0;
    for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); worst = Math.max(worst, inside([v.x, v.y, v.z])); }
    assert.equal(worst, 0, `${name}: the most any vertex takes is ${worst}`);
  }
  for (const [u, y] of [[layout.spine - 2 * R - 0.6, 3], [layout.spine + 2 * R + 0.6, 3], [layout.spine - 2 * R - 0.85, 1]] as const) {
    for (const s of [0, 1]) assert.equal(sunFactor(s, at(u, 150, y)), s, `the wall's outer face at ${u.toFixed(1)}, ${y}`);
  }
});

test('the sky through the crown: outside the shed, over its springing, in its east aisle, under the moon and in a scene other than London\'s the sun\'s shadow is unchanged', () => {
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  const unchanged = (p: [number, number, number], why: string): void => {
    assert.equal(sunFactor(0, p), 0, `${why}: shadow`);
    assert.equal(sunFactor(1, p), 1, `${why}: sun`);
  };
  unchanged(at(layout.spine - R, -60, 1.5), 'the forecourt, south of the front');
  unchanged(at(layout.spine - R, layout.length + 40, 1.5), 'the throat, north of the gables');
  unchanged(at(layout.spine - R, 100, layout.crown + 5), 'over the crown');
  unchanged(at(layout.spine - R, 100, layout.springing + 0.5), 'above the springing, in the vault under the roof');
  unchanged(at(layout.spine + 2 * R + 4, 100, 1.5), 'the east aisle, under its slate');
  unchanged(at(layout.spine - 2 * R - 6, 100, 1.5), 'west of the shed');
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0, false as never);
  unchanged(at(layout.spine - R, 100, 1.5), 'the moon is the key light');
  lighting.grade(fakeRenderer(), true, 1, 0, 0);
  unchanged(at(layout.spine - R, 100, 1.5), 'a graded scene with no hemisphere given (Waverley, Perth)');
  lighting.grade(fakeRenderer(), false, 1);
  unchanged(at(layout.spine - R, 100, 1.5), 'a scene with no climate');
});

test('the sky through the crown is in every roof-shaded Lambert program: three\'s directional shadow line wrapped once, its uniforms the shared ones', () => {
  const m = new THREE.MeshLambertMaterial({ color: 0x808080 });
  lighting.addRoofShade(m);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  assert.ok(L.SHED_GLASS, 'SHED_GLASS is exported');
  assert.equal(f.split('directLight.color *= mix( ( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow( directionalShadowMap[ i ]').length - 1, 1, 'the directional line is wrapped once');
  assert.equal(f.split(': 1.0, 1.0, shedSoft );').length - 1, 1, 'the shade lifted toward the full sun by shedSoft; the sun\'s own patches stay at 1');
  assert.ok(!f.includes('crownBelow'), 'the crown\'s look from below is not in any other program');
  assert.ok(f.indexOf('float shedInside(') >= 0 && f.indexOf('float shedInside(') < f.indexOf('float shedSoft ='), 'declared before it is used');
  assert.equal(f.split('float shedSoft = uShedDiffuse > 0.0 ? uShedDiffuse * shedInside( cameraPosition - vViewPosition * mat3( viewMatrix ) ) : 0.0;').length - 1, 1, 'shedSoft is the diffuse share times how far inside the shed the fragment is');
  assert.ok(!f.includes('#include <lights_fragment_begin>'), 'three\'s chunk is replaced by the wrapped copy');
  for (const name of ['uShedDiffuse', 'uShedFrame', 'uShedSize']) assert.ok(shader.uniforms[name] === uniforms[name], `${name} is the shared one`);
});

test('the crown from below: grey-white by day in London\'s scene, untouched by night, under the moon and elsewhere; the shed\'s glass only, on a face that looks down', () => {
  const src = L.CROWN_BELOW_GLSL as string | undefined;
  assert.ok(src, 'CROWN_BELOW_GLSL is exported');
  const glsl = new Glsl(src);
  const blue = [0.3, 0.45, 0.62];
  const luma = (c: number[]): number => 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
  const spread = (c: number[]): number => Math.max(...c) / Math.min(...c);
  assert.deepEqual(glsl.call('crownBelow', [blue, 0], { vars: {}, fns: {} }), blue, 'none of it: the colour as it was');
  const w = (L.CROWN_BELOW as { amount: number }).amount;
  const out = glsl.call('crownBelow', [blue, w], { vars: {}, fns: {} }) as number[];
  assert.ok(spread(out) < 1.25, `grey-white, not sky blue: ${out.map((x) => x.toFixed(3))} (was ${spread(blue).toFixed(2)} across)`);
  assert.ok(luma(out) >= 1.3 * luma(blue), `brighter: ${luma(out).toFixed(3)} from ${luma(blue).toFixed(3)}`);
  const below = L.crownBelowUniforms as { uCrownBelow: THREE.IUniform } | undefined;
  const level = (): number => below?.uCrownBelow.value as number;
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  assert.equal(level(), 1, 'by day in London\'s scene');
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0, false as never);
  assert.equal(level(), 0, 'the moon is the key light');
  lighting.grade(fakeRenderer(), true, 1, 0, 0);
  assert.equal(level(), 0, 'Waverley, Perth');
  lighting.grade(fakeRenderer(), false, 1);
  assert.equal(level(), 0, 'no climate');
  const glass = (shed.getObjectByName('shed-roof-glass') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  assert.ok(glass.customProgramCacheKey().includes('crownBelow'), 'the shed\'s glass is its own program');
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  glass.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  assert.ok(below && shader.uniforms.uCrownBelow === below.uCrownBelow, 'the shared level');
  const line = `if ( uCrownBelow > 0.0 ) outgoingLight = crownBelow( outgoingLight, uCrownBelow * ${w.toFixed(2)} * smoothstep( 0.0, `;
  assert.equal(f.split(line).length - 1, 1, 'applied once, and only while the level is on (the night skips it)');
  assert.ok(f.includes(', clamp( dot( normal, -viewMatrix[ 1 ].xyz ), 0.0, 1.0 ) ) );') && f.indexOf(line) < f.indexOf('#include <opaque_fragment>'), 'by how far the face seen looks down, before the output');
  for (const name of ['shed-roof-cladding', 'shed-roof-lining', 'shed-roof-bars']) {
    const m = (shed.getObjectByName(name) as THREE.Mesh).material as THREE.Material;
    assert.ok(!m.customProgramCacheKey().includes('crownBelow'), `${name} is not given it`);
  }
});
