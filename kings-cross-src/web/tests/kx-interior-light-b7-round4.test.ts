// Shed interior B7, round 4, re-pinned in round 4b (the round-4 score, HOLD: in R-a the platform floor, about 95, is darker than the sunlit brick
// arcade, 177-189; round 4's day gain on the floor, 1.6 on sun and shade alike, put the floor at 150-166 over walls at 90-115, washed out
// platform-furniture and left the yellow line 1-2 levels over the slab). Now: no floor gain (the floor by day as before round 4), and the sun on the
// walls instead: inside the shed's vaults by day, on a face that stands up (a wall, a pier, an arcade face, a train's side), the direct light, the sun
// through the crown with the ribs' shadows across it, is taken SHED_WALL_SUN's gain, so the sunlit brick reads brighter than the floor; a floor (a face
// looking up) keeps its light, and the night, the outside and every other scene are untouched.
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
import * as lighting from '../src/lighting.ts';
import { buildShed } from '../src/shed.ts';
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

const L = lighting as unknown as Record<string, unknown>;
const P = pools as unknown as Record<string, unknown>;
/** sRGB 0-255 on the screen of a linear luminance through three's ACES curve (a grey) at the clear day's exposure (core/daylight.ts DAY_EXPOSURE). */
function screenDay(l: number): number {
  const v = l * 1.25 / 0.6, a = Math.min(1, Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)));
  return 255 * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}
function linearOf(s: number): number { let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (screenDay(m) < s) lo = m; else hi = m; } return lo; }

test('B7 round 4b floor: no day gain on the floor (round 4\'s 1.6 is gone), the crown-to-wall share kept, the night as before', () => {
  assert.ok(P.SHED_DAY_FLOOR === undefined, 'SHED_DAY_FLOOR is gone');
  assert.ok(!('dayGain' in shedFloorLight(layout, heads, 0, 0)), 'the CPU model has no day gain');
  const [cx, cz] = shedToWorld(layout, layout.spine - R, 100), [wx, wz] = shedToWorld(layout, layout.spine - 2 * R + 1.5, 100);
  const crown = shade(cx, cz, 0, 1), wall = shade(wx, wz, 0, 1);
  assert.ok(Math.abs(crown.indirect[1]! - BASE[1]!) < 1e-6 && Math.abs(crown.direct[1]! - BASE[1]!) < 1e-6, 'under the crown the floor\'s light as it was');
  const share = wall.indirect[1]! / crown.indirect[1]!;
  assert.ok(share >= 0.57 && share <= 0.68, `by the wall ${share.toFixed(3)} of the crown's (round 2's share)`);
  const night = shade(cx, cz, 1, 0);
  assert.ok(Math.abs(night.indirect[1]! - BASE[1]! * SHED_POOL.moon) < 1e-9, 'night as before');
});

const shed = buildShed(layout); // tells the shaders where the shed stands
shed.updateMatrixWorld(true);
const uniforms = lighting.roofShadeUniforms as unknown as Record<string, THREE.IUniform>;
const fakeRenderer = (): THREE.WebGLRenderer => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }) as unknown as THREE.WebGLRenderer;
const wallAt = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, y, z]; };
/** The direct light's factor SHED_WALL_SUN_GLSL leaves on a face of world normal `n` at world point `p`, seen from 6 m off along the normal. */
function wallSun(p: [number, number, number], n: [number, number, number]): number {
  const src = L.SHED_WALL_SUN_GLSL as string | undefined;
  assert.ok(src, 'SHED_WALL_SUN_GLSL is exported');
  const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
  cam.position.set(p[0] + 6 * n[0] + 0.3, p[1] + 6 * n[1] + 0.4, p[2] + 6 * n[2] + 0.2);
  cam.lookAt(...p);
  cam.updateMatrixWorld(true);
  const view = new THREE.Vector3(...p).applyMatrix4(cam.matrixWorldInverse).negate();
  const normal = new THREE.Vector3(...n).transformDirection(cam.matrixWorldInverse);
  const vars: Record<string, Value> = { ...Object.fromEntries(Object.entries(uniforms).map(([k, u]) => [k, toValue(u.value)])),
    viewMatrix: toValue(cam.matrixWorldInverse), cameraPosition: toValue(cam.position), vViewPosition: [view.x, view.y, view.z], normal: [normal.x, normal.y, normal.z], rlDirect: [1, 1, 1], rlIndirect: [1, 1, 1] };
  new Glsl(lighting.SHED_GLASS_GLSL).snippet(src!.replaceAll('reflectedLight.directDiffuse', 'rlDirect').replaceAll('reflectedLight.indirectDiffuse', 'rlIndirect'))({ vars, fns: {} });
  assert.deepEqual(vars.rlIndirect, [1, 1, 1], 'the sky\'s light is left as it was: the band is the sun\'s');
  return (vars.rlDirect as number[])[1]!;
}

