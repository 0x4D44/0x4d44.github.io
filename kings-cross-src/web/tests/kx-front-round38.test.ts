// Round F16 (front-round-15c score, A6): from outside by day each pane of the north gables holds its own tone, about +-6-10 levels head-on and up to +-15 off
// the normal, on a grid of seven rows over the crown: the gables' new transoms, a third of the lunette's tier apart. Inside, at night and on the plane as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SHED_VAULT_RADIUS } from '../../core/station.ts';
import { GABLE_SHEET, GLAZING, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { Glsl, Mat } from './glsl.ts';

const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
const lift = `${GABLE_SHEET.cloud.lift} * smoothstep(`;
const flat = body.replace(lift, '0.0 * smoothstep('); // the sheet without its cloud: only the panes' own offsets move it
const identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), day = [0.6635, 0.8039, 0.9644], P = GLAZING.spacing, g = new Glsl('');
const G = (x: number, y: number, cos = 1, even = 1): number => {
  const view = [Math.sqrt(1 - cos * cos), 0, cos];
  const env = { vars: { gl_FragColor: [0.45, 0.47, 0.5, 0.98], gl_FrontFacing: true, fogColor: day, cameraPosition: [0, 0, 0], viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uPaneY: [GLAZING.springing, GLAZING.tier], uGlintEven: even } };
  g.run(flat, env);
  return (env.vars.gl_FragColor as number[])[1]! * 255;
};
// re-pinned round F16b (front-round-16 score, A6/B3: square panes, an even grid, a quilt of dark offsets; kx-front-round39 pins the new figures): the pane
// half a tier tall, its offset +-3.5-6 levels head-on and +-4.5-9 at 30 degrees, the transoms a half tier apart, 4-5 rows; were a third, +-6-11, +-11-16, 6-8
// re-pinned 2026-11-25 (B2): the gables' radius is the narrowed vaults' (SHED_VAULT_RADIUS; the tier is a third of it), was SHED_SPAN_WIDTH / 2
const R = SHED_VAULT_RADIUS, row = GLAZING.tier / 2;

test('A6 (F16, re-pinned F16b): each pane holds its own tone, +-3.5-6 levels head-on and +-4.5-9 at gable-oblique\'s 30 degrees, on panes half a tier tall', () => {
  assert.ok(body.includes(lift), 'the cloud\'s lift times its smoothstep');
  assert.ok(Math.abs(GABLE_SHEET.row - row) < 1e-9, `the pane ${GABLE_SHEET.row} m tall`);
  let split = 0, rows = 0;
  for (const cos of [1, 0.87]) {
    const tones: number[] = [];
    for (let i = -12; i < 12; i++) for (let k = 3; k < 9; k++) {
      const y = GLAZING.springing + (k + 0.5) * row, x = (i + 0.2) * P;
      const t = G(x, y, cos);
      // held over the pane: across it (clear of the mid bar) and up and down it, the same
      for (const [dx, dy] of [[0.35, 0], [0, 0.6], [0, -0.6], [0.35, 0.6]]) assert.ok(Math.abs(G(x + dx, y + dy, cos) - t) < 0.05, `pane ${i},${k}: one tone over it`);
      tones.push(t);
      // re-pinned round F16b: +-4-5 levels, so the next pane is another at a step of 0.3; was 1
      if (cos === 1) { rows++; if (Math.abs(G(x, y + row, cos) - t) > 0.3) split++; }
    }
    tones.sort((a, b) => a - b);
    const half = (tones.at(-1)! - tones[0]!) / 2;
    const [lo, hi] = cos === 1 ? [3.5, 6] : [4.5, 9];
    assert.ok(half >= lo && half <= hi, `at cos ${cos}: +-${half.toFixed(1)} levels, pane to pane`);
  }
  assert.ok(split / rows > 0.8, `the pane above is another pane: ${split} of ${rows}`);
  // glintEven 0 (inside, at night, on the plane): the new rows reach nothing; two rows of one tier are one pane, as before
  for (const cos of [1, 0.5]) for (const i of [-5, 2, 9]) {
    const y = GLAZING.springing + 0.5 * row, x = (i + 0.2) * P; // re-pinned round F16b: both rows inside the first tier with half-tier panes; was 3.5 rows up
    assert.equal(G(x, y, cos, 0), G(x, y + row, cos, 0), `glintEven 0, pane ${i}: as before`);
  }
});

test('A6 (F16, re-pinned F16b): each north gable carries transoms every half tier, about 2.67 m, at most 0.05 m deep: 4-5 rows of panes over its crown', () => {
  const bars0 = shed.gableBars(0, GLAZING.springing, shed.GABLE_GLASS_FROM, R).filter(b => b.kind === 'transom');
  assert.ok(bars0.length >= 3, `transoms above the glass line: ${bars0.length}`);
  const T = (shed as Record<string, unknown>).GABLE_TRANSOM as { split: number; width: number };
  assert.ok(T, 'GABLE_TRANSOM');
  assert.ok(T.split === 2 && T.width <= 0.05, `split ${T.split}, width ${T.width}`);
  const bars = shed.gableBars(0, GLAZING.springing, shed.GABLE_GLASS_FROM, R), ys = bars.filter(b => b.kind === 'transom').map(b => b.c[1]).sort((a, b) => a - b);
  assert.ok(ys.length >= 3, `transoms above the glass line: ${ys.map(y => y.toFixed(2))}`);
  ys.slice(1).forEach((y, i) => assert.ok(Math.abs(y - ys[i]! - row) < 0.01, `a row ${(y - ys[i]!).toFixed(3)} m tall`));
  const top = GLAZING.springing + R;
  const rowsOverCrown = ys.length + 1; // and the bottom row, on the glass line's transom
  assert.ok(rowsOverCrown >= 4 && rowsOverCrown <= 5 && top - ys.at(-1)! < 2 * row, `${rowsOverCrown} rows of panes over the crown`);
  for (const b of bars.filter(b => b.kind === 'transom')) assert.ok(Math.abs(b.c[0]) + b.s[0] / 2 <= Math.sqrt(R * R - (b.c[1] - GLAZING.springing) ** 2), 'inside the arch');
});
