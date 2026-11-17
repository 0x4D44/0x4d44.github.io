import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAtmosphere, surfaceUniforms } from '../src/atmosphere.ts';
import { addWorld } from '../src/world.ts';
import { forcedObservation, weatherState, CLEAR_STATE } from '../src/weather.ts';
import { addCity } from '../src/city.ts';
import { Glsl } from './glsl.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const city = addCity(new THREE.Scene(), read('kx-track'), read('kx-city'), { nightEffects: true, trees: false });
after(() => city.dispose());

function object<T extends THREE.Object3D>(name: string): T {
  const found = city.lights!.group.getObjectByName(name);
  assert.ok(found, name);
  return found as T;
}
function shader(material: THREE.Material, kind = 'basic') {
  const lib = THREE.ShaderLib[kind]!;
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(s as never, undefined as never);
  return s;
}
function block(code: string, name: string) {
  const found = code.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];
  assert.ok(found, name);
  return found;
}
function climate(kx: boolean) {
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null, ...{ kingsCrossNightFog: kx } });
  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 20000);
  camera.position.set(41.0492634589, 26, 58.2960127995);
  let wallMs = 0;
  return { scene, atmosphere, camera,
    at(time: string, weather = weatherState(forcedObservation('fog'))) {
      atmosphere.update({ timeMs: Date.parse(time), weather, camera, target: new THREE.Vector3(43, 12, -12), wallMs: wallMs += 1000 });
      return scene.fog as THREE.Fog;
    },
    dispose() { atmosphere.dispose(); },
  };
}
const night = '2026-11-20T22:30:00Z', noon = '2026-11-20T12:00:00Z';

test('KX night fog attenuates the 100m facade and erases the 300m skyline while retaining nearby contrast', () => {
  const k = climate(true);
  try {
    const fog = k.at(night);
    const amount = (depth: number) => THREE.MathUtils.smoothstep(depth, fog.near, fog.far);
    assert.ok(amount(100) >= .35, 'the old 83m near plane left the facade almost crisp');
    assert.ok(amount(50) <= .2, 'near surfaces retain contrast');
    assert.equal(amount(300), 1, '300m visibility must not leave a clear distant skyline');
  } finally { k.dispose(); }
});

test('only opt-in KX dense night fog gains warm city colour; day and clear weather stay exact', () => {
  const k = climate(true), plain = climate(false);
  try {
    const fog = k.at(night), rgb = fog.color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    assert.ok(rgb.r >= rgb.b * 1.5, 'lit fog must overcome the blue night horizon');
    for (const [time, weather] of [[noon, weatherState(forcedObservation('fog'))], [night, CLEAR_STATE], [noon, CLEAR_STATE]] as const) {
      const a = k.at(time, weather), b = plain.at(time, weather);
      assert.deepEqual([a.near, a.far, ...a.color.toArray()], [b.near, b.far, ...b.color.toArray()]);
      assert.deepEqual(k.atmosphere.state()!.rig.dome, plain.atmosphere.state()!.rig.dome);
    }
  } finally { k.dispose(); plain.dispose(); }
});

test('KX widens only the extra mast air lobe and warms it without amplifying its clipped centre', () => {
  const h = object<THREE.Points>('street-lamp-halos'), flags = h.geometry.getAttribute('lampFogHaze');
  const scale = h.geometry.getAttribute('lampHaloScale');
  const i = Array.from(flags.array).findIndex(x => x > .5);
  assert.ok(scale.getX(i) >= 3.2, 'the old haze diameter fell below the 60-120px shoulder');
  const body = block(shader(h.material as THREE.Material, 'points').fragmentShader, 'lamp-kx-haze');
  const sample = (radius: number) => {
    const e = { vars: { hazeRadius: radius, mastScatterAlpha: .198, vLampFogHaze: 1, gl_FragColor: [1, 1, 1, 0] } };
    new Glsl('').run(body, e);
    return e.vars.gl_FragColor;
  };
  const centre = sample(0), shoulder = sample(.5), edge = sample(1);
  assert.ok(centre[3]! <= .20, 'broader haze lowers rather than raises the central peak');
  assert.ok(shoulder[3]! > 0 && shoulder[3]! < centre[3]!);
  assert.equal(edge[3], 0);
  assert.ok(shoulder[0]! >= shoulder[2]! * 1.5);
});

function roughSample(x: number, y: number) {
  const mesh = object<THREE.InstancedMesh>('kx-front-glazing-reflections');
  const body = block(shader(mesh.material as THREE.Material).fragmentShader, 'reflection-kx-roughness');
  const e = { vars: { vReflectionUv: [x, y], vReflectionAnchor: [12, 0, 25], gl_FragColor: [1, 1, 1, 1] } };
  new Glsl('').run(body, e);
  return e.vars.gl_FragColor[3]!;
}

