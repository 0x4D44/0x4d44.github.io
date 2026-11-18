import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import { landmarkPlans } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import kxData from '../src/data/kx-track.json' with {type:'json'};
import wvData from '../src/data/waverley-scene.json' with {type:'json'};
import { midlandGeometry } from '../src/landmarks.ts';
import { addRoofShade } from '../src/lighting.ts';
import { litPane, MIDLAND_PANE_GLSL, PANE_UV } from '../src/materials.ts';
import { lightPerthNight, lightWaverleyNight } from '../src/station-weather.ts';
import { buildWaverleyCity } from '../src/waverley-city.ts';
import { buildWaverleyFrontage } from '../src/waverley-frontage.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { Glsl } from './glsl.ts';

type RGB = [number, number, number];
type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
const zero: RGB = [0, 0, 0];
const luma = ([r, g, b]: RGB) => .2126*r + .7152*g + .0722*b;
const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
const glsl = new Glsl('');
const meshNamed = (group: THREE.Object3D, name: string) => group.getObjectByName(name) as Mesh;
const castleName = 'waverley-city-monuments';
const towerName = 'waverley-balmoral-tower';
const bridgeName = 'waverley-frontage-structure';
const castleAlbedo: RGB = [.47, .43, .40];

function shader(material: THREE.MeshLambertMaterial) {
  const {vertexShader, fragmentShader} = THREE.ShaderLib.lambert!;
  const s = {vertexShader, fragmentShader, uniforms: {} as Record<string, THREE.IUniform>};
  material.onBeforeCompile(s as never, undefined as never);
  return s;
}

const ground = {heightAt: () => 16, rangeUnder: () => ({min: 0, max: 0, mean: 0})};
function frontage() {
  const part = buildWaverleyFrontage(ground);
  const castle = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  castle.name = castleName;
  part.group.add(castle);
  const glow = createWaverleyGlow(part.group);
  return {group: part.group, dispose() {
    glow.dispose();
    castle.geometry.dispose();
    castle.material.dispose();
    part.dispose();
  }};
}

