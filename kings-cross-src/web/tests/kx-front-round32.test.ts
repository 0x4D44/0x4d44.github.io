// Round F12 (front-round-11b score, A6): from outside by day the north gables are a dark blue-grey sheet that takes the sky by a Fresnel term (dark head-on,
// lighter at grazing), with a little life in its panes and one broad soft ramp, never a mosaic; and the lattice girder at their foot is deep and stout as
// front-d's. glintEven 0 (inside, on the plane, at night, every other window) leaves the glass exactly as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as materials from '../src/materials.ts';
import { material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { SHED_SPAN_WIDTH } from '../../core/station.ts';
import { Glsl, Mat } from './glsl.ts';

const M = materials as Record<string, unknown>;
const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
const glsl = new Glsl(''), identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const day = [0.6635, 0.8039, 0.9644], night = [0.0553, 0.0863, 0.1497];
/** the colour out (0-255) of a lit pane `lit` at glass point (x, y), seen along a view whose cosine to the pane's normal is `cos` */
const shade = (even: number, x: number, y: number, cos = 1, lit = [0.45, 0.47, 0.5, 0.86], fog = day): number[] => {
  const view = [Math.sqrt(1 - cos * cos), 0, cos];
  const env = { vars: { gl_FragColor: [...lit], gl_FrontFacing: true, fogColor: fog, cameraPosition: [0, 0, 0], viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uGlintEven: even } };
  glsl.run(body, env);
  return (env.vars.gl_FragColor as number[]).slice(0, 3).map(c => c * 255);
};
const grid = (fn: (x: number, y: number) => number[]): number[][][] => Array.from({ length: 40 }, (_, i) => Array.from({ length: 24 }, (_, j) => fn(-30 + i * 1.5, 9.5 + j * 1.0)));

test('A6 (F12): from outside by day head-on the gable glass sits at front-d\'s shaded blue-grey, darker than at a grazing view, whatever the light on it', () => {
  assert.ok(M.GABLE_SHEET, 'GABLE_SHEET exported');
  for (const lit of [[0.45, 0.47, 0.5, 0.86], [0.8, 0.8, 0.8, 0.86], [0.2, 0.22, 0.25, 0.86]]) {
    const head = shade(1, 3, 15, 1, lit), glance = shade(1, 3, 15, 0.15, lit), oblique = shade(1, 3, 15, 0.5, lit);
    // front-d's shaded screens: medians 61-65 red, 79-97 green, 89-125 blue; the band allows the pane and ramp offsets (8%) either side
    assert.ok(head[0]! >= 45 && head[0]! <= 75 && head[1]! >= 58 && head[1]! <= 92 && head[2]! >= 68 && head[2]! <= 110, `head-on ${head.map(v => v.toFixed(0))}`);
    assert.ok(head[2]! > head[0]! + 15, 'blue-grey');
    assert.ok(glance[0]! > head[0]! + 30 && glance[1]! > head[1]! + 30, `grazing ${glance.map(v => v.toFixed(0))} lighter than head-on`);
    assert.ok(oblique[1]! > head[1]! && oblique[1]! < glance[1]!, 'rising with the angle');
  }
});

test('A6 (F12): some life in the panes, no mosaic: within 8% of the sheet\'s mean everywhere, neighbours within 7 levels (two panes at either end of a 4% offset on the bluest channel, about 80), and not all the same', () => {
  for (const cos of [1, 0.5]) {
    const g = grid((x, y) => shade(1, x, y, cos)).flat();
    const mean = [0, 1, 2].map(c => g.reduce((a, p) => a + p[c]!, 0) / g.length);
    for (const p of g) for (const c of [0, 1, 2]) assert.ok(Math.abs(p[c]! / mean[c]! - 1) <= 0.085, `within 8%: ${p[c]} against ${mean[c]}`);
    const spread = Math.max(...g.map(p => p[1]!)) - Math.min(...g.map(p => p[1]!));
    assert.ok(spread >= 4, `some life: ${spread.toFixed(1)} levels`);
    const rows = grid((x, y) => shade(1, x, y, cos));
    let worst = 0;
    rows.forEach((col, i) => col.forEach((p, j) => { for (const q of [rows[i + 1]?.[j], col[j + 1]]) if (q) worst = Math.max(worst, ...p.map((v, c) => Math.abs(v - q[c]!))); }));
    assert.ok(worst <= 7, `neighbours ${worst.toFixed(1)} levels apart at most`);
  }
});

test('A6 (F12): with glintEven 0 (inside, on the plane, night, every other window) the colour and alpha are exactly the old glint\'s', () => {
  const old = new Glsl('');
  const oldBody = body.split('\n').filter(l => !/^vec3 gt =|^float gr =|uGlintEven \);$/.test(l)).join('\n');
  assert.ok(oldBody.split('\n').length === body.split('\n').length - 3, 'three new lines');
  const lines = body.split('\n').filter(l => l.trim());
  assert.deepEqual(lines.slice(-4).map(l => l.split(' ')[0]), ['gl_FragColor.a', 'vec3', 'float', 'gl_FragColor.rgb'], 'the three new lines come last, after the old alpha, and only the last writes the colour');
  for (const fog of [day, night]) for (const [x, y, cos] of [[3, 15, 1], [-12, 20, 0.3], [20, 11, 0.7]] as const) {
    const run = (src: string, g: Glsl): number[] => {
      const view = [Math.sqrt(1 - cos * cos), 0, cos];
      const env = { vars: { gl_FragColor: [0.3, 0.4, 0.5, 0.42], gl_FrontFacing: true, fogColor: fog, cameraPosition: [0, 0, 0], viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uGlintEven: 0 } };
      g.run(src, env);
      return env.vars.gl_FragColor as number[];
    };
    assert.deepEqual(run(body, glsl), run(oldBody, old));
  }
});

test('A6 (F12): the gables\' lattice girder is front-d\'s: 2.2-2.6 m deep, chords 0.25 m or more and diagonals 0.15 m or more, its triangles as before', () => {
  const G = shed.GABLE_GIRDER;
  assert.ok(G.depth >= 2.2 && G.depth <= 2.6, `depth ${G.depth}`);
  assert.ok(Math.min(...G.chord) >= 0.25 && Math.min(...G.web) >= 0.15, `chords ${G.chord}, diagonals ${G.web}`);
  assert.ok(Math.max(...G.chord) <= 0.35 && Math.max(...G.web) <= 0.22, 'still an open truss, not a wall');
  const bars = shed.gableGirder(0, 0, 9.5);
  const n = Math.max(2, Math.round((2 * (Math.sqrt((SHED_SPAN_WIDTH / 2) ** 2 - (9.5 - G.depth) ** 2) - 0.12)) / G.panel));
  assert.equal(bars.length, n + 1, 'a chord and one diagonal a panel');
});
