// Round F13 (front-round-12 score, A6/B3): from outside by day the gables let through half what they did of the room, their panes carry more life in a soft
// diagonal band, a light secondary bar halves each pane, and the lattice girder at their foot is denser; inside, at night and on the plane the glass is as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import { GLAZING, material, windowNight } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { Glsl, Mat } from './glsl.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
const glsl = new Glsl(''), identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const day = [0.6635, 0.8039, 0.9644];
const run = (even: number, x: number, y: number, alpha = 0.93): number[] => {
  const env = { vars: { gl_FragColor: [0.45, 0.47, 0.5, alpha], gl_FrontFacing: true, fogColor: day, cameraPosition: [0, 0, 0], viewMatrix: identity, vViewPosition: [0, 0, 50], normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uGlintEven: even } };
  glsl.run(body, env);
  return (env.vars.gl_FragColor as number[]).map((c, i) => (i < 3 ? c * 255 : c));
};
const P = GLAZING.spacing;

test('A6 (F13): from outside by day the gable glass lets through half the room it did (opacity 0.86 -> 0.93 or more), as its draw shows; inside it is the library glass', () => {
  const O = shed.GABLE_OUTSIDE;
  assert.ok(1 - O.opacity <= (1 - 0.86) / 2 + 1e-9 && O.opacity < 1, `through: ${(1 - O.opacity).toFixed(3)}`);
  const g = shed.buildShed(layout, { range: false, roof: 'auto' }); g.updateMatrixWorld(true);
  const glass = g.getObjectByName('shed-gable-glass') as THREE.Mesh, mat = glass.material as THREE.MeshPhongMaterial, base = mat.opacity;
  const draw = (at: [number, number, number]): number => {
    const c = new THREE.PerspectiveCamera(); c.position.copy(g.localToWorld(new THREE.Vector3(...at)));
    glass.onBeforeRender(undefined as never, undefined as never, c, glass.geometry, mat, null as never);
    const o = mat.opacity; glass.onAfterRender(undefined as never, undefined as never, c, glass.geometry, mat, null as never); return o;
  };
  windowNight.value = 0;
  assert.equal(draw([layout.width / 2, 18, -layout.length - 90]), O.opacity);
  assert.equal(draw([layout.spine, 8, -layout.length / 2]), base, 'inside: as before');
  assert.ok(run(1, 0.4, 15)[3]! >= 0.93, 'and the glint keeps it at least that');
});

test('A6 (F13): the panes carry 6-10% of life each and an 8% diagonal band spans several panes; neighbouring panes stay within 16 levels', () => {
  const tone = (i: number, j: number): number => run(1, (i + 0.25) * P, GLAZING.springing + (j + 0.5) * GLAZING.tier)[2]!;
  const t = Array.from({ length: 40 }, (_, i) => Array.from({ length: 5 }, (_, j) => tone(i - 20, j)));
  const all = t.flat(), mean = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(Math.max(...all) / mean - 1 >= 0.1 && 1 - Math.min(...all) / mean >= 0.1, `life: ${(Math.min(...all) / mean).toFixed(3)} to ${(Math.max(...all) / mean).toFixed(3)}`);
  assert.ok(Math.max(...all) / mean - 1 <= 0.19 && 1 - Math.min(...all) / mean <= 0.19, 'and no more than pane plus band');
  let worst = 0;
  t.forEach((col, i) => col.forEach((v, j) => { for (const q of [t[i + 1]?.[j], col[j + 1]]) if (q !== undefined) worst = Math.max(worst, Math.abs(v - q)); }));
  assert.ok(worst <= 16, `neighbours ${worst.toFixed(1)} levels apart at most`);
  // the band: averaged over 3 by 3 panes (so the panes' own offsets mostly cancel) the tone still swings 8% or more, slowly: neighbouring blocks within 6 levels
  const block = (i: number, j: number): number => { let a = 0; for (let di = 0; di < 3; di++) for (let dj = 0; dj < 3; dj++) a += t[i + di]![j + dj]!; return a / 9; };
  const blocks = Array.from({ length: 38 }, (_, i) => block(i, 1));
  assert.ok((Math.max(...blocks) - Math.min(...blocks)) / mean >= 0.08, `a band across the panes: ${((Math.max(...blocks) - Math.min(...blocks)) / mean).toFixed(3)}`);
  blocks.slice(1).forEach((b, i) => assert.ok(Math.abs(b - blocks[i]!) <= 6, `soft: ${Math.abs(b - blocks[i]!).toFixed(1)}`));
});

test('A6 (F13): from outside a light secondary bar runs down the middle of each pane (twice the panes), darker by a fifth or more over about 0.1 m; none from inside', () => {
  for (const k of [-6, 0, 5]) for (const y of [11, 17, 24]) {
    const mid = run(1, (k + 0.5) * P, y)[2]!, side = run(1, (k + 0.3) * P, y)[2]!, other = run(1, (k + 0.7) * P, y)[2]!;
    assert.ok(mid < 0.8 * side && mid < 0.8 * other, `a bar mid-pane at ${k}: ${mid.toFixed(1)} against ${side.toFixed(1)}, ${other.toFixed(1)}`);
    assert.ok(Math.abs(run(1, (k + 0.5) * P + 0.15, y)[2]! - side) < 0.1 * side, `about 0.1 m wide: clear by 0.15 m off its line`);
    const quarter = run(1, (k + 0.25) * P, y)[2]!;
    assert.ok(Math.abs(quarter - side) < 0.05 * side, 'one bar a pane, not two');
  }
  // inside (glintEven 0) the middle of a pane is the same colour as a point beside it in the same pane, and at night likewise
  const a = run(0, 0.5 * P, 15), b = run(0, 0.5 * P + 0.2, 15);
  assert.ok(Math.abs(a[2]! - b[2]!) < 1, `no bar from inside: ${a[2]} against ${b[2]}`);
});

test('A6/B3 (F13): the girder has both diagonals in every panel and a vertical at each panel point, its webs 0.15 m at most so it stays an open truss', () => {
  const G = shed.GABLE_GIRDER, bars = shed.gableGirder(0, 0, 9.5);
  const n = Math.max(2, Math.round((2 * (Math.sqrt((SHED_SPAN_WIDTH / 2) ** 2 - (9.5 - G.depth) ** 2) - 0.12)) / G.panel));
  const verticals = bars.filter(b => b.kind === 'mullion' && b.rotZ === 0), diagonals = bars.filter(b => b.kind === 'mullion' && b.rotZ !== 0);
  assert.equal(diagonals.length, 2 * n, 'two diagonals a panel');
  assert.equal(diagonals.filter(b => b.rotZ > 0).length, n, 'one each way');
  assert.equal(verticals.length, n + 1, 'a vertical at each panel point');
  for (const v of verticals) assert.ok(Math.abs(v.s[1] - G.depth) < 1e-9 && Math.abs(v.c[1] - (9.5 - G.depth / 2)) < 1e-9, 'chord to chord');
  const xs = verticals.map(v => v.c[0]).sort((p, q) => p - q);
  xs.slice(1).forEach((x, i) => assert.ok(Math.abs(x - xs[i]! - (xs[n]! - xs[0]!) / n) < 1e-9, 'at the panel points'));
  assert.ok(Math.max(...G.web) <= 0.15, `webs ${G.web}`);
});
