// Shed interior B7, night pools (the b6-round-2 score, section 5): (1) along platform 4's centreline in platform-eye the pool under each lamp
// was only about 1.3x the floor midway, as the 4/5 island's row zig-zagged across the spine and put a lamp over platform 4 only every 24.4 m;
// (3) shed-interior's near platform, at platform 4's open north tip, sat at a flat 21-29 with no standard within 30 m of the camera. Through
// kx-shed-pools.ts's CPU model and three's ACES curve, the base and albedo as round 3's test (fitted to the lead's round-1b capture).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, pointInPolygon, shedLayout, shedToWorld, stationBuilding, stationPlatforms, uRangeAtV, worldToShed } from '../../core/station.ts';
import { furniturePlan } from '../src/furniture.ts';
import { SHED_POOL, shedFloorLight } from '../src/kx-shed-pools.ts';
import { nightLightSites } from '../src/night.ts';
// @ts-expect-error the evidence tool is plain JavaScript
import { stationCameras } from '../../tools/evidence.mjs';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const sites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts });
const heads = sites.shed;
const p4 = stationPlatforms(data).get('4')!.pts;
const BASE = 0.006, ALBEDO = 0.15, TINT = (() => { const c = new THREE.Color(SHED_POOL.tint); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; })();
function screen(l: number, exposure = 2.3): number {
  const v = l * exposure / 0.6, a = Math.min(1, Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)));
  return 255 * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}
const night = (u: number, v: number, dist = 0) => { const [x, z] = shedToWorld(layout, u, v); const f = shedFloorLight(layout, heads, x, z, dist); return screen(BASE * f.night + f.pool * ALBEDO * TINT); };
type Cam = { pos: number[]; target: number[]; fov?: number };
const cams = stationCameras() as Record<string, Cam>;
function inFrame(cam: Cam, p: [number, number, number]): boolean {
  const c = new THREE.PerspectiveCamera(cam.fov ?? 50, 1.6, 0.1, 20000);
  c.position.set(...(cam.pos as [number, number, number])); c.lookAt(...(cam.target as [number, number, number])); c.updateMatrixWorld(true);
  const s = new THREE.Vector3(...p).project(c);
  return s.z < 1 && Math.abs(s.x) < 0.95 && Math.abs(s.y) < 0.95;
}

test('B7 night: along platform 4\'s centreline in platform-eye and -south, a pool every 12.2 m at least 2.5x the floor midway, falling off over 4-6 m, under clipping', () => {
  for (const name of ['platform-eye', 'platform-eye-south']) {
    const cam = cams[name]!, eye = worldToShed(layout, [cam.pos[0]!, cam.pos[2]!]), aim = worldToShed(layout, [cam.target[0]!, cam.target[2]!]);
    const dir = Math.sign(aim.v - eye.v), centre = (v: number) => { const r = uRangeAtV(layout, p4, v)!; return (r[0] + r[1]) / 2; };
    // the lamps over platform 4's centreline ahead of the camera, out to 40 m (the scorer's near 20-30 m and more)
    const ahead: number[] = [];
    for (let i = 0; i < heads.length; i += 3) {
      const { u, v } = worldToShed(layout, [heads[i]!, heads[i + 2]!]), d = (v - eye.v) * dir;
      if (d > 0 && d < 40 && Math.abs(u - centre(v)) < 1) ahead.push(v);
    }
    ahead.sort((a, b) => (a - b) * dir);
    assert.ok(ahead.length >= 3, `${name}: ${ahead.length} lamps over platform 4 within 40 m ahead`);
    assert.ok(Math.abs(ahead[0]! - eye.v) <= 12.2, `${name}: the nearest pool ${Math.abs(ahead[0]! - eye.v).toFixed(1)} m ahead`);
    for (const v of ahead) assert.ok(inFrame(cam, [...(([x, z]) => [x, PLATFORM_HEIGHT, z])(shedToWorld(layout, centre(v), v))] as [number, number, number]) || Math.abs(v - eye.v) < 6, `${name}: the pool at v ${v.toFixed(1)} is in the frame`);
    for (let k = 0; k + 1 < ahead.length; k++) {
      const [a, b] = [ahead[k]!, ahead[k + 1]!], mid = (a + b) / 2;
      assert.ok(Math.abs(b - a) < 13, `${name}: pools ${Math.abs(b - a).toFixed(1)} m apart along platform 4 (24.4 m when the row zig-zagged)`);
      const dist = (v: number) => Math.abs(v - eye.v);
      const peak = Math.min(night(centre(a), a, dist(a)), night(centre(b), b, dist(b))), gap = night(centre(mid), mid, dist(mid));
      assert.ok(peak >= 2.5 * gap, `${name}: pool ${peak.toFixed(1)} against the floor midway ${gap.toFixed(1)} (${(peak / gap).toFixed(2)}x)`);
      assert.ok(Math.max(night(centre(a), a), night(centre(b), b)) < 200, 'no floor pixel near clipping');
      // the fall-off: by 3 m out under half the pool's rise over the gap, by 5 m all but down to the gap
      const at = (off: number) => night(centre(a + off * Math.sign(b - a)), a + off * Math.sign(b - a), dist(a));
      const top = night(centre(a), a, dist(a));
      assert.ok(at(3) - gap <= 0.5 * (top - gap), `${name}: 3 m out ${at(3).toFixed(1)} (pool ${top.toFixed(1)}, gap ${gap.toFixed(1)})`);
      assert.ok(at(5) - gap <= 0.1 * (top - gap), `${name}: 5 m out ${at(5).toFixed(1)}`);
    }
  }
});

