import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { addRoofShade } from '../src/lighting.ts';
import { lightPerthNight, lightWaverleyNight } from '../src/station-weather.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { Glsl } from './glsl.ts';

type RGB = [number, number, number];
const zero: RGB = [0, 0, 0];
const luma = ([r, g, b]: RGB) => .2126*r + .7152*g + .0722*b;
const names = {
  tower: 'waverley-balmoral-tower', dial: 'waverley-balmoral-clock-dials',
  walls: 'waverley-building-walls', scott: 'waverley-scott-monument',
  castle: 'waverley-city-monuments', perth: 'perth-city-walls',
};

function fixture(waverley = true) {
  const scene = new THREE.Group();
  const frontage = new THREE.Group();
  frontage.name = 'waverley-frontage';
  frontage.userData.frontage = {P: 0};
  scene.add(frontage);
  const add = (name: string, y: number, h: number) => {
    const geometry = new THREE.BoxGeometry(12, h, 12);
    const material = new THREE.MeshLambertMaterial({map: new THREE.Texture()});
    addRoofShade(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.name = name;
    frontage.add(mesh);
    return mesh;
  };
  const tower = add(names.tower, 37.35, 23.7);
  const dial = add(names.dial, 45, 3.2);
  const walls = add(names.walls, 15, 30);
  walls.geometry.setAttribute('wallWindowData', new THREE.Float32BufferAttribute(
    Array(walls.geometry.getAttribute('position').count).fill([.273, 0]).flat(), 2));
  const scott = add(names.scott, 30.5, 61);
  const castle = add(names.castle, 70, 18);
  const perth = add(names.perth, 15, 30);
  const undo = waverley ? lightWaverleyNight(scene, .60) : lightPerthNight(scene);
  const glow = waverley ? createWaverleyGlow(scene) : undefined;
  return { tower, dial, walls, scott, castle, perth, dispose() {
    glow?.dispose();
    undo();
    for (const {geometry, material} of [tower, dial, walls, scott, castle, perth]) {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    }
  } };
}

type Surface = ReturnType<typeof fixture>['walls'];
function fragment(mesh: Surface): string {
  const s = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  mesh.material.onBeforeCompile(s as never, undefined as never);
  return s.fragmentShader;
}

function flood(mesh: Surface, xyz: RGB, level: number, tag?: string, albedo: RGB = [.48, .39, .29], normal: RGB = [0, 0, -1]): RGB {
  const shader = fragment(mesh);
  const originalFlood = shader.split('#ifdef FLOOD')[1]?.split('#endif')[0] ?? '';
  const term = /totalEmissiveRadiance \+= ([^;]+);/.exec(originalFlood)?.[1];
  const env = { vars: {
    vStationLampWorld: xyz, vStationLampNormal: normal, uStationLampLevel: level,
    vBalmoralTowerU: .5, uStationLampFog: 0, fogNear: 0, fogFar: 2200, vFogDepth: 0,
    totalEmissiveRadiance: [...zero], diffuseColor: [...albedo, 1],
  } };
  const glsl = new Glsl('');
  const define = mesh.material.defines?.FLOOD;
  if (term && typeof define === 'string') {
    env.vars.totalEmissiveRadiance = glsl.evaluate(term
      .replace('( cameraPosition - vViewPosition * mat3( viewMatrix ) ).y', 'height')
      .replaceAll('FLOOD', define), env, {height: xyz[1], uWinNight: level}) as RGB;
  }
  const authored = tag && shader.split(`// ${tag}-begin`)[1]?.split(`// ${tag}-end`)[0];
  if (authored) glsl.run(authored.replace(/^\s*#.*$/gm, ''), env);
  if (mesh.name === names.scott && !authored) {
    return albedo.map((c, i) => c*level*[.38,.23,.10][i]!) as RGB;
  }
  return env.vars.totalEmissiveRadiance as RGB;
}

function windowSampler(mesh: Surface) {
  const shader = fragment(mesh);
  const start = shader.indexOf('float winHash(');
  const custom = shader.includes('vec3 waverleyWindowLight(');
  const lastFunction = custom ? 'vec3 waverleyWindowLight(' : 'vec3 winPaneLit(';
  const end = shader.indexOf('\n}', shader.indexOf(lastFunction)) + 2;
  const glsl = new Glsl(shader.slice(start, end));
  const vector = (key: string) => String(mesh.material.defines?.[key]).match(/\( (.*) \)/)![1]!.split(', ').map(Number);
  const mode = vector('WIN_MODE'), rect = vector('WIN_RECT'), tile = vector('WALL_TILE');
  return {
    tile,
    at(x: number, y: number, seed: number, office: number, distance: number, night = 1): RGB {
      if (night <= .003) return [...zero];
      const width = [.012, .012];
      const light = custom
        ? glsl.call('waverleyWindowLight', [[x,y], width, [seed, office], distance, night], {vars:{}})
        : glsl.call('winTile', [[x,y], width, seed, night, rect, mode, 1], {vars:{}});
      return (light as RGB).map(c => c*Number(mesh.material.defines?.WIN_GAIN)) as RGB;
    },
  };
}

function windowReadings(sample: ReturnType<typeof windowSampler>, seeds: number[], office: number, distance: number) {
  const cells = seeds.flatMap(seed => Array.from({length: 120}, (_, i) => [i%24, 1+Math.floor(i/24), seed] as const));
  const lit = cells.filter(([x, y, seed]) => luma(sample.at(x+.5,y+.5,seed,office,distance)) > .015);
  const colours = lit.map(([x, y, s]) => sample.at(x+.5,y+.5,s,office,distance));
  const cool = colours.filter(([r,,b]) => b > r).length;
  const blobs = lit.slice(0, 12).map(([x,y,s]) => {
    let area = 0;
    for (let i=0; i<16; i++) for (let j=0; j<16; j++) {
      if (luma(sample.at(x+(i+.5)/16,y+(j+.5)/16,s,office,distance)) > .015) area++;
    }
    return area / 256 / (sample.tile[0]!/3 * sample.tile[1]!/3.6);
  }).sort((a,b)=>a-b);
  return {lit: lit.length, total: cells.length, share: lit.length/cells.length, cool,
    medianAreaM2: blobs[Math.floor(blobs.length/2)]!, meanLuma: colours.reduce((s,c)=>s+luma(c),0)/lit.length};
}

test('Balmoral shaft and clock stage carry gold up to the magenta cap; the dial stays brighter', () => {
  const f = fixture();
  try {
    const heights = [28, 35, 39, 44, 48.5];
    const light = heights.map(y => flood(f.tower, [0,y,0], 1, 'balmoral-tower-wash'));
    const dial = flood(f.dial, [0,45,0], 1, undefined, [1,.9,.72]);
    console.log('tower linear luma', light.map(luma), 'dial', luma(dial));
    assert.ok(light.every(c => luma(c) > .065 && c[0] > c[1] && c[1] > c[2]), 'each tower band reads as warm lit masonry');
    assert.ok(luma(light[0]!) > luma(light[2]!) * 1.25, 'shaft uplight falls off between the two sources');
    assert.ok(luma(dial) > 3*luma(light[3]!) && dial[2]/dial[0] > .5, 'readably white dial against the stage');
  } finally { f.dispose(); }
});

test('Calton city windows are small, dim and irregularly occupied, with both warm and cool panes', () => {
  const f = fixture();
  try {
    const readings = windowReadings(windowSampler(f.walls), [.125,.273,.531,.781], 0, 320);
    console.log('Calton model windows', readings);
    assert.ok(readings.medianAreaM2 >= .4 && readings.medianAreaM2 < 1.7, 'glowing panes have a plausible distant area in square metres');
    assert.ok(readings.share >= .20 && readings.share <= .30, 'about a quarter of the context windows glow');
    assert.ok(readings.meanLuma >= .045 && readings.meanLuma < .24, 'panes stay visible while yielding to facade floodlights');
    assert.ok(readings.cool / readings.lit >= .22 && readings.cool / readings.lit <= .52, 'mixed warm and cool rooms');
  } finally { f.dispose(); }
});

test('the station office frontage shows occupied cool-white floors among the sparser city bays', () => {
  const f = fixture();
  try {
    const sample = windowSampler(f.walls);
    const readings = windowReadings(sample, [.125,.273,.531,.781], 1, 230);
    const floors = Array.from({length: 5}, (_, row) =>
      Array.from({length: 24}, (_, x) => luma(sample.at(x+.5,row+1.5,.273,1,230))).filter(v=>v>.015).length);
    console.log('office model windows', readings, 'lit by floor', floors);
    assert.ok(readings.share >= .48 && readings.share <= .70, 'about three fifths of the station-facing office windows glow');
    assert.ok(readings.cool / readings.lit >= .70, 'most occupied offices are cool-white');
    assert.ok(Math.max(...floors) >= Math.min(...floors) + 8, 'the rows include a darker floor');
  } finally { f.dispose(); }
});

test('Scott Monument and Castle Rock masonry read as floodlit with restrained roofs and lower walls', () => {
  const f = fixture();
  try {
    const scott = luma(flood(f.scott,[0,17,0],1,'scott-monument-wash'));
    const castle = luma(flood(f.castle,[-640,78,355],1,'castle-wash'));
    const skirt = luma(flood(f.castle,[-640,47,355],1,'castle-wash'));
    const roof = luma(flood(f.castle,[-640,78,355],1,'castle-wash',[.48,.39,.29],[0,1,0]));
    const unrelated = flood(f.castle,[300,78,-300],1,'castle-wash');
    console.log('landmark linear luma', {scott, castle, skirt});
    assert.ok(scott > .15 && castle > .16 && skirt < castle*.25 && roof < castle*.25, 'the uplights pick out the monument and upper castle walls');
    assert.deepEqual(unrelated, zero, 'other monuments in the same material keep their own lighting');
  } finally { f.dispose(); }
});

test('the tower switches between its new night lighting and exact zero in daytime; Perth keeps its own shader', () => {
  const f = fixture(), p = fixture(false);
  try {
    for (const h of [28,35,44,48.5]) assert.deepEqual(flood(f.tower,[0,h,0],0,'balmoral-tower-wash'),zero);
    assert.deepEqual(flood(f.dial,[0,45,0],0),zero);
    assert.deepEqual(flood(f.scott,[0,17,0],0,'scott-monument-wash'),zero);
    assert.deepEqual(flood(f.castle,[-640,78,355],0,'castle-wash'),zero);
    assert.deepEqual(windowSampler(f.walls).at(.5,1.5,.273,0,320,0), zero);
    assert.match(fragment(f.walls), /if \( uWinNight > 0\.003 \) \{[\s\S]*waverleyWindowLight\( wv,/);
    assert.equal(p.perth.material.defines?.WALL_TILE, 'vec2( 1.0, 1.0 )');
    assert.equal(p.perth.material.defines?.WIN_MODE, 'vec4( 0.14, 0.5, 0.12, 0.18 )');
    assert.ok(!fragment(p.perth).includes('waverleyWindowLight'));
    assert.ok(p.tower.material.defines?.FLOOD === undefined);
    assert.ok(luma(flood(f.tower,[0,35,0],1,'balmoral-tower-wash'))>.065, 'the Waverley night control switches on the new wash');
  } finally { p.dispose(); f.dispose(); }
});
