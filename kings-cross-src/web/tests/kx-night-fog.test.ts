import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createAtmosphere } from '../src/atmosphere.ts';
import { addWorld } from '../src/world.ts';
import { forcedObservation, weatherState, CLEAR_STATE } from '../src/weather.ts';
import { glassVaries } from '../src/materials.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { createPlatformLamps, urbanLampOptions } from '../src/station-lamps.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import { Glsl } from './glsl.ts';

const night = Date.parse('2026-11-20T22:30:00Z'), noon = Date.parse('2026-11-20T12:00:00Z');
function climate(kx = true) {
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ fog: false }));
  sign.name = 'platform-5'; scene.add(sign);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(1), new THREE.MeshLambertMaterial());
  dial.userData.clockDials = [{ centre: [0, 0, 0] }]; scene.add(dial);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glassVaries(new THREE.MeshLambertMaterial(), 'quad'));
  const originalPaneMaterial = pane.material;
  scene.add(pane);
  const atmosphere = createAtmosphere({ scene, world, sites: { platform: [], shed: [], concourse: [] }, kingsCrossNightFog: kx });
  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 20000);
  const at = (y = 26, timeMs = night, weather = weatherState(forcedObservation('fog'))) => {
    camera.position.set(260, y, 90);
    atmosphere.update({ timeMs, weather, camera, target: new THREE.Vector3(46, 5, -132), wallMs: timeMs });
    return scene.fog as THREE.Fog;
  };
  return { scene, atmosphere, sign, pane, originalPaneMaterial, at };
}
function shader(material: THREE.Material, type = 'lambert') {
  const lib = THREE.ShaderLib[type]!;
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(s as never, undefined as never);
  return s;
}

test('KX elevated overview retains roof/street depth before the skyline reaches full fog', () => {
  const k = climate();
  try {
    const fog = k.at(220), amount = (d: number) => THREE.MathUtils.smoothstep(d, fog.near, fog.far);
    // Frozen overview: front windows are 323m deep; nearest roof/street 250-400m.
    assert.ok(amount(323) > .25 && amount(323) < .65, `frontage fog ${amount(323)}`);
    assert.ok(amount(400) < .85, 'near station roofs must not become a flat fog-colour wash');
    assert.equal(amount(800), 1, 'distant skyline still dissolves');
  } finally { k.atmosphere.dispose(); }
});

test('KX clock glow and platform-number overlays take dense night fog, retaining their original daytime path', () => {
  const k = climate(), plain = climate(false);
  try {
    k.at(); plain.at();
    const glow = k.scene.getObjectByName('clock-dial-glow') as THREE.Mesh;
    assert.ok(glow);
    assert.equal(k.sign.material.fog, true, 'number signs must not float crisp in fog');
    assert.equal((glow.material as THREE.Material & {fog: boolean}).fog, true, 'clock glow must not bypass fog');
    const s = shader(glow.material as THREE.Material, 'basic');
    assert.ok(s.fragmentShader.includes('gl_FragColor.a *= 1.0 - fogFactor'), 'additive clock fog must fade rather than add a fog-coloured disc');
    assert.equal(plain.sign.material.fog, false, 'remote scenes retain their original material');
    for (const [time, weather] of [[noon, CLEAR_STATE], [night, CLEAR_STATE]] as const) {
      k.at(26, time, weather);
      assert.equal(k.sign.material.fog, false);
      assert.equal((glow.material as THREE.Material & {fog: boolean}).fog, false);
    }
  } finally { k.atmosphere.dispose(); plain.atmosphere.dispose(); }
});

