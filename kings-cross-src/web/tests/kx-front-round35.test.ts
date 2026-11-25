// Round F15 (front-round-14 score, A6): from outside by day the gables' cloud patches are bright sky shapes (cores 35-50% over the pane), a third less of
// the room shows through (opacity 0.955 head-on, about 0.98 aslant), and aslant the colour takes more of the sky; inside, night and on-plane as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import { GLAZING, material, windowNight } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { Glsl, Mat } from './glsl.ts';

const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
const glsl = new Glsl(''), identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const day = [0.6635, 0.8039, 0.9644], P = GLAZING.spacing;
const run = (src: string, g: Glsl, even: number, x: number, y: number, cos = 1, cam: number[] = [0, 0, 0], a = 0.955): number[] => {
  const view = [Math.sqrt(1 - cos * cos), 0, cos];
  const env = { vars: { gl_FragColor: [0.45, 0.47, 0.5, a], gl_FrontFacing: true, fogColor: day, cameraPosition: cam, viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uGlintEven: even } };
  g.run(src, env);
  return (env.vars.gl_FragColor as number[]).map((c, i) => (i < 3 ? c * 255 : c));
};
const sweep = Array.from({ length: 48 }, (_, i) => [i * (2 * Math.PI / 0.02) / 48, 0, 0]);

test('A6 (F15): the cloud\'s cores sit 35-52% over the pane\'s own tone, lightening only', () => {
  let most = 0;
  for (let k = -12; k < 12; k += 3) for (const j of [1, 3]) {
    const y = GLAZING.springing + (j + 0.5) * GLAZING.tier, x = (k + 0.25) * P;
    const vals = sweep.map(cam => run(body, glsl, 1, x, y, 1, cam)[1]!), floor = Math.min(...vals);
    for (const v of vals) assert.ok(v / floor <= 1.52, `at most 52%: ${(v / floor).toFixed(3)}`);
    most = Math.max(most, Math.max(...vals) / floor);
  }
  assert.ok(most >= 1.35, `bright sky cores: ${most.toFixed(3)}`);
});

test('A6 (F15, re-pinned F15b): from outside by day less of the room shows through, a quarter of F14\'s: opacity 0.982 head-on, 0.99-0.996 aslant; inside the library glass', () => {
  const O = shed.GABLE_OUTSIDE;
  // re-pinned round F15b (front-round-15 score, A6: the ribs behind no fainter): the room's share cut by 0.6 more, kx-front-round36 pins it: 0.982 head-on, a
  // quarter of F14's 0.07 through; were 0.955 and a third less
  assert.ok(Math.abs(O.opacity - 0.982) < 0.004, `head-on ${O.opacity}`);
  assert.ok((1 - O.opacity) <= (1 - 0.93) * 0.32 && (1 - O.opacity) >= (1 - 0.93) * 0.2, 'a quarter of F14 through');
  const aslant = run(body, glsl, 1, 0.4, 15, 0.75, [0, 0, 0], O.opacity)[3]!;
  // re-pinned round F15b: with 0.982 head-on, aslant 0.99-0.996; was 0.975-0.985
  assert.ok(aslant >= 0.99 && aslant <= 0.996, `aslant ${aslant.toFixed(4)}`);
  const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
  const g = shed.buildShed(layout, { range: false, roof: 'auto' }); g.updateMatrixWorld(true);
  const glass = g.getObjectByName('shed-gable-glass') as THREE.Mesh, mat = glass.material as THREE.MeshPhongMaterial, base = mat.opacity;
  const draw = (p: [number, number, number]): number => {
    const c = new THREE.PerspectiveCamera(); c.position.copy(g.localToWorld(new THREE.Vector3(...p)));
    glass.onBeforeRender(undefined as never, undefined as never, c, glass.geometry, mat, null as never);
    const o = mat.opacity; glass.onAfterRender(undefined as never, undefined as never, c, glass.geometry, mat, null as never); return o;
  };
  windowNight.value = 0;
  assert.equal(draw([layout.width / 2, 18, -layout.length - 90]), O.opacity);
  assert.equal(draw([layout.spine, 8, -layout.length / 2]), base, 'inside: as before');
  windowNight.value = 1;
  assert.equal(draw([layout.width / 2, 18, -layout.length - 90]), base, 'night: as before');
  windowNight.value = 0;
});

test('A6 (F15): aslant the colour takes 0.15-0.2 of the sky: at 37 degrees off the normal 14-45 levels lighter than without the tint, still a dark sheet', () => {
  const lines = body.split('\n'), i = lines.findIndex(l => l.startsWith('float gr = '));
  const untinted = lines[i]!.replace(/^float gr = max\( (.*), [0-9.]+ \* \( 1\.0 - smoothstep\(.*\) \) \) \* gs;$/, 'float gr = ( $1 ) * gs;');
  assert.notEqual(untinted, lines[i]);
  const src0 = [...lines.slice(0, i), untinted, ...lines.slice(i + 1)].join('\n'), g0 = new Glsl('');
  for (const x of [0.4, 7.3, -12.2]) {
    const now = run(body, glsl, 1, x, 15, 0.8), none = run(src0, g0, 1, x, 15, 0.8);
    const d = now[1]! - none[1]!;
    assert.ok(d >= 14 && d <= 45, `aslant lighter by ${d.toFixed(1)}`);
    assert.ok(now[1]! < 135 && now[2]! > now[0]!, `still a dark blue-grey sheet: ${now.slice(0, 3).map(v => v.toFixed(0))}`);
  }
  assert.deepEqual(run(body, glsl, 1, 0.4, 15, 1), run(src0, g0, 1, 0.4, 15, 1), 'head-on: none');
});
