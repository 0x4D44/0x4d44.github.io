// Round F17 (front-round-16b score, A6/B3): the north screens' verticals are a hierarchy, every third mullion heavy and fine glazing bars in the glass between
// (lights about 6:1 within the half-tier rows), seen from both sides and never aliasing at a distance; and from outside by day a low reflection field of the sky
// lays 2-3 soft light and dark zones over each gable. Every other glass, and the gables inside and at night apart from the bars, as before.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import type { KxData } from '../../core/osm.ts';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as M from '../src/materials.ts';
import { GLAZING, material } from '../src/materials.ts';
import * as shed from '../src/shed.ts';
import { DERIVATIVES, Glsl, Mat } from './glsl.ts';

const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader };
(material('glass') as THREE.MeshPhongMaterial).onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
const f = s.fragmentShader, open = '#if defined( USE_FOG ) && ! defined( FLIP_SIDED )\n', first = f.indexOf(`${open}vec2 gm`), second = f.indexOf(open, f.indexOf('#endif', first));
const block = second > 0 ? f.slice(second + open.length, f.indexOf('#endif', second)) : '';
const identity = new Mat(4, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), day = [0.6635, 0.8039, 0.9644], P = GLAZING.spacing, g = new Glsl('');
const R = SHED_SPAN_WIDTH / 2, F = (M as Record<string, unknown>).GABLE_FINE as { spacing: number; width: number; shade: number };
// the second block alone, over a given colour: `bars` the gables' own draw, `even` outside by day
const after = (x: number, opts: { bars?: number; even?: number; fw?: number; rgba?: number[]; cam?: number[]; y?: number } = {}): number[] => {
  DERIVATIVES.width = opts.fw ?? 0.002;
  const env = { vars: { gl_FragColor: [...(opts.rgba ?? [0.3, 0.33, 0.37, 0.6])], gl_FrontFacing: false, fogColor: day, cameraPosition: opts.cam ?? [0, 0, 0], viewMatrix: identity, vViewPosition: [0, 0, 50], normal: [0, 0, 1], vGlassPos: [x, opts.y ?? 15], uPaneX: 0, uGlintEven: opts.even ?? 0, uGableBars: opts.bars ?? 1 } };
  g.run(block, env);
  DERIVATIVES.width = 0.002;
  return env.vars.gl_FragColor as number[];
};

test('A6/B3 (F17): every third mullion of the north screens, from the middle, is 1.5-2 times as wide and deep as the rest, symmetric on each arch', () => {
  const ms = shed.gableBars(0, GLAZING.springing, shed.GABLE_GLASS_FROM, R).filter(b => b.kind === 'mullion');
  const light = Math.min(...ms.map(b => b.s[0]));
  let heavy = 0;
  for (const b of ms) {
    const k = Math.round(b.c[0] / P), r = b.s[0] / light;
    if (k % 3 === 0) { heavy++; assert.ok(r >= 1.5 && r <= 2 && b.s[2] / 0.12 >= 1.5, `mullion ${k}: ${r.toFixed(2)} times as wide`); } else assert.equal(r, 1, `mullion ${k}: as before`);
  }
  assert.ok(heavy >= 5 && heavy % 2 === 1, `${heavy} heavy mullions, one in the middle`);
});

