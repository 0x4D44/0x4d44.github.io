// Shed interior B7, night pools (b7-night-pools-round-1 score, section 5): the lamp standards on the open-air platform ends (platform 4's
// north tip and the rest outside the shed) lit the paving with the shared pool decal in the LED-4000 legacy colour, a cool grey (about
// sRGB 110,113,118 at the tip) beside the shed's warm-white floor pools (about 173,157,131). Every KX platform standard's pool decal now
// takes the shed floor's own tint (SHED_POOL.tint) at the same 0.2 ceiling, so the two read as one warm white.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { furniturePlan } from '../src/furniture.ts';
import { SHED_POOL, shedFloorInside } from '../src/kx-shed-pools.ts';
import { nightLightSites } from '../src/night.ts';
import { createPlatformLamps } from '../src/station-lamps.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const SITES = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, data, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts });

test('B7 night: every KX platform standard outside the shed lights its pool in the shed floor\'s warm white, within 0.01 of each channel share', () => {
  const n = SITES.platform.length / 3;
  const lamps = createPlatformLamps([...SITES.platform, ...SITES.shed], [], PLATFORM_HEIGHT, 'kx', false, [], [...Array<undefined>(n).fill(undefined), ...(SITES.shedReach ?? [])],
    [...Array<undefined>(n).fill(undefined), ...Array<number>(SITES.shed.length / 3).fill(SHED_POOL.decal)]);
  try {
    const pools = lamps.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
    const want = new THREE.Color(SHED_POOL.tint), share = (c: THREE.Color) => { const s = c.r + c.g + c.b; return [c.r / s, c.g / s, c.b / s]; };
    const [wr, wg, wb] = share(want), c = new THREE.Color();
    let outside = 0;
    for (let i = 0; i < n; i++) {
      const x = SITES.platform[3 * i]!, z = SITES.platform[3 * i + 2]!;
      if (shedFloorInside(layout, x, z) >= 1) continue;
      outside++;
      pools.getColorAt(i, c);
      const [r, g, b] = share(c);
      const at = `standard ${i} at (${x.toFixed(1)}, ${z.toFixed(1)}): rgb ${[c.r, c.g, c.b].map((v) => v.toFixed(3)).join(', ')}`;
      assert.ok(Math.abs(r - wr) < 0.01 && Math.abs(g - wg) < 0.01 && Math.abs(b - wb) < 0.01, `${at}, channel shares ${[r, g, b].map((v) => v.toFixed(3))} vs the shed's ${[wr, wg, wb].map((v) => v.toFixed(3))}`);
      assert.ok(c.r > c.b, `${at}: warm, red over blue`);
      // the pool's level is kept: its brightest channel at the 0.2 ceiling, not over it, and not dimmed below 0.195
      const peak = Math.max(c.r, c.g, c.b);
      assert.ok(peak <= 0.2 && peak >= 0.195, `${at}: peak ${peak.toFixed(4)} against the 0.2 ceiling`);
    }
    assert.ok(outside >= 1, `${outside} platform standards outside the shed`);
  } finally { lamps.dispose(); }
});
