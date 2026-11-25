// Shed interior B7, round 5, item 0 (a repair of round 4b: by day the GPU diff of main 2808cc5b against b9056b33 lit porch-close, south-front,
// tower-close, front-southwest-pedestrian and front-oblique; A3 fell 8.5 -> 8.0 on porch-close, the porch piers above the plinth 82,67,45 -> 119,100,67).
// The shed's frame starts at the south front's outer face and the front wall is 1.2 m thick, so the walls' sun (SHED_WALL_SUN), gated by `shedInside`
// alone, took the front's outer face, the porch arches and the tower's foot as inside. Now it is gated by `shedUnder`: none of it on the south
// front, its porch or the tower (nor the north end's outer face), all of it a few metres in under the roof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { SHED_SPAN_WIDTH, shedLayout, shedToWorld } from '../../core/station.ts';
import * as lighting from '../src/lighting.ts';
import { buildShed } from '../src/shed.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Value } from './glsl.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const shed = buildShed(layout); // tells the shaders where the shed stands
shed.updateMatrixWorld(true);
const uniforms = lighting.roofShadeUniforms as unknown as Record<string, THREE.IUniform>;
const fakeRenderer = (): THREE.WebGLRenderer => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }) as unknown as THREE.WebGLRenderer;
const at = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, y, z]; };
const [sx, sz] = shedToWorld(layout, 0, -1), [ox, oz] = shedToWorld(layout, 0, 0);
const SOUTH: [number, number, number] = [sx - ox, 0, sz - oz]; // out of the south front
const NORTH: [number, number, number] = [-SOUTH[0], 0, -SOUTH[2]];
const WEST_IN: [number, number, number] = [Math.cos(layout.heading), 0, Math.sin(layout.heading)]; // the west wall's inner face looks east

/** The direct light's factor SHED_WALL_SUN_GLSL leaves on a face of world normal `n` at world point `p`, seen from 6 m off along the normal. */
function wallSun(p: [number, number, number], n: [number, number, number]): number {
  const cam = new THREE.PerspectiveCamera(60, 1.5, 0.1, 1000);
  cam.position.set(p[0] + 6 * n[0] + 0.3, p[1] + 6 * n[1] + 0.4, p[2] + 6 * n[2] + 0.2);
  cam.lookAt(...p);
  cam.updateMatrixWorld(true);
  const view = new THREE.Vector3(...p).applyMatrix4(cam.matrixWorldInverse).negate();
  const normal = new THREE.Vector3(...n).transformDirection(cam.matrixWorldInverse);
  const vars: Record<string, Value> = { ...Object.fromEntries(Object.entries(uniforms).map(([k, u]) => [k, toValue(u.value)])),
    viewMatrix: toValue(cam.matrixWorldInverse), cameraPosition: toValue(cam.position), vViewPosition: [view.x, view.y, view.z], normal: [normal.x, normal.y, normal.z], rlDirect: [1, 1, 1] };
  new Glsl(lighting.SHED_GLASS_GLSL).snippet(lighting.SHED_WALL_SUN_GLSL.replaceAll('reflectedLight.directDiffuse', 'rlDirect'))({ vars, fns: {} });
  return (vars.rlDirect as number[])[1]!;
}

test('B7 round 5 item 0: by day the walls\' sun is not on the south front, its porch or the tower, and is on the walls a few metres in under the roof', () => {
  lighting.grade(fakeRenderer(), true, 1, 1.02, 0);
  const g = lighting.SHED_WALL_SUN.gain;
  // the south front's outer face (porch piers above the plinth, the facade over the porch, the arch rings' returns), across both vaults
  for (const u of [layout.spine - 1.5 * R, layout.spine - R, layout.spine - 0.4 * R, layout.spine + 0.4 * R, layout.spine + R, layout.spine + 1.5 * R]) {
    for (const y of [1.5, 3, 5]) {
      assert.equal(wallSun(at(u, 0, y), SOUTH), 1, `the front's outer face at u ${u.toFixed(1)}, ${y} m up`);
      assert.equal(wallSun(at(u, 0.02, y), SOUTH), 1, `a porch pier 2 cm behind the front line at u ${u.toFixed(1)}, ${y} m up`);
    }
    assert.equal(wallSun(at(u, 0.6, 2.5), WEST_IN), 1, `a reveal in the front wall's thickness at u ${u.toFixed(1)}`);
    assert.equal(wallSun(at(u, 1.0, 2.5), SOUTH), 1, `the porch's infill and the hall behind its glass at u ${u.toFixed(1)}`);
  }
  assert.equal(wallSun(at(layout.spine, 0.2, 4), SOUTH), 1, 'the tower\'s foot on the spine');
  assert.equal(wallSun(at(layout.spine - R, layout.length, 3), NORTH), 1, 'the north end\'s outer face');
  // still under the roof: the front wall's inner face and the arcades a few metres in
  assert.ok(Math.abs(wallSun(at(layout.spine - R, 1.6, 3), NORTH) - g) < 1e-6, 'the front wall\'s inner face, under the roof');
  assert.ok(Math.abs(wallSun(at(layout.spine - 2 * R + 0.02, 4, 3), WEST_IN) - g) < 1e-6, 'the west wall 4 m in');
  assert.ok(Math.abs(wallSun(at(layout.spine - 2 * R + 0.02, layout.length - 4, 3), WEST_IN) - g) < 1e-6, 'the west wall 4 m from the north end');
});
