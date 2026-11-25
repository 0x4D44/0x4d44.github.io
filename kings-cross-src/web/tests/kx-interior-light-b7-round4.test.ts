// Shed interior B7, round 4 (the round-3/3b scores: by day R-a's shaded platform is pale grey at about 0.7 of the sunlit surfaces and the sun's
// patches are bright; the model's floor reads its shade at about 0.3 of its streaks, which peak near 196). The floor inside the shed takes a day gain
// (SHED_DAY_FLOOR) on all its light, sun and shade alike: the shoulder of the tone curve takes the streaks up less than the shade, so the streaks
// brighten without clipping and the shade rises toward them. The crown-to-wall share (SHED_CROWN_FLOOR, round 2's) is untouched, and the night is
// exactly as it was. The shader's block is run (tests/glsl.ts) against the baked map, as round 1's test does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding } from '../../core/station.ts';
import { furniturePlan } from '../src/furniture.ts';
import * as pools from '../src/kx-shed-pools.ts';
import { bakeShedFloor, SHED_POOL, shedFloorGlsl, shedFloorLight } from '../src/kx-shed-pools.ts';
import { nightLightSites } from '../src/night.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Value } from './glsl.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const SITES = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts });
const heads = SITES.shed;
const floor = bakeShedFloor(layout, heads);
const R = SHED_SPAN_WIDTH / 2;

/** A bilinear read of the baked map (clamped to its edge, as a LinearFilter, clamp-to-edge texture does). */
function sample(uv: number[]): number[] {
  const { data: px, width: w, height: h } = floor.map.image as { data: Uint8Array; width: number; height: number };
  const fx = Math.min(w - 1, Math.max(0, uv[0]! * w - 0.5)), fy = Math.min(h - 1, Math.max(0, uv[1]! * h - 0.5));
  const i0 = Math.floor(fx), j0 = Math.floor(fy), i1 = Math.min(w - 1, i0 + 1), j1 = Math.min(h - 1, j0 + 1), tx = fx - i0, ty = fy - j0;
  const at = (i: number, j: number, c: number) => px[(j * w + i) * 4 + c]! / 255;
  return [0, 1, 2, 3].map((c) => (at(i0, j0, c) * (1 - tx) + at(i1, j0, c) * tx) * (1 - ty) + (at(i0, j1, c) * (1 - tx) + at(i1, j1, c) * tx) * ty);
}

// Round 1b: fitted to the lead's GPU capture of round 1 (night platform-eye-p8-south, the centreline at 146-152 under a lamp and 103-116 midway): the
// floor's light under the moon, each of direct and indirect, at the round-1 moon share (0.5) about 0.003, and the albedo that puts its lamp light at
// 0.125 of the gain per unit of pool, 0.15 (times the tint's luminance, 0.82)
const BASE = [0.003, 0.003, 0.0035];
const ALBEDO = [0.15, 0.15, 0.15, 1];
const block = shedFloorGlsl().replaceAll('reflectedLight.directDiffuse', 'rlDirect').replaceAll('reflectedLight.indirectDiffuse', 'rlIndirect');
const run = new Glsl('uniform vec4 uShedFloorRect;').snippet(block);

/** The floor's outgoing light at (x, z) as the patched shader works it out: night and day are the levels of uShedFloorNight and uShedFloorDay. */
function shade(x: number, z: number, night: number, day: number, albedo = ALBEDO, back = 1): { out: number[]; emissive: number[]; direct: number[]; indirect: number[] } {
  const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
  cam.position.set(x - 5 * back, PLATFORM_HEIGHT + 1.7, z + 3 * back);
  cam.lookAt(x, PLATFORM_HEIGHT, z);
  cam.updateMatrixWorld(true);
  const v = new THREE.Vector3(x, PLATFORM_HEIGHT, z).applyMatrix4(cam.matrixWorldInverse).negate();
  const vars: Record<string, Value> = {
    uShedFloorRect: [floor.rect.x, floor.rect.y, floor.rect.z, floor.rect.w], uShedFloorMap: toValue(floor.map), uShedFloorNight: night, uShedFloorDay: day,
    viewMatrix: toValue(cam.matrixWorldInverse), cameraPosition: toValue(cam.position), vViewPosition: [v.x, v.y, v.z],
    rlDirect: [...BASE], rlIndirect: [...BASE], totalEmissiveRadiance: [0, 0, 0], diffuseColor: [...albedo],
  };
  run({ vars, fns: { texture2D: (_s: Value, uv: Value) => sample(uv as number[]) } });
  const d = vars.rlDirect as number[], i = vars.rlIndirect as number[], e = vars.totalEmissiveRadiance as number[];
  return { out: [0, 1, 2].map((c) => d[c]! + i[c]! + e[c]!), emissive: e, direct: d, indirect: i };
}

