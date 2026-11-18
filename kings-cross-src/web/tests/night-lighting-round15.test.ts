import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import { pointInPolygon } from '../../core/station.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import cameras from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };
import kx from '../src/data/kx-track.json' with { type: 'json' };
import wv from '../src/data/waverley-scene.json' with { type: 'json' };
import cityData from '../src/data/kx-city.json' with { type: 'json' };
import { addCity } from '../src/city.ts';
import type { CityData } from '../../core/city.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { addRoofShade } from '../src/lighting.ts';
import { WAVERLEY_LEVELS } from '../src/waverley-mesh.ts';
import { buildWaverleyStation, waverleyStationRoof, WAVERLEY_ROOF_CUTOUTS, WAVERLEY_STATION_ROOF_ID } from '../src/waverley-station.ts';
import { underRoof } from '../src/waverley-station-structure.ts';
import { createPlatformLamps } from '../src/station-lamps.ts';
import type { OpenPlatformLamp } from '../src/station-lamps.ts';
import { Glsl, Mat, Sampler } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';
import expectedWeather from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };

const luma = (rgb: number[]) => .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!;
type Program = { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string };
function lambert(mesh: THREE.Object3D) {
  const material = (mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>).material;
  const shader: Program = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}
const block = (shader: Program, name: string) =>
  shader.fragmentShader.split('// ' + name + '-begin')[1]?.split('// ' + name + '-end')[0] ?? '';

