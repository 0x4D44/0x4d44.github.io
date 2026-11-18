import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import type { CityData } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import waverleyCameras from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };
import kx from '../src/data/kx-track.json' with { type: 'json' };
import cityData from '../src/data/kx-city.json' with { type: 'json' };
import wv from '../src/data/waverley-scene.json' with { type: 'json' };
import { addCity } from '../src/city.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { addRoofShade } from '../src/lighting.ts';
import type { OpenPlatformLamp } from '../src/station-lamps.ts';
import { buildWaverleyStation } from '../src/waverley-station.ts';
import { acesFilmic, toSrgb } from './aces.ts';
import type { V3 } from './aces.ts';
import { Glsl, Mat } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';
import expectedWeather from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };

const luma = (rgb: ArrayLike<number>) => .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!;
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const identity = new Mat(4, new THREE.Matrix4().toArray());
type Program = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };
function compile(mesh: THREE.Object3D, kind: 'lambert' | 'basic' = 'lambert'): Program {
  const lib = THREE.ShaderLib[kind];
  const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  ((mesh as THREE.Mesh).material as THREE.Material).onBeforeCompile(shader as never, undefined as never);
  return shader;
}
const block = (source: string, name: string) => source.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0] ?? '';

function platforms() {
  const built = buildWaverleyStation(unpackWaverleyScene(wv as never), { rangeUnder: () => ({ min: 0, max: 0, mean: 0 }) });
  const lamps = built.roof.userData.openPlatformLamps as OpenPlatformLamp[];
  const paving = built.platforms.getObjectByName('waverley-platform-surfaces') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  addRoofShade(paving.material);
  const shader = compile(paving);
  return { built, lamps, shader };
}

test('Waverley pool rims are soft and the paving footprints have different off-centre shapes', () => {
  const { built, lamps, shader } = platforms();
  try {
    const map = shader.uniforms.uOpenPlatformMap!.value as THREE.DataTexture;
    const { data: bytes, width, height } = map.image as { data: Uint8Array; width: number; height: number };
    const [x0, z0, sx, sz] = (shader.uniforms.uOpenPlatformRect!.value as THREE.Vector4).toArray();
    const sample = (x: number, z: number) => {
      const u = (x - x0!) * sx! * width - .5, v = (z - z0!) * sz! * height - .5;
      const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
      const texel = (i: number, j: number) => luma(bytes.subarray((j * width + i) * 4, (j * width + i) * 4 + 3)) / 255;
      return (1-b) * ((1-a)*texel(i,j) + a*texel(i+1,j)) + b * ((1-a)*texel(i,j+1) + a*texel(i+1,j+1));
    };
    const angles = Array.from({ length: 12 }, (_, i) => i * Math.PI / 6);
    const profiles = lamps.map(s => {
      const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw), centre = sample(s.x,s.z);
      const light = (r: number, angle: number) => {
        const a = r * s.reach * Math.cos(angle), b = r * s.width * Math.sin(angle);
        return sample(s.x + a*cos + b*sin, s.z - a*sin + b*cos) / centre;
      };
      const rim = Math.max(...[.72,.77,.82,.87,.92].map(r => mean(angles.map(a => (light(r-.025,a)-light(r+.025,a))/.05))));
      return { rim, asymmetry: mean(angles.slice(0,6).map(a => Math.abs(light(.48,a)-light(.48,a+Math.PI)))), shape: angles.map(a => light(.48,a) - light(.48,a+Math.PI)) };
    });
    const rim = mean(profiles.map(p => p.rim)), asymmetry = mean(profiles.map(p => p.asymmetry));
    const variation = mean(profiles.slice(1).map((p,i) => mean(p.shape.map((v,j) => Math.abs(v-profiles[i]!.shape[j]!)))));
    console.log('WV normalized outer-rim slope, directional asymmetry, variation among heads',rim,asymmetry,variation);
    assert.ok(rim < .95 && asymmetry > .045 && variation > .07, `Waverley rim ${rim}, asymmetry ${asymmetry}, variation ${variation}`);
  } finally { built.dispose(); }
});

