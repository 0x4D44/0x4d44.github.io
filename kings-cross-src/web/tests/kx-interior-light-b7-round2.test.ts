// Shed interior B7, round 2 (b7-round-1-score, section 5: at platform-eye the pools read as one soft swell; by day the crown-to-wall contrast is
// too mild). Night: distinct pools lamp to lamp, the floor midway between two lamps of a row at most 60% of a pool's peak on the screen but not
// black; day: the floor by a vault wall at about 0.6 of the floor under the crown. Through kx-shed-pools.ts's CPU model (round 1's test holds the
// shader to that model) and three's ACES curve at the night exposure, with the base and albedo fitted to the lead's capture of round 1b.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding } from '../../core/station.ts';
import { furniturePlan } from '../src/furniture.ts';
import { SHED_POOL, shedFloorLight } from '../src/kx-shed-pools.ts';
import { nightLightSites } from '../src/night.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const heads = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts }).shed;
const R = SHED_SPAN_WIDTH / 2;
const BASE = 0.006; // the floor's moonlight (direct and indirect) at a moon share of 0.5, fitted to the round-1b capture
const ALBEDO = 0.15, TINT = (() => { const c = new THREE.Color(SHED_POOL.tint); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; })();
function screen(l: number): number {
  const v = l * 2.3 / 0.6, a = Math.min(1, Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)));
  return 255 * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}
/** The floor on the screen at night, `t` metres along a shed row from a lamp toward its neighbour 12.2 m on, for every such pair of lamps. */
function rows(): { lamp: [number, number]; dir: [number, number] }[] {
  const out: { lamp: [number, number]; dir: [number, number] }[] = [];
  for (let i = 0; i < heads.length; i += 3) for (let j = 0; j < heads.length; j += 3) {
    const d = Math.hypot(heads[j]! - heads[i]!, heads[j + 2]! - heads[i + 2]!);
    if (j !== i && d > 11.5 && d < 13) out.push({ lamp: [heads[i]!, heads[i + 2]!], dir: [(heads[j]! - heads[i]!) / d, (heads[j + 2]! - heads[i + 2]!) / d] });
  }
  return out;
}
const night = (x: number, z: number) => { const f = shedFloorLight(layout, heads, x, z); return screen(BASE * f.night + f.pool * ALBEDO * TINT); };

test('B7 round 2 night: distinct pools, the floor midway between lamps at most 60% of the peak on the screen and not black, the peak unclipped', () => {
  const pairs = rows();
  assert.ok(pairs.length > 40, `${pairs.length} lamp pairs along the rows`);
  for (const { lamp: [x, z], dir: [dx, dz] } of pairs) {
    const at = (t: number) => night(x + dx * t, z + dz * t);
    const peak = at(0), mid = at(6.1);
    assert.ok(peak >= 150 && peak <= 182, `peak ${peak.toFixed(1)} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
    assert.ok(mid >= 45 && mid <= 0.6 * peak, `midway ${mid.toFixed(1)} against peak ${peak.toFixed(1)}`);
    // a pool, not a swell: by 3 m out the floor is already under 60% of the peak, and it falls all the way to the midway point
    assert.ok(at(3) <= 0.6 * peak && at(3) >= mid, `3 m out ${at(3).toFixed(1)}`);
    assert.ok(at(1) >= 0.85 * peak, `1 m out ${at(1).toFixed(1)}: the pool's own width`);
  }
});

test('B7 round 2 day: the floor by a vault wall at about 0.6 of the floor under the crown', () => {
  for (const v of [40, 100, 180]) {
    const crown = shedFloorLight(layout, heads, ...shedToWorld(layout, layout.spine - R, v)).day;
    const wall = shedFloorLight(layout, heads, ...shedToWorld(layout, layout.spine - 2 * R + 1.5, v)).day;
    const east = shedFloorLight(layout, heads, ...shedToWorld(layout, layout.spine + 2 * R - 1.5, v)).day;
    assert.ok(Math.abs(crown - 1) < 1e-9, `under the crown ${crown}`);
    for (const k of [wall, east]) assert.ok(k >= 0.57 && k <= 0.66, `by the wall ${k.toFixed(3)} at v ${v}`);
  }
});
