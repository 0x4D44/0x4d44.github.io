import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { NIGHT_EXPOSURE } from '../../core/daylight.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import data from '../src/data/kx-track.json' with { type: 'json' };
import { addLandmarks } from '../src/landmarks.ts';
import { buildingNightMaterialsOf, PANE_UV } from '../src/materials.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl, Mat } from './glsl.ts';
import receipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const scene = new THREE.Scene();
const built = addLandmarks(scene, data as KxData);
after(() => built.dispose());
const keys = ['brickRed', 'stone', 'pane'] as const;
const mesh = (key: typeof keys[number]) => built.group.getObjectByName('landmarks-' + key) as
  THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
const night = (key: typeof keys[number]) => buildingNightMaterialsOf(mesh(key))!.night as THREE.MeshLambertMaterial;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const display = (rgb: number[]) => toSrgb(acesFilmic(rgb as unknown as V3, NIGHT_EXPOSURE)).map(v => Math.round(v*255));
const luma = (rgb: number[]) => .2126*rgb[0]! + .7152*rgb[1]! + .0722*rgb[2]!;
const sum = (a: number[], ...terms: number[][]) => a.map((v,i) => terms.reduce((n,t) => n+t[i]!, v));
const identity = new Mat(4, new THREE.Matrix4().toArray());