test('B7 night: no shed row leaves a 24.4 m gap; every vault platform\'s row has a lamp every 12.2 m', () => {
  const byU = new Map<number, number[]>();
  for (let i = 0; i < heads.length; i += 3) { const { u, v } = worldToShed(layout, [heads[i]!, heads[i + 2]!]); const k = Math.round(u * 2) / 2; byU.set(k, [...(byU.get(k) ?? []), v]); }
  let rows = 0;
  for (const [u, vs] of byU) {
    if (vs.length < 6) continue;
    rows++;
    vs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < vs.length; k++) assert.ok(vs[k + 1]! - vs[k]! < 13, `row at u ${u}: lamps at v ${vs[k]!.toFixed(1)} and ${vs[k + 1]!.toFixed(1)}`);
  }
  assert.ok(rows >= 6, `${rows} rows`);
});

test('B7 night: shed-interior\'s near platform (platform 4\'s open north tip) has a standard whose pool reaches the floor in front of the camera', () => {
  const cam = cams['shed-interior']!, eye: [number, number] = [cam.pos[0]!, cam.pos[2]!];
  const all: [number, number][] = [];
  for (const flat of [sites.platform, sites.shed]) for (let i = 0; i < flat.length; i += 3) all.push([flat[i]!, flat[i + 2]!]);
  const near = all.filter((p) => pointInPolygon(p, p4) && Math.hypot(p[0] - eye[0], p[1] - eye[1]) < 15);
  assert.equal(near.length, 1, 'one standard on platform 4 within 15 m of the camera (the nearest was 30 m off)');
  const lamp = near[0]!;
  assert.ok(inFrame(cam, [lamp[0], PLATFORM_HEIGHT, lamp[1]]), 'its foot is in the frame');
  // its pool's radius by the platform lamps' rule (station-lamps.ts createPlatformLamps: 0.6 x the spacing to its nearest neighbour, at most 10 m)
  const spacing = Math.min(...all.map((q) => Math.hypot(q[0] - lamp[0], q[1] - lamp[1])).filter((d) => d > 3));
  const reach = Math.min(10, 0.6 * spacing), d = Math.hypot(lamp[0] - eye[0], lamp[1] - eye[1]);
  assert.ok(d - reach <= 6, `the pool (radius ${reach.toFixed(1)} m, ${d.toFixed(1)} m off) reaches within 6 m of the camera, where the frame's floor starts`);
});
