// Round F18 (front-round-17 score, A6/B3): from outside by day the sky's reflection over each north gable is near front-d's strength, broad but blotchy; the
// ordinary mullions are fine and only every third reads strong; and two fine bars a bay make the lights about 5:1, F13's mid-pane bar retired.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SHED_SPAN_WIDTH } from '../../core/station.ts';
import * as M from '../src/materials.ts';
import { GABLE_SHEET, GLAZING, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { Glsl, Mat } from './glsl.ts';

const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, open = '#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\n', first = f.indexOf(`${open}vec2 gm`), second = f.indexOf(open, f.indexOf('#endif', first));
const block = second > 0 ? f.slice(second + open.length, f.indexOf('#endif', second)) : '';
const identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), day = [0.6635, 0.8039, 0.9644], P = GLAZING.spacing, R = SHED_SPAN_WIDTH / 2;
const sheet = [0.29, 0.31, 0.34, 0.98];
const field = (src: string): ((x: number, y: number) => number) => {
  const g = new Glsl('');
  return (x, y) => {
    const env = { vars: { gl_FragColor: [...sheet], gl_FrontFacing: true, fogColor: day, cameraPosition: [0, 0, 0], viewMatrix: identity, vViewPosition: [0, 0, 50], normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uPaneY: [GLAZING.springing, GLAZING.tier], uGlintEven: 1, uGableBars: 0 } };
    g.run(src, env);
    return (env.vars.gl_FragColor as number[])[1]! * 255;
  };
};

test('A6 (F18): from outside by day the reflection alone spreads each gable 30-45 levels from its 5th to its 95th percentile, broad zones broken by a finer blotch', () => {
  assert.ok(block.includes('gz'), 'the reflection field');
  const now = field(block), B = (M as Record<string, unknown>).GABLE_REFLECT as { blotch?: { weight: number } };
  assert.ok(B.blotch && B.blotch.weight > 0.1 && B.blotch.weight < 0.4, 'a finer wave at a low weight');
  const smooth = field(block.replace(/^gz \+= .*$/m, ''));
  for (const side of [-1, 1]) {
    const v: number[] = [];
    let diff = 0, n = 0;
    for (let u = 0.5; u < 31.5; u += 0.5) for (let y = 10; y <= 21; y += 1) { const a = now(side * u, y); v.push(a); diff += (a - smooth(side * u, y)) ** 2; n++; }
    v.sort((a, b) => a - b);
    const spread = v[Math.floor(0.95 * (v.length - 1))]! - v[Math.floor(0.05 * (v.length - 1))]!;
    assert.ok(spread >= 30 && spread <= 45, `gable ${side}: ${spread.toFixed(1)} levels from p5 to p95`);
    assert.ok(Math.sqrt(diff / n) >= 2, `gable ${side}: the blotch moves it ${Math.sqrt(diff / n).toFixed(1)} levels (rms)`);
  }
});

test('A6/B3 (F18): the ordinary north-screen mullions are 0.5-0.7 of the lunette\'s 0.09 m, the main ones as F17\'s', () => {
  const ms = shed.gableBars(0, GLAZING.springing, shed.GABLE_GLASS_FROM, R).filter(b => b.kind === 'mullion');
  for (const b of ms) {
    const k = Math.round(b.c[0] / P), w = b.s[0];
    if (k % 3 === 0) assert.ok(Math.abs(w - 0.09 * 1.75) < 1e-9, `main mullion ${k}: ${w}`);
    else assert.ok(w >= 0.045 && w <= 0.063 && b.s[2] <= 0.12 * 0.7, `mullion ${k}: ${w.toFixed(3)} m wide, ${b.s[2].toFixed(3)} deep`);
  }
});

test('A6 (F18): two fine bars a bay, the lights 4.5-5.5 times as tall as wide; F13\'s mid-pane bar retired', () => {
  const F = (M as Record<string, unknown>).GABLE_FINE as { spacing: number };
  assert.ok(Math.abs(F.spacing - P / 3) < 1e-9, `fine bars ${F.spacing} m apart`);
  const aspect = (GLAZING.tier / shed.GABLE_TRANSOM.split) / F.spacing;
  assert.ok(aspect >= 4.5 && aspect <= 5.5, `lights ${aspect.toFixed(2)}:1`);
  assert.equal(GABLE_SHEET.bar.shade, 0, 'no mid-pane bar');
});
