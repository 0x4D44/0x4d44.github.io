import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import stationCameras from '../../tools/tests/frozen-station-cameras.json' with {type:'json'};
import waverleyCameras from '../../tools/tests/frozen-waverley-cameras.json' with {type:'json'};
import { createAtmosphere, surfaceUniforms, type AtmosphereOptions } from '../src/atmosphere.ts';
import { createPlatformLamps } from '../src/station-lamps.ts';
import { PERTH_HAZE, WAVERLEY_HAZE } from '../src/station-weather.ts';
import { headlampNight } from '../src/train-headlamp-light.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { lampHaloProbe } from './lamp-halo-probe.ts';

const night = Date.parse('2026-11-20T22:30:00Z');
const day = Date.parse('2026-11-20T12:00:00Z');
const snowNight = Date.parse('2026-12-10T22:30:00Z');
const luma = ([r,g,b]: readonly number[]) => 255 * (.2126*r! + .7152*g! + .0722*b!);
const mean = (values: readonly number[]) => values.reduce((a,b) => a+b,0) / values.length;
const cities = {
  kx: {location:{lat:51.532,lon:-.1233}, kingsCrossNightFog:true, litFogCloud:true, cityFogTint:[.320,.266,.237]},
  wv: {location:{lat:55.9519,lon:-3.1904}, haze:WAVERLEY_HAZE, litFogCloud:true, cityFogTint:[.215,.185,.16]},
  pt: {location:{lat:56.392,lon:-3.438}, haze:PERTH_HAZE, lampSunGate:[0,6]},
} satisfies Record<string, Partial<AtmosphereOptions>>;

function sky(city: keyof typeof cities, view: {pos:number[];target:number[];fov:number}) {
  const scene = new THREE.Scene();
  const world = addWorld(scene,{grid:false});
  const atmosphere = createAtmosphere({scene,world,sites:null,...cities[city]});
  const camera = new THREE.PerspectiveCamera(view.fov,1.6,.1,20000);
  const target = new THREE.Vector3().fromArray(view.target);
  camera.position.fromArray(view.pos);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  world.follow(camera);
  world.sky.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const colours = world.sky.geometry.getAttribute('color');
  let wallMs = 0;
  return {
    update(kind: string, timeMs = night) {
      atmosphere.update({camera,target,timeMs,wallMs:wallMs+=1000,weather:weatherState(forcedObservation(kind,timeMs))});
    },
    rows([x0,y0,x1,y1]: readonly number[]) {
      // Interpolate the actual dome-face colour in linear light. The sky
      // material sends it to display sRGB directly, with no tone mapping.
      const colourAt = (x: number, y: number) => {
        ray.setFromCamera(new THREE.Vector2(x/640-1,1-y/400),camera);
        const hit = ray.intersectObject(world.sky,false)[0];
        assert.ok(hit?.face && hit.barycoord);
        const colour = new THREE.Color(0,0,0);
        [hit.face.a,hit.face.b,hit.face.c].forEach((vertex,index) => {
          colour.add(new THREE.Color().fromBufferAttribute(colours,vertex).multiplyScalar(hit.barycoord!.getComponent(index)));
        });
        return luma(colour.convertLinearToSRGB().toArray());
      };
      return Array.from({length:5},(_,i) => Array.from({length:20},(_,j) =>
        colourAt(x0!+(j+.5)*(x1!-x0!)/20,y0!+(i+.5)*(y1!-y0!)/5)));
    },
    digest() {
      const a = colours.array;
      return createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
    },
    dispose() { atmosphere.dispose(); },
  };
}

const views = [
  ['kx',stationCameras['midland-euston-road'],[400,0,880,70],72.61],
  ['wv',waverleyCameras['wv-balmoral-east-end'],[20,0,280,140],47.94],
] as const;

for (const [city,view,rect,floor] of views) {
  test(`${city} puts 5–10 sRGB luma levels between the upper sky and the skyline in night fog`, () => {
    const dome = sky(city,view);
    try {
      dome.update('fog');
      const bands = dome.rows(rect).map(mean);
      const rise = bands[4]!-bands[0]!;
      assert.ok(rise >= 5 && rise <= 10,`${city} rise ${rise}, bands ${bands}`);
      assert.ok(bands.every((value,i) => i===0 || value > bands[i-1]!),`sky bands ${bands}`);
      assert.ok(Math.abs(bands[0]!-floor) <= 1.5,`upper sky floor ${bands[0]}`);
    } finally {
      dome.dispose();
    }
  });
}

test('Calton Hill keeps the lit fog sky while smoothing its column streaks', () => {
  const dome = sky('wv',waverleyCameras['wv-calton-hill-panorama']);
  try {
    dome.update('fog');
    const rows = dome.rows([420,10,860,100]);
    const columns = rows[0]!.map((_,i) => mean(rows.map(row => row[i]!))).sort((a,b) => a-b);
    const spread = columns[17]!-columns[2]!;
    assert.ok(spread <= .6,`Calton column spread ${spread}, mean ${mean(columns)}`);
    assert.ok(Math.abs(mean(columns)-48.21) <= 1.5,`Calton luma ${mean(columns)}`);
  } finally {
    dome.dispose();
  }
});