test('open Waverley platform heads stand clear of roofs and form varied pools in the North Bridge view', () => {
  const data = unpackWaverleyScene(wv as never);
  const built = buildWaverleyStation(data, { rangeUnder: () => ({ min: 0, max: 0, mean: 0 }) });
  try {
    const config = cameras['wv-roof-from-north-bridge'];
    const camera = new THREE.PerspectiveCamera(config.fov, 1.6, .1, 20_000);
    camera.position.fromArray(config.pos);
    camera.lookAt(new THREE.Vector3().fromArray(config.target));
    camera.updateMatrixWorld();
    const roof = waverleyStationRoof(data.roofs.find(r => r.id === WAVERLEY_STATION_ROOF_ID))!;
    const within = (s: LampSpot) => {
      const p = new THREE.Vector3(s.x, s.y, s.z).project(camera);
      const x = 640 * (1 + p.x), y = 400 * (1 - p.y);
      return x >= 280 && x <= 560 && y >= 400 && y <= 620;
    };
    const covered = built.roof.userData.platformLampHeads as number[];
    const spots = (built.roof.userData.openPlatformLamps ?? []) as OpenPlatformLamp[];
    const visible = spots.filter(within);
    console.log('WV covered heads, uncovered heads, heads in crop', covered.length / 3, spots.length, visible.length);
    assert.ok(visible.length >= 5, 'North Bridge crop needs at least five actual open-platform lamp positions');
    for (const { x, y, z, height } of spots) {
      assert.equal(y, WAVERLEY_LEVELS.platform);
      assert.ok(height >= 4 && height <= 6);
      assert.ok(data.platforms.some(p => pointInPolygon([x,z],p.path)));
      assert.ok(!underRoof(roof,[x,z],0) && !WAVERLEY_ROOF_CUTOUTS.some(r => pointInPolygon([x,z],r)));
    }
    const gaps = visible.slice(1).map((s,i) => Math.hypot(s.x - visible[i]!.x,s.z - visible[i]!.z));
    assert.ok(Math.max(...gaps) - Math.min(...gaps) >= 2, 'fixture spacing should vary');
    assert.ok(new Set(visible.map(s => s.kind)).size >= 2, 'warm white and sodium heads');
    const rings = data.platforms.map(platform => platform.path);
    const original = createPlatformLamps(covered,rings,WAVERLEY_LEVELS.platform,'wv',true);
    const extended = createPlatformLamps(covered,rings,WAVERLEY_LEVELS.platform,'wv',true,spots);
    try {
      assert.deepEqual(extended.counts(),{...original.counts(),lamps:original.counts().lamps+spots.length});
      for (const name of ['street-lamp-pools','street-lamp-reflections']) {
        const prev = original.group.getObjectByName(name) as THREE.InstancedMesh;
        const next = extended.group.getObjectByName(name) as THREE.InstancedMesh;
        assert.deepEqual(next.instanceMatrix.array,prev.instanceMatrix.array,'the covered wet pools keep their instances');
      }
      const cores = extended.group.getObjectByName('street-lamp-cores') as THREE.Points;
      const heads = cores.geometry.getAttribute('position');
      assert.equal(heads.count,covered.length/3+spots.length);
      spots.forEach((s,i) => {
        const head = new THREE.Vector3().fromBufferAttribute(heads,covered.length/3+i);
        assert.ok(head.distanceTo(new THREE.Vector3(s.x,s.y+s.height,s.z)) < .00001);
      });
      extended.setLevel(1);
      assert.ok(cores.visible);
      extended.setLevel(0);
      assert.equal(cores.visible,false);
    } finally { extended.dispose(); original.dispose(); }

    const shader = lambert(built.platforms.getObjectByName('waverley-platform-surfaces')!);
    const map = shader.uniforms.uOpenPlatformMap!.value as THREE.DataTexture;
    const { data: pixels, width, height } = map.image as { data: Uint8Array; width: number; height: number };
    const rect = (shader.uniforms.uOpenPlatformRect!.value as THREE.Vector4).toArray();
    const sample = (x: number,z: number,night = 1,wet = 0,fog = 0) => {
      const vars = {cameraPosition:[x,WAVERLEY_LEVELS.platform,z],vViewPosition:[0,0,0],
        viewMatrix:new Mat(4,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]), uOpenPlatformRect:rect,
        uOpenPlatformMap:new Sampler(map),uOpenPlatformNight:night,uOpenPlatformWet:wet,uOpenPlatformFog:fog,
        diffuseColor:[.35,.35,.35,1],totalEmissiveRadiance:[0,0,0]};
      const texture2D = (_sampler: unknown, uv: unknown) => {
        const [u,v] = uv as [number,number];
        const index = (Math.floor(v*height)*width+Math.floor(u*width))*4;
        return Array.from(pixels.slice(index,index+4), n => Number(n)/255);
      };
      new Glsl('').run(block(shader,'open-platform-paving'),{vars,fns:{texture2D}});
      return vars.totalEmissiveRadiance;
    };
    const peak = visible.map(s => luma(sample(s.x,s.z)));
    const gapsLight = visible.slice(1).map((s,i) => luma(sample((s.x+visible[i]!.x)/2,(s.z+visible[i]!.z)/2)));
    const widths = visible.map(s => {
      const light = (d: number) => luma(sample(s.x + Math.sin(s.yaw)*d, s.z + Math.cos(s.yaw)*d));
      return Array.from({length:14},(_,i)=>i*.5).filter(d => light(d) > .02).at(-1)!;
    });
    assert.ok(Math.max(...widths) - Math.min(...widths) >= 1,'the sampled pool widths vary');
    assert.ok(Math.min(...peak) > 4 * Math.max(...gapsLight),`pools fall to a dark gap between heads: peaks ${peak}, gaps ${gapsLight}`);
    const [site] = visible;
    assert.deepEqual(sample(site!.x,site!.z,0),[0,0,0],'the paving light adds exactly zero by day');
    const wet = luma(sample(site!.x,site!.z,1,1)), fog = luma(sample(site!.x,site!.z,1,0,1));
    assert.ok(Math.abs(wet / peak[0]! - .62) < 1e-9 && wet > .03,'rain keeps a diffuse pool');
    assert.ok(Math.abs(fog / peak[0]! - .45) < 1e-9 && fog > .02,'fog attenuates the pool');
    console.log('WV centre and gap linear luma ranges, lateral reach at .02, triangle/draw delta', 
      Math.min(...peak),Math.max(...peak),Math.min(...gapsLight),Math.max(...gapsLight),widths,0,0,'wet/fog',wet,fog);

  } finally { built.dispose(); }
});