const P = pools as unknown as Record<string, unknown>;
/** sRGB 0-255 on the screen of a linear luminance through three's ACES curve (a grey) at the clear day's exposure (core/daylight.ts DAY_EXPOSURE). */
function screenDay(l: number): number {
  const v = l * 1.25 / 0.6, a = Math.min(1, Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)));
  return 255 * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}
function linearOf(s: number): number { let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (screenDay(m) < s) lo = m; else hi = m; } return lo; }

test('B7 round 4 day: the floor in the shed takes a day gain on sun and shade alike, under the crown and by the wall, the crown-to-wall share kept', () => {
  const g = (P.SHED_DAY_FLOOR as { gain: number } | undefined)?.gain;
  assert.ok(g !== undefined && g >= 1.5 && g <= 1.7, `SHED_DAY_FLOOR.gain ${g}`);
  const [cx, cz] = shedToWorld(layout, layout.spine - R, 100), [wx, wz] = shedToWorld(layout, layout.spine - 2 * R + 1.5, 100);
  const crown = shade(cx, cz, 0, 1), wall = shade(wx, wz, 0, 1);
  for (const [term, c] of [['direct', crown.direct], ['indirect', crown.indirect]] as const) assert.ok(Math.abs(c[1]! / BASE[1]! - g!) < 1e-4, `under the crown, the ${term} light times ${g}: ${(c[1]! / BASE[1]!).toFixed(4)}`);
  const share = wall.indirect[1]! / crown.indirect[1]!;
  assert.ok(share >= 0.57 && share <= 0.68, `by the wall ${share.toFixed(3)} of the crown's (round 2's share)`);
  assert.ok(Math.abs(shedFloorLight(layout, heads, cx, cz).dayGain - g!) < 1e-9 && Math.abs(shedFloorLight(layout, heads, wx, wz).dayGain - g!) < 1e-9, 'the CPU model agrees');
  // outside the shed (north of it) and by night the floor is exactly as before
  const [ox, oz] = shedToWorld(layout, layout.spine - R, layout.length + 20);
  assert.deepEqual(shade(ox, oz, 0, 1).indirect, BASE, 'north of the shed by day');
  assert.equal(shedFloorLight(layout, heads, ox, oz).dayGain, 1, 'the CPU model outside');
  const night = shade(cx, cz, 1, 0);
  assert.ok(Math.abs(night.indirect[1]! - BASE[1]! * SHED_POOL.moon) < 1e-9 && Math.abs(night.direct[1]! - BASE[1]! * SHED_POOL.moon) < 1e-9, 'night as before');
});

test('B7 round 4 day on the screen: the streaks (196) brighter and unclipped, the white coping (240) under 250, the shade (60) lifted toward the sun', () => {
  const g = (P.SHED_DAY_FLOOR as { gain: number } | undefined)?.gain ?? 1;
  const at = (s: number) => screenDay(linearOf(s) * g);
  assert.ok(at(196) >= 212 && at(196) <= 228, `a streak 196 -> ${at(196).toFixed(1)}`);
  assert.ok(at(240) < 250, `the coping in sun 240 -> ${at(240).toFixed(1)}`);
  assert.ok(at(60) >= 80, `the shade 60 -> ${at(60).toFixed(1)}`);
  assert.ok(at(60) / at(196) >= 0.37, `shade over sun on the screen ${(at(60) / at(196)).toFixed(3)} (was ${(60 / 196).toFixed(3)}; R-a about 0.7)`);
});