const mist = {near:-17.986,far:210.019,amount:.8963541094861764};
const receiver = {background:[.14,.13,.12],depth:70,fogColour:[.23,.20,.18],maxPointSize:511};

function haloReadings(station: 'kx'|'wv') {
  const layer = createPlatformLamps([0,8,0],[],0,station,true);
  const solarNight = headlampNight.value;
  try {
    const points = layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
    const clear = points.material;
    const camera = new THREE.PerspectiveCamera(50,1.6,.1,20000);
    camera.position.set(0,3,22);
    camera.lookAt(0,8,0);
    camera.updateMatrixWorld();
    surfaceUniforms.fog.value = mist.amount;
    layer.setLevel(1);
    assert.notEqual(points.material,clear);
    const profile = (night: number) => {
      headlampNight.value = night;
      const probe = lampHaloProbe(points,camera,mist);
      const {x,y} = probe.entries[0]!;
      return [0,12,24,36].map(r => luma(probe.composeAt(x,y+r,receiver).rgb));
    };
    const daylightFog = profile(0);
    const nightFog = profile(1);
    for (const amount of [0,.02,.3]) {
      surfaceUniforms.fog.value = amount;
      layer.setLevel(1);
      assert.equal(points.material,clear);
    }
    return {daylightFog,nightFog};
  } finally {
    layer.dispose();
    surfaceUniforms.fog.value = 0;
    headlampNight.value = solarNight;
  }
}

for (const station of ['kx','wv'] as const) {
  test(`${station} widens near-lamp fog scatter with a bounded centre and a soft edge`, () => {
    const {daylightFog,nightFog} = haloReadings(station);
    const [centre,inner,shoulder,outer] = nightFog;
    const baseline = station==='kx'
      ? [140.1657847454381,97.86379485771413,78.54496559731349,72.99849371229809]
      : [240.71373528223157,120.715530538291,84.03075649160937,78.4324821839284];
    assert.ok(daylightFog.every((value,i) => Math.abs(value-baseline[i]!) < 1e-8),`daylight fog ${daylightFog}`);
    assert.ok(shoulder! >= (station==='kx'?81:87),`centre / 12 / 24 / 36 px: ${[centre,inner,shoulder,outer]}`);
    assert.ok(centre! < 240 && centre! > inner! && inner! > shoulder! && shoulder! > outer!,`centre / 12 / 24 / 36 px: ${[centre,inner,shoulder,outer]}`);
  });
}

// Dome vertex bytes recorded on 5f2d4451 before applying the fog changes.
// Check both entering and leaving the new grade, including Perth in night fog.
const clearNight = '4b8550fd7e1af5aa9a392ce1401a12290be9f64757adf59d0c08348e64e84364';
const snowNightDigest = '7b5f5a97be5e5cc69a56c80538f7ad16cd3d56ea9972e296eaa7db9544b0ce98';
const digests = {
  kx: [clearNight,'6e21d0c6b09a4cda73147d4c982855367f0bd68d382c94393c66a803c9f9f691',snowNightDigest,'5186f84ee0f663abe386a04d19bc01fdcdb0cd1084e2f72625c8498d5f9d8e7a'],
  wv: [clearNight,'8ddd64a2643a4df2139a9cb2beac12a708a906e24894e1e46961ad582267d32b',snowNightDigest,'e9471042546afae7986d7c325f365ea56ec859ab7f434b3f3a5bb47e9aba70c2'],
  pt: [clearNight,'6aacc32c3177c13457f512797de1ff473c134028bae632be4bff80e83ea219d7',snowNightDigest,'3630be079d501fe08760a86e7bba47a6a124f9fc37ffdf4839e0595d5c6d84a7','210d62682ff7bcb22d5c8c75ae50716ed11a7a049b3139525cd0ca849d1d439c'],
};
test('the dome returns to exact baseline bytes after the night-fog grade', () => {
  const controls = [['clear',night],['rain',night],['snow',snowNight],['clear',day]] as const;
  const cases = [...views,['pt',waverleyCameras['wv-calton-hill-panorama'],undefined] as const];
  for (const [city,view,rect] of cases) {
    const dome = sky(city,view);
    try {
      for (const [i,[kind,time]] of controls.entries()) {
        dome.update('fog');
        const fogDigest = dome.digest();
        dome.update(kind,time);
        assert.equal(dome.digest(),digests[city][i],`${city} ${kind} ${time}`);
        if (city==='pt') assert.equal(fogDigest,digests.pt[4]);
      }
      if (rect) {
        dome.update('fog');
        const bands = dome.rows(rect).map(mean);
        assert.ok(bands[4]!-bands[0]! >= 5,`${city} fog grade must take effect again after daylight`);
      }
    } finally {
      dome.dispose();
    }
  }
});