test('Midland’s façade drops to dark upper brick, with gold rakes scoped to the gables and the day inputs preserved', () => {
  const built = addLandmarks(new THREE.Scene(), kx as KxData);
  try {
    const brick = built.group.getObjectByName('landmarks-brickRed') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
    const stone = built.group.getObjectByName('landmarks-stone')!;
    addRoofShade(brick.material);
    const shader = lambert(brick), trim = lambert(stone);
    const run = (program: Program, height: number, night: number, body: number, rake = 0, scope = 1) => {
      const vars = {
        vMidlandNight: [scope, rake], vMidlandHeight: height, vMidlandBrickBody: body, vMidlandStoneBody: body,
        uMidlandNight: night, diffuseColor: [.35, .12, .06, 1], direct: [.025,.011,.006], indirect: [.025,.011,.006],
        totalEmissiveRadiance: [.015,.008,.004],
      };
      const source = ['midland-night', 'midland-brick-floor', 'midland-body-grade', 'midland-end-grade', 'midland-arcade-grade']
        .map(name => block(program,name)).join('\n')
        .replaceAll('reflectedLight.directDiffuse','direct').replaceAll('reflectedLight.indirectDiffuse','indirect')
        .replace(/\bFLOOD\b/g,String(brick.material.defines!.FLOOD));
      new Glsl('').run(source,{vars});
      return {direct:vars.direct, indirect:vars.indirect, emissive:vars.totalEmissiveRadiance};
    };
    const total = (v: ReturnType<typeof run>) => luma(v.direct) + luma(v.indirect) + luma(v.emissive);
    const arcade = run(shader,3,1,1), upper = run(shader,14,1,1);
    const rake = run(trim,23,1,1,1), unlitTrim = run(trim,23,1,1,0);
    assert.deepEqual(run(shader,14,0,1),run(shader,14,0,0),'day uniforms leave each channel identical');
    assert.deepEqual(run(shader,14,1,0,0,0),run(shader,14,0,1),'other buildings receive exactly zero contribution');
    const ratio = total(upper) / total(arcade), blueToRed = rake.emissive[2]! / rake.emissive[0]!;
    console.log('Midland linear arcade, upper, upper/arcade, rake blue/red', total(arcade), total(upper), ratio, blueToRed);
    assert.ok(ratio >= .22 && ratio <= .34, 'upper brick is near 30% of the arcade’s linear light');
    assert.ok(blueToRed < .13 && rake.emissive[1]! > 2.5 * rake.emissive[2]!, 'warm gold rake');
    assert.ok(total(rake) > 2 * total(unlitTrim),'the gable light is local to the rake');
  } finally { built.dispose(); }
});

test('Midland upper windows have irregular warm occupancy and the arcade panes have a separate warm interior treatment', () => {
  const built = addLandmarks(new THREE.Scene(), kx as KxData);
  try {
    const mesh = built.group.getObjectByName('landmarks-pane') as THREE.Mesh;
    const shader = lambert(mesh);
    const near = (id: number, night: number) => {
      const body = shader.fragmentShader.split('#include <map_fragment>')[1]!.split('#include')[0]!;
      const start = shader.fragmentShader.indexOf('float winHash(');
      const uniformsEnd = shader.fragmentShader.indexOf('#include',start);
      const vars = { vWinUv:[id + .5,-1.5], uWinNight:night, totalEmissiveRadiance:[0,0,0] };
      new Glsl(shader.fragmentShader.slice(start, uniformsEnd)).run(body.replace(/fwidth\(.*\);/, 'vec2( 0.02 );').replaceAll('WIN_GAIN','1.0'),{vars});
      return vars.totalEmissiveRadiance;
    };
    const pos = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv');
    const upper = new Set<number>(), arcade = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(uv.getY(i) + 1) > .0001) continue;
      const id = Math.floor(uv.getX(i));
      if (pos.getY(i) >= 6) upper.add(id);
      else arcade.add(id);
    }
    const rooms = [...upper].map(id => near(id,1));
    const on = rooms.filter(rgb => luma(rgb) > .04);
    const arches = [...arcade].map(id => near(id,1));
    const archShare = arches.filter(rgb => luma(rgb) > .04).length / arches.length;
    console.log('Midland upper window lights, samples, arcade lit share',on.length,rooms.length,archShare);
    assert.deepEqual(near([...upper][0]!,0),[0,0,0]);
    assert.ok(on.length / rooms.length >= .15 && on.length / rooms.length <= .25, '15–25% upper-window occupancy');
    const amber = on.filter(([r,g,b]) => r! > g! && g! > 1.6 * b!);
    const cool = on.filter(([r,g,b]) => b! > g! && g! > r!);
    assert.equal(amber.length, 72, 'the calibrated amber rooms retain their warm channel ratios');
    assert.equal(cool.length, 17, 'the other occupied rooms use the cool palette');
    assert.equal(amber.length + cool.length, on.length, 'every occupied room fits one of the two palettes');
    assert.ok(new Set(on.map(rgb => luma(rgb).toFixed(2))).size >= 8,'vary the intensity among occupied rooms');
    // Batch order follows the drawn bays. Occupancy needs both adjacent
    // lit rooms and long dark gaps, with no short period across the row.
    const occupancy = rooms.map(rgb => luma(rgb) > .04 ? '1' : '0').join('');
    assert.ok(occupancy.includes('11') && occupancy.includes('00000'),'adjacent rooms and longer dark gaps both occur');
    for (let lag = 1; lag <= 8; lag++) {
      const mismatches = rooms.slice(lag).filter((_,i) => occupancy[i] !== occupancy[i+lag]).length;
      assert.ok(mismatches > rooms.length * .2,`occupancy does not repeat every ${lag} panes`);
    }
    assert.ok(archShare > .85 && arches.every(([r,g,b]) => r! > g! && g! > b!),'the distinct arcade floor has warm interior light');
  } finally { built.dispose(); }
});

