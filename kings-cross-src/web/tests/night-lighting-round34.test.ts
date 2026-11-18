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

test('Balmoral room cores mix cream, tungsten and cool white with room variation and headroom', () => {
  const sample = nightRooms();
  const bays = Array.from({ length: 56 }, (_, bay) => bay);
  const classify = (rgb: number[]) => Math.max(...rgb)-Math.min(...rgb) < 16 ? 'cool'
    : rgb[1]!-rgb[2]! > 55 ? 'tungsten' : 'cream';
  const floors = [2.4, ...levels].map(height => bays.map((bay) => ({ bay, rgb: sample(bay, height) }))
    .filter(({rgb}) => luma(rgb) > .08).map(({bay,rgb}) => ({ bay, rgb: display(rgb) })));
  const lit = floors.flat();
  const patch = floors.slice(1).flat().filter(({bay}) => patchBays.includes(bay));
  const patchSpreads = [0,1,2].map(i => {
    const channels = patch.map(({rgb}) => rgb[i]!);
    return Math.max(...channels)-Math.min(...channels);
  });
  const palette = [
    { name: 'cream', share: .65, target: [225,205,165] },
    { name: 'tungsten', share: .25, target: [240,190,110] },
    { name: 'cool', share: .10, target: [205,205,200] },
  ];
  const colours = palette.map(({name, share, target}) => {
    const rooms = lit.filter(({rgb}) => classify(rgb) === name);
    const mean = target.map((_, i) => rooms.reduce((sum, {rgb}) => sum+rgb[i]!, 0)/rooms.length);
    const lumas = rooms.map(({rgb}) => luma(rgb));
    return { name, share, target, count: rooms.length, mean, spread: Math.max(...lumas)-Math.min(...lumas),
      bays: new Set(rooms.map(room => room.bay)).size };
  });
  console.log('room-core display palette', colours);
  for (const {name, share, target, count, mean, spread, bays} of colours) {
    assert.ok(Math.abs(count/lit.length - share) <= .035, `${name}: ${count}/${lit.length}`);
    assert.ok(mean.every((channel,i) => Math.abs(channel-target[i]!) <= 8), `${name}: ${mean}`);
    assert.ok(spread >= 8 && spread < 35 && bays >= 8, `${name}: luma range ${spread}, ${bays} bays`);
    assert.ok(floors.filter(row => row.some(({rgb}) => classify(rgb) === name)).length >= 4);
  }
  assert.ok(patchSpreads.every(spread => spread >= 8));
  // Upper aperture cores carry the strongest room contribution. Allow
  // additional linear fill beyond the window emission in the headroom check.
  const peaks = bays.map(bay =>
    [4.1, 7.05, 11.6, 15.2, 18.65, 22.1].map(height =>
      luma(display(sample(bay, height).map((channel, i) => channel + [.045,.040,.030][i]!)))));
  const peak = Math.max(...peaks.flat());
  console.log('peak room luma with fill', peak);
  assert.ok(peak <= 245, `peak room luma ${peak.toFixed(1)}`);
});

test('Balmoral stone is dark between one warm storey band and the cornice', () => {
  glow.setLevel(1);
  const source = facadeShader().fragmentShader;
  const base = scene.group.getObjectByName('waverley-frontage')!.userData.frontage.P as number;
  const washes = ['balmoral-facade-wash', 'balmoral-bands', 'balmoral-body-uplight']
    .map(label => block(source, label)).join('\n');
  const grade = block(source, 'balmoral-stone-grade') + block(source, 'balmoral-stone-diffuse')
    .replaceAll('reflectedLight.directDiffuse', 'direct').replaceAll('reflectedLight.indirectDiffuse', 'indirect');
  const glsl = new Glsl('');
  const wash = glsl.snippet(washes);
  const shade = glsl.snippet(grade);
  function stone(height: number) {
    const albedo = [.41,.30,.21];
    const vars = {
      vStationLampWorld: [58,base+height,-132], diffuseColor: [...albedo,1], uStationLampLevel: 1, hotelHeight: height,
      totalEmissiveRadiance: [0,0,0], balmoralStoneEmission: [0,0,0],
      balmoralBuiltFlood: albedo.map((c,i) => c*[1,.82,.5][i]!*.08*(.5+.5*Math.exp(-(height+18)/30))),
      direct: albedo.map(c => c*.10), indirect: albedo.map(c => c*.12),
    };
    wash({vars});
    vars.balmoralStoneEmission = [...vars.totalEmissiveRadiance];
    shade({vars});
    return display(vars.totalEmissiveRadiance.map((c,i) => c+vars.balmoralBuiltFlood[i]!+vars.direct[i]!+vars.indirect[i]!));
  }
  const heights = [3.4,6.25,8.7,10.5,14.2,17.8,21.3,24.3];
  const paints = heights.map(stone);
  const brightness = paints.map(luma);
  console.log('Balmoral stone display luma by height', brightness);
  assert.ok([0,1,4,5,6].every(i => brightness[i]! < 36));
  assert.ok(brightness[2]! > 145 && brightness[3]! > 92 && brightness[7]! > 150);
  assert.ok([2,3,7].every(i => paints[i]![0]!-paints[i]![1]! > 18));
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

test('the changed night program reaches only Balmoral glazing and facade stone and restores day and Perth receipts', () => {
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
  const stoneCode = block(source, 'balmoral-stone-grade');
  assert.equal(sha(source.replace(roomCode, '').replace(stoneCode, '')), 'aa553a124a3a0013fbf94f278c5bbd8e0f08a026e70887cad7f74986b2324ffc');
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