test('KX window emission survives as attenuated light beyond the surface fog range without changing shared materials', () => {
  const k = climate(), plain = climate(false);
  try {
    k.at(220); plain.at(220);
    assert.notEqual(k.pane.material, k.originalPaneMaterial);
    const s = shader(k.pane.material);
    assert.ok(s.fragmentShader.includes('// kx-window-fog-begin'), 'window pixels need their own source attenuation');
    assert.ok(!shader(plain.pane.material).fragmentShader.includes('kx-window-fog'), 'plain shaders must stay unchanged');
    const body = s.fragmentShader.split('// kx-window-fog-begin')[1]!.split('// kx-window-fog-end')[0]!;
    const sample = (depth: number, emission: number, active = 1) => {
      const e = { vars: { fogFactor: THREE.MathUtils.smoothstep(depth, 67, 672), fogNear: 67, fogFar: 672,
        vFogDepth: depth, uKxNightFog: active, totalEmissiveRadiance: [emission, emission, emission], outgoingLight: [1, 1, 1],
        gl_FragColor: [1, 1, 1, 1], fogColor: [0, 0, 0] } };
      new Glsl('').run(body, e); return e.vars.gl_FragColor[0]!;
    };
    assert.ok(sample(700, 1) > .10, 'light must fade through the air rather than vanish at the surface far plane');
    assert.ok(sample(1200, 1) < sample(700, 1) * .5, 'distant windows continue to fade');
    assert.equal(sample(700, 0), 0, 'unlit wall still takes full surface fog');
    assert.equal(sample(700, 1, 0), 0, 'inactive KX fog retains the original shader result');
    k.at(220, noon, CLEAR_STATE);
    assert.equal(k.pane.material, k.originalPaneMaterial, 'daylight renders the original material and program');
    assert.equal(s.uniforms.uKxNightFog!.value, 0, 'daylight takes no KX source attenuation');
  } finally { k.atmosphere.dispose(); plain.atmosphere.dispose(); }
});

test('KX dense fog is warm grey with a small red/green split rather than sepia', () => {
  const k = climate();
  try {
    const rgb = k.at().color.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    assert.ok(rgb.r - rgb.g <= .025, `red/green split ${rgb.r-rgb.g}`);
    assert.ok(rgb.b >= .165 && rgb.r >= rgb.b * 1.5, 'retain warm city air without brown saturation');
  } finally { k.atmosphere.dispose(); }
});

test('KX mast haze has stronger broad shoulders and a bounded monotonic centre', () => {
  const layer = createStreetLights([{ x: 0, y: 0, z: 0, height: 10, yaw: 0, kind: LAMP_KIND.cool, mast: true, slope: [0, 0] }], { ...urbanLampOptions(), kxOptics: true });
  try {
    const mesh = layer.group.getObjectByName('street-lamp-halos') as THREE.Points;
    const s = shader(mesh.material as THREE.Material, 'points');
    const body = s.fragmentShader.split('// lamp-kx-haze-begin')[1]!.split('// lamp-kx-haze-end')[0]!;
    const at = (radius: number) => {
      const e = { vars: { hazeRadius: radius, mastScatterAlpha: .198, vLampFogHaze: 1, gl_FragColor: [1, 1, 1, 0] } };
      new Glsl('').run(body, e); return e.vars.gl_FragColor;
    };
    // 729px diameter from the real frozen south-front projection: r=.165/.329 is 60/120px.
    assert.ok(at(.165)[3]! >= .175, '60px shoulder must exceed the old narrow/weak profile');
    assert.ok(at(.329)[3]! >= .125, '120px shoulder must remain visible');
    assert.ok(at(0)[3]! <= .20, 'avoid raising the clipped centre');
    for (let i = 1; i <= 100; i++) assert.ok(at(i / 100)[3]! <= at((i - 1) / 100)[3]!);
  } finally { layer.dispose(); }
});

test('KX source fog and Waverley platform halos cannot share a compiled shader cache entry', () => {
  const k = createPlatformLamps([0, 6, 0], [], 0, 'kx'), w = createPlatformLamps([0, 6, 0], [], 0, 'wv');
  try {
    const material = (layer: typeof k) => (layer.group.getObjectByName('street-lamp-halos') as THREE.Points).material as THREE.Material;
    assert.notEqual(material(k).customProgramCacheKey(), material(w).customProgramCacheKey(), 'different source fog must compile into different programs');
    assert.ok(shader(material(k), 'points').fragmentShader.includes('exp(-1.8*max(0.0,vFogDepth-fogNear)'));
    assert.ok(!shader(material(w), 'points').fragmentShader.includes('exp(-1.8*max(0.0,vFogDepth-fogNear)'));
  } finally { k.dispose(); w.dispose(); }
});