function emission(mesh: Mesh, tag: string, point: RGB, normal: RGB, albedo: RGB, {
  level = 1, fog = 0, depth = 1150, u = .5, deck = 15,
} = {}): RGB {
  const {fragmentShader} = shader(mesh.material);
  const snippet = fragmentShader.split(`// ${tag}-begin`)[1]?.split(`// ${tag}-end`)[0];
  const env = {vars: {
    vStationLampWorld: point, vStationLampNormal: normal, diffuseColor: [...albedo, 1],
    totalEmissiveRadiance: [...zero], uStationLampLevel: level, uStationLampFog: fog,
    fogNear: -17, fogFar: 220, vFogDepth: depth, vBalmoralTowerU: u, vNorthBridgeDeck: deck,
  }};
  if (snippet) glsl.run(snippet.replace(/^\s*#.*$/gm, ''), env);
  return env.vars.totalEmissiveRadiance as RGB;
}

test('Castle summit masonry is stone-gold and the lit face separates from the shaded face', () => {
  const f = frontage();
  try {
    const mesh = meshNamed(f.group, castleName);
    const at = (normal: RGB, position: RGB = [-640,78,355]) => emission(mesh,'castle-wash',position,normal,castleAlbedo);
    const front = at([.65,0,-.75]), side = at([-.65,0,.75]), roof = at([0,1,0]);
    console.log('Castle linear emission', {front:luma(front), side:luma(side), roof:luma(roof), redBlue:front[0]/front[2]});
    assert.ok(front[0]/front[2] > 2 && front[0] > front[1] && front[1] > front[2]);
    assert.ok(luma(front) > 1.8*luma(side) && luma(front) > .19);
    assert.ok(luma(roof) < luma(front)*.22);
    assert.deepEqual(at([0,0,-1], [-640,47,355]), zero);
    assert.deepEqual(at([0,0,-1], [-400,78,355]), zero);
  } finally { f.dispose(); }
});

test('Castle floodlight loses its bright distant edge in dense fog while near and clear light survives', () => {
  const f = frontage();
  try {
    const mesh = meshNamed(f.group, castleName);
    const at = (fog: number, depth: number) => luma(emission(mesh,'castle-wash',[-640,78,355],[0,0,-1],castleAlbedo,{fog,depth}));
    // Round 14 retains 12% of a distant receiver's display contrast against the ridge haze.
    const clear = at(0,1150), far = at(.896,1150), near = at(.896,20);
    console.log('Castle fog emission', {clear, far, near, farRetained:far/clear});
    assert.ok(clear > .15 && near > .9*clear);
    assert.equal(far, 0, 'the skyline relief must not retain floodlight after the fog is opaque');
    assert.equal(at(.1,1150), clear, 'clear and light haze retain the architectural wash');
  } finally { f.dispose(); }
});

test('Balmoral base and stone quoins catch the uplight, with a softer shaft and a visible clock stage', () => {
  const f = frontage();
  try {
    const mesh = meshNamed(f.group, towerName), base = f.group.userData.frontage.P;
    const at = (height:number, u=.5) => luma(emission(mesh,'balmoral-tower-wash',[0,base+height,0],[0,0,-1],[.48,.39,.29],{u}));
    const band = [28,35,39,44,48.5].map(h=>at(h));
    const quoins = [at(29.25,.025),at(29.25,.975),at(29.25)];
    console.log('Balmoral shaft and stage linear emission', band, 'left quoin, right quoin, face', quoins);
    assert.ok(band[0]! > 2.45*band[2]! && band[1]! > band[2]!);
    assert.ok(quoins[0]! > 1.25*quoins[2]! && quoins[1]! > 1.25*quoins[2]!);
    assert.ok(band[3]! > .09 && band[4]! > .065 && band[3]! < band[0]!);
    assert.equal(at(52),0, 'the magenta cap has its separate light');
  } finally { f.dispose(); }
});

test('the station-facing flanking block has mixed rooms within every floor of its slit windows', () => {
  const east = 'way/62065007', west = 'way/81357301';
  const {buildings} = unpackWaverleyScene(wvData);
  const part = buildWaverleyCity({buildings: buildings.filter(b=>b.id===east || b.id===west)},ground);
  const undo = lightWaverleyNight(part.group);
  try {
    const walls = meshNamed(part.group,'waverley-building-walls'), positions = walls.geometry.getAttribute('position');
    const attributes = walls.geometry.getAttribute('wallWindowData');
    const i = Array.from({length:positions.count},(_,i)=>i).find(i=>positions.getX(i)>90 && positions.getZ(i)<-70)!;
    const profile = [attributes.getX(i),attributes.getY(i)];
    const {fragmentShader} = shader(walls.material);
    const start = fragmentShader.indexOf('float winHash(');
    const end = fragmentShader.indexOf('\n}', fragmentShader.indexOf('vec3 waverleyWindowLight('))+2;
    const program = new Glsl(fragmentShader.slice(start,end));
    const rows = Array.from({length:7},(_,y)=>Array.from({length:26},(_,x)=>{
      return program.call('waverleyWindowLight',[[12.5+x,3.56+y],[.025,.02],profile,90,1],{vars:{}}) as RGB;
    }));
    const counts = rows.map(row=>row.filter(c=>luma(c)>.02).length);
    const panes = rows.flat().filter(c=>luma(c)>.02);
    const mean = panes.reduce((sum,c)=>sum+luma(c),0)/panes.length;
    console.log('Flanking slit windows', {profile, counts, lit:panes.length/182, mean});
    assert.ok(spread(counts) <= 11 && Math.min(...counts) >= 5 && Math.max(...counts) <= 19);
    assert.ok(panes.length/182 >= .32 && panes.length/182 <= .55 && mean < .24);
    assert.ok(panes.some(([r,,b])=>r>b) && panes.some(([r,,b])=>b>r));
    assert.deepEqual(program.call('waverleyWindowLight',[[12.5,3.56],[.025,.02],profile,90,0],{vars:{}}),zero);
  } finally { undo(); part.dispose(); }
});

test('North Bridge arches and piers catch two warm washes confined to their existing batch', () => {
  const f = frontage();
  try {
    const structure = meshNamed(f.group,bridgeName), position = structure.geometry.getAttribute('position');
    const arch = structure.geometry.getAttribute('northBridgeDeck');
    const at = (point:RGB, normal:RGB, deck=15) => emission(structure,'north-bridge-wash',point,normal,[.21,.17,.13],{deck});
    const archLight = at([135,10.8,4],[-1,0,0]), pier = at([135,4.8,21],[-1,0,0]);
    const underside = at([135,9,3],[0,-1,0]), unrelated = at([135,10.8,4],[-1,0,0],0);
    console.log('North Bridge linear emission', {arch:luma(archLight), pier:luma(pier), underside:luma(underside)});
    assert.ok([archLight,pier,underside].every(c=>luma(c)>.015 && c[0]>c[1] && c[1]>c[2]));
    assert.deepEqual(unrelated,zero);
    assert.ok(arch && arch.count===position.count);
    const marked = Array.from(arch.array).filter(y=>y>0).length;
    assert.ok(marked > 1000 && marked < arch.count, 'the bridge shares a draw with unlit geometry');
  } finally { f.dispose(); }
});

function midlandPanes() {
  const material = litPane(new THREE.MeshLambertMaterial(),true);
  const {fragmentShader} = shader(material);
  material.dispose();
  const start = fragmentShader.indexOf('float winHash(');
  const end = fragmentShader.indexOf('#include', start);
  const body = fragmentShader.split('#include <map_fragment>')[1]!.split('#include')[0]!;
  const run = new Glsl(fragmentShader.slice(start,end)).snippet(
    body.replace(/fwidth\(.*\);/, 'vec2(0.02);').replaceAll('WIN_GAIN','1.0'));
  return (id:number,night:number) => {
    const vars = {vWinUv:[id+.5,-1.55],uWinNight:night,totalEmissiveRadiance:[...zero]};
    run({vars});
    return vars.totalEmissiveRadiance as RGB;
  };
}

test('the built Midland upper panes trim occupancy and vary warmth and brightness', () => {
  const pane = midlandGeometry(landmarkPlans(kxData as unknown as KxData).midland).pane!;
  const ids = new Set<number>();
  for (let i=0;i<pane.uvs.length;i+=2) {
    if (pane.uvs[i+1]!<0 && pane.uvs[i]!<PANE_UV.numbers) ids.add(Math.floor(pane.uvs[i]!));
  }
  const sample = midlandPanes(), lit = [...ids].map(id=>sample(id,1)).filter(c=>luma(c)>0);
  const warm = lit.map(([r,,b])=>b/r);
  const arcade = sample(PANE_UV.numbers,1);
  console.log('Midland upper panes', {lit:lit.length,total:ids.size,share:lit.length/ids.size,
    lumaSpread:spread(lit.map(luma)),warmthSpread:spread(warm),medianBlueRed:warm.sort((a,b)=>a-b)[Math.floor(warm.length/2)],arcade:luma(arcade)});
  // This is the full UV bank, including rear elevations and rooms too small
  // to resolve. The Euston Road image probe measures the visible facade.
  assert.ok(lit.length/ids.size >= .2025 && lit.length/ids.size <= .205);
  assert.ok(spread(warm) > .44 && spread(lit.map(luma)) > .20 && Math.max(...warm) > .54);
  assert.ok(Math.abs(luma(arcade)-.08943796921894558)<1e-9 && arcade[0]>arcade[1] && arcade[1]>arcade[2]);
});

test('day changes contribute exactly zero and Perth keeps its shader and window program bytes', () => {
  const f = frontage();
  const scene = new THREE.Group(), material = new THREE.MeshLambertMaterial({map:new THREE.Texture()});
  addRoofShade(material);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(),material);
  walls.name = 'perth-city-walls';
  scene.add(walls);
  const undo = lightPerthNight(scene);
  try {
    for (const [name,tag] of [[castleName,'castle-wash'],[towerName,'balmoral-tower-wash'],[bridgeName,'north-bridge-wash']] as const) {
      const point:RGB = name===castleName?[-640,78,355]:[135,name===towerName?44:9,4];
      assert.deepEqual(emission(meshNamed(f.group,name),tag,point,[-1,0,0],castleAlbedo,{level:0,fog:.896,u:.025}),zero);
    }
    for (const id of [10,PANE_UV.numbers+10]) assert.deepEqual(midlandPanes()(id,0),zero);
    const {fragmentShader,vertexShader} = shader(material);
    const digest = createHash('sha256').update(vertexShader).update(fragmentShader)
      .update(JSON.stringify(material.defines)).digest('hex');
    const reflectionDigest = createHash('sha256').update(MIDLAND_PANE_GLSL).digest('hex');
    assert.equal(digest,'4b8ae371289c9462a3b5e26b238120b13080ac0783b8eff941871b9c8cb8246b');
    assert.equal(reflectionDigest,'b6c76cc9367e5d37f18edf389d4c7759e67b541bfba8c82e2f3eac9d5c0afb50');
    const tower = meshNamed(f.group,towerName);
    const at = (u:number) => luma(emission(tower,'balmoral-tower-wash',[0,44,0],[0,0,-1],castleAlbedo,{u}));
    assert.ok(at(.025)>at(.5),'the day control exercises a quoin that is lit at night');
  } finally {
    undo(); walls.geometry.dispose(); material.map!.dispose(); material.dispose(); f.dispose();
  }
});
