// Round F15b (front-round-15 score, A6): from outside by day the room behind the gables' glass (ribs, platform dashes) shows at about half of F15's
// contrast, the glass's own sheet tone taking its place, and the cloud's patches are shapes: a full core and a short edge, one core near the middle of each
// gable in north-gable. The sheet's colour, its bars, and the glass inside, at night and on the plane are as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GABLE_SHEET, GLAZING, material } from '../src/materials.ts';
import { GABLE_OUTSIDE } from '../src/shed.ts';
import { Glsl, Mat } from './glsl.ts';

const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
const identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), day = [0.6635, 0.8039, 0.9644], P = GLAZING.spacing;
const shader = (src: string): ((even: number, x: number, y: number, cos?: number, cam?: number[], a?: number) => number[]) => {
  const g = new Glsl('');
  return (even, x, y, cos = 1, cam = [0, 0, 0], a = GABLE_OUTSIDE.opacity) => {
    const view = [Math.sqrt(1 - cos * cos), 0, cos];
    const env = { vars: { gl_FragColor: [0.45, 0.47, 0.5, a], gl_FrontFacing: true, fogColor: day, cameraPosition: cam, viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uPaneY: [GLAZING.springing, GLAZING.tier], uGlintEven: even } };
    g.run(src, env);
    return (env.vars.gl_FragColor as number[]).map((c, i) => (i < 3 ? c * 255 : c));
  };
};
const now = shader(body);

test('A6 (F15b): from outside by day a dark rib behind the glass shows at 0.3-0.5 of F15\'s contrast against the glass around it, head-on and aslant; the sheet\'s colour and bars as before, and x-ray still thins it', () => {
  // over the blend the frame takes a * glass + (1 - a) * room: a rib (room 0.08) against the room around it (0.45), through the same glass; F15 drew 0.955
  const contrast = (c: number[]): number => (1 - c[3]!) * (0.45 - 0.08) * 255;
  for (const cos of [1, 0.9, 0.75]) for (const [x, y] of [[0.4, 15], [7.3, 12], [-12.2, 19], [P / 2, 15]] as const) {
    const a = now(1, x, y, cos), b = now(1, x, y, cos, [0, 0, 0], 0.955), r = contrast(a) / contrast(b);
    assert.ok(r >= 0.3 && r <= 0.5, `the rib at ${r.toFixed(3)} of F15's (cos ${cos}: ${contrast(a).toFixed(2)} levels, was ${contrast(b).toFixed(2)})`);
    assert.deepEqual(a.slice(0, 3), b.slice(0, 3), 'the sheet\'s own colour, its bars and cloud, as F15');
  }
  // x-ray's endGlassFactor scales the draw's opacity, so the faded sheet thins with it as F15's did
  assert.ok(now(1, 0.4, 15, 0.75, [0, 0, 0], GABLE_OUTSIDE.opacity * 0.35)[3]! < 0.8, 'x-ray still thin');
});

test('A6 (F15b): in north-gable the cloud is shapes: a full core near the middle of each gable, at least 0.3 of each patch at full strength, its edge 1-3 panes', () => {
  const lift = `${GABLE_SHEET.cloud.lift} * smoothstep(`;
  assert.ok(body.includes(lift), 'the cloud\'s lift times its smoothstep');
  const none = shader(body.replace(lift, '0.0 * smoothstep(')), full = shader(body.replace(lift, `${GABLE_SHEET.cloud.lift} + 0.0 * smoothstep(`));
  const cam = [52.08991869333342, 18, -335.38920349896534]; // evidence.mjs north-gable, world
  const share = (x: number, y: number): number => { const g0 = none(1, x, y, 1, cam)[1]!; return (now(1, x, y, 1, cam)[1]! - g0) / (full(1, x, y, 1, cam)[1]! - g0); };
  let cores = 0, lit = 0;
  const rises: number[] = [];
  for (const side of [-1, 1]) {
    let mid = 0, off = 0;
    for (let y = 10.5; y <= 21; y += 1.5) {
      const row: number[] = [];
      for (let u = 0.6; u < 31.5; u += 0.4) {
        const v = share(side * u, y); row.push(v);
        if (v > 0.05) lit++;
        if (v >= 0.9) { cores++; if (Math.abs(u - 16) <= 7) mid++; else off++; }
      }
      let from = -1;
      row.forEach((v, k) => {
        if (k && row[k - 1]! < 0.05 && v >= 0.05) from = k;
        if (k && row[k - 1]! < 0.95 && v >= 0.95 && from >= 0) { rises.push((k - from) * 0.4 / P); from = -1; }
        if (k && row[k - 1]! >= 0.95 && v < 0.95) from = k;
        if (k && row[k - 1]! >= 0.05 && v < 0.05 && from >= 0 && row[from - 1]! >= 0.95) { rises.push((k - from) * 0.4 / P); from = -1; }
      });
    }
    assert.ok(mid >= 30 && off * 2 <= mid, `gable ${side}: one clear core near its middle (${mid} core samples within 7 m of its middle, ${off} elsewhere)`);
  }
  assert.ok(cores / lit >= 0.3, `shapes, not a glow: ${(cores / lit).toFixed(3)} of the lit glass at full strength`);
  assert.ok(rises.length >= 4, `edges: ${rises.length}`);
  for (const r of rises) assert.ok(r >= 1 && r <= 3, `an edge ${r.toFixed(2)} panes (5-95%): ${rises.map(v => v.toFixed(1))}`);
});