test('North Bridge rain shows a narrow reflection below a visible open-platform lamp', () => {
  const { built, lamps, shader } = platforms();
  try {
    const { pos, target, fov } = waverleyCameras['wv-roof-from-north-bridge'];
    const camera = new THREE.PerspectiveCamera(fov, 1.6, .1, 9000);
    camera.position.fromArray(pos);
    camera.lookAt(new THREE.Vector3().fromArray(target));
    camera.updateMatrixWorld();
    const lamp = lamps[5]!;
    const head = new THREE.Vector3(lamp.x,lamp.y+lamp.height,lamp.z);
    const base = new THREE.Vector3(lamp.x,lamp.y,lamp.z);
    const towardsEye = camera.position.clone().sub(base).setY(0).normalize();
    const under = base.clone().addScaledVector(towardsEye,9);
    const shoulder = under.clone().addScaledVector(new THREE.Vector3(towardsEye.z,0,-towardsEye.x),1.4);
    const headPixel = head.clone().project(camera), streakPixel = under.clone().project(camera);
    assert.ok(Math.abs(headPixel.x - streakPixel.x) < .005 && headPixel.y - streakPixel.y > .12);
    const functions = block(shader.fragmentShader,'open-platform-reflection-functions');
    const body = block(shader.fragmentShader,'open-platform-reflection');
    assert.equal(shader.fragmentShader.match(/float coverGroundAt\(/g)?.length,1);
    const read = (point: THREE.Vector3, night = 1, wet = 1, roof = 0, fog = 0, snow = 0) => {
      const uniforms = shader.uniforms.uOpenPlatformHeads?.value as THREE.Vector4[] | undefined;
      const colors = shader.uniforms.uOpenPlatformStreakColors?.value as THREE.Color[] | undefined;
      // Unroll uniform-array references for the CPU shader interpreter.
      const source = body.replace(/(uOpenPlatform(?:Heads|StreakColors))\[(\d+)\]/g,'$1_$2');
      const vars = {
        ...(Object.fromEntries((uniforms ?? []).map((h,i) => [`uOpenPlatformHeads_${i}`,h.toArray()]))),
        ...(Object.fromEntries((colors ?? []).map((c,i) => [`uOpenPlatformStreakColors_${i}`,c.toArray()]))),
        cameraPosition:camera.position.toArray(), vViewPosition:camera.position.clone().sub(point).toArray(), viewMatrix:identity,
        uOpenPlatformRect:(shader.uniforms.uOpenPlatformRect!.value as THREE.Vector4).toArray(),
        uOpenPlatformNight:night, uOpenPlatformWet:wet, uOpenPlatformFog:fog, uOpenPlatformSnow:snow,
        totalEmissiveRadiance:[0,0,0],
      };
      new Glsl(functions).run(source,{ vars, fns:{ coverGroundAt:() => roof } });
      return luma(vars.totalEmissiveRadiance);
    };
    const streak = read(under), flank = read(shoulder);
    console.log('WV reflection centre and flank in linear luma',streak,flank);
    assert.ok(streak > .012 && streak > 4 * flank);
    assert.equal(read(under,1,0),0);
    assert.equal(read(under,0),0);
    assert.equal(read(under,1,1,1),0);
    assert.equal(read(under,1,1,0,0,1),0);
  } finally { built.dispose(); }
});

test('Midland upper brick stays dark brown at roughly a quarter of the lit arcade, with a warm lower wash', () => {
  const built = addLandmarks(new THREE.Scene(),kx as KxData);
  try {
    const shader = compile(built.group.getObjectByName('landmarks-brickRed')!);
    const wash = block(shader.fragmentShader,'midland-lamp-wash');
    const shade = (height: number, input: V3, night = 1, scope = 1, body = 1, x = -90) => {
      const vars = { vMidlandHeight:height, midlandLevel:night*scope, vMidlandBrickBody:body,
        vMidlandNight:[scope,0], cameraPosition:[x,height,100], vViewPosition:[0,0,0], viewMatrix:identity,
        diffuseColor:[.35,.12,.06,1], totalEmissiveRadiance:[...input] };
      new Glsl('').run(wash,{vars});
      return vars.totalEmissiveRadiance as [number,number,number];
    };
    const display = (rgb: V3) => toSrgb(acesFilmic(rgb,2.3)).map(v => v * 255);
    // Effective radiance from the round-15 brick sample (600,396), after
    // inverting the fixed grade. Compare to the arcade crop's luma of 117.
    const upper: V3 = [.01266,.00591,.00364];
    const rgb = display(shade(16.5,upper)), ratio = luma(rgb) / 117;
    const lower = [0,10,20,30].map(dx => luma(shade(8,[0,0,0],1,1,1,-90+dx)));
    console.log('Midland approximate upper display RGB, upper/arcade, lower wash luma',rgb,ratio,lower);
    assert.ok(ratio >= .24 && ratio <= .31 && rgb[0]! > 1.7*rgb[1]! && rgb[1]! > 1.6*rgb[2]!);
    assert.ok(Math.min(...lower) > .001 && Math.max(...lower) > 1.25*Math.min(...lower));
    assert.ok(luma(shade(30,[0,0,0],1,1,0)) > 0,'tower form has some fill');
    assert.deepEqual(shade(3,upper),upper,'arcade keeps its illumination');
    assert.deepEqual(shade(16.5,upper,0),upper,'day brick is exact');
    assert.deepEqual(shade(16.5,upper,1,0),upper,'other landmarks are exact');
  } finally { built.dispose(); }
});

test('Midland room IDs retain irregular amber light with fewer lit upper panes', () => {
  const built = addLandmarks(new THREE.Scene(),kx as KxData);
  try {
    const pane = built.group.getObjectByName('landmarks-pane') as THREE.Mesh;
    const shader = compile(pane);
    const declarations = shader.fragmentShader.slice(shader.fragmentShader.indexOf('float winHash(')).split('#include')[0]!;
    const code = new Glsl(declarations);
    const p = pane.geometry.getAttribute('position'), uv = pane.geometry.getAttribute('uv');
    const ids = new Set<number>();
    for (let i=0;i<p.count;i++) if (Math.abs(uv.getY(i)+1)<.0001 && p.getY(i)>=6) ids.add(Math.floor(uv.getX(i)));
    const room = (id: number, night: number) => code.call('midlandPaneLight',[[id+.5,-1.5],[.02,.02],night],{vars:{}}) as number[];
    const lit = [...ids].map(id => room(id,1)).filter(rgb => luma(rgb)>.04);
    console.log('Midland sampled lit upper panes, total rooms, occupancy',lit.length,ids.size,lit.length/ids.size);
    assert.ok(lit.length/ids.size >= .15 && lit.length/ids.size <= .18);
    assert.ok(lit.every(([r,g,b]) => r! > g! && g! > 1.6*b!));
    assert.ok([...ids].every(id => luma(room(id,0))===0));
  } finally { built.dispose(); }
});

test('Euston neighbours fill the road between bright centres while daytime and Perth remain exact', () => {
  for (const weather of ['clear','rain','fog','snow'] as const) {
    const receipt = remoteWeatherSnapshot('pt',weather,true);
    assert.equal(createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),expectedWeather[`pt/${weather}`]);
  }
  const city = addCity(new THREE.Scene(),kx as KxData,cityData as CityData,{ nightEffects:true,trees:false });
  try {
    const pools = city.lights!.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
    const shader = compile(pools,'basic');
    const pool = new Glsl('').snippet(block(shader.fragmentShader,'pool-local-sodium'));
    const vertex = new Glsl('').snippet(shader.vertexShader.split('\n')
      .filter(line => /^(?:vPoolUv =|vPoolBeam =|vPoolLocalScale =|if \(poolLocalScale > 0\.0\) vPoolUv =)/.test(line)).join('\n'));
    const scales = pools.geometry.getAttribute('poolLocalScale'), beams = pools.geometry.getAttribute('poolBeam');
    const matrix = new THREE.Matrix4();
    function at(x:number,z:number,ground:V3) {
      let colour = [...ground];
      let contributors = 0;
      for (let i=0;i<pools.count;i++) {
        const scale = scales.getX(i);
        if (!scale) continue;
        pools.getMatrixAt(i,matrix);
        const dx = x-matrix.elements[12]!, dz = z-matrix.elements[14]!;
        if (Math.abs(dx) >= .5*matrix.elements[0]! || Math.abs(dz) >= .5*matrix.elements[10]!) continue;
        const varyings = {uv:[.5+dx/matrix.elements[0]!, .5-dz/matrix.elements[10]!],poolLocalScale:scale,
          poolBeam:[beams.getX(i),beams.getY(i),0,0],vPoolUv:[0,0],vPoolBeam:[0,0,0,0],vPoolLocalScale:0};
        vertex({vars:varyings});
        const vars = {...varyings,beamPosition:varyings.vPoolUv.map(v => 2*v-1),poolInputAlpha:1,gl_FragColor:[0,0,0,1]};
        pool({vars});
        const [r,g,b,alpha] = vars.gl_FragColor as [number,number,number,number];
        if (alpha > .015) contributors++;
        colour = toSrgb([r,g,b]).map((channel,j) => channel*255*alpha+colour[j]!*(1-alpha));
      }
      return { luma:luma(colour),contributors };
    }
    const nearGap = at(-73.41,131.33,[8,12,26]), nearHead = at(-68.31,136.04,[8,12,26]);
    const farGap = at(44.82,45.77,[5,9,21]), farHead = at(51.67,32.88,[5,9,21]);
    city.lights!.setLevel(0);
    assert.equal(pools.visible,false);
    console.log('Euston approximate gap and centre display luma near / overview',nearGap,nearHead,farGap,farHead);
    assert.ok(nearGap.luma >= 20 && nearGap.luma <= 32 && nearGap.contributors >= 2);
    assert.ok(farGap.luma >= 20 && farGap.luma <= 44 && farGap.contributors >= 2);
    assert.ok(nearHead.luma > 2.5*nearGap.luma && farHead.luma > 2.5*farGap.luma);
  } finally { city.dispose(); }
});
