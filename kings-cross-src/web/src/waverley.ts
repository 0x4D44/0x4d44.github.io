/// <reference types="vite/client" />
import * as THREE from 'three';
import { releaseSceneGpu } from './station-resources.ts';
import type { StationView } from './station-transition.ts';
import type { WaverleyAnchorScene } from '../../core/waverley-anchors.ts';
import { decodeWaverleyAnchorScene } from '../../core/waverley-anchors.ts';

export const WAVERLEY_PLACEHOLDER_LABEL = 'Edinburgh Waverley — model not yet available';

/** A deliberately empty scene while the Waverley model is not yet available. */
export function createWaverleyPlaceholderScene(): { scene: THREE.Scene; dispose: () => void } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x334458);
  return { scene, dispose: () => releaseSceneGpu(scene) };
}

export interface WaverleyModelModule {
  buildWaverleyScene(): { group: THREE.Group; dispose(): void; terrain?: unknown; parts?: Record<string, THREE.Group> };
}
export interface WaverleyView {
  scene: THREE.Scene;
  placeholder: boolean;
  message: string;
  error?: string;
  geometry?: WaverleyAnchorScene;
  model?: ReturnType<WaverleyModelModule['buildWaverleyScene']>;
  live?: { group: THREE.Group; frame(dt: number, selected: boolean, utcMs?: number): void; dispose(): void; status(): string; timeMs(): number; load(): Promise<void>; state(): unknown };
  view(aspect: number): StationView;
  dispose(): void;
}

// Literal optional globs make the eventual B merge discoverable at build time without
// shipping a missing import or pulling Edinburgh geometry into the London entry chunk.
// Vite replaces the literal calls, not `typeof import.meta.glob`. A runtime typeof
// guard would incorrectly suppress installed chunks in the production build.
const models = (() => { try { return import.meta.glob<WaverleyModelModule>('./waverley-scene.ts'); } catch { return {}; } })();
const geometries = (() => { try { return import.meta.glob<{ default: unknown }>('./data/waverley-scene.json'); } catch { return {}; } })();

/** Fit the actual platform extent, keeping it clear of the shared phone navigation. */
export function waverleyView(geometry: WaverleyAnchorScene, aspect: number): StationView {
  const points = geometry.platforms.flatMap(p => p.path);
  if (!points.length || points.some(p => p.some(v => !Number.isFinite(v))) || !Number.isFinite(aspect) || aspect <= 0) throw new Error('finite Waverley platforms and viewport required');
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const target: [number, number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, 5, (Math.min(...zs) + Math.max(...zs)) / 2];
  // ASSUMED oblique, 35 m context padding and 35 m roof envelope for framing only;
  // none is a measured station dimension. Fit projections rather than a bounding
  // sphere, which wastes most of a wide frame on this long, narrow station.
  const direction = new THREE.Vector3(.25, .9, 1).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize(), up = direction.clone().cross(right);
  const tan = Math.tan(25 * Math.PI / 180);
  let distance = 60;
  for (const p of points) for (const dx of [-35, 35]) for (const dz of [-35, 35]) for (const y of [0, 35]) {
    const offset = new THREE.Vector3(p[0] + dx - target[0], y - target[1], p[1] + dz - target[2]);
    distance = Math.max(distance, offset.dot(direction) + Math.max(Math.abs(offset.dot(right)) / (tan * aspect * .8), Math.abs(offset.dot(up)) / (tan * .68)));
  }
  return { target, eye: [target[0] + direction.x * distance, target[1] + direction.y * distance, target[2] + direction.z * distance] };
}

/** No model/data chunk means the honest empty placeholder. Tests inject both paths. */
export async function loadWaverleyScene(options: {
  modelLoader?: (() => Promise<WaverleyModelModule>) | null;
  geometryLoader?: (() => Promise<{ default: unknown }>) | null;
} = {}): Promise<WaverleyView> {
  const modelLoader = options.modelLoader === undefined ? models['./waverley-scene.ts'] : options.modelLoader;
  const geometryLoader = options.geometryLoader === undefined ? geometries['./data/waverley-scene.json'] : options.geometryLoader;
  let model: ReturnType<WaverleyModelModule['buildWaverleyScene']> | undefined;
  try {
    if (!modelLoader) throw new Error('Waverley model chunk is not installed');
    if (!geometryLoader) throw new Error('Waverley platform geometry is not installed');
    const [module, data] = await Promise.all([modelLoader(), geometryLoader()]);
    const geometry = decodeWaverleyAnchorScene(data.default);
    model = module.buildWaverleyScene();
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x334458); scene.add(model.group);
    let disposed = false;
    const loaded: WaverleyView = { scene, model, geometry, placeholder: false,
      message: 'Edinburgh Waverley: OSM model · EB live trains unavailable until private anchors load',
      view: aspect => waverleyView(geometry, aspect),
      // The model owns its local geometry/materials. A broad scene disposer would
      // also release the London palette shared by its track/platform meshes.
      dispose: () => { if (disposed) return; disposed = true; loaded.live?.dispose(); model!.dispose(); scene.clear(); } };
    return loaded;
  } catch (error) {
    model?.dispose();
    const empty = createWaverleyPlaceholderScene();
    return { ...empty, placeholder: true, error: (error as Error).message,
      message: modelLoader && geometryLoader ? `Edinburgh Waverley: model unavailable (${(error as Error).message}). Live trains not enabled.`
        : 'Edinburgh Waverley: model not built yet. Live trains not enabled.',
      view: () => ({ eye: [0, 2, 10], target: [0, 0, 0] }) };
  }
}
