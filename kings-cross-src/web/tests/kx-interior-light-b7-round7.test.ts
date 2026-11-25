// Shed interior B7, round 7 (the scorer's GPU measures of round 6, platform-eye-p1-north: the shaded floor by the wall 49-56 -> 61-64 under a
// sunlit floor at 117-122, 0.52 of it where 0.6 is wanted; and no crown band: the floor rose about 8 evenly). The near-wall bounce is stronger on
// the floor than on the walls (the shaded brick keeps its dark-brick mix), and the crown band is narrower and stronger, so it varies across the
// islands that stand under the crowns. Round 6's header, for the helpers below:
// Shed interior B7, round 6 (the round-4b score, section 5): (1) the trains take none of the shed's daylight additions (a sunlit white livery
// with the walls' sun reads about 248, over 240); (2) the shade by the walls is lifted by the sunlit brick's bounce, on the sky's light only, within a
// few metres of the arcades, on the floor and the piers' lower parts (aimed conservatively at about 70 on the screen from about 51); (3) the floor
// under the glazed crown takes a band of more sky, +10-15 levels at the vault's centre line, gone toward the walls. The sun's term (and so the
// walls' sunlit band and the crown floor's sun) does not move; the south front stays out (`shedUnder`); the night is untouched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { pointInPolygon, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationPlatforms } from '../../core/station.ts';
import * as lighting from '../src/lighting.ts';
import { buildShed } from '../src/shed.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Value } from './glsl.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const shed = buildShed(layout); // tells the shaders where the shed stands
shed.updateMatrixWorld(true);
const L = lighting as unknown as Record<string, unknown>;
const uniforms = lighting.roofShadeUniforms as unknown as Record<string, THREE.IUniform>;
const fakeRenderer = (): THREE.WebGLRenderer => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }) as unknown as THREE.WebGLRenderer;
const at = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, y, z]; };
const UP: [number, number, number] = [0, 1, 0];
const WEST_IN: [number, number, number] = [Math.cos(layout.heading), 0, Math.sin(layout.heading)]; // the west wall's inner face looks east
const EAST_IN: [number, number, number] = [-WEST_IN[0], 0, -WEST_IN[2]];
const WEST_WALL = layout.spine - 2 * R, SPINE = layout.spine, CENTRE = layout.spine - R;

/** sRGB 0-255 on the screen of a linear luminance through three's ACES curve (a grey) at the clear day's exposure (core/daylight.ts DAY_EXPOSURE). */
function screenDay(l: number): number {
  const v = l * 1.25 / 0.6, a = Math.min(1, Math.max(0, (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)));
  return 255 * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055);
}
function linearOf(s: number): number { let lo = 0, hi = 50; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (screenDay(m) < s) lo = m; else hi = m; } return lo; }
const s2l = (c: number) => ((c / 255 + 0.055) / 1.055) ** 2.4;

/** The indirect and direct factors SHED_SKY_GLSL leaves on a face of world normal `n` at world point `p`, seen from 6 m off along the normal. */
function sky(p: [number, number, number], n: [number, number, number]): { indirect: number; direct: number } {
  const src = L.SHED_SKY_GLSL as string | undefined;
  assert.ok(src, 'SHED_SKY_GLSL is exported');
  const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
  cam.position.set(p[0] + 6 * n[0] + 0.3, p[1] + 6 * n[1] + 0.4, p[2] + 6 * n[2] + 0.2);
  cam.lookAt(...p);
  cam.updateMatrixWorld(true);
  const view = new THREE.Vector3(...p).applyMatrix4(cam.matrixWorldInverse).negate();
  const normal = new THREE.Vector3(...n).transformDirection(cam.matrixWorldInverse);
  const vars: Record<string, Value> = { ...Object.fromEntries(Object.entries(uniforms).map(([k, u]) => [k, toValue(u.value)])),
    viewMatrix: toValue(cam.matrixWorldInverse), cameraPosition: toValue(cam.position), vViewPosition: [view.x, view.y, view.z], normal: [normal.x, normal.y, normal.z], rlDirect: [1, 1, 1], rlIndirect: [1, 1, 1] };
  new Glsl(lighting.SHED_GLASS_GLSL).snippet(src!.replaceAll('reflectedLight.directDiffuse', 'rlDirect').replaceAll('reflectedLight.indirectDiffuse', 'rlIndirect'))({ vars, fns: {} });
  return { indirect: (vars.rlIndirect as number[])[1]!, direct: (vars.rlDirect as number[])[1]! };
}


/** The span (u, the shed's frame) of the islands that `ids` make at `v` metres in. */
function island(ids: string[], v: number): [number, number] {
  const plats = stationPlatforms(data);
  let a = Infinity, b = -Infinity;
  for (let u = -5; u <= 70; u += 0.05) if (ids.some((id) => pointInPolygon(shedToWorld(layout, u, v), plats.get(id)!.pts))) { a = Math.min(a, u); b = Math.max(b, u); }
  return [a, b];
}

