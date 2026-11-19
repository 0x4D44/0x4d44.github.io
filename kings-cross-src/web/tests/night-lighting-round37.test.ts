import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { NIGHT_EXPOSURE } from '../../core/daylight.ts';
import { rgb } from '../src/materials.ts';
import { lightWaverleyNight } from '../src/station-weather.ts';
import { BALMORAL_COLOURS } from '../src/waverley-frontage-balmoral.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import receipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { Glsl } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const scene = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(scene.group, .60);
const glow = createWaverleyGlow(scene.group);
const frontage = scene.group.getObjectByName('waverley-frontage')!;
const base = frontage.userData.frontage.P as number;
const facade = frontage.getObjectByName('waverley-balmoral-facade') as THREE.Mesh;
const structure = frontage.getObjectByName('waverley-frontage-structure') as THREE.Mesh;
const materials = [facade, structure].map(mesh => mesh.material as THREE.MeshLambertMaterial);
const glsl = new Glsl('');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const display = (rgb: number[]) => toSrgb(acesFilmic(rgb as unknown as V3, NIGHT_EXPOSURE)).map(c => c*255);
after(() => { glow.dispose(); undo(); scene.dispose(); });

function shader(material: THREE.Material) {
  const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
  const source = { vertexShader, fragmentShader, uniforms: {} };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}

function block(source: string, tag: string) {
  return source.split(`// ${tag}-begin`)[1]!.split(`// ${tag}-end`)[0]!;
}

const trimColours = { ...BALMORAL_COLOURS, roofDeck: 0xffffff, chimneyPot: 0x8a6a52 };

function trim(source: string) {
  const evaluate = glsl.snippet(block(source, 'balmoral-trim'));
  return (x: number, z: number, height: number, colour: keyof typeof trimColours,
    normal = [.96, 0, -.27], uv = [0, 0], level = 1) => {
    const albedo = rgb(trimColours[colour]);
    const vars = { vStationLampWorld: [x, base+height, z], vStationLampNormal: normal,
      diffuseColor: [...albedo, 1], vColor: [...albedo], vBalmoralTrimUv: uv,
      uStationLampLevel: level, totalEmissiveRadiance: [0, 0, 0] };
    evaluate({ vars });
    return display(vars.totalEmissiveRadiance.map((c, i) => c+albedo[i]!*.025));
  };
}

function stone(source: string) {
  const wash = glsl.snippet(['balmoral-facade-wash', 'balmoral-bands', 'balmoral-body-uplight']
    .map(label => block(source, label)).join('\n'));
  const grade = glsl.snippet(block(source, 'balmoral-stone-grade') + block(source, 'balmoral-stone-diffuse')
    .replaceAll('reflectedLight.directDiffuse', 'direct').replaceAll('reflectedLight.indirectDiffuse', 'indirect'));
  return (height: number, x = 58, z = -132, albedo = [.41,.30,.21]) => {
    const vars = { vStationLampWorld: [x,base+height,z], hotelHeight: height, diffuseColor: [...albedo,1], uStationLampLevel: 1,
      totalEmissiveRadiance: [0,0,0], balmoralStoneEmission: [0,0,0],
      balmoralBuiltFlood: albedo.map((c,i) => c*[1,.82,.5][i]!*.08*(.5+.5*Math.exp(-(height+18)/30))),
      direct: albedo.map(c => c*.10), indirect: albedo.map(c => c*.12),
    };
    wash({ vars });
    vars.balmoralStoneEmission = [...vars.totalEmissiveRadiance];
    grade({ vars });
    return display(vars.totalEmissiveRadiance.map((c,i) => c+vars.balmoralBuiltFlood[i]!+vars.direct[i]!+vars.indirect[i]!));
  };
}

const round = (rgb: number[]) => rgb.map(c => Math.round(c));

test('Balmoral roof mass, chimneys and corner turret lead caps keep the round 37 silhouette', () => {
  glow.setLevel(1);
  const sample = trim(shader(materials[1]!).fragmentShader);
  const surfaces = {
    mansard: sample(80,-120,29.4,'slate',[.89,.3773,-.25]),
    roofDeck: sample(70,-110,31.5,'roofDeck',[0,1,0]),
    stack: sample(84,-103,36,'stone',[.96,0,-.27],[.5,.5]),
    chimneyCope: sample(84,-103,38.7,'cornice',[0,1,0],[.5,.5]),
    chimneyPot: sample(84,-103,39,'chimneyPot'),
    eastLead: sample(74,-136,28.5,'lead'),
    westLead: sample(26,-120,31.7,'lead'),
  };
  console.log('roof silhouette RGB', Object.fromEntries(Object.entries(surfaces).map(([name,rgb]) => [name,round(rgb)])));
  assert.ok(luma(surfaces.roofDeck) < 75); // this upward face has a white base and retains its sky fill
  assert.ok([surfaces.mansard, surfaces.stack, surfaces.chimneyCope, surfaces.chimneyPot,
    surfaces.eastLead, surfaces.westLead].every(surface => luma(surface) < 65));
});

