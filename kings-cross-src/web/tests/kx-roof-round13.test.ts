// Round A5-1 (gap-scan-2, A5): from outside, in the physical roof modes and by day, the crown glass is an opaque pale grey-blue field with fine bars down the
// slope that hides the far slope's caps; the intermediate rib caps are subdued; the slate flanks are smooth with fine standing seams. X-ray, inside and night
// as before. A namespace import, so a missing export fails an assertion here and not the whole file's link.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout } from '../../core/station.ts';
import * as lighting from '../src/lighting.ts';
import * as shedModule from '../src/shed.ts';
import { Glsl } from './glsl.ts';

const L = lighting as unknown as Record<string, unknown>;
const S = shedModule as unknown as Record<string, unknown>;
const layout = shedLayout(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData);
type V3 = [number, number, number];
const luma = (c: number[]): number => 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
const lin = (hex: number): number[] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const compile = (m: THREE.Material): string => {
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader.fragmentShader;
};
const above: V3 = [layout.width / 2, layout.crown + 40, -layout.length / 2], under: V3 = [layout.width / 2, 3, -layout.length / 2];

test('A5 (A5-1): from outside by day in auto and solid the crown glass is drawn 0.85-0.92 opaque and writes depth, so the far slope\'s caps cannot draw over it; x-ray, inside and night as before', () => {
  const alpha = S.crownAlpha as (c: V3, l: typeof layout, m?: string) => number, depth = S.crownDepth as ((c: V3, l: typeof layout, n: number, m?: string) => boolean) | undefined;
  const tint = S.crownTint as ((c: V3, l: typeof layout, m?: string) => number) | undefined;
  assert.ok(depth && tint, 'crownDepth and crownTint are exported');
  for (const m of ['auto', 'solid']) {
    const a = alpha(above, layout, m);
    assert.ok(a >= 0.87 && a <= 0.92, `${m}: alpha ${a}`);
    assert.equal(depth(above, layout, 0, m), true, `${m}: writes depth outside by day`);
    assert.equal(depth(above, layout, 1, m), false, `${m}: none at night`);
    assert.equal(depth(under, layout, 0, m), false, `${m}: none inside`);
    assert.equal(tint(above, layout, m), 1, `${m}: the tint outside`);
    assert.equal(tint(under, layout, m), 0, `${m}: none inside`);
  }
  assert.ok(Math.abs(alpha(above, layout, 'xray') - 0.85 * 0.5) < 1e-9, 'x-ray: as before');
  // round A5-1b: one day factor through dusk: the raise between its day and night values at a mid night level, and the depth write still on there
  const day = S.crownDay as ((n: number) => number) | undefined;
  assert.ok(day, 'crownDay is exported');
  assert.equal(day(0), 1); assert.equal(day(1), 0);
  const a0 = (alpha as (c: V3, l: typeof layout, m: string, n: number) => number)(above, layout, 'auto', 0), a6 = (alpha as (c: V3, l: typeof layout, m: string, n: number) => number)(above, layout, 'auto', 0.6), a1 = (alpha as (c: V3, l: typeof layout, m: string, n: number) => number)(above, layout, 'auto', 1);
  assert.ok(a1 < a6 && a6 < a0 && a0 === alpha(above, layout, 'auto'), `alpha ${a0} by day, ${a6} at dusk, ${a1} at night`);
  assert.equal(depth(above, layout, 0.6, 'auto'), true, 'dusk: still writes depth, no lattice');
  assert.equal(depth(above, layout, 0.6, 'xray'), false, 'dusk in x-ray: none');
  assert.ok(Math.abs((alpha as (c: V3, l: typeof layout, m: string, n: number) => number)(above, layout, 'xray', 0.6) - 0.85 * 0.5) < 1e-9, 'x-ray at dusk: as before');
  assert.equal(alpha(under, layout, 'auto'), 0, 'inside: as before');
  assert.equal(depth(above, layout, 0, 'xray'), false, 'x-ray writes none');
  assert.equal(tint(above, layout, 'xray'), 0, 'x-ray takes no tint');
  // wired: the glass's own draw sets them
  const group = shedModule.buildShed(layout, { range: false });
  group.updateMatrixWorld(true);
  const glass = group.getObjectByName('shed-roof-glass') as THREE.Mesh, mat = glass.material as THREE.MeshLambertMaterial;
  const draw = (at: V3): void => { const cam = new THREE.PerspectiveCamera(); cam.position.set(...at).applyMatrix4(group.matrixWorld); glass.onBeforeRender(undefined as never, undefined as never, cam, undefined as never, mat, undefined as never); };
  draw(above); assert.equal(mat.depthWrite, true, 'outside: the draw writes depth');
  draw(under); assert.equal(mat.depthWrite, false, 'inside: none');
  assert.ok(compile(mat).includes(L.CROWN_OUTSIDE_LINE as string), 'the glass carries the tint line');
});

