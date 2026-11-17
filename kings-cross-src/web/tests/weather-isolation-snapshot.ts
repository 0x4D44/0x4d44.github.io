// Exact shader/uniform receipt for a synthetic remote scene through the real
// Waverley/Perth climate and shared lamp paths. No renderer, fetch or wall clock.
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { createAtmosphere, surfaceUniforms } from '../src/atmosphere.ts';
import { addWorld } from '../src/world.ts';
import { WAVERLEY_HAZE, PERTH_HAZE } from '../src/station-weather.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import { createPlatformLamps, urbanLampOptions } from '../src/station-lamps.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import { createPerthLights } from '../src/perth-lamps.ts';
import type { PerthStationPlan } from '../src/perth-station-structure.ts';

const sha = (s: string | Uint8Array) => createHash('sha256').update(s).digest('hex');
function value(v: any): any {
  if (v?.isTexture) {
    const image = v.image, data = image?.data;
    return { texture: true, width: image?.width, height: image?.height, format: v.format, type: v.type,
      data: data ? sha(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)) : null };
  }
  if (v?.toArray) return v.toArray();
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, value(v[k])]));
  return v;
}
function material(m: THREE.Material, kind: string) {
  if ((m as THREE.ShaderMaterial).isShaderMaterial) {
    const s = m as THREE.ShaderMaterial;
    return { vertex: sha(s.vertexShader), fragment: sha(s.fragmentShader), uniforms: value(s.uniforms), defines: value(s.defines) };
  }
  const lib = THREE.ShaderLib[kind]!, s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  m.onBeforeCompile(s as never, undefined as never);
  return { vertex: sha(s.vertexShader), fragment: sha(s.fragmentShader), uniforms: value(s.uniforms), defines: value(m.defines), key: m.customProgramCacheKey() };
}

export function remoteWeatherSnapshot(station: 'wv' | 'pt', weather: string, kxFirst: boolean) {
  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 20000); camera.position.set(10, 20, 50);
  const frame = { timeMs: Date.parse(weather === 'clear' ? '2026-11-20T12:00:00Z' : '2026-11-20T22:30:00Z'), wallMs: 12000, camera, target: new THREE.Vector3(), weather: weatherState(forcedObservation(weather)) };
  if (kxFirst) {
    const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
    const kx = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
    kx.update({ ...frame, weather: weatherState(forcedObservation('fog')) });
    kx.dispose();
  }
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null,
    location: station === 'wv' ? { lat: 55.9519018, lon: -3.1904199 } : { lat: 56.392, lon: -3.438 },
    haze: station === 'wv' ? WAVERLEY_HAZE : PERTH_HAZE, ...(station === 'pt' ? { lampSunGate: [0, 6] as const } : {}) });
  const lamps = createStreetLights([{ x: 0, y: 0, z: 0, height: 8, yaw: 0, slope: [0, 0], kind: LAMP_KIND.sodium }], urbanLampOptions());
  const platform = createPlatformLamps([0, 6, 0], [[[-10, -10], [10, -10], [10, 10], [-10, 10]]], .915, 'wv');
  const perth = station === 'pt' ? createPerthLights({ structure: { lamps: [0, 12, 24].map(x => ({ x, z: 0, ref: 'synthetic' })) }, canopyColumns: [], furniture: { lamps: [] } } as unknown as PerthStationPlan,
    [{ x: 0, y: 0, z: 0, height: 8, yaw: 0, slope: [0, 0], kind: LAMP_KIND.sodium }], []) : null;
  try {
    atmosphere.update(frame);
    const compiled: Record<string, unknown> = {};
    for (const [layer, root] of [['street', lamps.group], ['platform', platform.group], ...(perth ? [['perth', perth.group] as const] : [])] as const) root.traverse(o => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) compiled[layer + '/' + o.parent?.name + '/' + o.name] = material(m, (o as THREE.Points).isPoints ? 'points' : 'basic');
    });
    const ground = scene.children.find(o => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== world.sky.material) as THREE.Mesh;
    const fog = scene.fog as THREE.Fog;
    return { compiled, rain: material(atmosphere.precip.rain.material as THREE.Material, 'basic'), snow: material(atmosphere.precip.snow.material as THREE.Material, 'basic'),
      ground: material(ground.material as THREE.Material, 'lambert'), rig: atmosphere.state()!.rig,
      fog: { near: fog.near, far: fog.far, colour: fog.color.toArray() }, surface: value(surfaceUniforms),
      skyColours: sha(new Uint8Array(world.sky.geometry.getAttribute('color').array.buffer)),
      objects: scene.children.map(o => ({ name: o.name, type: o.type, visible: o.visible })) };
  } finally { atmosphere.dispose(); lamps.dispose(); platform.dispose(); perth?.dispose(); }
}