test('B7 round 4b walls: by day in the vaults a standing face\'s sun is taken SHED_WALL_SUN\'s gain; a floor, the outside, the roof above the springing and the night keep theirs', () => {
  const g = (L.SHED_WALL_SUN as { gain: number } | undefined)?.gain;
  assert.ok(g !== undefined && g >= 2.2 && g <= 2.6, `SHED_WALL_SUN.gain ${g}`);
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  const west: [number, number, number] = [Math.cos(layout.heading), 0, Math.sin(layout.heading)]; // +u, the west wall's inner face looks east (into the shed)
  const eastFace = (u: number, v: number, y: number) => wallSun(wallAt(u, v, y), west);
  assert.ok(Math.abs(eastFace(layout.spine - 2 * R + 0.02, 120, 3) - g!) < 1e-6, 'the west wall\'s inner face, 3 m up');
  assert.ok(Math.abs(wallSun(wallAt(layout.spine + 2 * R - 0.02, 150, 2), [-west[0], 0, -west[2]]) - g!) < 1e-6, 'the east arcade\'s inner face');
  assert.ok(Math.abs(wallSun(wallAt(layout.spine - R, 100, 1.6), [0, 0, 1]) - g!) < 1e-6, 'a train\'s or a pier\'s side across the shed');
  assert.equal(wallSun(wallAt(layout.spine - R, 100, 0.9), [0, 1, 0]), 1, 'the platform (a face looking up)');
  assert.equal(wallSun(wallAt(layout.spine - 2 * R - 0.6, 120, 3), [-west[0], 0, -west[2]]), 1, 'the wall\'s outer face, outside');
  assert.equal(wallSun(wallAt(layout.spine - R, 100, layout.crown - 1), west), 1, 'up in the vault, over the springing');
  const tilted = wallSun(wallAt(layout.spine - R, 100, 1.6), [0, Math.SQRT1_2, Math.SQRT1_2]);
  assert.ok(tilted > 1 && tilted < g!, `a face at 45 degrees takes part of it: ${tilted.toFixed(3)}`);
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0, false as never);
  assert.equal(eastFace(layout.spine - 2 * R + 0.02, 120, 3), 1, 'under the moon');
  lighting.grade(fakeRenderer(), true, 1, 0, 0);
  assert.equal(eastFace(layout.spine - 2 * R + 0.02, 120, 3), 1, 'Waverley, Perth (no hemisphere given)');
  // in every roof-shaded Lambert program once, after the roof's shade
  const m = new THREE.MeshLambertMaterial();
  lighting.addRoofShade(m);
  const sh = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(sh as never, undefined as never);
  const f = sh.fragmentShader, src = L.SHED_WALL_SUN_GLSL as string;
  assert.equal(f.split(src).length - 1, 1, 'once');
  assert.ok(f.indexOf(src) > f.indexOf('reflectedLight.directDiffuse *= roofK.a;'), 'after the roof\'s shade');
});

test('B7 round 4b on the screen: sunlit brick (105) lifted 40-60 levels over the floor\'s sun (110-135), pale stone in sun (200) under 250', () => {
  const g = (L.SHED_WALL_SUN as { gain: number } | undefined)?.gain ?? 1;
  const SUN_SHARE = 0.8; // the sun's share of a sunlit wall's light (ASSUMED: the sun 1.7 against the hemisphere and the fills under the roof)
  const at = (s: number) => screenDay(linearOf(s) * (1 - SUN_SHARE + SUN_SHARE * g));
  assert.ok(at(105) - 105 >= 40 && at(105) - 105 <= 70, `sunlit brick 105 -> ${at(105).toFixed(1)}`);
  assert.ok(at(105) > 135, 'brighter than the floor in sun (110-135, R-a: the floor under the sunlit brick)');
  assert.ok(at(200) < 250, `pale stone 200 -> ${at(200).toFixed(1)}`);
});
