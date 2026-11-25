// Round F13 (front-round-12 score, A6/B3): from outside by day the gables let through half what they did of the room, their panes carry more life in a soft
// diagonal band, a light secondary bar halves each pane, and the lattice girder at their foot is denser; inside, at night and on the plane the glass is as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as materials from '../src/materials.ts';
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

// re-pinned round F13b (front-round-13 score, A6: life still modest): the pane offset is 12% and the band a cloud of up to 8%, so no more than 21% off the
// mean, neighbours within 26 levels (two panes at either end of 12% on the bluest channel, about 86, and the cloud's slope over a pane); were 19% and 16
test('A6 (F13): the panes carry 10-12% of life each and a cloud of up to 8% spans several panes; neighbouring panes stay within 26 levels', () => {
  const tone = (i: number, j: number): number => run(1, (i + 0.25) * P, GLAZING.springing + (j + 0.5) * GLAZING.tier)[2]!;
  const t = Array.from({ length: 40 }, (_, i) => Array.from({ length: 5 }, (_, j) => tone(i - 20, j)));
  const all = t.flat(), mean = all.reduce((a, b) => a + b, 0) / all.length;
  assert.ok(Math.max(...all) / mean - 1 >= 0.1 && 1 - Math.min(...all) / mean >= 0.1, `life: ${(Math.min(...all) / mean).toFixed(3)} to ${(Math.max(...all) / mean).toFixed(3)}`);
  // re-pinned round F14 (front-round-13b score, A6: the cloud as sky, +20-25%, lightening only; kx-front-round34 pins it): up to 42% over the mean and 25%
  // under it (the mean is lifted by the cloud); were 21% each way
  // re-pinned round F16 (front-round-15c score, A6: pane-to-pane life): the pane's offset taken after the cloud (kx-front-round38): 50% over, 30% under; were
  // 42% and 25%
  // re-pinned round F16b: the offsets 7%: 42% and 25% again
  assert.ok(Math.max(...all) / mean - 1 <= 0.42 && 1 - Math.min(...all) / mean <= 0.25, `and no more than pane plus cloud: ${(Math.min(...all) / mean).toFixed(3)} to ${(Math.max(...all) / mean).toFixed(3)}`);
  let worst = 0;
  t.forEach((col, i) => col.forEach((v, j) => { for (const q of [t[i + 1]?.[j], col[j + 1]]) if (q !== undefined) worst = Math.max(worst, Math.abs(v - q)); }));
  // re-pinned round F14: the cloud's brighter cores add up to about 10 levels a pane to the 12% panes' 21: 32; was 26
  // re-pinned round F15 (front-round-14 score: the cloud still weak; lift 0.095 -> 0.2, kx-front-round35 pins it): the cores' slope adds about 20 levels a
  // pane to the panes' 21: 44; was 32
  // re-pinned round F16 (front-round-15c score, A6: pane-to-pane life; kx-front-round38): the pane's offset taken after the cloud: 50; was 44. Re-pinned round
  // F16b (front-round-16 score: a quilt; kx-front-round39): the offsets 7%, so 44 again
  assert.ok(worst <= 44, `neighbours ${worst.toFixed(1)} levels apart at most`);
  // the cloud: averaged over 3 by 3 panes (so the panes' own offsets mostly cancel) the tone still swings, slowly (re-pinned round F13b: the cloud's swing along
  // one row is under the old band's, 5% or more where it was 8%; and with 12% panes neighbouring blocks within 9 levels, where it was 6)
  const block = (i: number, j: number): number => { let a = 0; for (let di = 0; di < 3; di++) for (let dj = 0; dj < 3; dj++) a += t[i + di]![j + dj]!; return a / 9; };
  const blocks = Array.from({ length: 38 }, (_, i) => block(i, 1));
  assert.ok((Math.max(...blocks) - Math.min(...blocks)) / mean >= 0.05, `a cloud across the panes: ${((Math.max(...blocks) - Math.min(...blocks)) / mean).toFixed(3)}`);
  // re-pinned round F14: with the stronger cloud neighbouring blocks within 12 levels; was 9
  blocks.slice(1).forEach((b, i) => assert.ok(Math.abs(b - blocks[i]!) <= 12, `soft: ${Math.abs(b - blocks[i]!).toFixed(1)}`));
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

// re-pinned round F13b (front-round-13 score, B3: the X read as cross-hatching; R-a is a Warren with open V panels): one diagonal a panel, alternating, the
// panel half F12's, so twice its diagonals and none crossing; it was two a panel. Re-pinned round F14 (front-round-13b score, B3: 1.15 m too fine and steep):
// the panel is the glazing's 1.6 m, its points on the mullions and the span's ends (kx-front-round34 pins those), so between F12's count and twice it
test('A6/B3 (F13): the girder is a Warren of single diagonals at the glazing\'s panel, more than F12\'s, none crossing, and a vertical at each panel point, its webs 0.15 m at most', () => {
  const G = shed.GABLE_GIRDER, bars = shed.gableGirder(0, 0, 9.5);
  const verticals = bars.filter(b => b.kind === 'mullion' && b.rotZ === 0), diagonals = bars.filter(b => b.kind === 'mullion' && b.rotZ !== 0);
  assert.ok(Math.abs(G.panel - GLAZING.spacing) < 1e-9, `the glazing's ${GLAZING.spacing} m panel: ${G.panel}`);
  const n12 = Math.max(2, Math.round((2 * (Math.sqrt((SHED_SPAN_WIDTH / 2) ** 2 - (9.5 - G.depth) ** 2) - 0.12)) / 2.3));
  assert.ok(diagonals.length > n12 && diagonals.length <= 2 * n12 + 1, `more than F12's ${n12}: ${diagonals.length}`);
  const sorted = [...diagonals].sort((p, q) => p.c[0] - q.c[0]);
  sorted.forEach((d, i) => { if (i) assert.ok(Math.sign(d.rotZ) === -Math.sign(sorted[i - 1]!.rotZ), 'alternating, a Warren'); });
  const xs = verticals.map(v => v.c[0]).sort((p, q) => p - q);
  assert.equal(verticals.length, diagonals.length + 1, 'a vertical at each panel point');
  sorted.forEach((d, i) => assert.ok(d.c[0] > xs[i]! && d.c[0] < xs[i + 1]!, 'one to a panel: none crossing'));
  for (const v of verticals) assert.ok(Math.abs(v.s[1] - G.depth) < 1e-9 && Math.abs(v.c[1] - (9.5 - G.depth / 2)) < 1e-9, 'chord to chord');
  assert.ok(Math.max(...G.web) <= 0.15, `webs ${G.web}`);
});

test('A6 (F13b): from outside by day the glass thickens off the normal: its alpha head-on as F13 had it, about 0.97 aslant; and exactly as before with glintEven 0', () => {
  const C = (materials as Record<string, unknown>).GABLE_THICKEN as { thicken: number; straight: number; aslant: number } | undefined;
  assert.ok(C, 'GABLE_THICKEN exported');
  const lines = body.split('\n'), last = lines.filter(l => l.trim()).at(-1)!;
  assert.ok(last.startsWith('gl_FragColor.a = mix( gl_FragColor.a, gl_FragColor.a + ( 1.0 - gl_FragColor.a )'), 'the thickening is the last line');
  const f13 = lines.filter(l => l !== last).join('\n'), old = new Glsl('');
  const alpha = (src: string, g: Glsl, even: number, cos: number, a = 0.93): number => {
    const view = [Math.sqrt(1 - cos * cos), 0, cos];
    const env = { vars: { gl_FragColor: [0.45, 0.47, 0.5, a], gl_FrontFacing: true, fogColor: day, cameraPosition: [0, 0, 0], viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [0.4, 15], uPaneX: 0, uGlintEven: even } };
    g.run(src, env);
    return (env.vars.gl_FragColor as number[])[3]!;
  };
  assert.equal(alpha(body, glsl, 1, 1), alpha(f13, old, 1, 1), 'head-on as F13');
  assert.equal(alpha(body, glsl, 1, 0.99), alpha(f13, old, 1, 0.99), 'and near it');
  const aslant = alpha(body, glsl, 1, 0.75);
  assert.ok(aslant >= 0.965 && aslant <= 0.985, `aslant ${aslant.toFixed(3)}`);
  assert.ok(alpha(body, glsl, 1, 0.87) > alpha(body, glsl, 1, 0.97) + 0.01, 'thickening as the view turns (gable-oblique is about 0.87)');
  for (const cos of [1, 0.87, 0.5]) for (const a of [0.42, 0.93, 0.35]) assert.equal(alpha(body, glsl, 0, cos, a), alpha(f13, old, 0, cos, a), `glintEven 0 at ${cos}, ${a}: as before`);
  // relative, so the x-ray mode's dimming still thins it: a third as opaque stays well under the sheet's own aslant
  assert.ok(alpha(body, glsl, 1, 0.75, 0.35) < 0.8, 'x-ray still thin');
});

test('A6 (F13b): each pane is offset by up to 11-13% (the score\'s 12%), and the cloud\'s patches span 4-8 panes, soft', () => {
  // re-pinned round F14: the cloud's waves are GABLE_SHEET.cloud.waves (they were .band)
  const B = (materials as Record<string, unknown>).GABLE_SHEET as { cloud: { waves: readonly number[] }; pane: number };
  // re-pinned round F16b (front-round-16 score, A6: the panes' dark offsets read as a quilt; kx-front-round39): 6-8%, about +-4-5 levels head-on; was 11-13%
  assert.ok(B.pane >= 0.06 && B.pane <= 0.08, `pane offset ${B.pane}`);
  const across = Math.PI / Math.abs(B.cloud.waves[0]!) / GLAZING.spacing;
  assert.ok(across >= 4 && across <= 8, `a patch ${across.toFixed(1)} panes across`);
  // inside one pane (its own offset fixed) only the cloud moves the tone: somewhere it swings 5% or more down a pane's height, and nowhere faster across a
  // pane than its slope allows (0.32 m between a quarter-pane and the bar's edge: under 1.5%)
  let down = 0, across1 = 0;
  for (let k = -20; k < 20; k++) for (let j = 0; j < 5; j++) {
    // re-pinned round F16 (front-round-15c score, A6): a pane is part of a tier now (GABLE_SHEET.row), so down one pane, not 4.5 m of the tier; round F16b:
    // the half-tier pane's lower 2.4 m
    const y0 = GLAZING.springing + j * GLAZING.tier + 0.09, x = (k + 0.1) * P;
    const col = Array.from({ length: 10 }, (_, m) => run(1, x, y0 + m * 0.26)[2]!);
    down = Math.max(down, (Math.max(...col) - Math.min(...col)) / col[0]!);
    const a = run(1, (k + 0.1) * P, y0 + 2)[2]!, b = run(1, (k + 0.1) * P + 0.32, y0 + 2)[2]!;
    across1 = Math.max(across1, Math.abs(a - b) / a);
  }
  assert.ok(down >= 0.05, `the cloud within a pane: ${down.toFixed(3)}`);
  // re-pinned round F14: the cloud's brighter cores (smoothstep) rise faster: under 4% over 0.32 m; was 1.5%
  // re-pinned round F15: with the cloud's cores at 35-50% the slope over 0.32 m is under 6%; was 4%
  assert.ok(across1 <= 0.06, `and soft across it: ${across1.toFixed(4)}`);
});