function atticTrim(sample: ReturnType<typeof trim>) {
  const pixel = (...args: Parameters<typeof sample>) => round(sample(...args));
  return {
    cornice: pixel(77.065,-132.142,25.5,'cornice',[.96,0,-.27],[.5,.5]),
    pavilion: [25.9, 27.3, 28.28, 28.45, 32, 35.95].map(h => pixel(77.065,-132.142,h,'stone')),
    centre: pixel(84.127,-106.712,27.3,'stone'),
    centreEdge: pixel(87.127,-106.712,27.3,'stone'),
    dormer: pixel(81.5,-115,27.4,'stone',[.96,0,-.27],[.5,.5]),
    dormerPediment: pixel(81.5,-115,29.2,'roofDeck'),
    dormerPitch: pixel(81.5,-115,29.2,'slate',[.59,.7875,-.20]),
    pane: pixel(77,-132,28.1,'pane',[.96,0,-.27],[.5,.5]),
    eastDrum: pixel(74,-136,27.45,'stone',[.96,0,-.27],[.5,.5]),
    westDrum: pixel(26,-120,28.66,'stone'),
  };
}

function atticWall(sample: ReturnType<typeof stone>) {
  const heights = [22.2, 23.35, 23.75, 24.3, 25.4];
  return [[77.065,-132.142], [84.127,-106.712], [87.127,-106.712]].map(([x,z]) =>
    heights.map(height => sample(height, x, z)));
}

test('Balmoral cornice, gables up to the pediment tops, dormers and turret drums match main at night', () => {
  glow.setLevel(1);
  const sample = atticTrim(trim(shader(materials[1]!).fragmentShader));
  assert.deepEqual(sample, {
    cornice: [244,194,113], pavilion: [[240,190,106],[221,171,95],[217,165,89],[216,164,88],[197,141,70],[173,116,55]],
    centre: [221,171,95], centreEdge: [221,171,95], dormer: [221,171,95], dormerPediment: [238,204,145],
    dormerPitch: [216,162,84], pane: [222,171,90], eastDrum: [222,173,97], westDrum: [202,147,74],
  });
});

test('Balmoral top facade has main’s night gradient across the pavilion and central bay', () => {
  glow.setLevel(1);
  const sample = atticWall(stone(shader(materials[0]!).fragmentShader));
  assert.deepEqual(sample.map(row => row.map(round)), [
    [[33,27,23],[191,144,104],[228,187,138],[230,190,140],[212,173,128]],
    [[33,27,23],[191,145,104],[228,187,138],[230,190,140],[212,173,128]],
    [[33,27,23],[190,144,104],[228,187,138],[230,190,140],[212,173,128]],
  ]);
});

test('Balmoral balcony lighting is sharp at both storey edges', () => {
  glow.setLevel(1);
  const sample = stone(shader(materials[0]!).fragmentShader);
  const heights = [8.10, 8.48, 10.5, 11.96, 12.25, 14.2, 17.8, 21.3];
  const readings = heights.map(height => sample(height));
  const glass = [9.5, 10.5, 11.5].map(height => round(sample(height, 58, -132, [.025,.032,.042])));
  assert.deepEqual(glass, [[46,36,31], [14,7,6], [4,3,3]]);
  console.log('balcony and wall by height', heights.map((h, i) => [h, round(readings[i]!), Math.round(luma(readings[i]!))]));
  const [below, bottom, core, top, above, ...midWall] = readings.map(luma);
  assert.ok(bottom! - below! > 100 && top! - above! > 100);
  assert.ok(Math.abs(bottom! - core!) < 24 && Math.abs(top! - core!) < 24);
  assert.ok(midWall.every(value => value < 36));
  assert.deepEqual(readings.slice(-3).map(round), [[37,28,23], [33,27,23], [32,26,22]]);
  assert.ok(readings[2]![0]! - readings[2]![1]! > 48);
});

test('Balmoral bands and glazing stay below luma 245 with bright stone and pane samples', () => {
  glow.setLevel(1);
  const roof = trim(shader(materials[1]!).fragmentShader);
  const wall = stone(shader(materials[0]!).fragmentShader);
  const samples = [roof(84.127,-106.712,27.3,'stone'), roof(84.127,-106.712,25.5,'cornice'),
    roof(77,-132,28.1,'pane'), wall(24.3,84.127,-106.712,[.65,.57,.45]), wall(10.5,58,-132,[.65,.57,.45])];
  console.log('bright surfaces luma', samples.map(sample => Math.round(luma(sample))));
  assert.ok(samples.every(sample => luma(sample) <= 245));
  assert.ok(luma(samples[4]!) > 200, 'bright balcony stone keeps the stronger storey wash with headroom');
});

test('Balmoral changes activate only at night and restore the exact day and Perth receipts', () => {
  const fingerprint = (material: THREE.Material) => {
    const { vertexShader, fragmentShader } = shader(material);
    return sha(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
  };
  glow.setLevel(0);
  const day = materials.map(fingerprint);
  const keys = materials.map(material => material.customProgramCacheKey());
  assert.deepEqual(day, [
    '3b5095bbe90dd8c8b35f7010fb3ecabc553bd1fede29d7f4b409ac2583354ede',
    '4aeb4eb21d33b24a62859a04a74b833e236572ccd4d079703f9401e0c05466ec',
  ]);
  glow.setLevel(.003);
  assert.deepEqual(materials.map(fingerprint), day);
  glow.setLevel(1);
  assert.ok(shader(materials[1]!).fragmentShader.includes('// balmoral-roofline-begin'), 'night uses the altered roofline');
  glow.setLevel(0);
  assert.deepEqual([facade.material, structure.material], materials);
  assert.deepEqual(materials.map(fingerprint), day);
  assert.deepEqual(materials.map(material => material.customProgramCacheKey()), keys);
  for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
    assert.equal(sha(JSON.stringify(remoteWeatherSnapshot('pt', state, true))), receipts[`pt/${state}`]);
  }
});
