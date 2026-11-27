// Round F16b (front-round-16 score, A6/B3): the north gables' bars are a hierarchy, not an even grid: tall lights between transoms half a tier apart and half
// the mullions' weight; and each pane's own tone is small (about +-4-5 levels head-on) and leans away from its neighbours', so no quilt of dark blocks.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SHED_SPAN_WIDTH } from '../../core/station.ts';
import { GABLE_SHEET, GLAZING, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { Glsl, Mat } from './glsl.ts';

const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
const lift = `${GABLE_SHEET.cloud.lift} * smoothstep(`;
const flat = body.replace(lift, '0.0 * smoothstep('); // without the cloud: only the panes' own offsets move the sheet
const identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), day = [0.6635, 0.8039, 0.9644], P = GLAZING.spacing, g = new Glsl('');
const G = (x: number, y: number, cos = 1): number => {
  const view = [Math.sqrt(1 - cos * cos), 0, cos];
  const env = { vars: { gl_FragColor: [0.45, 0.47, 0.5, 0.98], gl_FrontFacing: true, fogColor: day, cameraPosition: [0, 0, 0], viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uPaneY: [GLAZING.springing, GLAZING.tier], uGlintEven: 1 } };
  g.run(flat, env);
  return (env.vars.gl_FragColor as number[])[1]! * 255;
};
const R = SHED_SPAN_WIDTH / 2;

test('A6 (F16b): the panes\' own tones are small, +-3.5-6 levels head-on, and lean apart: under 6% of 2 by 2 blocks of neighbouring panes on one side of the median (chance is 12.5%)', () => {
  assert.ok(body.includes(lift), 'the cloud\'s lift times its smoothstep');
  const row = GLAZING.tier / 2;
  const grid = (cos: number): number[][] => Array.from({ length: 60 }, (_, i) => Array.from({ length: 5 }, (_, k) => G((i - 30 + 0.2) * P, GLAZING.springing + (k + 1.5) * row, cos)));
  for (const [cos, lo, hi] of [[1, 3.5, 6], [0.87, 4.5, 9]] as const) {
    const t = grid(cos), all = t.flat().sort((a, b) => a - b), mid = all[Math.floor(all.length / 2)]!, half = (all.at(-1)! - all[0]!) / 2;
    let same = 0, n = 0;
    for (let i = 0; i + 1 < t.length; i++) for (let k = 0; k + 1 < 5; k++) {
      const b = [t[i]![k]!, t[i + 1]![k]!, t[i]![k + 1]!, t[i + 1]![k + 1]!];
      n++;
      if (b.every(v => v > mid) || b.every(v => v < mid)) same++;
    }
    assert.ok(same / n <= 0.06, `at cos ${cos}: ${same} of ${n} 2 by 2 blocks all one side of the median (${(100 * same / n).toFixed(1)}%)`);
    assert.ok(half >= lo && half <= hi, `at cos ${cos}: +-${half.toFixed(1)} levels pane to pane`);
  }
});

test('B3/A6 (F16b): the north screens\' transoms are half a tier apart and half the mullions\' weight: 4-5 rows over the crown, lights at least 1.5 times as tall as wide', () => {
  const T = shed.GABLE_TRANSOM as { split: number; width: number };
  assert.ok(T.split === 2, `a tier split in ${T.split}`);
  assert.ok(T.width >= 0.04 && T.width <= 0.05, `the new transoms ${T.width} m, against the mullions' 0.09`);
  assert.ok(Math.abs(GABLE_SHEET.row - GLAZING.tier / T.split) < 1e-9, `the pane tone's row ${GABLE_SHEET.row} m is the transoms'`);
  const ys = shed.gableBars(0, GLAZING.springing, shed.GABLE_GLASS_FROM, R).filter(b => b.kind === 'transom').map(b => b.c[1]).sort((a, b) => a - b);
  assert.ok(ys.length + 1 >= 4 && ys.length + 1 <= 5, `${ys.length + 1} rows over the crown (${ys.map(y => y.toFixed(2))})`);
  ys.slice(1).forEach((y, i) => assert.ok((y - ys[i]!) / P >= 1.5, `a light ${((y - ys[i]!) / P).toFixed(2)} times as tall as the bay`));
});
