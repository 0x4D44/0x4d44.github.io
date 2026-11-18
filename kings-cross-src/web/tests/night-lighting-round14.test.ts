import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import kxCameras from '../../tools/tests/frozen-station-cameras.json' with { type: 'json' };
import wvCameras from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };
import ptCameras from '../../tools/tests/frozen-perth-cameras.json' with { type: 'json' };
import { createAtmosphere, surfaceUniforms, type AtmosphereOptions } from '../src/atmosphere.ts';
import { createPlatformLamps } from '../src/station-lamps.ts';
import { PERTH_HAZE, WAVERLEY_HAZE } from '../src/station-weather.ts';
import { headlampNight } from '../src/train-headlamp-light.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { Glsl } from './glsl.ts';
import { lampHaloProbe } from './lamp-halo-probe.ts';

const night = Date.parse('2026-11-20T22:30:00Z');
const controls = [
  ['clear', night], ['rain', night], ['snow', Date.parse('2026-12-10T22:30:00Z')],
  ['clear', Date.parse('2026-11-20T12:00:00Z')],
] as const;
const luma = ([r, g, b]: readonly number[]) => 255 * (.2126 * r! + .7152 * g! + .0722 * b!);
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const cities = {
  kx: { location: {lat: 51.532, lon: -.1233}, kingsCrossNightFog: true, litFogCloud: true, cityFogTint: [.320, .266, .237] },
  wv: { location: {lat: 55.9519, lon: -3.1904}, haze: WAVERLEY_HAZE, litFogCloud: true, cityFogTint: [.215, .185, .16] },
  pt: { location: {lat: 56.392, lon: -3.438}, haze: PERTH_HAZE, lampSunGate: [0, 6] },
} satisfies Record<string, Partial<AtmosphereOptions>>;
type City = keyof typeof cities;
type View = { pos: number[]; target: number[]; fov?: number };

function cameraAt(view: View) {
  const camera = new THREE.PerspectiveCamera(view.fov ?? 50, 1.6, .1, 20000);
  const target = new THREE.Vector3().fromArray(view.target);
  camera.position.fromArray(view.pos);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return { camera, target };
}

function climate(city: City, view: View) {
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const { camera, target } = cameraAt(view);
  const landmark = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
  landmark.name = 'waverley-city-monuments';
  scene.add(landmark);
  const atmosphere = createAtmosphere({ scene, world, sites: null, ...cities[city] });
  const colours = world.sky.geometry.getAttribute('color');
  const ray = new THREE.Raycaster();
  let wallMs = 0;
  return {
    camera,
    update(kind: string, timeMs = night) {
      world.follow(camera);
      world.sky.updateMatrixWorld();
      atmosphere.update({ camera, target, timeMs, wallMs: wallMs += 1000, weather: weatherState(forcedObservation(kind, timeMs)) });
    },
    skyAt(x: number, y: number) {
      ray.setFromCamera(new THREE.Vector2(x / 640 - 1, 1 - y / 400), camera);
      const hit = ray.intersectObject(world.sky, false)[0];
      assert.ok(hit?.face && hit.barycoord);
      const colour = new THREE.Color(0, 0, 0);
      [hit.face.a, hit.face.b, hit.face.c].forEach((vertex, index) => {
        colour.add(new THREE.Color().fromBufferAttribute(colours, vertex).multiplyScalar(hit.barycoord!.getComponent(index)));
      });
      return luma(colour.convertLinearToSRGB().toArray());
    },
    fog() { return scene.fog as THREE.Fog; },
    digest() {
      const { buffer, byteOffset, byteLength } = colours.array;
      const fog = scene.fog as THREE.Fog;
      return createHash('sha256').update(Buffer.from(buffer, byteOffset, byteLength))
        .update(JSON.stringify([fog.near, fog.far, ...fog.color.toArray()])).digest('hex');
    },
    shade(depth: number, raw: number[]) {
      const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert!;
      const shader = { vertexShader, fragmentShader, uniforms: {} as Record<string, THREE.IUniform<number>> };
      landmark.material.onBeforeCompile(shader as never, undefined as never);
      const fragment = shader.fragmentShader.split('#include <colorspace_fragment>')[1]!
        .split('#include <premultiplied_alpha_fragment>')[0]!
        .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment);
      const fog = scene.fog as THREE.Fog;
      const env = { vars: {
        gl_FragColor: [...raw, 1], fogNear: fog.near, fogFar: fog.far,
        fogColor: fog.color.clone().convertLinearToSRGB().toArray(), vFogDepth: depth,
        uWaverleySkylineFog: shader.uniforms.uWaverleySkylineFog?.value ?? 0,
      } };
      new Glsl('').run(fragment.split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')
        .replace('float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );', ''), env);
      return luma(env.vars.gl_FragColor);
    },
    dispose() { atmosphere.dispose(); landmark.material.dispose(); landmark.geometry.dispose(); },
  };
}

