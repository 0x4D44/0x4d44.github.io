import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LAMP_KIND } from '../../core/streetlights.ts';
import { fogRange } from '../../core/daylight.ts';
import { clearAir, fogFar } from '../src/atmosphere.ts';
import { createPerthLights, perthForecourtLampSpots, perthLampGround, perthStationLampSpots, perthTownLampSpots } from '../src/perth-lamps.ts';
import { toWorld } from '../src/perth-station-structure.ts';
import type { PerthStationPlan } from '../src/perth-station-structure.ts';
import { Glsl } from './glsl.ts';
import { createPerthWeather, createWaverleyWeather, PERTH_HAZE, sceneWeatherOptions } from '../src/station-weather.ts';
import { createStreetLights } from '../src/streetlights.ts';
import type { WaverleyView } from '../src/waverley.ts';

function syntheticView(levels: number[] = []): WaverleyView {
  const scene = new THREE.Scene(), group = new THREE.Group(); scene.add(group);
  return { scene, placeholder: false, message: 'synthetic',
    geometry: { origin: { lat: 56.392, lon: -3.438 }, attribution: 'synthetic', rails: [], platforms: [{ id: 'synthetic', ref: '4', tags: {}, path: [[0,0],[10,0],[10,100],[0,100]] }] },
    model: { group, dispose() {}, night: { setLevel(level: number) { levels.push(level); } } },
    view: () => ({ eye: [0,2,0], target: [0,0,0] }), dispose() {} } as WaverleyView;
}
function update(climate: ReturnType<typeof createPerthWeather>, hour: string, cameraY = 2, wallMs = 1000) {
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, cameraY, 0);
  climate.update({ timeMs: Date.parse(`2026-11-20T${hour}Z`), wallMs, camera, target: new THREE.Vector3() });
}

test('Perth hands its model lamps the shared solar level at noon, dusk and night, and switches them off on disposal', () => {
  const levels: number[] = [], view = syntheticView(levels);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3,3.6,1),new THREE.MeshLambertMaterial());
  wall.name='perth-city-walls'; view.scene.add(wall);
  const climate = createPerthWeather(view, sceneWeatherOptions('clear', null));
  try {
    assert.ok(wall.material.defines?.WALL_WIN !== undefined);
    for (const [i, hour] of ['12:00:00','16:20:00','22:30:00'].entries()) {
      update(climate, hour, 2, 1000 + i * 1000);
      assert.equal(levels.at(-1), climate.atmosphere.state()!.rig.lampLevel);
    }
    assert.equal(levels[0], 0); assert.ok(levels[1]! > .5 && levels[1]! < 1); assert.equal(levels[2], 1);
  } finally { climate.dispose(); }
  assert.equal(levels.at(-1), 0);
  assert.ok(wall.material.defines?.WALL_WIN === undefined);
  wall.geometry.dispose(); wall.material.dispose();
});

test('Perth rain keeps the town at 2-4 km visible from the hill while dense fog still hides it', () => {
  for (const weather of ['rain', 'fog']) {
    const view = syntheticView(), climate = createPerthWeather(view, sceneWeatherOptions(weather, null));
    try {
      update(climate, '22:30:00', 213);
      const fog = view.scene.fog as THREE.Fog;
      if (weather === 'rain') assert.ok(fog.far > 7000, `7 km visibility must not end at ${fog.far} m`);
      else assert.ok(fog.far < 800, `300 m fog keeps its short range: ${fog.far}`);
    } finally { climate.dispose(); }
  }
  for (const height of [2,213,400]) {
    let previous = 0;
    for (const visibility of [300,3500,7000,9999,10000,10001,12500,15000,17500,19999,20000,24000]) {
      const range = clearAir(fogRange(visibility,height,PERTH_HAZE.weatherFar,PERTH_HAZE.clear),visibility,PERTH_HAZE);
      const far = fogFar(range.far,height,PERTH_HAZE);
      assert.ok(far >= previous - 1e-6, `clearer air never hides more town: ${height} m, ${visibility} m, ${far} < ${previous}`);
      previous = far;
    }
  }
});