test('A6/B3 (F17): fine glazing bars, three between each pair of mullions, about 0.02 m and lighter than a transom, from either side; faded to their mean far off, so no moire', () => {
  assert.ok(block.includes('fwidth'), 'a second block in the glass, on the pixel\'s footprint');
  assert.ok(F && Math.abs(F.spacing - P / 4) < 1e-9 && F.width >= 0.015 && F.width <= 0.025 && F.width < shed.GABLE_TRANSOM.width, `fine bars ${F?.spacing} m apart, ${F?.width} m`);
  for (const x0 of [0, 4 * P]) {
    const bars = Array.from({ length: 160 }, (_, i) => x0 + i * 0.01).filter(x => after(x)[0]! < 0.3 * (1 - 0.4)).map(x => Math.round((x - x0) / F.spacing));
    // (a line also runs under each mullion, k 0 and 4, hidden by its geometry)
    assert.deepEqual([...new Set(bars)].filter(k => k % 4 !== 0), [1, 2, 3], `three dark lines in the bay from ${x0}`);
    for (const x of [x0 + 0.2, x0 + 0.6, x0 + 1.0]) assert.deepEqual(after(x), [0.3, 0.33, 0.37, 0.6], `clear between the lines (${x})`);
    const line = after(x0 + F.spacing);
    assert.ok(line[3]! > 0.75 && line[0]! < 0.2, `a dark, near opaque line: ${line.map(v => v.toFixed(2))}`);
  }
  assert.ok(2 * shed.GABLE_TRANSOM.split > 0 && (GLAZING.tier / shed.GABLE_TRANSOM.split) / F.spacing >= 4, 'lights at least 4 times as tall as wide');
  // far off (a pixel half the spacing or more) the lines are their mean cover, the same at every x: nothing to alias; in between, a smooth fade
  for (const fw of [0.2, 0.5, 1.5]) {
    const out = Array.from({ length: 80 }, (_, i) => after(i * 0.0137, { fw })[0]!);
    assert.ok(Math.max(...out) - Math.min(...out) < 1e-6, `at a ${fw} m pixel: one tone (${Math.min(...out).toFixed(4)}-${Math.max(...out).toFixed(4)})`);
    assert.ok(Math.abs(out[0]! - 0.3 * (1 - F.shade * F.width / F.spacing)) < 1e-6, `at its mean cover: ${out[0]!.toFixed(4)}`);
  }
  for (const fw of [0.002, 0.01, 0.05, 0.1, 0.2]) {
    const mean = Array.from({ length: 400 }, (_, i) => after(0.05 + i * 0.001, { fw })[0]!).reduce((a, b) => a + b, 0) / 400;
    assert.ok(Math.abs(mean - 0.3 * (1 - F.shade * F.width / F.spacing)) < 0.004, `at a ${fw} m pixel the bay keeps its mean tone: ${mean.toFixed(4)}`);
  }
  assert.deepEqual(after(F.spacing, { bars: 0 }), [0.3, 0.33, 0.37, 0.6], 'every other glass: none');
  // and only the gables' own draw raises it, from either side, put back after
  const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
  const grp = shed.buildShed(layout, { range: false, roof: 'auto' }); grp.updateMatrixWorld(true);
  const glass = grp.getObjectByName('shed-gable-glass') as THREE.Mesh, mat = glass.material as THREE.MeshPhongMaterial, flag = (M as Record<string, unknown>).gableDraw as { value: number };
  for (const p of [[layout.width / 2, 18, -layout.length - 90], [layout.spine, 8, -layout.length / 2]] as const) {
    const c = new THREE.PerspectiveCamera(); c.position.copy(grp.localToWorld(new THREE.Vector3(...p)));
    glass.onBeforeRender(undefined as never, undefined as never, c, glass.geometry, mat, null as never);
    assert.equal(flag.value, 1, `the gables' draw (${p}): the bars`);
    glass.onAfterRender(undefined as never, undefined as never, c, glass.geometry, mat, null as never);
    assert.equal(flag.value, 0, 'put back');
  }
});

test('A6 (F17): from outside by day a reflection field lays 2-3 soft light and dark zones over each gable, +-10-16 levels, drifting with the camera; inside and at night none', () => {
  const R0 = (M as Record<string, unknown>).GABLE_REFLECT as { amp: number } | undefined;
  assert.ok(R0, 'GABLE_REFLECT');
  const sheet = [0.29, 0.31, 0.34, 0.98], G = (x: number, cam = [0, 0, 0], even = 1): number => after(x, { bars: 0, even, rgba: sheet, cam })[1]! * 255;
  const xs = Array.from({ length: 129 }, (_, i) => -32 + i * 0.5), row = xs.map(x => G(x)), base = sheet[1]! * 255;
  const half = (Math.max(...row) - Math.min(...row)) / 2;
  assert.ok(half >= 10 && half <= 16, `+-${half.toFixed(1)} levels`);
  assert.ok(row.some(v => v > base + 5) && row.some(v => v < base - 5), 'lighter and darker zones');
  const zones = row.slice(1).filter((v, i) => Math.sign(v - base) !== Math.sign(row[i]! - base)).length + 1;
  assert.ok(zones >= 4 && zones <= 7, `${zones} zones over the two gables`);
  row.slice(1).forEach((v, i) => assert.ok(Math.abs(v - row[i]!) < 1.5, 'soft: under 1.5 levels per half metre'));
  assert.ok(xs.some(x => Math.abs(G(x, [40, 0, 0]) - G(x)) > 3), 'drifts as the camera moves');
  for (const x of [-20, 3, 17]) assert.equal(G(x, [0, 0, 0], 0), base, 'inside, at night, on the plane: none');
});
