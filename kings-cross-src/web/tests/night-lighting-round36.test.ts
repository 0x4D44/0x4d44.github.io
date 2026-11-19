import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { NIGHT_EXPOSURE } from '../../core/daylight.ts';
import { FIGURES } from '../../core/landmarks.ts';
import type { KxData } from '../../core/osm.ts';
import cameras from '../../tools/tests/frozen-station-cameras.json' with { type: 'json' };
import { createAtmosphere } from '../src/atmosphere.ts';
import data from '../src/data/kx-track.json' with { type: 'json' };
import { addLandmarks } from '../src/landmarks.ts';
import { buildingNightMaterialsOf } from '../src/materials.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl, Mat } from './glsl.ts';
import receipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const scene = new THREE.Scene();
const built = addLandmarks(scene, data as KxData);
after(() => built.dispose());

const states = ['clear', 'rain', 'fog', 'snow'] as const;
type Key = 'brickRed' | 'stone' | 'pane';
const mesh = (key: Key) => built.group.getObjectByName('landmarks-' + key) as
  THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
const night = (key: Key) => buildingNightMaterialsOf(mesh(key))!.night;
const eaves = FIGURES.midland.eaves;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const display = (rgb: V3) => toSrgb(acesFilmic(rgb, NIGHT_EXPOSURE)).map(value => Math.round(255 * value));
const luma = ([r, g, b]: number[]) => .2126 * r + .7152 * g + .0722 * b;
const identity = new Mat(4, new THREE.Matrix4().toArray());

