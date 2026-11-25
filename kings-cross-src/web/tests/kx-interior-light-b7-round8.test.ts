// Shed interior B7, round 8 (the round-7 GPU score: still no crown band; a flat +7 across platform-eye, -south and furniture-close). Those cameras
// stand on platform 4, 0.1-3.8 m from the spine arcade's line, where the near-wall bounce lifts the whole platform alike: that is the flat +7; the
// band was there, under the crowns at u 16 and 48, where no camera stood. Now (1) a camera on island 6/7 under the west crown
// (platform-eye-crown-west), and (2) the band on the floor's diffuse light, the sun's and the sky's alike, so the rib stripes keep their contrast under
// it: +12-15 on the crown line, nothing by 0.38 of the half-span. Round 7's header, for the helpers below:
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
// @ts-expect-error the evidence tool is plain JavaScript
import { ELEMENT_VIEWS, stationCameras } from '../../tools/evidence.mjs';
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



test('B7 round 8 a camera under the crown: platform-eye-crown-west stands on island 6/7 on the west crown line, 1.6 m up, looks along the platform, and is a shed-interior view', () => {
  const cam = (stationCameras() as Record<string, { pos: number[]; target: number[] }>)['platform-eye-crown-west'];
  assert.ok(cam, 'platform-eye-crown-west exists');
  assert.ok((ELEMENT_VIEWS as Record<string, string[]>)['shed-interior']!.includes('platform-eye-crown-west'), 'a shed-interior view');
  const plats = stationPlatforms(data), foot = [cam.pos[0]!, cam.pos[2]!] as [number, number];
  assert.ok(['6', '7'].some((id) => pointInPolygon(foot, plats.get(id)!.pts)), 'on the 6-7 island');
  const [x0, z0] = shedToWorld(layout, 0, 0), [xu, zu] = shedToWorld(layout, 1, 0), [xv, zv] = shedToWorld(layout, 0, 1);
  const u = (foot[0] - x0) * (xu - x0) + (foot[1] - z0) * (zu - z0), along = [cam.target[0]! - cam.pos[0]!, cam.target[2]! - cam.pos[2]!];
  assert.ok(Math.abs(u - CENTRE) < 0.5, `on the crown line: u ${u.toFixed(2)} against ${CENTRE.toFixed(2)}`);
  assert.ok(Math.abs(cam.pos[1]! - PLATFORM_HEIGHT - 1.6) < 1e-6, 'eye 1.6 m above the platform');
  assert.ok(Math.abs(along[0]! * (xv - x0) + along[1]! * (zv - z0)) / Math.hypot(along[0]!, along[1]!) > 0.99, 'looking along the platform');
  // and the shader's band is full at its foot (the floor it stands on)
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  const S = L.SHED_SKY as { crown: number };
  const k = sky([foot[0], PLATFORM_HEIGHT, foot[1]], UP);
  assert.ok(k.indirect > 1 + 0.95 * S.crown && k.direct > 1 + 0.95 * S.crown, `the band at the camera's foot: direct ${k.direct.toFixed(3)}, indirect ${k.indirect.toFixed(3)}`);
});

test('B7 round 8 crown band: the floor\'s sun and sky alike, +12-15 on the crown line, nothing by 0.38 of the half-span; rib stripes kept', () => {
  const S = L.SHED_SKY as { crown: number; band: readonly number[] };
  assert.ok(S.crown >= 0.15 && S.crown <= 0.3, `SHED_SKY.crown ${S.crown}`);
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  for (const [c, v] of [[CENTRE, 198.4], [layout.spine + R, 120]] as const) {
    const on = sky(at(c, v, PLATFORM_HEIGHT), UP), off = sky(at(c + 0.38 * R, v, PLATFORM_HEIGHT), UP);
    assert.ok(Math.abs(on.direct - on.indirect) < 1e-9, 'the sun and the sky alike on the crown line');
    const lift = (k: { direct: number }) => screenDay(linearOf(119.5) * k.direct) - 119.5; // a sunlit floor at 119.5 (the round-7 GPU), its light all diffuse
    assert.ok(lift(on) >= 12 && lift(on) <= 15, `on the crown line +${lift(on).toFixed(1)}`);
    assert.ok(lift(off) <= 0.5 && off.direct === off.indirect, `0.38 of the half-span off +${lift(off).toFixed(2)}`);
    // rib stripes: a shaded floor at 72 (round 7's 1.66) in the same factor keeps sun over shade at 1.45 or more
    assert.ok(screenDay(linearOf(119.5) * on.direct) / screenDay(linearOf(72) * on.indirect) >= 1.45, 'sun over shade under the band');
    assert.ok(screenDay(linearOf(119.5) * on.direct) < 185, 'under the sunlit brick');
  }
  // under the roof only: on the crown line in the south porch, past the north end, and on a face looking up in the roof above the springing
  for (const [p, what] of [[at(CENTRE, 0.5, PLATFORM_HEIGHT), 'the porch'], [at(CENTRE, layout.length + 3, PLATFORM_HEIGHT), 'past the north end'], [at(CENTRE, 100, layout.crown - 1), 'up in the roof']] as const) {
    const k = sky(p as [number, number, number], UP);
    assert.ok(k.direct === 1 && k.indirect === 1, `${what}: ${k.direct}, ${k.indirect}`);
  }
  assert.equal(sky(at(CENTRE, 100, 1.6), EAST_IN).direct, 1, 'a standing face under the crown keeps its sun');
  assert.equal(sky(at(CENTRE, 100, 1.6), EAST_IN).indirect, 1, 'and its sky');
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0, false as never);
  assert.equal(sky(at(CENTRE, 100, PLATFORM_HEIGHT), UP).direct, 1, 'under the moon');
});
