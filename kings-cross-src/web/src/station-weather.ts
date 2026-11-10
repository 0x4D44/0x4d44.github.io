// One climate per geographic scene. Rendering activates only that scene's shared
// wet/snow/train uniforms and roof mask; inactive weather feeds never paint it.
import * as THREE from 'three';
import type { LatLon } from '../../core/geo.ts';
import type { Extent } from '../../core/terrain.ts';
import { describeSun } from '../../core/daylight.ts';
import { createAtmosphere } from './atmosphere.ts';
import type { Atmosphere, AtmosphereFrame, AtmosphereOptions } from './atmosphere.ts';
import { applyCover, coverUniforms } from './cover.ts';
import { floodLit, litWalls } from './materials.ts';
import type { NightLayer } from './night.ts';
import type { StreetLights } from './streetlights.ts';
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

/** The Waverley model's own fixed lights (waverley-scene.ts adds them unless its caller lights the scene): what shows under ?sky=ref,
 * ?bare=1 or the Node tests. createWaverleyWeather hides them while the daylight rig lights the scene, and shows them again on dispose. */
export function addWaverleyLights(group: THREE.Group): void {
  const hemisphere = new THREE.HemisphereLight(0xd8e6f5, 0x7a7566, 2.1), sun = new THREE.DirectionalLight(0xfff0d9, 2.4);
  sun.position.set(-300, 600, 250); group.add(hemisphere, sun);
}

/**
 * Round seven (night lighting): what the Scottish scene lights after dark, done here, by mesh name, and not in waverley-city.ts and waverley-frontage.ts, which own the meshes. The city blocks' windows
 * (materials.ts `litWalls`: the walls' UVs are metres and their vertex colour a number to each building), the Balmoral's body and tower floodlit from their feet and its clock dials glowing
 * (lighting.ts `FLOOD`; night-f-waverley-balmoral-2023-crowsus.jpg: the hotel's gables and cornice are lit orange, its clock face white, about a third of its windows warm). By day nothing
 * changes. The function returned puts every material back as it was.
 */
export function lightWaverleyNight(scene: THREE.Object3D): () => void {
  const undo: (() => void)[] = [];
  const material = (name: string): THREE.MeshLambertMaterial | null => {
    const mesh = scene.getObjectByName(name) as THREE.Mesh | undefined;
    return mesh?.isMesh && (mesh.material as THREE.MeshLambertMaterial).isMeshLambertMaterial ? mesh.material as THREE.MeshLambertMaterial : null;
  };
  const flood = (name: string, ...numbers: [number, number, number, number?]): void => {
    const m = material(name);
    if (!m) return;
    const before = m.defines;
    floodLit(m, ...numbers);
    m.needsUpdate = true;
    undo.push(() => { m.defines = before; m.needsUpdate = true; });
  };
  const walls = material('waverley-building-walls');
  if (walls) undo.push(litWalls(walls, [1.2, 0.6])); // the sandstone's tile (materials.ts TEXTURES.stone)
  // the hotel's stone, the body and the tower (waverley-frontage.ts names), each lit from the lowest point of its mesh (ASSUMED: the lamps stand where the ground is under it)
  for (const name of ['waverley-balmoral-facade', 'waverley-balmoral-tower']) {
    const mesh = scene.getObjectByName(name);
    if (mesh) flood(name, 0.25, 30, 0.25, new THREE.Box3().setFromObject(mesh).min.y);
  }
  flood('waverley-balmoral-clock-dials', 1.5, 1, 1); // a dial is lit all over: no fall-off
  return () => undo.forEach((u) => u());
}

/**
 * The haze of the Scottish scene's clear air (round seven, lighting; the W3 city element's C6, "distance haze consistent with the references"): the far plane of its fog, metres, nearer than London's
 * 2.6 km (core/daylight.ts `CLEAR_FOG`), so the Castle (1.2 km from Calton Hill: about half fogged here, two fifths at 2.6 km) and the Old Town's skyline recede toward the sky's colour. London's
 * haze is round five's (E1), tuned and pinned, and is not touched: this is an option of the Scottish scene's own atmosphere (atmosphere.ts `haze`). It is the lowest layer of the air: a camera above
 * 300 m (the landing view's 400 m) has the page's own fog, as it had, and the views from the ground and from Calton Hill have the haze. ASSUMED, all three numbers, judged by eye against R-wv3-c's
 * photographs of Calton Hill over Waverley (wv3-c-from-nelson-monument-over-waverley-2009.jpg: the Castle at 1.3 km keeps its stone and its shaded faces, a little veiled): at 1800 m the Castle went
 * to a pale blue ghost, at 2200 m it is veiled and still stone, and at the page's 2600 m it stood out almost as sharply as the near roofs.
 */
export const WAVERLEY_HAZE = { far: 2200, fade: [100, 300] } as const;

/**
 * The Scottish scene's street lamps (waverley-lamps.ts, a lazy chunk of its own: London's page never loads it). They arrive a moment after the scene, are lit with the sky's lamp level (`setLevel`,
 * the level the windows and the platform lamps come on with) and go with the climate. A scene with no ground to stand them on, or a chunk that does not load, has none.
 */
function waverleyLamps(view: WaverleyView): NightLayer & { dispose(): void } {
  const terrain = view.model?.terrain as { heightAt?: (x: number, z: number) => number } | undefined;
  let layer: StreetLights | null = null;
  let level = 0;
  let gone = false;
  if (typeof terrain?.heightAt === 'function') {
    const heightAt = terrain.heightAt.bind(terrain);
    import('./waverley-lamps.ts').then((m) => m.loadWaverleyLamps(heightAt)).then((made) => {
      if (gone) { made.dispose(); return; }
      layer = made;
      view.scene.add(made.group);
      made.setLevel(level);
    }).catch((error: unknown) => console.warn('Waverley street lamps unavailable:', error));
  }
  return {
    setLevel(next) { level = next; layer?.setLevel(next); },
    dispose() {
      gone = true;
      layer?.group.removeFromParent();
      layer?.dispose();
      layer = null;
    },
  };
}

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
  const climate = createSceneWeather({ scene, world, sites: null, location: view.geometry.origin, haze: WAVERLEY_HAZE, weather: { ...weather, location: view.geometry.origin } });
  const owned = scene.children.filter(o => !original.has(o));
  const night = lightWaverleyNight(scene);
  const lamps = waverleyLamps(view);
  let disposed = false;
  return { ...climate,
    update(frame: Parameters<SceneWeather['update']>[0]): void {
      climate.update(frame);
      lamps.setLevel(climate.atmosphere.state()?.rig.lampLevel ?? 0);
    },
    dispose(): void {
      if (disposed) return; disposed = true;
      night();
      lamps.dispose();
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