test('Euston Road sodium heads have local pools with gaps and different reaches on the existing draw', () => {
  for (const weather of ['clear','rain','fog','snow'] as const) {
    const perth = remoteWeatherSnapshot('pt',weather,true);
    assert.equal(createHash('sha256').update(JSON.stringify(perth)).digest('hex'),expectedWeather[`pt/${weather}`]);
  }
  const city = addCity(new THREE.Scene(), kx as KxData, cityData as CityData, { nightEffects: true, trees: false });
  try {
    const pools = city.lights!.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const lib = THREE.ShaderLib.basic;
    const shader: Program = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    pools.material.onBeforeCompile(shader as never, undefined as never);
    const tuning = pools.geometry.getAttribute('poolLocalScale');
    const beam = pools.geometry.getAttribute('poolBeam');
    const local = Array.from({ length:pools.count },(_,i) => tuning?.getX(i) ?? 0).filter(scale => scale > 0);
    console.log('Euston Road local pools, distinct sizes',local.length,new Set(local.map(s => s.toFixed(2))).size);
    assert.ok(local.length >= 3 && local.length < pools.count / 20,'local optics follow the Euston Road sodium row');
    assert.ok(new Set(local.map(s => s.toFixed(2))).size >= 3);
    assert.ok(Array.from({length:pools.count},(_,i) => !tuning!.getX(i) || (beam.getZ(i) === 0 && beam.getW(i) === 0)).every(Boolean));
    const at = (along: number, across: number, scale = 1) => {
      const vars = { vPoolLocalScale:scale, vPoolBeam:[0,-1,0,0], beamPosition:[across,along], poolInputAlpha:1, gl_FragColor:[.17,.12,.07,.75] };
      new Glsl('').run(block(shader,'pool-local-sodium'),{vars});
      return vars.gl_FragColor;
    };
    const centre = at(0,.22), shoulder = at(.75,.22), gap = at(1.25,.22);
    const baseline = (along: number) => {
      const vars = { vPoolUv:[.61,.5+along*.5], vPoolLine:0, vPoolBeam:[0,-1,0,0], gl_FragColor:[.2,.10,.036,1] };
      const source = ['pool-luminaire-input','pool-profile','pool-luminaire','pool-source-colour','pool-road-balance']
        .map(name => block(shader,name)).join('\n');
      new Glsl('').run(source,{vars});
      return vars.gl_FragColor;
    };
    const addedLuma = (v: number[]) => luma(v) * v[3]!;
    console.log('Euston existing/local linear colour × alpha at centre, shoulder, gap',
      [0,.75,1.25].map(d => addedLuma(baseline(d))),[centre,shoulder,gap].map(addedLuma));

    assert.ok(centre[3]! > 1.6 * shoulder[3]! && shoulder[3]! > 3 * gap[3]!, 'each bright patch fades into a darker road gap');
    assert.ok(centre[0]! > 2.5 * centre[2]! && centre[0]! > centre[1]!, 'asphalt pool is amber');
    assert.ok(at(.88,.22,.9)[3]! < at(.88,.22,1.15)[3]!, 'larger fixtures light a wider reach');
    assert.deepEqual(at(.88,.22,0),[.17,.12,.07,.75],'all other optics retain their original pool result');
    city.lights!.setLevel(0);
    assert.equal(pools.visible,false,'day has no pool draw');
  } finally { city.dispose(); }
});
