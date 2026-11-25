import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';
import { DAY_EXPOSURE } from '../../core/daylight.ts';
import { acesFilmic, toSrgb } from './aces.ts';

// Arcade round 3 (A3, the 2c score): the figures a contrast floor about 12 levels under the hall, never under about 7, in two tones; a lit back-wall band
// deeper in the hall; a faint day reflection on the lower panes, weaker on the door leaves. All in the infill's existing materials: no draw, no triangle.
// On-screen values on the ACES model (tests/aces.ts, day exposure), the hall's radiance t C + E with C, E set so its map's two ends read 5 and 37 sRGB.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const group = shed.buildShed(layout, { range: false });
const A = shed.SOUTH_FRONT_ARCADES, T = shed.PORCH_TONES, D = shed.PORCH_DEPTH;
const G = (shed as unknown as { PORCH_GLASS: { band: { v: readonly number[]; colour: readonly number[] }; reflect: { colour: readonly number[]; top: number; door: number; doors: readonly number[] } } }).PORCH_GLASS;
const F = (T as unknown as { figureDay: { t: readonly number[]; k: readonly number[]; hips: number; legs: number } }).figureDay;
const entryFoot = GROUND_Y + A.footAboveGround;
const infill = group.getObjectByName('shed-front-infill') as THREE.Mesh;
const mats = infill.material as THREE.MeshLambertMaterial[], interior = mats[4]!, fig = mats[7]!;
const show = (l: number): number => 255 * toSrgb(acesFilmic([l, l, l], DAY_EXPOSURE))[1];
const inv = (s: number): number => { if (s <= 0) return 0; let l = 1e-7; while (show(l) < s) l *= 1.0005; return l; };
const s2l = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const tMin = s2l(D.gradient[0] * D.vignette.edge * D.vignette.top), C = (inv(37) - inv(5)) / (1 - tMin), E = inv(37) - C;
const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const nums = (s: string | undefined): number[] => (s ?? '').replace(/vec[234]\(|\)/g, '').split(',').map(Number);
const frag = (m: THREE.Material): string => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  m.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
  return sh.fragmentShader;
};
const kAt = (t: number): number => {
  const [t0, t1, t2, t3] = F.t as [number, number, number, number], [k0, k1, k2, k3] = F.k as [number, number, number, number];
  const lerp = (a: number, b: number, x: number): number => a + (b - a) * Math.min(1, Math.max(0, x));
  return t <= t1 ? lerp(k0, k1, (t - t0) / (t1 - t0)) : t <= t2 ? lerp(k1, k2, (t - t1) / (t2 - t1)) : lerp(k2, k3, (t - t2) / (t3 - t2));
};
const reflect = (v: number): number => lum(G.reflect.colour) * (1 + (G.reflect.top - 1) * v);

test('A3 round 3: each figure\'s upper body sits about 12 levels under the hall (glass reflection and all), never under about 6, its legs a second darker tone', () => {
  const defs = fig.defines as Record<string, string>;
  assert.deepEqual(nums(defs.KX_FIG_T), [...F.t], 'the knots in the shader');
  assert.deepEqual(nums(defs.KX_FIG_KS), [...F.k]);
  assert.ok(Math.abs(Number(defs.KX_FIG_HIPS) - (entryFoot + 0.3 + F.hips)) < 1e-3 && F.hips > 0.6 && F.hips < 1.1 && Number(defs.KX_FIG_LEGS) === F.legs && F.legs >= 0.6 && F.legs <= 0.85, 'the legs\' tone under the hips');
  const src = frag(fig);
  assert.ok(src.includes('kxK *= vFrontY < KX_FIG_HIPS ? KX_FIG_LEGS : 1.0;') && src.includes('mix( KX_FIG_KS.y, KX_FIG_KS.z, ( kxT - KX_FIG_T.y ) / ( KX_FIG_T.z - KX_FIG_T.y ) )'), 'the knots and the legs in the shader');
  const r = reflect(0.5), out: string[] = [];
  for (const h of [7, 9, 13, 16, 19, 22, 25, 30, 37]) {
    const H = inv(h), k = kAt((H - E) / C), hall = show(H + r), up = show(k * H + r), legs = show(F.legs * k * H + r);
    out.push(`${hall.toFixed(0)}:${up.toFixed(0)}/${legs.toFixed(0)}`);
    assert.ok(up >= 6 && up <= hall - 2, `a hall of ${hall.toFixed(1)}: the figure ${up.toFixed(1)}, not crushed, not lighter`);
    assert.ok(hall < 21 || hall - up >= 11, `a hall of ${hall.toFixed(1)}: the figure ${up.toFixed(1)}, a floor about 12 under`);
    assert.ok(hall >= 19 || up <= 9.5, `a dark hall of ${hall.toFixed(1)}: the figure ${up.toFixed(1)}, clamped near 7`);
    assert.ok(legs <= up - 1 && legs >= 3, `the legs ${legs.toFixed(1)} under the upper body ${up.toFixed(1)}`);
  }
  console.log('hall:upper/legs', out.join(' '));
});