test('A5 (A5-1): the crown\'s tone from outside goes most of the way to a pale grey-blue about #a9b6c2, crossed by 0.06 m bars every 1.2 m that fade to their mean far off', () => {
  const C = L.CROWN_OUTSIDE as { tint: number; bars: { pitch: number; width: number } } | undefined;
  assert.ok(C, 'CROWN_OUTSIDE is exported');
  const t = lin(C.tint), want = lin(0xa9b6c2);
  assert.ok(t.every((v, i) => Math.abs(v - (want[i] as number)) < 0.03), `tint ${t}`);
  assert.ok(Math.abs(C.bars.pitch - 1.2) < 0.15 && Math.abs(C.bars.width - 0.06) < 0.015, 'bars 0.06 m every 1.2 m');
  const glsl = new Glsl(L.CROWN_OUTSIDE_GLSL as string), env = { vars: {}, fns: {} };
  const tone = (c: number[], k: number, bar: number, light = 1): number[] => glsl.call('crownOutsideTone', [c, k, bar, 0.6, light], env) as number[];
  const dark = [0.08, 0.1, 0.12], toned = tone(dark, 1, 0);
  const gap = (a: number[]): number => Math.abs(luma(a) - luma(want)) / Math.abs(luma(dark) - luma(want));
  assert.ok(gap(toned) < 0.4, `the dark glass taken most of the way to the tint (${gap(toned).toFixed(2)} of the gap left)`);
  assert.deepEqual(tone(dark, 0, 1), dark, 'level 0: as before');
  // round A5-1b: the tint is lit by the glass's own light: a dusk's fifth of a day's takes it well under the day's tone, not to daylight-white
  const dusk = tone(dark, 1, 0, 0.2);
  assert.ok(luma(dusk) < 0.45 * luma(toned) && luma(dusk) > luma(dark) * 0.2, `at a fifth of the day's light the tone ${luma(dusk).toFixed(3)}, the day's ${luma(toned).toFixed(3)}`);
  assert.deepEqual(tone(dark, 1, 0, 3), toned, 'more than a day\'s light: the day\'s tone');
  assert.ok((L.CROWN_OUTSIDE_LINE as string).includes('reflectedLight.directDiffuse + reflectedLight.indirectDiffuse'), 'the light the program passes is the fragment\'s own');
  const barred = tone(dark, 1, 1);
  assert.ok(luma(barred) < 0.8 * luma(toned) && luma(barred) > 0.2 * luma(toned), 'a bar darker, not black');
  const bar = (s: number, fw: number): number => glsl.call('crownBar', [s, fw], env) as number;
  assert.ok(bar(C.bars.width / 2, 0.001) > 0.95 && bar(C.bars.pitch / 2, 0.001) < 0.05, 'on the bar, between');
  assert.ok(Math.abs(bar(C.bars.width / 2, 0.9 * C.bars.pitch) - C.bars.width / C.bars.pitch) < 1e-6, 'far off (a footprint of 0.9 pitch, over a whole bar): its mean');
  assert.ok(Math.abs(bar(0.05, 0.1) - 0.6) < 0.01, 'close: the bar\'s share of the pixel\'s footprint, box-filtered');
});

