import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {shedLayout} from '../../core/station.ts';
import {createAtmosphere, surfaceUniforms} from '../src/atmosphere.ts';
import {buildFurniture} from '../src/furniture.ts';
import {createPlatformLamps, urbanLampOptions} from '../src/station-lamps.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {forcedObservation, weatherState} from '../src/weather.ts';
import {addWorld} from '../src/world.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {Glsl} from './glsl.ts';
import {lampHaloProbe} from './lamp-halo-probe.ts';

const night = Date.parse('2026-11-20T22:30:00Z');
const fog = {near: -17.986, far: 210.019, amount: .8963541094861764};

function shader(material: THREE.Material, program: 'points'|'lambert') {
  const lib = THREE.ShaderLib[program]!;
  const shader = {uniforms:{}, vertexShader:lib.vertexShader, fragmentShader:lib.fragmentShader};
  material.onBeforeCompile(shader as never, undefined as never);
  return shader.fragmentShader;
}

function block(shader: string, name: string) {
  const body = shader.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];
  assert.ok(body, name);
  return new Glsl('').snippet(body);
}

test('KX adds the emitter to the actual lantern glass after surface fog', () => {
  const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json',import.meta.url),'utf8'));
  const scene = new THREE.Scene();
  const world = addWorld(scene,{grid:false});
  const furniture = buildFurniture(data,shedLayout(data));
  scene.add(furniture);
  const lamps = furniture.getObjectByName('lamps') as THREE.InstancedMesh;
  const original = lamps.material;
  const atmosphere = createAtmosphere({scene,world,sites:null,kingsCrossNightFog:true,litFogCloud:true,cityFogTint:[.320,.266,.237]});
  const camera = new THREE.PerspectiveCamera();
  const frame = (weather: 'fog'|'clear'|'rain'|'snow') => atmosphere.update({timeMs:night,wallMs:night,camera,
    target:new THREE.Vector3(),weather:weatherState(forcedObservation(weather))});
  try {
    frame('fog');
    assert.ok(lamps.material !== original);
    const fragment = shader(lamps.material as THREE.Material,'lambert');
    assert.ok(fragment.indexOf('// kx-lantern-emitter-begin') > fragment.indexOf('#include <fog_fragment>'));
    const emit = block(fragment,'kx-lantern-emitter');
    const color = lamps.geometry.getAttribute('color');
    const run = (index: number, depth: number) => {
      const e = {vars:{vColor:[color.getX(index),color.getY(index),color.getZ(index)],vFogDepth:depth,
        uKxNightFog:1,gl_FragColor:[.045,.037,.03,1]}};
      emit(e);
      return Math.max(...e.vars.gl_FragColor.slice(0,3));
    };
    const near = Array.from({length:color.count},(_,i)=>run(i,25));
    assert.ok(near.some(v=>v>=240/255) && near.some(v=>v===.045), 'glass emits while the pole receives normal fog');
    assert.ok(Math.max(...near)<1.15);
    assert.ok(Array.from({length:color.count},(_,i)=>run(i,250)).every(v=>v===.045));
    for(const weather of ['clear','rain','snow'] as const) {
      frame(weather);
      assert.equal(lamps.material,original);
    }
  } finally { atmosphere.dispose(); }
});

test('near Waverley pendants carry a resolved below-lamp glow in fog while distant scatter stays screened', () => {
  surfaceUniforms.fog.value = 0;
  const layer = createPlatformLamps([0,5,0],[],0,'wv',true);
  try {
    const halo = layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
    const camera = new THREE.PerspectiveCamera(60,1.6,.1,20000);
    camera.position.set(0,2.515,8);
    camera.lookAt(0,5,0);
    camera.updateMatrixWorld();
    const receiver = {background:[.15,.15,.16],depth:35,fogColour:[.236,.204,.178],maxPointSize:511};
    const below = (p: ReturnType<typeof lampHaloProbe>) => {
      const head = p.entries[0]!;
      return Array.from({length:6},(_,i)=>p.composeAt(head.x,head.y+i+3,receiver).rgb)
        .flat().reduce((a,b)=>a+b,0)/18;
    };
    layer.setLevel(1);
    const clear = below(lampHaloProbe(halo,camera,{near:100,far:2600,amount:0}));
    surfaceUniforms.fog.value = fog.amount;
    layer.setLevel(1);
    const mist = below(lampHaloProbe(halo,camera,fog));
    assert.ok(mist>=clear, `pendant below-light display mean ${mist} vs ${clear}`);
  } finally {
    layer.dispose();
    surfaceUniforms.fog.value = 0;
  }
});