test('Perth lamp feet follow the raised drawn cover and bridge deck instead of the lower DTM', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,2,0, 10,3,0, 10,3,10, 0,2,10],3));
  geometry.setIndex([0,2,1,0,3,2]);
  const mesh = new THREE.Mesh(geometry); mesh.name = 'waverley-ground-cover'; root.add(mesh);
  const bridge = new THREE.Mesh(new THREE.PlaneGeometry(4,4).rotateX(-Math.PI/2));
  bridge.name = 'perth-bridge-roads'; bridge.position.set(5,8,5); root.add(bridge);
  const ground = perthLampGround(root,() => -.2);
  assert.ok(Math.abs(ground(1,1)-2.1)<1e-6);
  assert.equal(ground(5,5),8);
  assert.equal(ground(20,20),-.2);
  geometry.dispose(); bridge.geometry.dispose();
});

test('Perth street lamps follow a synthetic road at its kerbs and clear buildings and crossing carriageways', () => {
  const roads = [{width:7,line:[[0,0],[240,0]] as [number,number][]}];
  const ground = (x:number,z:number) => 2+.01*x+.02*z;
  const all = perthTownLampSpots(roads,ground,[]);
  assert.ok(all.length >= 7);
  assert.ok(all.every(s => Math.abs(Math.abs(s.z)-4.1)<1e-6 && Math.abs(s.y-ground(s.x,s.z))<1e-6));
  const building: [number,number][] = [[0,-10],[120,-10],[120,10],[0,10]];
  const kept = perthTownLampSpots([...roads,{width:11,line:[[180,-30],[180,30]]}],ground,[building]);
  assert.ok(kept.length < all.length);
  assert.ok(kept.every(s => !(s.x<120&&Math.abs(s.z)<10) && !(Math.abs(s.x-180)<5.5&&Math.abs(s.z)<3.5)));
});

test('Perth lights existing pendant and double lantern heads and Dundee fittings without duplicate posts', () => {
  const plan = {structure:{lamps:[{x:10,z:20}]},canopyColumns:[[30,40]],
    furniture:{lamps:[{at:[60,70],arm:[1,0],double:true}]}} as PerthStationPlan;
  const spots = perthStationLampSpots(plan), p = toWorld([10,20]);
  assert.equal(spots.length,4);
  assert.ok(Math.abs(spots[0]!.x-p[0])<1e-6 && Math.abs(spots[0]!.z-p[1])<1e-6);
  assert.ok(Math.abs(spots[0]!.y+spots[0]!.height-4.995)<1e-6);
  assert.ok(Math.abs(spots[2]!.height-spots[3]!.height-.3)<1e-6);
  const lights = createPerthLights(plan,[],[]);
  try {
    assert.deepEqual(lights.counts(),{lamps:4,triangles:20,draws:5});
    lights.setLevel(1);
    let lit=0; lights.group.traverse(o=>{if(o.name==='street-lamp-halos'&&o.visible)lit++;});
    assert.equal(lit,2);
    lights.setLevel(0);
    lights.group.traverse(o=>{if(o.name==='street-lamp-halos')assert.ok(!o.visible);});
  } finally { lights.dispose(); }
});

test('shared additive lamp fog fades light to zero instead of painting fog-coloured squares', () => {
  const lights = createStreetLights([{x:0,y:0,z:0,height:6,yaw:0,kind:LAMP_KIND.warm,slope:[0,0]}],{fog:true});
  try {
    for (const name of ['street-lamp-halos','street-lamp-pools']) {
      const object=lights.group.getObjectByName(name) as THREE.Mesh;
      const material=object.material as THREE.Material;
      const shader={uniforms:{},vertexShader:'',fragmentShader:'#include <fog_fragment>'};
      material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,undefined as never);
      const linear=shader.fragmentShader.replace(/#ifdef FOG_EXP2[\s\S]*?#else/,'').replace(/^\s*#.*$/gm,'');
      for (const distance of [0,150,300]) {
        const env={vars:{fogNear:0,fogFar:300,vFogDepth:distance,fogColor:[.1,.1,.1],gl_FragColor:[.8,.5,.2,1]}};
        new Glsl('').run(linear,env);
        const out=env.vars.gl_FragColor;
        const factor=distance===0?1:distance===150?.5:0;
        assert.ok(out.slice(0,3).every((v,i)=>Math.abs(v-[.8,.5,.2][i]!*factor)<1e-6));
      }
    }
  } finally { lights.dispose(); }
});

