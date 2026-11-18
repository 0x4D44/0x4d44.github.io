import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { NIGHT_EXPOSURE } from '../../core/daylight.ts';
import { lightWaverleyNight } from '../src/station-weather.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl } from './glsl.ts';
import receipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const scene = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(scene.group, .60);
const glow = createWaverleyGlow(scene.group);
const facade = scene.group.getObjectByName('waverley-balmoral-facade') as THREE.Mesh;
const material = facade.material as THREE.MeshLambertMaterial;
const levels = [6.25, 10.50, 14.20, 17.80, 21.30];
const patchBays = [52, 53, 54, 55];
const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

after(() => { glow.dispose(); undo(); scene.dispose(); });

function facadeShader() {
  const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
  const source = { vertexShader, fragmentShader, uniforms: {} };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}

function block(source: string, label: string) {
  const start = source.indexOf(`// ${label}-begin`);
  assert.ok(start >= 0, label);
  return source.slice(source.indexOf('\n', start), source.indexOf(`// ${label}-end`, start));
}

function rooms(source: string) {
  const declarations = source.split('#include <common>')[1]!.split('#include')[0]!.replace(/^\s*#.*$/gm, '');
  const sample = new Glsl(declarations).snippet(block(source, 'balmoral-amber-rooms') + block(source, 'balmoral-room-contrast'));
  return (bay: number, height: number, u = .45, uWinNight = 1) => {
    const vars = {
      hotelHeight: height, vMapUv: [bay+u, (height+18)/43.5], uWinNight,
      sampledDiffuseColor: [.025,.032,.042,1], totalEmissiveRadiance: [0,0,0],
      balmoralStoneEmission: [0,0,0],
    };
    sample({ vars, fns: { fwidth: () => [.03,.08] } });
    return vars.totalEmissiveRadiance;
  };
}

function nightRooms() {
  glow.setLevel(1);
  return rooms(facadeShader().fragmentShader);
}

const display = (rgb: readonly number[]) => toSrgb(acesFilmic(rgb as V3, NIGHT_EXPOSURE)).map(c => c*255);

test('Balmoral room cores read yellow-gold with room variation and headroom', () => {
  const sample = nightRooms();
  const lit = levels.flatMap(height => patchBays.map(bay => sample(bay, height)))
    .filter(rgb => luma(rgb) > .08).map(display);
  const mean = [0,1,2].map(i => lit.reduce((sum, rgb) => sum+rgb[i]!, 0)/lit.length);
  const spreads = [0,1,2].map(i => Math.max(...lit.map(rgb => rgb[i]!))-Math.min(...lit.map(rgb => rgb[i]!)));
  console.log('room-core display RGB', { mean, spreads });
  assert.ok(mean[0]! >= 228 && mean[0]! <= 247);
  assert.ok(mean[1]! >= 172 && mean[1]! <= 204);
  assert.ok(mean[2]! >= 82 && mean[2]! <= 120);
  assert.ok(spreads.every(spread => spread >= 8));
  // Upper aperture cores carry the strongest room contribution. Allow
  // additional linear fill beyond the window emission in the headroom check.
  const peaks = Array.from({ length: 56 }, (_, bay) =>
    [4.1, 7.05, 11.6, 15.2, 18.65, 22.1].map(height =>
      luma(display(sample(bay, height).map((channel, i) => channel + [.045,.040,.030][i]!)))));
  const peak = Math.max(...peaks.flat());
  console.log('peak room luma with fill', peak);
  assert.ok(peak <= 245, `peak room luma ${peak.toFixed(1)}`);
});

test('Balmoral moves one lit room into the top storey of the 20-pane patch', () => {
  const sample = nightRooms();
  const counts = levels.map(height => patchBays.filter(bay => luma(sample(bay, height)) > .08).length);
  assert.deepEqual(counts, [3, 2, 2, 1, 3]);
  assert.ok(luma(sample(54, 21.3)) > .08);
  assert.deepEqual(sample(54, 10.5), [0,0,0]);
  assert.ok(luma(sample(55, 2.15)) > .08);
});

test('Princes Street breaks the four-storey stack while retaining the occupied-room count', () => {
  const sample = nightRooms();
  const patterns = [48, 49].map(bay => levels.slice(1).map(height => Number(luma(sample(bay, height)) > .08)));
  assert.deepEqual(patterns, [[1,0,1,1], [1,0,1,0]]);
});

test('the changed night program reaches only glazing and restores exact day and Perth receipts', () => {
  const fingerprint = () => {
    const { vertexShader, fragmentShader } = facadeShader();
    return sha(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
  };
  glow.setLevel(0);
  const day = '3b5095bbe90dd8c8b35f7010fb3ecabc553bd1fede29d7f4b409ac2583354ede';
  const dayKey = material.customProgramCacheKey();
  assert.equal(fingerprint(), day);
  glow.setLevel(1);
  const source = facadeShader().fragmentShader;
  const roomCode = block(source, 'balmoral-amber-rooms');
  assert.equal(sha(source.replace(roomCode, '')), '9cde959c65453bbee8b150d80e74fcde09c0c9a99bb891a0123605db7c9c3260');
  const sample = rooms(source);
  assert.deepEqual(sample(54, 21.3, .78), [0,0,0]);
  assert.deepEqual(sample(54, 23.0), [0,0,0]);
  assert.deepEqual(sample(54, 21.3, .45, 0), [0,0,0]);
  glow.setLevel(0);
  assert.equal(facade.material, material);
  assert.equal(material.customProgramCacheKey(), dayKey);
  assert.equal(fingerprint(), day);
  for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
    assert.equal(sha(JSON.stringify(remoteWeatherSnapshot('pt', state, true))), receipts[`pt/${state}`]);
  }
  assert.notEqual(sha(roomCode), '43c2be32dd1d1d6fe1aa7001080dcf4d2fb6d92d6774a017f0515ab36b9015e5', 'the scoped change is in the Balmoral night program');
});
