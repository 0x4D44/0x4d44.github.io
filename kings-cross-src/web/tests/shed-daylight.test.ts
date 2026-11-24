// The milky crown (lighting.ts SHED_GLASS): under the shed's two glazed vaults by day the sun's shadow is softened, as the crown's diffusing glass
// softens it (shed-a-north-from-footbridge-2019: the ribs' shadows on the east arcade wall are grey bands, the shade 0.6 of the lit brick on the screen);
// outside the shed, in its east aisle, under the moon and in every other scene, the sun's shadow is what it was. A namespace import, so a missing export
// fails an assertion here and not the whole file's link.
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
buildShed(layout); // tells the shaders where the shed stands
const uniforms = lighting.roofShadeUniforms as unknown as Record<string, THREE.IUniform>;
const fakeRenderer = (): THREE.WebGLRenderer => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }) as unknown as THREE.WebGLRenderer;

/** The sun's shadow factor the program draws with at world point p for a map answer s (1 lit, 0 in shadow): three's, wrapped by the crown's softening. */
function sunFactor(s: number, p: [number, number, number]): number {
  const glass = L.SHED_GLASS as { lit: number } | undefined;
  const src = L.SHED_GLASS_GLSL as string | undefined;
  if (!glass || !src || !uniforms.uShedDiffuse) return s; // f0745dc4: no softening anywhere
  const glsl = new Glsl(src);
  const env: Env = { vars: Object.fromEntries(Object.entries(uniforms).map(([k, u]) => [k, toValue(u.value)])) as Record<string, Value>, fns: {} };
  const inside = glsl.call('shedInside', [p], env) as number;
  const k = (uniforms.uShedDiffuse.value as number) * inside;
  return s * (1 - k) + glass.lit * k;
}

test('the milky crown: under the vaults by day a rib\'s shadow keeps 0.3 to 0.5 of a sunlit point\'s sun (the shade 0.6 of the lit brick on screen in shed-a, the hemisphere\'s light on top); it was none', () => {
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  for (const [u, v, y] of [[layout.spine - R, 100, 1.5], [layout.spine + R, 200, 1.5], [layout.spine - 2 * R + 3, 150, 4]] as const) {
    const p = at(u, v, y);
    const ratio = sunFactor(0, p) / sunFactor(1, p);
    assert.ok(ratio >= 0.3 && ratio <= 0.5, `at ${u.toFixed(1)}, ${v}, ${y}: shadow/sun ${ratio.toFixed(3)}`);
    assert.ok(sunFactor(1, p) >= 0.65 && sunFactor(1, p) <= 0.8, `a sunlit point keeps most of its sun: ${sunFactor(1, p).toFixed(3)}`);
  }
});

test('the milky crown: outside the shed, over its crown, in its east aisle, under the moon and in a scene other than London\'s the sun\'s shadow is unchanged', () => {
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  const unchanged = (p: [number, number, number], why: string): void => {
    assert.equal(sunFactor(0, p), 0, `${why}: shadow`);
    assert.equal(sunFactor(1, p), 1, `${why}: sun`);
  };
  unchanged(at(layout.spine - R, -60, 1.5), 'the forecourt, south of the front');
  unchanged(at(layout.spine - R, layout.length + 40, 1.5), 'the throat, north of the gables');
  unchanged(at(layout.spine - R, 100, layout.crown + 5), 'over the crown');
  unchanged(at(layout.spine + 2 * R + 4, 100, 1.5), 'the east aisle, under its slate');
  unchanged(at(layout.spine - 2 * R - 6, 100, 1.5), 'west of the shed');
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0, false as never);
  unchanged(at(layout.spine - R, 100, 1.5), 'the moon is the key light');
  lighting.grade(fakeRenderer(), true, 1, 0, 0);
  unchanged(at(layout.spine - R, 100, 1.5), 'a graded scene with no hemisphere given (Waverley, Perth)');
  lighting.grade(fakeRenderer(), false, 1);
  unchanged(at(layout.spine - R, 100, 1.5), 'a scene with no climate');
});

test('the milky crown is in every roof-shaded Lambert program: three\'s directional shadow line wrapped once, its uniforms the shared ones', () => {
  const m = new THREE.MeshLambertMaterial({ color: 0x808080 });
  lighting.addRoofShade(m);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  const glass = L.SHED_GLASS as { lit: number } | undefined;
  assert.ok(glass, 'SHED_GLASS is exported');
  assert.equal(f.split('directLight.color *= mix( ( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow( directionalShadowMap[ i ]').length - 1, 1, 'the directional line is wrapped once');
  assert.equal(f.split(`: 1.0, ${glass.lit.toFixed(2)}, shedSoft );`).length - 1, 1, 'toward the crown\'s even light, by shedSoft');
  assert.ok(f.indexOf('float shedInside(') >= 0 && f.indexOf('float shedInside(') < f.indexOf('float shedSoft ='), 'declared before it is used');
  assert.equal(f.split('float shedSoft = uShedDiffuse > 0.0 ? uShedDiffuse * shedInside( cameraPosition - vViewPosition * mat3( viewMatrix ) ) : 0.0;').length - 1, 1, 'shedSoft is the diffuse share times how far inside the shed the fragment is');
  assert.ok(!f.includes('#include <lights_fragment_begin>'), 'three\'s chunk is replaced by the wrapped copy');
  for (const name of ['uShedDiffuse', 'uShedFrame', 'uShedSize']) assert.ok(shader.uniforms[name] === uniforms[name], `${name} is the shared one`);
});