test('Princes Street and North Bridge street scatter is bounded in both lamp batches', async () => {
  const scene = buildWaverleyScene({lighting:false});
  const lights = await loadWaverleyLamps(scene.terrain.heightAt.bind(scene.terrain),true,scene.group);
  try {
    const receiver = lights.group.getObjectByName('waverley-approach-lamps')!;
    for(const group of [lights.group,receiver]){
      const points=group.children.find(o=>o.name==='street-lamp-halos') as THREE.Points;
      surfaceUniforms.fog.value = 0;
      lights.setLevel(1);
      const clear = points.material;
      surfaceUniforms.fog.value = fog.amount;
      lights.setLevel(1);
      const run=block(shader(points.material as THREE.Material,'points'),'lamp-edinburgh-frontage-fog');
      const alpha=(local:number,halo:number)=>{
        const e={vars:{vLampFrontageFog:local,vLampFogHalo:halo,gl_FragColor:[1,.62,.3,.25]}};
        run(e);
        return e.vars.gl_FragColor[3]!;
      };
      assert.ok(alpha(1,1)<.13);
      assert.equal(alpha(0,1),.25);
      assert.equal(alpha(1,0),.25);
      surfaceUniforms.fog.value = .1;
      lights.setLevel(1);
      assert.equal(points.material,clear);
    }
  } finally {
    lights.dispose();
    scene.dispose();
    surfaceUniforms.fog.value = 0;
  }
});

test('fog sky retains warm midtones above the lamp groups', () => {
  for (const kx of [true,false]) {
    const scene = new THREE.Scene();
    const world = addWorld(scene,{grid:false});
    const a = createAtmosphere({scene,world,sites:null,kingsCrossNightFog:kx,litFogCloud:true,
      cityFogTint:kx?[.320,.266,.237]:[.215,.185,.16]});
    try {
      const camera = new THREE.PerspectiveCamera();
      a.update({camera,target:new THREE.Vector3(),timeMs:night,wallMs:night,weather:weatherState(forcedObservation('fog'))});
      const pos = world.sky.geometry.getAttribute('position'), colors = world.sky.geometry.getAttribute('color');
      const upper: number[] = [];
      for(let i=0;i<pos.count;i++)if(pos.getY(i)/5200>.60&&pos.getY(i)/5200<.74){
        const c = new THREE.Color().fromBufferAttribute(colors,i).convertLinearToSRGB();
        upper.push(255*(.2126*c.r+.7152*c.g+.0722*c.b));
      }
      assert.ok(upper.length);
      assert.ok(Math.min(...upper)>=(kx?68:44), `upper fog sky luma ${Math.min(...upper)}`);
    } finally { a.dispose(); }
  }
});

test('mast avoids raising the broad ring when its compact fog shoulder brightens', () => {
  const layer=createStreetLights([{x:0,y:0,z:0,height:10,yaw:0,kind:2,mast:true,slope:[0,0]}],
    {...urbanLampOptions(),softFog:true,kxOptics:true});
  try {
    surfaceUniforms.fog.value=fog.amount;
    layer.setLevel(1);
    const halo=layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
    const draw=block(shader(halo.material as THREE.Material,'points'),'lamp-mast-capsule');
    const at=(radius:number)=>{
      const e={vars:{gl_PointCoord:[.5+radius/2,.5],gl_FragColor:[1,1,1,.2],lampAirAlpha:.9,
        uLampFog:fog.amount,vLampFogDistance:45,vLampFogHaze:1,vLampFogCore:0}};
      draw(e);
      return e.vars.gl_FragColor[3]!;
    };
    assert.equal(at(.04),.2);
    assert.ok(at(.26)<.165,'the broad source shoulder must taper before the 60–80px ring');
  } finally {
    layer.dispose();
    surfaceUniforms.fog.value=0;
  }
});
