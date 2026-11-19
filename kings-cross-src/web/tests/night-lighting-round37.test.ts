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

function trim(source: string) {
  const evaluate = glsl.snippet(block(source, 'balmoral-trim'));
  return (x: number, z: number, height: number, colour: keyof typeof BALMORAL_COLOURS,
    normal = [.96, 0, -.27], uv = [0, 0], level = 1) => {
    const albedo = rgb(BALMORAL_COLOURS[colour]);
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

test('Balmoral roofline is dark above the lit attic faces, with a lit dormer pane', () => {
  glow.setLevel(1);
  const sample = trim(shader(materials[1]!).fragmentShader);
  const roof = sample(80, -120, 29.4, 'slate', [.75,.60,-.25]);
  const stack = sample(84, -103, 36, 'stone', [.96,0,-.27], [.5,.5]);
  const dormer = sample(81.5, -115, 27.4, 'stone', [.96,0,-.27], [.5,.5]);
  const pediment = sample(77, -132, 32, 'stone');
  const pane = sample(77, -132, 28.1, 'pane', [.96,0,-.27], [.5,.5]);
  console.log('roofline RGB', [roof, stack, dormer, pediment, pane].map(round));
  for (const surface of [roof, stack, dormer, pediment]) assert.ok(luma(surface) < 65);
  assert.ok(luma(pane) > 115 && luma(pane) < 210);
});

test('Balmoral attic gable lights stop at one storey and give central bays paler cream', () => {
  glow.setLevel(1);
  const sample = trim(shader(materials[1]!).fragmentShader);
  const pavilion = sample(77.065, -132.142, 27.3, 'stone');
  const centre = sample(84.127, -106.712, 27.3, 'stone');
  const above = sample(84.127, -106.712, 28.9, 'stone');
  const features = frontage.userData.frontage.hotel.features as { kind: string; x: number; z: number }[];
  assert.ok(features.some(({kind,x,z}) => kind === 'gable' && Math.hypot(x-84.127,z+106.712) < .002));
  assert.ok(features.some(({kind,x,z}) => kind === 'gable' && Math.hypot(x-77.065,z+132.142) < .002));
  console.log('attic RGB', [pavilion, centre, above].map(round));
  const wall = stone(shader(materials[0]!).fragmentShader);
  const topEdge = [23.35, 23.75].map(height => luma(wall(height)));
  console.log('lower attic edge luma', topEdge.map(Math.round));
  assert.ok(pavilion[0]! - pavilion[1]! > 50 && pavilion[1]! - pavilion[2]! > 48);
  assert.ok(centre[1]! > pavilion[1]!+42 && centre[2]! > pavilion[2]!+88);
  assert.ok(luma(centre) > 205 && luma(centre) < 235);
  assert.ok(luma(centre) - luma(above) > 125);
  assert.ok(topEdge[1]! - topEdge[0]! > 100);
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
  assert.ok(samples[0]![2]! > 185 && samples[1]![2]! > 180, 'the cream band reaches both attic stone and cornice');
});

test('round 37 activates only for Balmoral night and restores the exact day and Perth receipts', () => {
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