test('A3 round 3: a lit back-wall band deeper in the hall, about 15 levels over a mid hall by day, and a small share of the night glow', () => {
  const defs = interior.defines as Record<string, string>, [v0, v1] = G.band.v as [number, number];
  assert.ok(v0 >= 0.3 && v1 <= 0.85 && v1 - v0 >= 0.15, `the band from ${v0} to ${v1} of the hall`);
  assert.deepEqual(nums(defs.KX_BAND), [v0, v1]);
  assert.deepEqual(nums(defs.KX_BAND_COLOUR), [...G.band.colour]);
  assert.ok(frag(interior).includes('totalEmissiveRadiance += KX_BAND_COLOUR * texture2D( map, vMapUv ).g * step( KX_BAND.x, vMapUv.y ) * step( vMapUv.y, KX_BAND.y );'), 'the band in the shader');
  assert.ok(!(fig.defines as Record<string, string>).KX_BAND, 'on the hall only');
  for (const h of [20, 23, 26]) {
    const H = inv(h), t = (H - E) / C, band = show(H + lum(G.band.colour) * t);
    assert.ok(band - h >= 12 && band - h <= 25, `the band over a hall of ${h}: ${band.toFixed(1)}`);
  }
  const glow = new THREE.Color(shed.FRONT_NIGHT.glass[0]).multiplyScalar(shed.FRONT_NIGHT.glass[1]);
  assert.ok(lum(G.band.colour) < 0.12 * lum(glow.toArray()), 'at night under a tenth or so of the hall\'s glow');
});

test('A3 round 3: a faint day reflection on the lower panes, on the hall and the figures alike, falling to the transom, weaker on the door leaves, gone at night', () => {
  for (const m of [interior, fig]) {
    const d = m.defines as Record<string, string>;
    assert.deepEqual(nums(d.KX_REFLECT), [...G.reflect.colour]);
    assert.ok(Number(d.KX_REFLECT_TOP) === G.reflect.top && Number(d.KX_REFLECT_DOOR) === G.reflect.door && nums(d.KX_REFLECT_DOORS).join() === G.reflect.doors.join(), 'the same reflection');
    assert.ok(frag(m).includes('totalEmissiveRadiance += KX_REFLECT * ( 1.0 - uWinNight ) * mix( 1.0, KX_REFLECT_TOP, clamp( vMapUv.y, 0.0, 1.0 ) )'), 'by day only, in the shader');
  }
  const c = G.reflect.colour;
  assert.ok(c[2]! > c[0]!, 'a cool sky tint');
  assert.ok(G.reflect.top <= 0.6 && G.reflect.door <= 0.6 && G.reflect.door >= 0.3, `falling to ${G.reflect.top}, ${G.reflect.door} on the doors`);
  // the door leaves are the middle two bays' width under the push rail: 0.4 of the hall's width, centred
  assert.ok(Math.abs(G.reflect.doors[0]! - 0.3) < 1e-9 && Math.abs(G.reflect.doors[1]! - 0.7) < 1e-9, 'the doors under the rail');
  for (const h of [7, 13, 20, 25]) {
    const lift = show(inv(h) + reflect(0)) - h, top = show(inv(h) + reflect(1)) - h;
    assert.ok(lift >= 2 && lift <= 5 && top < lift && top >= 0.5, `a hall of ${h}: +${lift.toFixed(1)} at the foot, +${top.toFixed(1)} at the transom`);
  }
});

test('A3 round 3: no new draw or triangle: the infill keeps its eight materials and its triangle count', () => {
  assert.equal(mats.length, 8);
  const n = infill.geometry.getAttribute('position').count / 3;
  assert.equal(n, 1628, `the infill's triangles: ${n}`);
});
