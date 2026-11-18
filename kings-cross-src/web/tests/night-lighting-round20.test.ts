import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { CityData } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import { createAtmosphere, surfaceUniforms } from '../src/atmosphere.ts';
import { addCity } from '../src/city.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { buildingNightMaterialsOf, cityMaterial, PANE_UV } from '../src/materials.ts';
import { createSignals } from '../src/signals.ts';
import type { OverlaySignal } from '../src/signals.ts';
import { createPlatformLamps, urbanLampOptions } from '../src/station-lamps.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { CLEAR_STATE } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { Glsl } from './glsl.ts';
import type { Value } from './glsl.ts';

const luma = (c: number[]) => .2126*c[0]! + .7152*c[1]! + .0722*c[2]!;
const mean = (values: number[]) => values.reduce((a,b) => a+b,0) / values.length;
const deviation = (values: number[]) => Math.sqrt(mean(values.map(x => (x-mean(values))**2)));
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const cityData: CityData = JSON.parse(readFileSync(new URL('../src/data/kx-city.json', import.meta.url), 'utf8'));

function compile(material: THREE.Material, library: keyof typeof THREE.ShaderLib) {
  const s = { ...THREE.ShaderLib[library], uniforms: {} as Record<string, THREE.IUniform> };
  material.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return s;
}

function functions(material: THREE.Material, library: keyof typeof THREE.ShaderLib) {
  const block = compile(material, library).fragmentShader.split('#include <common>')[1]!.split('#include')[0]!;
  return new Glsl(block.includes('float winHash(') ? block.slice(block.indexOf('float winHash(')) : block);
}

function layerPoints(layer: ReturnType<typeof createStreetLights>, name = 'street-lamp-cores') {
  return layer.group.getObjectByName(name) as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
}

function colour(cores: ReturnType<typeof layerPoints>, index: number): number[] {
  return new THREE.Color().fromBufferAttribute(cores.geometry.getAttribute('color'), index)
    .convertLinearToSRGB().toArray();
}

const sodium: LampSpot = { x: 0, y: 0, z: 0, height: 8, yaw: 0, slope: [0,0], kind: LAMP_KIND.sodium };
const mast: LampSpot = { ...sodium, x: 12, height: 12, kind: LAMP_KIND.cool, mast: true };

test('Euston and Waverley sodium lenses and KX mast strips have distinct clear-air cores in the existing draw', () => {
  const legacy = createStreetLights([sodium,mast], {...urbanLampOptions(), sourceCores: undefined});
  const kx = createStreetLights([sodium,mast], urbanLampOptions());
  const wv = createStreetLights([sodium], {...urbanLampOptions(),lowPressureSodium:true});
  const promoted = createStreetLights([sodium], {...urbanLampOptions(),lowPressureSodium:()=>true,sourceCoreAt:()=>false});
  try {
    for (const layer of [legacy,kx,wv,promoted]) layer.setLevel(1);
    const source = layerPoints(kx), old = layerPoints(legacy);
    const shape = source.geometry.getAttribute('lampCoreShape');
    assert.ok(shape, 'the existing core points carry the lens shape');
    assert.ok(shape.getX(0) > shape.getY(0) && shape.getX(1) < shape.getY(1), 'road lens is horizontal and mast strip vertical');
    const road = colour(source,0), bridge = colour(layerPoints(wv),0), led = colour(source,1);
    assert.ok(road[0]! > road[1]! && road[1]! > road[2]! && luma(road) > .79);
    assert.ok(bridge[0]! > bridge[1]! && bridge[1]! > bridge[2]! && bridge[2]! < road[2]!);
    assert.ok(led[2]! > led[1]! && led[1]! > led[0]! && luma(led) > .9);
    assert.ok(source.geometry.getAttribute('position').getY(0) < old.geometry.getAttribute('position').getY(0));
    assert.deepEqual(kx.counts(),legacy.counts());
    assert.deepEqual(layerPoints(kx,'street-lamp-halos').geometry.getAttribute('color').array,
      layerPoints(legacy,'street-lamp-halos').geometry.getAttribute('color').array);
    const profile = functions(source.material,'points');
    const at = (xy:number[]) => profile.call('lampCoreProfile',[xy,[1,.65]],{vars:{}}) as number;
    assert.ok(at([.5,.5])>.95 && at([.76,.5])>at([.5,.76]) && at([1,1])===0);
    assert.deepEqual(colour(layerPoints(promoted),0),[0,0,0]);
    const vertex = compile(source.material,'points').vertexShader.split('float lampCoreDiameter(')[1]!.split('#include')[0]!;
    const size = new Glsl('float lampCoreDiameter('+vertex);
    assert.equal(size.call('lampCoreDiameter',[5,1.5,50],{vars:{}}),5);
    assert.equal(size.call('lampCoreDiameter',[5,1.5,300],{vars:{}}),1.5);
    console.log('street cores sRGB/luma', {before:colour(old,0), road, bridge, led, luma:[road,bridge,led].map(luma)});
  } finally { for (const layer of [legacy,kx,wv,promoted]) layer.dispose(); }
});