function compile(material: THREE.Material) {
  const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert;
  const shader = { vertexShader, fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

function between(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  return from < 0 ? '' : source.slice(from + start.length, source.indexOf(end, from + start.length));
}

function masonry(key: 'brickRed' | 'stone', height: number,
  { albedo = key === 'stone' ? [.46,.39,.27] : [.35,.12,.06], body = 1, rake = 0, detail = [0,0,0], level = 1, scope = 1 } = {}) {
  const material = night(key);
  const fragment = compile(material).fragmentShader;
  const code = between(fragment, '// midland-night-begin', '// midland-lamp-wash-end')
    .replaceAll('reflectedLight.directDiffuse', 'direct').replaceAll('reflectedLight.indirectDiffuse', 'indirect')
    .replace(/\bFLOOD\b/g, String(material.defines!.FLOOD));
  const [strength, reach, floor] = key === 'stone' ? [.12, 5, .04] : [.28, 5, .04];
  const flood = strength! * (floor! + (1-floor!)*Math.exp(-height/reach!))*level;
  const vars = {
    vMidlandNight: [scope,rake], vMidlandHeight: height, vMidlandBrickBody: body, vMidlandStoneBody: body,
    vMidlandClockStage: 0, vMidlandGableField: 0, vMidlandTowerTrim: 0, vMidlandPinnacle: [0,0,0,0], vMidlandFacadeDetail: detail,
    uMidlandNight: level, uMidlandLandmarkNight: level,
    vViewPosition: [0,0,0], cameraPosition: [-90,height,100], viewMatrix: identity,
    diffuseColor: [...albedo,1], direct: albedo.map(c => .07*c), indirect: albedo.map(c => .07*c),
    totalEmissiveRadiance: albedo.map((c,i) => c*[1,.82,.5][i]!*flood),
  };
  new Glsl('').run(code, { vars });
  return display(sum(vars.totalEmissiveRadiance,vars.direct,vars.indirect));
}

function pane({ detail = [0,0], id = 2300, y = .6, level = 1, applyOpeningGrade = true } = {}) {
  const material = night('pane');
  const { fragmentShader: source } = compile(material);
  const from = source.indexOf('float winHash(');
  const functions = source.slice(from, source.indexOf('#include', from));
  const base = between(source, '#include <map_fragment>', '#include');
  const grade = applyOpeningGrade ? between(source, '// midland-opening-grade-begin', '// midland-opening-grade-end') : '';
  const vars = {
    vWinUv: [id+.5,-1-y], vMidlandOpening: detail, uWinNight: level, WIN_GAIN: Number(material.defines!.WIN_GAIN),
    totalEmissiveRadiance: [0,0,0],
  };
  new Glsl(functions).run(base + grade, { vars, fns: { fwidth: () => [.04,.04] } });
  return display(sum(vars.totalEmissiveRadiance,[.006,.009,.015]));
}

test('clock tower shaft falls into brown shadow and the belfry openings carry gold', () => {
  const shaft = masonry('brickRed', 31, { body: 0, detail: [1,0,0] });
  const range = masonry('brickRed', 15);
  const belfry = pane({ id: 999, detail: [0,1] });
  const darkSide = pane({ id: 999, detail: [0,.28] });
  console.log('Clock shaft, range, belfry, side', shaft, range, belfry, darkSide);
  assert.ok(luma(shaft) <= luma(range) && shaft[0]! <= range[0]! - 8 && shaft[0]! > shaft[1]! && shaft[1]! > shaft[2]!);
  assert.ok(luma(belfry) > luma(darkSide) + 25 && belfry[1]! > belfry[2]! + 30);
  assert.ok(luma(belfry) < 205);
  const positions = mesh('pane').geometry.getAttribute('position');
  const openings = mesh('pane').geometry.getAttribute('midlandOpening');
  assert.ok(openings && openings.count === positions.count);
  const tagged = Array.from({ length: positions.count }, (_, i) => positions.getY(i)).filter((_,i) => openings.getY(i) > 0);
  assert.ok(tagged.length > 100 && Math.min(...tagged) > 34 && Math.max(...tagged) < 44);
});

test('gable coping loses the white line and a broader stone surround carries subdued gold', () => {
  const rake = masonry('stone', 26, { rake: 1 });
  const surround = masonry('stone', 24, { detail: [0,0,1] });
  const plain = masonry('stone', 24);
  console.log('Gable rake, dormer surround, plain stone', rake, surround, plain);
  assert.ok(luma(rake) < 100 && rake[1]! > rake[2]! + 12);
  assert.ok(luma(surround) >= luma(plain) + 13 && luma(surround) < 105);
  assert.ok(surround[0]! > surround[1]! && surround[1]! > surround[2]! + 10);
});

test('localized warm uplight catches the first-floor arch heads and fades within the storey', () => {
  const sample = (height: number, weight: number) => masonry('stone', height, { detail: [0,weight,0] });
  const [head, jamb, above, beside, quieter] = [sample(9.7,1), sample(7.4,1), sample(11.2,1), sample(9.7,0), sample(9.7,.65)];
  console.log('First-floor head, jamb, above, beside, quieter head', head, jamb, above, beside, quieter);
  assert.ok(luma(head!) > luma(beside!) + 30 && luma(head!) > luma(jamb!) + 25);
  assert.ok(head![0]! > head![1]! && head![1]! > head![2]! + 18);
  assert.deepEqual(above, sample(11.2,0));
  assert.ok(luma(head!) > luma(quieter!) + 8);
});

test('arcade window glow separates from the darker brick piers without clipping or relighting rooms', () => {
  const arch = pane({ detail: [1,0] });
  const crown = pane({ detail: [1,0], y: .95 });
  const pier = masonry('brickRed', 3);
  const peak = pane({ detail: [1,0], id: 2350, y: .64 });
  console.log('Arcade arch, crown, pier, second arch', arch, crown, pier, peak);
  assert.ok(luma(arch) > luma(pier) + 42 && luma(arch) > luma(crown) + 12);
  for (const rgb of [arch,crown,peak]) assert.ok(rgb[1]! > rgb[2]! + 26 && Math.max(...rgb) < 245);
  for (const level of [.5, 1]) {
    for (const id of [1,3,19,831,1999]) {
      assert.deepEqual(pane({ id, level }), pane({ id, level, applyOpeningGrade: false }));
    }
  }
  const geometry = mesh('pane').geometry;
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const openings = geometry.getAttribute('midlandOpening');
  let arcades = 0;
  for (let i = 0; i < openings.count; i++) {
    if (openings.getX(i) > 0) {
      assert.ok(uv.getY(i) < -.5 && uv.getX(i) >= PANE_UV.numbers && positions.getY(i) < 6);
      arcades++;
    } else if (uv.getY(i) < -.5 && positions.getY(i) >= 6 && positions.getY(i) <= 34) {
      assert.equal(openings.getY(i), 0, 'upper room glazing keeps its existing lighting');
    }
  }
  assert.ok(arcades > 100);
  assert.deepEqual(pane({ detail: [1,0], level: 0 }), pane({ level: 0 }));
});

test('Midland-only night programs keep the BASE daytime materials and all remote weather receipts', () => {
  const world = addWorld(scene, { grid: false });
  const sky = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
  const camera = new THREE.PerspectiveCamera(50, 1.6, .5, 9000);
  camera.position.set(260, 220, 90);
  const target = new THREE.Vector3();
  const fingerprint = (material: THREE.Material) => {
    const { vertexShader, fragmentShader } = compile(material);
    return hash(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
  };
  const update = (hour: string, wallMs: number, state: 'clear' | 'rain' | 'fog' | 'snow') => sky.update({
    camera, target, timeMs: Date.parse('2026-11-20T'+hour+'Z'), wallMs,
    weather: state === 'clear' ? CLEAR_STATE : weatherState(forcedObservation(state)),
  });
  try {
    update('12:00:00',0,'clear');
    const day = keys.map(key => mesh(key).material);
    const base = [
      '5f265814b5dfe62378e707aac3249e16c9175cb78a59df1597150d96f9eff432',
      'fabbb5bf645c5541e2df709151a01ea1d9619c1b74d58c3d38c793d80f9eb781',
      '5fd416ae6caa324a932e1afc0f8e4662815d86778ed7bdb3daceb54f1c6c15e5',
    ];
    assert.deepEqual(day.map(fingerprint), base);
    assert.deepEqual(built.stats, { meshes: 13, triangles: 67675, materials: 14 });
    let changedAtNight = true;
    for (const [i,state] of (['clear','rain','fog','snow'] as const).entries()) {
      update('22:30:00',2000*i+1000,state);
      assert.ok(keys.every((key,k) => mesh(key).material !== day[k]));
      assert.ok(mesh('brickRed').material === night('brickRed') && mesh('stone').material === night('stone'));
      const activePane = compile(mesh('pane').material).fragmentShader;
      if (state === 'fog') assert.ok(activePane.includes('uKxNightFog'));
      else assert.equal(mesh('pane').material, night('pane'));
      changedAtNight &&= keys.every(key => /midland-(facade-detail|opening-grade)-begin/.test(compile(mesh(key).material).fragmentShader));
      update('12:00:00',2000*i+2000,'clear');
      assert.ok(keys.every((key,k) => mesh(key).material === day[k]));
      assert.deepEqual(keys.map(key => fingerprint(mesh(key).material)), base);
      for (const remote of ['pt','wv'] as const) {
        const snapshot = remoteWeatherSnapshot(remote, state, true);
        assert.equal(hash(JSON.stringify(snapshot)), receipts[(remote+'/'+state) as keyof typeof receipts]);
      }
    }
    for (const key of ['brickRed','stone'] as const) {
      assert.deepEqual(masonry(key,9.7,{ detail: [1,1,1],level: 0,rake: 1 }), masonry(key,9.7,{ level: 0,rake: 1 }));
      assert.deepEqual(masonry(key,9.7,{ detail: [1,1,1],scope: 0,rake: 1 }), masonry(key,9.7,{ scope: 0,rake: 1 }));
    }
    // The original night material can already be active in gloomy daylight.
    // At the daytime lamp ceiling the new lighting must still contribute zero.
    for (const key of ['brickRed','stone'] as const) {
      assert.deepEqual(masonry(key, 9.7, { detail: [1,1,1], level: .55 }), masonry(key, 9.7, { level: .55 }));
    }
    for (const detail of [[1,0], [0,1]]) {
      assert.deepEqual(pane({ detail, level: .55 }), pane({ detail, level: .55, applyOpeningGrade: false }));
    }
    assert.ok(changedAtNight, 'the new Midland programs were exercised in all four weather states');
  } finally { sky.dispose(); }
});