// Representative physical lamp positions that project to the capture probes.
const lamps = {
  kx: { view: kxCameras['shed-interior'], heads: [[42.59375, 5.26, -304.16396], [44.09438, 5.26, -298.20572], [29.45194, 5.26, -304.50203], [31.45972, 5.26, -298.53557]] },
  wv: { view: wvCameras['wv-platform-5-west'], heads: [[282.13856, 4.995, -53.64081], [270.13856, 4.995, -51.45212], [258.13856, 4.995, -49.26342]] },
};
const fog = { near: -17.986, far: 210.019, amount: .8963541094861764 };
const receiver = { background: [.14, .13, .12], depth: 70, fogColour: [.23, .20, .18], maxPointSize: 511 };
const radii = [20, 30, 40] as const;
// Composited luma above the local fogged receiver on ed26be10.
const baseHalos = {
  kx: [[44.96275, 36.25672, 32.59037], [39.71043, 32.78497, 31.76462],
    [45.22223, 36.57733, 32.64767], [39.71698, 32.84864, 31.82648]],
  wv: [[177.15892, 145.30179, 106.70313], [62.60275, 47.19593, 39.33214], [42.02668, 37.95042, 36.78608]],
};

for (const city of ['kx', 'wv'] as const) {
  test(`${city} near-lamp night fog has a smooth 20–40 px shoulder`, () => {
    const { camera } = cameraAt(lamps[city].view);
    const oldFog = surfaceUniforms.fog.value, oldNight = headlampNight.value;
    const readings: number[][] = [], centres: number[] = [];
    try {
      for (const [i, head] of lamps[city].heads.entries()) {
        const layer = createPlatformLamps(head, [], 0, city, true);
        try {
          const points = layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
          const clear = points.material, budget = layer.counts();
          headlampNight.value = 1;
          surfaceUniforms.fog.value = fog.amount;
          layer.setLevel(1);
          const probe = lampHaloProbe(points, camera, fog), { x, y } = probe.entries[0]!;
          const sample = (r: number) => luma(probe.composeAt(x, y + r, receiver).excess);
          readings.push(radii.map(sample));
          centres.push(sample(0));
          const profile = Array.from({ length: 91 }, (_, r) => sample(r));
          assert.ok(profile.every((value, r) => r === 0 || value <= profile[r - 1]! + .001),
            `${city} lamp ${i} has a radial rebound`);
          for (const amount of [0, .02, .3]) {
            surfaceUniforms.fog.value = amount;
            layer.setLevel(1);
            assert.equal(points.material, clear);
          }
          assert.deepEqual(layer.counts(), budget);
        } finally {
          layer.dispose();
        }
      }
    } finally {
      surfaceUniforms.fog.value = oldFog;
      headlampNight.value = oldNight;
    }
    const gain = readings.map((row, i) => row.map((value, j) => value - baseHalos[city][i]![j]!));
    assert.ok(gain.every(row => row.every(value => value >= 10 && value <= 15)),
      `${city} at 20/30/40 px ${JSON.stringify(readings)}, gain ${JSON.stringify(gain)}, centres ${centres}`);
  });
}

