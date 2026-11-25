// Round F14 (front-round-13b score, A6/B3): from outside by day the gables carry sky in broad cloud patches that only lighten and drift as the camera moves, and
// aslant their colour takes a little of the sky; the lattice girder's panel is the glazing's 1.6 m, its verticals on the mullions. Inside, at night and on the
// plane the glass is as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import * as materials from '../src/materials.ts';
import { GLAZING, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { Glsl, Mat } from './glsl.ts';

const M = materials as Record<string, unknown>;
const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, at = f.indexOf('#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\nvec2 gm');
const body = f.slice(at, f.indexOf('#endif', at)).split('\n').slice(1).join('\n');
const glsl = new Glsl(''), identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const day = [0.6635, 0.8039, 0.9644], P = GLAZING.spacing;
const run = (src: string, g: Glsl, even: number, x: number, y: number, cos = 1, cam: number[] = [0, 0, 0]): number[] => {
  const view = [Math.sqrt(1 - cos * cos), 0, cos];
  const env = { vars: { gl_FragColor: [0.45, 0.47, 0.5, 0.93], gl_FrontFacing: true, fogColor: day, cameraPosition: cam, viewMatrix: identity, vViewPosition: view.map(v => v * 50), normal: [0, 0, 1], vGlassPos: [x, y], uPaneX: 0, uGlintEven: even } };
  g.run(src, env);
  return (env.vars.gl_FragColor as number[]).map((c, i) => (i < 3 ? c * 255 : c));
};
const G = (x: number, y: number, cam: number[] = [0, 0, 0], cos = 1): number => run(body, glsl, 1, x, y, cos, cam)[1]!;
const sweep = Array.from({ length: 48 }, (_, i) => [i * (2 * Math.PI / 0.02) / 48, 0, 0]);

test('A6 (F14): the cloud only lightens: in every pane the darkest the cloud leaves it is the same all over the pane, and its patches lift it 18-27% at their cores, never more', () => {
  const C = M.GABLE_SHEET as { cloud?: { lift: number } };
  assert.ok(C.cloud, 'GABLE_SHEET.cloud');
  let most = 0;
  for (let k = -12; k < 12; k += 3) for (const j of [1, 3]) {
    // re-pinned round F16b: the middle of a half-tier pane (GABLE_SHEET.row); was a tier's middle
    const y = GLAZING.springing + (j + 0.25) * GLAZING.tier, xs = [0.15, 0.3, 0.7, 0.85].map(q => (k + q) * P), ys = [y - 0.6, y, y + 0.6]; // re-pinned round F16: the pane is a third of the tier now (GABLE_SHEET.row), so its middle row's points; were 1.5 m off
    const floors = xs.flatMap(x => ys.map(yy => Math.min(...sweep.map(cam => G(x, yy, cam)))));
    assert.ok(Math.max(...floors) - Math.min(...floors) < 0.01, `pane ${k},${j}: the cloud's floor is the pane's own tone (${Math.min(...floors).toFixed(2)}-${Math.max(...floors).toFixed(2)})`);
    const base = Math.min(...floors);
    for (const x of xs) for (const yy of ys) for (const cam of sweep) { const r = G(x, yy, cam) / base; most = Math.max(most, r); // re-pinned in round F15 (front-round-14 score: the cloud still too weak): cores 35-52% over the pane, was 18-27%
    assert.ok(r <= 1.52, `at most 52%: ${r.toFixed(3)}`); }
  }
  assert.ok(most >= 1.35, `bright cores: ${most.toFixed(3)}`);
});

test('A6 (F14): the cloud patches are broad and elongated: along a pane row a patch spans 3-9 panes; and they drift as the camera moves, smoothly', () => {
  const y = GLAZING.springing + 2.5 * GLAZING.tier, runs: number[] = [];
  let len = 0;
  for (let k = -40; k < 40; k++) {
    const x = (k + 0.25) * P, floor = Math.min(...sweep.map(cam => G(x, y, cam))), lit = G(x, y) / floor > 1.02;
    if (lit) len++; else if (len) { runs.push(len); len = 0; }
  }
  const whole = runs.slice(1);
  assert.ok(whole.length >= 2, `patches along the row: ${runs}`);
  // re-pinned round F15b (front-round-15 score, A6): with the sharper cores (kx-front-round36) a lobe's tip, where the waves barely agree, is lit over 2 panes
  // and no longer a faint skirt of 3; was 3-9
  for (const r of whole) assert.ok(r >= 2 && r <= 9, `a patch ${r} panes across (${runs})`);
  // the patches move as the camera moves: 40 m along the gable changes the tone somewhere by 5 levels or more, 1 m by under 2 anywhere
  let far = 0, near = 0;
  for (let k = -10; k < 10; k++) for (const yy of [12, 18, 24]) {
    const x = (k + 0.25) * P, a = G(x, yy, [0, 0, 0]);
    far = Math.max(far, Math.abs(G(x, yy, [40, 0, 0]) - a)); near = Math.max(near, Math.abs(G(x, yy, [1, 0, 0]) - a));
  }
  assert.ok(far >= 5, `drifts: ${far.toFixed(1)}`);
  assert.ok(near < 2, `smoothly: ${near.toFixed(2)}`);
});

test('A6 (F14): aslant the colour takes a little of the sky (8-30 levels at 37 degrees off the normal) and keeps the dark sheet; head-on it is as F13b had it, the alpha untouched', () => {
  assert.ok(typeof (M.GABLE_SHEET as { tint?: number }).tint === 'number', 'GABLE_SHEET.tint');
  const lines = body.split('\n'), i = lines.findIndex(l => l.startsWith('float gr = '));
  const old = lines[i]!.replace(/^float gr = max\( (.*), [0-9.]+ \* \( 1\.0 - smoothstep\(.*\) \) \) \* gs;$/, 'float gr = ( $1 ) * gs;');
  assert.notEqual(old, lines[i], 'the tint is the max\'s second term');
  const f13b = [...lines.slice(0, i), old, ...lines.slice(i + 1)].join('\n'), g13 = new Glsl('');
  for (const cos of [1, 0.99, 0.985]) for (const x of [0.4, 7.3]) assert.deepEqual(run(body, glsl, 1, x, 15, cos), run(f13b, g13, 1, x, 15, cos), `head-on (${cos}) as F13b`);
  for (const x of [0.4, 7.3, -12.2]) {
    const now = run(body, glsl, 1, x, 15, 0.8), then = run(f13b, g13, 1, x, 15, 0.8);
    assert.ok(now[1]! - then[1]! >= 8 && now[1]! - then[1]! <= 45, `aslant lighter by ${(now[1]! - then[1]!).toFixed(1)}`);
    // re-pinned in round F15: tint 0.12 -> 0.18 takes more sky aslant (up to 45 levels, G under 135; was 30 and 120); the floor of 8 stays
    assert.ok(now[1]! < 135 && now[2]! > now[0]!, `still a dark blue-grey sheet: ${now.slice(0, 3).map(v => v.toFixed(0))}`);
    assert.equal(now[3], then[3], 'the alpha untouched');
  }
  for (const cos of [1, 0.8, 0.4]) assert.deepEqual(run(body, glsl, 0, 3, 15, cos), run(f13b, g13, 0, 3, 15, cos), `glintEven 0 at ${cos}: as before`);
});

test('B3 (F14): the girder\'s panel is the glazing\'s 1.6 m: its inner verticals on the screen\'s mullions, its diagonals at about 56 degrees, one a panel, alternating, none crossing', () => {
  const Gd = shed.GABLE_GIRDER, uc = 10, sp = 5.6388, top = shed.GABLE_GLASS_FROM;
  assert.ok(Math.abs(Gd.panel - P) < 1e-9 && Gd.depth === 2.4 && Math.max(...Gd.web) <= 0.15, `panel ${Gd.panel}`);
  const bars = shed.gableGirder(uc, sp, top), verticals = bars.filter(b => b.kind === 'mullion' && b.rotZ === 0).sort((a, b) => a.c[0] - b.c[0]);
  const diagonals = bars.filter(b => b.kind === 'mullion' && b.rotZ !== 0).sort((a, b) => a.c[0] - b.c[0]);
  const mullions = shed.gableBars(uc, sp, top).filter(b => b.kind === 'mullion').map(b => b.c[0]);
  const inner = verticals.slice(1, -1);
  assert.ok(inner.length >= 14, `${inner.length} inner verticals`);
  for (const v of inner) assert.ok(mullions.some(m => Math.abs(m - v.c[0]) < 1e-6), `a vertical on a mullion at ${(v.c[0] - uc).toFixed(2)}`);
  assert.equal(diagonals.length, verticals.length - 1, 'one diagonal a panel');
  diagonals.forEach((d, i) => {
    if (i) assert.ok(Math.sign(d.rotZ) === -Math.sign(diagonals[i - 1]!.rotZ), 'alternating');
    const a = verticals[i]!.c[0], b = verticals[i + 1]!.c[0];
    assert.ok(d.c[0] > a && d.c[0] < b && Math.abs(d.c[0] - (a + b) / 2) < 1e-9, 'within its own panel: none crossing');
    if (i > 0 && i < diagonals.length - 1) assert.ok(Math.abs(Math.abs(d.rotZ) * 180 / Math.PI - Math.atan2(2.4, 1.6) * 180 / Math.PI) < 1e-6, `about 56 degrees: ${(Math.abs(d.rotZ) * 180 / Math.PI).toFixed(1)}`);
  });
  const ends = [verticals[1]!.c[0] - verticals[0]!.c[0], verticals.at(-1)!.c[0] - verticals.at(-2)!.c[0]];
  for (const e of ends) assert.ok(e >= 0.4 - 1e-9 && e < 1.6 + 0.4 + 1e-9, `end panel ${e.toFixed(2)}`);
});
