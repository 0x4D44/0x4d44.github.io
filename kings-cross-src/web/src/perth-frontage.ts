// P2 frontage: the station's west front and entrance, its forecourt, the Station Hotel and the road overbridges at the platform ends
// (gfx-rubrics/perth-frontage.md). Phase 1 drew none of these (the OSM blocks round the station stand in the city, perth-city.ts), so this
// element starts empty: perth-scene.ts calls addPerthFrontage once, after the station and before the city, with the scene's build context.
// Horizontal geometry is OSM (ODbL, core/perth-data.ts); every dimension needs a cited source or an ASSUMED label.
import type * as THREE from 'three';
import type {WaverleyScene as PerthData} from '../../core/waverley-data.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {PerthBuild} from './perth-scene.ts';

/** The frontage element's entry point. Phase 1: draws nothing, so the scene's parts and output are unchanged. */
export function addPerthFrontage(_build: PerthBuild, _data: PerthData, _ground: Terrain, _parent: THREE.Group): void {}
