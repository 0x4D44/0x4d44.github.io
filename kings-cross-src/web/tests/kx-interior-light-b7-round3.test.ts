// Shed interior B7, round 3, re-pinned in round 3b (the round-3 score, HOLD: by day the wall-side floor fell to 0.17 of the sun streaks against R-a's
// 0.7, so the day is back at round 2's values; at night the near floor between lamps went flat and dim at 30-41, and the far floor still read as one
// band). Night now: pools whose gaps sit near 0.3 of the peak and at least 45 near the camera (slab texture and tactile strip legible), and, from
// 20 m out to 50 m from the camera, gaps darkening so a far pool keeps a dark band either side of it on the few screen rows it covers. Day: round 2's
// crown-to-wall share held (full under the crown, about 0.6 by the wall). Through kx-shed-pools.ts's CPU model (round 1's test holds the shader to it)
// and three's ACES curve, the base and albedo fitted to the lead's round-1b capture.
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
const night = (x: number, z: number, dist = 0) => { const f = shedFloorLight(layout, heads, x, z, dist); return screen(BASE * f.night + f.pool * ALBEDO * TINT); };

test('B7 round 3b night: along every shed row the floor rises and falls once a lamp, its gaps near 0.3 of the peaks and at least 45 near the camera, darker far off', () => {
  let rowsSeen = 0;
  const lamps: [number, number][] = [];
  for (let i = 0; i < heads.length; i += 3) lamps.push([heads[i]!, heads[i + 2]!]);
  const byU = new Map<number, [number, number][]>();
  for (const p of lamps) { const u = Math.round(((p[0] - layout.origin[0]) * Math.cos(layout.heading) + (p[1] - layout.origin[1]) * Math.sin(layout.heading)) * 2) / 2; byU.set(u, [...(byU.get(u) ?? []), p]); }
  for (const row of byU.values()) {
    if (row.length < 6) continue;
    rowsSeen++;
    row.sort((a, b) => (b[0] - a[0]) * Math.sin(layout.heading) - (b[1] - a[1]) * Math.cos(layout.heading));
    for (let k = 0; k + 1 < row.length; k++) {
      const [p, q] = [row[k]!, row[k + 1]!], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d > 13) continue; // a zig-zag row's lamps 24.4 m apart (platforms 4/5): its gap is the spill alone, held below
      const mid: [number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const peak = Math.min(night(...p), night(...q)), gap = night(...mid);
      assert.ok(Math.max(night(...p), night(...q)) < 200, 'no floor pixel near clipping');
      assert.ok(peak >= 140, `a pool at least 140 (${peak.toFixed(1)})`);
      assert.ok(gap >= 0.25 * peak && gap <= 0.35 * peak, `the gap near 0.3 of its pools (${gap.toFixed(1)} against ${peak.toFixed(1)})`);
      assert.ok(gap >= 45, `the near gap at least 45 (${gap.toFixed(1)}): the slab texture and the tactile strip read`);
      const three = night(p[0] + (q[0] - p[0]) * 3 / d, p[1] + (q[1] - p[1]) * 3 / d);
      assert.ok(three <= 0.4 * night(...p), `3 m out ${three.toFixed(1)}: a narrow pool`);
      // but not a spot: 2 m out still over half the peak, so a pool 40-60 m off covers a few screen rows (sigma 1.0 fell under it)
      const two = night(p[0] + (q[0] - p[0]) * 2 / d, p[1] + (q[1] - p[1]) * 2 / d);
      assert.ok(two >= 0.5 * night(...p), `2 m out ${two.toFixed(1)}`);
      // seen from 50 m and more, the gap is darker (a far pool keeps a dark band either side) and the pool itself all but unchanged
      const farGap = night(...mid, 60), farPeak = night(...p, 60);
      assert.ok(farPeak >= 0.95 * night(...p) && farPeak <= night(...p), `the far pool nearly as bright (${farPeak.toFixed(1)}): only its spill goes`);
      assert.ok(farGap <= 0.75 * gap && farGap >= 25, `the far gap ${farGap.toFixed(1)} against the near ${gap.toFixed(1)}`);
      assert.ok(Math.abs(night(...mid, 15) - gap) < 1e-9, 'within 20 m the gap is as near');
    }
  }
  assert.ok(rowsSeen >= 3, `${rowsSeen} straight rows walked`);
});

test('B7 round 3b day: round 2\'s crown-to-wall share kept (the round-3 0.35 went the wrong way against R-a)', () => {
  for (const v of [40, 100, 180]) for (const [axis, side] of [[layout.spine - R, -1], [layout.spine + R, 1]] as const) {
    const at = (off: number) => shedFloorLight(layout, heads, ...shedToWorld(layout, axis + side * off, v)).day;
    assert.ok(Math.abs(at(0) - 1) < 1e-9 && at(0.34 * R) > 0.999, 'full under the crown');
    assert.ok(at(R - 1.5) >= 0.57 && at(R - 1.5) <= 0.66, `1.5 m from the wall: ${at(R - 1.5).toFixed(3)}`);
    assert.ok(at(R - 3.5) >= 0.6 && at(R - 3.5) <= 0.8, `3.5 m from the wall, on the ramp: ${at(R - 3.5).toFixed(3)}`);
  }
});
