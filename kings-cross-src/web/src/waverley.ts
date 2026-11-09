import * as THREE from 'three';
import { releaseSceneGpu } from './station-resources.ts';

export const WAVERLEY_PLACEHOLDER_LABEL = 'Edinburgh Waverley — model not yet available';

/** A deliberately empty scene while the Waverley model is not yet available. */
export function createWaverleyPlaceholderScene(): { scene: THREE.Scene; dispose: () => void } {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x334458);
  return { scene, dispose: () => releaseSceneGpu(scene) };
}