test('A5 (A5-1): the intermediate rib caps 0.12-0.18 m wide in about #4a5058; the end and gable ribs as heavy as before', () => {
  const E = shedModule.ROOF_EXTERIOR as unknown as { ribCap: number[]; capColour?: number; endRib: number[]; gableRib: number[] };
  assert.ok((E.ribCap[0] as number) >= 0.12 && (E.ribCap[0] as number) <= 0.18, `cap ${E.ribCap[0]} m wide`);
  assert.ok(E.capColour !== undefined, 'a cap colour');
  const c = lin(E.capColour), want = lin(0x4a5058);
  assert.ok(c.every((v, i) => Math.abs(v - (want[i] as number)) < 0.01), `cap colour ${c}`);
  assert.deepEqual(E.endRib, [0.5, 0.6]);
  assert.deepEqual(E.gableRib, [0.9, 0.6]);
  const group = shedModule.buildShed(layout, { range: false });
  const bars = group.getObjectByName('shed-roof-bars') as THREE.Mesh, m = bars.material as THREE.MeshLambertMaterial, col = bars.geometry.getAttribute('color');
  const capX = c[0]! / m.color.r;
  let caps = 0;
  for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - capX) < 1e-6) caps++;
  assert.ok(caps > 1000, `${caps} cap vertices in the cap colour`);
});

test('A5 (A5-1): from outside in the physical modes the slate flank is a smooth grey about #5a616b (A5-1b, was #3c4148) with fine seams every 0.5 m that fade to their mean, not the speckled tile', () => {
  const F = L.SLATE_FLANK as { color: number; pitch: number; width: number } | undefined;
  assert.ok(F, 'SLATE_FLANK is exported');
  // round A5-1b: lifted toward #5a616b (the scorer: the flank read darker than front-d)
  assert.ok(lin(F.color).every((v, i) => Math.abs(v - (lin(0x5a616b)[i] as number)) < 0.03), `flank ${F.color.toString(16)}`);
  assert.ok(Math.abs(F.pitch - 0.5) < 0.1, 'seams about 0.5 m apart');
  const glsl = new Glsl(L.SLATE_FLANK_GLSL as string), env = { vars: {}, fns: {} };
  const speckle = [0.3, 0.12, 0.2], flat = glsl.call('slateFlank', [speckle, 1, 0], env) as number[];
  assert.ok(flat.every((v, i) => Math.abs(v - (lin(F.color)[i] as number)) < 1e-4), 'level 1, off a seam: the flat colour, whatever the texel');
  assert.deepEqual(glsl.call('slateFlank', [speckle, 0, 1], env), speckle, 'level 0 (x-ray, inside): the texture as before');
  const seamed = glsl.call('slateFlank', [speckle, 1, 1], env) as number[];
  assert.ok(luma(seamed) < 0.85 * luma(flat), 'a seam darker');
  const seam = (s: number, fw: number): number => glsl.call('slateSeam', [s, fw], env) as number;
  assert.ok(seam(F.width / 2, 0.001) > 0.95 && seam(F.pitch / 2, 0.001) < 0.05, 'on a seam, between');
  assert.ok(Math.abs(seam(F.width / 2, 0.9 * F.pitch) - F.width / F.pitch) < 1e-6, 'far off (a footprint of 0.9 pitch): its mean');
  assert.ok(Math.abs(seam(0.02, 0.04) - 0.75) < 0.01, 'close: box-filtered on the pixel\'s footprint');
  const group = shedModule.buildShed(layout, { range: false });
  group.updateMatrixWorld(true);
  const clad = group.getObjectByName('shed-roof-cladding') as THREE.Mesh, mat = clad.material as THREE.MeshLambertMaterial;
  assert.ok(compile(mat).includes('slateFlank('), 'the cladding carries it');
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const level = shader.uniforms.uSlateFlank!;
  const draw = (at: V3, mode: string): number => {
    group.userData.roofMode = mode;
    const cam = new THREE.PerspectiveCamera(); cam.position.set(...at).applyMatrix4(group.matrixWorld);
    clad.onBeforeRender(undefined as never, undefined as never, cam, undefined as never, mat, undefined as never);
    return level.value as number;
  };
  assert.equal(draw(above, 'auto'), 1, 'outside, auto');
  assert.equal(draw(above, 'solid'), 1, 'outside, solid');
  assert.equal(draw(above, 'xray'), 0, 'x-ray: as before');
  assert.equal(draw(under, 'auto'), 0, 'inside: as before');
});
