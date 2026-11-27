import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { SHED_SPAN_WIDTH, shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';
import { DAY_EXPOSURE, lampLevelFor } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import { acesFilmic, toSrgb } from './aces.ts';

// Arcade round 3 (A3, the 2c score): the figures a contrast floor about 12 levels under the hall, never under about 7, in two tones; a lit back-wall band
// deeper in the hall; a faint day reflection on the lower panes, weaker on the door leaves. All in the infill's existing materials: no draw, no triangle.
// On-screen values on the ACES model (tests/aces.ts, day exposure), the hall's radiance t C + E with C, E set so its map's two ends read 5 and 37 sRGB.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const group = shed.buildShed(layout, { range: false });
const A = shed.SOUTH_FRONT_ARCADES, T = shed.PORCH_TONES, D = shed.PORCH_DEPTH;
type V = readonly number[];
const G = (shed as unknown as { PORCH_GLASS: { band: { v: V; colour: V }; day: { v: V; feather: number; base: number; pools: V; width: number; colour: V };
  signs: { boxes: readonly V[]; colour: V }; lift: { v: V; colour: V }; reflect: { forecourt: V; sky: V; door: number; doors: V }; gpu: { band: number; lift: number; reflect: number } } }).PORCH_GLASS;
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
// Round 3c (re-pinned from 3b's single 0.1): each day term adds G.gpu.<term> times itself here, fitted to the 3b GPU column (shed.ts PORCH_GLASS).
// The lift's and the reflection's light at v (forecourt at the foot, sky at the transom), each times its own factor.
const gB = G.gpu.band, gL = G.gpu.lift, gR = G.gpu.reflect;
const ss = (a: number, b: number, x: number): number => { const y = Math.min(1, Math.max(0, (x - a) / (b - a))); return y * y * (3 - 2 * y); };
const liftAt = (v: number): number => gL * lum(G.lift.colour) * (1 - ss(G.lift.v[0]!, G.lift.v[1]!, v));
const reflAt = (v: number): number => gR * (lum(G.reflect.forecourt) + (lum(G.reflect.sky) - lum(G.reflect.forecourt)) * Math.min(1, Math.max(0, v)));
const tOf = (H: number): number => (H - E) / C;

test('A3 round 3b: each figure\'s upper body sits about 12 levels under the hall behind it (the lower hall lit, the figures not), the dark-zone floor as measured, its legs darker', () => {
  const defs = fig.defines as Record<string, string>;
  assert.deepEqual(nums(defs.KX_FIG_T), [...F.t], 'the knots in the shader');
  assert.deepEqual(nums(defs.KX_FIG_KS), [...F.k]);
  assert.ok(Math.abs(Number(defs.KX_FIG_HIPS) - (entryFoot + 0.3 + F.hips)) < 1e-3 && F.hips > 0.6 && F.hips < 1.1 && Number(defs.KX_FIG_LEGS) === F.legs && F.legs >= 0.6 && F.legs <= 0.85, 'the legs\' tone under the hips');
  const src = frag(fig);
  assert.ok(src.includes('kxK *= vFrontY < KX_FIG_HIPS ? KX_FIG_LEGS : 1.0;') && src.includes('mix( KX_FIG_KS.y, KX_FIG_KS.z, ( kxT - KX_FIG_T.y ) / ( KX_FIG_T.z - KX_FIG_T.y ) )'), 'the knots and the legs in the shader');
  for (const k of ['KX_REFLECT', 'KX_LIFT', 'KX_DAYBAND', 'KX_SIGN0', 'KX_BAND']) assert.ok(!defs[k], `no ${k} on the figures: they are not lifted`);
  const v = 0.25, out: string[] = []; // a figure's upper body, about a quarter up the hall
  // the floor: the model reads the darkest hall's figure under 6 (4.9-5.4 on halls of 7-13) where the GPU measured about 7.5 with the reflection's +0.3, so
  // the knots stay as measured and the model's floor in the dark zone here is 4.5
  for (const h of [7, 9, 10, 13, 16, 19, 22, 25, 30, 37]) {
    const H = inv(h), k = kAt(tOf(H)), hall = show(H + (liftAt(v) + reflAt(v))), up = show(k * H), legs = show(F.legs * k * H);
    out.push(`${h}->${hall.toFixed(0)}:${up.toFixed(0)}/${legs.toFixed(0)}`);
    assert.ok(up >= (h < 19 ? 4.5 : 6) && up <= hall - 2, `a hall of ${hall.toFixed(1)}: the figure ${up.toFixed(1)}, not crushed, not lighter`);
    assert.ok(hall - up >= 12, `a hall of ${hall.toFixed(1)}: the figure ${up.toFixed(1)}, about 12 or more under`);
    // re-pinned round 3c (3b's lift blew the GPU hall to 115-165): the lower hall about 25, not a wash
    assert.ok(hall >= 20 && hall <= Math.max(30, h + 14), `the lower hall lit to ${hall.toFixed(1)} from ${h}`);
    const lit = show(H + liftAt(v));
    assert.ok(h < 9 || (lit >= 14 && lit <= Math.max(20, h + 6)), `the lift alone takes a hall of ${h} to ${lit.toFixed(1)}`);
    assert.ok(h < 25 || up <= h - 10, `a figure ${up.toFixed(1)} 10 or more under the unlit hall of ${h}, as in round 3`);
    assert.ok(h >= 19 || up <= 9.5, `a dark hall of ${h}: the figure ${up.toFixed(1)}, clamped near 7`);
    assert.ok(legs <= up - 1 && legs >= (h < 19 ? 2.5 : 3), `the legs ${legs.toFixed(1)} under the upper body ${up.toFixed(1)}`);
  }
  console.log('hall->lit:upper/legs', out.join(' '));
  const [l0, l1] = G.lift.v as [number, number];
  assert.ok(l0 >= 0.35 && l1 <= 0.6 && l1 > l0, `the lift fades from ${l0} to ${l1} of the hall, under the band`);
});

test('A3 round 3b: by day the back-wall band feathered top and bottom, in two or three brighter pools, about 50-70 at a pool; at night the round-3 band unchanged', () => {
  const defs = interior.defines as Record<string, string>, d = G.day, src = frag(interior);
  assert.deepEqual(nums(defs.KX_BAND), [...G.band.v], 'the night band as before');
  assert.deepEqual(nums(defs.KX_BAND_COLOUR), [...G.band.colour]);
  assert.ok(src.includes('totalEmissiveRadiance += uWinNight * KX_BAND_COLOUR * texture2D( map, vMapUv ).g * step( KX_BAND.x, vMapUv.y ) * step( vMapUv.y, KX_BAND.y );'), 'the round-3 band, night only');
  const glow = new THREE.Color(shed.FRONT_NIGHT.glass[0]).multiplyScalar(shed.FRONT_NIGHT.glass[1]);
  assert.ok(lum(G.band.colour) < 0.12 * lum(glow.toArray()) && lum(G.band.colour) > 0.02 * lum(glow.toArray()), 'at night a tenth or so of the hall\'s glow, as in round 3');
  assert.deepEqual(nums(defs.KX_DAYBAND), [...d.v, d.feather, d.base]);
  assert.deepEqual(nums(defs.KX_DAYBAND_POOLS), [...d.pools]);
  assert.ok(Number(defs.KX_DAYBAND_W) === d.width && nums(defs.KX_DAYBAND_COLOUR).join() === d.colour.join(), 'the pools\' width and the colour');
  assert.ok(src.includes('totalEmissiveRadiance += ( 1.0 - uWinNight ) * KX_DAYBAND_COLOUR * texture2D( map, vMapUv ).g * mix( KX_DAYBAND.w, 1.0, kxPool )')
    && src.includes('* smoothstep( KX_DAYBAND.x, KX_DAYBAND.x + KX_DAYBAND.z, vMapUv.y ) * ( 1.0 - smoothstep( KX_DAYBAND.y - KX_DAYBAND.z, KX_DAYBAND.y, vMapUv.y ) );')
    && src.includes('exp( -kxPd.z * kxPd.z )'), 'the feathered, pooled band, day only, in the shader');
  assert.ok(d.feather >= 0.08 && d.feather <= 0.1 && d.v[0]! >= 0.3 && d.v[1]! <= 0.85 && d.v[1]! - d.v[0]! >= 2.5 * d.feather, `feathered over ${d.feather} of the hall`);
  assert.ok(d.pools.length === 3 && d.pools.every((p, i) => p > 0.1 && p < 0.9 && (i === 0 || p - d.pools[i - 1]! >= 2 * d.width)) && d.width >= 0.08 && d.width <= 0.16 && d.base >= 0.25 && d.base <= 0.5, 'three pools along it');
  const out: string[] = [];
  // re-pinned round 3c (3b: the band 205 on the GPU): a pool about 55, about 35 between, on the GPU column's band-zone hall of 27-29
  for (const h of [24, 28, 30]) {
    const H = inv(h), add = gB * lum(d.colour) * tOf(H), pool = show(H + add), between = show(H + d.base * add), edge = show(H + ss(0, d.feather, d.feather / 3) * add);
    out.push(`${h}: ${pool.toFixed(0)}/${between.toFixed(0)}/${edge.toFixed(0)}`);
    assert.ok(pool >= 46 && pool <= 64, `a pool over a hall of ${h}: ${pool.toFixed(1)}`);
    assert.ok(between - h >= 3 && between <= 42 && pool - between >= 12, `between the pools ${between.toFixed(1)}, under the pool ${pool.toFixed(1)}`);
    assert.ok(edge - h < (pool - h) / 2, `a third into the feather ${edge.toFixed(1)}, under half the lift`);
  }
  console.log('hall: pool/between/feather', out.join(' '));
  for (const k of ['KX_SIGN0', 'KX_LIFT', 'KX_REFLECT']) assert.ok(src.includes(`#if defined( ${k} ) && defined( USE_MAP )\nif ( uWinNight < 1.0 ) {\ntotalEmissiveRadiance += ( 1.0 - uWinNight )`), `${k} by day only`); // re-pinned round 3c: inside the night gate
});

test('A3 round 3b: two small blue signs in the band, by day', () => {
  const defs = interior.defines as Record<string, string>, S = G.signs, d = G.day, src = frag(interior);
  assert.equal(S.boxes.length, 2);
  S.boxes.forEach((b, i) => {
    assert.deepEqual(nums(defs[`KX_SIGN${i}`]), [...b]);
    const [u0, u1, v0, v1] = b as [number, number, number, number];
    assert.ok(u1 > u0 && u1 - u0 <= 0.15 && v1 > v0 && v1 - v0 <= 0.08 && v0 >= d.v[0]! + d.feather && v1 <= d.v[1]! - d.feather, `sign ${i} small, inside the band`);
  });
  assert.ok(S.boxes[0]![1]! < S.boxes[1]![0]!, 'apart');
  assert.ok(src.includes('+ step( KX_SIGN1.x, vMapUv.x ) * step( vMapUv.x, KX_SIGN1.y ) * step( KX_SIGN1.z, vMapUv.y ) * step( vMapUv.y, KX_SIGN1.w ) );'), 'in the shader');
  const c = S.colour;
  assert.ok(c[2]! > 2 * c[1]! && c[1]! > c[0]!, 'blue');
  const sign = show(inv(30) + gL * lum(c));
  assert.ok(sign >= 55 && sign <= 85, `a sign over a hall of 30: ${sign.toFixed(1)}`);
});

test('A3 round 3b: the glass reflects by day, forecourt at the foot to sky under the transom, about +8 to +15 on the fixed panes, half that on the door leaves', () => {
  const d = interior.defines as Record<string, string>, R = G.reflect;
  assert.deepEqual(nums(d.KX_REFLECT), [...R.forecourt]);
  assert.deepEqual(nums(d.KX_REFLECT_SKY), [...R.sky]);
  assert.ok(Number(d.KX_REFLECT_DOOR) === R.door && nums(d.KX_REFLECT_DOORS).join() === R.doors.join(), 'the doors');
  assert.ok(frag(interior).includes('totalEmissiveRadiance += ( 1.0 - uWinNight ) * mix( KX_REFLECT, KX_REFLECT_SKY, clamp( vMapUv.y, 0.0, 1.0 ) )')
    && frag(interior).includes('* mix( 1.0, KX_REFLECT_DOOR, step( KX_REFLECT_DOORS.x, vMapUv.x ) * step( vMapUv.x, KX_REFLECT_DOORS.y ) );'), 'by day only, the doors, in the shader');
  assert.ok(R.sky[2]! > R.sky[0]! && R.forecourt[0]! >= R.forecourt[2]! && lum(R.sky) <= 1.15 * lum(R.forecourt) && lum(R.sky) >= 0.85 * lum(R.forecourt), 'a cool sky over a warmer forecourt, about as bright (round 3c)');
  assert.ok(R.door >= 0.4 && R.door <= 0.6, `the doors at ${R.door}`);
  assert.ok(Math.abs(R.doors[0]! - 0.3) < 1e-9 && Math.abs(R.doors[1]! - 0.7) < 1e-9, 'the doors under the rail');
  const out: string[] = [];
  for (const h of [10, 18, 25]) {
    for (const v of [0, 1]) {
      const base = show(inv(h) + liftAt(v)), pane = show(inv(h) + liftAt(v) + reflAt(v)) - base, door = show(inv(h) + liftAt(v) + R.door * reflAt(v)) - base;
      out.push(`${h}@${v}: +${pane.toFixed(1)}/+${door.toFixed(1)}`);
      assert.ok(pane >= 7.5 && pane <= 12, // re-pinned round 3c: 3b's sky end greyed the transom; +8-12 at both ends
        `a hall of ${h} at v ${v}: the pane +${pane.toFixed(1)}`);
      assert.ok(door >= 0.4 * pane && door <= 0.65 * pane, `the door +${door.toFixed(1)}, about half the pane's +${pane.toFixed(1)}`);
    }
  }
  console.log('hall@v: pane/door', out.join(' '));
});

test('A3 round 3c: at the capture\'s night (2026-11-23T22:00Z) every day term adds exactly nothing: gated off, not multiplied by zero', () => {
  // the GPU (3c score): night porch-close moved by up to 9 levels in a strip of the band. The windows' level there is exactly 1 (atmosphere.ts sets
  // windowNight to the rig's lampLevel, max(lampLevelFor(sun), 0.55 gloom)), so a day term must not run at all: 0 times an undefined value (pow of a
  // negative base, GLSL) is not 0
  const sun = solarPosition(Date.parse('2026-11-23T22:00:00Z')).elevationDeg;
  assert.ok(sun < -40 && lampLevelFor(sun) === 1, `the sun at ${sun.toFixed(1)} deg, the windows' level ${lampLevelFor(sun)}`);
  const src = frag(interior);
  for (const k of ['KX_DAYBAND', 'KX_SIGN0', 'KX_LIFT', 'KX_REFLECT']) {
    const at = src.indexOf(`#if defined( ${k} ) && defined( USE_MAP )\n`);
    assert.ok(at >= 0, `${k} in the shader`);
    const block = src.slice(at, src.indexOf('#endif', at)), body = block.slice(block.indexOf('\n') + 1);
    assert.ok(body.startsWith('if ( uWinNight < 1.0 ) {\n') && body.trimEnd().endsWith('}'), `${k} gated: runs only while uWinNight < 1`);
    assert.ok(!/\bpow\s*\(/.test(body), `${k}: no pow (undefined for a negative base)`);
    assert.equal((body.match(/totalEmissiveRadiance/g) ?? []).length, (body.match(/totalEmissiveRadiance \+= \( 1\.0 - uWinNight \)/g) ?? []).length, `${k}: each add carries (1 - uWinNight)`);
  }
  assert.equal((src.match(/if \( uWinNight < 1\.0 \) \{/g) ?? []).length, 4, 'four gates, one per day term');
});

test('A3 round 3: no new draw or triangle: the infill keeps its eight materials and its triangle count', () => {
  assert.equal(mats.length, 8);
  const n = infill.geometry.getAttribute('position').count / 3;
  // re-pinned 2026-11-26 (front phase 1): 1628 -> 1692. The porch heads rose to near semicircles (SOUTH_FRONT_ARCADES.archRise 3.3), so their fanlight
  // frames are cut in 20 segments (PORCH_FANLIGHT.headSegments, was 12) to stay on the arch line; no part or material was added
  assert.equal(n, 1692, `the infill's triangles: ${n}`);
});
