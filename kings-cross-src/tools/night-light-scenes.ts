// Node-side assembly of the lamp-bearing parts of the committed geographic scenes.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { Pt } from '../core/geo.ts';
import type { ReceiverSample } from './light-capacity.ts';
import { buildCoverMap, coverAt } from '../web/src/cover.ts';
import type { CityData } from '../core/city.ts';
import type { KxData } from '../core/osm.ts';
import type { LightStation } from '../core/light-sources.ts';
import type { TerrainFile } from '../core/terrain.ts';
import { createTerrain } from '../core/terrain.ts';
import { buildingsUnderStation, concourseCanopy, pointInPolygon, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../core/station.ts';
import { REPLACED_BUILDING_IDS, tunnelMouths } from '../core/landmarks.ts';
import { PLATFORM_HEIGHT, railSegments } from '../core/scene.ts';
import { unpackWaverleyScene } from '../core/waverley-data.ts';
import { addCity } from '../web/src/city.ts';
import { addKxCentral, KXCENTRAL_OSM_IDS } from '../web/src/kxcentral.ts';
import { addLandmarks } from '../web/src/landmarks.ts';
import { createAtmosphere } from '../web/src/atmosphere.ts';
import { buildShed } from '../web/src/shed.ts';
import { buildConcourse } from '../web/src/concourse.ts';
import { buildFurniture } from '../web/src/furniture.ts';
import type { FurniturePlan } from '../web/src/furniture.ts';
import { nightLightSites } from '../web/src/night.ts';
import { addTerrain, addWorld } from '../web/src/world.ts';
import { portalHole } from '../web/src/portals.ts';

function readData(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../web/src/data/${name}.json`, import.meta.url), 'utf8'));
}

export interface ReceiverRegion {
  name: string;
  bounds: readonly [minX: number, minZ: number, maxX: number, maxZ: number];
  at(x: number, z: number): ReceiverSample | null;
}

function bounds(points: readonly Pt[]): ReceiverRegion['bounds'] {
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}

export async function loadNightLightScene(station: LightStation): Promise<{
  scene: THREE.Scene;
  regions: readonly ReceiverRegion[];
  dispose(): void;
}> {
  if (station === 'pt') {
    const { loadPerthScene } = await import('../web/src/perth.ts');
    const view = await loadPerthScene({ modelLoader: () => import('../web/src/perth-scene.ts'),
      geometryLoader: async () => ({ default: readData('perth-scene') }) });
    if (view.placeholder) throw new Error(view.error ?? 'Perth scene did not load');
    view.model?.night?.setLevel(1);
    return { ...view, regions: [] };
  }
  const scene = new THREE.Scene();
  if (station === 'wv') {
    const { buildWaverleyScene, WAVERLEY_LEVELS } = await import('../web/src/waverley-scene.ts');
    const { loadWaverleyLamps } = await import('../web/src/waverley-lamps.ts');
    const { addWaverleyPlatformLights } = await import('../web/src/station-weather.ts');
    const model = buildWaverleyScene({ lighting: false });
    const data = unpackWaverleyScene(readData('waverley-scene'));
    scene.add(model.group);
    const platforms = addWaverleyPlatformLights(scene, data.platforms.map(p => p.path));
    const lamps = await loadWaverleyLamps(model.terrain.heightAt.bind(model.terrain), true, scene);
    scene.add(lamps.group);
    lamps.setLevel(1);
    platforms.setLevel(1);

    const cover = buildCoverMap(scene);
    const platformBounds = bounds(data.platforms.flatMap(p => p.path));
    const onPlatform = (x: number, z: number) => data.platforms.some(p => pointInPolygon([x, z], p.path));
    const sample = (x: number, y: number, z: number): ReceiverSample => ({ pos: [x, y, z], covered: coverAt(cover, x, y, z) > .5 });
    const bridgeRings = (readData('waverley-frontage') as { bridges: { ring: Pt[] }[] }).bridges.map(b => b.ring);
    const decks = scene.getObjectByName('waverley-bridge-decks')!;
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    const heights = new Map<string, [number, number] | null>();
    function deckHeights(x: number, z: number): [number, number] | null {
      const key = `${x},${z}`;
      if (heights.has(key)) return heights.get(key)!;
      if (!bridgeRings.some(ring => pointInPolygon([x, z], ring))) return null;
      ray.ray.origin.set(x, 100, z);
      const top = ray.intersectObject(decks, false)[0]?.point.y;
      const low = onPlatform(x, z) ? WAVERLEY_LEVELS.platform : model.terrain.heightAt(x, z);
      const pair: [number, number] | null = top !== undefined && top - low >= 4 ? [low, top] : null;
      heights.set(key, pair);
      return pair;
    }
    const stacked = (index: 0 | 1, name: string): ReceiverRegion => ({
      name, bounds: bounds(bridgeRings.flat()),
      at(x, z) {
        const pair = deckHeights(x, z);
        return pair ? sample(x, pair[index], z) : null;
      },
    });
    const regions: ReceiverRegion[] = [
      { name: 'wv-platforms', bounds: platformBounds,
        at: (x, z) => onPlatform(x, z) ? sample(x, WAVERLEY_LEVELS.platform, z) : null },
      stacked(0, 'wv-bridge-lower'),
      stacked(1, 'wv-bridge-upper'),
    ];
    return { scene, regions, dispose() { lamps.dispose(); platforms.dispose(); model.dispose(); scene.clear(); } };
  }

  const data = readData('kx-track') as KxData, layout = shedLayout(data), canopy = concourseCanopy(data);
  const footprint = stationBuilding(data);
  const hidden = new Set([...buildingsUnderStation(data, layout, canopy), ...REPLACED_BUILDING_IDS, ...KXCENTRAL_OSM_IDS]);
  if (footprint) hidden.add(footprint.id);
  const world = addWorld(scene, { grid: false });
  const field = createTerrain(readData('kx-terrain') as TerrainFile);
  const terrain = addTerrain(scene, field, { exclude: portalHole(tunnelMouths(data)), rails: railSegments(data) });
  const furniture = buildFurniture(data, layout);
  scene.add(furniture, buildShed(layout));
  if (footprint) scene.add(buildConcourse(canopy, footprint.pts, layout));
  const landmarks = addLandmarks(scene, data, { terrain: terrain.ground });
  const central = addKxCentral(scene, data, { terrain: terrain.ground });
  const sites = nightLightSites({ lamps: (furniture.userData.plan as FurniturePlan).lamps, layout, data, canopy, footprint: footprint?.pts ?? [] });
  const atmosphere = createAtmosphere({ scene, world, sites, platformLampFloor: data.platforms.filter(p => !p.tunnel).map(p => p.pts),
    kingsCrossNightFog: true, cityFogTint: [.320, .266, .237], litFogCloud: true });
  const city = addCity(scene, data, readData('kx-city') as CityData, { hidden, terrain: terrain.ground, nightEffects: true, night: atmosphere.nightLights });
  atmosphere.rescan();
  atmosphere.nightLights?.setLevel(1);
  const cover = atmosphere.cover();
  const shed: ReceiverRegion = {
    name: 'kx-shed',
    bounds: bounds([shedToWorld(layout, 0, 0), shedToWorld(layout, layout.width, 0),
      shedToWorld(layout, 0, layout.length), shedToWorld(layout, layout.width, layout.length)]),
    at(x, z) {
      const { u, v } = worldToShed(layout, [x, z]);
      return u >= 0 && u <= layout.width && v >= 0 && v <= layout.length && coverAt(cover, x, PLATFORM_HEIGHT, z) > .5
        ? { pos: [x, PLATFORM_HEIGHT, z], covered: true } : null;
    },
  };
  return { scene, regions: [shed], dispose() { city.dispose(); atmosphere.dispose(); central.dispose(); landmarks.dispose(); terrain.dispose(); scene.clear(); } };
}
