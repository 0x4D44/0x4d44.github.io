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
import { SHED_SPAN_WIDTH, shedLayout, shedToWorld } from '../../core/station.ts';
import * as lighting from '../src/lighting.ts';
import { buildShed } from '../src/shed.ts';
import { plain } from '../src/train-geom.ts';
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

test('B7 round 6 trains: the trains\' materials carry NO_SHED_LIGHT, and a roof-shaded program skips the walls\' sun and the shed\'s sky under it', () => {
  // the model: a sunlit white livery (0xf2f2ee at the shells' LIGHT_GAIN 1.5) against pale stone (STONE_DRESSING 0xc2bba6) in the same light at 200
  const white = s2l(0xf2) * 1.5, stone = (s2l(0xc2) + s2l(0xbb) + s2l(0xa6)) / 3, SUN_SHARE = 0.8;
  const livery = (gain: number) => screenDay(linearOf(200) * white / stone * (1 - SUN_SHARE + SUN_SHARE * gain));
  assert.ok(livery(lighting.SHED_WALL_SUN.gain) > 240 && livery(1) < 240, `white livery ${livery(1).toFixed(1)} without, ${livery(lighting.SHED_WALL_SUN.gain).toFixed(1)} with the walls' sun`);
  const flag = L.NO_SHED_LIGHT as string | undefined;
  assert.equal(flag, 'NO_SHED_LIGHT');
  assert.ok(plain().defines?.[flag!] !== undefined, 'the trains\' vertex-coloured body');
  for (const f of ['../src/livery.ts', '../src/train-livery.ts']) {
    const s = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(/new THREE\.MeshLambertMaterial\(\{ color: new THREE\.Color\(0xffffff\)\.multiplyScalar\(LIGHT_GAIN\) \}\);\n\s+m\.defines = \{ NO_SHED_LIGHT: '' \};/.test(s), `the livery shells in ${f}`);
  }
  const m = new THREE.MeshLambertMaterial();
  lighting.addRoofShade(m);
  const sh = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(sh as never, undefined as never);
  const f = sh.fragmentShader, open = f.indexOf(`#ifndef ${flag}`), sun = f.indexOf(lighting.SHED_WALL_SUN_GLSL), shedSky = f.indexOf(L.SHED_SKY_GLSL as string);
  assert.ok(open > f.indexOf('reflectedLight.directDiffuse *= roofK.a;') && open < sun && sun < shedSky && shedSky < f.indexOf('#endif', open), 'both inside the #ifndef, after the roof\'s shade');
  assert.equal(f.split(L.SHED_SKY_GLSL as string).length - 1, 1, 'once');
});

test('B7 round 6 near-wall bounce and crown band: the sky\'s light by the walls and under the crown, by day under the roof only, the sun\'s untouched', () => {
  const S = L.SHED_SKY as { bounce: number; crown: number } | undefined;
  assert.ok(S && S.bounce >= 0.6 && S.bounce <= 1.0, `SHED_SKY.bounce ${S?.bounce}`);
  assert.ok(S.crown >= 0.5 && S.crown <= 0.7, `SHED_SKY.crown ${S.crown}`);
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  const y = PLATFORM_HEIGHT;
  // the floor by the walls: the west wall, the spine's arcade from either vault, the east wall
  for (const [u, what] of [[WEST_WALL + 1, 'west wall'], [SPINE - 1, 'spine, west vault'], [SPINE + 1, 'spine, east vault'], [layout.spine + 2 * R - 1, 'east wall']] as const) {
    const k = sky(at(u, 100, y), UP);
    assert.ok(Math.abs(k.indirect - 1 - S.bounce) < 1e-6, `the floor 1 m from the ${what}: ${k.indirect.toFixed(3)}`);
    assert.equal(k.direct, 1, 'the sun\'s term untouched');
  }
  const three = sky(at(WEST_WALL + 3, 100, y), UP).indirect;
  assert.ok(three > 1 + 0.75 * S.bounce && three < 1 + S.bounce, `3 m out ${three.toFixed(3)}`);
  assert.ok(Math.abs(sky(at(WEST_WALL + 6.5, 100, y), UP).indirect - 1) < 0.08, 'gone by 6 m (the crown band\'s foot alone)');
  // the screen: shade by the wall (sky about 0.7 of its light, the sun's fill 0.3) at 51 aimed at about 70
  const shade = screenDay(linearOf(51) * (0.7 * three + 0.3));
  assert.ok(shade >= 64 && shade <= 76, `shade 3 m from the wall 51 -> ${shade.toFixed(1)}`);
  // the piers' lower parts take it, fading by their height; the springing keeps nothing
  assert.ok(Math.abs(sky(at(WEST_WALL + 0.02, 100, 2), WEST_IN).indirect - 1 - S.bounce) < 1e-6, 'the west wall\'s foot');
  assert.ok(Math.abs(sky(at(SPINE + 0.02, 100, 2), WEST_IN).indirect - 1 - S.bounce) < 1e-6, 'the spine\'s pier foot, east vault');
  const high = sky(at(WEST_WALL + 0.02, 100, 5), WEST_IN).indirect;
  assert.ok(high > 1 && high < 1 + 0.5 * S.bounce, `5 m up ${high.toFixed(3)}`);
  // the crown band: full on the floor under the centre line, nothing on a standing face there, nothing near the walls but the bounce
  const crown = sky(at(CENTRE, 100, y), UP);
  assert.ok(Math.abs(crown.indirect - 1 - S.crown) < 1e-6 && crown.direct === 1, `the crown floor ${crown.indirect.toFixed(3)}`);
  assert.ok(Math.abs(sky(at(CENTRE + 2, 140, y), UP).indirect - 1 - S.crown) < 1e-6, '2 m off the centre line');
  const mid = sky(at(CENTRE + 0.4 * R, 140, y), UP).indirect;
  assert.ok(mid > 1 && mid < 1 + S.crown, `0.4 of the half-span off ${mid.toFixed(3)}`);
  assert.equal(sky(at(CENTRE, 100, 1.6), EAST_IN).indirect, 1, 'a standing face under the crown (a train\'s side, a totem)');
  const lift = screenDay(linearOf(128) * (1 + 0.3 * S.crown)) - 128;
  assert.ok(lift >= 10 && lift <= 15, `the sunlit crown floor (sky 0.3 of it) 128 +${lift.toFixed(1)}`);
  assert.ok(screenDay(linearOf(128) * (1 + 0.3 * S.crown)) < 185, 'under the sunlit brick (185-195)');
  // the south front, the outside, the night and the other scenes keep theirs
  assert.equal(sky(at(WEST_WALL + 1, 0.5, y), UP).indirect, 1, 'the floor in the porch, at the front');
  assert.equal(sky(at(WEST_WALL - 1, 100, y), UP).indirect, 1, 'outside the west wall');
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0, false as never);
  assert.equal(sky(at(WEST_WALL + 1, 100, y), UP).indirect, 1, 'under the moon');
  lighting.grade(fakeRenderer(), true, 1, 0, 0);
  assert.equal(sky(at(CENTRE, 100, y), UP).indirect, 1, 'Waverley, Perth (no hemisphere given)');
});
