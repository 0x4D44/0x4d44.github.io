import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { landmarkPlans } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { CLOCK_TOWER_HEIGHT, shedLayout } from '../../core/station.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { addKxCentral, createMaterials } from '../src/kxcentral.ts';
import { midlandGeometry, ROWS } from '../src/landmarks.ts';
import { addRoofShade, createSunShadow } from '../src/lighting.ts';
import { buildingNightMaterialsOf, cityMaterial, litPane, material, MIDLAND_PANE_GLSL, PANE_UV, windowNight } from '../src/materials.ts';
import { lightPerthNight } from '../src/station-weather.ts';
import { buildShed } from '../src/shed.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { Glsl } from './glsl.ts';
import type { Value } from './glsl.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const zero = [0, 0, 0];
const luma = ([r, g, b]: number[]) => .2126*r! + .7152*g! + .0722*b!;
const cool = ([r,,b]: number[]) => b! > r!;
const mean = (xs: number[]) => xs.reduce((a,b) => a+b,0)/xs.length;

function shader(material: THREE.Material) {
  const lib = material.type === 'MeshPhongMaterial' ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return s;
}

function shaderPart(material: THREE.Material, begin: string, defs: Record<string, string> = {}) {
  const fragment = shader(material).fragmentShader;
  const declarations = fragment.split('#include <common>')[1]!.split('#include')[0]!;
  const body = fragment.split(begin)[1]?.split('#include')[0] ?? '';
  const code = body.replace(/#ifdef USE_COLOR([^]*?)#endif/, (_match, branch: string) => defs.USE_COLOR === '' ? branch : '')
    .replace(/^\s*#(?:ifdef USE_MAP|endif)\b/gm, '');
  const defines = { ...material.defines, ...defs };
  return new Glsl(declarations).snippet(Object.entries(defines).reduce((source, [name, value]) =>
    typeof value === 'string' && value ? source.replaceAll(new RegExp('\\b'+name+'\\b', 'g'), value) : source, code));
}

function windows(material: THREE.Material, useColor: boolean) {
  const run = shaderPart(material, '#include <map_fragment>', useColor ? {USE_COLOR:''} : {});
  return (u: number, v: number, level = 1, seed = .72, span = [.02,.02]): number[] => {
    const vars: Record<string, Value> = {uWinNight:level, vMapUv:[u,v], vColor:[seed,.75,.8],
      diffuseColor:[.3,.42,.6,1], totalEmissiveRadiance:[...zero]};
    run({vars, fns:{fwidth: () => span}});
    return vars.totalEmissiveRadiance as number[];
  };
}

function midland() {
  const material = litPane(new THREE.MeshLambertMaterial(), true);
  const run = shaderPart(material, '#include <map_fragment>');
  material.dispose();
  return (id: number, level = 1, span = .02) => {
    const vars = {vWinUv:[id+.5,-1.55], uWinNight:level, totalEmissiveRadiance:[...zero]};
    run({vars, fns:{fwidth: () => [span,span]}});
    return vars.totalEmissiveRadiance;
  };
}

function midlandRooms() {
  const pane = midlandGeometry(landmarkPlans(data).midland).pane!;
  const rooms = new Map<number, number>();
  for (let t=0; t<pane.indices.length; t+=3) {
    const indices = pane.indices.slice(t,t+3);
    const id = Math.floor(pane.uvs[2*indices[0]!]!);
    if (indices.some(i => pane.uvs[2*i+1]! >= -.5) || id >= PANE_UV.numbers) continue;
    const lowest = Math.min(...indices.map(i => pane.positions[3*i+1]!));
    rooms.set(id, Math.min(lowest, rooms.get(id) ?? Infinity));
  }
  return rooms;
}

test('Midland upper rooms are sparsely occupied, visibly warm and cool, and selective at overview scale', () => {
  const sample = midland(), rooms = midlandRooms();
  const lit = [...rooms.keys()].map(id => sample(id)).filter(c => luma(c) > 0);
  const shares = ROWS.map(([y]) => {
    const row = [...rooms].filter(([,base]) => Math.abs(base-y)<.05);
    return mean(row.map(([id]) => Number(luma(sample(id))>0)));
  });
  const farLit = [...rooms.keys()].filter(id => luma(sample(id,1,.7)) > 0).length;
  console.log('Midland', {total:rooms.size, lit:lit.length, cool:lit.filter(cool).length, shares, farLit,
    litLuma:[Math.min(...lit.map(luma)),Math.max(...lit.map(luma))]});
  assert.ok(lit.length / rooms.size >= .18 && lit.length / rooms.size <= .24);
  assert.ok(lit.filter(cool).length / lit.length >= .12 && lit.filter(cool).length / lit.length <= .28);
  assert.ok(shares.every(s => s >= .09 && s <= .34));
  assert.ok(Math.max(...shares)-Math.min(...shares) > .035);
  assert.equal(farLit, lit.length, 'only the occupied pane emits even when it is subpixel');
});

test('King’s Cross office floors switch on together and most glow cool white', () => {
  const kx = createMaterials();
  try {
    for (const [key, material, u, v, hasColor] of [
      ['city', cityMaterial('glass'), .5, .53, true],
      ['Crick', kx.officesAtNight.get('curtain')!, .5, .55, false],
      ['Platform 37', kx.officesAtNight.get('timber')!, .2, .58, false],
    ] as const) {
      const sample = windows(material, hasColor);
      const groups = Array.from({length:16},(_,n) => Array.from({length:60},(_,y) =>
        Array.from({length:12},(_,x) => sample(x+u,y+v,1,.63+n*.014))));
      const floors = groups.flat(), active = floors.filter(row => row.some(c => luma(c) > .01));
      const entire = active.filter(row => row.every(c => luma(c) > .01));
      const coolFloors = entire.filter(row => row.every(cool));
      const distinct = new Set(groups.map(rows=>rows.slice(0,12).map(row=>Number(luma(row[0]!)>.01)).join('')));
      const across = Array.from({length:60},(_,y)=>sample(u,y+v,1,.72,[.8,.08])).filter(c=>luma(c)>.001).length;
      console.log(key, {active:active.length, entire:entire.length, coolFloors:coolFloors.length, total:floors.length, patterns:distinct.size, across});
      assert.ok(entire.length / floors.length >= .50 && entire.length / floors.length <= .60, key);
      assert.equal(entire.length, active.length, key);
      assert.ok(coolFloors.length / entire.length >= .82, key);
      assert.ok(distinct.size >= (hasColor ? 12 : 1), key);
      assert.ok(across > 20 && across < 40, 'horizontal minification retains occupancy');
    }
  } finally { kx.owned.forEach(m => m.dispose()); }
});

test('street frontages have 20–30% warm panes across building tints', () => {
  for (const key of ['stock','red','stone'] as const) {
    const sample = windows(cityMaterial(key), true);
    const panes = Array.from({length:24},(_,n) => Array.from({length:8},(_,y) =>
      Array.from({length:16},(_,x) => sample(x+.5,y+.5,1,.55+n*.016)))).flat(2);
    const lit = panes.filter(c => luma(c) > .015);
    const warm = lit.filter(c => !cool(c));
    console.log(key, {lit:lit.length/panes.length, warm:warm.length/panes.length});
    assert.ok(warm.length / panes.length >= .20 && warm.length / panes.length <= .30);
    assert.ok(warm.length / lit.length >= .87);
  }
});

function frontWash(material: THREE.Material) {
  const { uniforms, fragmentShader } = shader(material);
  const declarations = fragmentShader.split('#include <common>')[1]!.split('#include')[0]!;
  const code = fragmentShader.split('#include <emissivemap_fragment>')[1]!.split('#include')[0]!;
  const run = new Glsl(declarations).snippet(code);
  return {
    level:uniforms.uWinNight,
    sample(p: number[], n: number[] = [0,0,1], level = 1) {
      const vars = {vKxWashPos:p, vKxWashNormal:n, uWinNight:level, diffuseColor:[.51,.42,.27,1], totalEmissiveRadiance:[...zero]};
      run({vars});
      return vars.totalEmissiveRadiance;
    },
  };
}

const meshMaterial = (group: THREE.Object3D, name: string) => (group.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>).material;
const front = buildShed(layout);
const nightWash = (name: string) =>
  frontWash(buildingNightMaterialsOf(front.getObjectByName(name) as THREE.Mesh)!.night);

test('an amber architectural wash lights the south piers and the clock stage', () => {
  const wall = nightWash('shed-front'), tower = nightWash('tower-brick');
  const stone = nightWash('tower-stone');
  const outer = wall.sample([.5,7,0]), between = wall.sample([8,7,0]), high = wall.sample([.5,20,0]);
  const foot = tower.sample([2.6,8,3.2]), middle = tower.sample([0,15,3.2]);
  const stage = tower.sample([1.9,CLOCK_TOWER_HEIGHT-5.2,3.2]);
  const cornice = stone.sample([0,CLOCK_TOWER_HEIGHT-3,3.7]);
  console.log('KX added linear luma', {outer:luma(outer),between:luma(between),high:luma(high),foot:luma(foot),
    middle:luma(middle),stage:luma(stage),cornice:luma(cornice)});
  assert.equal(wall.level, windowNight);
  assert.equal(tower.level, windowNight);
  assert.ok(luma(outer) > .06 && luma(outer) > 2.2*luma(between) && luma(high) < luma(outer));
  assert.ok(outer[0]! > outer[1]! && outer[1]! > 2*outer[2]!);
  assert.deepEqual(wall.sample([.5,7,-.5],[0,0,-1]), zero);
  assert.ok(luma(foot) > .055 && luma(stage) > .03 && luma(stage) > 1.3*luma(middle));
  assert.ok(luma(cornice) > .07);
});

test('KX night additions emit exactly zero by day and Perth keeps its compiled shader bytes', () => {
  const central = createMaterials();
  try {
    const crick = windows(central.officesAtNight.get('curtain')!,false);
    const litFloor = Array.from({length:12},(_,i)=>i+.55).find(v=>luma(crick(.5,v))>.01);
    assert.ok(litFloor !== undefined, 'the day control exercises glazing that also emits after dark');
    for (const level of [0,.003]) {
      assert.deepEqual(crick(.5,litFloor,level),zero);
      for (let y=0;y<8;y++) assert.deepEqual(windows(central.officesAtNight.get('timber')!,false)(.2,y+.55,level),zero);
    }
    for (const key of ['stock','glass'] as const) for (let y=0;y<8;y++) {
      assert.deepEqual(windows(cityMaterial(key),true)(.5,y+.5,0),zero);
    }
    for (const key of ['shed-front','tower-brick','tower-stone']) {
      assert.deepEqual(nightWash(key).sample([.5,29,3.2],[0,0,1],0),zero);
    }
    for (const id of [10,PANE_UV.numbers+10]) assert.deepEqual(midland()(id,0),zero);
  } finally { central.owned.forEach(m => m.dispose()); }
  const group = new THREE.Group(), material = new THREE.MeshLambertMaterial({map:new THREE.Texture()});
  addRoofShade(material);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(),material);
  walls.name = 'perth-city-walls';
  group.add(walls);
  const undo = lightPerthNight(group);
  try {
    const s = shader(material);
    const digest = createHash('sha256').update(s.vertexShader).update(s.fragmentShader)
      .update(JSON.stringify(material.defines)).digest('hex');
    assert.equal(digest,'4b8ae371289c9462a3b5e26b238120b13080ac0783b8eff941871b9c8cb8246b');
    assert.equal(createHash('sha256').update(MIDLAND_PANE_GLSL).digest('hex'),
      'b6c76cc9367e5d37f18edf389d4c7759e67b541bfba8c82e2f3eac9d5c0afb50');
  } finally { undo(); walls.geometry.dispose(); material.map!.dispose(); material.dispose(); }
});


test('daylight uses the original KX facade materials and programs, including after night fog', () => {
  const scene = new THREE.Scene();
  const shed = front, central = addKxCentral(scene, data);
  scene.add(shed);
  const world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
  const shadows = createSunShadow(scene, world.lights.sun);
  const camera = new THREE.PerspectiveCamera(), target = new THREE.Vector3(46, 5, -132);
  camera.position.set(260, 220, 90);
  const at = (time: string, wallMs: number, weather = CLEAR_STATE) =>
    atmosphere.update({ camera, target, timeMs: Date.parse(time), wallMs, weather });
  const noon = '2026-11-20T12:00:00Z';
  const mast = ['shed-front', 'tower-brick', 'tower-stone'];
  const centralNames = ['kxcentral-curtain', 'kxcentral-timber'];
  const brick = material('brickFoot'), stone = material('stoneFoot');
  const day = () => [...mast.map(name => meshMaterial(shed, name)), ...centralNames.map(name => meshMaterial(central.group, name))];
  // Compiled hook source and defines from e4881457 with its atmosphere active.
  const dayPrograms = [
    'b3da21edd89c15cbbab49f6b0a048c18bf89231a5cf2809dc735303805a06b81',
    'b3da21edd89c15cbbab49f6b0a048c18bf89231a5cf2809dc735303805a06b81',
    'db0652d41f016c7822e036c74bf38190f6a056c0f714766c0098bff495978164',
    '2f34f2a6011d30e26949695b680ada384190ca1092ed72a5e4830fb4c941f74a',
    '31339d94f79780676cd88109588d4c6688a9ce9df412f3e14899096cec91e135',
  ];
  const signature = (m: THREE.Material) => {
    const { vertexShader, fragmentShader } = shader(m);
    return createHash('sha256').update(vertexShader).update(fragmentShader)
      .update(JSON.stringify(m.defines ?? {})).digest('hex');
  };
  try {
    at(noon, 0);
    for (const key of ['stock', 'red', 'stone', 'glass'] as const) {
      const { vertexShader, fragmentShader } = shader(cityMaterial(key));
      const map = fragmentShader.split('#include <map_fragment>')[1]!.split('if ( uWinNight > 0.003 )')[0]!;
      const digest = createHash('sha256').update(vertexShader).update(map).digest('hex');
      assert.equal(digest, key === 'glass'
        ? 'ddf3a776cf6fa8313878996142a120948fc52125ddcdace5fd135bbb60278113'
        : '3b249371402aca6616330222b0b660c64ebae38c9dd0fdc2e8e2550ae7cb910c', key);
    }
    assert.equal(atmosphere.state()?.rig.lampLevel, 0);
    const original = day();
    const tower = shed.getObjectByName('clock-tower')!;
    const dial = tower.children.find(o => o.type === 'Group')!.children.find(o =>
      (o as THREE.Mesh).geometry?.type === 'CircleGeometry') as THREE.Mesh;
    assert.ok(original[1]!.id < (dial.material as THREE.Material).id,
      'the tower brick must sort ahead of the dial in the opaque render list, as on main');
    assert.ok(original[0] === brick && original[1] === brick && original[2] === stone,
      'the front and tower still share the original brick/stone materials');
    assert.deepEqual(original.map(signature), dayPrograms,
      'daylight vertex and fragment source matches the ordinary materials including roof shade');
    at('2026-11-20T22:30:00Z', 1000, weatherState(forcedObservation('fog')));
    shadows.tag();
    atmosphere.rescan();
    for (const [i, night] of day().entries()) {
      const program = shader(night);
      assert.ok(night !== original[i] && program.uniforms.uWinNight === windowNight);
      assert.equal(program.fragmentShader.split('uniform float uWinNight;').length, 2);
      assert.ok(night.customProgramCacheKey().startsWith(original[i]!.customProgramCacheKey() + '+'));
      if (i !== 3) assert.ok(program.fragmentShader.includes('vec4 roofK = roofShade('));
      if (i >= 3) assert.ok(program.uniforms.uSnowCover, 'office variants carry the original snow hook');
      assert.equal(night.shadowSide, THREE.DoubleSide);
    }
    at(noon, 2000);
    assert.ok(day().every((m,i) => m === original[i]), 'restore the exact objects, keeping their material sort keys');
    assert.deepEqual(day().map(signature), dayPrograms);
    assert.ok(day().every(m => m.shadowSide === THREE.DoubleSide), 'either variant may be active at the first shadow scan');
  } finally {
    shadows.dispose(); atmosphere.dispose(); central.dispose();
    windowNight.value = 0;
  }
});