test('KX arch reflections have tapered soft sides rather than parallel post edges', () => {
  assert.ok(roughSample(.5, .8) < roughSample(.5, 0) * .7, 'streak wings narrow towards the tips');
  assert.ok(roughSample(.7, 0) > 0, 'soft wings do not cut off at the central kernel');
  assert.ok(roughSample(.95, 0) < roughSample(.5, 0));
  const s = shader(object<THREE.InstancedMesh>('kx-front-glazing-reflections').material as THREE.Material);
  const combined = (x: number) => {
    const e = { vars: { vReflectionUv: [x, 0], vReflectionAnchor: [12, 0, 25], uLampWet: 1, reflectionOpen: 1, gl_FragColor: [1, 1, 1, 1] } };
    new Glsl('').run(block(s.fragmentShader, 'reflection-alpha') + block(s.fragmentShader, 'reflection-breakup'), e);
    return e.vars.gl_FragColor[3]!;
  };
  assert.ok(combined(.5) > combined(0) * .4, 'the combined soft lobes must not collapse back into thin lines');
});

test('KX reflection segments have deep irregular breaks rather than a shallow repeating bar pattern', () => {
  const samples = Array.from({ length: 161 }, (_, i) => roughSample(0, -.8 + i / 100));
  assert.ok(Math.min(...samples) < Math.max(...samples) * .15, 'visible gaps separate bright wet segments');
  const left = Array.from({ length: 40 }, (_, i) => roughSample(0, -.8 + i / 50));
  const right = Array.from({ length: 40 }, (_, i) => roughSample(0, i / 50));
  assert.ok(left.some((v, i) => Math.abs(v - right[i]!) > .2), 'two halves must not repeat the same bars');
});

test('KX amber facade gets its own surface-clipped reflections, gated off by day, dry weather and snow', () => {
  const mesh = object<THREE.InstancedMesh>('kx-front-amber-reflections');
  assert.ok(mesh.count >= 3 && mesh.count <= 8);
  const colour = new THREE.Color();
  mesh.getColorAt(0, colour);
  assert.ok(colour.r > colour.b * 2 && colour.r > colour.g);
  const s = shader(mesh.material as THREE.Material);
  assert.ok(s.uniforms.uLampSurface);
  block(s.fragmentShader, 'reflection-receiver-clip');
  block(s.fragmentShader, 'reflection-snow');
  const wet = surfaceUniforms.wet.value, snow = surfaceUniforms.snowCover.value;
  try {
    surfaceUniforms.wet.value = 1; surfaceUniforms.snowCover.value = 0;
    city.lights!.setLevel(1); assert.equal(mesh.visible, true);
    city.lights!.setLevel(0); assert.equal(mesh.visible, false);
    surfaceUniforms.wet.value = 0; city.lights!.setLevel(1); assert.equal(mesh.visible, false);
    surfaceUniforms.wet.value = 1; surfaceUniforms.snowCover.value = .8;
    city.lights!.setLevel(1); assert.equal(mesh.visible, false);
  } finally { surfaceUniforms.wet.value = wet; surfaceUniforms.snowCover.value = snow; }
});

test('KX street pools have a wider golden core at the same bounded peak and receiver footprint', () => {
  const p = object<THREE.InstancedMesh>('street-lamp-pools');
  const body = block(shader(p.material as THREE.Material).fragmentShader, 'pool-profile');
  const e = { vars: { vPoolUv: [.75, .5], vPoolLine: 0, gl_FragColor: [1, 1, 1, 1] } };
  new Glsl('').run(body, e);
  assert.ok(e.vars.gl_FragColor[3]! >= .73, 'the old pool core lost half its light too close to the head');
  const lineAt = (u: number) => {
    const sample = { vars: { vPoolUv: [u, .5], vPoolLine: 1, gl_FragColor: [1, 1, 1, 1] } };
    new Glsl('').run(body, sample);
    return sample.vars.gl_FragColor[3]!;
  };
  assert.ok(lineAt(.75) >= .74, 'the mast line keeps a broad lit shoulder');
  assert.equal(lineAt(1), 0, 'its perimeter still fades to zero');
  assert.equal((p.material as THREE.Material).blending, THREE.NormalBlending);
  const colour = new THREE.Color();
  for (let i = 0; i < p.count; i++) { p.getColorAt(i, colour); assert.ok(Math.max(colour.r, colour.g, colour.b) <= .200001); }
});