test('shared street lights can light an existing fixture without adding a second post or shifting its head', () => {
  const lights = createStreetLights([{ x: 2, y: .915, z: 3, height: 4.1, yaw: 0, kind: LAMP_KIND.warm, slope: [0,0] }],
    { posts: false, headAt: spot => [spot.x, spot.y + spot.height, spot.z], fog: true });
  try {
    assert.ok(lights.group.getObjectByName('street-lamp-posts') === undefined);
    assert.deepEqual(lights.counts(), { lamps: 1, triangles: 2, draws: 2 });
    const halos = lights.group.getObjectByName('street-lamp-halos') as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    const p = halos.geometry.getAttribute('position');
    assert.ok(Math.abs(p.getX(0) - 2) < 1e-6 && Math.abs(p.getY(0) - 5.015) < 1e-6 && Math.abs(p.getZ(0) - 3) < 1e-6);
    assert.equal(halos.material.fog, true);
    const pools = lights.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); pools.getMatrixAt(0, matrix);
    const at = new THREE.Vector3().setFromMatrixPosition(matrix);
    assert.ok(Math.abs(at.x - 2) < 1e-6 && Math.abs(at.z - 3) < 1e-6);
    lights.setLevel(1); assert.ok(halos.visible && pools.visible);
    lights.setLevel(0); assert.ok(!halos.visible && !pools.visible);
  } finally { lights.dispose(); }
});


test('Perth switches lamps off above six degrees even in rain, snow and fog; Waverley keeps its existing weather ramp', () => {
  for (const weather of ['rain', 'snow', 'fog']) {
    const levels: number[] = [], climate = createPerthWeather(syntheticView(levels), sceneWeatherOptions(weather, null));
    const waverley = createWaverleyWeather(syntheticView(), sceneWeatherOptions(weather, null));
    try {
      update(climate, '12:00:00'); update(waverley, '12:00:00');
      assert.ok(climate.atmosphere.state()!.sun.elevationDeg > 6);
      assert.equal(levels.at(-1), 0, `${weather}: no daytime pool or halo`);
      assert.equal(climate.atmosphere.state()!.rig.lampLevel, 0, `${weather}: the applied rig agrees`);
      assert.ok(waverley.atmosphere.state()!.rig.lampLevel > .2, `${weather}: shared behaviour is preserved`);
      update(climate, '22:30:00', 2, 2000);
      assert.equal(levels.at(-1), 1, `${weather}: night lights stay on`);
    } finally { climate.dispose(); waverley.dispose(); }
  }
});

test('Perth platforms and forecourt use white LEDs, with several approach lamps across the setts', () => {
  const plan = {structure:{lamps:[{x:10,z:20}]},canopyColumns:[[30,40]],furniture:{lamps:[]}} as unknown as PerthStationPlan;
  assert.ok(perthStationLampSpots(plan).every(s => s.kind === LAMP_KIND.cool));
  const road = {width:5,line:[[40,-60],[-40,-60]] as [number,number][]};
  const approach = perthTownLampSpots([road], () => .12, []);
  assert.ok(approach.length >= 3, '18 m spacing fills the approach, instead of one service-road lamp');
  assert.ok(approach.every(s => s.kind === LAMP_KIND.cool));
  const file = {roads:[{id:'synthetic',highway:'service',service:'parking_aisle',path:[[40,-90],[-40,-90]]}],parking:[],bridge:{id:'synthetic',ring:[]}};
  const forecourt = perthForecourtLampSpots(file, (x,z) => .12 + x * .001 + z * .002, []);
  assert.equal(forecourt.length, 6);
  assert.ok(forecourt.every(s => s.kind === LAMP_KIND.cool && Math.abs(s.y-(.12+s.x*.001+s.z*.002)) < 1e-8));
});