test('high Waverley night fog restores Calton’s sky rise and keeps control states exact', () => {
  const calton = wvCameras['wv-calton-hill-panorama'];
  const dome = climate('wv', calton);
  try {
    dome.update('fog');
    const rows = Array.from({ length: 5 }, (_, i) => Array.from({ length: 20 }, (_, j) =>
      dome.skyAt(420 + (j + .5) * 22, 10 + (i + .5) * 18)));
    const bands = rows.map(mean);
    const columns = rows[0]!.map((_, j) => mean(rows.map(row => row[j]!))).sort((a, b) => a - b);
    const rise = bands[4]! - bands[0]!, spread = columns[17]! - columns[2]!;
    assert.ok(rise >= 4 && rise <= 6 && spread < 1, `Calton bands ${bands}, rise ${rise}, spread ${spread}`);
    assert.ok(bands.every((value, i) => i === 0 || value > bands[i - 1]!));
  } finally {
    dome.dispose();
  }

  // Round 13 dome vertex bytes and scene fog parameters, after a switch out of dense fog.
  const receipts = {
    kx: [
      '79f2e77a90688e15abdef1717c4c8ebf34a49e1f36d5ce6b042897c9f1af4963',
      'dd493eccdc6f4a244d4eb6f7528d5c2620d83578430403f0c46807a6e5195b13',
      '1334f0cb5dbad466b332bfa213edd59f471365ca2c982d4bbd21898c5f732ed0',
      'efadce4895560f594e9d34acd891e9b5ecb6148c644b22c61f9f431ef7b61ab4',
    ],
    wv: [
      '2753e57e0acc3628d4e61ca4a2cd9d0c33c372c177d1bc92af58abd1fa0b11c5',
      '054e763c6f4071e5b8596095c639aa391799c36bd175241e98484ebb2ea59ef5',
      '1adccdd26b6a56e2982763f9b2e173a08181ce5a314bf16a742c1720b157e146',
      '08b0d5fd9a98160c6d46da11c7d0cb36dc415027268568b79d0ae58aad206b53',
    ],
    pt: [
      '799a68967770c8f89e478629db3bd9032f658868613173a4aa0617a215221454',
      'a704a825e69e33ffd4f936f4775deb6aa764a8e362180c598ce703d9d326c64e',
      '1c73924939d36af83773eaea925f58ada0e64167a617c27697b876dc90c59682',
      '977538974ef39b42e0c2d924e7fe35387348f441c53359238a27a1c017943249',
      'c8dd6594c4cd80800165b5e609ea6b626548ac0504a2f56ae02153c167b77cc4',
    ],
  };
  const views = { kx: kxCameras['midland-euston-road'], wv: calton, pt: ptCameras['pt-kinnoull-panorama'] };
  for (const city of ['kx', 'wv', 'pt'] as const) {
    const sky = climate(city, views[city]);
    try {
      const states = city === 'pt' ? [...controls, ['fog', night] as const] : controls;
      for (const [i, [kind, time]] of states.entries()) {
        sky.update('fog');
        sky.update(kind, time);
        assert.equal(sky.digest(), receipts[city][i], `${city} ${kind}`);
      }
    } finally {
      sky.dispose();
    }
  }
});

test('high Waverley night fog keeps a faint distant silhouette and the original near veil', () => {
  const skyline = climate('wv', wvCameras['wv-calton-hill-panorama']);
  try {
    skyline.update('fog');
    const raw = [.11, .11, .11];
    const far = skyline.shade(1300, raw);
    const shift = skyline.shade(1300, [.21, .21, .21]) - far;
    const amount = 1 - shift / 25.5;
    const contrast = skyline.skyAt(715, 333) - far;
    assert.ok(amount >= .82 && amount <= .94 && contrast >= 3 && contrast <= 8,
      `Calton at 1300 m: fog ${amount}, sky minus masonry luma ${contrast}, masonry luma ${far}`);
    const checkVeil = (depths: readonly number[]) => {
      for (const depth of depths) {
        const { near, far, color } = skyline.fog();
        const fog = THREE.MathUtils.smoothstep(depth, near, far);
        const expected = (1 - fog) * luma(raw) + fog * luma(color.clone().convertLinearToSRGB().toArray());
        assert.ok(Math.abs(skyline.shade(depth, raw) - expected) < 1e-12, `original fog at ${depth} m`);
      }
    };
    checkVeil([30, 100, 350]);
    for (const [kind, time] of controls) {
      skyline.update(kind, time);
      checkVeil([30, 100, 1300]);
    }
    for (const height of [17.86, 220]) {
      skyline.camera.position.y = height;
      skyline.update('fog');
      checkVeil([30, 100, 1300]);
    }
  } finally {
    skyline.dispose();
  }
});
