import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type {KxData} from '../../core/osm.ts';
import {addRoofShade} from '../src/lighting.ts';
import {addLandmarks} from '../src/landmarks.ts';
import type {Key} from '../src/landmarks.ts';
import {windowNight} from '../src/materials.ts';
import {Glsl} from './glsl.ts';

const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const worldHeight = '( cameraPosition - vViewPosition * mat3( viewMatrix ) ).y';

function setup(key: Key) {
  const built = addLandmarks(new THREE.Scene(), data);
  const mesh = built.group.getObjectByName(`landmarks-${key}`) as THREE.Mesh;
  const material = mesh.material as THREE.MeshLambertMaterial;
  addRoofShade(material);
  const shader = {
    uniforms: {} as Record<string, THREE.IUniform>,
    vertexShader: THREE.ShaderLib.lambert!.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert!.fragmentShader,
  };
  material.onBeforeCompile(shader as never, undefined as never);
  return {built, material, shader};
}

function shaderBlock(fragment: string): string {
  const begin = fragment.indexOf('// midland-night-begin');
  const end = fragment.indexOf('// midland-night-end', begin);
  assert.ok(begin >= 0 && end > begin, 'the Midland night block is compiled');
  return fragment.slice(begin + '// midland-night-begin'.length, end);
}

function floodTerm(fragment: string, material: THREE.MeshLambertMaterial): string {
  const begin = fragment.indexOf('#ifdef FLOOD');
  const end = fragment.indexOf('#endif', begin);
  assert.ok(begin >= 0 && end > begin, 'the ordinary FLOOD contribution is in the compiled shader');
  const term = /totalEmissiveRadiance \+= (.*);/.exec(fragment.slice(begin, end))?.[1];
  assert.ok(term, 'the ordinary flood adds its emissive contribution');
  assert.ok(fragment.indexOf('// midland-night-begin') > fragment.indexOf(term), 'the Midland treatment runs after the ordinary flood contribution');
  const define = String(material.defines?.FLOOD);
  return term.replace(worldHeight, 'uHeight').replace(/\bFLOOD\b/g, define);
}

function floodAt(term: string, height: number, night = 1): number[] {
  return new Glsl('').evaluate(term, {vars: {}}, {
    uHeight: height,
    uWinNight: night,
    diffuseColor: [1, 1, 1, 1],
  }) as number[];
}

function runMidland(fragment: string, height: number, night: number, scope: number, rake: number, direct: number[], indirect: number[], emissive: number[]) {
  const vars = {
    vMidlandNight: [scope, rake],
    vMidlandHeight: height,
    uMidlandNight: night,
    direct: [...direct],
    indirect: [...indirect],
    totalEmissiveRadiance: [...emissive],
  };
  const code = shaderBlock(fragment)
    .replaceAll('reflectedLight.indirectDiffuse', 'indirect')
    .replaceAll('reflectedLight.directDiffuse', 'direct');
  new Glsl('').run(code, {vars});
  return vars;
}

test('round eight dims only Midland upper-brick diffuse and its residual FLOOD emission, while the arcade and day stay exact', () => {
  const {built, material, shader} = setup('brickRed');
  try {
    assert.equal(shader.uniforms.uMidlandNight, windowNight);
    assert.equal(material.emissive.getHex(), 0, 'the brick material has no separate emissive source; the scaled emission is FLOOD');
    const term = floodTerm(shader.fragmentShader, material);
    const direct = [1, 1, 1];
    const indirect = [1, 1, 1];
    const arcadeFlood = floodAt(term, 3);
    const arcade = runMidland(shader.fragmentShader, 3, 1, 1, 0, direct, indirect, arcadeFlood);
    assert.deepEqual(arcade.direct, direct, 'the arcade keeps its direct illumination');
    assert.deepEqual(arcade.indirect, indirect, 'the arcade keeps its indirect illumination');
    assert.deepEqual(arcade.totalEmissiveRadiance, arcadeFlood, 'the arcade keeps the ordinary warm flood');

    const height = 23;
    const rawFlood = floodAt(term, height);
    const upper = runMidland(shader.fragmentShader, height, 1, 1, 0, direct, indirect, rawFlood);
    const diffuseFactor = (upper.direct as number[])[0]!;
    const floodFactor = (upper.totalEmissiveRadiance as number[])[0]! / rawFlood[0]!;
    assert.ok(Math.abs(rawFlood[0]! - 0.0139019) < 0.0000001, `sampled flood emission coefficient ${rawFlood[0]}`);
    assert.ok(floodFactor <= 0.05 + 1e-9, `at ${height} m, FLOOD adds ${rawFlood[0]} of albedo; retained ${((upper.totalEmissiveRadiance as number[])[0])}, factor ${floodFactor}, diffuse coefficient ${diffuseFactor}`);
    assert.ok(Math.abs(diffuseFactor - 0.18) < 1e-9, `upper direct diffuse retains 18%; sampled ${diffuseFactor}`);
    assert.ok(Math.abs((upper.indirect as number[])[0]! - 0.18) < 1e-9, 'upper indirect diffuse also retains 18%');
    assert.ok(rawFlood[0]! > 0, 'the unchanged FLOOD block really contributes at the sample height');

    // At 23 m the source FLOOD term is 0.28 * (0.04 + 0.96 * exp(-23 / 5)) = 0.0139019 of albedo.
    // With unit incident diffuse, the old shader kept 0.30 direct + 0.30 indirect while still adding that 0.0139019 emission.
    // The scoped result keeps 0.18 + 0.18 diffuse and 0.0006951 flood emission, without changing the 3 m arcade sample.
    assert.ok(Math.abs((upper.totalEmissiveRadiance as number[])[0]! - 0.0006951) < 0.0000001, `sampled upper flood coefficient ${(upper.totalEmissiveRadiance as number[])[0]}`);

    const outsideMask = runMidland(shader.fragmentShader, height, 1, 0, 0, direct, indirect, rawFlood);
    assert.deepEqual(outsideMask.direct, direct, 'other landmarks have no upper-wall diffuse adjustment');
    assert.deepEqual(outsideMask.indirect, indirect, 'other landmarks have no upper-wall indirect adjustment');
    assert.deepEqual(outsideMask.totalEmissiveRadiance, rawFlood, 'other landmarks keep their ordinary flood');

    const day = runMidland(shader.fragmentShader, height, 0, 1, 0, [0.21, 0.32, 0.43], [0.54, 0.65, 0.76], [0.01, 0.02, 0.03]);
    assert.deepEqual(day.direct, [0.21, 0.32, 0.43]);
    assert.deepEqual(day.indirect, [0.54, 0.65, 0.76]);
    assert.deepEqual(day.totalEmissiveRadiance, [0.01, 0.02, 0.03]);
  } finally {
    built.dispose();
  }
});

test('round eight leaves the Midland stone gable-rake gilding emissive', () => {
  const {built, shader} = setup('stone');
  const brick = setup('brickRed');
  try {
    const lit = runMidland(shader.fragmentShader, 23, 1, 1, 1, [1, 1, 1], [1, 1, 1], [0, 0, 0]);
    assert.deepEqual(lit.totalEmissiveRadiance, [0.24, 0.105, 0.018]);
    const upper = runMidland(brick.shader.fragmentShader,23,1,1,0,[1,1,1],[1,1,1],[0.38,0.24,0.085]);
    assert.ok(lit.totalEmissiveRadiance[0]! > upper.totalEmissiveRadiance[0]! * 10,'the gilded rake must stand out against the newly dimmed upper-wall emission');
  } finally {
    brick.built.dispose();
    built.dispose();
  }
});
