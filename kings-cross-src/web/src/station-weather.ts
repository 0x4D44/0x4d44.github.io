// One climate per geographic scene. Rendering activates only that scene's shared
// wet/snow/train uniforms and roof mask; inactive weather feeds never paint it.
import * as THREE from 'three';
import type { LatLon } from '../../core/geo.ts';
import type { Extent } from '../../core/terrain.ts';
import { describeSun } from '../../core/daylight.ts';
import { createAtmosphere } from './atmosphere.ts';
import type { Atmosphere, AtmosphereFrame, AtmosphereOptions } from './atmosphere.ts';
import { applyCover, coverUniforms } from './cover.ts';
import { CLEAR_STATE, createWeatherFeed, weatherState } from './weather.ts';
import type { WeatherFeedOptions, WeatherObservation, WeatherState } from './weather.ts';
import { addWorld } from './world.ts';
import type { WaverleyView } from './waverley.ts';

/** The existing URL pin and replay/live policy, shared by both scenes. */
export function sceneWeatherOptions(forced: string | null, replayDate: string | null, location?: LatLon): WeatherFeedOptions {
  return { ...(forced === 'off' || forced === '0' ? { mode: 'off' as const }
    : forced !== null ? { mode: 'forced' as const, forced }
      : replayDate !== null ? { mode: 'replay' as const, date: replayDate } : { mode: 'live' as const }), ...(location ? { location } : {}) };
}

let active: Atmosphere | null = null;
/** Shared shaders must read the displayed scene, including after a late inactive-scene rescan. */
export function activateSceneAtmosphere(atmosphere: Atmosphere): boolean {
  const map = atmosphere.cover();
  const heights = (coverUniforms.uCoverMap.value as THREE.DataTexture).image?.data;
  const changed = active !== atmosphere || (map ? heights !== map.heights : coverUniforms.uCoverRect.value.z !== 0);
  if (changed) { applyCover(map); active = atmosphere; }
  return changed;
}

export function createSceneWeather(options: AtmosphereOptions & { weather: WeatherFeedOptions }) {
  const atmosphere = createAtmosphere(options), feed = createWeatherFeed(options.weather);
  let observation: WeatherObservation | null | undefined, weather: WeatherState = CLEAR_STATE, disposed = false;
  return {
    atmosphere, feed,
    update(frame: Omit<AtmosphereFrame, 'weather'>): void {
      if (disposed) return;
      const changed = activateSceneAtmosphere(atmosphere), next = feed.observation(frame.timeMs);
      if (next !== observation || changed) { observation = next; weather = { ...weatherState(next) }; }
      options.world.follow(frame.camera);
      atmosphere.update({ ...frame, weather });
    },
    status(timeMs: number, timeNote = ''): string {
      const sky = atmosphere.state();
      return sky ? ` · ${describeSun(sky.sun.elevationDeg)}${timeNote} · ${feed.status(timeMs)}` : '';
    },
    dispose(): void {
      if (disposed) return; disposed = true;
      feed.dispose(); atmosphere.dispose();
      if (active === atmosphere) active = null;
    },
  };
}
export type SceneWeather = ReturnType<typeof createSceneWeather>;

/** Attach the same world/atmosphere builder to the lazy Scottish scene, with its own origin. */
export function createWaverleyWeather(view: WaverleyView, weather: WeatherFeedOptions): SceneWeather {
  if (view.placeholder || !view.geometry) throw new Error('Waverley weather requires a built geographic scene');
  const scene = view.scene, original = new Set(scene.children), lights = new Map<THREE.Light, boolean>();
  scene.traverse(o => { if (o instanceof THREE.Light) { lights.set(o, o.visible); o.visible = false; } });
  const background = scene.background, fog = scene.fog;
  const world = addWorld(scene, { grid: false });
  // The existing Scottish mesh owns the terrain; the world draws only outside it.
  const terrain = view.model?.terrain as { extent?: Extent } | undefined;
  const points = view.geometry.platforms.flatMap(p => p.path);
  // ASSUMED fallback context margin (100 m) only for model adapters without terrain metadata.
  const extent = terrain?.extent ?? { x0: Math.min(...points.map(p => p[0])) - 100, x1: Math.max(...points.map(p => p[0])) + 100,
    z0: Math.min(...points.map(p => p[1])) - 100, z1: Math.max(...points.map(p => p[1])) + 100 };
  world.carve(extent);
  const climate = createSceneWeather({ scene, world, sites: null, location: view.geometry.origin, weather: { ...weather, location: view.geometry.origin } });
  const owned = scene.children.filter(o => !original.has(o));
  let disposed = false;
  return { ...climate, dispose(): void {
    if (disposed) return; disposed = true;
    climate.dispose();
    // Atmosphere owns its precip/sprites; world owns its dome and ground. Do not
    // sweep model/shared materials or the global shader-uniform textures.
    for (const object of owned) {
      if (object === world.sky || object.name === 'ground-outside-terrain') {
        const mesh = object as THREE.Mesh; mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
      }
      object.removeFromParent();
    }
    for (const [light, visible] of lights) light.visible = visible;
    scene.background = background; scene.fog = fog;
  } };
}