function compile(material: THREE.Material) {
  const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
  const shader = { vertexShader, fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

function snippet(source: string, begin: string, end: string) {
  const from = source.indexOf(begin);
  assert.ok(from >= 0, begin + ' must be active');
  const to = source.indexOf(end, from + begin.length);
  assert.ok(to >= 0, end + ' must end the shader section');
  return source.slice(from + begin.length, to);
}

function gableRgb(key: 'stone' | 'brickRed', height: number) {
  const material = night(key);
  const source = compile(material).fragmentShader;
  // Include the whole landmark grade through the final light accumulation,
  // including terms injected between the grade and outgoingLight.
  const code = snippet(source, '// midland-night-begin', 'vec3 outgoingLight =')
    .replace('#include <aomap_fragment>', '')
    .replaceAll('reflectedLight.directDiffuse', 'direct')
    .replaceAll('reflectedLight.indirectDiffuse', 'indirect')
    .replace(/\bFLOOD\b/g, String(material.defines!.FLOOD));
  const stone = key === 'stone';
  const albedo: V3 = stone ? [.46, .39, .27] : [.35, .12, .06];
  const flood = (stone ? .12 : .28) * (.04 + .96 * Math.exp(-height / 5));
  const vars = {
    uMidlandNight: 1, uMidlandLandmarkNight: 1,
    vMidlandNight: [1, 0], vMidlandHeight: height, vMidlandBrickBody: 1, vMidlandStoneBody: 1,
    vMidlandClockStage: 0, vMidlandGableField: 1, vMidlandTowerTrim: 0, vMidlandPinnacle: [0, 0, 0, 0],
    vMidlandFacadeDetail: [0, 0, stone ? 1 : 0],
    cameraPosition: [-90, height, 100], viewMatrix: identity, vViewPosition: [0, 0, 0],
    diffuseColor: [...albedo, 1], direct: albedo.map(c => .07 * c), indirect: albedo.map(c => .07 * c),
    totalEmissiveRadiance: albedo.map((c, i) => c * [1, .82, .50][i] * flood),
  };
  new Glsl('').run(code, { vars });
  const outgoing = vars.totalEmissiveRadiance.map((c, i) => c + vars.direct[i] + vars.indirect[i]);
  return display(outgoing as unknown as V3);
}

test('Midland dormer stone returns to the dark slate roof grade and the two warm panes keep their room light', () => {
  const stone = mesh('stone');
  const detail = stone.geometry.getAttribute('midlandFacadeDetail');
  assert.equal(Array.from({ length: detail.count }, (_, i) => detail.getZ(i)).filter(weight => weight > 0 && weight < 1).length, 0,
    'dormer faces no longer receive the gable stone glow');
  const view = cameras['midland-euston-road'];
  const camera = new THREE.PerspectiveCamera(view.fov, 1280 / 800, view.near, 9000);
  camera.position.fromArray(view.pos);
  camera.lookAt(new THREE.Vector3().fromArray(view.target));
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const [x, y] of [[169,315],[311,304],[467,294],[521,300],[695,293],[756,298],
    [813,295],[867,295],[911,296],[957,298],[1010,294]]) {
    ray.setFromCamera(new THREE.Vector2((x + .5) / 640 - 1, 1 - (y + .5) / 400), camera);
    const hit = ray.intersectObject(built.group, true)[0];
    assert.ok(hit?.object === stone && hit.face, `dormer at ${x},${y} must hit its stone front`);
    assert.deepEqual([hit.face.a, hit.face.b, hit.face.c].map(i => detail.getZ(i)), [0, 0, 0]);
  }
  const material = night('pane');
  const source = compile(material).fragmentShader;
  const functions = snippet(source, 'float winHash(', '#include');
  const glsl = new Glsl('float winHash(' + functions);
  const windowLight = snippet(source, '#include <map_fragment>', '#include');
  const windowAt = (id: number) => {
    const vars = { vWinUv: [id + .5, -1.5], uWinNight: 1, WIN_GAIN: Number(material.defines!.WIN_GAIN), totalEmissiveRadiance: [0, 0, 0] };
    glsl.run(windowLight, { vars, fns: { fwidth: () => [.04, .04] } });
    return display(vars.totalEmissiveRadiance as unknown as V3);
  };
  // Pane IDs of the nine lower dormers visible east of the middle gable.
  const dormers = [1735, 1949, 453, 1729, 188, 630, 1003, 1810, 1736];
  assert.deepEqual(dormers.filter(id => luma(windowAt(id)) > 105), [453, 188]);
  for (const id of [453, 188]) {
    const [r, g, b] = windowAt(id);
    assert.ok(r > g && g > b + 25);
  }
});

test('the three main gable faces and their ornament match 69c80505 night output', () => {
  const field = mesh('brickRed').geometry;
  const fields = field.index!;
  const mask = field.getAttribute('midlandGableField');
  const body = field.getAttribute('midlandBrickBody');
  let mainGables = 0;
  for (let i = 0; i < fields.count; i += 3) {
    const vertex = fields.getX(i);
    if (mask.getX(vertex) && body.getX(vertex)) mainGables++;
  }
  assert.equal(mainGables, 3);
  // CPU shader samples from 69c80505, measured from the eaves toward the apex.
  assert.deepEqual({
    brick: [1, 4, 8].map(y => gableRgb('brickRed', eaves + y)),
    stone: [1.5, 3.5, 5].map(y => gableRgb('stone', eaves + y)),
  }, {
    brick: [[25, 7, 2], [19, 5, 1], [6, 1, 0]],
    stone: [[83, 58, 33], [83, 58, 33], [83, 58, 33]],
  });
});

test('the Midland runs the 69c80505 night programs in all four states and preserves day and remote CPU fingerprints', () => {
  const world = addWorld(scene, { grid: false });
  const sky = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
  const camera = new THREE.PerspectiveCamera(50, 1.6, .5, 9000);
  camera.position.set(260, 220, 90);
  const target = new THREE.Vector3();
  const keys = ['brickRed', 'stone', 'pane'] as const;
  const fingerprints = [
    '30cb039754b15671bf42901ea679fd6e67e3e159b09d388cc930440624b279b7',
    '3a3e9f7341bb0c076e6fe599967ce76e2f0ab3725c9a3bdfceb330f7481880cc',
    '80236ba1f06a0885834ac781cda3ddb7946e694f2943188a41a5cfba4e3b8721',
  ];
  const nightFingerprints = [
    'dae12ff40321cc35256567bda19c7833767a96708af85b04d223925e51b96eeb',
    '3f88888f1bdf8922ff6684488ba5d1d489ca6646ca1c539631cc9f5c4580e570',
  ];
  const fingerprint = (material: THREE.Material) => {
    const { vertexShader, fragmentShader } = compile(material);
    return hash(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
  };
  const update = (hour: string, wallMs: number, state: typeof states[number]) => sky.update({
    camera, target, timeMs: Date.parse('2026-11-20T' + hour + 'Z'), wallMs,
    weather: state === 'clear' ? CLEAR_STATE : weatherState(forcedObservation(state)),
  });
  try {
    update('12:00:00', 0, 'clear');
    const day = keys.map(key => mesh(key).material);
    assert.deepEqual(day.map(fingerprint), fingerprints);
    assert.deepEqual(built.stats, { meshes: 13, triangles: 67675, materials: 14 });
    for (const [i, state] of states.entries()) {
      update('22:30:00', 2000 * i + 1000, state);
      const masonry = ['brickRed', 'stone'] as const;
      for (const key of masonry) assert.equal(mesh(key).material, night(key));
      assert.deepEqual(masonry.map(key => fingerprint(mesh(key).material)), nightFingerprints, state);
      update('12:00:00', 2000 * i + 2000, 'clear');
      assert.ok(keys.every((key, k) => mesh(key).material === day[k]));
      assert.deepEqual(keys.map(key => fingerprint(mesh(key).material)), fingerprints);
      for (const remote of ['pt', 'wv'] as const) {
        assert.equal(hash(JSON.stringify(remoteWeatherSnapshot(remote, state, true))), receipts[`${remote}/${state}`]);
      }
    }
  } finally {
    sky.dispose();
  }
});
