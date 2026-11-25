// Shed interior B7, round 3 (the round-2 score: at night p8-south shows one wide gap and then a rising band, the far pools merge; by day the floor
// by the vault wall reads about 0.85 of the floor under the crown, where R-a wants about 0.45-0.5). Night: walking a whole shed row, the floor on
// the screen rises and falls once a lamp, every trough under a quarter of its peaks and not black; day: the floor's light is full within a quarter of
// a radius of the crown's axis and at about 0.35 of it (linear; about 0.5 on the screen at the day exposure) from 0.8 of the radius out, so a
// platform a few metres from the wall is in the dark band, not on the ramp. Through kx-shed-pools.ts's CPU model (round 1's test holds the shader to
// it) and three's ACES curve, the base and albedo fitted to the lead's round-1b capture.
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
const BASE = 0.006, ALBEDO = 0.15, TINT = (() => { const c = new THREE.Color(SHED_POOL.tint); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; })();
function screen(l: number, exposure = 2.3): number {
  const v = l * exposure / 0.6, a = Math.min(1, Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)));
  return 255 * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}
const night = (x: number, z: number) => { const f = shedFloorLight(layout, heads, x, z); return screen(BASE * f.night + f.pool * ALBEDO * TINT); };

test('B7 round 3 night: along a whole shed row the floor rises and falls once a lamp, its troughs under a quarter of its peaks and not black', () => {
  // the row over platform 8 (the west vault's westmost island): its lamps in order along the shed
  let rowsSeen = 0;
  const lamps: [number, number][] = [];
  for (let i = 0; i < heads.length; i += 3) lamps.push([heads[i]!, heads[i + 2]!]);
  const byU = new Map<number, [number, number][]>();
  for (const p of lamps) { const u = Math.round(((p[0] - layout.origin[0]) * Math.cos(layout.heading) + (p[1] - layout.origin[1]) * Math.sin(layout.heading)) * 2) / 2; byU.set(u, [...(byU.get(u) ?? []), p]); }
  for (const row of byU.values()) {
    if (row.length < 6) continue;
    rowsSeen++;
    row.sort((a, b) => (b[0] - a[0]) * Math.sin(layout.heading) - (b[1] - a[1]) * Math.cos(layout.heading));
    // the floor under each lamp and midway to the next, in order: once a lamp it rises to a pool and falls to a gap
    for (let k = 0; k + 1 < row.length; k++) {
      const [p, q] = [row[k]!, row[k + 1]!], peak = Math.min(night(...p), night(...q)), gap = night((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      assert.ok(Math.max(night(...p), night(...q)) < 200, 'no floor pixel near clipping');
      assert.ok(peak >= 140, `a pool at least 140 (${peak.toFixed(1)})`);
      assert.ok(gap <= 0.25 * peak, `the gap under a quarter of its pools (${gap.toFixed(1)} against ${peak.toFixed(1)})`);
      assert.ok(gap >= 25, `the gap not black (${gap.toFixed(1)}): the slab texture and the yellow line read in it`);
      // and it falls all the way: 3 m out of the pool already under half of it
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]), three = night(p[0] + (q[0] - p[0]) * 3 / d, p[1] + (q[1] - p[1]) * 3 / d);
      assert.ok(three <= 0.5 * night(...p), `3 m out ${three.toFixed(1)}`);
    }
  }
  assert.ok(rowsSeen >= 3, `${rowsSeen} straight rows walked`);
});

test('B7 round 3 day: full under the crown out to a quarter radius, about 0.35 from 0.8 of the radius to the wall', () => {
  for (const v of [40, 100, 180]) for (const [axis, side] of [[layout.spine - R, -1], [layout.spine + R, 1]] as const) {
    const at = (off: number) => shedFloorLight(layout, heads, ...shedToWorld(layout, axis + side * off, v)).day;
    assert.ok(Math.abs(at(0) - 1) < 1e-9 && Math.abs(at(0.24 * R) - 1) < 1e-9, 'full under the crown');
    for (const off of [0.82 * R, R - 3.5, R - 1.5]) assert.ok(at(off) >= 0.32 && at(off) <= 0.38, `${(R - off).toFixed(1)} m from the wall: ${at(off).toFixed(3)}`);
    assert.ok(at(0.5 * R) > 0.5 && at(0.5 * R) < 0.9, `the ramp between: ${at(0.5 * R).toFixed(3)}`);
    // on the screen at the day exposure, from a crown floor at 133 (the round-1 score's platform-eye row 700)
    const crownL = (() => { let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (screen(m, 1.25) < 133) lo = m; else hi = m; } return lo; })();
    const ratio = screen(crownL * at(R - 3.5), 1.25) / 133;
    assert.ok(ratio >= 0.42 && ratio <= 0.55, `by the wall on the screen ${ratio.toFixed(3)} of the crown's`);
  }
});