test('KX shed and Waverley platform sources read as warm lens bars and keep their dense-fog cores', () => {
  const ring: [number,number][] = [[-5,-5],[5,-5],[5,5],[-5,5]];
  const layers = [createPlatformLamps([0,5,0],[ring],1,'kx',true),createPlatformLamps([0,5,0],[ring],1,'wv',true)];
  const savedFog = surfaceUniforms.fog.value;
  try {
    surfaceUniforms.fog.value = 0;
    for (const layer of layers) layer.setLevel(1);
    const [kx,wv] = layers.map(layer => colour(layerPoints(layer),0));
    assert.ok(kx![0]! > kx![1]! && kx![1]! > kx![2]! && kx![2]! < .75);
    assert.ok(wv![0]! > wv![2]! && wv![2]! > kx![2]! && luma(wv!) > .9);
    for (const layer of layers) {
      const shape = layerPoints(layer).geometry.getAttribute('lampCoreShape');
      assert.ok(shape && shape.getX(0) > shape.getY(0));
    }
    surfaceUniforms.fog.value = .9;
    for (const layer of layers) {
      layer.setLevel(1);
      const core = layerPoints(layer);
      assert.ok(core.material.customProgramCacheKey().endsWith('-platform-core'));
      assert.equal(core.geometry.getAttribute('lampCoreShape'), undefined);
      assert.ok(colour(core,0)[2]! >= .96);
    }
    console.log('platform cores sRGB/luma', {kx,wv,luma:[luma(kx!),luma(wv!)]});
  } finally {
    surfaceUniforms.fog.value = savedFog;
    for (const layer of layers) layer.dispose();
  }
});

const signal: OverlaySignal = { id: 1, ref: 'YA 1004', kinds: ['main'], edge: { wayId: 9, from:1,to:2,t:.8,point:[10,20] },
  travel:[0,1], side:'left', sideSource:'osm', berth:'1004', review:'osm-ref-match' };
const evidence = { trials:5,support:4,contradictions:1,precision:.8,unmatchedCycles:1,recall:.8 };
const table = { area:'Y9',hypotheses:[{ id:'fixture',address:'10',bit:2,berth:'1004',proceedValue:1,
  training:evidence,heldOut:evidence,status:'decoded',reason:'local test fixture' }] };