// round 6 on the GPU: 0.8 of bounce took the shaded floor by the wall from about 52.5 to 62.5; on this curve that is a light 1.234 times, so the
// measured place takes 0.29 of `bounce` (FIT: a spot a few metres out, and the sky's share of the shade there)
const FIT = (linearOf(62.5) / linearOf(52.5) - 1) / 0.8;

test('B7 round 7 near-wall bounce: on the floor by the walls more than on the walls\' own faces; the shaded floor at 0.6 of the sunlit floor or more', () => {
  const S = L.SHED_SKY as { bounce: number; wall: number } | undefined;
  assert.ok(S && S.bounce >= 1.4 && S.bounce <= 1.8, `SHED_SKY.bounce ${S?.bounce}`);
  assert.ok(S.wall !== undefined && S.wall >= 0.6 && S.wall <= 1.0 && S.wall < S.bounce, `SHED_SKY.wall ${S.wall} (round 6's 0.8: B3 held at 9)`);
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  for (const u of [WEST_WALL + 1, SPINE - 1, SPINE + 1]) {
    assert.ok(Math.abs(sky(at(u, 100, PLATFORM_HEIGHT), UP).indirect - 1 - S.bounce) < 1e-6, `the floor 1 m from a wall at u ${u.toFixed(1)}`);
    assert.equal(sky(at(u, 100, PLATFORM_HEIGHT), UP).direct, 1, 'the sun\'s term untouched');
  }
  assert.ok(Math.abs(sky(at(WEST_WALL + 0.02, 100, 2), WEST_IN).indirect - 1 - S.wall) < 1e-6, 'the west wall\'s foot takes the walls\' share');
  assert.ok(Math.abs(sky(at(SPINE + 0.02, 100, 2), WEST_IN).indirect - 1 - S.wall) < 1e-6, 'the spine\'s pier foot');
  const shade = screenDay(linearOf(52.5) * (1 + FIT * S.bounce));
  assert.ok(shade >= 0.6 * 119.5 && shade <= 80, `the shaded floor by the wall 52.5 -> ${shade.toFixed(1)} under a sunlit floor at 119.5`);
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0, false as never);
  assert.equal(sky(at(WEST_WALL + 1, 100, PLATFORM_HEIGHT), UP).indirect, 1, 'under the moon');
});

test('B7 round 7 crown band: the islands under the crowns are brighter at their middle than at their edges by day, by 6-14 levels, under the sunlit brick', () => {
  const S = L.SHED_SKY as { crown: number; band: readonly number[] };
  // re-pinned in round 8: the band on the floor's sun and sky alike (rib stripes kept), 1.2 on the sky -> 0.22 on both
  assert.ok(S.crown >= 0.15 && S.crown <= 0.3, `SHED_SKY.crown ${S.crown}`);
  assert.ok(S.band[1]! >= 0.33 && S.band[1]! <= 0.42, `the band gone by ${S.band[1]} of the half-span`);
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  // re-pinned in round 8: the band is on the direct light as on the sky's, so a sunlit floor takes the direct factor whole (was 0.3 of the sky's)
  const screen = (u: number, v: number) => screenDay(linearOf(119.5) * sky(at(u, v, PLATFORM_HEIGHT), UP).direct);
  // the island's floor under its crown (2/3 stands a little west of the east crown, so its crown line is near its east edge) against its two edges
  for (const [ids, crownU, name] of [[['6', '7'], CENTRE, 'the west vault\'s island (6, 7)'], [['2', '3'], layout.spine + R, 'the east vault\'s island (2, 3)']] as const) {
    for (const v of [60, 120, 180]) {
      const [a, b] = island([...ids], v), mid = screen(Math.min(b - 0.3, Math.max(a + 0.3, crownU)), v), edges = (screen(a + 0.3, v) + screen(b - 0.3, v)) / 2;
      // re-pinned in round 8 (10-18 -> 6-14, same 8-level width): the coordinator's round-8 spec measures the band from the crown line (+12-15) to 0.38 of the half-span
      // (none, -round8.test.ts); an island's edges stand 0.17-0.3 of the half-span off, inside the fall, so they keep part of it
      assert.ok(mid - edges >= 6 && mid - edges <= 14, `${name} at ${v} m: under the crown ${mid.toFixed(1)}, edges ${edges.toFixed(1)}`);
      assert.ok(mid < 185, 'under the sunlit brick');
    }
  }
  assert.equal(sky(at(CENTRE + 0.45 * R, 100, PLATFORM_HEIGHT), UP).indirect, 1, 'nothing 0.45 of the half-span off the crown');
  assert.equal(sky(at(CENTRE, 100, 1.6), EAST_IN).indirect, 1, 'nothing on a standing face under the crown');
  lighting.grade(fakeRenderer(), true, 1, 0, 0);
  assert.equal(sky(at(CENTRE, 100, PLATFORM_HEIGHT), UP).indirect, 1, 'Waverley, Perth');
});
