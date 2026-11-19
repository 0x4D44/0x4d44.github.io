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
import { Glsl } from './glsl.ts';
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

function gable(key: 'stone' | 'brickRed', height: number, level: number, { ornament = 0, field = 0, body = 1, rake = 0, scope = 1 } = {}) {
  const source = compile(night(key)).fragmentShader;
  const code = snippet(source, '// midland-gable-uplight-begin', '// midland-gable-uplight-end');
  const vars = {
    uMidlandLandmarkNight: level,
    vMidlandNight: [scope, rake], vMidlandHeight: height, vMidlandBrickBody: body,
    vMidlandGableField: field, vMidlandFacadeDetail: [0, 0, ornament],
    diffuseColor: key === 'stone' ? [.46, .39, .27, 1] : [.35, .12, .06, 1],
    totalEmissiveRadiance: [0, 0, 0],
  };
  new Glsl('').run(code, { vars });
  return vars.totalEmissiveRadiance as unknown as V3;
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

test('three main gables carry gold from base to apex on the field and ornament, with the coping and tower excluded', () => {
  const base = [gable('brickRed', eaves + 1, 1, { field: 1 }), gable('stone', eaves + 1, 1, { ornament: 1 })];
  const apex = [gable('brickRed', eaves + 8, 1, { field: 1 }), gable('stone', eaves + 8, 1, { ornament: 1 })];
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
  for (const [i, glows] of base.entries()) {
    const rgb = display(glows);
    assert.ok(luma(rgb) > 48 && rgb[0] > rgb[1] && rgb[1] > rgb[2] + 20 && Math.max(...rgb) < 210, String(rgb));
    assert.ok(luma(rgb) > luma(display(apex[i])) + 28);
  }
  const zero = [0, 0, 0];
  assert.deepEqual(gable('stone', eaves + 1, 1, { rake: 1 }), zero);
  assert.deepEqual(gable('brickRed', eaves + 1, 1, { field: 1, body: 0 }), zero);
  assert.deepEqual(gable('brickRed', eaves + 1, 1), zero);
});

test('round 36 runs only on Midland night materials in all four states and preserves day and remote CPU fingerprints', () => {
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
      for (const key of ['brickRed', 'stone'] as const) {
        assert.equal(mesh(key).material, night(key));
        assert.ok(compile(mesh(key).material).fragmentShader.includes('// midland-gable-uplight-begin'), state);
      }
      update('12:00:00', 2000 * i + 2000, 'clear');
      assert.ok(keys.every((key, k) => mesh(key).material === day[k]));
      assert.deepEqual(keys.map(key => fingerprint(mesh(key).material)), fingerprints);
      for (const remote of ['pt', 'wv'] as const) {
        assert.equal(hash(JSON.stringify(remoteWeatherSnapshot(remote, state, true))), receipts[`${remote}/${state}`]);
      }
    }
    for (const level of [0, .55]) {
      assert.deepEqual(gable('stone', eaves + 1, level, { ornament: 1 }), [0, 0, 0]);
      assert.deepEqual(gable('brickRed', eaves + 1, level, { field: 1 }), [0, 0, 0]);
    }
    assert.deepEqual(gable('stone', eaves + 1, 1, { ornament: 1, scope: 0 }), [0, 0, 0]);
  } finally {
    sky.dispose();
  }
});