test('known signals brighten with a compact front-facing glare on their existing lens mesh', () => {
  for (const instanced of [false,true]) {
    const scene = new THREE.Scene();
    const layer = createSignals({ attribution:'test',signals:[{...signal,aspects:4}] },scene,{instanced});
    try {
      const lens = (instanced ? scene.getObjectByName('signal-lamps') : scene.getObjectByName('aspect')) as THREE.Mesh;
      const original = lens.material as THREE.MeshBasicMaterial, geometry = lens.geometry;
      layer.setTable(table);
      layer.apply({t:1,e:{kind:'sclass',area:'Y9',msgType:'SF',address:'10',data:'00'}});
      assert.equal(layer.signals()[0]!.state,'danger');
      const day = lens.material;
      layer.setNightLevel(1);
      const night = lens.material as THREE.MeshBasicMaterial;
      assert.ok(night !== original && night.transparent);
      assert.equal(lens.geometry,geometry);
      const shader = compile(night,'basic');
      assert.match(shader.vertexShader,/signalGlareRadius/);
      assert.match(shader.fragmentShader,/if \( vSignalFacing <= 0.0 \) \{\s*#include <tonemapping_fragment>/);
      const program = functions(night,'basic');
      const at = (r:number) => program.call('signalGlare',[r],{vars:{}}) as number;
      assert.ok(at(0)===1 && at(.55)>.05 && at(.55)<.3 && at(1)===0);
      const red = new THREE.Color(0xff2929);
      const peak = program.call('signalGlareLight',[red.toArray(),0],{vars:{}}) as number[];
      assert.ok(luma(peak) > luma(red.toArray())+.19);
      if (!instanced) console.log('red aspect linear luma', {before:luma(red.toArray()),after:luma(peak),glareAlphaAt55Percent:at(.55)});
      layer.setNightLevel(0);
      assert.equal(lens.material,day,'the decoded aspect keeps its original day program');
      layer.setNightLevel(1);
      layer.reset();
      assert.equal(lens.material,original,'an unknown aspect gets no glare');
    } finally { layer.dispose(); }
  }
});

function mesh(scene: THREE.Scene, name: string) {
  return scene.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry,THREE.Material>;
}

test('KX office floors have variable lit runs, darker suites and mixed pane brightness and warmth', () => {
  const scene = new THREE.Scene();
  const city = addCity(scene,data,cityData,{nightEffects:true,lamps:false,trees:false});
  try {
    const glass = mesh(scene,'city-glass');
    const night = buildingNightMaterialsOf(glass)?.night ?? glass.material;
    const run = (material: THREE.Material) => {
      const program = functions(material,'phong');
      return Array.from({length:16},(_,b) => Array.from({length:14},(_,y) =>
        Array.from({length:18},(_,x) => program.call('winOffice',[[x+.5,y+.53],[.02,.02],131+b*1.37,1,[.1,.9,.15,.9],.44,.9,100],{vars:{uOfficeFog:0}}) as number[])));
    };
    const stats = (material:THREE.Material) => {
      const rows = run(material).flat();
      const active = rows.filter(row => row.some(c => luma(c)>.07));
      const darkRun = (row:number[][]) => row.some((c,i) => i+2<row.length && [c,row[i+1]!,row[i+2]!].every(p => luma(p)<.04));
      const lit = active.flat().filter(c => luma(c)>.07);
      return { active:active.length/rows.length, longGaps:active.filter(darkRun).length/active.length,
        lengthDeviation:deviation(active.map(row=>row.filter(c=>luma(c)>.07).length)),
        lumaDeviation:deviation(lit.map(luma)), warm:lit.filter(c=>c[2]!/c[0]!<.6).length/lit.length };
    };
    const before = stats(cityMaterial('glass')), after = stats(night);
    console.log('office CPU', {before,after});
    assert.ok(after.active >= .43 && after.active <= .63);
    assert.ok(after.longGaps > before.longGaps+.35 && after.lengthDeviation > before.lengthDeviation+.6);
    assert.ok(after.lumaDeviation > before.lumaDeviation+.025 && after.warm >= .06 && after.warm <= .19);
  } finally { city.dispose(); }
});

test('Midland Gothic panes stay as sparse but every occupied upper room is amber with a wider brightness spread', () => {
  const scene = new THREE.Scene(), landmarks = addLandmarks(scene,data);
  try {
    const pane = mesh(scene,'landmarks-pane');
    const legacy = pane.material, night = buildingNightMaterialsOf(pane)?.night ?? legacy;
    const uv = pane.geometry.getAttribute('uv'), ids = new Set<number>();
    for (let i=0;i<uv.count;i++) {
      const id = Math.floor(uv.getX(i));
      if (uv.getY(i)<-.5 && id<PANE_UV.numbers) ids.add(id);
    }
    const stats = (material:THREE.Material) => {
      const program = functions(material,'lambert');
      const colours = [...ids].map(id=>program.call('midlandVisiblePaneLight',[[id+.5,-1.55],[.03,.03],1],{vars:{}}) as number[]);
      const lit = colours.filter(c=>luma(c)>0);
      return {lit:lit.length, nonAmber:lit.filter(c=>c[2]!/c[0]!>.28 || c[1]!/c[0]!>.66).length, spread:deviation(lit.map(luma))};
    };
    const before = stats(legacy), after = stats(night);
    console.log('Midland CPU', {before,after});
    assert.ok(before.nonAmber > 0);
    assert.equal(after.nonAmber,0);
    assert.equal(after.lit,before.lit);
    assert.ok(after.spread > before.spread+.01);
  } finally { landmarks.dispose(); }
});

test('day-clear keeps the original materials, programs and counts after an actual night-to-day update', () => {
  const scene = new THREE.Scene();
  const city = addCity(scene,data,cityData,{nightEffects:true,lamps:false,trees:false});
  const landmarks = addLandmarks(scene,data);
  const world = addWorld(scene,{grid:false});
  const atmosphere = createAtmosphere({scene,world,sites:null,kingsCrossNightFog:true});
  try {
    const office = mesh(scene,'city-glass'), pane = mesh(scene,'landmarks-pane');
    const day = [office.material,pane.material], programs = day.map((m,i)=>compile(m,i===0?'phong':'lambert').fragmentShader);
    const camera = new THREE.PerspectiveCamera();
    const update = (time:string,wallMs:number) => atmosphere.update({timeMs:Date.parse(time), wallMs, camera,
      target:new THREE.Vector3(), weather:CLEAR_STATE});
    update('2026-11-18T23:00:00Z',1000);
    assert.ok([office,pane].every((m,i)=>m.material!==day[i]),'both night windows actually replace the original program');
    update('2026-11-18T12:00:00Z',2000);
    assert.equal(atmosphere.state()?.rig.lampLevel,0);
    for (const [i,m] of [office,pane].entries()) {
      assert.equal(m.material,day[i]);
      assert.equal(compile(m.material,i===0?'phong':'lambert').fragmentShader,programs[i]);
    }
    const layer = createStreetLights([sodium,mast],urbanLampOptions());
    layer.setLevel(1);
    layer.setLevel(0);
    assert.equal(layerPoints(layer).visible,false);
    layer.dispose();
  } finally { atmosphere.dispose(); landmarks.dispose(); city.dispose(); }
});
