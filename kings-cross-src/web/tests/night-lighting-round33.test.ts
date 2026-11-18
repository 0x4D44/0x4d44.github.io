import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { createMaterials } from '../src/kxcentral.ts';
import { WIN_NIGHT_GLSL } from '../src/materials.ts';
import { lightWaverleyNight } from '../src/station-weather.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl, type Value } from './glsl.ts';
import receipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const city = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(city.group, .60);
const glow = createWaverleyGlow(city.group);
const facade = 'waverley-balmoral-facade';
const walls = 'waverley-building-walls';
const ashlar = 'waverley-building-ashlar';
const tops = 'waverley-building-tops';
const monuments = 'waverley-city-monuments';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const display = (rgb: readonly number[]) => toSrgb(acesFilmic(rgb as V3, 2.3)).map(c => c*255);
after(() => { glow.dispose(); undo(); city.dispose(); });

function mesh(name: string): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const found = city.group.getObjectByName(name);
  assert.ok(found instanceof THREE.Mesh, name);
  return found;
}
function shader(material: THREE.Material) {
  const lib = material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const source = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}
function fingerprint(material: THREE.Material) {
  const { vertexShader, fragmentShader } = shader(material);
  return hash(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
}
function block(source: string, tag: string) {
  const start = source.indexOf(`// ${tag}-begin`);
  return start < 0 ? '' : source.slice(source.indexOf('\n', start), source.indexOf(`// ${tag}-end`, start)).replace(/^\s*#.*$/gm, '');
}
function evaluate(name: string, tag: string, vars: Record<string, Value>, span = [.03, .025]) {
  const source = shader(mesh(name).material).fragmentShader;
  const declarations = source.split('#include <common>')[1]!.split('#include')[0]!.replace(/^\s*#.*$/gm, '');
  const env = { vars: { totalEmissiveRadiance: [0, 0, 0], uStationLampLevel: 1, ...vars }, fns: { fwidth: () => span } };
  new Glsl(declarations).run(block(source, tag), env);
  return env.vars.totalEmissiveRadiance as number[];
}

test('Balmoral east-end patch has about half amber panes across five storeys and occupied ground arches', () => {
  glow.setLevel(1);
  const rows = [6.25, 10.50, 14.20, 17.80, 21.30];
  const base = new Glsl(WIN_NIGHT_GLSL);
  const material = mesh(facade).material;
  const hasRooms = !!block(shader(material).fragmentShader, 'balmoral-amber-rooms');
  function pane(bay: number, height: number, light = 1, u = .45) {
    if (!hasRooms) {
      const intensity = Number(material.defines!.WIN_GAIN);
      if (height < 8.7) return [0, 0, 0];
      return (base.call('winTile', [[bay+u, (height-8.7)/3.65], [.03, .025], .5, light,
        [.32,.68,.17,.77], [.60,0,.12,.1], 1], { vars: {} }) as number[]).map(value => value*intensity);
    }
    return evaluate(facade, 'balmoral-amber-rooms', {
      hotelHeight: height, vMapUv: [bay+u, (height+18)/43.5], uWinNight: light,
      sampledDiffuseColor: [.025,.032,.042,1],
    });
  }
  const patch = rows.map(height => [52,53,54,55].map(bay => pane(bay,height)));
  const lit = patch.flat().filter(rgb => luma(rgb) > .08);
  assert.ok(lit.length >= 9 && lit.length <= 11, `${lit.length}/20 windows`);
  assert.ok(patch.every(row => row.some(rgb => luma(rgb) > .08) && row.some(rgb => luma(rgb) < .005)));
  assert.ok(new Set(patch.map(row => row.map(rgb => + (luma(rgb) > .08)).join(''))).size >= 4);
  for (const rgb of lit.map(display)) {
    assert.ok(rgb[0]! - rgb[1]! > 12 && rgb[1]! - rgb[2]! > 22 && luma(rgb) < 235, rgb.join(', '));
  }
  assert.ok([52,53,54,55].some(bay => luma(pane(bay,2.15)) > .08));
  assert.deepEqual(pane(52,8.5), [0,0,0]);
  assert.deepEqual(pane(53,17.8,0), [0,0,0]);
  assert.deepEqual(pane(53,17.8,1,.78), [0,0,0]);
  assert.ok(patch[4]!.filter(rgb => luma(rgb) > .08).length >= 2, 'top floor has an occupied bay away from the corner');
});

test('Waverley night programs restore the original day materials and KX and Perth keep their main receipts', () => {
  const targets = [facade,walls,ashlar,tops,monuments].map(mesh);
  const materials = targets.map(target => target.material);
  glow.setLevel(0);
  const day = materials.map(fingerprint);
  assert.deepEqual(day, [
    '3b5095bbe90dd8c8b35f7010fb3ecabc553bd1fede29d7f4b409ac2583354ede',
    '0aab669a9be27bf6ec5380851048a71bbec6478f17471fafbcdeaf66a8d26bf9',
    '3f984952ca2cf4844e5731727c152c6db8e69bf97036121dc638569362e7f4ba',
    '3f984952ca2cf4844e5731727c152c6db8e69bf97036121dc638569362e7f4ba',
    '3f984952ca2cf4844e5731727c152c6db8e69bf97036121dc638569362e7f4ba',
  ]);
  glow.setLevel(1);
  assert.match(shader(materials[0]!).fragmentShader, /balmoral-amber-rooms-begin/);
  glow.setLevel(0);
  assert.ok(targets.every((target,i) => target.material === materials[i]));
  assert.deepEqual(materials.map(fingerprint), day);
  const kx = createMaterials();
  try {
    const material = kx.table.timber;
    assert.equal(fingerprint(material), '996f504cb2d9e36754209f01a07f43891ba8a23888d566e0bd00cc5ce368aa65');
  } finally { kx.owned.forEach(material => material.dispose()); }
  for (const state of ['clear','rain','fog','snow'] as const) {
    assert.equal(hash(JSON.stringify(remoteWeatherSnapshot('pt',state,true))), receipts[`pt/${state}`]);
  }
});
