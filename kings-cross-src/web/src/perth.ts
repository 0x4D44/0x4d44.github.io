/// <reference types="vite/client" />
// The Perth station view: the lazy Perth model and its geometry, loaded as Waverley's are (waverley.ts), into the same view shape the
// station switcher hops to. No live trains yet: the Perth train-describer area is not in the relay (see station-config.ts).
import * as THREE from 'three';
import { decodeWaverleyAnchorScene } from '../../core/waverley-anchors.ts';
import { createWaverleyPlaceholderScene, waverleyView } from './waverley.ts';
import type { WaverleyView } from './waverley.ts';

export interface PerthModelModule {
  buildPerthScene(): { group: THREE.Group; dispose(): void; groundAttribution?: string; terrain?: unknown; parts?: Record<string, THREE.Group> };
}
/** The loaded Perth scene: the same shape as Waverley's, so the switcher, the weather and the capture rig treat both alike. */
export type PerthView = WaverleyView;
export const PERTH_MESSAGE = 'Perth: OSM model · live trains not enabled (TD area not yet recorded)';

// Literal globs, as waverley.ts: Vite turns each into a lazy chunk, so neither Perth's geometry nor its data enters the London entry chunk.
const models = (() => { try { return import.meta.glob<PerthModelModule>('./perth-scene.ts'); } catch { return {}; } })();
const geometries = (() => { try { return import.meta.glob<{ default: unknown }>('./data/perth-scene.json'); } catch { return {}; } })();

/** No model/data chunk means the honest empty placeholder. Tests inject both paths. */
export async function loadPerthScene(options: {
  modelLoader?: (() => Promise<PerthModelModule>) | null;
  geometryLoader?: (() => Promise<{ default: unknown }>) | null;
} = {}): Promise<PerthView> {
  const modelLoader = options.modelLoader === undefined ? models['./perth-scene.ts'] : options.modelLoader;
  const geometryLoader = options.geometryLoader === undefined ? geometries['./data/perth-scene.json'] : options.geometryLoader;
  let model: ReturnType<PerthModelModule['buildPerthScene']> | undefined;
  try {
    if (!modelLoader) throw new Error('Perth model chunk is not installed');
    if (!geometryLoader) throw new Error('Perth platform geometry is not installed');
    const [module, data] = await Promise.all([modelLoader(), geometryLoader()]);
    const geometry = decodeWaverleyAnchorScene(data.default);
    model = module.buildPerthScene();
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x334458); scene.add(model.group);
    let disposed = false;
    const loaded: PerthView = { scene, model, geometry, groundAttribution: model.groundAttribution, placeholder: false, message: PERTH_MESSAGE,
      view: aspect => waverleyView(geometry, aspect),
      // The model owns its local geometry/materials; the shared palette it draws with stays London's.
      dispose: () => { if (disposed) return; disposed = true; loaded.climate?.dispose(); loaded.live?.dispose(); model!.dispose(); scene.clear(); } };
    return loaded;
  } catch (error) {
    model?.dispose();
    const empty = createWaverleyPlaceholderScene();
    return { ...empty, placeholder: true, error: (error as Error).message,
      message: modelLoader && geometryLoader ? `Perth: model unavailable (${(error as Error).message}). Live trains not enabled.`
        : 'Perth: model not built yet. Live trains not enabled.',
      view: () => ({ eye: [0, 2, 10], target: [0, 0, 0] }) };
  }
}
