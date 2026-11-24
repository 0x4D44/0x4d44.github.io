import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { facadeStyle, facadeTint } from '../../core/city.ts';
import { landmarkPlans } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { CLOCK_TOWER_HEIGHT, shedLayout } from '../../core/station.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { addKxCentral, createMaterials } from '../src/kxcentral.ts';
import { midlandGeometry, ROWS } from '../src/landmarks.ts';
import { addRoofShade, createSunShadow } from '../src/lighting.ts';
import { buildingNightMaterialsOf, cityMaterial, FACADE_GLASS, glassVaries, litPane, material, MIDLAND_PANE_GLSL, officeFacade, officeNightFog, PANE_UV, windowNight } from '../src/materials.ts';
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
  const code = body.replace(/#ifdef USE_COLOR([^]*?)#endif/g, (_match, branch: string) => defs.USE_COLOR === '' ? branch : '')
    .replace(/^\s*#(?:ifdef USE_MAP|endif)\b/gm, '');
  const defines = { ...material.defines, ...defs };
  return new Glsl(declarations).snippet(Object.entries(defines).reduce((source, [name, value]) =>
    typeof value === 'string' && value ? source.replaceAll(new RegExp('\\b'+name+'\\b', 'g'), value) : source, code));
}

function windows(material: THREE.Material, useColor: boolean) {
  const run = shaderPart(material, '#include <map_fragment>', useColor ? {USE_COLOR:''} : {});
  return (u: number, v: number, level = 1, seed = .72, span = [.02,.02], fog = 0, depth = 100, tint = [seed,.75,.8]): number[] => {
    const vars: Record<string, Value> = {uWinNight:level, uOfficeFog:fog, vViewPosition:[0,0,depth], vMapUv:[u,v], vColor:tint, vPlatform37Position:[-45.7+u*.223,-163.3-u*1.483],
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
  const coolShare = lit.filter(cool).length / lit.length;
  const blueRed = lit.map(([r,,b])=>b!/r!).sort((a,b)=>a-b);
  console.log('Midland palette', {coolShare, medianBlueRed:blueRed[Math.floor(blueRed.length/2)]});
  assert.ok(coolShare >= .01 && coolShare <= .08, 'very few occupied rooms are cool');
  assert.ok(blueRed[Math.floor(blueRed.length/2)]! < .26, 'the typical lamp reads amber');
  assert.ok(shares.every(s => s >= .09 && s <= .34));
  assert.ok(Math.max(...shares)-Math.min(...shares) > .035);
  assert.equal(farLit, lit.length, 'only the occupied pane emits even when it is subpixel');
});

test('office occupancy varies by building and occupied floors contain both bright and shaded bays', () => {
  const kx = createMaterials();
  try {
    for (const [key, material, u, v, hasColor] of [
      ['city', cityMaterial('glass'), .5, .53, true],
      ['Crick', kx.officesAtNight.get('curtain')!, .5, .55, false],
      ['Platform 37', kx.officesAtNight.get('timber')!, 1, .58, false],
    ] as const) {
      const sample = windows(material, hasColor);
      const groups = Array.from({length:16},(_,n) => Array.from({length:60},(_,y) =>
        Array.from({length:12},(_,x) => sample(x*(key === 'Platform 37' ? 2 : 1)+u,y+v,1,.63+n*.014))));
      const occupancy = groups.map(rows => mean(rows.map(row => Number(row.some(c=>luma(c)>.015)))));
      const active = groups.flat().filter(row => row.some(c => luma(c) > .015));
      const panes = active.flat().filter(c=>luma(c)>.015);
      const neutral = panes.filter(([r,g,b])=>hasColor
        ? b! >= .69*r! && r! > g! && g! > b!
        : r! >= .69*b! && b! > g! && g! > r!);
      const distinct = new Set(groups.map(rows=>rows.slice(0,12).map(row=>Number(row.some(c=>luma(c)>.015))).join('')));
      const filled = panes.length/(12*active.length);
      console.log(key, {litFloors:active.length, total:groups.flat().length, occupancy, filled, neutralShare:neutral.length/panes.length,
        meanLitLuma:mean(panes.map(luma)), patterns:distinct.size});
      assert.ok(filled >= .66 && filled <= .93, `${key}: occupied floors contain breaks in the lit bays`);
      assert.ok(mean(occupancy) >= .50 && mean(occupancy) <= .60, key);
      assert.ok(neutral.length / panes.length >= .82, key);
      assert.ok(mean(panes.map(luma)) < .205, `${key}: individual lit panes stay below the old office brightness`);
      assert.ok(distinct.size >= (hasColor ? 12 : 1), key);
      if (hasColor) assert.ok(Math.min(...occupancy) < .45 && Math.max(...occupancy) > .65, 'building occupancy varies');
    }
  } finally { kx.owned.forEach(m => m.dispose()); }
});

test('office mullions and dark floors stay distinct at capture-scale UV footprints', () => {
  const kx = createMaterials();
  try {
    for (const [key, material, u, v, hasColor] of [
      ['city', cityMaterial('glass'), .5, .53, true],
      ['Crick', kx.officesAtNight.get('curtain')!, .5, .55, false],
      ['Platform 37', kx.officesAtNight.get('timber')!, 1, .58, false],
    ] as const) {
      const sample = windows(material, hasColor);
      const at = (x:number,y:number,span = [.38,.18])=>luma(sample(x,y+v,1,.72,span));
      const floors = Array.from({length:18},(_,y)=>y);
      const lit = floors.filter(y=>at(u,y)>.04);
      const dark = floors.filter(y=>at(u,y,[.01,.01])===0);
      const gapRatio = mean(lit.map(y=>at(.02,y)/at(u,y)));
      const unresolvedDark = Math.max(...dark.map(y=>at(u,y,[.38,.48])));
      console.log(key, {probeFloors: lit, gapRatio, unresolvedDark});
      assert.ok(lit.length >= 4 && dark.length >= 4, key);
      assert.ok(gapRatio <= .30, `${key}: mullion luma stays below 30% of the pane at capture scale`);
      assert.equal(unresolvedDark,0,`${key}: minification cannot light an unoccupied floor`);
    }
  } finally { kx.owned.forEach(m => m.dispose()); }
});

test('dense fog suppresses distant office emission while nearby and clear panes still read', () => {
  const sample = windows(cityMaterial('glass'), true);
  const scale = [.22,.20], floor = Array.from({length:24},(_,y)=>y+.53).find(y=>luma(sample(.5,y,1,.72,scale))>.06)!;
  const l = (fog:number, depth:number)=>luma(sample(.5,floor,1,.72,scale,fog,depth));
  console.log('office fog', {clear:l(0,280), near:l(.9,20), far:l(.9,280), horizon:l(.9,360)});
  assert.ok(l(0,280)>.06 && l(.9,20)>.9*l(0,280), 'nearby and clear panes keep their emission');
  assert.ok(l(.9,280)<.12*l(0,280), 'dense fog eliminates at least 88% of distant office emission before display fog');
});

test('the forecourt pavilion keeps its previous night window schedule', () => {
  const pavilion = data.buildings.find(b=>b.id===234296717)!;
  assert.equal(facadeStyle(pavilion),'stock');
  const reference = glassVaries(new THREE.MeshLambertMaterial(), 'tile', FACADE_GLASS.stock);
  const base = windows(reference,true), pavilionWindow = windows(cityMaterial('stock'),true);
  const tint = facadeTint(pavilion.id);
  const cells = Array.from({length:26},(_,i)=>[i%13+.5,Math.floor(i/13)+.51] as const);
  const reads = (f:typeof base)=>cells.map(([x,y])=>f(x,y,1,.72,[.03,.03],0,40,[...tint]));
  try {
    const previous = reads(base), candidate = reads(pavilionWindow);
    console.log('forecourt pavilion lit panes', {previous:previous.filter(c=>luma(c)>0).length, candidate:candidate.filter(c=>luma(c)>0).length});
    assert.ok(previous.some(c=>luma(c)>.05));
    assert.deepEqual(candidate,previous,'the pavilion retains its original occupied panes and colours');
  } finally { reference.dispose(); }
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
    sample(p: number[], n: number[] = [0,0,1], level = 1, albedo = [.51,.42,.27]) {
      const vars = {vKxWashPos:p, vKxWashNormal:n, uWinNight:level, diffuseColor:[...albedo,1], totalEmissiveRadiance:[...zero]};
      run({vars});
      return vars.totalEmissiveRadiance;
    },
  };
}

function buildTexturedFront() {
  // Seed the source materials before buildShed first caches the night washes.
  for (const key of ['brickFoot', 'stoneFoot'] as const) {
    const day = material(key) as THREE.MeshLambertMaterial;
    const { map, aoMap } = day;
    const colour = new THREE.Texture(), occlusion = new THREE.Texture();
    day.map = colour;
    day.aoMap = occlusion;
    test.after(() => {
      day.map = map;
      day.aoMap = aoMap;
      colour.dispose();
      occlusion.dispose();
    });
  }
  return buildShed(layout);
}

const front = buildTexturedFront();
const nightWash = (name: string) =>
  frontWash(buildingNightMaterialsOf(front.getObjectByName(name) as THREE.Mesh)!.night);

test('front washes and office variants share every texture with their day material', () => {
  const assertTextures = (label: string, day: THREE.Material, night: THREE.Material) => {
    const slots: Record<string, unknown> = Object.fromEntries(Object.entries(night));
    for (const [slot, texture] of Object.entries(day)) {
      if (texture instanceof THREE.Texture) assert.ok(slots[slot] === texture, `${label} uses the original ${slot}`);
    }
  };
  for (const name of ['shed-front', 'tower-brick', 'tower-stone']) {
    const { day, night } = buildingNightMaterialsOf(front.getObjectByName(name) as THREE.Mesh)!;
    assert.ok((day as THREE.MeshLambertMaterial).map instanceof THREE.Texture, `${name} has a real map to compare`);
    assertTextures(name, day, night);
  }
  const map = new THREE.Texture(), aoMap = new THREE.Texture();
  const curtain = new THREE.MeshPhongMaterial({ map, aoMap });
  const timber = new THREE.MeshLambertMaterial({ map, aoMap });
  try {
    for (const [kind, day] of [['curtain', curtain], ['timber', timber]] as const) {
      const night = officeFacade(day, kind, [.1, .9, .2, .8], 1, .3);
      try {
        assertTextures(kind, day, night);
      } finally { night.dispose(); }
    }
  } finally {
    curtain.dispose(); timber.dispose(); map.dispose(); aoMap.dispose();
  }
});

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

test('the architectural wash models piers, clock stage and cornice while retaining brick-map contrast', () => {
  const wall = nightWash('shed-front'), tower = nightWash('tower-brick'), stone = nightWash('tower-stone');
  const near = luma(wall.sample([.5,3,0])), high = luma(wall.sample([.5,15,0]));
  const stage = luma(tower.sample([1.9,CLOCK_TOWER_HEIGHT-5.2,3.2]));
  const field = luma(tower.sample([0,21,3.2]));
  const cornice = luma(stone.sample([0,CLOCK_TOWER_HEIGHT-3,3.7]));
  const bright = [.51,.42,.27], dark = [.255,.21,.135];
  const mappedContrast = luma(wall.sample([.5,7,0],[0,0,1],1,bright))/luma(wall.sample([.5,7,0],[0,0,1],1,dark));
  console.log('KX wash modelling', {near,high, stage, field, cornice,mappedContrast});
  assert.ok(near > 2.7*high, 'the concentrated uplight falls along the piers');
  assert.ok(stage > .105 && stage > 5*field, 'the clock stage separates from the wall field');
  assert.ok(cornice > .125, 'the cornice catches its own bright wash');
  assert.ok(mappedContrast > 2.2, 'the wash preserves brick-map contrast when highlights approach the filmic shoulder');
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
    assert.equal(digest,'ac7ce3f206f7b0f045a3999ff3396fc63a80b4207714a09c10d9eb9c9774b1f4');
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
  const noon = '2026-11-20T12:00:00Z', dusk = '2026-11-20T22:30:00Z';
  const fog = weatherState(forcedObservation('fog'));
  let lateCentral: ReturnType<typeof addKxCentral> | undefined;
  const mast = ['shed-front', 'tower-brick', 'tower-stone'];
  const centralNames = ['kxcentral-curtain', 'kxcentral-timber'];
  const brick = material('brickFoot'), stone = material('stoneFoot');
  const facades = [...mast.map(name => shed.getObjectByName(name)), ...centralNames.map(name => central.group.getObjectByName(name))] as THREE.Mesh[];
  const activeMaterials = () => facades.map(mesh => mesh.material as THREE.Material);
  // Compiled hook source and defines from e4881457 with its atmosphere active.
  const dayPrograms = [
    '703909896996e9594c6fe823ae13b6733fc4ec09817874058af8c6ad9d33ebda',
    '703909896996e9594c6fe823ae13b6733fc4ec09817874058af8c6ad9d33ebda',
    '51326643e28752483b8f05ef316e5c517fb78b380625d9c1318ef724c2c12668',
    '2f34f2a6011d30e26949695b680ada384190ca1092ed72a5e4830fb4c941f74a',
    '14a5f2f8f60ad1d8e550e72aac67071e2b408eb4eafddc1586b8c1b25fa2365d',
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
    const original = activeMaterials();
    const tower = shed.getObjectByName('clock-tower')!;
    const dial = tower.children.find(o => o.type === 'Group')!.children.find(o =>
      (o as THREE.Mesh).geometry?.type === 'CircleGeometry') as THREE.Mesh;
    assert.ok(original[1]!.id < (dial.material as THREE.Material).id,
      'the tower brick must sort ahead of the dial in the opaque render list, as on main');
    assert.ok(original[0] === brick && original[1] === brick && original[2] === stone,
      'the front and tower still share the original brick/stone materials');
    assert.deepEqual(original.map(signature), dayPrograms,
      'daylight vertex and fragment source matches the ordinary materials including roof shade');
    at(dusk, 1000, fog);
    assert.ok(officeNightFog.value > .8, 'the London fog update supplies the office extinction level');
    const nightMaterials = activeMaterials();
    assert.ok(facades.every(mesh => mesh.material === buildingNightMaterialsOf(mesh)?.night),
      'the dusk update installs night variants before any rescan');
    shadows.tag();
    for (const [i, night] of nightMaterials.entries()) {
      const program = shader(night);
      assert.ok(night !== original[i] && program.uniforms.uWinNight === windowNight);
      assert.equal(program.fragmentShader.split('uniform float uWinNight;').length, 2);
      assert.ok(night.customProgramCacheKey().startsWith(original[i]!.customProgramCacheKey() + '+'));
      if (i !== 3) assert.ok(program.fragmentShader.includes('vec4 roofK = roofShade('));
      if (i >= 3) {
        assert.ok(program.uniforms.uSnowCover, 'office variants carry the original snow hook');
        assert.equal(program.uniforms.uOfficeFog, officeNightFog);
      }
      assert.equal(night.shadowSide, THREE.DoubleSide);
    }
    lateCentral = addKxCentral(scene, data);
    const lateOffice = lateCentral.group.getObjectByName('kxcentral-curtain') as THREE.Mesh;
    const late = buildingNightMaterialsOf(lateOffice)!;
    atmosphere.rescan();
    assert.ok(lateOffice.material === late.night, 'the first rescan at night lights a newly attached office');

    lateCentral.group.removeFromParent();
    atmosphere.rescan();
    assert.ok(lateOffice.material === late.day, 'rescanning after removal restores the detached office day material');

    at(noon, 2000);
    assert.ok(activeMaterials().every((m,i) => m === original[i]), 'restore the exact objects, keeping their material sort keys');
    assert.deepEqual(activeMaterials().map(signature), dayPrograms);
    assert.ok(activeMaterials().every(m => m.shadowSide === THREE.DoubleSide), 'either variant may be active at the first shadow scan');
    at(dusk, 3000, fog);
    assert.ok(lateOffice.material === late.day, 'subsequent dusk updates leave the detached office alone');
  } finally {
    shadows.dispose(); atmosphere.dispose(); central.dispose(); lateCentral?.dispose();
    windowNight.value = 0;
  }
});

